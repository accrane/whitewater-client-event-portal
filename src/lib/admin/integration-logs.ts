import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type IntegrationLogRow = Database["public"]["Tables"]["integration_logs"]["Row"];

export type AdminIntegrationLogListItem = {
  id: string;
  direction: IntegrationLogRow["direction"];
  eventType: string;
  ghlLocationId: string | null;
  ghlEventRecordId: string | null;
  portalEventId: string | null;
  status: IntegrationLogRow["status"];
  message: string;
  detailSummary: string | null;
  createdAt: string;
};

export async function listAdminIntegrationLogs(): Promise<
  AdminIntegrationLogListItem[]
> {
  const supabase = createServiceRoleSupabaseClient();

  const { data, error } = await supabase
    .from("integration_logs")
    .select(
      "id, direction, event_type, ghl_location_id, ghl_event_record_id, portal_event_id, status, message, details, created_at",
    )
    .order("created_at", { ascending: false })
    .limit(50);

  if (error) {
    throw new Error(`Unable to load integration logs: ${error.message}`);
  }

  return (data ?? []).map(mapIntegrationLogRowToListItem);
}

function mapIntegrationLogRowToListItem(
  row: IntegrationLogRow,
): AdminIntegrationLogListItem {
  return {
    id: row.id,
    direction: row.direction,
    eventType: row.event_type,
    ghlLocationId: row.ghl_location_id,
    ghlEventRecordId: row.ghl_event_record_id,
    portalEventId: row.portal_event_id,
    status: row.status,
    message: row.message,
    detailSummary: summarizeDetails(row.details),
    createdAt: row.created_at,
  };
}

function summarizeDetails(details: Json): string | null {
  if (!details || typeof details !== "object" || Array.isArray(details)) {
    return null;
  }

  const entries = Object.entries(details).filter(([, value]) => {
    return value !== null && value !== undefined && value !== "";
  });

  if (entries.length === 0) {
    return null;
  }

  return entries
    .slice(0, 3)
    .map(([key, value]) => `${key}: ${formatJsonValue(value)}`)
    .join(" · ");
}

function formatJsonValue(value: Json | undefined): string {
  if (typeof value === "string") {
    return value;
  }

  if (typeof value === "number" || typeof value === "boolean") {
    return String(value);
  }

  return JSON.stringify(value);
}