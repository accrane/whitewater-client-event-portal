import { after } from "next/server";

import { appConfig } from "@/lib/env";
import { getGhlApiHeaders, ghlFetch } from "@/lib/ghl/client";
import {
  checkedActivity,
  nextActivity,
  parseConversationSummary,
  readMessageHistory,
  type ConversationActivity,
  type ConversationSummary,
} from "@/lib/ghl/conversation-activity-rules";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

// Who wrote last in each contact's GHL conversation, behind the
// Opportunities card badges (Client waiting, Quiet, Not contacted). Sized
// for 100-250 cards with no GHL call per card: each board view reads GHL's
// conversation list newest first and stops at the first conversation it has
// already recorded — one request, most views — then reads the rows here.
// Rows the list can't settle (an automated message came after a person's)
// and board contacts with no row yet get a look at their message history
// after the page has been sent, a few per view. Table:
// ghl_conversation_activity; the rules are in conversation-activity-rules.ts.

const CONVERSATIONS_API_VERSION = "2021-04-15";
const LIST_PAGE_SIZE = 100;
// The first sync (empty table) reads further back; later ones only need the
// conversations that changed since the last view.
const FIRST_SYNC_MAX_PAGES = 10;
const SYNC_MAX_PAGES = 3;
// History look-ups per board view, and how many run at once.
const CHECKS_PER_VIEW = 12;
const CHECK_CONCURRENCY = 3;
// .in() lists ride in the request URL; same chunk size as replies.ts.
const IN_CHUNK = 150;

type ActivityRow =
  Database["public"]["Tables"]["ghl_conversation_activity"]["Row"];
type ActivityInsert =
  Database["public"]["Tables"]["ghl_conversation_activity"]["Insert"];

type StoredActivity = { activity: ConversationActivity; updatedAt: string };

function conversationsHeaders(accessToken: string): HeadersInit {
  return {
    ...getGhlApiHeaders(accessToken),
    Version: CONVERSATIONS_API_VERSION,
  };
}

function toActivity(row: ActivityRow): ConversationActivity {
  return {
    conversationId: row.ghl_conversation_id,
    lastMessageAt: row.last_message_at,
    lastManualAt: row.last_manual_at,
    lastHumanAt: row.last_human_at,
    lastHumanDirection: row.last_human_direction,
    lastAutomatedAt: row.last_automated_at,
    needsCheck: row.needs_check,
    checkedAt: row.checked_at,
  };
}

function toRow(
  contactId: string,
  activity: ConversationActivity,
  nowIso: string,
): ActivityInsert {
  return {
    ghl_contact_id: contactId,
    ghl_conversation_id: activity.conversationId,
    last_message_at: activity.lastMessageAt,
    last_manual_at: activity.lastManualAt,
    last_human_at: activity.lastHumanAt,
    last_human_direction: activity.lastHumanDirection,
    last_automated_at: activity.lastAutomatedAt,
    needs_check: activity.needsCheck,
    checked_at: activity.checkedAt,
    updated_at: nowIso,
  };
}

function chunks<T>(items: T[], size: number): T[][] {
  const result: T[][] = [];
  for (let index = 0; index < items.length; index += size) {
    result.push(items.slice(index, index + size));
  }
  return result;
}

function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}

async function readStoredActivity(
  contactIds: string[],
): Promise<Map<string, StoredActivity>> {
  const ids = [...new Set(contactIds.filter(Boolean))];
  const stored = new Map<string, StoredActivity>();
  if (ids.length === 0) return stored;

  const supabase = createServiceRoleSupabaseClient();
  const results = await Promise.all(
    chunks(ids, IN_CHUNK).map((chunk) =>
      supabase
        .from("ghl_conversation_activity")
        .select("*")
        .in("ghl_contact_id", chunk),
    ),
  );
  for (const { data, error } of results) {
    if (error) throw new Error(error.message);
    for (const row of (data ?? []) as ActivityRow[]) {
      stored.set(row.ghl_contact_id, {
        activity: toActivity(row),
        updatedAt: row.updated_at,
      });
    }
  }
  return stored;
}

// Records every conversation that changed since the newest one on file.
// Never throws: the badges are a convenience, and a missed sync only leaves
// them a view behind.
export async function syncConversationActivity(): Promise<void> {
  const { accessToken, apiBaseUrl, locationId } = appConfig.ghl;
  if (!accessToken || !locationId) return;

  try {
    const supabase = createServiceRoleSupabaseClient();
    const { data: newest, error } = await supabase
      .from("ghl_conversation_activity")
      .select("last_message_at")
      .not("last_message_at", "is", null)
      .order("last_message_at", { ascending: false })
      .limit(1);
    if (error) throw new Error(error.message);
    const highWater = (newest as { last_message_at: string }[] | null)?.[0]
      ?.last_message_at;
    const highWaterMs = highWater ? Date.parse(highWater) : null;

    // Newest first, so a contact's first entry is its newest conversation.
    const changed = new Map<string, ConversationSummary>();
    let startAfter: unknown = null;
    const maxPages = highWaterMs === null ? FIRST_SYNC_MAX_PAGES : SYNC_MAX_PAGES;
    for (let page = 0; page < maxPages; page += 1) {
      const params = new URLSearchParams({
        locationId,
        limit: String(LIST_PAGE_SIZE),
        sortBy: "last_message_date",
        sort: "desc",
      });
      if (startAfter !== null) params.set("startAfterDate", String(startAfter));
      const response = await ghlFetch(
        `${apiBaseUrl}/conversations/search?${params.toString()}`,
        { headers: conversationsHeaders(accessToken) },
      );
      if (!response.ok) {
        throw new Error(`GHL conversations search failed (${response.status})`);
      }
      const data = (await response.json()) as { conversations?: unknown[] };
      const entries = data.conversations ?? [];

      let caughtUp = false;
      for (const raw of entries) {
        const summary = parseConversationSummary(raw);
        if (!summary) continue;
        if (
          highWaterMs !== null &&
          summary.lastMessageAt &&
          Date.parse(summary.lastMessageAt) <= highWaterMs
        ) {
          caughtUp = true;
          break;
        }
        if (!changed.has(summary.contactId)) {
          changed.set(summary.contactId, summary);
        }
      }
      if (caughtUp || entries.length < LIST_PAGE_SIZE) break;

      // GHL pages by the last entry's sort value (its lastMessageDate).
      const last = entries.at(-1) as
        | { sort?: unknown[]; lastMessageDate?: unknown }
        | undefined;
      startAfter = last?.sort?.[0] ?? last?.lastMessageDate ?? null;
      if (startAfter === null) break;
    }
    if (changed.size === 0) return;

    const stored = await readStoredActivity([...changed.keys()]);
    const nowIso = new Date().toISOString();
    const rows = [...changed.entries()].map(([contactId, summary]) =>
      toRow(
        contactId,
        nextActivity(summary, stored.get(contactId)?.activity ?? null, nowIso),
        nowIso,
      ),
    );
    for (const chunk of chunks(rows, 500)) {
      const { error: writeError } = await supabase
        .from("ghl_conversation_activity")
        .upsert(chunk as never, { onConflict: "ghl_contact_id" });
      if (writeError) throw new Error(writeError.message);
    }
  } catch (error) {
    console.error("Conversation activity sync failed:", errorMessage(error));
  }
}

// What the portal knows for these contacts. Never throws; an unreadable
// table just means no conversation badges.
export async function readConversationActivity(
  contactIds: string[],
): Promise<Map<string, ConversationActivity>> {
  try {
    const stored = await readStoredActivity(contactIds);
    return new Map(
      [...stored.entries()].map(([contactId, entry]) => [
        contactId,
        entry.activity,
      ]),
    );
  } catch (error) {
    console.error("Unable to read conversation activity:", errorMessage(error));
    return new Map();
  }
}

// Whether the card can trust a row: a history look-up has settled it.
export function isConversationActivitySettled(
  activity: ConversationActivity | undefined,
): activity is ConversationActivity {
  return Boolean(activity && activity.checkedAt && !activity.needsCheck);
}

// Queues history look-ups for board contacts the list couldn't settle,
// the given (visible) contacts first. Runs after the page has been sent.
export function scheduleConversationChecks(
  priorityContactIds: string[],
  otherContactIds: string[],
  known: Map<string, ConversationActivity>,
): void {
  const { accessToken, locationId } = appConfig.ghl;
  if (!accessToken || !locationId) return;

  const pending = [
    ...new Set([...priorityContactIds, ...otherContactIds].filter(Boolean)),
  ]
    .filter((contactId) => !isConversationActivitySettled(known.get(contactId)))
    .slice(0, CHECKS_PER_VIEW);
  if (pending.length === 0) return;

  after(() => checkConversationActivity(pending));
}

async function fetchHistory(conversationId: string) {
  const { accessToken, apiBaseUrl } = appConfig.ghl;
  if (!accessToken) throw new Error("GHL_ACCESS_TOKEN is not configured");
  const response = await ghlFetch(
    `${apiBaseUrl}/conversations/${encodeURIComponent(conversationId)}/messages?limit=100`,
    { headers: conversationsHeaders(accessToken) },
  );
  if (!response.ok) {
    throw new Error(`GHL conversation messages fetch failed (${response.status})`);
  }
  const data = (await response.json()) as {
    messages?: { messages?: unknown[] } | unknown[];
  };
  const raw = Array.isArray(data.messages)
    ? data.messages
    : (data.messages?.messages ?? []);
  return readMessageHistory(raw);
}

// The contact's newest conversation from GHL, or null when they have none.
async function findContactConversation(
  contactId: string,
): Promise<ConversationSummary | null> {
  const { accessToken, apiBaseUrl, locationId } = appConfig.ghl;
  if (!accessToken || !locationId) {
    throw new Error("GHL_ACCESS_TOKEN or GHL_LOCATION_ID is not configured");
  }
  const params = new URLSearchParams({ locationId, contactId, limit: "20" });
  const response = await ghlFetch(
    `${apiBaseUrl}/conversations/search?${params.toString()}`,
    { headers: conversationsHeaders(accessToken) },
  );
  if (!response.ok) {
    throw new Error(`GHL conversations search failed (${response.status})`);
  }
  const data = (await response.json()) as { conversations?: unknown[] };
  const summaries = (data.conversations ?? [])
    .map(parseConversationSummary)
    .filter((summary): summary is ConversationSummary => summary !== null)
    .sort(
      (a, b) =>
        Date.parse(b.lastMessageAt ?? "0") - Date.parse(a.lastMessageAt ?? "0"),
    );
  return summaries[0] ?? null;
}

async function checkContact(
  contactId: string,
  current: StoredActivity | undefined,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const nowIso = new Date().toISOString();

  if (current?.activity.conversationId) {
    const findings = await fetchHistory(current.activity.conversationId);
    const settled = checkedActivity(
      current.activity,
      current.activity.conversationId,
      findings,
      nowIso,
    );
    // Only if no sync wrote the row meanwhile; otherwise the next view
    // checks again with the newer row.
    const { error } = await supabase
      .from("ghl_conversation_activity")
      .update({
        last_human_at: settled.lastHumanAt,
        last_human_direction: settled.lastHumanDirection,
        last_automated_at: settled.lastAutomatedAt,
        needs_check: false,
        checked_at: nowIso,
        updated_at: nowIso,
      } as never)
      .eq("ghl_contact_id", contactId)
      .eq("updated_at", current.updatedAt);
    if (error) throw new Error(error.message);
    return;
  }

  // No row yet: the contact's conversation predates what the list sync has
  // read, or they have none. The row leaves last_message_at empty so the
  // sync's high-water mark only ever comes from the list itself.
  const summary = await findContactConversation(contactId);
  let activity: ConversationActivity;
  if (!summary) {
    activity = {
      conversationId: null,
      lastMessageAt: null,
      lastManualAt: null,
      lastHumanAt: null,
      lastHumanDirection: null,
      lastAutomatedAt: null,
      needsCheck: false,
      checkedAt: nowIso,
    };
  } else {
    activity = nextActivity(summary, null, nowIso);
    if (activity.needsCheck) {
      activity = checkedActivity(
        activity,
        summary.conversationId,
        await fetchHistory(summary.conversationId),
        nowIso,
      );
    }
  }
  const { error } = await supabase
    .from("ghl_conversation_activity")
    .upsert(
      toRow(contactId, { ...activity, lastMessageAt: null }, nowIso) as never,
      { onConflict: "ghl_contact_id", ignoreDuplicates: true },
    );
  if (error) throw new Error(error.message);
}

export async function checkConversationActivity(
  contactIds: string[],
): Promise<void> {
  let stored: Map<string, StoredActivity>;
  try {
    stored = await readStoredActivity(contactIds);
  } catch (error) {
    console.error("Conversation checks skipped:", errorMessage(error));
    return;
  }

  const queue = contactIds.filter((contactId) => {
    const entry = stored.get(contactId);
    return !entry || entry.activity.needsCheck || !entry.activity.checkedAt;
  });
  let next = 0;
  await Promise.all(
    Array.from({ length: Math.min(CHECK_CONCURRENCY, queue.length) }, async () => {
      while (next < queue.length) {
        const contactId = queue[next++];
        try {
          await checkContact(contactId, stored.get(contactId));
        } catch (error) {
          console.error(
            `Conversation check failed for ${contactId}:`,
            errorMessage(error),
          );
        }
      }
    }),
  );
}
