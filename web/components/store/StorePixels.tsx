/** GA4 + Meta Pixel snippets for the seller's own storefront. Server component — plain script tags. */
export function StorePixels({ ga4, metaPixel }: { ga4?: string | null; metaPixel?: string | null }) {
  const g = (ga4 || "").trim();
  const m = (metaPixel || "").trim();
  if (!g && !m) return null;

  return (
    <>
      {g && /^G-[A-Z0-9]+$/i.test(g) && (
        <>
          <script src={`https://www.googletagmanager.com/gtag/js?id=${g}`} async />
          <script
            dangerouslySetInnerHTML={{
              __html: `window.dataLayer=window.dataLayer||[];function gtag(){dataLayer.push(arguments)}gtag('js',new Date());gtag('config','${g}');`,
            }}
          />
        </>
      )}
      {m && /^\d{6,20}$/.test(m) && (
        <script
          dangerouslySetInnerHTML={{
            __html: `!function(f,b,e,v,n,t,s){if(f.fbq)return;n=f.fbq=function(){n.callMethod?n.callMethod.apply(n,arguments):n.queue.push(arguments)};if(!f._fbq)f._fbq=n;n.push=n;n.loaded=!0;n.version='2.0';n.queue=[];t=b.createElement(e);t.async=!0;t.src=v;s=b.getElementsByTagName(e)[0];s.parentNode.insertBefore(t,s)}(window,document,'script','https://connect.facebook.net/en_US/fbevents.js');fbq('init','${m}');fbq('track','PageView');`,
          }}
        />
      )}
    </>
  );
}
