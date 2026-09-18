import { Hono } from "hono";
import { cors } from "hono/cors";
import { logger } from "hono/logger";
import { createBunWebSocket } from "hono/bun";
import { healthRoute } from "./routes/health";
import { authRoute } from "./routes/auth";
import { serversRoute } from "./routes/servers";
import { githubRoute } from "./routes/github";
import { projectsRoute } from "./routes/projects";
import { deploysRoute } from "./routes/deploys";
import { agentWsHandler, startAgentCommandBridge } from "./ws/agent";
import type { AppEnv } from "./types";

const { upgradeWebSocket, websocket } = createBunWebSocket();

const app = new Hono<AppEnv>();

app.use("*", logger());
// credentials:true + an explicit origin (not "*") — required for the
// session cookie to travel with browser requests from the web app, which
// runs on a different port (see docs/PHASE1_DESIGN.md).
app.use(
  "*",
  cors({
    origin: process.env.WEB_URL ?? "http://localhost:3000",
    credentials: true,
  }),
);

app.route("/health", healthRoute);
app.route("/auth", authRoute);
app.route("/servers", serversRoute);
app.route("/github", githubRoute);
app.route("/projects", projectsRoute);
app.route("/deploys", deploysRoute);

// Agents dial out to this endpoint and stay connected — see
// docs/PHASE1_DESIGN.md section 3.
app.get(
  "/agent/ws",
  upgradeWebSocket(() => agentWsHandler()),
);

// Routes commands from apps/worker (a different process) to whichever
// agent sockets this process holds — see section 5.4.
startAgentCommandBridge();

const port = Number(process.env.PORT ?? 4000);
console.log(`[api] listening on :${port}`);

export default {
  fetch: app.fetch,
  websocket,
  port,
};
