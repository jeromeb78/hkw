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
const jwt = (uid, aal) => b64({ alg: 'HS256', typ: 'JWT' }) + '.' + b64({ sub: uid, aal, role: 'authenticated', email: 'grace@example.com',
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
      if (body.email === 'blocked@example.com') return send(500, { code: 500, error_code: 'unexpected_failure', msg: 'Database error saving new user' });
      db.signupMeta = body.data; return send(200, { ...user(), confirmation_sent_at: new Date().toISOString() });
    }
    if (p === '/auth/v1/recover') return send(200, {});
    if (p === '/auth/v1/verify' && body.type === 'recovery') return body.token === '222222' ? send(200, session('aal1')) : send(403, { msg: 'Token has expired or is invalid' });
    if (p === '/auth/v1/verify') return body.token === '123456' ? send(200, session('aal1')) : send(403, { code: 403, error_code: 'otp_expired', msg: 'Token has expired or is invalid' });
    if (p === '/auth/v1/token' && url.searchParams.get('grant_type') === 'password') {
      return body.password === 'correct horse battery' ? send(200, session('aal1')) : send(400, { code: 400, error_code: 'invalid_credentials', msg: 'Invalid login credentials' });
    }
    if (p === '/auth/v1/user' && m === 'GET') return send(200, user());
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

const assert = (c, m) => { if (!c) throw new Error('ASSERT: ' + m); console.log('ok -', m); };
const h1 = pg => pg.$eval('h1', e => e.textContent.trim());
const until = (pg, fn, arg) => pg.waitForFunction(fn, arg, { timeout: 8000 });

(async () => {
  const srv = spawn(process.execPath, [path.join(__dirname, '..', 'server.js')], { env: { ...process.env, PORT: String(PORT) }, stdio: 'ignore' });
  await new Promise(r => setTimeout(r, 700));
  const browser = await chromium.launch();
  const errs = [];
  const db = { log: [], factor: null, lessons: [], state: null,
    profile: { id: 'u', email: 'grace@example.com', first_name: 'Grace', last_name: 'Hope', phone: '2145550123', country: 'United States',
      tier: null, plan: 'sisters_keeper', plan_expires_at: new Date(Date.now() + 864e5 * 365).toISOString(), email_consent: true, sms_consent: false } };
  try {
    /* --- New member: gate, sign-up, email code, two-step enrollment, onboarding --- */
    let pg = await page(browser, db, errs);
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
    await fill('blocked@example.com');
    await pg.fill('#pw2', 'mismatch'); await pg.click('#signup [type=submit]');
    assert(/do not match/.test(await pg.textContent('.err')), 'password mismatch caught before sending');
    await pg.fill('#pw', 'correct horse battery'); await pg.fill('#pw2', 'correct horse battery');
    await pg.click('#signup [type=submit]');
    await until(pg, () => /beta invitation list/.test(document.body.textContent));
    assert(true, 'beta gate rejection shows a friendly message');
    await pg.fill('#em', 'grace@example.com'); await pg.fill('#pw', 'correct horse battery'); await pg.fill('#pw2', 'correct horse battery');
    await pg.click('#signup [type=submit]');
    await until(pg, () => /Check Your Email/.test(document.querySelector('h1').textContent));
    assert(db.signupMeta.invite_code === 'MYSISTERSKEEPER' && db.signupMeta.first_name === 'Grace' && !('safe' in db.signupMeta), 'sign-up sends profile details and invite code, not the safety answer');
    await pg.fill('#code', '000000'); await pg.click('#auth-verify [type=submit]');
    await until(pg, () => /incorrect or has expired/.test(document.body.textContent));
    assert(true, 'wrong email code is rejected');
    await pg.fill('#code', '123456'); await pg.click('#auth-verify [type=submit]');
    await until(pg, () => /Protect Your Account/.test(document.querySelector('h1').textContent));
    assert(await pg.$('img[alt^="QR code"]'), 'two-step enrollment shows a QR code');
    await pg.fill('#code', '111111'); await pg.click('#auth-enroll [type=submit]');
    await until(pg, () => /didn.t work/.test(document.body.textContent));
    assert(true, 'wrong authenticator code is rejected');
    await pg.fill('#code', '654321'); await pg.click('#auth-enroll [type=submit]');
    await until(pg, () => window.hkwAuth.loaded && window.__hkw.S.view === 'why');
    assert(true, 'after two-step setup, the new member starts onboarding');
    assert(await pg.evaluate(() => window.__hkw.S.plan === 'premium' && window.__hkw.S.msk), "My Sister's Keeper plan comes from the server");
    await pg.click('[data-act="closecheer"]');
    await pg.click('[data-val="Peace of mind"]');
    await pg.evaluate(() => { const S = window.__hkw.S; S.tier = 'sower'; S.done['seed-0'] = true; S.safe = 'no'; S.safetyExit = true; window.__hkw.render(); });
    await until(pg, () => true);
    await pg.waitForTimeout(1800);
    assert(db.profile.tier === 'sower', 'tier saved to profiles');
    assert(db.lessons.includes('seed-0'), 'completed lesson saved to lesson_progress');
    assert(db.state && db.state.why.values.includes('Peace of mind') && db.state.calc, 'why card and calculators saved to member_state');
    assert(!JSON.stringify(db.state).includes('safetyExit') && !('safe' in db.state), 'safety answer and Safety Exit are never saved');
    await pg.evaluate(() => window.__hkw.go('app', { tab: 'me' }));
    assert(/Two-step verification/.test(await pg.textContent('#root')), 'account card shows two-step verification');
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
    await pg.fill('#email', 'grace@example.com'); await pg.fill('#password', 'correct horse battery');
    await pg.click('#auth-signin [type=submit]');
    await until(pg, () => /Enter Your Code/.test(document.querySelector('h1').textContent));
    assert(true, 'returning member is asked for a two-step code');
    await pg.fill('#code', '654321'); await pg.click('#auth-mfa [type=submit]');
    await until(pg, () => window.hkwAuth.loaded && window.__hkw.S.view === 'app');
    const S = await pg.evaluate(() => { const S = window.__hkw.S; return { tier: S.tier, why: S.why.values, done: S.done, tab: S.tab }; });
    assert(S.tier === 'sower' && S.why[0] === 'Legacy' && S.done['seed-0'] && S.tab === 'home', 'saved progress reloads at sign-in');
    assert(!db.log.some(l => /^(PATCH|POST) \/rest/.test(l)), 'loading does not write anything back');
    await pg.context().close();

    /* --- Forgot password: email code, then two-step code, then the new password is saved --- */
    pg = await page(browser, db, errs);
    await pg.goto(SITE + '/');
    await pg.click('[data-auth="signin"]'); await pg.click('[data-auth="forgot"]');
    await pg.fill('#email', 'grace@example.com'); await pg.click('#auth-forgot [type=submit]');
    await until(pg, () => /Set a New Password/.test(document.querySelector('h1').textContent));
    await pg.fill('#code', '222222'); await pg.fill('#password', 'a brand new passphrase'); await pg.fill('#password2', 'a brand new passphrase');
    await pg.click('#auth-reset [type=submit]');
    await until(pg, () => /Enter Your Code/.test(document.querySelector('h1').textContent));
    assert(!db.newPassword, 'new password waits until two-step verification');
    await pg.fill('#code', '654321'); await pg.click('#auth-mfa [type=submit]');
    await until(pg, () => window.hkwAuth.loaded);
    assert(db.newPassword === 'a brand new passphrase', 'password reset saves the new password after two-step verification');
    assert(errs.length === 0, 'no script or CSP errors: ' + JSON.stringify(errs));
    console.log('auth flow: all checks passed');
  } catch (e) {
    console.error(e.message); console.error('request log:\n' + db.log.join('\n')); console.error('errors:', errs);
    process.exitCode = 1;
  } finally {
    await browser.close(); srv.kill();
  }
})();
