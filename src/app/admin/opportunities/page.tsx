import { format, subMonths } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { AdminShell } from "@/components/admin/admin-shell";
import { ContactBadgesProvider } from "@/components/admin/contact-badges";
import { ButtonLink } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { getEventFlagsByOpportunityIds } from "@/lib/admin/events";
import { getUserRole } from "@/lib/admin/users";
import { listGhlUsers, type GhlUser } from "@/lib/ghl/location-data";
import {
  findStaleContactIds,
  getStoredContactBadges,
  refreshContactBadges,
} from "@/lib/ghl/badge-cache";
import {
  fetchConfiguredPipeline,
  searchPipelineOpportunities,
  type GhlPipelineOpportunity,
  describePipelineProblem,
} from "@/lib/ghl/opportunities";
import { getActiveFollowUpPauses } from "@/lib/ghl/follow-up-pauses";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { PipelineBoard, type BoardStage } from "./pipeline-board";

// Accept only YYYY-MM-DD values from the query string; anything else is
// treated as unset.
function parseDateParam(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
  maximumFractionDigits: 0,
});

function formatEventDate(date: string | null): string {
  return date ? format(new Date(`${date}T00:00:00`), "MMM d, yyyy") : "—";
}

// Quick ranges are "events in the past N months"; a custom from/to wins over
// a preset when both are present.
const QUICK_RANGES = [
  { key: "6m", label: "Past 6 months", months: 6 },
  { key: "1y", label: "Past year", months: 12 },
] as const;

// What each pipeline stage means for a planner: what already happened
// (much of it automatic) and what to do next. Keyed by the stage's name in
// GHL, so renaming a stage there needs a matching update here; unknown
// stages get the generic line.
const STAGE_GUIDES: Record<string, { happened: string; next: string }> = {
  "new inquiry": {
    happened:
      "The contact submitted the inquiry form (or a planner took the inquiry by phone on the New inquiry page). GoHighLevel created the opportunity and the portal created a draft event for each one — you'll find it under Events and in the Linked Event list when reserving rooms.",
    next:
      "Reach out from the chat bubble and move the opportunity to Contacted in GHL, or hold rooms right away from the Room Calendar or Events page; saving a reservation moves it to Planning automatically. Spoke to them by phone? Use the pause button on the card so GHL's automated follow-ups stop.",
  },
  contacted: {
    happened:
      "Someone has been in touch with the contact and is gathering dates, headcount, and what they want to do.",
    next:
      "Keep the conversation going from the chat bubble; pause follow-ups from the card if you're talking by phone. Once dates are settled, reserve rooms from the Room Calendar or Events page and pick the coordinator; saving moves the opportunity to Planning and assigns it to that coordinator.",
  },
  planning: {
    happened:
      "Rooms are held or booked and a coordinator is assigned. The draft event is ready to work.",
    next:
      "Open the event page to confirm room bookings, fill in the event summary, and build the proposal in PandaDoc. When the proposal goes out, move the opportunity to Proposal Sent in GHL.",
  },
  "proposal sent": {
    happened:
      "The proposal is with the client. Its link appears on the event page and in the client portal once GHL records it.",
    next:
      "Follow up from the chat bubble. When they're ready, send the contract from the event page's Contracts tab; a signed contract moves the opportunity to Booked automatically.",
  },
  booked: {
    happened:
      "The contract is signed and the event value is written back to the opportunity.",
    next:
      "Launch the client's portal from the bottom of the event page so they can work their checklist, then review vendor and upload submissions as they come in. Mark the opportunity Won in GHL after the event.",
  },
  lost: {
    happened: "The inquiry didn't go ahead.",
    next:
      "Nothing further happens in the portal. The draft event stays under Events until it's archived.",
  },
  other: {
    happened:
      "These opportunities sit in a stage that was removed from the pipeline in GHL.",
    next: "Move each one to a current stage in GHL so it shows up under the right tab.",
  },
};

const DEFAULT_STAGE_GUIDE = {
  happened: "This stage is managed in GoHighLevel; the portal mirrors it here.",
  next: "Use the chat, notes, and tasks buttons on each card to work the contact.",
};

function stageGuide(name: string) {
  return STAGE_GUIDES[name.trim().toLowerCase()] ?? DEFAULT_STAGE_GUIDE;
}

type AdminOpportunitiesPageProps = {
  searchParams: Promise<{
    tab?: string;
    stage?: string;
    q?: string;
    range?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function AdminOpportunitiesPage({
  searchParams,
}: AdminOpportunitiesPageProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const params = await searchParams;
  const tab = params.tab === "won" ? "won" : "pipeline";
  const isAdmin = getUserRole(user) === "admin";

  return (
    <AdminShell
      actions={
        <ButtonLink href="/admin/inquiries/new" variant="primary">
          New inquiry
        </ButtonLink>
      }
      description="The GoHighLevel opportunity pipeline and its history, viewed from the portal. GHL remains the system of record — manage stages and contacts there."
      title="Opportunities"
      userEmail={user.email}
    >
      <nav
        aria-label="Opportunity views"
        className="flex gap-6 border-b border-slate-200"
      >
        {[
          { key: "pipeline", label: "Pipeline", href: "/admin/opportunities" },
          { key: "won", label: "Won", href: "/admin/opportunities?tab=won" },
        ].map((view) => (
          <Link
            aria-current={tab === view.key ? "page" : undefined}
            className={`-mb-px border-b-2 pb-3 text-sm font-semibold transition ${
              tab === view.key
                ? "border-slate-950 text-slate-950"
                : "border-transparent text-slate-500 hover:text-slate-950"
            }`}
            href={view.href}
            key={view.key}
          >
            {view.label}
          </Link>
        ))}
      </nav>

      {tab === "pipeline" ? (
        <PipelineView
          query={params.q ?? ""}
          showValues={isAdmin}
          stageParam={params.stage}
        />
      ) : (
        <WonView
          from={parseDateParam(params.from)}
          rangeKey={params.range}
          showValues={isAdmin}
          to={parseDateParam(params.to)}
        />
      )}
    </AdminShell>
  );
}

function plannerNameById(users: GhlUser[], userId: string | null) {
  return userId
    ? (users.find((user) => user.id === userId)?.name ?? null)
    : null;
}

// Open opportunities, one pipeline stage at a time: a row of stage tabs
// (with counts) above a full-width card grid for the chosen stage. A
// column-per-stage board forced sideways scrolling and long columns once
// the pipeline filled up (140-250 open in season); a single stage across
// the whole screen keeps every card visible on a desktop.
async function PipelineView({
  query,
  showValues,
  stageParam,
}: {
  query: string;
  showValues: boolean;
  stageParam: string | undefined;
}) {
  const [pipeline, opportunities, ghlUsers] = await Promise.all([
    fetchConfiguredPipeline(),
    searchPipelineOpportunities("open"),
    listGhlUsers(),
  ]);

  if (!pipeline) {
    const problem = await describePipelineProblem();
    return (
      <EmptyState
        description={`The pipeline could not be loaded from GoHighLevel. ${problem}`}
        title="Pipeline unavailable"
      />
    );
  }

  const byStage = new Map<string, GhlPipelineOpportunity[]>(
    pipeline.stages.map((stage) => [stage.id, []]),
  );
  // Opportunities in stages that were removed from the pipeline still count;
  // they get a trailing "Other" tab instead of disappearing.
  const orphaned: GhlPipelineOpportunity[] = [];

  for (const opportunity of opportunities) {
    const bucket = opportunity.pipelineStageId
      ? byStage.get(opportunity.pipelineStageId)
      : undefined;
    if (bucket) {
      bucket.push(opportunity);
    } else {
      orphaned.push(opportunity);
    }
  }

  const stages = [
    ...pipeline.stages.map((stage) => ({
      key: stage.id,
      name: stage.name,
      items: byStage.get(stage.id) ?? [],
    })),
    ...(orphaned.length > 0
      ? [{ key: "orphaned", name: "Other", items: orphaned }]
      : []),
  ];

  // An unknown or missing stage in the URL lands on the first stage, so a
  // stale bookmark never shows an empty page.
  const activeStage =
    stages.find((stage) => stage.key === stageParam) ?? stages[0] ?? null;

  // Card badges come from the local ghl_contact_badges cache — instant at
  // any pipeline size. Only the visible stage's contacts are read, but the
  // stale sweep covers the whole pipeline so the other tabs are already
  // fresh when the planner switches to them.
  const allContactIds = opportunities
    .map((opportunity) => opportunity.contact?.id)
    .filter((id): id is string => Boolean(id));
  const visibleContactIds = (activeStage?.items ?? [])
    .map((opportunity) => opportunity.contact?.id)
    .filter((id): id is string => Boolean(id));
  const [badges, pauses, eventFlags] = await Promise.all([
    getStoredContactBadges(visibleContactIds),
    getActiveFollowUpPauses(visibleContactIds),
    getEventFlagsByOpportunityIds(
      (activeStage?.items ?? []).map((opportunity) => opportunity.id),
    ),
  ]);

  after(async () => {
    const staleIds = await findStaleContactIds(allContactIds);
    if (staleIds.length > 0) {
      await refreshContactBadges(staleIds);
    }
  });

  if (!activeStage) {
    return (
      <EmptyState
        description="The GoHighLevel pipeline has no stages yet. Add stages in GHL and they will appear here as tabs."
        title="No pipeline stages"
      />
    );
  }

  const boardStages: BoardStage[] = stages.map((stage) => ({
    key: stage.key,
    name: stage.name,
    guide: stageGuide(stage.name),
    items: stage.items.map((opportunity) => ({
      id: opportunity.id,
      name: opportunity.name,
      monetaryValue: opportunity.monetaryValue,
      eventDate: opportunity.eventDate,
      plannerName: plannerNameById(ghlUsers, opportunity.assignedTo),
      contact: opportunity.contact,
    })),
  }));

  return (
    <ContactBadgesProvider badges={badges}>
      <PipelineBoard
        activeKey={activeStage.key}
        eventFlags={Object.fromEntries(eventFlags)}
        initialQuery={query}
        pauses={Object.fromEntries(
          [...pauses.entries()].map(([contactId, pause]) => [
            contactId,
            { pausedAt: pause.pausedAt, pausedBy: pause.pausedBy, reason: pause.reason },
          ]),
        )}
        showValues={showValues}
        stages={boardStages}
      />
    </ContactBadgesProvider>
  );
}

// Won opportunities as a contact list, filterable by when the event happened
// (Date of Interest).
async function WonView({
  from,
  rangeKey,
  showValues,
  to,
}: {
  from: string | null;
  rangeKey: string | undefined;
  showValues: boolean;
  to: string | null;
}) {
  const hasCustomRange = Boolean(from || to);
  const quickRange = hasCustomRange
    ? undefined
    : QUICK_RANGES.find((range) => range.key === rangeKey);

  const effectiveFrom =
    from ??
    (quickRange
      ? format(subMonths(new Date(), quickRange.months), "yyyy-MM-dd")
      : null);
  const effectiveTo = to;
  const filtering = Boolean(effectiveFrom || effectiveTo);

  const won = await searchPipelineOpportunities("won");

  const filtered = won.filter((opportunity) => {
    if (!filtering) return true;
    // Range filters compare against the event date; without one recorded the
    // row can't match a date filter.
    if (!opportunity.eventDate) return false;
    if (effectiveFrom && opportunity.eventDate < effectiveFrom) return false;
    if (effectiveTo && opportunity.eventDate > effectiveTo) return false;
    return true;
  });

  // Most recent events first; rows with no recorded date sink to the end.
  const rows = [...filtered].sort((a, b) => {
    if (!a.eventDate) return b.eventDate ? 1 : 0;
    if (!b.eventDate) return -1;
    return b.eventDate < a.eventDate ? -1 : b.eventDate > a.eventDate ? 1 : 0;
  });

  return (
    <>
      <div className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4">
        <div
          aria-label="Quick ranges"
          className="flex gap-1 rounded-lg bg-slate-100 p-1"
          role="group"
        >
          <QuickRangeLink
            active={!quickRange && !hasCustomRange}
            href="/admin/opportunities?tab=won"
            label="All time"
          />
          {QUICK_RANGES.map((range) => (
            <QuickRangeLink
              active={quickRange?.key === range.key}
              href={`/admin/opportunities?tab=won&range=${range.key}`}
              key={range.key}
              label={range.label}
            />
          ))}
        </div>
        <form className="flex flex-wrap items-end gap-3" method="get">
          <input name="tab" type="hidden" value="won" />
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Event date from
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              defaultValue={from ?? ""}
              name="from"
              type="date"
            />
          </label>
          <label className="grid gap-1 text-xs font-semibold text-slate-500">
            Event date to
            <input
              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-normal text-slate-800"
              defaultValue={to ?? ""}
              name="to"
              type="date"
            />
          </label>
          <button
            className="inline-flex items-center justify-center gap-2 rounded-lg bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
            type="submit"
          >
            Apply
          </button>
        </form>
        <p className="w-full text-xs text-slate-500 sm:ml-auto sm:w-auto">
          {filtering
            ? `Showing events ${effectiveFrom ? `from ${formatEventDate(effectiveFrom)}` : ""}${effectiveFrom && effectiveTo ? " " : ""}${effectiveTo ? `through ${formatEventDate(effectiveTo)}` : ""}.`
            : "Showing every won opportunity."}
        </p>
      </div>

      {rows.length === 0 ? (
        <EmptyState
          description={
            filtering
              ? "No won opportunities have an event date in this range."
              : "Won opportunities from the GoHighLevel pipeline will appear here."
          }
          title="No past events found"
        />
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="w-full min-w-[640px] text-left text-sm">
            <thead>
              <tr className="border-b border-slate-200 type-label text-slate-500">
                <th className="px-4 py-3">Contact</th>
                <th className="px-4 py-3">Event</th>
                <th className="px-4 py-3">Event date</th>
                {showValues ? (
                  <th className="px-4 py-3 text-right">Value</th>
                ) : null}
              </tr>
            </thead>
            <tbody>
              {rows.map((opportunity) => (
                <tr
                  className="border-b border-slate-100 last:border-b-0"
                  key={opportunity.id}
                >
                  <td className="px-4 py-3 align-top">
                    <p className="font-semibold text-slate-950">
                      {opportunity.contact?.name || "Unnamed contact"}
                    </p>
                    {opportunity.contact?.email ? (
                      <p className="text-xs text-slate-500">
                        {opportunity.contact.email}
                      </p>
                    ) : null}
                    {opportunity.contact?.phone ? (
                      <p className="text-xs text-slate-500">
                        {opportunity.contact.phone}
                      </p>
                    ) : null}
                  </td>
                  <td className="px-4 py-3 align-top text-slate-700">
                    {opportunity.name || "Untitled opportunity"}
                  </td>
                  <td className="px-4 py-3 align-top whitespace-nowrap text-slate-700">
                    {formatEventDate(opportunity.eventDate)}
                  </td>
                  {showValues ? (
                    <td className="px-4 py-3 text-right align-top whitespace-nowrap text-slate-700">
                      {opportunity.monetaryValue
                        ? currency.format(opportunity.monetaryValue)
                        : "—"}
                    </td>
                  ) : null}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </>
  );
}

function QuickRangeLink({
  active,
  href,
  label,
}: {
  active: boolean;
  href: string;
  label: string;
}) {
  return (
    <Link
      aria-current={active ? "true" : undefined}
      className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
        active
          ? "bg-slate-100 text-slate-950"
          : "text-slate-600 hover:text-slate-950"
      }`}
      href={href}
    >
      {label}
    </Link>
  );
}
