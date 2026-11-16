/* Her Kingdom Wealth™ sign-in and saved progress (Supabase Auth).
 *
 * Loaded after the app script. It does nothing unless the page runs on a host listed in
 * config.js → hosts, so the claude.ai preview, local file:// runs and the jsdom tests are unchanged.
 *
 * Flow: email + password → email code (6–10 digits, as Supabase sends it) or the link → two-step verification with an
 * authenticator app (required) → the member's data loads, and every change saves automatically.
 *
 * Never stored or sent: the safety question answer, the Safety Exit setting, the credit letter text,
 * passwords (held in memory only until Supabase receives them).
 */
(function () {
  'use strict';
  var C = window.HKW_CONFIG || {};
  var on = !!(C.supabaseUrl && C.supabaseKey && Array.isArray(C.hosts) && C.hosts.indexOf(location.hostname) >= 0);
  var A = (window.hkwAuth = { on: on, previewTools: !!C.previewTools, loaded: false, user: null });
  var app = window.__hkw;
  if (!on || !app) return;

  var S = app.S;
  var esc = app.esc;
  var LIB = 'vendor/supabase-2.118.0.js';
  var PUBLIC = ['landing', 'signup', 'auth', 'help', 'exit'];
  var STEPS = ['loading', 'signin', 'verify', 'enroll', 'mfa', 'forgot', 'reset', 'newpass', 'delete', 'unavailable'];
  // Member choices saved in member_state.state (plus calculator inputs). Safety settings stay on the device.
  var STATE_KEYS = ['why', 'qa', 'placed', 'acts', 'j', 'jSample', 'lq', 'coach', 'acct', 'ms'];
  var LESSON_RE = /^(seed|sower|steward|kingdom)-\d$/;

  var st = (A.st = { step: 'signin', email: '', err: '', msg: '', factorId: null, qr: null, secret: null,
    recovery: false, newPw: null, pendingSignup: false,
    // Opened from a dashboard invitation email: she still needs a password and her name.
    invited: /type=invite/.test(location.hash) });
  var sb = null;

  /* ---------- "Keep me signed in": localStorage only when chosen, otherwise this tab only ---------- */
  function keep() { try { return localStorage.getItem('hkw-keep') === '1'; } catch (e) { return false; } }
  function setKeep(v) { try { v ? localStorage.setItem('hkw-keep', '1') : localStorage.removeItem('hkw-keep'); } catch (e) {} }
  var store = {
    getItem: function (k) { try { return localStorage.getItem(k) || sessionStorage.getItem(k); } catch (e) { return null; } },
    setItem: function (k, v) {
      try { (keep() ? localStorage : sessionStorage).setItem(k, v); (keep() ? sessionStorage : localStorage).removeItem(k); } catch (e) {}
    },
    removeItem: function (k) { try { localStorage.removeItem(k); sessionStorage.removeItem(k); } catch (e) {} },
  };

  /* ---------- Boot ---------- */
  function loadLib() {
    return new Promise(function (res, rej) {
      if (window.supabase && window.supabase.createClient) return res();
      var s = document.createElement('script');
      s.src = LIB; s.onload = function () { res(); }; s.onerror = function () { rej(new Error('Could not load ' + LIB)); };
      document.head.appendChild(s);
    });
  }
  var ready = loadLib().then(function () {
    sb = A.client = window.supabase.createClient(C.supabaseUrl, C.supabaseKey, {
      auth: { storage: store, storageKey: 'hkw-auth', persistSession: true, autoRefreshToken: true,
        detectSessionInUrl: true, flowType: 'implicit' },
    });
    sb.auth.onAuthStateChange(function (ev, session) {
      if (ev === 'PASSWORD_RECOVERY') st.recovery = true;
      if (['INITIAL_SESSION', 'SIGNED_IN', 'MFA_CHALLENGE_VERIFIED', 'PASSWORD_RECOVERY', 'SIGNED_OUT'].indexOf(ev) < 0) return;
      // Never await Supabase calls inside this callback; queue them instead.
      setTimeout(function () { queue(function () { return route(session); }); }, 0);
    });
  }).catch(function (e) {
    console.error(e);
    A.failed = true;
    if (S.view === 'auth') show('unavailable');
  });

  var chain = Promise.resolve();
  function queue(fn) {
    chain = chain.then(fn).catch(function (e) { console.error(e); st.err = friendly(e); show(A.user ? st.step : 'signin'); });
    return chain;
  }

  /* ---------- Routing after any auth change ---------- */
  function route(session) {
    A.user = session ? session.user : null;
    if (!session) { A.loaded = false; if (S.view === 'auth' && st.step === 'loading') show('signin'); return; }
    if (A.loaded && !st.recovery && !st.invited) return;
    return sb.auth.mfa.getAuthenticatorAssuranceLevel().then(function (r) {
      if (r.error) throw r.error;
      var aal = r.data;
      if (aal.currentLevel === 'aal2') {
        if (st.invited) return show('newpass');
        if (st.recovery) {
          if (!st.newPw) return show('newpass');
          return setPassword(st.newPw).then(function (ok) { if (ok) return A.loaded ? null : load(); });
        }
        return A.loaded ? null : load();
      }
      if (aal.nextLevel === 'aal2') {  // has a verified authenticator: ask for a code
        return sb.auth.mfa.listFactors().then(function (f) {
          if (f.error) throw f.error;
          var v = (f.data.totp || []).filter(function (x) { return x.status === 'verified'; })[0];
          st.factorId = v.id; st.err = st.err || ''; show('mfa');
        });
      }
      if (st.step === 'enroll' && st.factorId) return show('enroll');
      return startEnroll();
    });
  }

  function startEnroll() {
    return sb.auth.mfa.listFactors().then(function (f) {
      if (f.error) throw f.error;
      // Clear unfinished enrollments so a new QR code can be issued.
      var stale = (f.data.all || []).filter(function (x) { return x.factor_type === 'totp' && x.status !== 'verified'; });
      return Promise.all(stale.map(function (x) { return sb.auth.mfa.unenroll({ factorId: x.id }); }));
    }).then(function () {
      return sb.auth.mfa.enroll({ factorType: 'totp', friendlyName: 'Authenticator app', issuer: 'Her Kingdom Wealth' });
    }).then(function (r) {
      if (r.error) throw r.error;
      st.factorId = r.data.id; st.qr = r.data.totp.qr_code; st.secret = r.data.totp.secret;
      show('enroll');
    });
  }

  /* ---------- Load and apply the member's saved data ---------- */
  function load() {
    show('loading');
    var uid = A.user.id;
    return Promise.all([
      sb.from('profiles').select('*').eq('id', uid).maybeSingle(),
      sb.from('lesson_progress').select('lesson_key'),
      sb.from('member_state').select('state').eq('user_id', uid).maybeSingle(),
    ]).then(function (r) {
      var bad = r.filter(function (x) { return x.error; })[0];
      if (bad) throw bad.error;
      var p = r[0].data || {}, state = r[2].data && r[2].data.state;
      apply(p, r[1].data || [], state);
      A.loaded = true; A.lastSaved = snapshot(); st.err = ''; st.msg = '';
      var fresh = st.pendingSignup || (!p.tier && !state);
      var whyDone = state && state.why && state.why.values && state.why.values.length;
      st.pendingSignup = false;
      app.H.length = 0;
      // New members see the welcome page; anyone who stopped partway resumes where she left off.
      if (fresh) app.go('welcome');
      else if (!p.tier) { S.qi = 0; S.qa = []; app.go(whyDone ? 'quiz' : 'why'); }
      else if (!S.season || !S.band) app.go('archetype');
      else app.go('app', { tab: 'home' });
    });
  }

  function applyPlan(plan, expires) {
    var active = !expires || new Date(expires) > new Date();
    plan = active ? plan || 'complimentary' : 'complimentary';
    S.msk = plan === 'sisters_keeper';
    S.plan = plan === 'sisters_keeper' ? 'premium' : plan;
  }

  function apply(p, lessons, state) {
    var f = S.f;
    f.fn = p.first_name || ''; f.ln = p.last_name || ''; f.em = p.email || A.user.email || '';
    f.ph = p.phone || ''; f.country = p.country || 'United States';
    f.cem = !!p.email_consent; f.csms = !!p.sms_consent; f.cdisc = true; f.pw = f.pw2 = '';
    S.name = (f.fn + ' ' + f.ln).trim(); S.email = f.em; S.phone = f.ph;
    if (p.tier) S.tier = p.tier;
    if (p.season) S.season = p.season;
    if (p.risk_band) S.band = p.risk_band;
    S.discreet = !!p.discreet_notifications; S.paused = !!p.messages_paused;
    applyPlan(p.plan, p.plan_expires_at);
    S.done = {};
    lessons.forEach(function (x) { S.done[x.lesson_key] = true; });
    if (state) {
      var clean = sanitize(state);
      Object.keys(clean).forEach(function (k) { if (k !== 'calc') S[k] = clean[k]; });
      if (clean.calc) Object.keys(clean.calc).forEach(function (t) { if (app.calc[t]) Object.assign(app.calc[t], clean.calc[t]); });
    }
  }

  /* Saved data is checked field by field before the app uses it: only the expected types and sizes
     are accepted, so a tampered or corrupted row can't inject markup or break a screen. */
  var MONTHS = ['Jan', 'Feb', 'Mar', 'Apr', 'May', 'Jun', 'Jul', 'Aug', 'Sep', 'Oct', 'Nov', 'Dec'];
  function str(v, max) { return typeof v === 'string' ? v.slice(0, max) : ''; }
  function num(v) { return typeof v === 'number' && isFinite(v) ? v : null; }
  function bools(o) { var r = {}; if (o && typeof o === 'object') Object.keys(o).slice(0, 200).forEach(function (k) { if (/^[\w-]{1,40}$/.test(k) && typeof o[k] === 'boolean') r[k] = o[k]; }); return r; }
  function sanitize(st0) {
    var o = {};
    if (st0.why && typeof st0.why === 'object') {
      o.why = { values: (Array.isArray(st0.why.values) ? st0.why.values : []).filter(function (v) { return typeof v === 'string'; }).slice(0, 3).map(function (v) { return v.slice(0, 80); }),
        text: str(st0.why.text, 280) };
    }
    if (Array.isArray(st0.qa)) o.qa = st0.qa.slice(0, 20).map(function (v) { return Number.isInteger(v) && v >= 0 && v < 10 ? v : 0; });
    ['placed', 'jSample', 'coach', 'acct'].forEach(function (k) { if (typeof st0[k] === 'boolean') o[k] = st0[k]; });
    if (st0.acts) o.acts = bools(st0.acts);
    if (Array.isArray(st0.j)) {
      var j = st0.j.filter(function (x) { return Array.isArray(x) && MONTHS.indexOf(x[0]) >= 0 && num(x[1]) !== null; }).slice(-12)
        .map(function (x) { return [x[0], x[1]]; });
      if (j.length) o.j = j;
    }
    if (st0.lq && typeof st0.lq === 'object') {
      o.lq = {};
      Object.keys(st0.lq).forEach(function (k) {
        if (!LESSON_RE.test(k) || !st0.lq[k] || typeof st0.lq[k] !== 'object') return;
        var a = {}; Object.keys(st0.lq[k]).forEach(function (q) { var v = st0.lq[k][q]; if (/^\d{1,2}$/.test(q) && Number.isInteger(v) && v >= 0 && v < 10) a[q] = v; });
        o.lq[k] = a;
      });
    }
    if (st0.ms && typeof st0.ms === 'object') {
      var p = st0.ms.p || {};
      o.ms = { a: (Array.isArray(st0.ms.a) ? st0.ms.a : []).slice(0, 40).map(function (v) { return typeof v === 'string' ? v.slice(0, 40) : null; }),
        p: { first: str(p.first, 600), taught: str(p.taught, 600), release: str(p.release, 600), embrace: str(p.embrace, 600) } };
    }
    if (st0.calc && typeof st0.calc === 'object') {
      o.calc = {};
      Object.keys(app.calc).forEach(function (t) {
        var src = st0.calc[t]; if (!src || typeof src !== 'object') return;
        var c = {}; Object.keys(app.calc[t]).forEach(function (f) { var v = num(src[f]); if (v !== null && Math.abs(v) < 1e12) c[f] = v; });
        o.calc[t] = c;
      });
    }
    return o;
  }
  A.sanitize = sanitize;

  /* ---------- Automatic saving ---------- */
  function snapshot() {
    var f = S.f, state = {};
    STATE_KEYS.forEach(function (k) { if (S[k] !== undefined) state[k] = S[k]; });
    state.calc = app.calc;
    return {
      profile: JSON.stringify({
        first_name: (f.fn || '').trim() || null, last_name: (f.ln || '').trim() || null,
        phone: (f.ph || '').trim() || null, country: f.country || null,
        tier: S.tier || null, season: S.season || null, risk_band: S.band || null,
        discreet_notifications: !!S.discreet, messages_paused: !!S.paused,
      }),
      state: JSON.stringify(state),
      done: Object.keys(S.done || {}).filter(function (k) { return S.done[k] && LESSON_RE.test(k); }).sort(),
    };
  }

  var timer = null, saving = false;
  function schedule(ms) { clearTimeout(timer); timer = setTimeout(save, ms); }
  function save() {
    if (!A.loaded || !sb) return Promise.resolve();
    if (saving) { schedule(800); return Promise.resolve(); }
    var s = snapshot(), L = A.lastSaved, uid = A.user.id, jobs = [];
    if (s.profile !== L.profile) jobs.push(sb.from('profiles').update(JSON.parse(s.profile)).eq('id', uid));
    if (s.state !== L.state) jobs.push(sb.from('member_state').upsert({ user_id: uid, state: JSON.parse(s.state) }));
    var add = s.done.filter(function (k) { return L.done.indexOf(k) < 0; });
    if (add.length) {
      jobs.push(sb.from('lesson_progress').upsert(add.map(function (k) { return { user_id: uid, lesson_key: k }; }),
        { onConflict: 'user_id,lesson_key', ignoreDuplicates: true }));
    }
    if (!jobs.length) return Promise.resolve();
    saving = true;
    return Promise.all(jobs).then(function (res) {
      var bad = res.filter(function (r) { return r.error; })[0];
      if (bad) throw bad.error;
      A.lastSaved = s;
      if (A.saveErr) { A.saveErr = false; app.toast('Your progress is saved.'); }
    }).catch(function (e) {
      console.warn('HKW save failed', e);
      if (!A.saveErr) { A.saveErr = true; app.toast('We could not save your latest changes. We will keep trying.'); }
      schedule(15000);
    }).then(function () { saving = false; });
  }
  A.save = save;
  document.addEventListener('visibilitychange', function () { if (document.visibilityState === 'hidden') save(); });

  /* ---------- Hooks called by index.html ---------- */
  A.guard = function () {
    // The Admin screen is a preview mock-up: never shown to members on the live site.
    if (S.view === 'admin' && !A.previewTools) { S.view = 'app'; S.tab = 'home'; }
    if (A.loaded) {
      if (S.view === 'signup') { S.view = 'app'; S.tab = 'home'; }
      return;
    }
    if (PUBLIC.indexOf(S.view) < 0) {
      if (!st.msg && !st.err) st.msg = 'Sign in, or start free, to open your lessons and tools.';
      S.view = 'auth';
      if (STEPS.indexOf(st.step) < 0 || st.step === 'loading' && !A.user) st.step = 'signin';
    }
  };
  A.afterRender = function () { if (A.loaded) schedule(1200); };

  A.signupFields = function () {
    var e = S.errs || {}, f = S.f;
    return '<div class="stack-s"><label for="pw">Create a password <span class="req">*</span></label>' +
      '<input id="pw" data-f="pw" type="password" autocomplete="new-password" minlength="10" value="' + esc(f.pw || '') + '">' +
      '<span class="fine">At least 10 characters. A short sentence you will remember works well.</span></div>' +
      '<div class="stack-s"><label for="pw2">Confirm password <span class="req">*</span></label>' +
      '<input id="pw2" data-f="pw2" type="password" autocomplete="new-password" value="' + esc(f.pw2 || '') + '">' +
      (e.pw ? '<p class="err">' + esc(e.pw) + '</p>' : '') + '</div>' +
      '<label class="check"><input id="keep" data-f="keep" type="checkbox" ' + (f.keep ? 'checked' : '') + '>' +
      '<span>Keep me signed in on this device. Leave this unchecked on a shared phone or computer.</span></label>';
  };

  A.checkSignup = function (v, er) {
    if ((v.pw || '').length < 10) er.pw = 'Use at least 10 characters for your password.';
    else if (v.pw !== v.pw2) er.pw = 'The two passwords do not match.';
  };

  A.signUp = function () {
    var v = S.f, pw = v.pw;
    v.pw = v.pw2 = '';
    st.email = v.em.trim(); st.err = st.msg = '';
    setKeep(!!v.keep);
    busy(document.querySelector('#signup'), 'Creating your account…', 'This can take up to 15 seconds while we send your confirmation email. Please keep this page open.');
    return ready.then(function () {
      if (!sb) throw new Error('unavailable');
      return sb.auth.signUp({
        email: st.email, password: pw,
        options: {
          emailRedirectTo: location.origin + '/',
          data: { first_name: v.fn.trim(), last_name: v.ln.trim(), phone: v.ph.trim(), country: v.country,
            email_consent: !!v.cem, sms_consent: !!v.csms, invite_code: v.pc.trim() || null },
        },
      });
    }).then(function (r) {
      if (r.error) throw r.error;
      st.pendingSignup = true;
      if (!r.data.session) show('verify');  // with a session, onAuthStateChange continues to two-step setup
    }).catch(function (e) {
      S.errs = { auth: friendly(e) };
      app.render();
      var el = document.querySelector('#signup-err') || document.querySelector('.err'); if (el) el.scrollIntoView({ block: 'center' });
    });
  };

  A.redeem = function (code) {
    if (!A.loaded) return;
    sb.rpc('redeem_invite', { p_code: code }).then(function (r) {
      if (r.error || !r.data) { app.toast('We could not apply that code right now. Please try again.'); return; }
      applyPlan(r.data.plan, r.data.plan_expires_at); app.render();
      if (!r.data.ok) app.toast('That invitation has closed or reached its limit.');
    });
  };

  /* ---------- Lessons load from the server after sign-in (the live page has no lesson text) ---------- */
  var lessonStatus = {};  // key -> 'loading' | 'locked' | 'missing' | 'error'
  A.lessonState = function (key) { return lessonStatus[key]; };
  A.lessonCard = function (key) {
    if (!lessonStatus[key]) { lessonStatus[key] = 'loading'; fetchLesson(key); }
    var s = lessonStatus[key];
    if (s === 'loading') return '<div class="card stack-s center" role="status"><p class="eyebrow">One moment</p><p>Opening your lesson…</p></div>';
    if (s === 'locked') return '<div class="arch">' + app.crown(70) + '<p class="eyebrow">Premium lesson</p><h2 style="margin-top:10px">Unlock every tier</h2>' +
      '<p class="small muted" style="margin-top:10px">This lesson is part of Premium.</p></div><button class="btn" data-go="plans">See Membership Plans</button>';
    return '<div class="card stack-s"><p class="eyebrow">We could not open this lesson</p><p class="small">Check your connection, then try again.</p>' +
      '<button class="btn ghost inline" data-auth="lesson-retry" data-key="' + esc(key) + '">Try Again</button></div>';
  };
  function fetchLesson(key) {
    ready.then(function () { return sb.auth.getSession(); }).then(function (r) {
      var token = r.data && r.data.session && r.data.session.access_token;
      if (!token) return { status: 401 };
      return fetch('/api/lesson?key=' + encodeURIComponent(key), { headers: { Authorization: 'Bearer ' + token }, cache: 'no-store' })
        .then(function (res) { return res.json().catch(function () { return {}; }).then(function (b) { return { status: res.status, body: b }; }); });
    }).then(function (r) {
      if (r.status === 200 && r.body && r.body.lesson && r.body.key === key) { app.LESSONS[key] = r.body.lesson; delete lessonStatus[key]; }
      else lessonStatus[key] = r.status === 403 ? 'locked' : r.status === 404 ? 'missing' : 'error';
    }).catch(function () { lessonStatus[key] = 'error'; })
      .then(function () { if (S.view === 'lesson') app.render(); });
  }

  A.accountCard = function () {
    if (!A.loaded) return '';
    return '<div class="card stack-s"><p class="eyebrow">Sign-in</p>' +
      '<div class="kv"><span>Email</span><b>' + esc(A.user.email || '') + '</b></div>' +
      '<div class="kv"><span>Two-step verification</span><b>On</b></div>' +
      '<div class="kv"><span>This device</span><b>' + (keep() ? 'Stays signed in' : 'Signs out when closed') + '</b></div>' +
      '<button class="btn ghost inline" data-auth="changepw">Change password</button>' +
      '<button class="link" style="align-self:flex-start" data-auth="delete">Delete my account</button></div>';
  };

  /* ---------- Views ---------- */
  function show(step) {
    st.step = step;
    if (S.view !== 'auth') app.go('auth'); else { app.render(); window.scrollTo(0, 0); }
  }

  function busy(form, label, note) {
    var b = form && form.querySelector('button[type=submit]');
    if (!b) return;
    b.disabled = true; b.dataset.label = b.textContent; b.textContent = label || 'Please wait…';
    if (note) { var p = document.createElement('p'); p.className = 'small muted'; p.setAttribute('role', 'status'); p.style.textAlign = 'center'; p.textContent = note; b.insertAdjacentElement('afterend', p); }
  }

  function head(eyebrow, title, sub) {
    return '<div class="arch su-hero">' + app.crown(80) + '<p class="eyebrow" style="margin-top:10px">' + eyebrow + '</p>' +
      '<h1 class="foil display su-title">' + title + '</h1><div class="rule" style="margin-top:12px"><i></i><b></b><i></i></div>' +
      (sub ? '<p class="small" style="margin-top:10px">' + sub + '</p>' : '') + '</div>';
  }
  function notes() {
    return (st.err ? '<p class="err" role="alert">' + esc(st.err) + '</p>' : '') +
      (st.msg ? '<p class="okmsg" role="status">' + esc(st.msg) + '</p>' : '');
  }
  function field(id, label, type, extra) {
    return '<div class="stack-s"><label for="' + id + '">' + label + '</label><input id="' + id + '" name="' + id + '" type="' + type + '" ' + (extra || '') + '></div>';
  }
  // Authenticator apps always show 6 digits; Supabase email codes are 6 to 10 digits depending on project settings.
  var CODE = 'inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6}" maxlength="6" placeholder="123456"';
  var EMAIL_CODE = 'inputmode="numeric" autocomplete="one-time-code" pattern="[0-9]{6,10}" maxlength="12" placeholder="Code from the email"';
  var KEEP = '<label class="check"><input name="keep" type="checkbox"' + '__K__' + '><span>Keep me signed in on this device. Leave this unchecked on a shared phone or computer.</span></label>';
  var HELP = '<p class="fine">Need help? Email Member Care at support@herkingdomwealth.com.</p>';

  A.view = function () {
    var s = st.step, h;
    if (s === 'loading') {
      h = head('One moment', 'Opening Your Kingdom', 'Loading your lessons and progress…');
    } else if (s === 'unavailable') {
      h = head('Sign in', 'We Will Be Right Back', 'Sign-in is unavailable right now. Please check your connection and refresh the page.') + HELP;
    } else if (s === 'signin') {
      h = '<form id="auth-signin" class="stack" novalidate>' + head('Welcome back', 'Sign In') + notes() +
        '<div class="gcard stack-s">' + field('email', 'Email', 'email', 'autocomplete="email" value="' + esc(st.email) + '"') +
        field('password', 'Password', 'password', 'autocomplete="current-password"') +
        KEEP.replace('__K__', keep() ? ' checked' : '') +
        '<button class="btn" type="submit">Sign In</button>' +
        '<button class="link" type="button" data-auth="forgot">Forgot your password?</button></div>' +
        '<p class="small muted" style="text-align:center">New here? <button class="link" type="button" data-go="signup">Start free</button></p></form>';
    } else if (s === 'verify') {
      h = '<form id="auth-verify" class="stack" novalidate>' +
        head('Confirm your email', 'Check Your Email', 'We sent a confirmation code to <b>' + esc(st.email) + '</b>. Enter it below, or tap the link in the email.') + notes() +
        '<div class="gcard stack-s">' + field('code', 'Confirmation code', 'text', EMAIL_CODE) +
        '<button class="btn" type="submit">Confirm</button>' +
        '<button class="link" type="button" data-auth="resend">Send a new code</button>' +
        '<p class="fine">Already have an account with this email? <button class="link" type="button" data-auth="signin">Sign in instead</button>.</p></div>' + HELP + '</form>';
    } else if (s === 'enroll') {
      h = '<form id="auth-enroll" class="stack" novalidate>' +
        head('Two-step verification', 'Protect Your Account', 'Your account uses a second step at sign-in, so only you can open it. It takes about a minute.') + notes() +
        '<div class="gcard stack-s"><p class="small"><b>1.</b> Open an authenticator app on your phone: Google Authenticator, Microsoft Authenticator, Authy, or the iPhone Passwords app.</p>' +
        '<p class="small"><b>2.</b> Scan this code, or type the setup key.</p>' +
        (st.qr ? '<div class="center" style="background:#fff;border-radius:14px;padding:12px;align-self:center"><img src="' + esc(st.qr) + '" width="180" height="180" alt="QR code for your authenticator app"></div>' : '') +
        '<p class="small" style="word-break:break-all">Setup key: <b style="user-select:all">' + esc(st.secret || '') + '</b></p>' +
        '<p class="small"><b>3.</b> Enter the 6-digit code the app shows.</p>' + field('code', '6-digit code', 'text', CODE) +
        '<button class="btn" type="submit">Turn On Two-Step Verification</button>' +
        '<button class="link" type="button" data-auth="signout">Sign out</button></div>' + HELP + '</form>';
    } else if (s === 'mfa') {
      h = '<form id="auth-mfa" class="stack" novalidate>' + head('Two-step verification', 'Enter Your Code', 'Open your authenticator app and enter the 6-digit code for Her Kingdom Wealth™.') + notes() +
        '<div class="gcard stack-s">' + field('code', '6-digit code', 'text', CODE + ' autofocus') +
        '<button class="btn" type="submit">Verify</button>' +
        '<button class="link" type="button" data-auth="signout">Sign out</button></div>' +
        '<p class="fine">Lost your phone? Email Member Care at support@herkingdomwealth.com from the address on your account, and we will help you set up two-step verification again.</p></form>';
    } else if (s === 'forgot') {
      h = '<form id="auth-forgot" class="stack" novalidate>' + head('Reset your password', 'Forgot Your Password?', 'Enter your email and we will send you a code to set a new password.') + notes() +
        '<div class="gcard stack-s">' + field('email', 'Email', 'email', 'autocomplete="email" value="' + esc(st.email) + '"') +
        '<button class="btn" type="submit">Send Code</button>' +
        '<button class="link" type="button" data-auth="signin">Back to sign in</button></div></form>';
    } else if (s === 'reset') {
      h = '<form id="auth-reset" class="stack" novalidate>' + head('Reset your password', 'Set a New Password', 'If <b>' + esc(st.email) + '</b> has an account, we sent it a code. You can also tap the link in the email.') + notes() +
        '<div class="gcard stack-s">' + field('code', 'Code from the email', 'text', EMAIL_CODE) +
        field('password', 'New password', 'password', 'autocomplete="new-password" minlength="10"') +
        field('password2', 'Confirm new password', 'password', 'autocomplete="new-password"') +
        '<button class="btn" type="submit">Save New Password</button>' +
        '<button class="link" type="button" data-auth="forgot">Send a new code</button></div></form>';
    } else if (s === 'delete' && A.loaded) {
      h = '<form id="auth-delete" class="stack" novalidate>' + head('Your account', 'Delete My Account',
        'This permanently deletes your account, your progress, your why, your Wealth Journey and Money Story, and any sign-up or Contact Us messages sent from ' + esc(A.user.email || '') + '. It cannot be undone.') + notes() +
        '<div class="gcard stack-s">' + field('confirm', 'Type DELETE to confirm', 'text', 'autocomplete="off" autocapitalize="characters"') +
        '<button class="btn" type="submit">Delete My Account Forever</button>' +
        '<button class="link" type="button" data-jump="me">Keep my account</button></div>' +
        '<p class="fine">A paid membership is managed separately: cancel it under Membership first so you are not charged again.</p></form>';
    } else if (s === 'newpass') {
      h = '<form id="auth-newpass" class="stack" novalidate>' +
        (st.invited ? head('Your invitation', 'Create Your Account', 'Welcome! Add your name and choose a password. You will use them with your authenticator app each time you sign in.')
          : head('Your password', 'Set a New Password')) + notes() +
        '<div class="gcard stack-s">' +
        (st.invited ? '<div class="grid2">' + field('first_name', 'First name', 'text', 'autocomplete="given-name"') + field('last_name', 'Last name', 'text', 'autocomplete="family-name"') + '</div>' : '') +
        field('password', st.invited ? 'Create a password' : 'New password', 'password', 'autocomplete="new-password" minlength="10"') +
        field('password2', 'Confirm new password', 'password', 'autocomplete="new-password"') +
        '<span class="fine">At least 10 characters.</span>' +
        '<button class="btn" type="submit">' + (st.invited ? 'Create My Account' : 'Save New Password') + '</button>' +
        (A.loaded ? '<button class="link" type="button" data-jump="me">Cancel</button>' : '') + '</div></form>';
    }
    return app.shell('<div class="stack">' + h + '</div>');
  };

  /* ---------- Form submissions ---------- */
  function pwError(a, b) {
    if ((a || '').length < 10) return 'Use at least 10 characters for your password.';
    if (a !== b) return 'The two passwords do not match.';
    return '';
  }
  function code6(v) { return String(v || '').replace(/\D/g, ''); }
  function fail(e, step) { st.err = friendly(e); st.msg = ''; show(step || st.step); }

  document.addEventListener('submit', function (e) {
    var form = e.target;
    if (!form.id || form.id.indexOf('auth-') !== 0) return;
    e.preventDefault();
    var d = {}; Array.prototype.forEach.call(form.elements, function (el) { if (el.name) d[el.name] = el.type === 'checkbox' ? el.checked : el.value; });
    st.err = ''; st.msg = '';
    var id = form.id.slice(5);

    if (id === 'signin') {
      st.email = (d.email || '').trim();
      if (!/^\S+@\S+\.\S+$/.test(st.email) || !d.password) return fail({ message: 'Enter your email and password.' });
      setKeep(!!d.keep); busy(form);
      return ready.then(function () { return sb.auth.signInWithPassword({ email: st.email, password: d.password }); })
        .then(function (r) {
          if (r.error) {
            if (/not confirmed/i.test(r.error.message)) { st.msg = 'Please confirm your email first. Enter the code we sent, or send a new one.'; return show('verify'); }
            throw r.error;
          }
          show('loading');  // onAuthStateChange continues to two-step verification
        }).catch(function (x) { fail(x, 'signin'); });
    }
    if (id === 'verify') {
      var c = code6(d.code);
      if (c.length < 6 || c.length > 10) return fail({ message: 'Enter the code from the email (all of its digits).' });
      busy(form);
      return ready.then(function () { return sb.auth.verifyOtp({ email: st.email, token: c, type: 'signup' }); })
        .then(function (r) { if (r.error) throw r.error; show('loading'); })
        .catch(function (x) { fail(x, 'verify'); });
    }
    if (id === 'enroll' || id === 'mfa') {
      var t = code6(d.code);
      if (t.length !== 6) return fail({ message: 'Enter the 6-digit code from your authenticator app.' });
      busy(form);
      return sb.auth.mfa.challengeAndVerify({ factorId: st.factorId, code: t })
        .then(function (r) {
          if (r.error) throw r.error;
          if (id === 'enroll') app.toast('Two-step verification is on.');
          st.qr = st.secret = null;
          show('loading');  // MFA_CHALLENGE_VERIFIED → load
        }).catch(function (x) { fail(x, id); });
    }
    if (id === 'forgot') {
      st.email = (d.email || '').trim();
      if (!/^\S+@\S+\.\S+$/.test(st.email)) return fail({ message: 'Enter the email on your account.' });
      busy(form);
      return ready.then(function () { return sb.auth.resetPasswordForEmail(st.email, { redirectTo: location.origin + '/' }); })
        .then(function (r) { if (r.error) throw r.error; show('reset'); })
        .catch(function (x) { fail(x, 'forgot'); });
    }
    if (id === 'reset') {
      var rc = code6(d.code), pe = pwError(d.password, d.password2);
      if (rc.length < 6 || rc.length > 10) return fail({ message: 'Enter the code from the email (all of its digits).' });
      if (pe) return fail({ message: pe });
      busy(form);
      st.recovery = true; st.newPw = d.password;  // saved after two-step verification
      return sb.auth.verifyOtp({ email: st.email, token: rc, type: 'recovery' })
        .then(function (r) { if (r.error) throw r.error; show('loading'); })
        .catch(function (x) { st.recovery = false; st.newPw = null; fail(x, 'reset'); });
    }
    if (id === 'delete') {
      if ((d.confirm || '').trim().toUpperCase() !== 'DELETE') return fail({ message: 'Type DELETE to confirm.' });
      busy(form);
      return sb.rpc('delete_my_account').then(function (r) {
        if (r.error) throw r.error;
        A.loaded = false;
        return sb.auth.signOut({ scope: 'local' }).catch(function () {});
      }).then(function () { store.removeItem('hkw-auth'); setKeep(false); location.replace('/'); })
        .catch(function (x) { fail(x, 'delete'); });
    }
    if (id === 'newpass') {
      var ne = pwError(d.password, d.password2);
      if (st.invited && !(d.first_name || '').trim()) ne = 'Enter your first name.';
      if (ne) return fail({ message: ne });
      busy(form);
      if (st.invited) {
        return setPassword(d.password).then(function (ok) {
          if (!ok) return;
          st.invited = false; st.pendingSignup = true;
          history.replaceState(null, '', location.pathname);
          return sb.from('profiles').update({ first_name: d.first_name.trim().slice(0, 100), last_name: (d.last_name || '').trim().slice(0, 100) || null })
            .eq('id', A.user.id).then(function () { return queue(function () { return load(); }); });
        });
      }
      return setPassword(d.password).then(function (ok) {
        if (!ok) return;
        if (A.loaded) app.go('app', { tab: 'me' }); else queue(function () { return load(); });
      });
    }
  });

  function setPassword(pw) {
    return sb.auth.updateUser({ password: pw }).then(function (r) {
      st.newPw = null;
      if (r.error) { st.err = friendly(r.error); show('newpass'); return false; }
      if (!st.invited) app.toast('Your password has been updated.');
      st.recovery = false;
      return true;
    });
  }

  /* ---------- Buttons ---------- */
  document.addEventListener('click', function (e) {
    var b = e.target.closest('[data-auth]');
    if (!b) return;
    var a = b.dataset.auth;
    st.err = ''; st.msg = '';
    if (a === 'signin') { if (A.loaded) app.go('app', { tab: 'home' }); else show('signin'); }
    else if (a === 'forgot') show('forgot');
    else if (a === 'changepw') { st.recovery = false; show('newpass'); }
    else if (a === 'signout') A.signOut();
    else if (a === 'delete') show('delete');
    else if (a === 'lesson-retry') { delete lessonStatus[b.dataset.key]; app.render(); }
    else if (a === 'resend') {
      ready.then(function () { return sb.auth.resend({ type: 'signup', email: st.email, options: { emailRedirectTo: location.origin + '/' } }); })
        .then(function (r) { if (r.error) throw r.error; st.msg = 'We sent a new code to ' + st.email + '.'; show('verify'); })
        .catch(function (x) { fail(x, 'verify'); });
    }
  });

  A.signOut = function () {
    return save().catch(function () {}).then(function () { return sb ? sb.auth.signOut({ scope: 'local' }) : null; })
      .catch(function () {}).then(function () { store.removeItem('hkw-auth'); location.replace('/'); });
  };

  /* ---------- Friendly error messages ---------- */
  function friendly(e) {
    var m = String((e && (e.message || e.msg || e.error_description)) || e || '');
    var status = e && (e.status || e.code);
    // Supabase could not send the confirmation or reset email (email settings, or an address that cannot receive mail)
    if (/HKW_NOT_INVITED|Database error saving new user/i.test(m)) return "This email isn't on the beta invitation list yet. Use the email you gave Rev. Dr. Banks's team, or email support@herkingdomwealth.com.";
    if (status === 502 || status === 503 || status === 504 || (e && e.name === 'AuthRetryableFetchError' && !status) || /deadline|timeout|timed out|sending.*(email|mail)|confirmation (email|mail)|smtp/i.test(m))
      return "We couldn't send your confirmation email just now. Check that your email address is spelled correctly, then try again in a minute. If it keeps happening, email support@herkingdomwealth.com.";
    if (/HKW_NOT_INVITED|Database error saving new user/i.test(m)) return "This email isn't on the beta invitation list yet. Use the email you gave Rev. Dr. Banks's team, or email support@herkingdomwealth.com.";
    if (/Invalid login credentials/i.test(m)) return "That email and password don't match. Try again, or reset your password.";
    if (/already registered|already been registered/i.test(m)) return 'An account with this email already exists. Sign in instead.';
    if (/rate limit|too many|security purposes/i.test(m)) return 'Too many tries in a short time. Please wait a few minutes and try again.';
    if (/totp|mfa|factor|challenge|code/i.test(m)) return "That code didn't work. Make sure your phone's time is set automatically, then try the newest code.";
    if (/expired|invalid.*(otp|token)|otp|token/i.test(m)) return 'That code is incorrect or has expired. Check the newest email, or send a new code.';
    if (/password/i.test(m) && /least|weak|short|characters|pwned|compromised/i.test(m)) return 'Choose a longer or less common password (at least 10 characters).';
    if (/fetch|network|failed to load|unavailable/i.test(m)) return 'We could not reach the server. Check your connection and try again.';
    return m && m.length < 140 && !/[{}<>]/.test(m) ? m : 'Something went wrong. Please try again.';
  }
  A.friendly = friendly;

  // The app drew its first screen before this file loaded: redraw with sign-in active.
  app.render();
})();
