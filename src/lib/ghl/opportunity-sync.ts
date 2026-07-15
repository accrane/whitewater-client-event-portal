import { appConfig } from "@/lib/env";
import { getGhlApiHeaders } from "@/lib/ghl/client";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";
import {
  buildEventFieldWriteBackBody,
  buildPlanningStageBody,
  type OpportunityUpdateBody,
} from "@/lib/ghl/opportunity-payloads";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

export type OpportunitySyncOutcome =
  | { ok: true }
  | { ok: false; skipped: boolean; error: string };

async function updateGhlOpportunity(
  opportunityId: string,
  body: OpportunityUpdateBody,
): Promise<{ ok: boolean; error?: string }> {
  const { accessToken, apiBaseUrl } = appConfig.ghl;

  if (!accessToken) {
    return { ok: false, error: "GHL_ACCESS_TOKEN is not configured" };
  }

  const response = await fetch(
    `${apiBaseUrl}/opportunities/${encodeURIComponent(opportunityId)}`,
    {
      method: "PUT",
      headers: getGhlApiHeaders(accessToken),
      body: JSON.stringify(body),
    },
  );

  if (!response.ok) {
    const responseText = await response.text().catch(() => "");

    return {
      ok: false,
      error: `GHL responded ${response.status}: ${responseText.slice(0, 500)}`,
    };
  }

  return { ok: true };
}

// Step in the inquiry workflow: after the app creates the portal event, write
// its id back onto the GHL opportunity so GHL workflows and staff can find it.
// Records the outcome on the event row (last_sync_*) and in integration_logs;
// never throws — the portal event is the primary record.
export async function writeEventIdBackToOpportunity(
  event: EventRow,
): Promise<OpportunitySyncOutcome> {
  const fieldId = appConfig.ghl.opportunityEventFieldId;

  if (!event.ghl_opportunity_id) {
    return await recordWriteBackFailure(event, {
      skipped: true,
      error: "Event has no GHL opportunity id",
    });
  }

  if (!fieldId) {
    return await recordWriteBackFailure(event, {
      skipped: true,
      error: "GHL_OPPORTUNITY_EVENT_FIELD_ID is not configured",
    });
  }

  const result = await updateGhlOpportunity(
    event.ghl_opportunity_id,
    buildEventFieldWriteBackBody(fieldId, event.id),
  );

  if (!result.ok) {
    return await recordWriteBackFailure(event, {
      skipped: false,
      error: result.error ?? "Unknown GHL error",
    });
  }

  await setEventSyncStatus(event.id, "success", null);
  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: "opportunity_event_id_write_back",
    ghlLocationId: event.ghl_location_id,
    portalEventId: event.id,
    status: "success",
    message: "Portal event id written to the GHL opportunity.",
    details: { ghl_opportunity_id: event.ghl_opportunity_id },
  });

  return { ok: true };
}

// Step in the inquiry workflow: once a planner puts the event on the room
// calendar, move its GHL opportunity into the Planning stage so GHL-side
// tasks and notifications kick off. Never throws — the reservation save is
// the primary action.
export async function moveOpportunityToPlanning(
  event: EventRow,
): Promise<OpportunitySyncOutcome> {
  const { pipelineId, planningStageId } = appConfig.ghl;

  if (!event.ghl_opportunity_id) {
    return { ok: false, skipped: true, error: "Event has no GHL opportunity id" };
  }

  if (!pipelineId || !planningStageId) {
    const error =
      "GHL_PIPELINE_ID / GHL_PLANNING_STAGE_ID are not configured";

    await logIntegrationEvent({
      direction: "PORTAL_TO_GHL",
      eventType: "opportunity_move_to_planning",
      ghlLocationId: event.ghl_location_id,
      portalEventId: event.id,
      status: "warning",
      message: `Skipped moving the GHL opportunity to Planning: ${error}.`,
      details: { ghl_opportunity_id: event.ghl_opportunity_id },
    });

    return { ok: false, skipped: true, error };
  }

  const result = await updateGhlOpportunity(
    event.ghl_opportunity_id,
    buildPlanningStageBody(pipelineId, planningStageId),
  );

  if (!result.ok) {
    await logIntegrationEvent({
      direction: "PORTAL_TO_GHL",
      eventType: "opportunity_move_to_planning",
      ghlLocationId: event.ghl_location_id,
      portalEventId: event.id,
      status: "error",
      message: "Failed moving the GHL opportunity to the Planning stage.",
      details: {
        ghl_opportunity_id: event.ghl_opportunity_id,
        error: result.error ?? "Unknown GHL error",
      },
    });

    return { ok: false, skipped: false, error: result.error ?? "Unknown GHL error" };
  }

  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: "opportunity_move_to_planning",
    ghlLocationId: event.ghl_location_id,
    portalEventId: event.id,
    status: "success",
    message: "GHL opportunity moved to the Planning stage.",
    details: { ghl_opportunity_id: event.ghl_opportunity_id },
  });

  return { ok: true };
}

async function recordWriteBackFailure(
  event: EventRow,
  failure: { skipped: boolean; error: string },
): Promise<OpportunitySyncOutcome> {
  await setEventSyncStatus(event.id, "error", failure.error);
  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: "opportunity_event_id_write_back",
    ghlLocationId: event.ghl_location_id,
    portalEventId: event.id,
    status: failure.skipped ? "warning" : "error",
    message: failure.skipped
      ? `Skipped writing the portal event id to GHL: ${failure.error}.`
      : "Failed writing the portal event id to the GHL opportunity.",
    details: {
      ghl_opportunity_id: event.ghl_opportunity_id,
      error: failure.error,
    } as Json,
  });

  return { ok: false, ...failure };
}

async function setEventSyncStatus(
  eventId: string,
  status: Database["public"]["Enums"]["integration_status"],
  error: string | null,
) {
  const supabase = createServiceRoleSupabaseClient();
  const { error: updateError } = await supabase
    .from("events")
    .update({
      last_synced_at: new Date().toISOString(),
      last_sync_status: status,
      last_sync_error: error,
    } as never)
    .eq("id", eventId);

  if (updateError) {
    console.error("Failed updating event sync status", updateError.message);
  }
}
