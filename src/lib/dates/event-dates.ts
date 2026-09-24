// Event dates: the first day (GHL's Date of Interest), an optional last day
// for multi-day events, and moving an event's room reservations when its
// dates change. Kept free of runtime imports so tests can exercise it
// directly (tests/admin/event-dates.test.mjs).
//
// Dates are yyyy-MM-dd strings. Reservation times are instants (ISO), entered
// as wall-clock times at the venue, so a room moved to another day keeps its
// local start and end time, across a daylight-saving change too.

// Whitewater is in Charlotte, NC.
export const VENUE_TIME_ZONE = "America/New_York";

// Longest span the dates dialog accepts: a guard against typos (a wrong
// year), not a business rule.
export const MAX_EVENT_DAYS = 31;

const DAY_MS = 86_400_000;
const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})$/;

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string") return false;
  const match = ISO_DATE.exec(value);
  if (!match) return false;
  const [year, month, day] = [Number(match[1]), Number(match[2]), Number(match[3])];
  const date = new Date(Date.UTC(year, month - 1, day));
  return (
    date.getUTCFullYear() === year &&
    date.getUTCMonth() === month - 1 &&
    date.getUTCDate() === day
  );
}

// Stored event dates are yyyy-MM-dd, occasionally ISO-prefixed; anything
// else reads as no date.
export function toIsoDate(value: string | null | undefined): string | null {
  const day = typeof value === "string" ? value.slice(0, 10) : "";
  return isIsoDate(day) ? day : null;
}

function dayToUtcMs(day: string): number {
  return Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)),
  );
}

export function addDays(day: string, days: number): string {
  return new Date(dayToUtcMs(day) + days * DAY_MS).toISOString().slice(0, 10);
}

// Whole days from `from` to `to` (negative when `to` is earlier).
export function daysBetween(from: string, to: string): number {
  return Math.round((dayToUtcMs(to) - dayToUtcMs(from)) / DAY_MS);
}

// The event's last day when it runs more than one day; null for a one-day
// event, a missing start, or an end on/before the start.
export function normalizeEventEnd(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  const first = toIsoDate(start);
  const last = toIsoDate(end);
  if (!first || !last || last <= first) return null;
  return last;
}

// Every day of the event, first to last. Empty without a start date.
export function eventDayList(
  start: string | null | undefined,
  end: string | null | undefined,
): string[] {
  const first = toIsoDate(start);
  if (!first) return [];
  const last = normalizeEventEnd(first, end) ?? first;
  const count = Math.min(daysBetween(first, last) + 1, MAX_EVENT_DAYS);
  return Array.from({ length: count }, (_, index) => addDays(first, index));
}

export function isEventDay(
  day: string,
  start: string | null | undefined,
  end: string | null | undefined,
): boolean {
  const first = toIsoDate(start);
  if (!first) return false;
  const last = normalizeEventEnd(first, end) ?? first;
  return day >= first && day <= last;
}

// Why a first/last day pair can't be saved, or null when it can.
export function validateEventDates(
  start: string | null | undefined,
  end: string | null | undefined,
): string | null {
  if (!isIsoDate(start)) return "Choose the event's first day.";
  if (end === null || end === undefined || end === "") return null;
  if (!isIsoDate(end)) return "Choose a valid last day.";
  if (end < start) return "The last day can't be before the first day.";
  if (daysBetween(start, end) + 1 > MAX_EVENT_DAYS) {
    return `An event can run at most ${MAX_EVENT_DAYS} days.`;
  }
  return null;
}

// When GHL's Date of Interest moves, a multi-day event keeps its length.
export function shiftedEventEnd(
  previousStart: string | null | undefined,
  previousEnd: string | null | undefined,
  nextStart: string,
): string | null {
  const first = toIsoDate(previousStart);
  const last = normalizeEventEnd(first, previousEnd);
  if (!first || !last) return null;
  return addDays(nextStart, daysBetween(first, last));
}

const dateFormatters = new Map<string, Intl.DateTimeFormat>();

function formatDay(day: string, options: Intl.DateTimeFormatOptions): string {
  const key = JSON.stringify(options);
  let formatter = dateFormatters.get(key);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { ...options, timeZone: "UTC" });
    dateFormatters.set(key, formatter);
  }
  return formatter.format(new Date(dayToUtcMs(day)));
}

// "October 12, 2026", "October 12–14, 2026", "October 30 – November 1, 2026",
// "December 30, 2026 – January 2, 2027". Empty without a start date.
export function formatEventDates(
  start: string | null | undefined,
  end: string | null | undefined,
): string {
  const first = toIsoDate(start);
  if (!first) return "";
  const full = (day: string) =>
    formatDay(day, { month: "long", day: "numeric", year: "numeric" });
  const last = normalizeEventEnd(first, end);
  if (!last) return full(first);

  const sameYear = first.slice(0, 4) === last.slice(0, 4);
  const sameMonth = sameYear && first.slice(5, 7) === last.slice(5, 7);
  if (sameMonth) {
    return `${formatDay(first, { month: "long", day: "numeric" })}–${Number(
      last.slice(8, 10),
    )}, ${last.slice(0, 4)}`;
  }
  if (sameYear) {
    return `${formatDay(first, { month: "long", day: "numeric" })} – ${full(last)}`;
  }
  return `${full(first)} – ${full(last)}`;
}

// "Fri, Oct 12"
export function formatDayLabel(day: string): string {
  return formatDay(day, { weekday: "short", month: "short", day: "numeric" });
}

// "Fri, Oct 12, 2026"
export function formatDayLabelWithYear(day: string): string {
  return formatDay(day, {
    weekday: "short",
    month: "short",
    day: "numeric",
    year: "numeric",
  });
}

export type EventDayOption = {
  day: string;
  // 1-based position in the event.
  number: number;
  // "Day 2 · Sat, Oct 13" for multi-day events, "Fri, Oct 12" otherwise.
  label: string;
};

export function eventDayOptions(
  start: string | null | undefined,
  end: string | null | undefined,
): EventDayOption[] {
  const days = eventDayList(start, end);
  return days.map((day, index) => ({
    day,
    number: index + 1,
    label:
      days.length > 1
        ? `Day ${index + 1} · ${formatDayLabel(day)}`
        : formatDayLabel(day),
  }));
}

// --- Venue wall-clock time -------------------------------------------------

type WallClock = {
  year: number;
  month: number;
  day: number;
  hour: number;
  minute: number;
  second: number;
};

const partFormatters = new Map<string, Intl.DateTimeFormat>();

function wallClock(ms: number, timeZone: string): WallClock {
  let formatter = partFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", {
      timeZone,
      hourCycle: "h23",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      minute: "2-digit",
      second: "2-digit",
    });
    partFormatters.set(timeZone, formatter);
  }
  const parts: Record<string, number> = {};
  for (const part of formatter.formatToParts(new Date(ms))) {
    if (part.type !== "literal") parts[part.type] = Number(part.value);
  }
  return {
    year: parts.year,
    month: parts.month,
    day: parts.day,
    hour: parts.hour % 24,
    minute: parts.minute,
    second: parts.second,
  };
}

// Offset of the zone from UTC at an instant, in ms (negative west of UTC).
function zoneOffsetMs(ms: number, timeZone: string): number {
  const wall = wallClock(ms, timeZone);
  const wholeSeconds = Math.floor(ms / 1000) * 1000;
  return (
    Date.UTC(wall.year, wall.month - 1, wall.day, wall.hour, wall.minute, wall.second) -
    wholeSeconds
  );
}

function pad(value: number): string {
  return String(value).padStart(2, "0");
}

// The venue-local day (yyyy-MM-dd) an instant falls on.
export function venueDay(
  instant: string | number | Date,
  timeZone: string = VENUE_TIME_ZONE,
): string {
  const wall = wallClock(new Date(instant).getTime(), timeZone);
  return `${wall.year}-${pad(wall.month)}-${pad(wall.day)}`;
}

// The instant a venue wall-clock time on `day` happens.
function wallTimeToInstant(
  day: string,
  time: { hour: number; minute: number; second?: number; ms?: number },
  timeZone: string,
): string {
  const wallAsUtc = Date.UTC(
    Number(day.slice(0, 4)),
    Number(day.slice(5, 7)) - 1,
    Number(day.slice(8, 10)),
    time.hour,
    time.minute,
    time.second ?? 0,
    time.ms ?? 0,
  );
  // Two passes: the offset at the first guess can differ from the offset at
  // the answer when the day is a daylight-saving change.
  const guess = wallAsUtc - zoneOffsetMs(wallAsUtc, timeZone);
  return new Date(wallAsUtc - zoneOffsetMs(guess, timeZone)).toISOString();
}

// The same venue wall-clock time as `instant`, on `day`.
export function moveInstantToDay(
  instant: string,
  day: string,
  timeZone: string = VENUE_TIME_ZONE,
): string {
  const ms = new Date(instant).getTime();
  const wall = wallClock(ms, timeZone);
  return wallTimeToInstant(
    day,
    { hour: wall.hour, minute: wall.minute, second: wall.second, ms: ms % 1000 },
    timeZone,
  );
}

const HH_MM = /^([01]\d|2[0-3]):([0-5]\d)$/;

export function isVenueTime(value: unknown): value is string {
  return typeof value === "string" && HH_MM.test(value);
}

// The instant of an "HH:mm" venue time on `day` ("09:00" on 2026-10-12 is
// 13:00Z in daylight time, 14:00Z in standard time).
export function venueInstant(
  day: string,
  time: string,
  timeZone: string = VENUE_TIME_ZONE,
): string {
  return wallTimeToInstant(
    day,
    { hour: Number(time.slice(0, 2)), minute: Number(time.slice(3, 5)) },
    timeZone,
  );
}

// "HH:mm" of an instant at the venue.
export function venueTime(
  instant: string,
  timeZone: string = VENUE_TIME_ZONE,
): string {
  const wall = wallClock(new Date(instant).getTime(), timeZone);
  return `${pad(wall.hour)}:${pad(wall.minute)}`;
}

// A reservation moved to `day`: the start lands on that day at its current
// local time; the end moves by the same number of days (so a booking past
// midnight still ends the next morning).
export function moveSlotToDay(
  slot: { start: string; end: string },
  day: string,
  timeZone: string = VENUE_TIME_ZONE,
): { start: string; end: string } {
  const shift = daysBetween(venueDay(slot.start, timeZone), day);
  return {
    start: moveInstantToDay(slot.start, day, timeZone),
    end: moveInstantToDay(
      slot.end,
      addDays(venueDay(slot.end, timeZone), shift),
      timeZone,
    ),
  };
}

const timeFormatters = new Map<string, Intl.DateTimeFormat>();

// "9:00 AM" at the venue, whatever zone the server or browser is in.
export function formatVenueTime(
  instant: string,
  timeZone: string = VENUE_TIME_ZONE,
): string {
  let formatter = timeFormatters.get(timeZone);
  if (!formatter) {
    formatter = new Intl.DateTimeFormat("en-US", { timeZone, timeStyle: "short" });
    timeFormatters.set(timeZone, formatter);
  }
  return formatter.format(new Date(instant));
}

// "9:00 AM – 10:00 AM", or with the end's day when it finishes on a later
// day: "9:00 PM – Sat, Oct 13, 1:00 AM".
export function formatVenueTimeRange(
  start: string,
  end: string,
  timeZone: string = VENUE_TIME_ZONE,
): string {
  const endDay = venueDay(end, timeZone);
  const endLabel =
    endDay === venueDay(start, timeZone)
      ? formatVenueTime(end, timeZone)
      : `${formatDayLabel(endDay)}, ${formatVenueTime(end, timeZone)}`;
  return `${formatVenueTime(start, timeZone)} – ${endLabel}`;
}

// --- Moving an event's rooms -----------------------------------------------

export type RoomSlot = {
  id: string;
  roomId: string;
  start: string;
  end: string;
};

export function slotsOverlap(
  a: { start: string; end: string },
  b: { start: string; end: string },
): boolean {
  return (
    Date.parse(a.start) < Date.parse(b.end) &&
    Date.parse(b.start) < Date.parse(a.end)
  );
}

// First reservation in `occupied` holding the same room at an overlapping
// time (the slot itself excluded).
export function findRoomConflict<T extends RoomSlot>(
  slot: RoomSlot,
  occupied: T[],
): T | undefined {
  return occupied.find(
    (other) =>
      other.id !== slot.id &&
      other.roomId === slot.roomId &&
      slotsOverlap(slot, other),
  );
}

export type DefaultRoomMove =
  // Move to this day (the reservation's own day when nothing changes).
  | { kind: "move"; day: string }
  // Wasn't on an event day before the change; left where it is.
  | { kind: "off-event" }
  // Sat on a day the new dates no longer include (day `dayNumber`).
  | { kind: "dropped"; dayNumber: number };

// Where each reservation goes by default when the event's dates change: a
// room on day N of the old dates goes to day N of the new ones, at the same
// times. When none of the rooms sit on the current dates (the date was
// changed in GHL, so the stored dates are already the new ones), the rooms'
// own first day stands in for the old first day, which lines them up with
// the event again.
export function defaultRoomMoves(input: {
  currentStart: string | null;
  currentEnd: string | null;
  newStart: string;
  newEnd: string | null;
  reservations: { id: string; start: string }[];
  timeZone?: string;
}): Map<string, DefaultRoomMove> {
  const timeZone = input.timeZone ?? VENUE_TIME_ZONE;
  const days = new Map(
    input.reservations.map((reservation) => [
      reservation.id,
      venueDay(reservation.start, timeZone),
    ]),
  );
  const moves = new Map<string, DefaultRoomMove>();
  if (days.size === 0) return moves;

  const sorted = [...days.values()].sort();
  const onCurrentDates = sorted.some((day) =>
    isEventDay(day, input.currentStart, input.currentEnd),
  );
  const oldFirst = onCurrentDates
    ? (toIsoDate(input.currentStart) as string)
    : sorted[0];
  const oldLast = onCurrentDates
    ? (normalizeEventEnd(oldFirst, input.currentEnd) ?? oldFirst)
    : sorted[sorted.length - 1];

  for (const [id, day] of days) {
    if (day < oldFirst || day > oldLast) {
      moves.set(id, { kind: "off-event" });
      continue;
    }
    const offset = daysBetween(oldFirst, day);
    const target = addDays(input.newStart, offset);
    moves.set(
      id,
      isEventDay(target, input.newStart, input.newEnd)
        ? { kind: "move", day: target }
        : { kind: "dropped", dayNumber: offset + 1 },
    );
  }
  return moves;
}

// Order to apply room moves one at a time without a move bumping into
// another of the same event's reservations that hasn't moved yet (e.g. a
// multi-day event holding Room A every day, shifted by a day). A move waits
// while its target overlaps another pending move's current slot in the same
// room. Moves stuck waiting on each other (two rooms swapped) come back as
// blocked.
export function orderRoomMoves(
  moves: RoomSlot[],
  current: RoomSlot[],
): { order: string[]; blocked: string[] } {
  const currentById = new Map(current.map((slot) => [slot.id, slot]));
  const pending = new Map(moves.map((move) => [move.id, move]));
  const order: string[] = [];

  let progressed = true;
  while (pending.size > 0 && progressed) {
    progressed = false;
    for (const move of [...pending.values()]) {
      const waiting = [...pending.values()].some((other) => {
        if (other.id === move.id) return false;
        const occupying = currentById.get(other.id);
        return (
          occupying !== undefined &&
          occupying.roomId === move.roomId &&
          slotsOverlap(occupying, move)
        );
      });
      if (!waiting) {
        order.push(move.id);
        pending.delete(move.id);
        progressed = true;
      }
    }
  }

  return { order, blocked: [...pending.keys()] };
}
