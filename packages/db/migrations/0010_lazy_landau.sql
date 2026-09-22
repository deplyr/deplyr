CREATE TYPE "public"."domain_ssl_status" AS ENUM('none', 'provisioning', 'active', 'renewing', 'error');--> statement-breakpoint
CREATE TYPE "public"."domain_status" AS ENUM('pending_dns', 'provisioning', 'active', 'error');--> statement-breakpoint
CREATE TABLE "domains" (
	"id" uuid PRIMARY KEY DEFAULT gen_random_uuid() NOT NULL,
	"project_id" uuid NOT NULL,
	"hostname" text NOT NULL,
	"status" "domain_status" DEFAULT 'pending_dns' NOT NULL,
	"status_detail" text,
	"ssl_status" "domain_ssl_status" DEFAULT 'none' NOT NULL,
	"ssl_status_detail" text,
	"cert_expires_at" timestamp with time zone,
	"last_checked_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "domains_hostname_unique" UNIQUE("hostname")
);
--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "default_domain_https" boolean DEFAULT false NOT NULL;--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "default_domain_checked_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "domains" ADD CONSTRAINT "domains_project_id_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."projects"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "domains_project_idx" ON "domains" USING btree ("project_id");