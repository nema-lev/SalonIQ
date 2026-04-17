function normalizeHostname(host: string | null | undefined) {
  return (host || '').trim().toLowerCase().split(':')[0];
}

function normalizeSlug(slug: string | null | undefined) {
  const next = (slug || '').trim().toLowerCase();
  return next || null;
}

export function extractKnownSubdomainSlug(host: string | null | undefined, appDomain: string | null | undefined) {
  const hostname = normalizeHostname(host);
  const domain = normalizeHostname(appDomain);

  if (!hostname || !domain) return null;
  if (!hostname.endsWith(`.${domain}`)) return null;

  const slug = hostname.slice(0, -1 * (`.${domain}`.length));
  return normalizeSlug(slug);
}

export function resolveBrowserTenantSlug(options: {
  pathname: string;
  hostname: string;
  appDomain?: string;
  defaultTenantSlug?: string;
  storedTenantSlug?: string | null;
}) {
  const { pathname, hostname, appDomain, defaultTenantSlug, storedTenantSlug } = options;
  const isPlatformPath = pathname.startsWith('/platform');
  if (isPlatformPath) return null;

  const subdomainSlug = extractKnownSubdomainSlug(hostname, appDomain);
  if (subdomainSlug) return subdomainSlug;

  if (pathname.startsWith('/admin')) {
    const adminStoredSlug = normalizeSlug(storedTenantSlug);
    if (adminStoredSlug) return adminStoredSlug;
  }

  return normalizeSlug(defaultTenantSlug);
}

export function resolveServerTenantFallbackSlug(options: {
  host: string;
  appDomain?: string;
  defaultTenantSlug?: string;
}) {
  const { host, appDomain, defaultTenantSlug } = options;
  const subdomainSlug = extractKnownSubdomainSlug(host, appDomain);
  if (subdomainSlug) return null;
  return normalizeSlug(defaultTenantSlug);
}

