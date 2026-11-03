// Search index and localized result-page shells, built from the page
// snapshots (formerly scripts/build-search-index.mjs).
import { load } from 'cheerio';
import { languageOf, pathOf, indexable } from '../seo/site.mjs';
import { routes, snapshot } from '../site/snapshots.mjs';

let index, shells;

export function searchIndex() {
  if (index) return index;
  index = [];
  for (const page of routes().filter(indexable)) {
    const source = snapshot(page.slug);
    const $ = load(source.content); $('script,style,form,.currentdesk-trap,.contact-trap').remove();
    index.push({ url: pathOf(page.slug), title: source.title.replace(/\s*[–|]\s*FXEM\s*$/, '').trim(), language: languageOf(page.slug), text: $('#content').text().replace(/\s+/g, ' ').trim() });
  }
  return index;
}

export function searchShells() {
  if (shells) return shells;
  shells = {};
  for (const language of ['en', 'ar']) {
    const source = snapshot(language === 'ar' ? 'ar/category/posts-ar' : 'category/posts');
    const $ = load(source.head, {}, false);
    $('title,meta[name=description],meta[name=robots],link[rel=canonical],link[hreflang],meta[property^="og:"],meta[name^="twitter:"],script[type="application/ld+json"]').remove();
    const header = load(source.header, {}, false);
    header('form[role=search]').attr('action', language === 'ar' ? '/ar/search/' : '/search/');
    header('.wpml-ls-item-ar > a').attr('href', '__SEARCH_AR__');
    header('.wpml-ls-item-en > a').attr('href', '__SEARCH_EN__');
    shells[language] = { head: $.html(), header: header.html(), footer: source.footer, scripts: source.scripts, htmlAttributes: source.htmlAttributes, bodyAttributes: { ...source.bodyAttributes, class: (language === 'ar' ? 'rtl ' : '') + 'search search-results wp-custom-logo wp-theme-astra wp-child-theme-fxem mega-menu-primary ast-mobile-inherit-site-logo ast-replace-site-logo-transparent ast-inherit-site-logo-transparent ast-hfb-header ast-desktop ast-page-builder-template ast-no-sidebar astra-3.9.4' } };
  }
  return shells;
}
