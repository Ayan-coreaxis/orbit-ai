import {
  Images,
  LayoutDashboard,
  Radar,
  PenSquare,
  Inbox,
  Store,
  Sparkles,
  Wallet,
  Settings,
  Mic,
  Star,
  RotateCcw,
  FlaskConical,
  Receipt,
  Megaphone,
  Plug,
  type LucideIcon,
} from "lucide-react";

export type NavItem = { href: string; label: string; icon: LucideIcon; keywords?: string };
export type NavGroup = { title: string; items: NavItem[] };

/** Dashboard navigation, grouped the way a seller thinks about their day. */
export const NAV_GROUPS: NavGroup[] = [
  {
    title: "Home",
    items: [
      { href: "/dashboard", label: "Overview", icon: LayoutDashboard, keywords: "home dashboard orders revenue" },
      { href: "/dashboard/orchestrator", label: "Orchestrator", icon: Mic, keywords: "chat plan ai growth talk" },
      { href: "/dashboard/inbox", label: "Inbox", icon: Inbox, keywords: "messages whatsapp instagram messenger customers" },
    ],
  },
  {
    title: "Store",
    items: [
      { href: "/dashboard/store", label: "Store", icon: Store, keywords: "products orders customers coupons shipping" },
      { href: "/dashboard/orbit-design", label: "Orbit Design", icon: Sparkles, keywords: "design theme storefront website pages" },
      { href: "/dashboard/media", label: "Media", icon: Images, keywords: "photos images videos files library" },
      { href: "/dashboard/reviews", label: "Reviews", icon: Star, keywords: "ratings feedback" },
      { href: "/dashboard/returns", label: "Returns", icon: RotateCcw, keywords: "refunds exchange" },
    ],
  },
  {
    title: "Marketing",
    items: [
      { href: "/dashboard/content", label: "Content", icon: PenSquare, keywords: "studio reels posts instagram facebook" },
      { href: "/dashboard/ads", label: "Ads", icon: Megaphone, keywords: "meta facebook campaigns budget" },
      { href: "/dashboard/competitors", label: "Competitors", icon: Radar, keywords: "rivals market" },
      { href: "/dashboard/experiments", label: "Experiments", icon: FlaskConical, keywords: "ab test" },
    ],
  },
  {
    title: "Money",
    items: [
      { href: "/dashboard/finance", label: "Money", icon: Wallet, keywords: "finance revenue profit margin" },
      { href: "/dashboard/tax", label: "Tax", icon: Receipt, keywords: "tax" },
    ],
  },
  {
    title: "Setup",
    items: [
      { href: "/dashboard/settings/connections", label: "Connections", icon: Plug, keywords: "mcp skills plugins tools" },
      { href: "/dashboard/settings", label: "Settings & Billing", icon: Settings, keywords: "plan billing domain courier whatsapp meta pixel delivery" },
    ],
  },
];

export const NAV_ITEMS = NAV_GROUPS.flatMap((g) => g.items);

export function isActive(pathname: string, href: string): boolean {
  if (href === "/dashboard") return pathname === "/dashboard";
  if (href === "/dashboard/settings") return pathname === "/dashboard/settings";
  return pathname === href || pathname.startsWith(`${href}/`);
}
