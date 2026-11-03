import "server-only";
import { staticMediaPaths } from "@/lib/media-static-references";
import { createClient } from "@/lib/supabase/server";

// Tables whose rows can reference media files (by id or storage path).
const contentTables = [
  "pages",
  "page_sections",
  "menu_items",
  "footer_widgets",
  "settings",
] as const;

async function references() {
  const db = await createClient();
  const found: { label: string; text: string }[] = [];
  for (const table of contentTables) {
    for (let offset = 0; ; offset += 1000) {
      const { data, error } = await db
        .from(table)
        .select("*")
        .range(offset, offset + 999);
      if (error) throw error;
      for (const row of data as Record<string, unknown>[])
        found.push({
          label: `${table}: ${row.title || row.label || row.key || row.id}`,
          text: JSON.stringify(row),
        });
      if (data.length < 1000) break;
    }
  }
  return found;
}

export async function mediaUsage(id: string, path: string) {
  return findMediaUsage(await references(), id, path);
}

export function findMediaUsage(
  rows: { label: string; text: string }[],
  id: string,
  path: string,
) {
  return [
    ...new Set([
      ...(staticMediaPaths.includes(path) ? ["Website layout asset"] : []),
      ...rows
        .filter(
          (r) =>
            r.text.includes(id) ||
            r.text.includes(path) ||
            r.text.includes(encodeURI(path)),
        )
        .map((r) => r.label),
    ]),
  ];
}
