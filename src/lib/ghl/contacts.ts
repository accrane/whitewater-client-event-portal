import { appConfig } from "@/lib/env";
import { getGhlApiHeaders } from "@/lib/ghl/client";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";

// Reads one GHL contact's name/email/phone — used to fill the facilitator
// from the event's primary contact when "same as current contact" is picked,
// and by the conversations drawer for Do Not Disturb. Degrades to null when
// GHL is unconfigured or the lookup fails.
export type GhlContactDnd = {
  // GHL's contact-level DND switch: every channel is off.
  all: boolean;
  // Per-channel DND (GHL Contact → DND settings), including opt-outs GHL
  // records itself when someone replies STOP.
  sms: boolean;
  email: boolean;
};

export type GhlContactSummary = {
  name: string | null;
  firstName: string | null;
  lastName: string | null;
  email: string | null;
  phone: string | null;
  companyName: string | null;
  dnd: GhlContactDnd;
};

// A contact that has never had DND touched carries no dnd fields at all.
function parseDnd(contact: {
  dnd?: boolean;
  dndSettings?: Record<string, { status?: string } | undefined>;
}): GhlContactDnd {
  const all = contact.dnd === true;
  const channelActive = (key: string) =>
    contact.dndSettings?.[key]?.status?.toLowerCase() === "active";
  return {
    all,
    sms: all || channelActive("SMS"),
    email: all || channelActive("Email"),
  };
}

export async function fetchGhlContact(
  contactId: string,
): Promise<GhlContactSummary | null> {
  const { accessToken, apiBaseUrl } = appConfig.ghl;
  if (!accessToken) return null;

  try {
    const response = await fetch(
      `${apiBaseUrl}/contacts/${encodeURIComponent(contactId)}`,
      { headers: getGhlApiHeaders(accessToken) },
    );
    if (!response.ok) {
      console.error("GHL contact fetch failed", response.status);
      return null;
    }

    const data = (await response.json()) as {
      contact?: {
        contactName?: string;
        firstName?: string;
        lastName?: string;
        email?: string;
        phone?: string;
        companyName?: string;
        dnd?: boolean;
        dndSettings?: Record<string, { status?: string } | undefined>;
      };
    };
    const contact = data.contact;
    if (!contact) return null;

    const name =
      contact.contactName?.trim() ||
      [contact.firstName, contact.lastName]
        .map((part) => part?.trim())
        .filter(Boolean)
        .join(" ");

    return {
      name: name || null,
      firstName: contact.firstName?.trim() || null,
      lastName: contact.lastName?.trim() || null,
      email: contact.email?.trim() || null,
      phone: contact.phone?.trim() || null,
      companyName: contact.companyName?.trim() || null,
      dnd: parseDnd(contact),
    };
  } catch (error) {
    console.error("GHL contact fetch failed", error);
    return null;
  }
}

// Upserts a GHL contact for an event's facilitator (dedupes by email/phone via
// GHL's own upsert endpoint) and tags it so sales can find and message
// facilitators from GHL Conversations and workflows. Returns the contact id,
// or null when GHL is unconfigured, the facilitator has no email or phone
// (GHL can't dedupe or message a contact without one), or the call fails —
// the app save is the primary action and must not roll back.
export const FACILITATOR_CONTACT_TAG = "facilitator";

export async function upsertFacilitatorContact({
  email,
  ghlLocationId,
  name,
  phone,
  portalEventId,
}: {
  email: string | null;
  ghlLocationId: string | null;
  name: string | null;
  phone: string | null;
  portalEventId: string;
}): Promise<string | null> {
  const { accessToken, apiBaseUrl, locationId } = appConfig.ghl;
  if (!accessToken || !locationId) return null;
  if (!email && !phone) return null;

  const trimmedName = (name ?? "").trim();
  const [firstName, ...rest] = trimmedName.split(/\s+/);
  const lastName = rest.join(" ");

  try {
    const response = await fetch(`${apiBaseUrl}/contacts/upsert`, {
      method: "POST",
      headers: getGhlApiHeaders(accessToken),
      body: JSON.stringify({
        locationId,
        ...(firstName ? { firstName } : {}),
        ...(lastName ? { lastName } : {}),
        ...(email ? { email } : {}),
        ...(phone ? { phone } : {}),
        tags: [FACILITATOR_CONTACT_TAG],
      }),
    });

    if (!response.ok) {
      const responseText = await response.text().catch(() => "");
      await logIntegrationEvent({
        direction: "PORTAL_TO_GHL",
        eventType: "facilitator_contact_upsert",
        ghlLocationId,
        portalEventId,
        status: "error",
        message: "Failed upserting the facilitator contact in GHL.",
        details: {
          error: `GHL responded ${response.status}: ${responseText.slice(0, 500)}`,
        },
      });
      return null;
    }

    const data = (await response.json()) as {
      contact?: { id?: string };
    };
    const contactId = data.contact?.id ?? null;

    await logIntegrationEvent({
      direction: "PORTAL_TO_GHL",
      eventType: "facilitator_contact_upsert",
      ghlLocationId,
      portalEventId,
      status: "success",
      message: "Facilitator contact upserted in GHL.",
      details: { ghl_contact_id: contactId, facilitator_name: trimmedName || null },
    });

    return contactId;
  } catch (error) {
    console.error("GHL facilitator contact upsert failed", error);
    return null;
  }
}
