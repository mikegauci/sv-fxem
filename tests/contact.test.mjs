import test from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { createContactHandler } from '../src/lib/contact/server.mjs';
import { messages, validateContact } from '../src/lib/contact/validation.mjs';
const origin = 'https://preview.example.test';
const env = { CONTACT_FORM_SECRET: 'test-contact-signing-secret-at-least-32-characters', MAILJET_API_KEY: 'test-public', MAILJET_SECRET_KEY: 'test-private', MAILJET_FROM_EMAIL: 'sender@example.test', MAILJET_TO_EMAIL: 'support@example.test' };
const fields = { name: 'Example Visitor', email: 'visitor@example.test', subject: 'Website enquiry', message: 'A contact message.' };
function fixture(options = {}) {
  const calls = []; let time = Date.now();
  const handler = createContactHandler({ env: options.env || env, now: () => time, random: () => 'b'.repeat(32), fetchImpl: async (url, init) => {
    calls.push({ url, init }); return options.response ? options.response() : Response.json({ Messages: [{ Status: 'success', To: [{ MessageID: 1234, MessageUUID: 'private-message-id' }] }] });
  } });
  return { handler, calls, advance: ms => time += ms };
}
async function session(f, lang = 'en') {
  const r = await f.handler(new Request(`${origin}/api/contact?lang=${lang}`), 'test-ip');
  assert.equal(r.status, 200); const body = await r.json();
  return { ...body, lang, cookie: r.headers.get('set-cookie').split(';')[0], requestId: randomUUID() };
}
function submit(f, s, value = fields, overrides = {}, headers = {}) {
  return f.handler(new Request(`${origin}/api/contact?lang=${s.lang}`, { method: 'POST', headers: { Origin: origin, Cookie: s.cookie, 'Content-Type': 'application/json', ...headers }, body: JSON.stringify({ fields: value, csrf: s.csrf, requestId: s.requestId, ...overrides }) }), 'test-ip');
}
test('bootstrap exposes configuration status and a signed HttpOnly session, never credentials', async () => {
  const f = fixture(); const r = await f.handler(new Request(`${origin}/api/contact`));
  assert.match(r.headers.get('set-cookie'), /HttpOnly; SameSite=Strict; Path=\/api\/contact/); assert.match(r.headers.get('set-cookie'), /Secure/);
  assert.equal(r.headers.get('cache-control'), 'no-store'); const body = await r.json(); assert.equal(body.configured, true); assert.ok(body.csrf); assert.ok(!JSON.stringify(body).includes(env.MAILJET_SECRET_KEY)); assert.equal(f.calls.length, 0);
});
for (const lang of ['en', 'ar']) test(`${lang}: sends one plain-text Mailjet message with fixed recipients and visitor ReplyTo`, async () => {
  const f = fixture(), s = await session(f, lang), r = await submit(f, s, { ...fields, to: 'attacker@example.test', from: 'attacker@example.test', html: '<script>' });
  assert.equal(r.status, 200); assert.deepEqual(await r.json(), { ok: true, message: messages[lang].success }); assert.equal(f.calls.length, 1);
  const call = f.calls[0], body = JSON.parse(call.init.body), msg = body.Messages[0];
  assert.equal(call.url, 'https://api.mailjet.com/v3.1/send'); assert.equal(call.init.redirect, 'error'); assert.equal(msg.From.Email, env.MAILJET_FROM_EMAIL); assert.deepEqual(msg.To, [{ Email: env.MAILJET_TO_EMAIL }]); assert.deepEqual(msg.ReplyTo, { Email: fields.email, Name: fields.name }); assert.match(msg.Subject, new RegExp(lang.toUpperCase())); assert.ok(msg.TextPart.includes(fields.message)); assert.equal(msg.HTMLPart, undefined); assert.equal(body.SandboxMode, undefined);
});
test('optional subject/message preserve original form contract; Arabic names and message are valid', () => {
  assert.deepEqual(validateContact({ name: 'محمد', email: fields.email, message: 'مرحباً\nأرغب في التواصل' }, 'ar'), {});
  assert.deepEqual(validateContact({ name: fields.name, email: fields.email }), {});
});
for (const [label, change] of [['missing name', { name: '' }], ['invalid email', { email: 'not-email' }], ['header injection', { subject: 'Hi\r\nBcc: other@example.test' }], ['non-string field', { name: {} }], ['oversized message', { message: 'x'.repeat(5001) }]]) test(`${label}: validation prevents Mailjet calls`, async () => {
  const f = fixture(), s = await session(f, 'ar'), r = await submit(f, s, { ...fields, ...change }); assert.equal(r.status, 422); const body = await r.json(); assert.equal(body.message, messages.ar.review); assert.ok(Object.keys(body.errors).length); assert.equal(f.calls.length, 0);
});
test('missing Mailjet setup stays unavailable without false success or outbound requests', async () => {
  const f = fixture({ env: { CONTACT_FORM_SECRET: env.CONTACT_FORM_SECRET } }), s = await session(f); assert.equal(s.configured, false);
  const r = await submit(f, s); assert.equal(r.status, 503); assert.equal((await r.json()).ok, false); assert.equal(f.calls.length, 0);
  const noSecret = fixture({ env: {} }); assert.equal((await noSecret.handler(new Request(`${origin}/api/contact`))).status, 503);
});
test('origin, signed token, language binding, expiry and honeypot prevent sends', async () => {
  const f = fixture(), s = await session(f);
  assert.equal((await submit(f, s, fields, {}, { Origin: 'https://attacker.example' })).status, 403);
  assert.equal((await submit(f, s, fields, {}, { 'sec-fetch-site': 'cross-site' })).status, 403);
  assert.equal((await submit(f, s, fields, { csrf: 'forged' })).status, 403);
  assert.equal((await submit(f, { ...s, lang: 'ar' })).status, 403);
  assert.equal((await submit(f, s, fields, { website: 'bot.example' })).status, 422);
  f.advance(7200001); assert.equal((await submit(f, s)).status, 403); assert.equal(f.calls.length, 0);
});
test('body/method constraints reject oversized and malformed requests', async () => {
  const f = fixture(), s = await session(f);
  assert.equal((await submit(f, s, { ...fields, message: 'x'.repeat(34000) })).status, 413);
  assert.equal((await submit(f, s, fields, {}, { 'Content-Type': 'text/plain' })).status, 415);
  assert.equal((await submit(f, s, fields, { fields: [] })).status, 400);
  assert.equal((await f.handler(new Request(`${origin}/api/contact`, { method: 'DELETE' }))).status, 405); assert.equal(f.calls.length, 0);
});
test('concurrent duplicate requests send only once', async () => {
  const f = fixture(), s = await session(f); const results = await Promise.all([submit(f, s), submit(f, s)]); assert.deepEqual(results.map(x => x.status), [200, 200]); assert.equal(f.calls.length, 1);
});
test('fourth valid submission from one IP is throttled', async () => {
  const f = fixture(), s = await session(f); for (let i = 0; i < 3; i++) assert.equal((await submit(f, { ...s, requestId: randomUUID() })).status, 200);
  assert.equal((await submit(f, { ...s, requestId: randomUUID() })).status, 429); assert.equal(f.calls.length, 3);
});
for (const [label, response] of [
  ['HTTP error', () => Response.json({ ErrorMessage: 'private details' }, { status: 401 })],
  ['message-level error', () => Response.json({ Messages: [{ Status: 'error', Errors: [{ ErrorMessage: 'private details' }] }] })],
  ['sandbox response without delivery ID', () => Response.json({ Messages: [{ Status: 'success', To: [{ MessageID: 0 }] }] })],
  ['malformed response', () => new Response('<html>private details</html>')],
  ['network failure', () => { throw Error('private details'); }],
]) test(`${label}: never reports success or leaks errors, and duplicate retry is not re-sent`, async () => {
  const f = fixture({ response }), s = await session(f); const r = await submit(f, s); assert.equal(r.status, 502); assert.deepEqual(await r.json(), { ok: false, message: messages.en.uncertain }); assert.equal((await submit(f, s)).status, 502); assert.equal(f.calls.length, 1);
});
