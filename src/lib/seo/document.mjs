// SEO layer applied to every rendered page (formerly scripts/build-seo.mjs,
// which rewrote the static build output). Visible copy is unchanged.
import fs from 'node:fs/promises';
import path from 'node:path';
import { load } from 'cheerio';
import postcss from 'postcss';
import { origin, brandLogo, languageOf, urlOf, baseOf, details, alternates, robotsDirective, graph } from './site.mjs';

const cssCache = new Map();
const readAsset = href => fs.readFile(path.join(/*turbopackIgnore: true*/ process.cwd(), 'public', href), 'utf8');

function headingStyles(source) {
  const ast = postcss.parse(source);
  ast.walkRules(rule => {
    const selectors = rule.selectors.filter(s => /(^|[^\w-])h[1-6](?=[^\w-]|$)/.test(s));
    if (!selectors.length) rule.remove();
    else rule.selectors = selectors.map(s => s.replace(/(^|[^\w-])h([1-6])(?=[^\w-]|$)/g, '$1div:where(.seo-heading-h$2)'));
  });
  ast.walkAtRules(rule => { if (!['media', 'supports', 'layer', 'container'].includes(rule.name) || !rule.nodes?.length) rule.remove(); });
  return ast.toString();
}

async function preserveHeadingStyles($) {
  let css = '';
  for (const el of $('head link[rel=stylesheet],head style').toArray()) {
    const href = $(el).attr('href');
    if (href?.startsWith('/assets/')) {
      if (!cssCache.has(href)) cssCache.set(href, headingStyles(await readAsset(href)));
      css += cssCache.get(href);
    } else if (el.tagName === 'style') css += headingStyles($(el).html());
  }
  $('head').append($('<style data-seo-heading-styles></style>').text(css));
}

// One H1 per page; repeated/skipped heading levels become ARIA headings that
// keep their original look.
async function headings($, page) {
  const main = page.kind === 'standalone' ? $('body') : $('#content');
  const all = main.find('h1,h2,h3,h4,h5,h6').toArray();
  const homepage = !baseOf(page.slug);
  if (homepage || !main.find('h1').length) {
    const title = main.find('h1,h2,h3').first().text().trim() || details(page).title;
    main.prepend($('<h1 class="seo-page-title"></h1>').text(title));
  }
  let previous = 1, lastOriginal = 1, found = homepage || !all.some(el => el.tagName === 'h1'), changed = false;
  for (const el of all) {
    const level = Number(el.tagName.slice(1));
    if (level === 1 && !found) { found = true; previous = 1; continue; }
    const target = level <= 2 ? 2 : level === lastOriginal ? previous : Math.min(level, previous + 1);
    if (level !== target) {
      $(el).addClass(`seo-heading-h${level}`).attr('role', 'heading').attr('aria-level', String(target));
      el.tagName = 'div'; changed = true;
    }
    previous = target; lastOriginal = level;
  }
  $('head').append('<style>.seo-page-title{position:absolute!important;width:1px!important;height:1px!important;padding:0!important;margin:-1px!important;overflow:hidden!important;clip:rect(0,0,0,0)!important;white-space:nowrap!important;border:0!important}</style>');
  if (changed) await preserveHeadingStyles($);
}

export async function seoDocument(html, page, pages, env = process.env) {
  const $ = load(html);
  const { title, description } = details(page), canonical = urlOf(page.slug), lang = languageOf(page.slug);
  $('title,meta[name=description],meta[name=robots],link[rel=canonical],link[hreflang],meta[property^="og:"],meta[name^="twitter:"],script[type="application/ld+json"]').remove();
  const meta = attrs => $('head').append($('<meta>').attr(attrs));
  $('head').append($('<title></title>').text(title));
  meta({ name: 'description', content: description });
  meta({ name: 'robots', content: robotsDirective(page, env) });
  $('head').append($('<link rel="canonical">').attr('href', canonical));
  $('form[role=search]').attr('action', lang === 'ar' ? '/ar/search/' : '/search/');
  const links = alternates(page, pages);
  for (const link of links) $('head').append($('<link rel="alternate">').attr({ hreflang: link.language, href: link.url }));
  const en = links.find(link => link.language === 'en');
  if (en) $('head').append($('<link rel="alternate" hreflang="x-default">').attr('href', en.url));
  const image = new URL(brandLogo, origin).href;
  for (const [property, content] of Object.entries({ 'og:title': title, 'og:description': description, 'og:url': canonical, 'og:site_name': 'FXEM', 'og:type': page.kind === 'post' ? 'article' : 'website', 'og:locale': lang === 'ar' ? 'ar_AR' : 'en_US', 'og:image': image, 'og:image:alt': 'FXEM' })) meta({ property, content });
  for (const [name, content] of Object.entries({ 'twitter:card': 'summary', 'twitter:title': title, 'twitter:description': description, 'twitter:image': image })) meta({ name, content });
  $('head').append($('<script type="application/ld+json"></script>').text(JSON.stringify(graph(page, pages, $)).replace(/</g, '\\u003c')));
  await headings($, page);
  if (baseOf(page.slug) === 'forex-calculators') {
    $('#content div[style]').each((_, el) => {
      const style = $(el).attr('style');
      if (/position:\s*absolute/.test(style) && /width:\s*\d+px/.test(style) && !$(el).text().trim()) $(el).addClass('seo-calculator-mask');
    });
    $('head').append('<style>@media(max-width:767px){.seo-calculator-mask{max-width:calc(100% - 8px)!important}}</style>');
  }
  if (baseOf(page.slug) === 'products') $('head').append('<style>@media(max-width:767px){#content .uagb-tabs__wrap{width:calc(100% - 30px)!important}#content .uagb-tabs__body-wrap{overflow-x:auto}}</style>');
  // Keep the first content image eager; lazy-load later offscreen images.
  const images = $('#content img').toArray();
  for (const [i, el] of images.entries()) { $(el).attr('decoding', 'async'); if (i > 0 && !$(el).attr('loading')) $(el).attr('loading', 'lazy'); }
  return $.html();
}
