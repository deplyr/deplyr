CREATE TYPE "public"."audit_actor" AS ENUM('user', 'system', 'agent');--> statement-breakpoint
CREATE TYPE "public"."audit_status" AS ENUM('success', 'failure', 'info');--> statement-breakpoint
CREATE TABLE "audit_events" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"server_id" uuid,
	"actor" "audit_actor" DEFAULT 'user' NOT NULL,
	"action" text NOT NULL,
	"status" "audit_status" DEFAULT 'info' NOT NULL,
	"summary" text NOT NULL,
	"detail" text,
	"resource_type" text,
	"resource_id" uuid,
	"resource_name" text,
	"metadata" jsonb,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "audit_events" ADD CONSTRAINT "audit_events_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "audit_events_owner_time_idx" ON "audit_events" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "audit_events_server_time_idx" ON "audit_events" USING btree ("server_id","created_at");--> statement-breakpoint
-- Backfill: give the log a past, reconstructed from timestamps other tables
-- already keep, so it doesn't start empty on an existing install.
INSERT INTO "audit_events" ("owner_id", "server_id", "actor", "action", "status", "summary", "resource_type", "resource_id", "resource_name", "created_at")
SELECT "user_id", "id", 'user'::audit_actor, 'server.register', 'success'::audit_status, 'Registered server ' || "name", 'server', "id", "name", "created_at"
FROM "servers";--> statement-breakpoint
INSERT INTO "audit_events" ("owner_id", "server_id", "actor", "action", "status", "summary", "resource_type", "resource_id", "resource_name", "created_at")
SELECT "user_id", "id", 'system'::audit_actor, 'server.agent.connected', 'success'::audit_status, 'Agent connected on ' || "name", 'server', "id", "name", "agent_connected_at"
FROM "servers" WHERE "agent_connected_at" IS NOT NULL;--> statement-breakpoint
INSERT INTO "audit_events" ("owner_id", "server_id", "actor", "action", "status", "summary", "resource_type", "resource_id", "resource_name", "created_at")
SELECT "user_id", "server_id", 'user'::audit_actor, 'project.create', 'success'::audit_status, 'Created project ' || "name", 'project', "id", "name", "created_at"
FROM "projects";--> statement-breakpoint
INSERT INTO "audit_events" ("owner_id", "server_id", "actor", "action", "status", "summary", "resource_type", "resource_id", "resource_name", "created_at")
SELECT p."user_id", p."server_id", 'system'::audit_actor, 'deploy.run',
  (CASE d."status" WHEN 'success' THEN 'success' WHEN 'failed' THEN 'failure' ELSE 'info' END)::audit_status,
  CASE d."status" WHEN 'success' THEN 'Deployed ' || p."name" WHEN 'failed' THEN 'Deploy of ' || p."name" || ' failed' ELSE 'Deploying ' || p."name" END,
  'project', p."id", p."name", COALESCE(d."finished_at", d."started_at", d."created_at")
FROM "deploys" d JOIN "projects" p ON p."id" = d."project_id";--> statement-breakpoint
INSERT INTO "audit_events" ("owner_id", "server_id", "actor", "action", "status", "summary", "resource_type", "resource_id", "resource_name", "created_at")
SELECT s."user_id", d."server_id", 'user'::audit_actor, 'database.create', 'success'::audit_status, 'Created ' || d."type"::text || ' database ' || d."name", 'database', d."id", d."name", d."created_at"
FROM "databases" d JOIN "servers" s ON s."id" = d."server_id";
