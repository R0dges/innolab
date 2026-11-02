import { cookies } from "next/headers";

import { z } from "zod";

import { LOCALE_COOKIE } from "@/lib/i18n";
import { handle, readBody } from "@/lib/server/http";

export const POST = handle(async (req) => {
  const { locale } = await readBody(req, z.object({ locale: z.enum(["fr", "en"]) }));
  const cookieStore = await cookies();
  cookieStore.set(LOCALE_COOKIE, locale, {
    path: "/",
    maxAge: 60 * 60 * 24 * 365,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
  });
  return { locale };
});

