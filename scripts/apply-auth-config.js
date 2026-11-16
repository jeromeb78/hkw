'use strict';
/*
 * Applies the Her Kingdom Wealth™ sign-in settings and email templates to the Supabase project
 * through the Supabase Management API.
 *
 *   SUPABASE_ACCESS_TOKEN=sbp_... node scripts/apply-auth-config.js            # apply
 *   node scripts/apply-auth-config.js --dry-run                               # print what would change
 *
 * Create the token at https://supabase.com/dashboard/account/tokens. It can manage every project in
 * your account, so run this on your own computer, never commit it, and delete the token afterwards.
 *
 * Templates live in emails/auth/*.html, subjects in emails/auth/subjects.json.
 * This does NOT set up custom SMTP (needs your email provider's password): do that in the dashboard.
 */
const fs = require('fs');
const path = require('path');

const PROJECT_REF = process.env.SUPABASE_PROJECT_REF || 'ifysjtiphdvamocosngp';
const SITE = 'https://herkingdomwealth.com';
const dir = path.join(__dirname, '..', 'emails', 'auth');
const subjects = JSON.parse(fs.readFileSync(path.join(dir, 'subjects.json'), 'utf8'));

const payload = {
  // URL configuration: email links return here
  site_url: SITE,
  uri_allow_list: [SITE + '/**', 'https://www.herkingdomwealth.com/**'].join(','),
  // The app expects 6-digit email codes that last 1 hour, and passwords of 10+ characters
  mailer_otp_length: 6,
  mailer_otp_exp: 3600,
  password_min_length: 10,
  mailer_autoconfirm: false,           // keep "Confirm email" on
  // Two-step verification with an authenticator app
  mfa_totp_enroll_enabled: true,
  mfa_totp_verify_enabled: true,
  // Security alerts to the member
  mailer_notifications_password_changed_enabled: true,
  mailer_notifications_mfa_factor_enrolled_enabled: true,
  mailer_notifications_mfa_factor_unenrolled_enabled: true,
};
for (const [name, subject] of Object.entries(subjects)) {
  payload['mailer_subjects_' + name] = subject;
  payload['mailer_templates_' + name + '_content'] = fs.readFileSync(path.join(dir, name + '.html'), 'utf8');
}

for (const name of ['confirmation', 'recovery']) {
  if (!payload['mailer_templates_' + name + '_content'].includes('{{ .Token }}')) throw new Error(name + ' template must show {{ .Token }}');
}

const summary = Object.fromEntries(Object.entries(payload).map(([k, v]) => [k, /_content$/.test(k) ? `<${v.length} chars of HTML>` : v]));

(async () => {
  if (process.argv.includes('--dry-run')) { console.log(JSON.stringify(summary, null, 2)); return; }
  const token = process.env.SUPABASE_ACCESS_TOKEN;
  if (!token) { console.error('Set SUPABASE_ACCESS_TOKEN (see the comment at the top of this file).'); process.exit(1); }
  const res = await fetch(`https://api.supabase.com/v1/projects/${PROJECT_REF}/config/auth`, {
    method: 'PATCH',
    headers: { Authorization: 'Bearer ' + token, 'Content-Type': 'application/json' },
    body: JSON.stringify(payload),
  });
  const text = await res.text();
  if (!res.ok) { console.error('Supabase returned ' + res.status + ': ' + text.slice(0, 500)); process.exit(1); }
  const after = JSON.parse(text);
  const wrong = Object.keys(payload).filter(k => JSON.stringify(after[k]) !== JSON.stringify(payload[k]));
  console.log(wrong.length ? 'Applied, but these settings did not take: ' + wrong.join(', ') : 'Applied all ' + Object.keys(payload).length + ' sign-in settings and templates to project ' + PROJECT_REF + '.');
  if (!after.smtp_host) console.log('Reminder: custom SMTP is not set up yet. Testers will not receive codes until it is (Authentication → Emails → SMTP Settings).');
})();
