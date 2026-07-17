import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { getAdminDashboardMetrics } from "@/lib/admin/dashboard";
import { listAdminEvents, type AdminEventListItem } from "@/lib/admin/events";
import { getUserRole } from "@/lib/admin/users";
import { formatDisplayDate } from "@/lib/dates";
import { createServerSupabaseClient } from "@/lib/supabase/server";

type AttentionItem = {
  event: AdminEventListItem;
  reasons: React.ReactNode[];
};

// An event needs planner attention when a client submitted something to
// review or the last GHL sync did not succeed.
function buildAttentionItems(events: AdminEventListItem[]): AttentionItem[] {
  return events
    .filter((event) => event.status !== "archived")
    .map((event) => {
      const reasons: React.ReactNode[] = [];

      if (event.checklistReviewCount > 0) {
        reasons.push(
          <StatusBadge key="checklist" tone="warning">
            {event.checklistReviewCount} checklist review
            {event.checklistReviewCount === 1 ? "" : "s"}
          </StatusBadge>,
        );
      }

      if (event.vendorReviewCount > 0) {
        reasons.push(
          <StatusBadge key="vendor" tone="info">
            {event.vendorReviewCount} vendor submission
            {event.vendorReviewCount === 1 ? "" : "s"}
          </StatusBadge>,
        );
      }

      if (event.lastSyncStatus === "warning" || event.lastSyncStatus === "error") {
        reasons.push(
          <StatusBadge key="sync" tone="danger">
            Sync {event.lastSyncStatus}
          </StatusBadge>,
        );
      }

      return { event, reasons };
    })
    .filter((item) => item.reasons.length > 0);
}

function buildUpcomingEvents(events: AdminEventListItem[]): AdminEventListItem[] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);

  return events
    .filter((event) => {
      if (event.status !== "launched" || !event.eventDate) {
        return false;
      }

      const date = new Date(`${event.eventDate}T00:00:00`);

      return !Number.isNaN(date.getTime()) && date >= today;
    })
    .sort((a, b) => (a.eventDate ?? "").localeCompare(b.eventDate ?? ""))
    .slice(0, 5);
}

export default async function AdminDashboardPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const isAdmin = getUserRole(user) === "admin";
  const [metrics, events] = await Promise.all([
    getAdminDashboardMetrics(),
    listAdminEvents(),
  ]);
  const attentionItems = buildAttentionItems(events);
  const upcomingEvents = buildUpcomingEvents(events);

  return (
    <AdminShell
      description="What needs planner attention today, plus the portals currently in flight."
      title="Dashboard"
      userEmail={user.email}
    >
      <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-4">
        <AdminStatCard
          href="/admin/events?status=draft"
          label="Draft portals"
          value={String(metrics.draftPortalCount)}
        />
        <AdminStatCard
          href="/admin/events?status=launched"
          label="Launched portals"
          value={String(metrics.launchedPortalCount)}
        />
        <AdminStatCard
          href="/admin/events?status=launched"
          hint="Launched with an event date today or later"
          label="Upcoming events"
          value={String(metrics.upcomingLaunchedCount)}
        />
        <AdminStatCard
          hint="GHL sync warnings and errors"
          href={isAdmin ? "/admin/system/integration-logs" : undefined}
          label="Integration review"
          value={String(metrics.integrationReviewCount)}
        />
      </div>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="border-b border-slate-200 px-5 py-4">
          <h2 className="text-base font-semibold text-slate-950">
            Needs attention
          </h2>
          <p className="mt-0.5 text-sm text-slate-600">
            Client submissions waiting for review and events with sync problems.
          </p>
        </div>

        {attentionItems.length > 0 ? (
          <ul className="divide-y divide-slate-200">
            {attentionItems.map(({ event, reasons }) => (
              <li key={event.id}>
                <Link
                  className="flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-slate-50"
                  href={`/admin/events/${event.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {event.eventName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {event.eventDate
                        ? formatDisplayDate(event.eventDate)
                        : "No event date"}
                      {event.plannerName ? ` · ${event.plannerName}` : ""}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-2">
                    <span className="hidden flex-wrap justify-end gap-1.5 sm:flex">
                      {reasons}
                    </span>
                    <Icon className="h-4 w-4 text-slate-400">
                      <path d="m9 18 6-6-6-6" />
                    </Icon>
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <p className="px-5 py-8 text-center text-sm text-slate-600">
            Nothing waiting on you. New client submissions and sync problems
            will appear here.
          </p>
        )}
      </section>

      <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <div className="flex items-center justify-between gap-4 border-b border-slate-200 px-5 py-4">
          <div>
            <h2 className="text-base font-semibold text-slate-950">
              Upcoming events
            </h2>
            <p className="mt-0.5 text-sm text-slate-600">
              The next launched portals by event date.
            </p>
          </div>
          <Link
            className="text-[13px] font-semibold text-slate-600 transition hover:text-slate-950"
            href="/admin/events"
          >
            View all events
          </Link>
        </div>

        {upcomingEvents.length > 0 ? (
          <ul className="divide-y divide-slate-200">
            {upcomingEvents.map((event) => (
              <li key={event.id}>
                <Link
                  className="flex items-center justify-between gap-4 px-5 py-3.5 transition hover:bg-slate-50"
                  href={`/admin/events/${event.id}`}
                >
                  <div className="min-w-0">
                    <p className="truncate text-sm font-semibold text-slate-950">
                      {event.eventName}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">
                      {event.eventDate
                        ? formatDisplayDate(event.eventDate)
                        : "No event date"}
                      {event.plannerName ? ` · ${event.plannerName}` : ""}
                    </p>
                  </div>
                  <StatusBadge tone="success">Launched</StatusBadge>
                </Link>
              </li>
            ))}
          </ul>
        ) : (
          <div className="p-5">
            <EmptyState
              description="Launched portals with an upcoming event date will appear here."
              title="No upcoming events"
            />
          </div>
        )}
      </section>
    </AdminShell>
  );
}
