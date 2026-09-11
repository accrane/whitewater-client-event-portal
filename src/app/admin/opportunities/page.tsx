import { format, subMonths } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";
import { after } from "next/server";

import { AdminShell } from "@/components/admin/admin-shell";
import { ContactBadgesProvider } from "@/components/admin/contact-badges";
import { ContactConversationsButton } from "@/components/admin/contact-conversations";
import { ContactNotesButton } from "@/components/admin/contact-notes";
import { ContactTasksButton } from "@/components/admin/contact-tasks";
import { EmptyState } from "@/components/ui/empty-state";
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
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

type AdminOpportunitiesPageProps = {
  searchParams: Promise<{
    tab?: string;
    stage?: string;
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
        <PipelineView showValues={isAdmin} stageParam={params.stage} />
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
  showValues,
  stageParam,
}: {
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
  const badges = await getStoredContactBadges(visibleContactIds);

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

  const total = activeStage.items.reduce(
    (sum, item) => sum + (item.monetaryValue ?? 0),
    0,
  );

  return (
    <ContactBadgesProvider badges={badges}>
      <div
        aria-label="Pipeline stages"
        className="flex flex-wrap gap-1 rounded-lg bg-slate-100 p-1"
        role="group"
      >
        {stages.map((stage) => {
          const active = stage.key === activeStage.key;
          return (
            <Link
              aria-current={active ? "page" : undefined}
              className={`inline-flex items-center gap-2 rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                active
                  ? "bg-white text-slate-950 shadow-sm"
                  : "text-slate-600 hover:text-slate-950"
              }`}
              href={
                stage.key === stages[0]?.key
                  ? "/admin/opportunities"
                  : `/admin/opportunities?stage=${encodeURIComponent(stage.key)}`
              }
              key={stage.key}
            >
              {stage.name}
              <span
                className={`inline-flex min-w-5 items-center justify-center rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${
                  active
                    ? "bg-slate-100 text-slate-700"
                    : "bg-white/70 text-slate-500"
                }`}
              >
                {stage.items.length}
              </span>
            </Link>
          );
        })}
      </div>

      <section className="rounded-xl border border-slate-200 bg-white p-4">
        <div className="flex flex-wrap items-baseline justify-between gap-2 border-b border-slate-200 pb-3">
          <h2 className="text-sm font-semibold text-slate-950">
            {activeStage.name}
            <span className="ml-2 font-normal text-slate-500">
              {activeStage.items.length === 1
                ? "1 open opportunity"
                : `${activeStage.items.length} open opportunities`}
            </span>
          </h2>
          {showValues ? (
            <p className="text-xs font-medium text-slate-500">
              {currency.format(total)} in this stage
            </p>
          ) : null}
        </div>
        {activeStage.items.length === 0 ? (
          <p className="py-6 text-center text-sm text-slate-400">
            No open opportunities in {activeStage.name}.
          </p>
        ) : (
          <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3 2xl:grid-cols-4">
            {activeStage.items.map((opportunity) => (
              <OpportunityCard
                key={opportunity.id}
                opportunity={opportunity}
                plannerName={plannerNameById(ghlUsers, opportunity.assignedTo)}
                showValue={showValues}
              />
            ))}
          </div>
        )}
      </section>
    </ContactBadgesProvider>
  );
}

function OpportunityCard({
  opportunity,
  plannerName,
  showValue,
}: {
  opportunity: GhlPipelineOpportunity;
  plannerName: string | null;
  showValue: boolean;
}) {
  return (
    <div className="rounded-xl border border-slate-200 bg-slate-50 px-3 py-2.5">
      <p className="truncate text-sm font-semibold text-slate-950">
        {opportunity.name || "Untitled opportunity"}
      </p>
      {opportunity.contact ? (
        <div className="mt-0.5 space-y-0.5">
          <p className="truncate text-xs font-medium text-slate-700">
            {opportunity.contact.name || "Unnamed contact"}
          </p>
          {opportunity.contact.email ? (
            <p className="truncate text-xs text-slate-500">
              {opportunity.contact.email}
            </p>
          ) : null}
          {opportunity.contact.phone ? (
            <p className="truncate text-xs text-slate-500">
              {opportunity.contact.phone}
            </p>
          ) : null}
        </div>
      ) : null}
      <div className="mt-1.5 flex flex-wrap items-center gap-x-3 gap-y-0.5 text-xs text-slate-500">
        {opportunity.eventDate ? (
          <span>{formatEventDate(opportunity.eventDate)}</span>
        ) : null}
        {showValue && opportunity.monetaryValue ? (
          <span className="font-semibold text-slate-700">
            {currency.format(opportunity.monetaryValue)}
          </span>
        ) : null}
        {plannerName ? <span>{plannerName}</span> : null}
      </div>
      {opportunity.contact ? (
        <div className="mt-2 flex items-center gap-1.5 border-t border-slate-200 pt-2">
          <ContactConversationsButton
            compact
            contactId={opportunity.contact.id}
            contactName={opportunity.contact.name}
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
        </div>
      ) : null}
    </div>
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
