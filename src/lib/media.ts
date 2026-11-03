import { env } from "@/lib/env";

export const MEDIA_BUCKET = "media";

export function mediaUrl(path: string) {
  return `${env.supabaseUrl}/storage/v1/object/public/${MEDIA_BUCKET}/${path}`;
}

export function formatBytes(bytes: number) {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}
