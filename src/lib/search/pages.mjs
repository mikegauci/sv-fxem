// Search index and localized result-page shells, built from rendered page
// parts ({ slug, kind, title, content } / a composed page).
import { load } from 'cheerio';
import { languageOf, pathOf, indexable } from '../seo/site.mjs';

export function buildSearchIndex(pages) {
  return pages.filter(indexable).map(page => {
    const $ = load(page.content); $('script,style,form,.currentdesk-trap,.contact-trap').remove();
    return { url: pathOf(page.slug), title: page.title.replace(/\s*[–|]\s*FXEM\s*$/, '').trim(), language: languageOf(page.slug), text: $('#content').text().replace(/\s+/g, ' ').trim() };
  });
}

// source: the composed archive page of that language (head, header, footer...).
export function buildSearchShell(source, language) {
  const $ = load(source.head, {}, false);
  $('title,meta[name=description],meta[name=robots],link[rel=canonical],link[hreflang],meta[property^="og:"],meta[name^="twitter:"],script[type="application/ld+json"]').remove();
  const header = load(source.header, {}, false);
  header('form[role=search]').attr('action', language === 'ar' ? '/ar/search/' : '/search/');
  header('.wpml-ls-item-ar > a').attr('href', '__SEARCH_AR__');
  header('.wpml-ls-item-en > a').attr('href', '__SEARCH_EN__');
  return { head: $.html(), header: header.html(), footer: source.footer, scripts: source.scripts, htmlAttributes: source.htmlAttributes, bodyAttributes: { ...(Array.isArray(source.bodyAttributes) ? Object.fromEntries(source.bodyAttributes) : source.bodyAttributes), class: (language === 'ar' ? 'rtl ' : '') + 'search search-results wp-custom-logo wp-theme-astra wp-child-theme-fxem mega-menu-primary ast-mobile-inherit-site-logo ast-replace-site-logo-transparent ast-inherit-site-logo-transparent ast-hfb-header ast-desktop ast-page-builder-template ast-no-sidebar astra-3.9.4' } };
}
