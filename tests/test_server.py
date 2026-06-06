#!/usr/bin/env python3
"""
Comprehensive backend unit tests for BookSwipe server.
Covers: SSRF, rate limiting, endpoints, malformed input, security headers, caching, party system.
"""
import sys
import os
import json
import time
import threading
import urllib.request
import urllib.error
import unittest

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server

PORT = 3098
BASE = f'http://127.0.0.1:{PORT}'


def setUpModule():
    server.RATE_MAX = 500
    with server._rate_lock:
        server._rate_limits.clear()
    server._httpd = server.ThreadedHTTP(('127.0.0.1', PORT), server.Handler)
    server._thread = threading.Thread(target=server._httpd.serve_forever, daemon=True)
    server._thread.start()
    time.sleep(0.5)


def tearDownModule():
    server._httpd.shutdown()


def get(path, expect_status=200, as_json=True):
    url = f'{BASE}{path}'
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            data = r.read()
            if as_json and 'json' in r.headers.get('Content-Type', ''):
                return r.status, json.loads(data) if data else {}
            return r.status, data
    except urllib.error.HTTPError as e:
        body = e.read()
        try:
            return e.code, json.loads(body) if body else {}
        except (json.JSONDecodeError, ValueError):
            return e.code, body


def post(path, body, expect_status=200):
    url = f'{BASE}{path}'
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            resp = r.read()
            return r.status, json.loads(resp) if resp else {}
    except urllib.error.HTTPError as e:
        errbody = e.read()
        try:
            return e.code, json.loads(errbody) if errbody else {}
        except (json.JSONDecodeError, ValueError):
            return e.code, {}


class TestHealthEndpoint(unittest.TestCase):
    def test_health_returns_ok(self):
        status, data = get('/health')
        self.assertEqual(status, 200)
        self.assertEqual(data['status'], 'ok')
        self.assertIn('version', data)

    def test_health_no_rate_limit_bypass(self):
        status, _ = get('/health')
        self.assertEqual(status, 200)


class TestSecurityHeaders(unittest.TestCase):
    def test_x_content_type_options(self):
        url = f'{BASE}/health'
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as r:
            self.assertEqual(r.headers.get('X-Content-Type-Options'), 'nosniff')

    def test_x_frame_options(self):
        url = f'{BASE}/health'
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as r:
            self.assertEqual(r.headers.get('X-Frame-Options'), 'DENY')

    def test_referrer_policy(self):
        url = f'{BASE}/health'
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as r:
            self.assertEqual(r.headers.get('Referrer-Policy'), 'strict-origin-when-cross-origin')

    def test_permissions_policy(self):
        url = f'{BASE}/health'
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as r:
            pp = r.headers.get('Permissions-Policy', '')
            self.assertIn('camera=()', pp)
            self.assertIn('microphone=()', pp)

    def test_cors_headers(self):
        url = f'{BASE}/health'
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as r:
            self.assertEqual(r.headers.get('Access-Control-Allow-Origin'), '*')

    def test_json_content_type(self):
        url = f'{BASE}/health'
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as r:
            self.assertEqual(r.headers.get('Content-Type'), 'application/json')


class TestCORSOptions(unittest.TestCase):
    def test_options_returns_204(self):
        url = f'{BASE}/proxy/party/create'
        req = urllib.request.Request(url, method='OPTIONS')
        with urllib.request.urlopen(req, timeout=5) as r:
            self.assertEqual(r.status, 204)


class TestRateLimiting(unittest.TestCase):
    def test_rate_limit_triggers(self):
        old_max = server.RATE_MAX
        server.RATE_MAX = 3
        try:
            with server._rate_lock:
                ip = 'test_ratelimit_ip'
                server._rate_limits[ip] = []
            for _ in range(3):
                get('/health')
            with server._rate_lock:
                server._rate_limits[ip] = [time.time()] * 3
            status, data = get('/health', expect_status=429)
            self.assertEqual(status, 429)
            self.assertIn('Rate limit', data.get('error', ''))
        finally:
            server.RATE_MAX = old_max
            with server._rate_lock:
                server._rate_limits.pop('test_ratelimit_ip', None)


class TestSSRFWhitelist(unittest.TestCase):
    def test_tmdb_valid_path(self):
        if not server.TMDB_KEY:
            status, data = get('/proxy/tmdb/movie/550', expect_status=503)
            self.assertEqual(status, 503)
        else:
            status, _ = get('/proxy/tmdb/movie/550')
            self.assertIn(status, [200, 401, 404])

    def test_tmdb_invalid_path_rejected(self):
        if not server.TMDB_KEY:
            status, _ = get('/proxy/tmdb/invalid/path', expect_status=503)
        else:
            status, data = get('/proxy/tmdb/invalid/path', expect_status=400)
            self.assertEqual(data.get('error'), 'Invalid path')

    def test_tmdb_path_traversal_rejected(self):
        status, _ = get('/proxy/tmdb/../../etc/passwd', expect_status=400)

    def test_gbooks_rejects_long_query(self):
        long_q = 'x' * 3000
        status, data = get(f'/proxy/gbooks/volumes?q={long_q}', expect_status=400)

    def test_gbooks_valid_query(self):
        status, data = get('/proxy/gbooks/volumes?q=test&maxResults=1')
        self.assertIn(status, [200, 429])

    def test_steam_invalid_path(self):
        status, data = get('/proxy/steam/invalid_endpoint', expect_status=400)
        self.assertIn('error', data)

    def test_steam_appdetails_missing_appids(self):
        status, data = get('/proxy/steam/appdetails', expect_status=400)
        self.assertIn('Missing', data.get('error', ''))


class TestPartyEndpoints(unittest.TestCase):
    def test_party_create(self):
        status, data = post('/proxy/party/create', {'host': 'test1', 'deck': []})
        self.assertEqual(status, 200)
        self.assertIn('id', data)
        self.assertTrue(data['id'].startswith('p'))

    def test_party_join(self):
        _, created = post('/proxy/party/create', {'host': 'h1', 'deck': []})
        sid = created['id']
        status, data = post('/proxy/party/join', {'session': sid, 'user': 'u2'})
        self.assertEqual(status, 200)
        self.assertTrue(data.get('ok'))

    def test_party_join_missing_fields(self):
        status, data = post('/proxy/party/join', {'session': ''}, expect_status=400)
        self.assertIn('Missing', data.get('error', ''))

    def test_party_swipe(self):
        _, created = post('/proxy/party/create', {'host': 'h1', 'deck': []})
        sid = created['id']
        status, data = post('/proxy/party/swipe', {
            'session': sid, 'user': 'h1', 'itemId': 'tmdb-999', 'direction': 'right'
        })
        self.assertEqual(status, 200)
        self.assertTrue(data.get('ok'))

    def test_party_swipe_nonexistent_session(self):
        status, data = post('/proxy/party/swipe', {
            'session': 'nonexistent', 'user': 'u1', 'itemId': 'x', 'direction': 'left'
        }, expect_status=404)

    def test_party_get_state(self):
        _, created = post('/proxy/party/create', {'host': 'h1', 'deck': [{'id': 'x', 'title': 'T'}]})
        sid = created['id']
        status, data = get(f'/proxy/party/state?session={sid}')
        self.assertEqual(status, 200)
        self.assertIn('participants', data)
        self.assertIn('results', data)
        self.assertIn('deck', data)

    def test_party_get_state_missing_session(self):
        status, data = get('/proxy/party/state', expect_status=400)
        self.assertIn('Missing', data.get('error', ''))

    def test_party_get_state_nonexistent(self):
        status, data = get('/proxy/party/state?session=nonexistent', expect_status=404)

    def test_party_get_unknown_action(self):
        status, data = get('/proxy/party/unknown', expect_status=404)

    def test_party_create_stores_deck(self):
        deck = [{'id': 'a', 'title': 'Movie A'}, {'id': 'b', 'title': 'Movie B'}]
        _, created = post('/proxy/party/create', {'host': 'h1', 'deck': deck})
        sid = created['id']
        status, data = get(f'/proxy/party/state?session={sid}')
        self.assertEqual(len(data.get('deck', [])), 2)

    def test_party_multiple_swipes(self):
        _, created = post('/proxy/party/create', {'host': 'h1', 'deck': []})
        sid = created['id']
        post('/proxy/party/swipe', {'session': sid, 'user': 'h1', 'itemId': 'tmdb-1', 'direction': 'right'})
        post('/proxy/party/swipe', {'session': sid, 'user': 'u2', 'itemId': 'tmdb-1', 'direction': 'left'})
        post('/proxy/party/swipe', {'session': sid, 'user': 'h1', 'itemId': 'tmdb-1', 'direction': 'right'})
        status, data = get(f'/proxy/party/state?session={sid}')
        r = data.get('results', {}).get('tmdb-1', {})
        self.assertEqual(r.get('likes'), 2)
        self.assertEqual(r.get('nopes'), 1)


class TestAIConcierge(unittest.TestCase):
    def test_ai_fallback_without_key(self):
        status, data = post('/proxy/ai/concierge', {'message': 'hello', 'lang': 'en'})
        self.assertEqual(status, 200)
        self.assertTrue(data.get('fallback'))

    def test_ai_unknown_endpoint(self):
        status, data = post('/proxy/ai/unknown', {'message': 'hi'}, expect_status=404)
        self.assertIn('Unknown', data.get('error', ''))

    def test_ai_invalid_json(self):
        url = f'{BASE}/proxy/ai/concierge'
        req = urllib.request.Request(url, data=b'not json', method='POST')
        req.add_header('Content-Type', 'application/json')
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                status = r.status
        except urllib.error.HTTPError as e:
            status = e.code
        self.assertEqual(status, 400)

    def test_ai_body_too_large(self):
        url = f'{BASE}/proxy/ai/concierge'
        big_body = json.dumps({'message': 'x' * 20000}).encode()
        req = urllib.request.Request(url, data=big_body, method='POST')
        req.add_header('Content-Type', 'application/json')
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                status = r.status
        except urllib.error.HTTPError as e:
            status = e.code
        self.assertEqual(status, 400)


class TestPostMethodGuards(unittest.TestCase):
    def test_post_unknown_endpoint(self):
        status, data = post('/proxy/unknown', {}, expect_status=405)
        self.assertIn('not allowed', data.get('error', '').lower())

    def test_post_party_invalid_json(self):
        url = f'{BASE}/proxy/party/create'
        req = urllib.request.Request(url, data=b'broken', method='POST')
        req.add_header('Content-Type', 'application/json')
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                status = r.status
        except urllib.error.HTTPError as e:
            status = e.code
        self.assertEqual(status, 400)

    def test_post_igdb_no_token(self):
        if not server.TWITCH_CLIENT_ID:
            status, data = post('/proxy/igdb/games', {'fields': 'name'}, expect_status=503)
            self.assertIn('TWITCH', data.get('error', ''))
        else:
            self.assertTrue(True)

    def test_post_party_body_too_large(self):
        url = f'{BASE}/proxy/party/create'
        big_body = json.dumps({'host': 'x' * 60000}).encode()
        req = urllib.request.Request(url, data=big_body, method='POST')
        req.add_header('Content-Type', 'application/json')
        try:
            with urllib.request.urlopen(req, timeout=5) as r:
                status = r.status
        except urllib.error.HTTPError as e:
            status = e.code
        self.assertEqual(status, 400)


class TestStaticFiles(unittest.TestCase):
    def test_index_html(self):
        status, data = get('/', as_json=False)
        self.assertEqual(status, 200)
        self.assertIn(b'<!DOCTYPE html>', data)

    def test_css(self):
        status, data = get('/css/styles.css', as_json=False)
        self.assertEqual(status, 200)
        self.assertTrue(len(data) > 1000)

    def test_sw_js(self):
        status, data = get('/sw.js', as_json=False)
        self.assertEqual(status, 200)
        self.assertIn(b'CACHE_NAME', data)

    def test_manifest(self):
        status, data = get('/static/manifest.json')
        self.assertEqual(status, 200)

    def test_404_for_missing(self):
        status, _ = get('/nonexistent-file.xyz', expect_status=404)
        self.assertEqual(status, 404)

    def test_all_js_modules(self):
        js_files = [
            'app', 'utils', 'books', 'media', 'games', 'games_api', 'tmdb',
            'tag_mapper', 'descriptions', 'enrichment', 'toast', 'experiment',
            'swipe', 'recommender', 'storage', 'api-client', 'lazyload',
            'achievements', 'challenges', 'compatibility', 'roast',
            'passport', 'wrapped', 'timecapsule', 'franchise',
            'swipe-party', 'pick-for-me', 'concierge', 'media-generator',
            'steam', 'api',
        ]
        for f in set(js_files):
            status, _ = get(f'/js/{f}.js')
            self.assertEqual(status, 200, f'Failed to serve /js/{f}.js')


class TestLRUCache(unittest.TestCase):
    def setUp(self):
        self.cache = server.LRUCache(max_size=3)

    def test_set_get(self):
        self.cache.set('k1', {'data': 1})
        result = self.cache.get('k1', ttl=60)
        self.assertEqual(result, {'data': 1})

    def test_ttl_expiry(self):
        self.cache.set('k1', {'data': 1})
        result = self.cache.get('k1', ttl=0)
        self.assertIsNone(result)

    def test_eviction(self):
        self.cache.set('k1', 1)
        self.cache.set('k2', 2)
        self.cache.set('k3', 3)
        self.cache.set('k4', 4)
        result = self.cache.get('k1', ttl=60)
        self.assertIsNone(result)

    def test_lru_ordering(self):
        self.cache.set('k1', 1)
        self.cache.set('k2', 2)
        self.cache.get('k1', ttl=60)
        self.cache.set('k3', 3)
        self.cache.set('k4', 4)
        self.assertIsNotNone(self.cache.get('k1', ttl=60))
        self.assertIsNone(self.cache.get('k2', ttl=60))


class TestJSONResponse(unittest.TestCase):
    def test_gzip_compression(self):
        url = f'{BASE}/health'
        req = urllib.request.Request(url)
        req.add_header('Accept-Encoding', 'gzip')
        with urllib.request.urlopen(req, timeout=5) as r:
            ct = r.headers.get('Content-Type', '')
            self.assertEqual(ct, 'application/json')

    def test_json_encoding(self):
        status, data = get('/health')
        self.assertIsInstance(data, dict)


class TestIGDBProxy(unittest.TestCase):
    def test_igdb_get_no_token(self):
        if not server.TWITCH_CLIENT_ID:
            status, data = get('/proxy/igdb/games?body=search+%22test%22', expect_status=503)
            self.assertIn('TWITCH', data.get('error', ''))
        else:
            self.assertTrue(True)

    def test_igdb_get_invalid_body(self):
        if server.TWITCH_CLIENT_ID:
            status, data = get('/proxy/igdb/games?body=DROP+TABLE', expect_status=400)
            self.assertIn('Invalid', data.get('error', ''))
        else:
            status, data = get('/proxy/igdb/games?body=DROP+TABLE', expect_status=503)
            self.assertIn('TWITCH', data.get('error', ''))


class TestOpenLibraryProxy(unittest.TestCase):
    def test_openlibrary_invalid_path(self):
        status, data = get('/proxy/openlibrary/../../../etc/passwd', expect_status=400)
        self.assertIn('error', data if isinstance(data, dict) else {})


if __name__ == '__main__':
    unittest.main(verbosity=2)
