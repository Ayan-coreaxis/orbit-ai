export interface ApiKeyConfig {
  id: string;
  name: string;
  description: string;
  status: "connected" | "not_connected";
  maskedValue?: string;
}

export const apiKeyConfigs: ApiKeyConfig[] = [
  { id: "anthropic", name: "Anthropic (Claude)", description: "Powers the Orchestrator, Competitor Intel, Content, Chatbot, and every other reasoning agent.", status: "not_connected" },
  { id: "stripe", name: "Stripe Secret Key", description: "The PLATFORM's own Stripe account — charges sellers for their Starter/Growth/Scale subscription. Never used for a seller's own storefront checkout, which uses their own separate Stripe keys instead.", status: "not_connected" },
  { id: "stripe_price_starter", name: "Stripe Price — Starter", description: "Real Stripe Price id for the $50/mo Starter plan, created in your own Stripe Dashboard > Product catalog. Required for sellers to self-serve upgrade to Starter.", status: "not_connected" },
  { id: "stripe_price_growth", name: "Stripe Price — Growth", description: "Real Stripe Price id for the $75/mo Growth plan.", status: "not_connected" },
  { id: "stripe_price_scale", name: "Stripe Price — Scale", description: "Real Stripe Price id for the $150/mo Scale plan.", status: "not_connected" },
  { id: "stripe_webhook_secret", name: "Stripe Webhook Signing Secret", description: "From Stripe Dashboard > Webhooks — add an endpoint pointing at /api/webhooks/stripe, subscribed to checkout.session.completed, customer.subscription.updated, and customer.subscription.deleted. Without this, a seller's real payment never auto-upgrades their plan.", status: "not_connected" },
  { id: "meta_app_id", name: "Meta App ID", description: "From your Meta App (developers.facebook.com) — needed for sellers to connect their own Instagram/Facebook via real OAuth, and also powers the real, free Meta Ad Library API used by Competitor Intelligence (no App Review needed for that part). Requires Meta's App Review for ads_management/instagram permissions before real seller OAuth works.", status: "not_connected" },
  { id: "meta_app_secret", name: "Meta App Secret", description: "Pairs with the App ID above to exchange a real OAuth code for a seller's real access token, and to authenticate real Ad Library API calls — never exposed to the browser.", status: "not_connected" },
  { id: "meta_login_config_id", name: "Meta Login Configuration ID", description: "From your Meta App > Facebook Login for Business > Configurations. Needed when the app uses the Facebook Login for Business use cases — the seller connect button then asks for the permissions in that configuration instead of a raw scope list. Leave empty for a classic Facebook Login app.", status: "not_connected" },
  { id: "resend", name: "Resend API Key (email)", description: "resend.com — sends order emails and store customers' login codes. Verify your sending domain in Resend first.", status: "not_connected" },
  { id: "email_from", name: "Email sender", description: "The verified address emails come from, e.g. Orbit <orders@yourdomain.com>. Store emails show the store's name with this address.", status: "not_connected" },
  { id: "legal_contact_email", name: "Contact email (Privacy & Terms)", description: "The email shown on /privacy and /terms for data requests and questions — Meta App Review checks that the Privacy Policy has a working contact and data-deletion instructions.", status: "not_connected" },
  { id: "meta_webhook_verify_token", name: "Meta Webhook Verify Token", description: "Any long random text you choose. In your Meta App > Webhooks, add the callback URL https://<your Orbit domain>/api/webhooks/meta with this same token, then subscribe the Page object and the Instagram object to the \"messages\" field. Sellers' Messenger and Instagram DMs then reach their store chatbot and Inbox (needs App Review for pages_messaging / instagram_manage_messages before real customers' DMs arrive).", status: "not_connected" },
  { id: "twilio_sid", name: "Twilio Account SID", description: "Your Twilio account identifier — pairs with the Auth Token below to send real WhatsApp messages.", status: "not_connected" },
  { id: "twilio", name: "Twilio Auth Token", description: "Authenticates WhatsApp sends (order updates, store chatbot, cart reminders).", status: "not_connected" },
  { id: "twilio_whatsapp", name: "Twilio WhatsApp Sender", description: "The WhatsApp-enabled number messages are sent from, e.g. +14155238886 (Twilio's sandbox number for testing).", status: "not_connected" },
  { id: "twilio_webhook_url", name: "Twilio Webhook URL (optional)", description: "Only if Orbit sits behind a proxy that changes its address: the exact URL Twilio posts incoming WhatsApp messages to (see Super Admin > WhatsApp). Used to check Twilio's signature.", status: "not_connected" },
  { id: "vercel_token", name: "Vercel Token (custom domains)", description: "If Orbit is hosted on Vercel: a token (vercel.com/account/tokens) so a seller's verified domain is added to the project automatically and gets its SSL certificate.", status: "not_connected" },
  { id: "vercel_project_id", name: "Vercel Project ID", description: "Vercel > Project > Settings > General > Project ID. Pairs with the token above.", status: "not_connected" },
  { id: "vercel_team_id", name: "Vercel Team ID (optional)", description: "Only if the project belongs to a Vercel team.", status: "not_connected" },
  { id: "store_domain_cname", name: "Store domains — CNAME target", description: "What sellers point their sub-domain at. On Vercel leave empty (cname.vercel-dns.com). On a VPS: a hostname of your server, e.g. stores.orbit.pk (put Caddy with on-demand TLS in front, asking /api/domains/allowed).", status: "not_connected" },
  { id: "store_domain_ip", name: "Store domains — A record IP", description: "What sellers point a bare domain (mybrand.com) at. On Vercel leave empty (76.76.21.21). On a VPS: your server's public IP.", status: "not_connected" },
  { id: "apify_token", name: "Apify API Token", description: "Paid, usage-based scraping service (apify.com) — lets Competitor Intelligence actually read Instagram and TikTok profiles, which block plain automated browsers. Without this, those two sources stay honestly marked as blocked.", status: "not_connected" },
];

/** API Keys page sections, in order. `id` doubles as the page anchor (/admin/api-keys#stripe). */
export const apiKeyGroups: { id: string; title: string; note: string; keys: string[] }[] = [
  { id: "ai", title: "Claude (AI)", note: "Required — every agent runs on this.", keys: ["anthropic"] },
  {
    id: "stripe",
    title: "Stripe — seller subscriptions",
    note: "How sellers pay Orbit for their plan. Required to take money.",
    keys: ["stripe", "stripe_price_starter", "stripe_price_growth", "stripe_price_scale", "stripe_webhook_secret"],
  },
  { id: "email", title: "Email", note: "Order emails, login codes, and the contact on Privacy / Terms.", keys: ["resend", "email_from", "legal_contact_email"] },
  { id: "whatsapp", title: "WhatsApp (Twilio)", note: "Templates, test sends and seller numbers are on the WhatsApp page.", keys: ["twilio_sid", "twilio", "twilio_whatsapp", "twilio_webhook_url"] },
  { id: "meta", title: "Meta — Facebook & Instagram", note: "Sellers connect their Page / Instagram, DMs reach the chatbot, and Competitor Intelligence reads the Ad Library.", keys: ["meta_app_id", "meta_app_secret", "meta_login_config_id", "meta_webhook_verify_token"] },
  { id: "domains", title: "Custom store domains", note: "Lets sellers use their own domain.", keys: ["vercel_token", "vercel_project_id", "vercel_team_id", "store_domain_cname", "store_domain_ip"] },
  { id: "scraping", title: "Competitor scraping", note: "Optional — reads Instagram and TikTok profiles.", keys: ["apify_token"] },
];
