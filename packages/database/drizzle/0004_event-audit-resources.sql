CREATE TABLE "event_document" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"kind" text DEFAULT 'audit' NOT NULL,
	"title" text NOT NULL,
	"url" text NOT NULL,
	"summary" text,
	"findings" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"problems" jsonb DEFAULT '[]'::jsonb NOT NULL,
	"version" integer NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	"created_by" text,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "event_document_event_id_kind_version_unique" UNIQUE("event_id","kind","version")
);
--> statement-breakpoint
CREATE TABLE "event_resource" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"kind" text NOT NULL,
	"name" text NOT NULL,
	"category" text NOT NULL,
	"description" text,
	"url" text,
	"access_level" text DEFAULT 'event' NOT NULL,
	"availability" text DEFAULT 'available' NOT NULL,
	"owner_name" text,
	"position" integer DEFAULT 0 NOT NULL,
	"created_by" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
ALTER TABLE "event_document" ADD CONSTRAINT "event_document_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_document" ADD CONSTRAINT "event_document_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_resource" ADD CONSTRAINT "event_resource_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "event_resource" ADD CONSTRAINT "event_resource_created_by_user_id_fk" FOREIGN KEY ("created_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "event_document_current_idx" ON "event_document" USING btree ("event_id","kind","is_current");--> statement-breakpoint
CREATE INDEX "event_resource_event_kind_idx" ON "event_resource" USING btree ("event_id","kind","position");