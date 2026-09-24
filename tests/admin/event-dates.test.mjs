import assert from "node:assert/strict";
import test from "node:test";

import {
  addDays,
  daysBetween,
  defaultRoomMoves,
  eventDayList,
  eventDayOptions,
  findRoomConflict,
  formatEventDates,
  formatVenueTimeRange,
  isEventDay,
  isVenueTime,
  moveInstantToDay,
  moveSlotToDay,
  normalizeEventEnd,
  orderRoomMoves,
  shiftedEventEnd,
  toIsoDate,
  validateEventDates,
  venueDay,
  venueInstant,
  venueTime,
} from "../../src/lib/dates/event-dates.ts";

// 9:00–10:00 AM Eastern on a given day (EDT until Nov 1, 2026; EST after).
const edt = (day, hour = 9) =>
  `${day}T${String(hour + 4).padStart(2, "0")}:00:00.000Z`;
const est = (day, hour = 9) =>
  `${day}T${String(hour + 5).padStart(2, "0")}:00:00.000Z`;

test("date helpers do calendar math on yyyy-MM-dd strings", () => {
  assert.equal(addDays("2026-10-30", 3), "2026-11-02");
  assert.equal(addDays("2026-03-01", -1), "2026-02-28");
  assert.equal(daysBetween("2026-10-04", "2026-10-11"), 7);
  assert.equal(daysBetween("2026-10-11", "2026-10-04"), -7);
  assert.equal(toIsoDate("2026-10-04T00:00:00Z"), "2026-10-04");
  assert.equal(toIsoDate("2026-02-30"), null);
  assert.equal(toIsoDate(null), null);
});

test("a last day on or before the first day means a one-day event", () => {
  assert.equal(normalizeEventEnd("2026-10-12", "2026-10-14"), "2026-10-14");
  assert.equal(normalizeEventEnd("2026-10-12", "2026-10-12"), null);
  assert.equal(normalizeEventEnd("2026-10-12", "2026-10-11"), null);
  assert.equal(normalizeEventEnd(null, "2026-10-14"), null);
  assert.deepEqual(eventDayList("2026-10-30", "2026-11-01"), [
    "2026-10-30",
    "2026-10-31",
    "2026-11-01",
  ]);
  assert.deepEqual(eventDayList("2026-10-12", null), ["2026-10-12"]);
  assert.deepEqual(eventDayList(null, null), []);
  assert.equal(isEventDay("2026-10-13", "2026-10-12", "2026-10-14"), true);
  assert.equal(isEventDay("2026-10-15", "2026-10-12", "2026-10-14"), false);
  assert.equal(isEventDay("2026-10-12", "2026-10-12", null), true);
});

test("validation explains what's wrong with a date pair", () => {
  assert.equal(validateEventDates("2026-10-12", null), null);
  assert.equal(validateEventDates("2026-10-12", ""), null);
  assert.equal(validateEventDates("2026-10-12", "2026-10-14"), null);
  assert.match(validateEventDates("", null), /first day/);
  assert.match(validateEventDates("2026-10-12", "2026-10-11"), /before the first/);
  assert.match(validateEventDates("2026-10-12", "2027-10-12"), /at most 31 days/);
});

test("date ranges read naturally", () => {
  assert.equal(formatEventDates("2026-10-12", null), "October 12, 2026");
  assert.equal(formatEventDates("2026-10-12", "2026-10-12"), "October 12, 2026");
  assert.equal(formatEventDates("2026-10-12", "2026-10-14"), "October 12–14, 2026");
  assert.equal(
    formatEventDates("2026-10-30", "2026-11-01"),
    "October 30 – November 1, 2026",
  );
  assert.equal(
    formatEventDates("2026-12-30", "2027-01-02"),
    "December 30, 2026 – January 2, 2027",
  );
  assert.equal(formatEventDates(null, null), "");
});

test("day options number the days of a multi-day event", () => {
  assert.deepEqual(
    eventDayOptions("2026-10-16", "2026-10-17").map((option) => option.label),
    ["Day 1 · Fri, Oct 16", "Day 2 · Sat, Oct 17"],
  );
  assert.deepEqual(
    eventDayOptions("2026-10-16", null).map((option) => option.label),
    ["Fri, Oct 16"],
  );
});

test("a GHL date change keeps a multi-day event's length", () => {
  assert.equal(shiftedEventEnd("2026-10-12", "2026-10-14", "2026-10-19"), "2026-10-21");
  assert.equal(shiftedEventEnd("2026-10-12", null, "2026-10-19"), null);
});

test("venue times stay put across daylight saving and server time zones", () => {
  // 9 PM EDT on Oct 4 is already Oct 5 in UTC.
  assert.equal(venueDay("2026-10-05T01:00:00.000Z"), "2026-10-04");
  // 9:00 AM EDT moved a week later across the Nov 1 change is 9:00 AM EST.
  assert.equal(moveInstantToDay(edt("2026-10-30"), "2026-11-06"), est("2026-11-06"));
  assert.equal(moveInstantToDay(est("2026-11-06"), "2026-10-30"), edt("2026-10-30"));
  assert.deepEqual(
    moveSlotToDay({ start: edt("2026-10-04"), end: edt("2026-10-04", 10) }, "2026-10-11"),
    { start: edt("2026-10-11"), end: edt("2026-10-11", 10) },
  );
  // A booking past midnight still ends the next morning.
  assert.deepEqual(
    moveSlotToDay(
      { start: "2026-10-10T01:00:00.000Z", end: "2026-10-10T05:00:00.000Z" },
      "2026-10-16",
    ),
    { start: "2026-10-17T01:00:00.000Z", end: "2026-10-17T05:00:00.000Z" },
  );
  assert.equal(
    formatVenueTimeRange("2026-10-10T01:00:00.000Z", "2026-10-10T05:00:00.000Z"),
    "9:00 PM – Sat, Oct 10, 1:00 AM",
  );
});

test("venue wall-clock times convert both ways in either season", () => {
  assert.equal(venueInstant("2026-10-12", "09:00"), edt("2026-10-12"));
  assert.equal(venueInstant("2026-11-06", "09:00"), est("2026-11-06"));
  assert.equal(venueInstant("2026-10-12", "23:45"), "2026-10-13T03:45:00.000Z");
  assert.equal(venueTime(edt("2026-10-12", 13)), "13:00");
  assert.equal(venueTime("2026-10-13T03:45:00.000Z"), "23:45");
  assert.equal(isVenueTime("09:15"), true);
  assert.equal(isVenueTime("9:15"), false);
  assert.equal(isVenueTime("24:00"), false);
});

test("rooms follow their day of the event to the new dates", () => {
  const moves = defaultRoomMoves({
    currentStart: "2026-10-12",
    currentEnd: "2026-10-14",
    newStart: "2026-10-19",
    newEnd: "2026-10-20",
    reservations: [
      { id: "day1", start: edt("2026-10-12") },
      { id: "day2", start: edt("2026-10-13", 13) },
      { id: "day3", start: edt("2026-10-14") },
      { id: "setup", start: edt("2026-10-11") },
    ],
  });
  assert.deepEqual(moves.get("day1"), { kind: "move", day: "2026-10-19" });
  assert.deepEqual(moves.get("day2"), { kind: "move", day: "2026-10-20" });
  assert.deepEqual(moves.get("day3"), { kind: "dropped", dayNumber: 3 });
  assert.deepEqual(moves.get("setup"), { kind: "off-event" });
});

test("rooms left behind by a GHL date change line up with the new dates", () => {
  // The stored date already says Oct 11; the rooms are still on Oct 4.
  const moves = defaultRoomMoves({
    currentStart: "2026-10-11",
    currentEnd: null,
    newStart: "2026-10-11",
    newEnd: null,
    reservations: [
      { id: "a", start: edt("2026-10-04") },
      { id: "b", start: edt("2026-10-04", 13) },
    ],
  });
  assert.deepEqual(moves.get("a"), { kind: "move", day: "2026-10-11" });
  assert.deepEqual(moves.get("b"), { kind: "move", day: "2026-10-11" });
});

test("an event with no date yet moves its rooms from their own first day", () => {
  const moves = defaultRoomMoves({
    currentStart: null,
    currentEnd: null,
    newStart: "2026-11-01",
    newEnd: "2026-11-02",
    reservations: [
      { id: "a", start: edt("2026-10-20") },
      { id: "b", start: edt("2026-10-21") },
    ],
  });
  assert.deepEqual(moves.get("a"), { kind: "move", day: "2026-11-01" });
  assert.deepEqual(moves.get("b"), { kind: "move", day: "2026-11-02" });
});

test("conflicts are the same room at an overlapping time", () => {
  const slot = { id: "x", roomId: "r1", start: edt("2026-10-11"), end: edt("2026-10-11", 10) };
  const occupied = [
    { id: "x", roomId: "r1", start: slot.start, end: slot.end },
    { id: "other-room", roomId: "r2", start: slot.start, end: slot.end },
    // Touching end-to-start is not a conflict; DB timestamps come back as +00:00.
    { id: "before", roomId: "r1", start: "2026-10-11T12:00:00+00:00", end: "2026-10-11T13:00:00+00:00" },
  ];
  assert.equal(findRoomConflict(slot, occupied), undefined);
  const blocking = { id: "b", roomId: "r1", start: edt("2026-10-11", 9), end: edt("2026-10-11", 11) };
  assert.equal(findRoomConflict(slot, [...occupied, blocking]), blocking);
});

test("moves run in an order that never bumps the event's own rooms", () => {
  // Room A held three days running, shifted a day later.
  const current = ["2026-10-12", "2026-10-13", "2026-10-14"].map((day, index) => ({
    id: `d${index + 1}`,
    roomId: "A",
    start: edt(day),
    end: edt(day, 10),
  }));
  const later = current.map((slot) => ({
    ...slot,
    start: edt(addDays(venueDay(slot.start), 1)),
    end: edt(addDays(venueDay(slot.start), 1), 10),
  }));
  assert.deepEqual(orderRoomMoves(later, current), { order: ["d3", "d2", "d1"], blocked: [] });

  const earlier = current.map((slot) => ({
    ...slot,
    start: edt(addDays(venueDay(slot.start), -1)),
    end: edt(addDays(venueDay(slot.start), -1), 10),
  }));
  assert.deepEqual(orderRoomMoves(earlier, current), { order: ["d1", "d2", "d3"], blocked: [] });
});

test("two rooms swapped into each other's slots are reported as blocked", () => {
  const current = [
    { id: "a", roomId: "A", start: edt("2026-10-12"), end: edt("2026-10-12", 10) },
    { id: "b", roomId: "B", start: edt("2026-10-12"), end: edt("2026-10-12", 10) },
  ];
  const swapped = [
    { ...current[0], roomId: "B" },
    { ...current[1], roomId: "A" },
  ];
  assert.deepEqual(orderRoomMoves(swapped, current), { order: [], blocked: ["a", "b"] });
});
