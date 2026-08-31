import { appConfig } from "@/lib/env";
import { getGhlApiHeaders } from "@/lib/ghl/client";
import { textFromMaybeHtml } from "@/lib/ghl/html-text";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";

// GHL contact notes for the admin event page's notes drawer. Notes live on
// the contact in GHL; the app reads them live (never stored) and writes new
// ones straight back so both tools show the same list.

export type GhlContactNote = {
  id: string;
  body: string;
  dateAdded: string | null;
  // GHL user who wrote the note (null for API/system notes without one).
  userId: string | null;
};

// All notes on a contact, newest first. Throws on API failures so callers
// can tell "no notes" from "couldn't load"; empty when GHL is unconfigured.
export async function listContactNotes(
  contactId: string,
): Promise<GhlContactNote[]> {
  const { accessToken, apiBaseUrl } = appConfig.ghl;
  if (!accessToken) return [];

  const response = await fetch(
    `${apiBaseUrl}/contacts/${encodeURIComponent(contactId)}/notes`,
    { headers: getGhlApiHeaders(accessToken) },
  );

  if (!response.ok) {
    throw new Error(`GHL notes fetch failed (${response.status})`);
  }

  const data = (await response.json()) as {
    notes?: {
      id?: string;
      body?: string;
      dateAdded?: string;
      userId?: string;
    }[];
  };

  return (data.notes ?? [])
    .filter((note) => note.id)
    .map((note) => ({
      id: note.id as string,
      // Notes can be saved as rich text in GHL; render as plain text.
      body: textFromMaybeHtml(note.body ?? ""),
      dateAdded: note.dateAdded ?? null,
      userId: note.userId ?? null,
    }))
    .sort((a, b) => (b.dateAdded ?? "").localeCompare(a.dateAdded ?? ""));
}

export type CreateContactNoteOutcome =
  | { ok: true }
  | { ok: false; error: string };

// Writes a note onto the GHL contact. userId attributes the note to a GHL
// user (matched from the portal user's email where possible) so it doesn't
// show as an anonymous API note in GHL.
export async function createContactNote({
  contactId,
  body,
  userId,
  ghlLocationId,
  portalEventId,
}: {
  contactId: string;
  body: string;
  userId: string | null;
  ghlLocationId: string | null;
  portalEventId: string | null;
}): Promise<CreateContactNoteOutcome> {
  const { accessToken, apiBaseUrl } = appConfig.ghl;

  if (!accessToken) {
    return { ok: false, error: "GHL_ACCESS_TOKEN is not configured" };
  }

  const response = await fetch(
    `${apiBaseUrl}/contacts/${encodeURIComponent(contactId)}/notes`,
    {
      method: "POST",
      headers: getGhlApiHeaders(accessToken),
      body: JSON.stringify({ body, ...(userId ? { userId } : {}) }),
    },
  );

  const ok = response.ok;
  let error: string | null = null;

  if (!ok) {
    const responseText = await response.text().catch(() => "");
    error = `GHL responded ${response.status}: ${responseText.slice(0, 300)}`;
  }

  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: "contact_note_create",
    ghlLocationId,
    portalEventId,
    status: ok ? "success" : "error",
    message: ok
      ? "Note added to the GHL contact from the event page."
      : "Failed adding a note to the GHL contact.",
    details: {
      ghl_contact_id: contactId,
      ...(error ? { error } : {}),
    },
  });

  return ok ? { ok: true } : { ok: false, error: error ?? "Unknown GHL error" };
}
