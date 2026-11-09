CREATE TABLE "coach_favorite" (
	"event_id" text NOT NULL,
	"coach_id" text NOT NULL,
	"project_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "coach_favorite_event_id_coach_id_pk" PRIMARY KEY("event_id","coach_id")
);
--> statement-breakpoint
CREATE TABLE "collective_score" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"project_id" text NOT NULL,
	"criteria" jsonb NOT NULL,
	"comment" text,
	"revision" integer DEFAULT 1 NOT NULL,
	"updated_by" text,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL,
	CONSTRAINT "collective_score_event_project_unique" UNIQUE("event_id","project_id")
);
--> statement-breakpoint
CREATE TABLE "platform_setting" (
	"key" text PRIMARY KEY NOT NULL,
	"value" jsonb NOT NULL,
	"updated_by" text,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "result_publication" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"version" integer NOT NULL,
	"snapshot" jsonb NOT NULL,
	"published_by" text,
	"created_at" timestamp NOT NULL,
	"is_current" boolean DEFAULT true NOT NULL,
	CONSTRAINT "result_publication_event_version_unique" UNIQUE("event_id","version")
);
--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "rubric_revision" integer DEFAULT 0 NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "activated_at" timestamp;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "cancelled_at" timestamp;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "archived_at" timestamp;--> statement-breakpoint
ALTER TABLE "coach_favorite" ADD CONSTRAINT "coach_favorite_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_favorite" ADD CONSTRAINT "coach_favorite_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "coach_favorite" ADD CONSTRAINT "coach_favorite_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collective_score" ADD CONSTRAINT "collective_score_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collective_score" ADD CONSTRAINT "collective_score_project_id_project_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."project"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "collective_score" ADD CONSTRAINT "collective_score_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "platform_setting" ADD CONSTRAINT "platform_setting_updated_by_user_id_fk" FOREIGN KEY ("updated_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_publication" ADD CONSTRAINT "result_publication_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "result_publication" ADD CONSTRAINT "result_publication_published_by_user_id_fk" FOREIGN KEY ("published_by") REFERENCES "public"."user"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "coach_favorite_project_idx" ON "coach_favorite" USING btree ("project_id");--> statement-breakpoint
CREATE INDEX "collective_score_event_idx" ON "collective_score" USING btree ("event_id");--> statement-breakpoint
CREATE INDEX "result_publication_current_idx" ON "result_publication" USING btree ("event_id","is_current");--> statement-breakpoint
CREATE UNIQUE INDEX "event_one_active_per_location_idx" ON "event" USING btree ("location") WHERE "event"."visibility" = 'published' and "event"."activated_at" is not null and "event"."cancelled_at" is null and "event"."archived_at" is null;