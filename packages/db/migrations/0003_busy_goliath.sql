ALTER TABLE "alert_state" ALTER COLUMN "channel_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "cpu_percent" integer;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "mem_percent" integer;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "disk_percent" integer;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "metrics_updated_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "notification_channels" ADD CONSTRAINT "notification_channels_project_id_unique" UNIQUE("project_id");