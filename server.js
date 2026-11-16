'use strict';
/*
 * Her Kingdom Wealth™ production server for Hostinger Node.js hosting (app type "Other", entry file server.js).
 * CommonJS, no top-level await, built-in modules only, so Hostinger's loader can require() it.
 *
 * Serves ONLY the public files listed in ROUTES. Lesson sources, docs, emails and tests in the
 * repository are never reachable, because nothing outside ROUTES is served.
 */
const http = require('http');
const fs = require('fs');
const path = require('path');
const zlib = require('zlib');
const crypto = require('crypto');

const ROOT = __dirname;
const PORT = Number(process.env.PORT) || 3000;
const CANONICAL_HOST = process.env.CANONICAL_HOST || ''; // e.g. herkingdomwealth.com; empty = no host redirect
const started = new Date().toISOString();

// URL path -> [file in repo, content type, cache policy]
const ROUTES = {
  '/': ['index.html', 'text/html; charset=utf-8', 'no-cache'],
  '/index.html': ['index.html', 'text/html; charset=utf-8', 'no-cache'],
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

// Load files once at startup (the whole public site is ~5 MB) and pre-compress text.
const cache = {};
const override = configOverride();
for (const [route, [file, type, cacheControl]] of Object.entries(ROUTES)) {
  let body;
  try {
    body = route === '/config.js' && override ? Buffer.from(override.body) : fs.readFileSync(path.join(ROOT, file));
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

// Supabase origin for the Content-Security-Policy connect-src.
function supabaseOrigin() {
  if (override) return new URL(override.cfg.supabaseUrl).origin;
  const m = cache['/config.js'] && cache['/config.js'].body.toString().match(/supabaseUrl:\s*"([^"]+)"/);
  try { return m ? new URL(m[1]).origin : ''; } catch { return ''; }
}
const CSP = [
  "default-src 'self'",
  "script-src 'self' 'unsafe-inline'",
  "style-src 'self' 'unsafe-inline' https://fonts.googleapis.com",
  'font-src https://fonts.gstatic.com',
  "img-src 'self' data: blob: https:",
  ("connect-src 'self' " + supabaseOrigin()).trim(),
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
};

function send(res, status, headers, body, method) {
  res.writeHead(status, Object.assign({}, SECURITY_HEADERS, headers));
  res.end(method === 'HEAD' ? undefined : body);
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
        missing: [...new Set(Object.entries(ROUTES).filter(([k]) => !cache[k]).map(([, v]) => v[0]))],
      }), method);
    }

    // HTTPS + canonical host (Hostinger terminates TLS in front of the app and sets X-Forwarded-Proto).
    if (!local) {
      const wantHost = CANONICAL_HOST && host !== CANONICAL_HOST && host === 'www.' + CANONICAL_HOST ? CANONICAL_HOST : host;
      if (proto === 'http' || wantHost !== host) {
        return send(res, 301, { Location: 'https://' + wantHost + url.pathname + url.search }, '', method);
      }
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
