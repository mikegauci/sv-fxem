"use server";
import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/auth/admin";
import { checkItem, syncMobile } from "@/lib/admin/menu-items.mjs";
import { revalidateContent } from "@/lib/site/revalidate";
import { createClient } from "@/lib/supabase/server";
import type { Json, Tables } from "@/lib/supabase/database.types";

export type MenuItemInput = Pick<
  Tables<"menu_items">,
  | "id"
  | "parent_id"
  | "position"
  | "label"
  | "url"
  | "page_id"
  | "open_in_new_tab"
  | "css_classes"
  | "wp_id"
> & { options: { kind: string } & Record<string, unknown> };

export type FooterWidgetInput = Pick<
  Tables<"footer_widgets">,
  "id" | "column_index" | "position" | "kind" | "title" | "html" | "menu_id"
> & { options: { area?: string } & Record<string, unknown> };

const KINDS = ["item", "row", "column", "widget"];

export async function saveMenu(
  menuId: string,
  input: MenuItemInput[],
): Promise<{ error: string } | void> {
  await assertAdmin("menus");
  const db = await createClient();
  const menu = await db
    .from("menus")
    .select("language, location")
    .eq("id", menuId)
    .single();
  if (menu.error) return { error: menu.error.message };
  const ids = new Set(input.map((i) => i.id));
  for (const item of input) {
    if (!KINDS.includes(item.options?.kind))
      return { error: "Unknown menu item type." };
    if (item.parent_id && !ids.has(item.parent_id))
      return { error: "A menu item lost its parent. Reload and try again." };
    const problem = checkItem(item);
    if (problem) return { error: problem };
    if (
      item.options.kind === "widget" &&
      String(item.options.html ?? "").length > 50_000
    )
      return { error: "A widget is too large." };
  }
  // Positions follow the order of each item's siblings.
  const siblings = new Map<string | null, MenuItemInput[]>();
  for (const item of input) {
    const key = item.parent_id ?? null;
    siblings.set(key, [...(siblings.get(key) ?? []), item]);
  }
  const ordered = [...siblings.values()].flatMap((list) =>
    list.map((item, position) => ({
      ...item,
      label: item.label.trim(),
      position,
    })),
  );
  const items =
    menu.data.location === "primary" ? syncMobile(ordered) : ordered;
  const { error } = await db.rpc("admin_save_menu", {
    target_menu: menuId,
    new_items: items as unknown as Json,
  });
  if (error) return { error: error.message };
  revalidateContent({ chrome: menu.data.language });
  revalidatePath("/admin/menus/");
}

const WIDGET_KINDS = ["image", "text", "heading", "menu", "news", "html"];

export async function saveFooter(
  language: "en" | "ar",
  input: FooterWidgetInput[],
): Promise<{ error: string } | void> {
  await assertAdmin("menus");
  if (!["en", "ar"].includes(language)) return { error: "Unknown language." };
  const counts = new Map<string, number>();
  const widgets = input.map((w) => {
    const area = w.options?.area ?? "above";
    const key = `${area}:${w.column_index}`;
    const position = counts.get(key) ?? 0;
    counts.set(key, position + 1);
    return { ...w, position, options: { ...w.options, area } };
  });
  for (const w of widgets) {
    if (!WIDGET_KINDS.includes(w.kind))
      return { error: "Unknown footer block type." };
    if (!["above", "primary", "below"].includes(w.options.area))
      return { error: "Unknown footer area." };
    if (w.column_index < 1 || w.column_index > 4)
      return { error: "Unknown footer column." };
    if (w.html.length > 50_000)
      return { error: "A footer block is too large." };
  }
  const db = await createClient();
  const { error } = await db.rpc("admin_save_footer", {
    target_language: language,
    new_widgets: widgets as unknown as Json,
  });
  if (error) return { error: error.message };
  revalidateContent({ chrome: language });
  revalidatePath("/admin/footer/");
}
