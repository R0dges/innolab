import { customAlphabet, nanoid } from "nanoid";

/**
 * Prefixed, URL-safe ids. A value read from a log or a CSV tells you what it
 * is (`evt_…`, `prj_…`). Seeded fixture rows keep their original ids.
 */
const short = customAlphabet("0123456789abcdefghijklmnopqrstuvwxyz", 12);

export const id = {
  event: () => `evt_${short()}`,
  track: () => `trk_${short()}`,
  prize: () => `prz_${short()}`,
  criterion: () => `crit_${short()}`,
  team: () => `tm_${short()}`,
  project: () => `prj_${short()}`,
  pitch: () => `pit_${short()}`,
  pitchVote: () => `pvt_${short()}`,
  assignment: () => `asg_${short()}`,
  score: () => `scr_${short()}`,
  vote: () => `vote_${short()}`,
  voter: () => `vtr_${short()}`,
  pairwise: () => `pw_${short()}`,
  comment: () => `cmt_${short()}`,
  announcement: () => `ann_${short()}`,
  invite: () => `inv_${short()}`,
  audit: () => `log_${short()}`,
  webhook: () => `whk_${short()}`,
  delivery: () => `dlv_${short()}`,
  certificate: () => `crt_${short()}`,
  apiToken: () => `tok_${short()}`,
};

/** Opaque, high-entropy secrets: bearer tokens, invite links, webhook secrets. */
export const secretToken = (size = 32) => nanoid(size);
