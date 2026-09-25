import type { PageWidget } from "@/lib/orbit-design";
import type { StoreBackendSpec } from "@/lib/orbit-backend-spec";
import type { WidgetCopyKey } from "@/lib/widget-copy";
import type { CheckoutCustomField } from "@/lib/checkout-fields";
import { WidgetSlot } from "./WidgetSlot";
import { CartWidget } from "./CartWidget";
import { AuthWidget } from "./AuthWidget";
import { AccountWidget } from "./AccountWidget";
import { TrackWidget } from "./TrackWidget";
import { CollectionWidget } from "./CollectionWidget";
import { FormWidget } from "./FormWidget";
import { BundlesWidget } from "./BundlesWidget";
import { RewardsWidget } from "./RewardsWidget";

/**
 * Mounts every functional widget a rendered page declared (via applySpec) into its
 * `<div data-od-widget="…">` slot. One place, so the store routes just render `<StoreWidgets/>`.
 */
export function StoreWidgets({
  widgets,
  businessId,
  storeName,
  currency,
  spec,
  productId,
  widgetCopy,
  widgetMotion,
  checkoutCustomFields,
}: {
  widgets: PageWidget[];
  businessId: string;
  storeName: string;
  currency?: string;
  spec: StoreBackendSpec;
  productId?: string;
  widgetCopy?: Partial<Record<WidgetCopyKey, string>>;
  widgetMotion?: string;
  checkoutCustomFields?: CheckoutCustomField[];
}) {
  // index within each data-od-widget kind, so N collection slots each get their own mount
  const seen: Record<string, number> = {};
  return (
    <>
      {widgets.map((w, i) => {
        const idx = seen[w.kind] ?? 0;
        seen[w.kind] = idx + 1;

        if (w.kind === "checkout")
          return (
            <WidgetSlot key={i} kind="checkout" index={idx}>
              <CartWidget
                businessId={businessId}
                storeName={storeName}
                currency={currency}
                widgetCopy={widgetCopy}
                widgetMotion={widgetMotion}
                checkoutCustomFields={checkoutCustomFields}
              />
            </WidgetSlot>
          );
        if (w.kind === "auth")
          return (
            <WidgetSlot key={i} kind="auth" index={idx}>
              <AuthWidget businessId={businessId} authMode={spec.auth.mode} widgetCopy={widgetCopy} widgetMotion={widgetMotion} />
            </WidgetSlot>
          );
        if (w.kind === "account")
          return (
            <WidgetSlot key={i} kind="account" index={idx}>
              <AccountWidget businessId={businessId} spec={spec} currency={currency} widgetCopy={widgetCopy} widgetMotion={widgetMotion} />
            </WidgetSlot>
          );
        if (w.kind === "track")
          return (
            <WidgetSlot key={i} kind="track" index={idx}>
              <TrackWidget businessId={businessId} currency={currency} widgetCopy={widgetCopy} widgetMotion={widgetMotion} />
            </WidgetSlot>
          );
        if (w.kind === "bundles")
          return (
            <WidgetSlot key={i} kind="bundles" index={idx}>
              <BundlesWidget businessId={businessId} currency={currency} widgetCopy={widgetCopy} widgetMotion={widgetMotion} />
            </WidgetSlot>
          );
        if (w.kind === "rewards")
          return (
            <WidgetSlot key={i} kind="rewards" index={idx}>
              <RewardsWidget businessId={businessId} currency={currency} widgetCopy={widgetCopy} widgetMotion={widgetMotion} />
            </WidgetSlot>
          );
        if (w.kind === "form") {
          const f = spec.forms.find((x) => (w.slot ? x.slot === w.slot : x.target === w.target));
          return (
            <WidgetSlot key={i} kind="form" selector={w.slot ? `[data-od-widget="form"][data-od-slot="${w.slot}"]` : undefined} index={idx}>
              <FormWidget
                businessId={businessId}
                target={String(f?.target ?? w.target ?? "support")}
                fields={f?.fields ?? []}
                submitLabel={f?.submitLabel}
                successText={f?.successText}
              />
            </WidgetSlot>
          );
        }
        if (w.kind === "collection" && w.collection) {
          const col = spec.collections.find((c) => c.name === w.collection);
          if (!col) return null;
          return (
            <WidgetSlot key={i} kind="collection" selector={`[data-od-widget="collection"][data-od-collection="${w.collection}"]`}>
              <CollectionWidget
                businessId={businessId}
                collection={col.name}
                fields={col.fields}
                moderated={col.moderated}
                productId={col.onProduct ? productId : undefined}
                title={col.label}
              />
            </WidgetSlot>
          );
        }
        return null;
      })}
    </>
  );
}
