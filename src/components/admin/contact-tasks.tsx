"use client";

import { useCallback, useEffect, useState } from "react";

import { useContactBadges } from "@/components/admin/contact-badges";
import { SlideOver, SlideOverCloseButton } from "@/components/admin/slide-over";
import { buttonClasses } from "@/components/ui/button";

// Tasks button + slide-in drawer for the primary contact's GHL tasks. Reads
// live from GHL, creates tasks, and checks them off exactly like GHL's own
// task list — every change writes straight back. The badge counts OPEN
// tasks so planners see outstanding work before opening the drawer.

type ContactTask = {
  id: string;
  title: string;
  body: string;
  dueDate: string | null;
  completed: boolean;
  assignedTo: string | null;
  assigneeName: string | null;
};

type GhlUserOption = { id: string; name: string };

function formatDueDate(iso: string | null): string {
  if (!iso) return "No due date";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

// Default due date for the create form: tomorrow at 9:00 AM local, in the
// datetime-local input format.
function defaultDueDateValue(): string {
  const due = new Date();
  due.setDate(due.getDate() + 1);
  due.setHours(9, 0, 0, 0);
  const pad = (n: number) => String(n).padStart(2, "0");
  return `${due.getFullYear()}-${pad(due.getMonth() + 1)}-${pad(due.getDate())}T${pad(due.getHours())}:${pad(due.getMinutes())}`;
}

export function ContactTasksButton({
  contactId,
  contactName,
  eventId,
  compact = false,
}: {
  // GHL contact id; null renders the button disabled.
  contactId: string | null;
  contactName: string | null;
  // Portal event id, when opened from an event page — links integration log
  // rows back to the event.
  eventId?: string;
  // Smaller trigger for tight spots like opportunity cards. Compact buttons
  // skip the per-contact badge prefetch — boards supply counts through the
  // batched ContactBadgesLoader context instead.
  compact?: boolean;
}) {
  const [open, setOpen] = useState(false);
  // null = no fresh local count yet; the batched context (or 0) fills in.
  const [localCount, setLocalCount] = useState<number | null>(null);
  const contextBadges = useContactBadges();
  const openTaskCount =
    localCount ??
    (contactId ? (contextBadges?.[contactId]?.openTaskCount ?? 0) : 0);

  // Badge count loads in the background on mount; the drawer keeps it
  // current afterwards via onTasksChanged.
  useEffect(() => {
    if (!contactId || compact) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/ghl/contacts/${contactId}/tasks`);
        if (!res.ok) return;
        const data = (await res.json()) as { tasks?: { completed?: boolean }[] };
        if (!cancelled) {
          setLocalCount(
            (data.tasks ?? []).filter((task) => !task.completed).length,
          );
        }
      } catch {
        // Badge is best-effort; the drawer surfaces real errors.
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [contactId, compact]);

  return (
    <>
      <button
        aria-label="Open tasks for this contact"
        className={`relative rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 ${
          compact ? "p-1.5" : "p-2"
        }`}
        disabled={!contactId}
        onClick={() => setOpen(true)}
        title={contactId ? "View tasks" : "No GHL contact linked"}
        type="button"
      >
        <TasksIcon size={compact ? 15 : 20} />
        {openTaskCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {openTaskCount > 9 ? "9+" : openTaskCount}
          </span>
        ) : null}
      </button>
      {open && contactId ? (
        <TasksDrawer
          contactId={contactId}
          contactName={contactName}
          eventId={eventId}
          onClose={() => setOpen(false)}
          onTasksChanged={setLocalCount}
        />
      ) : null}
    </>
  );
}

function TasksDrawer({
  contactId,
  contactName,
  eventId,
  onClose,
  onTasksChanged,
}: {
  contactId: string;
  contactName: string | null;
  eventId?: string;
  onClose: () => void;
  onTasksChanged: (openCount: number) => void;
}) {
  const [tasks, setTasks] = useState<ContactTask[]>([]);
  const [users, setUsers] = useState<GhlUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  // Tasks whose completed-toggle is currently in flight.
  const [togglingIds, setTogglingIds] = useState<Set<string>>(new Set());
  const [toggleError, setToggleError] = useState<string | null>(null);

  const [title, setTitle] = useState("");
  const [description, setDescription] = useState("");
  const [dueDate, setDueDate] = useState(defaultDueDateValue);
  const [assignedTo, setAssignedTo] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // State updates only happen after the fetch resolves (loading starts
  // true), so the initial effect never sets state synchronously.
  const loadTasks = useCallback(async () => {
    try {
      const res = await fetch(`/api/ghl/contacts/${contactId}/tasks`);
      const data = (await res.json()) as {
        tasks?: ContactTask[];
        users?: GhlUserOption[];
        currentGhlUserId?: string | null;
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Unable to load tasks");
      }
      setTasks(data.tasks ?? []);
      setUsers(data.users ?? []);
      setLoadError(null);
      onTasksChanged((data.tasks ?? []).filter((task) => !task.completed).length);
      // Default new tasks to the signed-in planner's GHL user; a picked
      // assignee is never overwritten.
      if (data.currentGhlUserId) {
        setAssignedTo((current) => current || data.currentGhlUserId || "");
      }
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load tasks",
      );
    } finally {
      setLoading(false);
    }
  }, [contactId, onTasksChanged]);

  useEffect(() => {
    (async () => {
      await loadTasks();
    })();
  }, [loadTasks]);

  const handleToggle = async (task: ContactTask) => {
    if (togglingIds.has(task.id)) return;
    setTogglingIds((ids) => new Set(ids).add(task.id));
    setToggleError(null);
    // Optimistic tick, reverted by the reload on failure.
    setTasks((current) =>
      current.map((t) =>
        t.id === task.id ? { ...t, completed: !task.completed } : t,
      ),
    );
    try {
      const res = await fetch(`/api/ghl/contacts/${contactId}/tasks`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          taskId: task.id,
          completed: !task.completed,
          eventId,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Unable to update the task");
      }
    } catch (error) {
      setToggleError(
        error instanceof Error ? error.message : "Unable to update the task",
      );
    } finally {
      setTogglingIds((ids) => {
        const next = new Set(ids);
        next.delete(task.id);
        return next;
      });
      await loadTasks();
    }
  };

  const handleCreate = async () => {
    if (!title.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/ghl/contacts/${contactId}/tasks`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          title,
          body: description,
          eventId,
          dueDate: dueDate ? new Date(dueDate).toISOString() : "",
          assignedTo: assignedTo || undefined,
        }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Unable to create the task");
      }
      setTitle("");
      setDescription("");
      setDueDate(defaultDueDateValue());
      await loadTasks();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to create the task",
      );
    } finally {
      setSaving(false);
    }
  };

  return (
    <SlideOver onClose={onClose}>
      {(requestClose) => (
        <>
          <header className="flex items-start justify-between gap-3 border-b border-slate-200 p-5">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                Tasks
              </p>
              <h2 className="mt-0.5 text-lg font-semibold text-slate-950">
                {contactName || "Event contact"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Synced live from GoHighLevel. Creating and checking off tasks
                here updates GHL directly.
              </p>
            </div>
            <SlideOverCloseButton onClick={requestClose} />
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5">
            {toggleError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-3 text-xs text-red-800">
                {toggleError}
              </div>
            ) : null}
            {loading ? (
              <p className="text-sm text-slate-500">Loading tasks…</p>
            ) : loadError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                {loadError}
              </div>
            ) : tasks.length === 0 ? (
              <p className="text-sm text-slate-500">
                No tasks on this contact yet.
              </p>
            ) : (
              tasks.map((task) => {
                const overdue =
                  !task.completed &&
                  task.dueDate !== null &&
                  new Date(task.dueDate).getTime() < Date.now();

                return (
                  <label
                    className={`flex cursor-pointer items-start gap-3 rounded-xl border p-4 shadow-sm transition ${
                      task.completed
                        ? "border-slate-200 bg-white/60"
                        : "border-slate-200 bg-white hover:border-slate-300"
                    }`}
                    key={task.id}
                  >
                    <input
                      checked={task.completed}
                      className="mt-0.5 h-4 w-4 rounded border-slate-300"
                      disabled={togglingIds.has(task.id)}
                      onChange={() => void handleToggle(task)}
                      type="checkbox"
                    />
                    <span className="min-w-0 flex-1">
                      <span
                        className={`block text-sm font-semibold ${
                          task.completed
                            ? "text-slate-400 line-through"
                            : "text-slate-950"
                        }`}
                      >
                        {task.title || "(untitled task)"}
                      </span>
                      {task.body ? (
                        <span
                          className={`mt-0.5 block whitespace-pre-wrap break-words text-sm leading-5 ${
                            task.completed ? "text-slate-400" : "text-slate-600"
                          }`}
                        >
                          {task.body}
                        </span>
                      ) : null}
                      <span
                        className={`mt-1 block text-xs ${
                          overdue ? "font-semibold text-red-600" : "text-slate-500"
                        }`}
                      >
                        {overdue ? "Overdue · " : "Due "}
                        {formatDueDate(task.dueDate)}
                        {task.assigneeName ? ` · ${task.assigneeName}` : ""}
                      </span>
                    </span>
                  </label>
                );
              })
            )}
          </div>

          <footer className="space-y-2 border-t border-slate-200 p-4">
            {saveError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {saveError}
              </p>
            ) : null}
            <input
              className="w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
              onChange={(e) => setTitle(e.target.value)}
              placeholder="New task title"
              type="text"
              value={title}
            />
            <textarea
              className="min-h-14 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
              onChange={(e) => setDescription(e.target.value)}
              placeholder="Description (optional)"
              value={description}
            />
            <div className="flex flex-wrap items-center gap-2">
              <input
                className="rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
                onChange={(e) => setDueDate(e.target.value)}
                type="datetime-local"
                value={dueDate}
              />
              <select
                className="min-w-0 flex-1 rounded-lg border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
                onChange={(e) => setAssignedTo(e.target.value)}
                value={assignedTo}
              >
                <option value="">Unassigned</option>
                {users.map((user) => (
                  <option key={user.id} value={user.id}>
                    {user.name}
                  </option>
                ))}
              </select>
              <button
                className={buttonClasses("primary", "sm")}
                disabled={saving || !title.trim() || !dueDate}
                onClick={() => void handleCreate()}
                type="button"
              >
                {saving ? "Adding…" : "Add task"}
              </button>
            </div>
          </footer>
        </>
      )}
    </SlideOver>
  );
}

function TasksIcon({ size = 20 }: { size?: number }) {
  return (
    <svg
      fill="none"
      height={size}
      stroke="currentColor"
      strokeWidth="1.8"
      viewBox="0 0 24 24"
      width={size}
    >
      <path
        d="M9 6h11M9 12h11M9 18h11M4 5.5 5 6.5 7 4.5M4 11.5l1 1 2-2M4 17.5l1 1 2-2"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
