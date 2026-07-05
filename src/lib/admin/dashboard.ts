import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type EventStatus = Database["public"]["Enums"]["portal_event_status"];

export type AdminDashboardMetrics = {
  draftPortalCount: number;
  launchedPortalCount: number;
  upcomingLaunchedCount: number;
  integrationReviewCount: number;
  checklistReviewCount: number;
};

export async function getAdminDashboardMetrics(): Promise<AdminDashboardMetrics> {
  const supabase = createServiceRoleSupabaseClient();

  const [
    draftResult,
    launchedResult,
    integrationReviewResult,
    launchedEventsResult,
    checklistReviewResult,
  ] = await Promise.all([
    countEventsByStatus("draft"),
    countEventsByStatus("launched"),
    supabase
      .from("integration_logs")
      .select("id", { count: "exact", head: true })
      .in("status", ["warning", "error"]),
    supabase
      .from("events")
      .select("ghl_snapshot")
      .eq("status", "launched"),
    supabase
      .from("event_checklist_items")
      .select("id", { count: "exact", head: true })
      .eq("status", "needs_review"),
  ]);

  if (draftResult.error) {
    throw new Error(`Unable to count draft portals: ${draftResult.error.message}`);
  }

  if (launchedResult.error) {
    throw new Error(
      `Unable to count launched portals: ${launchedResult.error.message}`,
    );
  }

  if (integrationReviewResult.error) {
    throw new Error(
      `Unable to count integration review items: ${integrationReviewResult.error.message}`,
    );
  }

  if (launchedEventsResult.error) {
    throw new Error(
      `Unable to load launched event dates: ${launchedEventsResult.error.message}`,
    );
  }

  if (checklistReviewResult.error) {
    throw new Error(
      `Unable to count checklist review items: ${checklistReviewResult.error.message}`,
    );
  }

  return {
    draftPortalCount: draftResult.count ?? 0,
    launchedPortalCount: launchedResult.count ?? 0,
    upcomingLaunchedCount: countUpcomingLaunchedEvents(
      launchedEventsResult.data ?? [],
    ),
    integrationReviewCount: integrationReviewResult.count ?? 0,
    checklistReviewCount: checklistReviewResult.count ?? 0,
  };
}

function countEventsByStatus(status: EventStatus) {
  const supabase = createServiceRoleSupabaseClient();

  return supabase
    .from("events")
    .select("id", { count: "exact", head: true })
    .eq("status", status);
}

function countUpcomingLaunchedEvents(
  rows: { ghl_snapshot: Json }[],
): number {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return rows.filter((row) => {
    const eventDate = getEventDate(row.ghl_snapshot);

    return eventDate ? eventDate >= today : false;
  }).length;
}

function getEventDate(snapshot: Json): Date | null {
  if (!snapshot || typeof snapshot !== "object" || Array.isArray(snapshot)) {
    return null;
  }

  const value = (snapshot as Record<string, Json | undefined>).eventDate;

  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) {
    return null;
  }

  const date = new Date(`${value}T00:00:00`);

  return Number.isNaN(date.getTime()) ? null : date;
}
