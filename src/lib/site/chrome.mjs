// Header, footer and page content rebuilt from CMS rows. The theme markup
// that is not content lives in per-language templates (settings
// `chrome:en` / `chrome:ar`) with these markers:
//   <!--fxem:mega-->          desktop mega menu items
//   <!--fxem:mobile-->        mobile menu items
//   <!--fxem:footer:A:N-->    footer widgets of area A (above|primary|below), column N
//   <!--fxem:nav-->           a footer nav menu's items (inside its widget)
//   <!--fxem:sections-->      the page sections (inside layout.contentShell)
// Language switcher links carry the hrefs below and are filled per page.
import { load } from 'cheerio';
import { markCurrent, renderMega, renderMobile, renderNav } from './menus.mjs';

export const ALT_EN = '#fxem-alternate-en';
export const ALT_AR = '#fxem-alternate-ar';
export const HOME_MARK = 'data-fxem-home';

// alternates: { en, ar } paths, null for a language the page is not in.
// touch: WPML's touch-device class, recorded on some original pages.
export function renderHeader(template, primaryItems, { path, wordpressId, alternates, home, touch = false }) {
  let html = template.replace('<!--fxem:mega-->', renderMega(primaryItems)).replace('<!--fxem:mobile-->', renderMobile(primaryItems));
  html = html.replaceAll(` ${HOME_MARK}=""`, home ? ' aria-current="page"' : '');
  const $ = load(html, null, false);
  for (const [language, mark] of [['en', ALT_EN], ['ar', ALT_AR]]) {
    if (alternates[language]) $(`a[href="${mark}"]`).attr('href', alternates[language]);
    else {
      // Untranslated page: the switcher lists only the current language.
      $(`a[href="${mark}"]`).closest('li').each((_, li) => {
        const $ul = $(li).parent();
        $(li).remove();
        $ul.children('li').each((__, other) => {
          const c = ($(other).attr('class') || '').split(/\s+/);
          for (const edge of ['wpml-ls-first-item', 'wpml-ls-last-item']) if (!c.includes(edge)) c.splice(c.indexOf('wpml-ls-current-language') + 1 + (edge === 'wpml-ls-last-item' ? 1 : 0), 0, edge);
          $(other).attr('class', c.join(' '));
        });
      });
    }
  }
  if (touch) $('.wpml-ls-statics-shortcode_actions').each((_, el) => {
    const c = ($(el).attr('class') || '').split(/\s+/);
    c.splice(c.indexOf(c.includes('wpml-ls-rtl') ? 'wpml-ls-rtl' : 'wpml-ls') + 1, 0, 'wpml-ls-touch-device');
    $(el).attr('class', c.join(' '));
  });
  return markCurrent($.html(), path, wordpressId);
}

// widgets: footer_widgets rows; menus: Map menu_id -> items.
export function renderFooter(template, widgets, menus, { path, wordpressId }) {
  const slots = new Map();
  for (const w of [...widgets].sort((a, b) => a.position - b.position)) {
    const key = `<!--fxem:footer:${w.options.area ?? 'above'}:${w.column_index}-->`;
    const html = w.kind === 'menu' ? w.html.replace('<!--fxem:nav-->', renderNav(menus.get(w.menu_id) ?? [])) : w.html;
    slots.set(key, (slots.get(key) ?? '') + html);
  }
  const html = template.replace(/<!--fxem:footer:[a-z]+:\d-->/g, marker => slots.get(marker) ?? '');
  return markCurrent(html, path, wordpressId);
}

export function renderContent(shell, sections) {
  return shell.replace('<!--fxem:sections-->', () => [...sections].sort((a, b) => a.position - b.position).map(s => s.html).join(''));
}

// DOM-level comparison used by the import and parity checks: serializer
// differences and whitespace between tags are ignored.
const normalize = html => load(html, null, false).html().replace(/\s+/g, ' ').replace(/> </g, '><').trim();

export function sameMarkup(a, b) {
  return normalize(a) === normalize(b);
}

// For error reports: the first place where two fragments differ.
export function firstDifference(expected, actual) {
  const a = normalize(expected), b = normalize(actual);
  let i = 0;
  while (i < a.length && a[i] === b[i]) i++;
  return `at ${i}\n    expected: ${a.slice(Math.max(0, i - 120), i + 120)}\n    actual:   ${b.slice(Math.max(0, i - 120), i + 120)}`;
}
