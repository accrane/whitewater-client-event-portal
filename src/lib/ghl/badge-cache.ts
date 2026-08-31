import { listContactNotes } from "@/lib/ghl/notes";
import { listContactTasks } from "@/lib/ghl/tasks";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// Locally cached note/open-task counts per GHL contact (ghl_contact_badges),
// so the Opportunities board can badge 100-250 cards instantly with zero GHL
// calls at view time — the Salesforce archive shows that's the real
// in-season pipeline size. Freshness comes from two directions: board views
// trigger paced sweeps of the stalest rows, and the notes/tasks drawer
// routes push exact counts here whenever they load live data anyway.

type BadgeRow = Database["public"]["Tables"]["ghl_contact_badges"]["Row"];

export type ContactBadgeCounts = { noteCount: number; openTaskCount: number };

const STALE_AFTER_MINUTES = 5;
// Per-sweep cap: 2 GHL calls per contact at CONCURRENCY, so a full sweep
// stays a few seconds long and far inside GHL's burst limit. Regular board
// views progressively work through a big pipeline, stalest contacts first.
const SWEEP_LIMIT = 60;
const CONCURRENCY = 5;

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

// Which of these contacts have no badge row, or one older than the
// staleness window — stalest first, so sweeps converge on a big pipeline.
export async function findStaleContactIds(
  contactIds: string[],
): Promise<string[]> {
  const ids = [...new Set(contactIds)];
  if (ids.length === 0) return [];

  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("ghl_contact_badges")
    .select("ghl_contact_id, refreshed_at")
    .in("ghl_contact_id", ids);

  if (error) {
    console.error("Failed checking badge staleness", error.message);
    return [];
  }

  const rows = (data ?? []) as Pick<BadgeRow, "ghl_contact_id" | "refreshed_at">[];
  const refreshedAt = new Map(
    rows.map((row) => [row.ghl_contact_id, row.refreshed_at]),
  );
  const cutoff = Date.now() - STALE_AFTER_MINUTES * 60 * 1000;

  return ids
    .filter((id) => {
      const refreshed = refreshedAt.get(id);
      return !refreshed || new Date(refreshed).getTime() < cutoff;
    })
    .sort((a, b) => {
      const aTime = refreshedAt.get(a) ? new Date(refreshedAt.get(a)!).getTime() : 0;
      const bTime = refreshedAt.get(b) ? new Date(refreshedAt.get(b)!).getTime() : 0;
      return aTime - bTime;
    });
}

// Sweeps up to `limit` contacts against GHL and stores their counts. Paced
// and capped so it never threatens GHL's rate limits; safe to fire from
// after() on every board view. Errors are per-contact and non-fatal.
export async function refreshContactBadges(
  contactIds: string[],
  limit: number = SWEEP_LIMIT,
): Promise<number> {
  const ids = contactIds.slice(0, limit);
  if (ids.length === 0) return 0;

  const supabase = createServiceRoleSupabaseClient();
  let cursor = 0;
  let refreshed = 0;

  const worker = async () => {
    while (cursor < ids.length) {
      const contactId = ids[cursor];
      cursor += 1;
      try {
        const [notes, tasks] = await Promise.all([
          listContactNotes(contactId),
          listContactTasks(contactId),
        ]);
        const { error } = await supabase.from("ghl_contact_badges").upsert({
          ghl_contact_id: contactId,
          note_count: notes.length,
          open_task_count: tasks.filter((task) => !task.completed).length,
          refreshed_at: new Date().toISOString(),
        } as never);
        if (error) {
          console.error("Failed storing contact badge", error.message);
        } else {
          refreshed += 1;
        }
      } catch {
        // Badge refresh is best-effort; the drawers always load live data.
      }
    }
  };

  await Promise.all(
    Array.from({ length: Math.min(CONCURRENCY, ids.length) }, worker),
  );

  return refreshed;
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
