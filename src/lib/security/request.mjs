// Rebuilds the request URL from the forwarded host only when that host is on
// the allowlist (as Astro's security.allowedDomains did). Unknown hosts get a
// localhost origin, so the same-origin checks in the form handlers reject them.
import { allowedDomains } from './hosts.mjs';

export function trustedRequest(request, env = process.env) {
  const url = new URL(request.url);
  const headers = request.headers;
  const host = (headers.get('x-forwarded-host') || headers.get('host') || '').split(',')[0].trim().toLowerCase();
  const proto = (headers.get('x-forwarded-proto') || url.protocol.replace(':', '')).split(',')[0].trim();
  const hostname = host.replace(/:\d+$/, '');
  const trusted = allowedDomains(env).some(p => p.hostname === hostname && p.protocol === proto);
  const origin = trusted ? `${proto}://${host}` : 'http://localhost';
  return new Request(origin + url.pathname + url.search, {
    method: request.method, headers, body: ['GET', 'HEAD'].includes(request.method) ? undefined : request.body,
    duplex: 'half', signal: request.signal,
  });
}

export function clientAddress(request) {
  return request.headers.get('x-real-ip') || request.headers.get('x-forwarded-for')?.split(',')[0].trim() || undefined;
}
