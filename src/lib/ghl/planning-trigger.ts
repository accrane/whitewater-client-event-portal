import { moveOpportunityToPlanning } from "@/lib/ghl/opportunity-sync";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

// Called after a planner saves a calendar block linked to a portal event:
// pushes the event's GHL opportunity into the Planning stage. Never throws —
// the reservation save is the primary action, and outcomes are recorded in
// integration_logs by opportunity-sync.
export async function triggerPlanningStageForEvent(eventId: string) {
  const supabase = createServiceRoleSupabaseClient();

  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", eventId)
    .maybeSingle();

  if (error || !data) {
    console.error(
      "Failed loading event for GHL planning-stage trigger",
      error?.message ?? "event not found",
    );
    return;
  }

  await moveOpportunityToPlanning(data as EventRow);
}
