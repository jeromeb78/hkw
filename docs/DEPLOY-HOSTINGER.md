# Deploying Her Kingdom Wealth™ to Hostinger (Node.js web hosting)

The app runs as a small Node server (`server.js`, built-in modules only, no dependencies) on Hostinger's Node.js hosting. hPanel pulls the GitHub repo, runs `npm run build`, and starts `server.js`. GitHub Actions (`.github/workflows/ci.yml`) runs the same build plus the tests on every push and PR, so problems show up before Hostinger deploys them.

## hPanel settings

hPanel → Websites → Add website → **Node.js app** → connect GitHub repo `jeromeb78/hkw`, branch `main`:

| Setting | Value |
| --- | --- |
| App type / framework | **Other** |
| Root directory | repository root (`/`) |
| Node version | 22 (20 or newer) |
| Package manager | npm (the repo has `package-lock.json`) |
| Build command | `npm run build` |
| Entry file | `server.js` |
| Environment variables | none required. Optional ones are below. |

## What the server does

- Serves **only** these paths: `/`, `/index.html`, `/config.js`, `/auth.js`, `/vendor/supabase-2.118.0.js`, `/robots.txt`, `/assets/HKW-Share-Card.png`, `/api/health`, and `/api/lesson` (members only).
- Keeps lesson text off the page. It removes the `HKW-CONTENT` blocks from `index.html`, and sends each lesson only to a signed-in member whose plan includes it (see `docs/SECURITY.md` → Lessons). `/api/health` shows `lessons: 40` when all lessons loaded. Everything else returns 404, including lesson sources, docs (they contain internal business details), emails, tests, and `package.json`.
- Redirects `http` → `https` (using Hostinger's `X-Forwarded-Proto`), and `www.` → the apex domain when `CANONICAL_HOST` is set.
- Sends security headers: Content-Security-Policy (only the Supabase project is allowed for `connect-src`), HSTS, nosniff, `X-Frame-Options: DENY`, Referrer-Policy, and Permissions-Policy.
- Gzips the 660 KB app to about 210 KB and uses ETags, with `no-cache` on the HTML and config so every release shows up right away.
- Listens on `process.env.PORT`, which Hostinger sets.
- `GET /api/health` returns `{ ok, time, started, worker: null, config, missing }`. Open it after each deploy: `ok` should be `true` and `missing` should be `[]`.

`npm run build` (`scripts/check-release.js`) compiles nothing. `index.html` already contains the lessons. The script only checks that the public files exist and that `config.js` holds no secret key. Hostinger doesn't need Python. The lesson build (`python3 lessons/build.py`) runs on your machine, and CI fails if you forgot to commit its output.

## Environment variables (all optional)

| Name | Purpose |
| --- | --- |
| `CANONICAL_HOST` | e.g. `herkingdomwealth.com`: redirects `www.herkingdomwealth.com` to it |
| `HKW_SUPABASE_URL` + `HKW_SUPABASE_PUBLISHABLE_KEY` | Serve `config.js` from these instead of the committed file, e.g. for a staging Supabase project. Use the **publishable** key only; the server refuses a secret or service-role key. |
| `HKW_ALLOWED_HOSTS` | Comma-separated hosts where the forms send data (used only with the two variables above) |
| `HKW_SOURCE` | `source` value stored on sign-ups, e.g. `beta` |
| `HKW_PREVIEW_TOOLS` | `true` shows the preview strip (Unlock All Tiers, Admin) on the live site. Leave unset for real members. |

These are read when the app starts, so restart the app in hPanel after changing one. No rebuild is needed.

**Never** put the Supabase `service_role` / secret key, Stripe secret, or GoHighLevel API key in `config.js` or these variables.

## After the first deploy

1. Point the domain (or a `beta.` subdomain for the private beta) at the Node.js app in hPanel, and confirm SSL is active.
2. Open `https://<domain>/api/health` and check that `ok` is `true`.
3. Submit a test sign-up on the live site, then check that it appears in Supabase → Table Editor → `beta_signups`.
4. Optional keep-alive: Hostinger stops idle apps and restarts them on the next request. For a static app that only adds a short delay on the first visit. To avoid it, add an hPanel cron job or uptime monitor that requests `/api/health` every 5 minutes.
5. `robots.txt` blocks search engines during the beta. Remove `Disallow: /` from `deploy/robots.txt` at public launch.

## Rehearse a deploy locally

```bash
npm ci && npm run build && npm start   # then open http://localhost:3000
```

## Supabase (project "HKW")

- Project ref `ifysjtiphdvamocosngp`, region us-east-1, URL `https://ifysjtiphdvamocosngp.supabase.co`
- Schema: `supabase/migrations/20261115203200_hkw_initial_schema.sql`
  - `beta_signups` and `contact_messages`: visitors can **insert only**. Read them in the dashboard or with the service-role key from a server.
  - `profiles`, `lesson_progress`, `member_state`: each signed-in member can read and write only her own rows. `plan` can only be changed by the service role (Stripe webhook).
- The app sends the sign-up form and Contact Us messages. It **never** sends the safety answer, Safety Exit, Wealth Journey, or calculator inputs.
- Forms send data only on hosts in `config.js` → `hosts`. Add a staging or subdomain host there.

## Sign-in (Supabase Auth)

On the live site (any host in `config.js` → `hosts`), `auth.js` turns on accounts:

1. **Sign up:** the existing form, plus a password (10 or more characters) and "Keep me signed in on this device" (off by default, for shared phones).
2. **Confirm email:** she enters the 6-digit code from the email, or taps the link.
3. **Two-step verification (required):** she scans a QR code with an authenticator app and enters a code. Member data can't be read or written without it, and the database enforces this too.
4. **Onboarding and progress save automatically:** profile, tier, season, risk band, lesson completions, Why card, quiz answers, action steps, Wealth Journey, Money Story, calculator inputs, and notification settings. They reload at every sign-in.
5. **Welcome and onboarding:** new members see the Welcome page (a note from Rev. Dr. Banks, Matthew 25:21, and the three steps ahead), then Your Why, the placement quiz, and the investor profile. A member who stops partway resumes at the step she skipped the next time she signs in.
6. **Sign in:** email, password, then the authenticator code. "Forgot your password?" sends a code, then asks for the authenticator code before the new password is saved.

**Never saved:** the safety question answer, the Safety Exit setting, the credit letter text, or passwords (Supabase stores only a hash).

**Server-side rules** (`supabase/migrations/`):
- **Beta gate:** while `app_settings.beta_gate` is on, only emails in `beta_allowlist` can create accounts.
- **Invitation codes** (`promo_codes`): validated in the database at sign-up or in the app. `MYSISTERSKEEPER` grants 12 months of Premium.
- **Plan and expiry** can be changed only by the server, never by the member.

### One-time Supabase setup (project HKW)

The branded email templates are in `emails/auth/` (subjects in `subjects.json`). `scripts/apply-auth-config.js` applies them along with the sign-in settings the app needs:
- Site URL `https://herkingdomwealth.com`, plus redirect URLs for the apex and `www`
- 6-digit email codes that last 1 hour, a 10-character minimum password, and "Confirm email" on
- Authenticator-app two-step verification
- Security alerts for password changes and for two-step methods added or removed
- The templates: Confirm signup, Reset password, Invite user, and the three security alerts

**Option A: run the script** on your own computer, from the repo folder:

```bash
SUPABASE_ACCESS_TOKEN=sbp_your_token node scripts/apply-auth-config.js
```

Create the token at supabase.com → Account → Access Tokens. It can manage **every** project in your account, so delete it when you're done. `--dry-run` shows what will change without a token.

**Option B: paste by hand.** In the dashboard:
1. **Authentication → Emails → Templates:** paste each file from `emails/auth/` into its template (Confirm signup = `confirmation.html`, Reset password = `recovery.html`, Invite user = `invite.html`, and the Security notifications), with the subjects from `subjects.json`.
2. **Authentication → URL Configuration:** set the Site URL and redirect URLs above.
3. **Sign In / Providers → Email:** set the minimum password length to 10.

**Either way, also set up custom SMTP** (Authentication → Emails → SMTP Settings). The script can't do this because it needs your email provider's password. **It is required for testers:** Supabase's built-in email only sends to members of your Supabase team, and only a few per hour. Use a sender like `Her Kingdom Wealth <support@herkingdomwealth.com>`, or a neutral sender name for Discreet notifications, and turn off link/click tracking at your provider, because tracking breaks the email links.

Subject lines are deliberately neutral ("Your confirmation code") so nothing about money shows on a lock screen.

### Who can sign up

Sign-up is **open to everyone** (since November 16, 2026). To limit it to invited testers again: `update public.app_settings set beta_gate = true;`, then add their emails to `beta_allowlist` as below.

### Managing beta testers

In the Supabase SQL editor, or Table Editor → `beta_allowlist` (emails are lowercased automatically):

```sql
insert into public.beta_allowlist (email, note) values
  ('tester1@example.com', 'beta-tester'),
  ('tester2@example.com', 'beta-tester');
```

- To invite someone yourself: add her email to `beta_allowlist` first, then go to Authentication → Users → Invite user. The invitation email (`emails/auth/invite.html`) opens the app, where she sets up two-step verification, adds her name, creates a password, and lands on the welcome page.
- At public launch, open sign-up to everyone: `update public.app_settings set beta_gate = false;`
- Close or limit an invitation code: `update public.promo_codes set active = false where code = 'MYSISTERSKEEPER';`, or set `expires_at` / `max_redemptions`.
- See who redeemed a code: `select * from public.redemptions;`
- If a member loses her phone: Authentication → Users → her account → remove her MFA factor. She sets up two-step verification again at her next sign-in.

## Still to build (see JEROME-TECH-SETUP.md)

- Sending new sign-ups and Contact Us rows to GoHighLevel (Supabase Database Webhook or Edge Function, setting `ghl_synced_at`)
- Stripe billing and webhooks: Supabase Edge Functions, or new routes in `server.js` now that the app runs on Node
