import test from 'node:test';
import assert from 'node:assert/strict';
import { allowedDomains } from '../src/lib/security/hosts.mjs';
import { trustedRequest } from '../src/lib/security/request.mjs';
const host = 'sv-fxem-fixture-mikegaucis-projects.vercel.app';
const vercel = { VERCEL: '1', VERCEL_URL: host };
function request(headers, env) {
  return trustedRequest(new Request('http://internal/api/currentdesk/demo/', { headers }), env);
}
test('the exact HTTPS deployment origin is rebuilt behind Vercel', () => {
  const headers = { host, 'x-forwarded-host': host, 'x-forwarded-proto': 'https' };
  assert.equal(new URL(request(headers, {}).url).hostname, 'localhost');
  assert.equal(new URL(request(headers, vercel).url).origin, 'https://' + host);
});
test('unapproved forwarded hosts and arbitrary Vercel tenants remain untrusted', () => {
  assert.equal(new URL(request({ host, 'x-forwarded-host': 'attacker.vercel.app', 'x-forwarded-proto': 'https' }, vercel).url).hostname, 'localhost');
  assert.equal(new URL(request({ host: 'attacker.example', 'x-forwarded-proto': 'https' }, vercel).url).hostname, 'localhost');
  const patterns = allowedDomains(vercel);
  assert.ok(!patterns.some(p => p.hostname.includes('*')));
  assert.ok(!patterns.some(p => p.hostname === 'localhost'));
});
test('malformed deployment host configuration is rejected, localhost is development-only', () => {
  const patterns = allowedDomains({ VERCEL: '1', VERCEL_URL: 'safe.vercel.app/evil' });
  assert.ok(!patterns.some(p => p.hostname.includes('/')));
  const local = request({ host: 'localhost:3000', 'x-forwarded-proto': 'http' }, {});
  assert.equal(new URL(local.url).origin, 'http://localhost:3000');
  assert.equal(new URL(request({ host: 'localhost:3000', 'x-forwarded-proto': 'http' }, { VERCEL: '1' }).url).hostname, 'localhost');
  assert.equal(new URL(request({ host: 'localhost:3000', 'x-forwarded-proto': 'http' }, { VERCEL: '1' }).url).port, '');
});
test('the request path, query and body are preserved', async () => {
  const r = trustedRequest(new Request('http://internal/api/contact/?lang=ar', { method: 'POST', headers: { host: 'localhost:3000' }, body: '{"a":1}' }), {});
  assert.equal(new URL(r.url).pathname + new URL(r.url).search, '/api/contact/?lang=ar');
  assert.equal(await r.text(), '{"a":1}');
});
