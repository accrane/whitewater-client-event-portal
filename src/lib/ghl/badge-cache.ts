import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// Locally cached note/open-task counts per GHL contact (ghl_contact_badges),
// so the Opportunities board can badge 100-250 cards instantly with zero GHL
// calls at view time — the Salesforce archive shows that's the real
// in-season pipeline size. Counts are exactly what the notes/tasks drawers
// last loaded (their routes push them here), so they can lag behind notes or
// tasks added straight in GHL. There is deliberately no background sweep: it
// cost up to 120 GHL calls a board view. New client messages are flagged
// separately and pushed by GHL (src/lib/ghl/replies.ts).

type BadgeRow = Database["public"]["Tables"]["ghl_contact_badges"]["Row"];

export type ContactBadgeCounts = { noteCount: number; openTaskCount: number };

export async function getStoredContactBadges(
  contactIds: string[],
): Promise<Record<string, ContactBadgeCounts>> {
  const ids = [...new Set(contactIds)];
  if (ids.length === 0) return {};

  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("ghl_contact_badges")
    .select("ghl_contact_id, note_count, open_task_count")
    .in("ghl_contact_id", ids);

  if (error) {
    console.error("Failed reading contact badges", error.message);
    return {};
  }

  const badges: Record<string, ContactBadgeCounts> = {};
  for (const row of (data ?? []) as Pick<
    BadgeRow,
    "ghl_contact_id" | "note_count" | "open_task_count"
  >[]) {
    badges[row.ghl_contact_id] = {
      noteCount: row.note_count,
      openTaskCount: row.open_task_count,
    };
  }
  return badges;
}

// Exact-count update from a drawer route that just loaded live data anyway —
// keeps the cache fresh for free. Pass only the count that was loaded; the
// other column is preserved (or defaults to 0 on a brand-new row).
export async function storeContactBadgeCounts(
  contactId: string,
  counts: { noteCount?: number; openTaskCount?: number },
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();

  const { data, error: readError } = await supabase
    .from("ghl_contact_badges")
    .select("note_count, open_task_count")
    .eq("ghl_contact_id", contactId)
    .maybeSingle();

  if (readError) {
    console.error("Failed reading contact badge", readError.message);
    return;
  }

  const existing = data as Pick<BadgeRow, "note_count" | "open_task_count"> | null;
  const { error } = await supabase.from("ghl_contact_badges").upsert({
    ghl_contact_id: contactId,
    note_count: counts.noteCount ?? existing?.note_count ?? 0,
    open_task_count: counts.openTaskCount ?? existing?.open_task_count ?? 0,
    refreshed_at: new Date().toISOString(),
  } as never);

  if (error) {
    console.error("Failed storing contact badge", error.message);
  }
}
