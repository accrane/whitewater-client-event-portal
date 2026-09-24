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
import { StatusBadge } from "@/components/ui/status-badge";
import type { EventFlags } from "@/lib/admin/events";
import type { OpportunityInquiry } from "@/lib/ghl/inquiry-fields";
import {
  applyFiltersToParams,
  hasActiveFilters,
  matchesOpportunityFilters,
  type OpportunityFilters,
} from "@/lib/admin/event-filters";

// The pipeline's stage tabs + card grid, client-side so a search box and a
// filter row can narrow the cards as you type or pick. Every open
// opportunity is already on the page, so filtering costs nothing: tiles
// that don't match drop out of the grid, matched text is highlighted, and
// while a term or filter is active the stage tabs show how many matches
// each stage holds instead of their totals — everything travels in the URL
// (?q=, ?coordinator=, ?min_guests=, ?max_guests=, ?from=, ?to=, ?type=) so it survives
// switching stages and reloads.

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
};

export type BoardStage = {
  key: string;
  name: string;
  items: BoardOpportunity[];
  guide: { happened: string; next: string };
};

export type BoardCoordinator = { id: string; name: string };

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
  stages,
  activeKey,
  initialQuery,
  initialFilters,
  coordinators,
  groupTypes,
  showValues,
  pauses,
  eventFlags,
  newReplyContactIds,
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
}) {
  const router = useRouter();
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
  const visible = active.items.filter(isVisible);
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
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {visible.map((opportunity) => (
              <OpportunityCard
                flags={eventFlags[opportunity.id] ?? null}
                key={opportunity.id}
                newReply={hasNewReply(opportunity)}
                onRepliesSeen={markRepliesSeen}
                opportunity={opportunity}
                pause={
                  opportunity.contact?.id
                    ? (pauses[opportunity.contact.id] ?? null)
                    : null
                }
                query={term}
                showValue={showValues}
              />
            ))}
          </div>
        )}
      </section>
    </>
  );
}

function OpportunityCard({
  flags,
  newReply,
  onRepliesSeen,
  opportunity,
  pause,
  query,
  showValue,
}: {
  flags: EventFlags | null;
  newReply: boolean;
  onRepliesSeen: (contactId: string) => void;
  opportunity: BoardOpportunity;
  pause: FollowUpPauseSummary | null;
  query: string;
  showValue: boolean;
}) {
  // GHL names a form inquiry's opportunity after the contact, so the
  // Group/Event Name field is the real title, then the company, then the
  // opportunity name. Lines that would only repeat the title are dropped.
  const name =
    opportunity.inquiry.groupEventName ||
    opportunity.inquiry.companyName ||
    opportunity.name ||
    "Untitled opportunity";
  const sameAsTitle = (value: string | null) =>
    Boolean(value) && value!.trim().toLowerCase() === name.trim().toLowerCase();
  const contactName = opportunity.contact?.name || "Unnamed contact";
  const repeatsTitle = sameAsTitle(contactName);
  const company = sameAsTitle(opportunity.inquiry.companyName)
    ? null
    : opportunity.inquiry.companyName;
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <div className="flex items-start justify-between gap-2">
        <p className="min-w-0 truncate text-sm font-semibold text-slate-950">
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
        <div className="flex shrink-0 items-center gap-1">
          {newReply ? <StatusBadge tone="info">New reply</StatusBadge> : null}
          {flags?.expedited ? (
            <StatusBadge tone="danger">Expedited</StatusBadge>
          ) : flags?.inquirySource === "phone" ? (
            <StatusBadge tone="neutral">Phone</StatusBadge>
          ) : null}
        </div>
      </div>
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
        {opportunity.coordinatorName ? (
          <span>
            <Highlight query={query} text={opportunity.coordinatorName} />
          </span>
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
            <div className="ml-auto">
              <FollowUpPauseButton
                compact
                contactId={opportunity.contact.id}
                contactName={opportunity.contact.name}
                initialPause={pause}
                opportunityId={opportunity.id}
              />
            </div>
          </>
        ) : null}
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
