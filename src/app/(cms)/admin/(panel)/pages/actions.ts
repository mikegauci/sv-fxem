"use server";
import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/auth/admin";
import { cleanPagePath } from "@/lib/admin/page-paths.mjs";
import { revalidateContent } from "@/lib/site/revalidate";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type SectionInput = {
  id: string | null;
  kind: "html" | "rich_text";
  label: string;
  html: string;
};

export type PageInput = {
  id: string | null;
  language: "en" | "ar";
  translationId: string | null;
  path: string;
  title: string;
  status: "draft" | "published";
  seo: { title?: string; description?: string; noindex?: boolean };
  sections: SectionInput[];
};

type Result = { error: string } | { id: string };

// New pages and translations use the layout (theme styles, body classes,
// content wrapper) of the language's About Us page: a plain content page.
const TEMPLATE_PAGE = { en: "about-us", ar: "ar/about-us" } as const;

function refresh(...paths: string[]) {
  for (const path of new Set(paths)) revalidateContent({ page: path });
  revalidateContent({ routes: true });
  revalidatePath("/admin/pages/");
}

export async function savePage(input: PageInput): Promise<Result> {
  await assertAdmin("pages");
  const title = input.title.trim();
  if (!title) return { error: "Add a page title." };
  if (title.length > 200) return { error: "The title is too long." };
  if (!["draft", "published"].includes(input.status))
    return { error: "Unknown status." };
  if (!["en", "ar"].includes(input.language))
    return { error: "Unknown language." };
  const cleaned = cleanPagePath(input.path, input.language);
  if ("error" in cleaned) return { error: cleaned.error! };
  const path = cleaned.path!;
  if (input.sections.some((s) => !["html", "rich_text"].includes(s.kind)))
    return { error: "Unknown section type." };
  if (input.sections.some((s) => s.html.length > 500_000))
    return { error: "A section is too large." };

  const db = await createClient();
  const previous = input.id
    ? await db
        .from("pages")
        .select("path, language")
        .eq("id", input.id)
        .single()
    : null;
  if (previous?.error) return { error: previous.error.message };
  if (previous && previous.data.language !== input.language)
    return { error: "A page's language cannot change." };
  if (
    (previous?.data.path === "" || previous?.data.path === "ar") &&
    path !== previous.data.path
  )
    return { error: "The homepage URL cannot change." };

  let layout: Json | undefined;
  if (!input.id) {
    const template = await db
      .from("pages")
      .select("layout")
      .eq("path", TEMPLATE_PAGE[input.language])
      .single();
    if (template.error) return { error: template.error.message };
    layout = template.data.layout;
  }
  const seo = {
    title: input.seo.title?.trim() || undefined,
    description: input.seo.description?.trim() || undefined,
    noindex: Boolean(input.seo.noindex) || undefined,
  };
  const { data, error } = await db.rpc("admin_save_page", {
    target_page: input.id,
    fields: {
      path,
      title,
      status: input.status,
      seo,
      language: input.language,
      translation_id: input.translationId,
      kind: "page",
      ...(layout ? { layout } : {}),
    } as Json,
    new_sections: input.sections.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: s.label.trim().slice(0, 120),
      html: s.html,
    })) as Json,
  });
  if (error)
    return {
      error:
        error.code === "23505"
          ? error.message.includes("one_per_language")
            ? "This page already has a version in that language."
            : "Another page already uses this URL."
          : error.message,
    };
  refresh(path, previous?.data.path ?? path);
  return { id: data };
}

// Starts the other language's version as a draft copy of this page.
export async function createTranslation(id: string): Promise<Result> {
  await assertAdmin("pages");
  const db = await createClient();
  const source = await db
    .from("pages")
    .select(
      "language, translation_id, path, title, seo, kind, page_sections(kind, label, html, position)",
    )
    .eq("id", id)
    .single();
  if (source.error) return { error: source.error.message };
  const page = source.data;
  if (page.kind !== "page")
    return { error: "Only pages can be translated here." };
  const language = page.language === "en" ? "ar" : "en";
  const path =
    language === "ar"
      ? page.path
        ? `ar/${page.path}`
        : "ar"
      : page.path.replace(/^ar\/?/, "");
  const existing = await db
    .from("pages")
    .select("id")
    .eq("translation_id", page.translation_id)
    .eq("language", language)
    .maybeSingle();
  if (existing.data) return { id: existing.data.id };
  return savePage({
    id: null,
    language,
    translationId: page.translation_id,
    path,
    title: page.title,
    status: "draft",
    seo: (page.seo ?? {}) as PageInput["seo"],
    sections: [...page.page_sections]
      .sort((a, b) => a.position - b.position)
      .map((s) => ({ id: null, kind: s.kind, label: s.label, html: s.html })),
  });
}

export async function deletePage(
  id: string,
): Promise<{ error: string } | void> {
  await assertAdmin("pages");
  const db = await createClient();
  const page = await db.from("pages").select("path").eq("id", id).single();
  if (page.error) return { error: page.error.message };
  if (page.data.path === "" || page.data.path === "ar")
    return { error: "The homepages cannot be deleted." };
  const { error } = await db.from("pages").delete().eq("id", id);
  if (error) return { error: error.message };
  refresh(page.data.path);
}
