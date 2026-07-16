import { format } from "date-fns";
import Link from "next/link";
import { redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { EmptyState } from "@/components/ui/empty-state";
import {
  listUpcomingAssignments,
  type UpcomingAssignment,
} from "@/lib/admin/room-calendar";
import { listGhlUsers } from "@/lib/ghl/location-data";
import { createServerSupabaseClient } from "@/lib/supabase/server";

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

type AdminAssignmentsPageProps = {
  searchParams: Promise<{ from?: string; to?: string }>;
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
  const from = parseDateParam(params.from);
  const to = parseDateParam(params.to);
  const hasRange = Boolean(from || to);

  // Planner columns are the GHL location users — the same list the
  // reservation modal's Event Coordinator dropdown offers.
  const [ghlUsers, assignments] = await Promise.all([
    listGhlUsers(),
    listUpcomingAssignments({ from, to }),
  ]);

  const groups = groupByPlanner(
    [...ghlUsers.map((u) => u.name), UNASSIGNED],
    assignments,
  );

  return (
    <AdminShell
      description="Every planner with their upcoming assigned events, side by side, so it's easy to spot anyone carrying too many at once. Faded cards are held rooms; solid cards are confirmed bookings."
      title="Planner Assignments"
      userEmail={user.email}
    >
      <form
        className="flex flex-wrap items-end gap-3 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
        method="get"
      >
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
          className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
          type="submit"
        >
          Apply
        </button>
        {hasRange ? (
          <Link
            className="rounded-full border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 transition hover:bg-slate-100"
            href="/admin/assignments"
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
              className="w-72 shrink-0 rounded-2xl border border-slate-200 bg-white p-4 shadow-sm"
            >
              <div className="flex items-center justify-between gap-2 border-b border-slate-200 pb-3">
                <h2 className="truncate text-sm font-semibold text-slate-950">
                  {plannerName}
                </h2>
                <span className="inline-flex items-center rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-600">
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
    </AdminShell>
  );
}
