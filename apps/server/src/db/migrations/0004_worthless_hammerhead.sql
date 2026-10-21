CREATE TABLE "event_access" (
	"event_id" integer NOT NULL,
	"group_id" integer NOT NULL,
	CONSTRAINT "event_access_event_id_group_id_pk" PRIMARY KEY("event_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "event_cases" (
	"event_id" integer NOT NULL,
	"case_id" text NOT NULL,
	CONSTRAINT "event_cases_event_id_case_id_pk" PRIMARY KEY("event_id","case_id")
);
--> statement-breakpoint
CREATE TABLE "events" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "events_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"title" text NOT NULL,
	"opens_at" timestamp with time zone,
	"closes_at" timestamp with time zone,
	"debrief_policy" text DEFAULT 'immediate' NOT NULL,
	"max_scored_attempts" integer,
	"created_by" integer,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "attempts" ADD COLUMN "event_id" integer;--> statement-breakpoint
ALTER TABLE "results" ADD COLUMN "event_id" integer;--> statement-breakpoint
ALTER TABLE "event_access" ADD CONSTRAINT "event_access_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_access" ADD CONSTRAINT "event_access_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_cases" ADD CONSTRAINT "event_cases_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_cases" ADD CONSTRAINT "event_cases_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "events" ADD CONSTRAINT "events_created_by_users_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "attempts" ADD CONSTRAINT "attempts_event_id_events_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."events"("id") ON DELETE set null ON UPDATE no action;