"use client";

import Link from "next/link";
import { usePathname, useRouter } from "next/navigation";
import { useEffect, useState, type ReactNode } from "react";

import { ContactConversationsButton } from "@/components/admin/contact-conversations";
import { ContactNotesButton } from "@/components/admin/contact-notes";
import { ContactTasksButton } from "@/components/admin/contact-tasks";
import {
  FollowUpPauseButton,
  type FollowUpPauseSummary,
} from "@/components/admin/follow-up-pause-button";
import { EventFilterFields } from "@/components/admin/event-filter-fields";
import { OpportunityInquiryButton } from "@/components/admin/opportunity-inquiry-button";
import {
  OpportunityStageMenu,
  type StageMoveTarget,
} from "@/components/admin/opportunity-stage-menu";
import { StatusBadge } from "@/components/ui/status-badge";
import { Tooltip } from "@/components/ui/tooltip";
import type { EventFlags } from "@/lib/admin/events";
import type { OpportunityBadge } from "@/lib/admin/opportunity-badges";
import type { OpportunityInquiry } from "@/lib/ghl/inquiry-fields";
import {
  applyFiltersToParams,
  hasActiveFilters,
  matchesOpportunityFilters,
  UNASSIGNED_COORDINATOR,
  type OpportunityFilters,
} from "@/lib/admin/event-filters";
import { UNASSIGNED_COLOR } from "@/lib/admin/coordinator-color-rules";

// The pipeline's stage tabs + card grid, client-side so a search box and a
// filter row can narrow the cards as you type or pick. Every open
// opportunity is already on the page, so filtering costs nothing: tiles
// that don't match drop out of the grid, matched text is highlighted, and
// while a term or filter is active the stage tabs show how many matches
// each stage holds instead of their totals — everything travels in the URL
// (?q=, ?coordinator=, ?min_guests=, ?max_guests=, ?from=, ?to=, ?type=) so it survives
// switching stages and reloads. Each card's "Move to…" menu moves it to
// another stage in GHL; the board moves the card between tabs right away.
// Cards are ordered by event date, soonest first, and carry their
// coordinator's name on a tab in the coordinator's color. A row of names
// above the grid counts the stage's cards per coordinator; clicking a name
// filters to them, so the stage tabs then count that coordinator's cards.

export type BoardOpportunity = {
  id: string;
  name: string | null;
  monetaryValue: number | null;
  eventDate: string | null;
  coordinatorId: string | null;
  coordinatorName: string | null;
  guestCount: number | null;
  inquiryType: string | null;
  createdAt: string | null;
  inquiry: OpportunityInquiry;
  contact: {
    id: string | null;
    name: string | null;
    email: string | null;
    phone: string | null;
  } | null;
  // Status badges for the card's right-hand column, built on the server
  // (src/lib/admin/opportunity-badges.ts); empty for cards not on screen.
  badges: OpportunityBadge[];
};

const NEW_REPLY_BADGE: OpportunityBadge = {
  key: "new-reply",
  label: "New reply",
  tone: "info",
  detail:
    "They wrote in and nobody has opened it in the portal yet. Opening their conversations clears this.",
};

export type BoardStage = {
  key: string;
  name: string;
  items: BoardOpportunity[];
  guide: { happened: string; next: string };
};

// color: the coordinator's stored color (src/lib/admin/coordinator-colors.ts).
export type BoardCoordinator = { id: string; name: string; color: string };

// An assignee GHL no longer lists (a removed user) still gets a stripe.
const UNKNOWN_COORDINATOR_COLOR = "#475569";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatEventDate(date: string | null): string {
  if (!date) return "—";
  const [y, m, d] = date.split("-").map(Number);
  return new Date(y, m - 1, d).toLocaleDateString("en-US", {
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

function normalize(value: string): string {
  return value.toLowerCase().trim();
}

function matches(opportunity: BoardOpportunity, query: string): boolean {
  if (!query) return true;
  const haystack = [
    opportunity.name,
    opportunity.inquiry.groupEventName,
    opportunity.inquiry.companyName,
    opportunity.contact?.name,
    opportunity.contact?.email,
    opportunity.contact?.phone,
    opportunity.coordinatorName,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  // Phone numbers: compare digits so "704 555" still finds +17045550199.
  const digits = query.replace(/\D/g, "");
  if (digits.length >= 3 && (opportunity.contact?.phone ?? "").replace(/\D/g, "").includes(digits)) {
    return true;
  }
  return haystack.includes(query);
}

// Wraps every occurrence of the query in <mark>; plain text otherwise.
function Highlight({ text, query }: { text: string; query: string }) {
  if (!query || !text) return <>{text}</>;
  const lower = text.toLowerCase();
  const parts: ReactNode[] = [];
  let index = 0;
  let from = 0;
  while ((index = lower.indexOf(query, from)) !== -1) {
    if (index > from) parts.push(text.slice(from, index));
    parts.push(
      <mark className="rounded-sm bg-amber-200 px-0.5 text-inherit" key={index}>
        {text.slice(index, index + query.length)}
      </mark>,
    );
    from = index + query.length;
  }
  if (from < text.length) parts.push(text.slice(from));
  return <>{parts}</>;
}

// Serializes the board's view state (stage, search term, filters) into the
// query string shared by stage links and the URL bar.
function buildQueryString(
  stageKey: string,
  firstStageKey: string | undefined,
  query: string,
  filters: OpportunityFilters,
): string {
  const params = new URLSearchParams();
  if (stageKey !== firstStageKey) params.set("stage", stageKey);
  if (normalize(query)) params.set("q", query.trim());
  applyFiltersToParams(params, filters);
  return params.toString();
}

export function PipelineBoard({
  stages: serverStages,
  activeKey,
  initialQuery,
  initialFilters,
  coordinators,
  groupTypes,
  showValues,
  pauses,
  eventFlags,
  newReplyContactIds,
  moveTargets,
}: {
  stages: BoardStage[];
  activeKey: string;
  initialQuery: string;
  initialFilters: OpportunityFilters;
  // Coordinators with at least one open opportunity, for the dropdown.
  coordinators: BoardCoordinator[];
  // Inquiry Type values present in the pipeline, for the dropdown.
  groupTypes: string[];
  showValues: boolean;
  pauses: Record<string, FollowUpPauseSummary>;
  eventFlags: Record<string, EventFlags>;
  // Contacts whose latest client reply nobody has opened yet.
  newReplyContactIds: string[];
  // Every pipeline stage a card can be moved to, with the menu's notice.
  moveTargets: StageMoveTarget[];
}) {
  const router = useRouter();
  // Cards moved from this board, by opportunity id. A move holds only while
  // the server still has the card in the stage it left (GHL's search can
  // trail a move by a moment); once the server reports any other stage, the
  // server wins.
  const [moves, setMoves] = useState<Record<string, { from: string; to: string }>>({});
  const [moveMessage, setMoveMessage] = useState<{ text: string; warning: boolean } | null>(null);
  const placed = serverStages.flatMap((source) =>
    source.items.map((item) => {
      const move = moves[item.id];
      return { item, source: source.key, key: move?.from === source.key ? move.to : source.key };
    }),
  );
  const stages = serverStages.map((stage) => ({
    ...stage,
    items: placed.filter((entry) => entry.key === stage.key).map((entry) => entry.item),
  }));
  const handleMoved = (
    opportunity: BoardOpportunity,
    to: string,
    warning: string | null,
  ) => {
    const from = placed.find((entry) => entry.item.id === opportunity.id)?.source;
    if (from) {
      setMoves((current) => ({ ...current, [opportunity.id]: { from, to } }));
    }
    const stageName = serverStages.find((stage) => stage.key === to)?.name ?? "the new stage";
    setMoveMessage({
      text: warning ?? `Moved ${cardTitle(opportunity)} to ${stageName}.`,
      warning: Boolean(warning),
    });
    router.refresh();
  };
  // Loading a card's conversations clears its flag on the server; hide it
  // here as soon as they load rather than waiting for the next render.
  const [seenReplies, setSeenReplies] = useState<Set<string>>(() => new Set());
  const unseenReplies = new Set(
    newReplyContactIds.filter((contactId) => !seenReplies.has(contactId)),
  );
  const hasNewReply = (item: BoardOpportunity) =>
    Boolean(item.contact?.id && unseenReplies.has(item.contact.id));
  const markRepliesSeen = (contactId: string) =>
    setSeenReplies((current) => new Set(current).add(contactId));
  const pathname = usePathname();
  const [query, setQuery] = useState(initialQuery);
  const [filters, setFilters] = useState<OpportunityFilters>(initialFilters);
  const term = normalize(query);
  const filtering = hasActiveFilters(filters);
  const narrowing = Boolean(term) || filtering;

  const firstStageKey = stages[0]?.key;
  const queryString = buildQueryString(activeKey, firstStageKey, query, filters);
  const initialQueryString = buildQueryString(
    activeKey,
    firstStageKey,
    initialQuery,
    initialFilters,
  );

  // Keep the term and filters in the URL (debounced) so stage links and
  // reloads keep them.
  useEffect(() => {
    if (queryString === initialQueryString) return;
    const timer = setTimeout(() => {
      router.replace(queryString ? `${pathname}?${queryString}` : pathname, {
        scroll: false,
      });
    }, 300);
    return () => clearTimeout(timer);
  }, [queryString, initialQueryString, router, pathname]);

  const active = stages.find((stage) => stage.key === activeKey) ?? stages[0];
  const isVisible = (item: BoardOpportunity) =>
    matches(item, term) && matchesOpportunityFilters(item, filters);
  // A few hundred cards at most, so counting every stage per render is cheap.
  const matchCounts = new Map(
    stages.map((stage) => [
      stage.key,
      narrowing ? stage.items.filter(isVisible).length : stage.items.length,
    ]),
  );
  // Soonest event first (passed dates lead, so they get dealt with);
  // undated cards go last, otherwise in GHL's order.
  const visible = active.items
    .filter(isVisible)
    .sort((a, b) =>
      a.eventDate && b.eventDate
        ? a.eventDate.localeCompare(b.eventDate)
        : Number(!a.eventDate) - Number(!b.eventDate),
    );
  const colorById = new Map(coordinators.map((coordinator) => [coordinator.id, coordinator.color]));
  const coordinatorColorOf = (item: BoardOpportunity) =>
    item.coordinatorId
      ? (colorById.get(item.coordinatorId) ?? UNKNOWN_COORDINATOR_COLOR)
      : UNASSIGNED_COLOR;
  // The legend counts the stage's cards per coordinator under the search and
  // every filter except the coordinator one, so picking a name leaves the
  // other names and their counts in place to switch to.
  const legendFilters = { ...filters, coordinator: null };
  const legend = [
    ...active.items
      .filter((item) => matches(item, term) && matchesOpportunityFilters(item, legendFilters))
      .reduce((groups, item) => {
        const key = item.coordinatorId ?? UNASSIGNED_COORDINATOR;
        const group = groups.get(key);
        if (group) {
          group.count += 1;
        } else {
          groups.set(key, {
            key,
            name: item.coordinatorId ? (item.coordinatorName ?? "Unknown user") : "Unassigned",
            color: coordinatorColorOf(item),
            count: 1,
          });
        }
        return groups;
      }, new Map<string, { key: string; name: string; color: string; count: number }>())
      .values(),
  ].sort(
    (a, b) =>
      Number(a.key === UNASSIGNED_COORDINATOR) - Number(b.key === UNASSIGNED_COORDINATOR) ||
      b.count - a.count ||
      a.name.localeCompare(b.name),
  );
  const total = visible.reduce((sum, item) => sum + (item.monetaryValue ?? 0), 0);
  const otherStagesWithMatches = narrowing
    ? stages.filter((stage) => stage.key !== active.key && (matchCounts.get(stage.key) ?? 0) > 0)
    : [];

  const hrefFor = (stageKey: string) => {
    const qs = buildQueryString(stageKey, firstStageKey, query, filters);
    return qs ? `/admin/opportunities?${qs}` : "/admin/opportunities";
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div
          aria-label="Pipeline stages"
          className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1"
          role="group"
        >
          {stages.map((stage) => {
            const isActive = stage.key === active.key;
            const count = matchCounts.get(stage.key) ?? 0;
            const replies = stage.items.filter(hasNewReply).length;
            return (
              <Link
                aria-current={isActive ? "page" : undefined}
                className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                  isActive
                    ? "bg-white text-slate-950 shadow-sm"
                    : "text-slate-600 hover:text-slate-950"
                }`}
                href={hrefFor(stage.key)}
                key={stage.key}
                title={term ? `${count} match${count === 1 ? "" : "es"} in ${stage.name}` : undefined}
              >
                {stage.name}
                {/* Non-empty stages carry their count in the brand green so a
                    glance across the row shows where the work (or the match) is. */}
                <span
                  className={`inline-flex min-w-5 items-center justify-center rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${
                    isActive ? "bg-slate-100" : "bg-white/70"
                  } ${
                    count > 0
                      ? "text-[var(--brand)]"
                      : isActive
                        ? "text-slate-500"
                        : "text-slate-400"
                  }`}
                >
                  {count}
                </span>
                {/* Where clients are waiting on an answer, across every stage. */}
                {replies > 0 ? (
                  <span
                    aria-label={`${replies} new ${replies === 1 ? "reply" : "replies"}`}
                    className="h-2 w-2 rounded-full bg-red-600"
                    role="img"
                    title={`${replies} new ${replies === 1 ? "reply" : "replies"}`}
                  />
                ) : null}
              </Link>
            );
          })}
        </div>
        <label className="relative block w-full sm:w-72">
          <span className="sr-only">Search this pipeline</span>
          <SearchIcon />
          <input
            className="w-full rounded-lg border border-slate-300 bg-white py-1.5 pl-8 pr-8 text-sm text-slate-800 placeholder:text-slate-400"
            onChange={(event) => setQuery(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Escape") setQuery("");
            }}
            placeholder="Search name, contact, email, phone, coordinator…"
            type="search"
            value={query}
          />
          {query ? (
            <button
              aria-label="Clear search"
              className="absolute right-2 top-1/2 -translate-y-1/2 rounded-sm p-0.5 text-slate-400 hover:text-slate-700"
              onClick={() => setQuery("")}
              type="button"
            >
              <svg fill="none" height="14" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          ) : null}
        </label>
      </div>

      <EventFilterFields
        coordinatorOptions={coordinators.map((coordinator) => ({
          value: coordinator.id,
          label: coordinator.name,
        }))}
        filters={filters}
        groupTypes={groupTypes}
        onChange={setFilters}
      />

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-3">
          <h2 className="text-sm font-semibold text-slate-950">
            {active.name}
            <span className="ml-2 font-normal text-slate-500">
              {narrowing
                ? `${visible.length} of ${active.items.length} shown`
                : active.items.length === 1
                  ? "1 open opportunity"
                  : `${active.items.length} open opportunities`}
            </span>
          </h2>
          {showValues ? (
            <p className="text-xs font-medium text-slate-500">
              {currency.format(total)} {narrowing ? "in the matches" : "in this stage"}
            </p>
          ) : null}
        </div>
        <div className="mt-3 grid gap-3 rounded-lg border border-slate-200 bg-slate-50 px-4 py-3 text-sm leading-6 text-slate-700 md:grid-cols-2">
          <p>
            <span className="type-label text-slate-500">What&apos;s happened</span>
            <span className="mt-0.5 block">{active.guide.happened}</span>
          </p>
          <p>
            <span className="type-label text-slate-500">What to do next</span>
            <span className="mt-0.5 block">{active.guide.next}</span>
          </p>
        </div>
        {legend.length > 0 ? (
          <CoordinatorLegend
            groups={legend}
            onSelect={(key) =>
              setFilters((current) => ({
                ...current,
                coordinator: current.coordinator === key ? null : key,
              }))
            }
            selected={filters.coordinator}
            stageName={active.name}
          />
        ) : null}
        {moveMessage ? (
          <div
            className={`mt-3 flex items-center justify-between gap-3 rounded-lg border px-3 py-2 text-sm ${
              moveMessage.warning
                ? "border-amber-200 bg-amber-50 text-amber-900"
                : "border-emerald-200 bg-emerald-50 text-emerald-900"
            }`}
            role="status"
          >
            <span>{moveMessage.text}</span>
            <button
              aria-label="Dismiss"
              className="rounded-sm p-0.5 opacity-60 hover:opacity-100"
              onClick={() => setMoveMessage(null)}
              type="button"
            >
              <svg fill="none" height="14" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14">
                <path d="M6 6l12 12M18 6L6 18" strokeLinecap="round" />
              </svg>
            </button>
          </div>
        ) : null}
        {visible.length === 0 ? (
          <div className="py-6 text-center text-sm text-slate-400">
            {narrowing ? (
              <>
                <p>
                  {term
                    ? `No matches for “${query.trim()}”${filtering ? " with these filters" : ""} in ${active.name}.`
                    : `No opportunities in ${active.name} match these filters.`}
                </p>
                {otherStagesWithMatches.length > 0 ? (
                  <p className="mt-1 text-slate-500">
                    Found in{" "}
                    {otherStagesWithMatches.map((stage, index) => (
                      <span key={stage.key}>
                        {index > 0 ? ", " : ""}
                        <Link
                          className="font-semibold text-slate-700 underline-offset-2 hover:underline"
                          href={hrefFor(stage.key)}
                        >
                          {stage.name} ({matchCounts.get(stage.key)})
                        </Link>
                      </span>
                    ))}
                    .
                  </p>
                ) : (
                  <p className="mt-1">Nothing in any stage matches.</p>
                )}
              </>
            ) : (
              `No open opportunities in ${active.name}.`
            )}
          </div>
        ) : (
          // Columns fit the space: a card never gets narrower than 22rem, so
          // the badge column always leaves room for the name and contact.
          <div className="mt-3 grid grid-cols-[repeat(auto-fill,minmax(min(100%,22rem),1fr))] gap-3">
            {visible.map((opportunity) => (
              <OpportunityCard
                coordinatorColor={coordinatorColorOf(opportunity)}
                flags={eventFlags[opportunity.id] ?? null}
                key={opportunity.id}
                moveTargets={moveTargets}
                newReply={hasNewReply(opportunity)}
                onMoved={(to, warning) =>
                  handleMoved(opportunity, to, warning)
                }
                onRepliesSeen={markRepliesSeen}
                opportunity={opportunity}
                pause={
                  opportunity.contact?.id
                    ? (pauses[opportunity.contact.id] ?? null)
                    : null
                }
                query={term}
                showValue={showValues}
                stageKey={active.key}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

// GHL names a form inquiry's opportunity after the contact, so the
// Group/Event Name field is the real title, then the company, then the
// opportunity name.
function cardTitle(opportunity: BoardOpportunity): string {
  return (
    opportunity.inquiry.groupEventName ||
    opportunity.inquiry.companyName ||
    opportunity.name ||
    "Untitled opportunity"
  );
}

function OpportunityCard({
  coordinatorColor,
  flags,
  moveTargets,
  newReply,
  onMoved,
  onRepliesSeen,
  opportunity,
  pause,
  query,
  showValue,
  stageKey,
}: {
  coordinatorColor: string;
  flags: EventFlags | null;
  moveTargets: StageMoveTarget[];
  newReply: boolean;
  onMoved: (stageKey: string, warning: string | null) => void;
  onRepliesSeen: (contactId: string) => void;
  opportunity: BoardOpportunity;
  pause: FollowUpPauseSummary | null;
  query: string;
  showValue: boolean;
  stageKey: string;
}) {
  // Lines that would only repeat the title are dropped.
  const name = cardTitle(opportunity);
  const sameAsTitle = (value: string | null) =>
    Boolean(value) && value!.trim().toLowerCase() === name.trim().toLowerCase();
  const contactName = opportunity.contact?.name || "Unnamed contact";
  const repeatsTitle = sameAsTitle(contactName);
  const company = sameAsTitle(opportunity.inquiry.companyName)
    ? null
    : opportunity.inquiry.companyName;
  // "Client waiting" already says they wrote; "New reply" (not opened in the
  // portal yet) only shows on its own.
  const badges =
    newReply && !opportunity.badges.some((badge) => badge.key === "client-waiting")
      ? [NEW_REPLY_BADGE, ...opportunity.badges]
      : opportunity.badges;
  return (
    // The coordinator's name sits on a tab above the card in their color,
    // which carries on down the card's left edge, so a stage scans by owner.
    <div className="flex flex-col">
      <span
        className={`max-w-[75%] self-start truncate rounded-t-md px-2 pb-0.5 pt-1 text-[11px] font-semibold leading-tight ${
          opportunity.coordinatorId ? "text-white" : "bg-slate-200 text-slate-600"
        }`}
        style={opportunity.coordinatorId ? { backgroundColor: coordinatorColor } : undefined}
      >
        {opportunity.coordinatorId ? (
          <Highlight query={query} text={opportunity.coordinatorName ?? "Unknown user"} />
        ) : (
          "Unassigned"
        )}
      </span>
      <div
        className="flex-1 rounded-xl rounded-tl-none border border-l-4 border-slate-200 bg-slate-50 px-3 py-2.5"
        style={{ borderLeftColor: coordinatorColor }}
      >
      <div className="flex items-start gap-3">
        <div className="min-w-0 flex-1">
          <p className="truncate text-sm font-semibold text-slate-950">
            {flags ? (
              <Link
                className="underline-offset-2 hover:underline"
                href={`/admin/events/${flags.eventId}`}
                title="Open the portal event"
              >
                <Highlight query={query} text={name} />
              </Link>
            ) : (
              <Highlight query={query} text={name} />
            )}
          </p>
          {opportunity.contact ? (
            <div className="mt-0.5 space-y-0.5">
              {repeatsTitle ? null : (
                <p className="truncate text-xs font-medium text-slate-700">
                  <Highlight query={query} text={contactName} />
                </p>
              )}
              {company ? (
                <p className="truncate text-xs text-slate-600">
                  <Highlight query={query} text={company} />
                </p>
              ) : null}
              {opportunity.contact.email ? (
                <p className="truncate text-xs text-slate-500">
                  <Highlight query={query} text={opportunity.contact.email} />
                </p>
              ) : null}
              {opportunity.contact.phone ? (
                <p className="truncate text-xs text-slate-500">
                  <Highlight query={query} text={opportunity.contact.phone} />
                </p>
              ) : null}
            </div>
          ) : null}
          <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
            {opportunity.eventDate ? <span>{formatEventDate(opportunity.eventDate)}</span> : null}
            {opportunity.guestCount !== null ? (
              <span>
                {opportunity.guestCount} {opportunity.guestCount === 1 ? "guest" : "guests"}
              </span>
            ) : null}
            {opportunity.inquiryType ? <span>{opportunity.inquiryType}</span> : null}
            {showValue && opportunity.monetaryValue ? (
              <span className="font-semibold text-slate-700">
                {currency.format(opportunity.monetaryValue)}
              </span>
            ) : null}
          </div>
        </div>
        {/* Status column: conversation, timing, intake, stage age, chase —
            each explains itself on hover. */}
        {badges.length > 0 ? (
          <ul aria-label="Status" className="flex shrink-0 flex-col items-end gap-1">
            {badges.map((badge) => (
              <li key={badge.key}>
                <Tooltip align="end" label={badge.detail} wrap>
                  <StatusBadge tone={badge.tone}>{badge.label}</StatusBadge>
                </Tooltip>
              </li>
            ))}
          </ul>
        ) : null}
      </div>
      <div className="mt-2 flex items-center gap-1.5 border-t border-slate-200 pt-2">
        <OpportunityInquiryButton
          contact={opportunity.contact}
          createdAt={opportunity.createdAt}
          inquiry={opportunity.inquiry}
          inquirySource={flags?.inquirySource ?? null}
          opportunityName={opportunity.name}
        />
        {opportunity.contact?.id ? (
          <>
            <ContactConversationsButton
              compact
              contactId={opportunity.contact.id}
              contactName={opportunity.contact.name}
              eventId={flags?.eventId}
              newReply={newReply}
              onConversationLoaded={() => {
                if (opportunity.contact?.id) onRepliesSeen(opportunity.contact.id);
              }}
              opportunityId={opportunity.id}
            />
            <ContactNotesButton
              compact
              contactId={opportunity.contact.id}
              contactName={opportunity.contact.name}
            />
            <ContactTasksButton
              compact
              contactId={opportunity.contact.id}
              contactName={opportunity.contact.name}
            />
          </>
        ) : null}
        <div className="ml-auto flex items-center gap-1.5">
          {opportunity.contact?.id ? (
            <FollowUpPauseButton
              compact
              contactId={opportunity.contact.id}
              contactName={opportunity.contact.name}
              initialPause={pause}
              opportunityId={opportunity.id}
            />
          ) : null}
          <OpportunityStageMenu
            contactId={opportunity.contact?.id ?? null}
            currentStageKey={stageKey}
            eventId={flags?.eventId ?? null}
            onMoved={onMoved}
            opportunityId={opportunity.id}
            stages={moveTargets}
          />
        </div>
      </div>
      </div>
    </div>
  );
}

// Who holds the stage's cards: one chip per coordinator (most cards first,
// Unassigned last) with their count. A chip toggles the coordinator filter.
function CoordinatorLegend({
  groups,
  onSelect,
  selected,
  stageName,
}: {
  groups: { key: string; name: string; color: string; count: number }[];
  onSelect: (key: string) => void;
  selected: string | null;
  stageName: string;
}) {
  return (
    <div className="mt-3">
      <div
        aria-label={`Coordinators in ${stageName}`}
        className="flex flex-wrap gap-1.5"
        role="group"
      >
        {groups.map((group) => {
          const isSelected = selected === group.key;
          return (
            <Tooltip
              key={group.key}
              label={
                isSelected
                  ? "Show every coordinator again"
                  : `Show only ${group.name === "Unassigned" ? "unassigned cards" : `${group.name}'s cards`}; the stage tabs then count them in each stage`
              }
            >
              <button
                aria-pressed={isSelected}
                className={`inline-flex items-center gap-1.5 rounded-full border px-2.5 py-1 text-xs font-medium transition ${
                  isSelected
                    ? "border-slate-400 bg-white text-slate-950 shadow-sm"
                    : selected
                      ? "border-slate-200 bg-white text-slate-400 hover:text-slate-700"
                      : "border-slate-200 bg-white text-slate-700 hover:border-slate-300"
                }`}
                onClick={() => onSelect(group.key)}
                type="button"
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full"
                  style={{ backgroundColor: group.color }}
                />
                {group.name}
                <span className="font-semibold text-slate-950">{group.count}</span>
              </button>
            </Tooltip>
          );
        })}
      </div>
    </div>
  );
}

function SearchIcon() {
  return (
    <svg
      aria-hidden
      className="pointer-events-none absolute left-2.5 top-1/2 -translate-y-1/2 text-slate-400"
      fill="none"
      height="14"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="14"
    >
      <circle cx="11" cy="11" r="7" />
      <path d="m20 20-3.5-3.5" strokeLinecap="round" />
    </svg>
  );
}
