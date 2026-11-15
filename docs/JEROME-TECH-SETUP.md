# Her Kingdom Wealth — Tech Setup Checklist (for Jerome)

Prepared November 1, 2026 · Updated November 2, 2026 (GoHighLevel chosen). Owner: Dr. Cherie Banks · Launch brand: Strategy VII · IP: IP Holdings

## Chosen platform: GoHighLevel

Decided November 2, 2026. GoHighLevel is the marketing, CRM, email, texting, and phone platform for Her Kingdom Wealth and for CB's other companies, each in its own sub-account. It replaces the earlier Flodesk + SimpleTexting + Make plan.

```
Instagram / Facebook DM  →  ManyChat ─┐
                                      ├→ GoHighLevel (Her Kingdom Wealth sub-account)
Her Kingdom Wealth app sign-up ───────┘     ├─ Email (custom luxe templates pasted into the code editor)
                                            ├─ Texting (dedicated 214 texting line, consent only)
                                            ├─ Phone (214 calling line; 855 vanity line ported in or forwarded in)
                                            ├─ Voice AI agent (answers unanswered calls)
                                            └─ Contact Us messages + Member Care auto-reply

App memberships (Premium, Circle, VIP, My Sister's Keeper)  →  Stripe inside the app
```

- **ManyChat** (existing account): social DM capture, e.g., "Comment KINGDOM for the free guide." Connect to GoHighLevel with its native integration or a webhook.
- **GoHighLevel sub-accounts:** one per company, so each brand keeps its own contacts, sending domain, numbers, and templates. Her Kingdom Wealth gets its own sub-account.
- **Email templates:** Claude designs each email as HTML (HKW-welcome-email.html, HKW-newsletter.html, HKW-tier-up.html, HKW-ipo-week-alert.html). Paste into GoHighLevel's email code editor, swap the placeholder unsubscribe and preferences links for GoHighLevel's own, and send a test to Gmail and iPhone Mail. Text edits are made by asking Claude for an updated file.
- **Stripe inside the app** handles app memberships and promo-code access, because the app must know who is Premium and unlock tiers. Sync the member's plan to GoHighLevel as a contact field.
- **Not needed:** Flodesk, SimpleTexting, Make/Zapier (unless a specific connection requires it), and Kit (unused free account). Keep Klaviyo only for physical products.

## Questions for the GoHighLevel demo

1. Pricing for the plan that includes multiple sub-accounts, plus per-number, per-minute, per-text, and per-email costs.
2. Can the 855 toll-free vanity number be **ported** into GoHighLevel?
3. Show a pasted custom HTML email rendering in the editor and in a test send (bring HKW-welcome-email.html).
4. How custom fields (tier, archetype, risk band, plan) arrive from the app's sign-up webhook.
5. Voice AI agent: setup, cost per minute, call transfer to a person, and booking to the calendar.
6. Voice Integrity enrollment for the calling line.

## Business contact details (internal; not shown in the app or on the website)

- **Mailing address for email footers (CAN-SPAM):** 6505 W. Park Blvd., Ste. 306-335, Plano, TX 75093 (UPS Store private mailbox). Use only in email footers and where a provider requires a business address.
- **Phone (placeholder):** 1-855-4CHERIE = **1-855-424-3743** (toll-free vanity number, currently on Grasshopper). Use it only where a provider requires a business phone; do not publish it to members.
- **Numbers in GoHighLevel:** keep the 855 vanity number; add one **214 calling line** for outbound calls; add a separate **214 texting line** for marketing texts, so opt-outs and complaints on texts never affect the calling line's reputation. Register the texting line through **A2P 10DLC** (brand + campaign; can take days to weeks, so start first). Set the texting line to text-only. Apply for **Voice Integrity** (requires SHAKEN/STIR setup and the business EIN) to reduce "Spam Likely" labels.
- **Call flow ("one front door"): every number lands in GoHighLevel.** Calls to the 214 line (including callbacks) ring in the GoHighLevel mobile app on CB's and Jerome's phones; unanswered calls go to the Voice AI agent (or voicemail), and every call is logged on the contact record. If the 855 number can be ported, move it into GoHighLevel and cancel Grasshopper (about $25/month). If it cannot, keep Grasshopper only for the 855 number and forward it **into** the 214 line. Never forward the 214 line out to the 855 number.
- **Voice agents:** keep one agent platform on the main numbers. Test GoHighLevel's native Voice AI against CB's current voice-agent provider. If the outside provider wins, forward unanswered 214 calls to its number and connect it to GoHighLevel so call notes reach the contact record. Agent rules: same guardrails as Kingdom Concierge (no personal investment advice; discreet domestic violence hotline response), identify itself as an AI assistant, and announce call recording.
- **Support inbox:** support@herkingdomwealth.com, connected to GoHighLevel's conversations inbox for Contact Us messages.

## Hosting the app

- **Preview (now):** a private clickable preview is published on claude.ai for CB to review. It is not the real app and saves nothing.
- **Hosting (updated November 15, 2026): Hostinger.** It's a Node.js app in hPanel (app type Other, entry file `server.js`, build `npm run build`) that deploys `main` from GitHub. Use a beta subdomain (for example, beta.herkingdomwealth.com) or a password-protected folder for testers. Setup steps are in `docs/DEPLOY-HOSTINGER.md`.
- **Launch:** serve **herkingdomwealth.com** (secured by CB on November 2, 2026) from Hostinger. Members install it from the website to their phone's home screen; no app store is needed at launch. App Store and Google Play versions can follow later.

## Accounts to create or confirm

- [x] Domain: herkingdomwealth.com (secured November 2, 2026)
- [ ] Matching social handles
- [ ] GoHighLevel: Her Kingdom Wealth sub-account; sending domain authenticated (SPF, DKIM, DMARC)
- [ ] GoHighLevel phone: 214 calling line, 214 texting line, A2P 10DLC registration, Voice Integrity; 855 port request if supported
- [x] Supabase project "HKW" created November 15, 2026 (schema applied; login still to build)
- [ ] Hostinger Node.js app connected to the GitHub repo and the domain
- [ ] Stripe (app subscriptions, coupons) — under the correct legal entity
- [ ] GitHub repository for the app code

## Data each sign-up sends to GoHighLevel

first_name, last_name, email, phone (with country code for members outside the U.S.), country (from "Where do you live?"), tier (Seed | Sower | Steward | Kingdom Builder), archetype, risk band, plan (complimentary | premium | circle | vip | sisters_keeper), email_consent + timestamp, sms_consent + timestamp, discreet_notifications, messages_paused, source (app | manychat | promo).

**Never send to GoHighLevel:** the sign-up safety answer (it is not stored at all), the Safety Exit setting, Wealth Journey entries, or any calculator inputs. Those stay private inside the app.

## Automations to build in GoHighLevel workflows

1. Welcome email series (5 emails / 10 days), segmented by tier
2. Welcome text (only if SMS consent), from the 214 texting line
3. Tier-up email when a member unlocks the next tier
4. Re-engagement after 14 days inactive
5. My Sister's Keeper day-3 reminder to anyone who has not redeemed
6. IPO-week alert: "What to watch before ANT starts trading" (educational, not a buy signal)
7. Member Care automatic reply on every Contact Us submission (exact wording in BLUEPRINT.md → "Contact and Member Care"), with messages tagged by topic
8. International waitlist: when country is not United States, tag `waitlist-<country>` (for example, `waitlist-canada`) and send a welcome email that explains the app teaches U.S. accounts today and that she is on the waitlist. Build a smart list per country so CB can see demand and email one country when its lessons launch. Texting: the 214 number sends U.S. texts; international SMS costs more and needs separate rules, so default non-U.S. members to email only.
9. Referral tracking: give each member a personal share link (herkingdomwealth.com/?ref=<member-id>); when a new member signs up through it, tag the sharer and new member, and add both to a "Sister Circle" thank-you sequence.
10. Discreet notifications: members who turn it on get messages from a neutral sender name that never mention money, investing, or abuse; "Pause all messages" stops every email and text instantly

## Private beta for 12 testers (added November 13, 2026)

CB is inviting about 12 women she knows, each with a complimentary invitation code. The beta needs real accounts, contact capture into GoHighLevel, and usage analytics. Build it in this order:

**Phase 1: this week (keeps CB's promise while the full build continues)**
1. **Beta sign-up form in GoHighLevel:** first name, last name, email, mobile, and three separate boxes: the required Beta Tester Agreement box, an optional session-recording box, and an optional text consent box (wording in Legal Documents, section 10). Link the agreement from the form. Each submission creates a contact tagged `beta-tester`, with `beta-recording-yes` or `beta-recording-no` and `sms-yes` or `sms-no`.
2. **Welcome email** on submission: thank-you, what to expect, how to give feedback, and the app link.
3. **One QR code, one smooth path:** publish the form on a branded page at HerKingdomWealth.com/beta. Make one QR code in GoHighLevel's QR Code Builder (URL type) pointing to that page. In the form's settings, set "on submit" to redirect straight to the app, and send the app link again in the welcome email. No second QR code is needed.

**Phase 2: real accounts and analytics (before testers log in)**
4. **Host the app** on CB's domain, HerKingdomWealth.com (a private beta path or subdomain until public launch), with sign-in: email and password plus two-step verification. Only `beta-tester` contacts can create accounts.
5. **Sync sign-ups to GoHighLevel** (webhook or API), matched by email, so the account and the contact are one person.
6. **Analytics (GoHighLevel's own site analytics show page views and opt-ins only, not session recordings, heatmaps, or per-person journeys, so add a third-party tool through the site's tracking-code setting):** Recommended for the beta: Hotjar's free Basic plan (35 sessions a day is plenty for 12 testers, and it stores data for 365 days). Alternatives: PostHog (per-person journeys, funnels, time on screen, clicks, and comparison with the group) or Microsoft Clarity (heatmaps and session recordings; simpler). PostHog does both and lets you identify each tester by her account ID.
   - The app is one page that redraws itself, so send a "screen viewed" event on every screen change with the screen name and tier (Claude can add this hook to the app code once you pick the tool).
   - **Mask every input field** in session recordings (calculators, Money Story, Contact Us), as section 10.4 promises.
   - Record sessions only for testers tagged `beta-recording-yes`.
   - Turn off IP address storage, and never send analytics data to GoHighLevel.
7. **Weekly report for CB:** top screens, average time on each, where testers stop, each tester's path compared with the group, and the feedback form results.

**Feedback**
8. **Feedback form (GoHighLevel survey), sent at day 7 and day 21:**
   1. How easy was it to find your way around? (1–5)
   2. Which section helped you most?
   3. What confused you or felt hard to use?
   4. Did anything look broken or wrong? (screenshot upload)
   5. Which lesson or tool would you use again this week?
   6. Did anything feel too personal, or not personal enough?
   7. How likely are you to recommend Her Kingdom Wealth™ to a sister? (0–10)
   8. What one thing should we add or change before launch?
9. **Retention:** CB chose 180 days. Delete each session recording 180 days after it was made (section 10.9), keep only de-identified summaries, and start each tester's complimentary year on the public launch date.

## Automatic-renewal notices (updated November 13, 2026; matches Legal Documents sections 2.2–2.5)

State automatic-renewal laws require these notices. Build them as GoHighLevel workflows triggered by Stripe events, send each one by email (plus an in-App notice), keep a copy of every notice, and log the send date. Keep all records for at least 3 years, or 1 year after the membership ends, whichever is longer. Use one national schedule; it is set so a single send date satisfies every state below.

| # | Workflow | Trigger and timing | What it must say | Laws it satisfies |
|---|---|---|---|---|
| 1 | Checkout disclosure and consent | Before payment, beside the buy button | Renews automatically until cancelled; renewal price; billing frequency; term length; how to cancel. Unchecked box: "I agree to automatic renewal and the Membership Terms." Save the wording shown, the consent, and a time stamp. | California; Minnesota § 325G.57 subd. 1; ROSCA (federal); all states |
| 2 | Purchase confirmation | Immediately after first payment | The automatic-renewal terms, cancellation policy, how to cancel, and a direct cancel link, in a form she can keep | California; Minnesota subd. 2; all states |
| 3 | Annual-plan renewal reminder | **Exactly 30 days** before the renewal date | Renews automatically unless cancelled; renewal term and price; how to cancel; direct online cancel link; the 3-day grace period; Contact Us form | California and New York (15–45 days); Colorado (25–40); Virginia and Vermont (30–60); Massachusetts (5–30) |
| 4 | Yearly membership reminder (monthly plans too) | Once every 12 months from the join date, and at least once in every calendar year | Her plan; how often and how much she is charged; how to cancel or manage it | California (annual reminder); Minnesota subd. 5 (once per calendar year, by mail or email) |
| 5 | Price change notice | **21 days** before a new price takes effect | Old price, new price, effective date, and how to cancel, in a form she can keep | California (7–30 days); Minnesota subd. 3 (before the change) |
| 6 | Trial ending notice (only if a paid plan ever starts with a free period over 30 days) | **10 days** before the trial converts | That the trial will end and she will be charged unless she cancels; price; how to cancel | California (3–21 days); Minnesota subd. 4 (5–30 days) |
| 7 | Online cancellation | Always available under You → Membership | A prominent "Cancel membership" button. One retention offer is allowed only if a "Cancel now" button shows on the same screen. No phone call or extra steps. | California; Minnesota § 325G.60; all states |
| 8 | Cancellation confirmation | Immediately after she cancels | Renewal is stopped, and the date her access ends | California; best practice everywhere |
| 9 | 3-day annual grace refund | She cancels within 3 days after an annual renewal charge | Automatically refund that renewal in full through Stripe; access ends when the refund is issued; say so in the confirmation email | Our policy (section 2.3) |
| 10 | Failed payment | Card declined at renewal | That the card was declined and how to update it, with no card details shown | Best practice |

**Before launch:**
- CB (attorney review) approves the wording of every notice.
- Confirm the full lists of states with automatic-renewal laws, including Minnesota §§ 325G.56–.62, against the current statutes. The schedule above was checked against California, New York, Colorado, Virginia, Vermont, Massachusetts, and Minnesota.
- Test each workflow end to end with a test card in Stripe's test mode.

## Compliance basics

- Separate, unchecked consent boxes for email and SMS; SMS text: "Msg & data rates may apply. Msg frequency varies. Reply STOP to opt out, HELP for help."
- Unsubscribe link + physical mailing address in every email
- Privacy policy and terms (attorney review)
- Never collect SSNs, bank or brokerage account numbers
- Affiliate disclosure next to every partner link

## Environment variables the app will need (names are suggestions)

`SUPABASE_URL`, `SUPABASE_ANON_KEY`, `SUPABASE_SERVICE_ROLE_KEY`, `STRIPE_SECRET_KEY`, `STRIPE_WEBHOOK_SECRET`, `GHL_WEBHOOK_URL` (inbound webhook for sign-ups, plan changes, and Contact Us messages), `GHL_API_KEY` (if calling the API directly), `APP_NAME="Her Kingdom Wealth"`


## Bless a Sister: gifts, sponsorships, and mission giving (added November 2, 2026)

**Gift memberships**
- Use **Stripe one-time Checkout** products: Premium for 3, 6 or 12 months, and Kingdom Builder Court for 1, 3 or 6 months.
- Collect: buyer name, buyer email, recipient name, recipient email, delivery date, and message (up to 240 characters).
- On the delivery date, email the recipient a gift certificate with a one-time activation code.
- When the recipient activates it, start a non-renewing membership for that term.

**Sponsorships**
- Use a one-time Stripe product: "Sponsor a sister for a year" (Premium, $347) or "Sponsor a Kingdom Builder" (Circle, 3 months, $441).
- The sponsor chooses one of two options:
  - **"Let Rev. Dr. Banks choose":** the purchase creates a My Sister's Keeper code and adds it to the admin pool, tagged `sponsored-pool`.
  - **"I have a sister in mind":** the code is emailed to the sponsor.
- Never reveal who the sponsor was to the recipient, unless the sponsor chooses to share it herself.

**Mission giving: two separate organizations**
- **Separate Stripe accounts:** set up two, one for **Cherie Banks Ministries** (the 501(c)(3), with its own EIN and bank account) and one for **Birthing Billions™**.
- **Routing:** the "Where your gift goes" choice sends the donor to the matching account's Checkout. Never collect into one account and transfer later.
- **Options:** one-time or monthly, with preset amounts of $25, $50, $100 and $250 plus a custom amount.
- **Ministry receipts:** in the ministry's name with its EIN, the amount, the date, and the statement "No goods or services were provided in exchange for this contribution." Send a year-end giving statement for monthly donors.
- **Birthing Billions receipts:** state "This gift is not tax-deductible."
- **GHL tags:** `donor-ministry` or `donor-bb`.

**The Kingdom Insider** (newsletter)
- Fields: email, mobile, and a delivery preference (`email`, `text`, or `both`).
- Send to GHL with tags `kingdom-insider` plus `ki-email`, `ki-text`, or `ki-both`.
- Use double opt-in for email. For text, log the consent checkbox, the exact wording shown, the time, and the IP; honor STOP and HELP automatically.
- It does not create an account.

**Saving member data**
- Every member's sign-up answers, tier, lesson progress, plan, saved tools, and choices are stored in the database against her account and reload at each sign-in.
- The preview has no database and resets on refresh; that is expected.
- Never store the safety question answer, SSNs, or account numbers.

**Where the calls to action appear**
- Landing page (works without an account)
- Share the Blessing
- Kingdom Giving
- Membership plans
- All About You (the Bless a Sister card)


## Navigation structure (built November 2, 2026)

**Bottom tabs:** Home · Learn · Grow · Restore · You
- The internal Tools and Library screens still exist. They are reached from Grow and Learn, not from the bottom bar.

**Header**, on every in-app screen:
- Back
- The HER KINGDOM WEALTH wordmark, which goes Home
- Search
- A gold Help heart, which opens Help for Every Season with Quick Exit at the top

**Breadcrumb ("you are here"):** a `where()` map assigns every screen to a parent tab and a page name. The breadcrumb shows them, and the parent tab stays highlighted.

**Search:** an in-app index of every page, every Knowledge Base article and every tool.

**Jump chips:** long pages (Your Credit Comeback) start with a row of section links.

**Preview code note:** the new versions of `navBar`, `shell`, `vHome` and `vMe` live in the nav module and replace the older definitions. In the production build, delete the old ones.


## Get Involved forms and giving levels (added November 2, 2026)

**Three forms** live on the Get Involved page. The page is reached from All About You, the landing page and CB's story. Each form posts to GHL with a tag:

**Volunteer** (tag `volunteer`; all volunteers serve with Cherie Banks Ministries, so route to the ministry's GHL sub-account or pipeline)
- Contact details and city.
- Service areas: multi-select, plus Other.
- Spiritual gifts: multi-select, plus Other.
- "Matters of my heart."
- Availability.
- Consent.

**Book Rev. Dr. Banks** (tag `booking-request`)
- Contact details and organization.
- On behalf of: a dropdown.
- Engagement type: a dropdown, plus Other.
- Date, audience size, location, budget and notes.
- Consent.

**Partner With Us** (tag `partner-inquiry`)
- Contact details.
- On behalf of: Individual, For-profit, Church or ministry, Nonprofit, or Other.
- Interests: multi-select, plus Other.
- Which organization.
- Event and vision notes.
- Consent.

**Where submissions go:** each one notifies CB's team and starts a pipeline stage in GHL: New, Contacted, Scheduled, Confirmed, Declined.

**Giving levels:** track annual giving per donor (calendar year) in each organization's Stripe account, and tag donors by level:
- `lvl-mustard` ($100+)
- `lvl-goodground` ($500+)
- `lvl-ruby` ($1,000+)
- `lvl-pearl` ($5,000+)
- `lvl-crown` ($10,000+)


**Update (November 2, 2026):**
- **Booking types:** now include Podcast Interview and Featured Article.
- **"Media and Press" buttons:** they open the booking form with Media Interview already selected. Tag these requests `media-request`.


**Gift QR codes (CB approved, Nov. 4, 2026)**
- At checkout for a gift membership, generate a unique, single-use redemption code and a QR code that encodes a link such as `https://herkingdomwealth.com/gift/<code>`.
- Show it on the giver's confirmation screen and email it to her as a downloadable gift card (blush and gold, matching HKW-Share-Card.png, with the recipient's and giver's names). On the chosen delivery date, email it to the recipient as well.
- The link opens a welcome page showing who gave the gift, the plan and length (e.g., "6 months of Premium"), and the giver's message, then guides her to create her account; the gift activates when she does.
- The code works once and cannot be transferred after activation. Do not show the price paid on the recipient's page. Keep the general share card QR pointed to https://herkingdomwealth.com.
