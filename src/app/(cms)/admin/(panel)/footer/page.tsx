import { AdminPageHeader } from "@/components/admin/page-header";
import { FooterEditor } from "@/components/admin/footer-editor";
import { LanguageTabs, type Language } from "@/components/admin/language-tabs";
import { createClient } from "@/lib/supabase/server";
import type { FooterWidgetInput } from "../menus/actions";

export const metadata = { title: "Footer" };

// Reads the session on every request, so skip instant-navigation validation.
export const instant = false;

export default async function Footer({
  searchParams,
}: PageProps<"/admin/footer">) {
  const { lang } = await searchParams;
  const language: Language = lang === "ar" ? "ar" : "en";
  const db = await createClient();
  const [widgets, menus] = await Promise.all([
    db.from("footer_widgets").select("*").eq("language", language),
    db
      .from("menus")
      .select("id, name, location")
      .eq("language", language)
      .neq("location", "primary")
      .order("name"),
  ]);
  if (widgets.error) throw widgets.error;
  if (menus.error) throw menus.error;
  return (
    <>
      <AdminPageHeader
        title="Footer"
        description="Footer blocks per language: columns, menus, disclaimers and copyright."
      />
      <div className="mb-5">
        <LanguageTabs
          active={language}
          hrefs={{ en: "/admin/footer/?lang=en", ar: "/admin/footer/?lang=ar" }}
        />
      </div>
      <FooterEditor
        key={language}
        language={language}
        initial={widgets.data as unknown as FooterWidgetInput[]}
        menus={menus.data}
      />
    </>
  );
}
