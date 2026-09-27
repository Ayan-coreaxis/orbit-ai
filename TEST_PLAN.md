# orbit.ai — Full Test Plan (real-business scenarios)

> Every item is a real seller/shopper situation with the **business rule** that must hold.
> Status: ⬜ not run · ✅ pass · 🔧 bug found → fixed · ❌ broken (open) · 🔑 blocked (needs a key / real account)
> Test business: **"Zaiqa Snacks"** — Lahore, sells corn snacks + spices, PKR, COD-first, WhatsApp +92.

## A. Platform setup (Super Admin)
| # | Scenario | Business rule | Status |
|---|---|---|---|
| A1 | `/api/health` | DB up → `{ok:true}` | ✅ |
| A2 | Admin login wrong / right password | wrong → 401 + rate limit; right → 12 h session | 🔑 ADMIN_PASSWORD |
| A3 | Save Anthropic key in API Keys | stored encrypted in DB, loaded on every instance within 1 min, never shown back in full | 🔑 |
| A4 | Go-live checklist | shows exactly what is missing (keys, R2, cron secret…) | 🔑 |
| A5 | Sellers list → change a seller's plan to Growth | plan + usage cap change, limits (web search 600, Studio) follow | 🔑 |
| A6 | Usage page | per-seller AI spend adds up to AgentUsage rows | 🔑 |
| A7 | Storage page (no R2) | says "local disk", test button honest | 🔑 |
| A8 | Web search page (no Brave key) | status "not configured", Orchestrator doesn't pretend it searched | 🔑 |

## B. Seller account
| # | Scenario | Business rule | Status |
|---|---|---|---|
| B1 | Sign up with email + password | account created, password hashed, signed session cookie | ✅ |
| B2 | Sign up same email again | refused, no second account | ✅ |
| B3 | Log in wrong password ×N | 401, then rate-limited | 🔧 lock was per office IP incl. successful logins → now per account, wrong passwords only |
| B4 | Log out → open /dashboard | redirected to login | ✅ |
| B5 | Forgot / reset password | token single-use + expires; old password stops working | ⬜ |
| B6 | Seller A opens Seller B's store admin API | 403 — no cross-tenant access | ⬜ |

## C. Onboarding
| # | Scenario | Business rule | Status |
|---|---|---|---|
| C1 | Enter website → discover | socials / WhatsApp / email picked from the site | 🔑 |
| C2 | `.pk` site or `+92` number | store currency = PKR (never USD) | ⬜ (code-read) |
| C3 | AI questions | 3-5 relevant questions, answers saved to `onboardingAnswers` | 🔧 only one option could be picked → now multi-select |
| C4 | Finish | business created on Starter; competitor scan + first plan draft run in background, onboarding doesn't wait | 🔧 website import put Rs 0 prices, no photos (plan then said "fix pricing") → now reads Shopify/WooCommerce feed: real prices, photos, descriptions, variants; planner capability list updated |
| C5 | No website | onboarding still completes | 🔑 |

## D. Products & inventory (Store → Products)
| # | Scenario | Business rule | Status |
|---|---|---|---|
| D1 | Add "Masala Corn 200g" Rs 350, cost 180, stock 40, photo | saved; shows on store | ✅ |
| D2 | Add product with variants 100g/200g/500g, each own price + stock | shopper picks variant; stock per variant | 🔧 sending only some variants wiped / zeroed the rest → fixed |
| D3 | Edit price | store shows new price; old orders keep old price | ✅ |
| D4 | Stock 0 | "Sold out", can't add to cart; stock-notify signup works | ⬜ |
| D5 | Delete product that has orders | old orders still readable | ⬜ |
| D6 | Negative / text price or stock | refused | ✅ |
| D7 | Photo upload (jpg/png/webp) | converted, stored, in Media library, no duplicate on re-upload | ⬜ |

## E. Storefront & checkout (shopper)
| # | Scenario | Business rule | Status |
|---|---|---|---|
| E1 | Store not designed yet | not a fake default store | 🔧 unpublished store still took orders via API; Publish with no design crashed (500) → fixed |
| E2 | Home → product → add to cart → cart | cart survives refresh | ✅ |
| E3 | Guest COD order, city Lahore | order created, stock decremented, total = server price (client total ignored) | ✅ |
| E4 | Tamper price / qty in request | server re-prices; qty ≤ stock | ✅ |
| E5 | Two shoppers buy the last unit | only one succeeds (409 for the other) | ⬜ |
| E6 | Same submit twice (clientToken) | one order only | ✅ |
| E7 | Delivery zone "Lahore" Rs 150, rest Rs 250; free over Rs 3000 | fee by city; free-delivery threshold after discount | ✅ |
| E8 | Coupon SAVE10 (10%, min Rs 1000, limit 50, expiry) | each rule enforced with a clear message | 🔧 wrong code gave no error; message said "PKR 300" → now "That code isn't valid." / "Rs 300" |
| E9 | **Auto-apply** coupon with min subtotal / expiry / usage limit | rules must hold for auto-apply too | 🔧 applied even when the rules failed |
| E10 | First-order-only coupon, 2nd order same phone | refused | ✅ |
| E11 | Tax 0 vs tax-exclusive 5% | tax on discounted subtotal, PKR rounded to whole rupees | ⬜ |
| E12 | Missing name/phone/address | 400, clear message | ✅ |
| E13 | Order confirmation page | shows items, delivery, tax, total; chat bubble | 🔧 tab said "Store · Orbit" → now "Cart · Zaiqa Snacks" |
| E14 | COD order right after placing | payment = **unpaid** until delivered (cash not collected yet) | 🔧 was marked "paid" |
| E15 | COD verification ON | order waits for customer confirm link; seller sees "awaiting" | ⬜ |
| E16 | Card (Stripe) | 🔑 needs seller Stripe | 🔑 |
| E17 | Order lookup by phone / cancel by shopper | only own order; cancel restocks | ⬜ |

## F. Orders (Store → Orders, seller)
| # | Scenario | Business rule | Status |
|---|---|---|---|
| F1 | New order appears | list, search, filter, flagged badge | ⬜ |
| F2 | pending → confirmed → shipped → fulfilled | timestamps set; shopper notified (honest error if WhatsApp not set) | ⬜ |
| F3 | Cancel a COD order | stock returned exactly once | ⬜ |
| F4 | Cancel an **unpaid card** order | stock must NOT increase (it was never taken) | 🔧 was adding phantom stock |
| F5 | Re-open a cancelled order | refused | ⬜ |
| F6 | Fulfilled COD order | payment becomes **paid** (cash collected) | 🔧 |
| F7 | Manual tracking number + URL | saved; bad URL refused | ⬜ |
| F8 | Book courier with no courier connected | honest message | ⬜ |
| F9 | Export CSV / bulk status | correct rows only for this store | ⬜ |
| F10 | Invoice page | right currency, totals, payment line | ⬜ |

## G. Growth tools
| # | Scenario | Business rule | Status |
|---|---|---|---|
| G1 | Coupons CRUD | code unique per store, uppercase | ⬜ |
| G2 | Gift card: issue Rs 1000, spend 600, then 400 | balance never below 0 | ⬜ |
| G3 | Loyalty points earn on verified order, redeem | only verified orders earn; can't redeem more than balance | ⬜ |
| G4 | Referral | reward only after the friend's real order | ⬜ |
| G5 | Bundles "Snack box" | bundle price, per-item stock checked | ⬜ |
| G6 | Abandoned cart → cron recovery | message only with phone + consent; "Rs" from store currency | ⬜ |
| G7 | Review request cron → review page | only after fulfilled; one review per order | ⬜ |
| G8 | Returns: shopper requests, seller approves/refunds | stock + payment status updated | ⬜ |

## H. Settings
| # | Scenario | Business rule | Status |
|---|---|---|---|
| H1 | Currency PKR, delivery fee, free-over, tax | used by checkout immediately | ⬜ |
| H2 | Shipping zones CRUD + city match ("Lahore City" = "LHR") | zone fee wins over default | ⬜ |
| H3 | Courier save & test (no real creds) | honest error | ⬜ |
| H4 | Team: invite staff | staff can't see billing | ⬜ |
| H5 | Chat widget on/off | bubble hides | ⬜ |
| H6 | Billing plan cards (no Stripe) | honest "not configured" | 🔑 |
| H7 | Custom domain add | TXT/CNAME instructions; unverified → not served | ⬜ |

## I. AI — Orchestrator & agents (🔑 Anthropic key)
| # | Scenario | Business rule | Status |
|---|---|---|---|
| I1 | "Mera store kaisa chal raha hai?" | real numbers only, Roman Urdu reply | 🔑 |
| I2 | "Masala Corn ki price 399 kar do" | Apply card; nothing changes until Apply; reply doesn't say "done" | 🔑 |
| I3 | Apply → Dismiss → ask again | history knows it was dismissed | 🔑 |
| I4 | Upload catalog PDF → "yeh products add kar do" | products + photos proposed, stock not invented | 🔑 |
| I5 | "Store bana do aur publish karo" | Orbit Design job runs after Apply, result posted in chat | 🔑 |
| I6 | Delivery zone via chat | Apply card, zone created | 🔑 |
| I7 | Growth plan draft → discuss → approve | strategies measured in code | 🔑 |
| I8 | Store chat bubble (shopper) asks delivery fee | correct fee/zones/currency, logged in Inbox | 🔑 |
| I9 | Usage cap reached | AI stops with a clear message, store keeps working | 🔑 |

## J. Orbit Design (🔑)
| # | Scenario | Business rule | Status |
|---|---|---|---|
| J1 | Generate store from brand | 8 core pages, real products | 🔑 |
| J2 | Edit via chat ("hero red karo") | only that part changes | 🔑 |
| J3 | Publish | live URL serves published version, draft edits not live | 🔑 |

## K. Crons (CRON_SECRET)
| # | Scenario | Business rule | Status |
|---|---|---|---|
| K1 | Without / wrong secret | 401 | ⬜ |
| K2 | courier-sync, abandoned-cart-recovery, review-requests, stale-orders, strategy-review with secret | 200, idempotent on second run | ⬜ |

## L. Security
| # | Scenario | Business rule | Status |
|---|---|---|---|
| L1 | Dashboard APIs without session | 401/403 | ✅ |
| L2 | Store admin API with other seller's businessId | 403 | ✅ |
| L3 | `/api/dev/login-as` without `ALLOW_DEV_LOGIN` | refused | ✅ |
| L4 | Upload a non-image as product photo | refused | ⬜ |

## M. Needs real accounts (can't test locally)
Meta ads / posting / DMs, Twilio WhatsApp, Stripe live, Resend email, PostEx/Leopards/TCS, R2, Brave, Studio (Gemini/Seedance), custom domain DNS.
