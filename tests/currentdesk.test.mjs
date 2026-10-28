import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createCurrentDeskHandler, buildPayload } from '../src/lib/currentdesk/server.mjs';
import schemas from '../src/lib/currentdesk/schemas.json' with { type: 'json' };

const origin = 'https://preview.example.test';
const env = {
  CURRENTDESK_FORM_SECRET: 'test-only-secret-that-is-not-a-production-credential',
  CURRENTDESK_LIVE_AUTHORIZATION: 'Basic test-live-only',
  CURRENTDESK_DEMO_AUTHORIZATION: 'Basic test-demo-only',
  CURRENTDESK_PARTNER_AUTHORIZATION: 'Basic test-partner-only',
};
function validValues(kind) {
  const fields = {};
  for (const f of schemas[kind].fields) {
    fields[f.name] = f.type === 'select' ? '1' : f.type === 'radio' ? f.options[0] : f.type === 'checkbox' ? 'on' : f.type === 'date' ? '1990-01-01' : f.type === 'email' ? 'applicant@example.test' : f.type === 'tel' ? '+15550101000' : f.type === 'password' ? 'ExampleValid123' : /trading-/.test(f.name) ? '5' : f.required ? 'Example' : '';
  }
  if (kind === 'demo') fields['english-status'] = 'false';
  return fields;
}
function fixture(options = {}) {
  const calls = [];
  const fetchImpl = async (url, init) => {
    calls.push({ url, init });
    assert.equal(new URL(url).origin, 'https://api.pro.we.01.currentdesk.com');
    if (init.method === 'POST') {
      if (options.post) return options.post(url, init);
      return Response.json({ Success: true, Id: 999, Password: 'must-never-reach-the-client', AccessToken: 'private' });
    }
    if (options.dictionaryFailure) return Response.json({ Message: 'private error' }, { status: 401 });
    return Response.json([{ Id: 1, Value: 'Option one', PrivateValue: 'must-not-leak' }, { Id: 2, Value: 'Option two' }]);
  };
  const handler = createCurrentDeskHandler({ fetchImpl, env: options.env || env, now: options.now || (() => Date.UTC(2026, 9, 28, 12)), random: () => 'a'.repeat(32) });
  return { handler, calls, writes: () => calls.filter(c => c.init.method === 'POST') };
}
async function session(f, kind) {
  const response = await f.handler(new Request(`${origin}/api/currentdesk/${kind}`), kind);
  assert.equal(response.status, 200);
  return { cookie: response.headers.get('set-cookie').split(';')[0], ...(await response.json()), requestId: randomUUID() };
}
function submit(f, kind, s, fields = validValues(kind), extra = {}, headers = {}) {
  return f.handler(new Request(`${origin}/api/currentdesk/${kind}`, { method: 'POST', headers: { Origin: origin, 'Content-Type': 'application/json', Cookie: s.cookie, ...headers }, body: JSON.stringify({ csrf: s.csrf, requestId: s.requestId, fields, ...extra }) }), kind);
}

test('bootstrap exposes only public dictionary values, with an HttpOnly session', async () => {
  const f = fixture();
  const r = await f.handler(new Request(`${origin}/api/currentdesk/live`), 'live');
  assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Strict/);
  assert.match(r.headers.get('set-cookie'), /; Secure/);
  assert.equal(r.headers.get('cache-control'), 'no-store');
  const body = await r.json();
  assert.deepEqual(body.dictionaries.preferences[0], { id: '1', label: 'Option one' });
  assert.ok(!JSON.stringify(body).includes('must-not-leak'));
  assert.ok(!JSON.stringify(body).includes(env.CURRENTDESK_LIVE_AUTHORIZATION));
});

for (const [kind, path, category, demo] of [
  ['live', '/registration/client/individual', 1, 'true'],
  ['demo', '/registration/lead', 1, 'false'],
  ['partner', '/registration/partner/individual', 2, 'true'],
]) test(`${kind}: exact endpoint, legacy defaults, allowlist, and sanitized success`, async () => {
  const f = fixture(), s = await session(f, kind);
  const fields = { ...validValues(kind), 'account-category-id': '999', 'account-trading-platform-id': '999', admin: 'true' };
  const response = await submit(f, kind, s, fields);
  assert.equal(response.status, 200);
  const body = await response.json();
  assert.equal(body.ok, true);
  assert.ok(!JSON.stringify(body).includes('Password'));
  assert.ok(!JSON.stringify(body).includes('AccessToken'));
  assert.equal(f.writes().length, 1);
  const write = f.writes()[0];
  assert.equal(new URL(write.url).pathname, path);
  assert.equal(write.init.headers.Authorization, env[`CURRENTDESK_${kind.toUpperCase()}_AUTHORIZATION`]);
  const payload = JSON.parse(write.init.body);
  assert.equal(payload['account-category-id'], category);
  assert.equal(payload['account-demo-status'], demo);
  assert.equal(payload['account-trading-platform-id'], 9);
  assert.equal(payload['account-currency-id'], 5);
  assert.ok(!('admin' in payload));
  assert.ok(!('stage' in payload));
  if (kind !== 'demo') {
    assert.equal(payload['individual-address-months'], 12);
    assert.equal(payload['individual-mobile'], fields['individual-telephone']);
    assert.equal(payload['account-phone-id'], fields['individual-telephone']);
    assert.equal(payload['individual-middle-name'], null);
  }
  if (kind === 'partner') assert.match(body.message, /Thank you/);
  else assert.match(body.redirect, /^\/(live|demo)-account-created-successfully\/$/);
});

test('demo English-contact choice and live marketing fields map to API names', () => {
  assert.equal(buildPayload('demo', { ...validValues('demo'), 'english-status': 'true' })['lead-english-status'], 'true');
  assert.equal(buildPayload('demo', validValues('demo'))['lead-english-status'], 'false');
  assert.ok(!('english-status' in buildPayload('demo', validValues('demo'))));
  const live = buildPayload('live', { ...validValues('live'), utm_source: 'search', referral_id: '42', link_id: '12' });
  assert.equal(live['marketing-web-source'], 'search');
  assert.equal(live['marketing-referral-id'], '42');
  assert.equal(live['marketing-link-id'], '12');
});

for (const [label, change, field] of [
  ['terms consent missing', v => delete v.terms, 'terms'],
  ['invalid email', v => v['individual-email'] = 'invalid', 'individual-email'],
  ['under 18 later this year', v => v['individual-birth-date'] = '2008-12-31', 'individual-birth-date'],
  ['invalid calendar date', v => v['individual-birth-date'] = '2000-02-30', 'individual-birth-date'],
  ['password mismatch', v => v['account-password-confirm'] = 'DifferentValid123', 'account-password-confirm'],
  ['weak password', v => v['account-password'] = 'short', 'account-password'],
  ['invalid radio choice', v => v['individual-gender-id'] = '9', 'individual-gender-id'],
  ['negative trading volume', v => v['trading-spot-trades-per-month'] = '-1', 'trading-spot-trades-per-month'],
  ['forged dictionary choice', v => v['account-preference-id'] = '999', 'account-preference-id'],
]) test(`server rejects ${label} without contacting registration API`, async () => {
  const f = fixture(), s = await session(f, 'live'), fields = validValues('live'); change(fields);
  const response = await submit(f, 'live', s, fields);
  assert.equal(response.status, 422);
  assert.ok((await response.json()).errors[field]);
  assert.equal(f.writes().length, 0);
});

test('origin, CSRF, honeypot and request-size checks prevent writes', async () => {
  const f = fixture(), s = await session(f, 'demo');
  assert.equal((await submit(f, 'demo', s, undefined, {}, { Origin: 'https://other.example.test' })).status, 403);
  assert.equal((await submit(f, 'demo', s, undefined, { csrf: 'invalid' })).status, 403);
  assert.equal((await submit(f, 'demo', s, undefined, { website: 'spam' })).status, 422);
  assert.equal((await submit(f, 'demo', s, undefined, { padding: 'x'.repeat(70000) })).status, 413);
  assert.equal(f.writes().length, 0);
});

test('tokens are bound to form kind and expire after two hours', async () => {
  let time = Date.UTC(2026, 9, 28, 12);
  const f = fixture({ now: () => time }), s = await session(f, 'demo');
  assert.equal((await submit(f, 'live', s)).status, 403);
  time += 7200001;
  assert.equal((await submit(f, 'demo', s)).status, 403);
  assert.equal(f.writes().length, 0);
});

test('opening different forms in separate tabs does not overwrite their sessions', async () => {
  const f = fixture();
  const [live, demo] = await Promise.all([session(f, 'live'), session(f, 'demo')]);
  assert.match(live.cookie, /^fxem_registration_live=/);
  assert.match(demo.cookie, /^fxem_registration_demo=/);
  const cookie = `${live.cookie}; ${demo.cookie}`;
  assert.equal((await submit(f, 'live', { ...live, cookie })).status, 200);
  assert.equal((await submit(f, 'demo', { ...demo, cookie })).status, 200);
});

test('simultaneous duplicate submits call the registration API once', async () => {
  const f = fixture({ post: async () => { await new Promise(r => setTimeout(r, 10)); return Response.json({ Success: true }); } });
  const s = await session(f, 'demo');
  const results = await Promise.all([submit(f, 'demo', s), submit(f, 'demo', s)]);
  assert.deepEqual(results.map(r => r.status), [200, 200]);
  assert.equal(f.writes().length, 1);
});

test('rate limiting rejects a sixth valid registration attempt', async () => {
  const f = fixture(), s = await session(f, 'demo');
  for (let i = 0; i < 5; i++) assert.equal((await submit(f, 'demo', { ...s, requestId: randomUUID() })).status, 200);
  const response = await submit(f, 'demo', { ...s, requestId: randomUUID() });
  assert.equal(response.status, 429);
  assert.equal(f.writes().length, 5);
});

test('unavailable dictionaries or absent configuration fail closed', async () => {
  const f = fixture({ dictionaryFailure: true });
  assert.equal((await f.handler(new Request(`${origin}/api/currentdesk/live`), 'live')).status, 503);
  const unconfigured = fixture({ env: {} });
  assert.equal((await unconfigured.handler(new Request(`${origin}/api/currentdesk/live`), 'live')).status, 503);
  assert.equal(f.writes().length, 0);
});

for (const [name, post, expected] of [
  ['upstream business validation', async () => Response.json({ Message: 'This email is already registered.' }, { status: 422 }), 422],
  ['unsafe upstream message', async () => Response.json({ Message: '<script>private error</script>' }, { status: 400 }), 422],
  ['upstream authentication error', async () => Response.json({ Authorization: env.CURRENTDESK_LIVE_AUTHORIZATION }, { status: 401 }), 502],
  ['upstream false success', async () => Response.json({ Success: false, Message: 'Registration declined.' }), 422],
  ['upstream HTML error', async () => new Response('<html>Error</html>'), 502],
  ['network interruption', async () => { throw Error('network unavailable'); }, 502],
]) test(`${name} does not redirect or expose private responses`, async () => {
  const f = fixture({ post }), s = await session(f, 'live');
  const response = await submit(f, 'live', s);
  assert.equal(response.status, expected);
  const body = await response.json();
  assert.equal(body.ok, false); assert.equal(body.redirect, undefined);
  assert.ok(!JSON.stringify(body).includes(env.CURRENTDESK_LIVE_AUTHORIZATION));
  assert.ok(!JSON.stringify(body).includes('<script>'));
});
