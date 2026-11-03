import { connection } from "next/server";
import { getNews } from "@/lib/footer/news.mjs";

// CNBC finance headlines for the footer widget.
export async function GET() {
  await connection();
  const items = await getNews();
  return Response.json(
    { items },
    {
      headers: {
        "Cache-Control": items.length
          ? "public, max-age=300, s-maxage=600, stale-while-revalidate=86400"
          : "no-store",
        "X-Robots-Tag": "noindex, nofollow",
      },
    },
  );
}
