"use client";

import Link from "next/link";
import Image from "next/image";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import {
  deleteMedia,
  updateAlt,
} from "@/app/(cms)/admin/(panel)/media/actions";
import { formatBytes, mediaUrl } from "@/lib/media";
import type { Tables } from "@/lib/supabase/database.types";

export function MediaCard({ item }: { item: Tables<"media"> }) {
  const router = useRouter();
  const [alt, setAlt] = useState(item.alt);
  const [message, setMessage] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const url = mediaUrl(item.path);
  const isImage = item.mime_type.startsWith("image/");

  return (
    <figure className="overflow-hidden rounded-lg bg-white shadow-sm">
      <div className="relative aspect-[4/3] bg-[#eee]">
        {isImage ? (
          <Image
            src={url}
            alt={item.alt}
            fill
            sizes="(min-width: 1024px) 25vw, 50vw"
            className="object-cover"
            unoptimized={item.mime_type === "image/svg+xml"}
          />
        ) : (
          <span className="text-muted absolute inset-0 grid place-items-center text-xs font-semibold uppercase">
            {item.mime_type.split("/")[1]}
          </span>
        )}
      </div>
      <Link
        href={`/admin/tools/media/${item.id}/`}
        className="block px-3 pt-3 text-xs underline"
      >
        View file usage
      </Link>
      <figcaption className="space-y-2 p-3 text-xs">
        <p className="text-ink truncate font-semibold" title={item.file_name}>
          {item.file_name}
        </p>
        <p className="text-muted">
          {formatBytes(item.size_bytes)}
          {item.width && item.height ? ` · ${item.width}×${item.height}` : ""}
        </p>
        {isImage && (
          <input
            value={alt}
            onChange={(e) => setAlt(e.target.value)}
            onBlur={() =>
              alt !== item.alt &&
              start(async () => {
                const r = await updateAlt(item.id, alt);
                setMessage(r.error ?? "Alt text saved");
              })
            }
            placeholder="Alt text"
            aria-label={`Alt text for ${item.file_name}`}
            className="w-full rounded border border-[#ddd] px-2 py-1"
          />
        )}
        <div className="flex items-center justify-between gap-2">
          <button
            type="button"
            className="text-teal hover:underline"
            onClick={() => {
              navigator.clipboard.writeText(url);
              setMessage("URL copied");
            }}
          >
            Copy URL
          </button>
          <button
            type="button"
            disabled={pending}
            className="text-coral hover:underline disabled:opacity-60"
            onClick={() => {
              if (!confirm(`Delete ${item.file_name}? This can’t be undone.`))
                return;
              start(async () => {
                const r = await deleteMedia(item.id);
                if (r.error) setMessage(r.error);
                else router.refresh();
              });
            }}
          >
            Delete
          </button>
        </div>
        {message && <p className="text-muted">{message}</p>}
      </figcaption>
    </figure>
  );
}
