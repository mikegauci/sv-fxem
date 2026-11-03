import {
  buildIframeEmbed,
  normalizeRichEmbeds,
  scriptChanged,
  scriptGuardMessage,
} from "@/lib/admin/embeds.mjs";
import type { SectionInput } from "@/app/(cms)/admin/(panel)/pages/actions";

type SavedSection = { id: string; html: string };

// Turns editor sections into the HTML that is stored and rendered, applying
// the same checks for saving and for previewing unsaved changes.
export function prepareSections(
  input: SectionInput[],
  saved: SavedSection[] | null,
  fullAdmin: boolean,
): { error: string } | { sections: SectionInput[] } {
  if (input.some((s) => !["html", "rich_text", "embed"].includes(s.kind)))
    return { error: "Unknown section type." };
  if (input.some((s) => typeof s.html !== "string" || s.html.length > 500_000))
    return { error: "A section is too large." };
  const sections = [];
  const ids = new Set<string>();
  for (const section of input) {
    if (
      section.id &&
      (ids.has(section.id) || !saved?.some((s) => s.id === section.id))
    )
      return { error: "Invalid section id. Reload and try again." };
    if (section.id) ids.add(section.id);
    let html = section.html;
    try {
      if (section.kind === "rich_text") html = normalizeRichEmbeds(html);
    } catch (e) {
      return { error: (e as Error).message };
    }
    const options = section.options as Record<string, unknown> | null;
    if (section.kind === "embed") {
      if (options?.mode === "iframe") {
        try {
          html = buildIframeEmbed(options);
        } catch (e) {
          return { error: (e as Error).message };
        }
      } else if (options?.mode !== "code")
        return { error: "Choose an embed mode." };
      if (new TextEncoder().encode(html).length > 100_000)
        return { error: "Embed HTML is limited to 100 KB." };
      if (
        !fullAdmin &&
        options?.mode === "code" &&
        (!section.id ||
          !saved?.some((s) => s.id === section.id && s.html === html))
      )
        return { error: scriptGuardMessage(section.label) };
    }
    const old = saved?.find((s) => s.id === section.id);
    if (!fullAdmin && scriptChanged(old?.html ?? "", html))
      return { error: scriptGuardMessage(section.label) };
    sections.push({ ...section, html });
  }
  return { sections };
}
