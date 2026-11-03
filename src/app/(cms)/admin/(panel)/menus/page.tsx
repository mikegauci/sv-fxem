import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/page-header";
import { LanguageTabs, type Language } from "@/components/admin/language-tabs";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Menus" };

// Reads the session on every request, so skip instant-navigation validation.
export const instant = false;

export default async function Menus({
  searchParams,
}: PageProps<"/admin/menus">) {
  const { lang } = await searchParams;
  const language: Language = lang === "ar" ? "ar" : "en";
  const db = await createClient();
  const { data, error } = await db
    .from("menus")
    .select("id, name, location, language, updated_at, menu_items(count)")
    .eq("language", language)
    .order("location");
  if (error) throw error;
  const sorted = [...data].sort((a, b) =>
    a.location === "primary"
      ? -1
      : b.location === "primary"
        ? 1
        : a.location.localeCompare(b.location),
  );
  return (
    <>
      <AdminPageHeader
        title="Menus"
        description="The header menu (desktop and mobile) and the footer menus, per language."
      />
      <div className="mb-5">
        <LanguageTabs
          active={language}
          hrefs={{ en: "/admin/menus/?lang=en", ar: "/admin/menus/?lang=ar" }}
        />
      </div>
      <ul className="divide-y rounded-lg bg-white">
        {sorted.map((m) => (
          <li
            key={m.id}
            className="flex items-center justify-between gap-4 p-4"
          >
            <div>
              <Link
                href={`/admin/menus/${m.id}/`}
                className="font-semibold hover:underline"
                dir="auto"
              >
                {m.location === "primary" ? "Header menu" : m.name}
              </Link>
              <p className="text-muted text-xs">
                {m.location === "primary"
                  ? "Desktop mega menu and mobile menu"
                  : "Footer column"}{" "}
                ·{" "}
                {(m.menu_items as unknown as { count: number }[])[0]?.count ??
                  0}{" "}
                entries
              </p>
            </div>
            <Link href={`/admin/menus/${m.id}/`} className="cms-button">
              Edit
            </Link>
          </li>
        ))}
      </ul>
      <p className="text-muted mt-4 text-sm">
        Footer menus are placed in the footer from{" "}
        <Link
          href={`/admin/footer/?lang=${language}`}
          className="text-brand underline"
        >
          Footer
        </Link>
        .
      </p>
    </>
  );
}
