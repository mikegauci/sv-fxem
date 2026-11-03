"use client";

import {
  hasUnsupportedRichMarkup,
  expandRichEmbeds,
} from "@/lib/admin/embeds.mjs";
import { richTextExtensions, embedNodeCode } from "./rich-text-schema";
import { EmbedForm } from "./embed-form";
import { EditorContent, useEditor, useEditorState } from "@tiptap/react";

import { useRef, useState } from "react";
import { MediaPicker, type PickedMedia } from "@/components/admin/media-picker";
import { mediaUrl } from "@/lib/media";

// Imported WordPress posts use galleries, columns and share blocks that
// Tiptap's schema would flatten. Those posts are edited as HTML instead.
export function needsHtmlMode(html: string) {
  return hasUnsupportedRichMarkup(html);
}

function imageHtml(media: PickedMedia) {
  const alt = media.alt.replace(/"/g, "&quot;");
  const size =
    media.width && media.height
      ? ` width="${media.width}" height="${media.height}"`
      : "";
  return `<figure class="wp-block-image size-large"><img src="${mediaUrl(media.path)}" alt="${alt}"${size} /></figure>`;
}

export function RichTextEditor({
  value,
  onChange,
  fullAdmin = false,
  dir = "ltr",
}: {
  value: string;
  onChange: (html: string) => void;
  fullAdmin?: boolean;
  dir?: "ltr" | "rtl";
}) {
  const [mode, setMode] = useState<"visual" | "html">(() =>
    needsHtmlMode(value) ? "html" : "visual",
  );
  const locked = needsHtmlMode(value);
  const activeMode = locked ? "html" : mode;

  return (
    <div className="rounded border border-[#ddd] bg-white">
      <div className="flex items-center gap-1 border-b border-[#eee] px-2 pt-2 text-sm">
        {(["visual", "html"] as const).map((m) => (
          <button
            key={m}
            type="button"
            disabled={m === "visual" && locked}
            onClick={() => setMode(m)}
            className={`rounded-t px-3 py-1.5 disabled:cursor-not-allowed disabled:opacity-40 ${
              activeMode === m ? "bg-[#f5f5f5] font-semibold" : "text-muted"
            }`}
          >
            {m === "visual" ? "Visual" : "HTML"}
          </button>
        ))}
        {locked && (
          <span className="text-muted ml-2 text-xs">
            This content has WordPress layouts (galleries, columns…), so it’s
            edited as HTML to keep them intact.
          </span>
        )}
      </div>
      {activeMode === "visual" ? (
        <VisualEditor
          value={value}
          onChange={onChange}
          fullAdmin={fullAdmin}
          dir={dir}
        />
      ) : (
        <HtmlEditor value={value} onChange={onChange} />
      )}
    </div>
  );
}

function VisualEditor({
  value,
  onChange,
  fullAdmin = false,
  dir = "ltr",
}: {
  value: string;
  onChange: (html: string) => void;
  fullAdmin?: boolean;
  dir?: "ltr" | "rtl";
}) {
  const [picking, setPicking] = useState(false);
  const [embedding, setEmbedding] = useState(false);
  const editor = useEditor({
    extensions: richTextExtensions(fullAdmin),
    content: value,
    immediatelyRender: false,
    editorProps: {
      attributes: {
        dir,
        class: "prose-cms min-h-[420px] px-5 py-4 outline-none",
      },
    },
    onUpdate: ({ editor }) => onChange(expandRichEmbeds(editor.getHTML())),
  });

  const state = useEditorState({
    editor,
    selector: ({ editor: e }) =>
      e
        ? {
            bold: e.isActive("bold"),
            italic: e.isActive("italic"),
            underline: e.isActive("underline"),
            link: e.isActive("link"),
            h2: e.isActive("heading", { level: 2 }),
            h3: e.isActive("heading", { level: 3 }),
            h4: e.isActive("heading", { level: 4 }),
            bullet: e.isActive("bulletList"),
            ordered: e.isActive("orderedList"),
            quote: e.isActive("blockquote"),
          }
        : null,
  });

  if (!editor) return <div className="min-h-[460px]" />;
  const chain = () => editor.chain().focus();

  function setLink() {
    const previous = editor!.getAttributes("link").href as string | undefined;
    const url = window.prompt("Link address", previous ?? "https://");
    if (url === null) return;
    if (!url.trim()) chain().extendMarkRange("link").unsetLink().run();
    else chain().extendMarkRange("link").setLink({ href: url.trim() }).run();
  }

  const buttons: {
    label: string;
    title: string;
    active?: boolean;
    run: () => void;
  }[] = [
    {
      label: "H2",
      title: "Heading",
      active: state?.h2,
      run: () => chain().toggleHeading({ level: 2 }).run(),
    },
    {
      label: "H3",
      title: "Subheading",
      active: state?.h3,
      run: () => chain().toggleHeading({ level: 3 }).run(),
    },
    {
      label: "H4",
      title: "Small heading",
      active: state?.h4,
      run: () => chain().toggleHeading({ level: 4 }).run(),
    },
    {
      label: "B",
      title: "Bold",
      active: state?.bold,
      run: () => chain().toggleBold().run(),
    },
    {
      label: "I",
      title: "Italic",
      active: state?.italic,
      run: () => chain().toggleItalic().run(),
    },
    {
      label: "U",
      title: "Underline",
      active: state?.underline,
      run: () => chain().toggleUnderline().run(),
    },
    { label: "Link", title: "Link", active: state?.link, run: setLink },
    {
      label: "• List",
      title: "Bulleted list",
      active: state?.bullet,
      run: () => chain().toggleBulletList().run(),
    },
    {
      label: "1. List",
      title: "Numbered list",
      active: state?.ordered,
      run: () => chain().toggleOrderedList().run(),
    },
    {
      label: "Quote",
      title: "Quote",
      active: state?.quote,
      run: () => chain().toggleBlockquote().run(),
    },
    {
      label: "Line",
      title: "Separator",
      run: () => chain().setHorizontalRule().run(),
    },
    { label: "Image", title: "Insert image", run: () => setPicking(true) },
    { label: "Embed", title: "Insert embed", run: () => setEmbedding(true) },
    { label: "Undo", title: "Undo", run: () => chain().undo().run() },
    { label: "Redo", title: "Redo", run: () => chain().redo().run() },
  ];

  return (
    <>
      <div className="sticky top-0 z-10 flex flex-wrap gap-1 border-b border-[#eee] bg-[#f5f5f5] p-2">
        {buttons.map((b) => (
          <button
            key={b.label}
            type="button"
            title={b.title}
            onClick={b.run}
            className={`rounded px-2.5 py-1 text-xs font-semibold ${
              b.active ? "bg-ink text-white" : "bg-white hover:bg-[#e8e8e8]"
            }`}
          >
            {b.label}
          </button>
        ))}
      </div>
      {embedding && (
        <EmbedForm
          fullAdmin={fullAdmin}
          onCancel={() => setEmbedding(false)}
          onSave={(code, options) => {
            chain()
              .insertContent({
                type: "embed",
                attrs: {
                  mode: options.mode,
                  code: embedNodeCode(code, options),
                  options,
                },
              })
              .run();
            setEmbedding(false);
          }}
        />
      )}
      <EditorContent editor={editor} />
      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        onSelect={(m) => {
          setPicking(false);
          chain()
            .setImage({ src: mediaUrl(m.path), alt: m.alt })
            .run();
        }}
      />
    </>
  );
}

function HtmlEditor({
  value,
  onChange,
}: {
  value: string;
  onChange: (html: string) => void;
}) {
  const area = useRef<HTMLTextAreaElement>(null);
  const [picking, setPicking] = useState(false);

  function insert(html: string) {
    const el = area.current;
    const start = el?.selectionStart ?? value.length;
    const end = el?.selectionEnd ?? value.length;
    onChange(`${value.slice(0, start)}\n${html}\n${value.slice(end)}`);
  }

  return (
    <>
      <div className="flex gap-3 border-b border-[#eee] bg-[#f5f5f5] p-2 text-xs">
        <button
          type="button"
          onClick={() => setPicking(true)}
          className="rounded bg-white px-2.5 py-1 font-semibold hover:bg-[#e8e8e8]"
        >
          Insert image
        </button>
        <span className="text-muted">
          Code is never executed in the editor. Use the saved-page preview.
        </span>
      </div>
      <div>
        <textarea
          ref={area}
          value={value}
          onChange={(e) => onChange(e.target.value)}
          spellCheck={false}
          className="min-h-[520px] w-full resize-y p-4 font-mono text-xs leading-relaxed outline-none"
        />
      </div>
      <MediaPicker
        open={picking}
        onClose={() => setPicking(false)}
        onSelect={(m) => {
          setPicking(false);
          insert(imageHtml(m));
        }}
      />
    </>
  );
}
