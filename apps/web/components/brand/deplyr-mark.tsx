/**
 * The Deplyr mark: three ascending squircles, back-to-front, on a gradient
 * ground — a deploy pipeline's stages (dev → staging → live), not a literal
 * icon of anything. Each ID is namespaced with `idPrefix` so two instances
 * on the same page (header + sidebar) never collide on one <defs>.
 */
export function DeplyrMark({ className, idPrefix = "deplyr-mark" }: { className?: string; idPrefix?: string }) {
  const gradientId = `${idPrefix}-grad`;
  return (
    <svg viewBox="0 0 40 40" className={className} xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <defs>
        <linearGradient id={gradientId} x1="4" y1="2" x2="36" y2="38" gradientUnits="userSpaceOnUse">
          <stop offset="0" stopColor="#FB923C" />
          <stop offset="1" stopColor="#EA580C" />
        </linearGradient>
      </defs>
      <rect width="40" height="40" rx="11" fill={`url(#${gradientId})`} />
      <rect x="9" y="19" width="13" height="13" rx="4" fill="#FFFFFF" opacity="0.32" />
      <rect x="13" y="15" width="14" height="14" rx="4.5" fill="#FFFFFF" opacity="0.6" />
      <rect x="17" y="11" width="15" height="15" rx="5" fill="#FFFFFF" />
      <circle cx="24.5" cy="18.5" r="2" fill="#EA580C" />
    </svg>
  );
}
