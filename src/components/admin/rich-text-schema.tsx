"use client";
import {
  encodeEmbedCode,
  decodeEmbedCode,
  expandRichEmbeds,
  wrapCode,
} from "@/lib/admin/embeds.mjs";
import { Node, generateHTML, generateJSON } from "@tiptap/core";
import {
  NodeViewWrapper,
  ReactNodeViewRenderer,
  type NodeViewProps,
} from "@tiptap/react";
import StarterKit from "@tiptap/starter-kit";
import Image from "@tiptap/extension-image";
import { useState } from "react";
import { EmbedForm, type EmbedSettings } from "./embed-form";

function EmbedView({
  node,
  extension,
  updateAttributes,
  deleteNode,
}: NodeViewProps) {
  const [editing, setEditing] = useState(false);
  const options = node.attrs.options as EmbedSettings;
  let host = options.src ?? "Iframe";
  try {
    host = new URL(host).hostname;
  } catch {}
  return (
    <NodeViewWrapper
      contentEditable={false}
      className="my-3 rounded border border-black/20 bg-[#f5f5f5] p-4"
    >
      <p className="font-mono text-xs break-all">
        {options.mode === "iframe"
          ? `Iframe: ${host}`
          : `Code: ${String(node.attrs.code).split("\n")[0].slice(0, 150)}`}
      </p>
      <div className="flex gap-3 text-sm">
        <button type="button" onClick={() => setEditing(!editing)}>
          Edit
        </button>
        <button type="button" onClick={deleteNode}>
          Remove
        </button>
      </div>
      {editing && (
        <EmbedForm
          initial={options}
          code={
            options.mode === "code" && options.wrap
              ? wrapCode(node.attrs.code)
              : node.attrs.code
          }
          fullAdmin={extension.options.fullAdmin}
          onCancel={() => setEditing(false)}
          onSave={(code, options) => {
            updateAttributes({
              code: embedNodeCode(code, options),
              options,
              mode: options.mode,
            });
            setEditing(false);
          }}
        />
      )}
    </NodeViewWrapper>
  );
}
// The shared form returns final renderable HTML. Atom attributes keep raw
// inner code; remove only the container the form just generated, once.
export function embedNodeCode(html: string, options: EmbedSettings) {
  return options.mode === "code" && options.wrap
    ? html.replace(
        /^<div class="fxem-embed fxem-embed--code">([\s\S]*)<\/div>$/,
        "$1",
      )
    : html;
}

export const Embed = Node.create({
  name: "embed",
  group: "block",
  atom: true,
  addOptions: () => ({ fullAdmin: false }),
  addAttributes: () => ({
    mode: { default: "code" },
    code: { default: "" },
    options: { default: { mode: "code", wrap: false } },
  }),
  parseHTML: () => [
    {
      tag: "div[data-fxem-embed]",
      getAttrs: (element) => {
        const el = element as HTMLElement;
        let options: EmbedSettings = {
          mode: el.dataset.fxemEmbed as EmbedSettings["mode"],
          wrap: false,
        };
        try {
          options = JSON.parse(el.dataset.options ?? "null") ?? options;
        } catch {}
        return {
          mode: options.mode,
          code:
            el.dataset.code === undefined
              ? el.innerHTML
              : decodeEmbedCode(el.dataset.code),
          options,
        };
      },
    },
  ],
  renderHTML: ({ node }) => [
    "div",
    {
      "data-fxem-embed": node.attrs.mode,
      "data-options": JSON.stringify(node.attrs.options),
      "data-code": encodeEmbedCode(String(node.attrs.code)),
    },
  ],

  addNodeView: () => ReactNodeViewRenderer(EmbedView),
});
export const richTextExtensions = (fullAdmin = false) => [
  StarterKit.configure({
    heading: { levels: [2, 3, 4] },
    link: { openOnClick: false, autolink: true },
  }),
  Image,
  Embed.configure({ fullAdmin }),
];
export function convertToRichText(html: string, fullAdmin: boolean) {
  const template = document.createElement("template");
  template.innerHTML = html;
  // Wrap whole script/iframe elements before schema conversion, preserving their
  // attributes and bodies even when surrounded by a designed layout.
  template.content.querySelectorAll("script,iframe").forEach((el) => {
    if (el.closest("[data-fxem-embed]")) return;
    const wrapper = document.createElement("div");
    wrapper.dataset.fxemEmbed = "code";
    el.replaceWith(wrapper);
    wrapper.append(el);
  });
  const extensions = richTextExtensions(fullAdmin);
  return expandRichEmbeds(
    generateHTML(generateJSON(template.innerHTML, extensions), extensions),
  );
}
