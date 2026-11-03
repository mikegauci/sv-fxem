import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/page-header";
import { LanguageTabs, type Language } from "@/components/admin/language-tabs";
import { createClient } from "@/lib/supabase/server";

export const metadata = { title: "Pages" };

// Reads the session on every request, so skip instant-navigation validation.
export const instant = false;

const KINDS = {
  page: "Pages",
  post: "Blog posts",
  standalone: "Forms",
  archive: "Archives",
} as const;

export default async function Pages({
  searchParams,
}: PageProps<"/admin/pages">) {
  const params = await searchParams;
  const language: Language = params.lang === "ar" ? "ar" : "en";
  const search = typeof params.q === "string" ? params.q.trim() : "";
  const db = await createClient();
  const { data, error } = await db
    .from("pages")
    .select(
      "id, path, title, status, kind, language, translation_id, updated_at",
    )
    .order("path");
  if (error) throw error;
  const other = language === "en" ? "ar" : "en";
  const counterpart = new Map(
    data.filter((p) => p.language === other).map((p) => [p.translation_id, p]),
  );
  const rows = data.filter(
    (p) =>
      p.language === language &&
      (!search ||
        p.title.toLowerCase().includes(search.toLowerCase()) ||
        p.path.includes(search.toLowerCase())),
  );
  const untranslated = rows.filter((p) => !counterpart.has(p.translation_id));

  return (
    <>
      <AdminPageHeader
        title="Pages"
        description="Edit page sections, SEO and translations."
        actions={
          <Link
            href={`/admin/pages/new/?lang=${language}`}
            className="cms-button"
          >
            New page
          </Link>
        }
      />
      <div className="mb-5 flex flex-wrap items-center justify-between gap-3">
        <LanguageTabs
          active={language}
          hrefs={{ en: "/admin/pages/?lang=en", ar: "/admin/pages/?lang=ar" }}
        />
        <form className="flex gap-2">
          <input type="hidden" name="lang" value={language} />
          <input
            aria-label="Search pages"
            name="q"
            placeholder="Search title or URL"
            defaultValue={search}
            className="rounded border border-black/20 bg-white p-2 text-sm"
          />
          <button className="cms-button">Search</button>
        </form>
      </div>
      {untranslated.length > 0 && (
        <p className="mb-4 rounded-lg bg-amber-50 p-3 text-sm text-amber-900">
          {untranslated.length}{" "}
          {untranslated.length === 1 ? "page has" : "pages have"} no{" "}
          {other === "ar" ? "Arabic" : "English"} version.
        </p>
      )}
      {(Object.keys(KINDS) as (keyof typeof KINDS)[]).map((kind) => {
        const list = rows.filter((p) => p.kind === kind);
        if (!list.length) return null;
        return (
          <section
            key={kind}
            className="mb-6 overflow-x-auto rounded-lg bg-white p-5"
          >
            <h2 className="mb-2 font-bold">{KINDS[kind]}</h2>
            <table className="w-full text-left text-sm">
              <thead>
                <tr className="text-muted text-xs uppercase">
                  <th className="p-2">Page</th>
                  <th className="p-2">Status</th>
                  <th className="p-2">
                    {other === "ar" ? "Arabic" : "English"} version
                  </th>
                </tr>
              </thead>
              <tbody>
                {list.map((p) => {
                  const twin = counterpart.get(p.translation_id);
                  return (
                    <tr key={p.id} className="border-t border-black/10">
                      <td
                        className="p-2"
                        dir={language === "ar" ? "rtl" : undefined}
                      >
                        <Link
                          href={`/admin/pages/${p.id}/`}
                          className="font-semibold hover:underline"
                        >
                          {p.title}
                        </Link>
                        <p className="text-muted text-xs" dir="ltr">
                          /{p.path}
                          {p.path ? "/" : ""}
                        </p>
                      </td>
                      <td className="p-2">
                        <span
                          className={`rounded px-2 py-0.5 text-xs ${
                            p.status === "published"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-black/5"
                          }`}
                        >
                          {p.status === "published" ? "Published" : "Draft"}
                        </span>
                      </td>
                      <td className="p-2">
                        {twin ? (
                          <Link
                            href={`/admin/pages/${twin.id}/`}
                            className="text-brand hover:underline"
                          >
                            {twin.title}
                          </Link>
                        ) : (
                          <span className="text-amber-800">Missing</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </section>
        );
      })}
      {!rows.length && <p className="text-muted">No pages found.</p>}
    </>
  );
}
