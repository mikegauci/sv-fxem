import Link from "next/link";
import type { Metadata } from "next";
import { MediaCard } from "@/components/admin/media-card";
import { MediaUploader } from "@/components/admin/media-uploader";
import { AdminPageHeader } from "@/components/admin/page-header";
import { createClient } from "@/lib/supabase/server";

export const metadata: Metadata = { title: "Media" };

const PAGE_SIZE = 48;

export default async function MediaPage({
  searchParams,
}: PageProps<"/admin/media">) {
  const {
    page: pageParam,
    q,
    type: typeParam,
    sort: sortParam,
    after,
    before,
  } = await searchParams;
  const type = ["image", "video", "application"].includes(String(typeParam))
    ? String(typeParam)
    : "";
  const sort =
    sortParam === "oldest" || sortParam === "name" ? sortParam : "newest";
  const validDate = (v: unknown) =>
    typeof v === "string" &&
    /^\d{4}-\d{2}-\d{2}$/.test(v) &&
    !Number.isNaN(Date.parse(v)) &&
    new Date(v).toISOString().slice(0, 10) === v
      ? v
      : "";
  const from = validDate(after);
  const to = validDate(before);
  const requestedPage = Number(pageParam);
  const page =
    Number.isSafeInteger(requestedPage) && requestedPage > 0
      ? requestedPage
      : 1;
  const search = typeof q === "string" ? q.trim() : "";

  const supabase = await createClient();
  let query = supabase
    .from("media")
    .select("*", { count: "exact" })
    .order(sort === "name" ? "file_name" : "created_at", {
      ascending: sort !== "newest",
    })
    .order("id", { ascending: false })
    .range((page - 1) * PAGE_SIZE, page * PAGE_SIZE - 1);
  if (search) query = query.ilike("file_name", `%${search}%`);
  if (type === "application") query = query.eq("mime_type", "application/pdf");
  else if (type) query = query.like("mime_type", `${type}/%`);
  if (from) query = query.gte("created_at", `${from}T00:00:00Z`);
  if (to)
    query = query.lt(
      "created_at",
      new Date(Date.parse(`${to}T00:00:00Z`) + 86400000).toISOString(),
    );
  const href = (n: number) =>
    `?${new URLSearchParams({ page: String(n), q: search, type, sort, after: from, before: to })}`;
  const { data: items, count, error } = await query;
  const pages = Math.max(1, Math.ceil((count ?? 0) / PAGE_SIZE));

  return (
    <>
      <AdminPageHeader
        title="Media"
        description={`${count ?? 0} files. Images, MP4 videos and PDFs up to 20 MB.`}
        actions={<MediaUploader />}
      />
      <form className="mb-6 flex flex-wrap items-end gap-3">
        <input
          aria-label="Search file names"
          name="q"
          defaultValue={search}
          placeholder="Search by file name"
          className="w-full max-w-sm rounded border border-[#ddd] bg-white px-3 py-2 text-sm"
        />
        <label className="text-sm">
          File type
          <select
            name="type"
            defaultValue={type}
            className="mt-1 block rounded border border-black/20 bg-white p-2"
          >
            <option value="">All files</option>
            <option value="image">Images</option>
            <option value="video">Videos</option>
            <option value="application">PDFs</option>
          </select>
        </label>
        <label className="text-sm">
          Sort
          <select
            name="sort"
            defaultValue={sort}
            className="mt-1 block rounded border border-black/20 bg-white p-2"
          >
            <option value="newest">Newest first</option>
            <option value="oldest">Oldest first</option>
            <option value="name">File name</option>
          </select>
        </label>
        <label className="text-sm">
          Uploaded from (UTC)
          <input
            type="date"
            name="after"
            defaultValue={from}
            className="mt-1 block rounded border border-black/20 bg-white p-2"
          />
        </label>
        <label className="text-sm">
          To (UTC)
          <input
            type="date"
            name="before"
            defaultValue={to}
            className="mt-1 block rounded border border-black/20 bg-white p-2"
          />
        </label>
        <button className="cms-button">Apply filters</button>
        <Link href="/admin/media/" className="p-2 text-sm underline">
          Reset
        </Link>
      </form>
      {error && (
        <p className="text-coral">Could not load media: {error.message}</p>
      )}
      {items?.length === 0 && (
        <p className="text-muted">No files match these filters.</p>
      )}
      <div className="grid grid-cols-2 gap-4 md:grid-cols-3 lg:grid-cols-4">
        {items?.map((item) => (
          <MediaCard key={item.id} item={item} />
        ))}
      </div>
      {pages > 1 && (
        <nav className="mt-8 flex gap-2 text-sm" aria-label="Pagination">
          {Array.from({ length: pages }, (_, i) => i + 1).map((n) => (
            <a
              key={n}
              href={href(n)}
              aria-current={n === page ? "page" : undefined}
              className={`rounded px-3 py-1 ${n === page ? "bg-ink text-white" : "bg-white"}`}
            >
              {n}
            </a>
          ))}
        </nav>
      )}
    </>
  );
}
