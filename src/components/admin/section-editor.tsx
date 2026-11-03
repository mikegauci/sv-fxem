"use client";

import { useEffect, useMemo, useRef, useState } from "react";
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
  | { kind: "text"; node: Text; label: string }
  | { kind: "link"; node: HTMLAnchorElement; label: string }
  | { kind: "image"; node: HTMLImageElement; label: string }
  | { kind: "background"; node: HTMLElement; label: string };

const SKIP = new Set(["SCRIPT", "STYLE", "NOSCRIPT", "SVG", "svg", "IFRAME"]);

function textLabel(node: Text) {
  const parent = node.parentElement;
  const heading = parent?.closest("h1,h2,h3,h4,h5,h6");
  if (heading) return "Heading";
  if (parent?.closest("a.wp-block-button__link, .uagb-button__link, button"))
    return "Button text";
  if (parent?.closest("a")) return "Link text";
  if (parent?.closest("li")) return "List item";
  if (parent?.closest("th,td")) return "Table cell";
  if (parent?.closest("p")) return "Paragraph";
  return "Text";
}

function collectFields(root: DocumentFragment): Field[] {
  const fields: Field[] = [];
  const walk = (node: Node) => {
    if (node.nodeType === Node.TEXT_NODE) {
      if (node.nodeValue?.trim())
        fields.push({
          kind: "text",
          node: node as Text,
          label: textLabel(node as Text),
        });
      return;
    }
    if (node.nodeType !== Node.ELEMENT_NODE) return;
    const el = node as HTMLElement;
    if (SKIP.has(el.tagName)) return;
    if (el.tagName === "IMG")
      fields.push({
        kind: "image",
        node: el as HTMLImageElement,
        label: "Image",
      });
    if (/url\(/.test(el.getAttribute("style") || ""))
      fields.push({ kind: "background", node: el, label: "Background image" });
    if (el.tagName === "A" && el.hasAttribute("href"))
      fields.push({
        kind: "link",
        node: el as HTMLAnchorElement,
        label: "Link URL",
      });
    el.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return fields;
}

function parse(html: string) {
  const template = document.createElement("template");
  template.innerHTML = html;
  return template;
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

    setParsed((p) => ({ template: parse(html), version: p.version + 1 }));
  }, [html]);
  const fields = useMemo(
    () => (template ? collectFields(template.content) : []),
    [template],
  );
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
      {fields.map((f, i) => {
        if (f.kind === "text") {
          const value = f.node.nodeValue ?? "";
          const lead = value.match(/^\s*/)![0];
          const trail = value.match(/\s*$/)![0];
          const inner = value.trim();
          const Input = inner.length > 80 ? "textarea" : "input";
          return (
            <label key={i} className="block text-xs font-semibold">
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
            <label key={i} className="block text-xs font-semibold">
              {f.label}
              <span className="text-muted ml-2 font-normal">
                “{f.node.textContent?.trim().slice(0, 40) || "link"}”
              </span>
              <input
                dir="ltr"
                className={field}
                defaultValue={f.node.getAttribute("href") ?? ""}
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
            key={i}
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
  dir,
  onChange,
}: {
  section: SectionInput;
  dir: "ltr" | "rtl";
  onChange: (section: SectionInput) => void;
}) {
  const [mode, setMode] = useState<"content" | "html">("content");
  if (section.kind === "rich_text")
    return (
      <div dir={dir}>
        <RichTextEditor
          value={section.html}
          onChange={(html) => onChange({ ...section, html })}
        />
      </div>
    );
  return (
    <div>
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
      {mode === "content" ? (
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
