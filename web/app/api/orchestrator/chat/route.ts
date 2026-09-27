import { NextResponse } from "next/server";
import { anthropic, MODEL } from "@/lib/anthropic";
import { prisma } from "@/lib/prisma";
import { getActiveBusinessId } from "@/lib/get-active-business-id";
import { buildOrchestratorContext } from "@/lib/orchestrator-context";
import { estimateCostUsd } from "@/lib/pricing";
import { assertUnderUsageCap, UsageCapExceededError } from "@/lib/usage-limit";
import { classifyRelevantSpecialists, consultSpecialist, CONSULTABLE_SPECIALISTS } from "@/lib/specialist-consult";
import type Anthropic from "@anthropic-ai/sdk";
import { parseSummary, ORCHESTRATOR_TOOL, getDiscussedPlan, planContextBlock, sanitizeOps, describeOps, applyPlanOps, filterOpsForPlan } from "@/lib/strategy-chat";
import { draftGrowthPlan } from "@/lib/strategy-planner";
import { describeStoreChanges, sanitizeStoreChanges, storeSettingsContext } from "@/lib/store-settings-ops";
import { describeProductChanges, sanitizeProductChanges } from "@/lib/product-ops";
import { OPEN_MEDIA_TOOL, attachmentBlocks, attachmentNote, parseList, resolveMediaRef } from "@/lib/media";
import { LOOKUP_TOOL_NAMES, MAX_LOOKUPS, catalogSummary, lookupTools, mediaSummary, productsForMessage, runLookup } from "@/lib/orchestrator-tools";
import { PLATFORM_MAP, storeStatusContext } from "@/lib/platform-map";
import { describeDesignJobs, sanitizeDesignJobs, type DesignJob } from "@/lib/design-ops";
import { describeStudioRequests, sanitizeStudioRequests, studioContext } from "@/lib/studio/ops";
import { describeMetaOps, metaContext, sanitizeMetaOps } from "@/lib/meta-ops";
import { READ_PAGE_TOOL, WEB_SEARCH_TOOL, formatResults, readPageText, searchForBusiness, searchStatus } from "@/lib/web-search";

export const maxDuration = 180;

const SYSTEM_PROMPT_PREFIX = `You are the Strategy Orchestrator for this e-commerce AI platform — the same senior business-growth and sales expert who sets the weekly plan and watches every specialist agent's work. The owner is now talking to you directly, by voice or text, to brainstorm, ask questions, or discuss changes.

Ground rules:
- Talk like a sharp, direct human advisor texting the owner back — not a report generator. Short, conversational replies: 2-5 sentences for normal questions, and even for a "give me a full plan" question, stay under ~120 words total.
- Conversational, never a report. Keep it easy to scan: short paragraphs (1-3 sentences) separated by a blank line; when giving 3+ steps or options use "- " bullet lines; **bold** only a key number or the one key action. No headers, tables or code.
- If the owner is asking for a real step-by-step plan, give the 3-4 highest-leverage steps only, as short bullets — not an exhaustive report. They can always ask "what's next" for more.
- Everything you say about this business's numbers must trace back to the real data given below. Never invent a revenue, traffic, or conversion figure that isn't there.
- You may share general growth/marketing expertise and reasoning freely — that's real knowledge, just label it as general guidance, not this business's measured data.
- You CAN draft and change the owner's growth plan, and PROPOSE store-setting changes (currency, delivery fee, free-delivery threshold, tax) via store_changes and product work via product_changes (edit price, cost, stock, name, description, photos, variants), new_products (add products) and delete_products — see STORE SETTINGS and PRODUCTS below — make images, reels and ad creatives with create_content (see ORBIT STUDIO), and post to Facebook / Instagram or set up Meta ads with social_posts / meta_ads (see META). When the owner asks for one of those, do it yourself instead of sending them somewhere. These are PROPOSALS: in your reply say you've proposed it and they should press Apply below — never say it's done ("kar diya", "set kar diya") before they press Apply. Only include changes that differ from the current values. Earlier messages carry [SYSTEM: …] notes saying whether each proposal was applied, dismissed or is still pending — trust them: if the owner still wants something that was dismissed, make a NEW proposal now instead of saying it's already on its way. Anything else (categories, discounts, orders) you can't change from here yet — say so honestly and point them to where to do it (e.g. "Dashboard > Store"). Never tell the owner to enter a number in the wrong currency as a workaround.

Real context for this conversation:
`;

/** Safety net — light formatting (short paragraphs, "- " bullets, **bold**) renders in the chat,
 * but headers, dividers, italics and code must never show up as raw symbols. */
function stripMarkdown(text: string): string {
  return text
    .replace(/^#{1,6}\s+/gm, "") // headers
    .replace(/(^|[^*])\*([^*\n]+)\*(?!\*)/g, "$1$2") // italic (keeps **bold**)
    .replace(/^---+$/gm, "") // horizontal rules
    .replace(/^\*\s+/gm, "- ") // "* " bullets -> "- "
    .replace(/`([^`]+)`/g, "$1") // inline code
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

export async function POST(req: Request) {
  const businessId = await getActiveBusinessId();
  if (!businessId) {
    return NextResponse.json({ error: "No active business." }, { status: 400 });
  }

  const body = (await req.json()) as { message?: unknown; attachments?: unknown };
  // Only files that really belong to this business can ride along.
  const attachmentIds = Array.isArray(body.attachments)
    ? (
        await prisma.mediaAsset.findMany({
          where: { businessId, id: { in: body.attachments.filter((x): x is string => typeof x === "string").slice(0, 10) } },
          select: { id: true },
        })
      ).map((m) => m.id)
    : [];
  const typed = typeof body.message === "string" ? body.message.trim() : "";
  const message = typed || (attachmentIds.length ? "(sent you the attached file" + (attachmentIds.length > 1 ? "s" : "") + ")" : "");
  if (!message) {
    return NextResponse.json({ error: "Message is required." }, { status: 400 });
  }

  try {
    await assertUnderUsageCap(businessId);
  } catch (e) {
    if (e instanceof UsageCapExceededError) {
      return NextResponse.json({ error: e.message }, { status: 402 });
    }
    throw e;
  }

  const [context, history, plan] = await Promise.all([
    buildOrchestratorContext(businessId),
    prisma.orchestratorMessage.findMany({
      where: { businessId },
      orderBy: { createdAt: "desc" },
      take: 20,
    }),
    getDiscussedPlan(businessId),
  ]);
  const orderedHistory = history.reverse();
  const storeStatus = await storeStatusContext(businessId);

  await prisma.orchestratorMessage.create({
    data: { businessId, role: "user", content: typed, attachments: attachmentIds.length ? JSON.stringify(attachmentIds) : null },
  });

  // --- The meeting: real specialists visibly weigh in before the Orchestrator's own reply,
  // when (and only when) the message genuinely calls for it. Most messages skip this entirely. ---
  const newMessages: { id: string; role: "assistant"; content: string; speaker: string | null; needsUser: boolean; opsState?: string | null; opsSummary?: string[] | null; askApproval?: boolean }[] = [];
  let meetingSummary = "";
  let pausedOnUser = false;

  try {
    const note = await attachmentNote(businessId, attachmentIds);
    // Specialists get the same live store status, so nobody claims the store is live when it isn't.
    const cur = (await prisma.business.findUnique({ where: { id: businessId }, select: { storeCurrency: true } }))?.storeCurrency || "usd";
    const specialistContext = `${context}
${storeStatus}
${await productsForMessage(businessId, message, cur)}`;
    const forSpecialists = note ? `${message.trim()} ${note}` : message.trim();
    const relevantIds = await classifyRelevantSpecialists(businessId, forSpecialists);
    let priorTurnsText = "";
    for (const agentId of relevantIds) {
      const result = await consultSpecialist(businessId, agentId, forSpecialists, priorTurnsText, specialistContext);
      const shown = result.needsUser && result.needsUserText ? `${result.content}

Needs from you: ${result.needsUserText}` : result.content;
      const saved = await prisma.orchestratorMessage.create({
        data: { businessId, role: "assistant", speaker: agentId, content: shown, needsUser: result.needsUser },
      });
      const label = CONSULTABLE_SPECIALISTS[agentId].name;
      newMessages.push({ id: saved.id, role: "assistant", content: shown, speaker: agentId, needsUser: result.needsUser });
      priorTurnsText += `${label}: ${result.content}${result.needsUser ? ` (needs from owner: ${result.needsUserText})` : ""}\n`;
      meetingSummary += `${label} said: "${result.content}"${result.needsUser ? ` — and needs this from the owner: ${result.needsUserText}` : ""}\n`;
      if (result.needsUser) { pausedOnUser = true; break; } // meeting pauses right here until the owner answers
    }
  } catch {
    // Consultation is an enhancement, not a dependency — if it fails, fall through to the
    // Orchestrator's own reply exactly as before, rather than blocking the conversation.
  }

  const meetingBlock = meetingSummary
    ? `\nSPECIALISTS JUST WEIGHED IN ON THIS, IN FRONT OF THE OWNER (do not repeat their exact words — react to them like the CEO who just heard the same meeting):\n${meetingSummary}${
        pausedOnUser
          ? "\nOne of them needs something only the owner can supply. Your reply must plainly ask the owner for exactly that (in your own words), and nothing else — the meeting is paused until they answer."
          : "\nSynthesize their input into your real reply — resolve any conflict between them yourself, don't ask the owner to referee."
      }\n`
    : "";

  const currency = (await prisma.business.findUnique({ where: { id: businessId }, select: { storeCurrency: true } }))?.storeCurrency || "usd";
  const planBlock = [PLATFORM_MAP, storeStatus, await planContextBlock(businessId, plan), await storeSettingsContext(businessId), await catalogSummary(businessId, currency), await mediaSummary(businessId), await studioContext(businessId), await metaContext(businessId)].join("\n");
  // Look-ups (products / orders / media / older chat) fetch exact rows on demand instead of the whole set.
  const oldestInHistory = orderedHistory.length >= 20 ? (orderedHistory[0]?.createdAt ?? null) : null;
  const lookups = await lookupTools(businessId, oldestInHistory);
  const lookupBlock = lookups.length
    ? `\nLOOK-UP TOOLS: ${lookups.map((t) => t.name).join(", ")} fetch exact rows from the database. Use them whenever the answer depends on a specific product, order, file or earlier conversation that isn't already in front of you — never guess. At most ${MAX_LOOKUPS} look-ups per reply.`
    : "";
  // Older turns carry a short note about their files; only THIS turn's files are sent in full.
  const historyNotes = new Map<string, string>();
  for (const m of orderedHistory) {
    const ids = parseList(m.attachments);
    if (ids.length) historyNotes.set(m.id, await attachmentNote(businessId, ids));
  }
  const currentBlocks = await attachmentBlocks(businessId, attachmentIds);

  // --- Web search: the Orchestrator may look things up (Brave), within the seller's monthly limit ---
  const search = await searchStatus(businessId);
  const canSearch = search.enabled && search.left > 0 && search.perTurn > 0;
  const searchBlock = !search.configured
    ? ""
    : `\nWEB SEARCH: ${
        !search.enabled
          ? "switched off by the platform — you can't look things up."
          : search.left <= 0
            ? `this month's search limit (${search.limit}) is used up; it resets on the 1st. If fresh web info is needed, say so plainly and answer from what you know, labelled as general knowledge.`
            : `available — ${search.left} of ${search.limit} searches left this month, at most ${search.perTurn} for this reply. Use web_search only when the answer really needs fresh outside facts (current prices, trends, platform rules, competitor offers, news) — not for the store's own data or general knowledge. Use read_page to open a promising result. When you rely on web results, list those URLs in sources and say what you found in plain words; never invent a number the results didn't show.${search.left <= Math.ceil(search.limit * 0.2) ? " The seller is close to the monthly limit — search only if it really matters." : ""}`
      }`;

  // What really happened to each earlier proposal — so the Orchestrator never claims a dismissed
  // change is still coming, or that a pending one is already done.
  const proposalNote = (m: { opsState: string | null; opsSummary: string | null }) => {
    if (!m.opsState) return "";
    const what = parseSummary(m.opsSummary)?.join("; ").slice(0, 400) ?? "";
    if (m.opsState === "pending") return `[SYSTEM: this proposal is still waiting — the owner has NOT pressed Apply yet: ${what}]`;
    if (m.opsState === "dismissed") return `[SYSTEM: the owner DISMISSED this proposal — nothing from it happened: ${what}]`;
    if (m.opsState === "applied") return `[SYSTEM: applied: ${what}]`;
    if (m.opsState === "failed") return `[SYSTEM: this change FAILED: ${what}]`;
    return "";
  };
  const convo: Anthropic.Messages.MessageParam[] = [
    ...orderedHistory.map((m) => ({
      role: m.role === "user" ? ("user" as const) : ("assistant" as const),
      content:
        m.speaker && m.speaker !== "orchestrator"
          ? `[${CONSULTABLE_SPECIALISTS[m.speaker as keyof typeof CONSULTABLE_SPECIALISTS]?.name ?? m.speaker}]: ${m.content}`
          : [m.content, historyNotes.get(m.id), proposalNote(m)].filter(Boolean).join(" ") || "(file)",
    })),
    { role: "user", content: currentBlocks.length ? [...currentBlocks, { type: "text" as const, text: message.trim() }] : message.trim() },
  ];
  const seen = new Map<string, string>(); // url -> title, every result the model was shown
  let searches = 0;
  let reads = 0;
  let opens = 0;
  let lookupsUsed = 0;
  const MAX_OPENS = 2;
  // open_media lets the Orchestrator re-read a file sent earlier (e.g. the rest of a catalog PDF).
  const hasMedia = (await prisma.mediaAsset.count({ where: { businessId } })) > 0;
  const extraTools = [...lookups, ...(canSearch ? [WEB_SEARCH_TOOL, READ_PAGE_TOOL] : []), ...(hasMedia ? [OPEN_MEDIA_TOOL] : [])];
  let block: Anthropic.Messages.ToolUseBlock | undefined;
  try {
    for (let step = 0; step < 9 && !block; step++) {
      const mustAnswer =
        !extraTools.length ||
        step >= 6 ||
        ((!canSearch || (searches >= search.perTurn && reads >= 2)) && (!hasMedia || opens >= MAX_OPENS) && (!lookups.length || lookupsUsed >= MAX_LOOKUPS));
      const msg = await anthropic.messages.create({
        model: MODEL,
        max_tokens: 16000,
        system: SYSTEM_PROMPT_PREFIX + context + "\n" + planBlock + lookupBlock + meetingBlock + searchBlock,
        tools: [...extraTools, ORCHESTRATOR_TOOL],
        tool_choice: mustAnswer ? { type: "tool", name: ORCHESTRATOR_TOOL.name } : { type: "any" },
        messages: convo,
      });
      await prisma.agentUsage.create({
        data: {
          businessId,
          agentId: "orchestrator-chat",
          model: MODEL,
          inputTokens: msg.usage.input_tokens,
          outputTokens: msg.usage.output_tokens,
          costUsd: estimateCostUsd(MODEL, msg.usage.input_tokens, msg.usage.output_tokens),
        },
      });
      const uses = msg.content.filter((b): b is Anthropic.Messages.ToolUseBlock => b.type === "tool_use");
      block = uses.find((u) => u.name === ORCHESTRATOR_TOOL.name);
      if (block || !uses.length) break;

      convo.push({ role: "assistant", content: msg.content });
      const results: Anthropic.Messages.ToolResultBlockParam[] = [];
      for (const u of uses) {
        const input = (u.input ?? {}) as { query?: unknown; url?: unknown; ref?: unknown };
        let text: string;
        if (LOOKUP_TOOL_NAMES.has(u.name)) {
          let content: string;
          if (lookupsUsed >= MAX_LOOKUPS) content = "No more look-ups for this reply — answer with what you have.";
          else {
            lookupsUsed++;
            content = await runLookup(businessId, u.name, (u.input ?? {}) as Record<string, unknown>, { currency, oldestInHistory });
          }
          results.push({ type: "tool_result", tool_use_id: u.id, content });
          continue;
        }
        if (u.name === OPEN_MEDIA_TOOL.name) {
          const m = typeof input.ref === "string" ? await resolveMediaRef(businessId, input.ref) : null;
          let content: Anthropic.Messages.ToolResultBlockParam["content"];
          if (!m) content = "No file with that ref in the media library.";
          else if (opens >= MAX_OPENS) content = "No more files can be opened for this reply — answer with what you have.";
          else {
            opens++;
            const blocks = await attachmentBlocks(businessId, [m.id]);
            content = blocks.filter((b) => b.type === "text" || b.type === "image" || b.type === "document") as Exclude<Anthropic.Messages.ToolResultBlockParam["content"], string | undefined>;
          }
          results.push({ type: "tool_result", tool_use_id: u.id, content });
          continue;
        }
        if (u.name === WEB_SEARCH_TOOL.name) {
          if (searches >= search.perTurn) text = "No more searches for this reply — answer with what you have.";
          else {
            searches++;
            const r = await searchForBusiness(businessId, String(input.query ?? "").trim() || message.trim(), "orchestrator");
            if (r.ok) r.results.forEach((x) => seen.set(x.url, x.title));
            text = r.ok ? formatResults(r.results) : `Search unavailable: ${r.reason}`;
          }
        } else if (u.name === READ_PAGE_TOOL.name) {
          const url = String(input.url ?? "");
          if (!seen.has(url)) text = "You can only open URLs that came from your web_search results.";
          else if (reads >= 2) text = "No more page reads for this reply — answer with what you have.";
          else {
            reads++;
            text = await readPageText(url);
          }
        } else text = "Unknown tool.";
        results.push({ type: "tool_result", tool_use_id: u.id, content: text });
      }
      convo.push({ role: "user", content: results });
    }
  } catch (e) {
    const detail = e instanceof Error ? e.message : "Unknown error";
    return NextResponse.json({ error: `Orchestrator couldn't respond: ${detail}` }, { status: 502 });
  }
  const out = (block?.input ?? {}) as { reply?: string; ops?: unknown; store_changes?: unknown; product_changes?: unknown; new_products?: unknown; delete_products?: unknown; store_design?: unknown; create_content?: unknown; social_posts?: unknown; meta_ads?: unknown; draft_new_plan?: boolean; plan_note?: string; ask_approval?: boolean };
  // Only links the model was really shown by web_search can be cited.
  const cited = (Array.isArray((out as { sources?: unknown }).sources) ? ((out as { sources?: unknown[] }).sources as unknown[]) : [])
    .filter((u): u is string => typeof u === "string" && seen.has(u))
    .slice(0, 5);
  const sourcesText = cited.length ? `\n\nSources:\n${cited.map((u) => `- ${seen.get(u)} — ${u}`).join("\n")}` : "";
  const reply = stripMarkdown(typeof out.reply === "string" && out.reply.trim() ? out.reply : "Sorry, I had trouble responding.") + sourcesText;

  // --- Growth plan actions (draft a new plan / apply or propose edits) ---
  let opsState: string | null = null;
  let opsSummary: string[] | null = null;
  let pendingOps: string | null = null;
  let storeProposal: { pendingOps: string; opsSummary: string[] } | null = null;
  let planId: string | null = plan?.id ?? null;
  const ops = plan ? filterOpsForPlan(sanitizeOps(out.ops), plan) : [];
  const settingsNow = await prisma.business.findUnique({
    where: { id: businessId },
    select: { storeCurrency: true, shippingFee: true, freeShippingOver: true, taxRatePercent: true },
  });
  // Drop no-op settings (e.g. "currency → PKR" when it already is PKR) so a proposal never shows a fake change.
  const sameAsNow = (c: ReturnType<typeof sanitizeStoreChanges>[number]) =>
    (c.setting === "currency" && c.value === settingsNow?.storeCurrency) ||
    (c.setting === "shipping_fee" && c.value === settingsNow?.shippingFee) ||
    (c.setting === "free_shipping_over" && c.value === settingsNow?.freeShippingOver) ||
    (c.setting === "tax_rate_percent" && c.value === settingsNow?.taxRatePercent);
  const storeChanges = [
    ...sanitizeStoreChanges(out.store_changes).filter((c) => !sameAsNow(c)),
    ...(await sanitizeProductChanges(businessId, out.product_changes, out.new_products, out.delete_products)),
  ];
  const isLive = !!(await prisma.storeDesign.findUnique({ where: { businessId }, select: { published: true } }))?.published;
  const designJobs: DesignJob[] = sanitizeDesignJobs(out.store_design, isLive);
  const studioJobs = await sanitizeStudioRequests(businessId, out.create_content);
  const metaOps = await sanitizeMetaOps(businessId, out.social_posts, out.meta_ads);
  try {
    if (out.draft_new_plan === true) {
      const drafted = await draftGrowthPlan(businessId, out.plan_note || message.trim());
      planId = drafted.planId;
      opsState = "applied";
      opsSummary = ["Drafted a new growth plan — it's next to the chat."];
    } else if (plan && ops.length) {
      if (plan.status === "active") {
        opsState = "pending";
        pendingOps = JSON.stringify(ops);
        opsSummary = describeOps(ops, plan);
      } else {
        const applied = await applyPlanOps(businessId, plan.id, ops);
        if (applied.length) {
          opsState = "applied";
          opsSummary = applied;
        }
      }
    }
  } catch (e) {
    opsSummary = [`Couldn't update the plan: ${e instanceof Error ? e.message : "unknown error"}`];
    opsState = "failed";
  }
  // Store-setting changes touch the live store — always a proposal, whatever the plan state.
  if ((storeChanges.length || designJobs.length || studioJobs.length || metaOps.length) && opsState !== "failed") {
    const cur = (await prisma.business.findUnique({ where: { id: businessId }, select: { storeCurrency: true } }))?.storeCurrency || "usd";
    const storeSummary = [
      ...(await describeStoreChanges(businessId, storeChanges.filter((c) => c.op === "store_setting") as Parameters<typeof describeStoreChanges>[1])),
      ...(await describeProductChanges(businessId, storeChanges.filter((c) => c.op.startsWith("product_")) as Parameters<typeof describeProductChanges>[1], cur)),
      ...describeDesignJobs(designJobs),
      ...describeStudioRequests(studioJobs),
      ...describeMetaOps(metaOps, (await prisma.adCampaign.findFirst({ where: { businessId, currency: { not: null } }, orderBy: { createdAt: "desc" }, select: { currency: true } }))?.currency ?? cur.toUpperCase()),
    ];
    const allStoreOps = [...storeChanges, ...designJobs, ...studioJobs, ...metaOps];
    if (opsState === "pending") {
      pendingOps = JSON.stringify([...JSON.parse(pendingOps ?? "[]"), ...allStoreOps]);
      opsSummary = [...(opsSummary ?? []), ...storeSummary];
    } else if (opsState === "applied") {
      // Plan edits already applied this turn; the store change still needs its own Apply —
      // keep it on a separate message so the two states don't mix.
      storeProposal = { pendingOps: JSON.stringify(allStoreOps), opsSummary: storeSummary };
    } else {
      opsState = "pending";
      pendingOps = JSON.stringify(allStoreOps);
      opsSummary = storeSummary;
    }
  }
  const askApproval = plan?.status === "draft" && out.ask_approval === true && out.draft_new_plan !== true;

  const savedReply = await prisma.orchestratorMessage.create({
    data: {
      businessId,
      role: "assistant",
      speaker: "orchestrator",
      content: reply,
      planId,
      pendingOps,
      opsState,
      opsSummary: opsSummary ? JSON.stringify(opsSummary) : null,
      askApproval,
    },
  });
  newMessages.push({ id: savedReply.id, role: "assistant", content: reply, speaker: "orchestrator", needsUser: false, opsState, opsSummary, askApproval });
  if (storeProposal) {
    const content = "And the store change you asked for — press Apply to make it live.";
    const saved = await prisma.orchestratorMessage.create({
      data: { businessId, role: "assistant", speaker: "orchestrator", content, planId, pendingOps: storeProposal.pendingOps, opsState: "pending", opsSummary: JSON.stringify(storeProposal.opsSummary) },
    });
    newMessages.push({ id: saved.id, role: "assistant", content, speaker: "orchestrator", needsUser: false, opsState: "pending", opsSummary: storeProposal.opsSummary });
  }

  return NextResponse.json({ reply, messages: newMessages });
}
