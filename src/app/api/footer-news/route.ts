import { connection } from "next/server";
import { feedSettings, getNews } from "@/lib/footer/news.mjs";
import { siteChrome } from "@/lib/site/content";

// Headlines for the footer news block, from the feed set for that language.
export async function GET(request: Request) {
  await connection();
  const language =
    new URL(request.url).searchParams.get("lang") === "ar" ? "ar" : "en";
  const chrome = await siteChrome(language);
  const block = chrome.widgets.find((w) => w.kind === "news");
  const options = (block?.options ?? {}) as { feed?: Record<string, unknown> };
  const { feed } = feedSettings(options.feed);
  const items = feed ? await getNews(feed) : [];
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
