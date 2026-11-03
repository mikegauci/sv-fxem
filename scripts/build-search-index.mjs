import fs from 'node:fs/promises';
import { load } from 'cheerio';
import { languageOf, pathOf, indexable } from '../src/lib/seo/site.mjs';
const routes = [{ slug:'', kind:'page' }, ...JSON.parse(await fs.readFile('migration/routes.json','utf8'))];
const index = [];
for (const page of routes.filter(indexable)) {
  const snapshot = page.slug ? JSON.parse(await fs.readFile(`src/data/pages/${page.slug.replaceAll('/','__')}.json`,'utf8')) : { title:'FXEM – Your Trusted Financial Broker', content:await fs.readFile('src/content/homepage.html','utf8') };
  const $ = load(snapshot.content); $('script,style,form,.currentdesk-trap,.contact-trap').remove();
  index.push({ url:pathOf(page.slug), title:snapshot.title.replace(/\s*[–|]\s*FXEM\s*$/,'').trim(), language:languageOf(page.slug), text:$('#content').text().replace(/\s+/g,' ').trim() });
}
const shells = {};
for (const language of ['en','ar']) {
  const filename = language === 'ar' ? 'ar__category__posts-ar' : 'category__posts';
  const snapshot = JSON.parse(await fs.readFile(`src/data/pages/${filename}.json`,'utf8'));
  const $ = load(snapshot.head, {}, false);
  $('title,meta[name=description],meta[name=robots],link[rel=canonical],link[hreflang],meta[property^="og:"],meta[name^="twitter:"],script[type="application/ld+json"]').remove();
  const header = load(snapshot.header, {}, false);
  header('form[role=search]').attr('action', language === 'ar' ? '/ar/search/' : '/search/');
  header('.wpml-ls-item-ar > a').attr('href', '__SEARCH_AR__');
  header('.wpml-ls-item-en > a').attr('href', '__SEARCH_EN__');
  shells[language] = { head:$.html(), header:header.html(), footer:snapshot.footer, scripts:snapshot.scripts, htmlAttributes:snapshot.htmlAttributes, bodyAttributes:{...snapshot.bodyAttributes,class:(language==='ar'?'rtl ':'')+'search search-results wp-custom-logo wp-theme-astra wp-child-theme-fxem mega-menu-primary ast-mobile-inherit-site-logo ast-replace-site-logo-transparent ast-inherit-site-logo-transparent ast-hfb-header ast-desktop ast-page-builder-template ast-no-sidebar astra-3.9.4'} };
}
await fs.writeFile('src/data/search-index.json',JSON.stringify(index));
await fs.writeFile('src/data/search-shells.json',JSON.stringify(shells));
console.log(`Search: ${index.length} indexed English/Arabic pages, with localized result shells.`);
