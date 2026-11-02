DO $$
BEGIN
	IF EXISTS (
		SELECT 1
		FROM "pitch"
		GROUP BY "event_id", "author_id"
		HAVING count(*) > 1
	) THEN
		RAISE EXCEPTION USING
			ERRCODE = '23505',
			MESSAGE = 'Cannot enforce one pitch per participant: duplicate event/author pitches exist';
	END IF;
END $$;
--> statement-breakpoint
ALTER TABLE "pitch" ADD CONSTRAINT "pitch_event_author_unique" UNIQUE("event_id","author_id");
