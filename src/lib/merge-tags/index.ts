import { formatDisplayDate } from "@/lib/dates";

// Merge tags let planners write templates like "Your event has
// {{event.num_attendees}} attendees" and have each event's GHL-synced data
// filled in at render time, so values such as payment status stay current.
// Tags are stored verbatim in the saved HTML; resolution happens wherever an
// event context exists (client portal pages and per-event admin previews).
// Template-level previews have no event, so tags stay visible there.

// The camelCase field names match AdminEventDetail / ClientPortalEvent so
// either shape can be passed to buildMergeTagContext directly.
export type MergeTagContext = {
  eventName?: string | null;
  eventType?: string | null;
  eventDate?: string | null;
  arrivalTime?: string | null;
  meetingLocation?: string | null;
  numberOfGuests?: number | null;
  paymentStatus?: string | null;
  plannerName?: string | null;
  plannerEmail?: string | null;
  plannerPhone?: string | null;
  proposalUrl?: string | null;
  contractUrl?: string | null;
  invoiceUrl?: string | null;
  paymentUrl?: string | null;
  clientPortalUrl?: string | null;
};

// Shown when an event doesn't have the value yet, keeping the sentence
// readable and making the gap easy to spot in previews.
export const MISSING_TAG_PLACEHOLDER = "TBD";

type MergeTagDef = {
  token: string;
  label: string;
  resolve: (context: MergeTagContext) => string | number | null | undefined;
  // Link tags render as an <a> with this label instead of the raw URL.
  linkLabel?: string;
};

export type MergeTagOption = {
  token: string;
  label: string;
};

type MergeTagGroup = {
  label: string;
  tags: MergeTagDef[];
};

const TAG_GROUPS: MergeTagGroup[] = [
  {
    label: "Event",
    tags: [
      { token: "event.name", label: "Event name", resolve: (c) => c.eventName },
      { token: "event.type", label: "Event type", resolve: (c) => c.eventType },
      {
        token: "event.date",
        label: "Event date",
        resolve: (c) => (c.eventDate ? formatDisplayDate(c.eventDate) : null),
      },
      {
        token: "event.arrival_time",
        label: "Arrival time",
        resolve: (c) => c.arrivalTime,
      },
      {
        token: "event.meeting_location",
        label: "Meeting location",
        resolve: (c) => c.meetingLocation,
      },
      {
        token: "event.num_attendees",
        label: "Number of attendees",
        resolve: (c) => c.numberOfGuests,
      },
      {
        token: "event.payment_status",
        label: "Payment status",
        resolve: (c) => c.paymentStatus,
      },
    ],
  },
  {
    label: "Planner",
    tags: [
      {
        token: "planner.name",
        label: "Planner name",
        resolve: (c) => c.plannerName,
      },
      {
        token: "planner.email",
        label: "Planner email",
        resolve: (c) => c.plannerEmail,
      },
      {
        token: "planner.phone",
        label: "Planner phone",
        resolve: (c) => c.plannerPhone,
      },
    ],
  },
  {
    label: "Links",
    tags: [
      {
        token: "links.proposal",
        label: "Proposal link",
        linkLabel: "View your proposal",
        resolve: (c) => c.proposalUrl,
      },
      {
        token: "links.contract",
        label: "Contract link",
        linkLabel: "View your contract",
        resolve: (c) => c.contractUrl,
      },
      {
        token: "links.invoice",
        label: "Invoice link",
        linkLabel: "View your invoice",
        resolve: (c) => c.invoiceUrl,
      },
      {
        token: "links.payment",
        label: "Payment link",
        linkLabel: "Make a payment",
        resolve: (c) => c.paymentUrl,
      },
      {
        token: "links.portal",
        label: "Portal link",
        linkLabel: "Open your event portal",
        resolve: (c) => c.clientPortalUrl,
      },
    ],
  },
];

const TAGS_BY_TOKEN = new Map<string, MergeTagDef>(
  TAG_GROUPS.flatMap((group) => group.tags.map((tag) => [tag.token, tag])),
);

// Grouped options for the editor's insert-tag dropdown.
export const MERGE_TAG_MENU: Array<{
  label: string;
  tags: MergeTagOption[];
}> = TAG_GROUPS.map((group) => ({
  label: group.label,
  tags: group.tags.map(({ token, label }) => ({ token, label })),
}));

const TAG_PATTERN = /\{\{\s*([\w.]+)\s*\}\}/g;

// Picks just the context fields off a wider event shape so the result is a
// small serializable object safe to pass to client components.
export function buildMergeTagContext(event: MergeTagContext): MergeTagContext {
  return {
    eventName: event.eventName ?? null,
    eventType: event.eventType ?? null,
    eventDate: event.eventDate ?? null,
    arrivalTime: event.arrivalTime ?? null,
    meetingLocation: event.meetingLocation ?? null,
    numberOfGuests: event.numberOfGuests ?? null,
    paymentStatus: event.paymentStatus ?? null,
    plannerName: event.plannerName ?? null,
    plannerEmail: event.plannerEmail ?? null,
    plannerPhone: event.plannerPhone ?? null,
    proposalUrl: event.proposalUrl ?? null,
    contractUrl: event.contractUrl ?? null,
    invoiceUrl: event.invoiceUrl ?? null,
    paymentUrl: event.paymentUrl ?? null,
    clientPortalUrl: event.clientPortalUrl ?? null,
  };
}

// Replaces {{tag}} occurrences in editor-produced HTML with the event's
// values. Unknown tags are left as-is so typos stay visible to the planner.
export function resolveMergeTags(
  html: string,
  context: MergeTagContext,
): string {
  if (!html.includes("{{")) return html;

  return html.replace(TAG_PATTERN, (match, token: string) => {
    const tag = TAGS_BY_TOKEN.get(token);
    if (!tag) return match;

    const value = tag.resolve(context);

    if (value === null || value === undefined || value === "") {
      return MISSING_TAG_PLACEHOLDER;
    }

    if (tag.linkLabel) {
      const url = String(value);
      if (!/^https?:\/\//i.test(url)) return MISSING_TAG_PLACEHOLDER;
      return `<a href="${escapeHtml(url)}" target="_blank" rel="noreferrer">${escapeHtml(tag.linkLabel)}</a>`;
    }

    return escapeHtml(String(value));
  });
}

function escapeHtml(value: string): string {
  return value
    .replaceAll("&", "&amp;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;")
    .replaceAll('"', "&quot;")
    .replaceAll("'", "&#39;");
}
