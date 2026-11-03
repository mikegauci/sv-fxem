"use server";

import { revalidatePath } from "next/cache";
import { assertAdmin } from "@/lib/auth/admin";
import { mediaUsage } from "@/lib/admin/inventory";
import { MEDIA_BUCKET } from "@/lib/media";
import { createClient } from "@/lib/supabase/server";

export type UploadedFile = {
  path: string;
  fileName: string;
  mimeType: string;
  sizeBytes: number;
  width: number | null;
  height: number | null;
};

// The browser uploads straight to Storage (RLS checks admin); this records it.
export async function recordUpload(file: UploadedFile) {
  const admin = await assertAdmin("media");
  const supabase = await createClient();
  const { data, error } = await supabase
    .from("media")
    .insert({
      path: file.path,
      file_name: file.fileName,
      mime_type: file.mimeType,
      size_bytes: file.sizeBytes,
      width: file.width,
      height: file.height,
      uploaded_by: admin.id,
    })
    .select("id")
    .single();
  if (error) {
    await supabase.storage.from(MEDIA_BUCKET).remove([file.path]);
    return { error: error.message };
  }
  revalidatePath("/admin/media/");
  return { id: data.id };
}

export async function updateAlt(id: string, alt: string) {
  await assertAdmin("media");
  const supabase = await createClient();
  const { error } = await supabase
    .from("media")
    .update({ alt: alt.trim() })
    .eq("id", id);
  if (error) return { error: error.message };
  revalidatePath("/admin/media/");
  return { ok: true };
}

export async function deleteMedia(id: string) {
  await assertAdmin("media");
  const supabase = await createClient();
  const existing = await supabase
    .from("media")
    .select("path")
    .eq("id", id)
    .single();
  if (existing.error) return { error: existing.error.message };
  const usage = await mediaUsage(id, existing.data.path);
  if (usage.length)
    return {
      error: `This file is used by ${usage.length} content records. Remove those references first.`,
    };
  const { data: row, error } = await supabase
    .from("media")
    .delete()
    .eq("id", id)
    .select("path")
    .single();
  if (error) return { error: error.message };
  await supabase.storage.from(MEDIA_BUCKET).remove([row.path]);
  revalidatePath("/admin/media/");
  return { ok: true };
}
