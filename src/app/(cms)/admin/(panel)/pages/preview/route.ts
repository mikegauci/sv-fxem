import { hasAdminCapability } from "@/lib/admin/capabilities";
import { prepareSections } from "@/lib/admin/page-sections";
import { getCurrentUser } from "@/lib/auth/session";
import type { PageContent, PageLayout } from "@/lib/site/content";
import { renderPreview } from "@/lib/site/render";
import { createClient } from "@/lib/supabase/server";
import type { PageInput } from "../actions";

const TEMPLATE_PAGE = { en: "about-us", ar: "ar/about-us" } as const;

const headers = {
  "Content-Type": "text/html; charset=utf-8",
  "Cache-Control": "no-store",
  "X-Robots-Tag": "noindex, nofollow",
};

function problem(message: string, status = 400) {
  const text = message.replace(
    /[&<>"]/g,
    (c) => `&#${c.charCodeAt(0)};`,
  );
  return new Response(
    `<!doctype html><meta charset="utf-8"><title>Preview</title><p style="font:16px system-ui;padding:2rem">${text}</p>`,
    { status, headers },
  );
}

// The editor's unsaved changes rendered as visitors would see them. Nothing is
// written to the database.
export async function POST(request: Request) {
  // Only the editor itself may post a draft: a cross-site form could
  // otherwise render its own scripts on this origin with the admin's session.
  if (request.headers.get("sec-fetch-site") !== "same-origin")
    return problem("Open the preview from the page editor.", 403);
  const user = await getCurrentUser();
  if (!user || !hasAdminCapability(user, "pages"))
    return problem("Not authorised", 403);
  const fullAdmin = hasAdminCapability(user);

  let input: PageInput;
  try {
    input = JSON.parse(String((await request.formData()).get("draft")));
  } catch {
    return problem("The preview could not be read. Try again.");
  }
  if (!["en", "ar"].includes(input?.language) || !Array.isArray(input.sections))
    return problem("The preview could not be read. Try again.");

  const db = await createClient();
  const saved = input.id
    ? await db
        .from("pages")
        .select(
          "id, path, kind, language, translation_id, wp_id, layout, custom_code, page_sections(id, html)",
        )
        .eq("id", input.id)
        .maybeSingle()
    : null;
  if (saved && (saved.error || !saved.data))
    return problem("Page not found", 404);
  const row = saved?.data ?? null;
  if (row && row.language !== input.language)
    return problem("A page's language cannot change.");

  let layout = row?.layout;
  if (!row) {
    const template = await db
      .from("pages")
      .select("layout")
      .eq("path", TEMPLATE_PAGE[input.language])
      .single();
    if (template.error) return problem(template.error.message, 500);
    layout = template.data.layout;
  }

  const prepared = prepareSections(
    input.sections,
    row?.page_sections ?? null,
    fullAdmin,
  );
  if ("error" in prepared) return problem(prepared.error);

  const page: PageContent = {
    id: row?.id ?? "preview",
    slug: row?.path ?? input.path ?? "",
    kind: row?.kind ?? "page",
    language: input.language,
    translation_id: row?.translation_id ?? input.translationId ?? "preview",
    wp_id: row?.wp_id ?? null,
    title: String(input.title ?? ""),
    seo: {
      title: input.seo?.title?.trim() || undefined,
      description: input.seo?.description?.trim() || undefined,
      noindex: true,
    },
    layout: layout as unknown as PageLayout,
    // Only full admins can change page code, so others preview the saved code.
    custom_code: fullAdmin
      ? (input.customCode ?? row?.custom_code ?? {})
      : (row?.custom_code ?? {}),
    sections: prepared.sections.map((s, position) => ({
      position,
      kind: s.kind,
      html: s.html,
    })),
  };
  return new Response(await renderPreview(page), { headers });
}
