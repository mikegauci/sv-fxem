"use client";

import { useRouter } from "next/navigation";
import { useRef, useState } from "react";
import { uploadFiles } from "@/lib/media-upload";

export function MediaUploader() {
  const router = useRouter();
  const input = useRef<HTMLInputElement>(null);
  const [status, setStatus] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  async function upload(files: FileList) {
    setBusy(true);
    const { failed } = await uploadFiles([...files], (i, total) =>
      setStatus(`Uploading ${i + 1} of ${total}…`),
    );
    setBusy(false);
    setStatus(
      failed.length
        ? `Some files failed: ${failed.join("; ")}`
        : "Upload complete.",
    );
    if (input.current) input.current.value = "";
    router.refresh();
  }

  return (
    <div className="flex items-center gap-3">
      {status && <span className="text-muted text-sm">{status}</span>}
      <label
        className={`bg-brand hover:text-brand cursor-pointer rounded-[5px] px-4 py-2 text-sm font-bold text-black hover:bg-black ${
          busy ? "pointer-events-none opacity-60" : ""
        }`}
      >
        Upload files
        <input
          ref={input}
          type="file"
          multiple
          accept="image/*,video/mp4,application/pdf"
          className="sr-only"
          disabled={busy}
          onChange={(e) =>
            e.currentTarget.files?.length && upload(e.currentTarget.files)
          }
        />
      </label>
    </div>
  );
}
