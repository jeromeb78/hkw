// End-to-end sign-in test: real server.js, real supabase-js, mocked Supabase API.
// Serves the app as https://herkingdomwealth.com so auth.js activates (see config.js hosts).
// Covers: beta-gate rejection, sign-up → email code → two-step enrollment → onboarding saves,
// returning member sign-in → two-step code → saved progress reloads, sign-out.
const { chromium } = require('playwright');
const { spawn } = require('child_process');
const path = require('path');

const PORT = 3177;
const SB = 'https://ifysjtiphdvamocosngp.supabase.co';
const SITE = 'https://herkingdomwealth.com';
const b64 = o => Buffer.from(JSON.stringify(o)).toString('base64url');
const jwt = (uid, aal, nonce) => b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: uid, aal, nonce, role: 'authenticated', email: 'grace@example.com',
  exp: Math.floor(Date.now() / 1000) + 3600, session_id: 's1', amr: [{ method: 'password', timestamp: 1 }] }) + '.sig';

function mockSupabase(db) {
  const uid = '11111111-1111-4111-8111-111111111111';
  const user = () => ({ id: uid, aud: 'authenticated', role: 'authenticated', email: 'grace@example.com', email_confirmed_at: new Date().toISOString(),
    app_metadata: {}, user_metadata: {}, created_at: new Date().toISOString(),
    factors: db.factor ? [{ id: 'f1', factor_type: 'totp', status: db.factor, friendly_name: 'Authenticator app', created_at: '', updated_at: '' }] : [] });
  const session = aal => ({ access_token: jwt(uid, aal), refresh_token: 'r', token_type: 'bearer', expires_in: 3600,
    expires_at: Math.floor(Date.now() / 1000) + 3600, user: user() });
  return async route => {
    const req = route.request(), url = new URL(req.url()), m = req.method(), p = url.pathname;
    const cors = { 'access-control-allow-origin': SITE, 'access-control-allow-headers': '*', 'access-control-allow-methods': '*',
      'access-control-expose-headers': '*', 'content-type': 'application/json' };
    const send = (status, body) => route.fulfill({ status, headers: cors, body: body === undefined ? '' : JSON.stringify(body) });
    if (m === 'OPTIONS') return send(200);
    const body = req.postData() ? JSON.parse(req.postData()) : null;
    db.log.push(m + ' ' + p + url.search + (body ? ' ' + JSON.stringify(body) : ''));
    if (p === '/auth/v1/signup') {
      if (body.email === 'slow@example.com') { await new Promise(r => setTimeout(r, 1500)); return send(504, {}); }
      if (body.email === 'blocked@example.com') return send(500, { code: 500, error_code: 'unexpected_failure', msg: 'Database error saving new user' });
      db.signupMeta = body.data; return send(200, { ...user(), confirmation_sent_at: new Date().toISOString() });
    }
    if (p === '/auth/v1/recover') return send(200, {});
    if (p === '/auth/v1/verify' && body.type === 'recovery') return body.token === '22222222' ? send(200, session('aal1')) : send(403, { msg: 'Token has expired or is invalid' });
    if (p === '/auth/v1/verify') return body.token === '12345678' ? send(200, session('aal1')) : send(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
    if (p === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      return body.password === 'correct horse battery' ? send(200, session('aal1')) : send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (p === '/auth/v1/user' && m === 'GET') return send(200, user());
    if (p === '/auth/v1/token' && url.searchParams.get('grant_type') === 'refresh_token') return send(200, session(db.factor === 'verified' ? 'aal2' : 'aal1'));
    if (p === '/auth/v1/user' && m === 'PUT') { db.newPassword = body.password; return send(200, user()); }
    if (p === '/auth/v1/factors' && m === 'POST') {
      db.factor = 'unverified';
      return send(200, { id: 'f1', type: 'totp', friendly_name: 'Authenticator app',
        totp: { qr_code: 'data:image/svg+xml;utf-8,<svg xmlns="http://www.w3.org/2000/svg" width="10" height="10"/>', secret: 'JBSWY3DPEHPK3PXP', uri: 'otpauth://x' } });
    }
    if (/^\/auth\/v1\/factors\/f1$/.test(p) && m === 'DELETE') { db.factor = null; return send(200, { id: 'f1' }); }
    if (/\/challenge$/.test(p)) return send(200, { id: 'c1', type: 'totp', expires_at: Math.floor(Date.now() / 1000) + 300 });
    if (/\/factors\/f1\/verify$/.test(p)) {
      if (body.code !== '654321') return send(422, { code: 422, error_code: 'mfa_verification_failed', msg: 'Invalid TOTP code entered' });
      db.factor = 'verified'; return send(200, session('aal2'));
    }
    if (p === '/auth/v1/logout') return send(204);
    if (p === '/rest/v1/profiles' && m === 'GET') return send(200, [db.profile]);
    if (p === '/rest/v1/profiles' && m === 'PATCH') { Object.assign(db.profile, body); return send(204); }
    if (p === '/rest/v1/lesson_progress' && m === 'GET') return send(200, db.lessons.map(k => ({ lesson_key: k })));
    if (p === '/rest/v1/lesson_progress' && m === 'POST') { body.forEach(r => db.lessons.includes(r.lesson_key) || db.lessons.push(r.lesson_key)); return send(201); }
    if (p === '/rest/v1/member_state' && m === 'GET') return send(200, db.state ? [{ state: db.state }] : []);
    if (p === '/rest/v1/member_state' && m === 'POST') { db.state = body.state; return send(201); }
    if (p === '/rest/v1/beta_signups') return send(201);
    if (p === '/rest/v1/rpc/delete_my_account') { db.deleted = true; return send(204); }
    return send(404, { msg: 'unmocked ' + m + ' ' + p });
  };
}

async function page(browser, db, errs) {
  const ctx = await browser.newContext({ viewport: { width: 390, height: 844 } });
  const pg = await ctx.newPage();
  pg.on('pageerror', e => errs.push('pageerror: ' + e.message));
  pg.on('console', msg => { if (/Content Security Policy|Refused/.test(msg.text())) errs.push(msg.text()); });
  await pg.route(SITE + '/**', async r => {
    const u = new URL(r.request().url());
    const resp = await r.fetch({ url: 'http://127.0.0.1:' + PORT + u.pathname + u.search,
      headers: { ...r.request().headers(), 'x-forwarded-proto': 'https', host: 'herkingdomwealth.com' } });
    r.fulfill({ response: resp });
  });
  await pg.route(SB + '/**', mockSupabase(db));
  await pg.route(/fonts\.(googleapis|gstatic)\.com/, r => r.fulfill({ status: 200, body: '' }));
  return pg;
}

async function signIn(pg) {
  await pg.fill('#email', 'grace@example.com'); await pg.fill('#password', 'correct horse battery');
  await pg.click('#auth-signin [type=submit]');
  await until(pg, () => /Enter Your Code/.test(document.querySelector('h1').textContent));
  await pg.fill('#code', '654321'); await pg.click('#auth-mfa [type=submit]');
}
const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const h1 = pg => pg.$eval('h1', e => e.textContent.trim());
const until = (pg, fn, arg) => pg.waitForFunction(fn, arg, { timeout: 8000 });

(async () => {
  const db = { log: [], factor: null, lessons: [], state: null,
    profile: { id: 'u', email: 'grace@example.com', first_name: 'Grace', last_name: 'Hope', phone: '2145550123', country: 'United States',
      tier: null, plan: 'sisters_keeper', plan_expires_at: new Date(Date.now() + 864e5 * 365).toISOString(), email_consent: true, sms_consent: false } };
  // Stand-in for Supabase as seen by server.js when it checks a member before sending a lesson:
  // RLS returns her profile only for a valid aal2 token.
  const http = require('http');
  const sbMock = http.createServer((q, r) => {
    const t = /^Bearer (.+)$/.exec(q.headers.authorization || ''); let claims = null;
    try { claims = t && JSON.parse(Buffer.from(t[1].split('.')[1], 'base64url').toString()); } catch (e) {}
    if (!q.url.startsWith('/rest/v1/profiles') || !claims) { r.writeHead(401); return r.end('{}'); }
    r.writeHead(200, { 'content-type': 'application/json' });
    const ok = claims.aal === 'aal2' || db.factor !== 'verified';  // RLS: aal2 needed only when two-step is on
    r.end(JSON.stringify(ok ? [{ plan: db.profile.plan, plan_expires_at: db.profile.plan_expires_at }] : []));
  }).listen(PORT + 1);
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')],
    { env: { ...process.env, PORT: String(PORT), HKW_SUPABASE_SERVER_URL: 'http://127.0.0.1:' + (PORT + 1) }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 900));
  const browser = await chromium.launch();
  const errs = [];
  try {
    /* --- Lessons are not in the public page, and the lesson API enforces sign-in and plan --- */
    const base = 'http://127.0.0.1:' + PORT, uid = '11111111-1111-4111-8111-111111111111';
    const pageHtml = await (await fetch(base + '/')).text();
    assert(!/Owner or steward|Firstfruits means|vesting schedule/.test(pageHtml) && pageHtml.includes('lessons load after sign-in'), 'live page contains no lesson text');
    const api = async (key, tok) => (await fetch(base + '/api/lesson?key=' + key, tok ? { headers: { Authorization: 'Bearer ' + tok } } : {})).status;
    assert(await api('seed-1') === 401, 'lesson API refuses visitors who are not signed in');
    db.factor = 'verified';
    assert(await api('seed-1', jwt(uid, 'aal1', 1)) === 401, 'lesson API refuses a password-only session when two-step is on');
    db.factor = null;
    assert(await api('seed-1', jwt(uid, 'aal1', 11)) === 200, 'lesson API accepts a password session when two-step is off');
    assert(await api('seed-1', 'not-a-real-token-at-all-xxxxxxxx') === 401, 'lesson API refuses a forged token');
    db.profile.plan = 'complimentary';
    assert(await api('seed-1', jwt(uid, 'aal2', 2)) === 200, 'complimentary member can open the free Seed lessons');
    assert(await api('steward-3', jwt(uid, 'aal2', 3)) === 403, 'complimentary member cannot download Premium lessons');
    db.profile.plan = 'sisters_keeper';
    assert(await api('steward-3', jwt(uid, 'aal2', 4)) === 200, 'Premium member can open Premium lessons');
    db.profile.plan_expires_at = new Date(Date.now() - 864e5).toISOString();
    assert(await api('steward-3', jwt(uid, 'aal2', 5)) === 403, 'expired Premium cannot open Premium lessons');
    db.profile.plan_expires_at = new Date(Date.now() + 864e5 * 365).toISOString();


    /* --- Page addresses: /signup and /login open those screens, and the address bar follows the screen --- */
    let pg = await page(browser, db, errs);
    await pg.goto(SITE + '/signup');
    await until(pg, () => window.hkwAuth && /Begin Your Journey/.test(document.querySelector('h1').textContent));
    assert(true, '/signup opens the sign-up form');
    await pg.goto(SITE + '/login');
    await until(pg, () => /Sign In/.test(document.querySelector('h1').textContent));
    assert(true, '/login opens sign-in');
    await pg.click('[data-go="signup"]');
    await until(pg, () => location.pathname === '/signup');
    assert(true, 'address bar shows /signup on the sign-up form');
    await pg.goto(SITE + '/');
    await pg.click('[data-auth="signin"]');
    await until(pg, () => location.pathname === '/login');
    assert(true, 'address bar shows /login on sign-in');
    await pg.context().close();
    pg = await page(browser, db, errs);
    await pg.goto(SITE + '/confirm');
    await until(pg, () => /Confirm Your Email/.test(document.querySelector('h1').textContent) && !!document.querySelector('#email'));
    assert(true, '/confirm opens the confirmation page and asks for the email when opened directly');
    const html = await (await fetch('http://127.0.0.1:' + PORT + '/')).text();
    assert(/auth\.js\?v=[0-9a-f]{10}/.test(html) && /config\.js\?v=[0-9a-f]{10}/.test(html), 'live page loads scripts with a version fingerprint (no stale cache after deploys)');
    await pg.context().close();

    /* --- New member: gate, sign-up, email code, two-step enrollment, onboarding --- */
    pg = await page(browser, db, errs);
    await pg.goto(SITE + '/');
    assert(!(await pg.$('.demo-strip')), 'preview strip hidden on the live site');
    await pg.click('[data-explore="1"]');
    assert(/Sign In/.test(await h1(pg)), 'lessons require sign-in');
    await pg.click('[data-go="signup"]');
    const fill = async email => {
      await pg.fill('#fn', 'Grace'); await pg.fill('#ln', 'Hope'); await pg.fill('#em', email); await pg.fill('#ph', '2145550123');
      await pg.fill('#pc', 'MYSISTERSKEEPER'); await pg.fill('#pw', 'correct horse battery'); await pg.fill('#pw2', 'correct horse battery');
      await pg.check('#c-disc');
    };
    await fill('grace@strategyvii.xom'); await pg.click('#signup [type=submit]');
    assert(/Did you mean grace@strategyvii\.com\?/.test(await pg.textContent('#root')) && !db.log.some(l => /signup/.test(l)), 'email typo is caught before anything is sent');
    await pg.fill('#em', 'slow@example.com'); await pg.fill('#pw', 'correct horse battery'); await pg.fill('#pw2', 'correct horse battery');
    await pg.click('#signup [type=submit]');
    assert(/Creating your account/.test(await pg.textContent('#signup [type=submit]')), 'button shows progress while the account is created');
    await until(pg, () => !!document.querySelector('#signup-err'));
    assert(/couldn.t send your confirmation email/.test(await pg.textContent('#signup-err')), 'email-sending failure explains what happened, next to the button');
    await fill('blocked@example.com');
    await pg.fill('#pw2', 'mismatch'); await pg.click('#signup [type=submit]');
    assert(/do not match/.test(await pg.textContent('.err')), 'password mismatch caught before sending');
    await pg.fill('#pw', 'correct horse battery'); await pg.fill('#pw2', 'correct horse battery');
    await pg.click('#signup [type=submit]');
    await until(pg, () => /beta invitation list/.test(document.body.textContent));
    assert(true, 'beta gate rejection shows a friendly message');
    await pg.fill('#em', 'grace@example.com'); await pg.fill('#pw', 'correct horse battery'); await pg.fill('#pw2', 'correct horse battery');
    await pg.click('#signup [type=submit]');
    await until(pg, () => /Confirm Your Email/.test(document.querySelector('h1').textContent));
    assert(new URL(pg.url()).pathname === '/confirm' && !/6-digit/.test(await pg.textContent('#root')), 'confirmation page is at /confirm and does not say 6-digit');
    assert(db.signupMeta.invite_code === 'MYSISTERSKEEPER' && db.signupMeta.first_name === 'Grace' && !('safe' in db.signupMeta), 'sign-up sends profile details and invite code, not the safety answer');
    await pg.fill('#code', '000000'); await pg.click('#auth-verify [type=submit]');
    await until(pg, () => /incorrect or has expired/.test(document.body.textContent));
    assert(true, 'wrong email code is rejected');
    assert(true, '8-digit email codes are accepted (Supabase default on new projects)');
    await pg.fill('#code', '1234 5678'); await pg.click('#auth-verify [type=submit]');
    await until(pg, () => window.hkwAuth.loaded && window.__hkw.S.view === 'welcome');
    assert(/Welcome Home/.test(await h1(pg)) && /MATTHEW 25:21/.test(await pg.textContent('#root')) && !db.log.some(l => /factors/.test(l)),
      'after confirming her email, the new member goes straight to the welcome page (two-step is optional)');
    assert(await pg.evaluate(() => window.__hkw.S.plan === 'premium' && window.__hkw.S.msk), "My Sister's Keeper plan comes from the server");
    await pg.click('[data-go="why"]');
    await pg.click('[data-val="Peace of mind"]');
    await pg.evaluate(() => { const S = window.__hkw.S; S.tier = 'sower'; S.done['seed-0'] = true; S.safe = 'no'; S.safetyExit = true; window.__hkw.render(); });
    await until(pg, () => true);
    await pg.waitForTimeout(1800);
    assert(db.profile.tier === 'sower', 'tier saved to profiles');
    assert(db.lessons.includes('seed-0'), 'completed lesson saved to lesson_progress');
    assert(db.state && db.state.why.values.includes('Peace of mind') && db.state.calc, 'why card and calculators saved to member_state');
    assert(!JSON.stringify(db.state).includes('safetyExit') && !('safe' in db.state), 'safety answer and Safety Exit are never saved');
    await pg.evaluate(() => window.__hkw.go('app', { tab: 'me' }));
    assert(/Account settings/.test(await pg.textContent('#root')) && /Two-stepverificationOff/.test((await pg.textContent('#root')).replace(/\s+/g, '')), 'account settings show two-step verification as Off');
    await pg.click('[data-auth="mfa-on"]');
    await until(pg, () => /Turn On Two-Step Verification/.test(document.querySelector('h1').textContent));
    assert(await pg.$('img[alt^="QR code"]'), 'turning it on shows a QR code');
    await pg.fill('#code', '111111'); await pg.click('#auth-enroll [type=submit]');
    await until(pg, () => /didn.t work/.test(document.body.textContent));
    assert(true, 'wrong authenticator code is rejected');
    await pg.fill('#code', '654321'); await pg.click('#auth-enroll [type=submit]');
    await until(pg, () => window.__hkw.S.view === 'app' && window.__hkw.S.tab === 'me');
    assert(db.factor === 'verified' && /Two-stepverificationOn/.test((await pg.textContent('#root')).replace(/\s+/g, '')), 'member can turn on two-step verification in account settings');
    await pg.click('[data-auth="signout"]');
    await pg.waitForURL(SITE + '/');
    await pg.context().close();

    /* --- Returning member: password, two-step code, progress reloads --- */
    db.state.why.values = ['Legacy']; db.log.length = 0;
    pg = await page(browser, db, errs);
    await pg.goto(SITE + '/');
    await pg.click('[data-auth="signin"]');
    await pg.fill('#email', 'grace@example.com'); await pg.fill('#password', 'wrong password');
    await pg.click('#auth-signin [type=submit]');
    await until(pg, () => /don.t match/.test(document.body.textContent));
    assert(true, 'wrong password is rejected');
    await signIn(pg);
    assert(true, 'returning member is asked for a two-step code');
    await until(pg, () => window.hkwAuth.loaded && window.__hkw.S.view === 'welcome' && window.__hkw.S.welcomeBack);
    assert(/Welcome back, Grace/.test(await pg.textContent('#root')) && /Continue: Your investor profile/.test(await pg.textContent('#root')), 'sign-in opens the Welcome back page');
    await pg.click('[data-go="archetype"]');
    await until(pg, () => window.__hkw.S.view === 'archetype');
    let S = await pg.evaluate(() => { const S = window.__hkw.S; return { tier: S.tier, why: S.why.values, done: S.done }; });
    assert(S.tier === 'sower' && S.why[0] === 'Legacy' && S.done['seed-0'], 'saved progress reloads at sign-in');
    assert(true, 'member who skipped her investor profile resumes there');
    assert(!db.log.some(l => /^(PATCH|POST) \/rest/.test(l)), 'loading does not write anything back');
    await pg.click('[data-season="0"]'); await pg.click('[data-drop="1"]');
    await pg.waitForTimeout(1800);
    assert(db.profile.season && db.profile.risk_band, 'investor profile saved');
    await pg.context().close();

    /* --- Stopped before the placement quiz: resumes at the quiz --- */
    const tier = db.profile.tier; db.profile.tier = null;
    pg = await page(browser, db, errs);
    await pg.goto(SITE + '/'); await pg.click('[data-auth="signin"]'); await signIn(pg);
    await until(pg, () => window.hkwAuth.loaded && window.__hkw.S.view === 'welcome' && window.__hkw.S.welcomeBack);
    await pg.click('[data-go="quiz"]');
    await until(pg, () => window.__hkw.S.view === 'quiz');
    assert(true, 'member who chose her why but not the quiz resumes at the quiz');
    await pg.context().close();
    db.profile.tier = tier;

    /* --- Onboarding complete: straight to the dashboard (with a tampered saved row) --- */
    db.state.why.values = ['<img src=x onerror="window.pwned=1">', 'Legacy'];
    db.state.j = [['<script>', 5], ['Jan', 100], ['Feb', 'NaN']];
    db.state.calc = { compound: { p: '<b>', m: 300 } };
    pg = await page(browser, db, errs);
    pg.on('dialog', d => { errs.push('dialog opened'); d.dismiss(); });
    await pg.goto(SITE + '/'); await pg.click('[data-auth="signin"]'); await signIn(pg);
    await until(pg, () => window.hkwAuth.loaded && window.__hkw.S.view === 'welcome' && window.__hkw.S.welcomeBack);
    assert(/Continue to My Dashboard/.test(await pg.textContent('#root')) && /Lessons completed/.test(await pg.textContent('#root')), 'member who finished onboarding sees Welcome back with her progress');
    await pg.click('#root [data-jump="home"].btn');
    await until(pg, () => window.__hkw.S.view === 'app' && window.__hkw.S.tab === 'home');
    assert(true, 'Continue takes her to her dashboard');
    assert(new URL(pg.url()).pathname === '/', 'address bar returns to / once she is signed in');
    await pg.evaluate(() => window.__hkw.go('lesson', { lesson: [2, 3] }));
    await until(pg, () => document.querySelectorAll('section.card').length > 2);
    assert(await pg.evaluate(() => !!window.__hkw.LESSONS['steward-3']), 'Premium lesson loads from the server after sign-in');
    const T = await pg.evaluate(() => ({ j: window.__hkw.S.j, p: window.__hkw.calc.compound.p, pwned: !!window.pwned,
      img: !!document.querySelector('#root img[src="x"]') }));
    assert(JSON.stringify(T.j) === '[["Jan",100]]' && T.p !== '<b>', 'tampered saved data is rejected field by field');
    await pg.evaluate(() => window.__hkw.go('app', { tab: 'me' }));
    assert(!(await pg.evaluate(() => !!window.pwned || !!document.querySelector('#root img[src="x"]'))), 'saved text is never rendered as markup');
    await pg.evaluate(() => window.__hkw.go('admin'));
    assert(await pg.evaluate(() => window.__hkw.S.view === 'app'), 'preview Admin screen is blocked on the live site');
    await pg.evaluate(() => window.__hkw.go('app', { tab: 'me' }));
    await pg.click('[data-auth="delete"]');
    await pg.fill('#confirm', 'delete me'); await pg.click('#auth-delete [type=submit]');
    await until(pg, () => /Type DELETE/.test(document.body.textContent));
    assert(!db.deleted, 'account deletion needs the typed confirmation');
    await pg.fill('#confirm', 'DELETE'); await pg.click('#auth-delete [type=submit]');
    await pg.waitForURL(SITE + '/');
    assert(db.deleted, 'member can delete her account');
    await pg.context().close();

    /* --- Forgot password: email code, then two-step code, then the new password is saved --- */
    pg = await page(browser, db, errs);
    await pg.goto(SITE + '/');
    await pg.click('[data-auth="signin"]'); await pg.click('[data-auth="forgot"]');
    await pg.fill('#email', 'grace@example.com'); await pg.click('#auth-forgot [type=submit]');
    await until(pg, () => /Set a New Password/.test(document.querySelector('h1').textContent));
    await pg.fill('#code', '22222222'); await pg.fill('#password', 'a brand new passphrase'); await pg.fill('#password2', 'a brand new passphrase');
    await pg.click('#auth-reset [type=submit]');
    await until(pg, () => /Enter Your Code/.test(document.querySelector('h1').textContent));
    assert(!db.newPassword, 'new password waits until two-step verification');
    await pg.fill('#code', '654321'); await pg.click('#auth-mfa [type=submit]');
    await until(pg, () => window.hkwAuth.loaded);
    assert(db.newPassword === 'a brand new passphrase', 'password reset saves the new password after two-step verification');
    await pg.context().close();

    /* --- Invited from the dashboard: two-step code, then name and password, then the welcome page --- */
    db.profile.first_name = null; db.profile.tier = null; db.state = null; db.newPassword = null;
    pg = await page(browser, db, errs);
    const tok = jwt('11111111-1111-4111-8111-111111111111', 'aal1');
    await pg.goto(SITE + '/#access_token=' + tok + '&refresh_token=r&expires_in=3600&token_type=bearer&type=invite');
    await until(pg, () => /Enter Your Code/.test(document.querySelector('h1').textContent));
    await pg.fill('#code', '654321'); await pg.click('#auth-mfa [type=submit]');
    await until(pg, () => /Create Your Account/.test(document.querySelector('h1').textContent));
    await pg.fill('#password', 'invited passphrase!'); await pg.fill('#password2', 'invited passphrase!');
    await pg.click('#auth-newpass [type=submit]');
    await until(pg, () => /first name/.test(document.body.textContent));
    await pg.fill('#first_name', 'Ruth'); await pg.fill('#password', 'invited passphrase!'); await pg.fill('#password2', 'invited passphrase!');
    await pg.click('#auth-newpass [type=submit]');
    await until(pg, () => window.hkwAuth.loaded && window.__hkw.S.view === 'welcome');
    assert(db.newPassword === 'invited passphrase!' && db.profile.first_name === 'Ruth', 'invited member sets her name and password');
    assert(/Welcome, Ruth/.test(await pg.textContent('#root')), 'invited member then sees the welcome page with her name');
    await pg.evaluate(() => window.__hkw.go('app', { tab: 'me' }));
    await pg.click('[data-auth="mfa-off"]');
    await until(pg, () => /Turn Off Two-Step Verification/.test(document.querySelector('h1').textContent));
    await pg.click('#auth-mfaoff [type=submit]');
    await until(pg, () => window.__hkw.S.view === 'app' && window.__hkw.S.tab === 'me');
    assert(db.factor === null && /Two-stepverificationOff/.test((await pg.textContent('#root')).replace(/\s+/g, '')), 'member can turn off two-step verification');
    await pg.context().close();
    pg = await page(browser, db, errs);
    await pg.goto(SITE + '/login'); 
    await pg.fill('#email', 'grace@example.com'); await pg.fill('#password', 'correct horse battery');
    await pg.click('#auth-signin [type=submit]');
    await until(pg, () => window.hkwAuth.loaded && window.__hkw.S.view === 'welcome');
    assert(true, 'with two-step off, sign-in needs only email and password');
    assert(errs.length === 0, 'no script or CSP errors: ' + JSON.stringify(errs));
    console.log('auth flow: all checks passed');
  } catch (e) {
    console.error(e.message); console.error('request log:\n' + db.log.join('\n')); console.error('errors:', errs);
    process.exitCode = 1;
  } finally {
    await browser.close(); srv.kill(); sbMock.close();
  }
})();
