CREATE TABLE "case_editors" (
	"case_id" text NOT NULL,
	"user_id" integer NOT NULL,
	CONSTRAINT "case_editors_case_id_user_id_pk" PRIMARY KEY("case_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "case_editors" ADD CONSTRAINT "case_editors_case_id_cases_id_fk" FOREIGN KEY ("case_id") REFERENCES "public"."cases"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "case_editors" ADD CONSTRAINT "case_editors_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;