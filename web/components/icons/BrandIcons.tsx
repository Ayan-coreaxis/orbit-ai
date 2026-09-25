/** Small real brand marks — lucide-react doesn't ship Facebook/Instagram/WhatsApp icons in this project's installed version, so these are hand-drawn minimal SVGs instead of a generic fallback icon. */

export function FacebookIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#1877F2" />
      <path
        d="M15.6 12.5h-2.1V19h-2.7v-6.5H9.3v-2.3h1.5V9.4c0-1.5.8-2.9 3.1-2.9.9 0 1.6.1 1.6.1v2.2h-1.1c-.9 0-1.1.4-1.1 1.1v1.4h2.2l-.3 2.3z"
        fill="white"
      />
    </svg>
  );
}

export function InstagramIcon({ size = 20 }: { size?: number }) {
  const gradId = "ig-grad";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="0" y1="24" x2="24" y2="0" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FED576" />
          <stop offset="0.26" stopColor="#F47133" />
          <stop offset="0.61" stopColor="#BC3081" />
          <stop offset="1" stopColor="#4C63D2" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill={`url(#${gradId})`} />
      <rect x="6.5" y="6.5" width="11" height="11" rx="3.5" stroke="white" strokeWidth="1.4" />
      <circle cx="12" cy="12" r="3" stroke="white" strokeWidth="1.4" />
      <circle cx="15.8" cy="8.2" r="0.9" fill="white" />
    </svg>
  );
}

/** Real Higgsfield brand colors (confirmed via their own brand docs): "Neon Higgs Green" #D7FF28 on black. */
export function HiggsfieldIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#0a0a0a" />
      <path
        d="M6 17c2-1 2-4 4-5s2 3 4 2 2-4 4-5"
        stroke="#D7FF28"
        strokeWidth="2"
        strokeLinecap="round"
        strokeLinejoin="round"
        fill="none"
      />
    </svg>
  );
}

/** Real Shopify brand green #95BF47. */
export function ShopifyIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#95BF47" />
      <path
        d="M15.5 7.2c0-.1-.1-.2-.2-.2h-1.4l-1-1c-.1-.1-.2-.1-.3-.1l-.6.2c-.1-.3-.3-.6-.5-.8-.4-.4-.9-.4-1.1-.4-1.6.1-2.4 2.1-2.6 3.1l-1.1.3c-.4.1-.4.1-.4.5L5.5 17l8 1.5L18 17l-2.5-9.8Z"
        fill="white"
      />
      <path d="M11.9 5c.2 0 .3.1.4.2-.6.3-1.2.9-1.5 2.1l-.9.3c.2-1 .8-2.4 2-2.6Z" fill="#95BF47" />
    </svg>
  );
}

/** Real Stripe brand purple #635BFF (same value already used elsewhere in this app for Stripe UI). */
export function StripeIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#635BFF" />
      <path
        d="M11.3 9.9c0-.6.5-.8 1.3-.8.9 0 2 .3 2.9.8V7.5c-1-.4-1.9-.5-2.9-.5-2.4 0-4 1.2-4 3.3 0 3.2 4.4 2.7 4.4 4.1 0 .7-.6.9-1.4.9-1 0-2.3-.4-3.3-1v2.5c1.1.5 2.2.7 3.3.7 2.5 0 4.1-1.2 4.1-3.3 0-3.5-4.4-2.9-4.4-4.3Z"
        fill="white"
      />
    </svg>
  );
}

/** Real Canva brand gradient (light blue → purple), matches Canva's own published palette. */
export function CanvaIcon({ size = 20 }: { size?: number }) {
  const gradId = "canva-grad";
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <defs>
        <linearGradient id={gradId} x1="0" y1="0" x2="24" y2="24" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#07B9CE" />
          <stop offset="1" stopColor="#7D2AE7" />
        </linearGradient>
      </defs>
      <rect width="24" height="24" rx="6" fill={`url(#${gradId})`} />
      <circle cx="12" cy="12" r="6.5" fill="none" stroke="white" strokeWidth="1.4" />
      <path d="M9.5 13.5c.5 1.2 1.5 1.8 2.6 1.5 1.3-.4 1.7-1.8 1.4-3.2" stroke="white" strokeWidth="1.4" strokeLinecap="round" fill="none" />
    </svg>
  );
}

/** Real Klaviyo brand navy #1F3A5F. */
export function KlaviyoIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#1F3A5F" />
      <circle cx="12" cy="12" r="5.5" stroke="white" strokeWidth="1.4" fill="none" />
      <circle cx="12" cy="12" r="1.6" fill="white" />
    </svg>
  );
}

/** Real ElevenLabs brand colors — black/white are the only official logo colors. */
export function ElevenLabsIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#000000" />
      <rect x="7" y="8" width="2.2" height="8" rx="1.1" fill="white" />
      <rect x="14.8" y="8" width="2.2" height="8" rx="1.1" fill="white" />
    </svg>
  );
}

export function WhatsAppIcon({ size = 20 }: { size?: number }) {
  return (
    <svg width={size} height={size} viewBox="0 0 24 24" fill="none" xmlns="http://www.w3.org/2000/svg">
      <rect width="24" height="24" rx="6" fill="#25D366" />
      <path
        d="M12.02 5.5a6.47 6.47 0 0 0-5.53 9.83L5.5 18.5l3.27-.96a6.47 6.47 0 1 0 3.25-12.04Zm0 1.2a5.27 5.27 0 1 1 0 10.54 5.24 5.24 0 0 1-2.68-.74l-.19-.11-1.94.57.58-1.89-.13-.2a5.27 5.27 0 0 1 4.36-8.17Z"
        fill="white"
      />
      <path
        d="M9.98 8.9c-.14-.31-.29-.32-.42-.32h-.36c-.13 0-.33.05-.5.24-.17.19-.66.64-.66 1.57s.68 1.83.77 1.95c.1.13 1.32 2.02 3.26 2.75 1.61.61 1.94.49 2.29.46.35-.03 1.13-.46 1.29-.91.16-.45.16-.83.11-.91-.05-.08-.18-.13-.37-.23-.19-.1-1.13-.56-1.31-.62-.18-.06-.3-.1-.43.1-.13.19-.5.62-.61.75-.11.13-.22.14-.41.05-.19-.1-.8-.3-1.53-.94-.56-.5-.94-1.11-1.05-1.3-.11-.19-.01-.29.08-.39.09-.09.19-.22.29-.34.1-.11.13-.19.19-.32.06-.13.03-.24-.02-.34-.05-.1-.42-1.05-.6-1.44Z"
        fill="white"
      />
    </svg>
  );
}
