import { robots } from "@/lib/seo/site.mjs";

export function GET() {
  return new Response(robots(process.env), {
    headers: { "Content-Type": "text/plain; charset=utf-8" },
  });
}
