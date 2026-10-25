ALTER TABLE "events" ADD COLUMN "publish_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "events" ADD COLUMN "required_cases" integer;