import { Hono } from "hono";
import { connectToControlPlane } from "./connect";

// Local-only health endpoint (bound to loopback) so the Docker container's
// own HEALTHCHECK can confirm the process is alive. The agent never listens
// for anything reachable from outside the box — see docs/PHASE1_DESIGN.md
// section 3 for why it's outbound-only.
const app = new Hono().get("/healthz", (c) => c.json({ status: "ok" }));

const requiredEnvVars = ["DEPLYR_CONTROL_PLANE_WS", "DEPLYR_SERVER_ID", "DEPLYR_TOKEN"];
const missing = requiredEnvVars.filter((name) => !process.env[name]);

if (missing.length === 0) {
  connectToControlPlane();
} else {
  console.warn(
    `[agent] skipping control-plane connection — missing env vars: ${missing.join(", ")}`,
  );
}

export default {
  fetch: app.fetch,
  hostname: "127.0.0.1",
  port: Number(process.env.AGENT_HEALTH_PORT ?? 9200),
};
