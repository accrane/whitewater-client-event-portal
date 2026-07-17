import { redirect } from "next/navigation";
import Link from "next/link";

import { AdminShell } from "@/components/admin/admin-shell";
import { CreateEventButton } from "@/components/admin/create-event-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { formatDisplayDate } from "@/lib/dates";
import { listAdminEvents, type AdminEventListItem } from "@/lib/admin/events";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const statusLabels = {
  draft: "Draft",
  launched: "Launched",
  expired: "Expired",
  archived: "Archived",
} as const;

const statusTones: Record<keyof typeof statusLabels, BadgeTone> = {
  draft: "warning",
  launched: "success",
  expired: "neutral",
  archived: "neutral",
};

// "Past" groups the two done states so completed portals stay out of the
// default working view without needing their own page.
const filters = [
  { key: "all", label: "All" },
  { key: "draft", label: "Draft" },
  { key: "launched", label: "Launched" },
  { key: "past", label: "Past" },
] as const;

type FilterKey = (typeof filters)[number]["key"];

function matchesFilter(event: AdminEventListItem, filter: FilterKey): boolean {
  switch (filter) {
    case "draft":
      return event.status === "draft";
    case "launched":
      return event.status === "launched";
    case "past":
      return event.status === "expired" || event.status === "archived";
    default:
      return true;
  }
}

function matchesQuery(event: AdminEventListItem, query: string): boolean {
  const haystack = [event.eventName, event.eventType, event.plannerName]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.toLowerCase());
}

type AdminEventsPageProps = {
  searchParams: Promise<{ status?: string; q?: string }>;
};

export default async function AdminEventsPage({
  searchParams,
}: AdminEventsPageProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { status, q } = await searchParams;
  const activeFilter: FilterKey = filters.some((f) => f.key === status)
    ? (status as FilterKey)
    : "all";
  const query = q?.trim() ?? "";

  const events = await listAdminEvents();
  const filtered = events.filter(
    (event) =>
      matchesFilter(event, activeFilter) &&
      (query === "" || matchesQuery(event, query)),
  );

  function filterHref(key: FilterKey): string {
    const params = new URLSearchParams();
    if (key !== "all") params.set("status", key);
    if (query) params.set("q", query);
    const search = params.toString();

    return search ? `/admin/events?${search}` : "/admin/events";
  }

  function filterCount(key: FilterKey): number {
    return events.filter((event) => matchesFilter(event, key)).length;
  }

  return (
    <AdminShell
      actions={<CreateEventButton />}
      description="Every portal event, from new GHL inquiries through launched client portals."
      title="Events"
      userEmail={user.email}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Filter events by status"
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1 shadow-sm"
        >
          {filters.map((filter) => {
            const active = filter.key === activeFilter;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition ${
                  active
                    ? "bg-slate-950 text-white"
                    : "text-slate-600 hover:bg-slate-100 hover:text-slate-950"
                }`}
                href={filterHref(filter.key)}
                key={filter.key}
              >
                {filter.label}
                <span className={active ? "ml-1.5 opacity-70" : "ml-1.5 text-slate-400"}>
                  {filterCount(filter.key)}
                </span>
              </Link>
            );
          })}
        </nav>

        <form action="/admin/events" className="relative" method="get">
          {activeFilter !== "all" ? (
            <input name="status" type="hidden" value={activeFilter} />
          ) : null}
          <Icon className="pointer-events-none absolute top-1/2 left-3 h-4 w-4 -translate-y-1/2 text-slate-400">
            <circle cx="11" cy="11" r="8" />
            <path d="m21 21-4.3-4.3" />
          </Icon>
          <input
            aria-label="Search events"
            className="w-56 rounded-lg border border-slate-300 bg-white py-2 pr-3 pl-9 text-sm text-slate-800 placeholder:text-slate-400"
            defaultValue={query}
            name="q"
            placeholder="Search events…"
            type="search"
          />
        </form>
      </div>

      {filtered.length > 0 ? (
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[minmax(240px,2fr)_minmax(120px,auto)_minmax(130px,1fr)_minmax(150px,1fr)_minmax(90px,auto)_minmax(150px,auto)] items-center gap-x-4 border-b border-slate-200 bg-slate-50 px-5 py-2.5 text-xs font-semibold text-slate-500">
                <span>Event</span>
                <span>Event date</span>
                <span>Type</span>
                <span>Planner</span>
                <span>Status</span>
                <span>Needs review</span>
              </div>

              <div className="divide-y divide-slate-200">
                {filtered.map((event) => (
                  <Link
                    className="grid grid-cols-[minmax(240px,2fr)_minmax(120px,auto)_minmax(130px,1fr)_minmax(150px,1fr)_minmax(90px,auto)_minmax(150px,auto)] items-center gap-x-4 px-5 py-3.5 text-sm transition hover:bg-slate-50"
                    href={`/admin/events/${event.id}`}
                    key={event.id}
                  >
                    <span className="min-w-0">
                      <span className="block truncate font-semibold text-slate-950">
                        {event.eventName}
                      </span>
                      <span className="mt-0.5 block text-xs text-slate-500">
                        Created {formatNullableDate(event.createdAt.slice(0, 10))}
                      </span>
                    </span>
                    <span
                      className={
                        event.eventDate ? "text-slate-800" : "text-slate-400"
                      }
                    >
                      {formatNullableDate(event.eventDate)}
                    </span>
                    <span
                      className={`truncate ${event.eventType ? "text-slate-800" : "text-slate-400"}`}
                    >
                      {event.eventType || "Not set"}
                    </span>
                    <span
                      className={`truncate ${event.plannerName ? "text-slate-800" : "text-slate-400"}`}
                    >
                      {event.plannerName || "Not assigned"}
                    </span>
                    <span>
                      <StatusBadge tone={statusTones[event.status]}>
                        {statusLabels[event.status]}
                      </StatusBadge>
                    </span>
                    <span className="flex flex-wrap gap-1.5">
                      {event.checklistReviewCount > 0 ? (
                        <StatusBadge tone="warning">
                          {event.checklistReviewCount} checklist
                        </StatusBadge>
                      ) : null}
                      {event.vendorReviewCount > 0 ? (
                        <StatusBadge tone="info">
                          {event.vendorReviewCount} vendor
                        </StatusBadge>
                      ) : null}
                      {event.lastSyncStatus === "warning" ||
                      event.lastSyncStatus === "error" ? (
                        <StatusBadge tone="danger">Sync</StatusBadge>
                      ) : null}
                      {event.checklistReviewCount === 0 &&
                      event.vendorReviewCount === 0 &&
                      event.lastSyncStatus !== "warning" &&
                      event.lastSyncStatus !== "error" ? (
                        <span className="text-slate-400">—</span>
                      ) : null}
                    </span>
                  </Link>
                ))}
              </div>
            </div>
          </div>
        </section>
      ) : (
        <EmptyState
          action={
            query || activeFilter !== "all" ? (
              <Link
                className="text-sm font-semibold text-slate-950 underline underline-offset-4"
                href="/admin/events"
              >
                Clear filters
              </Link>
            ) : (
              <CreateEventButton />
            )
          }
          description={
            query
              ? `No events match “${query}”.`
              : activeFilter !== "all"
                ? "No events in this status right now."
                : "New GHL inquiries appear here automatically, or use Create Event to book one onto the room calendar."
          }
          title={
            query || activeFilter !== "all" ? "No matching events" : "No events yet"
          }
        />
      )}
    </AdminShell>
  );
}

function formatNullableDate(date: string | null): string {
  return date ? formatDisplayDate(date) : "Not set";
}
