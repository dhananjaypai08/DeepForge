/**
 * DeepForge mark — a gradient badge with stacked ascending chevrons, reading as
 * "forge / compile up" (intent rising into structure). Identical to the favicon
 * (apps/web/public/favicon.svg) so the brand is consistent everywhere.
 */
export function Logo({ size = 32, className }: { size?: number; className?: string }) {
  const gid = "df-logo-grad";
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 32 32"
      className={className}
      role="img"
      aria-label="DeepForge"
    >
      <defs>
        <linearGradient id={gid} x1="4" y1="2" x2="28" y2="30" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#19E29C" />
          <stop offset="1" stopColor="#0EA5A5" />
        </linearGradient>
      </defs>
      <rect width="32" height="32" rx="8" fill={`url(#${gid})`} />
      <g
        fill="none"
        stroke="#08121F"
        strokeWidth="3"
        strokeLinecap="round"
        strokeLinejoin="round"
      >
        <path d="M9 14 L16 8 L23 14" />
        <path d="M9 21 L16 15 L23 21" />
      </g>
    </svg>
  );
}
