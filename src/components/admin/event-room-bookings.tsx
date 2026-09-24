"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { buttonClasses, type ButtonVariant } from "@/components/ui/button";
import {
  eventDayOptions,
  formatDayLabel,
  toIsoDate,
} from "@/lib/dates/event-dates";

// Add/remove room bookings from the admin event detail page. Both actions go
// through the calendar REST API so conflict checks and the GHL planning-stage
// trigger behave exactly like bookings made on the room calendar.

type RoomOption = {
  id: string;
  name: string;
  color: string;
  capacity: number | null;
};

type DayReservation = {
  id: string;
  room_id: string;
  title: string;
  status: "held" | "booked";
  start_datetime: string;
  end_datetime: string;
  event_id: string | null;
};

// 15-minute steps for the time pickers, "HH:mm" values with friendly labels.
const TIME_OPTIONS = Array.from({ length: 24 * 4 }, (_, i) => {
  const hours = Math.floor(i / 4);
  const minutes = (i % 4) * 15;
  const value = `${String(hours).padStart(2, "0")}:${String(minutes).padStart(2, "0")}`;
  const hour12 = hours % 12 === 0 ? 12 : hours % 12;
  const label = `${hour12}:${String(minutes).padStart(2, "0")} ${hours < 12 ? "AM" : "PM"}`;
  return { value, label };
});

const inputClass =
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800";

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeStyle: "short" }).format(
    new Date(iso),
  );
}

// Also used by the event dates dialog for the rooms it adds.
export function TimeSelect({
  value,
  onChange,
  ariaLabel,
}: {
  value: string;
  onChange: (value: string) => void;
  ariaLabel?: string;
}) {
  // A time off the 15-minute steps (copied from an existing booking) stays
  // selectable rather than silently showing the first option.
  const options = TIME_OPTIONS.some((t) => t.value === value)
    ? TIME_OPTIONS
    : [{ value, label: formatTime(`1970-01-01T${value}:00`) }, ...TIME_OPTIONS];

  return (
    <select
      aria-label={ariaLabel}
      className={inputClass}
      onChange={(e) => onChange(e.target.value)}
      required
      value={value}
    >
      {options.map((t) => (
        <option key={t.value} value={t.value}>
          {t.label}
        </option>
      ))}
    </select>
  );
}

type AddRoomBookingButtonProps = {
  eventId: string;
  eventName: string;
  eventDate: string | null;
  // Last day of a multi-day event: the modal then offers each day as a
  // chip, and one save books the room on every ticked day.
  eventEndDate: string | null;
  // The event's assigned coordinator (from GHL); becomes the reservation's
  // coordinator so bookings added here don't show as Unassigned.
  coordinatorName: string | null;
  rooms: RoomOption[];
  // Open the modal on mount — the expedited intake lands here so rooms get
  // held without another click.
  autoOpen?: boolean;
  // Days ticked when the modal opens (a day's own Add room button under
  // Room bookings); defaults to the event's first day.
  initialDays?: string[];
  variant?: ButtonVariant;
};

export function AddRoomBookingButton({
  eventId,
  eventName,
  eventDate,
  eventEndDate,
  coordinatorName,
  rooms,
  autoOpen = false,
  initialDays,
  variant = "secondary",
}: AddRoomBookingButtonProps) {
  const [open, setOpen] = useState(autoOpen);

  return (
    <>
      <button
        className={buttonClasses(variant, "sm")}
        onClick={() => setOpen(true)}
        type="button"
      >
        Add room
      </button>
      {open ? (
        <AddRoomBookingModal
          eventDate={eventDate}
          eventEndDate={eventEndDate}
          eventId={eventId}
          eventName={eventName}
          initialDays={initialDays}
          onClose={() => setOpen(false)}
          coordinatorName={coordinatorName}
          rooms={rooms}
        />
      ) : null}
    </>
  );
}

function AddRoomBookingModal({
  eventId,
  eventName,
  eventDate,
  eventEndDate,
  coordinatorName,
  rooms,
  initialDays,
  onClose,
}: AddRoomBookingButtonProps & { onClose: () => void }) {
  const router = useRouter();
  const dayOptions = eventDayOptions(eventDate, eventEndDate);
  const multiDay = dayOptions.length > 1;
  const startingDays = (initialDays ?? []).filter((day) =>
    dayOptions.some((option) => option.day === day),
  );

  // Stored event dates are yyyy-MM-dd (or ISO-prefixed); anything else falls
  // back to today so the date input is never empty.
  const defaultDate =
    toIsoDate(eventDate) ?? new Date().toISOString().slice(0, 10);

  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [status, setStatus] = useState<"held" | "booked">("held");
  // One-day events pick a date; multi-day events tick days.
  const [date, setDate] = useState(startingDays[0] ?? defaultDate);
  const [days, setDays] = useState<string[]>(
    multiDay
      ? startingDays.length > 0
        ? startingDays
        : [dayOptions[0].day]
      : [],
  );
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const targetDays = multiDay ? [...days].sort() : [date];
  const firstDay = multiDay ? dayOptions[0].day : date;
  const lastDay = multiDay ? dayOptions[dayOptions.length - 1].day : date;
  const rangeKey = `${firstDay}|${lastDay}`;

  // All reservations (any event, any room) across the days on offer, so
  // coordinators can see existing usage before submitting. Keyed by range: a
  // stale key means the fetch for the current range is still in flight. The
  // server still enforces conflicts on save either way.
  const [rangeData, setRangeData] = useState<{
    key: string;
    list: DayReservation[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let list: DayReservation[] = [];
      try {
        const [first, last] = rangeKey.split("|");
        const start = new Date(`${first}T00:00:00`);
        const end = new Date(`${last}T00:00:00`);
        end.setDate(end.getDate() + 1);
        const params = new URLSearchParams({
          start: start.toISOString(),
          end: end.toISOString(),
        });
        const res = await fetch(`/api/calendar/reservations?${params}`);
        if (res.ok) list = (await res.json()) as DayReservation[];
      } catch {
        // Availability preview is best-effort; the API still blocks conflicts.
      }
      if (!cancelled) setRangeData({ key: rangeKey, list });
    })();

    return () => {
      cancelled = true;
    };
  }, [rangeKey]);

  const rangeReservations = rangeData?.key === rangeKey ? rangeData.list : null;

  const slotFor = (day: string) => ({
    start: new Date(`${day}T${startTime}`).toISOString(),
    end: new Date(`${day}T${endTime}`).toISOString(),
  });
  const dayWindow = (day: string) => {
    const start = new Date(`${day}T00:00:00`);
    const end = new Date(start);
    end.setDate(end.getDate() + 1);
    return { start: start.toISOString(), end: end.toISOString() };
  };
  const overlaps = (
    reservation: DayReservation,
    slot: { start: string; end: string },
  ) =>
    Date.parse(reservation.start_datetime) < Date.parse(slot.end) &&
    Date.parse(reservation.end_datetime) > Date.parse(slot.start);

  // Per chosen day: the selected room's bookings that day and any overlap.
  const perDay = targetDays.map((day) => {
    const slot = slotFor(day);
    const roomBookings = (rangeReservations ?? []).filter(
      (r) => r.room_id === roomId && overlaps(r, dayWindow(day)),
    );
    return {
      day,
      slot,
      roomBookings,
      conflict: roomBookings.find((r) => overlaps(r, slot)),
    };
  });
  const busyRoomIds = new Set(
    (rangeReservations ?? [])
      .filter((r) => targetDays.some((day) => overlaps(r, slotFor(day))))
      .map((r) => r.room_id),
  );

  const toggleDay = (day: string) =>
    setDays((current) =>
      current.includes(day)
        ? current.filter((value) => value !== day)
        : [...current, day],
    );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (startTime >= endTime) {
      setError("End time must be after start time.");
      return;
    }
    if (targetDays.length === 0) {
      setError("Pick at least one day.");
      return;
    }

    setSaving(true);
    // One reservation per day, through the same API as the room calendar.
    // Stops at the first failure; days already added stay added.
    const added: string[] = [];
    try {
      for (const { day, slot } of perDay) {
        const res = await fetch("/api/calendar/reservations", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            room_id: roomId,
            title: eventName,
            status,
            start_datetime: slot.start,
            end_datetime: slot.end,
            event_id: eventId,
            coordinator_name: coordinatorName,
          }),
        });

        if (!res.ok) {
          const data = (await res.json().catch(() => null)) as {
            error?: string;
          } | null;
          const reason = data?.error || "Failed to add the room booking";
          throw new Error(
            multiDay ? `${formatDayLabel(day)}: ${reason}` : reason,
          );
        }
        added.push(day);
      }

      router.refresh();
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to add the room booking";
      if (added.length > 0) {
        router.refresh();
        setDays((current) => current.filter((day) => !added.includes(day)));
        setError(
          `Added ${added.map(formatDayLabel).join(", ")}. ${message}`,
        );
      } else {
        setError(message);
      }
      setSaving(false);
    }
  };

  const selectedRoomName = rooms.find((r) => r.id === roomId)?.name ?? "Room";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      <div className="absolute inset-0 bg-black/40" />

      <div
        className="relative max-h-[90vh] w-full max-w-lg overflow-y-auto rounded-2xl bg-white shadow-xl"
        onClick={(e) => e.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <h2 className="text-lg font-semibold text-slate-950">
            Add room booking
          </h2>
          <button
            className="rounded-lg p-1 text-slate-400 hover:bg-slate-100"
            onClick={onClose}
            type="button"
          >
            <svg
              className="h-5 w-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                d="M6 18L18 6M6 6l12 12"
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
              />
            </svg>
          </button>
        </div>

        <form className="space-y-4 p-6" onSubmit={handleSubmit}>
          <p className="text-sm text-slate-600">
            Books a room for <span className="font-semibold">{eventName}</span>
            {coordinatorName ? (
              <>
                , coordinated by{" "}
                <span className="font-semibold">{coordinatorName}</span>
              </>
            ) : null}
            . Conflicts with other reservations are rejected automatically.
          </p>

          {error ? (
            <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-sm text-red-700">
              {error}
            </div>
          ) : null}

          <div className="grid grid-cols-2 gap-3">
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Room *
              </span>
              <select
                className={inputClass}
                onChange={(e) => setRoomId(e.target.value)}
                required
                value={roomId}
              >
                {rooms.map((room) => (
                  <option key={room.id} value={room.id}>
                    {room.name}
                    {busyRoomIds.has(room.id) ? " — busy at this time" : ""}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Status *
              </span>
              <select
                className={inputClass}
                onChange={(e) => setStatus(e.target.value as "held" | "booked")}
                required
                value={status}
              >
                <option value="held">Held</option>
                <option value="booked">Booked</option>
              </select>
            </label>
          </div>

          {multiDay ? (
            <fieldset>
              <legend className="mb-1 block text-sm font-medium text-slate-700">
                Days *
              </legend>
              <div className="flex flex-wrap gap-2">
                {dayOptions.map((option) => {
                  const selected = days.includes(option.day);
                  return (
                    <button
                      aria-pressed={selected}
                      className={`rounded-md border px-2.5 py-1.5 text-[13px] font-medium transition ${
                        selected
                          ? "border-[var(--brand-border)] bg-[var(--brand)] text-[var(--brand-foreground)]"
                          : "border-slate-300 bg-white text-slate-700 hover:border-slate-400 hover:bg-slate-50"
                      }`}
                      key={option.day}
                      onClick={() => toggleDay(option.day)}
                      type="button"
                    >
                      {option.label}
                    </button>
                  );
                })}
                {days.length < dayOptions.length ? (
                  <button
                    className={buttonClasses("ghost", "sm")}
                    onClick={() => setDays(dayOptions.map((option) => option.day))}
                    type="button"
                  >
                    Every day
                  </button>
                ) : null}
              </div>
              <p className="mt-1 text-xs text-slate-500">
                Same room and times on each day ticked; each day is its own
                booking. Other dates can be booked on the room calendar.
              </p>
            </fieldset>
          ) : null}

          <div className={`grid gap-3 ${multiDay ? "grid-cols-2" : "grid-cols-3"}`}>
            {multiDay ? null : (
              <label className="block">
                <span className="mb-1 block text-sm font-medium text-slate-700">
                  Date *
                </span>
                <input
                  className={inputClass}
                  onChange={(e) => setDate(e.target.value)}
                  required
                  type="date"
                  value={date}
                />
              </label>
            )}
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                Start *
              </span>
              <TimeSelect onChange={setStartTime} value={startTime} />
            </label>
            <label className="block">
              <span className="mb-1 block text-sm font-medium text-slate-700">
                End *
              </span>
              <TimeSelect onChange={setEndTime} value={endTime} />
            </label>
          </div>

          {/* The selected room's usage on each chosen day, across all events */}
          <div className="space-y-3 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            {perDay.length === 0 ? (
              <p className="text-slate-500">Pick at least one day.</p>
            ) : (
              perDay.map(({ day, roomBookings, conflict }) => (
                <div key={day}>
                  <p className="font-semibold text-slate-600">
                    {selectedRoomName} on{" "}
                    {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
                      new Date(`${day}T12:00:00`),
                    )}
                  </p>
                  {rangeReservations === null ? (
                    <p className="mt-1 text-slate-500">Checking availability…</p>
                  ) : roomBookings.length === 0 ? (
                    <p className="mt-1 text-emerald-700">
                      No reservations — free all day.
                    </p>
                  ) : (
                    <ul className="mt-1 space-y-1">
                      {roomBookings.map((r) => (
                        <li className="text-slate-700" key={r.id}>
                          {formatTime(r.start_datetime)} – {formatTime(r.end_datetime)}{" "}
                          · {r.title} ({r.status}
                          {r.event_id === eventId ? ", this event" : ""})
                        </li>
                      ))}
                    </ul>
                  )}
                  {conflict ? (
                    <p className="mt-2 font-semibold text-red-700">
                      Your selected times overlap {formatTime(conflict.start_datetime)}{" "}
                      – {formatTime(conflict.end_datetime)} ({conflict.title}). Choose
                      a different time or room.
                    </p>
                  ) : null}
                </div>
              ))
            )}
          </div>

          <div className="flex items-center justify-end gap-2 pt-2">
            <button
              className={buttonClasses("ghost")}
              onClick={onClose}
              type="button"
            >
              Cancel
            </button>
            <button
              className={buttonClasses("primary")}
              // A known overlap on any chosen day would stop a multi-day
              // save partway; single-day saves still let the API answer.
              disabled={
                saving ||
                !roomId ||
                targetDays.length === 0 ||
                (multiDay && perDay.some((item) => item.conflict))
              }
              type="submit"
            >
              {saving
                ? "Adding…"
                : multiDay && targetDays.length > 1
                  ? `Add to ${targetDays.length} days`
                  : "Add booking"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}

export function DeleteBookingButton({ reservationId }: { reservationId: string }) {
  const router = useRouter();
  const [deleting, setDeleting] = useState(false);
  const [error, setError] = useState(false);

  const handleDelete = async () => {
    if (!confirm("Delete this room booking? This cannot be undone.")) return;

    setDeleting(true);
    setError(false);
    try {
      const res = await fetch(`/api/calendar/reservations/${reservationId}`, {
        method: "DELETE",
      });
      if (!res.ok) throw new Error();
      router.refresh();
    } catch {
      setError(true);
      setDeleting(false);
    }
  };

  return (
    <button
      className="text-[13px] font-semibold text-slate-400 transition hover:text-red-600 disabled:pointer-events-none disabled:opacity-50"
      disabled={deleting}
      onClick={handleDelete}
      type="button"
    >
      {error ? "Delete failed — retry" : deleting ? "Deleting…" : "Delete"}
    </button>
  );
}
