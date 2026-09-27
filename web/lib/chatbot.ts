import { keepScript } from "@/lib/script-guard";
import { prisma } from "@/lib/prisma";
import { anthropic, MODEL_FAST } from "@/lib/anthropic";
import { estimateCostUsd } from "@/lib/pricing";
import { assertUnderUsageCap, UsageCapExceededError } from "@/lib/usage-limit";
import { safeSlice } from "@/lib/utils";
import { money } from "@/lib/money";

const SYSTEM_PREFIX = `You are the customer support chat assistant for this real online store. Answer only from the real business/product data given below — never invent a price, stock level, shipping policy, or promise you can't back up from this data. If you genuinely don't know something (like exact delivery time or a policy not listed here), say so honestly and suggest the customer contact the seller directly, rather than guessing. Keep replies short and conversational — 1-3 sentences unless the question genuinely needs more. Reply in the customer's own language AND script: Roman Urdu (Urdu in English letters) gets Roman Urdu in English letters, never Urdu script; Urdu script gets Urdu script; English gets English. Never discuss anything unrelated to this store.
Health, food and beauty products: never claim a product cures, treats or prevents a disease, never promise results, and never give medical advice or dosages beyond what the product description says — say what the product is, and tell the customer to ask their doctor about any health condition.`;

export interface ChatHistoryItem {
  role: "user" | "assistant";
  content: string;
}

export interface ChatbotReplyResult {
  reply: string;
  error?: string;
}

/** Best-effort — a conversation-log write failure should never block a real reply from reaching the customer. */
async function logMessage(businessId: string, channel: string, customerRef: string, role: "user" | "assistant", content: string) {
  try {
    await prisma.chatMessage.create({ data: { businessId, channel, customerRef, role, content } });
  } catch {
    // best-effort only
  }
}

/**
 * Real chatbot core, shared by the website widget and the WhatsApp inbound webhook — same real
 * grounding, same real usage-cap gate, same real cost tracking, regardless of channel. When a
 * real `channel`/`customerRef` is passed, both sides of the exchange are persisted so the seller
 * can actually see real customer conversations on /dashboard/inbox.
 */
export async function getChatbotReply(
  businessId: string,
  message: string,
  history: ChatHistoryItem[] = [],
  conversation?: { channel: "website" | "whatsapp" | "messenger" | "instagram"; customerRef: string },
): Promise<ChatbotReplyResult> {
  if (!process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_API_KEY === "paste_your_key_here") {
    return { reply: "Sorry, chat isn't available right now.", error: "Anthropic key not configured" };
  }

  const business = await prisma.business.findUnique({
    where: { id: businessId },
    include: { products: { include: { variants: true } }, pages: true, shippingZones: { orderBy: { priority: "asc" } } },
  });
  if (!business) return { reply: "Sorry, this store couldn't be found.", error: "Business not found" };

  try {
    await assertUnderUsageCap(businessId);
  } catch (e) {
    if (e instanceof UsageCapExceededError) {
      return { reply: "I'm not able to chat right now — please try again a bit later, or contact the seller directly." };
    }
    throw e;
  }

  const productBlock = business.products
    .map((p) => {
      // A product with options is in stock when ANY option is — its own stock field isn't used then.
      const inStock = p.variants.length ? p.variants.some((v) => v.stock > 0) : p.stock > 0;
      const variantText = p.variants.length
        ? ` Options: ${p.variants.map((v) => `${v.label} ${money(v.price ?? p.price, business.storeCurrency)} (${v.stock > 0 ? "in stock" : "out of stock"})`).join(", ")}.`
        : "";
      const stockText = p.variants.length ? (inStock ? "available" : "out of stock") : p.stock > 0 ? `${p.stock} in stock` : "out of stock";
      return `- ${p.name}: ${p.variants.length ? "from " : ""}${money(p.variants.length ? Math.min(...p.variants.map((v) => v.price ?? p.price)) : p.price, business.storeCurrency)}, ${stockText}.${variantText}${p.description ? ` ${safeSlice(p.description.replace(/<[^>]+>/g, " "), 200)}` : ""}`;
    })
    .join("\n");
  const pagesBlock = business.pages.map((pg) => `- ${pg.title}: ${safeSlice(pg.content.replace(/<[^>]+>/g, " "), 300)}`).join("\n");

  const cur = business.storeCurrency;
  const zoneLines = business.shippingZones.map((z) => {
    let cities: string[] = [];
    try {
      cities = JSON.parse(z.cities) as string[];
    } catch {}
    return `- ${z.name} (${cities.slice(0, 12).join(", ")}): ${money(z.fee, cur)}${z.freeOver != null ? `, free over ${money(z.freeOver, cur)}` : ""}`;
  });
  const deliveryBlock = [
    `Delivery fee: ${business.shippingFee > 0 ? money(business.shippingFee, cur) : "free"}${business.freeShippingOver != null ? `; free on orders over ${money(business.freeShippingOver, cur)}` : ""}${zoneLines.length ? " (for cities not listed below)" : ""}.`,
    ...(zoneLines.length ? ["City-wise delivery fees:", ...zoneLines] : []),
    `Payment: ${business.paymentProvider === "stripe" ? "card online" : business.paymentProvider === "both" ? "cash on delivery or card online" : "cash on delivery"}.`,
  ].join("\n");

  // Only offers that apply by themselves at checkout — a code the seller hands out privately
  // (win-back, a partner's audience) must not be given to anyone who asks the chat.
  const now = new Date();
  const autoOffers = await prisma.coupon.findMany({
    where: { businessId, active: true, autoApply: true, OR: [{ expiresAt: null }, { expiresAt: { gt: now } }] },
    take: 5,
  });
  const offerLines = autoOffers
    .filter((c) => c.usageLimit == null || c.usedCount < c.usageLimit)
    .map((c) => {
      const off = c.type === "percent" ? `${c.value}% off` : `${money(c.value, cur)} off`;
      const bits = [c.minSubtotal ? `on orders over ${money(c.minSubtotal, cur)}` : "", c.firstOrderOnly ? "first order only" : "", c.freeShipping ? "free delivery" : ""].filter(Boolean);
      return `- ${off}${bits.length ? ` (${bits.join(", ")})` : ""}, applied automatically at checkout${c.expiresAt ? `, until ${c.expiresAt.toISOString().slice(0, 10)}` : ""}`;
    });
  const offersBlock = offerLines.length
    ? ["Offers running now:", ...offerLines].join("\n")
    : "Offers: none that apply automatically right now.";

  const context = `Store: ${business.name}, sells: ${business.niche}.
${deliveryBlock}
${offersBlock}
Discount codes: never invent or guess a code. If asked, mention the offers above; for a code, say the seller shares codes on their own channels.
Real products currently in the catalog:
${productBlock || "No products listed yet."}
${pagesBlock ? `\nReal store pages (policies, about, etc.):\n${pagesBlock}` : ""}`;

  const orderedHistory = history.slice(-10);

  let msg;
  try {
    msg = await anthropic.messages.create({
      model: MODEL_FAST,
      max_tokens: 300,
      system: `${SYSTEM_PREFIX}\n\n${context}`,
      messages: [...orderedHistory.map((m) => ({ role: m.role, content: m.content })), { role: "user" as const, content: message.trim() }],
    });
  } catch (e) {
    return { reply: "Sorry, I had trouble responding — try again?", error: e instanceof Error ? e.message : "Unknown error" };
  }

  await prisma.agentUsage.create({
    data: {
      businessId,
      agentId: "chatbot",
      model: MODEL_FAST,
      inputTokens: msg.usage.input_tokens,
      outputTokens: msg.usage.output_tokens,
      costUsd: estimateCostUsd(MODEL_FAST, msg.usage.input_tokens, msg.usage.output_tokens),
    },
  });

  const raw = await keepScript(message, msg.content[0].type === "text" ? msg.content[0].text.trim() : "", businessId, "chatbot") || "Sorry, I had trouble responding — try again?";
  // Chat bubbles show plain text, so markdown "**Rs 750**" would show its asterisks. WhatsApp has
  // its own bold (*Rs 750*); everywhere else just drop the marks.
  const reply = raw
    .replace(/\*\*([^*\n]+)\*\*/g, conversation?.channel === "whatsapp" ? "*$1*" : "$1")
    .replace(/^#{1,6}\s+/gm, "");

  if (conversation) {
    await logMessage(businessId, conversation.channel, conversation.customerRef, "user", message.trim());
    await logMessage(businessId, conversation.channel, conversation.customerRef, "assistant", reply);
  }

  return { reply };
}
