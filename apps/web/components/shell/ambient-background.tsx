/** Fixed glow + grid backdrop shared by every signed-in page. */
export function AmbientBackground() {
  return (
    <div aria-hidden className="pointer-events-none fixed inset-0 -z-10 overflow-hidden">
      <div className="absolute -right-32 -top-48 h-[36rem] w-[36rem] rounded-full bg-accent/[0.13] blur-[140px]" />
      <div className="absolute -left-40 bottom-[-14rem] h-[34rem] w-[34rem] rounded-full bg-accent/[0.07] blur-[150px]" />
      <div
        className="absolute inset-0 opacity-[0.3] [mask-image:radial-gradient(ellipse_at_top_right,black_20%,transparent_70%)]"
        style={{
          backgroundImage:
            "linear-gradient(to right, rgba(255,255,255,0.06) 1px, transparent 1px), linear-gradient(to bottom, rgba(255,255,255,0.06) 1px, transparent 1px)",
          backgroundSize: "44px 44px",
        }}
      />
    </div>
  );
}
