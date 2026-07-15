import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type IntegrationStatus = Database["public"]["Enums"]["integration_status"];
type IntegrationDirection = Database["public"]["Enums"]["integration_direction"];

type IntegrationLogInsert = {
  direction: IntegrationDirection;
  event_type: string;
  ghl_location_id: string | null;
  ghl_event_record_id: string | null;
  portal_event_id: string | null;
  status: IntegrationStatus;
  message: string;
  details: Json;
};

export type LogIntegrationEventArgs = {
  direction?: IntegrationDirection;
  eventType: string;
  ghlLocationId?: string | null;
  ghlEventRecordId?: string | null;
  portalEventId?: string | null;
  status: IntegrationStatus;
  message: string;
  details?: Json;
};

export async function logIntegrationEvent({
  direction = "GHL_TO_PORTAL",
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
    direction,
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
