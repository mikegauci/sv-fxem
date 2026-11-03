"use server";
import { revalidatePath } from "next/cache";
import { hasAdminCapability } from "@/lib/admin/capabilities";
import {
  buildIframeEmbed,
  normalizeRichEmbeds,
  withoutEmbeds,
  scriptChanged,
  scriptGuardMessage,
} from "@/lib/admin/embeds.mjs";
import { assertAdmin } from "@/lib/auth/admin";
import { cleanPagePath } from "@/lib/admin/page-paths.mjs";
import { revalidateContent } from "@/lib/site/revalidate";
import { createClient } from "@/lib/supabase/server";
import type { Json } from "@/lib/supabase/database.types";

export type SectionInput = {
  id: string | null;
  editorKey?: string;
  kind: "html" | "rich_text" | "embed";
  options?: Json;
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
  customCode?: { head?: string; bodyEnd?: string };
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
  const user = await assertAdmin("pages");
  const fullAdmin = hasAdminCapability(user);
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
  if (
    input.sections.some((s) => !["html", "rich_text", "embed"].includes(s.kind))
  )
    return { error: "Unknown section type." };
  if (input.sections.some((s) => s.html.length > 500_000))
    return { error: "A section is too large." };

  const db = await createClient();
  const previous = input.id
    ? await db
        .from("pages")
        .select("path, language, custom_code, page_sections(id, html)")
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

  const sections = [];
  const ids = new Set<string>();
  for (const section of input.sections) {
    if (
      section.id &&
      (ids.has(section.id) ||
        !previous?.data.page_sections.some((s) => s.id === section.id))
    )
      return { error: "Invalid section id. Reload and try again." };
    if (section.id) ids.add(section.id);
    let html = section.html;
    try {
      if (section.kind === "rich_text") html = normalizeRichEmbeds(html);
    } catch (e) {
      return { error: (e as Error).message };
    }
    const options = section.options as Record<string, unknown> | null;
    if (section.kind === "embed") {
      if (options?.mode === "iframe") {
        try {
          html = buildIframeEmbed(options);
        } catch (e) {
          return { error: (e as Error).message };
        }
      } else if (options?.mode !== "code")
        return { error: "Choose an embed mode." };
      if (new TextEncoder().encode(html).length > 100_000)
        return { error: "Embed HTML is limited to 100 KB." };
      if (
        !fullAdmin &&
        options?.mode === "code" &&
        (!section.id ||
          !previous?.data.page_sections.some(
            (s) => s.id === section.id && s.html === html,
          ))
      )
        return { error: scriptGuardMessage(section.label) };
    }
    const old = previous?.data.page_sections.find((s) => s.id === section.id);
    if (!fullAdmin && scriptChanged(old?.html ?? "", html))
      return { error: scriptGuardMessage(section.label) };
    sections.push({ ...section, html });
  }
  if (
    input.customCode &&
    ((typeof input.customCode.head !== "string" &&
      input.customCode.head !== undefined) ||
      (typeof input.customCode.bodyEnd !== "string" &&
        input.customCode.bodyEnd !== undefined))
  )
    return { error: "Invalid page code." };
  if (JSON.stringify(input.customCode ?? {}).length > 200_000)
    return { error: "Page code is too large." };
  if (
    !fullAdmin &&
    input.customCode &&
    JSON.stringify(input.customCode) !==
      JSON.stringify(previous?.data.custom_code ?? {})
  )
    return { error: "Only full admins can change page code." };

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
      ...(fullAdmin && input.customCode
        ? { custom_code: input.customCode }
        : {}),
    } as Json,
    new_sections: sections.map((s) => ({
      id: s.id,
      kind: s.kind,
      label: s.label.trim().slice(0, 120),
      html: s.html,
      options: s.options ?? null,
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
      .filter((s) => s.kind !== "embed")
      .map((s) => ({
        id: null,
        kind: s.kind,
        label: s.label,
        html: withoutEmbeds(s.html),
      })),
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
