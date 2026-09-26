import type { Metadata } from "next";
import { ContactLine, LegalPage } from "@/components/legal/LegalPage";

export const metadata: Metadata = {
  title: "Privacy Policy — orbit.ai",
  description: "What orbit.ai collects, why, who it is shared with, and how to delete it.",
};

export default function PrivacyPage() {
  return (
    <LegalPage
      title="Privacy Policy"
      intro={
        <p>
          orbit.ai (&quot;Orbit&quot;, &quot;we&quot;) runs online stores and AI marketing tools for sellers. This policy explains what information we handle, why, who we share it with, and the
          choices you have. It covers two groups of people: <strong>sellers</strong> who use Orbit, and <strong>shoppers</strong> who buy from or message a seller&apos;s store.
        </p>
      }
      sections={[
        {
          id: "roles",
          title: "Who is responsible",
          body: (
            <>
              <p>
                For seller accounts, Orbit decides how that information is used. For a store&apos;s shoppers, the <strong>seller</strong> is responsible for their customers&apos; information and
                Orbit processes it on the seller&apos;s behalf to run the store, deliver messages and fulfil orders. If you bought from a store, you can also contact that store directly.
              </p>
            </>
          ),
        },
        {
          id: "collect",
          title: "What we collect",
          body: (
            <>
              <p>
                <strong>From sellers:</strong>
              </p>
              <ul>
                <li>Account details: name, email address, password (stored only as a secure hash).</li>
                <li>Business details you enter: store name, products, prices, photos, videos, catalogues, policies and settings.</li>
                <li>
                  Connected accounts: when you connect Facebook / Instagram we receive access tokens, your Page, linked Instagram professional account and ad account IDs, and the
                  permissions you granted. When you connect WhatsApp or a payment provider we store the details needed to use them.
                </li>
                <li>Billing: your subscription is handled by Stripe; we do not store full card numbers.</li>
                <li>Usage: which features you use, AI usage and costs, and basic technical logs.</li>
              </ul>
              <p>
                <strong>From shoppers of a seller&apos;s store:</strong>
              </p>
              <ul>
                <li>Order details: name, phone number, email (optional), delivery address, items and payment method.</li>
                <li>
                  Messages you send to the store&apos;s chat, WhatsApp number, Facebook Messenger or Instagram, and the replies, so the seller can see the conversation.
                </li>
                <li>Store activity such as pages viewed and items added to the cart, using a first-party cookie.</li>
                <li>
                  If the seller turned them on: Google Analytics and the Meta Pixel. With the Meta Pixel, details of your purchase and your hashed (unreadable) phone number and email may
                  be sent to Meta to measure the seller&apos;s ads.
                </li>
              </ul>
            </>
          ),
        },
        {
          id: "use",
          title: "How we use it",
          body: (
            <ul>
              <li>To run the store: take orders, confirm them, send order and delivery updates, and answer questions.</li>
              <li>To create content and ads the seller asks for, and to publish or run them only when the seller approves.</li>
              <li>To keep Orbit secure, prevent fraud (for example fake cash-on-delivery orders) and fix problems.</li>
              <li>To bill sellers and enforce plan limits.</li>
              <li>We do not sell personal information, and we do not use shoppers&apos; information to advertise Orbit.</li>
            </ul>
          ),
        },
        {
          id: "ai",
          title: "AI processing",
          body: (
            <p>
              Orbit uses AI models to write replies, plans, product descriptions, images and videos. To do this, the relevant text, product details and pictures are sent to our AI
              providers (Anthropic for text; Google and BytePlus for images and video). They process it to return a result and, under their business terms, do not use it to train their
              models. AI output can be wrong, so anything that changes a live store, posts publicly or spends money is shown to the seller for approval first.
            </p>
          ),
        },
        {
          id: "meta",
          title: "Facebook, Instagram and WhatsApp data",
          body: (
            <>
              <p>When a seller connects Meta, Orbit uses the data Meta shares only to do what the seller asked:</p>
              <ul>
                <li>publish posts and reels to the seller&apos;s Page and Instagram account;</li>
                <li>answer Messenger and Instagram direct messages sent to the seller&apos;s Page, and show them in the seller&apos;s Inbox;</li>
                <li>create, run, pause and report on ads in the seller&apos;s own ad account;</li>
                <li>send purchase events from the seller&apos;s store to the seller&apos;s own Meta Pixel.</li>
              </ul>
              <p>
                We don&apos;t use this data for anything else, don&apos;t sell it and don&apos;t share it with other sellers. WhatsApp messages are sent through Twilio. Use of these
                platforms is also covered by Meta&apos;s own policies.
              </p>
            </>
          ),
        },
        {
          id: "sharing",
          title: "Who we share it with",
          body: (
            <>
              <p>Only with services that help us run Orbit, under contracts that limit their use of it:</p>
              <ul>
                <li>Hosting and database providers, and Cloudflare R2 for storing photos and videos.</li>
                <li>Stripe (payments and subscriptions), Twilio (WhatsApp), Resend (email).</li>
                <li>Meta (Facebook, Instagram, Messenger, ads and Pixel) — when the seller has connected it.</li>
                <li>AI providers named above.</li>
                <li>Couriers the seller chooses, to deliver orders.</li>
              </ul>
              <p>We may also share information if the law requires it, or to protect people from fraud or harm.</p>
            </>
          ),
        },
        {
          id: "retention",
          title: "How long we keep it",
          body: (
            <p>
              We keep seller data while the account is open. When a seller deletes their account, we delete their store, products, orders, messages and media within 30 days, except
              records we must keep for tax or legal reasons. Security logs are kept for a limited time. Sellers can delete individual products, media and conversations at any time.
            </p>
          ),
        },
        {
          id: "data-deletion",
          title: "Deleting your data",
          body: (
            <>
              <p>
                <strong>Sellers:</strong> to disconnect Facebook / Instagram, go to Settings &gt; Instagram &amp; Facebook &gt; Disconnect — Orbit deletes the saved Meta access tokens
                immediately. You can also remove Orbit in Facebook: Settings &amp; privacy &gt; Settings &gt; Business integrations &gt; Orbit &gt; Remove. To delete your whole account
                and all its data, contact us at <ContactLine /> from your account email.
              </p>
              <p>
                <strong>Shoppers:</strong> to delete your order history, messages or account at a store, contact the store, or contact us at <ContactLine /> with the store name and your
                phone number or email. We will confirm once it&apos;s done.
              </p>
            </>
          ),
        },
        {
          id: "cookies",
          title: "Cookies",
          body: (
            <p>
              Orbit uses cookies to keep you logged in, remember your cart and measure store visits. If a seller turned on Google Analytics or the Meta Pixel, those services set their
              own cookies on that seller&apos;s store. You can block cookies in your browser; the cart and login may then not work.
            </p>
          ),
        },
        {
          id: "security",
          title: "Security",
          body: (
            <p>
              Data is sent over encrypted connections, passwords are hashed, webhooks from WhatsApp, Meta and Stripe are checked for a valid signature, and access to seller data is
              limited to that seller and the staff who need it to support them. No system is perfectly secure; if a breach affects you, we will tell you as the law requires.
            </p>
          ),
        },
        {
          id: "rights",
          title: "Your rights",
          body: (
            <p>
              Depending on where you live, you can ask to see, correct, export or delete your information, or object to how it is used. Contact <ContactLine />. We answer within 30
              days.
            </p>
          ),
        },
        {
          id: "children",
          title: "Children",
          body: <p>Orbit is for businesses and is not meant for children under 13 (or the minimum age in your country). We don&apos;t knowingly collect their information.</p>,
        },
        {
          id: "changes",
          title: "Changes and contact",
          body: (
            <p>
              If we change this policy we will update the date above, and tell sellers by email or in the dashboard when the change is important. Questions: <ContactLine />.
            </p>
          ),
        },
      ]}
    />
  );
}
