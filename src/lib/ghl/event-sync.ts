import { findDateOfInterest, findFieldString } from "@/lib/ghl/field-values";
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
} as const;

// Refreshes an event's stored GHL snapshot from the live opportunity: event
// name, type, Date of Interest, contact id, and the planner (GHL assigned
// user — set when a planner picks an Event Coordinator on a reservation).
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
  const assignedUser = opportunity.assignedTo
    ? users.find((user) => user.id === opportunity.assignedTo)
    : undefined;

  const existingSnapshot =
    event.ghl_snapshot &&
    typeof event.ghl_snapshot === "object" &&
    !Array.isArray(event.ghl_snapshot)
      ? (event.ghl_snapshot as Record<string, Json>)
      : {};

  const snapshot: Record<string, Json> = {
    ...existingSnapshot,
    ...(eventName || opportunity.name
      ? { eventName: (eventName ?? opportunity.name) as Json }
      : {}),
    ...(eventType ? { eventType } : {}),
    ...(eventDate ? { eventDate } : {}),
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
  }
}
