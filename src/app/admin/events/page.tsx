import { redirect } from "next/navigation";
import Link from "next/link";

import { AdminShell } from "@/components/admin/admin-shell";
import { AdminStatCard } from "@/components/admin/admin-stat-card";
import { CreateEventButton } from "@/components/admin/create-event-button";
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

// Lucide-style outline icons rendered inline (matches the admin dock).
function StatusGlyph({ children }: { children: React.ReactNode }) {
  return (
    <svg
      aria-hidden
      className="h-5 w-5"
      fill="none"
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth={2}
      viewBox="0 0 24 24"
    >
      {children}
    </svg>
  );
}

const statusIcons: Record<
  keyof typeof statusLabels,
  { className: string; glyph: React.ReactNode }
> = {
  // Pencil — still being set up by a planner.
  draft: {
    className: "bg-amber-100 text-amber-700",
    glyph: (
      <StatusGlyph>
        <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
        <path d="m15 5 4 4" />
      </StatusGlyph>
    ),
  },
  // Rocket — client portal is live.
  launched: {
    className: "bg-emerald-100 text-emerald-700",
    glyph: (
      <StatusGlyph>
        <path d="M4.5 16.5c-1.5 1.26-2 5-2 5s3.74-.5 5-2c.71-.84.7-2.13-.09-2.91a2.18 2.18 0 0 0-2.91-.09z" />
        <path d="m12 15-3-3a22 22 0 0 1 2-3.95A12.88 12.88 0 0 1 22 2c0 2.72-.78 7.5-6 11a22.35 22.35 0 0 1-4 2z" />
        <path d="M9 12H4s.55-3.03 2-4c1.62-1.08 5 0 5 0" />
        <path d="M12 15v5s3.03-.55 4-2c1.08-1.62 0-5 0-5" />
      </StatusGlyph>
    ),
  },
  // Clock — portal access has lapsed.
  expired: {
    className: "bg-slate-100 text-slate-500",
    glyph: (
      <StatusGlyph>
        <circle cx="12" cy="12" r="10" />
        <path d="M12 6v6l4 2" />
      </StatusGlyph>
    ),
  },
  // Archive box — filed away.
  archived: {
    className: "bg-slate-100 text-slate-500",
    glyph: (
      <StatusGlyph>
        <rect height="5" rx="1" width="20" x="2" y="3" />
        <path d="M4 8v11a2 2 0 0 0 2 2h12a2 2 0 0 0 2-2V8" />
        <path d="M10 12h4" />
      </StatusGlyph>
    ),
  },
};

function EventStatusIcon({ status }: { status: keyof typeof statusLabels }) {
  const icon = statusIcons[status];

  return (
    <span
      className={`flex h-10 w-10 shrink-0 items-center justify-center rounded-full ${icon.className}`}
      title={statusLabels[status]}
    >
      {icon.glyph}
    </span>
  );
}

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
      description="Every portal event, from new GHL inquiries through launched client portals."
      eyebrow="Events"
      title="Event portal workspace"
      userEmail={user.email}
    >
      <div className="flex justify-end">
        <CreateEventButton />
      </div>

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
              Events
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Newest first.
            </p>
          </div>

          <div className="divide-y divide-slate-200">
            {events.map((event) => (
              <Link
                className="grid grid-cols-[auto_minmax(0,1fr)] gap-4 px-5 py-5 transition hover:bg-slate-50 sm:px-6 lg:grid-cols-[auto_minmax(0,1fr)_auto] lg:items-center"
                href={`/admin/events/${event.id}`}
                key={event.id}
              >
                <EventStatusIcon status={event.status} />
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

                <div className="col-start-2 flex flex-col gap-2 text-sm text-slate-600 lg:col-start-3 lg:min-w-48 lg:text-right">
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
          description="New GHL inquiries appear here automatically, or use Create Event to book one onto the room calendar."
          title="No events yet"
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
