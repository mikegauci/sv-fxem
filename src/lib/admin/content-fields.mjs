// A single inert parse/serialize path shared by the editor and import parity
// tests. Parsing alone never writes HTML back; unchanged sections retain their
// original bytes. Only the node an editor actually changes is serialized.
export function parseSection(document, html) {
  const template = document.createElement('template'); template.innerHTML = html;
  return template;
}
const blocks = /^(P|H[1-6]|LI|TD|TH|DT|DD|BLOCKQUOTE|FIGCAPTION|LABEL|SPAN)$/;
const inline = /^(STRONG|B|EM|I|U|A|BR|SPAN|SUP|SUB)$/;
const attributes = { SPAN: ['class', 'style'], A: ['href', 'target', 'rel'] };
export function inlineBlock(el) {
  if (!blocks.test(el.tagName) || el.closest('a,button') || !el.textContent.trim()) return false;
  return [...el.querySelectorAll('*')].every(child => inline.test(child.tagName) && [...child.attributes].every(a => (attributes[child.tagName] ?? []).includes(a.name)));
}
export function collectFields(root) {
  const fields = [];
  const walk = node => {
    if (node.nodeType === 3) {
      if (node.nodeValue?.trim()) fields.push({ kind: 'text', node, label: node.parentElement?.closest('a,button') ? 'Link / button text' : 'Text' });
      return;
    }
    if (node.nodeType !== 1) return;
    const el = node;
    if (/^(SCRIPT|STYLE|NOSCRIPT|SVG|IFRAME|OBJECT|EMBED|TEMPLATE)$/i.test(el.tagName)) return;
    if (el.tagName === 'IMG') fields.push({ kind: 'image', node: el, label: 'Image' });
    if (/url\(/.test(el.getAttribute('style') || '')) fields.push({ kind: 'background', node: el, label: 'Background image' });
    if (el.tagName === 'A' && el.hasAttribute('href')) fields.push({ kind: 'link', node: el, label: 'Link URL' });
    if (inlineBlock(el)) { el.querySelectorAll('a[href]').forEach(link => fields.push({ kind: 'link', node: link, label: 'Link URL' })); fields.push({ kind: 'inline', node: el, label: /^H[1-6]$/.test(el.tagName) ? 'Heading' : 'Text block' }); return; }
    el.childNodes.forEach(walk);
  };
  root.childNodes.forEach(walk);
  return fields;
}
