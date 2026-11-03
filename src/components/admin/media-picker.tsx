"use client";

import Image from "next/image";
import { useCallback, useEffect, useRef, useState } from "react";
import { mediaUrl } from "@/lib/media";
import { uploadFiles } from "@/lib/media-upload";
import { createClient } from "@/lib/supabase/client";

export type PickedMedia = {
  id: string;
  path: string;
  width: number | null;
  height: number | null;
  alt: string;
};

const PAGE_SIZE = 40;

// Modal image library: search, upload and pick one image.
export function MediaPicker({
  open,
  onClose,
  onSelect,
}: {
  open: boolean;
  onClose: () => void;
  onSelect: (media: PickedMedia) => void;
}) {
  const dialog = useRef<HTMLDialogElement>(null);
  const [search, setSearch] = useState("");
  const [items, setItems] = useState<PickedMedia[]>([]);
  const [limit, setLimit] = useState(PAGE_SIZE);
  const [hasMore, setHasMore] = useState(false);
  const [status, setStatus] = useState<string | null>(null);

  const load = useCallback(async (q: string, max: number) => {
    let query = createClient()
      .from("media")
      .select("id, path, width, height, alt")
      .like("mime_type", "image/%")
      .order("created_at", { ascending: false })
      .order("id", { ascending: false })
      .limit(max + 1);
    if (q) query = query.ilike("file_name", `%${q}%`);
    const { data, error } = await query;
    if (error) return setStatus(error.message);
    setHasMore((data ?? []).length > max);
    setItems((data ?? []).slice(0, max));
  }, []);

  useEffect(() => {
    const el = dialog.current;
    if (!el) return;
    if (open && !el.open) el.showModal();
    if (!open && el.open) el.close();
  }, [open]);

  useEffect(() => {
    if (!open) return;
    const t = setTimeout(() => load(search.trim(), limit), 200);
    return () => clearTimeout(t);
  }, [open, search, limit, load]);

  async function upload(files: FileList) {
    const { uploaded, failed } = await uploadFiles([...files], (i, total) =>
      setStatus(`Uploading ${i + 1} of ${total}…`),
    );
    setStatus(failed.length ? `Failed: ${failed.join("; ")}` : null);
    await load(search.trim(), limit);
    if (uploaded.length === 1 && !failed.length) {
      const { data } = await createClient()
        .from("media")
        .select("id, path, width, height, alt")
        .eq("id", uploaded[0].id)
        .single();
      if (data) onSelect(data);
    }
  }

  return (
    <dialog
      ref={dialog}
      onClose={onClose}
      className="m-auto w-[min(960px,calc(100vw-32px))] rounded-lg p-0 shadow-xl backdrop:bg-black/50"
    >
      <div className="flex flex-wrap items-center gap-3 border-b border-[#eee] p-4">
        <h2 className="text-ink mr-auto font-bold">Choose an image</h2>
        <input
          value={search}
          onChange={(e) => {
            setSearch(e.target.value);
            setLimit(PAGE_SIZE);
          }}
          placeholder="Search by file name"
          className="w-56 rounded border border-[#ddd] px-3 py-1.5 text-sm"
        />
        <label className="bg-brand hover:text-brand cursor-pointer rounded-[5px] px-3 py-1.5 text-sm font-bold text-black hover:bg-black">
          Upload
          <input
            type="file"
            multiple
            accept="image/*"
            className="sr-only"
            onChange={(e) =>
              e.currentTarget.files?.length && upload(e.currentTarget.files)
            }
          />
        </label>
        <button
          type="button"
          onClick={onClose}
          className="text-muted px-2 text-sm hover:text-black"
        >
          Close
        </button>
      </div>
      {status && <p className="text-muted px-4 pt-3 text-sm">{status}</p>}
      <div className="grid max-h-[65vh] grid-cols-3 gap-3 overflow-y-auto p-4 sm:grid-cols-4 md:grid-cols-6">
        {items.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => onSelect(item)}
            className="focus:ring-brand relative aspect-square overflow-hidden rounded bg-[#eee] hover:opacity-80 focus:ring-2"
            title={item.path.split("/").pop()}
          >
            <Image
              src={mediaUrl(item.path)}
              alt={item.alt}
              fill
              sizes="160px"
              className="object-cover"
            />
          </button>
        ))}
        {!items.length && (
          <p className="text-muted col-span-full text-sm">No images found.</p>
        )}
      </div>
      {hasMore && (
        <div className="border-t border-[#eee] p-3 text-center">
          <button
            type="button"
            onClick={() => setLimit((n) => n + PAGE_SIZE)}
            className="text-sm font-semibold hover:underline"
          >
            Load more
          </button>
        </div>
      )}
    </dialog>
  );
}

// A form field showing the chosen image with change/remove buttons.
export function MediaField({
  label,
  hint,
  value,
  onChange,
}: {
  label: string;
  hint?: string;
  value: PickedMedia | null;
  onChange: (media: PickedMedia | null) => void;
}) {
  const [open, setOpen] = useState(false);
  return (
    <div>
      <p className="text-ink mb-1 text-sm font-semibold">{label}</p>
      {value ? (
        <div className="relative aspect-video overflow-hidden rounded bg-[#eee]">
          <Image
            src={mediaUrl(value.path)}
            alt={value.alt}
            fill
            sizes="320px"
            className="object-cover"
          />
        </div>
      ) : (
        <p className="text-muted rounded border border-dashed border-[#ccc] p-4 text-center text-xs">
          No image
        </p>
      )}
      <div className="mt-2 flex gap-3 text-sm">
        <button
          type="button"
          onClick={() => setOpen(true)}
          className="font-semibold hover:underline"
        >
          {value ? "Change" : "Choose image"}
        </button>
        {value && (
          <button
            type="button"
            onClick={() => onChange(null)}
            className="text-coral hover:underline"
          >
            Remove
          </button>
        )}
      </div>
      {hint && <p className="text-muted mt-1 text-xs">{hint}</p>}
      <MediaPicker
        open={open}
        onClose={() => setOpen(false)}
        onSelect={(m) => {
          onChange(m);
          setOpen(false);
        }}
      />
    </div>
  );
}
