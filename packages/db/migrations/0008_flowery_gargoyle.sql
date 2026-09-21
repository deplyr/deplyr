ALTER TYPE "public"."framework" ADD VALUE 'nestjs' BEFORE 'node';--> statement-breakpoint
ALTER TYPE "public"."framework" ADD VALUE 'dockerfile';--> statement-breakpoint
ALTER TABLE "projects" ADD COLUMN "settings" jsonb DEFAULT '{}'::jsonb NOT NULL;