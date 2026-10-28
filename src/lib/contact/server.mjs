import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import { messages, validEmail, validateContact, limits } from './validation.mjs';
const cookieName = 'fxem_contact';
const endpoint = 'https://api.mailjet.com/v3.1/send';
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}
export function createContactHandler({ env = process.env, fetchImpl = fetch, now = () => Date.now(), random = () => randomBytes(24).toString('base64url') } = {}) {
  const rates = new Map(), submissions = new Map();
  const sign = value => createHmac('sha256', env.CONTACT_FORM_SECRET).update(value).digest('base64url');
  function clean(map, max) {
    for (const [key, value] of map) if (value.expires <= now()) map.delete(key);
    while (map.size > max) map.delete(map.keys().next().value);
  }
  function limited(key, max, duration) {
    clean(rates, 2000);
    const rate = rates.get(key) || { count: 0, expires: now() + duration };
    rates.set(key, rate); return ++rate.count > max;
  }
  function configured() {
    return Boolean(env.MAILJET_API_KEY && env.MAILJET_SECRET_KEY && validEmail(env.MAILJET_FROM_EMAIL) && validEmail(env.MAILJET_TO_EMAIL));
  }
  function token(language, nonce) {
    const data = Buffer.from(JSON.stringify({ language, nonce, expires: now() + 7200000 })).toString('base64url');
    return `${data}.${sign(data)}`;
  }
  function validToken(value, language, nonce) {
    try {
      if (typeof value !== 'string' || value.length > 1000) return false;
      const [data, signature, extra] = value.split('.'), a = Buffer.from(sign(data)), b = Buffer.from(signature || '');
      if (extra || a.length !== b.length || !timingSafeEqual(a, b)) return false;
      const body = JSON.parse(Buffer.from(data, 'base64url').toString());
      return body.language === language && body.nonce === nonce && body.expires > now() && body.expires <= now() + 7200000;
    } catch { return false; }
  }
  return async function handle(request, clientAddress) {
    const url = new URL(request.url), language = url.searchParams.get('lang') === 'ar' ? 'ar' : 'en', t = messages[language];
    const fail = (message, status, headers) => json({ ok: false, message }, status, headers);
    if (!['GET', 'POST'].includes(request.method)) return fail(t.invalid, 405, { Allow: 'GET, POST' });
    if (!env.CONTACT_FORM_SECRET || env.CONTACT_FORM_SECRET.length < 32) return fail(t.unavailable, 503);
    if (request.headers.get('sec-fetch-site') === 'cross-site' || (request.headers.get('origin') && request.headers.get('origin') !== url.origin) || (request.method === 'POST' && request.headers.get('origin') !== url.origin)) return fail(t.expired, 403);
    const ip = sign(clientAddress || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local');
    if (limited(`${ip}:${request.method}`, request.method === 'GET' ? 60 : 30, 60000)) return fail(t.limited, 429, { 'Retry-After': '60' });
    const rawNonce = request.headers.get('cookie')?.split(';').map(x => x.trim()).find(x => x.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    const nonce = /^[a-zA-Z0-9_-]{32}$/.test(rawNonce || '') ? rawNonce : null;
    if (request.method === 'GET') {
      const session = nonce || random();
      return json({ ok: true, configured: configured(), csrf: token(language, session), ...(!configured() ? { message: t.unavailable } : {}) }, 200, { 'Set-Cookie': `${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/api/contact; Max-Age=7200${url.protocol === 'https:' ? '; Secure' : ''}` });
    }
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return fail(t.invalid, 415);
    let input;
    try {
      const reader = request.body?.getReader(); if (!reader) throw Error();
      const chunks = []; let length = 0;
      for (;;) { const { value, done } = await reader.read(); if (done) break; length += value.byteLength; if (length > 32768) { await reader.cancel(); return fail(t.long, 413); } chunks.push(Buffer.from(value)); }
      input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { return fail(t.invalid, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input) || !nonce || !validToken(input.csrf, language, nonce)) return fail(t.expired, 403);
    if (input.website) return fail(t.invalid, 422);
    if (!input.fields || typeof input.fields !== 'object' || Array.isArray(input.fields) || typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.requestId)) return fail(t.invalid, 400);
    const errors = validateContact(input.fields, language);
    if (Object.keys(errors).length) return json({ ok: false, message: t.review, errors }, 422);
    if (!configured()) return fail(t.unavailable, 503);
    const fields = Object.fromEntries(Object.keys(limits).map(key => [key, (input.fields[key] || '').trim()]));
    clean(submissions, 1000);
    const key = sign(`${language}:${nonce}:${input.requestId}`), existing = submissions.get(key);
    if (existing) { const result = await existing.promise; return json(result.body, result.status); }
    if (limited(`send:${ip}`, 3, 600000)) return fail(t.limited, 429, { 'Retry-After': '600' });
    const promise = (async () => {
      try {
        const response = await fetchImpl(endpoint, {
          method: 'POST', redirect: 'error', signal: AbortSignal.timeout(20000),
          headers: { Authorization: `Basic ${Buffer.from(`${env.MAILJET_API_KEY}:${env.MAILJET_SECRET_KEY}`).toString('base64')}`, 'Content-Type': 'application/json', Accept: 'application/json' },
          body: JSON.stringify({ Messages: [{ From: { Email: env.MAILJET_FROM_EMAIL, Name: 'FXEM' }, To: [{ Email: env.MAILJET_TO_EMAIL }], ReplyTo: { Email: fields.email, Name: fields.name }, Subject: `[FXEM Contact ${language.toUpperCase()}] ${fields.subject || 'Website enquiry'}`, TextPart: `Language: ${language}\nName: ${fields.name}\nEmail: ${fields.email}\nSubject: ${fields.subject}\n\n${fields.message}` }] }),
        });
        const result = await response.json();
        if (!response.ok || result?.Messages?.length !== 1 || result.Messages[0].Status !== 'success' || !result.Messages[0].To?.[0]?.MessageID) return { status: 502, body: { ok: false, message: t.uncertain } };
        return { status: 200, body: { ok: true, message: t.success } };
      } catch { return { status: 502, body: { ok: false, message: t.uncertain } }; }
    })();
    submissions.set(key, { promise, expires: now() + 600000 });
    const result = await promise; return json(result.body, result.status);
  };
}
export const handleContact = createContactHandler();
