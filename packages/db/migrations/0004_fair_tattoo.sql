ALTER TABLE "users" ALTER COLUMN "github_id" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "github_login" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ALTER COLUMN "github_access_token" DROP NOT NULL;--> statement-breakpoint
ALTER TABLE "users" ADD COLUMN "password_hash" text;