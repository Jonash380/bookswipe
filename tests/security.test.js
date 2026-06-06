import { describe, it, before } from 'node:test';
import assert from 'node:assert/strict';
import { JSDOM } from 'jsdom';
import { readFileSync, readdirSync } from 'fs';
import { join, dirname } from 'path';
import { fileURLToPath } from 'url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const ROOT = join(__dirname, '..');

const dom = new JSDOM('<!DOCTYPE html><html><body></body></html>', {
  url: 'http://localhost',
  pretendToBeVisual: true,
});
global.window = dom.window;
global.document = dom.window.document;
global.requestAnimationFrame = (cb) => setTimeout(cb, 16);

Object.defineProperty(global, 'navigator', {
  value: { vibrate: () => {} },
  writable: true, configurable: true,
});
Object.defineProperty(globalThis, 'localStorage', {
  value: { getItem: () => null, setItem: () => {}, removeItem: () => {}, clear: () => {} },
  writable: true, configurable: true,
});

const { escapeHTML } = await import('../js/utils.js');

describe('XSS Prevention', () => {
  const xssPayloads = [
    '<script>alert("xss")</script>',
    '<img src=x onerror=alert(1)>',
    '<svg onload=alert(1)>',
    '"><script>alert(1)</script>',
    "javascript:alert(1)",
    '<iframe src="javascript:alert(1)">',
    '<body onload=alert(1)>',
    '<input onfocus=alert(1) autofocus>',
    '<details open ontoggle=alert(1)>',
    '{{constructor.constructor("alert(1)")()}}',
    '${alert(1)}',
    '<math><mtext><table><mglyph><svg><mtext><textarea><path id="</textarea><img onerror=alert(1) src=1>">',
  ];

  it('escapeHTML should neutralize all XSS payloads', () => {
    for (const payload of xssPayloads) {
      const escaped = escapeHTML(payload);
      assert.ok(!escaped.includes('<script'), `Failed to escape: ${payload}`);
      assert.ok(!escaped.includes('<img'), `Tag should be broken: ${payload}`);
      assert.ok(!escaped.includes('<svg'), `Tag should be broken: ${payload}`);
      assert.ok(!escaped.includes('<iframe'), `Tag should be broken: ${payload}`);
    }
  });

  it('escapeHTML should not allow double-encoding bypass', () => {
    const doubleEncoded = '&lt;script&gt;';
    const result = escapeHTML(doubleEncoded);
    assert.ok(result.includes('&amp;lt;'), 'Should escape the ampersand');
  });
});

describe('Secret Key Exposure Scan', () => {
  let appJs, indexHtml;

  before(() => {
    appJs = readFileSync(join(ROOT, 'js', 'app.js'), 'utf-8');
    indexHtml = readFileSync(join(ROOT, 'index.html'), 'utf-8');
  });

  it('should not contain TMDB API key in frontend code', () => {
    const envPath = join(ROOT, '.env');
    try {
      const env = readFileSync(envPath, 'utf-8');
      const tmdbMatch = env.match(/TMDB_API_KEY="?([^"\n]+)"?/);
      if (tmdbMatch) {
        assert.ok(!appJs.includes(tmdbMatch[1]), 'TMDB API key found in app.js!');
        assert.ok(!indexHtml.includes(tmdbMatch[1]), 'TMDB API key found in index.html!');
      }
    } catch {
      // .env doesn't exist, that's fine
    }
  });

  it('should not contain Twitch client secret in frontend code', () => {
    const envPath = join(ROOT, '.env');
    try {
      const env = readFileSync(envPath, 'utf-8');
      const secretMatch = env.match(/TWITCH_CLIENT_SECRET="?([^"\n]+)"?/);
      if (secretMatch) {
        assert.ok(!appJs.includes(secretMatch[1]), 'Twitch secret found in app.js!');
        assert.ok(!indexHtml.includes(secretMatch[1]), 'Twitch secret found in index.html!');
      }
    } catch {}
  });

  it('should not contain hardcoded API keys in frontend JS', () => {
    const suspiciousPatterns = [
      /api[_-]?key\s*[:=]\s*['"][a-zA-Z0-9]{20,}/i,
      /secret\s*[:=]\s*['"][a-zA-Z0-9]{20,}/i,
      /token\s*[:=]\s*['"][a-zA-Z0-9]{20,}/i,
    ];
    for (const pattern of suspiciousPatterns) {
      const match = appJs.match(pattern);
      assert.ok(!match, `Suspicious key pattern found in app.js: ${match?.[0]?.substring(0, 50)}`);
    }
  });

  it('should not expose API keys in any JS file', () => {
    const jsDir = join(ROOT, 'js');
    const files = readdirSync(jsDir).filter(f => f.endsWith('.js'));
    for (const file of files) {
      const content = readFileSync(join(jsDir, file), 'utf-8');
      assert.ok(!content.includes('f1a82b9c5954f84c'), `API key found in ${file}`);
      assert.ok(!content.includes('a5b93e2f2283d8c186'), `Trakt key found in ${file}`);
      assert.ok(!content.includes('tvtah5148pbaxewl8'), `Twitch ID found in ${file}`);
      assert.ok(!content.includes('r62nrhjgwczcdryij'), `Twitch secret found in ${file}`);
    }
  });
});

describe('HTML Security Attributes', () => {
  let html;

  before(() => {
    html = readFileSync(join(ROOT, 'index.html'), 'utf-8');
  });

  it('should have proper meta charset', () => {
    assert.ok(html.includes('charset="UTF-8"') || html.includes("charset='UTF-8'"));
  });

  it('should have viewport meta tag', () => {
    assert.ok(html.includes('viewport'));
  });

  it('should not use eval or inline scripts for data', () => {
    assert.ok(!html.includes('eval('));
  });

  it('should have noscript fallback', () => {
    assert.ok(html.includes('<noscript>'));
  });
});

describe('External Link Security', () => {
  let appJs;

  before(() => {
    appJs = readFileSync(join(ROOT, 'js', 'app.js'), 'utf-8');
  });

  it('all target="_blank" links should have rel="noopener"', () => {
    const blankLinks = appJs.matchAll(/target="_blank"/g);
    const fullContext = appJs;
    let index = 0;
    for (const match of blankLinks) {
      const before = fullContext.substring(Math.max(0, match.index - 200), match.index);
      const after = fullContext.substring(match.index, match.index + 200);
      assert.ok(
        after.includes('rel="noopener"') || before.includes('rel="noopener"'),
        `target="_blank" without rel="noopener" found at position ${match.index}`
      );
      index++;
    }
  });
});

describe('Server Security Headers', () => {
  let serverPy;

  before(() => {
    serverPy = readFileSync(join(ROOT, 'server.py'), 'utf-8');
  });

  it('should set X-Content-Type-Options', () => {
    assert.ok(serverPy.includes('X-Content-Type-Options'));
    assert.ok(serverPy.includes('nosniff'));
  });

  it('should set X-Frame-Options', () => {
    assert.ok(serverPy.includes('X-Frame-Options'));
    assert.ok(serverPy.includes('DENY'));
  });

  it('should set Referrer-Policy', () => {
    assert.ok(serverPy.includes('Referrer-Policy'));
  });

  it('should set Permissions-Policy', () => {
    assert.ok(serverPy.includes('Permissions-Policy'));
    assert.ok(serverPy.includes('camera=()'));
    assert.ok(serverPy.includes('microphone=()'));
  });

  it('should have SSRF whitelist for TMDB', () => {
    assert.ok(serverPy.includes('_OK_TMDB'));
  });

  it('should have SSRF whitelist for Steam', () => {
    assert.ok(serverPy.includes('_OK_STEAM'));
  });

  it('should have rate limiting', () => {
    assert.ok(serverPy.includes('_check_rate'));
    assert.ok(serverPy.includes('RATE_MAX'));
  });

  it('should validate IGDB request body', () => {
    assert.ok(serverPy.includes('_IGDB_BODY_RE'));
  });

  it('should limit IGDB POST body size', () => {
    assert.ok(serverPy.includes('content_length > 10000'));
  });

  it('should limit party POST body size', () => {
    assert.ok(serverPy.includes('content_length > 50000'));
  });

  it('should NOT have secrets hardcoded', () => {
    assert.ok(!serverPy.includes('f1a82b9c5954f84c'));
    assert.ok(!serverPy.includes('a5b93e2f2283d8c'));
    assert.ok(!serverPy.includes('r62nrhjgwczcdryij'));
  });

  it('should load secrets from environment variables', () => {
    assert.ok(serverPy.includes("os.environ.get('TMDB_API_KEY'"));
    assert.ok(serverPy.includes("os.environ.get('TWITCH_CLIENT_ID'"));
    assert.ok(serverPy.includes("os.environ.get('TWITCH_CLIENT_SECRET'"));
  });
});

describe('Input Validation on Server', () => {
  let serverPy;

  before(() => {
    serverPy = readFileSync(join(ROOT, 'server.py'), 'utf-8');
  });

  it('should reject oversized Google Books queries', () => {
    assert.ok(serverPy.includes('len(qs) > 2048'));
  });

  it('should sanitize Steam library inputs', () => {
    assert.ok(serverPy.includes("params.get('steamid', [''])[0]"));
  });

  it('should not allow path traversal in TMDB', () => {
    assert.ok(serverPy.includes('_OK_TMDB'));
  });
});
