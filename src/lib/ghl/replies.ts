import { hasUnseenReply } from "@/lib/ghl/reply-flags";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";

// "New reply" flags for the Opportunities board. A GHL workflow ("Customer
// Replied" → Webhook) posts every inbound client message to /api/ghl/replies,
// which stamps last_inbound_at here; the board reads these rows and never asks
// GHL. Opening a contact's conversations in the portal stamps seen_at, which
// clears the flag until the client writes again. Table: ghl_contact_replies.

// .in() lists ride in the request URL; same chunk size as companies.ts.
const IN_CHUNK = 150;

export async function recordInboundReply(contactId: string): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  // Upsert touches only last_inbound_at, so an earlier seen_at stays put and
  // the flag comes back on.
  const { error } = await supabase
    .from("ghl_contact_replies")
    .upsert(
      {
        ghl_contact_id: contactId,
        last_inbound_at: new Date().toISOString(),
      } as never,
      { onConflict: "ghl_contact_id" },
    );

  if (error) {
    throw new Error(`Unable to record the reply: ${error.message}`);
  }
}

// Never throws: a missed "seen" only leaves the flag up a little longer.
export async function markContactRepliesSeen(contactId: string): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase
    .from("ghl_contact_replies")
    .update({ seen_at: new Date().toISOString() } as never)
    .eq("ghl_contact_id", contactId);

  if (error) {
    console.error("Unable to mark replies seen", error.message);
  }
}

// The contacts (of those given) with a reply nobody has opened yet.
export async function getContactsWithNewReplies(
  contactIds: string[],
): Promise<string[]> {
  const ids = [...new Set(contactIds)];
  if (ids.length === 0) return [];

  const supabase = createServiceRoleSupabaseClient();
  const chunks: string[][] = [];
  for (let index = 0; index < ids.length; index += IN_CHUNK) {
    chunks.push(ids.slice(index, index + IN_CHUNK));
  }

  const results = await Promise.all(
    chunks.map((chunk) =>
      supabase
        .from("ghl_contact_replies")
        .select("ghl_contact_id, last_inbound_at, seen_at")
        .in("ghl_contact_id", chunk),
    ),
  );

  const flagged: string[] = [];
  for (const { data, error } of results) {
    if (error) {
      console.error("Unable to load reply flags", error.message);
      continue;
    }
    for (const row of (data ?? []) as {
      ghl_contact_id: string;
      last_inbound_at: string;
      seen_at: string | null;
    }[]) {
      if (hasUnseenReply(row)) flagged.push(row.ghl_contact_id);
    }
  }
  return flagged;
}
