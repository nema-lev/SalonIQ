export function normalizeHostname(host: string | null | undefined) {
  return (host || '').trim().toLowerCase().split(':')[0];
}

export function normalizeSlug(slug: string | null | undefined) {
  const next = (slug || '').trim().toLowerCase();
  return next || null;
}

export function normalizeHostList(hosts: readonly string[] | string | null | undefined) {
  const entries: readonly string[] = Array.isArray(hosts)
    ? hosts
    : typeof hosts === 'string'
      ? hosts.split(',')
      : [];
  return entries
    .map((entry: string) => normalizeHostname(entry))
    .filter((entry: string): entry is string => Boolean(entry));
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

function extractUrlHostname(value: string | null | undefined) {
  const normalizedValue = (value || '').trim();
  if (!normalizedValue) return null;

  try {
    return normalizeHostname(new URL(normalizedValue).hostname);
  } catch {
    return normalizeHostname(normalizedValue);
  }
}

function isPlatformHost(host: string | null | undefined, platformHosts: readonly string[] | string | null | undefined) {
  const hostname = normalizeHostname(host);
  if (!hostname) return false;

  return normalizeHostList(platformHosts).includes(hostname);
}

function isCrossHostRequest(
  host: string | null | undefined,
  originHost: string | null | undefined,
  referer: string | null | undefined,
) {
  const hostname = normalizeHostname(host);
  if (!hostname) return false;

  const relatedHosts = [extractUrlHostname(originHost), extractUrlHostname(referer)];
  return relatedHosts.some((relatedHost) => Boolean(relatedHost && relatedHost !== hostname));
}

function isUuid(value: string | null | undefined) {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    (value || '').trim(),
  );
}

export type TenantResolutionInput = {
  host?: string | null;
  appDomain?: string | null;
  headerSlug?: string | null;
  defaultTenantSlug?: string | null;
  queryTenantSlug?: string | null;
  originHost?: string | null;
  referer?: string | null;
  authenticatedTenantId?: string | null;
  platformHosts?: readonly string[] | string | null;
};

export type TenantResolutionCandidate =
  | { type: 'tenant-id'; value: string; source: 'auth' }
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
  const explicitSlugCandidate = resolveExplicitSlugCandidate(
    input.headerSlug,
    input.queryTenantSlug,
    input.defaultTenantSlug,
  );

  if (subdomainSlug) {
    return { type: 'slug', value: subdomainSlug, source: 'subdomain' };
  }

  const authenticatedTenantId = isUuid(input.authenticatedTenantId)
    ? input.authenticatedTenantId!.trim()
    : null;
  const shouldPreferExplicitTenantContext =
    shouldSkipCustomDomainLookup(hostname, input.appDomain) ||
    isPlatformHost(hostname, input.platformHosts) ||
    isCrossHostRequest(hostname, input.originHost, input.referer);

  if (shouldPreferExplicitTenantContext && authenticatedTenantId) {
    return { type: 'tenant-id', value: authenticatedTenantId, source: 'auth' };
  }

  if (shouldPreferExplicitTenantContext && explicitSlugCandidate) {
    return explicitSlugCandidate;
  }

  if (hostname && !shouldSkipCustomDomainLookup(hostname, input.appDomain)) {
    return { type: 'custom-domain', value: hostname, source: 'custom-domain' };
  }

  if (authenticatedTenantId) {
    return { type: 'tenant-id', value: authenticatedTenantId, source: 'auth' };
  }

  return explicitSlugCandidate;
}
