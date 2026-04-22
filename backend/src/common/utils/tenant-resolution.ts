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

export function shouldSkipCustomDomainLookup(
  host: string | null | undefined,
  appDomain: string | null | undefined,
) {
  const hostname = normalizeHostname(host);
  const domain = normalizeHostname(appDomain);

  if (!hostname) return true;
  if (hostname === 'localhost') return true;
  if (hostname === '127.0.0.1') return true;
  if (hostname === '0.0.0.0') return true;
  if (domain && hostname === domain) return true;
  if (hostname.endsWith('.vercel.app')) return true;

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

function resolveExplicitSlugCandidate(
  headerSlug: string | null | undefined,
  queryTenantSlug: string | null | undefined,
  defaultTenantSlug: string | null | undefined,
) {
  const normalizedHeaderSlug = normalizeSlug(headerSlug);
  if (normalizedHeaderSlug) {
    return { type: 'slug', value: normalizedHeaderSlug, source: 'header' } as const;
  }

  const normalizedQueryTenantSlug = normalizeSlug(queryTenantSlug);
  if (normalizedQueryTenantSlug) {
    return { type: 'slug', value: normalizedQueryTenantSlug, source: 'query' } as const;
  }

  const normalizedDefaultTenantSlug = normalizeSlug(defaultTenantSlug);
  if (normalizedDefaultTenantSlug) {
    return { type: 'slug', value: normalizedDefaultTenantSlug, source: 'default-env' } as const;
  }

  return null;
}

export function resolveTenantCandidate(input: TenantResolutionInput): TenantResolutionCandidate | null {
  const hostname = normalizeHostname(input.host);
  const subdomainSlug = extractKnownSubdomainSlug(hostname, input.appDomain);

  if (subdomainSlug) {
    return { type: 'slug', value: subdomainSlug, source: 'subdomain' };
  }

  if (hostname && !shouldSkipCustomDomainLookup(hostname, input.appDomain)) {
    return { type: 'custom-domain', value: hostname, source: 'custom-domain' };
  }

  return resolveExplicitSlugCandidate(
    input.headerSlug,
    input.queryTenantSlug,
    input.defaultTenantSlug,
  );
}

export function resolveInternalTenantCandidate(input: TenantResolutionInput): TenantResolutionCandidate | null {
  const hostname = normalizeHostname(input.host);
  const subdomainSlug = extractKnownSubdomainSlug(hostname, input.appDomain);

  if (subdomainSlug) {
    return { type: 'slug', value: subdomainSlug, source: 'subdomain' };
  }

  const explicitSlugCandidate = resolveExplicitSlugCandidate(
    input.headerSlug,
    input.queryTenantSlug,
    input.defaultTenantSlug,
  );
  if (explicitSlugCandidate) {
    return explicitSlugCandidate;
  }

  if (hostname && !shouldSkipCustomDomainLookup(hostname, input.appDomain)) {
    return { type: 'custom-domain', value: hostname, source: 'custom-domain' };
  }

  return null;
}
