import { prisma } from "@/lib/prisma";
import { GRAPH_BASE } from "@/lib/meta-oauth";
import { money } from "@/lib/money";
import { publicStoreUrl } from "@/lib/public-url";
import { MAX_PUBLIC_REPLY_CHARS, decideSend, fillTemplate, normalizeKeywords, pickRule } from "@/lib/comment-dm-rules";

/**
 * Instagram comment-to-DM. Meta delivers each new comment on the seller's posts to
 * /api/webhooks/meta (object "instagram", field "comments"). When the comment holds one of the
 * seller's keywords, Orbit sends the commenter a private reply from the seller's own account
 * (POST /{ig-user-id}/messages, recipient { comment_id }) and, if the rule says so, a short public
 * reply under the comment (POST /{comment-id}/replies). Meta allows one private reply per comment,
 * within 7 days of it. Product name, price and link come from the seller's real product.
 * Needs instagram_manage_comments + instagram_manage_messages (App Review for non-testers).
 */

type Fetch = typeof fetch;

export interface CommentChange {
  field?: string;
  value?: {
    id?: string;
    text?: string;
    parent_id?: string;
    from?: { id?: string; username?: string };
    media?: { id?: string };
  };
}

export type CommentOutcome = { commentId: string; result: "sent" | "failed" | "no_rule" | "own_comment" | "duplicate" | "rate_limited" | "empty"; error?: string };

async function graphPost(path: string, token: string, body: Record<string, unknown>, f: Fetch): Promise<{ ok: boolean; data: Record<string, unknown>; error?: string }> {
  const res = await f(`${GRAPH_BASE}/${path}?access_token=${encodeURIComponent(token)}`, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(body),
    signal: AbortSignal.timeout(20000),
  }).catch(() => null);
  if (!res) return { ok: false, data: {}, error: "Couldn't reach Meta." };
  const data = (await res.json().catch(() => ({}))) as Record<string, unknown> & { error?: { message?: string } };
  if (res.ok && !data.error) return { ok: true, data };
  return { ok: false, data, error: data.error?.message ?? `Meta error ${res.status}` };
}

function parseKeywords(json: string): string[] {
  try {
    return normalizeKeywords(JSON.parse(json));
  } catch {
    return [];
  }
}

const isUniqueViolation = (e: unknown) => typeof e === "object" && e !== null && (e as { code?: string }).code === "P2002";

/** Handle the "comments" changes of one Instagram webhook entry. */
export async function handleInstagramComments(igUserId: string, changes: CommentChange[], f: Fetch = fetch, now: () => Date = () => new Date()): Promise<CommentOutcome[]> {
  const comments = changes.filter((c) => c.field === "comments" && c.value?.id && c.value.from?.id);
  if (comments.length === 0) return [];

  const business = await prisma.business.findFirst({
    where: { metaInstagramUserId: igUserId },
    select: { id: true, storeCurrency: true, metaAccessToken: true, metaPageId: true, metaInstagramUserId: true },
  });
  if (!business?.metaAccessToken) return [];
  const token = business.metaAccessToken;

  const rows = await prisma.commentRule.findMany({ where: { businessId: business.id, active: true }, orderBy: { createdAt: "asc" } });
  if (rows.length === 0) return [];
  const rules = rows.map((r) => ({ ...r, keywords: parseKeywords(r.keywords) }));

  const out: CommentOutcome[] = [];
  for (const c of comments) {
    const v = c.value!;
    const commentId = v.id!;
    const commenterId = v.from!.id!;
    const text = (v.text ?? "").trim();
    const ownIds = [business.metaInstagramUserId, business.metaPageId];

    // The seller's own comments (and Orbit's public replies, which come back as comments) never trigger a DM.
    if (!decideSend({ commenterId, ownIds, alreadyHandled: false, priorSentAt: [], now: now() }).send) {
      out.push({ commentId, result: "own_comment" });
      continue;
    }
    const match = pickRule(rules, text, v.media?.id ?? null);
    if (!match) {
      out.push({ commentId, result: "no_rule" });
      continue;
    }

    // Claim the comment first: the unique (businessId, commentId) row makes a redelivery a no-op.
    let logId: string;
    try {
      logId = (
        await prisma.commentDmLog.create({
          data: { businessId: business.id, ruleId: match.rule.id, commentId, commenterId, commenterName: v.from?.username ?? null },
          select: { id: true },
        })
      ).id;
    } catch (e) {
      if (!isUniqueViolation(e)) throw e;
      out.push({ commentId, result: "duplicate" });
      continue;
    }
    const finish = async (status: "sent" | "failed" | "rate_limited", error?: string) => {
      await prisma.commentDmLog.update({ where: { id: logId }, data: { status, error: error?.slice(0, 500) ?? null } });
    };

    const prior = await prisma.commentDmLog.findMany({
      where: { businessId: business.id, commenterId, id: { not: logId }, status: { in: ["sent", "pending"] }, createdAt: { gte: new Date(now().getTime() - 24 * 3600_000) } },
      select: { createdAt: true },
    });
    const decision = decideSend({ commenterId, ownIds, alreadyHandled: false, priorSentAt: prior.map((p) => p.createdAt), now: now() });
    if (!decision.send) {
      await finish("rate_limited");
      out.push({ commentId, result: "rate_limited" });
      continue;
    }

    // Real values only: the rule's product (if it still exists) and the store's public address.
    const product = match.rule.productId
      ? await prisma.product.findFirst({ where: { id: match.rule.productId, businessId: business.id }, select: { id: true, name: true, price: true } })
      : null;
    const link = await publicStoreUrl(business.id, product ? `/product/${product.id}` : "");
    const dm = fillTemplate(match.rule.dmText, {
      product: product?.name ?? null,
      price: product ? money(product.price, business.storeCurrency) : null,
      link,
    });
    if (!dm) {
      await finish("failed", "The message was empty after filling it in.");
      out.push({ commentId, result: "empty" });
      continue;
    }

    const sent = await graphPost(`${igUserId}/messages`, token, { recipient: { comment_id: commentId }, message: { text: dm } }, f);
    if (!sent.ok) {
      await finish("failed", sent.error);
      out.push({ commentId, result: "failed", error: sent.error });
      continue;
    }
    await finish("sent");

    // Into the Inbox, in the same conversation the customer's own DMs land in.
    const customerRef = typeof sent.data.recipient_id === "string" && sent.data.recipient_id ? sent.data.recipient_id : commenterId;
    const who = v.from?.username ? `@${v.from.username} commented` : "Commented";
    const at = now();
    await prisma.chatMessage.createMany({
      data: [
        { businessId: business.id, channel: "instagram", customerRef, role: "user", content: `${who} on your Instagram post: "${text.slice(0, 500)}"`, createdAt: at },
        { businessId: business.id, channel: "instagram", customerRef, role: "assistant", content: dm, createdAt: new Date(at.getTime() + 1) },
      ],
    });

    const reply = match.rule.publicReply?.trim();
    if (reply) await graphPost(`${commentId}/replies`, token, { message: reply.slice(0, MAX_PUBLIC_REPLY_CHARS) }, f);
    out.push({ commentId, result: "sent" });
  }
  return out;
}
