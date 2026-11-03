import { hasAdminCapability } from "@/lib/admin/capabilities";
import { getCurrentUser } from "@/lib/auth/session";
import type { PageContent, PageLayout } from "@/lib/site/content";
import { renderPreview } from "@/lib/site/render";
import { createClient } from "@/lib/supabase/server";

// The saved version of a page as visitors would see it, drafts included.
export async function GET(
  _request: Request,
  { params }: RouteContext<"/admin/pages/[id]/preview">,
) {
  const user = await getCurrentUser();
  if (!user || !hasAdminCapability(user, "pages"))
    return new Response("Not authorised", { status: 403 });
  const { id } = await params;
  const db = await createClient();
  const { data, error } = await db
    .from("pages")
    .select(
      "id, path, kind, language, translation_id, wp_id, title, seo, layout, page_sections(position, kind, html)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error || !data) return new Response("Page not found", { status: 404 });
  const { path, seo, layout, page_sections, ...row } = data;
  const page: PageContent = {
    ...row,
    slug: path,
    seo: (seo ?? {}) as PageContent["seo"],
    layout: layout as unknown as PageLayout,
    sections: page_sections,
  };
  return new Response(await renderPreview(page), {
    headers: {
      "Content-Type": "text/html; charset=utf-8",
      "Cache-Control": "no-store",
      "X-Robots-Tag": "noindex, nofollow",
    },
  });
}
