import Link from "next/link";
import { AdminPageHeader } from "@/components/admin/page-header";
import { createClient } from "@/lib/supabase/server";

// Reads the session on every request, so skip instant-navigation validation.
export const instant = false;

export const metadata = { title: "Dashboard" };

const languages = { en: "English", ar: "Arabic" } as const;

export default async function Dashboard() {
  const db = await createClient();
  const { data, error } = await db
    .from("pages")
    .select("language, kind, status");
  if (error) throw error;
  const count = (language: string, kind: string) =>
    data.filter((p) => p.language === language && p.kind === kind).length;

  return (
    <>
      <AdminPageHeader
        title="Dashboard"
        description="Content for sv.fxem.com in English and Arabic."
      />
      <div className="grid gap-4 sm:grid-cols-2">
        {Object.entries(languages).map(([code, name]) => (
          <section key={code} className="rounded-xl bg-white p-6">
            <h2 className="mb-3 text-lg font-bold">{name}</h2>
            <dl className="grid grid-cols-2 gap-y-1 text-sm">
              <dt className="text-muted">Pages</dt>
              <dd>{count(code, "page")}</dd>
              <dt className="text-muted">Blog posts</dt>
              <dd>{count(code, "post")}</dd>
            </dl>
          </section>
        ))}
      </div>
      {data.length === 0 && (
        <p className="text-muted mt-6 text-sm">
          No content has been imported yet. The public site currently serves the
          original page snapshots.
        </p>
      )}
      <p className="mt-8 text-sm">
        <Link href="/admin/media/" className="text-brand underline">
          Media library
        </Link>{" "}
        ·{" "}
        <Link href="/admin/users/" className="text-brand underline">
          Users
        </Link>{" "}
        ·{" "}
        <Link href="/admin/redirects/" className="text-brand underline">
          Redirects
        </Link>
      </p>
    </>
  );
}
