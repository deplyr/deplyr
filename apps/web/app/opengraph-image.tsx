import { ImageResponse } from "next/og";
import { SITE_NAME } from "@/lib/site";

// The social preview card (shown by Slack, Discord, LinkedIn, X, iMessage…).
// Generated from code at request time — 1200×630 is what those platforms
// expect, and most of them ignore SVG for this, so it has to be a raster.
export const alt = "Deplyr — open-source, self-hosted deploy platform";
export const size = { width: 1200, height: 630 };
export const contentType = "image/png";

function Mark({ px }: { px: number }) {
  const u = px / 40; // the mark is drawn on a 40-unit grid
  const layer = (x: number, y: number, s: number, r: number, opacity: number) => (
    <div style={{ position: "absolute", left: x * u, top: y * u, width: s * u, height: s * u, borderRadius: r * u, background: "#fff", opacity }} />
  );
  return (
    <div style={{ position: "relative", display: "flex", width: px, height: px, borderRadius: 11 * u, background: "linear-gradient(135deg, #FB923C, #EA580C)" }}>
      {layer(9, 19, 13, 4, 0.32)}
      {layer(13, 15, 14, 4.5, 0.6)}
      {layer(17, 11, 15, 5, 1)}
      <div style={{ position: "absolute", left: 22.5 * u, top: 16.5 * u, width: 4 * u, height: 4 * u, borderRadius: 4 * u, background: "#EA580C" }} />
    </div>
  );
}

export default function OpengraphImage() {
  return new ImageResponse(
    (
      <div
        style={{
          width: "100%",
          height: "100%",
          display: "flex",
          flexDirection: "column",
          justifyContent: "space-between",
          padding: 72,
          background: "linear-gradient(160deg, #1c1917 0%, #0c0a09 100%)",
          color: "#fafaf9",
        }}
      >
        <div style={{ display: "flex", alignItems: "center", gap: 20 }}>
          <Mark px={72} />
          <div style={{ fontSize: 40, fontWeight: 700, letterSpacing: -1 }}>{SITE_NAME}</div>
        </div>

        <div style={{ display: "flex", flexDirection: "column", gap: 20 }}>
          <div style={{ display: "flex", flexDirection: "column", fontSize: 76, fontWeight: 700, lineHeight: 1.05, letterSpacing: -2 }}>
            <span>From GitHub repo to</span>
            <span style={{ color: "#FB923C" }}>live on your own server.</span>
          </div>
          <div style={{ fontSize: 30, color: "#a8a29e", lineHeight: 1.35, maxWidth: 900 }}>
            Open source and self-hosted — deploy apps, run Postgres and Redis, add domains with free SSL, get alerts.
          </div>
        </div>

        <div style={{ display: "flex", justifyContent: "space-between", fontSize: 26, color: "#a8a29e" }}>
          <span>deplyr.abhilaksharora.com</span>
          <span>github.com/deplyr/deplyr</span>
        </div>
      </div>
    ),
    size,
  );
}
