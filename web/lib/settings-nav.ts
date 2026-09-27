import { CreditCard, Globe, LayoutGrid, Megaphone, Plug, ShoppingCart, Store, Truck, Users, Wallet, Activity } from "lucide-react";

/** The seller's Settings sections, grouped — used by the side menu and the overview grid. */
export const SETTINGS_GROUPS = [
  {
    title: "Account",
    items: [
      { href: "/dashboard/settings", label: "Overview", icon: LayoutGrid, desc: "Everything at a glance" },
      { href: "/dashboard/settings/plan", label: "Plan & billing", icon: CreditCard, desc: "Your plan, AI allowance and invoices" },
      { href: "/dashboard/settings/team", label: "Team", icon: Users, desc: "People who can work on this store" },
    ],
  },
  {
    title: "Selling",
    items: [
      { href: "/dashboard/settings/payments", label: "Payments", icon: Wallet, desc: "Cash on delivery, card payments, currency" },
      { href: "/dashboard/settings/delivery", label: "Delivery & courier", icon: Truck, desc: "Delivery fees, city zones, courier account" },
      { href: "/dashboard/settings/checkout", label: "Checkout & orders", icon: ShoppingCart, desc: "Tax, COD confirmation, extra checkout fields, order alerts" },
    ],
  },
  {
    title: "Store",
    items: [
      { href: "/dashboard/settings/storefront", label: "Storefront", icon: Store, desc: "Chat bubble, suggestions, account page, wording, motion" },
      { href: "/dashboard/settings/domain", label: "Domain", icon: Globe, desc: "Put your store on your own web address" },
    ],
  },
  {
    title: "Marketing",
    items: [
      { href: "/dashboard/settings/channels", label: "Facebook, Instagram & WhatsApp", icon: Megaphone, desc: "Connect your pages and WhatsApp number" },
      { href: "/dashboard/settings/tracking", label: "Tracking & pixels", icon: Activity, desc: "Google Analytics, Meta Pixel, Conversions API" },
    ],
  },
  {
    title: "Advanced",
    items: [{ href: "/dashboard/settings/connections", label: "Connections & skills", icon: Plug, desc: "Plugins, tools and skills your AI can use" }],
  },
];

export const SETTINGS_ITEMS = SETTINGS_GROUPS.flatMap((g) => g.items);
