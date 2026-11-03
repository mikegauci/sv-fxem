// Menu editing rules shared by the menu editor and its tests. Items keep the
// theme's original attributes in `options` (see src/lib/site/menus.mjs); new
// items and structural changes get attributes in the same patterns.

const classOf = (entries) =>
  (entries.find(([k]) => k === "class") ?? [, ""])[1];
const setAttr = (entries, name, value) => {
  const i = entries.findIndex(([k]) => k === name);
  if (i === -1) return [...entries, [name, value]];
  const next = [...entries];
  next[i] = [name, value];
  return next;
};
const withoutAttr = (entries, name) => entries.filter(([k]) => k !== name);
const classes = (entries, edit) =>
  setAttr(
    entries,
    "class",
    edit(classOf(entries).split(/\s+/).filter(Boolean)).join(" "),
  );

// Menu item numbers (the "N" in mega-menu-item-N / menu-item-N): imported
// items keep their WordPress IDs; new ones continue above the highest.
export function nextNumber(items) {
  return Math.max(900000, ...items.map((i) => Number(i.wp_id) || 0)) + 1;
}

const isSafeUrl = (url) =>
  /^(\/(?!\/)|#|https:\/\/|http:\/\/|mailto:|tel:)/.test(url);
export function checkItem(item) {
  if (item.options?.kind !== "item") return null;
  if (!item.label?.trim()) return "Every link needs a label.";
  if (item.label.length > 120)
    return `“${item.label.slice(0, 30)}…” is too long.`;
  if (!item.url || !isSafeUrl(item.url))
    return `“${item.label}” needs a link: a site path such as /about-us/, or a full https:// address.`;
  return null;
}

// A new link. placement: "top" (main menu bar), "column" (inside a dropdown
// column), "nav" (footer menus).
export function newLink({ id, number, label, url, placement, toggle }) {
  const link = {
    id,
    wp_id: number,
    label,
    url,
    page_id: null,
    open_in_new_tab: false,
    css_classes: "",
    parent_id: null,
    position: 0,
  };
  const mobileLi = [
    ["id", `menu-item-${number}`],
    [
      "class",
      `menu-item menu-item-type-custom menu-item-object-custom menu-item-${number}`,
    ],
  ];
  const mobileA = [
    ["href", url],
    ["class", "menu-link"],
  ];
  if (placement === "nav")
    return {
      ...link,
      options: { kind: "item", nav: { li: mobileLi, a: mobileA, sub: null } },
    };
  const mega =
    placement === "top"
      ? {
          li: [
            [
              "class",
              `mega-menu-item mega-menu-item-type-custom mega-menu-item-object-custom mega-align-bottom-left mega-menu-flyout mega-menu-item-${number}`,
            ],
            ["id", `mega-menu-item-${number}`],
          ],
          a: [
            ["class", "mega-menu-link"],
            ["href", url],
            ["tabindex", "0"],
          ],
          after: "",
          sub: null,
        }
      : {
          li: [
            [
              "class",
              `mega-menu-item mega-menu-item-type-custom mega-menu-item-object-custom mega-has-icon mega-icon-left mega-menu-item-${number}`,
            ],
            ["id", `mega-menu-item-${number}`],
          ],
          a: [
            ["class", "dashicons-arrow-right-alt2 mega-menu-link"],
            ["href", url],
          ],
          after: "",
          sub: null,
        };
  return {
    ...link,
    options: {
      kind: "item",
      mega,
      mobile: {
        parent: null,
        position: 0,
        li: mobileLi,
        a: mobileA,
        toggle: toggle ?? null,
        sub: null,
      },
    },
  };
}

// Dropdown grid parts for a top-level item (mega menu rows and columns).
export function newRow({ id, parent, wpNumber, index }) {
  return {
    id,
    parent_id: parent,
    position: index,
    label: "Row",
    url: "",
    wp_id: null,
    page_id: null,
    open_in_new_tab: false,
    css_classes: "",
    options: {
      kind: "row",
      li: [
        ["class", "mega-menu-row"],
        ["id", `mega-menu-${wpNumber}-${index}`],
      ],
      sub: [["class", "mega-sub-menu"]],
    },
  };
}
export function newColumn({ id, parent, wpNumber, rowIndex, index, span = 3 }) {
  return {
    id,
    parent_id: parent,
    position: index,
    label: `Column (${span}/12)`,
    url: "",
    wp_id: null,
    page_id: null,
    open_in_new_tab: false,
    css_classes: "",
    options: {
      kind: "column",
      li: [
        ["class", `mega-menu-column mega-menu-columns-${span}-of-12`],
        ["id", `mega-menu-${wpNumber}-${rowIndex}-${index}`],
      ],
      sub: [["class", "mega-sub-menu"]],
    },
  };
}
export function setColumnSpan(column, span) {
  const li = classes(column.options.li, (list) =>
    list.map((c) =>
      /^mega-menu-columns-\d+-of-12$/.test(c)
        ? `mega-menu-columns-${span}-of-12`
        : c,
    ),
  );
  return {
    ...column,
    label: `Column (${span}/12)`,
    options: { ...column.options, li },
  };
}
export const columnSpan = (column) =>
  Number(
    classOf(column.options.li).match(/mega-menu-columns-(\d+)-of-12/)?.[1] ?? 3,
  );

// Turns a plain top-level link into a dropdown (or back), as Max Mega Menu
// and Astra mark items that have children.
export function setDropdown(item, on, toggle) {
  const o = item.options;
  if (!o.mega) return item;
  const has = classOf(o.mega.li)
    .split(/\s+/)
    .includes("mega-menu-item-has-children");
  if (has === on) return item;
  const megaLi = classes(o.mega.li, (list) =>
    on
      ? list.flatMap((c) =>
          c === "mega-menu-flyout"
            ? []
            : c.startsWith("mega-align-")
              ? [
                  "mega-menu-item-has-children",
                  "mega-menu-megamenu",
                  c,
                  "mega-menu-grid",
                ]
              : [c],
        )
      : list.flatMap((c) =>
          ["mega-menu-item-has-children", "mega-menu-megamenu"].includes(c)
            ? []
            : c === "mega-menu-grid"
              ? ["mega-menu-flyout"]
              : [c],
        ),
  );
  let megaA = withoutAttr(
    withoutAttr(o.mega.a, "aria-haspopup"),
    "aria-expanded",
  );
  if (on) {
    const t = megaA.findIndex(([k]) => k === "tabindex");
    megaA.splice(
      t === -1 ? megaA.length : t,
      0,
      ["aria-haspopup", "true"],
      ["aria-expanded", "false"],
    );
  }
  const mobileLi =
    o.mobile &&
    classes(o.mobile.li, (list) => {
      const rest = list.filter((c) => c !== "menu-item-has-children");
      if (!on) return rest;
      rest.splice(rest.length - 1, 0, "menu-item-has-children");
      return rest;
    });
  return {
    ...item,
    options: {
      ...o,
      mega: {
        ...o.mega,
        li: megaLi,
        a: megaA,
        after: on ? '<span class="mega-indicator"></span>' : "",
        sub: on ? [["class", "mega-sub-menu"]] : null,
      },
      mobile: o.mobile && {
        ...o.mobile,
        li: mobileLi,
        toggle: on ? (o.mobile.toggle ?? toggle ?? null) : null,
        sub: on ? [["class", "sub-menu"]] : null,
      },
    },
  };
}

// The mobile menu lists each top-level link's dropdown links. Existing links
// keep their mobile order; links that are new or moved to another dropdown
// follow in desktop order.
export function syncMobile(items) {
  const byId = new Map(items.map((i) => [i.id, i]));
  const kids = (id) =>
    items
      .filter((i) => (i.parent_id ?? null) === id)
      .sort((a, b) => a.position - b.position);
  const linksUnder = (id) =>
    kids(id).flatMap((n) =>
      n.options.kind === "item"
        ? [n]
        : n.options.kind === "widget"
          ? []
          : linksUnder(n.id),
    );
  const out = new Map(items.map((i) => [i.id, i]));
  for (const top of kids(null).filter((i) => i.options.kind === "item")) {
    out.set(top.id, {
      ...top,
      options: {
        ...top.options,
        mobile: top.options.mobile && {
          ...top.options.mobile,
          parent: null,
          position: kids(null).indexOf(top),
        },
      },
    });
    const links = linksUnder(top.id).filter((l) => l.options.mobile);
    const kept = links
      .filter((l) => l.options.mobile.parent === top.id)
      .sort((a, b) => a.options.mobile.position - b.options.mobile.position);
    const added = links.filter((l) => l.options.mobile.parent !== top.id);
    [...kept, ...added].forEach((l, position) =>
      out.set(l.id, {
        ...byId.get(l.id),
        options: {
          ...l.options,
          mobile: { ...l.options.mobile, parent: top.id, position },
        },
      }),
    );
  }
  return items.map((i) => out.get(i.id));
}

// Keeps a link's markup in step with its editable fields.
export function applyLinkFields(item) {
  const o = item.options;
  // Only touch target/rel when the setting changes, so imported markup stays as it was.
  const target = (entries, blank) => {
    if (entries.some(([k, v]) => k === "target" && v === "_blank") === blank)
      return entries;
    return blank
      ? setAttr(setAttr(entries, "target", "_blank"), "rel", "noopener")
      : withoutAttr(withoutAttr(entries, "target"), "rel");
  };
  const fix = (part) =>
    part && {
      ...part,
      a: target(setAttr(part.a, "href", item.url), item.open_in_new_tab),
    };
  return {
    ...item,
    options: {
      ...o,
      mega: fix(o.mega),
      mobile: fix(o.mobile),
      nav: fix(o.nav),
    },
  };
}
