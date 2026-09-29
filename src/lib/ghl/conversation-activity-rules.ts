// The rules for "who wrote last?" in a GHL conversation, behind the
// Opportunities card badges (see conversation-activity.ts for the syncing).
//
// GHL's conversation list gives each conversation's newest message
// (direction, time, and for an outbound one whether a workflow sent it) and
// the time of the newest message a person wrote — but not whose that was
// once an automated message has come after it. A client who replies and then
// gets an automated reminder looks, from the list alone, like a contact we
// wrote to last. So a list entry either settles the row on its own, or marks
// it for a look at the message history, which these rules also read.
//
// Import-free so the rules are testable directly.

export type HumanDirection = "inbound" | "outbound";

// One entry of GET /conversations/search, reduced to what the rules use.
export type ConversationSummary = {
  conversationId: string;
  contactId: string;
  lastMessageAt: string | null;
  lastMessageDirection: HumanDirection | null;
  // For an outbound newest message: a workflow (not a person) sent it.
  lastMessageAutomated: boolean;
  // GHL's lastManualMessageDate: the newest message a person wrote, either way.
  lastManualAt: string | null;
};

export type ConversationActivity = {
  conversationId: string | null;
  // The list's newest message time; the sync's high-water mark.
  lastMessageAt: string | null;
  // GHL's lastManualMessageDate as the list last reported it. A different
  // value in a later entry means a person has written again.
  lastManualAt: string | null;
  // The newest message a person wrote, and whose: the client (inbound) or
  // staff (outbound).
  lastHumanAt: string | null;
  lastHumanDirection: HumanDirection | null;
  lastAutomatedAt: string | null;
  // lastHuman* may be out of date until a history look-up clears this.
  needsCheck: boolean;
  checkedAt: string | null;
};

// GHL stamps one message a few hundred milliseconds apart in different
// places (the list's lastMessageDate vs lastManualMessageDate vs the
// message's own dateAdded), so "the same message" allows a little slack.
export const SAME_MESSAGE_MS = 5_000;

// Message types that are correspondence between people. Activity rows
// (TYPE_ACTIVITY_*), no-show placeholders and internal comments are not.
const PERSON_MESSAGE_TYPES = new Set([
  "TYPE_EMAIL",
  "TYPE_SMS",
  "TYPE_CALL",
  "TYPE_LIVE_CHAT",
  "TYPE_WHATSAPP",
  "TYPE_FACEBOOK",
  "TYPE_INSTAGRAM",
  "TYPE_GMB",
  "TYPE_CUSTOM_EMAIL",
  "TYPE_CUSTOM_SMS",
]);

// Message sources that mean a machine sent it. GHL records some workflow
// emails as inbound too (the inquiry form's own email), and those aren't the
// client writing either.
const AUTOMATED_SOURCES = new Set([
  "workflow",
  "bulk_actions",
  "campaign",
  "automation",
  "trigger",
]);

export function toIsoInstant(value: unknown): string | null {
  if (typeof value === "number" && Number.isFinite(value)) {
    return new Date(value).toISOString();
  }
  if (typeof value === "string" && value) {
    const parsed = Date.parse(value);
    return Number.isNaN(parsed) ? null : new Date(parsed).toISOString();
  }
  return null;
}

export function sameInstant(
  a: string | null | undefined,
  b: string | null | undefined,
): boolean {
  if (!a || !b) return false;
  return Math.abs(Date.parse(a) - Date.parse(b)) <= SAME_MESSAGE_MS;
}

export function parseConversationSummary(
  raw: unknown,
): ConversationSummary | null {
  if (!raw || typeof raw !== "object") return null;
  const entry = raw as Record<string, unknown>;
  const conversationId = typeof entry.id === "string" ? entry.id : "";
  const contactId = typeof entry.contactId === "string" ? entry.contactId : "";
  if (!conversationId || !contactId) return null;

  const direction =
    entry.lastMessageDirection === "inbound" ||
    entry.lastMessageDirection === "outbound"
      ? entry.lastMessageDirection
      : null;

  return {
    conversationId,
    contactId,
    lastMessageAt: toIsoInstant(entry.lastMessageDate),
    lastMessageDirection: direction,
    lastMessageAutomated: entry.lastOutboundMessageAction === "automated",
    lastManualAt: toIsoInstant(entry.lastManualMessageDate),
  };
}

// The row to keep after seeing one list entry, given what was stored.
export function nextActivity(
  summary: ConversationSummary,
  stored: ConversationActivity | null,
  nowIso: string,
): ConversationActivity {
  const base = {
    conversationId: summary.conversationId,
    lastMessageAt: summary.lastMessageAt,
    lastManualAt: summary.lastManualAt,
    lastAutomatedAt:
      summary.lastMessageDirection === "outbound" && summary.lastMessageAutomated
        ? summary.lastMessageAt
        : (stored?.lastAutomatedAt ?? null),
  };

  // The newest message is a person's, so the list says whose. An inbound
  // one GHL didn't count as manual came from a workflow, not the client.
  const newestIsPerson =
    summary.lastMessageAt !== null &&
    (summary.lastMessageDirection === "inbound"
      ? sameInstant(summary.lastManualAt, summary.lastMessageAt)
      : summary.lastMessageDirection === "outbound" &&
        !summary.lastMessageAutomated);
  if (newestIsPerson) {
    return {
      ...base,
      lastManualAt: summary.lastManualAt ?? summary.lastMessageAt,
      lastHumanAt: summary.lastMessageAt,
      lastHumanDirection: summary.lastMessageDirection,
      needsCheck: false,
      checkedAt: nowIso,
    };
  }

  // No person has written in this conversation at all.
  if (!summary.lastManualAt) {
    return {
      ...base,
      lastHumanAt: null,
      lastHumanDirection: null,
      needsCheck: false,
      checkedAt: nowIso,
    };
  }

  // Nobody has written since the last look; only automated messages.
  if (stored && sameInstant(stored.lastManualAt, summary.lastManualAt)) {
    return {
      ...base,
      lastManualAt: stored.lastManualAt,
      lastHumanAt: stored.lastHumanAt,
      lastHumanDirection: stored.lastHumanDirection,
      needsCheck: stored.needsCheck,
      checkedAt: stored.checkedAt,
    };
  }

  // A person wrote something the portal hasn't seen, and an automated
  // message came after it: whose it was needs the history.
  return {
    ...base,
    lastHumanAt: stored?.lastHumanAt ?? null,
    lastHumanDirection: stored?.lastHumanDirection ?? null,
    needsCheck: true,
    checkedAt: stored?.checkedAt ?? null,
  };
}

export type HistoryFindings = {
  human: { at: string; direction: HumanDirection } | null;
  lastAutomatedAt: string | null;
};

// Reads a page of GET /conversations/{id}/messages (any order) for the
// newest message a person wrote and the newest automated one. A threaded
// email row carries the time and direction of the newest email in its
// thread, and GHL keeps workflow emails in rows of their own, so the newest
// person-written row is the newest person-written message.
export function readMessageHistory(rawMessages: unknown[]): HistoryFindings {
  const messages = rawMessages
    .filter(
      (raw): raw is Record<string, unknown> =>
        Boolean(raw) && typeof raw === "object",
    )
    .map((message) => ({
      at: toIsoInstant(message.dateAdded),
      type: String(message.messageType ?? ""),
      direction:
        message.direction === "inbound"
          ? ("inbound" as const)
          : ("outbound" as const),
      source: String(message.source ?? "").toLowerCase(),
    }))
    .filter(
      (message): message is typeof message & { at: string } =>
        message.at !== null && PERSON_MESSAGE_TYPES.has(message.type),
    )
    .sort((a, b) => Date.parse(b.at) - Date.parse(a.at));

  let lastAutomatedAt: string | null = null;
  for (const message of messages) {
    if (AUTOMATED_SOURCES.has(message.source)) {
      lastAutomatedAt ??= message.at;
      continue;
    }
    return {
      human: { at: message.at, direction: message.direction },
      lastAutomatedAt,
    };
  }
  return { human: null, lastAutomatedAt };
}

// The row after a history look-up: the history's answer replaces the
// person fields; the list fields stay as stored.
export function checkedActivity(
  stored: ConversationActivity | null,
  conversationId: string,
  findings: HistoryFindings,
  nowIso: string,
): ConversationActivity {
  const automated = [findings.lastAutomatedAt, stored?.lastAutomatedAt ?? null]
    .filter((value): value is string => Boolean(value))
    .sort((a, b) => Date.parse(b) - Date.parse(a))[0];

  return {
    conversationId,
    lastMessageAt: stored?.lastMessageAt ?? null,
    lastManualAt: stored?.lastManualAt ?? findings.human?.at ?? null,
    lastHumanAt: findings.human?.at ?? null,
    lastHumanDirection: findings.human?.direction ?? null,
    lastAutomatedAt: automated ?? null,
    needsCheck: false,
    checkedAt: nowIso,
  };
}
