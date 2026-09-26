import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  real,
  bigserial,
  index,
  jsonb,
  uniqueIndex,
  customType,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";
import type { ProjectSettings } from "@deplyr/shared-types";

/**
 * Phase 1 schema — see docs/PHASE1_DESIGN.md section 2 for the design
 * rationale. Anything sensitive (tokens, credentials, secret values, webhook
 * URLs) is stored as `bytea` via the shared `encryptedBytes` custom type and
 * goes through the single envelope-encryption helper in ./crypto.ts — no
 * column gets its own ad-hoc encryption scheme.
 */

export const encryptedBytes = customType<{ data: Buffer; driverData: Buffer }>({
  dataType() {
    return "bytea";
  },
});

// ---------------------------------------------------------------------------
// enums
// ---------------------------------------------------------------------------

export const sshCredentialTypeEnum = pgEnum("ssh_credential_type", [
  "password",
  "private_key",
]);

export const serverStatusEnum = pgEnum("server_status", [
  "pending",
  "installing",
  "connected",
  "error",
]);

export const frameworkEnum = pgEnum("framework", ["nextjs", "nestjs", "node", "dockerfile"]);

export const projectStatusEnum = pgEnum("project_status", [
  "created",
  "deploying",
  "live",
  "failed",
]);

export const secretSourceEnum = pgEnum("secret_source", ["user", "system"]);

export const databaseTypeEnum = pgEnum("database_type", ["postgres", "redis"]);

export const databaseStatusEnum = pgEnum("database_status", [
  "provisioning",
  "running",
  "stopped",
  "removing",
  "error",
]);

export const auditStatusEnum = pgEnum("audit_status", ["success", "failure", "info"]);
export const auditActorEnum = pgEnum("audit_actor", ["user", "system", "agent"]);

export const deployStatusEnum = pgEnum("deploy_status", [
  "queued",
  "running",
  "success",
  "failed",
]);

export const deployStepNameEnum = pgEnum("deploy_step_name", [
  "clone",
  "install",
  "build",
  "write_env",
  "start",
  "nginx",
  "ssl",
  "health_check",
]);

export const deployStepStatusEnum = pgEnum("deploy_step_status", [
  "pending",
  "running",
  "success",
  "failed",
]);

export const channelTypeEnum = pgEnum("channel_type", ["slack", "discord"]);
export const notificationStatusEnum = pgEnum("notification_status", ["sent", "failed"]);

export const domainStatusEnum = pgEnum("domain_status", [
  "pending_dns", // waiting on the user to create the DNS record
  "provisioning", // DNS looks right, nginx + certificate are being set up
  "active",
  "error",
  "removing",
]);
export const domainSslStatusEnum = pgEnum("domain_ssl_status", [
  "none",
  "provisioning",
  "active",
  "renewing",
  "error",
]);

// ---------------------------------------------------------------------------
// tables
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  // Null for a password-only account that hasn't connected GitHub yet —
  // GitHub is still required per-project for repo access (see
  // apps/api/src/lib/user-github-token.ts), just not for login itself.
  githubId: text("github_id").unique(),
  githubLogin: text("github_login"),
  githubAccessToken: encryptedBytes("github_access_token"),
  passwordHash: text("password_hash"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const servers = pgTable("servers", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  ipAddress: text("ip_address").notNull(),
  sshCredential: encryptedBytes("ssh_credential").notNull(),
  sshCredentialType: sshCredentialTypeEnum("ssh_credential_type").notNull(),
  // set by the server:install job once it generates the agent's token —
  // null between "row created" and "install job reached that step".
  agentTokenHash: text("agent_token_hash"),
  status: serverStatusEnum("status").notNull().default("pending"),
  statusDetail: text("status_detail"),
  dockerInstalled: boolean("docker_installed").notNull().default(false),
  agentConnectedAt: timestamp("agent_connected_at", { withTimezone: true }),
  // Latest heartbeat snapshot only — no history table in Phase 1 (see
  // docs/PHASE1_DESIGN.md PR7 notes).
  cpuPercent: integer("cpu_percent"),
  memPercent: integer("mem_percent"),
  diskPercent: integer("disk_percent"),
  metricsUpdatedAt: timestamp("metrics_updated_at", { withTimezone: true }),
  // Static-ish facts about the box, refreshed by every heartbeat. Nullable:
  // agents installed before these fields existed simply don't send them.
  cpuCores: integer("cpu_cores"),
  memTotalMb: integer("mem_total_mb"),
  diskTotalGb: integer("disk_total_gb"),
  uptimeSeconds: integer("uptime_seconds"),
  loadAvg1: real("load_avg_1"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

// One row per heartbeat (every ~15s), pruned to a rolling window — see
// apps/api/src/lib/server-metrics.ts. Powers the server page's history charts.
export const serverMetrics = pgTable(
  "server_metrics",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    cpuPercent: integer("cpu_percent").notNull(),
    memPercent: integer("mem_percent").notNull(),
    diskPercent: integer("disk_percent").notNull(),
    loadAvg1: real("load_avg_1"),
  },
  (table) => [index("server_metrics_server_time_idx").on(table.serverId, table.recordedAt)],
);

export const projects = pgTable("projects", {
  id: uuid("id").primaryKey().defaultRandom(),
  userId: uuid("user_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  serverId: uuid("server_id")
    .notNull()
    .references(() => servers.id, { onDelete: "cascade" }),
  name: text("name").notNull(),
  subdomain: text("subdomain").notNull().unique(),
  githubRepo: text("github_repo").notNull(),
  githubBranch: text("github_branch").notNull().default("main"),
  framework: frameworkEnum("framework"),
  // Build/run configuration (see ProjectSettings in shared-types). Empty for
  // projects created before this existed — they resolve to the old defaults.
  settings: jsonb("settings").$type<ProjectSettings>().notNull().default({}),
  appPort: integer("app_port"),
  status: projectStatusEnum("status").notNull().default("created"),
  // Live status of the default <subdomain>.<appDomain> address — set by the
  // deploy pipeline's ssl step, which is the only thing that knows whether an
  // operator-supplied wildcard cert was actually configured for it. Distinct
  // from a deploy's historical "ssl" step outcome: this reflects the *current*
  // state, which a later cert change or a DNS-only redeploy can update without
  // a full deploy.
  defaultDomainHttps: boolean("default_domain_https").notNull().default(false),
  defaultDomainCheckedAt: timestamp("default_domain_checked_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const secrets = pgTable(
  "secrets",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    key: text("key").notNull(),
    value: encryptedBytes("value").notNull(),
    source: secretSourceEnum("source").notNull().default("user"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
    updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [unique().on(table.projectId, table.key)],
);

// A database is a server-level resource: several per server, optionally
// linked to a project (in which case its connection string is injected into
// that project's secrets). Only the agent's host binds it to loopback — see
// apps/agent/src/commands/db-provision.ts.
export const databases = pgTable(
  "databases",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    serverId: uuid("server_id")
      .notNull()
      .references(() => servers.id, { onDelete: "cascade" }),
    // Null = standalone; set = linked, and the connection string is kept in
    // that project's secrets under `connection_secret_key`.
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    name: text("name").notNull(),
    type: databaseTypeEnum("type").notNull().default("postgres"),
    version: text("version").notNull().default("16"),
    containerName: text("container_name").notNull(),
    port: integer("port"),
    memoryLimitMb: integer("memory_limit_mb"),
    // Postgres: { dbName, username }. Redis: { policy, persistence }.
    config: jsonb("config").$type<Record<string, string | number>>().notNull().default({}),
    // Encrypted at rest like every other credential. Null only for rows that
    // predate this column — their password lives in the linked project secret.
    passwordEncrypted: encryptedBytes("password_encrypted"),
    connectionSecretKey: text("connection_secret_key").notNull().default("DATABASE_URL"),
    status: databaseStatusEnum("status").notNull().default("provisioning"),
    statusDetail: text("status_detail"),
    // Latest health sample from the agent; history lives in database_metrics.
    isUp: boolean("is_up"),
    latencyMs: integer("latency_ms"),
    stats: jsonb("stats").$type<Record<string, number | null>>(),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    uniqueIndex("databases_server_name_idx").on(table.serverId, table.name),
    uniqueIndex("databases_server_port_idx").on(table.serverId, table.port),
  ],
);

// One row per agent sample (~30s), pruned to 7 days — same idea as server_metrics.
export const databaseMetrics = pgTable(
  "database_metrics",
  {
    id: bigserial("id", { mode: "number" }).primaryKey(),
    databaseId: uuid("database_id")
      .notNull()
      .references(() => databases.id, { onDelete: "cascade" }),
    recordedAt: timestamp("recorded_at", { withTimezone: true }).notNull().defaultNow(),
    isUp: boolean("is_up").notNull(),
    latencyMs: integer("latency_ms"),
    // Engine-specific numbers (hitRate, memUsedMb, connections, ...). jsonb
    // keeps one table for every engine; the history query only reads keys
    // from a fixed whitelist (see apps/api/src/lib/database-metrics.ts).
    stats: jsonb("stats").$type<Record<string, number | null>>().notNull().default({}),
  },
  (table) => [index("database_metrics_db_time_idx").on(table.databaseId, table.recordedAt)],
);

export const deploys = pgTable("deploys", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  status: deployStatusEnum("status").notNull().default("queued"),
  commitSha: text("commit_sha"),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

export const deploySteps = pgTable("deploy_steps", {
  id: uuid("id").primaryKey().defaultRandom(),
  deployId: uuid("deploy_id")
    .notNull()
    .references(() => deploys.id, { onDelete: "cascade" }),
  name: deployStepNameEnum("name").notNull(),
  orderIndex: integer("order_index").notNull(),
  status: deployStepStatusEnum("status").notNull().default("pending"),
  log: text("log").notNull().default(""),
  startedAt: timestamp("started_at", { withTimezone: true }),
  finishedAt: timestamp("finished_at", { withTimezone: true }),
});

// Where alerts get sent. Account-level: a channel belongs to a person and
// optionally narrows to one project; `events` says what it wants to hear about.
export const notificationChannels = pgTable("notification_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  ownerId: uuid("owner_id")
    .notNull()
    .references(() => users.id, { onDelete: "cascade" }),
  // null = every project the owner has.
  projectId: uuid("project_id").references(() => projects.id, { onDelete: "cascade" }),
  type: channelTypeEnum("type").notNull().default("slack"),
  name: text("name").notNull().default("Alerts"),
  webhookUrl: encryptedBytes("webhook_url").notNull(),
  // Last few characters, so a channel is recognisable without revealing the URL.
  hint: text("hint"),
  events: jsonb("events").$type<string[]>().notNull().default([]),
  enabled: boolean("enabled").notNull().default(true),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

// Every message Deplyr tried to send — delivered or not, real or a test — so
// "did my alert actually go out?" always has an answer. Names are copied in so
// a line stays readable after the channel or project it mentions is deleted.
export const notifications = pgTable(
  "notifications",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    channelId: uuid("channel_id").references(() => notificationChannels.id, { onDelete: "set null" }),
    channelName: text("channel_name").notNull(),
    channelType: channelTypeEnum("channel_type").notNull(),
    event: text("event").notNull(),
    level: text("level").notNull().default("info"),
    title: text("title").notNull(),
    message: text("message").notNull(),
    status: notificationStatusEnum("status").notNull(),
    error: text("error"),
    attempts: integer("attempts").notNull().default(1),
    // Same key + same channel within the cooldown window = duplicate, not sent.
    dedupeKey: text("dedupe_key"),
    projectId: uuid("project_id").references(() => projects.id, { onDelete: "set null" }),
    projectName: text("project_name"),
    serverId: uuid("server_id").references(() => servers.id, { onDelete: "set null" }),
    serverName: text("server_name"),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("notifications_owner_time_idx").on(table.ownerId, table.createdAt),
    index("notifications_channel_time_idx").on(table.channelId, table.createdAt),
    index("notifications_dedupe_idx").on(table.dedupeKey, table.createdAt),
  ],
);

export const alertState = pgTable("alert_state", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  // Null until a channel is configured — the health-check sweep tracks
  // is_healthy for every live project regardless (the dashboard's
  // traffic-light status needs it), but only sends a Slack message once
  // there's somewhere to send it.
  channelId: uuid("channel_id").references(() => notificationChannels.id, {
    onDelete: "cascade",
  }),
  isHealthy: boolean("is_healthy").notNull().default(true),
  lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
  lastAlertSentAt: timestamp("last_alert_sent_at", { withTimezone: true }),
});

// Append-only record of what happened on a user's servers — deploys, database
// changes, installs, alerts. Names are copied in (resource_name, summary) so a
// line like "Deleted database ui-cache" still reads correctly after the row it
// describes is gone. Never holds secret values, only which secret was touched.
// A custom domain pointed at a project, on top of its free <subdomain>.<appDomain>.
// Verification is a DNS lookup done from the control plane (same public DNS
// everyone sees); provisioning (nginx block + ACME certificate) happens on the
// agent, once DNS resolves where we expect.
export const domains = pgTable(
  "domains",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    projectId: uuid("project_id")
      .notNull()
      .references(() => projects.id, { onDelete: "cascade" }),
    hostname: text("hostname").notNull().unique(),
    status: domainStatusEnum("status").notNull().default("pending_dns"),
    statusDetail: text("status_detail"),
    sslStatus: domainSslStatusEnum("ssl_status").notNull().default("none"),
    sslStatusDetail: text("ssl_status_detail"),
    certExpiresAt: timestamp("cert_expires_at", { withTimezone: true }),
    lastCheckedAt: timestamp("last_checked_at", { withTimezone: true }),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [index("domains_project_idx").on(table.projectId)],
);

// Singleton — one row, id fixed to "default". Not per-project (see
// `domains` above, which is): this is the control plane's *own* public
// address, set from the dashboard instead of an env var + manual rebuild.
export const instanceSettings = pgTable("instance_settings", {
  id: text("id").primaryKey().default("default"),
  customDomain: text("custom_domain"),
  // Reuses domain_ssl_status's shape (none/provisioning/active/error) — no
  // "pending_dns" step here, since this domain isn't verified against a DNS
  // record the way a project's is; it's just "did Caddy accept it".
  domainStatus: domainSslStatusEnum("domain_status").notNull().default("none"),
  domainStatusDetail: text("domain_status_detail"),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

export const auditEvents = pgTable(
  "audit_events",
  {
    id: uuid("id").primaryKey().defaultRandom(),
    // Whose data this is — every read is scoped by it.
    ownerId: uuid("owner_id")
      .notNull()
      .references(() => users.id, { onDelete: "cascade" }),
    // set null, not cascade: history should outlive the server it describes.
    serverId: uuid("server_id").references(() => servers.id, { onDelete: "set null" }),
    actor: auditActorEnum("actor").notNull().default("user"),
    // "<category>.<verb>", e.g. "database.create", "deploy.run". The category
    // (before the first dot) drives the UI filters.
    action: text("action").notNull(),
    status: auditStatusEnum("status").notNull().default("info"),
    summary: text("summary").notNull(),
    detail: text("detail"),
    resourceType: text("resource_type"),
    resourceId: uuid("resource_id"),
    resourceName: text("resource_name"),
    metadata: jsonb("metadata").$type<Record<string, string | number | boolean | null>>(),
    createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  },
  (table) => [
    index("audit_events_owner_time_idx").on(table.ownerId, table.createdAt),
    index("audit_events_server_time_idx").on(table.serverId, table.createdAt),
  ],
);

// ---------------------------------------------------------------------------
// relations (for Drizzle's relational query API)
// ---------------------------------------------------------------------------

export const usersRelations = relations(users, ({ many }) => ({
  servers: many(servers),
  projects: many(projects),
}));

export const serversRelations = relations(servers, ({ one, many }) => ({
  user: one(users, { fields: [servers.userId], references: [users.id] }),
  projects: many(projects),
}));

export const projectsRelations = relations(projects, ({ one, many }) => ({
  user: one(users, { fields: [projects.userId], references: [users.id] }),
  server: one(servers, { fields: [projects.serverId], references: [servers.id] }),
  secrets: many(secrets),
  databases: many(databases),
  domains: many(domains),
  deploys: many(deploys),
  notificationChannels: many(notificationChannels),
  alertState: one(alertState, {
    fields: [projects.id],
    references: [alertState.projectId],
  }),
}));

export const secretsRelations = relations(secrets, ({ one }) => ({
  project: one(projects, { fields: [secrets.projectId], references: [projects.id] }),
}));

export const databasesRelations = relations(databases, ({ one }) => ({
  project: one(projects, { fields: [databases.projectId], references: [projects.id] }),
  server: one(servers, { fields: [databases.serverId], references: [servers.id] }),
}));

export const deploysRelations = relations(deploys, ({ one, many }) => ({
  project: one(projects, { fields: [deploys.projectId], references: [projects.id] }),
  steps: many(deploySteps),
}));

export const deployStepsRelations = relations(deploySteps, ({ one }) => ({
  deploy: one(deploys, { fields: [deploySteps.deployId], references: [deploys.id] }),
}));

export const notificationChannelsRelations = relations(
  notificationChannels,
  ({ one }) => ({
    project: one(projects, {
      fields: [notificationChannels.projectId],
      references: [projects.id],
    }),
  }),
);

export const alertStateRelations = relations(alertState, ({ one }) => ({
  project: one(projects, { fields: [alertState.projectId], references: [projects.id] }),
  channel: one(notificationChannels, {
    fields: [alertState.channelId],
    references: [notificationChannels.id],
  }),
}));

export const domainsRelations = relations(domains, ({ one }) => ({
  project: one(projects, { fields: [domains.projectId], references: [projects.id] }),
}));
