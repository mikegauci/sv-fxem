import test from 'node:test';
import assert from 'node:assert/strict';
import { createRequest } from 'astro/app/node';
import { allowedDomains } from '../src/lib/security/hosts.mjs';
const host = 'sv-fxem-fixture-mikegaucis-projects.vercel.app';
function request(headers, patterns) {
  return createRequest({ method: 'GET', url: '/api/currentdesk/demo', headers, socket: {} }, { allowedDomains: patterns });
}
test('Astro reconstructs the exact HTTPS deployment origin behind Vercel', () => {
  const headers = { host, 'x-forwarded-host': host, 'x-forwarded-proto': 'https' };
  assert.equal(new URL(request(headers, []).url).hostname, 'localhost');
  assert.equal(new URL(request(headers, allowedDomains({ VERCEL: '1', VERCEL_URL: host })).url).origin, 'https://' + host);
});
test('unapproved forwarded hosts and arbitrary Vercel tenants remain untrusted', () => {
  const patterns = allowedDomains({ VERCEL: '1', VERCEL_URL: host });
  assert.equal(new URL(request({ host, 'x-forwarded-host': 'attacker.vercel.app', 'x-forwarded-proto': 'https' }, patterns).url).hostname, host);
  assert.equal(new URL(request({ host: 'attacker.example', 'x-forwarded-host': 'attacker.example', 'x-forwarded-proto': 'https' }, patterns).url).hostname, 'localhost');
  assert.ok(!patterns.some(p => p.hostname.includes('*')));
  assert.ok(!patterns.some(p => p.hostname === 'localhost'));
});
test('malformed deployment host configuration is rejected, localhost is development-only', () => {
  const patterns = allowedDomains({ VERCEL: '1', VERCEL_URL: 'safe.vercel.app/evil' });
  assert.ok(!patterns.some(p => p.hostname.includes('/')));
  const local = request({ host: 'localhost:4321', 'x-forwarded-proto': 'http' }, allowedDomains({}));
  assert.equal(new URL(local.url).origin, 'http://localhost:4321');
});
