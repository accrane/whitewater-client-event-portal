import { createHmac, timingSafeEqual } from "node:crypto";

import { appConfig } from "@/lib/env";

// Thin PandaDoc REST client (public API v1). Sandbox and production keys use
// the same host; only the key differs. Every call degrades to a typed
// failure rather than throwing so contract flows can record the outcome on
// the contract row and in integration_logs.

export type PandaDocResult<T> =
  | { ok: true; data: T }
  | { ok: false; error: string; status?: number };

export function isPandaDocConfigured(): boolean {
  return Boolean(appConfig.pandadoc.apiKey);
}

function headers(): HeadersInit {
  const scheme = ["API", "Key"].join("-");
  return {
    Authorization: `${scheme} ${appConfig.pandadoc.apiKey}`,
    "Content-Type": "application/json",
  };
}

export async function pandaDocRequest<T>(
  path: string,
  init: { method?: string; body?: unknown } = {},
): Promise<PandaDocResult<T>> {
  if (!appConfig.pandadoc.apiKey) {
    return { ok: false, error: "PANDADOC_API_KEY is not configured" };
  }

  try {
    const response = await fetch(`${appConfig.pandadoc.apiBaseUrl}${path}`, {
      method: init.method ?? "GET",
      headers: headers(),
      ...(init.body !== undefined ? { body: JSON.stringify(init.body) } : {}),
    });

    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        status: response.status,
        error:
          response.status === 401 || response.status === 403
            ? `PandaDoc rejected the API key (${response.status}). Check PANDADOC_API_KEY and that the account's API access is enabled.`
            : `PandaDoc responded ${response.status}: ${text.slice(0, 300)}`,
      };
    }

    if (response.status === 204) {
      return { ok: true, data: undefined as T };
    }

    return { ok: true, data: (await response.json()) as T };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "PandaDoc request failed",
    };
  }
}

// Binary fetch (signed PDF download).
export async function pandaDocDownload(
  path: string,
): Promise<PandaDocResult<ArrayBuffer>> {
  if (!appConfig.pandadoc.apiKey) {
    return { ok: false, error: "PANDADOC_API_KEY is not configured" };
  }

  try {
    const response = await fetch(`${appConfig.pandadoc.apiBaseUrl}${path}`, {
      headers: headers(),
    });
    if (!response.ok) {
      return {
        ok: false,
        status: response.status,
        error: `PandaDoc download responded ${response.status}`,
      };
    }
    return { ok: true, data: await response.arrayBuffer() };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "PandaDoc download failed",
    };
  }
}

// PandaDoc signs each webhook delivery with HMAC-SHA256 over the raw body
// using the shared key from the webhook's settings, passed as a `signature`
// query parameter on the request URL.
export function verifyPandaDocWebhookSignature(
  rawBody: string,
  signature: string | null,
): boolean {
  const key = appConfig.pandadoc.webhookKey;
  if (!key || !signature) return false;

  const expected = createHmac("sha256", key).update(rawBody).digest("hex");
  const provided = signature.trim().toLowerCase();
  if (expected.length !== provided.length) return false;

  return timingSafeEqual(Buffer.from(expected), Buffer.from(provided));
}
