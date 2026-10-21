CREATE TABLE "saves" (
	"user_id" integer NOT NULL,
	"case_id" text NOT NULL,
	"body" jsonb NOT NULL,
	"saved_at" bigint NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "saves_user_id_case_id_pk" PRIMARY KEY("user_id","case_id")
);
--> statement-breakpoint
ALTER TABLE "saves" ADD CONSTRAINT "saves_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;