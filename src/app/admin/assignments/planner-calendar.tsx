import {
  addDays,
  eachDayOfInterval,
  endOfMonth,
  endOfWeek,
  format,
  isSameDay,
  isSameMonth,
  startOfMonth,
  startOfWeek,
} from "date-fns";
import Link from "next/link";

import type { UpcomingAssignment } from "@/lib/admin/room-calendar";

// Month calendar for Planner Assignments. Server-rendered: month navigation
// and the planner filter are plain links (?month=YYYY-MM&planners=a,b), so
// the page needs no client state and a URL always reproduces the view.
//
// Color means planner here (the Room Calendar colors by room); the room is
// text on the chip. Held rooms keep the faded, dashed treatment the column
// cards use so "held vs booked" reads the same everywhere.

export type PlannerSwatch = {
  name: string;
  color: string;
  // Assignments in the visible month, before the planner filter — shown on
  // the chip so the row doubles as a workload glance.
  count: number;
};

// Distinct hues with enough weight for white text, in both themes.
const PLANNER_PALETTE = [
  "#2563eb",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0d9488",
  "#ea580c",
  "#4f46e5",
  "#65a30d",
  "#0891b2",
  "#b91c1c",
];
export const UNASSIGNED_COLOR = "#64748b";

export function plannerColor(index: number): string {
  return PLANNER_PALETTE[index % PLANNER_PALETTE.length];
}

// Grid bounds for a month: full weeks, Sunday first, so leading/trailing
// days from the neighboring months fill the corners.
export function monthGridRange(month: Date): { start: Date; end: Date } {
  return {
    start: startOfWeek(startOfMonth(month), { weekStartsOn: 0 }),
    end: endOfWeek(endOfMonth(month), { weekStartsOn: 0 }),
  };
}

export function parseMonthParam(value: string | undefined): Date {
  const match = value?.match(/^(\d{4})-(\d{2})$/);
  if (!match) return startOfMonth(new Date());
  const year = Number(match[1]);
  const monthIndex = Number(match[2]) - 1;
  if (monthIndex < 0 || monthIndex > 11) return startOfMonth(new Date());
  return new Date(year, monthIndex, 1);
}

const WEEKDAYS = ["Sun", "Mon", "Tue", "Wed", "Thu", "Fri", "Sat"];

export function PlannerMonthCalendar({
  assignments,
  colorByPlanner,
  month,
  plannerNameOf,
}: {
  assignments: UpcomingAssignment[];
  colorByPlanner: Map<string, string>;
  month: Date;
  plannerNameOf: (assignment: UpcomingAssignment) => string;
}) {
  const { start, end } = monthGridRange(month);
  const days = eachDayOfInterval({ start, end });
  const today = new Date();

  // An event that spans midnight appears on every day it covers.
  const byDay = new Map<string, UpcomingAssignment[]>();
  for (const assignment of assignments) {
    const first = new Date(assignment.start_datetime);
    const last = new Date(assignment.end_datetime);
    for (
      let day = first;
      day <= last && day <= end;
      day = addDays(startOfDay(day), 1)
    ) {
      if (day < start) continue;
      const key = format(day, "yyyy-MM-dd");
      const bucket = byDay.get(key);
      if (bucket) bucket.push(assignment);
      else byDay.set(key, [assignment]);
    }
  }
  for (const bucket of byDay.values()) {
    bucket.sort((a, b) => a.start_datetime.localeCompare(b.start_datetime));
  }

  return (
    <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
      <div className="min-w-[840px]">
        <div className="grid grid-cols-7 border-b border-slate-200">
          {WEEKDAYS.map((weekday) => (
            <div
              className="px-2 py-2 text-center type-label text-slate-500"
              key={weekday}
            >
              {weekday}
            </div>
          ))}
        </div>
        <div className="grid grid-cols-7">
          {days.map((day, index) => {
            const key = format(day, "yyyy-MM-dd");
            const items = byDay.get(key) ?? [];
            const inMonth = isSameMonth(day, month);
            const isToday = isSameDay(day, today);
            const lastColumn = index % 7 === 6;
            const lastRow = index >= days.length - 7;

            return (
              <div
                className={`min-h-28 p-1.5 ${lastColumn ? "" : "border-r"} ${
                  lastRow ? "" : "border-b"
                } border-slate-200 ${inMonth ? "bg-white" : "bg-slate-50"}`}
                key={key}
              >
                <div className="flex items-center justify-between">
                  <span
                    className={`inline-flex h-6 min-w-6 items-center justify-center rounded-full px-1 text-xs font-semibold ${
                      isToday
                        ? "bg-[var(--brand)] text-[var(--brand-foreground)]"
                        : inMonth
                          ? "text-slate-700"
                          : "text-slate-400"
                    }`}
                  >
                    {format(day, "d")}
                  </span>
                  {items.length > 0 ? (
                    <span className="text-[11px] font-medium text-slate-400">
                      {items.length}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 space-y-1">
                  {items.map((assignment) => (
                    <AssignmentChip
                      assignment={assignment}
                      color={
                        colorByPlanner.get(plannerNameOf(assignment)) ??
                        UNASSIGNED_COLOR
                      }
                      day={day}
                      key={`${assignment.id}-${key}`}
                      plannerName={plannerNameOf(assignment)}
                    />
                  ))}
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}

function startOfDay(date: Date): Date {
  return new Date(date.getFullYear(), date.getMonth(), date.getDate());
}

function AssignmentChip({
  assignment,
  color,
  day,
  plannerName,
}: {
  assignment: UpcomingAssignment;
  color: string;
  day: Date;
  plannerName: string;
}) {
  const isHeld = assignment.status === "held";
  const startsToday = isSameDay(new Date(assignment.start_datetime), day);
  const time = startsToday
    ? format(new Date(assignment.start_datetime), "h:mm a")
    : "cont.";
  const room = assignment.rooms?.name ?? "No room";
  const tooltip = `${assignment.title}\n${plannerName} · ${room}\n${format(
    new Date(assignment.start_datetime),
    "EEE, MMM d · h:mm a",
  )} – ${format(new Date(assignment.end_datetime), "h:mm a")}${
    isHeld ? "\nHeld (not yet booked)" : ""
  }`;

  const body = (
    <>
      <span className="block truncate font-semibold">
        <span className="font-normal opacity-90">{time}</span> {assignment.title}
      </span>
      <span className="block truncate text-[10px] opacity-85">
        {plannerName} · {room}
      </span>
    </>
  );

  const className =
    "block rounded-sm px-1.5 py-1 text-[11px] leading-tight text-white transition hover:brightness-110";
  const style = {
    backgroundColor: color,
    opacity: isHeld ? 0.55 : 1,
    outline: isHeld ? `1.5px dashed ${color}` : undefined,
    outlineOffset: isHeld ? "-1.5px" : undefined,
  };

  // Chips for reservations tied to a portal event open that event.
  return assignment.event_id ? (
    <Link
      className={className}
      href={`/admin/events/${assignment.event_id}`}
      style={style}
      title={tooltip}
    >
      {body}
    </Link>
  ) : (
    <div className={className} style={style} title={tooltip}>
      {body}
    </div>
  );
}
