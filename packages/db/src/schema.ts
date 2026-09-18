import {
  pgTable,
  pgEnum,
  uuid,
  text,
  timestamp,
  boolean,
  integer,
  customType,
  unique,
} from "drizzle-orm/pg-core";
import { relations } from "drizzle-orm";

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

export const frameworkEnum = pgEnum("framework", ["nextjs", "node"]);

export const projectStatusEnum = pgEnum("project_status", [
  "created",
  "deploying",
  "live",
  "failed",
]);

export const secretSourceEnum = pgEnum("secret_source", ["user", "system"]);

export const databaseTypeEnum = pgEnum("database_type", ["postgres"]);

export const databaseStatusEnum = pgEnum("database_status", [
  "provisioning",
  "running",
  "error",
]);

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

export const channelTypeEnum = pgEnum("channel_type", ["slack"]);

// ---------------------------------------------------------------------------
// tables
// ---------------------------------------------------------------------------

export const users = pgTable("users", {
  id: uuid("id").primaryKey().defaultRandom(),
  email: text("email").notNull().unique(),
  githubId: text("github_id").notNull().unique(),
  githubLogin: text("github_login").notNull(),
  githubAccessToken: encryptedBytes("github_access_token").notNull(),
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
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
  updatedAt: timestamp("updated_at", { withTimezone: true }).notNull().defaultNow(),
});

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
  appPort: integer("app_port"),
  status: projectStatusEnum("status").notNull().default("created"),
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

export const databases = pgTable("databases", {
  id: uuid("id").primaryKey().defaultRandom(),
  projectId: uuid("project_id")
    .notNull()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: databaseTypeEnum("type").notNull().default("postgres"),
  containerName: text("container_name").notNull(),
  // set by the db:provision job once it allocates one — same pattern as
  // servers.agent_token_hash and projects.app_port.
  port: integer("port"),
  connectionSecretKey: text("connection_secret_key").notNull().default("DATABASE_URL"),
  status: databaseStatusEnum("status").notNull().default("provisioning"),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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

export const notificationChannels = pgTable("notification_channels", {
  id: uuid("id").primaryKey().defaultRandom(),
  // One channel per project in Phase 1 (single hardcoded Slack rule).
  projectId: uuid("project_id")
    .notNull()
    .unique()
    .references(() => projects.id, { onDelete: "cascade" }),
  type: channelTypeEnum("type").notNull().default("slack"),
  webhookUrl: encryptedBytes("webhook_url").notNull(),
  createdAt: timestamp("created_at", { withTimezone: true }).notNull().defaultNow(),
});

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
