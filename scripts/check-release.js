'use strict';
// `npm run build` on Hostinger: no compile step is needed (index.html already contains the lessons),
// so this only confirms the public files exist and config.js holds no secret keys.
const fs = require('fs');
const path = require('path');
const root = path.join(__dirname, '..');
const files = ['server.js', 'index.html', 'config.js', 'auth.js', 'vendor/supabase-2.118.0.js', 'deploy/robots.txt', 'assets/HKW-Share-Card.png'];
let ok = true;
for (const f of files) {
  if (!fs.existsSync(path.join(root, f))) { console.error('missing ' + f); ok = false; }
}
const cfg = fs.readFileSync(path.join(root, 'config.js'), 'utf8');
const jwtRoles = (cfg.match(/eyJ[\w-]+\.([\w-]+)\.[\w-]+/g) || [])
  .map(t => { try { return JSON.parse(Buffer.from(t.split('.')[1], 'base64url').toString()).role; } catch { return ''; } });
if (/sb_secret_\w+/.test(cfg) || jwtRoles.includes('service_role')) { console.error('config.js contains a secret key; use only the publishable key'); ok = false; }
const html = fs.readFileSync(path.join(root, 'index.html'), 'utf8');
if (!html.includes('/*HKW-LESSONS-START*/') || !html.includes('<script src="config.js"></script>') || !html.includes('<script src="auth.js"></script>')) {
  console.error('index.html is missing the lessons block or the config.js tag'); ok = false;
}
if (!ok) process.exit(1);
console.log('release check passed: ' + files.join(', '));
