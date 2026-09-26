/**
 * Every hardcoded string in the generic storefront "widgets" (checkout, cart, auth, account, track,
 * bundles, rewards) that a seller previously had zero control over — these live outside the Orbit
 * Design doc, so overriding them needs its own key/value store instead of HTML editing.
 *
 * `Business.widgetCopy` holds a JSON `Record<string,string>` of seller overrides keyed by DEFAULTS'
 * keys below; anything not present falls back to the shipped English default. Orbit Design's chat
 * agent edits this the same way it edits everything else — see `WIDGET_COPY_TOOL` in
 * lib/orbit-design-generate.ts.
 */

export const DEFAULT_WIDGET_COPY = {
  // checkout / cart (CartWidget.tsx)
  "cart.empty": "Your cart is empty",
  "cart.browse": "Browse {store}",
  "cart.continueToCheckout": "Continue to checkout",
  "cart.checkout": "Checkout",
  "cart.createAccountToContinue": "Save your details (optional)",
  "cart.benefit1": "Track this order and every order after it",
  "cart.benefit2": "Check out in one tap next time",
  "cart.benefit3": "Get updates on delivery by WhatsApp / email",
  "cart.skipGuest": "Skip — check out as a guest",
  "cart.guestCheckout": "Continue as guest",
  "cart.orAccount": "or save your details for next time",
  "cart.deliveryDetails": "Delivery details",
  "cart.discountCode": "Discount code",
  "cart.apply": "Apply",
  "cart.giftCard": "Gift card",
  "cart.usePoints": "Use my points",
  "cart.clear": "Clear",
  "cart.cod": "Cash on delivery",
  "cart.payByCard": "Pay by card",
  "cart.placingOrder": "Placing order…",
  "cart.placeOrder": "Place order · {total}",
  "cart.payAmount": "Pay {total}",
  "cart.codNote": "{store} calls to confirm before it ships.",
  "cart.confirmTitle": "One more step — confirm your order",
  "cart.cancellationNote": "You can cancel free within 48 hours.",
  "cart.keepShopping": "← Keep shopping",
  "cart.validationError": "Please fill in your name, phone, address and city.",
  "cart.networkError": "Network error — please try again.",
  "cart.orderPlacedLabel": "Order placed!",

  // order confirmation page (app/store/[businessId]/order/[orderId]/page.tsx)
  "order.placedHeading": "Order placed",
  "order.paymentPendingHeading": "Payment pending",
  "order.cancelledHeading": "Order cancelled",
  "order.numberLabel": "Order #{number}",

  // auth (AuthWidget.tsx)
  "auth.welcomeBack": "Welcome back",
  "auth.createAccount": "Create your account",
  "auth.textMeACode": "Text me a code",
  "auth.usePassword": "Use a password",
  "auth.sendCode": "Send code",
  "auth.signIn": "Sign in",
  "auth.createAccountBtn": "Create account",
  "auth.pleaseWait": "Please wait…",
  "auth.enterYourCode": "Enter your code",
  "auth.verifyAndSignIn": "Verify & sign in",
  "auth.useDifferentNumber": "← Use a different number",
  "auth.genericError": "Something went wrong.",
  "auth.networkError": "Network error — try again.",

  // account (AccountWidget.tsx / AccountDashboard.tsx)
  "account.hi": "Hi{name}",
  "account.signOut": "Sign out",
  "account.noOrders": "No orders yet.",
  "account.reorder": "Reorder",
  "account.cancelOrder": "Cancel order",
  "account.cancelOrderConfirm": "Cancel this order?",
  "account.requestReturn": "Request a return",
  "account.returnReasonPrompt": "What's the reason for the return?",
  "account.returnStatus": "Return {status}",
  "account.noActiveTracking": "No active orders to track.",
  "account.addAddress": "+ Add an address",
  "account.setDefault": "Set default",
  "account.edit": "Edit",
  "account.delete": "Delete",
  "account.deleteAddressConfirm": "Delete this address?",
  "account.saveAddress": "Save address",
  "account.saveChanges": "Save changes",
  "account.saving": "Saving…",
  "account.saved": "Saved",
  "account.orderCancelled": "Order cancelled.",
  "account.returnSubmitted": "Return request submitted.",
  "account.cancelFailed": "Couldn't cancel.",
  "account.returnFailed": "Couldn't submit the return.",

  // order status labels (widget-ui.tsx's statusLabel(), used by TrackWidget/AccountWidget/AccountDashboard)
  "status.pending": "Order placed",
  "status.confirmed": "Confirmed",
  "status.shipped": "Shipped",
  "status.fulfilled": "Delivered",
  "status.cancelled": "Cancelled",

  // track (TrackWidget.tsx)
  "track.orderNumber": "Order number",
  "track.phoneOnOrder": "Phone on the order",
  "track.trackOrder": "Track order",
  "track.notFound": "Not found.",
  "track.networkError": "Network error.",
  "track.cancelled": "This order was cancelled.",

  // products / bundles (ProductWidget.tsx / BundlesWidget.tsx)
  "product.addToCart": "Add to cart",
  "product.added": "Added ✓",
  "product.selectOptions": "Select options",
  "product.notifyMe": "Notify me",
  "product.notifyThanks": "Thanks — we'll email you when it's back.",
  "bundles.heading": "Bundles & combo deals",
  "bundles.addBundle": "Add bundle to cart",
  "bundles.none": "No bundles right now — check back soon.",

  // rewards (RewardsWidget.tsx)
  "rewards.yourBalance": "Your balance",
  "rewards.noActivity": "No activity yet — start earning by placing an order.",
  "rewards.referAFriend": "Refer a friend",
  "rewards.copy": "Copy",
  "rewards.copied": "Copied",
  "rewards.checkGiftCard": "Check a gift card balance",
  "rewards.invalidCode": "That code isn't valid.",
} as const;

export type WidgetCopyKey = keyof typeof DEFAULT_WIDGET_COPY;

/** Groups shown in the Studio's "Store wording" editor — one section per widget. */
export const WIDGET_COPY_GROUPS: { label: string; keys: WidgetCopyKey[] }[] = [
  {
    label: "Cart & checkout",
    keys: Object.keys(DEFAULT_WIDGET_COPY).filter((k) => k.startsWith("cart.") || k.startsWith("order.")) as WidgetCopyKey[],
  },
  { label: "Sign in / sign up", keys: Object.keys(DEFAULT_WIDGET_COPY).filter((k) => k.startsWith("auth.")) as WidgetCopyKey[] },
  { label: "Account", keys: Object.keys(DEFAULT_WIDGET_COPY).filter((k) => k.startsWith("account.")) as WidgetCopyKey[] },
  {
    label: "Order tracking",
    keys: Object.keys(DEFAULT_WIDGET_COPY).filter((k) => k.startsWith("track.") || k.startsWith("status.")) as WidgetCopyKey[],
  },
  { label: "Products & bundles", keys: Object.keys(DEFAULT_WIDGET_COPY).filter((k) => k.startsWith("product.") || k.startsWith("bundles.")) as WidgetCopyKey[] },
  { label: "Rewards", keys: Object.keys(DEFAULT_WIDGET_COPY).filter((k) => k.startsWith("rewards.")) as WidgetCopyKey[] },
];

export function parseWidgetCopy(raw: string | null | undefined): Partial<Record<WidgetCopyKey, string>> {
  if (!raw) return {};
  try {
    const v = JSON.parse(raw);
    return v && typeof v === "object" ? v : {};
  } catch {
    return {};
  }
}

/** `copy("cart.placeOrder", overrides, { total: "Rs 1,800" })` -> seller's own text if set, else the
 *  default, with `{var}` placeholders substituted either way. */
export function copyText(
  key: WidgetCopyKey,
  overrides: Partial<Record<WidgetCopyKey, string>> | null | undefined,
  vars?: Record<string, string>,
): string {
  let text = (overrides && overrides[key]) || DEFAULT_WIDGET_COPY[key];
  if (vars) for (const [k, v] of Object.entries(vars)) text = text.split(`{${k}}`).join(v);
  return text;
}

const STATUS_COPY_KEY: Record<string, WidgetCopyKey> = {
  pending: "status.pending",
  confirmed: "status.confirmed",
  shipped: "status.shipped",
  fulfilled: "status.fulfilled",
  cancelled: "status.cancelled",
};

/** Plain, server-safe (no React) — usable from a Server Component too, unlike widget-ui.tsx which
 *  pulls in client-only hooks (useToast etc.) and can't be imported from one. */
export function statusLabel(s: string, widgetCopy?: Partial<Record<WidgetCopyKey, string>>): string {
  const key = STATUS_COPY_KEY[s];
  return key ? copyText(key, widgetCopy) : s;
}
