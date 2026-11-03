"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { InlineRichText } from "./inline-rich-text";
import { EmbedForm, type EmbedSettings } from "./embed-form";
import { scriptSignature } from "@/lib/admin/embeds.mjs";
import { collectFields, parseSection } from "@/lib/admin/content-fields.mjs";
import { MediaPicker } from "@/components/admin/media-picker";
import { RichTextEditor } from "@/components/admin/rich-text-editor";
import { mediaUrl } from "@/lib/media";
import type { SectionInput } from "@/app/(cms)/admin/(panel)/pages/actions";

const field =
  "mt-1 block w-full rounded border border-black/20 bg-white p-2 text-sm";

// The editable parts of a section's original markup: texts, links, images
// and background images. Each field points at a node of a parsed copy of the
// section, so editing changes only that node and the layout stays intact.
type Field =
  | { kind: "inline"; node: HTMLElement; label: string }
  | { kind: "text"; node: Text; label: string }
  | { kind: "link"; node: HTMLAnchorElement; label: string }
  | { kind: "image"; node: HTMLImageElement; label: string }
  | { kind: "background"; node: HTMLElement; label: string };

// DOM paths keep a block editor mounted when links are inserted inside it.
function fieldKey(field: Field) {
  const path: number[] = [];
  let node: Node = field.node;
  while (node.parentNode) {
    path.unshift(
      Array.prototype.indexOf.call(node.parentNode.childNodes, node),
    );
    node = node.parentNode;
  }
  return `${field.kind}:${path.join(".")}`;
}

const backgroundUrl = (el: HTMLElement) =>
  (el.getAttribute("style") || "").match(/url\(["']?([^"')]+)["']?\)/)?.[1] ??
  "";

function ContentFields({
  html,
  dir,
  onChange,
}: {
  html: string;
  dir: "ltr" | "rtl";
  onChange: (html: string) => void;
}) {
  // Re-parse only when the HTML changes from outside these fields (the HTML
  // tab), not after our own edits.
  const latest = useRef<string | null>(null);
  const [{ template, version }, setParsed] = useState<{
    template: HTMLTemplateElement | null;
    version: number;
  }>({ template: null, version: 0 });
  const [picking, setPicking] = useState<Field | null>(null);
  const [, bump] = useState(0);
  useEffect(() => {
    if (latest.current === html) return;
    latest.current = html;
    // Parsing needs the DOM, so it runs after mount.

    setParsed((p) => ({
      template: parseSection(document, html),
      version: p.version + 1,
    }));
  }, [html]);
  // Inline edits replace descendants. Recollect so URL fields point at the
  // current anchors rather than detached nodes from the previous innerHTML.
  const fields = template ? (collectFields(template.content) as Field[]) : [];
  if (!template) return null;
  const commit = () => {
    latest.current = template.innerHTML;
    onChange(template.innerHTML);
    bump((n) => n + 1);
  };
  if (!fields.length)
    return (
      <p className="text-muted text-sm">
        No editable text in this section. Use HTML.
      </p>
    );

  return (
    <div className="space-y-3" key={version}>
      {fields.map((f) => {
        const key = fieldKey(f);
        if (f.kind === "inline")
          return (
            <div key={key} className="text-xs font-semibold">
              {f.label}
              <InlineRichText
                value={f.node.innerHTML}
                dir={dir}
                onChange={(html) => {
                  f.node.innerHTML = html;
                  commit();
                }}
              />
            </div>
          );
        if (f.kind === "text") {
          const value = f.node.nodeValue ?? "";
          const lead = value.match(/^\s*/)![0];
          const trail = value.match(/\s*$/)![0];
          const inner = value.trim();
          const Input = inner.length > 80 ? "textarea" : "input";
          return (
            <label key={key} className="block text-xs font-semibold">
              {f.label}
              <Input
                dir={dir}
                className={field}
                rows={
                  Input === "textarea"
                    ? Math.min(8, Math.ceil(inner.length / 80))
                    : undefined
                }
                defaultValue={inner}
                onChange={(e) => {
                  f.node.nodeValue = lead + e.target.value + trail;
                  commit();
                }}
              />
            </label>
          );
        }
        if (f.kind === "link")
          return (
            <label key={key} className="block text-xs font-semibold">
              {f.label}
              <span className="text-muted ml-2 font-normal">
                “{f.node.textContent?.trim().slice(0, 40) || "link"}”
              </span>
              <input
                dir="ltr"
                className={field}
                value={f.node.getAttribute("href") ?? ""}
                onChange={(e) => {
                  f.node.setAttribute("href", e.target.value.trim());
                  commit();
                }}
              />
            </label>
          );
        const src =
          f.kind === "image"
            ? (f.node.getAttribute("src") ?? "")
            : backgroundUrl(f.node);
        return (
          <div
            key={key}
            className="flex items-start gap-3 rounded border border-black/10 p-2"
          >
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={src}
              alt=""
              className="size-16 shrink-0 rounded bg-[#eee] object-contain"
            />
            <div className="min-w-0 flex-1 space-y-2 text-xs">
              <p className="font-semibold">{f.label}</p>
              <p className="text-muted truncate" dir="ltr">
                {src}
              </p>
              {f.kind === "image" && (
                <label className="block">
                  Alt text
                  <input
                    dir={dir}
                    className={field}
                    defaultValue={f.node.getAttribute("alt") ?? ""}
                    onChange={(e) => {
                      f.node.setAttribute("alt", e.target.value);
                      commit();
                    }}
                  />
                </label>
              )}
              <button
                type="button"
                className="text-brand underline"
                onClick={() => setPicking(f)}
              >
                Replace image
              </button>
            </div>
          </div>
        );
      })}
      <MediaPicker
        open={picking !== null}
        onClose={() => setPicking(null)}
        onSelect={(media) => {
          const url = mediaUrl(media.path);
          if (picking?.kind === "image") {
            picking.node.setAttribute("src", url);
            // The original WordPress size variants no longer apply.
            picking.node.removeAttribute("srcset");
            picking.node.removeAttribute("sizes");
            if (media.alt && !picking.node.getAttribute("alt"))
              picking.node.setAttribute("alt", media.alt);
          } else if (picking?.kind === "background") {
            const style = picking.node.getAttribute("style") || "";
            picking.node.setAttribute(
              "style",
              style.replace(/url\(["']?[^"')]+["']?\)/, `url(${url})`),
            );
          }
          setPicking(null);
          commit();
        }}
      />
    </div>
  );
}

export function SectionEditor({
  section,
  fullAdmin = false,
  dir,
  onChange,
}: {
  section: SectionInput;
  fullAdmin?: boolean;
  dir: "ltr" | "rtl";
  onChange: (section: SectionInput) => void;
}) {
  const [mode, setMode] = useState<"content" | "html">("content");
  // Sections with nothing to edit as fields open straight in HTML.
  const editable = useMemo(
    () =>
      section.kind === "html" &&
      typeof document !== "undefined" &&
      collectFields(parseSection(document, section.html).content).length > 0,
    [section.kind, section.html],
  );
  if (section.kind === "embed")
    return (
      <EmbedForm
        initial={section.options as EmbedSettings | undefined}
        code={section.html}
        fullAdmin={fullAdmin}
        onSave={(html, options) => onChange({ ...section, html, options })}
      />
    );
  if (section.kind === "rich_text")
    return (
      <div dir={dir}>
        {!fullAdmin && scriptSignature(section.html).length > 0 && (
          <p className="mb-3 text-sm">
            Contains a script — only full admins can change it
          </p>
        )}
        <RichTextEditor
          fullAdmin={fullAdmin}
          dir={dir}
          value={section.html}
          onChange={(html) => onChange({ ...section, html })}
        />
      </div>
    );
  return (
    <div>
      {!fullAdmin && scriptSignature(section.html).length > 0 && (
        <p className="mb-3 text-sm">
          Contains a script — only full admins can change it
        </p>
      )}
      {editable && (
        <div className="mb-3 flex gap-1 text-sm">
          {(["content", "html"] as const).map((m) => (
            <button
              key={m}
              type="button"
              onClick={() => setMode(m)}
              className={`rounded px-3 py-1 ${mode === m ? "bg-ink text-white" : "bg-black/5"}`}
            >
              {m === "content" ? "Content" : "HTML"}
            </button>
          ))}
        </div>
      )}
      {editable && mode === "content" ? (
        <ContentFields
          html={section.html}
          dir={dir}
          onChange={(html) => onChange({ ...section, html })}
        />
      ) : (
        <textarea
          dir="ltr"
          spellCheck={false}
          className={`${field} h-96 font-mono text-xs`}
          value={section.html}
          onChange={(e) => onChange({ ...section, html: e.target.value })}
        />
      )}
    </div>
  );
}
