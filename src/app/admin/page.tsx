import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { FollowUpPauseButton } from "@/components/admin/follow-up-pause-button";
import { Icon } from "@/components/ui/icon";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import {
  contractDeadlineState,
  getAdminDashboardMetrics,
  listContractsForEvents,
  listRecentlySignedContracts,
  listVendorSubmissionsNeedingReview,
  type ContractDeadlineState,
  type DashboardContract,
  type DashboardVendorSubmission,
} from "@/lib/admin/dashboard";
import {
  collectCoordinatorNames,
  collectGroupTypes,
  hasActiveFilters,
  matchesDashboardEvent,
  parseDashboardFilters,
  type DashboardFilters as DashboardFilterState,
} from "@/lib/admin/event-filters";
import { resolveCurrentCoordinator } from "@/lib/admin/current-coordinator";
import { listAdminEvents, type AdminEventListItem } from "@/lib/admin/events";
import { getUserRole } from "@/lib/admin/users";
import {
  listStaleFollowUpPauses,
  reconcileFollowUpPauses,
  STALE_PAUSE_DAYS,
  type StaleFollowUpPause,
} from "@/lib/ghl/follow-up-pauses";
import { daysUntil, formatDisplayDate } from "@/lib/dates";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { DashboardFilters } from "./dashboard-filters";

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatShortDate(iso: string): string {
  return new Intl.DateTimeFormat("en-US", {
    month: "short",
    day: "numeric",
  }).format(new Date(iso));
}

function eventDaysOut(event: AdminEventListItem): number | null {
  if (!event.eventDate) return null;
  const days = daysUntil(event.eventDate);
  return Number.isNaN(days) ? null : days;
}

// Launched events by how far out they are, soonest first.
function upcomingLaunchedEvents(events: AdminEventListItem[]) {
  return events
    .map((event) => ({ event, daysOut: eventDaysOut(event) }))
    .filter(
      (item): item is { event: AdminEventListItem; daysOut: number } =>
        item.event.status === "launched" &&
        item.daysOut !== null &&
        item.daysOut >= 0,
    )
    .sort((a, b) => a.daysOut - b.daysOut);
}

const deadlineCopy: Record<
  ContractDeadlineState,
  { label: string; tone: BadgeTone }
> = {
  no_contract: { label: "No contract sent", tone: "danger" },
  awaiting_approval: { label: "Awaiting PandaDoc approval", tone: "warning" },
  awaiting_signature: { label: "Awaiting signature", tone: "warning" },
  unpaid: { label: "Signed, unpaid", tone: "warning" },
};

type AdminDashboardPageProps = {
  searchParams: Promise<{
    coordinator?: string;
    min_guests?: string;
    max_guests?: string;
    from?: string;
    to?: string;
    type?: string;
    contracts?: string;
  }>;
};

export default async function AdminDashboardPage({
  searchParams,
}: AdminDashboardPageProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const isAdmin = getUserRole(user) === "admin";
  const filters = parseDashboardFilters(await searchParams);
  // Pauses whose deal booked or died inside GHL get lifted before the list
  // is read, so nobody is nagged about a contact who no longer needs it.
  await reconcileFollowUpPauses();
  const [metrics, allEvents, vendorSubmissions, allRecentlySigned, allStalePauses, me] =
    await Promise.all([
      getAdminDashboardMetrics(),
      listAdminEvents(),
      listVendorSubmissionsNeedingReview(),
      listRecentlySignedContracts(),
      listStaleFollowUpPauses(),
      resolveCurrentCoordinator(user.email),
    ]);
  const eventsById = new Map(allEvents.map((event) => [event.id, event]));

  // Every list below is scoped to the events that pass the filter row. The
  // metric tiles stay portal-wide. Rows that belong to no portal event
  // (a paused contact with no draft yet) show only while nothing is
  // filtered.
  const filtering = hasActiveFilters(filters);
  const events = filtering
    ? allEvents.filter((event) => matchesDashboardEvent(event, filters, me))
    : allEvents;
  const visibleEventIds = new Set(events.map((event) => event.id));
  const submissions = filtering
    ? vendorSubmissions.filter((submission) => visibleEventIds.has(submission.eventId))
    : vendorSubmissions;
  const recentlySigned = filtering
    ? allRecentlySigned.filter((contract) => visibleEventIds.has(contract.eventId))
    : allRecentlySigned;
  const stalePauses = filtering
    ? allStalePauses.filter(
        (pause) => pause.portalEventId !== null && visibleEventIds.has(pause.portalEventId),
      )
    : allStalePauses;

  const upcoming = upcomingLaunchedEvents(events);
  const todayEvents = upcoming.filter((item) => item.daysOut === 0);
  const weekEvents = upcoming.filter(
    (item) => item.daysOut >= 1 && item.daysOut <= 7,
  );

  // Contract deadline: three weeks out and not signed (or, inside two
  // weeks, signed but unpaid). "All upcoming" drops the three-week cutoff
  // so every launched event without a signed contract is listed, however
  // far out.
  const deadlineWindow =
    filters.contracts === "all"
      ? upcoming
      : upcoming.filter((item) => item.daysOut <= 21);
  const contractsByEvent = await listContractsForEvents(
    deadlineWindow.map((item) => item.event.id),
  );
  const needsAttention = deadlineWindow
    .map((item) => ({
      ...item,
      state: contractDeadlineState(
        contractsByEvent.get(item.event.id) ?? [],
        item.daysOut,
        item.event.expedited,
      ),
    }))
    .filter(
      (item): item is typeof item & { state: ContractDeadlineState } =>
        item.state !== null,
    );

  return (
    <AdminShell
      description="Vendor submissions to review, what's happening this week, and contracts that need a signature before the deadline."
      title="Dashboard"
      userEmail={user.email}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard
          href="/admin/events?status=draft"
          icon={
            <Icon>
              <path d="M12 20h9" />
              <path d="M16.5 3.5a2.1 2.1 0 0 1 3 3L7 19l-4 1 1-4Z" />
            </Icon>
          }
          label="Draft portals"
          value={String(metrics.draftPortalCount)}
        />
        <AdminStatCard
          href="/admin/events?status=launched"
          icon={
            <Icon>
              <path d="M4.5 16.5c-1.5 1.3-2 5-2 5s3.7-.5 5-2c.7-.8.7-2 0-2.8a2 2 0 0 0-3-.2Z" />
              <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.9 12.9 0 0 1 22 2c0 2.7-.9 7.6-6 11a22 22 0 0 1-4 2Z" />
              <path d="M9 12H4s.6-3.3 2-4c1.6-.8 5 0 5 0" />
              <path d="M12 15v5s3.3-.6 4-2c.8-1.6 0-5 0-5" />
            </Icon>
          }
          label="Launched portals"
          value={String(metrics.launchedPortalCount)}
        />
        <AdminStatCard
          href="/admin/events?status=launched"
          hint="Launched with an event date today or later"
          icon={
            <Icon>
              <path d="M8 2v4" />
              <path d="M16 2v4" />
              <rect height="18" rx="2" width="18" x="3" y="4" />
              <path d="M3 10h18" />
            </Icon>
          }
          label="Upcoming events"
          value={String(metrics.upcomingLaunchedCount)}
        />
        <AdminStatCard
          hint="GHL sync warnings and errors"
          href={isAdmin ? "/admin/system/integration-logs" : undefined}
          icon={
            <Icon>
              <path d="M21 12a9 9 0 1 1-6.2-8.6" />
              <path d="M21 3v6h-6" />
              <path d="M12 8v4l2 2" />
            </Icon>
          }
          label="Integration review"
          value={String(metrics.integrationReviewCount)}
        />
      </div>

      <DashboardFilters
        canFilterToMe={me !== null}
        contractsMode={filters.contracts}
        coordinatorNames={collectCoordinatorNames(allEvents)}
        groupTypes={collectGroupTypes(
          allEvents.map((event) => ({ inquiryType: event.eventType })),
        )}
        initialFilters={filters}
      />

      <div className="grid gap-6 xl:grid-cols-2">
        <VendorSubmissionsSection
          eventsById={eventsById}
          submissions={submissions}
        />
        <UpcomingEventsSection today={todayEvents} week={weekEvents} />
      </div>

      <ContractsSection
        eventsById={eventsById}
        filters={filters}
        needsAttention={needsAttention}
        recentlySigned={recentlySigned}
      />
      <PausedFollowUpsSection pauses={stalePauses} />
    </AdminShell>
  );
}

// Contacts whose automated follow-ups have been paused longer than the
// threshold: a pause with no expiry needs a human to remember it.
function PausedFollowUpsSection({ pauses }: { pauses: StaleFollowUpPause[] }) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <SectionHeader
        description={`Follow-ups paused more than ${STALE_PAUSE_DAYS} days ago. Check in with them, then resume so GHL's chase messages apply again — or leave them paused if the conversation is still live.`}
        title="Paused follow-ups"
      />
      {pauses.length > 0 ? (
        <ul className="divide-y divide-slate-200">
          {pauses.map((pause) => (
            <li
              className="flex items-center justify-between gap-4 px-5 py-3"
              key={pause.id}
            >
              <div className="min-w-0">
                <Link
                  className="block truncate text-sm font-medium text-slate-950 underline-offset-2 hover:underline"
                  href={
                    pause.portalEventId
                      ? `/admin/events/${pause.portalEventId}`
                      : "/admin/opportunities"
                  }
                >
                  {pause.contactName || "Unnamed contact"}
                </Link>
                <p className="mt-0.5 truncate text-xs text-slate-500">
                  Paused {pause.daysPaused} days ago
                  {pause.pausedBy ? ` by ${pause.pausedBy}` : ""}
                  {pause.reason ? ` · ${pause.reason}` : ""}
                </p>
              </div>
              <div className="shrink-0">
                <FollowUpPauseButton
                  contactId={pause.ghlContactId}
                  contactName={pause.contactName}
                  eventId={pause.portalEventId}
                  initialPause={{
                    pausedAt: pause.pausedAt,
                    pausedBy: pause.pausedBy,
                    reason: pause.reason,
                  }}
                  opportunityId={pause.ghlOpportunityId}
                />
              </div>
            </li>
          ))}
        </ul>
      ) : (
        <EmptyRow>
          No follow-ups have been paused longer than {STALE_PAUSE_DAYS} days.
        </EmptyRow>
      )}
    </section>
  );
}

function SectionHeader({
  title,
  description,
  action,
}: {
  title: string;
  description: string;
  action?: React.ReactNode;
}) {
  return (
    <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
      <div>
        <h2 className="text-base font-semibold text-slate-950">{title}</h2>
        <p className="mt-0.5 text-sm text-slate-500">{description}</p>
      </div>
      {action}
    </div>
  );
}

// Secondary title inside a section ("Today", "Needs attention", ...).
function SubHeader({
  title,
  count,
  tone = "default",
}: {
  title: string;
  count: number;
  tone?: "default" | "danger";
}) {
  return (
    <div
      className={`flex items-center gap-2 px-5 py-2 type-label ${
        tone === "danger"
          ? "bg-red-50 text-red-700"
          : "bg-slate-50 text-slate-500"
      }`}
    >
      {tone === "danger" ? (
        <span aria-hidden className="h-1.5 w-1.5 rounded-full bg-current" />
      ) : null}
      {title}
      <span
        className={tone === "danger" ? "text-red-700/70" : "text-slate-400"}
      >
        {count}
      </span>
    </div>
  );
}

function EmptyRow({ children }: { children: React.ReactNode }) {
  return <p className="px-5 py-4 text-sm text-slate-500">{children}</p>;
}

function EventRow({
  event,
  href,
  detail,
  right,
}: {
  event: AdminEventListItem;
  href?: string;
  detail: React.ReactNode;
  right?: React.ReactNode;
}) {
  return (
    <li>
      <Link
        className="flex items-center justify-between gap-4 px-5 py-3 transition hover:bg-slate-50"
        href={href ?? `/admin/events/${event.id}`}
      >
        <div className="min-w-0">
          <p className="truncate text-sm font-medium text-slate-950">
            {event.eventName}
          </p>
          <p className="mt-0.5 truncate text-xs text-slate-500">{detail}</p>
        </div>
        <div className="flex shrink-0 items-center gap-3">
          {right}
          <Icon className="h-4 w-4 text-slate-400">
            <path d="m9 18 6-6-6-6" />
          </Icon>
        </div>
      </Link>
    </li>
  );
}

function VendorSubmissionsSection({
  submissions,
  eventsById,
}: {
  submissions: DashboardVendorSubmission[];
  eventsById: Map<string, AdminEventListItem>;
}) {
  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <SectionHeader
        description="Vendors clients added in their portal that a coordinator still needs to approve."
        title="Vendor submissions"
      />
      {submissions.length > 0 ? (
        <ul className="divide-y divide-slate-200">
          {submissions.map((submission) => {
            const event = eventsById.get(submission.eventId);
            const vendorLabel = [submission.companyName, submission.contactName]
              .filter(Boolean)
              .join(" · ");
            return (
              <li key={submission.id}>
                <Link
                  className="flex items-center justify-between gap-4 px-5 py-3 transition hover:bg-slate-50"
                  href={`/admin/events/${submission.eventId}#vendors`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-950">
                      {vendorLabel || "Unnamed vendor"}
                      {submission.vendorType ? (
                        <span className="ml-2 font-normal text-slate-500">
                          {submission.vendorType}
                        </span>
                      ) : null}
                    </p>
                    <p className="mt-0.5 truncate text-xs text-slate-500">
                      {event?.eventName ?? "Unknown event"}
                      {event?.eventDate
                        ? ` · ${formatDisplayDate(event.eventDate)}`
                        : ""}
                      {` · Submitted ${formatShortDate(submission.submittedAt)}`}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-3">
                    <StatusBadge tone="warning">Needs approval</StatusBadge>
                    <Icon className="h-4 w-4 text-slate-400">
                      <path d="m9 18 6-6-6-6" />
                    </Icon>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      ) : (
        <EmptyRow>
          No vendor submissions waiting. New ones from client portals show up
          here.
        </EmptyRow>
      )}
    </section>
  );
}

function UpcomingEventsSection({
  today,
  week,
}: {
  today: { event: AdminEventListItem; daysOut: number }[];
  week: { event: AdminEventListItem; daysOut: number }[];
}) {
  const detail = (event: AdminEventListItem) =>
    [
      event.eventDate ? formatDisplayDate(event.eventDate) : null,
      event.eventType,
      event.coordinatorName,
    ]
      .filter(Boolean)
      .join(" · ");

  return (
    <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
      <SectionHeader
        action={
          <Link
            className="text-[13px] font-medium text-slate-500 transition hover:text-slate-950"
            href="/admin/events?status=launched"
          >
            All events
          </Link>
        }
        description="Launched events happening today and over the next seven days."
        title="Upcoming events"
      />
      <SubHeader count={today.length} title="Today's events" />
      {today.length > 0 ? (
        <ul className="divide-y divide-slate-200">
          {today.map(({ event }) => (
            <EventRow
              detail={detail(event)}
              event={event}
              key={event.id}
              right={
                <>
                  {event.expedited ? (
                    <StatusBadge tone="danger">Expedited</StatusBadge>
                  ) : null}
                  <StatusBadge tone="success">Today</StatusBadge>
                </>
              }
            />
          ))}
        </ul>
      ) : (
        <EmptyRow>Nothing on today.</EmptyRow>
      )}
      <SubHeader count={week.length} title="This week's events" />
      {week.length > 0 ? (
        <ul className="divide-y divide-slate-200">
          {week.map(({ event, daysOut }) => (
            <EventRow
              detail={detail(event)}
              event={event}
              key={event.id}
              right={
                <>
                  {event.expedited ? (
                    <StatusBadge tone="danger">Expedited</StatusBadge>
                  ) : null}
                  <span className="text-xs text-slate-500 tabular-nums">
                    {daysOut === 1 ? "Tomorrow" : `In ${daysOut} days`}
                  </span>
                </>
              }
            />
          ))}
        </ul>
      ) : (
        <EmptyRow>No more events in the next seven days.</EmptyRow>
      )}
    </section>
  );
}

// Link that keeps the current filter params and swaps the contracts switch.
function contractsHref(filters: DashboardFilterState, mode: "window" | "all"): string {
  const params = new URLSearchParams();
  if (filters.coordinator) params.set("coordinator", filters.coordinator);
  if (filters.minGuests !== null) params.set("min_guests", String(filters.minGuests));
  if (filters.maxGuests !== null) params.set("max_guests", String(filters.maxGuests));
  if (filters.from) params.set("from", filters.from);
  if (filters.to) params.set("to", filters.to);
  if (filters.type) params.set("type", filters.type);
  if (mode === "all") params.set("contracts", "all");
  const qs = params.toString();
  return qs ? `/admin?${qs}#contracts` : "/admin#contracts";
}

function ContractsSection({
  recentlySigned,
  needsAttention,
  eventsById,
  filters,
}: {
  recentlySigned: DashboardContract[];
  needsAttention: {
    event: AdminEventListItem;
    daysOut: number;
    state: ContractDeadlineState;
  }[];
  eventsById: Map<string, AdminEventListItem>;
  filters: DashboardFilterState;
}) {
  const showingAll = filters.contracts === "all";
  return (
    <section
      className="overflow-hidden rounded-xl border border-slate-200 bg-white"
      id="contracts"
    >
      <SectionHeader
        action={
          <div
            aria-label="Needs attention range"
            className="flex shrink-0 gap-1 rounded-lg bg-slate-100 p-1"
            role="group"
          >
            {(
              [
                { mode: "window", label: "Next 3 weeks" },
                { mode: "all", label: "All upcoming" },
              ] as const
            ).map((option) => {
              const active = showingAll === (option.mode === "all");
              return (
                <Link
                  aria-current={active ? "true" : undefined}
                  className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
                    active
                      ? "bg-white text-slate-950 shadow-sm"
                      : "text-slate-600 hover:text-slate-950"
                  }`}
                  href={contractsHref(filters, option.mode)}
                  key={option.mode}
                  scroll={false}
                >
                  {option.label}
                </Link>
              );
            })}
          </div>
        }
        description={
          showingAll
            ? "Every upcoming launched event without a signed contract, however far out, plus signed-but-unpaid ones inside two weeks. Expedited events are flagged only inside three days."
            : "Contracts must be signed and paid two weeks before the event. Anything three weeks out without a signature is flagged below; expedited events are flagged only inside three days."
        }
        title="Contracts"
      />
      <div className="grid xl:grid-cols-2 xl:divide-x xl:divide-slate-200">
        <div>
          <SubHeader count={recentlySigned.length} title="Recently signed" />
          {recentlySigned.length > 0 ? (
            <ul className="divide-y divide-slate-200">
              {recentlySigned.map((contract) => {
                const event = eventsById.get(contract.eventId);
                return (
                  <li key={contract.id}>
                    <Link
                      className="flex items-center justify-between gap-4 px-5 py-3 transition hover:bg-slate-50"
                      href={`/admin/events/${contract.eventId}/contracts`}
                    >
                      <div className="min-w-0">
                        <p className="truncate text-sm font-medium text-slate-950">
                          {event?.eventName ?? contract.name}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">
                          {contract.name}
                          {contract.completedAt
                            ? ` · Signed ${formatShortDate(contract.completedAt)}`
                            : ""}
                          {contract.pandadocStatus === "document.waiting_pay"
                            ? " · Payment pending"
                            : ""}
                        </p>
                      </div>
                      <span className="shrink-0 text-sm font-medium text-slate-950 tabular-nums">
                        {currency.format(contract.amount)}
                      </span>
                    </Link>
                  </li>
                );
              })}
            </ul>
          ) : (
            <EmptyRow>No signed contracts yet.</EmptyRow>
          )}
        </div>
        <div>
          <SubHeader
            count={needsAttention.length}
            title="Needs attention"
            tone="danger"
          />
          {needsAttention.length > 0 ? (
            <ul className="divide-y divide-slate-200">
              {needsAttention.map(({ event, daysOut, state }) => (
                <EventRow
                  detail={`${
                    event.eventDate
                      ? formatDisplayDate(event.eventDate)
                      : "No date"
                  } · ${
                    daysOut === 0
                      ? "Today"
                      : daysOut === 1
                        ? "Tomorrow"
                        : `In ${daysOut} days`
                  }${event.coordinatorName ? ` · ${event.coordinatorName}` : ""}`}
                  event={event}
                  href={`/admin/events/${event.id}/contracts`}
                  key={event.id}
                  right={
                    <>
                      {event.expedited ? (
                        <StatusBadge tone="danger">Expedited</StatusBadge>
                      ) : null}
                      <StatusBadge tone={deadlineCopy[state].tone}>
                      {deadlineCopy[state].label}
                    </StatusBadge>
                    </>
                  }
                />
              ))}
            </ul>
          ) : (
            <EmptyRow>
              {showingAll
                ? "Every upcoming event has a signed contract."
                : "Every event inside three weeks has a signed contract."}
            </EmptyRow>
          )}
        </div>
      </div>
    </section>
  );
}
