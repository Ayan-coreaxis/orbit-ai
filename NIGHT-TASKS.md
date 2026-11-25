# Night run (started 2026-11-26)

Owner's words: "haan, $20 tak, so raha hoon". Budget for AI calls (Anthropic API): **$15 in total** (owner lowered it from $20), hard stop.
Store $7 · Orchestrator scenarios $6.5 · other agents and user test $1.5. Log every paid run in "Spend" below. Read the real cost from `AgentUsage`.

Rules: do not touch Mehfil Mugs, VoltKart or the owner's real data. Never text or email anyone, never publish outside this computer, delete only rows created for these tests. Fake servers for Meta / WhatsApp / Stripe / wallets / couriers. Commits authored by the owner only, no AI attribution lines; run tsc and tests before every commit. Keep chat replies short (Roman Urdu). Work directory E:\orbit-ai\web. Server: preview_start "orbit-prod" after `npm run build`.

## Tasks (tick only after a test passed)
### 1. Perfume store (Noor-e-Shab `cmwwmnjow0001ffa4ekbpm9n9`) — layout and feel like scentsnstories.pk, own brand, no 3D
- [x] 1.1 Build with the store agent (cap $5; finish with Continue inside the $8)
- [ ] 1.2 Every page at desktop + phone, screenshots looked at
- [ ] 1.3 Real COD order: product → cart → login → checkout → thank-you → dashboard
- [ ] 1.4 Click edit (text, photo, link), menu, lists, Undo, publish
- [ ] 1.5 Chat edit (AI), Stop, Continue
- [ ] 1.6 Fix every fault found, in the system rather than only this store

### 2. Business logic (no AI)
- [x] 2.1 Products, variants, stock, sold out, price changes reach the live store
- [x] 2.2 Coupons, gift cards, loyalty, bundles, delivery zones, tax: totals correct at checkout
- [x] 2.3 Order life: confirm, ship, deliver, cancel, return, refund; stock comes back
- [x] 2.4 Finance: revenue, cost, margin, fees, returns add up against hand-computed numbers
- [x] 2.5 Fraud rules, duplicate orders, two shoppers buying the last item at once

### 3. Orchestrator
- [ ] 3.1 Apply / reject / double apply / undo rules; nothing changes without Apply
- [ ] 3.2 Store edits and publishing through the Orchestrator on an agent-built store
- [x] 3.3 Market simulator + 8 scenarios, baseline vs Orchestrator, honesty checks
  - [x] a. New store, no sales, Rs 5,000 budget
  - [x] b. Lots of sales, losing money
  - [x] c. 40% COD returns
  - [x] d. Best seller sold out, rest stuck
  - [x] e. Competitor halves the price
  - [x] f. Ads spend, no orders
  - [x] g. Fake orders, bad review, angry customer
  - [x] h. Eid / wedding season with no cash
- [ ] 3.4 Fix weaknesses, run the same scenarios again
- [ ] 3.5 AI allowance cap blocks correctly

### 4. WhatsApp / Instagram / Facebook on fake servers
- [x] 4.1 Incoming message → inbox → reply; signature checks; duplicates
- [ ] 4.2 Comments → rules → DM; posting; ads create / pause; expired token and rate-limit errors
- [x] 4.3 WhatsApp order confirm (YES/NO), reviews, owner's APPLY / NO

### 5. Payments and couriers on fake servers
- [ ] 5.1 Stripe, JazzCash, Easypaisa: paid, failed, tampered, late
- [x] 5.2 PostEx, Leopards, TCS: book, track, returned, errors

### 6. Everything else
- [ ] 6.1 Signup, login, reset, onboarding
- [ ] 6.2 Settings, team, domains, admin
- [ ] 6.3 Inbox, Content, Studio (no paid image/video calls)
- [x] 6.4 Phone view of every dashboard page
- [x] 6.5 Security: another seller's data, unsigned webhooks, rate limits, upload abuse
- [ ] 6.6 8 lint errors; production build; all tests; final commit; morning report

### 7. As a brand-new user, then improve (after everything above)
- [ ] 7.1 New seller who knows nothing: signup → onboarding → first store → first product → publish → first order → Orchestrator, with no inside knowledge; write down every confusing word, dead end, wait and wrong turn
- [ ] 7.2 Blind / keyboard / screen-reader user: whole seller journey and a shopper order with keyboard only; names, focus order, announcements, contrast, zoom 200%
- [ ] 7.3 First-time shopper on a cheap phone, slow network
- [ ] 7.4 Fix what was found, best first, and repeat the journey

## Spend
| When | What | $ |
|---|---|---|
| night 1 | Noor-e-Shab first build (dark, off-reference: rejected) | 3.63 |
| night 1 | 8 Orchestrator scenarios | 2.61 |
| night 1 | Noor-e-Shab rebuild with reference capture + art director (running) | ≤5 |

## Found and fixed
- Checkout: the same submit arriving twice at once answered 500 (no duplicate order); now returns the first order.
- Returns: a refund larger than the order total was accepted; now refused.
- Orchestrator could not see returns, per-product sales, stock-outs, ads results or bad reviews: `lib/business-health.ts` now feeds the planner and the chat.
- Orbit Design told the owner an agent-store change was live when it was only in the draft.
- Thank-you page: guests can request a return. Studio page picker disabled before there are pages.
- Store builder looked AI-made and ignored the reference site. Now: whole-page reference capture + measured styles (`lib/reference-capture.ts`), niche patterns of real selling stores when there is no reference (`lib/store-patterns.ts`), a slop list, code checks for slop tells, and an independent art-director review with screenshots before a build may finish.
- Scenario results (30-day profit, simple model; planner score by a cheap grader): a new store 9/10 · b losing money 7 (91.6k→167.8k) · c 40% returns 8 (168.6k→290.4k) · d sold-out best seller 7 (15.1k→368.5k) · e price war 7 (88.1k→108.7k) · f ads burning 8 (−12.3k→21.6k) · g bad service 8 (269.2k→332.9k) · h no cash 7 (90.7k→108.3k). All diagnosed the real leak.

## Open / needs the owner
- Live accounts still needed for a real (not fake) test: Meta, Twilio WhatsApp, Stripe, JazzCash, Easypaisa, couriers.

