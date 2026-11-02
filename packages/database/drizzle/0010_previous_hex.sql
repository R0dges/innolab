CREATE TABLE "project_join_request" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"project_id" text NOT NULL,
	"user_id" text NOT NULL,
	"status" text DEFAULT 'pending' NOT NULL,
	"reviewed_by" text,
	"reviewed_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "project_join_request_project_id_user_id_unique" UNIQUE("project_id","user_id")
);
--> statement-breakpoint
ALTER TABLE "project_join_request" ADD CONSTRAINT "project_join_request_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_join_request" ADD CONSTRAINT "project_join_request_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_join_request" ADD CONSTRAINT "project_join_request_user_id_user_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project_join_request" ADD CONSTRAINT "project_join_request_reviewed_by_user_id_fk" FOREIGN KEY ("reviewed_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "project_join_request_one_pending_per_event_user_idx" ON "project_join_request" USING btree ("event_id","user_id") WHERE "project_join_request"."status" = 'pending';--> statement-breakpoint
CREATE INDEX "project_join_request_project_status_idx" ON "project_join_request" USING btree ("project_id","status");