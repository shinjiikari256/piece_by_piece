CREATE TABLE "results" (
	"id" integer PRIMARY KEY GENERATED ALWAYS AS IDENTITY (sequence name "results_id_seq" INCREMENT BY 1 MINVALUE 1 MAXVALUE 2147483647 START WITH 1 CACHE 1),
	"user_id" integer NOT NULL,
	"case_id" text NOT NULL,
	"case_number" text NOT NULL,
	"case_title" text NOT NULL,
	"total" integer NOT NULL,
	"max" integer NOT NULL,
	"hints_used" integer NOT NULL,
	"wrong_deductions" integer NOT NULL,
	"elapsed_ms" integer,
	"score" jsonb NOT NULL,
	"input" jsonb,
	"case_config_version" text,
	"game_version" text,
	"result_format_version" integer NOT NULL,
	"source" text DEFAULT 'client' NOT NULL,
	"finished_at" timestamp with time zone NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL
);
--> statement-breakpoint
ALTER TABLE "results" ADD CONSTRAINT "results_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "results_user_idx" ON "results" USING btree ("user_id");--> statement-breakpoint
CREATE INDEX "results_case_idx" ON "results" USING btree ("case_id");