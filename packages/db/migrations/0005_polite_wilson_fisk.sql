CREATE TABLE "server_metrics" (
	"id" bigserial PRIMARY KEY NOT NULL,
	"server_id" uuid NOT NULL,
	"recorded_at" timestamp with time zone DEFAULT now() NOT NULL,
	"cpu_percent" integer NOT NULL,
	"mem_percent" integer NOT NULL,
	"disk_percent" integer NOT NULL,
	"load_avg_1" real
);
--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "cpu_cores" integer;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "mem_total_mb" integer;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "disk_total_gb" integer;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "uptime_seconds" integer;--> statement-breakpoint
ALTER TABLE "servers" ADD COLUMN "load_avg_1" real;--> statement-breakpoint
ALTER TABLE "server_metrics" ADD CONSTRAINT "server_metrics_server_id_servers_id_fk" FOREIGN KEY ("server_id") REFERENCES "public"."servers"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "server_metrics_server_time_idx" ON "server_metrics" USING btree ("server_id","recorded_at");