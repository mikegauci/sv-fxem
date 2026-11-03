import type { NextRequest } from "next/server";
import { htmlResponse, renderSearch } from "@/lib/site/render";

// Site search (ar): ?s= query, ?paged= page.
export function GET(request: NextRequest) {
  const params = request.nextUrl.searchParams;
  return htmlResponse(
    {
      status: 200,
      html: renderSearch("ar", params.get("s"), params.get("paged")),
    },
    { "Cache-Control": "no-store", "X-Robots-Tag": "noindex, nofollow" },
  );
}
