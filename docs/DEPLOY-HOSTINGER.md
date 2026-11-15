# Deploying Her Kingdom Wealth™ to Hostinger

The app is a static site (one `index.html` plus `config.js`), so it runs on any Hostinger plan with Apache/LiteSpeed. Every push to `main` runs the tests, builds `dist/`, and uploads it to Hostinger over FTPS with GitHub Actions (`.github/workflows/deploy-hostinger.yml`).

## What gets published

`scripts/build-dist.sh` copies **only** these files into `dist/`:

| File | Purpose |
| --- | --- |
| `index.html` | The app |
| `config.js` | Supabase URL and **publishable** key, plus the hosts allowed to send form data |
| `.htaccess` | HTTPS redirect, www → apex, security headers (CSP, HSTS), caching, blocks dotfiles and source files |
| `robots.txt` | Keeps the private beta out of search engines (remove `Disallow: /` at public launch) |
| `assets/HKW-Share-Card.png` | Share card |

Lesson sources, docs, email templates, and tests are never uploaded. The docs include internal business details.

## One-time setup

1. **Hostinger hPanel → Websites → herkingdomwealth.com → Files → FTP Accounts.** Note the FTP host (e.g. `ftp.herkingdomwealth.com` or an IP), username, and password. Create a dedicated FTP account for deploys if you prefer.
2. **Decide where the app lives.**
   - Main site: upload to `public_html/` (the default).
   - Private beta on a subdomain: create `beta.herkingdomwealth.com` in hPanel (Domains → Subdomains). Its folder is usually `public_html/beta/` (hPanel shows the exact path).
   - If the FTP account's root folder is already `public_html`, use `./` or `beta/` instead.
3. **GitHub → repository → Settings → Environments → New environment `production`**, then add:
   - Secrets: `HOSTINGER_FTP_SERVER`, `HOSTINGER_FTP_USERNAME`, `HOSTINGER_FTP_PASSWORD`
   - Variable (optional): `HOSTINGER_FTP_DIR`, e.g. `public_html/` (the default) or `public_html/beta/`. Must end with `/`.
4. **hPanel → Security → SSL:** make sure the free SSL certificate is active for the domain (and the subdomain, if you use one). `.htaccess` forces HTTPS.
5. **Private beta gate (optional, until sign-in is built):** hPanel → Advanced → Password Protect Directories, on the app folder.
6. Push to `main` (or run the workflow manually from the Actions tab).

The deploy action keeps a `.ftp-deploy-sync-state.json` file on the server so it uploads only changed files. `.htaccess` blocks public access to it.

## Supabase (project "HKW")

- Project ref `ifysjtiphdvamocosngp`, region us-east-1, URL `https://ifysjtiphdvamocosngp.supabase.co`
- Schema: `supabase/migrations/20261115203200_hkw_initial_schema.sql`
  - `beta_signups` and `contact_messages`: visitors can **insert only**. Read them in the Supabase dashboard (Table Editor) or with the service-role key from a server.
  - `profiles`, `lesson_progress`, `member_state`: each signed-in member can read and write only her own rows. `plan` can only be changed by the service role (Stripe webhook). A profile row is created automatically when an auth user is created.
- What the app sends today: the sign-up form (name, email, phone, country, invite code, plan, consent flags) and Contact Us messages. It **never** sends the safety answer, Safety Exit, Wealth Journey, or calculator inputs.
- Forms send data only on hosts listed in `config.js` → `hosts`. Add your subdomain or staging host there, and add any new Supabase host to `connect-src` in `deploy/.htaccess`.
- **Never** put the `service_role` key, Stripe secret, or GoHighLevel API key in `config.js` or anywhere in the browser.

## Still to build (see JEROME-TECH-SETUP.md)

- Sign-in (Supabase Auth, email + password with two-step verification) and loading/saving member progress to `profiles` / `lesson_progress` / `member_state`
- Sending new `beta_signups` / `contact_messages` rows to GoHighLevel (a Supabase Database Webhook or Edge Function that posts to `GHL_WEBHOOK_URL` and sets `ghl_synced_at`)
- Stripe billing. Server-side code (webhooks) can't run on static hosting, so use Supabase Edge Functions.
