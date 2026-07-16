import { appConfig } from "@/lib/env";
import {
  writePortalLinkToOpportunity,
  type OpportunitySyncOutcome,
} from "@/lib/ghl/opportunity-sync";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import { createSecureToken, sha256Hex } from "@/lib/tokens";
import type { Database, Json } from "@/types/database";

import { buildPortalPath, buildPortalUrl } from "./portal-urls";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type IntegrationStatus = Database["public"]["Enums"]["integration_status"];

type IntegrationLogInsert = {
  direction: "PORTAL_TO_GHL";
  event_type: string;
  ghl_location_id: string | null;
  ghl_event_record_id: string | null;
  portal_event_id: string | null;
  status: IntegrationStatus;
  message: string;
  details: Json;
};

export type PortalLaunchPreparation = {
  eventId: string;
  token: string;
  tokenHash: string;
  portalUrl: string;
  launchedAt: string;
};

export async function preparePortalLaunchFields({
  eventId,
  token = createSecureToken(),
  now = new Date(),
}: {
  eventId: string;
  portalBaseUrl?: string;
  token?: string;
  now?: Date;
}): Promise<PortalLaunchPreparation> {
  const tokenHash = await sha256Hex(token);

  return {
    eventId,
    token,
    tokenHash,
    portalUrl: buildPortalPath(token),
    launchedAt: now.toISOString(),
  };
}

export async function prepareAdminPortalLaunch(
  eventId: string,
): Promise<PortalLaunchPreparation> {
  const supabase = createServiceRoleSupabaseClient();
  const { data: event, error: eventError } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (eventError) {
    throw new Error(`Unable to load event for portal launch: ${eventError.message}`);
  }

  if (!event) {
    throw new Error("Unable to prepare portal launch: event not found");
  }

  assertLaunchableEvent(event as EventRow);

  const launch = await preparePortalLaunchFields({ eventId });
  const updatePayload: Database["public"]["Tables"]["events"]["Update"] = {
    status: "launched",
    client_portal_token_hash: launch.tokenHash,
    client_portal_url: launch.portalUrl,
    launched_at: launch.launchedAt,
    expired_at: null,
  };

  const { error: updateError } = await supabase
    .from("events")
    .update(updatePayload as never)
    .eq("id", eventId);

  if (updateError) {
    throw new Error(`Unable to prepare portal launch: ${updateError.message}`);
  }

  // Push the absolute portal link onto the GHL opportunity so GHL workflows
  // (client email/SMS templates) can reference it. Non-fatal by design.
  const portalLink = buildPortalUrl(appConfig.portalBaseUrl, launch.token);
  const writeBack = await writePortalLinkToOpportunity(
    event as EventRow,
    portalLink,
  );

  await logPortalLaunchHandoff(event as EventRow, launch, writeBack);

  return launch;
}

function assertLaunchableEvent(event: EventRow) {
  if (event.status !== "draft") {
    throw new Error(
      `Unable to prepare portal launch: expected draft event, got ${event.status}`,
    );
  }

  if (event.client_portal_token_hash || event.client_portal_url) {
    throw new Error("Unable to prepare portal launch: portal access already exists");
  }
}

async function logPortalLaunchHandoff(
  event: EventRow,
  launch: PortalLaunchPreparation,
  portalLinkWriteBack: OpportunitySyncOutcome,
) {
  const supabase = createServiceRoleSupabaseClient();
  const insertPayload: IntegrationLogInsert = {
    direction: "PORTAL_TO_GHL",
    event_type: "portal_launch_prepared",
    ghl_location_id: event.ghl_location_id,
    ghl_event_record_id: event.ghl_event_record_id,
    portal_event_id: launch.eventId,
    status: portalLinkWriteBack.ok ? "success" : "warning",
    message: portalLinkWriteBack.ok
      ? "Portal launch prepared; portal link written to the GHL opportunity. Client notification remains GHL-owned."
      : "Portal launch prepared, but the portal link was not written to the GHL opportunity. Client notification remains GHL-owned.",
    details: {
      portal_event_id: launch.eventId,
      launched_at: launch.launchedAt,
      ghl_writeback_status: portalLinkWriteBack.ok
        ? "portal_link_written"
        : `portal_link_write_failed: ${portalLinkWriteBack.error}`,
      client_notification_status: "not_sent_by_portal",
    },
  };

  const { error } = await supabase
    .from("integration_logs")
    .insert(insertPayload as never);

  if (error) {
    console.error("Failed writing portal launch handoff log", error.message);
  }
}