import { recomputeChecklistDueDates } from "@/lib/admin/checklist-templates";
import { mergeEventSnapshot, parseGhlSnapshot } from "@/lib/admin/events";
import {
  addEventReservation,
  listEventReservations,
  listRooms,
  moveEventReservation,
  releaseEventReservation,
  type ReservationConflict,
} from "@/lib/admin/room-calendar";
import {
  formatDayLabel,
  formatEventDates,
  formatVenueTimeRange,
  isIsoDate,
  isVenueTime,
  moveSlotToDay,
  normalizeEventEnd,
  orderRoomMoves,
  toIsoDate,
  validateEventDates,
  venueDay,
  venueInstant,
  type RoomSlot,
} from "@/lib/dates/event-dates";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";
import { writeOpportunityEventDate } from "@/lib/ghl/opportunity-sync";
import { triggerPlanningStageForEvent } from "@/lib/ghl/planning-trigger";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database, Json } from "@/types/database";

type EventRow = Database["public"]["Tables"]["events"]["Row"];

// What the dates dialog decided for one of the event's rooms. Rooms not
// listed stay where they are.
export type RoomChange =
  // Same times, on `day`, in `roomId` (its own room unless a coordinator
  // picked another to get around a conflict).
  | { reservationId: string; action: "move"; day: string; roomId: string }
  // Delete the reservation.
  | { reservationId: string; action: "release" };

// A room the dialog adds, held for the event: venue wall-clock times
// ("HH:mm") on one day.
export type NewRoom = {
  day: string;
  roomId: string;
  startTime: string;
  endTime: string;
};

export type ChangeEventDatesInput = {
  eventId: string;
  startDate: string;
  // Last day of a multi-day event; null or the first day for one day.
  endDate: string | null;
  roomChanges: RoomChange[];
  newRooms: NewRoom[];
  changedBy: string | null;
};

export type RoomChangeFailure = {
  // The reservation id, or "new-<n>" for an added room.
  key: string;
  room: string;
  reason: string;
};

export type ChangeEventDatesOutcome =
  | {
      ok: true;
      datesChanged: boolean;
      // "skipped": no linked opportunity (or GHL not set up), so the date
      // lives in the app only.
      ghl: "written" | "skipped" | "unchanged";
      moved: number;
      released: number;
      added: number;
      failed: RoomChangeFailure[];
      checklistDueDatesChanged: number;
    }
  | { ok: false; error: string };

// Changes an event's first/last day and applies the dialog's room decisions.
// Order matters:
//   1. The first day goes to GHL's Date of Interest. GHL is the system of
//      record and every page load re-reads it, so a failed write stops
//      everything (like coordinator reassignment) instead of being undone
//      by the next sync.
//   2. The snapshot takes the new dates; checklist due dates follow.
//   3. Rooms: releases first (they free slots), then moves one at a time in
//      an order that never bumps the event's own not-yet-moved rooms, then
//      added rooms (held), so they're checked against where the others
//      ended up. A taken slot is reported, not forced; the rest still go
//      ahead, and the room page flags anything left off the event's days.
export async function changeEventDates(
  input: ChangeEventDatesInput,
): Promise<ChangeEventDatesOutcome> {
  const startDate = input.startDate.trim();
  const endInput = input.endDate?.trim() || null;
  const invalid = validateEventDates(startDate, endInput);
  if (invalid) return { ok: false, error: invalid };
  const endDate = normalizeEventEnd(startDate, endInput);

  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("events")
    .select("*")
    .eq("id", input.eventId)
    .maybeSingle();
  if (error) throw new Error(`Unable to load event: ${error.message}`);
  if (!data) return { ok: false, error: "Event not found." };

  const event = data as EventRow;
  const snapshot = parseGhlSnapshot(event.ghl_snapshot);
  const currentStart = toIsoDate(snapshot.eventDate);
  const currentEnd = normalizeEventEnd(currentStart, snapshot.eventEndDate);
  const startChanged = startDate !== currentStart;
  const datesChanged = startChanged || endDate !== currentEnd;
  if (
    !datesChanged &&
    input.roomChanges.length === 0 &&
    input.newRooms.length === 0
  ) {
    return {
      ok: true,
      datesChanged,
      ghl: "unchanged",
      moved: 0,
      released: 0,
      added: 0,
      failed: [],
      checklistDueDatesChanged: 0,
    };
  }

  const [reservations, rooms] = await Promise.all([
    listEventReservations(input.eventId),
    listRooms(),
  ]);
  const reservationsById = new Map(reservations.map((r) => [r.id, r]));
  const roomIds = new Set(rooms.map((room) => room.id));

  for (const change of input.roomChanges) {
    const reservation = reservationsById.get(change.reservationId);
    if (!reservation) {
      return {
        ok: false,
        error:
          "A room on this event changed while you were editing. Close the dialog, reload the page, and try again.",
      };
    }
    if (change.action === "move") {
      if (!isIsoDate(change.day)) {
        return { ok: false, error: "Choose a day for every room that moves." };
      }
      // A room taken off the calendar can still keep its own bookings.
      if (!roomIds.has(change.roomId) && change.roomId !== reservation.room_id) {
        return { ok: false, error: "One of the chosen rooms no longer exists." };
      }
    }
  }
  for (const room of input.newRooms) {
    if (!isIsoDate(room.day)) {
      return { ok: false, error: "Choose a day for every room you add." };
    }
    if (!roomIds.has(room.roomId)) {
      return { ok: false, error: "One of the chosen rooms no longer exists." };
    }
    if (
      !isVenueTime(room.startTime) ||
      !isVenueTime(room.endTime) ||
      room.endTime <= room.startTime
    ) {
      return {
        ok: false,
        error: "Every added room needs an end time after its start time.",
      };
    }
  }

  let ghl: "written" | "skipped" | "unchanged" = "unchanged";
  if (startChanged) {
    const outcome = await writeOpportunityEventDate(event, startDate);
    if (!outcome.ok && !outcome.skipped) {
      return {
        ok: false,
        error: `GoHighLevel didn't take the new date, so nothing was changed. ${outcome.error}`,
      };
    }
    ghl = outcome.ok ? "written" : "skipped";
  }

  if (datesChanged) {
    await mergeEventSnapshot(input.eventId, {
      eventDate: startDate,
      eventEndDate: endDate,
    });
  }

  let checklistDueDatesChanged = 0;
  if (startChanged) {
    try {
      checklistDueDatesChanged = await recomputeChecklistDueDates(
        input.eventId,
        startDate,
      );
    } catch (dueDateError) {
      console.error("Failed moving checklist due dates", dueDateError);
    }
  }

  const roomName = (reservationId: string) =>
    reservationsById.get(reservationId)?.rooms?.name ?? "A room";
  const failed: RoomChangeFailure[] = [];

  let released = 0;
  const releasedIds = new Set<string>();
  for (const change of input.roomChanges) {
    if (change.action !== "release") continue;
    try {
      await releaseEventReservation({
        eventId: input.eventId,
        reservationId: change.reservationId,
      });
      released += 1;
      releasedIds.add(change.reservationId);
    } catch (releaseError) {
      failed.push({
        key: change.reservationId,
        room: roomName(change.reservationId),
        reason: `Couldn't release it: ${errorMessage(releaseError)}`,
      });
    }
  }

  const currentSlots: RoomSlot[] = reservations
    .filter((reservation) => !releasedIds.has(reservation.id))
    .map((reservation) => ({
      id: reservation.id,
      roomId: reservation.room_id,
      start: reservation.start_datetime,
      end: reservation.end_datetime,
    }));
  const currentById = new Map(currentSlots.map((slot) => [slot.id, slot]));
  const targets: RoomSlot[] = [];
  for (const change of input.roomChanges) {
    if (change.action !== "move") continue;
    const current = currentById.get(change.reservationId);
    if (!current) continue;
    const target = { id: current.id, roomId: change.roomId, ...moveSlotToDay(current, change.day) };
    const unchanged =
      target.roomId === current.roomId &&
      Date.parse(target.start) === Date.parse(current.start) &&
      Date.parse(target.end) === Date.parse(current.end);
    if (!unchanged) targets.push(target);
  }

  const { order, blocked } = orderRoomMoves(targets, currentSlots);
  const targetById = new Map(targets.map((target) => [target.id, target]));
  let moved = 0;
  for (const id of order) {
    const target = targetById.get(id) as RoomSlot;
    let result: Awaited<ReturnType<typeof moveEventReservation>>;
    try {
      result = await moveEventReservation({
        eventId: input.eventId,
        reservationId: id,
        roomId: target.roomId,
        start: target.start,
        end: target.end,
      });
    } catch (moveError) {
      failed.push({
        key: id,
        room: roomName(id),
        reason: `Couldn't move it: ${errorMessage(moveError)}`,
      });
      continue;
    }
    if (result.ok) {
      moved += 1;
      continue;
    }
    const where = `${formatDayLabel(venueDay(target.start))}, ${formatVenueTimeRange(
      target.start,
      target.end,
    )}`;
    failed.push({
      key: id,
      room: roomName(id),
      reason: result.conflict
        ? `${takenBy(result.conflict)}; it stayed where it was instead of moving to ${where}.`
        : `The room was booked for ${where} a moment ago; it stayed where it was.`,
    });
  }
  for (const id of blocked) {
    failed.push({
      key: id,
      room: roomName(id),
      reason:
        "It trades places with another of this event's rooms; it stayed where it was. Move one of them on the room calendar first.",
    });
  }

  const roomsById = new Map(rooms.map((room) => [room.id, room.name]));
  let added = 0;
  for (const [index, room] of input.newRooms.entries()) {
    const start = venueInstant(room.day, room.startTime);
    const end = venueInstant(room.day, room.endTime);
    const where = `${formatDayLabel(room.day)}, ${formatVenueTimeRange(start, end)}`;
    const failure = (reason: string) =>
      failed.push({
        key: `new-${index}`,
        room: roomsById.get(room.roomId) ?? "A room",
        reason,
      });
    try {
      const result = await addEventReservation({
        eventId: input.eventId,
        roomId: room.roomId,
        title: snapshot.eventName || "Untitled event",
        coordinatorName: snapshot.planner?.name ?? null,
        start,
        end,
        createdBy: input.changedBy,
      });
      if (result.ok) {
        added += 1;
      } else {
        failure(
          result.conflict
            ? `${takenBy(result.conflict)}, so it wasn't added for ${where}.`
            : `The room was booked for ${where} a moment ago, so it wasn't added.`,
        );
      }
    } catch (addError) {
      failure(`Couldn't add it for ${where}: ${errorMessage(addError)}`);
    }
  }
  // An event's first rooms move its GHL opportunity to Planning, the same
  // as Add room and the room calendar.
  if (reservations.length === 0 && added > 0) {
    await triggerPlanningStageForEvent(input.eventId);
  }

  const roomSummary = [
    `${moved} room${moved === 1 ? "" : "s"} moved`,
    `${released} released`,
    `${added} added`,
    ...(failed.length > 0 ? [`${failed.length} not changed`] : []),
  ].join(", ");
  const details: Record<string, Json> = {
    ghl_opportunity_id: event.ghl_opportunity_id,
    from: { start: currentStart, end: currentEnd },
    to: { start: startDate, end: endDate },
    ghl,
    moved,
    released,
    added,
    failed: failed.map((failure) => ({ room: failure.room, reason: failure.reason })),
    checklist_due_dates_changed: checklistDueDatesChanged,
    changed_by: input.changedBy,
  };
  await logIntegrationEvent({
    direction: "PORTAL_TO_GHL",
    eventType: "event_dates_change",
    ghlLocationId: event.ghl_location_id,
    portalEventId: event.id,
    status: failed.length > 0 ? "warning" : "success",
    message: datesChanged
      ? `Event dates changed from ${formatEventDates(currentStart, currentEnd) || "not set"} to ${formatEventDates(startDate, endDate)}; ${roomSummary}.`
      : `Event rooms updated: ${roomSummary}.`,
    details,
  });

  return {
    ok: true,
    datesChanged,
    ghl,
    moved,
    released,
    added,
    failed,
    checklistDueDatesChanged,
  };
}

// "The room is taken 9:00 AM – 11:00 AM by Jones Wedding (booked)"
function takenBy(conflict: ReservationConflict): string {
  return `The room is taken ${formatVenueTimeRange(conflict.start, conflict.end)} by ${conflict.title} (${conflict.status})`;
}

// Supabase errors are plain objects with a message, not Error instances.
function errorMessage(error: unknown): string {
  if (error instanceof Error) return error.message;
  if (error && typeof error === "object" && "message" in error) {
    return String((error as { message: unknown }).message);
  }
  return String(error);
}
