"use client";

import Link from "next/link";
import { useRouter } from "next/navigation";
import { useMemo, useState, useTransition } from "react";
import { SectionEditor } from "@/components/admin/section-editor";
import {
  applyLinkFields,
  columnSpan,
  newColumn,
  newLink,
  newRow,
  nextNumber,
  setColumnSpan,
  setDropdown,
} from "@/lib/admin/menu-items.mjs";
import {
  saveMenu,
  type MenuItemInput,
} from "@/app/(cms)/admin/(panel)/menus/actions";

const field =
  "mt-1 block w-full rounded border border-black/20 bg-white p-2 text-sm";

type PageOption = { id: string; path: string; title: string };

export function MenuEditor({
  menuId,
  primary,
  language,
  initial,
  pages,
}: {
  menuId: string;
  primary: boolean;
  language: "en" | "ar";
  initial: MenuItemInput[];
  pages: PageOption[];
}) {
  const [items, setItems] = useState(initial);
  const [open, setOpen] = useState<string | null>(null);
  const [message, setMessage] = useState("");
  const [pending, start] = useTransition();
  const router = useRouter();
  const dir = language === "ar" ? "rtl" : "ltr";
  const toggle = useMemo(
    () =>
      initial.find(
        (i) => (i.options.mobile as { toggle?: string } | null)?.toggle,
      )?.options.mobile as { toggle: string } | undefined,
    [initial],
  )?.toggle;

  const children = (id: string | null) =>
    items
      .filter((i) => (i.parent_id ?? null) === id)
      .sort((a, b) => a.position - b.position);
  const change = (next: MenuItemInput[]) => {
    setItems(next);
    setMessage("");
  };
  const update = (id: string, patch: Partial<MenuItemInput>) =>
    change(
      items.map((i) => {
        if (i.id !== id) return i;
        const next = { ...i, ...patch };
        return next.options.kind === "item"
          ? (applyLinkFields(next) as MenuItemInput)
          : next;
      }),
    );
  // Reorders siblings by rewriting their positions.
  const move = (item: MenuItemInput, by: number) => {
    const list = children(item.parent_id);
    const i = list.findIndex((s) => s.id === item.id);
    const target = list[i + by];
    if (!target) return;
    change(
      items.map((s) =>
        s.id === item.id
          ? { ...s, position: target.position }
          : s.id === target.id
            ? { ...s, position: item.position }
            : s,
      ),
    );
  };
  const descendants = (id: string): string[] =>
    items
      .filter((i) => i.parent_id === id)
      .flatMap((i) => [i.id, ...descendants(i.id)]);
  const remove = (item: MenuItemInput) => {
    const gone = new Set([item.id, ...descendants(item.id)]);
    let next = items.filter((i) => !gone.has(i.id));
    // A top-level link whose dropdown is now empty goes back to a plain link.
    next = next.map((i) =>
      i.parent_id === null &&
      i.options.kind === "item" &&
      !next.some((c) => c.parent_id === i.id)
        ? (setDropdown(i, false) as MenuItemInput)
        : i,
    );
    change(next);
  };
  const lastPosition = (parent: string | null) =>
    Math.max(
      -1,
      ...items
        .filter((i) => (i.parent_id ?? null) === parent)
        .map((i) => i.position),
    ) + 1;
  const addLink = (parent: string | null) => {
    const link = {
      ...newLink({
        id: crypto.randomUUID(),
        number: nextNumber(items),
        label: language === "ar" ? "رابط جديد" : "New link",
        url: "/",
        placement: !primary ? "nav" : parent ? "column" : "top",
        toggle,
      }),
      parent_id: parent,
      position: lastPosition(parent),
    } as MenuItemInput;
    change([...items, link]);
    setOpen(link.id);
  };
  const addColumn = (row: MenuItemInput) => {
    const top = items.find((i) => i.id === row.parent_id)!;
    const index = children(row.id).length;
    const column = newColumn({
      id: crypto.randomUUID(),
      parent: row.id,
      wpNumber: top.wp_id,
      rowIndex: row.position,
      index,
    }) as MenuItemInput;
    change([...items, { ...column, position: lastPosition(row.id) }]);
  };
  const addDropdown = (top: MenuItemInput) => {
    const row = newRow({
      id: crypto.randomUUID(),
      parent: top.id,
      wpNumber: top.wp_id,
      index: 0,
    }) as MenuItemInput;
    const column = newColumn({
      id: crypto.randomUUID(),
      parent: row.id,
      wpNumber: top.wp_id,
      rowIndex: 0,
      index: 0,
    }) as MenuItemInput;
    const link = {
      ...newLink({
        id: crypto.randomUUID(),
        number: nextNumber(items),
        label: language === "ar" ? "رابط جديد" : "New link",
        url: "/",
        placement: "column",
        toggle,
      }),
      parent_id: column.id,
      position: 0,
    } as MenuItemInput;
    change([
      ...items.map((i) =>
        i.id === top.id ? (setDropdown(i, true, toggle) as MenuItemInput) : i,
      ),
      row,
      column,
      link,
    ]);
    setOpen(link.id);
  };

  function save() {
    start(async () => {
      try {
        const result = await saveMenu(menuId, items);
        if (result?.error) return setMessage(result.error);
        setMessage("Saved. The site shows the new menu now.");
        router.refresh();
      } catch {
        setMessage("Could not save the menu. Please try again.");
      }
    });
  }

  const node = (item: MenuItemInput, depth: number): React.ReactNode => {
    const kind = item.options.kind;
    const kids = children(item.id);
    const isOpen = open === item.id;
    const list = children(item.parent_id);
    const index = list.findIndex((s) => s.id === item.id);
    return (
      <li
        key={item.id}
        className={depth ? "ml-5 border-l border-black/10 pl-3" : ""}
      >
        <div className="flex flex-wrap items-center gap-2 rounded bg-white p-2">
          <button
            type="button"
            className="min-w-0 flex-1 truncate text-left font-semibold"
            dir="auto"
            aria-expanded={isOpen}
            onClick={() => setOpen(isOpen ? null : item.id)}
          >
            {item.label || "(no label)"}
          </button>
          <span className="rounded bg-black/5 px-2 py-0.5 text-xs">
            {kind === "item"
              ? kids.length
                ? "Dropdown"
                : "Link"
              : kind === "widget"
                ? "Widget"
                : kind === "row"
                  ? "Row"
                  : "Column"}
          </span>
          {kind === "item" && (
            <span className="text-muted max-w-48 truncate text-xs" dir="ltr">
              {item.url}
            </span>
          )}
          <button
            type="button"
            aria-label="Move up"
            disabled={index === 0}
            className="px-1 disabled:opacity-30"
            onClick={() => move(item, -1)}
          >
            ↑
          </button>
          <button
            type="button"
            aria-label="Move down"
            disabled={index === list.length - 1}
            className="px-1 disabled:opacity-30"
            onClick={() => move(item, 1)}
          >
            ↓
          </button>
          <button
            type="button"
            className="text-coral text-xs underline"
            onClick={() => {
              if (
                kids.length &&
                !confirm("Remove this entry and everything inside it?")
              )
                return;
              remove(item);
            }}
          >
            Remove
          </button>
        </div>
        {isOpen && kind === "item" && (
          <div className="mt-1 grid gap-3 rounded bg-white p-3 text-sm sm:grid-cols-2">
            <label className="block font-semibold">
              Label
              <input
                dir={dir}
                className={field}
                value={item.label}
                onChange={(e) => update(item.id, { label: e.target.value })}
              />
            </label>
            <label className="block font-semibold">
              Links to
              <select
                className={field}
                value={item.page_id ?? ""}
                onChange={(e) => {
                  const page = pages.find((p) => p.id === e.target.value);
                  update(
                    item.id,
                    page
                      ? {
                          page_id: page.id,
                          url: `/${page.path}${page.path ? "/" : ""}`,
                        }
                      : { page_id: null },
                  );
                }}
              >
                <option value="">Custom URL</option>
                {pages.map((p) => (
                  <option key={p.id} value={p.id}>
                    {p.title} (/{p.path})
                  </option>
                ))}
              </select>
            </label>
            <label className="block font-semibold sm:col-span-2">
              URL
              <input
                dir="ltr"
                className={field}
                value={item.url}
                disabled={Boolean(item.page_id)}
                onChange={(e) =>
                  update(item.id, { url: e.target.value.trim() })
                }
              />
              <span className="text-muted text-xs font-normal">
                A site path such as /about-us/, # for a heading without a page,
                or a full https:// address.
              </span>
            </label>
            <label className="flex items-center gap-2">
              <input
                type="checkbox"
                checked={item.open_in_new_tab}
                onChange={(e) =>
                  update(item.id, { open_in_new_tab: e.target.checked })
                }
              />
              Open in a new tab
            </label>
          </div>
        )}
        {isOpen && kind === "widget" && (
          <div className="mt-1 space-y-3 rounded bg-white p-3 text-sm">
            <p className="text-muted text-xs">
              Desktop dropdown only. Edit its text, links and images.
            </p>
            <SectionEditor
              section={{
                id: item.id,
                kind: "html",
                label: item.label,
                html: String(item.options.html ?? ""),
              }}
              dir={dir}
              onChange={(s) =>
                update(item.id, { options: { ...item.options, html: s.html } })
              }
            />
          </div>
        )}
        {isOpen && kind === "column" && (
          <div className="mt-1 rounded bg-white p-3 text-sm">
            <label className="font-semibold">
              Width{" "}
              <select
                className="rounded border border-black/20 p-1"
                value={columnSpan(item)}
                onChange={(e) =>
                  change(
                    items.map((i) =>
                      i.id === item.id
                        ? (setColumnSpan(
                            i,
                            Number(e.target.value),
                          ) as MenuItemInput)
                        : i,
                    ),
                  )
                }
              >
                {[2, 3, 4, 6, 8, 9, 12].map((n) => (
                  <option key={n} value={n}>
                    {n}/12
                  </option>
                ))}
              </select>
            </label>
          </div>
        )}
        {kids.length > 0 && (
          <ul className="mt-1 space-y-1">
            {kids.map((k) => node(k, depth + 1))}
          </ul>
        )}
        {kind === "column" && (
          <button
            type="button"
            className="text-brand mt-1 ml-5 text-xs underline"
            onClick={() => addLink(item.id)}
          >
            + Link in this column
          </button>
        )}
        {kind === "row" && (
          <button
            type="button"
            className="text-brand mt-1 ml-5 text-xs underline"
            onClick={() => addColumn(item)}
          >
            + Column
          </button>
        )}
        {primary && kind === "item" && depth === 0 && kids.length === 0 && (
          <button
            type="button"
            className="text-brand mt-1 ml-5 text-xs underline"
            onClick={() => addDropdown(item)}
          >
            + Dropdown
          </button>
        )}
      </li>
    );
  };

  return (
    <div className="grid items-start gap-6 lg:grid-cols-[1fr_280px]">
      <div className="space-y-3">
        <ul className="space-y-2">{children(null).map((i) => node(i, 0))}</ul>
        <button
          type="button"
          className="rounded bg-white px-3 py-1.5 text-sm"
          onClick={() => addLink(null)}
        >
          + {primary ? "Top-level link" : "Link"}
        </button>
      </div>
      <aside className="space-y-3 rounded-lg bg-white p-5 text-sm lg:sticky lg:top-6">
        <button
          type="button"
          disabled={pending}
          onClick={save}
          className="cms-button w-full"
        >
          {pending ? "Saving…" : "Save menu"}
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
        {primary ? (
          <p className="text-muted text-xs">
            Dropdowns are laid out in rows and columns on desktop. The mobile
            menu lists the same links under each top-level item; widgets appear
            on desktop only.
          </p>
        ) : (
          <p className="text-muted text-xs">
            This menu appears in the footer. Place or move it in{" "}
            <Link
              href={`/admin/footer/?lang=${language}`}
              className="underline"
            >
              Footer
            </Link>
            .
          </p>
        )}
      </aside>
    </div>
  );
}
