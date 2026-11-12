import { prisma } from "@/lib/prisma";
import { MAX_DM_CHARS, MAX_PUBLIC_REPLY_CHARS, normalizeKeywords } from "@/lib/comment-dm-rules";

/** A comment-to-DM rule as the seller's screen shows it. */
export interface CommentRuleView {
  id: string;
  keywords: string[];
  postId: string | null;
  dmText: string;
  productId: string | null;
  productName: string | null;
  publicReply: string | null;
  active: boolean;
  sent: number;
}

type Row = { id: string; keywords: string; postId: string | null; dmText: string; productId: string | null; publicReply: string | null; active: boolean; product: { name: string } | null };

function view(r: Row, sent = 0): CommentRuleView {
  let keywords: string[] = [];
  try {
    keywords = normalizeKeywords(JSON.parse(r.keywords));
  } catch {
    /* unreadable → no keywords */
  }
  return { id: r.id, keywords, postId: r.postId, dmText: r.dmText, productId: r.productId, productName: r.product?.name ?? null, publicReply: r.publicReply, active: r.active, sent };
}

const include = { product: { select: { name: true } } } as const;

export async function listCommentRules(businessId: string): Promise<CommentRuleView[]> {
  const [rows, counts] = await Promise.all([
    prisma.commentRule.findMany({ where: { businessId }, orderBy: { createdAt: "desc" }, include }),
    prisma.commentDmLog.groupBy({ by: ["ruleId"], where: { businessId, status: "sent" }, _count: { _all: true } }),
  ]);
  const sent = new Map(counts.map((c) => [c.ruleId, c._count._all]));
  return rows.map((r) => view(r, sent.get(r.id) ?? 0));
}

export interface RuleInput {
  keywords?: unknown;
  postId?: unknown;
  dmText?: unknown;
  productId?: unknown;
  publicReply?: unknown;
  active?: unknown;
}

/** Validate what the seller sent. `partial` = an edit: only the fields present are checked. */
async function clean(businessId: string, input: RuleInput, partial: boolean) {
  const data: { keywords?: string; postId?: string | null; dmText?: string; productId?: string | null; publicReply?: string | null; active?: boolean } = {};

  if (!partial || input.keywords !== undefined) {
    const keywords = normalizeKeywords(input.keywords);
    if (keywords.length === 0) throw new Error("Add at least one keyword.");
    data.keywords = JSON.stringify(keywords);
  }
  if (!partial || input.dmText !== undefined) {
    const dmText = typeof input.dmText === "string" ? input.dmText.trim() : "";
    if (!dmText) throw new Error("Write the message to send.");
    if (dmText.length > MAX_DM_CHARS) throw new Error(`Keep the message under ${MAX_DM_CHARS} characters.`);
    data.dmText = dmText;
  }
  if (input.productId !== undefined) {
    const productId = typeof input.productId === "string" && input.productId ? input.productId : null;
    if (productId && !(await prisma.product.findFirst({ where: { id: productId, businessId }, select: { id: true } }))) throw new Error("That product isn't in your store.");
    data.productId = productId;
  }
  if (input.postId !== undefined) {
    const postId = typeof input.postId === "string" ? input.postId.trim() : "";
    if (postId && !/^\d{5,40}$/.test(postId)) throw new Error("The post id is the long number Instagram gives a post.");
    data.postId = postId || null;
  }
  if (input.publicReply !== undefined) {
    const reply = typeof input.publicReply === "string" ? input.publicReply.trim().slice(0, MAX_PUBLIC_REPLY_CHARS) : "";
    data.publicReply = reply || null;
  }
  if (typeof input.active === "boolean") data.active = input.active;
  return data;
}

export async function createCommentRule(businessId: string, input: RuleInput): Promise<CommentRuleView> {
  const data = await clean(businessId, input, false);
  const row = await prisma.commentRule.create({
    data: { businessId, keywords: data.keywords!, dmText: data.dmText!, postId: data.postId ?? null, productId: data.productId ?? null, publicReply: data.publicReply ?? null, active: data.active ?? true },
    include,
  });
  return view(row);
}

export async function updateCommentRule(businessId: string, id: string, input: RuleInput): Promise<CommentRuleView | null> {
  const existing = await prisma.commentRule.findFirst({ where: { id, businessId }, select: { id: true } });
  if (!existing) return null;
  const row = await prisma.commentRule.update({ where: { id }, data: await clean(businessId, input, true), include });
  const sent = await prisma.commentDmLog.count({ where: { businessId, ruleId: id, status: "sent" } });
  return view(row, sent);
}

export async function deleteCommentRule(businessId: string, id: string): Promise<boolean> {
  return (await prisma.commentRule.deleteMany({ where: { id, businessId } })).count > 0;
}
