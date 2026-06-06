#!/usr/bin/env python3
"""
BookSwipe Server v4
===================
Secure proxy server for TMDB, Trakt, Google Books, IGDB, and Steam APIs.
Improvements: Steam Store proxy, topsellers, tags, pricing, review sentiment.

Set environment variables before running:
  TMDB_API_KEY=your_key TRAKT_API_KEY=optional python3 server.py
"""
import http.server
import os
import sys
import signal
import json
import gzip
import io
import urllib.request
import urllib.error
import urllib.parse
import time
import threading
import re
import logging
from collections import OrderedDict, defaultdict
from http.server import HTTPServer
from socketserver import ThreadingMixIn

# Auto-load .env file if present (before reading env vars)
_env_path = os.path.join(os.path.dirname(os.path.abspath(__file__)), '.env')
if os.path.exists(_env_path):
    try:
        with open(_env_path) as _f:
            for _line in _f:
                _line = _line.strip()
                if _line and not _line.startswith('#') and '=' in _line:
                    _k, _v = _line.split('=', 1)
                    _k = _k.strip().removeprefix('export ')
                    _v = _v.strip().strip('"').strip("'")
                    if _k:
                        os.environ.setdefault(_k, _v)
    except Exception:
        pass

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
STEAM_CC = os.environ.get('STEAM_CC', 'us')  # Country code for pricing
STEAM_API_KEY = os.environ.get('STEAM_API_KEY', '')  # Steam Web API key (optional)

_igdb_token = None
_igdb_token_expires = 0
_igdb_token_lock = threading.Lock()

logging.basicConfig(level=logging.INFO, format='%(asctime)s %(levelname)s %(message)s')
log = logging.getLogger('bookswipe')

# True LRU Cache using OrderedDict
class LRUCache:
    def __init__(self, max_size=2000):
        self._cache = OrderedDict()
        self._lock = threading.Lock()
        self.max_size = max_size

    def get(self, key, ttl):
        with self._lock:
            entry = self._cache.get(key)
            if entry is None:
                return None
            if time.time() - entry['t'] > ttl:
                del self._cache[key]
                return None
            # Move to end (most recently used)
            self._cache.move_to_end(key)
            return entry['d']

    def set(self, key, data):
        with self._lock:
            if key in self._cache:
                self._cache.move_to_end(key)
            self._cache[key] = {'d': data, 't': time.time()}
            if len(self._cache) > self.max_size:
                # Evict oldest (first item)
                self._cache.popitem(last=False)

_cache = LRUCache(max_size=2000)

_rate_limits = defaultdict(list)
_rate_lock = threading.Lock()
RATE_WINDOW = 60
RATE_MAX = 200

def _check_rate(ip):
    now = time.time()
    with _rate_lock:
        _rate_limits[ip] = [t for t in _rate_limits[ip] if now - t < RATE_WINDOW]
        if len(_rate_limits[ip]) >= RATE_MAX:
            return False
        _rate_limits[ip].append(now)
        return True

def _get_igdb_token():
    global _igdb_token, _igdb_token_expires
    with _igdb_token_lock:
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
                log.info('IGDB token refreshed, expires in %ds', resp.get('expires_in', 3600))
                return _igdb_token
        except Exception as e:
            log.warning('IGDB token fetch failed: %s', e)
            return None

# SSRF whitelist
_OK_TMDB = re.compile(r'^/(movie|tv|person|discover|search|genre|find)/')
_OL_BASE = 'https://openlibrary.org'
_OK_TRAKT = re.compile(r'^(movies|shows|search|users)/')
_GBOOKS_PARAMS = {'q', 'maxResults', 'langRestrict', 'printType', 'orderBy', 'startIndex'}
_IGDB_BODY_RE = re.compile(r'^(fields|search|where|sort|limit|offset)')

# In-memory party sessions (swipe party feature)
_parties = {}
_party_lock = threading.Lock()

# AI concierge config (set OPENAI_API_KEY to enable LLM features)
_OPENAI_KEY = os.environ.get('OPENAI_API_KEY', '')
_OPENAI_BASE = os.environ.get('OPENAI_BASE_URL', 'https://api.openai.com/v1')

def fetch(url, headers=None, ttl=300, method='GET', body=None):
    cache_key = f"{method}:{url}:{body or ''}"
    c = _cache.get(cache_key, ttl)
    if c is not None:
        return c
    req_headers = {'User-Agent': 'BookSwipe/3.0'}
    if headers:
        for k, v in headers.items():
            req_headers[k] = v
    try:
        req = urllib.request.Request(url, headers=req_headers, method=method, data=body.encode() if body else None)
        with urllib.request.urlopen(req, timeout=15) as r:
            data = json.loads(r.read())
            _cache.set(cache_key, data)
            return data
    except urllib.error.HTTPError as e:
        log.warning('HTTP %d for %s', e.code, url[:100])
        return {'error': f'HTTP {e.code}', 'status': e.code}
    except Exception as e:
        log.warning('Fetch error for %s: %s', url[:100], e)
        return {'error': str(e)}

class Handler(http.server.SimpleHTTPRequestHandler):
    def __init__(self, *a, **kw):
        super().__init__(*a, directory=DIR, **kw)

    def _client_ip(self):
        return self.headers.get('X-Forwarded-For', self.client_address[0]).split(',')[0].strip()

    def do_GET(self):
        ip = self._client_ip()
        if not _check_rate(ip):
            return self._json({'error': 'Rate limit exceeded'}, 429)
        p = self.path
        # Health check
        if p == '/health':
            return self._json({'status': 'ok', 'version': '3.0'})
        if p.startswith('/proxy/tmdb/'):    return self._tmdb(p[11:])
        if p.startswith('/proxy/trakt/'):   return self._trakt(p[13:])
        if p.startswith('/proxy/gbooks'):   return self._gbooks(p)
        if p.startswith('/proxy/igdb/'):    return self._igdb(p[12:])
        if p.startswith('/proxy/steam/'):   return self._steam(p[13:])
        if p.startswith('/proxy/openlibrary/'): return self._openlibrary(p[18:])
        super().do_GET()

    def do_POST(self):
        ip = self._client_ip()
        if not _check_rate(ip):
            return self._json({'error': 'Rate limit exceeded'}, 429)
        p = self.path
        if p.startswith('/proxy/igdb/'):    return self._igdb_post(p[12:])
        if p.startswith('/proxy/party/'):   return self._party_post(p[13:])
        if p.startswith('/proxy/ai/'):      return self._ai_post(p[10:])
        self._json({'error': 'Method not allowed'}, 405)

    def _tmdb(self, path):
        if not TMDB_KEY:
            return self._json({'error': 'TMDB_API_KEY not set', 'status': 503}, 503)
        if not _OK_TMDB.match(path.split('?')[0]):
            return self._json({'error': 'Invalid path', 'status': 400}, 400)
        # Append api_key as query param (TMDB v3 key doesn't work as Bearer token)
        sep = '&' if '?' in path else '?'
        path = path.lstrip('/')
        data = fetch(f'{TMDB_BASE}/{path}{sep}api_key={TMDB_KEY}', ttl=300)
        if 'status' in data and isinstance(data['status'], int):
            return self._json(data, data['status'])
        self._json(data)

    def _trakt(self, path):
        if not TRAKT_KEY:
            return self._json({'error': 'TRAKT_API_KEY not set', 'status': 503}, 503)
        if not _OK_TRAKT.match(path.split('?')[0]):
            return self._json({'error': 'Invalid path', 'status': 400}, 400)
        data = fetch(f'{TRAKT_BASE}/{path}', {
            'Content-Type': 'application/json',
            'trakt-api-version': '2',
            'trakt-api-key': TRAKT_KEY
        }, ttl=86400)
        self._json(data)

    def _gbooks(self, fullpath):
        qs = fullpath.split('?', 1)[1] if '?' in fullpath else ''
        if len(qs) > 2048:
            return self._json({'error': 'Query too long', 'status': 400}, 400)
        try:
            params = urllib.parse.parse_qs(qs)
            filtered = {k: v[0] for k, v in params.items() if k in _GBOOKS_PARAMS}
            data = fetch(f'{GB_BASE}/volumes?{urllib.parse.urlencode(filtered)}', ttl=604800)
        except Exception:
            data = fetch(f'{GB_BASE}/volumes?q=test', ttl=604800)
        self._json(data)

    def _igdb(self, path):
        """GET-based IGDB proxy (kept for backward compat)"""
        token = _get_igdb_token()
        if not token:
            return self._json({'error': 'TWITCH_CLIENT_ID/SECRET not set', 'status': 503}, 503)
        qs = urllib.parse.unquote(path.split('?', 1)[1] if '?' in path else '')
        body = ''
        if qs.startswith('body='):
            body = qs[5:]
        if not body or not _IGDB_BODY_RE.match(body.strip()):
            return self._json({'error': 'Invalid IGDB query', 'status': 400}, 400)
        return self._do_igdb_request(body, token)

    def _igdb_post(self, path):
        """POST-based IGDB proxy (preferred, no URL length limits)"""
        token = _get_igdb_token()
        if not token:
            return self._json({'error': 'TWITCH_CLIENT_ID/SECRET not set', 'status': 503}, 503)
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 10000:
            return self._json({'error': 'Body too large', 'status': 400}, 400)
        body = self.rfile.read(content_length).decode('utf-8', errors='replace')
        if not body or not _IGDB_BODY_RE.match(body.strip()):
            return self._json({'error': 'Invalid IGDB query', 'status': 400}, 400)
        return self._do_igdb_request(body, token)

    # ---- Swipe Party endpoints ----
    def _party_post(self, path):
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 50000:
            return self._json({'error': 'Body too large'}, 400)
        try:
            body = json.loads(self.rfile.read(content_length))
        except Exception:
            return self._json({'error': 'Invalid JSON'}, 400)
        if path == 'create':
            return self._party_create(body)
        if path == 'join':
            return self._party_join(body)
        if path == 'swipe':
            return self._party_swipe(body)
        return self._json({'error': 'Unknown party action'}, 404)

    def _party_get(self, path):
        qs = path.split('?', 1)[1] if '?' in path else ''
        params = urllib.parse.parse_qs(qs)
        session_id = params.get('session', [None])[0]
        if not session_id:
            return self._json({'error': 'Missing session'}, 400)
        with _party_lock:
            party = _parties.get(session_id)
            if not party:
                return self._json({'error': 'Session not found'}, 404)
            # Clean expired sessions (> 30 min)
            if time.time() - party.get('created', 0) > 1800:
                del _parties[session_id]
                return self._json({'error': 'Session expired'}, 410)
        return self._json({
            'participants': party.get('participants', []),
            'results': party.get('results', {}),
            'deck': party.get('deck', []),
        })

    def _party_create(self, body):
        session_id = 'p' + str(int(time.time() * 1000))[-8:]
        with _party_lock:
            _parties[session_id] = {
                'id': session_id,
                'created': time.time(),
                'host': body.get('host', ''),
                'deck': body.get('deck', []),
                'participants': [body.get('host', 'host')],
                'results': {},
            }
        log.info('Party created: %s', session_id)
        return self._json({'id': session_id})

    def _party_join(self, body):
        session_id = body.get('session', '')
        user = body.get('user', '')
        if not session_id or not user:
            return self._json({'error': 'Missing session or user'}, 400)
        with _party_lock:
            party = _parties.get(session_id)
            if not party:
                return self._json({'error': 'Session not found'}, 404)
            if user not in party['participants']:
                party['participants'].append(user)
        return self._json({'ok': True})

    def _party_swipe(self, body):
        session_id = body.get('session', '')
        item_id = body.get('itemId', '')
        direction = body.get('direction', '')
        user = body.get('user', '')
        with _party_lock:
            party = _parties.get(session_id)
            if not party:
                return self._json({'error': 'Session not found'}, 404)
            if item_id not in party['results']:
                party['results'][item_id] = {'likes': 0, 'nopes': 0, 'title': item_id}
            if direction == 'right':
                party['results'][item_id]['likes'] = party['results'][item_id].get('likes', 0) + 1
            elif direction == 'left':
                party['results'][item_id]['nopes'] = party['results'][item_id].get('nopes', 0) + 1
        return self._json({'ok': True})

    # ---- AI Concierge endpoint ----
    def _ai_post(self, path):
        if path not in ('concierge',):
            return self._json({'error': 'Unknown AI endpoint'}, 404)
        content_length = int(self.headers.get('Content-Length', 0))
        if content_length > 10000:
            return self._json({'error': 'Body too large'}, 400)
        try:
            body = json.loads(self.rfile.read(content_length))
        except Exception:
            return self._json({'error': 'Invalid JSON'}, 400)
        user_message = body.get('message', '')
        lang = body.get('lang', 'de')
        profile = body.get('profile', {})
        chat_history = body.get('history', [])

        # If OpenAI API key is set, use real LLM
        if _OPENAI_KEY:
            return self._ai_llm(user_message, lang, profile, chat_history)
        # Fallback: return a suggestion to use rule-based concierge
        return self._json({
            'response': '',
            'fallback': True,
        })

    def _ai_llm(self, message, lang, profile, history):
        top_genres = profile.get('topGenres', [])
        media_type = profile.get('mediaType', 'movies')
        system_prompt = (
            'Du bist ein Media-Concierge für BookSwipe. ' if lang == 'de'
            else 'You are a media concierge for BookSwipe. '
        ) + (
            f'Der Nutzer mag: {top_genres}. Medientyp: {media_type}. '
            f'Gib kurze, hilfreiche Empfehlungen (max 3 Sätze). Sei freundlich und enthusiastisch.'
            if lang == 'de' else
            f'User likes: {top_genres}. Media type: {media_type}. '
            f'Give short, helpful recommendations (max 3 sentences). Be friendly and enthusiastic.'
        )
        try:
            req_body = json.dumps({
                'model': 'gpt-3.5-turbo',
                'messages': [
                    {'role': 'system', 'content': system_prompt},
                    *[{'role': h['role'], 'content': h['content']} for h in (history or [])[-6:]],
                    {'role': 'user', 'content': message},
                ],
                'max_tokens': 200,
                'temperature': 0.7,
            }).encode()
            req = urllib.request.Request(
                f'{_OPENAI_BASE}/chat/completions',
                data=req_body,
                method='POST'
            )
            req.add_header('Authorization', f'Bearer {_OPENAI_KEY}')
            req.add_header('Content-Type', 'application/json')
            with urllib.request.urlopen(req, timeout=20) as r:
                data = json.loads(r.read())
                response = data['choices'][0]['message']['content'].strip()
                return self._json({'response': response})
        except Exception as e:
            log.warning('AI concierge error: %s', e)
            return self._json({'response': '', 'fallback': True})

    # ---- Open Library proxy (for first-page excerpts) ----
    def _openlibrary(self, path):
        """Proxy requests to Open Library API (no auth needed, just for CORS)."""
        path = path.lstrip('/')
        if not re.match(r'^works/[A-Za-z0-9]+\.json$', path):
            return self._json({'error': 'Invalid Open Library path', 'status': 400}, 400)
        data = fetch(f'{_OL_BASE}/{path}', ttl=86400)
        if 'status' in data and isinstance(data['status'], int) and data['status'] >= 400:
            return self._json(data, data['status'])
        self._json(data)

    # ---- Steam Store API proxy ----
    def _steam(self, path):
        """Steam Store API proxy: appdetails, featured, reviews, search"""
        if not _OK_STEAM.match(path.split('?')[0]):
            return self._json({'error': 'Invalid Steam path', 'status': 400}, 400)
        qs = path.split('?', 1)[1] if '?' in path else ''
        params = urllib.parse.parse_qs(qs)
        cc = params.get('cc', [STEAM_CC])[0]

        if path.startswith('appdetails'):
            return self._steam_appdetails(params, cc)
        if path.startswith('featured'):
            return self._steam_featured(cc)
        if path.startswith('reviews'):
            return self._steam_reviews(params)
        if path.startswith('search'):
            return self._steam_search(params, cc)
        if path.startswith('library'):
            return self._steam_library(params)
        return self._json({'error': 'Unknown Steam endpoint', 'status': 404}, 404)

    def _steam_appdetails(self, params, cc):
        appids = params.get('appids', [''])[0]
        if not appids:
            return self._json({'error': 'Missing appids parameter', 'status': 400}, 400)
        # Support comma-separated appids (max 5)
        appid_list = [a.strip() for a in appids.split(',') if a.strip()][:5]
        cache_key = f'steam:appdetails:{",".join(appid_list)}:{cc}'
        cached = _cache.get(cache_key, 3600)
        if cached is not None:
            return self._json(cached)
        results = {}
        for aid in appid_list:
            url = f'{STEAM_STORE_BASE}/appdetails?appids={aid}&cc={cc}'
            data = self._fetch_steam(url)
            if data and str(aid) in data and data[str(aid)].get('success'):
                results[aid] = data[str(aid)]['data']
            else:
                results[aid] = None
        _cache.set(cache_key, results)
        return self._json(results)

    def _steam_featured(self, cc):
        cache_key = f'steam:featured:{cc}'
        cached = _cache.get(cache_key, 3600)
        if cached is not None:
            return self._json(cached)
        url = f'{STEAM_STORE_BASE}/featured?cc={cc}'
        data = self._fetch_steam(url)
        if data:
            _cache.set(cache_key, data)
        return self._json(data or {})

    def _steam_reviews(self, params):
        appid = params.get('appid', [''])[0]
        if not appid:
            return self._json({'error': 'Missing appid', 'status': 400}, 400)
        cache_key = f'steam:reviews:{appid}'
        cached = _cache.get(cache_key, 3600)
        if cached is not None:
            return self._json(cached)
        url = f'https://store.steampowered.com/appreviews/{appid}?json=1&language=all&purchase_type=all'
        data = self._fetch_steam(url)
        if data:
            _cache.set(cache_key, data)
        return self._json(data or {})

    def _steam_search(self, params, cc):
        """Steam search results (JSON) - for topsellers, new releases, etc."""
        term = params.get('term', [''])[0]
        tags = params.get('tags', [''])[0]
        sort_by = params.get('sort_by', ['Reviews_DESC'])[0]
        category1 = params.get('category1', ['998'])[0]  # 998 = all games
        force_infinite = params.get('force_infinite', ['1'])[0]
        cache_key = f'steam:search:{term}:{tags}:{sort_by}:{category1}:{cc}'
        cached = _cache.get(cache_key, 1800)
        if cached is not None:
            return self._json(cached)
        # Build search URL
        search_qs = {
            'cc': cc,
            'l': 'english',
            'sort_by': sort_by,
            'category1': category1,
            'force_infinite': force_infinite,
            'snr': '1_7_7_2300_7',
            'infinite': 1,
        }
        if term:
            search_qs['term'] = term
        if tags:
            search_qs['tags'] = tags
        url = f'https://store.steampowered.com/search/results/?{urllib.parse.urlencode(search_qs)}'
        data = self._fetch_steam(url)
        if data:
            _cache.set(cache_key, data)
        return self._json(data or {})

    def _steam_library(self, params):
        """Fetch user's owned games from Steam Web API"""
        steam_id = params.get('steamid', [''])[0]
        api_key = params.get('api_key', [STEAM_API_KEY])[0]
        
        if not steam_id:
            return self._json({'error': 'Missing steamid parameter', 'status': 400}, 400)
        if not api_key:
            return self._json({'error': 'Steam API key required. Set STEAM_API_KEY env var or provide api_key parameter.', 'status': 400}, 400)
        
        cache_key = f'steam:library:{steam_id}'
        cached = _cache.get(cache_key, 3600)  # Cache for 1 hour
        if cached is not None:
            return self._json(cached)
        
        # Fetch owned games from Steam Web API
        url = (
            f'https://api.steampowered.com/IPlayerService/GetOwnedGames/v1/'
            f'?key={api_key}&steamid={steam_id}&include_appinfo=1'
            f'&include_played_free_games=1&format=json'
        )
        
        try:
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'BookSwipe/1.0')
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read())
                
            if 'response' not in data:
                return self._json({'error': 'Invalid Steam API response', 'status': 502}, 502)
            
            response = data['response']
            games = response.get('games', [])
            game_count = response.get('game_count', 0)
            
            # Map to our format
            library = []
            for g in (games or []):
                library.append({
                    'appId': g.get('appid'),
                    'name': g.get('name', ''),
                    'playtimeMinutes': g.get('playtime_forever', 0),
                    'playtime2Weeks': g.get('playtime_2weeks', 0),
                    'imgIconUrl': g.get('img_icon_url', ''),
                    'imgLogoUrl': g.get('img_logo_url', ''),
                    'communityVisibleStats': g.get('community_visible_stats', False)
                })
            
            result = {
                'steamId': steam_id,
                'gameCount': game_count,
                'games': library,
                'fetchedAt': int(time.time())
            }
            
            _cache.set(cache_key, result)
            return self._json(result)
            
        except urllib.error.HTTPError as e:
            log.warning('Steam Library HTTP %d for %s', e.code, steam_id)
            return self._json({'error': f'Steam API error: {e.code}', 'status': e.code}, e.code)
        except Exception as e:
            log.warning('Steam Library error: %s', e)
            return self._json({'error': str(e), 'status': 500}, 500)

    def _fetch_steam(self, url):
        """Fetch from Steam Store with proper headers to avoid bot detection."""
        try:
            req = urllib.request.Request(url)
            req.add_header('User-Agent', 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36')
            req.add_header('Accept', 'application/json')
            req.add_header('Accept-Language', 'en-US,en;q=0.9')
            with urllib.request.urlopen(req, timeout=10) as r:
                return json.loads(r.read())
        except urllib.error.HTTPError as e:
            log.warning('Steam HTTP %d for %s', e.code, url[:80])
            return None
        except Exception as e:
            log.warning('Steam fetch error: %s', e)
            return None

    # ---- End Steam Store API proxy ----

    def _do_igdb_request(self, body, token):
        cache_key = f'igdb:{body}'
        cached = _cache.get(cache_key, 600)
        if cached is not None:
            return self._json(cached)
        try:
            req = urllib.request.Request(f'{IGDB_BASE}/games', data=body.encode(), method='POST')
            req.add_header('Client-ID', TWITCH_CLIENT_ID)
            req.add_header('Authorization', f'Bearer {token}')
            req.add_header('Accept', 'application/json')
            with urllib.request.urlopen(req, timeout=15) as r:
                data = json.loads(r.read())
                _cache.set(cache_key, data)
                self._json(data)
        except urllib.error.HTTPError as e:
            log.warning('IGDB HTTP %d', e.code)
            self._json({'error': f'IGDB HTTP {e.code}', 'status': e.code}, e.code)
        except Exception as e:
            log.warning('IGDB error: %s', e)
            self._json({'error': str(e), 'status': 500}, 500)

    def _json(self, data, status=200):
        body = json.dumps(data, ensure_ascii=False).encode('utf-8')
        # Gzip compress responses > 1KB for 3-5x faster transfer
        accept_encoding = self.headers.get('Accept-Encoding', '')
        if len(body) > 1024 and 'gzip' in accept_encoding:
            buf = io.BytesIO()
            with gzip.GzipFile(fileobj=buf, mode='wb', compresslevel=6) as f:
                f.write(body)
            compressed = buf.getvalue()
            if len(compressed) < len(body):
                self.send_response(status)
                self.send_header('Content-Type', 'application/json')
                self.send_header('Content-Encoding', 'gzip')
                self.send_header('Content-Length', len(compressed))
                if status >= 400:
                    self.send_header('Cache-Control', 'no-store')
                else:
                    self.send_header('Cache-Control', 'public, max-age=300')
                self.end_headers()
                self.wfile.write(compressed)
                return
        # Uncompressed fallback
        self.send_response(status)
        self.send_header('Content-Type', 'application/json')
        self.send_header('Content-Length', len(body))
        if status >= 400:
            self.send_header('Cache-Control', 'no-store')
        else:
            self.send_header('Cache-Control', 'public, max-age=300')
        self.end_headers()
        self.wfile.write(body)

    def end_headers(self):
        self.send_header('Access-Control-Allow-Origin', '*')
        self.send_header('Access-Control-Allow-Methods', 'GET, POST, OPTIONS')
        self.send_header('Access-Control-Allow-Headers', 'Content-Type')
        self.send_header('Access-Control-Max-Age', '86400')
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
    # Foreground mode (daemonization is optional)
    if os.environ.get('BOOKSWIPE_DAEMON'):
        if os.fork() > 0: sys.exit(0)
        os.setsid()
        if os.fork() > 0: sys.exit(0)
        sys.stdout = open(os.path.join(DIR, 'server.log'), 'a')
        sys.stderr = sys.stdout
    if not TMDB_KEY: log.warning('TMDB_API_KEY not set - TMDB proxy will return 503')
    if not TRAKT_KEY: log.warning('TRAKT_API_KEY not set - Trakt proxy will return 503')
    if not TWITCH_CLIENT_ID: log.warning('TWITCH_CLIENT_ID not set - IGDB proxy will return 503')
    log.info('BookSwipe v3 starting on http://%s:%d', BIND, PORT)
    httpd = ThreadedHTTP((BIND, PORT), Handler)
    print(f'BookSwipe v3: http://{BIND}:{PORT}')
    httpd.serve_forever()
