ALTER TABLE "pitch_vote" ADD COLUMN "event_id" text;--> statement-breakpoint
UPDATE "pitch_vote" AS "vote"
SET "event_id" = "pitch"."event_id"
FROM "pitch"
WHERE "vote"."pitch_id" = "pitch"."id";--> statement-breakpoint
DELETE FROM "pitch_vote" AS "vote"
USING (
	SELECT "id", row_number() OVER (
		PARTITION BY "event_id", "voter_id"
		ORDER BY "created_at" DESC, "id" DESC
	) AS "position"
	FROM "pitch_vote"
) AS "ranked"
WHERE "vote"."id" = "ranked"."id"
	AND "ranked"."position" > 1;--> statement-breakpoint
ALTER TABLE "pitch_vote" ALTER COLUMN "event_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "pitch_vote" ADD CONSTRAINT "pitch_vote_event_id_event_id_fk" FOREIGN KEY ("event_id") REFERENCES "public"."event"("id") ON DELETE cascade ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "pitch_vote" ADD CONSTRAINT "pitch_vote_event_id_voter_id_unique" UNIQUE("event_id","voter_id");
