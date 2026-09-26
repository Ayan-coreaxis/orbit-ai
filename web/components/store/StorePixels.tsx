/**
 * GA4 + Meta Pixel snippets for the seller's own storefront. Server component — plain script tags.
 * Also defines window.__odPx(type, data, eventId): the one place storefront code reports shopping
 * events (see lib/pixel-client.ts), mapped to each tag's standard event names.
 */
export function StorePixels({ ga4, metaPixel }: { ga4?: string | null; metaPixel?: string | null }) {
  const g = (ga4 || "").trim();
  const m = (metaPixel || "").trim();
  const gOk = !!g && /^G-[A-Z0-9]+$/i.test(g);
  const mOk = !!m && /^\d{6,20}$/.test(m);
  if (!gOk && !mOk) return null;

  const bridge =
    "window.__odPx=function(t,d,id){try{d=d||{};" +
    "var M={view_product:'ViewContent',add_to_cart:'AddToCart',checkout_start:'InitiateCheckout',purchase:'Purchase'}[t];" +
    "if(M&&window.fbq)window.fbq('track',M,d,id?{eventID:id}:undefined);" +
    "var G={view_product:'view_item',add_to_cart:'add_to_cart',checkout_start:'begin_checkout',purchase:'purchase'}[t];" +
    "if(G&&window.gtag)window.gtag('event',G,{currency:d.currency,value:d.value,transaction_id:d.order_id,items:(d.content_ids||[]).map(function(x){return{item_id:x}})})" +
    "}catch(e){}};";

  return (
    <>
      {gOk && (
        <>
          <script src={`https://www.googletagmanager.com/gtag/js?id=${g}`} async />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${g}');`,
            }}
          />
        </>
      )}
      {mOk && (
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${m}');fbq('track','PageView');`,
          }}
        />
      )}
      <script dangerouslySetInnerHTML={{ __html: bridge }} />
    </>
  );
}
