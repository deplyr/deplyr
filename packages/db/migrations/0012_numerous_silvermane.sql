CREATE TABLE "instance_settings" (
	"id" text PRIMARY KEY DEFAULT 'default' NOT NULL,
	"custom_domain" text,
	"domain_status" "domain_ssl_status" DEFAULT 'none' NOT NULL,
	"domain_status_detail" text,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL
);
