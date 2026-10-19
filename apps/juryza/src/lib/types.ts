/**
 * Client-side view of API payloads. Server types (db rows, computed results)
 * are imported as types only; `Json<T>` reflects what survives JSON — dates
 * arrive as ISO strings.
 */
export type Json<T> = T extends Date
  ? string
  : T extends (infer U)[]
    ? Json<U>[]
    : T extends object
      ? { [K in keyof T]: Json<T[K]> }
      : T;

export type {
  Announcement,
  AuditLog,
  Certificate,
  Event,
  Pitch,
  PitchVote,
  Prize,
  Project,
  RichDoc,
  RubricCriterion,
  Track,
} from "@/lib/db/schema";
