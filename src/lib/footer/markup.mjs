export function footerMarkup(html, year = new Date().getFullYear()) {
  return html.replace(/©\s*\d{4}(?=\s*FXEM)/g, `© <span data-copyright-year>${year}</span>`)
    .replace(/(<section\b[^>]*class="[^"]*\bwidget_rss\b[^"]*"[^>]*>)[\s\S]*?<\/section>/g,
      '$1<div class="fxem-footer-news" data-footer-news><ul aria-label="CNBC finance news"><li><a href="https://www.cnbc.com/finance/" target="_blank" rel="noopener noreferrer" dir="auto">CNBC — Finance news</a></li></ul><small><a href="https://www.cnbc.com/finance/" target="_blank" rel="noopener noreferrer">CNBC</a></small></div></section>');
}
