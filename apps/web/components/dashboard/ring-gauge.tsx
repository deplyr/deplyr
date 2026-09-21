import { cn } from "@/lib/cn";

export function RingGauge({
  label,
  value,
  size = 84,
}: {
  label: string;
  value: number | null;
  size?: number;
}) {
  const stroke = 7;
  const r = (size - stroke) / 2;
  const c = 2 * Math.PI * r;
  const pct = value === null ? 0 : Math.max(0, Math.min(100, value));
  const color = pct > 90 ? "#F87171" : pct > 75 ? "#FBBF24" : "#22D3EE";

  return (
    <div className="flex flex-col items-center gap-2">
      <div className="relative" style={{ width: size, height: size }}>
        <svg width={size} height={size} className="-rotate-90">
          <circle cx={size / 2} cy={size / 2} r={r} fill="none" stroke="rgba(255,255,255,0.07)" strokeWidth={stroke} />
          <circle
            cx={size / 2}
            cy={size / 2}
            r={r}
            fill="none"
            stroke={color}
            strokeWidth={stroke}
            strokeLinecap="round"
            strokeDasharray={c}
            strokeDashoffset={c * (1 - pct / 100)}
            style={{ filter: `drop-shadow(0 0 6px ${color}66)`, transition: "stroke-dashoffset 1s ease" }}
          />
        </svg>
        <span
          className={cn(
            "absolute inset-0 flex items-center justify-center font-mono text-base font-semibold",
            value === null && "text-muted",
          )}
        >
          {value === null ? "—" : `${Math.round(pct)}%`}
        </span>
      </div>
      <span className="font-mono text-[10px] uppercase tracking-widest text-muted">{label}</span>
    </div>
  );
}
