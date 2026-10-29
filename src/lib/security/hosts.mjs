// Trust only this site's public hostnames and exact Vercel-provided deployment
// aliases. Never trust every *.vercel.app host or disable the origin check.
export function allowedDomains(env = process.env) {
  const hosts = new Set(['sv.fxem.com', 'sv-fxem.vercel.app']);
  for (const key of ['VERCEL_URL', 'VERCEL_BRANCH_URL', 'VERCEL_PROJECT_PRODUCTION_URL']) {
    const host = env[key];
    if (typeof host === 'string' && /^[a-z0-9][a-z0-9.-]*\.vercel\.app$/i.test(host)) hosts.add(host.toLowerCase());
  }
  const patterns = [...hosts].map(hostname => ({ hostname, protocol: 'https' }));
  if (env.VERCEL !== '1') patterns.push({ hostname: 'localhost', protocol: 'http' }, { hostname: '127.0.0.1', protocol: 'http' });
  return patterns;
}
