"use client";

import { useEffect, useState } from "react";
import { useRouter } from "next/navigation";

import { buttonClasses } from "@/components/ui/button";

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
  "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800 focus:outline-none focus:ring-2 focus:ring-slate-400";

function formatTime(iso: string): string {
  return new Intl.DateTimeFormat("en-US", { timeStyle: "short" }).format(
    new Date(iso),
  );
}

function TimeSelect({
  value,
  onChange,
}: {
  value: string;
  onChange: (value: string) => void;
}) {
  return (
    <select
      className={inputClass}
      onChange={(e) => onChange(e.target.value)}
      required
      value={value}
    >
      {TIME_OPTIONS.map((t) => (
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
  // The event's assigned planner (from GHL); becomes the reservation's
  // coordinator so bookings added here don't show as Unassigned.
  plannerName: string | null;
  rooms: RoomOption[];
};

export function AddRoomBookingButton({
  eventId,
  eventName,
  eventDate,
  plannerName,
  rooms,
}: AddRoomBookingButtonProps) {
  const [open, setOpen] = useState(false);

  return (
    <>
      <button
        className={buttonClasses("secondary", "sm")}
        onClick={() => setOpen(true)}
        type="button"
      >
        Add room
      </button>
      {open ? (
        <AddRoomBookingModal
          eventDate={eventDate}
          eventId={eventId}
          eventName={eventName}
          onClose={() => setOpen(false)}
          plannerName={plannerName}
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
  plannerName,
  rooms,
  onClose,
}: AddRoomBookingButtonProps & { onClose: () => void }) {
  const router = useRouter();

  // Stored event dates are yyyy-MM-dd (or ISO-prefixed); anything else falls
  // back to today so the date input is never empty.
  const defaultDate = /^\d{4}-\d{2}-\d{2}/.test(eventDate ?? "")
    ? (eventDate as string).slice(0, 10)
    : new Date().toISOString().slice(0, 10);

  const [roomId, setRoomId] = useState(rooms[0]?.id ?? "");
  const [status, setStatus] = useState<"held" | "booked">("held");
  const [date, setDate] = useState(defaultDate);
  const [startTime, setStartTime] = useState("09:00");
  const [endTime, setEndTime] = useState("10:00");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  // All reservations (any event, any room) on the chosen date, so planners
  // can see existing usage before submitting. Keyed by date: a stale key
  // means the fetch for the current date is still in flight. The server
  // still enforces conflicts on save either way.
  const [dayData, setDayData] = useState<{
    date: string;
    list: DayReservation[];
  } | null>(null);

  useEffect(() => {
    let cancelled = false;

    (async () => {
      let list: DayReservation[] = [];
      try {
        const start = new Date(`${date}T00:00:00`);
        const end = new Date(start);
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
      if (!cancelled) setDayData({ date, list });
    })();

    return () => {
      cancelled = true;
    };
  }, [date]);

  const dayReservations = dayData?.date === date ? dayData.list : null;

  const startIso = new Date(`${date}T${startTime}`).toISOString();
  const endIso = new Date(`${date}T${endTime}`).toISOString();

  const roomBookingsForDay = (dayReservations ?? []).filter(
    (r) => r.room_id === roomId,
  );
  const conflict = roomBookingsForDay.find(
    (r) => r.start_datetime < endIso && r.end_datetime > startIso,
  );
  const busyRoomIds = new Set(
    (dayReservations ?? [])
      .filter((r) => r.start_datetime < endIso && r.end_datetime > startIso)
      .map((r) => r.room_id),
  );

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    if (startTime >= endTime) {
      setError("End time must be after start time.");
      return;
    }

    setSaving(true);
    try {
      const res = await fetch("/api/calendar/reservations", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          room_id: roomId,
          title: eventName,
          status,
          start_datetime: startIso,
          end_datetime: endIso,
          event_id: eventId,
          coordinator_name: plannerName,
        }),
      });

      if (!res.ok) {
        const data = (await res.json().catch(() => null)) as {
          error?: string;
        } | null;
        throw new Error(data?.error || "Failed to add the room booking");
      }

      router.refresh();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add the room booking");
      setSaving(false);
    }
  };

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
            {plannerName ? (
              <>
                , coordinated by{" "}
                <span className="font-semibold">{plannerName}</span>
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

          <div className="grid grid-cols-3 gap-3">
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

          {/* Same-day usage for the selected room, across all events */}
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm">
            <p className="font-semibold text-slate-600">
              {rooms.find((r) => r.id === roomId)?.name ?? "Room"} on{" "}
              {new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
                new Date(`${date}T12:00:00`),
              )}
            </p>
            {dayReservations === null ? (
              <p className="mt-1 text-slate-500">Checking availability…</p>
            ) : roomBookingsForDay.length === 0 ? (
              <p className="mt-1 text-emerald-700">
                No reservations — free all day.
              </p>
            ) : (
              <ul className="mt-1 space-y-1">
                {roomBookingsForDay.map((r) => (
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
              disabled={saving || !roomId}
              type="submit"
            >
              {saving ? "Adding…" : "Add booking"}
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
