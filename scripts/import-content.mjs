// Imports the site content from the page snapshots into Supabase: pages and
// their sections, categories, the header/footer menus, footer widgets, the
// per-language theme templates and the image library.
//
// Every page is rebuilt from the extracted rows and compared with its
// snapshot before anything is written. Without --apply it only checks.
//   node --env-file=.env.local scripts/import-content.mjs [--apply]
import crypto from 'node:crypto';
import fs from 'node:fs';
import path from 'node:path';
import { load } from 'cheerio';
import { parseDocument } from 'htmlparser2';
import { createClient } from '@supabase/supabase-js';
import { routes, snapshot, wordpressId } from '../src/lib/site/snapshots.mjs';
import { baseOf, languageOf, details, alternates, pathOf } from '../src/lib/seo/site.mjs';
import { ALT_AR, ALT_EN, HOME_MARK, renderContent, renderFooter, renderHeader, sameMarkup, firstDifference } from '../src/lib/site/chrome.mjs';

const apply = process.argv.includes('--apply');
const uuid = () => crypto.randomUUID();
const entries = el => Object.entries(el.attribs || {});
const problems = [];

// ------------------------------------------------------------ header / menus

// Neutral pages: nothing in their menus is marked as the current page.
const neutral = { en: snapshot('products'), ar: snapshot('ar/products') };

function labelParts($, $a) {
  const nodes = $a.contents().toArray();
  const first = nodes.findIndex(n => n.type !== 'text');
  const textNodes = first === -1 ? nodes : nodes.slice(0, first);
  const rest = first === -1 ? [] : nodes.slice(first);
  return { label: textNodes.map(n => n.data).join('').trim(), after: rest.map(n => $.html(n)).join('') };
}

function extractHeader(language) {
  const $ = load(neutral[language].header, null, false);
  const items = [];
  const byWpId = new Map();
  const megaNode = (li, parentId, position) => {
    const $li = $(li), classes = ($li.attr('class') || '').split(/\s+/), id = uuid();
    const $sub = $li.children('ul').first();
    const sub = $sub.length ? entries($sub[0]) : null;
    let row;
    if (classes.includes('mega-menu-row') || classes.includes('mega-menu-column')) {
      const kind = classes.includes('mega-menu-row') ? 'row' : 'column';
      row = { id, parent_id: parentId, position, label: kind === 'row' ? 'Row' : `Column (${(classes.find(c => /^mega-menu-columns-/.test(c)) || '').replace('mega-menu-columns-', '').replace('-of-', '/')})`, url: '', options: { kind, li: entries(li), sub } };
    } else if (classes.includes('mega-menu-item-type-widget')) {
      const title = $li.find('.mega-block-title').first().text().trim();
      const type = (classes.find(c => /^widget_/.test(c)) || 'widget').replace('widget_', '');
      row = { id, parent_id: parentId, position, label: title || `Widget (${type.replace('_', ' ')})`, url: '', options: { kind: 'widget', widget: type, li: entries(li), html: $li.html() } };
    } else {
      const $a = $li.children('a').first();
      const { label, after } = labelParts($, $a);
      const wpId = Number(($li.attr('id') || '').match(/(\d+)$/)?.[1]) || null;
      row = { id, wp_id: wpId, parent_id: parentId, position, label, url: $a.attr('href') ?? '', open_in_new_tab: $a.attr('target') === '_blank', options: { kind: 'item', mega: { li: entries(li), a: entries($a[0]), after, sub }, mobile: null } };
      if (wpId) byWpId.set(wpId, row);
    }
    items.push(row);
    $sub.children('li').each((i, child) => megaNode(child, id, i));
  };
  const $mega = $('ul#mega-menu-primary');
  $mega.children('li').each((i, li) => megaNode(li, null, i));
  // Mobile menu: same links, matched by WordPress menu item ID.
  const mobileNode = (li, parent, position) => {
    const $li = $(li), $a = $li.children('a').first();
    const wpId = Number(($li.attr('id') || '').match(/(\d+)$/)?.[1]);
    const row = byWpId.get(wpId);
    if (!row) { problems.push(`${language} mobile menu item ${wpId} has no desktop item`); return; }
    if ($a.text().trim() !== row.label || $a.attr('href') !== row.url) problems.push(`${language} mobile menu item ${wpId} differs from desktop: ${$a.text().trim()}`);
    const $sub = $li.children('ul').first();
    row.options.mobile = { parent, position, li: entries(li), a: entries($a[0]), toggle: $li.children('button').length ? $.html($li.children('button').first()) : null, sub: $sub.length ? entries($sub[0]) : null };
    $sub.children('li').each((i, child) => mobileNode(child, row.id, i));
  };
  const $mobile = $('ul#ast-hf-mobile-menu');
  $mobile.children('li').each((i, li) => mobileNode(li, null, i));
  $mega.html('<!--fxem:mega-->');
  $mobile.html('<!--fxem:mobile-->');
  $('.wpml-ls-item-en > a').attr('href', ALT_EN);
  $('.wpml-ls-item-ar > a').attr('href', ALT_AR);
  $('a.custom-logo-link').removeAttr('aria-current').attr(HOME_MARK, '');
  return { template: $.html(), items };
}

// ------------------------------------------------------------ footer

function extractFooter(language) {
  const $ = load(neutral[language].footer, null, false);
  const widgets = [], menus = [];
  $('.site-above-footer-wrap .site-footer-section').each((_, section) => {
    const column = Number(($(section).attr('class').match(/site-footer-section-(\d)/) || [])[1]);
    const $inner = $(section).find('.footer-widget-area-inner').first();
    $inner.children().each((position, widget) => {
      const $w = $(widget), classes = $w.attr('class') || '';
      const row = { id: uuid(), language, column_index: column, position, title: '', menu_id: null, options: { area: 'above' } };
      if (classes.includes('widget_nav_menu')) {
        const $ul = $w.find('ul.menu').first();
        const menu = { id: uuid(), language, location: 'footer-' + $ul.attr('id').replace(/^menu-/, ''), name: '', items: [] };
        const navNode = (li, parentId, i) => {
          const $li = $(li), $a = $li.children('a').first(), id = uuid();
          const $sub = $li.children('ul').first();
          menu.items.push({ id, wp_id: Number(($li.attr('id') || '').match(/(\d+)$/)?.[1]) || null, parent_id: parentId, position: i, label: $a.text().trim(), url: $a.attr('href') ?? '', open_in_new_tab: $a.attr('target') === '_blank', options: { kind: 'item', nav: { li: entries(li), a: entries($a[0]), sub: $sub.length ? entries($sub[0]) : null } } });
          $sub.children('li').each((j, child) => navNode(child, id, j));
        };
        $ul.children('li').each((i, li) => navNode(li, null, i));
        $ul.html('<!--fxem:nav-->');
        Object.assign(row, { kind: 'menu', menu_id: menu.id, html: $.html($w) });
        menus.push(menu);
      } else if (classes.includes('widget_rss')) Object.assign(row, { kind: 'news', title: 'News feed', html: $.html($w) });
      else if (classes.includes('widget_media_image')) Object.assign(row, { kind: 'image', title: 'Logo', html: $.html($w) });
      else if ($w.find('h1,h2,h3,h4').length && !$w.find('p').length) Object.assign(row, { kind: 'heading', title: $w.text().trim(), html: $.html($w) });
      else Object.assign(row, { kind: 'text', title: $w.text().trim().slice(0, 60), html: $.html($w) });
      widgets.push(row);
    });
    $inner.html(`<!--fxem:footer:above:${column}-->`);
  });
  $('.site-primary-footer-wrap .ast-builder-html-element').each((i, el) => {
    widgets.push({ id: uuid(), language, column_index: i + 1, position: 0, kind: 'html', title: $(el).text().trim().slice(0, 60), html: $(el).html(), menu_id: null, options: { area: 'primary' } });
    $(el).html(`<!--fxem:footer:primary:${i + 1}-->`);
  });
  const $copyright = $('.site-below-footer-wrap div.ast-footer-copyright div.ast-footer-copyright').first().length ? $('.site-below-footer-wrap div.ast-footer-copyright div.ast-footer-copyright').first() : $('.site-below-footer-wrap div.ast-footer-copyright').last();
  widgets.push({ id: uuid(), language, column_index: 1, position: 0, kind: 'text', title: 'Copyright', html: $copyright.html(), menu_id: null, options: { area: 'below' } });
  $copyright.html('<!--fxem:footer:below:1-->');
  for (const menu of menus) menu.name = 'Footer: ' + menu.location.replace(/^footer-/, '').replace(/-ar$/, '').replace(/-/g, ' ');
  return { template: $.html(), widgets, menus };
}

// ------------------------------------------------------------ pages

const sectionLabel = html => {
  const $ = load(html, null, false);
  const heading = $('h1,h2,h3,h4').first().text().replace(/\s+/g, ' ').trim();
  if (heading) return heading.slice(0, 80);
  const first = $.root().children().first();
  const cls = (first.attr('class') || '').split(/\s+/).find(c => /^wp-block-|^uagb-/.test(c)) || first.prop('tagName')?.toLowerCase() || 'Section';
  return cls.replace(/^wp-block-/, '').replace(/[-_]/g, ' ');
};

function splitContent(content) {
  const doc = parseDocument(content, { withStartIndices: true, withEndIndices: true });
  let entry = null;
  const find = node => { for (const c of node.children || []) { if (entry) return; if (c.type === 'tag' && (c.attribs.class || '').split(/\s+/).includes('entry-content')) { entry = c; return; } find(c); } };
  find(doc);
  if (!entry || !entry.children.length) return { shell: '<!--fxem:sections-->', sections: [{ html: content }] };
  const kids = entry.children;
  const innerStart = kids[0].startIndex, innerEnd = kids.at(-1).endIndex + 1;
  const starts = kids.filter(k => k.type === 'tag' || k.type === 'script' || k.type === 'style').map(k => k.startIndex);
  const cuts = [innerStart, ...starts.filter(s => s > innerStart), innerEnd];
  const sections = [];
  for (let i = 0; i < cuts.length - 1; i++) sections.push({ html: content.slice(cuts[i], cuts[i + 1]) });
  // Attach whitespace-only pieces to the previous section (leading ones to the next).
  const merged = [];
  let lead = '';
  for (const s of sections) {
    if (!s.html.trim()) { if (merged.length) merged.at(-1).html += s.html; else lead += s.html; }
    else { merged.push({ html: lead + s.html }); lead = ''; }
  }
  if (lead) merged.length ? (merged.at(-1).html += lead) : merged.push({ html: lead });
  return { shell: content.slice(0, innerStart) + '<!--fxem:sections-->' + content.slice(innerEnd), sections: merged };
}

const header = { en: extractHeader('en'), ar: extractHeader('ar') };
const footer = { en: extractFooter('en'), ar: extractFooter('ar') };
const inventory = routes();
const translationIds = new Map();
const pages = [], sections = [], categories = new Map(), pageCategories = [];

for (const route of inventory) {
  const source = snapshot(route.slug), language = languageOf(route.slug);
  const id = uuid();
  const base = baseOf(route.slug);
  if (!translationIds.has(base)) translationIds.set(base, uuid());
  const { title, description } = details(route);
  const { shell, sections: parts } = splitContent(source.content);
  if (renderContent(shell, parts.map((s, i) => ({ ...s, position: i }))) !== source.content) problems.push(`/${route.slug}: sections do not rebuild the content`);
  const $ = load(source.content);
  const wpId = Number(wordpressId(source)) || null;
  pages.push({
    id, wp_id: wpId, language, translation_id: translationIds.get(base), path: route.slug,
    title: source.title.replace(/\s*[–|]\s*FXEM\s*$/, '').trim() || title, kind: route.kind, status: 'published',
    seo: { title, description },
    layout: {
      // Attribute lists as [name, value] pairs: jsonb does not keep object key order.
      head: source.head, htmlAttributes: Object.entries(source.htmlAttributes || {}), bodyAttributes: Object.entries(source.bodyAttributes || {}), scripts: source.scripts,
      skipLink: source.skipLink, standalone: Boolean(source.standalone), contentShell: shell, sourceUrl: source.sourceUrl ?? null,
      alternates: { en: null, ar: null, ...Object.fromEntries(alternates(route, inventory).map(a => [a.language, decodeURI(new URL(a.url).pathname)])) },
      wpmlTouch: (source.header || '').includes('wpml-ls-touch-device'),
      ...(source.currentdesk ? { currentdesk: source.currentdesk } : {}), ...(source.contact ? { contact: true } : {}),
    },
    author_name: route.kind === 'post' ? $('.entry-meta .author a, .entry-meta .author-name').first().text().trim() || null : null,
  });
  parts.forEach((s, position) => sections.push({ id: uuid(), page_id: id, position, kind: 'html', label: sectionLabel(s.html), html: s.html }));
  if (route.kind === 'post') {
    $('a[rel~="category"]').each((_, a) => {
      const href = decodeURI($(a).attr('href')), slug = href.replace(/^\/(ar\/)?category\//, '').replace(/\/$/, '');
      const key = `${language}:${slug}`;
      if (!categories.has(key)) categories.set(key, { id: uuid(), language, slug, name: $(a).text().trim(), base: baseOf(href.replace(/^\/|\/$/g, '')) });
      if (!pageCategories.some(pc => pc.page_id === id && pc.category_id === categories.get(key).id)) pageCategories.push({ page_id: id, category_id: categories.get(key).id });
    });
  }
}
const categoryTranslation = new Map();
for (const c of categories.values()) { if (!categoryTranslation.has(c.base)) categoryTranslation.set(c.base, uuid()); c.translation_id = categoryTranslation.get(c.base); delete c.base; }

// ------------------------------------------------------------ round trip

const footerMenus = language => new Map(footer[language].menus.map(m => [m.id, m.items]));
for (const route of inventory) {
  const source = snapshot(route.slug);
  if (source.standalone) continue;
  const language = languageOf(route.slug), page = pages.find(p => p.path === route.slug);
  const context = { path: pathOf(route.slug), wordpressId: page.wp_id, alternates: page.layout.alternates, home: route.slug === '' || route.slug === 'ar', touch: page.layout.wpmlTouch };
  const h = renderHeader(header[language].template, header[language].items, context);
  if (!sameMarkup(h, source.header)) problems.push(`/${route.slug}: header differs ${firstDifference(source.header, h)}`);
  const f = renderFooter(footer[language].template, footer[language].widgets, footerMenus(language), context);
  if (!sameMarkup(f, source.footer)) problems.push(`/${route.slug}: footer differs ${firstDifference(source.footer, f)}`);
}

// ------------------------------------------------------------ media

const imageSize = file => {
  const b = fs.readFileSync(file);
  if (b.slice(1, 4).toString() === 'PNG') return { width: b.readUInt32BE(16), height: b.readUInt32BE(20) };
  if (b.slice(0, 3).toString() === 'GIF') return { width: b.readUInt16LE(6), height: b.readUInt16LE(8) };
  if (b.slice(8, 12).toString() === 'WEBP') { const c = b.slice(12, 16).toString(); if (c === 'VP8X') return { width: 1 + b.readUIntLE(24, 3), height: 1 + b.readUIntLE(27, 3) }; if (c === 'VP8L') { const bits = b.readUInt32LE(21); return { width: (bits & 0x3fff) + 1, height: ((bits >> 14) & 0x3fff) + 1 }; } return { width: b.readUInt16LE(26) & 0x3fff, height: b.readUInt16LE(28) & 0x3fff }; }
  if (b[0] === 0xff && b[1] === 0xd8) { let i = 2; while (i < b.length) { const marker = b[i + 1], len = b.readUInt16BE(i + 2); if (marker >= 0xc0 && marker <= 0xcf && ![0xc4, 0xc8, 0xcc].includes(marker)) return { height: b.readUInt16BE(i + 5), width: b.readUInt16BE(i + 7) }; i += 2 + len; } }
  return { width: null, height: null };
};
const mimeTypes = { png: 'image/png', jpg: 'image/jpeg', jpeg: 'image/jpeg', gif: 'image/gif', webp: 'image/webp', svg: 'image/svg+xml' };
const referenced = new Set();
for (const route of inventory) { const s = snapshot(route.slug); for (const part of [s.content, s.header, s.footer]) for (const m of (part || '').matchAll(/\/assets\/([A-Za-z0-9._-]+\.(?:png|jpe?g|webp|gif|svg))/g)) referenced.add(m[1]); }
// Originals only: WordPress size variants (name-300x103.png) stay as site assets.
const media = [...referenced].filter(f => !/-\d+x\d+\.[a-z]+$/i.test(f) && fs.existsSync(path.join('public/assets', f))).sort().map(f => {
  const file = path.join('public/assets', f), ext = f.split('.').pop().toLowerCase();
  return { source_path: `/assets/${f}`, path: `assets/${f}`, file_name: f.replace(/^[0-9a-f]{12}-/, ''), mime_type: mimeTypes[ext], size_bytes: fs.statSync(file).size, ...imageSize(file), file };
});

// ------------------------------------------------------------ report

const count = (list, f) => list.filter(f).length;
console.log(`Pages: ${pages.length} (${count(pages, p => p.language === 'en')} en, ${count(pages, p => p.language === 'ar')} ar), ${sections.length} sections, ${categories.size} categories`);
for (const l of ['en', 'ar']) console.log(`Menus ${l}: primary ${header[l].items.length} nodes (${count(header[l].items, i => i.options.kind === 'item')} links); footer ${footer[l].menus.map(m => `${m.location} (${m.items.length})`).join(', ')}; ${footer[l].widgets.length} footer widgets`);
console.log(`Media: ${media.length} original images, ${(media.reduce((t, m) => t + m.size_bytes, 0) / 1e6).toFixed(1)} MB`);
if (problems.length) { console.log(`\n${problems.length} problems:\n  ${problems.join('\n  ')}`); process.exit(1); }
console.log('Round trip: every page rebuilds its content, header and footer from the extracted rows.');
if (!apply) { console.log('Dry run. Re-run with --apply to write to Supabase.'); process.exit(0); }

// ------------------------------------------------------------ write

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.SUPABASE_SECRET_KEY, { auth: { persistSession: false } });
const check = ({ error }, what) => { if (error) throw Error(`${what}: ${error.message}`); };
async function insert(table, rows, size = 200) { for (let i = 0; i < rows.length; i += size) check(await db.from(table).insert(rows.slice(i, i + size)), table); }

// Media first (protect_used_media blocks deleting files that content uses).
for (const m of media) {
  const { file, ...row } = m;
  const upload = await db.storage.from('media').upload(row.path, fs.readFileSync(file), { contentType: row.mime_type, cacheControl: '31536000', upsert: true });
  check(upload, `upload ${row.path}`);
  check(await db.from('media').upsert(row, { onConflict: 'path' }), `media ${row.path}`);
}
// Replace imported content wholesale (re-runnable).
check(await db.from('footer_widgets').delete().not('id', 'is', null), 'clear footer');
check(await db.from('menus').delete().not('id', 'is', null), 'clear menus');
check(await db.from('pages').delete().not('id', 'is', null), 'clear pages');
check(await db.from('categories').delete().not('id', 'is', null), 'clear categories');
check(await db.from('redirects').delete().not('id', 'is', null), 'clear redirects created by page moves');

await insert('pages', pages);
await insert('page_sections', sections, 100);
await insert('categories', [...categories.values()]);
await insert('page_categories', pageCategories);
for (const l of ['en', 'ar']) {
  const primary = { id: uuid(), language: l, location: 'primary', name: l === 'ar' ? 'القائمة الرئيسية' : 'Main menu' };
  await insert('menus', [primary, ...footer[l].menus.map(m => ({ id: m.id, language: m.language, location: m.location, name: m.name }))]);
  // Parents before children.
  const rows = [...header[l].items.map(i => ({ ...i, menu_id: primary.id })), ...footer[l].menus.flatMap(m => m.items.map(i => ({ ...i, menu_id: m.id })))];
  const depth = new Map(); const byId = new Map(rows.map(r => [r.id, r]));
  const d = r => r.parent_id ? (depth.get(r.id) ?? (depth.set(r.id, 1 + d(byId.get(r.parent_id))), depth.get(r.id))) : 0;
  // Batched rows need the same columns: fill defaults for rows, columns and widgets.
  await insert('menu_items', rows.sort((a, b) => d(a) - d(b)).map(r => ({ wp_id: null, url: '', open_in_new_tab: false, ...r })));
  await insert('footer_widgets', footer[l].widgets);
  check(await db.from('settings').upsert({ key: `chrome:${l}`, value: { header: header[l].template, footer: footer[l].template } }), `settings chrome:${l}`);
}
console.log('Imported into Supabase.');
