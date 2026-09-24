import { appConfig } from "@/lib/env";
import { getGhlApiHeaders, ghlFetch } from "@/lib/ghl/client";

// Adds or removes one tag on a GHL contact. Removing a tag the contact
// doesn't carry is a no-op in GHL, so removal is safe to call blind. Used
// by the follow-ups pause (follow-ups-paused) and the coordinator intro
// chase (coordinator-intro-sent). Needs the integration's contacts write
// scope.
export async function setContactTag(
  contactId: string,
  tag: string,
  present: boolean,
): Promise<{ ok: true } | { ok: false; error: string }> {
  const { accessToken, apiBaseUrl } = appConfig.ghl;
  if (!accessToken) return { ok: false, error: "GHL_ACCESS_TOKEN is not configured" };

  try {
    const response = await ghlFetch(
      `${apiBaseUrl}/contacts/${encodeURIComponent(contactId)}/tags`,
      {
        method: present ? "POST" : "DELETE",
        headers: getGhlApiHeaders(accessToken),
        body: JSON.stringify({ tags: [tag] }),
      },
    );
    if (!response.ok) {
      const text = await response.text().catch(() => "");
      return {
        ok: false,
        error:
          response.status === 401
            ? "GHL rejected the tag change: the integration token is missing the contacts write scope."
            : `GHL responded ${response.status}: ${text.slice(0, 200)}`,
      };
    }
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "GHL tag change failed",
    };
  }
}
