import { sitemap } from "@/lib/seo/site.mjs";
import { routes } from "@/lib/site/snapshots.mjs";

export function GET() {
  return new Response(sitemap(routes()), {
    headers: { "Content-Type": "application/xml; charset=utf-8" },
  });
}
