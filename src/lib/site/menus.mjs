// Menus stored in Supabase (menus + menu_items) rendered back into the theme's
// markup: the Max Mega Menu (desktop), Astra's mobile menu and the footer
// nav menus. Items keep their original attributes in `options`; label and URL
// are the editable fields.
//
// menu_items.options.kind:
//   item    a link. options.mega / options.mobile / options.nav hold the <li>
//           and <a> attributes for each rendering ({ li, a, after, sub }).
//   row     a mega menu grid row (desktop only)
//   column  a mega menu grid column (desktop only)
//   widget  mega menu widget: options.li attributes + options.html
import { load } from 'cheerio';

const escapeText = value => String(value).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;');
const escapeAttr = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;');
// Attribute lists are [name, value] pairs so the original order is kept.
export const attrs = entries => (entries || []).map(([k, v]) => ` ${k}="${escapeAttr(v)}"`).join('');
const withHref = (entries, url) => entries.map(([k, v]) => [k, k === 'href' ? url : v]);

export function tree(items) {
  const children = new Map();
  for (const item of [...items].sort((a, b) => a.position - b.position)) {
    const key = item.parent_id ?? null;
    if (!children.has(key)) children.set(key, []);
    children.get(key).push(item);
  }
  return id => children.get(id ?? null) ?? [];
}

// Desktop mega menu: the inner HTML of ul#mega-menu-primary.
export function renderMega(items) {
  const children = tree(items);
  const node = n => {
    const o = n.options;
    if (o.kind === 'widget') return `<li${attrs(o.li)}>${o.html}</li>`;
    const kids = children(n.id);
    const sub = kids.length ? `<ul${attrs(o.mega?.sub ?? o.sub)}>${kids.map(node).join('')}</ul>` : '';
    if (o.kind === 'row' || o.kind === 'column') return `<li${attrs(o.li)}>${sub}</li>`;
    return `<li${attrs(o.mega.li)}><a${attrs(withHref(o.mega.a, n.url))}>${escapeText(n.label)}${o.mega.after ?? ''}</a>${sub}</li>`;
  };
  return children(null).map(node).join('');
}

// Astra mobile menu: the inner HTML of ul#ast-hf-mobile-menu. It lists the
// same links in its own order (options.mobile.parent / options.mobile.position);
// links without options.mobile appear only on desktop.
export function renderMobile(items) {
  const links = items.filter(n => n.options.kind === 'item' && n.options.mobile);
  const kids = id => links.filter(n => (n.options.mobile.parent ?? null) === id).sort((a, b) => a.options.mobile.position - b.options.mobile.position);
  const node = n => {
    const o = n.options.mobile, sub = kids(n.id);
    const children = sub.length ? `${o.toggle ?? ''}<ul${attrs(o.sub)}>${sub.map(node).join('')}</ul>` : '';
    return `<li${attrs(o.li)}><a${attrs(withHref(o.a, n.url))}>${escapeText(n.label)}</a>${children}</li>`;
  };
  return kids(null).map(node).join('');
}

// A plain WordPress nav menu (footer widgets): the inner HTML of its <ul>.
export function renderNav(items) {
  const children = tree(items);
  const node = n => {
    const o = n.options.nav;
    const kids = children(n.id);
    const sub = kids.length ? `<ul${attrs(o.sub)}>${kids.map(node).join('')}</ul>` : '';
    return `<li${attrs(o.li)}><a${attrs(withHref(o.a, n.url))}>${escapeText(n.label)}</a>${sub}</li>`;
  };
  return children(null).map(node).join('');
}

// WordPress marks the menu item for the current page and its parents with
// extra classes; mega menu items use the same classes prefixed with "mega-".
// Site-relative path of a link, or null for links to other sites.
const normalizePath = href => {
  try {
    const url = new URL(href, 'https://sv.fxem.com');
    if (url.hostname !== 'sv.fxem.com') return null;
    const p = decodeURI(url.pathname);
    return p.endsWith('/') ? p : p + '/';
  } catch { return null; }
};

function addClasses($li, prefix, added) {
  const classes = ($li.attr('class') || '').split(/\s+/).filter(Boolean);
  const anchors = [`${prefix}menu-item-home`, `${prefix}menu-item-object-page`, `${prefix}menu-item-object-custom`, `${prefix}menu-item-object-post`, `${prefix}menu-item-object-category`];
  let at = -1;
  for (const anchor of anchors) { const i = classes.indexOf(anchor); if (i > at) at = i; }
  classes.splice(at + 1, 0, ...added.map(c => prefix + c));
  $li.attr('class', classes.join(' '));
}

export function markCurrent(html, path, wordpressId) {
  if (!path) return html;
  const $ = load(html, null, false);
  const target = normalizePath(path);
  const marked = new Set();
  $('li').each((_, li) => {
    const $li = $(li);
    const classes = ($li.attr('class') || '').split(/\s+/);
    const prefix = classes.includes('mega-menu-item') ? 'mega-' : classes.includes('menu-item') ? '' : null;
    if (prefix === null || classes.includes(`${prefix}menu-item-type-widget`)) return;
    const $a = $li.children('a').first();
    const href = $a.attr('href');
    if (!href || href === '#' || normalizePath(href) !== target) return;
    const page = classes.includes(`${prefix}menu-item-object-page`);
    addClasses($li, prefix, page ? ['current-menu-item', 'page_item', `page-item-${wordpressId}`, 'current_page_item'] : ['current-menu-item']);
    if (!prefix) {
      // aria-current goes right after href.
      const entries = Object.entries($a.attr());
      for (const key of Object.keys($a.attr())) $a.removeAttr(key);
      for (const [k, v] of entries) { $a.attr(k, v); if (k === 'href') $a.attr('aria-current', 'page'); }
    }
    marked.add(li);
    // Parents in the menu tree (skip mega menu rows/columns).
    let parent = $li.parent().closest('li');
    while (parent.length) {
      const pc = (parent.attr('class') || '').split(/\s+/);
      const isItem = pc.includes(`${prefix}menu-item`) && !pc.includes(`${prefix}menu-item-type-widget`);
      if (isItem && !marked.has(parent[0]) && !pc.includes(`${prefix}current-menu-ancestor`)) {
        const pageParent = pc.includes(`${prefix}menu-item-object-page`);
        addClasses(parent, prefix, pageParent ? ['current-menu-ancestor', 'current-menu-parent', 'current_page_parent', 'current_page_ancestor'] : ['current-menu-ancestor', 'current-menu-parent']);
      }
      parent = parent.parent().closest('li');
    }
  });
  return $.html();
}
