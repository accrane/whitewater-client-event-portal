import { addMonths, format, isSameMonth, subMonths } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import {
  listUpcomingAssignments,
  type UpcomingAssignment,
} from "@/lib/admin/room-calendar";
import { listGhlPlannerUsers } from "@/lib/ghl/location-data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import {
  monthGridRange,
  parseMonthParam,
  plannerColor,
  PlannerMonthCalendar,
  UNASSIGNED_COLOR,
} from "./planner-calendar";

const UNASSIGNED = "Unassigned";

// Accept only YYYY-MM-DD values from the query string; anything else is
// treated as unset.
function parseDateParam(value: string | undefined): string | null {
  return value && /^\d{4}-\d{2}-\d{2}$/.test(value) ? value : null;
}

function groupByPlanner(
  plannerNames: string[],
  assignments: UpcomingAssignment[],
) {
  const groups = new Map<string, UpcomingAssignment[]>(
    plannerNames.map((name) => [name, []]),
  );

  for (const assignment of assignments) {
    // Keep a column for names that were removed from settings but still
    // have assigned reservations.
    const name = assignment.coordinator_name?.trim() || UNASSIGNED;
    const bucket = groups.get(name);
    if (bucket) {
      bucket.push(assignment);
    } else {
      groups.set(name, [assignment]);
    }
  }

  // Only show the Unassigned column when something is actually unassigned.
  const unassigned = groups.get(UNASSIGNED);
  if (unassigned && unassigned.length === 0) {
    groups.delete(UNASSIGNED);
  }

  return groups;
}

// Heroicons "hand-raised" (outline) — signals "hold on" for held rooms.
function HandRaisedIcon() {
  return (
    <svg
      aria-label="Held"
      className="h-4 w-4"
      fill="none"
      role="img"
      stroke="currentColor"
      strokeWidth={1.5}
      viewBox="0 0 24 24"
    >
      <path
        strokeLinecap="round"
        strokeLinejoin="round"
        d="M10.05 4.575C10.05 3.70515 9.34486 3 8.47501 3C7.60516 3 6.90001 3.70515 6.90001 4.575L6.9 7.575M10.05 4.575L10.05 3.075C10.05 2.20515 10.7552 1.5 11.625 1.5C12.4949 1.5 13.2 2.20515 13.2 3.075L13.2 4.575M10.05 4.575L10.125 10.5M13.2 11.25V4.575M13.2 4.575C13.2 3.70515 13.9052 3 14.775 3C15.6449 3 16.35 3.70515 16.35 4.575V15M6.9 7.575C6.9 6.70515 6.19485 6 5.325 6C4.45515 6 3.75 6.70515 3.75 7.575V15.75C3.75 19.4779 6.77208 22.5 10.5 22.5H12.5179C13.9103 22.5 15.2456 21.9469 16.2302 20.9623L17.9623 19.2302C18.9469 18.2456 19.5 16.9103 19.5 15.5179L19.5031 13.494C19.5046 13.3209 19.5701 13.1533 19.7007 13.0227C20.3158 12.4076 20.3158 11.4104 19.7007 10.7953C19.0857 10.1802 18.0884 10.1802 17.4733 10.7953C16.7315 11.5371 16.3578 12.5111 16.3531 13.4815M6.9 7.575V12M13.17 16.318C13.5599 15.9281 14.0035 15.6248 14.477 15.4079C15.0701 15.1362 15.71 15.0003 16.35 15M16.3519 15H16.35"
      />
    </svg>
  );
}

function CheckIcon() {
  return (
    <svg
      aria-label="Booked"
      className="h-4 w-4"
      fill="none"
      role="img"
      stroke="currentColor"
      strokeWidth={2.5}
      viewBox="0 0 24 24"
    >
      <path strokeLinecap="round" strokeLinejoin="round" d="M4.5 12.75l6 6 9-13.5" />
    </svg>
  );
}

function AssignmentCard({ assignment }: { assignment: UpcomingAssignment }) {
  const isHeld = assignment.status === "held";
  const roomColor = assignment.rooms?.color ?? "#64748b";
  const start = new Date(assignment.start_datetime);

  return (
    <div
      className="relative rounded-xl px-3 py-2.5"
      style={{
        backgroundColor: roomColor,
        opacity: isHeld ? 0.45 : 1,
        borderWidth: "2px",
        borderStyle: isHeld ? "dashed" : "solid",
        borderColor: isHeld ? roomColor : "transparent",
      }}
      title={`${assignment.title} (${assignment.status})`}
    >
      <span className="absolute right-2 top-2 text-white">
        {isHeld ? <HandRaisedIcon /> : <CheckIcon />}
      </span>
      <p
        className="pr-6 text-sm font-semibold text-white truncate"
        style={{ textShadow: "0 1px 2px rgba(0,0,0,0.2)" }}
      >
        {assignment.title}
      </p>
      <p className="mt-0.5 text-xs text-white/90">
        {format(start, "EEE, MMM d, yyyy")} · {format(start, "h:mm a")}
      </p>
      <p className="text-xs font-medium text-white/80">
        {assignment.rooms?.name ?? "No room"}
      </p>
    </div>
  );
}

function plannerNameOf(assignment: UpcomingAssignment): string {
  return assignment.coordinator_name?.trim() || UNASSIGNED;
}

type AdminAssignmentsPageProps = {
  searchParams: Promise<{
    view?: string;
    month?: string;
    planners?: string;
    from?: string;
    to?: string;
  }>;
};

export default async function AdminAssignmentsPage({
  searchParams,
}: AdminAssignmentsPageProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const params = await searchParams;
  const view = params.view === "columns" ? "columns" : "calendar";

  return (
    <AdminShell
      description={
        view === "calendar"
          ? "Every planner's assigned events on one month calendar, colored by planner. Faded chips are held rooms; solid chips are confirmed bookings."
          : "Every planner with their upcoming assigned events, side by side, so it's easy to spot anyone carrying too many at once. Faded cards are held rooms; solid cards are confirmed bookings."
      }
      title="Planner Assignments"
      userEmail={user.email}
    >
      {view === "calendar" ? (
        <CalendarView monthParam={params.month} plannersParam={params.planners} />
      ) : (
        <ColumnsView
          from={parseDateParam(params.from)}
          to={parseDateParam(params.to)}
        />
      )}
    </AdminShell>
  );
}

// Calendar | Columns switch, shared by both views. Each side keeps its own
// query state (month/planners vs from/to) so switching back restores it.
function ViewToggle({ view }: { view: "calendar" | "columns" }) {
  return (
    <div
      aria-label="Layout"
      className="flex gap-1 rounded-lg bg-slate-100 p-1"
      role="group"
    >
      {[
        { key: "calendar", label: "Calendar", href: "/admin/assignments" },
        { key: "columns", label: "Columns", href: "/admin/assignments?view=columns" },
      ].map((option) => (
        <Link
          aria-current={view === option.key ? "page" : undefined}
          className={`rounded-md px-3 py-1.5 text-xs font-semibold transition ${
            view === option.key
              ? "bg-white text-slate-950 shadow-sm"
              : "text-slate-600 hover:text-slate-950"
          }`}
          href={option.href}
          key={option.key}
        >
          {option.label}
        </Link>
      ))}
    </div>
  );
}

// Month grid of every planner's assignments. The month and the planner
// filter live in the URL (?month=YYYY-MM&planners=Name,Name) so the arrows
// and chips are plain links and a view can be bookmarked or shared.
async function CalendarView({
  monthParam,
  plannersParam,
}: {
  monthParam: string | undefined;
  plannersParam: string | undefined;
}) {
  const month = parseMonthParam(monthParam);
  const { start, end } = monthGridRange(month);

  const [ghlUsers, assignments] = await Promise.all([
    listGhlPlannerUsers(),
    listUpcomingAssignments({
      from: format(start, "yyyy-MM-dd"),
      to: format(end, "yyyy-MM-dd"),
    }),
  ]);

  // Planner order: GHL staff planners first, then anyone else who still
  // has assignments this month, then Unassigned. Colors follow that order
  // so a planner keeps the same color from month to month.
  const plannerNames = [...ghlUsers.map((u) => u.name)];
  for (const assignment of assignments) {
    const name = plannerNameOf(assignment);
    if (name !== UNASSIGNED && !plannerNames.includes(name)) {
      plannerNames.push(name);
    }
  }
  const colorByPlanner = new Map<string, string>(
    plannerNames.map((name, index) => [name, plannerColor(index)]),
  );
  colorByPlanner.set(UNASSIGNED, UNASSIGNED_COLOR);

  const countByPlanner = new Map<string, number>();
  for (const assignment of assignments) {
    const name = plannerNameOf(assignment);
    countByPlanner.set(name, (countByPlanner.get(name) ?? 0) + 1);
  }
  const hasUnassigned = (countByPlanner.get(UNASSIGNED) ?? 0) > 0;
  const chipNames = hasUnassigned ? [...plannerNames, UNASSIGNED] : plannerNames;

  // Selected planners come from the URL; unknown names are ignored, and an
  // empty selection means everyone.
  const selected = new Set(
    (plannersParam ?? "")
      .split(",")
      .map((name) => name.trim())
      .filter((name) => name && chipNames.includes(name)),
  );
  const visible =
    selected.size === 0
      ? assignments
      : assignments.filter((assignment) =>
          selected.has(plannerNameOf(assignment)),
        );

  const hrefFor = (nextMonth: Date, nextSelected: Set<string>) => {
    const query = new URLSearchParams();
    if (!isSameMonth(nextMonth, new Date())) {
      query.set("month", format(nextMonth, "yyyy-MM"));
    }
    if (nextSelected.size > 0) {
      query.set("planners", [...nextSelected].join(","));
    }
    const qs = query.toString();
    return qs ? `/admin/assignments?${qs}` : "/admin/assignments";
  };
  const toggled = (name: string) => {
    const next = new Set(selected);
    if (next.has(name)) next.delete(name);
    else next.add(name);
    return next;
  };

  return (
    <>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-2">
          <Link
            aria-label="Previous month"
            className={buttonClasses("secondary", "sm")}
            href={hrefFor(subMonths(month, 1), selected)}
          >
            <ChevronIcon direction="left" />
          </Link>
          <Link
            aria-label="Next month"
            className={buttonClasses("secondary", "sm")}
            href={hrefFor(addMonths(month, 1), selected)}
          >
            <ChevronIcon direction="right" />
          </Link>
          <h2 className="ml-1 text-base font-semibold text-slate-950">
            {format(month, "MMMM yyyy")}
          </h2>
          {!isSameMonth(month, new Date()) ? (
            <Link
              className="text-xs font-semibold text-slate-500 underline-offset-2 hover:text-slate-950 hover:underline"
              href={hrefFor(new Date(), selected)}
            >
              Today
            </Link>
          ) : null}
        </div>
        <ViewToggle view="calendar" />
      </div>

      {chipNames.length === 0 ? (
        <EmptyState
          description="Planners come from your GoHighLevel users. Once GHL is configured and reservations are assigned a coordinator, their events appear here."
          title="No planners yet"
        />
      ) : (
        <div className="flex flex-wrap items-center gap-2">
          <Link
            aria-current={selected.size === 0 ? "true" : undefined}
            className={`rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
              selected.size === 0
                ? "border-slate-950 bg-slate-950 text-white"
                : "border-slate-300 bg-white text-slate-600 hover:border-slate-400"
            }`}
            href={hrefFor(month, new Set())}
          >
            All planners
          </Link>
          {chipNames.map((name) => {
            const active = selected.size === 0 || selected.has(name);
            const count = countByPlanner.get(name) ?? 0;
            return (
              <Link
                aria-pressed={selected.has(name)}
                className={`inline-flex items-center gap-1.5 rounded-md border px-2.5 py-1 text-xs font-semibold transition ${
                  active
                    ? "border-slate-300 bg-white text-slate-800 hover:border-slate-400"
                    : "border-slate-200 bg-slate-50 text-slate-400 hover:text-slate-600"
                }`}
                href={hrefFor(month, toggled(name))}
                key={name}
                title={
                  selected.has(name)
                    ? `Hide ${name}`
                    : `Show only ${name}${selected.size > 0 ? " too" : ""}`
                }
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 rounded-full"
                  style={{
                    backgroundColor: colorByPlanner.get(name),
                    opacity: active ? 1 : 0.4,
                  }}
                />
                {name}
                <span
                  className={`rounded-sm px-1 text-[11px] ${
                    count > 0 && active
                      ? "bg-slate-100 text-[var(--brand)]"
                      : "bg-slate-100 text-slate-400"
                  }`}
                >
                  {count}
                </span>
              </Link>
            );
          })}
          <p className="w-full text-xs text-slate-500 sm:ml-auto sm:w-auto">
            {assignments.length === 0
              ? `No assigned events in ${format(month, "MMMM")}.`
              : selected.size === 0
                ? `${assignments.length} event${assignments.length === 1 ? "" : "s"} in ${format(month, "MMMM")}.`
                : `${visible.length} of ${assignments.length} events shown.`}
          </p>
        </div>
      )}

      <PlannerMonthCalendar
        assignments={visible}
        colorByPlanner={colorByPlanner}
        month={month}
        plannerNameOf={plannerNameOf}
      />
    </>
  );
}

function ChevronIcon({ direction }: { direction: "left" | "right" }) {
  return (
    <svg
      aria-hidden
      fill="none"
      height="14"
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width="14"
    >
      <path
        d={direction === "left" ? "M15 6l-6 6 6 6" : "M9 6l6 6-6 6"}
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}

// One column per planner: the original workload comparison, kept behind
// the Columns toggle.
async function ColumnsView({
  from,
  to,
}: {
  from: string | null;
  to: string | null;
}) {
  const hasRange = Boolean(from || to);

  // Planner columns are the GHL staff planners — the same list the
  // reservation modal's Event Coordinator dropdown offers. Events assigned
  // to someone outside that list still get their own column via
  // groupByPlanner.
  const [ghlUsers, assignments] = await Promise.all([
    listGhlPlannerUsers(),
    listUpcomingAssignments({ from, to }),
  ]);

  const groups = groupByPlanner(
    [...ghlUsers.map((u) => u.name), UNASSIGNED],
    assignments,
  );

  return (
    <>
      <div className="flex flex-wrap items-end justify-between gap-3">
        <form
          className="flex flex-wrap items-end gap-3 rounded-xl border border-slate-200 bg-white p-4"
          method="get"
        >
          <input name="view" type="hidden" value="columns" />
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
          <button className={buttonClasses("primary", "md")} type="submit">
            Apply
          </button>
          {hasRange ? (
            <Link
              className={buttonClasses("secondary", "md")}
              href="/admin/assignments?view=columns"
            >
              Clear
            </Link>
          ) : null}
          <p className="w-full text-xs text-slate-500 sm:ml-auto sm:w-auto">
            {hasRange
              ? `Showing events ${from ? `from ${format(new Date(`${from}T00:00:00`), "MMM d, yyyy")}` : ""}${from && to ? " " : ""}${to ? `through ${format(new Date(`${to}T00:00:00`), "MMM d, yyyy")}` : ""}.`
              : "Showing all upcoming events."}
          </p>
        </form>
        <ViewToggle view="columns" />
      </div>

      {groups.size === 0 ? (
        <EmptyState
          description="Planners come from your GoHighLevel users. Once GHL is configured and reservations are assigned a coordinator, workloads appear here."
          title="No planners yet"
        />
      ) : (
        <div className="flex gap-4 overflow-x-auto pb-2">
          {[...groups.entries()].map(([plannerName, items]) => (
            <div
              key={plannerName}
              className="w-72 shrink-0 rounded-xl border border-slate-200 bg-white p-4"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <h2 className="truncate text-sm font-semibold text-slate-950">
                  {plannerName}
                </h2>
                <span className="inline-flex items-center rounded-sm bg-slate-100 px-1.5 py-0.5 text-xs font-semibold text-slate-600">
                  {items.length}
                </span>
              </div>
              <div className="mt-3 space-y-2">
                {items.length === 0 ? (
                  <p className="py-2 text-xs text-slate-400">
                    {hasRange ? "No events in this range." : "No upcoming events."}
                  </p>
                ) : (
                  items.map((assignment) => (
                    <AssignmentCard
                      assignment={assignment}
                      key={assignment.id}
                    />
                  ))
                )}
              </div>
            </div>
          ))}
        </div>
      )}
    </>
  );
}
