/** Fixed glow + grid backdrop shared by every signed-in page. Grid lines are
 * dark-on-light now (were white, for the old dark background) — same idea,
 * just visible against the current off-white background. */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -right-32 -top-48 h-[36rem] w-[36rem] rounded-full bg-accent/[0.08] blur-[140px]" />
      <div className="absolute -left-40 bottom-[-14rem] h-[34rem] w-[34rem] rounded-full bg-accent/[0.05] blur-[150px]" />
      <div
        className="absolute inset-0 opacity-[0.5] [mask-image:radial-gradient(ellipse_at_top_right,black_20%,transparent_70%)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(0,0,0,0.045) 1px, transparent 1px), linear-gradient(to bottom, rgba(0,0,0,0.045) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
    </div>
  );
}
