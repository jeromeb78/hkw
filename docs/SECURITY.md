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

- **Two-step verification is optional, and enforced by the database for members who turn it on.** Restrictive policies call `public.mfa_satisfied()`: a member with a verified authenticator must be at `aal2` (signed in with her code); a member without one can use her password session. So turning it on really protects her data, not just the screen.
- **Account creation:** sign-up has been open to everyone since November 16, 2026 (`app_settings.beta_gate = false`). Setting it back to `true` limits new accounts to emails in `beta_allowlist`.
- **Invitation codes** are validated in the database, and a member gets 10 attempts per hour.
- **Public form rate limits:** 3 sign-ups and 5 Contact Us messages per email per hour, and 100 submissions in total per 10 minutes.
- **Size limits:** profile text fields are capped, and `member_state` is limited to 200 KB.
- **Functions:** every `SECURITY DEFINER` function pins `search_path = ''`. Members can call only `redeem_invite`, `delete_my_account`, and `mfa_satisfied`; the first two refuse a member who turned on two-step but hasn't entered her code.
- **Sign-up details from the browser are parsed defensively.** Malformed values can't break or skew a profile.
- **Account deletion:** You → Sign-in → Delete my account removes the account, all progress, and her sign-up and Contact Us records.

Migrations: `supabase/migrations/`. Check with the Supabase security advisor. Its remaining notes are intentional:
- "RLS enabled, no policy" on the admin-only tables (no public access is the point).
- "Signed-in users can execute" for `redeem_invite` and `delete_my_account`.

## Lessons

- **Lesson text is kept off the live page.** It sits between `HKW-CONTENT` markers in `index.html`, and `server.js` strips those blocks before sending the page.
- **Members fetch lessons one at a time** from `GET /api/lesson?key=…`, using their Supabase access token. The server asks Supabase for her profile with that token: Row Level Security returns it only to the signed-in member (with her authenticator code, if she turned two-step on). The server then checks her plan.
  - Seed lessons 1–3 are free for every member.
  - All other lessons need an active paid or gifted plan.
  - Expired plans are refused.
  - The API is rate-limited (120 requests per minute per visitor), sends no-store headers, and needs no secret keys on the server.
- **`npm run build` fails** if lesson text appears outside the markers, or fewer than 40 lessons can be read.
- **Hostinger pull-request preview addresses** run without sign-in, so they show lesson outlines only. The claude.ai preview and the tests use the full file.
- **The lesson sources** (`lessons/*.py`) and the repository stay private.

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

1. **Other content is still public in `index.html`:** the Knowledge Base articles, the case study, the tool explanations, and the credit guides. Lessons are now protected (see "Lessons" above). Move other Premium content behind the same lesson API if it should be members-only.
2. **CSP allows inline scripts,** because the app is one HTML file with an inline script. Escaping limits the risk.
   - **Fix:** move the script into its own file, then remove `'unsafe-inline'`.
3. **Supabase dashboard settings** that can't be changed from code:
   - **Authentication → Attack Protection:** turn on CAPTCHA (Cloudflare Turnstile or hCaptcha) for sign-up, sign-in, and password reset. This blocks bots and credential stuffing, and the app needs a small change to send the CAPTCHA token.
   - **Leaked-password protection** (Pro plan): blocks passwords found in known breaches.
   - **Rate limits:** review the email, OTP, and sign-in limits.
   - **Sessions** (Pro plan): consider an inactivity timeout, e.g. 7 days.
   - **Custom SMTP:** required, and gives you SPF/DKIM/DMARC on your domain.
   - **Backups:** turn on point-in-time recovery before real member data accumulates.
5. **GitHub:** keep the repository private, protect `main` (require the CI check), and turn on secret scanning.
6. **Privacy policy:** confirm it describes Supabase (data stored in the U.S.), Hostinger, account deletion, and retention, before launch.
