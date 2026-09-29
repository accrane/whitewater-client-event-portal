import "server-only";

import {
  assignCoordinatorColors,
  UNASSIGNED_COLOR,
} from "@/lib/admin/coordinator-color-rules";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";

export { UNASSIGNED_COLOR };

// Each coordinator's stored color (see coordinator-color-rules.ts), handing
// one out to anyone in `userIds` who has none yet. Pass ids in a stable order
// (GHL's coordinator list first) so first-time colors follow it. Never throws:
// if the table can't be read or written, the colors are still worked out for
// this page, just not kept.
export async function getCoordinatorColors(
  userIds: readonly string[],
): Promise<Map<string, string>> {
  const supabase = createServiceRoleSupabaseClient();

  for (let attempt = 0; attempt < 3; attempt++) {
    const { data, error } = await supabase
      .from("coordinator_colors")
      .select("ghl_user_id, color");
    if (error) {
      console.error("Failed reading coordinator colors", error.message);
      return assignCoordinatorColors(userIds, new Map()).colors;
    }

    const stored = new Map(data.map((row) => [row.ghl_user_id, row.color]));
    const { colors, added } = assignCoordinatorColors(userIds, stored);
    if (added.length === 0) return colors;

    const { error: insertError } = await supabase
      .from("coordinator_colors")
      .insert(added.map(([ghl_user_id, color]) => ({ ghl_user_id, color })));
    if (!insertError) return colors;

    // 23505: another page view handed out the same user or color first —
    // read again and pick around it.
    if (insertError.code !== "23505") {
      console.error("Failed saving coordinator colors", insertError.message);
      return colors;
    }
  }

  return assignCoordinatorColors(userIds, new Map()).colors;
}
