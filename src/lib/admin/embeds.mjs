import { parseDocument } from 'htmlparser2';
import { isPublicHttps } from '../security/urls.mjs';
export { isPublicHttps };

const escape = value => String(value).replace(/[&<>"']/g, c => ({ '&':'&amp;', '<':'&lt;', '>':'&gt;', '"':'&quot;', "'":'&#39;' })[c]);
const attrs = node => Object.entries(node.attribs ?? {}).sort(([a], [b]) => a.localeCompare(b));
const markup = node => node.type === 'text' ? node.data : node.name ? `<${node.name}${attrs(node).map(([k,v]) => ` ${k}="${escape(v)}"`).join('')}>${(node.children ?? []).map(markup).join('')}</${node.name}>` : '';

// Parse inertly, including entity-decoded attributes. Keep executable bodies
// exact: whitespace inside a script or handler can change its meaning.
export function scriptSignature(html = '') {
  const fragments = [];
  const walk = node => {
    const a = node.attribs ?? {}, tag = node.name;
    if (['script', 'object', 'embed', 'base'].includes(tag) || (tag === 'iframe' && 'srcdoc' in a) || (tag === 'meta' && /^refresh$/i.test(a['http-equiv'] ?? ''))) fragments.push(markup(node));
    for (const [key, value] of attrs(node)) {
      if (/^on[a-z]+$/i.test(key) || (/^(href|src|action|formaction|xlink:href)$/.test(key) && /^javascript:/i.test(value.replace(/[\u0000-\u0020]/g, '')))) fragments.push(`${tag} ${key}=${value}`);
    }
    (node.children ?? []).forEach(walk);
  };
  walk(parseDocument(String(html)));
  return fragments.sort();
}
export function scriptChanged(before = '', after = '') { return JSON.stringify(scriptSignature(before)) !== JSON.stringify(scriptSignature(after)); }
export const scriptGuardMessage = label => `Only full admins can add or change scripts. Remove the script from "${label || 'Section'}" or ask a full admin.`;

export function buildIframeEmbed(input = {}) {
  const src = String(input.src ?? '').trim(), title = String(input.title ?? '').trim();
  if (!isPublicHttps(src)) throw new Error('The iframe needs a full public https:// address.');
  if (!title) throw new Error('Add an accessible iframe title.');
  const aspect = input.aspect || null, height = Number(input.height ?? 450);
  if (aspect && !['16:9', '4:3', '1:1'].includes(aspect)) throw new Error('Choose a supported aspect ratio.');
  if (!aspect && (!Number.isInteger(height) || height < 50 || height > 5000)) throw new Error('Height must be between 50 and 5000 pixels.');
  return `<div class="fxem-embed fxem-embed--iframe"${aspect ? ` style="--fxem-embed-aspect:${aspect.replace(':', '/')}"` : ''}><iframe src="${escape(src)}" title="${escape(title)}"${aspect ? '' : ` height="${height}"`} loading="lazy" referrerpolicy="strict-origin-when-cross-origin" allow="fullscreen; clipboard-write; encrypted-media; picture-in-picture"${input.allowFullscreen ? ' allowfullscreen' : ''}${input.sandbox ? ' sandbox="allow-scripts allow-same-origin allow-popups allow-forms"' : ''}></iframe></div>`;
}
export function parseIframeSnippet(html) {
  let found;
  const walk = node => { if (!found && node.name === 'iframe') found = node.attribs; (node.children ?? []).forEach(walk); };
  walk(parseDocument(String(html)));
  return found ? { src: found.src ?? '', title: found.title ?? '', ...(found.height && /^\d+$/.test(found.height) ? { height: Number(found.height) } : {}) } : null;
}
export function wrapCode(code, wrap = true) { return wrap ? `<div class="fxem-embed fxem-embed--code">${code}</div>` : code; }

export function insertPageCode(html, code = {}) {
  if (!code?.head && !code?.bodyEnd) return html;
  const edits = [];
  const walk = node => {
    const value = node.name === 'head' ? code.head : node.name === 'body' ? code.bodyEnd : '';
    if (value) {
      const source = html.slice(node.startIndex, node.endIndex + 1);
      const close = source.match(new RegExp(`</${node.name}\\s*>$`, 'i'));
      if (close) edits.push({ at: node.endIndex + 1 - close[0].length, value });
    }
    (node.children ?? []).forEach(walk);
  };
  walk(parseDocument(html, { withStartIndices: true, withEndIndices: true }));
  for (const { at, value } of edits.sort((a, b) => b.at - a.at)) html = html.slice(0, at) + value + html.slice(at);
  return html;
}

export function hasUnsupportedRichMarkup(html) {
  let unsupported = false;
  const walk = node => {
    if (node.attribs?.['data-fxem-embed']) return;
    if (/^(div|figure|iframe|table|video|section|style|script)$/.test(node.name ?? '') || node.attribs?.class) unsupported = true;
    (node.children ?? []).forEach(walk);
  };
  walk(parseDocument(html)); return unsupported;
}

// Rebuild rich-text iframe atoms from their settings on the server as well.
// Replace by source offsets so unrelated text/markup keeps its original bytes.
export function normalizeRichEmbeds(html) {
  html = expandRichEmbeds(html);
  const edits = [];
  const walk = node => {
    const mode = node.attribs?.['data-fxem-embed'];
    if (mode) {
      if (!['iframe', 'code'].includes(mode)) throw new Error('Unknown embed mode.');
      const source = html.slice(node.startIndex, node.endIndex + 1);
      if (new TextEncoder().encode(source).length > 100_000) throw new Error('Embed HTML is limited to 100 KB.');
      if (mode === 'iframe') {
        let options;
        try { options = JSON.parse(node.attribs['data-options']); } catch { throw new Error('Invalid iframe settings.'); }
        const built = buildIframeEmbed(options);
        edits.push({ start: node.startIndex, end: node.endIndex + 1, html: built.replace('<div ', `<div data-fxem-embed="iframe" data-options="${escape(JSON.stringify(options))}" `) });
      }
      return;
    }
    (node.children ?? []).forEach(walk);
  };
  walk(parseDocument(html, { withStartIndices: true, withEndIndices: true }));
  for (const edit of edits.reverse()) html = html.slice(0, edit.start) + edit.html + html.slice(edit.end);
  return html;
}

// Translation drafts copy ordinary content, never embed/code configuration.
export function withoutEmbeds(html) {
  const cuts = [];
  const walk = node => {
    if (node.attribs?.['data-fxem-embed'] || ['iframe', 'script'].includes(node.name)) {
      cuts.push([node.startIndex, node.endIndex + 1]); return;
    }
    (node.children ?? []).forEach(walk);
  };
  walk(parseDocument(html, { withStartIndices: true, withEndIndices: true }));
  for (const [start, end] of cuts.reverse()) html = html.slice(0, start) + html.slice(end);
  return html;
}

// TipTap's DOM serializer receives only encoded attributes, never executable
// descendants. Expand into strings after serialization, before saving. This
// avoids even detached image event handlers during admin editing.
export function encodeEmbedCode(code) {
  return btoa(Array.from(new TextEncoder().encode(code), byte => String.fromCharCode(byte)).join(''));
}
export function decodeEmbedCode(code) {
  return new TextDecoder().decode(Uint8Array.from(atob(code), char => char.charCodeAt(0)));
}
export function expandRichEmbeds(html) {
  const edits = [];
  const walk = node => {
    const a = node.attribs ?? {};
    if (a['data-fxem-embed'] && a['data-code'] !== undefined) {
      const mode = a['data-fxem-embed'];
      if (!['code', 'iframe'].includes(mode)) throw new Error('Unknown embed mode.');
      let options;
      try { options = JSON.parse(a['data-options'] ?? '{}'); } catch { throw new Error('Invalid embed settings.'); }
      let built;
      if (mode === 'iframe') built = buildIframeEmbed(options);
      else {
        const code = decodeEmbedCode(a['data-code']);
        built = `<div class="${options.wrap ? 'fxem-embed ' : ''}fxem-embed--code">${code}</div>`;
      }
      built = built.replace('<div ', `<div data-fxem-embed="${mode}" data-options="${escape(JSON.stringify(options))}" `);
      edits.push({ start: node.startIndex, end: node.endIndex + 1, html: built }); return;
    }
    (node.children ?? []).forEach(walk);
  };
  walk(parseDocument(html, { withStartIndices: true, withEndIndices: true }));
  for (const edit of edits.reverse()) html = html.slice(0, edit.start) + edit.html + html.slice(edit.end);
  return html;
}
