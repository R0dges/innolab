ALTER TABLE "announcement" ADD COLUMN "priority" text DEFAULT 'normal' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "audience" text DEFAULT 'all' NOT NULL;--> statement-breakpoint
ALTER TABLE "announcement" ADD COLUMN "updated_at" timestamp;--> statement-breakpoint
UPDATE "announcement" SET "updated_at" = "created_at" WHERE "updated_at" IS NULL;--> statement-breakpoint
ALTER TABLE "announcement" ALTER COLUMN "updated_at" SET NOT NULL;
