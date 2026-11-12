/**
 * Payment method names shared by the server and the storefront widgets. No Node imports here —
 * the cart (a client component) reads this file too.
 */
export type WalletProvider = "jazzcash" | "easypaisa";
export type PaymentMethod = "cod" | "stripe" | WalletProvider;

export const WALLET_PROVIDERS: WalletProvider[] = ["jazzcash", "easypaisa"];

export function isWalletProvider(p: string | null | undefined): p is WalletProvider {
  return p === "jazzcash" || p === "easypaisa";
}

/** Paid online before it ships (card or wallet) — as opposed to cash on delivery. */
export function isOnlinePayment(p: string | null | undefined): boolean {
  return p === "stripe" || isWalletProvider(p);
}

/** Short name for dashboards, invoices and the order page. */
export function paymentMethodLabel(p: string | null | undefined): string {
  if (p === "stripe") return "Card";
  if (p === "jazzcash") return "JazzCash";
  if (p === "easypaisa") return "Easypaisa";
  return "Cash on delivery";
}

/** Last 4 characters of a saved credential, for "saved ••••1234" — never the whole value. */
export function last4(v: string | null | undefined): string | null {
  const s = (v ?? "").trim();
  if (!s) return null;
  return s.length <= 4 ? "•".repeat(s.length) : s.slice(-4);
}

export interface WalletRow {
  jazzcashMerchantId: string | null;
  jazzcashPassword: string | null;
  jazzcashIntegritySalt: string | null;
  jazzcashSandbox: boolean;
  easypaisaStoreId: string | null;
  easypaisaHashKey: string | null;
  easypaisaSandbox: boolean;
}

/** What the dashboard may know about saved wallet credentials: that they're saved, and their last 4 characters. */
export function walletStatus(b: WalletRow | null | undefined) {
  return {
    jazzcash: {
      configured: !!(b?.jazzcashMerchantId && b.jazzcashPassword && b.jazzcashIntegritySalt),
      sandbox: b?.jazzcashSandbox ?? true,
      merchantIdLast4: last4(b?.jazzcashMerchantId),
      passwordLast4: last4(b?.jazzcashPassword),
      integritySaltLast4: last4(b?.jazzcashIntegritySalt),
    },
    easypaisa: {
      configured: !!(b?.easypaisaStoreId && b.easypaisaHashKey),
      sandbox: b?.easypaisaSandbox ?? true,
      storeIdLast4: last4(b?.easypaisaStoreId),
      hashKeyLast4: last4(b?.easypaisaHashKey),
    },
  };
}
