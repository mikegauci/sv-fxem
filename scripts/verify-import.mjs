// Reads the imported content back from Supabase with the public key (so row
// level security applies, as for visitors) and rebuilds every page's content,
// header and footer, comparing them with the original snapshots.
//   node --env-file=.env.local scripts/verify-import.mjs
import { createClient } from '@supabase/supabase-js';
import { routes, snapshot } from '../src/lib/site/snapshots.mjs';
import { languageOf, pathOf } from '../src/lib/seo/site.mjs';
import { firstDifference, renderContent, renderFooter, renderHeader, sameMarkup } from '../src/lib/site/chrome.mjs';

const db = createClient(process.env.NEXT_PUBLIC_SUPABASE_URL, process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
async function all(table, select = '*') {
  const rows = [];
  for (let from = 0; ; from += 1000) {
    const { data, error } = await db.from(table).select(select).range(from, from + 999);
    if (error) throw Error(`${table}: ${error.message}`);
    rows.push(...data);
    if (data.length < 1000) return rows;
  }
}

const [pages, sections, menus, items, widgets, settings, media] = await Promise.all([
  all('pages'), all('page_sections'), all('menus'), all('menu_items'), all('footer_widgets'), all('settings'), all('media', 'id'),
]);
const chrome = Object.fromEntries(settings.filter(s => s.key.startsWith('chrome:')).map(s => [s.key.slice(7), s.value]));
const itemsOf = menuId => items.filter(i => i.menu_id === menuId);
const problems = [];
let checked = 0;
for (const route of routes()) {
  const source = snapshot(route.slug), page = pages.find(p => p.path === route.slug);
  if (!page) { problems.push(`/${route.slug}: missing`); continue; }
  const language = languageOf(route.slug);
  const content = renderContent(page.layout.contentShell, sections.filter(s => s.page_id === page.id));
  if (content !== source.content) problems.push(`/${route.slug}: content differs`);
  if (!source.standalone) {
    const primary = menus.find(m => m.language === language && m.location === 'primary');
    const context = { path: pathOf(route.slug), wordpressId: page.wp_id, alternates: page.layout.alternates, home: route.slug === '' || route.slug === 'ar', touch: page.layout.wpmlTouch };
    const header = renderHeader(chrome[language].header, itemsOf(primary.id), context);
    if (!sameMarkup(header, source.header)) problems.push(`/${route.slug}: header differs ${firstDifference(source.header, header)}`);
    const footerMenus = new Map(menus.filter(m => m.language === language).map(m => [m.id, itemsOf(m.id)]));
    const footer = renderFooter(chrome[language].footer, widgets.filter(w => w.language === language), footerMenus, context);
    if (!sameMarkup(footer, source.footer)) problems.push(`/${route.slug}: footer differs ${firstDifference(source.footer, footer)}`);
  }
  for (const key of ['head', 'scripts']) if (page.layout[key] !== source[key]) problems.push(`/${route.slug}: ${key} differs`);
  for (const key of ['htmlAttributes', 'bodyAttributes']) if (JSON.stringify(page.layout[key]) !== JSON.stringify(Object.entries(source[key] || {}))) problems.push(`/${route.slug}: ${key} differ`);
  checked++;
}
console.log(`Supabase: ${pages.length} pages, ${sections.length} sections, ${menus.length} menus, ${items.length} menu items, ${widgets.length} footer widgets, ${media.length} media files.`);
if (problems.length) { console.log(`${problems.length} problems:\n  ${problems.join('\n  ')}`); process.exit(1); }
console.log(`${checked}/${routes().length} pages rebuild exactly from Supabase.`);
