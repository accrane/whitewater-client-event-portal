// Outbound HTTP to the vendors this app talks to (GHL, PandaDoc, Salesforce,
// Mailgun). Every request gets a timeout: a vendor that stops answering would
// otherwise hold the page, action or webhook until the platform kills it
// (Node's fetch waits about five minutes). Requests that are safe to repeat
// (GET/HEAD/PUT/DELETE) also retry briefly when the vendor says "slow down"
// (429) or blips (502/503/504); POSTs create things — notes, messages,
// documents — so they never retry. Import-free so the rules stay testable
// (tests/http/vendor-fetch.test.mjs).

export type VendorFetchOptions = {
  // Vendor name for error messages, e.g. "GHL".
  label: string;
  // Per attempt, covering the response body as well as the headers.
  timeoutMs: number;
  // Extra attempts for idempotent methods. Defaults to 2.
  maxRetries?: number;
};

const RETRYABLE_STATUSES = new Set([429, 502, 503, 504]);
// Statuses whose responses can't carry a body (the Response constructor
// refuses one).
const NULL_BODY_STATUSES = new Set([101, 204, 205, 304]);
const IDEMPOTENT_METHODS = new Set(["GET", "HEAD", "PUT", "DELETE", "OPTIONS"]);

// Waiting longer than this inside a request is worse than returning the
// 429: every caller already degrades on a non-2xx response.
export const MAX_RETRY_WAIT_MS = 5_000;

export async function vendorFetch(
  url: string,
  init: RequestInit = {},
  options: VendorFetchOptions,
): Promise<Response> {
  const method = (init.method ?? "GET").toUpperCase();
  const maxRetries = IDEMPOTENT_METHODS.has(method)
    ? (options.maxRetries ?? 2)
    : 0;

  for (let attempt = 0; ; attempt += 1) {
    const timeout = AbortSignal.timeout(options.timeoutMs);
    const signal = init.signal
      ? AbortSignal.any([init.signal, timeout])
      : timeout;

    let response: Response;
    try {
      response = await fetch(url, { ...init, signal });
    } catch (error) {
      if (timeout.aborted) {
        throw new Error(
          `${options.label} did not respond within ${options.timeoutMs / 1000}s`,
          { cause: error },
        );
      }
      throw error;
    }

    if (attempt >= maxRetries || !RETRYABLE_STATUSES.has(response.status)) {
      return labelBodyTimeout(response, timeout, options);
    }

    const wait = retryDelayMs(response.headers.get("retry-after"), attempt);
    if (wait === null) return response;

    // Free the connection before waiting.
    await response.body?.cancel().catch(() => {});
    await new Promise((resolve) => setTimeout(resolve, wait));
  }
}

// The timeout also covers reading the body. A stall there would surface
// from response.json()/text() as a bare "aborted" error with no vendor name,
// so the body is re-wrapped to fail with the same kind of labelled message.
function labelBodyTimeout(
  response: Response,
  timeout: AbortSignal,
  options: VendorFetchOptions,
): Response {
  if (!response.body || NULL_BODY_STATUSES.has(response.status)) {
    return response;
  }

  const reader = response.body.getReader();
  const body = new ReadableStream<Uint8Array>({
    async pull(controller) {
      try {
        const { done, value } = await reader.read();
        if (done) controller.close();
        else controller.enqueue(value);
      } catch (error) {
        controller.error(
          timeout.aborted
            ? new Error(
                `${options.label} did not finish responding within ${options.timeoutMs / 1000}s`,
                { cause: error },
              )
            : error,
        );
      }
    },
    cancel(reason) {
      return reader.cancel(reason);
    },
  });

  return new Response(body, {
    status: response.status,
    statusText: response.statusText,
    headers: response.headers,
  });
}

// How long to wait before retry number `attempt + 1`: the vendor's
// Retry-After (seconds or an HTTP date) when it sends one, else exponential
// backoff from 500ms, plus up to 250ms of jitter so parallel callers don't
// retry in lockstep. Null means the vendor asked for longer than we'll wait.
export function retryDelayMs(
  retryAfter: string | null,
  attempt: number,
  now: number = Date.now(),
  random: () => number = Math.random,
): number | null {
  const jitter = Math.floor(random() * 250);

  if (retryAfter && retryAfter.trim()) {
    const seconds = Number(retryAfter.trim());
    const ms = Number.isFinite(seconds)
      ? seconds * 1000
      : Date.parse(retryAfter) - now;

    if (Number.isFinite(ms)) {
      if (ms > MAX_RETRY_WAIT_MS) return null;
      return Math.max(ms, 0) + jitter;
    }
  }

  return Math.min(500 * 2 ** attempt, MAX_RETRY_WAIT_MS) + jitter;
}
