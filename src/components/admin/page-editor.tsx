"use client";

import { convertToRichText } from "./rich-text-schema";
import { scriptSignature, scriptGuardMessage } from "@/lib/admin/embeds.mjs";
import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { LocalDraft } from "@/components/admin/local-draft";
import { SectionEditor } from "@/components/admin/section-editor";
import {
  createTranslation,
  deletePage,
  savePage,
  type PageInput,
  type SectionInput,
} from "@/app/(cms)/admin/(panel)/pages/actions";

const field =
  "mt-1 block w-full rounded border border-black/20 bg-white p-2 text-sm";
const LANGUAGE_NAMES = { en: "English", ar: "العربية" } as const;

export type Translation = { id: string; title: string } | null;

export function PageEditor({
  initial,
  fullAdmin = false,
  translation,
  publicPath,
}: {
  initial: PageInput;
  fullAdmin?: boolean;
  translation: Translation;
  publicPath: string | null;
}) {
  const withEditorKeys = (draft: PageInput) => ({
    ...draft,
    sections: draft.sections.map((section) => ({
      ...section,
      editorKey: section.editorKey ?? crypto.randomUUID(),
    })),
  });
  const [page, setPage] = useState<PageInput>(() => withEditorKeys(initial));
  const [conversions, setConversions] = useState<
    Map<SectionInput, SectionInput>
  >(new Map());
  const [open, setOpen] = useState<number | null>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const dir = page.language === "ar" ? "rtl" : "ltr";
  const other = page.language === "en" ? "ar" : "en";

  const update = (patch: Partial<PageInput>) => {
    setPage((p) => ({ ...p, ...patch }));
    setMessage("");
  };
  const setSections = (sections: SectionInput[]) => update({ sections });
  const move = (i: number, by: number) => {
    const next = [...page.sections];
    const [s] = next.splice(i, 1);
    next.splice(i + by, 0, s);
    setSections(next);
    const opened = open === null ? null : page.sections[open];
    setOpen(opened ? next.indexOf(opened) : null);
  };
  const add = (kind: SectionInput["kind"], at = page.sections.length) => {
    const next = [...page.sections];
    next.splice(at, 0, {
      id: null,
      editorKey: crypto.randomUUID(),
      kind,
      label:
        kind === "rich_text" ? "Text" : kind === "embed" ? "Embed" : "HTML",
      ...(kind === "embed"
        ? {
            options: {
              mode: "iframe",
              src: "",
              title: "",
              height: 450,
              allowFullscreen: true,
            },
          }
        : {}),
      html: kind === "rich_text" ? "<p></p>" : "",
    });
    setSections(next);
    setOpen(at);
  };

  function run(
    work: () => Promise<{ error: string } | { id: string } | void>,
    done?: (id?: string) => void,
  ) {
    start(async () => {
      try {
        const result = await work();
        if (result && "error" in result) return setMessage(result.error);
        done?.(result && "id" in result ? result.id : undefined);
      } catch {
        setMessage("Something went wrong. Please try again.");
      }
    });
  }

  const save = () =>
    run(
      () => savePage(page),
      (id) => {
        setMessage("Saved.");
        setConversions(new Map());
        try {
          localStorage.removeItem(draftKey);
        } catch {}
        if (!page.id && id) router.replace(`/admin/pages/${id}/`);
        else router.refresh();
      },
    );
  const draftKey = `fxem:page:${initial.id ?? `new-${initial.language}`}`;

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_320px]">
      <div className="min-w-0 space-y-4">
        <LocalDraft
          draftKey={draftKey}
          value={page}
          onRestore={(draft) => setPage(withEditorKeys(draft))}
        />
        <label className="block rounded-lg bg-white p-5 text-sm font-semibold">
          Title
          <input
            dir={dir}
            className={`${field} text-lg`}
            value={page.title}
            onChange={(e) => update({ title: e.target.value })}
          />
        </label>

        <div className="flex items-center justify-between">
          <h2 className="font-bold">Sections</h2>
          <div className="flex gap-2 text-sm">
            <button
              type="button"
              className="rounded bg-white px-3 py-1.5"
              onClick={() => add("rich_text")}
            >
              + Text section
            </button>
            <button
              type="button"
              className="rounded bg-white px-3 py-1.5"
              onClick={() => add("embed")}
            >
              + Embed
            </button>
            <button
              type="button"
              className="rounded bg-white px-3 py-1.5"
              onClick={() => add("html")}
            >
              + HTML section
            </button>
          </div>
        </div>
        {page.sections.length === 0 && (
          <p className="text-muted rounded-lg bg-white p-5 text-sm">
            This page has no sections yet. Add a text section to start writing.
          </p>
        )}
        <ol className="space-y-3">
          {page.sections.map((section, i) => (
            <li
              key={section.id ?? section.editorKey ?? `new-${i}`}
              className="rounded-lg bg-white"
            >
              <div className="flex flex-wrap items-center gap-2 p-3">
                <span className="text-muted w-6 text-xs">{i + 1}</span>
                <button
                  type="button"
                  className="min-w-0 flex-1 truncate text-left font-semibold"
                  dir="auto"
                  aria-expanded={open === i}
                  onClick={() => setOpen(open === i ? null : i)}
                >
                  {section.label || "Section"}
                </button>
                <span className="rounded bg-black/5 px-2 py-0.5 text-xs">
                  {section.kind === "rich_text"
                    ? "Text"
                    : section.kind === "embed"
                      ? "Embed"
                      : "Layout"}
                </span>
                <button
                  type="button"
                  aria-label="Move up"
                  disabled={i === 0}
                  className="px-1 disabled:opacity-30"
                  onClick={() => move(i, -1)}
                >
                  ↑
                </button>
                <button
                  type="button"
                  aria-label="Move down"
                  disabled={i === page.sections.length - 1}
                  className="px-1 disabled:opacity-30"
                  onClick={() => move(i, 1)}
                >
                  ↓
                </button>
                {section.kind === "html" && (
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => {
                      if (!fullAdmin && scriptSignature(section.html).length) {
                        setMessage(scriptGuardMessage(section.label));
                        return;
                      }
                      if (
                        !confirm(
                          "The section's text, headings, lists, links and images are kept; its design (columns, backgrounds, buttons styling) is replaced by plain formatted text. You can undo this until you save.",
                        )
                      )
                        return;
                      const converted: SectionInput = {
                        ...section,
                        kind: "rich_text",
                        html: convertToRichText(section.html, fullAdmin),
                      };
                      setConversions((previous) =>
                        new Map(previous).set(converted, section),
                      );
                      const next = [...page.sections];
                      next[i] = converted;
                      setSections(next);
                    }}
                  >
                    Convert to rich text
                  </button>
                )}
                {conversions.has(section) && (
                  <button
                    type="button"
                    className="text-xs underline"
                    onClick={() => {
                      const next = [...page.sections];
                      next[i] = conversions.get(section)!;
                      setSections(next);
                    }}
                  >
                    Undo convert
                  </button>
                )}
                <button
                  type="button"
                  className="text-xs underline"
                  onClick={() => {
                    const next = [...page.sections];
                    next.splice(i + 1, 0, {
                      ...section,
                      id: null,
                      editorKey: crypto.randomUUID(),
                      label: `${section.label} (copy)`,
                    });
                    setSections(next);
                  }}
                >
                  Duplicate
                </button>
                <button
                  type="button"
                  className="text-coral text-xs underline"
                  onClick={() => {
                    if (
                      !confirm(
                        "Remove this section? It is deleted when you save.",
                      )
                    )
                      return;
                    setSections(page.sections.filter((_, j) => j !== i));
                    setOpen(null);
                  }}
                >
                  Remove
                </button>
              </div>
              {open === i && (
                <div className="space-y-3 border-t border-black/10 p-4">
                  <label className="block text-xs font-semibold">
                    Section name (only shown here)
                    <input
                      className={field}
                      value={section.label}
                      onChange={(e) => {
                        const next = [...page.sections];
                        next[i] = { ...section, label: e.target.value };
                        if (conversions.has(section))
                          setConversions((old) =>
                            new Map(old).set(next[i], old.get(section)!),
                          );
                        setSections(next);
                      }}
                    />
                  </label>
                  <SectionEditor
                    section={section}
                    fullAdmin={fullAdmin}
                    dir={dir}
                    onChange={(s) => {
                      if (conversions.has(section))
                        setConversions((old) =>
                          new Map(old).set(s, old.get(section)!),
                        );
                      setPage((p) => {
                        const next = [...p.sections];
                        next[i] = s;
                        return { ...p, sections: next };
                      });
                      setMessage("");
                    }}
                  />
                </div>
              )}
            </li>
          ))}
        </ol>
      </div>

      <aside className="space-y-4 lg:sticky lg:top-6">
        <div className="space-y-3 rounded-lg bg-white p-5 text-sm">
          <p className="font-semibold">Language</p>
          <div className="flex gap-2">
            <span
              className="bg-ink rounded px-3 py-1 text-white"
              lang={page.language}
            >
              {LANGUAGE_NAMES[page.language]}
            </span>
            {translation ? (
              <Link
                href={`/admin/pages/${translation.id}/`}
                className="rounded bg-black/5 px-3 py-1"
                lang={other}
              >
                {LANGUAGE_NAMES[other]}
              </Link>
            ) : (
              <span className="text-muted px-1 py-1" lang={other}>
                {LANGUAGE_NAMES[other]}: missing
              </span>
            )}
          </div>
          {!translation && page.id && (
            <button
              type="button"
              disabled={pending}
              className="text-brand underline"
              onClick={() =>
                run(
                  () => createTranslation(page.id!),
                  (id) => id && router.push(`/admin/pages/${id}/`),
                )
              }
            >
              Create the {other === "ar" ? "Arabic" : "English"} version (copies
              this page as a draft)
            </button>
          )}
        </div>

        <div className="space-y-3 rounded-lg bg-white p-5 text-sm">
          <label className="block font-semibold">
            URL
            <span className="mt-1 flex items-center gap-1" dir="ltr">
              <span className="text-muted">/</span>
              <input
                className={field}
                value={page.path}
                disabled={
                  initial.id !== null &&
                  (initial.path === "" || initial.path === "ar")
                }
                onChange={(e) => update({ path: e.target.value })}
              />
              <span className="text-muted">/</span>
            </span>
          </label>
          <label className="block font-semibold">
            Status
            <select
              className={field}
              value={page.status}
              onChange={(e) =>
                update({ status: e.target.value as PageInput["status"] })
              }
            >
              <option value="published">Published</option>
              <option value="draft">Draft (hidden from visitors)</option>
            </select>
          </label>
          <button
            type="button"
            disabled={pending}
            onClick={save}
            className="cms-button w-full"
          >
            {pending ? "Saving…" : "Save"}
          </button>
          {message && (
            <p
              role="status"
              className={
                message === "Saved." ? "text-emerald-700" : "text-coral"
              }
            >
              {message}
            </p>
          )}
          <form
            method="post"
            action="/admin/pages/preview/"
            target="_blank"
            onSubmit={(e) => {
              const draft = e.currentTarget.elements.namedItem("draft");
              (draft as HTMLInputElement).value = JSON.stringify(page);
            }}
          >
            <input type="hidden" name="draft" />
            <button type="submit" className="border-brand text-brand hover:bg-brand/5 w-full rounded-lg border px-5 py-2.5 text-base leading-none font-semibold">
              Preview changes
            </button>
            <p className="mt-1 text-xs text-black/60">
              Shows your unsaved edits without publishing them. The preview
              runs the page’s scripts.
            </p>
          </form>
          <div className="flex flex-wrap gap-3">
            {page.id && (
              <a
                href={`/admin/pages/${page.id}/preview/`}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                Preview saved version
              </a>
            )}
            {publicPath && (
              <a
                href={publicPath}
                target="_blank"
                rel="noreferrer"
                className="underline"
              >
                View on site
              </a>
            )}
          </div>
        </div>

        <div className="space-y-3 rounded-lg bg-white p-5 text-sm">
          <p className="font-semibold">Search engines</p>
          <label className="block">
            SEO title
            <input
              dir={dir}
              className={field}
              value={page.seo.title ?? ""}
              placeholder={page.title}
              onChange={(e) =>
                update({ seo: { ...page.seo, title: e.target.value } })
              }
            />
            <span className="text-muted text-xs">
              {(page.seo.title ?? "").length}/60
            </span>
          </label>
          <label className="block">
            Meta description
            <textarea
              dir={dir}
              rows={4}
              className={field}
              value={page.seo.description ?? ""}
              onChange={(e) =>
                update({ seo: { ...page.seo, description: e.target.value } })
              }
            />
            <span className="text-muted text-xs">
              {(page.seo.description ?? "").length}/160
            </span>
          </label>
          <label className="flex items-center gap-2">
            <input
              type="checkbox"
              checked={Boolean(page.seo.noindex)}
              onChange={(e) =>
                update({ seo: { ...page.seo, noindex: e.target.checked } })
              }
            />
            Hide from search engines
          </label>
        </div>

        {fullAdmin && (
          <div className="space-y-3 rounded-lg bg-white p-5 text-sm">
            <p className="font-semibold">Custom code</p>
            <p className="text-muted text-xs">
              Runs on this page only, in this language.
            </p>
            {(
              [
                ["head", "In <head>"],
                ["bodyEnd", "Before </body>"],
              ] as const
            ).map(([key, label]) => (
              <label key={key} className="block">
                {label}
                <textarea
                  dir="ltr"
                  spellCheck={false}
                  rows={7}
                  className={`${field} font-mono text-xs`}
                  value={page.customCode?.[key] ?? ""}
                  onChange={(e) =>
                    update({
                      customCode: { ...page.customCode, [key]: e.target.value },
                    })
                  }
                />
              </label>
            ))}
          </div>
        )}

        {page.id && initial.path !== "" && initial.path !== "ar" && (
          <button
            type="button"
            className="text-coral text-sm underline"
            onClick={() => {
              if (!confirm("Delete this page? Its URL will stop working."))
                return;
              run(
                () => deletePage(page.id!),
                () => router.push(`/admin/pages/?lang=${page.language}`),
              );
            }}
          >
            Delete page
          </button>
        )}
      </aside>
    </div>
  );
}
