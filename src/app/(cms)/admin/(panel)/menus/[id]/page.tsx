import { notFound } from "next/navigation";
import { AdminPageHeader } from "@/components/admin/page-header";
import { LanguageTabs } from "@/components/admin/language-tabs";
import { MenuEditor } from "@/components/admin/menu-editor";
import { createClient } from "@/lib/supabase/server";
import type { MenuItemInput } from "../actions";

export const metadata = { title: "Edit menu" };

// Reads the session on every request, so skip instant-navigation validation.
export const instant = false;

export default async function EditMenu({
  params,
}: PageProps<"/admin/menus/[id]">) {
  const { id } = await params;
  const db = await createClient();
  const { data: menu, error } = await db
    .from("menus")
    .select("id, name, location, language, menu_items(*)")
    .eq("id", id)
    .maybeSingle();
  if (error) throw error;
  if (!menu) notFound();
  const [twin, pages] = await Promise.all([
    db
      .from("menus")
      .select("id")
      .eq("language", menu.language === "en" ? "ar" : "en")
      .eq(
        "location",
        menu.location.replace(/-ar$/, "") +
          (menu.language === "en" ? "-ar" : ""),
      )
      .maybeSingle(),
    db
      .from("pages")
      .select("id, path, title")
      .eq("language", menu.language)
      .eq("status", "published")
      .order("path"),
  ]);
  // Footer menus are named per language (…-ar); the header menu is "primary" in both.
  const other =
    twin.data ??
    (
      await db
        .from("menus")
        .select("id")
        .eq("language", menu.language === "en" ? "ar" : "en")
        .eq("location", menu.location)
        .maybeSingle()
    ).data;
  const primary = menu.location === "primary";
  return (
    <>
      <AdminPageHeader
        title={primary ? "Header menu" : menu.name}
        description={
          primary ? "Desktop mega menu and mobile menu" : "Footer menu"
        }
      />
      <div className="mb-5">
        <LanguageTabs
          active={menu.language}
          hrefs={{
            [menu.language]: `/admin/menus/${menu.id}/`,
            ...(other
              ? {
                  [menu.language === "en" ? "ar" : "en"]:
                    `/admin/menus/${other.id}/`,
                }
              : {}),
          }}
        />
      </div>
      <MenuEditor
        key={menu.id}
        menuId={menu.id}
        primary={primary}
        language={menu.language}
        initial={menu.menu_items as unknown as MenuItemInput[]}
        pages={pages.data ?? []}
      />
    </>
  );
}
