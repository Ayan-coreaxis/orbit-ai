import { prisma } from "@/lib/prisma";
import { easypaisaHashKeyValid, type EasypaisaCreds, type JazzcashCreds } from "@/lib/pk-wallets";
import { paymentOptions } from "@/lib/store-stripe";
import type { PaymentMethod, WalletProvider } from "@/lib/payment-methods";

export interface StoreWallets {
  currency: string;
  jazzcash: JazzcashCreds | null;
  easypaisa: EasypaisaCreds | null;
}

/**
 * The SELLER's own JazzCash / Easypaisa merchant accounts — money goes straight to them, never
 * through the platform. A wallet is null until every credential it needs is saved.
 */
export async function getStoreWallets(businessId: string): Promise<StoreWallets | null> {
  const b = await prisma.business.findUnique({
    where: { id: businessId },
    select: {
      storeCurrency: true,
      jazzcashMerchantId: true,
      jazzcashPassword: true,
      jazzcashIntegritySalt: true,
      jazzcashSandbox: true,
      easypaisaStoreId: true,
      easypaisaHashKey: true,
      easypaisaSandbox: true,
    },
  });
  if (!b) return null;
  return {
    currency: (b.storeCurrency || "usd").toLowerCase(),
    jazzcash:
      b.jazzcashMerchantId && b.jazzcashPassword && b.jazzcashIntegritySalt
        ? { merchantId: b.jazzcashMerchantId, password: b.jazzcashPassword, integritySalt: b.jazzcashIntegritySalt, sandbox: b.jazzcashSandbox }
        : null,
    easypaisa:
      b.easypaisaStoreId && b.easypaisaHashKey && easypaisaHashKeyValid(b.easypaisaHashKey)
        ? { storeId: b.easypaisaStoreId, hashKey: b.easypaisaHashKey, sandbox: b.easypaisaSandbox }
        : null,
  };
}

/** Wallets the storefront may offer: configured ones, and only on a PKR store (both wallets charge rupees). */
export function walletOptions(w: StoreWallets | null): WalletProvider[] {
  if (!w || w.currency !== "pkr") return [];
  const out: WalletProvider[] = [];
  if (w.jazzcash) out.push("jazzcash");
  if (w.easypaisa) out.push("easypaisa");
  return out;
}

/** Every method checkout offers, in display order — cash on delivery / card first, then wallets. */
export function allPaymentOptions(provider: string | null | undefined, stripeReady: boolean, w: StoreWallets | null): PaymentMethod[] {
  return [...paymentOptions(provider, stripeReady), ...walletOptions(w)];
}
