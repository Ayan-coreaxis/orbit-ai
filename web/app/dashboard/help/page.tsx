import Link from "next/link";
import { ChevronDown, Mail, MessageCircle, Package, Palette, Sparkles, Truck, Wallet, Megaphone } from "lucide-react";
import { Topbar } from "@/components/Topbar";

export const metadata = { title: "Help" };

const GUIDES = [
  { icon: Package, title: "Add your products", body: "One by one, or import a whole catalogue from a link or a spreadsheet.", href: "/dashboard/store#products" },
  { icon: Palette, title: "Design and publish your store", body: "Describe your brand; Orbit Design builds every page. Publish when you like it.", href: "/dashboard/orbit-design" },
  { icon: Wallet, title: "Set up payments", body: "Cash on delivery is on. Add JazzCash, Easypaisa or cards if you have them.", href: "/dashboard/settings/payments" },
  { icon: Truck, title: "Connect your courier", body: "Book PostEx, Leopards or TCS from an order and track deliveries.", href: "/dashboard/settings/delivery" },
  { icon: Megaphone, title: "Connect Facebook, Instagram & WhatsApp", body: "Answer messages, post and run ads from Orbit.", href: "/dashboard/settings/channels" },
  { icon: Sparkles, title: "Ask the Orchestrator", body: "Ask anything about your store — it plans from your real numbers.", href: "/dashboard/orchestrator" },
];

const FAQ = [
  ["Does Orbit change my store without asking?", "No. Every change to your live store is shown to you first as a proposal. Nothing happens until you press Apply."],
  ["What is the daily store check?", "Every morning Orbit looks at your orders, stock, sales and visitors and lists the few things worth doing today. Press Prepare on one and the Orchestrator drafts it for you."],
  ["How does cash on delivery work?", "Shoppers order without paying online. Each order gets a risk score; low-risk orders can confirm themselves, the rest wait for you to check. You collect the cash on delivery through your courier."],
  ["Why is an order marked high risk?", "Open the order to see the reasons in plain words — for example an invalid phone number, a very short address, or past returns from the same number. Call or WhatsApp the customer before you ship."],
  ["Can I use my own domain?", "Yes. Go to Settings → Domain, add yourbrand.com and follow the two DNS steps shown there."],
  ["How do I get my data out?", "Settings → Account & data → Download my data gives you one file with your stores, products, orders and customers."],
  ["How do I cancel or delete my account?", "Change or cancel your plan in Settings → Plan & billing. To delete everything, use Settings → Account & data."],
];

export default function HelpPage() {
  const whatsapp = (process.env.NEXT_PUBLIC_SUPPORT_WHATSAPP ?? "").replace(/[^\d]/g, "");
  const email = process.env.LEGAL_CONTACT_EMAIL || process.env.NEXT_PUBLIC_SUPPORT_EMAIL || "";
  return (
    <div>
      <Topbar title="Help" subtitle="Quick guides, answers, and a real person when you need one." />
      <div className="page-body space-y-8">
        <section className="orbit-stagger grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
          <Link href="/dashboard/orchestrator" className="hover-lift rounded-[26px] bg-accent p-6 text-panel">
            <Sparkles className="h-6 w-6" />
            <div className="mt-4 text-[19px] font-semibold">Ask the Orchestrator</div>
            <p className="mt-1 text-[14.5px] opacity-85">The fastest answer — it knows your store.</p>
          </Link>
          {whatsapp ? (
            <a href={`https://wa.me/${whatsapp}`} target="_blank" rel="noreferrer" className="hover-lift app-card p-6">
              <MessageCircle className="h-6 w-6 text-good" />
              <div className="mt-4 text-[19px] font-semibold">WhatsApp support</div>
              <p className="mt-1 text-[14.5px] text-text-dim">Message the Orbit team.</p>
            </a>
          ) : null}
          {email ? (
            <a href={`mailto:${email}`} className="hover-lift app-card p-6">
              <Mail className="h-6 w-6 text-accent" />
              <div className="mt-4 text-[19px] font-semibold">Email us</div>
              <p className="mt-1 truncate text-[14.5px] text-text-dim">{email}</p>
            </a>
          ) : null}
        </section>

        <section>
          <h2 className="text-[22px] font-semibold tracking-tight">Get set up</h2>
          <div className="orbit-stagger mt-4 grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            {GUIDES.map((g) => (
              <Link key={g.title} href={g.href} className="hover-lift app-card flex items-start gap-4 p-5">
                <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-full bg-panel-2 text-accent">
                  <g.icon className="h-5 w-5" />
                </span>
                <span>
                  <span className="block text-[16px] font-semibold">{g.title}</span>
                  <span className="mt-1 block text-[14px] leading-relaxed text-text-dim">{g.body}</span>
                </span>
              </Link>
            ))}
          </div>
        </section>

        <section>
          <h2 className="text-[22px] font-semibold tracking-tight">Common questions</h2>
          <div className="app-card mt-4 divide-y divide-border">
            {FAQ.map(([q, a]) => (
              <details key={q} className="group px-6 py-4">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-4 text-[16px] font-medium">
                  {q}
                  <ChevronDown className="h-5 w-5 shrink-0 text-text-faint transition-transform duration-300 group-open:rotate-180" />
                </summary>
                <p className="mt-2 max-w-3xl text-[15px] leading-relaxed text-text-dim">{a}</p>
              </details>
            ))}
          </div>
        </section>
      </div>
    </div>
  );
}
