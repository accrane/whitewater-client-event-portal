import { redirect } from "next/navigation";
import Link from "next/link";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { EmptyState } from "@/components/ui/empty-state";
import { formatDisplayDate } from "@/lib/dates";
import { listAdminEvents } from "@/lib/admin/events";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const statusLabels = {
  draft: "Draft",
  launched: "Launched",
  expired: "Expired",
  archived: "Archived",
} as const;

export default async function AdminEventsPage() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const events = await listAdminEvents();
  const draftCount = events.filter((event) => event.status === "draft").length;
  const launchedCount = events.filter(
    (event) => event.status === "launched",
  ).length;
  const reviewCount = events.filter(
    (event) => event.lastSyncStatus === "warning" || event.lastSyncStatus === "error",
  ).length;
  const checklistReviewCount = events.reduce(
    (total, event) => total + event.checklistReviewCount,
    0,
  );
  const vendorReviewCount = events.reduce(
    (total, event) => total + event.vendorReviewCount,
    0,
  );

  return (
    <AdminShell
      description="Review draft and upcoming client portals. This page now reads event records from Supabase without adding create, edit, delete, or GHL sync workflows."
      eyebrow="Events"
      title="Event portal workspace"
      userEmail={user.email}
    >
      <section className="grid gap-4 xl:grid-cols-4">
        <AdminStatCard
          description={`${draftCount} event${draftCount === 1 ? "" : "s"} waiting for planner setup before launch.`}
          title="Draft portals"
        />
        <AdminStatCard
          description={`${launchedCount} client-facing portal${launchedCount === 1 ? "" : "s"} currently launched.`}
          title="Launched portals"
        />
        <AdminStatCard
          description={`${reviewCount} event${reviewCount === 1 ? "" : "s"} with warning or error sync status.`}
          title="Ready for review"
        />
        <AdminStatCard
          description={`${checklistReviewCount + vendorReviewCount} client submission${checklistReviewCount + vendorReviewCount === 1 ? "" : "s"} waiting for planner review.`}
          title="Client submissions"
        />
      </section>

      {events.length > 0 ? (
        <section className="overflow-hidden rounded-3xl border border-slate-200 bg-white shadow-sm">
          <div className="border-b border-slate-200 px-5 py-4 sm:px-6">
            <h2 className="text-lg font-semibold text-slate-950">
              Recent event records
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Showing the 50 most recently created portal events from Supabase.
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {events.map((event) => (
              <Link
                className="grid gap-4 px-5 py-5 transition hover:bg-slate-50 sm:px-6 lg:grid-cols-[minmax(0,1fr)_auto] lg:items-center"
                href={`/admin/events/${event.id}`}
                key={event.id}
              >
                <div className="min-w-0 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <h3 className="truncate text-base font-semibold text-slate-950">
                      {event.eventName}
                    </h3>
                    <span className="rounded-full bg-slate-100 px-3 py-1 text-xs font-semibold text-slate-700">
                      {statusLabels[event.status]}
                    </span>
                    {event.checklistReviewCount > 0 ? (
                      <span className="rounded-full bg-amber-100 px-3 py-1 text-xs font-semibold text-amber-900">
                        {event.checklistReviewCount} checklist review
                      </span>
                    ) : null}
                    {event.vendorReviewCount > 0 ? (
                      <span className="rounded-full bg-sky-100 px-3 py-1 text-xs font-semibold text-sky-900">
                        {event.vendorReviewCount} vendor review
                      </span>
                    ) : null}
                  </div>

                  <dl className="grid gap-2 text-sm text-slate-600 sm:grid-cols-2 xl:grid-cols-4">
                    <div>
                      <dt className="font-semibold text-slate-500">Event date</dt>
                      <dd>{formatNullableDate(event.eventDate)}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-500">Type</dt>
                      <dd>{event.eventType || "Not set"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-500">Planner</dt>
                      <dd>{event.plannerName || "Not assigned"}</dd>
                    </div>
                    <div>
                      <dt className="font-semibold text-slate-500">GHL record</dt>
                      <dd className="truncate font-mono text-xs">
                        {event.ghlEventRecordId}
                      </dd>
                    </div>
                  </dl>
                </div>

                <div className="flex flex-col gap-2 text-sm text-slate-600 lg:min-w-48 lg:text-right">
                  <span>
                    Created {formatNullableDateTime(event.createdAt)}
                  </span>
                  <span>
                    Last sync {formatNullableDateTime(event.lastSyncedAt)}
                  </span>
                  <span className="font-semibold text-slate-950">View details</span>
                </div>
              </Link>
            ))}
          </div>
        </section>
      ) : (
        <EmptyState
          description="No event rows were returned from Supabase. Once GHL webhook intake or seed data creates events, they will appear here automatically."
          title="No event records connected yet"
        />
      )}
    </AdminShell>
  );
}

function formatNullableDate(date: string | null): string {
  return date ? formatDisplayDate(date) : "Not set";
}

function formatNullableDateTime(date: string | null): string {
  if (!date) {
    return "not set";
  }

  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(date));
}
