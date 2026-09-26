/** Report a shopping event to the store's Meta Pixel / GA4 (no-op when neither is set). Client-only. */
export type PixelEvent = "view_product" | "add_to_cart" | "checkout_start" | "purchase";

export type PixelData = {
  content_ids?: string[];
  content_type?: "product";
  value?: number;
  currency?: string;
  num_items?: number;
  order_id?: string;
};

export function firePixel(type: PixelEvent, data: PixelData = {}, eventId?: string) {
  try {
    const w = window as unknown as { __odPx?: (t: string, d: PixelData, id?: string) => void };
    w.__odPx?.(type, { content_type: "product", ...data }, eventId);
  } catch {
    /* never break the store */
  }
}
