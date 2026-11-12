import { createCipheriv, createHmac, timingSafeEqual } from "node:crypto";

/**
 * JazzCash and Easypaisa hosted checkout on the SELLER's own merchant account — the pure parts:
 * building the form a shopper's browser posts to the wallet, and checking what comes back.
 * Nothing here touches the database; an order is only ever marked paid by a caller that got
 * `ok: true` from one of the verify functions below.
 *
 * What the signing schemes were checked against (2026-11, no official PDF is public):
 *
 * JazzCash "Page Redirection" v1.1 — pp_SecureHash = HMAC-SHA256, key = Integrity Salt, message =
 *   salt + "&" + the values of every non-empty field whose name starts with "pp" (pp_* and
 *   ppmpf_*, never pp_SecureHash itself) sorted by field name and joined with "&"; hex digest.
 *   Sources that agree on this: github.com/icodedigita/jazzcash-toolkit (README: "sorted by name,
 *   joined with &, prefixed with the salt … HMAC-SHA256 with the salt as key, uppercase hex",
 *   checked by its authors against the gateway's swagger), github.com/hbtech-dev/JZ-integartion-Live
 *   (src/lib/jazzcash/crypto.ts — same rule, non-empty "pp" fields, uppercase),
 *   github.com/theYahia/jazzcash-mcp (same rule, lowercase hex). Sources differ only on hex case,
 *   so we SEND uppercase and COMPARE case-insensitively. JazzCash publishes no public test vector
 *   we could find; the tests pin the algorithm with an independently assembled message.
 *
 * Easypaisa "Easypay" hosted checkout — merchantHashedReq = base64( AES/ECB/PKCS5 of
 *   "amount=..&autoRedirect=..&…&storeId=.." (the posted parameters, sorted by name, key=value
 *   joined with "&") with the merchant's Hash Key as the AES key ). Two-step flow: Index.jsf →
 *   back to postBackURL with auth_token → post auth_token + postBackURL to Confirm.jsf → back to
 *   postBackURL with status / desc / orderRefNumber. Source: Easypay's PHP sample as shipped in
 *   github.com/FahadYousafMahar/Easypay-WHMCS-Gateway (EasyPay.php getHashedRequest +
 *   callback/EasyPay.php), which also shows the IPN: Easypaisa calls the merchant's IPN address
 *   with ?url=<an https address on Easypaisa's own host>; the merchant fetches it and reads JSON
 *   (transaction_status "PAID", store_id, order_id, transaction_amount).
 *   The final browser redirect is NOT signed, so it never marks an order paid — only the IPN does.
 */

// ───────────────────────── shared ─────────────────────────

const PKT_OFFSET_MS = 5 * 60 * 60 * 1000; // Pakistan is UTC+5 all year (no daylight saving)

function pktParts(d: Date): { date: string; time: string } {
  const p = new Date(d.getTime() + PKT_OFFSET_MS);
  const two = (n: number) => String(n).padStart(2, "0");
  return {
    date: `${p.getUTCFullYear()}${two(p.getUTCMonth() + 1)}${two(p.getUTCDate())}`,
    time: `${two(p.getUTCHours())}${two(p.getUTCMinutes())}${two(p.getUTCSeconds())}`,
  };
}

/** yyyyMMddHHmmss in Pakistan time — JazzCash's pp_TxnDateTime format. */
export function pktStamp(d: Date): string {
  const p = pktParts(d);
  return p.date + p.time;
}

/** Rupees → paisa, the unit JazzCash's pp_Amount uses (Rs 1,499.50 → 149950). */
export function toPaisa(amount: number): number {
  return Math.round(amount * 100);
}

/** The last 10 characters of an order id — the part both wallets' references carry. */
export function orderTail(orderId: string): string {
  return orderId.slice(-10);
}

function safeEqual(a: string, b: string): boolean {
  const x = Buffer.from(a, "utf8");
  const y = Buffer.from(b, "utf8");
  return x.length === y.length && timingSafeEqual(x, y);
}

// ───────────────────────── JazzCash ─────────────────────────

export const JAZZCASH_FORM_URL = {
  sandbox: "https://sandbox.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
  live: "https://payments.jazzcash.com.pk/CustomerPortal/transactionmanagement/merchantform/",
} as const;

export interface JazzcashCreds {
  merchantId: string;
  password: string;
  integritySalt: string;
  sandbox: boolean;
}

/** pp_SecureHash for a request or a response (see the file header for the rule and its sources). */
export function jazzcashSecureHash(fields: Record<string, string | undefined | null>, integritySalt: string): string {
  if (!integritySalt) throw new Error("JazzCash Integrity Salt is missing.");
  const names = Object.keys(fields)
    .filter((k) => k.startsWith("pp") && k !== "pp_SecureHash" && fields[k] != null && fields[k] !== "")
    .sort(); // plain code-unit order — the same order PHP's ksort gives these ASCII names
  const message = [integritySalt, ...names.map((k) => String(fields[k]))].join("&");
  return createHmac("sha256", integritySalt).update(message, "utf8").digest("hex").toUpperCase();
}

/**
 * pp_TxnRefNo — unique per attempt, 20 characters or fewer, letters and digits only:
 * "T" + the order id's last 10 characters + the time in base 36.
 */
export function jazzcashTxnRef(orderId: string, now: Date): string {
  return `T${orderTail(orderId)}${now.getTime().toString(36)}`.toUpperCase().slice(0, 20);
}

function jazzcashRefPrefix(orderId: string): string {
  return `T${orderTail(orderId)}`.toUpperCase();
}

/** The hidden form fields for JazzCash's hosted page, signed. `amount` is in rupees. */
export function buildJazzcashFields(input: {
  creds: JazzcashCreds;
  orderId: string;
  amount: number;
  returnUrl: string;
  now: Date;
}): Record<string, string> {
  const { creds, orderId, amount, returnUrl, now } = input;
  const number = orderId.slice(-6).toUpperCase();
  const fields: Record<string, string> = {
    pp_Version: "1.1",
    pp_TxnType: "", // empty = JazzCash's page offers every method this merchant account has
    pp_Language: "EN",
    pp_MerchantID: creds.merchantId,
    pp_SubMerchantID: "",
    pp_Password: creds.password,
    pp_BankID: "",
    pp_ProductID: "",
    pp_TxnRefNo: jazzcashTxnRef(orderId, now),
    pp_Amount: String(toPaisa(amount)),
    pp_TxnCurrency: "PKR",
    pp_TxnDateTime: pktStamp(now),
    pp_BillReference: `ord${orderTail(orderId)}`,
    pp_Description: `Order ${number}`,
    pp_TxnExpiryDateTime: pktStamp(new Date(now.getTime() + 60 * 60 * 1000)),
    pp_ReturnURL: returnUrl,
    ppmpf_1: orderId, // echoed back inside the signed response — how the return handler finds the order
    ppmpf_2: "",
    ppmpf_3: "",
    ppmpf_4: "",
    ppmpf_5: "",
  };
  fields.pp_SecureHash = jazzcashSecureHash(fields, creds.integritySalt);
  return fields;
}

export type WalletVerdict =
  | { ok: true; ref: string }
  /** reason: "unverified" = can't trust the message; "declined" = the wallet said no; "mismatch" = it's about a different order or amount */
  | { ok: false; reason: "unverified" | "declined" | "mismatch"; detail: string };

/**
 * Is this JazzCash response a real, successful payment of exactly this order?
 * Order of checks matters: nothing in the response is believed until its hash checks out.
 */
export function verifyJazzcashReturn(
  fields: Record<string, string>,
  expect: { integritySalt: string; merchantId: string; orderId: string; amount: number },
): WalletVerdict {
  const got = (fields.pp_SecureHash ?? "").trim();
  if (!got || !expect.integritySalt) return { ok: false, reason: "unverified", detail: "No secure hash on the response." };
  const want = jazzcashSecureHash(fields, expect.integritySalt);
  if (!safeEqual(got.toUpperCase(), want)) return { ok: false, reason: "unverified", detail: "Secure hash doesn't match." };

  if (fields.pp_ResponseCode !== "000")
    return { ok: false, reason: "declined", detail: `JazzCash code ${String(fields.pp_ResponseCode ?? "").slice(0, 8) || "missing"}` };

  if (fields.pp_MerchantID && fields.pp_MerchantID !== expect.merchantId)
    return { ok: false, reason: "mismatch", detail: "Different merchant." };
  if (fields.ppmpf_1 !== expect.orderId) return { ok: false, reason: "mismatch", detail: "Different order." };
  const ref = fields.pp_TxnRefNo ?? "";
  if (!ref.toUpperCase().startsWith(jazzcashRefPrefix(expect.orderId)))
    return { ok: false, reason: "mismatch", detail: "Transaction reference isn't this order's." };
  if (!/^\d+$/.test(fields.pp_Amount ?? "") || Number(fields.pp_Amount) !== toPaisa(expect.amount))
    return { ok: false, reason: "mismatch", detail: "Amount doesn't match the order total." };
  if (fields.pp_TxnCurrency && fields.pp_TxnCurrency !== "PKR") return { ok: false, reason: "mismatch", detail: "Not PKR." };

  return { ok: true, ref };
}

// ───────────────────────── Easypaisa ─────────────────────────

export const EASYPAISA_HOST = {
  sandbox: "easypaystg.easypaisa.com.pk",
  live: "easypay.easypaisa.com.pk",
} as const;

export interface EasypaisaCreds {
  storeId: string;
  hashKey: string;
  sandbox: boolean;
}

export function easypaisaUrls(sandbox: boolean): { index: string; confirm: string } {
  const host = sandbox ? EASYPAISA_HOST.sandbox : EASYPAISA_HOST.live;
  return { index: `https://${host}/easypay/Index.jsf`, confirm: `https://${host}/easypay/Confirm.jsf` };
}

/** AES needs a 16, 24 or 32 byte key — Easypaisa's Hash Key is one of those lengths. */
export function easypaisaHashKeyValid(hashKey: string): boolean {
  return [16, 24, 32].includes(Buffer.byteLength(hashKey ?? "", "utf8"));
}

/** Easypay takes the amount with one decimal ("1499.5"). The same rounded figure is what must come back. */
export function easypaisaAmount(amount: number): string {
  return amount.toFixed(1);
}

/** "yyyyMMdd HHmmss" in Pakistan time — when an unpaid Easypay order expires (one day on). */
export function easypaisaExpiry(now: Date): string {
  const p = pktParts(new Date(now.getTime() + 24 * 60 * 60 * 1000));
  return `${p.date} ${p.time}`;
}

/** orderRefNum — the order id's last 10 characters + a short per-attempt suffix (letters and digits only). */
export function easypaisaOrderRef(orderId: string, now: Date): string {
  return `${orderTail(orderId)}${Math.floor(now.getTime() / 1000).toString(36).slice(-5)}`;
}

/** merchantHashedReq (see the file header for the scheme and its source). */
export function easypaisaHashedRequest(params: Record<string, string>, hashKey: string): string {
  if (!easypaisaHashKeyValid(hashKey)) throw new Error("Easypaisa Hash Key must be 16, 24 or 32 characters.");
  const key = Buffer.from(hashKey, "utf8");
  const text = Object.keys(params)
    .sort()
    .map((k) => `${k}=${params[k]}`)
    .join("&");
  const cipher = createCipheriv(`aes-${key.length * 8}-ecb`, key, null); // ECB has no IV; Node pads PKCS#7 (= PKCS5 here)
  return Buffer.concat([cipher.update(text, "utf8"), cipher.final()]).toString("base64");
}

/** A Pakistani mobile number as 03XXXXXXXXX, or null when it isn't one. */
export function pkMobile(phone: string | null | undefined): string | null {
  const d = (phone ?? "").replace(/\D/g, "");
  const m = /^(?:0092|92|0)?(3\d{9})$/.exec(d);
  return m ? `0${m[1]}` : null;
}

/** The hidden form fields for Easypay's Index.jsf, with merchantHashedReq. `amount` is in rupees. */
export function buildEasypaisaFields(input: {
  creds: EasypaisaCreds;
  orderId: string;
  amount: number;
  postBackUrl: string;
  email?: string | null;
  phone?: string | null;
  now: Date;
}): Record<string, string> {
  const { creds, orderId, amount, postBackUrl, now } = input;
  // exactly the parameters that are posted are the ones that are hashed — optional ones only when we have them
  const params: Record<string, string> = {
    amount: easypaisaAmount(amount),
    autoRedirect: "1",
    expiryDate: easypaisaExpiry(now),
    orderRefNum: easypaisaOrderRef(orderId, now),
    postBackURL: postBackUrl,
    storeId: creds.storeId,
  };
  const email = (input.email ?? "").trim();
  if (email && /^[^\s@&=]+@[^\s@&=]+$/.test(email)) params.emailAddr = email;
  const mobile = pkMobile(input.phone);
  if (mobile) params.mobileNum = mobile;
  return { ...params, merchantHashedReq: easypaisaHashedRequest(params, creds.hashKey) };
}

/**
 * The IPN hands us an address to fetch the payment's details from. Only an https address on
 * Easypaisa's own host (for the mode this seller is in) is ever fetched.
 */
export function easypaisaIpnUrlAllowed(raw: string, sandbox: boolean): boolean {
  let u: URL;
  try {
    u = new URL(raw);
  } catch {
    return false;
  }
  const host = sandbox ? EASYPAISA_HOST.sandbox : EASYPAISA_HOST.live;
  return u.protocol === "https:" && u.hostname === host && !u.port && !u.username && !u.password;
}

/** The order-id tail an Easypaisa orderRefNum / IPN order_id carries, or null when it isn't one of ours. */
export function easypaisaRefTail(ref: unknown): string | null {
  const s = typeof ref === "string" || typeof ref === "number" ? String(ref).trim() : "";
  return /^[a-z0-9]{11,20}$/i.test(s) ? s.slice(0, 10) : null;
}

/**
 * Is this payment record (fetched by us from Easypaisa's own host) a completed payment of exactly
 * this order? `response_code`, when Easypaisa includes it, must be "0000".
 */
export function verifyEasypaisaIpn(
  body: unknown,
  expect: { storeId: string; orderId: string; amount: number },
): WalletVerdict {
  if (!body || typeof body !== "object" || Array.isArray(body)) return { ok: false, reason: "unverified", detail: "Not a payment record." };
  const b = body as Record<string, unknown>;
  const str = (v: unknown) => (typeof v === "string" || typeof v === "number" ? String(v).trim() : "");

  if (str(b.transaction_status).toUpperCase() !== "PAID")
    return { ok: false, reason: "declined", detail: `Easypaisa status ${str(b.transaction_status).slice(0, 20) || "missing"}` };
  if (b.response_code != null && str(b.response_code) !== "0000")
    return { ok: false, reason: "declined", detail: `Easypaisa code ${str(b.response_code).slice(0, 8)}` };

  if (str(b.store_id) !== expect.storeId) return { ok: false, reason: "mismatch", detail: "Different store." };
  const ref = str(b.order_id);
  if (easypaisaRefTail(ref) !== orderTail(expect.orderId)) return { ok: false, reason: "mismatch", detail: "Different order." };
  const paid = Number(str(b.transaction_amount));
  if (!str(b.transaction_amount) || !Number.isFinite(paid) || Math.abs(paid - Number(easypaisaAmount(expect.amount))) > 0.01)
    return { ok: false, reason: "mismatch", detail: "Amount doesn't match the order total." };

  return { ok: true, ref };
}

// ───────────────────────── the page that sends the shopper off ─────────────────────────

function esc(s: string): string {
  return s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;").replace(/'/g, "&#39;");
}

/** A tiny page that posts `fields` to the wallet straight away (with a button if scripts are off). */
export function autoSubmitPage(action: string, fields: Record<string, string>, walletName: string): string {
  const inputs = Object.entries(fields)
    .map(([k, v]) => `<input type="hidden" name="${esc(k)}" value="${esc(v)}">`)
    .join("");
  return `<!doctype html><html lang="en"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><meta name="robots" content="noindex"><title>Taking you to ${esc(walletName)}…</title><style>body{font-family:system-ui,sans-serif;display:grid;place-items:center;min-height:100vh;margin:0;color:#222;background:#fafafa}main{text-align:center;padding:24px}button{margin-top:16px;padding:10px 18px;font-size:15px;border-radius:8px;border:1px solid #222;background:#222;color:#fff;cursor:pointer}</style></head><body><main><p>Taking you to ${esc(walletName)} to pay…</p><form id="f" method="post" action="${esc(action)}">${inputs}<noscript><button type="submit">Continue to ${esc(walletName)}</button></noscript></form></main><script>document.getElementById("f").submit()</script></body></html>`;
}
