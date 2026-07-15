import { useState } from "react";
import type { Coordinator } from "@/lib/calendar/types";
import { api } from "@/lib/calendar/api";

interface SettingsModalProps {
  isOpen: boolean;
  onClose: () => void;
  coordinators: Coordinator[];
  onChanged: () => Promise<void>;
}

export function SettingsModal({
  isOpen,
  onClose,
  coordinators,
  onChanged,
}: SettingsModalProps) {
  const [newName, setNewName] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [busy, setBusy] = useState(false);

  if (!isOpen) return null;

  const handleAdd = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!newName.trim()) return;
    setError(null);
    setBusy(true);
    try {
      await api.coordinators.create(newName.trim());
      setNewName("");
      await onChanged();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to add coordinator",
      );
    } finally {
      setBusy(false);
    }
  };

  const handleDelete = async (coordinator: Coordinator) => {
    if (
      !confirm(
        `Remove ${coordinator.name}? Existing events keep their assigned coordinator.`,
      )
    )
      return;
    setError(null);
    setBusy(true);
    try {
      await api.coordinators.delete(coordinator.id);
      await onChanged();
    } catch (err) {
      setError(
        err instanceof Error ? err.message : "Failed to remove coordinator",
      );
    } finally {
      setBusy(false);
    }
  };

  return (
    <div
      className="fixed inset-0 z-50 flex items-center justify-center p-4"
      onClick={onClose}
    >
      {/* Backdrop */}
      <div className="absolute inset-0 bg-black/40" />

      {/* Modal */}
      <div
        className="relative bg-white rounded-2xl shadow-xl w-full max-w-md max-h-[90vh] overflow-y-auto"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-200">
          <h2 className="text-lg font-semibold text-slate-800">Settings</h2>
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

        <div className="p-6 space-y-4">
          {error && (
            <div className="p-3 rounded-lg bg-red-50 border border-red-200 text-red-700 text-sm">
              {error}
            </div>
          )}

          <div>
            <h3 className="text-sm font-medium text-slate-700 mb-2">
              Event Coordinators
            </h3>
            {coordinators.length === 0 ? (
              <p className="text-sm text-slate-400 py-2">
                No coordinators yet. Add one below.
              </p>
            ) : (
              <ul className="divide-y divide-slate-100 border border-slate-200 rounded-lg">
                {coordinators.map((coordinator) => (
                  <li
                    key={coordinator.id}
                    className="flex items-center justify-between px-3 py-2"
                  >
                    <span className="text-sm text-slate-700">
                      {coordinator.name}
                    </span>
                    <button
                      onClick={() => handleDelete(coordinator)}
                      disabled={busy}
                      className="p-1 rounded hover:bg-red-50 text-slate-400 hover:text-red-600 transition-colors"
                      title={`Remove ${coordinator.name}`}
                    >
                      <svg
                        className="w-4 h-4"
                        fill="none"
                        stroke="currentColor"
                        viewBox="0 0 24 24"
                      >
                        <path
                          strokeLinecap="round"
                          strokeLinejoin="round"
                          strokeWidth={2}
                          d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
                        />
                      </svg>
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </div>

          <form onSubmit={handleAdd} className="flex gap-2">
            <input
              type="text"
              value={newName}
              onChange={(e) => setNewName(e.target.value)}
              className="flex-1 px-3 py-2 border border-slate-300 rounded-lg text-sm focus:outline-none focus:ring-2 focus:ring-blue-500"
              placeholder="Coordinator name"
            />
            <button
              type="submit"
              disabled={busy || !newName.trim()}
              className="px-4 py-2 text-sm font-medium bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition-colors disabled:opacity-50"
            >
              Add
            </button>
          </form>
        </div>
      </div>
    </div>
  );
}
