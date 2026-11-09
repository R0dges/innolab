CREATE TABLE "event_assistant" (
	"event_id" text PRIMARY KEY NOT NULL,
	"url" text NOT NULL,
	"updated_by" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_assistant" ADD CONSTRAINT "event_assistant_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_assistant" ADD CONSTRAINT "event_assistant_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;