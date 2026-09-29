import { recomputeChecklistDueDates } from "@/lib/admin/checklist-templates";
import { shiftedEventEnd, toIsoDate } from "@/lib/dates/event-dates";
import { fetchGhlContact } from "@/lib/ghl/contacts";
import {
  findDateOfInterest,
  findFieldNumber,
  findFieldString,
} from "@/lib/ghl/field-values";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";
import {
  fetchOpportunity,
  fetchOpportunityFieldIndex,
  listGhlUsers,
} from "@/lib/ghl/location-data";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

// Opportunity custom-field keys the sync reads (see docs/ghl-custom-fields.md).
const FIELD_KEYS = {
  dateOfInterest: "opportunity.date_of_interest",
  groupEventName: "opportunity.groupevent_name",
  inquiryType: "opportunity.inquiry_type",
  numberOfGuests: "opportunity.number_of_guests",
  activityPassCount: "opportunity.activity_pass_count",
  numberOfParkingPasses: "opportunity.number_of_parking_passes",
  numberOfStorageBins: "opportunity.number_of_storage_bins",
  proposalLink: "opportunity.proposal_link",
  revisedProposalLink: "opportunity.revised_proposal_link",
} as const;

// Refreshes an event's stored GHL snapshot from the live opportunity: event
// name, type, Date of Interest, contact id, and the coordinator (GHL assigned
// user — set when a coordinator picks an Event Coordinator on a reservation).
// Quiet by design: any GHL problem leaves the stored data untouched, so
// pages calling this on load keep rendering.
export async function syncEventFromGhl(eventId: string): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  const event = data as EventRow | null;
  if (error || !event?.ghl_opportunity_id) return;

  const [opportunity, fieldIndex, users] = await Promise.all([
    fetchOpportunity(event.ghl_opportunity_id),
    fetchOpportunityFieldIndex(),
    listGhlUsers(),
  ]);

  if (!opportunity) return;

  const fieldId = (key: string) => fieldIndex.get(key) ?? "";
  const eventDate = findDateOfInterest(
    opportunity.customFields,
    fieldId(FIELD_KEYS.dateOfInterest),
  );
  const eventName = findFieldString(
    opportunity.customFields,
    fieldId(FIELD_KEYS.groupEventName),
  );
  const eventType = findFieldString(
    opportunity.customFields,
    fieldId(FIELD_KEYS.inquiryType),
  );
  const numberOfGuests = findFieldNumber(
    opportunity.customFields,
    fieldId(FIELD_KEYS.numberOfGuests),
  );
  const activityPassCount = findFieldNumber(
    opportunity.customFields,
    fieldId(FIELD_KEYS.activityPassCount),
  );
  const numberOfParkingPasses = findFieldNumber(
    opportunity.customFields,
    fieldId(FIELD_KEYS.numberOfParkingPasses),
  );
  const numberOfStorageBins = findFieldNumber(
    opportunity.customFields,
    fieldId(FIELD_KEYS.numberOfStorageBins),
  );
  const proposalLink = findFieldString(
    opportunity.customFields,
    fieldId(FIELD_KEYS.proposalLink),
  );
  // Until someone creates Revised Proposal Link in GHL there's nothing to
  // read, so the link the contract sync stored stays put.
  const revisedProposalFieldId = fieldIndex.get(FIELD_KEYS.revisedProposalLink);
  const assignedUser = opportunity.assignedTo
    ? users.find((user) => user.id === opportunity.assignedTo)
    : undefined;
  // The person who originally inquired — shown on the admin event page and
  // the anchor for the conversations drawer.
  const contact = opportunity.contactId
    ? await fetchGhlContact(opportunity.contactId)
    : null;

  const existingSnapshot =
    event.ghl_snapshot &&
    typeof event.ghl_snapshot === "object" &&
    !Array.isArray(event.ghl_snapshot)
      ? (event.ghl_snapshot as Record<string, Json>)
      : {};

  const existingLinks =
    existingSnapshot.links &&
    typeof existingSnapshot.links === "object" &&
    !Array.isArray(existingSnapshot.links)
      ? (existingSnapshot.links as Record<string, Json>)
      : {};

  // A date changed in GHL itself: a multi-day event keeps its length, and
  // checklist due dates follow below. The event's rooms stay put; the event
  // page flags any that no longer sit on the event's days.
  const previousDate = toIsoDate(
    typeof existingSnapshot.eventDate === "string"
      ? existingSnapshot.eventDate
      : null,
  );
  const dateChanged = eventDate !== null && eventDate !== previousDate;
  const previousEnd =
    typeof existingSnapshot.eventEndDate === "string"
      ? existingSnapshot.eventEndDate
      : null;

  const snapshot: Record<string, Json> = {
    ...existingSnapshot,
    ...(eventName || opportunity.name
      ? { eventName: (eventName ?? opportunity.name) as Json }
      : {}),
    ...(eventType ? { eventType } : {}),
    ...(eventDate ? { eventDate } : {}),
    ...(dateChanged && eventDate
      ? { eventEndDate: shiftedEventEnd(previousDate, previousEnd, eventDate) }
      : {}),
    // GHL owns these: app edits write back to GHL, so the live opportunity
    // is authoritative here. GHL reports monetaryValue as 0 when unset (and the
    // app pushes 0 to clear it), so 0 renders as blank.
    value:
      opportunity.monetaryValue !== null && opportunity.monetaryValue > 0
        ? opportunity.monetaryValue
        : null,
    numberOfGuests,
    activityPassCount,
    numberOfParkingPasses,
    numberOfStorageBins,
    // The portal writes both proposal links from its contracts
    // (syncProposalLinksFromContracts) and GHL keeps them, so the live
    // fields are read back as they are — blanking one in GHL blanks it here
    // until the next contract sync writes it again.
    links: {
      ...existingLinks,
      proposal: proposalLink,
      ...(revisedProposalFieldId
        ? {
            revisedProposal: findFieldString(
              opportunity.customFields,
              revisedProposalFieldId,
            ),
          }
        : {}),
    },
    ...(assignedUser
      ? {
          planner: {
            id: assignedUser.id,
            name: assignedUser.name,
            email: assignedUser.email,
            phone: null,
          },
        }
      : {}),
    ...(contact
      ? {
          contact: {
            name: contact.name,
            email: contact.email,
            phone: contact.phone,
          },
        }
      : {}),
  };

  const { error: updateError } = await supabase
    .from("events")
    .update({
      ghl_snapshot: snapshot,
      ...(opportunity.contactId ? { ghl_contact_id: opportunity.contactId } : {}),
      last_synced_at: new Date().toISOString(),
      last_sync_status: "success",
      last_sync_error: null,
    } as never)
    .eq("id", eventId);

  if (updateError) {
    console.error("Failed storing synced GHL snapshot", updateError.message);
    return;
  }

  if (dateChanged) {
    try {
      await recomputeChecklistDueDates(eventId, eventDate);
    } catch (dueDateError) {
      console.error("Failed moving checklist due dates", dueDateError);
    }
  }

  // The first fill of an empty date isn't news; a moved date is.
  if (dateChanged && previousDate) {
    await logIntegrationEvent({
      direction: "GHL_TO_PORTAL",
      eventType: "event_date_changed_in_ghl",
      ghlLocationId: event.ghl_location_id,
      portalEventId: eventId,
      status: "success",
      message: `Date of Interest changed in GHL from ${previousDate} to ${eventDate}; the event's dates followed. Its rooms were not moved.`,
      details: {
        ghl_opportunity_id: event.ghl_opportunity_id,
        from: previousDate,
        to: eventDate,
      },
    }).catch(() => undefined);
  }
}
