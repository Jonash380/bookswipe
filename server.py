#!/usr/bin/env python3
"""
BookSwipe Server
================
Secure proxy server for TMDB, Trakt, and Google Books APIs.
Set environment variables before running:
  TMDB_API_KEY=your_key TRAKT_API_KEY=optional python3 server.py
"""
import http.server
import os
import sys
import signal
import json
import urllib.request
import urllib.error
import urllib.parse
import time
import threading
import re
import logging
from collections import defaultdict
from http.server import HTTPServer
from socketserver import ThreadingMixIn

PORT = int(os.environ.get('BOOKSWIPE_PORT', 3000))
BIND = os.environ.get('BOOKSWIPE_BIND', '127.0.0.1')
DIR = os.path.join(os.path.dirname(os.path.abspath(__file__)))

TMDB_BASE = 'https://api.themoviedb.org/3'
TRAKT_BASE = 'https://api.trakt.tv'
GB_BASE = 'https://www.googleapis.com/books/v1'
IGDB_BASE = 'https://api.igdb.com/v4'
IGDB_AUTH = 'https://id.twitch.tv/oauth2/token'

TMDB_KEY = os.environ.get('TMDB_API_KEY', '')
TRAKT_KEY = os.environ.get('TRAKT_API_KEY', '')
TWITCH_CLIENT_ID = os.environ.get('TWITCH_CLIENT_ID', '')
TWITCH_CLIENT_SECRET = os.environ.get('TWITCH_CLIENT_SECRET', '')

_igdb_token = None
_igdb_token_expires = 0

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('bookswipe')

_cache = {}
_cache_lock = threading.Lock()
CACHE_MAX = 2000

_rate_limits = defaultdict(list)
_rate_lock = threading.Lock()
RATE_WINDOW = 60
RATE_MAX = 30

def _check_rate(ip):
    now = time.time()
    with _rate_lock:
        _rate_limits[ip] = [t for t in _rate_limits[ip] if now - t < RATE_WINDOW]
        if len(_rate_limits[ip]) >= RATE_MAX:
            return False
        _rate_limits[ip].append(now)
        return True

def cache_get(key, ttl):
    with _cache_lock:
        e = _cache.get(key)
        if e and time.time() - e['t'] < ttl:
            _cache.pop(key, None)
            _cache[key] = e
            return e['d']
        if e: del _cache[key]
    return None

def cache_set(key, data):
    with _cache_lock:
        if len(_cache) >= CACHE_MAX:
            for k in list(_cache.keys())[:CACHE_MAX // 5]:
                del _cache[k]
        _cache[key] = {'d': data, 't': time.time()}

def _get_igdb_token():
    global _igdb_token, _igdb_token_expires
    if _igdb_token and time.time() < _igdb_token_expires - 60:
        return _igdb_token
    if not TWITCH_CLIENT_ID or not TWITCH_CLIENT_SECRET:
        return None
    data = urllib.parse.urlencode({
        'client_id': TWITCH_CLIENT_ID,
        'client_secret': TWITCH_CLIENT_SECRET,
        'grant_type': 'client_credentials'
    }).encode()
    try:
        req = urllib.request.Request(IGDB_AUTH, data=data, method='POST')
        with urllib.request.urlopen(req, timeout=10) as r:
            resp = json.loads(r.read())
            _igdb_token = resp.get('access_token', '')
            _igdb_token_expires = time.time() + resp.get('expires_in', 3600)
            return _igdb_token
    except Exception as e:
        log.warning('IGDB token fetch failed: %s', e)
        return None

# SSRF whitelist
_OK_TMDB = re.compile(r'^/(movie|tv|person|discover|search|genre|find)/')
_OK_TRAKT = re.compile(r'^(movies|shows|search|users)/')
_GBOOKS_PARAMS = {'q', 'maxResults', 'langRestrict', 'printType', 'orderBy', 'startIndex'}
_IGDB_BODY_RE = re.compile(r'^(fields|search|where|sort|limit|offset)')

def fetch(url, headers=None, ttl=300):
    c = cache_get(url, ttl)
    if c is not None: return c
    req = urllib.request.Request(url, headers={'User-Agent': 'BookSwipe/2.0'})
    if headers:
        for k, v in headers.items(): req.add_header(k, v)
    try:
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
            cache_set(url, data)
            return data
    except urllib.error.HTTPError as e:
        return {'error': f'HTTP {e.code}'}
    except Exception as e:
        return {'error': str(e)}

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DIR, **kw)

    def _client_ip(self):
        return self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[0].strip()

    def do_GET(self):
        ip = self._client_ip()
        if not _check_rate(ip): return self._json({'error': 'Rate limit exceeded'}, 429)
        p = self.path
        if p.startswith('/proxy/tmdb/'):    return self._tmdb(p[12:])
        if p.startswith('/proxy/trakt/'):   return self._trakt(p[13:])
        if p.startswith('/proxy/gbooks'):   return self._gbooks(p)
        if p.startswith('/proxy/igdb/'):    return self._igdb(p[12:])
        super().do_GET()

    def _tmdb(self, path):
        if not TMDB_KEY: return self._json({'error': 'TMDB_API_KEY not set'}, 503)
        if not _OK_TMDB.match(path.split('?')[0]): return self._json({'error': 'Invalid path'}, 400)
        data = fetch(f'{TMDB_BASE}/{path}', headers={'Authorization': f'Bearer {TMDB_KEY}'}, ttl=300)
        self._json(data)

    def _trakt(self, path):
        if not TRAKT_KEY: return self._json({'error': 'TRAKT_API_KEY not set'}, 503)
        if not _OK_TRAKT.match(path.split('?')[0]): return self._json({'error': 'Invalid path'}, 400)
        data = fetch(f'{TRAKT_BASE}/{path}', {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': TRAKT_KEY
        }, ttl=86400)
        self._json(data)

    def _gbooks(self, fullpath):
        qs = fullpath.split('?', 1)[1] if '?' in fullpath else ''
        if len(qs) > 2048: return self._json({'error': 'Query too long'}, 400)
        try:
            params = urllib.parse.parse_qs(qs)
            filtered = {k: v[0] for k, v in params.items() if k in _GBOOKS_PARAMS}
            data = fetch(f'{GB_BASE}/volumes?{urllib.parse.urlencode(filtered)}', ttl=604800)
        except Exception:
            data = fetch(f'{GB_BASE}/volumes?q=test', ttl=604800)
        self._json(data)

    def _igdb(self, path):
        token = _get_igdb_token()
        if not token: return self._json({'error': 'TWITCH_CLIENT_ID/SECRET not set'}, 503)
        qs = urllib.parse.unquote(path.split('?', 1)[1] if '?' in path else '')
        body = ''
        if qs.startswith('body='):
            body = qs[5:]
        if not body or not _IGDB_BODY_RE.match(body.strip()):
            return self._json({'error': 'Invalid IGDB query'}, 400)
        cache_key = f'igdb:{body}'
        cached = cache_get(cache_key, 600)
        if cached is not None: return self._json(cached)
        try:
            req = urllib.request.Request(f'{IGDB_BASE}/games', data=body.encode(), method='POST')
            req.add_header('Client-ID', TWITCH_CLIENT_ID)
            req.add_header('Authorization', f'Bearer {token}')
            req.add_header('Accept', 'application/json')
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read())
                cache_set(cache_key, data)
                self._json(data)
        except urllib.error.HTTPError as e:
            self._json({'error': f'IGDB HTTP {e.code}'}, e.code)
        except Exception as e:
            self._json({'error': str(e)}, 500)

    def _json(self, data, status=200):
        body = json.dumps(data).encode()
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        self.send_header('Cache-Control', 'public, max-age=300')
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        super().end_headers()

    def do_OPTIONS(self):
        self.send_response(204)
        self.end_headers()

    def log_message(self, fmt, *args):
        log.debug(fmt, *args)

class ThreadedHTTP(ThreadingMixIn, HTTPServer):
    daemon_threads = True
    allow_reuse_address = True

if __name__ == '__main__':
    os.chdir(DIR)
    signal.signal(signal.SIGHUP, signal.SIG_IGN)
    if os.fork() > 0: sys.exit(0)
    os.setsid()
    if os.fork() > 0: sys.exit(0)
    sys.stdout = open(os.path.join(DIR, 'server.log'), 'w')
    sys.stderr = sys.stdout
    if not TMDB_KEY: log.warning('TMDB_API_KEY not set - TMDB proxy will return 503')
    if not TRAKT_KEY: log.warning('TRAKT_API_KEY not set - Trakt proxy will return 503')
    if not TWITCH_CLIENT_ID: log.warning('TWITCH_CLIENT_ID not set - IGDB proxy will return 503')
    log.info('Starting on http://%s:%d', BIND, PORT)
    httpd = ThreadedHTTP((BIND, PORT), Handler)
    print(f'BookSwipe: http://{BIND}:{PORT}')
    httpd.serve_forever()
