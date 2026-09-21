CREATE TYPE "public"."notification_status" AS ENUM('sent', 'failed');--> statement-breakpoint
ALTER TYPE "public"."channel_type" ADD VALUE 'discord';--> statement-breakpoint
CREATE TABLE "notifications" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"owner_id" uuid NOT NULL,
	"channel_id" uuid,
	"channel_name" text NOT NULL,
	"channel_type" "channel_type" NOT NULL,
	"event" text NOT NULL,
	"level" text DEFAULT 'info' NOT NULL,
	"title" text NOT NULL,
	"message" text NOT NULL,
	"status" "notification_status" NOT NULL,
	"error" text,
	"attempts" integer DEFAULT 1 NOT NULL,
	"dedupe_key" text,
	"project_id" uuid,
	"project_name" text,
	"server_id" uuid,
	"server_name" text,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "notification_channels" DROP CONSTRAINT "notification_channels_project_id_unique";--> statement-breakpoint
ALTER TABLE "notification_channels" ALTER COLUMN "project_id" DROP NOT NULL;--> statement-breakpoint
-- Existing channels were per-project Slack webhooks that only sent app up/down
-- alerts: keep exactly that behaviour, but under the new account-level model.
ALTER TABLE "notification_channels" ADD COLUMN "owner_id" uuid;--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "name" text DEFAULT 'Alerts' NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "hint" text;--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "events" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "notification_channels" ADD COLUMN "enabled" boolean DEFAULT true NOT NULL;--> statement-breakpoint
UPDATE "notification_channels" c SET "owner_id" = p."user_id", "name" = 'Slack — ' || p."name", "events" = '["app.down","app.recovered"]'::jsonb FROM "projects" p WHERE c."project_id" = p."id";--> statement-breakpoint
ALTER TABLE "notification_channels" ALTER COLUMN "owner_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_channel_id_notification_channels_id_fk" FOREIGN KEY ("channel_id") REFERENCES "public"."notification_channels"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "notifications" ADD CONSTRAINT "notifications_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "notifications_owner_time_idx" ON "notifications" USING btree ("owner_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_channel_time_idx" ON "notifications" USING btree ("channel_id","created_at");--> statement-breakpoint
CREATE INDEX "notifications_dedupe_idx" ON "notifications" USING btree ("dedupe_key","created_at");--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;