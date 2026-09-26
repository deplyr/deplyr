/** Fixed to the viewport, not scoped to the hero section — it needs to sit
 * behind the floating header too, or the strip of page above the hero (where
 * the sticky header lives) shows flat body background instead, a visible
 * seam right at the top of the page. `fixed` fixes that for free: it covers
 * the whole viewport regardless of what's sticky above it or how far the
 * page scrolls. */
export function MarketingBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -left-40 -top-40 h-[34rem] w-[34rem] rounded-full bg-accent/20 blur-[140px]" />
      <div className="absolute -bottom-52 right-[-8rem] h-[36rem] w-[36rem] rounded-full bg-accent/10 blur-[150px]" />
      <div
        className="absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(ellipse_at_top,black_30%,transparent_75%)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, hsl(var(--border)) 1px, transparent 1px), linear-gradient(to bottom, hsl(var(--border)) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
    </div>
  );
}
