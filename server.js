'use strict';
/*
 * Her Kingdom Wealth™ production server for Hostinger Node.js hosting (app type "Other", entry file server.js).
 * CommonJS, no top-level await, built-in modules only, so Hostinger's loader can require() it.
 *
 * Serves ONLY the public files listed in ROUTES. Lesson sources, docs, emails and tests in the
 * repository are never reachable, because nothing outside ROUTES is served.
 *
 * Lessons: the lesson text in index.html (between HKW-CONTENT markers) is removed from the page this
 * server sends. Members fetch one lesson at a time from GET /api/lesson?key=seed-3 with their Supabase
 * access token; the server asks Supabase for her profile with that token (Row Level Security only
 * returns it to the signed-in member with two-step verification), then checks her plan.
 * No secret keys are needed on the server.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');
const vm = require('vm');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const CANONICAL_HOST = process.env.CANONICAL_HOST || ''; // e.g. herkingdomwealth.com; empty = no host redirect
const started = new Date().toISOString();

// URL path -> [file in repo, content type, cache policy]
const ROUTES = {
  '/': ['index.html', 'text/html; charset=utf-8', 'no-cache'],
  '/index.html': ['index.html', 'text/html; charset=utf-8', 'no-cache'],
  '/signup': ['index.html', 'text/html; charset=utf-8', 'no-cache'],   // opens the sign-up form
  '/login': ['index.html', 'text/html; charset=utf-8', 'no-cache'],    // opens sign-in
  '/signin': ['index.html', 'text/html; charset=utf-8', 'no-cache'],
  '/confirm': ['index.html', 'text/html; charset=utf-8', 'no-cache'],  // email confirmation code
  '/config.js': ['config.js', 'application/javascript; charset=utf-8', 'no-cache'],
  '/auth.js': ['auth.js', 'application/javascript; charset=utf-8', 'no-cache'],
  '/vendor/supabase-2.118.0.js': ['vendor/supabase-2.118.0.js', 'application/javascript; charset=utf-8', 'public, max-age=31536000, immutable'],
  '/robots.txt': ['deploy/robots.txt', 'text/plain; charset=utf-8', 'public, max-age=3600'],
  '/assets/HKW-Share-Card.png': ['assets/HKW-Share-Card.png', 'image/png', 'public, max-age=2592000'],
};

// Optional: override config.js from hPanel environment variables (no rebuild needed to change them).
function configOverride() {
  const url = process.env.HKW_SUPABASE_URL, key = process.env.HKW_SUPABASE_PUBLISHABLE_KEY;
  if (!url || !key) return null;
  if (/^sb_secret_/.test(key) || /"role":"service_role"/.test((() => { try { return Buffer.from(key.split('.')[1] || '', 'base64url').toString(); } catch { return ''; } })())) {
    console.error('HKW_SUPABASE_PUBLISHABLE_KEY looks like a secret key; refusing to serve it. Using config.js instead.');
    return null;
  }
  const hosts = (process.env.HKW_ALLOWED_HOSTS || 'herkingdomwealth.com,www.herkingdomwealth.com,beta.herkingdomwealth.com')
    .split(',').map(s => s.trim()).filter(Boolean);
  const cfg = { supabaseUrl: url, supabaseKey: key, hosts, source: process.env.HKW_SOURCE || 'app',
    previewTools: process.env.HKW_PREVIEW_TOOLS === 'true' };
  return { cfg, body: '/* generated from environment by server.js */\nwindow.HKW_CONFIG = ' + JSON.stringify(cfg, null, 2) + ';\n' };
}

/* ---------- Lessons: split the lesson text out of index.html ---------- */
const CONTENT_RE = /\/\*HKW-CONTENT-START\*\/[\s\S]*?\/\*HKW-CONTENT-END\*\//g;
const LESSON_KEY = /^(seed|sower|steward|kingdom)-\d$/;
const FREE_LESSONS = new Set(['seed-0', 'seed-1', 'seed-2']);  // same rule as the app: first three Seed lessons
let LESSONS = {};
function splitLessons(html) {
  const blocks = html.match(CONTENT_RE) || [];
  const code = blocks.map(b => b.slice('/*HKW-CONTENT-START*/'.length, -'/*HKW-CONTENT-END*/'.length)).join(';\n');
  try {
    LESSONS = vm.runInNewContext('const LESSONS = {};\n' + code + ';\nJSON.parse(JSON.stringify(LESSONS))', {}, { timeout: 2000 });
  } catch (e) {
    console.error('Could not read lessons from index.html: ' + e.message);
    LESSONS = {};
  }
  return html.replace(CONTENT_RE, '/* lessons load after sign-in */');
}

// Load files once at startup (the whole public site is ~5 MB) and pre-compress text.
const cache = {};
const override = configOverride();

// Cache-busting: the page asks for config.js and auth.js with a fingerprint of their contents
// (e.g. auth.js?v=1a2b3c4d5e), so browsers and any CDN in front of Hostinger always load the newest
// version after a deploy. /api/health reports the same build fingerprint.
const sha = b => crypto.createHash('sha256').update(b).digest('hex').slice(0, 10);
const readOr = f => { try { return fs.readFileSync(path.join(ROOT, f)); } catch { return Buffer.from(''); } };
const FINGERPRINT = { 'config.js': sha(override ? override.body : readOr('config.js')), 'auth.js': sha(readOr('auth.js')) };
const BUILD = sha(Buffer.concat([readOr('index.html'), readOr('auth.js'), readOr('server.js'), Buffer.from(FINGERPRINT['config.js'])]));
function versionScripts(html) {
  return html.replace(/<script src="(config\.js|auth\.js)"><\/script>/g, (m, f) => '<script src="' + f + '?v=' + FINGERPRINT[f] + '"></script>');
}
let publicIndex = null;
for (const [route, [file, type, cacheControl]] of Object.entries(ROUTES)) {
  let body;
  try {
    if (route === '/config.js' && override) body = Buffer.from(override.body);
    else if (file === 'index.html') body = publicIndex || (publicIndex = Buffer.from(versionScripts(splitLessons(fs.readFileSync(path.join(ROOT, file), 'utf8')))));
    else body = fs.readFileSync(path.join(ROOT, file));
  } catch (e) {
    console.error('Missing public file ' + file + ': ' + e.message);
    continue;
  }
  const text = /^(text|application\/javascript)/.test(type);
  cache[route] = {
    body, type, cacheControl,
    gzip: text ? zlib.gzipSync(body, { level: 9 }) : null,
    etag: '"' + crypto.createHash('sha1').update(body).digest('base64url').slice(0, 27) + '"',
  };
}

// Supabase settings from the environment override or config.js (evaluated in a sandbox).
function readConfig() {
  if (override) return override.cfg;
  try {
    const sandbox = { window: {} };
    vm.runInNewContext(cache['/config.js'].body.toString(), sandbox, { timeout: 500 });
    return sandbox.window.HKW_CONFIG || {};
  } catch { return {}; }
}
const CONFIG = readConfig();
function supabaseOrigin() {
  try { return CONFIG.supabaseUrl ? new URL(CONFIG.supabaseUrl).origin : ''; } catch { return ''; }
}
// Where the server checks members (tests point this at a local mock).
const SUPABASE_SERVER_URL = (process.env.HKW_SUPABASE_SERVER_URL || CONFIG.supabaseUrl || '').replace(/\/$/, '');
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob: https:",
  ("connect-src 'self' " + supabaseOrigin()).trim(),
  "object-src 'none'",
  "frame-ancestors 'none'",
  "base-uri 'self'",
  "form-action 'self'",
].join('; ');

const SECURITY_HEADERS = {
  'Content-Security-Policy': CSP,
  'X-Content-Type-Options': 'nosniff',
  'X-Frame-Options': 'DENY',
  'Referrer-Policy': 'strict-origin-when-cross-origin',
  'Permissions-Policy': 'camera=(), microphone=(), geolocation=(), payment=()',
  'Cross-Origin-Opener-Policy': 'same-origin',
  'X-Permitted-Cross-Domain-Policies': 'none',
};

function send(res, status, headers, body, method) {
  res.writeHead(status, Object.assign({}, SECURITY_HEADERS, headers));
  res.end(method === 'HEAD' ? undefined : body);
}

/* ---------- GET /api/lesson?key=... ---------- */
const memberCache = new Map();   // token hash -> { profile, until }
const hits = new Map();          // client ip -> { n, reset }
function json(res, status, obj) {
  return send(res, status, { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'private, no-store' }, JSON.stringify(obj), 'GET');
}
function rateLimited(ip) {
  const now = Date.now(), h = hits.get(ip);
  if (!h || h.reset < now) { hits.set(ip, { n: 1, reset: now + 60000 }); if (hits.size > 5000) hits.clear(); return false; }
  return ++h.n > 120;
}
async function memberProfile(token) {
  const id = crypto.createHash('sha256').update(token).digest('base64url');
  const hit = memberCache.get(id);
  if (hit && hit.until > Date.now()) return hit.profile;
  const r = await fetch(SUPABASE_SERVER_URL + '/rest/v1/profiles?select=plan,plan_expires_at', {
    headers: { apikey: CONFIG.supabaseKey, Authorization: 'Bearer ' + token, Accept: 'application/json' },
    signal: AbortSignal.timeout(6000),
  });
  if (r.status === 401 || r.status === 403) return null;
  if (!r.ok) throw new Error('Supabase returned ' + r.status);
  const rows = await r.json();
  // Row Level Security returns her own row only when she is signed in with two-step verification.
  const profile = Array.isArray(rows) && rows.length === 1 ? rows[0] : null;
  if (memberCache.size > 2000) memberCache.clear();
  memberCache.set(id, { profile, until: Date.now() + 60000 });
  return profile;
}
async function lessonApi(req, res, url) {
  const ip = String(req.headers['x-forwarded-for'] || req.socket.remoteAddress || '').split(',')[0].trim();
  if (rateLimited(ip)) return json(res, 429, { error: 'rate_limited' });
  const key = url.searchParams.get('key') || '';
  if (!LESSON_KEY.test(key) || !LESSONS[key]) return json(res, 404, { error: 'not_found' });
  const m = /^Bearer ([\w.-]{20,4096})$/.exec(String(req.headers.authorization || ''));
  if (!m) return json(res, 401, { error: 'sign_in_required' });
  if (!SUPABASE_SERVER_URL || !CONFIG.supabaseKey) return json(res, 503, { error: 'not_configured' });
  let profile;
  try { profile = await memberProfile(m[1]); } catch (e) { console.error('lesson check failed: ' + e.message); return json(res, 503, { error: 'unavailable' }); }
  if (!profile) return json(res, 401, { error: 'sign_in_required' });
  const active = !profile.plan_expires_at || new Date(profile.plan_expires_at) > new Date();
  const premium = active && profile.plan && profile.plan !== 'complimentary';
  if (!FREE_LESSONS.has(key) && !premium) return json(res, 403, { error: 'premium_required' });
  return json(res, 200, { key, lesson: LESSONS[key] });
}

const server = http.createServer((req, res) => {
  try {
    const method = req.method || 'GET';
    const host = String(req.headers['x-forwarded-host'] || req.headers.host || '').split(',')[0].trim().toLowerCase();
    const proto = String(req.headers['x-forwarded-proto'] || '').split(',')[0].trim();
    const url = new URL(req.url || '/', 'http://localhost');
    const local = /^(localhost|127\.0\.0\.1|\[::1\])(:\d+)?$/.test(host);

    if (url.pathname === '/api/health') {
      return send(res, 200, { 'Content-Type': 'application/json', 'Cache-Control': 'no-store' }, JSON.stringify({
        ok: Object.keys(cache).length === Object.keys(ROUTES).length,
        time: new Date().toISOString(),
        started,
        worker: null,
        config: override ? 'environment' : 'config.js',
        lessons: Object.keys(LESSONS).length,
        build: BUILD,
        missing: [...new Set(Object.entries(ROUTES).filter(([k]) => !cache[k]).map(([, v]) => v[0]))],
      }), method);
    }

    // HTTPS + canonical host (Hostinger terminates TLS in front of the app and sets X-Forwarded-Proto).
    if (!/^[a-z0-9.-]{1,253}(:\d{1,5})?$|^\[::1\](:\d{1,5})?$/.test(host)) {
      return send(res, 400, { 'Content-Type': 'text/plain' }, 'Bad request', method);
    }
    if (!local) {
      const wantHost = CANONICAL_HOST && host !== CANONICAL_HOST && host === 'www.' + CANONICAL_HOST ? CANONICAL_HOST : host;
      if (proto === 'http' || wantHost !== host) {
        return send(res, 301, { Location: 'https://' + wantHost + url.pathname + url.search }, '', method);
      }
    }

    if (url.pathname === '/api/lesson') {
      if (method !== 'GET') return send(res, 405, { Allow: 'GET', 'Content-Type': 'text/plain' }, 'Method not allowed', method);
      lessonApi(req, res, url).catch(e => { console.error(e); if (!res.headersSent) json(res, 500, { error: 'server_error' }); });
      return;
    }

    if (method !== 'GET' && method !== 'HEAD') {
      return send(res, 405, { Allow: 'GET, HEAD', 'Content-Type': 'text/plain' }, 'Method not allowed', method);
    }

    const f = cache[url.pathname];
    if (!f) return send(res, 404, { 'Content-Type': 'text/plain; charset=utf-8', 'Cache-Control': 'no-cache' }, 'Not found', method);

    const headers = {
      'Content-Type': f.type,
      'Cache-Control': f.cacheControl,
      ETag: f.etag,
      Vary: 'Accept-Encoding',
    };
    if (proto === 'https') headers['Strict-Transport-Security'] = 'max-age=31536000';
    if (req.headers['if-none-match'] === f.etag) return send(res, 304, headers, '', 'HEAD');
    const gz = f.gzip && /\bgzip\b/.test(String(req.headers['accept-encoding'] || ''));
    if (gz) headers['Content-Encoding'] = 'gzip';
    const body = gz ? f.gzip : f.body;
    headers['Content-Length'] = body.length;
    return send(res, 200, headers, body, method);
  } catch (e) {
    console.error(e);
    if (!res.headersSent) send(res, 500, { 'Content-Type': 'text/plain' }, 'Server error', req.method);
    else res.end();
  }
});

server.listen(PORT, () => {
  console.log('Her Kingdom Wealth listening on port ' + PORT + ' (config from ' + (override ? 'environment' : 'config.js') + ')');
});

module.exports = server;
