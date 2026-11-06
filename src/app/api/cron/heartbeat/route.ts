import { timingSafeEqual } from "node:crypto";
import { publicDb } from "@/lib/supabase/public";

const headers = {
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

export async function GET(request: Request) {
  const secret = process.env.CRON_SECRET;
  const given = Buffer.from(request.headers.get("authorization") ?? "");
  const expected = Buffer.from(`Bearer ${secret}`);
  if (
    !secret ||
    given.length !== expected.length ||
    !timingSafeEqual(given, expected)
  ) {
    return Response.json({ error: "Unauthorized" }, { status: 401, headers });
  }

  try {
    const { data, error } = await publicDb
      .from("pages")
      .select("id")
      .limit(1)
      .abortSignal(AbortSignal.timeout(10_000));
    if (error || !data?.length) {
      return Response.json(
        { ok: false, error: "Database heartbeat failed." },
        { status: 503, headers },
      );
    }
    return Response.json(
      { ok: true, timestamp: new Date().toISOString() },
      { headers },
    );
  } catch {
    return Response.json(
      { ok: false, error: "Database heartbeat failed." },
      { status: 503, headers },
    );
  }
}
