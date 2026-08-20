import { appConfig } from "@/lib/env";

// Read-only Salesforce client for the SF → GHL contact migration
// (docs/ecosystem-manual.md §4). Auth is the OAuth client-credentials flow
// against the "Contact Export" External Client App; the token's run-as user
// only needs read access.

const API_VERSION = "v67.0";

type TokenResponse = {
  access_token?: string;
  instance_url?: string;
  error?: string;
  error_description?: string;
};

type CachedToken = {
  accessToken: string;
  instanceUrl: string;
  fetchedAt: number;
};

// Session tokens last hours; refresh well before that to stay clear of
// org session-timeout settings.
const TOKEN_TTL_MS = 30 * 60 * 1000;

let cachedToken: CachedToken | null = null;

async function getToken(): Promise<CachedToken> {
  if (cachedToken && Date.now() - cachedToken.fetchedAt < TOKEN_TTL_MS) {
    return cachedToken;
  }

  const { domain, clientId, clientSecret } = appConfig.salesforce;
  if (!domain || !clientId || !clientSecret) {
    throw new Error("Salesforce env vars are not configured");
  }

  const response = await fetch(`${domain}/services/oauth2/token`, {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded" },
    body: new URLSearchParams({
      grant_type: "client_credentials",
      client_id: clientId,
      client_secret: clientSecret,
    }),
  });

  const data = (await response.json()) as TokenResponse;
  if (!response.ok || !data.access_token || !data.instance_url) {
    throw new Error(
      `Salesforce token request failed (${response.status}): ${
        data.error_description || data.error || "unknown error"
      }`,
    );
  }

  cachedToken = {
    accessToken: data.access_token,
    instanceUrl: data.instance_url,
    fetchedAt: Date.now(),
  };
  return cachedToken;
}

export type SoqlRecord = Record<string, unknown>;

type QueryResponse = {
  totalSize?: number;
  done?: boolean;
  nextRecordsUrl?: string;
  records?: SoqlRecord[];
};

// Runs a SOQL query and follows nextRecordsUrl pagination until done,
// invoking onBatch for each page so callers can stream large result sets
// without holding everything in memory.
export async function querySoql(
  soql: string,
  onBatch: (records: SoqlRecord[]) => Promise<void>,
): Promise<number> {
  const { accessToken, instanceUrl } = await getToken();
  let url = `${instanceUrl}/services/data/${API_VERSION}/query?q=${encodeURIComponent(soql)}`;
  let total = 0;

  while (url) {
    const response = await fetch(url, {
      headers: { Authorization: `Bearer ${accessToken}` },
    });
    if (!response.ok) {
      const body = await response.text();
      throw new Error(
        `Salesforce query failed (${response.status}): ${body.slice(0, 500)}`,
      );
    }

    const data = (await response.json()) as QueryResponse;
    const records = data.records ?? [];
    total += records.length;
    if (records.length > 0) {
      await onBatch(records);
    }

    url = data.nextRecordsUrl
      ? `${instanceUrl}${data.nextRecordsUrl}`
      : "";
  }

  return total;
}
