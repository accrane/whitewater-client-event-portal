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

import type { UpcomingAssignment } from "@/lib/admin/room-calendar";

import { EventDayChip, type EventDaySummary } from "./event-day-chip";

// Month calendar for Planner Assignments. Server-rendered: month navigation
// and the planner filter are plain links (?month=YYYY-MM&planners=a,b), so
// the page needs no client state and a URL always reproduces the view.
//
// Color means planner here (the Room Calendar colors by room). A day shows
// one chip per event, not per room; the rooms are listed in the chip's
// pop-up. A chip is faded/dashed only when every room is still held, the
// same treatment the column cards use.

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
            const events = groupByEvent(items, day, colorByPlanner, plannerNameOf);
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
                  {events.length > 0 ? (
                    <span className="text-[11px] font-medium text-slate-400">
                      {events.length}
                    </span>
                  ) : null}
                </div>
                <div className="mt-1 space-y-1">
                  {events.map((summary) => (
                    <EventDayChip key={summary.key} summary={summary} />
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

// Reservations for one day, collapsed to one summary per event. Linked
// reservations group by portal event id; unlinked ones group by title and
// planner, which is how a multi-room booking made from the Room Calendar
// looks before it's tied to an event.
function groupByEvent(
  items: UpcomingAssignment[],
  day: Date,
  colorByPlanner: Map<string, string>,
  plannerNameOf: (assignment: UpcomingAssignment) => string,
): EventDaySummary[] {
  const groups = new Map<string, { summary: EventDaySummary; rows: UpcomingAssignment[] }>();

  for (const assignment of items) {
    const plannerName = plannerNameOf(assignment);
    const groupKey = assignment.event_id
      ? `event:${assignment.event_id}`
      : `title:${assignment.title.trim().toLowerCase()}|${plannerName}`;
    const existing = groups.get(groupKey);
    if (existing) {
      existing.rows.push(assignment);
      continue;
    }
    groups.set(groupKey, {
      rows: [assignment],
      summary: {
        key: `${groupKey}|${format(day, "yyyy-MM-dd")}`,
        title: assignment.title,
        plannerName,
        color: colorByPlanner.get(plannerName) ?? UNASSIGNED_COLOR,
        eventId: assignment.event_id,
        clientName: assignment.client_name,
        dateLabel: format(day, "EEEE, MMM d, yyyy"),
        timeLabel: "",
        rooms: [],
        allHeld: true,
      },
    });
  }

  return [...groups.values()].map(({ summary, rows }) => {
    const earliest = rows.reduce((min, row) =>
      row.start_datetime < min.start_datetime ? row : min,
    );
    const startsToday = isSameDay(new Date(earliest.start_datetime), day);
    return {
      ...summary,
      timeLabel: startsToday
        ? format(new Date(earliest.start_datetime), "h:mm a")
        : "cont.",
      allHeld: rows.every((row) => row.status === "held"),
      rooms: rows
        .map((row) => ({
          id: row.id,
          roomName: row.rooms?.name ?? "No room",
          roomColor: row.rooms?.color ?? "#64748b",
          timeRange: `${format(new Date(row.start_datetime), "h:mm a")} – ${format(
            new Date(row.end_datetime),
            "h:mm a",
          )}`,
          status: row.status,
        }))
        .sort((a, b) => a.roomName.localeCompare(b.roomName)),
    };
  });
}
