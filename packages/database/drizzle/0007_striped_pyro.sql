ALTER TABLE "event" ALTER COLUMN "max_team_size" SET DEFAULT 6;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "pitch_presentation_opened_at" timestamp;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "pitch_selection_count" integer;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "pitch_selection_seed" text;--> statement-breakpoint
ALTER TABLE "event" ADD COLUMN "pitch_selection_finalized_at" timestamp;--> statement-breakpoint
UPDATE "event"
SET "max_team_size" = 6
WHERE "workflow" = 'innolab'
	AND "max_team_size" = 4;--> statement-breakpoint
UPDATE "event" AS "edition"
SET "pitch_presentation_opened_at" = COALESCE(
	"edition"."pitch_voting_open",
	"edition"."created_at"
)
WHERE "edition"."workflow" = 'innolab'
	AND (
		("edition"."pitch_voting_open" IS NOT NULL AND "edition"."pitch_voting_open" <= now())
		OR EXISTS (
			SELECT 1
			FROM "pitch"
			WHERE "pitch"."event_id" = "edition"."id"
				AND "pitch"."status" IN ('selected', 'rejected')
		)
	);--> statement-breakpoint
UPDATE "event" AS "edition"
SET
	"pitch_selection_count" = (
		SELECT count(*)::integer
		FROM "pitch"
		WHERE "pitch"."event_id" = "edition"."id"
			AND "pitch"."status" = 'selected'
	),
	"pitch_selection_seed" = 'legacy-migration-v1',
	"pitch_selection_finalized_at" = COALESCE(
		"edition"."pitch_voting_close",
		"edition"."updated_at"
	)
WHERE "edition"."workflow" = 'innolab'
	AND EXISTS (
		SELECT 1
		FROM "pitch"
		WHERE "pitch"."event_id" = "edition"."id"
			AND "pitch"."status" IN ('selected', 'rejected')
	);
