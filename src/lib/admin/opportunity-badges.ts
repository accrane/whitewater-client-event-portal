// The status badges down the right side of each Opportunities card, in this
// order: whose turn it is in the conversation, how close (or past) the event
// is, how the inquiry came in, how long the deal has sat in its stage, and
// which GHL chase is following up. Built on the server from what the board
// already loads (the opportunity search, the portal event, pauses, and
// ghl_conversation_activity), so the card only draws them. Every badge
// carries a sentence for its tooltip. Thresholds live here so the manual can
// quote them.
//
// Import-free so the rules are testable directly.

export type OpportunityBadgeTone =
  | "neutral"
  | "success"
  | "warning"
  | "danger"
  | "info";

export type OpportunityBadge = {
  key: string;
  label: string;
  tone: OpportunityBadgeTone;
  detail: string;
};

export type OpportunityPhase = "sales" | "booked" | "lost";

export type OpportunityBadgeInput = {
  now: number;
  // The venue's calendar day (yyyy-MM-dd) at `now`.
  today: string;
  stageName: string;
  phase: OpportunityPhase;
  // New Inquiry: the pipeline's first stage.
  isFirstStage: boolean;
  createdAt: string | null;
  lastStageChangeAt: string | null;
  // Date of Interest, and the portal's last day for a multi-day event.
  eventDate: string | null;
  eventEndDate: string | null;
  inquirySource: "form" | "phone" | null;
  expedited: boolean;
  paused: boolean;
  contactTags: readonly string[];
  // Null until the portal knows who wrote last (see conversation-activity.ts).
  conversation: {
    lastHumanAt: string | null;
    lastHumanDirection: "inbound" | "outbound" | null;
    lastAutomatedAt: string | null;
  } | null;
};

const HOUR_MS = 60 * 60 * 1000;
const DAY_MS = 24 * HOUR_MS;

// A client's message turns the badge red once it has waited this long.
export const CLIENT_WAITING_URGENT_HOURS = 24;
// Days since our last hand-written message with no reply.
export const QUIET_WARNING_DAYS = 5;
export const QUIET_URGENT_DAYS = 10;
// A website inquiry nobody has written to after this long.
export const NOT_CONTACTED_AFTER_HOURS = 24;
// Days until an event that hasn't booked yet.
export const EVENT_SOON_WARNING_DAYS = 21;
export const EVENT_SOON_URGENT_DAYS = 7;
// Days a deal usually spends in each sales stage, by GHL stage name
// (lowercase). A deal past its stage's limit gets an "in stage" badge;
// stages not listed (Booked, Lost, renamed ones) never do.
export const STAGE_AGE_LIMIT_DAYS: Record<string, number> = {
  "new inquiry": 2,
  contacted: 7,
  planning: 7,
  "proposal sent": 14,
};

// GHL's chase workflows tag the contact while they run, the way Step 3 does
// with "Group Sales - Step 3 Waiting for Response". GHL stores tags in lower
// case. Any "Step N … waiting for response" tag counts; the step number
// picks the name.
const CHASE_TAG = /\bstep\s*(\d+)([a-z]?)\b.*\bwaiting for response\b/i;
const CHASE_NAMES: Record<string, string> = {
  "1": "Inquiry chase",
  "3": "Coordinator chase",
  "4": "Proposal chase",
};

export type ChaseTag = { step: string; label: string; tag: string };

// The chase a contact is on, from their tags; the latest step wins when a
// finished chase left its tag behind.
export function chaseFromTags(tags: readonly string[]): ChaseTag | null {
  let found: (ChaseTag & { order: number }) | null = null;
  for (const tag of tags) {
    const match = CHASE_TAG.exec(tag);
    if (!match) continue;
    const order = Number(match[1]);
    if (found && order <= found.order) continue;
    const step = `${match[1]}${match[2].toLowerCase()}`;
    found = {
      order,
      step,
      label: CHASE_NAMES[step] ?? `Step ${step} chase`,
      tag,
    };
  }
  return found ? { step: found.step, label: found.label, tag: found.tag } : null;
}

function isIsoDay(value: string | null): value is string {
  return Boolean(value && /^\d{4}-\d{2}-\d{2}$/.test(value));
}

function dayNumber(day: string): number {
  return (
    Date.UTC(
      Number(day.slice(0, 4)),
      Number(day.slice(5, 7)) - 1,
      Number(day.slice(8, 10)),
    ) / DAY_MS
  );
}

function daysFrom(from: string, to: string): number {
  return Math.round(dayNumber(to) - dayNumber(from));
}

const DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "UTC",
});
const INSTANT_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  hour: "numeric",
  minute: "2-digit",
  timeZone: "America/New_York",
});
const INSTANT_DAY_FORMAT = new Intl.DateTimeFormat("en-US", {
  month: "short",
  day: "numeric",
  timeZone: "America/New_York",
});

// "Sep 26" for a calendar day.
function formatDay(day: string): string {
  return DAY_FORMAT.format(new Date(`${day}T12:00:00Z`));
}

// "Sep 26" or "Oct 12 – Oct 14".
function formatDays(start: string, end: string): string {
  return end > start ? `${formatDay(start)} – ${formatDay(end)}` : formatDay(start);
}

// "Sep 23, 7:39 AM" at the venue.
function formatInstant(iso: string): string {
  return INSTANT_FORMAT.format(new Date(iso));
}

// "3h" under a day, then whole days.
function formatAge(ms: number): string {
  if (ms < DAY_MS) return `${Math.max(1, Math.floor(ms / HOUR_MS))}h`;
  return `${Math.floor(ms / DAY_MS)}d`;
}

function conversationBadge(
  input: OpportunityBadgeInput,
): OpportunityBadge | null {
  const { conversation, now } = input;
  if (!conversation) return null;
  const { lastHumanAt, lastHumanDirection, lastAutomatedAt } = conversation;

  if (lastHumanDirection === "inbound" && lastHumanAt) {
    const waited = Math.max(0, now - Date.parse(lastHumanAt));
    return {
      key: "client-waiting",
      label: `Client waiting ${formatAge(waited)}`,
      tone: waited >= CLIENT_WAITING_URGENT_HOURS * HOUR_MS ? "danger" : "info",
      detail: `They wrote ${formatInstant(lastHumanAt)} and nobody has answered yet. Automated emails don't count as an answer.`,
    };
  }

  if (
    !lastHumanAt &&
    input.phase === "sales" &&
    input.isFirstStage &&
    input.inquirySource !== "phone" &&
    !input.paused &&
    input.createdAt &&
    now - Date.parse(input.createdAt) >= NOT_CONTACTED_AFTER_HOURS * HOUR_MS
  ) {
    return {
      key: "not-contacted",
      label: "Not contacted",
      tone: "danger",
      detail: `Nobody has written to them since the inquiry came in ${INSTANT_DAY_FORMAT.format(new Date(input.createdAt))}. GHL's automatic emails don't count.`,
    };
  }

  if (
    lastHumanDirection === "outbound" &&
    lastHumanAt &&
    input.phase === "sales" &&
    !input.paused
  ) {
    const days = Math.floor((now - Date.parse(lastHumanAt)) / DAY_MS);
    if (days < QUIET_WARNING_DAYS) return null;
    const followUps =
      lastAutomatedAt && Date.parse(lastAutomatedAt) > Date.parse(lastHumanAt)
        ? ` GHL has sent automatic follow-ups since, the latest ${formatInstant(lastAutomatedAt)}.`
        : "";
    return {
      key: "quiet",
      label: `Quiet ${days}d`,
      tone: days >= QUIET_URGENT_DAYS ? "danger" : "warning",
      detail: `No reply since someone last wrote to them by hand, ${formatInstant(lastHumanAt)}.${followUps}`,
    };
  }

  return null;
}

function timingBadge(input: OpportunityBadgeInput): OpportunityBadge | null {
  const { eventDate, phase, today } = input;
  if (!isIsoDay(eventDate) || phase === "lost") return null;
  const end =
    isIsoDay(input.eventEndDate) && input.eventEndDate > eventDate
      ? input.eventEndDate
      : eventDate;
  const range = formatDays(eventDate, end);

  if (daysFrom(today, end) < 0) {
    return {
      key: "date-passed",
      label: "Date passed",
      tone: "danger",
      detail:
        phase === "booked"
          ? `The event was ${range}. Mark the opportunity Won in GHL.`
          : `The event date, ${range}, has passed and the deal is still open. Change the date, or move it to Lost.`,
    };
  }
  if (phase !== "sales") return null;

  const days = daysFrom(today, eventDate);
  if (days > EVENT_SOON_WARNING_DAYS) return null;
  const label =
    days < 0
      ? "Event under way"
      : days === 0
        ? "Event today"
        : days === 1
          ? "Event tomorrow"
          : `Event in ${days}d`;
  return {
    key: "event-soon",
    label,
    tone: days <= EVENT_SOON_URGENT_DAYS ? "danger" : "warning",
    detail: `The event is ${range} and the deal hasn't booked yet.`,
  };
}

function intakeBadge(input: OpportunityBadgeInput): OpportunityBadge | null {
  if (input.expedited) {
    return {
      key: "expedited",
      label: "Expedited",
      tone: "danger",
      detail:
        "A rush inquiry taken by phone. It skips GHL's automatic follow-ups, so whoever took the call follows up.",
    };
  }
  if (input.inquirySource === "phone") {
    return {
      key: "phone",
      label: "Phone",
      tone: "neutral",
      detail:
        "Taken by phone. It skips GHL's automatic follow-ups, so whoever took the call follows up.",
    };
  }
  return null;
}

function stageAgeBadge(input: OpportunityBadgeInput): OpportunityBadge | null {
  if (input.phase !== "sales" || !input.lastStageChangeAt) return null;
  const limit = STAGE_AGE_LIMIT_DAYS[input.stageName.trim().toLowerCase()];
  if (limit === undefined) return null;
  const days = Math.floor(
    (input.now - Date.parse(input.lastStageChangeAt)) / DAY_MS,
  );
  if (days <= limit) return null;
  return {
    key: "stage-age",
    label: `${days}d in stage`,
    tone: "warning",
    detail: `In ${input.stageName} since ${INSTANT_DAY_FORMAT.format(new Date(input.lastStageChangeAt))}. Deals usually move on within ${limit} days.`,
  };
}

function chaseBadge(input: OpportunityBadgeInput): OpportunityBadge | null {
  const chase = chaseFromTags(input.contactTags);
  if (!chase) return null;

  if (input.phase !== "sales") {
    return {
      key: "chase",
      label: chase.label,
      tone: "warning",
      detail: `GHL's Step ${chase.step} chase is still tagged on this ${input.stageName} deal (${chase.tag}). GHL's Booked/Lost workflow should have ended it.`,
    };
  }
  if (input.paused) {
    return {
      key: "chase",
      label: chase.label,
      tone: "neutral",
      detail: `GHL's Step ${chase.step} chase is paused: it skips its messages until follow-ups are resumed.`,
    };
  }
  const latest = input.conversation?.lastAutomatedAt;
  return {
    key: "chase",
    label: chase.label,
    tone: "info",
    detail: `GHL's Step ${chase.step} workflow is following up on its own${latest ? `; the latest automatic message went out ${formatInstant(latest)}` : ""}.`,
  };
}

export function buildOpportunityBadges(
  input: OpportunityBadgeInput,
): OpportunityBadge[] {
  return [
    conversationBadge(input),
    timingBadge(input),
    intakeBadge(input),
    stageAgeBadge(input),
    chaseBadge(input),
  ].filter((badge): badge is OpportunityBadge => badge !== null);
}
