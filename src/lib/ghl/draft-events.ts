import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";
import type { CreateDraftEventPayload } from "@/lib/ghl/types";
import { normalizeGhlEventSnapshot } from "@/lib/ghl/types";
import type { Database, Json } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

type EventInsert = {
  ghl_location_id: string;
  ghl_event_record_id: string;
  ghl_contact_id: string | null;
  ghl_opportunity_id: string | null;
  status: "draft";
  ghl_snapshot: Json;
  last_synced_at: string;
  last_sync_status: "success";
  last_sync_error: null;
};

export type CreateDraftEventResult = {
  created: boolean;
  event: EventRow;
};

export async function createOrReuseDraftEvent(
  payload: CreateDraftEventPayload,
): Promise<CreateDraftEventResult> {
  const supabase = createServiceRoleSupabaseClient();

  const { data: existingEvent, error: existingError } = await supabase
    .from("events")
    .select("*")
    .eq("ghl_event_record_id", payload.ghl_event_record_id)
    .maybeSingle();

  if (existingError) {
    await logIntegrationEvent({
      eventType: "create_draft_event",
      ghlLocationId: payload.ghl_location_id,
      ghlEventRecordId: payload.ghl_event_record_id,
      status: "error",
      message: "Failed checking for existing draft portal event.",
      details: { error: existingError.message },
    });

    throw new Error(existingError.message);
  }

  const existing = existingEvent as EventRow | null;

  if (existing) {
    await logIntegrationEvent({
      eventType: "create_draft_event_duplicate",
      ghlLocationId: payload.ghl_location_id,
      ghlEventRecordId: payload.ghl_event_record_id,
      portalEventId: existing.id,
      status: "warning",
      message: "Duplicate draft event webhook ignored; existing portal event reused.",
      details: { portal_event_id: existing.id },
    });

    // Retried deliveries still get the hold linked in case the first attempt
    // failed between creating the event and updating the reservation.
    await bookProposalHoldForEvent(payload, existing);

    return { created: false, event: existing };
  }

  const snapshot = normalizeGhlEventSnapshot(payload);
  const insertPayload: EventInsert = {
    ghl_location_id: payload.ghl_location_id,
    ghl_event_record_id: payload.ghl_event_record_id,
    ghl_contact_id: payload.ghl_contact_id ?? null,
    ghl_opportunity_id: payload.ghl_opportunity_id ?? null,
    status: "draft",
    ghl_snapshot: toJson(snapshot),
    last_synced_at: new Date().toISOString(),
    last_sync_status: "success",
    last_sync_error: null,
  };

  const { data: insertedEvent, error: insertError } = await supabase
    .from("events")
    .insert(insertPayload as never)
    .select("*")
    .single();

  if (insertError) {
    await logIntegrationEvent({
      eventType: "create_draft_event",
      ghlLocationId: payload.ghl_location_id,
      ghlEventRecordId: payload.ghl_event_record_id,
      status: "error",
      message: "Failed creating draft portal event.",
      details: { error: insertError.message },
    });

    throw new Error(insertError.message);
  }

  const event = insertedEvent as EventRow;

  await logIntegrationEvent({
    eventType: "create_draft_event",
    ghlLocationId: payload.ghl_location_id,
    ghlEventRecordId: payload.ghl_event_record_id,
    portalEventId: event.id,
    status: "success",
    message: "Draft portal event created from GHL webhook payload.",
    details: { portal_event_id: event.id },
  });

  await bookProposalHoldForEvent(payload, event);

  return { created: true, event };
}

// The "proposal sent" webhook holds a room before the portal event exists.
// Once the proposal is signed and this draft event is created, attach that
// hold to the event and promote it to a confirmed booking. Failures here are
// logged but never fail the webhook — the draft event is the primary record.
async function bookProposalHoldForEvent(
  payload: CreateDraftEventPayload,
  event: EventRow,
) {
  const supabase = createServiceRoleSupabaseClient();

  const { data, error } = await supabase
    .from("reservations")
    .update({ event_id: event.id, status: "booked" } as never)
    .eq("ghl_event_record_id", payload.ghl_event_record_id)
    .or(`event_id.is.null,event_id.eq.${event.id}`)
    .select("id, status");

  if (error) {
    await logIntegrationEvent({
      eventType: "book_proposal_hold",
      ghlLocationId: payload.ghl_location_id,
      ghlEventRecordId: payload.ghl_event_record_id,
      portalEventId: event.id,
      status: "error",
      message: "Failed booking the proposal hold for this event.",
      details: { error: error.message },
    });

    return;
  }

  const updated = (data ?? []) as { id: string; status: string }[];

  if (updated.length === 0) {
    await logIntegrationEvent({
      eventType: "book_proposal_hold",
      ghlLocationId: payload.ghl_location_id,
      ghlEventRecordId: payload.ghl_event_record_id,
      portalEventId: event.id,
      status: "warning",
      message:
        "No proposal hold found for this GHL event record; calendar not updated.",
      details: {},
    });

    return;
  }

  await logIntegrationEvent({
    eventType: "book_proposal_hold",
    ghlLocationId: payload.ghl_location_id,
    ghlEventRecordId: payload.ghl_event_record_id,
    portalEventId: event.id,
    status: "success",
    message: "Proposal hold linked to portal event and booked.",
    details: { reservation_id: updated[0].id },
  });
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
