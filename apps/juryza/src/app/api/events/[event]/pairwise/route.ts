import type { NextRequest } from "next/server";

import { forbidden, handle } from "@/lib/server/http";
import { requireUser } from "@/lib/server/identity";

type P = { event: string };

async function disabled(req: NextRequest) {
  await requireUser(req);
  throw forbidden("Pairwise judging is disabled");
}

export const GET = handle<P>(disabled);
export const POST = handle<P>(disabled);
export const DELETE = handle<P>(disabled);
