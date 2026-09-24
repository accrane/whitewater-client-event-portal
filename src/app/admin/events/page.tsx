import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { CreateEventButton } from "@/components/admin/create-event-button";
import { EmptyState } from "@/components/ui/empty-state";
import { Icon } from "@/components/ui/icon";
import { ButtonLink, buttonClasses } from "@/components/ui/button";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import { formatDisplayDate } from "@/lib/dates";
import { EVENTS_PAGE_SIZE, listAdminEventsPage } from "@/lib/admin/events";
import { requireStaffUser } from "@/lib/admin/session";

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

type AdminEventsPageProps = {
  searchParams: Promise<{ status?: string; q?: string; page?: string }>;
};

export default async function AdminEventsPage({
  searchParams,
}: AdminEventsPageProps) {
  const { user } = await requireStaffUser();

  const { status, q, page: pageParam } = await searchParams;
  const activeFilter: FilterKey = filters.some((f) => f.key === status)
    ? (status as FilterKey)
    : "all";
  const query = q?.trim() ?? "";
  const page = Math.max(1, Number.parseInt(pageParam ?? "", 10) || 1);

  // Filtering, search and paging happen in the database, so every event
  // stays reachable however many inquiries come in.
  const {
    events: filtered,
    total,
    counts,
  } = await listAdminEventsPage({ filter: activeFilter, search: query, page });
  const lastPage = Math.max(1, Math.ceil(total / EVENTS_PAGE_SIZE));

  function listHref(key: FilterKey, pageNumber = 1): string {
    const params = new URLSearchParams();
    if (key !== "all") params.set("status", key);
    if (query) params.set("q", query);
    if (pageNumber > 1) params.set("page", String(pageNumber));
    const search = params.toString();

    return search ? `/admin/events?${search}` : "/admin/events";
  }

  // A stale bookmark past the end lands on the last page.
  if (page > lastPage) {
    redirect(listHref(activeFilter, lastPage));
  }

  function filterHref(key: FilterKey): string {
    return listHref(key);
  }

  function filterCount(key: FilterKey): number {
    return counts[key];
  }

  const firstShown = (page - 1) * EVENTS_PAGE_SIZE + 1;
  const lastShown = firstShown + filtered.length - 1;

  return (
    <AdminShell
      actions={
        <>
          <ButtonLink href="/admin/inquiries/new" variant="primary">
            New inquiry
          </ButtonLink>
          <CreateEventButton />
        </>
      }
      description="Every portal event, from new GHL inquiries through launched client portals."
      title="Events"
      userEmail={user.email}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <nav
          aria-label="Filter events by status"
          className="inline-flex flex-wrap items-center gap-1 rounded-lg border border-slate-200 bg-white p-1"
        >
          {filters.map((filter) => {
            const active = filter.key === activeFilter;

            return (
              <Link
                aria-current={active ? "page" : undefined}
                className={`rounded-md px-3 py-1.5 text-[13px] font-semibold transition ${
                  active
                    ? "bg-slate-100 text-slate-950"
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
        <section className="overflow-hidden rounded-xl border border-slate-200 bg-white">
          <div className="overflow-x-auto">
            <div className="min-w-[860px]">
              <div className="grid grid-cols-[minmax(240px,2fr)_minmax(120px,auto)_minmax(130px,1fr)_minmax(150px,1fr)_minmax(90px,auto)_minmax(150px,auto)] items-center gap-x-4 border-b border-slate-200 bg-slate-50 px-5 py-2 type-label text-slate-500">
                <span>Event</span>
                <span>Event date</span>
                <span>Type</span>
                <span>Coordinator</span>
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
                      className={`truncate ${event.coordinatorName ? "text-slate-800" : "text-slate-400"}`}
                    >
                      {event.coordinatorName || "Not assigned"}
                    </span>
                    <span>
                      {event.expedited ? (
                        <StatusBadge tone="danger">Expedited</StatusBadge>
                      ) : null}
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
          {lastPage > 1 ? (
            <nav
              aria-label="Event pages"
              className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-5 py-3 text-sm text-slate-600"
            >
              <span>
                Showing {firstShown}–{lastShown} of {total}
              </span>
              <span className="flex items-center gap-2">
                {page > 1 ? (
                  <Link
                    className={buttonClasses("secondary", "sm")}
                    href={listHref(activeFilter, page - 1)}
                  >
                    Previous
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className={`${buttonClasses("secondary", "sm")} opacity-50`}
                  >
                    Previous
                  </span>
                )}
                <span className="text-slate-500">
                  Page {page} of {lastPage}
                </span>
                {page < lastPage ? (
                  <Link
                    className={buttonClasses("secondary", "sm")}
                    href={listHref(activeFilter, page + 1)}
                  >
                    Next
                  </Link>
                ) : (
                  <span
                    aria-disabled="true"
                    className={`${buttonClasses("secondary", "sm")} opacity-50`}
                  >
                    Next
                  </span>
                )}
              </span>
            </nav>
          ) : null}
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
