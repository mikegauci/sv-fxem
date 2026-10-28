import { createHmac, randomBytes, timingSafeEqual } from 'node:crypto';
import schemas from './schemas.json' with { type: 'json' };
import { marketingNames } from './dictionaries.mjs';
import { checked, validateFields } from './validation.mjs';

const upstream = 'https://api.pro.we.01.currentdesk.com';
const contracts = {
  live: { path: '/registration/client/individual', category: 1, demo: 'true', redirect: '/live-account-created-successfully/' },
  demo: { path: '/registration/lead', category: 1, demo: 'false', redirect: '/demo-account-created-successfully/' },
  partner: { path: '/registration/partner/individual', category: 2, demo: 'true' },
};
const genericError = 'CurrentDesk could not accept these details. Please review the form and try again.';
const uncertainError = 'We could not confirm whether your request completed. Please check your email before submitting again.';
function json(body, status = 200, extra = {}) {
  return new Response(JSON.stringify(body), { status, headers: { 'Content-Type': 'application/json; charset=utf-8', 'Cache-Control': 'no-store', 'X-Content-Type-Options': 'nosniff', ...extra } });
}
function safeMessage(value) {
  if (typeof value !== 'string' || value.length > 300 || /[<>]|password|authorization|token|exception|stack|Basic\s/i.test(value)) return genericError;
  return value.replace(/[\x00-\x1f]/g, ' ').trim() || genericError;
}
export function buildPayload(kind, values) {
  const payload = {};
  for (const field of schemas[kind].fields) {
    if (field.name === 'english-status') continue;
    const value = values[field.name];
    payload[field.name] = typeof value === 'string' ? (field.type === 'password' ? value : value.trim()) || null : null;
  }
  if (kind === 'live') for (const [input, output] of Object.entries(marketingNames)) {
    if (typeof values[input] === 'string' && values[input].trim()) payload[output] = values[input].trim().slice(0, 256);
  }
  // Retain the exact registration endpoints/default flags supplied in the PHP.
  // The demo form registers a lead, while live/partner register individuals.
  Object.assign(payload, {
    'account-trading-platform-id': 9, 'account-currency-id': 5,
    'account-category-id': contracts[kind].category, 'account-demo-status': contracts[kind].demo,
  });
  if (kind === 'demo') payload['lead-english-status'] = checked(values['english-status']) ? 'true' : 'false';
  else {
    payload['individual-address-months'] = 12;
    payload['account-phone-id'] = payload['individual-telephone'];
    payload['individual-mobile'] = payload['individual-telephone'];
  }
  return payload;
}
export function createCurrentDeskHandler({ fetchImpl = fetch, env = process.env, now = () => Date.now(), random = () => randomBytes(24).toString('base64url') } = {}) {
  const dictionaries = new Map(), rateLimits = new Map(), submissions = new Map();
  const sign = value => createHmac('sha256', env.CURRENTDESK_FORM_SECRET).update(value).digest('base64url');
  function trimMap(map, limit) {
    for (const [key, value] of map) if (value.expires <= now()) map.delete(key);
    while (map.size > limit) map.delete(map.keys().next().value);
  }
  function limited(key, max, duration) {
    trimMap(rateLimits, 2000);
    const entry = rateLimits.get(key) || { count: 0, expires: now() + duration };
    rateLimits.set(key, entry);
    return ++entry.count > max;
  }
  function token(kind, nonce) {
    const body = Buffer.from(JSON.stringify({ kind, nonce, expires: now() + 7200000 })).toString('base64url');
    return `${body}.${sign(body)}`;
  }
  function tokenValid(value, kind, nonce) {
    try {
      if (typeof value !== 'string' || value.length > 1000) return false;
      const [body, signature, extra] = value.split('.');
      const expected = Buffer.from(sign(body)), supplied = Buffer.from(signature || '');
      if (extra || supplied.length !== expected.length || !timingSafeEqual(expected, supplied)) return false;
      const data = JSON.parse(Buffer.from(body, 'base64url').toString());
      return data.kind === kind && data.nonce === nonce && data.expires > now() && data.expires <= now() + 7200000;
    } catch { return false; }
  }
  async function dictionary(kind, name, authorization) {
    const key = `${kind}:${name}`;
    const cached = dictionaries.get(key);
    if (cached && cached.expires > now()) return cached.promise;
    const suffix = name === 'preferences' ? '?trading-platform-id=9' : '';
    const promise = (async () => {
      const response = await fetchImpl(`${upstream}/dictionaries/${name}${suffix}`, { headers: { Authorization: authorization, Accept: 'application/json' }, signal: AbortSignal.timeout(15000), redirect: 'error' });
      if (!response.ok) throw Error('Dictionary unavailable');
      const body = await response.json();
      if (!Array.isArray(body) || body.length > 5000) throw Error('Invalid dictionary');
      return body.filter(item => item.Id !== undefined && item.Id !== null && typeof item.Value === 'string').map(item => ({ id: String(item.Id), label: item.Value }));
    })();
    dictionaries.set(key, { promise, expires: now() + 900000 });
    try { return await promise; } catch (error) { dictionaries.delete(key); throw error; }
  }
  return async function handle(request, kind, clientAddress) {
    if (!Object.hasOwn(contracts, kind) || !schemas[kind]) return json({ ok: false, message: 'Not found.' }, 404);
    const cookieName = `fxem_registration_${kind}`;
    if (!['GET', 'POST'].includes(request.method)) return json({ ok: false, message: 'Method not allowed.' }, 405, { Allow: 'GET, POST' });
    const authorization = env[`CURRENTDESK_${kind.toUpperCase()}_AUTHORIZATION`];
    if (!authorization || !env.CURRENTDESK_FORM_SECRET || env.CURRENTDESK_FORM_SECRET.length < 32) return json({ ok: false, message: 'Registration is temporarily unavailable. Please try again later.' }, 503);
    const origin = new URL(request.url).origin;
    if (request.headers.get('sec-fetch-site') === 'cross-site' || (request.headers.get('origin') && request.headers.get('origin') !== origin) || (request.method === 'POST' && request.headers.get('origin') !== origin)) return json({ ok: false, message: 'Please submit this form from the FXEM website.' }, 403);
    const ip = sign(clientAddress || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || 'local');
    if (limited(`${kind}:${ip}:${request.method}`, request.method === 'GET' ? 60 : 30, 60000)) return json({ ok: false, message: 'Too many requests. Please wait a minute and try again.' }, 429, { 'Retry-After': '60' });
    const schema = schemas[kind];
    const names = [...new Set(schema.fields.map(field => field.dictionary).filter(Boolean))];
    const rawNonce = request.headers.get('cookie')?.split(';').map(s => s.trim()).find(s => s.startsWith(cookieName + '='))?.slice(cookieName.length + 1);
    const nonce = /^[A-Za-z0-9_-]{32}$/.test(rawNonce || '') ? rawNonce : null;
    if (request.method === 'GET') {
      try {
        const lists = Object.fromEntries(await Promise.all(names.map(async name => [name, await dictionary(kind, name, authorization)])));
        const session = nonce || random();
        return json({ ok: true, csrf: token(kind, session), fields: schema.fields, dictionaries: lists }, 200, { 'Set-Cookie': `${cookieName}=${session}; HttpOnly; SameSite=Strict; Path=/api/currentdesk; Max-Age=7200${request.url.startsWith('https:') ? '; Secure' : ''}` });
      } catch { return json({ ok: false, message: 'Unable to load form options. Please try again shortly.' }, 503); }
    }
    if (!/^application\/json(?:;|$)/i.test(request.headers.get('content-type') || '')) return json({ ok: false, message: 'Please use the form to submit your request.' }, 415);
    let input;
    try {
      const reader = request.body?.getReader();
      if (!reader) throw Error('Missing body');
      const chunks = []; let size = 0;
      for (;;) {
        const { value, done } = await reader.read();
        if (done) break;
        size += value.byteLength;
        if (size > 65536) { await reader.cancel(); return json({ ok: false, message: 'The request is too large.' }, 413); }
        chunks.push(Buffer.from(value));
      }
      input = JSON.parse(Buffer.concat(chunks).toString('utf8'));
    } catch { return json({ ok: false, message: 'Invalid request.' }, 400); }
    if (!input || typeof input !== 'object' || Array.isArray(input) || !nonce || !tokenValid(input.csrf, kind, nonce)) return json({ ok: false, message: 'Your form session expired. Reload the page and try again.' }, 403);
    if (input.website) return json({ ok: false, message: 'Unable to submit this request.' }, 422);
    if (!input.fields || typeof input.fields !== 'object' || Array.isArray(input.fields) || typeof input.requestId !== 'string' || !/^[a-f0-9-]{36}$/i.test(input.requestId)) return json({ ok: false, message: 'Invalid request.' }, 400);
    const fields = input.fields;
    const errors = validateFields(schema.fields, fields, new Date(now()));
    if (Object.keys(errors).length) return json({ ok: false, message: 'Please review the highlighted fields.', errors }, 422);
    try {
      const lists = Object.fromEntries(await Promise.all(names.map(async name => [name, await dictionary(kind, name, authorization)])));
      for (const field of schema.fields) if (field.dictionary && fields[field.name] && !lists[field.dictionary].some(item => item.id === fields[field.name])) errors[field.name] = 'Please select a valid option.';
      if (Object.keys(errors).length) return json({ ok: false, message: 'Please review the highlighted fields.', errors }, 422);
    } catch { return json({ ok: false, message: 'Unable to validate form options. Please try again shortly.' }, 503); }
    trimMap(submissions, 1000);
    const submissionKey = sign(`${kind}:${nonce}:${input.requestId}`);
    const existing = submissions.get(submissionKey);
    if (existing) { const result = await existing.promise; return json(result.body, result.status); }
    if (limited(`submit:${kind}:${ip}`, 5, 600000)) return json({ ok: false, message: 'Too many submissions. Please wait ten minutes and try again.' }, 429, { 'Retry-After': '600' });
    const promise = (async () => {
      try {
        const response = await fetchImpl(upstream + contracts[kind].path, { method: 'POST', headers: { Authorization: authorization, 'Content-Type': 'application/json', 'x-requested-with': 'XMLHttpRequest', Accept: 'application/json' }, body: JSON.stringify(buildPayload(kind, fields)), signal: AbortSignal.timeout(20000), redirect: 'error' });
        let result;
        try { result = response.status === 204 ? {} : await response.json(); } catch { return { status: 502, body: { ok: false, message: uncertainError } }; }
        if (!response.ok) {
          if ([400, 409, 422].includes(response.status)) return { status: 422, body: { ok: false, message: safeMessage(result?.Message || result?.message) } };
          return { status: 502, body: { ok: false, message: response.status >= 500 ? uncertainError : 'Registration is temporarily unavailable. Please try again later.' } };
        }
        if (result?.Success === false || result?.success === false || result?.IsSuccess === false || Number(result?.StatusCode || result?.status || 0) >= 400) return { status: 422, body: { ok: false, message: safeMessage(result?.Message || result?.message) } };
        return { status: 200, body: { ok: true, ...(contracts[kind].redirect ? { redirect: contracts[kind].redirect } : { message: 'Thank you, your form has been submitted! Please check your email for further info.' }) } };
      } catch { return { status: 502, body: { ok: false, message: uncertainError } }; }
    })();
    submissions.set(submissionKey, { promise, expires: now() + 600000 });
    const result = await promise;
    return json(result.body, result.status);
  };
}
export const handleCurrentDesk = createCurrentDeskHandler();
