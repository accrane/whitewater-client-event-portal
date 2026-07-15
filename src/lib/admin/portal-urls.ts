export function buildPortalPath(token: string): string {
  return `/e/${encodeURIComponent(token)}`;
}

export function buildPortalUrl(portalBaseUrl: string, token: string): string {
  const normalizedBaseUrl = portalBaseUrl.replace(/\/+$/, "");

  return `${normalizedBaseUrl}${buildPortalPath(token)}`;
}

export function normalizeStoredPortalPath(portalUrl: string | null): string | null {
  const trimmedUrl = portalUrl?.trim();

  if (!trimmedUrl) {
    return null;
  }

  if (trimmedUrl.startsWith("/")) {
    return trimmedUrl;
  }

  try {
    const url = new URL(trimmedUrl);

    return `${url.pathname}${url.search}${url.hash}`;
  } catch {
    return trimmedUrl;
  }
}

export function buildPortalUrlForOrigin({
  origin,
  portalUrl,
}: {
  origin: string;
  portalUrl: string | null;
}): string | null {
  const path = normalizeStoredPortalPath(portalUrl);

  if (!path) {
    return null;
  }

  if (!path.startsWith("/")) {
    return path;
  }

  return `${origin.replace(/\/+$/, "")}${path}`;
}
