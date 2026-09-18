import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createBunWebSocket } from "hono/bun";
import { healthRoute } from "./routes/health";
import { agentWsHandler } from "./ws/agent";

const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = new Hono();

app.use("*", logger());
app.use("*", cors());

app.route("/health", healthRoute);

// Agents dial out to this endpoint and stay connected — see
// docs/PHASE1_DESIGN.md section 3.
app.get(
  "/agent/ws",
  upgradeWebSocket(() => agentWsHandler()),
);

// PR2+: app.route("/servers", serversRoute); app.route("/projects", projectsRoute); ...

const port = Number(process.env.PORT ?? 4000);
console.log(`[api] listening on :${port}`);

export default {
  fetch: app.fetch,
  websocket,
  port,
};
