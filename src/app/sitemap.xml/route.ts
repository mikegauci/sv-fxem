import { sitemap } from "@/lib/seo/site.mjs";
import { siteRoutes } from "@/lib/site/content";

export async function GET() {
  return new Response(sitemap(await siteRoutes()), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
