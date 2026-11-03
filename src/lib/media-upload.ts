import { recordUpload } from "@/app/(cms)/admin/(panel)/media/actions";
import { MEDIA_BUCKET } from "@/lib/media";
import { createClient } from "@/lib/supabase/client";

function slugify(name: string) {
  const dot = name.lastIndexOf(".");
  const base = (dot > 0 ? name.slice(0, dot) : name)
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, "-")
    .replace(/^-|-$/g, "");
  const ext = dot > 0 ? name.slice(dot + 1).toLowerCase() : "";
  return { base: base || "file", ext };
}

function imageSize(
  file: File,
): Promise<{ width: number; height: number } | null> {
  if (!file.type.startsWith("image/")) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new window.Image();
    const url = URL.createObjectURL(file);
    img.onload = () => {
      resolve({ width: img.naturalWidth, height: img.naturalHeight });
      URL.revokeObjectURL(url);
    };
    img.onerror = () => resolve(null);
    img.src = url;
  });
}

export type UploadResult = {
  uploaded: { id: string; path: string; fileName: string }[];
  failed: string[];
};

// Browser-side: uploads straight to Storage (RLS checks admin), then records
// each file in public.media.
export async function uploadFiles(
  files: File[],
  onProgress?: (done: number, total: number) => void,
): Promise<UploadResult> {
  const supabase = createClient();
  const result: UploadResult = { uploaded: [], failed: [] };

  for (const [i, original] of files.entries()) {
    const file = await optimiseImage(original);
    onProgress?.(i, files.length);
    const { base, ext } = slugify(file.name);
    const now = new Date();
    const folder = `${now.getFullYear()}/${String(now.getMonth() + 1).padStart(2, "0")}`;
    const path = `${folder}/${base}-${crypto.randomUUID().slice(0, 8)}${ext ? `.${ext}` : ""}`;

    const { error } = await supabase.storage
      .from(MEDIA_BUCKET)
      .upload(path, file, { contentType: file.type, cacheControl: "31536000" });
    if (error) {
      result.failed.push(`${file.name}: ${error.message}`);
      continue;
    }

    const size = await imageSize(file);
    const recorded = await recordUpload({
      path,
      fileName: file.name,
      mimeType: file.type,
      sizeBytes: file.size,
      width: size?.width ?? null,
      height: size?.height ?? null,
    });
    if ("error" in recorded)
      result.failed.push(`${file.name}: ${recorded.error}`);
    else result.uploaded.push({ id: recorded.id, path, fileName: file.name });
  }
  return result;
}

// Keep animated/vector files unchanged. Only JPEG/PNG can be safely flattened.
async function optimiseImage(file: File): Promise<File> {
  if (!["image/jpeg", "image/png"].includes(file.type)) return file;
  try {
    const bitmap = await createImageBitmap(file);
    const scale = Math.min(1, 2000 / Math.max(bitmap.width, bitmap.height));
    const canvas = document.createElement("canvas");
    canvas.width = Math.max(1, Math.round(bitmap.width * scale));
    canvas.height = Math.max(1, Math.round(bitmap.height * scale));
    const context = canvas.getContext("2d");
    if (!context) {
      bitmap.close();
      return file;
    }
    context.drawImage(bitmap, 0, 0, canvas.width, canvas.height);
    bitmap.close();
    const blob = await new Promise<Blob | null>((resolve) =>
      canvas.toBlob(resolve, "image/webp", 0.8),
    );
    if (!blob || blob.type !== "image/webp" || blob.size >= file.size)
      return file;
    return new File([blob], file.name.replace(/\.[^.]+$/, "") + ".webp", {
      type: "image/webp",
      lastModified: file.lastModified,
    });
  } catch {
    return file;
  }
}
