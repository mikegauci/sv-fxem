// Page snapshots of the original site (src/data/pages/*.json plus the English
// homepage fragments in src/content/). The public site renders these until the
// content moves into Supabase.
import fs from 'node:fs';
import path from 'node:path';

const root = process.cwd();
// Files are listed in outputFileTracingIncludes (next.config.ts).
const read = file => fs.readFileSync(path.join(/*turbopackIgnore: true*/ root, file), 'utf8');
let cache;

function homepage() {
  return {
    slug: '', title: 'FXEM – Your Trusted Financial Broker', kind: 'page',
    htmlAttributes: { lang: 'en-US' },
    skipLink: '<a class="skip-link screen-reader-text" href="#content">Skip to content</a>',
    head: read('src/content/head.html'),
    bodyAttributes: JSON.parse(read('src/content/body.json')),
    header: read('src/content/header.html'),
    content: read('src/content/homepage.html'),
    footer: read('src/content/footer.html'),
    scripts: read('src/content/scripts.html'),
  };
}

export function snapshots() {
  if (cache) return cache;
  const dir = path.join(/*turbopackIgnore: true*/ root, 'src/data/pages');
  const pages = [homepage(), ...fs.readdirSync(dir).filter(f => f.endsWith('.json')).sort().map(f => JSON.parse(fs.readFileSync(path.join(dir, f), 'utf8')))];
  cache = new Map(pages.map(p => [p.slug, p]));
  return cache;
}

// Route inventory in the order the SEO layer expects (home first).
export function routes() {
  return [{ slug: '', kind: 'page' }, ...JSON.parse(read('migration/routes.json')).map(({ slug, kind }) => ({ slug, kind }))];
}

export function snapshot(slug) {
  return snapshots().get(slug) ?? null;
}

// WordPress post/page IDs from the original body classes (page-id-N / postid-N).
export function wordpressId(page) {
  return page?.bodyAttributes?.class?.match(/(?:page-id-|postid-)(\d+)/)?.[1] ?? null;
}
