"use client";

import { useEffect } from "react";

/** Settings used to be one long page with #anchors; old links (/dashboard/settings#domain) land on the right page now. */
const MAP: Record<string, string> = {
  plan: "plan",
  social: "channels",
  whatsapp: "channels",
  domain: "domain",
  payments: "payments",
  store: "checkout",
  look: "storefront",
  courier: "delivery",
  delivery: "delivery",
  team: "team",
};

export function LegacySettingsHash() {
  useEffect(() => {
    const to = MAP[window.location.hash.slice(1)];
    if (to) window.location.replace(`/dashboard/settings/${to}`);
  }, []);
  return null;
}
