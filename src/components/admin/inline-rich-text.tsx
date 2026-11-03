"use client";
import { useEffect, useRef } from "react";
import { Mark } from "@tiptap/core";
import Document from "@tiptap/extension-document";
import Paragraph from "@tiptap/extension-paragraph";
import Text from "@tiptap/extension-text";
import Bold from "@tiptap/extension-bold";
import Italic from "@tiptap/extension-italic";
import Underline from "@tiptap/extension-underline";
import Link from "@tiptap/extension-link";
import HardBreak from "@tiptap/extension-hard-break";
import Superscript from "@tiptap/extension-superscript";
import Subscript from "@tiptap/extension-subscript";
import { EditorContent, useEditor } from "@tiptap/react";

export const Span = Mark.create({
  name: "span",
  addAttributes: () => ({ class: { default: null }, style: { default: null } }),
  parseHTML: () => [{ tag: "span" }],
  renderHTML: ({ HTMLAttributes }) => ["span", HTMLAttributes, 0],
});
export const inlineExtensions = () => [
  Document.extend({ content: "paragraph" }),
  Paragraph,
  Text,
  Bold,
  Italic,
  Underline,
  Link.configure({ openOnClick: false, autolink: false }),
  HardBreak,
  Superscript,
  Subscript,
  Span,
];
export function InlineRichText({
  value,
  dir,
  onChange,
}: {
  value: string;
  dir: "ltr" | "rtl";
  onChange: (value: string) => void;
}) {
  const latest = useRef(value);
  const editor = useEditor({
    extensions: inlineExtensions(),
    content: `<p>${value}</p>`,
    immediatelyRender: false,
    editorProps: { attributes: { dir, class: "min-h-10 p-2 outline-none" } },
    onUpdate: ({ editor }) => {
      const html = editor.getHTML().replace(/^<p>([\s\S]*)<\/p>$/, "$1");
      latest.current = html;
      onChange(html);
    },
  });
  useEffect(() => {
    if (!editor || value === latest.current) return;
    latest.current = value;
    editor.commands.setContent(`<p>${value}</p>`, { emitUpdate: false });
  }, [editor, value]);

  return (
    <div className="mt-1 rounded border border-black/20 font-normal" dir={dir}>
      <div
        className="flex flex-wrap gap-1 bg-black/5 p-1"
        role="toolbar"
        aria-label="Text formatting"
      >
        {(
          [
            ["Bold", () => editor?.chain().focus().toggleBold().run()],
            ["Italic", () => editor?.chain().focus().toggleItalic().run()],
            [
              "Underline",
              () => editor?.chain().focus().toggleUnderline().run(),
            ],
            [
              "Link",
              () => {
                const href = prompt(
                  "Link address",
                  editor?.getAttributes("link").href ?? "https://",
                );
                if (href === null) return;
                if (!href.trim()) editor?.chain().focus().unsetLink().run();
                else
                  editor
                    ?.chain()
                    .focus()
                    .setLink({
                      href: href.trim(),
                      target: confirm("Open in a new tab?") ? "_blank" : null,
                      rel: "noopener noreferrer",
                    })
                    .run();
              },
            ],
            ["Line break", () => editor?.chain().focus().setHardBreak().run()],
            [
              "Clear formatting",
              () => editor?.chain().focus().unsetAllMarks().run(),
            ],
          ] as const
        ).map(([label, run]) => (
          <button
            type="button"
            key={label}
            className="rounded bg-white px-2 py-1 text-xs"
            onClick={run}
          >
            {label}
          </button>
        ))}
      </div>
      <EditorContent editor={editor} />
    </div>
  );
}
