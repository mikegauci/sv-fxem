import { NextResponse, type NextRequest } from "next/server";
import routing from "@/generated/routing.json";
import { findRedirect } from "@/lib/redirects";
import { createRouting } from "@/lib/seo/routing.mjs";
import { updateSession } from "@/lib/supabase/proxy";

const rules = createRouting(routing.pages, routing.ids);

export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  // WordPress short links (?p=, ?page_id=), ?lang=, ?s= on the homepage and
  // /index.php.
  const legacy = rules.redirect(pathname, search);
  const rule = legacy
    ? { destination: legacy, permanent: true }
    : await findRedirect(pathname);
  let response: NextResponse;
  if (rule) {
    const target = new URL(rule.destination, request.url);
    // Keep the query string unless the rule sets its own.
    if (!target.search) target.search = search;
    response = NextResponse.redirect(target, rule.permanent ? 308 : 307);
  } else if (/^\/(admin|auth)(\/|$)/.test(pathname)) {
    response = await updateSession(request);
  } else {
    response = NextResponse.next();
  }
  const robots = rules.robotsHeader(pathname, request.headers.get("host"));
  if (robots) response.headers.set("X-Robots-Tag", robots);
  return response;
}

export const config = {
  matcher: [
    // Skip static assets and images.
    "/((?!_next/static|_next/image|_fxem/|assets/|favicon.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|avif|mp4|ico|css|js|woff2?)$).*)",
  ],
};
