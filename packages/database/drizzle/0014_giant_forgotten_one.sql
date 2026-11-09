CREATE TABLE "pitch_tie_break_vote" (
	"id" text PRIMARY KEY NOT NULL,
	"event_id" text NOT NULL,
	"round" integer NOT NULL,
	"pitch_id" text NOT NULL,
	"coach_id" text NOT NULL,
	"created_at" timestamp NOT NULL,
	CONSTRAINT "pitch_tie_break_vote_choice_unique" UNIQUE("event_id","round","pitch_id","coach_id")
);
--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "pitch_tie_break_round" integer;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "pitch_tie_break_candidate_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "pitch_tie_break_selected_ids" jsonb DEFAULT '[]'::jsonb NOT NULL;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "pitch_tie_break_slots" integer;--> statement-breakpoint
ALTER TABLE "pitch_tie_break_vote" ADD CONSTRAINT "pitch_tie_break_vote_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_tie_break_vote" ADD CONSTRAINT "pitch_tie_break_vote_pitch_id_pitch_id_fk" FOREIGN KEY ("pitch_id") REFERENCES "public"."pitch"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_tie_break_vote" ADD CONSTRAINT "pitch_tie_break_vote_coach_id_user_id_fk" FOREIGN KEY ("coach_id") REFERENCES "public"."user"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "pitch_tie_break_vote_round_idx" ON "pitch_tie_break_vote" USING btree ("event_id","round");