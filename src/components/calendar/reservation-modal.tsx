import { useState } from "react";
import type {
  Room,
  Reservation,
  ReservationFormData,
  Coordinator,
  PortalEventOption,
} from "@/lib/calendar/types";
import { format } from "date-fns";
import { StatusBadge } from "./status-badge";

// One room booking row in the form. Every block shares the linked event,
// date, and coordinator; blocks only differ by room, status, and times.
type RoomBlock = {
  key: number;
  room_id: string;
  status: "held" | "booked";
  start_time: string;
  end_time: string;
  error: string | null;
};

export type BlockFailure = { index: number; message: string };

// Rendered only while open, with a key derived from the reservation/defaults,
// so initial form state comes from the useState initializer on each open.
interface ReservationModalProps {
  onClose: () => void;
  // Edit mode: update the single reservation being edited.
  onSave: (data: ReservationFormData) => Promise<void>;
  // Create mode: create one reservation per block; resolves with the blocks
  // that failed (e.g. room conflicts) so the modal can keep them open.
  onCreateMany: (blocks: ReservationFormData[]) => Promise<BlockFailure[]>;
  onDelete?: () => Promise<void>;
  rooms: Room[];
  coordinators: Coordinator[];
  portalEvents: PortalEventOption[];
  reservation?: Reservation | null;
  defaultRoomId?: string;
  defaultStart?: Date;
}

let nextBlockKey = 1;

export function ReservationModal({
  onClose,
  onSave,
  onCreateMany,
  onDelete,
  rooms,
  coordinators,
  portalEvents,
  reservation,
  defaultRoomId,
  defaultStart,
}: ReservationModalProps) {
  const isEditing = !!reservation;

  const [eventId, setEventId] = useState(reservation?.event_id ?? "");
  const [coordinatorName, setCoordinatorName] = useState(
    reservation?.coordinator_name ?? "",
  );
  const [date, setDate] = useState(() => {
    if (reservation) return format(new Date(reservation.start_datetime), "yyyy-MM-dd");
    return format(defaultStart ?? new Date(), "yyyy-MM-dd");
  });
  // A slot click (defaultRoomId set) or an existing reservation carries a
  // deliberate date; picking an event must not overwrite it.
  const [dateEdited, setDateEdited] = useState(isEditing || !!defaultRoomId);

  const [blocks, setBlocks] = useState<RoomBlock[]>(() => {
    if (reservation) {
      return [
        {
          key: nextBlockKey++,
          room_id: reservation.room_id,
          status: reservation.status,
          start_time: format(new Date(reservation.start_datetime), "HH:mm"),
          end_time: format(new Date(reservation.end_datetime), "HH:mm"),
          error: null,
        },
      ];
    }
    const start = defaultStart ?? new Date();
    const end = new Date(start);
    end.setHours(end.getHours() + 1);
    return [
      {
        key: nextBlockKey++,
        room_id: defaultRoomId || rooms[0]?.id || "",
        status: "held",
        start_time: format(start, "HH:mm"),
        end_time: format(end, "HH:mm"),
        error: null,
      },
    ];
  });

  const [error, setError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);

  const selectedEvent = portalEvents.find((ev) => ev.id === eventId);

  const handleEventChange = (id: string) => {
    setEventId(id);
    const event = portalEvents.find((ev) => ev.id === id);
    if (event?.eventDate && !dateEdited) {
      setDate(event.eventDate);
    }
  };

  const updateBlock = (key: number, patch: Partial<RoomBlock>) => {
    setBlocks((prev) =>
      prev.map((b) => (b.key === key ? { ...b, ...patch, error: null } : b)),
    );
  };

  const addBlock = () => {
    setBlocks((prev) => {
      const last = prev[prev.length - 1];
      const usedRooms = new Set(prev.map((b) => b.room_id));
      const nextRoom = rooms.find((r) => !usedRooms.has(r.id)) ?? rooms[0];
      return [
        ...prev,
        {
          key: nextBlockKey++,
          room_id: nextRoom?.id || "",
          status: "held",
          start_time: last?.start_time ?? "09:00",
          end_time: last?.end_time ?? "17:00",
          error: null,
        },
      ];
    });
  };

  const removeBlock = (key: number) => {
    setBlocks((prev) =>
      prev.length > 1 ? prev.filter((b) => b.key !== key) : prev,
    );
  };

  const buildPayload = (block: RoomBlock): ReservationFormData => ({
    room_id: block.room_id,
    title: selectedEvent?.name ?? "Reservation",
    status: block.status,
    start_datetime: new Date(`${date}T${block.start_time}`).toISOString(),
    end_datetime: new Date(`${date}T${block.end_time}`).toISOString(),
    coordinator_name: coordinatorName || undefined,
    event_id: eventId,
  });

  const validate = (): boolean => {
    if (!eventId) {
      setError("Choose the event this reservation is for.");
      return false;
    }
    if (!date) {
      setError("Choose a date.");
      return false;
    }

    let valid = true;
    setBlocks((prev) =>
      prev.map((b) => {
        if (b.start_time >= b.end_time) {
          valid = false;
          return { ...b, error: "End time must be after start time" };
        }
        return { ...b, error: null };
      }),
    );

    if (!valid) setError(null);
    return valid;
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);
    if (!validate()) return;

    setSaving(true);
    try {
      if (isEditing) {
        await onSave(buildPayload(blocks[0]));
        onClose();
        return;
      }

      const failures = await onCreateMany(blocks.map(buildPayload));

      if (failures.length === 0) {
        onClose();
        return;
      }

      // Keep only the blocks that failed, annotated with their errors, so
      // the planner can adjust and resubmit without redoing the rest.
      setBlocks((prev) =>
        failures.map(({ index, message }) => ({
          ...prev[index],
          error: message,
        })),
      );
      setError(
        failures.length === blocks.length
          ? "No rooms could be reserved."
          : "Some rooms were reserved; the ones below failed.",
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const confirmBooking = async () => {
    setError(null);
    if (!validate()) return;
    setSaving(true);
    try {
      await onSave({ ...buildPayload(blocks[0]), status: "booked" });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save");
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    if (!onDelete || !confirm("Delete this reservation?")) return;
    setSaving(true);
    try {
      await onDelete();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to delete");
    } finally {
      setSaving(false);
    }
  };

  const inputClass =
    "w-full px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500";

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-lg max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-slate-800">
              {isEditing ? "Edit Reservation" : "New Reservation"}
            </h2>
            {isEditing && <StatusBadge status={reservation!.status} />}
          </div>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
          >
            <svg
              className="w-5 h-5"
              fill="none"
              stroke="currentColor"
              viewBox="0 0 24 24"
            >
              <path
                strokeLinecap="round"
                strokeLinejoin="round"
                strokeWidth={2}
                d="M6 18L18 6M6 6l12 12"
              />
            </svg>
          </button>
        </div>

        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          {/* Linked event — the reservation's identity; its name titles the blocks */}
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Event *
            </label>
            <select
              required
              value={eventId}
              onChange={(e) => handleEventChange(e.target.value)}
              className={inputClass}
            >
              <option value="">Choose an event…</option>
              {/* Keep an event linked before it left the active list */}
              {eventId && !portalEvents.some((ev) => ev.id === eventId) && (
                <option value={eventId}>Linked event</option>
              )}
              {portalEvents.map((event) => (
                <option key={event.id} value={event.id}>
                  {event.label}
                </option>
              ))}
            </select>
            <p className="mt-1 text-xs text-slate-400">
              Reserving a room moves this event&apos;s GHL opportunity to the
              Planning stage.
            </p>
          </div>

          {/* Date and coordinator */}
          <div className="grid grid-cols-2 gap-3">
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Date *
              </label>
              <input
                type="date"
                required
                value={date}
                onChange={(e) => {
                  setDate(e.target.value);
                  setDateEdited(true);
                }}
                className={inputClass}
              />
              {selectedEvent?.eventDate && (
                <p className="mt-1 text-xs text-slate-400">
                  Date of interest: {selectedEvent.eventDate}
                </p>
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-slate-700 mb-1">
                Event Coordinator
              </label>
              <select
                value={coordinatorName}
                onChange={(e) => setCoordinatorName(e.target.value)}
                className={inputClass}
              >
                <option value="">None</option>
                {/* Keep a coordinator assigned before they were removed from settings */}
                {coordinatorName &&
                  !coordinators.some((c) => c.name === coordinatorName) && (
                    <option value={coordinatorName}>{coordinatorName}</option>
                  )}
                {coordinators.map((coordinator) => (
                  <option key={coordinator.id} value={coordinator.name}>
                    {coordinator.name}
                  </option>
                ))}
              </select>
            </div>
          </div>

          {/* Divider */}
          <div className="flex items-center gap-3 pt-1">
            <span className="text-xs font-semibold uppercase tracking-wide text-slate-400">
              {isEditing ? "Room" : "Rooms"}
            </span>
            <div className="h-px flex-1 bg-slate-200" />
          </div>

          {/* Room blocks */}
          {blocks.map((block) => {
            const room = rooms.find((r) => r.id === block.room_id);
            return (
              <div
                key={block.key}
                className={`rounded-xl border p-3 space-y-3 ${
                  block.error
                    ? "border-red-300 bg-red-50/50"
                    : "border-slate-200 bg-slate-50/50"
                }`}
              >
                {block.error && (
                  <p className="text-xs text-red-600">{block.error}</p>
                )}
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Room *
                    </label>
                    <select
                      required
                      value={block.room_id}
                      onChange={(e) =>
                        updateBlock(block.key, { room_id: e.target.value })
                      }
                      className={inputClass}
                    >
                      {rooms.map((r) => (
                        <option key={r.id} value={r.id}>
                          {r.name}
                        </option>
                      ))}
                    </select>
                    {room && (
                      <div className="flex items-center gap-1.5 mt-1">
                        <div
                          className="w-2.5 h-2.5 rounded-sm"
                          style={{ backgroundColor: room.color }}
                        />
                        <span className="text-xs text-slate-400">
                          {room.capacity ? `Capacity: ${room.capacity}` : ""}
                        </span>
                      </div>
                    )}
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Status *
                    </label>
                    <select
                      required
                      value={block.status}
                      onChange={(e) =>
                        updateBlock(block.key, {
                          status: e.target.value as "held" | "booked",
                        })
                      }
                      className={inputClass}
                    >
                      <option value="held">Held</option>
                      <option value="booked">Booked</option>
                    </select>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-3">
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      Start Time *
                    </label>
                    <input
                      type="time"
                      required
                      value={block.start_time}
                      onChange={(e) =>
                        updateBlock(block.key, { start_time: e.target.value })
                      }
                      className={inputClass}
                    />
                  </div>
                  <div>
                    <label className="block text-sm font-medium text-slate-700 mb-1">
                      End Time *
                    </label>
                    <input
                      type="time"
                      required
                      value={block.end_time}
                      onChange={(e) =>
                        updateBlock(block.key, { end_time: e.target.value })
                      }
                      className={inputClass}
                    />
                  </div>
                </div>
                {!isEditing && blocks.length > 1 && (
                  <div className="flex justify-end">
                    <button
                      type="button"
                      onClick={() => removeBlock(block.key)}
                      className="text-xs text-slate-400 hover:text-red-600 transition-colors"
                    >
                      Remove room
                    </button>
                  </div>
                )}
              </div>
            );
          })}

          {!isEditing && (
            <button
              type="button"
              onClick={addBlock}
              className="w-full px-3 py-2 text-sm font-medium text-blue-600 border border-dashed border-blue-300 rounded-lg hover:bg-blue-50 transition-colors"
            >
              + Reserve another room
            </button>
          )}

          {/* Actions */}
          <div className="flex items-center justify-between pt-2">
            <div>
              {isEditing && onDelete && (
                <button
                  type="button"
                  onClick={handleDelete}
                  disabled={saving}
                  className="px-4 py-2 text-sm text-red-600 hover:bg-red-50 rounded-lg transition-colors"
                >
                  Delete
                </button>
              )}
            </div>
            <div className="flex items-center gap-2">
              {isEditing && reservation!.status === "held" && (
                <button
                  type="button"
                  onClick={confirmBooking}
                  disabled={saving}
                  className="px-4 py-2 text-sm font-medium bg-emerald-600 text-white rounded-lg hover:bg-emerald-700 transition-colors disabled:opacity-50"
                >
                  Confirm Booking
                </button>
              )}
              <button
                type="button"
                onClick={onClose}
                className="px-4 py-2 text-sm text-slate-600 hover:bg-slate-100 rounded-lg transition-colors"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
              >
                {saving
                  ? "Saving..."
                  : isEditing
                    ? "Update"
                    : blocks.length > 1
                      ? `Reserve ${blocks.length} Rooms`
                      : "Reserve"}
              </button>
            </div>
          </div>
        </form>
      </div>
    </div>
  );
}
