import { parseDocument } from 'htmlparser2';

export function splitContent(content) {
  const doc = parseDocument(content, { withStartIndices: true, withEndIndices: true });
  let entry = null;
  const find = node => { for (const c of node.children || []) { if (entry) return; if (c.type === 'tag' && (c.attribs.class || '').split(/\s+/).includes('entry-content')) { entry = c; return; } find(c); } };
  find(doc);
  if (!entry || !entry.children.length) return { shell: '<!--fxem:sections-->', sections: [{ html: content }] };
  const kids = entry.children;
  const innerStart = kids[0].startIndex, innerEnd = kids.at(-1).endIndex + 1;
  const starts = kids.filter(k => k.type === 'tag' || k.type === 'script' || k.type === 'style').map(k => k.startIndex);
  const cuts = [innerStart, ...starts.filter(s => s > innerStart), innerEnd];
  const sections = [];
  for (let i = 0; i < cuts.length - 1; i++) sections.push({ html: content.slice(cuts[i], cuts[i + 1]) });
  // Attach whitespace-only pieces to the previous section (leading ones to the next).
  const merged = [];
  let lead = '';
  for (const s of sections) {
    if (!s.html.trim()) { if (merged.length) merged.at(-1).html += s.html; else lead += s.html; }
    else { merged.push({ html: lead + s.html }); lead = ''; }
  }
  if (lead && merged.length) merged.at(-1).html += lead;
  else if (lead) merged.push({ html: lead });
  return { shell: content.slice(0, innerStart) + '<!--fxem:sections-->' + content.slice(innerEnd), sections: merged };
}
