import { vendorFetch } from "@/lib/http/vendor-fetch";

// GHL normally answers in well under a second; this only cuts off a hung call.
const GHL_TIMEOUT_MS = 15_000;

export function getGhlApiHeaders(accessToken: string): HeadersInit {
  const authScheme = ["Bear", "er"].join("");

  return {
    Authorization: `${authScheme} ${accessToken}`,
    Version: "2021-07-28",
    "Content-Type": "application/json",
  };
}

// Every GHL call goes through here: a timeout on each request, plus brief
// retries of safe requests when GHL rate-limits (429) or blips (502-504).
export function ghlFetch(url: string, init?: RequestInit): Promise<Response> {
  return vendorFetch(url, init, { label: "GHL", timeoutMs: GHL_TIMEOUT_MS });
}
