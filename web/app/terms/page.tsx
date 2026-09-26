import type { Metadata } from "next";
import Link from "next/link";
import { ContactLine, LegalPage } from "@/components/legal/LegalPage";

// Rendered per request so a contact email saved in Super Admin shows up without a rebuild.
export const dynamic = "force-dynamic";

export const metadata: Metadata = {
  title: "Terms of Service — orbit.ai",
  description: "The rules for using orbit.ai.",
};

export default function TermsPage() {
  return (
    <LegalPage
      title="Terms of Service"
      intro={
        <p>
          These terms are the agreement between you and orbit.ai (&quot;Orbit&quot;, &quot;we&quot;) when you create an account or use Orbit. By signing up you agree to them. Our{" "}
          <Link href="/privacy" className="text-zinc-100 underline underline-offset-2">
            Privacy Policy
          </Link>{" "}
          explains how we handle information.
        </p>
      }
      sections={[
        {
          id: "service",
          title: "What Orbit does",
          body: (
            <p>
              Orbit gives sellers an online store and AI agents that plan, write content, make images and videos, answer customers and run ads. Features depend on your plan and on the
              accounts you connect (for example Meta, WhatsApp, Stripe or a courier).
            </p>
          ),
        },
        {
          id: "account",
          title: "Your account",
          body: (
            <ul>
              <li>You must give accurate details and be old enough to form a contract where you live.</li>
              <li>Keep your password safe. You are responsible for what happens in your account.</li>
              <li>If you sign up for a business, you confirm you are allowed to act for it.</li>
            </ul>
          ),
        },
        {
          id: "plans",
          title: "Plans, billing and cancellation",
          body: (
            <ul>
              <li>Plans are billed monthly in advance through Stripe (currently Starter $50, Growth $75 and Scale $150 per month; prices on the Pricing page apply).</li>
              <li>Each plan includes usage allowances (for example AI usage, images and videos). When you reach one, that feature pauses until the next month or an upgrade.</li>
              <li>You can cancel any time from Settings &gt; Billing; the plan stays active until the end of the period you paid for. Payments already made are not refunded, except where the law requires.</li>
              <li>
                <strong>Ad spend is separate:</strong> Meta bills ads directly to your own ad account and payment method. Orbit never holds your ad budget.
              </li>
              <li>We may change prices with at least 30 days&apos; notice; the change applies from your next billing period.</li>
            </ul>
          ),
        },
        {
          id: "store",
          title: "Your store and your customers",
          body: (
            <ul>
              <li>You are the seller. You are responsible for your products, prices, delivery, returns, taxes and customer service, and for following consumer and trade laws.</li>
              <li>You must not sell anything illegal, counterfeit, dangerous or that breaks Meta&apos;s commerce and advertising policies.</li>
              <li>
                You are responsible for your customers&apos; information: only use it to serve them, and only message them about their orders or where they agreed to marketing.
              </li>
            </ul>
          ),
        },
        {
          id: "ai",
          title: "AI content and approvals",
          body: (
            <>
              <p>
                AI can make mistakes. Anything that changes your live store, posts publicly or spends money is shown to you first and only happens when you press Apply, Publish or
                Activate. Check it before you approve — once approved, it is your content and your decision.
              </p>
              <p>
                You must have the rights to the photos, logos, music and other material you upload, and permission from any real person shown in them (for example in try-on or UGC
                videos). Don&apos;t use Orbit to make misleading claims, fake reviews, or content that imitates a real person or brand without permission.
              </p>
            </>
          ),
        },
        {
          id: "platforms",
          title: "Meta, WhatsApp and other services",
          body: (
            <p>
              When you connect Facebook, Instagram, WhatsApp, Stripe or a courier, you also have to follow their terms. They may limit, review or reject posts, ads, messages or payments —
              Orbit can&apos;t override their decisions. WhatsApp messages to customers who haven&apos;t written recently must use approved templates.
            </p>
          ),
        },
        {
          id: "acceptable-use",
          title: "Acceptable use",
          body: (
            <ul>
              <li>No spam, scams, harassment, hate, adult content, or anything illegal.</li>
              <li>No trying to break, overload, reverse-engineer or get around the limits or security of Orbit.</li>
              <li>No reselling Orbit or giving others access to your account without our permission.</li>
            </ul>
          ),
        },
        {
          id: "ip",
          title: "Ownership",
          body: (
            <p>
              You keep ownership of your content and your store data. You give Orbit permission to host, process and display it only to run the service for you. Orbit keeps ownership
              of its software, designs and brand. Content the AI makes for you is yours to use, subject to the rights of any material you supplied.
            </p>
          ),
        },
        {
          id: "availability",
          title: "Availability and changes",
          body: (
            <p>
              We work to keep Orbit running but can&apos;t promise it will never be interrupted. We may improve, change or remove features; if we remove something important from your
              plan, we will tell you in advance.
            </p>
          ),
        },
        {
          id: "liability",
          title: "Limits of liability",
          body: (
            <p>
              Orbit is provided &quot;as is&quot;. To the extent the law allows, we are not liable for lost profits, lost sales, ad results, or indirect losses, and our total liability
              for any claim is limited to what you paid Orbit in the 3 months before it. Nothing here limits rights you have under consumer law that can&apos;t be excluded.
            </p>
          ),
        },
        {
          id: "ending",
          title: "Ending the agreement",
          body: (
            <p>
              You can stop using Orbit and delete your account at any time. We may suspend or close an account that breaks these terms, puts other people at risk or doesn&apos;t pay,
              and will tell you why unless the law prevents it.
            </p>
          ),
        },
        {
          id: "contact",
          title: "Changes and contact",
          body: (
            <p>
              We may update these terms; the date above shows the latest version and we will tell you about important changes in advance. Questions: <ContactLine />.
            </p>
          ),
        },
      ]}
    />
  );
}
