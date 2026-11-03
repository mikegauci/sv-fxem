import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPagePath } from '../src/lib/admin/page-paths.mjs';
test('page URLs are normalized per language', () => {
  assert.deepEqual(cleanPagePath('/About Us/', 'en'), { path: 'about-us' });
  assert.deepEqual(cleanPagePath('about-us', 'ar'), { path: 'ar/about-us' });
  assert.deepEqual(cleanPagePath('/ar/من-نحن/', 'ar'), { path: 'ar/من-نحن' });
  assert.deepEqual(cleanPagePath('', 'en'), { path: '' });
  assert.deepEqual(cleanPagePath('', 'ar'), { path: 'ar' });
});
test('reserved and malformed URLs are rejected', () => {
  for (const [p, l] of [['admin', 'en'], ['ar/search', 'ar'], ['ar/x', 'en'], ['a?b', 'en'], ['assets/x', 'en']]) assert.ok(cleanPagePath(p, l).error, p);
});
