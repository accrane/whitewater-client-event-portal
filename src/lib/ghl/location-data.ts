import { appConfig } from "@/lib/env";
import { getGhlApiHeaders } from "@/lib/ghl/client";
import { findDateOfInterest } from "@/lib/ghl/field-values";

// Read-only lookups against the GHL location. Every function degrades to an
// empty result when GHL is unconfigured or unreachable — the calendar must
// keep working without it.

export type GhlUser = {
  id: string;
  name: string;
};

export async function listGhlUsers(): Promise<GhlUser[]> {
  const { accessToken, apiBaseUrl, locationId } = appConfig.ghl;
  if (!accessToken || !locationId) return [];

  try {
    const response = await fetch(
      `${apiBaseUrl}/users/?locationId=${encodeURIComponent(locationId)}`,
      { headers: getGhlApiHeaders(accessToken) },
    );
    if (!response.ok) {
      console.error("GHL users lookup failed", response.status);
      return [];
    }

    const data = (await response.json()) as {
      users?: { id?: string; name?: string; firstName?: string; lastName?: string; email?: string }[];
    };

    return (data.users ?? [])
      .filter((user) => user.id)
      .map((user) => ({
        id: user.id as string,
        name:
          user.name ||
          [user.firstName, user.lastName].filter(Boolean).join(" ") ||
          user.email ||
          (user.id as string),
      }));
  } catch (error) {
    console.error("GHL users lookup failed", error);
    return [];
  }
}

// Live "Date of Interest" per opportunity id (yyyy-MM-dd), straight from GHL
// so planners always see the client's current requested date.
export async function fetchDatesOfInterest(): Promise<Map<string, string>> {
  const { accessToken, apiBaseUrl, locationId, dateOfInterestFieldId } =
    appConfig.ghl;
  const dates = new Map<string, string>();
  if (!accessToken || !locationId || !dateOfInterestFieldId) return dates;

  let url: string | null =
    `${apiBaseUrl}/opportunities/search?location_id=${encodeURIComponent(locationId)}&limit=100`;

  try {
    // Follow pagination a few pages deep; active opportunities land early.
    for (let page = 0; url && page < 5; page++) {
      const response: Response = await fetch(url, {
        headers: getGhlApiHeaders(accessToken),
      });
      if (!response.ok) {
        console.error("GHL opportunity search failed", response.status);
        return dates;
      }

      const data = (await response.json()) as {
        opportunities?: { id?: string; customFields?: unknown }[];
        meta?: { nextPageUrl?: string | null };
      };

      for (const opportunity of data.opportunities ?? []) {
        if (!opportunity.id) continue;
        const date = findDateOfInterest(
          opportunity.customFields,
          dateOfInterestFieldId,
        );
        if (date) dates.set(opportunity.id, date);
      }

      url = data.meta?.nextPageUrl ?? null;
    }
  } catch (error) {
    console.error("GHL opportunity search failed", error);
  }

  return dates;
}
