import { appConfig } from "@/lib/env";
import { getGhlApiHeaders } from "@/lib/ghl/client";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";
import { fetchOpportunityFieldIndex } from "@/lib/ghl/location-data";
import {
  buildEventFieldWriteBackBody,
  buildPlanningStageBody,
  buildPortalLinkWriteBackBody,
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

// Opportunity custom fields the Event summary form writes back, form field →
// GHL field key. Each must exist in GHL (see docs/ghl-custom-fields.md).
const SUMMARY_FIELD_KEYS = {
  numberOfGuests: "opportunity.number_of_guests",
  activityPassCount: "opportunity.activity_pass_count",
  numberOfParkingPasses: "opportunity.number_of_parking_passes",
  numberOfStorageBins: "opportunity.number_of_storage_bins",
} as const;

// Pushes app-edited Event summary numbers to the GHL opportunity in one PUT:
// Value → the built-in monetaryValue (admins only, so it may be omitted) and
// the counts → their opportunity custom fields (SUMMARY_FIELD_KEYS). Never
// throws — the app save is the primary action.
export async function writeOpportunityEventDetails(
  event: EventRow,
  updates: {
    monetaryValue?: number | null;
  } & Record<keyof typeof SUMMARY_FIELD_KEYS, number | null>,
): Promise<OpportunitySyncOutcome> {
  if (!event.ghl_opportunity_id) {
    return { ok: false, skipped: true, error: "Event has no GHL opportunity id" };
  }

  const fieldIndex = await fetchOpportunityFieldIndex();
  const customFields = Object.entries(SUMMARY_FIELD_KEYS).flatMap(
    ([field, key]) => {
      const fieldId = fieldIndex.get(key);
      if (!fieldId) return [];
      const value = updates[field as keyof typeof SUMMARY_FIELD_KEYS];
      return [{ id: fieldId, field_value: value === null ? "" : String(value) }];
    },
  );

  const body: OpportunityUpdateBody = {
    ...(updates.monetaryValue !== undefined
      ? { monetaryValue: updates.monetaryValue ?? 0 }
      : {}),
    ...(customFields.length > 0 ? { customFields } : {}),
  };

  if (Object.keys(body).length === 0) {
    const error = "Event summary custom fields not found in GHL";

    await logIntegrationEvent({
      direction: "PORTAL_TO_GHL",
      eventType: "opportunity_event_details_write_back",
      ghlLocationId: event.ghl_location_id,
      portalEventId: event.id,
      status: "warning",
      message: `Skipped writing event details to GHL: ${error}.`,
      details: { ghl_opportunity_id: event.ghl_opportunity_id },
    });

    return { ok: false, skipped: true, error };
  }

  const result = await updateGhlOpportunity(event.ghl_opportunity_id, body);

  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: "opportunity_event_details_write_back",
    ghlLocationId: event.ghl_location_id,
    portalEventId: event.id,
    status: result.ok ? "success" : "error",
    message: result.ok
      ? "Event summary details written to the GHL opportunity."
      : "Failed writing event summary details to the GHL opportunity.",
    details: {
      ghl_opportunity_id: event.ghl_opportunity_id,
      ...(updates.monetaryValue !== undefined
        ? { monetary_value: updates.monetaryValue }
        : {}),
      number_of_guests: updates.numberOfGuests,
      activity_pass_count: updates.activityPassCount,
      number_of_parking_passes: updates.numberOfParkingPasses,
      number_of_storage_bins: updates.numberOfStorageBins,
      ...(result.ok ? {} : { error: result.error ?? "Unknown GHL error" }),
    },
  });

  return result.ok
    ? { ok: true }
    : { ok: false, skipped: false, error: result.error ?? "Unknown GHL error" };
}

// Opportunity custom fields for the event facilitator (the on-site contact a
// client may name for large corporate events), form field → GHL field key.
// App-authoritative: the app only writes these, never reads them back.
const FACILITATOR_FIELD_KEYS = {
  name: "opportunity.facilitator_name",
  email: "opportunity.facilitator_email",
  phone: "opportunity.facilitator_phone",
} as const;

// Pushes the event facilitator's contact info to the GHL opportunity's
// facilitator_* custom fields (FACILITATOR_FIELD_KEYS) in one PUT. Never
// throws — the app save is the primary action.
export async function writeOpportunityFacilitator(
  event: EventRow,
  facilitator: Record<keyof typeof FACILITATOR_FIELD_KEYS, string | null>,
): Promise<OpportunitySyncOutcome> {
  if (!event.ghl_opportunity_id) {
    return { ok: false, skipped: true, error: "Event has no GHL opportunity id" };
  }

  const fieldIndex = await fetchOpportunityFieldIndex();
  const customFields = Object.entries(FACILITATOR_FIELD_KEYS).flatMap(
    ([field, key]) => {
      const fieldId = fieldIndex.get(key);
      if (!fieldId) return [];
      const value = facilitator[field as keyof typeof FACILITATOR_FIELD_KEYS];
      return [{ id: fieldId, field_value: value ?? "" }];
    },
  );

  if (customFields.length === 0) {
    const error = "Facilitator custom fields not found in GHL";

    await logIntegrationEvent({
      direction: "PORTAL_TO_GHL",
      eventType: "opportunity_facilitator_write_back",
      ghlLocationId: event.ghl_location_id,
      portalEventId: event.id,
      status: "warning",
      message: `Skipped writing the facilitator to GHL: ${error}.`,
      details: { ghl_opportunity_id: event.ghl_opportunity_id },
    });

    return { ok: false, skipped: true, error };
  }

  const result = await updateGhlOpportunity(event.ghl_opportunity_id, {
    customFields,
  });

  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: "opportunity_facilitator_write_back",
    ghlLocationId: event.ghl_location_id,
    portalEventId: event.id,
    status: result.ok ? "success" : "error",
    message: result.ok
      ? "Event facilitator written to the GHL opportunity."
      : "Failed writing the event facilitator to the GHL opportunity.",
    details: {
      ghl_opportunity_id: event.ghl_opportunity_id,
      facilitator_name: facilitator.name,
      facilitator_email: facilitator.email,
      facilitator_phone: facilitator.phone,
      ...(result.ok ? {} : { error: result.error ?? "Unknown GHL error" }),
    },
  });

  return result.ok
    ? { ok: true }
    : { ok: false, skipped: false, error: result.error ?? "Unknown GHL error" };
}

// Step in the launch workflow: when a planner publishes the portal, write the
// client portal link onto the GHL opportunity so GHL workflows (email/SMS
// templates) can use it. Never throws — the portal launch is the primary
// action and must not roll back on a GHL failure.
export async function writePortalLinkToOpportunity(
  event: EventRow,
  portalLink: string,
): Promise<OpportunitySyncOutcome> {
  const fieldId = appConfig.ghl.portalLinkFieldId;

  if (!event.ghl_opportunity_id || !fieldId) {
    const skipReason = !event.ghl_opportunity_id
      ? "Event has no GHL opportunity id"
      : "GHL_PORTAL_LINK_FIELD_ID is not configured";

    await logIntegrationEvent({
      direction: "PORTAL_TO_GHL",
      eventType: "opportunity_portal_link_write_back",
      ghlLocationId: event.ghl_location_id,
      portalEventId: event.id,
      status: "warning",
      message: `Skipped writing the portal link to GHL: ${skipReason}.`,
      details: { ghl_opportunity_id: event.ghl_opportunity_id },
    });

    return { ok: false, skipped: true, error: skipReason };
  }

  const result = await updateGhlOpportunity(
    event.ghl_opportunity_id,
    buildPortalLinkWriteBackBody(fieldId, portalLink),
  );

  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: "opportunity_portal_link_write_back",
    ghlLocationId: event.ghl_location_id,
    portalEventId: event.id,
    status: result.ok ? "success" : "error",
    message: result.ok
      ? "Client portal link written to the GHL opportunity."
      : "Failed writing the client portal link to the GHL opportunity.",
    details: {
      ghl_opportunity_id: event.ghl_opportunity_id,
      portal_link: portalLink,
      ...(result.ok ? {} : { error: result.error ?? "Unknown GHL error" }),
    },
  });

  return result.ok
    ? { ok: true }
    : { ok: false, skipped: false, error: result.error ?? "Unknown GHL error" };
}

// Step in the inquiry workflow: once a planner puts the event on the room
// calendar, move its GHL opportunity into the Planning stage so GHL-side
// tasks and notifications kick off. Never throws — the reservation save is
// the primary action.
export async function moveOpportunityToPlanning(
  event: EventRow,
): Promise<OpportunitySyncOutcome> {
  return moveOpportunityToStage(event, {
    stageId: appConfig.ghl.planningStageId,
    stageLabel: "Planning",
    envVarName: "GHL_PLANNING_STAGE_ID",
    eventType: "opportunity_move_to_planning",
  });
}

// Fired when the client signs a PandaDoc contract in the portal: the
// opportunity becomes Booked so GHL reporting and workflows see the win.
export async function moveOpportunityToBooked(
  event: EventRow,
): Promise<OpportunitySyncOutcome> {
  return moveOpportunityToStage(event, {
    stageId: appConfig.ghl.bookedStageId,
    stageLabel: "Booked",
    envVarName: "GHL_BOOKED_STAGE_ID",
    eventType: "opportunity_move_to_booked",
  });
}

async function moveOpportunityToStage(
  event: EventRow,
  target: {
    stageId: string | undefined;
    stageLabel: string;
    envVarName: string;
    eventType: string;
  },
): Promise<OpportunitySyncOutcome> {
  const { pipelineId } = appConfig.ghl;

  if (!event.ghl_opportunity_id) {
    return { ok: false, skipped: true, error: "Event has no GHL opportunity id" };
  }

  if (!pipelineId || !target.stageId) {
    const error = `GHL_PIPELINE_ID / ${target.envVarName} are not configured`;

    await logIntegrationEvent({
      direction: "PORTAL_TO_GHL",
      eventType: target.eventType,
      ghlLocationId: event.ghl_location_id,
      portalEventId: event.id,
      status: "warning",
      message: `Skipped moving the GHL opportunity to ${target.stageLabel}: ${error}.`,
      details: { ghl_opportunity_id: event.ghl_opportunity_id },
    });

    return { ok: false, skipped: true, error };
  }

  const result = await updateGhlOpportunity(
    event.ghl_opportunity_id,
    buildPlanningStageBody(pipelineId, target.stageId),
  );

  if (!result.ok) {
    await logIntegrationEvent({
      direction: "PORTAL_TO_GHL",
      eventType: target.eventType,
      ghlLocationId: event.ghl_location_id,
      portalEventId: event.id,
      status: "error",
      message: `Failed moving the GHL opportunity to the ${target.stageLabel} stage.`,
      details: {
        ghl_opportunity_id: event.ghl_opportunity_id,
        error: result.error ?? "Unknown GHL error",
      },
    });

    return { ok: false, skipped: false, error: result.error ?? "Unknown GHL error" };
  }

  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: target.eventType,
    ghlLocationId: event.ghl_location_id,
    portalEventId: event.id,
    status: "success",
    message: `GHL opportunity moved to the ${target.stageLabel} stage.`,
    details: { ghl_opportunity_id: event.ghl_opportunity_id },
  });

  return { ok: true };
}

// Called when a planner picks an Event Coordinator on a reservation: assigns
// that GHL user to the event's opportunity so they own it in GHL too. Never
// throws — the reservation save is the primary action.
export async function assignOpportunityCoordinator(
  eventId: string,
  ghlUserId: string,
): Promise<OpportunitySyncOutcome> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  const event = data as EventRow | null;

  if (error || !event) {
    const message = error?.message ?? "Event not found";
    console.error("Failed loading event for coordinator assignment", message);
    return { ok: false, skipped: true, error: message };
  }

  if (!event.ghl_opportunity_id) {
    return { ok: false, skipped: true, error: "Event has no GHL opportunity id" };
  }

  const result = await updateGhlOpportunity(event.ghl_opportunity_id, {
    assignedTo: ghlUserId,
  });

  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: "opportunity_assign_coordinator",
    ghlLocationId: event.ghl_location_id,
    portalEventId: event.id,
    status: result.ok ? "success" : "error",
    message: result.ok
      ? "Event coordinator assigned to the GHL opportunity."
      : "Failed assigning the event coordinator to the GHL opportunity.",
    details: {
      ghl_opportunity_id: event.ghl_opportunity_id,
      ghl_user_id: ghlUserId,
      ...(result.ok ? {} : { error: result.error ?? "Unknown GHL error" }),
    },
  });

  return result.ok
    ? { ok: true }
    : { ok: false, skipped: false, error: result.error ?? "Unknown GHL error" };
}

// Called when an event is deleted: blanks the Event Planning App ID custom
// field on the opportunity so GHL no longer references a dead portal event
// and the inquiry flow can be re-run. Also blanks the portal link field —
// the deleted event's token is dead, so a stale link must not linger in GHL
// workflows. Never throws.
export async function clearEventIdFromOpportunity(
  event: Pick<EventRow, "id" | "ghl_location_id" | "ghl_opportunity_id">,
): Promise<OpportunitySyncOutcome> {
  const fieldId = appConfig.ghl.opportunityEventFieldId;

  if (!event.ghl_opportunity_id || !fieldId) {
    return {
      ok: false,
      skipped: true,
      error: !event.ghl_opportunity_id
        ? "Event has no GHL opportunity id"
        : "GHL_OPPORTUNITY_EVENT_FIELD_ID is not configured",
    };
  }

  const body = buildEventFieldWriteBackBody(fieldId, "");
  if (appConfig.ghl.portalLinkFieldId) {
    body.customFields?.push({
      id: appConfig.ghl.portalLinkFieldId,
      field_value: "",
    });
  }

  const result = await updateGhlOpportunity(event.ghl_opportunity_id, body);

  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: "opportunity_event_id_cleared",
    ghlLocationId: event.ghl_location_id,
    status: result.ok ? "success" : "error",
    message: result.ok
      ? "Portal event deleted; event id cleared from the GHL opportunity."
      : "Failed clearing the portal event id from the GHL opportunity.",
    details: {
      deleted_portal_event_id: event.id,
      ghl_opportunity_id: event.ghl_opportunity_id,
      ...(result.ok ? {} : { error: result.error ?? "Unknown GHL error" }),
    },
  });

  return result.ok
    ? { ok: true }
    : { ok: false, skipped: false, error: result.error ?? "Unknown GHL error" };
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
