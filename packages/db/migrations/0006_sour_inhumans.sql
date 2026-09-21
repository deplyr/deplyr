ALTER TYPE "public"."database_status" ADD VALUE 'stopped' BEFORE 'error';--> statement-breakpoint
ALTER TYPE "public"."database_status" ADD VALUE 'removing' BEFORE 'error';--> statement-breakpoint
ALTER TYPE "public"."database_type" ADD VALUE 'redis';--> statement-breakpoint
CREATE TABLE "database_metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"database_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"is_up" boolean NOT NULL,
	"latency_ms" integer,
	"stats" jsonb DEFAULT '{}'::jsonb NOT NULL
);
--> statement-breakpoint
ALTER TABLE "databases" DROP CONSTRAINT "databases_project_id_projects_id_fk";
--> statement-breakpoint
ALTER TABLE "databases" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
-- Existing rows predate server-level databases: add the new NOT NULL columns
-- nullable, backfill from the owning project / container name, then enforce.
ALTER TABLE "databases" ADD COLUMN "server_id" uuid;--> statement-breakpoint
ALTER TABLE "databases" ADD COLUMN "name" text;--> statement-breakpoint
UPDATE "databases" SET "server_id" = "projects"."server_id" FROM "projects" WHERE "databases"."project_id" = "projects"."id";--> statement-breakpoint
UPDATE "databases" SET "name" = "container_name";--> statement-breakpoint
ALTER TABLE "databases" ALTER COLUMN "server_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "databases" ALTER COLUMN "name" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "databases" ADD COLUMN "version" text DEFAULT '16' NOT NULL;--> statement-breakpoint
ALTER TABLE "databases" ADD COLUMN "memory_limit_mb" integer;--> statement-breakpoint
ALTER TABLE "databases" ADD COLUMN "config" jsonb DEFAULT '{}'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "databases" ADD COLUMN "password_encrypted" "bytea";--> statement-breakpoint
ALTER TABLE "databases" ADD COLUMN "status_detail" text;--> statement-breakpoint
ALTER TABLE "databases" ADD COLUMN "is_up" boolean;--> statement-breakpoint
ALTER TABLE "databases" ADD COLUMN "latency_ms" integer;--> statement-breakpoint
ALTER TABLE "databases" ADD COLUMN "stats" jsonb;--> statement-breakpoint
ALTER TABLE "databases" ADD COLUMN "last_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "database_metrics" ADD CONSTRAINT "database_metrics_database_id_databases_id_fk" FOREIGN KEY ("database_id") REFERENCES "public"."databases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "database_metrics_db_time_idx" ON "database_metrics" USING btree ("database_id","recorded_at");--> statement-breakpoint
ALTER TABLE "databases" ADD CONSTRAINT "databases_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "databases" ADD CONSTRAINT "databases_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "databases_server_name_idx" ON "databases" USING btree ("server_id","name");--> statement-breakpoint
CREATE UNIQUE INDEX "databases_server_port_idx" ON "databases" USING btree ("server_id","port");