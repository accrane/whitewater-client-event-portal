import { logIntegrationEvent } from "@/lib/ghl/integration-log";
import { writeEventIdBackToOpportunity } from "@/lib/ghl/opportunity-sync";
import type { InquiryPayload } from "@/lib/ghl/types";
import { buildInquiryEventSnapshot } from "@/lib/ghl/types";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

type EventInsert = {
  ghl_location_id: string;
  ghl_opportunity_id: string;
  ghl_contact_id: string | null;
  status: "draft";
  ghl_snapshot: Json;
};

export type CreateInquiryEventResult = {
  created: boolean;
  event: EventRow;
  ghl_write_back: "success" | "failed" | "skipped";
};

// Inbound entry point of the inquiry workflow: a GHL workflow webhook sends
// the new opportunity, the app creates the event-planning record, then writes
// the portal event id back onto the opportunity. Idempotent on the
// opportunity id; retried deliveries reuse the event and retry the write-back
// if it has not succeeded yet.
export async function createOrReuseInquiryEvent(
  payload: InquiryPayload,
): Promise<CreateInquiryEventResult> {
  const supabase = createServiceRoleSupabaseClient();

  const { data: existingEvent, error: existingError } = await supabase
    .from("events")
    .select("*")
    .eq("ghl_opportunity_id", payload.ghl_opportunity_id)
    .maybeSingle();

  if (existingError) {
    await logIntegrationEvent({
      eventType: "create_inquiry_event",
      ghlLocationId: payload.ghl_location_id,
      status: "error",
      message: "Failed checking for an existing inquiry event.",
      details: {
        ghl_opportunity_id: payload.ghl_opportunity_id,
        error: existingError.message,
      },
    });

    throw new Error(existingError.message);
  }

  const existing = existingEvent as EventRow | null;

  if (existing) {
    await logIntegrationEvent({
      eventType: "create_inquiry_event_duplicate",
      ghlLocationId: payload.ghl_location_id,
      portalEventId: existing.id,
      status: "warning",
      message: "Duplicate inquiry webhook ignored; existing portal event reused.",
      details: { ghl_opportunity_id: payload.ghl_opportunity_id },
    });

    // A retried delivery is a chance to recover a failed write-back.
    const writeBack =
      existing.last_sync_status === "success"
        ? { ok: true as const }
        : await writeEventIdBackToOpportunity(existing);

    return {
      created: false,
      event: existing,
      ghl_write_back: writeBackLabel(writeBack),
    };
  }

  const insertPayload: EventInsert = {
    ghl_location_id: payload.ghl_location_id,
    ghl_opportunity_id: payload.ghl_opportunity_id,
    ghl_contact_id: payload.ghl_contact_id ?? null,
    status: "draft",
    ghl_snapshot: toJson(buildInquiryEventSnapshot(payload)),
  };

  const { data: insertedEvent, error: insertError } = await supabase
    .from("events")
    .insert(insertPayload as never)
    .select("*")
    .single();

  if (insertError) {
    await logIntegrationEvent({
      eventType: "create_inquiry_event",
      ghlLocationId: payload.ghl_location_id,
      status: "error",
      message: "Failed creating the inquiry event.",
      details: {
        ghl_opportunity_id: payload.ghl_opportunity_id,
        error: insertError.message,
      },
    });

    throw new Error(insertError.message);
  }

  const event = insertedEvent as EventRow;

  await logIntegrationEvent({
    eventType: "create_inquiry_event",
    ghlLocationId: payload.ghl_location_id,
    portalEventId: event.id,
    status: "success",
    message: "Draft portal event created from GHL inquiry opportunity.",
    details: { ghl_opportunity_id: payload.ghl_opportunity_id },
  });

  const writeBack = await writeEventIdBackToOpportunity(event);

  return { created: true, event, ghl_write_back: writeBackLabel(writeBack) };
}

function writeBackLabel(outcome: {
  ok: boolean;
  skipped?: boolean;
}): "success" | "failed" | "skipped" {
  if (outcome.ok) return "success";
  return outcome.skipped ? "skipped" : "failed";
}

function toJson(value: unknown): Json {
  return JSON.parse(JSON.stringify(value)) as Json;
}
