import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/page-header";
import { PageEditor } from "@/components/admin/page-editor";
import { createClient } from "@/lib/supabase/server";
import type { PageInput } from "../actions";

export const metadata = { title: "Edit page" };

// Reads the session on every request, so skip instant-navigation validation.
export const instant = false;

export default async function EditPage({
  params,
}: PageProps<"/admin/pages/[id]">) {
  const { id } = await params;
  const db = await createClient();
  const { data: page, error } = await db
    .from("pages")
    .select(
      "id, path, title, status, language, translation_id, seo, kind, page_sections(id, position, kind, label, html)",
    )
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!page) notFound();
  const { data: twin } = await db
    .from("pages")
    .select("id, title")
    .eq("translation_id", page.translation_id)
    .neq("id", page.id)
    .maybeSingle();
  const initial: PageInput = {
    id: page.id,
    language: page.language,
    translationId: page.translation_id,
    path: page.path,
    title: page.title,
    status: page.status,
    seo: (page.seo ?? {}) as PageInput["seo"],
    sections: [...page.page_sections]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: s.id, kind: s.kind, label: s.label, html: s.html })),
  };
  return (
    <>
      <AdminPageHeader
        title={page.language === "ar" ? "Edit Arabic page" : "Edit page"}
        description={`/${page.path}${page.path ? "/" : ""}`}
      />
      <PageEditor
        key={page.id}
        initial={initial}
        translation={twin ?? null}
        publicPath={
          page.status === "published"
            ? `/${page.path}${page.path ? "/" : ""}`
            : null
        }
      />
    </>
  );
}
