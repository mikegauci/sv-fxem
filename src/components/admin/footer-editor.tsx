"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import { SectionEditor } from "@/components/admin/section-editor";
import {
  saveFooter,
  type FooterWidgetInput,
} from "@/app/(cms)/admin/(panel)/menus/actions";

type MenuOption = { id: string; name: string };

// Footer areas as laid out by the theme: four widget columns, two text
// blocks below them, and the copyright line.
const AREAS = [
  { area: "above", columns: [1, 2, 3, 4], title: "Footer columns" },
  { area: "primary", columns: [1, 2], title: "Disclaimers" },
  { area: "below", columns: [1], title: "Copyright line" },
] as const;

const KIND_NAMES: Record<string, string> = {
  image: "Image",
  text: "Text",
  heading: "Heading",
  menu: "Menu",
  news: "News feed",
  html: "Text",
};

export function FooterEditor({
  language,
  initial,
  menus,
}: {
  language: "en" | "ar";
  initial: FooterWidgetInput[];
  menus: MenuOption[];
}) {
  const [widgets, setWidgets] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const dir = language === "ar" ? "rtl" : "ltr";

  const areaOf = (w: FooterWidgetInput) => w.options.area ?? "above";
  const slot = (area: string, column: number) =>
    widgets
      .filter((w) => areaOf(w) === area && w.column_index === column)
      .sort((a, b) => a.position - b.position);
  const change = (next: FooterWidgetInput[]) => {
    setWidgets(next);
    setMessage("");
  };
  const patch = (id: string, p: Partial<FooterWidgetInput>) =>
    change(widgets.map((w) => (w.id === id ? { ...w, ...p } : w)));
  const move = (w: FooterWidgetInput, by: number) => {
    const list = slot(areaOf(w), w.column_index);
    const target = list[list.findIndex((s) => s.id === w.id) + by];
    if (!target) return;
    change(
      widgets.map((s) =>
        s.id === w.id
          ? { ...s, position: target.position }
          : s.id === target.id
            ? { ...s, position: w.position }
            : s,
      ),
    );
  };
  const toColumn = (w: FooterWidgetInput, column: number) =>
    patch(w.id, {
      column_index: column,
      position:
        Math.max(-1, ...slot("above", column).map((s) => s.position)) + 1,
    });
  // New menu blocks reuse the markup of an existing one.
  const menuTemplate = initial.find((w) => w.kind === "menu")?.html;
  const add = (column: number, kind: "text" | "menu") => {
    const id = crypto.randomUUID();
    const html =
      kind === "menu" && menuTemplate
        ? menuTemplate.replace(
            /id="nav_menu-\d+"/,
            `id="nav_menu-${id.slice(0, 8)}"`,
          )
        : `<section class="widget widget_block"><p>${language === "ar" ? "نص جديد" : "New text"}</p></section>`;
    change([
      ...widgets,
      {
        id,
        column_index: column,
        position:
          Math.max(-1, ...slot("above", column).map((s) => s.position)) + 1,
        kind,
        title:
          kind === "menu" ? "Menu" : language === "ar" ? "نص جديد" : "New text",
        html,
        menu_id: kind === "menu" ? (menus[0]?.id ?? null) : null,
        options: { area: "above" },
      },
    ]);
    setOpen(id);
  };

  function save() {
    start(async () => {
      try {
        const result = await saveFooter(language, widgets);
        if (result?.error) return setMessage(result.error);
        setMessage("Saved. The site shows the new footer now.");
        router.refresh();
      } catch {
        setMessage("Could not save the footer. Please try again.");
      }
    });
  }

  const block = (w: FooterWidgetInput) => {
    const list = slot(areaOf(w), w.column_index);
    const index = list.findIndex((s) => s.id === w.id);
    const isOpen = open === w.id;
    return (
      <li key={w.id} className="rounded border border-black/10 bg-white">
        <div className="flex flex-wrap items-center gap-1 p-2 text-sm">
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left font-semibold"
            dir="auto"
            onClick={() => setOpen(isOpen ? null : w.id)}
          >
            {w.title || KIND_NAMES[w.kind]}
          </button>
          <span className="rounded bg-black/5 px-1.5 text-[11px]">
            {KIND_NAMES[w.kind]}
          </span>
          <button
            type="button"
            aria-label="Move up"
            disabled={index === 0}
            className="px-1 disabled:opacity-30"
            onClick={() => move(w, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Move down"
            disabled={index === list.length - 1}
            className="px-1 disabled:opacity-30"
            onClick={() => move(w, 1)}
          >
            ↓
          </button>
        </div>
        {isOpen && (
          <div className="space-y-3 border-t border-black/10 p-3 text-sm">
            <label className="block text-xs font-semibold">
              Name (only shown here)
              <input
                className="mt-1 block w-full rounded border border-black/20 p-2"
                value={w.title}
                onChange={(e) => patch(w.id, { title: e.target.value })}
              />
            </label>
            {areaOf(w) === "above" && (
              <label className="block text-xs font-semibold">
                Column{" "}
                <select
                  className="rounded border border-black/20 p-1"
                  value={w.column_index}
                  onChange={(e) => toColumn(w, Number(e.target.value))}
                >
                  {[1, 2, 3, 4].map((n) => (
                    <option key={n} value={n}>
                      {n}
                    </option>
                  ))}
                </select>
              </label>
            )}
            {w.kind === "menu" ? (
              <div className="space-y-2">
                <label className="block text-xs font-semibold">
                  Menu shown here
                  <select
                    className="mt-1 block w-full rounded border border-black/20 p-2"
                    value={w.menu_id ?? ""}
                    onChange={(e) =>
                      patch(w.id, { menu_id: e.target.value || null })
                    }
                  >
                    {menus.map((m) => (
                      <option key={m.id} value={m.id}>
                        {m.name}
                      </option>
                    ))}
                  </select>
                </label>
                {w.menu_id && (
                  <Link
                    href={`/admin/menus/${w.menu_id}/`}
                    className="text-brand text-xs underline"
                  >
                    Edit this menu’s links
                  </Link>
                )}
              </div>
            ) : w.kind === "news" ? (
              <p className="text-muted text-xs">
                Shows the latest CNBC finance headlines automatically.
              </p>
            ) : (
              <SectionEditor
                section={{
                  id: w.id,
                  kind: "html",
                  label: w.title,
                  html: w.html,
                }}
                dir={dir}
                onChange={(s) => patch(w.id, { html: s.html })}
              />
            )}
            {areaOf(w) === "above" && (
              <button
                type="button"
                className="text-coral text-xs underline"
                onClick={() =>
                  confirm("Remove this footer block?") &&
                  change(widgets.filter((x) => x.id !== w.id))
                }
              >
                Remove block
              </button>
            )}
          </div>
        )}
      </li>
    );
  };

  return (
    <div className="space-y-6">
      {AREAS.map(({ area, columns, title }) => (
        <section key={area}>
          <h2 className="mb-2 font-bold">{title}</h2>
          <div
            className={`grid gap-3 ${columns.length === 4 ? "md:grid-cols-4" : columns.length === 2 ? "md:grid-cols-2" : ""}`}
          >
            {columns.map((column) => (
              <div key={column} className="rounded-lg bg-[#ebedf0] p-2">
                {columns.length > 1 && (
                  <p className="text-muted mb-2 text-xs font-semibold">
                    Column {column}
                  </p>
                )}
                <ul className="space-y-2">{slot(area, column).map(block)}</ul>
                {area === "above" && (
                  <div className="mt-2 flex gap-3 text-xs">
                    <button
                      type="button"
                      className="text-brand underline"
                      onClick={() => add(column, "text")}
                    >
                      + Text
                    </button>
                    {menuTemplate && (
                      <button
                        type="button"
                        className="text-brand underline"
                        onClick={() => add(column, "menu")}
                      >
                        + Menu
                      </button>
                    )}
                  </div>
                )}
              </div>
            ))}
          </div>
        </section>
      ))}
      <div className="flex items-center gap-4">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="cms-button"
        >
          {pending ? "Saving…" : "Save footer"}
        </button>
        {message && (
          <p
            role="status"
            className={
              message.startsWith("Saved") ? "text-emerald-700" : "text-coral"
            }
          >
            {message}
          </p>
        )}
      </div>
    </div>
  );
}
