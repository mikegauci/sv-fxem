import test from 'node:test';
import assert from 'node:assert/strict';
import { createRouting } from '../src/lib/seo/routing.mjs';
import { routes, snapshots, wordpressId } from '../src/lib/site/snapshots.mjs';
const pages = routes(), ids = {};
for (const [slug, page] of snapshots()) { const id = wordpressId(page); if (id) ids[slug] = id; }
const preview = createRouting(pages, ids, {}), production = createRouting(pages, ids, { VERCEL_ENV: 'production' });
test('homepage search and ?lang= links redirect like the original build', () => {
  assert.equal(preview.redirect('/', '?s=forex'), '/search/');
  assert.equal(preview.redirect('/ar/', '?s=forex'), '/ar/search/');
  assert.equal(preview.redirect('/about-us/', '?lang=ar'), '/ar/about-us/');
  assert.equal(preview.redirect('/ar/about-us/', '?lang=en'), '/about-us/');
  assert.equal(preview.redirect('/deposit_request/', '?lang=ar'), '/ar/deposit_request/');
  assert.equal(preview.redirect('/about-us/', '?lang=en'), null);
});
test('WordPress short links resolve and never loop', () => {
  assert.equal(preview.redirect('/', `?page_id=${ids['about-us']}`), '/about-us/');
  assert.equal(preview.redirect('/index.php', `?p=${ids['ar/about-us']}`), '/ar/about-us/');
  assert.equal(preview.redirect('/about-us/', `?page_id=${ids['about-us']}`), null);
  assert.equal(preview.redirect('/', '?page_id=999999999'), null);
  assert.equal(preview.redirect('/index.php', ''), '/');
});
test('indexing headers follow the environment and page policy', () => {
  assert.equal(preview.robotsHeader('/about-us/', 'sv.fxem.com'), 'noindex, nofollow');
  assert.equal(production.robotsHeader('/about-us/', 'sv.fxem.com'), null);
  assert.equal(production.robotsHeader('/about-us/', 'sv-fxem.vercel.app'), 'noindex, nofollow');
  assert.equal(production.robotsHeader('/search/', 'sv.fxem.com'), 'noindex, nofollow');
  assert.equal(production.robotsHeader('/api/contact/', 'sv.fxem.com'), 'noindex, nofollow');
  assert.equal(production.robotsHeader('/deposit_request/', 'sv.fxem.com'), 'noindex, nofollow');
  assert.equal(production.robotsHeader('/admin/', 'sv.fxem.com'), 'noindex, nofollow');
});
