"use client";

import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { createPortal } from "react-dom";
import { useRouter } from "next/navigation";

import { TimeSelect } from "@/components/admin/event-room-bookings";
import { Icon } from "@/components/ui/icon";
import { StatusBadge } from "@/components/ui/status-badge";
import { buttonClasses } from "@/components/ui/button";
import type {
  ChangeEventDatesOutcome,
  RoomChange,
} from "@/lib/admin/event-dates";
import {
  addDays,
  daysBetween,
  defaultRoomMoves,
  eventDayOptions,
  findRoomConflict,
  formatDayLabel,
  formatDayLabelWithYear,
  formatEventDates,
  formatVenueTimeRange,
  isIsoDate,
  moveSlotToDay,
  normalizeEventEnd,
  slotsOverlap,
  validateEventDates,
  venueDay,
  venueInstant,
  venueTime,
  type DefaultRoomMove,
  type RoomSlot,
} from "@/lib/dates/event-dates";

import { changeEventDatesAction, type ChangeEventDatesFormInput } from "./actions";

// Change an event's first/last day, decide where each of its rooms goes, and
// hold more rooms (the new days of a multi-day event, usually). Opened from
// the date in the page header, the Event summary, and the room bookings
// warning when rooms sit off the event's days. The server re-checks every
// conflict; the calendar read here is so coordinators see them first.

export type EventDatesReservation = {
  id: string;
  roomId: string;
  roomName: string;
  roomColor: string;
  status: "held" | "booked";
  start: string;
  end: string;
};

export type EventDatesRoom = { id: string; name: string; color: string };

type EventDatesProps = {
  eventId: string;
  startDate: string | null;
  endDate: string | null;
  reservations: EventDatesReservation[];
  rooms: EventDatesRoom[];
  // Contracts already out with the old date on them.
  contracts: { unsigned: number; signed: number };
  linkedToGhl: boolean;
};

type Trigger = "header" | "summary" | "rooms";

export function EventDatesControl({
  trigger,
  ...props
}: EventDatesProps & { trigger: Trigger }) {
  const [open, setOpen] = useState(false);
  const label = formatEventDates(props.startDate, props.endDate);

  return (
    <>
      {trigger === "header" ? (
        <button
          className="inline-flex items-center gap-1.5 rounded-sm underline decoration-slate-300 decoration-dotted underline-offset-4 transition hover:text-slate-950 hover:decoration-slate-500"
          onClick={() => setOpen(true)}
          title="Change the event's dates"
          type="button"
        >
          {label || "No date set"}
          <Icon className="h-3.5 w-3.5 shrink-0">
            <path d="M21.174 6.812a1 1 0 0 0-3.986-3.987L3.842 16.174a2 2 0 0 0-.5.83l-1.321 4.352a.5.5 0 0 0 .623.622l4.353-1.32a2 2 0 0 0 .83-.497z" />
            <path d="m15 5 4 4" />
          </Icon>
        </button>
      ) : trigger === "summary" ? (
        <button
          className={buttonClasses("secondary", "sm")}
          onClick={() => setOpen(true)}
          type="button"
        >
          {label ? "Change dates" : "Set dates"}
        </button>
      ) : (
        <button
          className={buttonClasses("primary", "sm")}
          onClick={() => setOpen(true)}
          type="button"
        >
          Move rooms
        </button>
      )}
      {/* Portaled because the header trigger sits inside a <p>; into the
          admin theme scope so dark and forest themes still apply. */}
      {open
        ? createPortal(
            <EventDatesDialog {...props} onClose={() => setOpen(false)} />,
            document.querySelector("[data-theme]") ?? document.body,
          )
        : null}
    </>
  );
}

type Choice =
  | { kind: "move"; day: string; roomId: string }
  | { kind: "keep" }
  | { kind: "release" };

// A room the dialog will hold for the event: venue "HH:mm" times on a day.
type Addition = {
  key: string;
  day: string;
  roomId: string;
  startTime: string;
  endTime: string;
};

type CalendarReservation = {
  id: string;
  room_id: string;
  title: string;
  status: "held" | "booked";
  start_datetime: string;
  end_datetime: string;
};

type OccupiedSlot = RoomSlot & {
  title: string;
  status: "held" | "booked";
  // One of this event's own rooms, where it will end up.
  own: boolean;
};

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800";

function defaultChoice(
  reservation: EventDatesReservation,
  move: DefaultRoomMove | undefined,
): Choice {
  return move?.kind === "move"
    ? { kind: "move", day: move.day, roomId: reservation.roomId }
    : { kind: "keep" };
}

function EventDatesDialog({
  eventId,
  startDate: currentStart,
  endDate: currentEnd,
  reservations,
  rooms,
  contracts,
  linkedToGhl,
  onClose,
}: EventDatesProps & { onClose: () => void }) {
  const router = useRouter();
  const [pending, startTransition] = useTransition();

  const [start, setStart] = useState(currentStart ?? "");
  const [multiDay, setMultiDay] = useState(Boolean(currentEnd));
  const [end, setEnd] = useState(currentEnd ?? "");
  // Rows the coordinator set by hand; others follow the dates.
  const [manual, setManual] = useState<Record<string, Choice>>({});
  const [additions, setAdditions] = useState<Addition[]>([]);
  const nextAdditionKey = useRef(0);
  const [calendar, setCalendar] = useState<{
    key: string;
    list: CalendarReservation[] | null;
  } | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [result, setResult] = useState<
    Extract<ChangeEventDatesOutcome, { ok: true }> | null
  >(null);

  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape" && !pending) onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose, pending]);

  const dateError = validateEventDates(start, multiDay ? end : null);
  // While the dates are invalid the rooms keep showing the last valid plan.
  const newStart = dateError ? currentStart : start;
  const newEnd = dateError
    ? currentEnd
    : normalizeEventEnd(start, multiDay ? end : null);
  const dayOptions = useMemo(
    () => eventDayOptions(newStart, newEnd),
    [newStart, newEnd],
  );
  const eventDaySet = new Set(dayOptions.map((option) => option.day));

  const defaults = useMemo(
    () =>
      newStart
        ? defaultRoomMoves({
            currentStart,
            currentEnd,
            newStart,
            newEnd,
            reservations,
          })
        : new Map<string, DefaultRoomMove>(),
    [currentStart, currentEnd, newStart, newEnd, reservations],
  );

  const choiceFor = (reservation: EventDatesReservation): Choice => {
    const chosen = manual[reservation.id];
    // A hand-picked day the new dates dropped goes back to the default.
    if (chosen && (chosen.kind !== "move" || eventDaySet.has(chosen.day))) {
      return chosen;
    }
    return defaultChoice(reservation, defaults.get(reservation.id));
  };

  const rows = reservations.map((reservation) => {
    const choice = choiceFor(reservation);
    const target: RoomSlot | null =
      choice.kind === "move"
        ? {
            id: reservation.id,
            roomId: choice.roomId,
            ...moveSlotToDay(reservation, choice.day),
          }
        : null;
    const changed =
      choice.kind === "release" ||
      (target !== null &&
        (target.roomId !== reservation.roomId ||
          Date.parse(target.start) !== Date.parse(reservation.start)));
    return { reservation, choice, target, changed };
  });

  const additionRows = additions.map((addition) => {
    const validDay = eventDaySet.has(addition.day);
    const validTimes = addition.endTime > addition.startTime;
    const slot: RoomSlot | null =
      validDay && validTimes
        ? {
            id: addition.key,
            roomId: addition.roomId,
            start: venueInstant(addition.day, addition.startTime),
            end: venueInstant(addition.day, addition.endTime),
          }
        : null;
    return { addition, slot, validDay, validTimes };
  });
  const needsCalendar = reservations.length > 0 || additions.length > 0;

  // One calendar read covering the new days and where the rooms are now.
  const days = [
    ...dayOptions.map((option) => option.day),
    ...reservations.map((reservation) => venueDay(reservation.start)),
  ].sort();
  const windowKey =
    days.length > 0
      ? `${addDays(days[0], -1)}T00:00:00.000Z|${addDays(days[days.length - 1], 2)}T00:00:00.000Z`
      : "";

  useEffect(() => {
    if (!windowKey || !needsCalendar) return;
    let cancelled = false;
    const [from, to] = windowKey.split("|");
    (async () => {
      let list: CalendarReservation[] | null = null;
      try {
        const response = await fetch(
          `/api/calendar/reservations?${new URLSearchParams({ start: from, end: to })}`,
        );
        if (response.ok) list = (await response.json()) as CalendarReservation[];
      } catch {
        // Shown as "couldn't check"; the server still checks on save.
      }
      if (!cancelled) setCalendar({ key: windowKey, list });
    })();
    return () => {
      cancelled = true;
    };
  }, [windowKey, needsCalendar]);

  const calendarReady = calendar?.key === windowKey;
  const calendarFailed = calendarReady && calendar?.list === null;

  // Other events' bookings, plus this event's rooms where they'll end up.
  const ownIds = new Set(reservations.map((reservation) => reservation.id));
  const occupied: OccupiedSlot[] = [
    ...(calendarReady && calendar?.list ? calendar.list : [])
      .filter((reservation) => !ownIds.has(reservation.id))
      .map((reservation) => ({
        id: reservation.id,
        roomId: reservation.room_id,
        start: reservation.start_datetime,
        end: reservation.end_datetime,
        title: reservation.title,
        status: reservation.status,
        own: false,
      })),
    ...rows.flatMap(({ reservation, choice, target }) =>
      choice.kind === "release"
        ? []
        : [
            {
              ...(target ?? {
                id: reservation.id,
                roomId: reservation.roomId,
                start: reservation.start,
                end: reservation.end,
              }),
              title: reservation.roomName,
              status: reservation.status,
              own: true,
            },
          ],
    ),
    ...additionRows.flatMap(({ slot }) =>
      slot
        ? [{ ...slot, title: "a room you're adding", status: "held" as const, own: true }]
        : [],
    ),
  ];
  // Where this event's rooms will be once saved.
  const ownSlots = occupied.filter((slot) => slot.own);
  const conflictFor = (slot: RoomSlot | null) =>
    slot && calendarReady ? findRoomConflict(slot, occupied) : undefined;

  const conflicts =
    rows.filter(({ target, changed }) => (changed ? conflictFor(target) : false))
      .length +
    additionRows.filter(({ slot }) => conflictFor(slot)).length;
  const unfinishedAdditions = additionRows.filter(({ slot }) => !slot).length;
  const moving = rows.filter(
    ({ choice, changed }) => changed && choice.kind === "move",
  ).length;
  const releasing = rows.filter(({ choice }) => choice.kind === "release").length;
  const staying = rows.filter(
    ({ reservation, choice }) =>
      choice.kind === "keep" && !eventDaySet.has(venueDay(reservation.start)),
  ).length;

  const endValue = multiDay ? end : null;
  const datesChanged =
    !dateError &&
    (start !== (currentStart ?? "") ||
      normalizeEventEnd(start, endValue) !== currentEnd);
  const startChanged = !dateError && start !== (currentStart ?? "");
  const roomChanges = rows.flatMap(
    ({ reservation, choice, changed }): RoomChange[] =>
      !changed
        ? []
        : choice.kind === "release"
          ? [{ reservationId: reservation.id, action: "release" }]
          : choice.kind === "move"
            ? [
                {
                  reservationId: reservation.id,
                  action: "move",
                  day: choice.day,
                  roomId: choice.roomId,
                },
              ]
            : [],
  );
  const waitingOnCalendar =
    (roomChanges.length > 0 || additions.length > 0) && !calendarReady;
  const canSave =
    !dateError &&
    !pending &&
    conflicts === 0 &&
    unfinishedAdditions === 0 &&
    !waitingOnCalendar &&
    (datesChanged || roomChanges.length > 0 || additions.length > 0);

  // Event days with no room once saved (a multi-day event's new days).
  const emptyDays =
    dayOptions.length > 1
      ? dayOptions.filter(
          (option) =>
            !ownSlots.some((slot) => venueDay(slot.start) === option.day),
        )
      : [];

  // Other event days a room could also be held on, same room and times:
  // days where the event doesn't already have that room then. Same-day
  // bookings only (the added rooms are start/end times on one day).
  const copyDays = (slot: RoomSlot | null): string[] => {
    if (!slot || dayOptions.length < 2) return [];
    const fromDay = venueDay(slot.start);
    if (venueDay(slot.end) !== fromDay) return [];
    const startTime = venueTime(slot.start);
    const endTime = venueTime(slot.end);
    return dayOptions
      .map((option) => option.day)
      .filter((day) => day !== fromDay)
      .filter((day) => {
        const probe = {
          start: venueInstant(day, startTime),
          end: venueInstant(day, endTime),
        };
        return !ownSlots.some(
          (own) => own.roomId === slot.roomId && slotsOverlap(own, probe),
        );
      });
  };

  const addAdditions = (next: Omit<Addition, "key">[]) =>
    setAdditions((current) => [
      ...current,
      ...next.map((addition) => ({
        ...addition,
        key: `new-${nextAdditionKey.current++}`,
      })),
    ]);

  const copyToDays = (slot: RoomSlot) =>
    addAdditions(
      copyDays(slot).map((day) => ({
        day,
        roomId: slot.roomId,
        startTime: venueTime(slot.start),
        endTime: venueTime(slot.end),
      })),
    );

  // A new row starts on the first day without rooms, at the times of the
  // event's first room, in that room if it's free then (the usual case:
  // the same room again) or else the first room that is.
  const addRoom = () => {
    const template = ownSlots.find(
      (slot) => venueDay(slot.start) === venueDay(slot.end),
    );
    const day = emptyDays[0]?.day ?? dayOptions[0]?.day ?? "";
    const startTime = template ? venueTime(template.start) : "09:00";
    const endTime = template ? venueTime(template.end) : "10:00";
    const candidates = [
      ...(template ? [template.roomId] : []),
      ...rooms.map((room) => room.id),
    ];
    const free = day
      ? candidates.find(
          (roomId) =>
            !findRoomConflict(
              {
                id: "new",
                roomId,
                start: venueInstant(day, startTime),
                end: venueInstant(day, endTime),
              },
              occupied,
            ),
        )
      : undefined;
    addAdditions([
      { day, roomId: free ?? candidates[0] ?? "", startTime, endTime },
    ]);
  };

  const updateAddition = (key: string, patch: Partial<Addition>) =>
    setAdditions((current) =>
      current.map((addition) =>
        addition.key === key ? { ...addition, ...patch } : addition,
      ),
    );

  const setChoice = (reservationId: string, choice: Choice) =>
    setManual((current) => ({ ...current, [reservationId]: choice }));

  const save = () => {
    setError(null);
    const input: ChangeEventDatesFormInput = {
      startDate: start,
      endDate: endValue,
      roomChanges,
      newRooms: additions.map(({ day, roomId, startTime, endTime }) => ({
        day,
        roomId,
        startTime,
        endTime,
      })),
    };
    startTransition(async () => {
      try {
        const outcome = await changeEventDatesAction(eventId, input);
        if (!outcome.ok) {
          setError(outcome.error);
          return;
        }
        router.refresh();
        if (outcome.failed.length === 0) {
          onClose();
        } else {
          setResult(outcome);
        }
      } catch (saveError) {
        setError(
          saveError instanceof Error
            ? saveError.message
            : "Couldn't save the new dates.",
        );
      }
    });
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={() => {
        if (!pending) onClose();
      }}
    >
      <div className="absolute inset-0 bg-black/40" />

      <div
        aria-labelledby="event-dates-title"
        aria-modal="true"
        className="relative flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl bg-white shadow-xl"
        onClick={(event) => event.stopPropagation()}
        role="dialog"
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2
            className="text-lg font-semibold text-slate-950"
            id="event-dates-title"
          >
            Event dates
          </h2>
          <button
            aria-label="Close"
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            disabled={pending}
            onClick={onClose}
            type="button"
          >
            <Icon>
              <path d="M18 6 6 18" />
              <path d="m6 6 12 12" />
            </Icon>
          </button>
        </div>

        {result ? (
          <SaveResult onDone={onClose} result={result} />
        ) : (
          <>
            <div className="space-y-6 overflow-y-auto px-6 py-5">
              <section className="space-y-3">
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className="mb-1 block text-sm font-medium text-slate-700">
                      {multiDay ? "First day" : "Event date"}
                    </span>
                    <input
                      className={inputClass}
                      onChange={(event) => {
                        const next = event.target.value;
                        // Moving the first day carries the last day along,
                        // so the event keeps its length.
                        if (multiDay && isIsoDate(start) && isIsoDate(end) && isIsoDate(next)) {
                          const length = daysBetween(start, end);
                          if (length > 0) setEnd(addDays(next, length));
                        }
                        setStart(next);
                      }}
                      required
                      type="date"
                      value={start}
                    />
                  </label>
                  {multiDay ? (
                    <label className="block">
                      <span className="mb-1 block text-sm font-medium text-slate-700">
                        Last day
                      </span>
                      <input
                        className={inputClass}
                        min={start || undefined}
                        onChange={(event) => setEnd(event.target.value)}
                        required
                        type="date"
                        value={end}
                      />
                    </label>
                  ) : null}
                </div>
                <label className="flex items-center gap-2 text-sm text-slate-700">
                  <input
                    checked={multiDay}
                    className="h-4 w-4 rounded border-slate-300"
                    onChange={(event) => {
                      const next = event.target.checked;
                      setMultiDay(next);
                      if (next && start && (!end || end <= start)) {
                        setEnd(addDays(start, 1));
                      }
                    }}
                    type="checkbox"
                  />
                  Runs more than one day
                </label>
                {dateError && (start || multiDay) ? (
                  <p className="text-sm text-red-700">{dateError}</p>
                ) : newStart ? (
                  <p className="text-sm text-slate-600">
                    {formatEventDates(newStart, newEnd)}
                    {dayOptions.length > 1
                      ? ` · ${dayOptions.length} days`
                      : ""}
                  </p>
                ) : null}
              </section>

              {newStart ? (
                <section>
                  <div className="flex flex-wrap items-baseline justify-between gap-2">
                    <h3 className="text-sm font-semibold text-slate-950">
                      Rooms on this event
                    </h3>
                    <p className="text-xs text-slate-500">
                      {needsCalendar && !calendarReady && windowKey
                        ? "Checking the room calendar…"
                        : calendarFailed
                          ? "Couldn't check the room calendar; conflicts will be reported after saving."
                          : "Conflicts are checked against the room calendar."}
                    </p>
                  </div>
                  {rows.length + additionRows.length > 0 ? (
                    <ul className="mt-3 divide-y divide-slate-200 rounded-lg border border-slate-200">
                      {rows.map(({ reservation, choice, target, changed }) => {
                        // Where it will be once saved, if that's an event day.
                        const finalSlot =
                          choice.kind === "release"
                            ? null
                            : (target ?? {
                                id: reservation.id,
                                roomId: reservation.roomId,
                                start: reservation.start,
                                end: reservation.end,
                              });
                        const sameRoomDays =
                          finalSlot && eventDaySet.has(venueDay(finalSlot.start))
                            ? copyDays(finalSlot)
                            : [];
                        return (
                          <RoomRow
                            changed={changed}
                            checking={!calendarReady}
                            choice={choice}
                            conflict={changed ? conflictFor(target) : undefined}
                            copyLabel={sameRoomLabel(sameRoomDays)}
                            dayOptions={dayOptions}
                            defaultMove={defaults.get(reservation.id)}
                            key={reservation.id}
                            onChange={(next) => setChoice(reservation.id, next)}
                            onCopy={() => {
                              if (finalSlot) copyToDays(finalSlot);
                            }}
                            onEventDay={eventDaySet.has(venueDay(reservation.start))}
                            reservation={reservation}
                            roomBusy={(roomId) =>
                              Boolean(
                                target &&
                                  calendarReady &&
                                  findRoomConflict({ ...target, roomId }, occupied),
                              )
                            }
                            rooms={rooms}
                            target={target}
                          />
                        );
                      })}
                      {additionRows.map(({ addition, slot, validDay, validTimes }) => (
                        <AdditionRow
                          addition={addition}
                          checking={!calendarReady}
                          conflict={conflictFor(slot)}
                          dayOptions={dayOptions}
                          key={addition.key}
                          onChange={(patch) => updateAddition(addition.key, patch)}
                          onRemove={() =>
                            setAdditions((current) =>
                              current.filter((item) => item.key !== addition.key),
                            )
                          }
                          roomBusy={(roomId) =>
                            Boolean(
                              slot &&
                                calendarReady &&
                                findRoomConflict({ ...slot, roomId }, occupied),
                            )
                          }
                          rooms={rooms}
                          slot={slot}
                          validDay={validDay}
                          validTimes={validTimes}
                        />
                      ))}
                    </ul>
                  ) : (
                    <p className="mt-3 text-sm text-slate-600">
                      No rooms on this event yet.
                    </p>
                  )}
                  <div className="mt-3 flex flex-wrap items-center gap-x-3 gap-y-2">
                    <button
                      className={buttonClasses("secondary", "sm")}
                      disabled={rooms.length === 0}
                      onClick={addRoom}
                      type="button"
                    >
                      Add a room
                    </button>
                    {emptyDays.length > 0 ? (
                      <p className="text-sm text-amber-800">
                        No rooms yet on{" "}
                        {emptyDays.map((option) => option.label).join(", ")}.
                      </p>
                    ) : null}
                  </div>
                </section>
              ) : null}

              <div className="space-y-2 text-sm">
                {startChanged ? (
                  <p className="text-slate-600">
                    {linkedToGhl
                      ? "The first day is saved to the GHL opportunity's Date of Interest."
                      : "This event isn't linked to a GHL opportunity, so the dates are saved in the portal only."}{" "}
                    Checklist due dates move with the event.
                  </p>
                ) : null}
                {datesChanged && contracts.unsigned + contracts.signed > 0 ? (
                  <p className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900">
                    Contracts aren&apos;t changed.
                    {contracts.unsigned > 0
                      ? ` ${contracts.unsigned} unsigned contract${contracts.unsigned === 1 ? " still shows" : "s still show"} the old date: edit and re-send ${contracts.unsigned === 1 ? "it" : "them"} from the Contracts tab.`
                      : ""}
                    {contracts.signed > 0
                      ? ` ${contracts.signed} signed contract${contracts.signed === 1 ? " was" : "s were"} signed for the old date.`
                      : ""}
                  </p>
                ) : null}
                {error ? (
                  <p className="rounded-lg border border-red-200 bg-red-50 p-3 text-red-700">
                    {error}
                  </p>
                ) : null}
              </div>
            </div>

            <div className="flex flex-wrap items-center justify-between gap-3 border-t border-slate-200 px-6 py-4">
              <p className="text-sm text-slate-600">
                {conflicts > 0
                  ? `${conflicts} room${conflicts === 1 ? " needs" : "s need"} a decision.`
                  : unfinishedAdditions > 0
                    ? "Finish the new room details."
                    : [
                        moving > 0
                          ? `${moving} room${moving === 1 ? "" : "s"} move`
                          : null,
                        releasing > 0 ? `${releasing} released` : null,
                        additions.length > 0 ? `${additions.length} added` : null,
                        staying > 0 ? `${staying} left off the event's days` : null,
                      ]
                        .filter(Boolean)
                        .join(" · ")}
              </p>
              <div className="flex items-center gap-2">
                <button
                  className={buttonClasses("ghost")}
                  disabled={pending}
                  onClick={onClose}
                  type="button"
                >
                  Cancel
                </button>
                <button
                  className={buttonClasses("primary")}
                  disabled={!canSave}
                  onClick={save}
                  type="button"
                >
                  {pending ? "Saving…" : datesChanged ? "Save dates" : "Save rooms"}
                </button>
              </div>
            </div>
          </>
        )}
      </div>
    </div>
  );
}

function RoomRow({
  reservation,
  choice,
  target,
  changed,
  checking,
  conflict,
  defaultMove,
  onEventDay,
  dayOptions,
  rooms,
  roomBusy,
  onChange,
  copyLabel,
  onCopy,
}: {
  reservation: EventDatesReservation;
  choice: Choice;
  target: RoomSlot | null;
  changed: boolean;
  checking: boolean;
  conflict: OccupiedSlot | undefined;
  defaultMove: DefaultRoomMove | undefined;
  onEventDay: boolean;
  dayOptions: ReturnType<typeof eventDayOptions>;
  rooms: EventDatesRoom[];
  roomBusy: (roomId: string) => boolean;
  onChange: (choice: Choice) => void;
  // "Same room on Sat, Oct 17": holds this room at the same times on the
  // event's other days. Null when there's nowhere to copy it.
  copyLabel: string | null;
  onCopy: () => void;
}) {
  const currentDay = venueDay(reservation.start);
  const onNewDay = dayOptions.some((option) => option.day === currentDay);
  // Staying put on a day that's still an event day is that day's option.
  const dayValue =
    choice.kind === "move"
      ? `day:${choice.day}`
      : choice.kind === "keep" && onNewDay
        ? `day:${currentDay}`
        : choice.kind;
  const roomOptions = rooms.some((room) => room.id === reservation.roomId)
    ? rooms
    : [
        { id: reservation.roomId, name: reservation.roomName, color: reservation.roomColor },
        ...rooms,
      ];

  return (
    <li className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 font-semibold text-slate-950">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: reservation.roomColor }}
          />
          {reservation.roomName}
        </span>
        <span className="text-slate-600">
          Now {formatDayLabelWithYear(currentDay)} ·{" "}
          {formatVenueTimeRange(reservation.start, reservation.end)}
        </span>
        <span className="ml-auto">
          <StatusBadge tone={reservation.status === "booked" ? "success" : "warning"}>
            {reservation.status === "booked" ? "Booked" : "Held"}
          </StatusBadge>
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <select
          aria-label={`Where ${reservation.roomName} goes`}
          className={inputClass}
          onChange={(event) => {
            const value = event.target.value;
            if (value === "keep" || value === "release") {
              onChange({ kind: value });
            } else {
              onChange({
                kind: "move",
                day: value.slice(4),
                roomId: choice.kind === "move" ? choice.roomId : reservation.roomId,
              });
            }
          }}
          value={dayValue}
        >
          {dayOptions.map((option) => (
            <option key={option.day} value={`day:${option.day}`}>
              {option.label}
            </option>
          ))}
          {!onNewDay ? (
            <option value="keep">Leave on {formatDayLabel(currentDay)}</option>
          ) : null}
          <option value="release">
            Release {reservation.status === "booked" ? "this booked room" : "this hold"}
          </option>
        </select>
        {choice.kind === "move" ? (
          <select
            aria-label={`Room for ${reservation.roomName}`}
            className={inputClass}
            onChange={(event) => onChange({ ...choice, roomId: event.target.value })}
            value={choice.roomId}
          >
            {roomOptions.map((room) => (
              <option key={room.id} value={room.id}>
                {room.name}
                {room.id !== choice.roomId && roomBusy(room.id) ? " — busy then" : ""}
              </option>
            ))}
          </select>
        ) : null}
      </div>

      <RowStatus
        changed={changed}
        checking={checking}
        choice={choice}
        conflict={conflict}
        currentDay={currentDay}
        defaultMove={defaultMove}
        onEventDay={onEventDay}
        target={target}
        targetRoomName={
          target && target.roomId !== reservation.roomId
            ? roomOptions.find((room) => room.id === target.roomId)?.name ?? null
            : null
        }
      />
      {copyLabel ? (
        <button
          className="text-[13px] font-medium text-sky-700 underline-offset-2 hover:text-sky-900 hover:underline"
          onClick={onCopy}
          type="button"
        >
          + {copyLabel}
        </button>
      ) : null}
    </li>
  );
}

function sameRoomLabel(days: string[]): string | null {
  if (days.length === 0) return null;
  if (days.length <= 2) {
    return `Same room on ${days.map(formatDayLabel).join(" and ")}`;
  }
  return `Same room on ${days.length} more days`;
}

// A room the dialog will add (held) when saved.
function AdditionRow({
  addition,
  slot,
  validDay,
  validTimes,
  checking,
  conflict,
  dayOptions,
  rooms,
  roomBusy,
  onChange,
  onRemove,
}: {
  addition: Addition;
  slot: RoomSlot | null;
  validDay: boolean;
  validTimes: boolean;
  checking: boolean;
  conflict: OccupiedSlot | undefined;
  dayOptions: ReturnType<typeof eventDayOptions>;
  rooms: EventDatesRoom[];
  roomBusy: (roomId: string) => boolean;
  onChange: (patch: Partial<Addition>) => void;
  onRemove: () => void;
}) {
  const room = rooms.find((option) => option.id === addition.roomId);

  return (
    <li className="space-y-2 p-3 text-sm">
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1">
        <span className="flex items-center gap-2 font-semibold text-slate-950">
          <span
            aria-hidden
            className="h-2.5 w-2.5 shrink-0 rounded-full"
            style={{ backgroundColor: room?.color ?? "#94A3B8" }}
          />
          New room
        </span>
        <span className="ml-auto flex items-center gap-3">
          <StatusBadge tone="info">Adding</StatusBadge>
          <button
            className="text-[13px] font-semibold text-slate-400 transition hover:text-red-600"
            onClick={onRemove}
            type="button"
          >
            Remove
          </button>
        </span>
      </div>

      <div className="grid gap-2 sm:grid-cols-2">
        <select
          aria-label="Day for the new room"
          className={inputClass}
          onChange={(event) => onChange({ day: event.target.value })}
          value={validDay ? addition.day : ""}
        >
          {!validDay ? (
            <option disabled value="">
              Choose a day
            </option>
          ) : null}
          {dayOptions.map((option) => (
            <option key={option.day} value={option.day}>
              {option.label}
            </option>
          ))}
        </select>
        <select
          aria-label="Room to add"
          className={inputClass}
          onChange={(event) => onChange({ roomId: event.target.value })}
          value={addition.roomId}
        >
          {rooms.map((option) => (
            <option key={option.id} value={option.id}>
              {option.name}
              {option.id !== addition.roomId && roomBusy(option.id)
                ? " — busy then"
                : ""}
            </option>
          ))}
        </select>
        <TimeSelect
          ariaLabel="Start time for the new room"
          onChange={(value) => onChange({ startTime: value })}
          value={addition.startTime}
        />
        <TimeSelect
          ariaLabel="End time for the new room"
          onChange={(value) => onChange({ endTime: value })}
          value={addition.endTime}
        />
      </div>

      {!validDay ? (
        <p className="font-medium text-red-700">
          Pick one of the event&apos;s days.
        </p>
      ) : !validTimes || !slot ? (
        <p className="font-medium text-red-700">
          The end time has to be after the start time.
        </p>
      ) : checking ? (
        <p className="text-slate-500">Checking availability…</p>
      ) : conflict ? (
        <p className="font-medium text-red-700">
          {conflict.own
            ? `This event already has the room then (${formatVenueTimeRange(conflict.start, conflict.end)}).`
            : `Taken ${formatVenueTimeRange(conflict.start, conflict.end)} by ${conflict.title} (${conflict.status}).`}{" "}
          Pick another room or time.
        </p>
      ) : (
        <p className="text-emerald-700">
          Held on {formatDayLabel(addition.day)},{" "}
          {formatVenueTimeRange(slot.start, slot.end)}.
        </p>
      )}
    </li>
  );
}

function RowStatus({
  choice,
  target,
  targetRoomName,
  changed,
  checking,
  conflict,
  defaultMove,
  currentDay,
  onEventDay,
}: {
  choice: Choice;
  target: RoomSlot | null;
  // Set when the room itself changes.
  targetRoomName: string | null;
  changed: boolean;
  checking: boolean;
  conflict: OccupiedSlot | undefined;
  defaultMove: DefaultRoomMove | undefined;
  currentDay: string;
  onEventDay: boolean;
}) {
  if (choice.kind === "release") {
    return <p className="text-slate-600">Will be deleted from the room calendar.</p>;
  }
  if (choice.kind === "keep") {
    return (
      <p className={onEventDay ? "text-slate-600" : "text-amber-800"}>
        {defaultMove?.kind === "dropped"
          ? `Day ${defaultMove.dayNumber} isn't part of the new dates. Move it to one of the event's days or release it, or it stays on ${formatDayLabel(currentDay)}.`
          : defaultMove?.kind === "off-event"
            ? `Wasn't on one of the event's days, so it stays on ${formatDayLabel(currentDay)} unless you move it.`
            : `Stays on ${formatDayLabel(currentDay)}.`}
      </p>
    );
  }
  if (!changed || !target) {
    return <p className="text-slate-500">No change.</p>;
  }
  if (checking) {
    return <p className="text-slate-500">Checking availability…</p>;
  }
  if (conflict) {
    return (
      <p className="font-medium text-red-700">
        {conflict.own
          ? `This event already has the room then (${formatVenueTimeRange(conflict.start, conflict.end)}).`
          : `Taken ${formatVenueTimeRange(conflict.start, conflict.end)} by ${conflict.title} (${conflict.status}).`}{" "}
        Pick another room, leave it where it is, or release it.
      </p>
    );
  }
  return (
    <p className="text-emerald-700">
      Moves to {targetRoomName ? `${targetRoomName}, ` : ""}
      {formatDayLabel(venueDay(target.start))},{" "}
      {formatVenueTimeRange(target.start, target.end)}.
    </p>
  );
}

function SaveResult({
  result,
  onDone,
}: {
  result: Extract<ChangeEventDatesOutcome, { ok: true }>;
  onDone: () => void;
}) {
  return (
    <div className="space-y-4 overflow-y-auto px-6 py-5 text-sm">
      <p className="text-slate-700">
        {result.datesChanged ? "Dates saved. " : ""}
        {result.moved > 0
          ? `${result.moved} room${result.moved === 1 ? "" : "s"} moved. `
          : ""}
        {result.released > 0 ? `${result.released} released. ` : ""}
        {result.added > 0 ? `${result.added} added. ` : ""}
        {result.failed.length === 1
          ? "One room couldn't be changed:"
          : `${result.failed.length} rooms couldn't be changed:`}
      </p>
      <ul className="space-y-2">
        {result.failed.map((failure) => (
          <li
            className="rounded-lg border border-amber-200 bg-amber-50 p-3 text-amber-900"
            key={failure.key}
          >
            <span className="font-semibold">{failure.room}</span> — {failure.reason}
          </li>
        ))}
      </ul>
      <p className="text-slate-600">
        Rooms left off the event&apos;s days are flagged under Room bookings:
        move them there or on the room calendar, and add any that weren&apos;t
        added with Add room.
      </p>
      <div className="flex justify-end">
        <button className={buttonClasses("primary")} onClick={onDone} type="button">
          Done
        </button>
      </div>
    </div>
  );
}
