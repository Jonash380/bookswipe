#!/usr/bin/env python3
"""Integration test: start server, test all endpoints, shut down."""
import sys, os, json, time, threading, urllib.request, urllib.error

sys.path.insert(0, os.path.dirname(os.path.dirname(os.path.abspath(__file__))))
import server

PORT = 3099  # Use non-standard port to avoid conflicts
errors = []
ok_count = 0

# Bump rate limit for testing (restore at end)
_orig_rate_max = server.RATE_MAX
server.RATE_MAX = 200

def test(name, fn):
    global ok_count
    try:
        result = fn()
        if result is True:
            ok_count += 1
            print(f"  ✅ {name}")
        else:
            errors.append(f"{name}: {result}")
            print(f"  ❌ {name}: {result}")
    except Exception as e:
        errors.append(f"{name}: {e}")
        print(f"  ❌ {name}: {e}")

def get(path, expect_status=200):
    url = f"http://127.0.0.1:{PORT}{path}"
    req = urllib.request.Request(url)
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            data = r.read()
            if r.status != expect_status:
                return f"Expected {expect_status}, got {r.status}"
            return json.loads(data) if data else {}
    except urllib.error.HTTPError as e:
        body = e.read()
        if e.code != expect_status:
            return f"Expected {expect_status}, got {e.code}"
        try:
            return json.loads(body) if body else {}
        except (json.JSONDecodeError, ValueError):
            return {}

def post(path, body, expect_status=200):
    url = f"http://127.0.0.1:{PORT}{path}"
    data = json.dumps(body).encode()
    req = urllib.request.Request(url, data=data, method='POST')
    req.add_header('Content-Type', 'application/json')
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            resp = r.read()
            if r.status != expect_status:
                return f"Expected {expect_status}, got {r.status}"
            return json.loads(resp) if resp else {}
    except urllib.error.HTTPError as e:
        errbody = e.read()
        if e.code != expect_status:
            return f"Expected {expect_status}, got {e.code}: {errbody[:200]}"
        try:
            return json.loads(errbody) if errbody else {}
        except (json.JSONDecodeError, ValueError):
            return {}

def check_status(path, expect=200):
    url = f"http://127.0.0.1:{PORT}{path}"
    try:
        req = urllib.request.Request(url)
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status == expect or f"Expected {expect}, got {r.status}"
    except urllib.error.HTTPError as e:
        return e.code == expect or f"Expected {expect}, got {e.code}"
    except Exception as e:
        return f"Request failed: {e}"

# Start server in background thread
httpd = server.ThreadedHTTP(('127.0.0.1', PORT), server.Handler)
t = threading.Thread(target=httpd.serve_forever, daemon=True)
t.start()
time.sleep(0.5)

print("\n🔍 BookSwipe Server Integration Tests\n")

# === Health ===
print("📡 Health & Basics:")
def test_health():
    d = get("/health")
    return d.get("status") == "ok" or f"Got: {d}"
test("Health endpoint", test_health)

def test_options():
    url = f"http://127.0.0.1:{PORT}/proxy/party/create"
    req = urllib.request.Request(url, method='OPTIONS')
    try:
        with urllib.request.urlopen(req, timeout=5) as r:
            return r.status == 204 or f"Got {r.status}"
    except urllib.error.HTTPError as e:
        return e.code == 204 or f"Got {e.code}"
test("CORS OPTIONS preflight", test_options)

# === Static Files ===
print("\n📁 Static Files:")
static_files = [
    "/", "/index.html", "/css/styles.css", "/sw.js",
    "/static/manifest.json", "/static/icon-192.png", "/static/icon-512.png",
]
js_files = [
    "app", "utils", "books", "media", "games", "games_api", "api", "tmdb",
    "tag_mapper", "descriptions", "enrichment", "toast", "experiment",
    "swipe", "recommender", "storage", "api-client",
    "achievements", "challenges", "compatibility", "roast",
    "passport", "wrapped", "timecapsule", "franchise",
    "swipe-party", "pick-for-me", "concierge", "media-generator",
]
for f in static_files:
    test(f"GET {f}", lambda p=f: check_status(p))
for f in js_files:
    test(f"GET /js/{f}.js", lambda p=f"/js/{f}.js": check_status(p))

# === 404 for missing files ===
print("\n🚫 404 Handling:")
def test_404():
    return check_status("/nonexistent-file.xyz", 404)
test("Missing file returns 404", test_404)

# === Party Endpoint (POST) ===
print("\n🎉 Party Endpoints:")
def test_party_create():
    d = post("/proxy/party/create", {"host": "test-user", "deck": []})
    return ("id" in d and d["id"].startswith("p")) or f"Got: {d}"
test("Party create", test_party_create)

def test_party_join():
    # First create a session
    created = post("/proxy/party/create", {"host": "host1", "deck": []})
    sid = created.get("id", "")
    if not sid:
        return f"Create failed: {created}"
    d = post("/proxy/party/join", {"session": sid, "user": "user2"})
    return d.get("ok") is True or f"Got: {d}"
test("Party join", test_party_join)

def test_party_swipe():
    created = post("/proxy/party/create", {"host": "host1", "deck": []})
    sid = created.get("id", "")
    if not sid:
        return f"Create failed: {created}"
    d = post("/proxy/party/swipe", {"session": sid, "user": "host1", "itemId": "tmdb-123", "direction": "right"})
    return d.get("ok") is True or f"Got: {d}"
test("Party swipe", test_party_swipe)

def test_party_get():
    created = post("/proxy/party/create", {"host": "host1", "deck": [{"id": "x", "title": "Test"}]})
    sid = created.get("id", "")
    if not sid:
        return f"Create failed: {created}"
    d = get(f"/proxy/party/state?session={sid}")
    return "participants" in d or f"Got: {d}"
test("Party get state", test_party_get)

# === AI Concierge (no key) ===
print("\n🤖 AI Concierge:")
def test_ai_concierge():
    d = post("/proxy/ai/concierge", {"message": "hello", "lang": "en"})
    return d.get("fallback") is True or f"Got: {d}"
test("AI concierge fallback (no key)", test_ai_concierge)

def test_ai_unknown():
    d = post("/proxy/ai/unknown", {"message": "hi"}, expect_status=404)
    return d.get("error") == "Unknown AI endpoint" or f"Got: {d}"
test("AI unknown endpoint returns 404", test_ai_unknown)

# === TMDB Proxy ===
print("\n🎬 TMDB Proxy:")
def test_tmdb_no_key():
    # If TMDB_KEY is set, this will actually make a request (may fail if key is invalid)
    if not server.TMDB_KEY:
        d = get("/proxy/tmdb/movie/550", expect_status=503)
        return d.get("error") == "TMDB_API_KEY not set" or f"Got: {d}"
    else:
        d = get("/proxy/tmdb/movie/550")
        # TMDB may return an error if the key is invalid; just check we get a response
        return isinstance(d, dict) or f"Got non-dict: {d}"
test("TMDB proxy (with or without key)", test_tmdb_no_key)

def test_tmdb_invalid_path():
    if server.TMDB_KEY:
        d = get("/proxy/tmdb/invalid/path", expect_status=400)
        return isinstance(d, dict) and d.get("error") == "Invalid path" or f"Got: {d}"
    else:
        # Without API key, server returns 503 before path validation
        d = get("/proxy/tmdb/invalid/path", expect_status=503)
        return isinstance(d, dict) and "not set" in d.get("error", "") or f"Got: {d}"
test("TMDB invalid path rejected (or 503 without key)", test_tmdb_invalid_path)

# === IGDB Proxy ===
print("\n🎮 IGDB Proxy:")
def test_igdb_no_key():
    if not server.TWITCH_CLIENT_ID:
        d = get("/proxy/igdb/games", expect_status=503)
        return d.get("error") == "TWITCH_CLIENT_ID/SECRET not set" or f"Got: {d}"
    else:
        return True  # Would need actual IGDB query
test("IGDB proxy (no key returns 503)", test_igdb_no_key)

def test_igdb_post_no_key():
    if not server.TWITCH_CLIENT_ID:
        d = post("/proxy/igdb/games", {}, expect_status=503)
        return d.get("error") == "TWITCH_CLIENT_ID/SECRET not set" or f"Got: {d}"
    else:
        return True
test("IGDB POST proxy (no key returns 503)", test_igdb_post_no_key)

# === Google Books ===
print("\n📚 Google Books:")
def test_gbooks():
    d = get("/proxy/gbooks/volumes?q=fantasy&maxResults=1")
    # Google may rate-limit us (429) - that's OK, our proxy is working
    if isinstance(d, dict) and d.get("status") == 429:
        return True  # Our proxy forwarded the request; Google rate-limited us
    return "items" in d or "totalItems" in d or f"Got: {d}"
test("Google Books proxy (may be rate-limited by Google)", test_gbooks)

# === Rate Limiting ===
print("\n⏱️ Rate Limiting:")
def test_rate_limit():
    old_max = server.RATE_MAX
    server.RATE_MAX = 3
    try:
        with server._rate_lock:
            server._rate_limits.clear()
        for i in range(4):
            try: get("/health")
            except: pass
        d = get("/health", expect_status=429)
        return d.get("error") == "Rate limit exceeded" or f"Got: {d}"
    finally:
        server.RATE_MAX = old_max
        with server._rate_lock:
            server._rate_limits.clear()
test("Rate limiting triggers at configured max", test_rate_limit)

# === Static File Content Checks ===
print("\n📄 Content Checks:")
def test_index_has_sw():
    url = f"http://127.0.0.1:{PORT}/"
    with urllib.request.urlopen(url, timeout=5) as r:
        html = r.read().decode()
        return "serviceWorker" in html or "Missing serviceWorker registration"
test("index.html has service worker registration", test_index_has_sw)

def test_index_has_module():
    url = f"http://127.0.0.1:{PORT}/"
    with urllib.request.urlopen(url, timeout=5) as r:
        html = r.read().decode()
        return 'type="module"' in html or "Missing type=module"
test("index.html has ES module import", test_index_has_module)

def test_index_has_noscript():
    url = f"http://127.0.0.1:{PORT}/"
    with urllib.request.urlopen(url, timeout=5) as r:
        html = r.read().decode()
        return "<noscript>" in html or "Missing noscript tag"
test("index.html has noscript fallback", test_index_has_noscript)

def test_manifest_has_icons():
    url = f"http://127.0.0.1:{PORT}/static/manifest.json"
    with urllib.request.urlopen(url, timeout=5) as r:
        data = json.loads(r.read())
        icons = data.get("icons", [])
        return len(icons) >= 2 or f"Only {len(icons)} icons"
test("manifest.json has icons", test_manifest_has_icons)

def test_sw_lists_all_modules():
    url = f"http://127.0.0.1:{PORT}/sw.js"
    with urllib.request.urlopen(url, timeout=5) as r:
        sw = r.read().decode()
        missing = []
        for f in js_files:
            if f"/js/{f}.js" not in sw:
                missing.append(f)
        return len(missing) == 0 or f"Missing from SW cache: {missing}"
test("sw.js caches all JS modules", test_sw_lists_all_modules)

# Shutdown & restore rate limit
httpd.shutdown()
server.RATE_MAX = _orig_rate_max

# Summary
print(f"\n{'='*50}")
total = ok_count + len(errors)
print(f"Results: {ok_count}/{total} passed, {len(errors)} failed")
if errors:
    print("\n❌ Failures:")
    for e in errors:
        print(f"  • {e}")
    sys.exit(1)
else:
    print("\n✅ All tests passed!")
    sys.exit(0)
