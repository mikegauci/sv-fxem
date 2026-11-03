import { defaultFeed } from './news.mjs';

const escape = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');

// The news block's placeholder until headlines load: a link to the source,
// named by the block's data-news-source / data-news-source-url (CNBC by default).
export function footerMarkup(html, year = new Date().getFullYear()) {
  return html.replace(/©\s*\d{4}(?=\s*FXEM)/g, `© <span data-copyright-year>${year}</span>`)
    .replace(/(<section\b[^>]*class="[^"]*\bwidget_rss\b[^"]*"[^>]*>)[\s\S]*?<\/section>/g, (_, open) => {
      const attr = name => open.match(new RegExp(`\\s${name}="([^"]*)"`))?.[1];
      const source = attr('data-news-source') ?? defaultFeed.source;
      const link = attr('data-news-source-url') ?? defaultFeed.sourceUrl;
      const label = source === defaultFeed.source ? 'CNBC — Finance news' : source;
      return `${open}<div class="fxem-footer-news" data-footer-news><ul aria-label="${source === defaultFeed.source ? 'CNBC finance news' : `${source} news`}"><li><a href="${link}" target="_blank" rel="noopener noreferrer" dir="auto">${label}</a></li></ul><small><a href="${link}" target="_blank" rel="noopener noreferrer">${source}</a></small></div></section>`;
    });
}

// Marks a news block with its feed's source so the placeholder names it.
export function newsBlock(html, feed) {
  if (!feed || (feed.source === defaultFeed.source && feed.sourceUrl === defaultFeed.sourceUrl)) return html;
  return html.replace(/<section\b[^>]*\bwidget_rss\b[^>]*/, open => `${open.replace(/\sdata-news-source(-url)?="[^"]*"/g, '')} data-news-source="${escape(feed.source)}" data-news-source-url="${escape(feed.sourceUrl)}"`);
}
