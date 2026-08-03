"use client";

import { useState } from "react";
import type { Room, RoomFormData } from "@/lib/calendar/types";

// Same palette as the seeded venue rooms, so new rooms stay visually
// consistent with the existing legend.
const ROOM_COLORS = [
  "#3B82F6",
  "#10B981",
  "#F59E0B",
  "#8B5CF6",
  "#EF4444",
  "#EC4899",
  "#14B8A6",
  "#F97316",
  "#6366F1",
  "#84CC16",
  "#A855F7",
  "#06B6D4",
  "#D946EF",
  "#0EA5E9",
  "#F43F5E",
  "#22C55E",
];

interface AddRoomModalProps {
  rooms: Room[];
  onClose: () => void;
  onSave: (data: RoomFormData) => Promise<void>;
}

export function AddRoomModal({ rooms, onClose, onSave }: AddRoomModalProps) {
  // Default to the least-used color so adjacent rooms stay distinguishable.
  const [color, setColor] = useState(() => {
    const used = new Set(rooms.map((r) => r.color.toUpperCase()));
    return ROOM_COLORS.find((c) => !used.has(c)) ?? ROOM_COLORS[0];
  });
  const [name, setName] = useState("");
  const [capacity, setCapacity] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);
    try {
      await onSave({
        name: name.trim(),
        color,
        capacity: capacity ? Number(capacity) : null,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to add room");
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
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-sm"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Add Room</h2>
          <button
            onClick={onClose}
            className="p-1 rounded-lg hover:bg-slate-100 text-slate-400"
            type="button"
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
          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Name
            </label>
            <input
              autoFocus
              required
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. River Deck"
              className={inputClass}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Color
            </label>
            <div className="flex flex-wrap gap-2">
              {ROOM_COLORS.map((c) => (
                <button
                  key={c}
                  type="button"
                  onClick={() => setColor(c)}
                  aria-label={`Color ${c}`}
                  aria-pressed={color === c}
                  className={`w-7 h-7 rounded-lg transition ${
                    color === c
                      ? "ring-2 ring-offset-2 ring-slate-800"
                      : "hover:scale-110"
                  }`}
                  style={{ backgroundColor: c }}
                />
              ))}
            </div>
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700 mb-1">
              Capacity{" "}
              <span className="font-normal text-slate-400">(optional)</span>
            </label>
            <input
              type="number"
              min={1}
              value={capacity}
              onChange={(e) => setCapacity(e.target.value)}
              placeholder="e.g. 40"
              className={inputClass}
            />
          </div>

          {error && (
            <div className="p-3 bg-red-50 border border-red-200 rounded-lg text-red-700 text-sm">
              {error}
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-sm font-medium text-slate-600 rounded-lg hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="px-4 py-2 text-sm font-semibold text-white bg-slate-950 rounded-lg hover:bg-slate-800 disabled:opacity-50"
            >
              {saving ? "Adding..." : "Add Room"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
