CREATE TABLE "case_groups" (
	"case_id" text NOT NULL,
	"group_id" integer NOT NULL,
	CONSTRAINT "case_groups_case_id_group_id_pk" PRIMARY KEY("case_id","group_id")
);
--> statement-breakpoint
CREATE TABLE "group_viewers" (
	"group_id" integer NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "group_viewers_group_id_user_id_pk" PRIMARY KEY("group_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "cases" ADD COLUMN "visibility" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "case_groups" ADD CONSTRAINT "case_groups_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_groups" ADD CONSTRAINT "case_groups_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_viewers" ADD CONSTRAINT "group_viewers_group_id_groups_id_fk" FOREIGN KEY ("group_id") REFERENCES "public"."groups"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "group_viewers" ADD CONSTRAINT "group_viewers_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;