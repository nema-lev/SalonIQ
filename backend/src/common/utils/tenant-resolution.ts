export function normalizeHostname(host: string | null | undefined) {
  return (host || '').trim().toLowerCase().split(':')[0];
}

export function normalizeSlug(slug: string | null | undefined) {
  const next = (slug || '').trim().toLowerCase();
  return next || null;
}

export function extractKnownSubdomainSlug(
  host: string | null | undefined,
  appDomain: string | null | undefined,
) {
  const hostname = normalizeHostname(host);
  const domain = normalizeHostname(appDomain);

  if (!hostname || !domain) return null;
  if (!hostname.endsWith(`.${domain}`)) return null;

  const slug = hostname.slice(0, -1 * (`.${domain}`.length));
  return normalizeSlug(slug);
}

export function shouldSkipCustomDomainLookup(host: string | null | undefined) {
  const hostname = normalizeHostname(host);

  if (!hostname) return true;
  if (hostname === 'localhost') return true;
  if (hostname === '127.0.0.1') return true;
  if (hostname === '0.0.0.0') return true;

  return false;
}

export type TenantResolutionInput = {
  host?: string | null;
  appDomain?: string | null;
  headerSlug?: string | null;
  defaultTenantSlug?: string | null;
  queryTenantSlug?: string | null;
};

export type TenantResolutionCandidate =
  | { type: 'slug'; value: string; source: 'subdomain' | 'header' | 'default-env' | 'query' }
  | { type: 'custom-domain'; value: string; source: 'custom-domain' };

export function resolveTenantCandidate(input: TenantResolutionInput): TenantResolutionCandidate | null {
  const hostname = normalizeHostname(input.host);
  const subdomainSlug = extractKnownSubdomainSlug(hostname, input.appDomain);

  if (subdomainSlug) {
    return { type: 'slug', value: subdomainSlug, source: 'subdomain' };
  }

  if (hostname && !shouldSkipCustomDomainLookup(hostname)) {
    return { type: 'custom-domain', value: hostname, source: 'custom-domain' };
  }

  const headerSlug = normalizeSlug(input.headerSlug);
  if (headerSlug) {
    return { type: 'slug', value: headerSlug, source: 'header' };
  }

  const defaultTenantSlug = normalizeSlug(input.defaultTenantSlug);
  if (defaultTenantSlug) {
    return { type: 'slug', value: defaultTenantSlug, source: 'default-env' };
  }

  const queryTenantSlug = normalizeSlug(input.queryTenantSlug);
  if (queryTenantSlug) {
    return { type: 'slug', value: queryTenantSlug, source: 'query' };
  }

  return null;
}
