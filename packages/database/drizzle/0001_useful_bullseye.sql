CREATE TABLE "pitch" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"author_id" text NOT NULL,
	"title" text NOT NULL,
	"description" text NOT NULL,
	"status" text DEFAULT 'draft' NOT NULL,
	"submitted_at" timestamp,
	"created_at" timestamp NOT NULL,
	"updated_at" timestamp NOT NULL
);
--> statement-breakpoint
CREATE TABLE "pitch_vote" (
	"id" text PRIMARY KEY NOT NULL,
	"pitch_id" text NOT NULL,
	"voter_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "pitch_vote_pitch_id_voter_id_unique" UNIQUE("pitch_id","voter_id")
);
--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "workflow" text DEFAULT 'standard' NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "pitch_submissions_open" timestamp;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "pitch_submissions_close" timestamp;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "pitch_voting_open" timestamp;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "pitch_voting_close" timestamp;--> statement-breakpoint
ALTER TABLE "project" ADD COLUMN "pitch_id" text;--> statement-breakpoint
ALTER TABLE "pitch" ADD CONSTRAINT "pitch_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch" ADD CONSTRAINT "pitch_author_id_user_id_fk" FOREIGN KEY ("author_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_vote" ADD CONSTRAINT "pitch_vote_pitch_id_pitch_id_fk" FOREIGN KEY ("pitch_id") REFERENCES "public"."pitch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_vote" ADD CONSTRAINT "pitch_vote_voter_id_user_id_fk" FOREIGN KEY ("voter_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pitch_event_status_idx" ON "pitch" USING btree ("event_id","status");--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_pitch_id_pitch_id_fk" FOREIGN KEY ("pitch_id") REFERENCES "public"."pitch"("id") ON DELETE set null ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "project" ADD CONSTRAINT "project_pitch_id_unique" UNIQUE("pitch_id");