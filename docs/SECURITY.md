# Her Kingdom Wealth™ security baseline

Last reviewed November 16, 2026. Re-run this review after any schema, sign-in, or hosting change.

## Database (Supabase project HKW)

**Row Level Security is on for every table.** Grants follow least privilege: the public (`anon`) and signed-in (`authenticated`) roles get only what the app uses. Supabase's default `ALL` grant, which includes `TRUNCATE` (unaffected by RLS), has been removed, and future tables start with no access.

| Table | Public visitor | Signed-in member |
| --- | --- | --- |
| `beta_signups`, `contact_messages` | Insert only, the form's own columns, rate-limited | Same |
| `profiles` | None | Read her own row; update only her own name, contact, tier, season, risk band, consents, and notification settings. Never `plan`, `plan_expires_at`, `email`, or `source`. |
| `lesson_progress`, `member_state` | None | Read and write only her own rows |
| `redemptions` | None | Read her own |
| `app_settings`, `beta_allowlist`, `promo_codes`, `promo_attempts` | None | None (dashboard or service role only) |

- **Two-step verification is enforced by the database.** Restrictive policies require `aal2` on member tables, so a password alone can't read anything.
- **Account creation is gated** by `beta_allowlist` while `app_settings.beta_gate` is on (a trigger on `auth.users`).
- **Invitation codes** are validated in the database, and a member gets 10 attempts per hour.
- **Public form rate limits:** 3 sign-ups and 5 Contact Us messages per email per hour, and 100 submissions in total per 10 minutes.
- **Size limits:** profile text fields are capped, and `member_state` is limited to 200 KB.
- **Functions:** every `SECURITY DEFINER` function pins `search_path = ''`. Members can call only `redeem_invite` and `delete_my_account`, and both require `aal2`.
- **Sign-up details from the browser are parsed defensively.** Malformed values can't break or skew a profile.
- **Account deletion:** You → Sign-in → Delete my account removes the account, all progress, and her sign-up and Contact Us records.

Migrations: `supabase/migrations/`. Check with the Supabase security advisor. Its remaining notes are intentional:
- "RLS enabled, no policy" on the admin-only tables (no public access is the point).
- "Signed-in users can execute" for `redeem_invite` and `delete_my_account`.

## App and server

- **Content-Security-Policy:**
  - scripts come only from the site itself, and the only outside connection is to the Supabase project
  - `object-src 'none'`, `frame-ancestors 'none'`, `base-uri 'self'`, and `form-action 'self'`
  - Other headers: HSTS, nosniff, `X-Frame-Options: DENY`, Referrer-Policy, Permissions-Policy, and Cross-Origin-Opener-Policy.
- `server.js` serves only an allow-list of public files. Docs, lesson sources, migrations, tests, and `package.json` return 404. Malformed Host headers are rejected, and HTTP redirects to HTTPS.
- **Only the publishable Supabase key** is in the browser. The server refuses to serve a secret or service-role key, and `npm run build` fails if `config.js` contains one.
- **Escaping:** everything a member types is escaped before display, and data loaded from the database is type- and size-checked field by field (`auth.js` → `sanitize`). Tests cover tampered rows.
- **Sessions:** "Keep me signed in" is opt-in. By default the session lives only in the tab (safer on shared phones). Sign-out clears it.
- **Never stored:** the safety question answer, the Safety Exit setting, the credit letter text, SSNs, and account numbers.
- **Live site:** the preview tools (Unlock All Tiers, Admin) are hidden and blocked.
- `npm audit` reports 0 vulnerabilities. supabase-js is pinned and served from the site itself (`vendor/`).

## Open items (in priority order)

1. **The full curriculum ships inside `index.html`.** Anyone can download every lesson, including Premium tiers, without an account. Tier locks are only in the browser.
   - **Fix:** move the lesson content into a Supabase table with RLS by plan, and load it after sign-in. This is the most important remaining item before public launch.
2. **CSP allows inline scripts,** because the app is one HTML file with an inline script. Escaping limits the risk.
   - **Fix:** move the script into its own file, then remove `'unsafe-inline'`.
3. **Supabase dashboard settings** that can't be changed from code:
   - **Authentication → Attack Protection:** turn on CAPTCHA (Cloudflare Turnstile or hCaptcha) for sign-up, sign-in, and password reset. This blocks bots and credential stuffing, and the app needs a small change to send the CAPTCHA token.
   - **Leaked-password protection** (Pro plan): blocks passwords found in known breaches.
   - **Rate limits:** review the email, OTP, and sign-in limits.
   - **Sessions** (Pro plan): consider an inactivity timeout, e.g. 7 days.
   - **Custom SMTP:** required, and gives you SPF/DKIM/DMARC on your domain.
   - **Backups:** turn on point-in-time recovery before real member data accumulates.
4. **The beta-gate message reveals** whether an email is on the tester list. This is low risk during the beta, and goes away when the gate is turned off.
5. **GitHub:** keep the repository private, protect `main` (require the CI check), and turn on secret scanning.
6. **Privacy policy:** confirm it describes Supabase (data stored in the U.S.), Hostinger, account deletion, and retention, before launch.
