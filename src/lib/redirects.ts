// Redirects served by the proxy: the `redirects` table (admin-managed rules
// and page path changes) plus fixed rules for retired WordPress URLs.
import { env } from "@/lib/env";

type Rule = { destination: string; permanent: boolean };

const TTL_MS = 60_000;
let cache: { rules: Map<string, Rule>; expires: number } | null = null;
let loading: Promise<Map<string, Rule>> | null = null;

async function loadRules(): Promise<Map<string, Rule>> {
  const res = await fetch(
    `${env.supabaseUrl}/rest/v1/redirects?select=source,destination,permanent`,
    {
      headers: { apikey: env.supabasePublishableKey },
      cache: "no-store",
    },
  );
  if (!res.ok) throw new Error(`redirects: HTTP ${res.status}`);
  const rows = (await res.json()) as {
    source: string;
    destination: string;
    permanent: boolean;
  }[];
  return new Map(
    rows.map((r) => [
      normalize(r.source),
      { destination: r.destination, permanent: r.permanent },
    ]),
  );
}

// Cached per server instance; a failed refresh keeps the previous rules.
async function tableRules(): Promise<Map<string, Rule>> {
  if (cache && cache.expires > Date.now()) return cache.rules;
  loading ??= loadRules()
    .then((rules) => {
      cache = { rules, expires: Date.now() + TTL_MS };
      return rules;
    })
    .catch((error) => {
      console.error(error);
      if (cache) cache.expires = Date.now() + TTL_MS;
      return cache?.rules ?? new Map<string, Rule>();
    })
    .finally(() => {
      loading = null;
    });
  return loading;
}

function normalize(path: string) {
  const p = path.toLowerCase();
  return p.endsWith("/") ? p : `${p}/`;
}

// WordPress URLs with no page of their own on the new site.
function legacyRule(path: string): Rule | null {
  if (/^\/(sitemap_index|[a-z_]+-sitemap\d*)\.xml$/.test(path))
    return { destination: "/sitemap.xml", permanent: true };
  if (path === "/wp-login.php" || path.startsWith("/wp-admin"))
    return { destination: "/admin/", permanent: false };
  if (/\/feed\/$/.test(path)) return { destination: "/", permanent: true };
  return null;
}

export async function findRedirect(pathname: string): Promise<Rule | null> {
  const legacy = legacyRule(pathname);
  if (legacy) return legacy;
  if (/^\/(_next|api|admin|auth)\//.test(pathname)) return null;
  const rule = (await tableRules()).get(normalize(pathname));
  return rule && normalize(rule.destination) !== normalize(pathname)
    ? rule
    : null;
}
