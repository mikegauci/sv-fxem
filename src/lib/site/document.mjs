// Assembles a full HTML document from a page snapshot, as the Astro preview
// did: original head/header/content/footer plus the site's form and footer
// enhancements.
import { footerMarkup } from '../footer/markup.mjs';

const escapeAttr = value => String(value).replace(/&/g, '&amp;').replace(/"/g, '&quot;').replace(/</g, '&lt;');
// Boolean attributes written as itemscope="itemscope" render empty, as Astro did.
// attrs: an object or a list of [name, value] pairs (CMS layouts).
export const attributes = attrs => (Array.isArray(attrs) ? attrs : Object.entries(attrs || {})).map(([k, v]) => ` ${k}="${v === k ? '' : escapeAttr(v)}"`).join('');

// Component styles (previously Astro global styles, inlined into every page).
export const siteStyles = `<style>[data-currentdesk-form] .currentdesk-trap{position:absolute!important;left:0!important;top:0!important;clip-path:inset(50%)!important;width:1px!important;height:1px!important;overflow:hidden!important}[data-currentdesk-form] .error-message{color:#b42318;margin:5px 0 12px;font-size:14px}[data-currentdesk-form] [aria-invalid="true"]{border-color:#b42318!important}[data-currentdesk-form] .currentdesk-status[hidden]{display:none!important}[data-currentdesk-form] .currentdesk-status{padding:12px;margin-top:16px}[data-currentdesk-form] .currentdesk-status.is-error{color:#b42318;background:#fff5f3}[data-currentdesk-form] button:disabled{opacity:.6;cursor:wait}[data-contact-form] .contact-trap{position:absolute!important;left:0!important;top:0!important;clip-path:inset(50%)!important;width:1px!important;height:1px!important;overflow:hidden!important}[data-contact-form] .wpcf7-response-output[hidden]{display:none!important}[data-contact-form] .wpcf7-response-output:not([hidden]){display:block!important;border-color:#55b8c4}[data-contact-form] .wpcf7-response-output.contact-error{border-color:#b42318}[data-contact-form] [aria-invalid="true"]{border-color:#b42318!important}[data-contact-form] [type=submit]:disabled{opacity:.6;cursor:wait}
.site-footer .site-above-footer-wrap .site-footer-section{min-width:0}.site-footer .fxem-footer-news{height:180px;max-height:180px;min-width:0;width:100%;overflow:hidden;contain:inline-size}.site-footer .fxem-footer-news ul{margin:0;gap:6px;list-style:none;line-height:1.4;width:100%;min-width:0}.site-footer .fxem-footer-news li{margin:0;padding:0;min-width:0}.site-footer .fxem-footer-news li a{display:-webkit-box;-webkit-box-orient:vertical;-webkit-line-clamp:2;white-space:normal;overflow:hidden;overflow-wrap:anywhere;line-height:1.3;font-size:14px}.site-footer .fxem-footer-news small{display:block;margin-top:4px;font-size:11px;line-height:1.2}.site-footer .fxem-footer-news time{display:block;font-size:11px;line-height:1.2;opacity:.75}.fxem-rich-text{max-width:1240px;margin:0 auto;padding:40px 20px}.fxem-rich-text img{max-width:100%;height:auto}</style>`;

// Copyright year and the news feed headlines in the footer.
export const footerScript = `<script type="module">function updateCopyright(){const year=String(new Date().getFullYear());document.querySelectorAll('[data-copyright-year]').forEach(el=>{el.textContent=year})}updateCopyright();setInterval(updateCopyright,36e5);document.addEventListener('visibilitychange',updateCopyright);const widgets=document.querySelectorAll('[data-footer-news] ul');if(widgets.length)fetch('/api/footer-news/?lang='+(document.documentElement.lang.startsWith('ar')?'ar':'en'),{signal:AbortSignal.timeout(1e4)}).then(r=>{if(!r.ok)throw new Error('Unavailable');return r.json()}).then(({items})=>{if(!Array.isArray(items)||!items.length)return;widgets.forEach(list=>{const entries=items.slice(0,10).flatMap(item=>{try{const url=new URL(item.url);if(url.protocol!=='https:'||typeof item.title!=='string')return[];const li=document.createElement('li'),a=document.createElement('a');a.href=url.href;a.textContent=item.title;a.title=item.title;a.target='_blank';a.rel='noopener noreferrer';a.dir='auto';li.append(a);const published=item.publishedAt?new Date(item.publishedAt):null;if(published&&!Number.isNaN(published.getTime())){const time=document.createElement('time');time.dateTime=published.toISOString();time.textContent=new Intl.DateTimeFormat(document.documentElement.lang.startsWith('ar')?'ar':'en-GB',{day:'numeric',month:'short',year:'numeric',timeZone:'UTC'}).format(published);li.append(time)}return[li]}catch{return[]}});if(entries.length)list.replaceChildren(...entries)})}).catch(()=>{})</script>`;

export const formScript = name => `<script type="module" src="/_fxem/${name}-forms.js"></script>`;

// Text sections written in the CMS editor, at the theme's content width.
export const richTextSection = html => `<div class="fxem-rich-text">${html}</div>`;

export function footer(content) {
  return footerMarkup(content) + footerScript;
}

export function renderSnapshot(page) {
  const body = page.standalone ? page.content : `${page.skipLink}<div class="hfeed site" id="page">${page.header}${page.content}${footer(page.footer)}</div>`;
  return `<!DOCTYPE html><html${attributes(page.htmlAttributes)}><head>${page.head}${siteStyles}</head><body${attributes(page.bodyAttributes)}>${body}${page.scripts}${page.currentdesk ? formScript('currentdesk') : ''}${page.contact ? formScript('contact') : ''}</body></html>`;
}
