import {
  addMonths,
  differenceInCalendarMonths,
  format,
  startOfMonth,
} from "date-fns";

import { parseGhlSnapshot } from "@/lib/admin/events";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];
type ChecklistRow = Database["public"]["Tables"]["event_checklist_items"]["Row"];
type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];

export type ReportRange = {
  /** Inclusive start of the event-date window, or null for open-ended. */
  start: Date | null;
  /** Exclusive end of the event-date window, or null for open-ended. */
  end: Date | null;
};

export type ReportEvent = {
  id: string;
  status: EventRow["status"];
  eventName: string;
  eventType: string | null;
  /** Local date parsed from the GHL YYYY-MM-DD event date. */
  eventDate: Date | null;
  value: number | null;
  numberOfGuests: number | null;
  paymentStatus: string | null;
  launchedAt: string | null;
  firstViewedAt: string | null;
  viewCount: number;
};

export type MonthlyPoint = {
  label: string;
  value: number;
  detail: string;
};

export type BreakdownRow = {
  label: string;
  count: number;
  value: number;
  guests: number;
};

export type CountRow = {
  label: string;
  count: number;
};

export type AdminReportData = {
  kpis: {
    eventCount: number;
    totalValue: number;
    totalGuests: number;
    avgValue: number | null;
    avgGuests: number | null;
    valuePerGuest: number | null;
  };
  monthlyValue: MonthlyPoint[];
  monthlyGuests: MonthlyPoint[];
  byType: BreakdownRow[];
  statusMix: { status: EventRow["status"]; count: number }[];
  paymentMix: CountRow[];
  roomBookings: (CountRow & { bookedCount: number })[];
  engagement: {
    launchedCount: number;
    viewedCount: number;
    totalViews: number;
    checklistCompleted: number;
    checklistTotal: number;
  };
  /** Events with no GHL event date; they never match a date filter. */
  undatedCount: number;
};

// Aggregates portal events (with their GHL snapshot value / guest count),
// room reservations, and checklist progress into the numbers behind the
// admin Reports page. The window filters on the event's *event date* —
// events without one only appear in the all-time view.
export async function getAdminReportData(
  range: ReportRange,
): Promise<AdminReportData> {
  const supabase = createServiceRoleSupabaseClient();

  const [eventsResult, checklistResult, reservationsResult, roomsResult] =
    await Promise.all([
      supabase
        .from("events")
        .select(
          "id, status, launched_at, first_viewed_at, view_count, ghl_snapshot",
        )
        .limit(2000),
      supabase.from("event_checklist_items").select("event_id, status"),
      supabase
        .from("reservations")
        .select("room_id, status, start_datetime")
        .limit(5000),
      supabase.from("rooms").select("id, name"),
    ]);

  if (eventsResult.error) {
    throw new Error(`Unable to load report events: ${eventsResult.error.message}`);
  }
  if (checklistResult.error) {
    throw new Error(
      `Unable to load report checklist items: ${checklistResult.error.message}`,
    );
  }
  if (reservationsResult.error) {
    throw new Error(
      `Unable to load report reservations: ${reservationsResult.error.message}`,
    );
  }
  if (roomsResult.error) {
    throw new Error(`Unable to load report rooms: ${roomsResult.error.message}`);
  }

  const allEvents = (
    (eventsResult.data ?? []) as Pick<
      EventRow,
      "id" | "status" | "launched_at" | "first_viewed_at" | "view_count" | "ghl_snapshot"
    >[]
  ).map(mapReportEvent);

  const undatedCount = allEvents.filter((event) => !event.eventDate).length;
  const events = allEvents.filter((event) => inRange(event.eventDate, range));
  const eventIds = new Set(events.map((event) => event.id));

  const withValue = events.filter((event) => event.value !== null);
  const withGuests = events.filter((event) => event.numberOfGuests !== null);
  const totalValue = sum(withValue.map((event) => event.value ?? 0));
  const totalGuests = sum(withGuests.map((event) => event.numberOfGuests ?? 0));

  const checklistRows = (
    (checklistResult.data ?? []) as Pick<ChecklistRow, "event_id" | "status">[]
  ).filter((row) => eventIds.has(row.event_id));
  const checklistCounted = checklistRows.filter(
    (row) => row.status !== "not_applicable",
  );

  const roomNames = new Map(
    ((roomsResult.data ?? []) as Pick<RoomRow, "id" | "name">[]).map((room) => [
      room.id,
      room.name,
    ]),
  );
  const reservations = (
    (reservationsResult.data ?? []) as Pick<
      ReservationRow,
      "room_id" | "status" | "start_datetime"
    >[]
  ).filter((row) => inRange(new Date(row.start_datetime), range));

  const launched = events.filter(
    (event) => event.status !== "draft" || event.launchedAt,
  );
  const viewed = events.filter((event) => event.firstViewedAt);

  return {
    kpis: {
      eventCount: events.length,
      totalValue,
      totalGuests,
      avgValue: withValue.length > 0 ? totalValue / withValue.length : null,
      avgGuests: withGuests.length > 0 ? totalGuests / withGuests.length : null,
      valuePerGuest: totalGuests > 0 ? totalValue / totalGuests : null,
    },
    monthlyValue: bucketByMonth(events, range, (event) => event.value ?? 0, {
      detail: (bucket) =>
        `${bucket.count} event${bucket.count === 1 ? "" : "s"}`,
    }),
    monthlyGuests: bucketByMonth(
      events,
      range,
      (event) => event.numberOfGuests ?? 0,
      {
        detail: (bucket) =>
          `${bucket.count} event${bucket.count === 1 ? "" : "s"}`,
      },
    ),
    byType: buildTypeBreakdown(events),
    statusMix: buildStatusMix(events),
    paymentMix: buildCountRows(
      events,
      (event) => event.paymentStatus ?? "Not set",
    ),
    roomBookings: buildRoomBookings(reservations, roomNames),
    engagement: {
      launchedCount: launched.length,
      viewedCount: viewed.length,
      totalViews: sum(events.map((event) => event.viewCount)),
      checklistCompleted: checklistCounted.filter(
        (row) => row.status === "completed",
      ).length,
      checklistTotal: checklistCounted.length,
    },
    undatedCount,
  };
}

function mapReportEvent(
  row: Pick<
    EventRow,
    "id" | "status" | "launched_at" | "first_viewed_at" | "view_count" | "ghl_snapshot"
  >,
): ReportEvent {
  const snapshot = parseGhlSnapshot(row.ghl_snapshot);

  return {
    id: row.id,
    status: row.status,
    eventName: snapshot.eventName || "Untitled event",
    eventType: snapshot.eventType ?? null,
    eventDate: parseEventDate(snapshot.eventDate),
    value: snapshot.value ?? null,
    numberOfGuests: snapshot.numberOfGuests ?? null,
    paymentStatus: snapshot.paymentStatus ?? null,
    launchedAt: row.launched_at,
    firstViewedAt: row.first_viewed_at,
    viewCount: row.view_count,
  };
}

// GHL event dates are strict YYYY-MM-DD strings; parse in local time so the
// month buckets match what admins see elsewhere in the app.
function parseEventDate(value: string | undefined): Date | null {
  if (!value) return null;

  const parsed = new Date(`${value}T00:00:00`);

  return Number.isNaN(parsed.getTime()) ? null : parsed;
}

function inRange(date: Date | null, range: ReportRange): boolean {
  if (!date) return !range.start && !range.end;
  if (range.start && date < range.start) return false;
  if (range.end && date >= range.end) return false;

  return true;
}

type MonthBucket = { total: number; count: number };

function bucketByMonth(
  events: ReportEvent[],
  range: ReportRange,
  pick: (event: ReportEvent) => number,
  options: { detail: (bucket: MonthBucket) => string },
): MonthlyPoint[] {
  const dated = events.filter((event) => event.eventDate);

  if (dated.length === 0) return [];

  const dates = dated.map((event) => event.eventDate as Date);
  let first = startOfMonth(
    range.start ?? new Date(Math.min(...dates.map((d) => d.getTime()))),
  );
  const last = startOfMonth(
    range.end
      ? addMonths(range.end, -1)
      : new Date(Math.max(...dates.map((d) => d.getTime()))),
  );

  // Keep open-ended windows readable: chart at most the trailing 24 months.
  if (differenceInCalendarMonths(last, first) > 23) {
    first = addMonths(last, -23);
  }

  const buckets = new Map<string, MonthBucket>();
  for (let month = first; month <= last; month = addMonths(month, 1)) {
    buckets.set(format(month, "yyyy-MM"), { total: 0, count: 0 });
  }

  for (const event of dated) {
    const key = format(event.eventDate as Date, "yyyy-MM");
    const bucket = buckets.get(key);
    if (!bucket) continue;
    bucket.total += pick(event);
    bucket.count += 1;
  }

  const monthCount = buckets.size;

  return Array.from(buckets.entries()).map(([key, bucket]) => ({
    label: format(
      new Date(`${key}-01T00:00:00`),
      monthCount > 12 ? "MMM yy" : "MMM",
    ),
    value: bucket.total,
    detail: options.detail(bucket),
  }));
}

function buildTypeBreakdown(events: ReportEvent[]): BreakdownRow[] {
  const byType = new Map<string, BreakdownRow>();

  for (const event of events) {
    const label = event.eventType?.trim() || "No type set";
    const row =
      byType.get(label) ?? { label, count: 0, value: 0, guests: 0 };
    row.count += 1;
    row.value += event.value ?? 0;
    row.guests += event.numberOfGuests ?? 0;
    byType.set(label, row);
  }

  return Array.from(byType.values()).sort((a, b) => b.value - a.value);
}

function buildStatusMix(
  events: ReportEvent[],
): { status: EventRow["status"]; count: number }[] {
  const order: EventRow["status"][] = [
    "draft",
    "launched",
    "expired",
    "archived",
  ];

  return order
    .map((status) => ({
      status,
      count: events.filter((event) => event.status === status).length,
    }))
    .filter((entry) => entry.count > 0);
}

function buildCountRows(
  events: ReportEvent[],
  pick: (event: ReportEvent) => string,
): CountRow[] {
  const counts = new Map<string, number>();

  for (const event of events) {
    const label = pick(event);
    counts.set(label, (counts.get(label) ?? 0) + 1);
  }

  return Array.from(counts.entries())
    .map(([label, count]) => ({ label, count }))
    .sort((a, b) => b.count - a.count);
}

function buildRoomBookings(
  reservations: Pick<ReservationRow, "room_id" | "status" | "start_datetime">[],
  roomNames: Map<string, string>,
): (CountRow & { bookedCount: number })[] {
  const byRoom = new Map<string, { count: number; bookedCount: number }>();

  for (const reservation of reservations) {
    const entry = byRoom.get(reservation.room_id) ?? { count: 0, bookedCount: 0 };
    entry.count += 1;
    if (reservation.status === "booked") entry.bookedCount += 1;
    byRoom.set(reservation.room_id, entry);
  }

  return Array.from(byRoom.entries())
    .map(([roomId, entry]) => ({
      label: roomNames.get(roomId) ?? "Unknown room",
      count: entry.count,
      bookedCount: entry.bookedCount,
    }))
    .sort((a, b) => b.count - a.count);
}

function sum(values: number[]): number {
  return values.reduce((total, value) => total + value, 0);
}
