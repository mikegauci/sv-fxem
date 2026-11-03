// Runs before `next dev` / `next build`: bundles the browser form scripts and
// writes the routing table the proxy needs (it cannot read page files).
import fs from 'node:fs/promises';
import { build } from 'esbuild';
import { routes, snapshots, wordpressId } from '../src/lib/site/snapshots.mjs';

await build({
  entryPoints: { 'currentdesk-forms': 'src/scripts/currentdesk-forms.js', 'contact-forms': 'src/scripts/contact-forms.js' },
  outdir: 'public/_fxem', bundle: true, minify: true, format: 'esm', target: 'es2020', logLevel: 'warning',
});

const ids = {};
for (const [slug, page] of snapshots()) {
  const id = wordpressId(page);
  if (id) ids[slug] = Number(id);
}
await fs.mkdir('src/generated', { recursive: true });
await fs.writeFile('src/generated/routing.json', JSON.stringify({ pages: routes(), ids }) + '\n');
console.log(`Prebuild: form scripts bundled, ${Object.keys(ids).length} WordPress IDs for short links.`);
