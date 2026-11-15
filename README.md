# Her Kingdom Wealth™

**Building Wealth God's Way.** A faith-based investing education app for Christian women, especially women of color, and open to every woman. Offered by Birthing Billions™, with Cherie Banks Ministries™ as a partner. Founder: Rev. Dr. Cherie Banks. CTO: Jerome Banks.

> **Status: private beta preview (v98, November 2026).** The app runs entirely in the browser. It does not yet save accounts, take payments, or send data anywhere. Real accounts, GoHighLevel sync, billing, and analytics are part of the production build described in `docs/JEROME-TECH-SETUP.md`.

> **Keep this repository private.** It contains unreleased content and proprietary curriculum. See `LICENSE`.

## What's inside the app

- **Four-tier curriculum, 40 lessons:** Seed, Sower, Steward, and Kingdom Builder, 10 lessons each. Every lesson has sections, pros and cons, what to watch for, a tip, guidance for 8 seasons of life, an example, key terms, a KJV verse, and a 10-question quiz.
- **Tools:** compound growth, goal planner, IPO calculator, and more (hypothetical illustrations for education only).
- **Investor profile:** season of life and risk band, written as "what women in this season often consider," not personal advice.
- **Anthropic IPO case study** with key facts, a 10-step "If you choose to participate" guide, sources, and a prominent disclosure.
- **Your Credit Comeback:** free credit education and links to government self-help sample letters, available on the Complimentary plan.
- **Memberships and gifts:** Complimentary, Premium, and Kingdom Builder plans (final name pending), gift memberships with per-gift QR codes, and sponsorships.
- **Safety and privacy by design:** discreet notifications, a safety question whose answer is never stored or sent, crisis resources, and no collection of Social Security or account numbers.

## Repository layout

| Path | What it is |
| --- | --- |
| `index.html` | The complete app: one self-contained HTML file (markup, styles, and script) |
| `lessons/` | Python sources for the 37 deep lessons (`seed.py`, `sower.py`, `steward.py`, `kingdom.py`) and `build.py`, which writes them into `index.html` |
| `emails/` | Email templates: welcome, newsletter (The Kingdom Insider), tier-up, and IPO-week alert |
| `docs/JEROME-TECH-SETUP.md` | Technical setup: GoHighLevel, hosting, beta sign-up, analytics, automatic-renewal workflows, compliance |
| `docs/BLUEPRINT.md` | Full product blueprint: tiers, curriculum, tools, resources, disclaimers, tech stack |
| `docs/MEMBERSHIP-PRICING-PROMO.md` | Membership plans, pricing, and invitation-code rules |
| `docs/CB-PARTNER-LINKS.md` | Partner and affiliate links, with disclosure rules |
| `assets/` | App QR code and share card |
| `tests/` | Automated checks for the app |

## Run it locally

No build step is needed to view the app:

```bash
# Option 1: open index.html directly in a browser
# Option 2: serve it locally
npm run serve        # then visit http://localhost:8080
```

In the preview, the **Unlock All Tiers** button opens every tier for review.

## Edit lessons

Lesson content lives in `lessons/*.py`. After editing, rebuild:

```bash
npm run build:lessons    # or: python3 lessons/build.py
```

`build.py` checks that every lesson has all required fields, guidance for all 8 seasons, and exactly 10 quiz questions, then replaces the block between `/*HKW-LESSONS-START*/` and `/*HKW-LESSONS-END*/` in `index.html`. Running it twice produces the same file. Set `HKW_APP=/path/to/file.html` to build into a different file.

## Test

```bash
npm install          # installs jsdom and Playwright
npx playwright install chromium   # first time only
npm test
```

- `tests/t3.js` loads the app in jsdom and clicks through core flows.
- `tests/lcheck.js` opens all 40 lessons in Chromium and confirms each one renders its sections, 30 quiz options, and tip, with no script errors.

## Deploy

Production will live at **HerKingdomWealth.com**, with the beta at HerKingdomWealth.com/beta. Follow `docs/JEROME-TECH-SETUP.md` in order:

1. Beta sign-up form and QR code in GoHighLevel (contacts tagged `beta-tester`)
2. Hosting on HerKingdomWealth.com with sign-in and two-step verification
3. GoHighLevel sync, then analytics (Hotjar for the beta, inputs masked, recordings kept 180 days)
4. Stripe billing and the ten automatic-renewal workflows
5. GoHighLevel Communities for tier groups

## Content and legal guardrails

These rules apply to every change:

- **Education, not advice.** Nothing recommends buying, selling, or holding any security. Keep `${DISC}` and the on-screen disclaimers in place.
- **Law content** quotes the statute verbatim, links the official source, and refers readers to a licensed attorney or their state attorney general.
- **Never collect** Social Security numbers, account numbers, or bank logins. The safety question's answer is never stored or sent.
- **Paid partner links** are labeled "Paid partner link" beside each one.
- **Voice and wording:** KJV scripture; "mentoring," not "coaching"; "women of color"; ™ after Her Kingdom Wealth and Cherie Banks Ministries.
- Legal documents (Terms of Use, Privacy Policy, Membership and Billing, Beta Tester Agreement, and more) are drafted separately and must be finalized before the public launch.

---

© 2026 Birthing Billions™. All rights reserved. Her Kingdom Wealth™ is a trademark of IP Holdings, used under license.
