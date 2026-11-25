# Night run (started 2026-11-26)

Owner's words: "haan, $20 tak, so raha hoon". Budget for AI calls (Anthropic API): **$20 in total**, hard stop.
Store $8 · Orchestrator scenarios $10 · other agents $2. Log every paid run in "Spend" below. Read the real cost from `AgentUsage`.

Rules: do not touch Mehfil Mugs, VoltKart or the owner's real data. Never text or email anyone, never publish outside this computer, delete only rows created for these tests. Fake servers for Meta / WhatsApp / Stripe / wallets / couriers. Commits authored by the owner only, no AI attribution lines; run tsc and tests before every commit. Keep chat replies short (Roman Urdu). Work directory E:\orbit-ai\web. Server: preview_start "orbit-prod" after `npm run build`.

## Tasks (tick only after a test passed)
### 1. Perfume store (Noor-e-Shab `cmwwmnjow0001ffa4ekbpm9n9`) — layout and feel like scentsnstories.pk, own brand, no 3D
- [ ] 1.1 Build with the store agent (cap $5; finish with Continue inside the $8)
- [ ] 1.2 Every page at desktop + phone, screenshots looked at
- [ ] 1.3 Real COD order: product → cart → login → checkout → thank-you → dashboard
- [ ] 1.4 Click edit (text, photo, link), menu, lists, Undo, publish
- [ ] 1.5 Chat edit (AI), Stop, Continue
- [ ] 1.6 Fix every fault found, in the system rather than only this store

### 2. Business logic (no AI)
- [ ] 2.1 Products, variants, stock, sold out, price changes reach the live store
- [ ] 2.2 Coupons, gift cards, loyalty, bundles, delivery zones, tax: totals correct at checkout
- [ ] 2.3 Order life: confirm, ship, deliver, cancel, return, refund; stock comes back
- [ ] 2.4 Finance: revenue, cost, margin, fees, returns add up against hand-computed numbers
- [ ] 2.5 Fraud rules, duplicate orders, two shoppers buying the last item at once

### 3. Orchestrator
- [ ] 3.1 Apply / reject / double apply / undo rules; nothing changes without Apply
- [ ] 3.2 Store edits and publishing through the Orchestrator on an agent-built store
- [ ] 3.3 Market simulator + 8 scenarios, baseline vs Orchestrator, honesty checks
  - [ ] a. New store, no sales, Rs 5,000 budget
  - [ ] b. Lots of sales, losing money
  - [ ] c. 40% COD returns
  - [ ] d. Best seller sold out, rest stuck
  - [ ] e. Competitor halves the price
  - [ ] f. Ads spend, no orders
  - [ ] g. Fake orders, bad review, angry customer
  - [ ] h. Eid / wedding season with no cash
- [ ] 3.4 Fix weaknesses, run the same scenarios again
- [ ] 3.5 AI allowance cap blocks correctly

### 4. WhatsApp / Instagram / Facebook on fake servers
- [ ] 4.1 Incoming message → inbox → reply; signature checks; duplicates
- [ ] 4.2 Comments → rules → DM; posting; ads create / pause; expired token and rate-limit errors
- [ ] 4.3 WhatsApp order confirm (YES/NO), reviews, owner's APPLY / NO

### 5. Payments and couriers on fake servers
- [ ] 5.1 Stripe, JazzCash, Easypaisa: paid, failed, tampered, late
- [ ] 5.2 PostEx, Leopards, TCS: book, track, returned, errors

### 6. Everything else
- [ ] 6.1 Signup, login, reset, onboarding
- [ ] 6.2 Settings, team, domains, admin
- [ ] 6.3 Inbox, Content, Studio (no paid image/video calls)
- [ ] 6.4 Phone view of every dashboard page
- [ ] 6.5 Security: another seller's data, unsigned webhooks, rate limits, upload abuse
- [ ] 6.6 8 lint errors; production build; all tests; final commit; morning report

## Spend
| When | What | $ |
|---|---|---|

## Found and fixed

## Open / needs the owner

