import "server-only";
import { cacheLife, cacheTag } from "next/cache";
import { publicDb } from "@/lib/supabase/public";
import type { Json, Tables } from "@/lib/supabase/database.types";

// Published CMS content, read as an anonymous visitor and cached until an
// admin save invalidates it (see revalidateContent in ./revalidate).

export type Language = "en" | "ar";
export type Route = {
  id: string;
  slug: string;
  kind: Tables<"pages">["kind"];
  language: Language;
  translation_id: string;
  wp_id: number | null;
  title: string;
  seo: { title?: string; description?: string; noindex?: boolean };
};

// Every published page (no content), English first so language links keep
// their original order.
export async function siteRoutes(): Promise<Route[]> {
  "use cache";
  cacheLife("max");
  cacheTag("cms", "cms:routes");
  const { data, error } = await publicDb
    .from("pages")
    .select("id, path, kind, language, translation_id, wp_id, title, seo")
    .eq("status", "published")
    .order("language", { ascending: true })
    .order("created_at", { ascending: true })
    .order("path", { ascending: true });
  if (error) throw error;
  return data
    .map(({ path, seo, ...row }) => ({
      ...row,
      slug: path,
      seo: (seo ?? {}) as Route["seo"],
    }))
    .sort((a, b) =>
      a.language === b.language ? 0 : a.language === "en" ? -1 : 1,
    );
}

export type PageLayout = {
  head: string;
  htmlAttributes: [string, string][];
  bodyAttributes: [string, string][];
  scripts: string;
  skipLink: string;
  standalone: boolean;
  contentShell: string;
  wpmlTouch?: boolean;
  currentdesk?: string;
  contact?: boolean;
};

export type PageContent = Route & {
  layout: PageLayout;
  sections: { position: number; html: string }[];
};

export async function pageContent(slug: string): Promise<PageContent | null> {
  "use cache";
  cacheLife("max");
  cacheTag("cms", `cms:page:${slug}`);
  const { data, error } = await publicDb
    .from("pages")
    .select(
      "id, path, kind, language, translation_id, wp_id, title, seo, layout, page_sections(position, html)",
    )
    .eq("path", slug)
    .eq("status", "published")
    .maybeSingle();
  if (error) throw error;
  if (!data) return null;
  const { path, seo, layout, page_sections, ...row } = data;
  return {
    ...row,
    slug: path,
    seo: (seo ?? {}) as Route["seo"],
    layout: layout as unknown as PageLayout,
    sections: page_sections,
  };
}

type MenuItem = Tables<"menu_items"> & {
  options: Json & Record<string, unknown>;
};

// Header and footer for one language: theme templates, menus and widgets.
export async function siteChrome(language: Language) {
  "use cache";
  cacheLife("max");
  cacheTag("cms", `cms:chrome:${language}`);
  const [settings, menus, widgets] = await Promise.all([
    publicDb
      .from("settings")
      .select("value")
      .eq("key", `chrome:${language}`)
      .single(),
    publicDb
      .from("menus")
      .select("id, location, menu_items(*)")
      .eq("language", language),
    publicDb.from("footer_widgets").select("*").eq("language", language),
  ]);
  for (const result of [settings, menus, widgets])
    if (result.error) throw result.error;
  const templates = settings.data!.value as { header: string; footer: string };
  const primary = menus.data!.find((m) => m.location === "primary");
  return {
    header: templates.header,
    footer: templates.footer,
    primary: (primary?.menu_items ?? []) as MenuItem[],
    widgets: widgets.data!,
    // Plain object (cache entries must be serializable); see chromeMenus().
    menus: Object.fromEntries(
      menus.data!.map((m) => [m.id, m.menu_items as MenuItem[]]),
    ),
  };
}

export function chromeMenus(chrome: Awaited<ReturnType<typeof siteChrome>>) {
  return new Map(Object.entries(chrome.menus));
}

// Search: the visible text of every published page.
export async function searchablePages() {
  "use cache";
  cacheLife("max");
  cacheTag("cms", "cms:search");
  const rows: {
    path: string;
    kind: Route["kind"];
    language: Language;
    title: string;
    seo: Json;
    layout: Json;
    page_sections: { position: number; html: string }[];
  }[] = [];
  for (let from = 0; ; from += 100) {
    const { data, error } = await publicDb
      .from("pages")
      .select(
        "path, kind, language, title, seo, layout, page_sections(position, html)",
      )
      .eq("status", "published")
      .order("path")
      .range(from, from + 99);
    if (error) throw error;
    rows.push(...(data as typeof rows));
    if (data.length < 100) break;
  }
  return rows;
}
