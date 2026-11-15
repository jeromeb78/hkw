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

- Serves **only** these paths: `/`, `/index.html`, `/config.js`, `/robots.txt`, `/assets/HKW-Share-Card.png`, and `/api/health`. Everything else returns 404, including lesson sources, docs (they contain internal business details), emails, tests, and `package.json`.
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

## Still to build (see JEROME-TECH-SETUP.md)

- Sign-in (Supabase Auth with two-step verification) and saving member progress
- Sending new sign-ups and Contact Us rows to GoHighLevel (Supabase Database Webhook or Edge Function, setting `ghl_synced_at`)
- Stripe billing and webhooks: Supabase Edge Functions, or new routes in `server.js` now that the app runs on Node
