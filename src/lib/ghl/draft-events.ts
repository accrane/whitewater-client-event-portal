import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { CreateDraftEventPayload } from "@/lib/ghl/types";
import { normalizeGhlEventSnapshot } from "@/lib/ghl/types";
import type { Database, Json } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type IntegrationStatus = Database["public"]["Enums"]["integration_status"];

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

type IntegrationLogInsert = {
  direction: "GHL_TO_PORTAL";
  event_type: string;
  ghl_location_id: string | null;
  ghl_event_record_id: string | null;
  portal_event_id: string | null;
  status: IntegrationStatus;
  message: string;
  details: Json;
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

  return { created: true, event };
}

type LogIntegrationEventArgs = {
  eventType: string;
  ghlLocationId?: string | null;
  ghlEventRecordId?: string | null;
  portalEventId?: string | null;
  status: IntegrationStatus;
  message: string;
  details?: Json;
};

async function logIntegrationEvent({
  eventType,
  ghlLocationId,
  ghlEventRecordId,
  portalEventId,
  status,
  message,
  details = {},
}: LogIntegrationEventArgs) {
  const supabase = createServiceRoleSupabaseClient();
  const insertPayload: IntegrationLogInsert = {
    direction: "GHL_TO_PORTAL",
    event_type: eventType,
    ghl_location_id: ghlLocationId ?? null,
    ghl_event_record_id: ghlEventRecordId ?? null,
    portal_event_id: portalEventId ?? null,
    status,
    message,
    details,
  };

  const { error } = await supabase
    .from("integration_logs")
    .insert(insertPayload as never);

  if (error) {
    console.error("Failed writing integration log", error.message);
  }
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
