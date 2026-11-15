# Her Kingdom Wealth — Membership, Pricing & My Sister's Keeper Promo Code

Prepared for Dr. Cherie Banks · November 1, 2026 · Launch brand: Strategy VII · IP owner: IP Holdings

This is a starting recommendation, not financial or legal advice. Test it with real members and adjust.

---

## 1. My Sister's Keeper promo code (the ~16 women)

The women were introduced through a mutual contact, so the gift is generous but intentionally light: complimentary access for a set term, no founder title, no special badge. "Founding" status is reserved for people Dr. Banks knows personally.

**Goal:** the women Dr. Banks promised to bless get the app free, but only if they sign up inside a short window, so the code cannot float around once the app is paid.

### Recommended setup

| Setting | Recommendation |
| --- | --- |
| Code | `MYSISTERSKEEPER` — easy to type, case-insensitive |
| What it unlocks | Complimentary **Premium** membership (all four tiers, all calculators, all libraries). No special badge or title: these members look like any other Premium member, which keeps the gift generous without implying a founding role or a closer relationship |
| How long it lasts | **12 months of complimentary Premium** (recommended, since these women are acquaintances through a mutual contact; a set term keeps the gift clean). Lifetime is available as a setting. Live coaching circle NOT included |
| Redemption window | **5 days**, starting when she sends the invitation (not when the app launches). Ends 11:59 PM Central Time on day 5 |
| Maximum redemptions | **20** (16 women + a small buffer for typos or a friend she adds) |
| Credit card required? | **No.** The code grants access directly in the app, so no card is collected |
| After the deadline | Code shows: "This My Sister's Keeper invitation has closed. Join Her Kingdom Wealth here." with the paid options |
| Admin controls | See who redeemed and when; extend the deadline; raise the cap; revoke a code; create new codes |

### Optional upgrade: personal codes

Instead of one shared code, the app can generate 16 unique one-time codes (for example `SISTERSKEEPER-7K2`). Each works once, so the code cannot be shared on social media. Slightly more admin work, more control.

### How she uses it

1. App goes live and is tested.
2. Dr. Banks (or the mutual contact) sends a text or email to each woman: link + code + "Sign up by [date], 11:59 PM CT."
3. Day 3: a reminder message to anyone who has not redeemed (the admin view shows who).
4. Day 5: code closes automatically.

### Build spec (for Claude / Jerome)

- `promo_codes` table: code, type (shared | single-use), grants (plan = premium, duration = lifetime | days), starts_at, expires_at, max_redemptions, redemption_count, active.
- `redemptions` table: code, user_id, redeemed_at.
- Validate at sign-up: active, within window, under cap; on success set user plan = premium, access_label = "My Sister's Keeper" (internal only, not shown to members), access_ends_at = redeemed_at + 12 months, source = promo.
- All times stored in UTC, shown in Central Time.
- Admin page to create, edit, extend, deactivate, and export redemptions.

---

## 2. Recommended membership tiers and prices

Her Kingdom Wealth is premium: four learning tiers, six calculators, a live IPO case study, scripture-based teaching, and access to Dr. Banks. Price it as a premium membership, not a budget app, and raise prices as features are added.

| Membership | Price range | Recommended launch price | What's included |
| --- | --- | --- | --- |
| **Complimentary Seed Starter** | $0 | $0 | Complimentary guide (The Proverbs 31 Portfolio), first 3 Seed lessons, compound calculator, newsletter. Purpose: capture leads |
| **Premium** | $27–$47/month | **$37/month or $347/year** (about 2 months free) | All four tiers and modules, all calculators, Anthropic and future case studies, archetype profile, wealth vehicles, platforms, legends, resources, certificates |
| **Kingdom Builder Circle** | $97–$197/month | **$147/month** | Everything in Premium + monthly live group coaching with Dr. Banks, live Q&A, monthly market briefing, private community |
| **Legacy VIP** (by application) | $2,500–$7,500/year | **$4,997/year** | Small mastermind, quarterly 1:1 strategy session, estate and legacy planning workshop with partner professionals |

**No early member or founding member rate (decided Nov. 13, 2026).** The Complimentary Seed Starter plan, now including Your Credit Comeback, is the free way in.

### Why these numbers

- Comparable women's investing education: Female Invest showed membership + bootcamp bundles at $89 and $191 (checked November 1, 2026: femaleinvest.com/bootcamp-membership).
- Stock research subscriptions such as Motley Fool Stock Advisor have commonly been around $199/year at list price, with frequent introductory discounts (approximate; verify).
- Her Kingdom Wealth adds what those do not: faith-based teaching, four guided tiers, and personal access to Dr. Banks. Live access is what justifies the $97–$197 and VIP levels.

### How to raise value (and price) over time

Add, then announce a price increase for new members (current members keep their rate):

- Video lessons from Dr. Banks in every module
- Monthly new case study (next IPOs, sector deep dives)
- Community circles by tier
- Portfolio tracker and goal dashboard
- Live event replays library
- Mobile app in the App Store and Google Play

### Payment notes

- **Start as a web app with Stripe** for subscriptions. Stripe fees are about 2.9% + $0.30 per charge (verify current rates).
- If later sold as an in-app subscription in the Apple App Store or Google Play, the store keeps a commission (commonly 15% for small businesses, up to 30%). Many creators keep billing on the web and let members log in on the mobile app; check current store rules before deciding.
- Offer annual plans: they improve cash flow and reduce cancellations.
- Promo codes and invitation codes are handled in-app and in Stripe.
