# E-Commerce AI Business OS — Plan v1 (Snapshot Log)

Saved: 2026-08-13
Live/editable version: https://claude.ai/code/artifact/4a028110-f8b1-4935-87bd-cc17044b44ad

This file is a frozen record of everything decided so far — pricing, architecture, market, revenue. Kept separate from the live artifact so this exact version is preserved before the next decision (full build vs. smaller first launch) potentially changes it.

Short summary version: `ecommerce-ai-os-plan-SHORT.md` (same folder).

---

## 1. Core Idea

Every specialist agent takes instructions from one place — the **Strategy Orchestrator** — and reports results back to it. Nothing posts, prices, discounts, or replies on its own judgment. The Orchestrator holds a living **Master Roadmap** per business: what to sell, when to post, when to discount, which channel to push. Every agent reads from it before acting and writes back after acting.

**In plain terms:** think of a small office. One Manager in the middle, 8-9 workers under them, each doing one job. No worker decides anything alone — they ask "what do I do today," do that one thing, report back. The Manager updates the plan from what comes back. That loop repeats forever.

## 2. The Strategy Loop (runs continuously)

1. **Analyze** — store data, competitor moves, social signals
2. **Update Plan** — revise Master Roadmap: what, when, discount?
3. **Assign** — one task per agent, scoped to the plan
4. **Execute** — agents post, price, reply, optimize
5. **Measure** — sales, traffic, replies, margin vs. target → feeds back into step 1

Standing cadence: weekly (daily for chatbot/pricing signals).

## 3. Architecture Principle — Bounded Autonomy, No Open Meetings

- The Orchestrator only decides **what** matters and **why** (priorities, budget, timing).
- Each specialist agent owns **how** to do its own job (SEO's keyword logic, Pricing's margin math, Chatbot's tone) — real reasoning, but scoped to the task it was given.
- Agents do **not** hold open-ended meetings with each other — validated against Anthropic's own production multi-agent system, which hit exactly this failure mode (duplicate work between subagents) and fixed it with **explicit task boundaries from the orchestrator**, not agent-to-agent chat.
- Coordination instead happens via: (a) **structured handoffs** (e.g., SEO Agent writes a keyword brief, Content Agent reads it — typed data, not conversation), and (b) a **weekly Sync** run by the Manager/QA Agent, which reviews everything every agent decided that cycle and flags contradictions before publish.
- Real cost note from the same research: multi-agent coordination can run ~15× the token cost of a single-agent system for a quality gain — a real budget line, not a rounding error, at 22+ agents running continuously per seller.

## 4. Full Agent Map — 23 agents across 7 layers

**L1 — Platform & Onboarding:** Store Builder, Onboarding, Migration Importer (Shopify/WooCommerce/IG import), Localization Layer, Team & Roles

**L2 — The Brain:** Strategy Orchestrator, Competitor Intelligence Agent, Manager/QA Agent

**L3 — Growth & Content:** SEO Agent, Content Agent, Ads & Growth Agent, Pricing Agent, Personalization Agent, Experimentation (A/B) Agent

**L4 — Customer Engagement:** Omnichannel Chatbot (WhatsApp/Instagram/Facebook/site chat), Voice/Calling Agent, Human Handoff

**L5 — Retention & Reputation:** Retention Agent (email/SMS, cart recovery), Reviews & Reputation Agent

**L6 — Operations:** Inventory & Fulfillment Agent, Returns & Disputes Agent

**L7 — Trust, Compliance & Money:** Tax & Compliance Agent, Fraud & Risk Agent, Finance Dashboard

Each agent follows the same shape: a fixed **input** (from the Roadmap or another agent), a small number of internal **steps** specific to its job, and one clearly defined **output** back into the loop. Example — SEO Agent: input = priority products + competitor content gaps → steps = keyword research, topic clustering → output = brief handed directly to Content Agent (Content never picks its own topic).

## 5. Six Scenarios (how the coordination actually holds up)

1. **Price war** — competitor cuts price → Finance checks margin floor first → if matching breaks the floor, it's rejected outright, Content/Ads reposition instead of racing to the bottom.
2. **Organic viral spike** — DM volume spikes → Inventory is checked *before* Ads is allowed to increase spend.
3. **Stockout mid-campaign** — low stock flagged → Ads is throttled automatically, messaging flips to urgency, reorder triggers in parallel.
4. **Reputation dip** — recurring complaint theme detected → cross-checked against real fulfillment data → escalates to a human, promotional push pauses on the affected product.
5. **Abandoned high-value cart** — no-discount reminder first → escalates to a Voice Agent call only for high-value, unresponsive carts → any discount still needs margin-floor sign-off.
6. **Migrating an existing store** — real sales history imported day one → Day-1 roadmap built on real numbers instead of guesses.

## 6. Tech Direction

| Layer | Choice | Why |
|---|---|---|
| Storefront + dashboard | Next.js (React), TypeScript | One codebase, strong commerce UI ecosystem |
| Database | PostgreSQL | Relational integrity for orders/inventory/multi-tenant data |
| Orchestrator + agents | Queue-based job service | Tasks need scheduling, retries, audit trails — not a chat loop |
| Payments | Stripe + regional gateway | Global sellers need coverage Stripe alone doesn't have everywhere |
| Messaging | WhatsApp Business API, Meta Graph API — **seller's own API keys**, not platform-owned | Removes per-conversation fees and review-process risk from platform cost |

## 7. AI Model Strategy — API, Not Self-Hosted

Self-hosting only beats a frontier API (Claude/GPT-tier) at ~100–256M tokens/month sustained — far beyond pre-launch or early-growth volume. Against budget hosted APIs (DeepSeek, Together, ~$0.14–0.50/M tokens), self-hosting almost never wins on cost. A self-hosted setup also needs 10–20 engineer-hours/month just to keep running ($750–3,000/month in labor).

**Decision:** API-first, with hybrid model routing:
- **Frontier-tier (Claude Sonnet, $2/$10 per M input/output tokens):** Orchestrator, Manager/QA, Content Agent, Chatbot — real reasoning and brand judgment needed, moderate volume.
- **Cheap-tier (Claude Haiku, $1/$5 per M tokens):** fraud scoring, intent classification, tagging — high volume, low complexity.
- Revisit self-hosting only once sustaining 100M+ tokens/month.

## 8. Per-Agent Cost Example (verified pricing, assumed usage)

One chatbot reply ≈ 1000 input tokens + 70 output tokens (Haiku) ≈ **$0.00135**.
Image generation (aggregator-tier): **~$0.01–0.04/image**.
Video ad (Higgsfield-tier): simple ~**$0.6–1/video**, premium (Sora/Veo-tier) ~**$1.6–2.7/video**.
Voice/calling (all-in, telephony+STT+LLM+TTS): **~$0.15/minute**.

## 9. Pricing Tiers

| | **Starter** | **Growth** (most popular) | **Scale** |
|---|---|---|---|
| Price | **$25/mo** | **$44/mo** | **$100/mo** |
| Chatbot replies | 300 | 1,500 | 5,000 |
| Posts / images | 20 / 10 | 60 / 60 | 150 / 150 |
| Video ads | 0 | 8 | 25 |
| Voice minutes | 0 | 30 | 120 |
| Competitors tracked | 3 | 10 | Unlimited |
| Team seats | 1 | 3 | Unlimited |
| Raw AI cost | ~$2.30 | ~$18.50 | ~$57.90 |
| **Profit/user** | **$22.70 (91%)** | **$25.50 (58%)** | **$42.10 (42%)** |

Top-up credits when a limit is hit: $5 = 100 credits. WhatsApp/Meta API keys are the seller's own — kept out of platform cost.

Breakeven: ~$1,000/month fixed platform cost ÷ $25 Growth-tier profit/user ≈ **~40 paying users** to turn profitable.

## 10. Competitive Landscape (real, public data)

| Player | Owns | Real scale | Model |
|---|---|---|---|
| Shopify (Sidekick/Magic) | Store platform + AI copilot | $3.6B revenue/quarter, +34% YoY; 34M AI conversations/quarter | Bundled into platform |
| Klaviyo (public, NYSE:KVYO) | Email/SMS retention AI | $370.6M revenue/quarter; $1.53B projected FY2026 | Subscription, usage-tiered |
| Gorgias | Ecommerce support chatbot | $69M ARR (2024); $104M raised; ~$530-710M valuation | Per-resolution: $0.90–1.00/conversation |
| Octane AI / Rep AI | Quiz-based discovery, sales chat | Private, undisclosed | Subscription |

**Key finding:** no single company does what this platform is designed to do. The real competitor is the stack of 6-8 point solutions a serious seller already pays for separately — each of which is independently a large business (Klaviyo alone: $1.5B/year) solving one narrow problem. The differentiator here isn't any single agent — it's that all of them answer to one Master Roadmap instead of operating blind to each other.

**Real risk:** Shopify's own AI (Sidekick) is scaling fast (34M conversations/quarter). If Shopify extends it into competitor analysis and strategy, this platform competes directly with the incumbent that owns most merchants. Owning the Store Builder (not building on top of Shopify) is a hedge against that scenario, not just a feature choice.

## 11. Revenue Projection (planning model, not a forecast)

Blended across tier mix (50% Starter / 35% Growth / 15% Scale): **~$43 revenue, ~$16.30 AI cost per user**. "Month 0" = the month the platform actually launches (after full build, per the current plan) — everything before it is cost, no revenue.

| Milestone | Users | Revenue/mo | AI cost/mo | Fixed cost/mo | Profit/mo |
|---|---|---|---|---|---|
| Launch (M0) | 20 | $860 | $326 | $1,000 | -$466 |
| M3 | 60 | $2,580 | $978 | $1,200 | $402 |
| M6 | 150 | $6,450 | $2,445 | $1,500 | $2,505 |
| M12 | 400 | $17,200 | $6,520 | $3,000 | $7,680 |
| M24 | 1,200 | $51,600 | $19,560 | $6,000 | $26,040 |

Profitable by ~Month 3 post-launch under these assumptions; ~$312K/year run rate by Month 24.

## 12. Build Phases (internal engineering order — one public launch, per current plan)

1. **Foundation + operations** — Store Builder, Onboarding, multi-tenant accounts, Migration Importer, Inventory & Fulfillment, Returns/Disputes
2. **The brain** — Strategy Orchestrator, Master Roadmap data model, Competitor Intel, Manager/QA
3. **Execution & retention agents** — Content, SEO, Ads & Growth, Retention, Reviews & Reputation
4. **Customer-facing & voice** — Omnichannel Chatbot, Voice/Calling Agent, Human Handoff
5. **Trust, scale & hardening** — Finance Dashboard, Tax & Compliance, Fraud & Risk, Localization, Team & Roles, security review

## 13. Open Risk — Flagged, Not Yet Resolved

Real data: ~90% of AI startups fail in year one; 40% shut down within 24 months, most commonly from **burning funding/runway before reaching revenue** — not from lack of demand. The current "build everything before launch" decision (Section 12 above) maximizes exactly that risk: months-to-years of zero revenue with no market feedback on which piece actually matters to a paying seller. This is the live open question for the next planning session — whether to keep the full-build strategy, or ship a smaller first slice (e.g. Competitor Analysis + Strategy Report alone) to validate demand before committing to the full 23-agent build.

---

*This is a snapshot. The live, continuously-updated version with full diagrams and detail lives at the artifact link at the top of this file.*
