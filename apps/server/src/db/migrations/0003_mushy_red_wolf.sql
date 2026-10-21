CREATE TABLE "attempt_events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "attempt_events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"attempt_id" text NOT NULL,
	"type" text NOT NULL,
	"payload" jsonb,
	"at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
CREATE TABLE "attempts" (
	"id" text PRIMARY KEY NOT NULL,
	"user_id" integer NOT NULL,
	"case_id" text NOT NULL,
	"case_version_id" integer NOT NULL,
	"status" text DEFAULT 'active' NOT NULL,
	"started_at" timestamp with time zone,
	"paused_at" timestamp with time zone,
	"paused_ms" integer DEFAULT 0 NOT NULL,
	"last_event_at" timestamp with time zone DEFAULT now() NOT NULL,
	"hints_used" integer DEFAULT 0 NOT NULL,
	"wrong_deductions" integer DEFAULT 0 NOT NULL,
	"excluded_from_stats" boolean DEFAULT false NOT NULL,
	"finished_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "attempt_id" text;--> statement-breakpoint
ALTER TABLE "attempt_events" ADD CONSTRAINT "attempt_events_attempt_id_attempts_id_fk" FOREIGN KEY ("attempt_id") REFERENCES "public"."attempts"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_case_version_id_case_versions_id_fk" FOREIGN KEY ("case_version_id") REFERENCES "public"."case_versions"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "attempt_events_attempt_idx" ON "attempt_events" USING btree ("attempt_id");--> statement-breakpoint
CREATE INDEX "attempts_user_case_idx" ON "attempts" USING btree ("user_id","case_id","status");