"use client";

import { useCallback, useEffect, useState } from "react";

import { useContactBadges } from "@/components/admin/contact-badges";
import { SlideOver, SlideOverCloseButton } from "@/components/admin/slide-over";
import { buttonClasses } from "@/components/ui/button";

// Notepad button + slide-in drawer for the primary contact's GHL notes.
// Notes are read live from GHL and new ones write straight back, so the
// event page and GHL always show the same list. The button wears a
// notification badge with the note count so planners see there's something
// to read before opening the drawer.

type ContactNote = {
  id: string;
  body: string;
  dateAdded: string | null;
  authorName: string | null;
};

function formatNoteDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function ContactNotesButton({
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
  const noteCount =
    localCount ??
    (contactId ? (contextBadges?.[contactId]?.noteCount ?? 0) : 0);

  // Badge count loads in the background on mount; the drawer keeps it
  // current afterwards via onNotesChanged.
  useEffect(() => {
    if (!contactId || compact) return;
    let cancelled = false;

    (async () => {
      try {
        const res = await fetch(`/api/ghl/contacts/${contactId}/notes`);
        if (!res.ok) return;
        const data = (await res.json()) as { notes?: unknown[] };
        if (!cancelled) setLocalCount(data.notes?.length ?? 0);
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
        aria-label="Open notes for this contact"
        className={`relative rounded-full border border-slate-300 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900 disabled:cursor-not-allowed disabled:opacity-40 ${
          compact ? "p-1.5" : "p-2"
        }`}
        disabled={!contactId}
        onClick={() => setOpen(true)}
        title={contactId ? "View notes" : "No GHL contact linked"}
        type="button"
      >
        <NotepadIcon size={compact ? 15 : 20} />
        {noteCount > 0 ? (
          <span className="absolute -right-1 -top-1 flex h-4 min-w-4 items-center justify-center rounded-full bg-red-600 px-1 text-[10px] font-bold leading-none text-white ring-2 ring-white">
            {noteCount > 9 ? "9+" : noteCount}
          </span>
        ) : null}
      </button>
      {open && contactId ? (
        <NotesDrawer
          contactId={contactId}
          contactName={contactName}
          eventId={eventId}
          onClose={() => setOpen(false)}
          onNotesChanged={setLocalCount}
        />
      ) : null}
    </>
  );
}

function NotesDrawer({
  contactId,
  contactName,
  eventId,
  onClose,
  onNotesChanged,
}: {
  contactId: string;
  contactName: string | null;
  eventId?: string;
  onClose: () => void;
  onNotesChanged: (count: number) => void;
}) {
  const [notes, setNotes] = useState<ContactNote[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);

  const [body, setBody] = useState("");
  const [saving, setSaving] = useState(false);
  const [saveError, setSaveError] = useState<string | null>(null);

  // State updates only happen after the fetch resolves (loading starts
  // true), so the initial effect never sets state synchronously.
  const loadNotes = useCallback(async () => {
    try {
      const res = await fetch(`/api/ghl/contacts/${contactId}/notes`);
      const data = (await res.json()) as {
        notes?: ContactNote[];
        error?: string;
      };
      if (!res.ok) {
        throw new Error(data.error || "Unable to load notes");
      }
      setNotes(data.notes ?? []);
      setLoadError(null);
      onNotesChanged(data.notes?.length ?? 0);
    } catch (error) {
      setLoadError(
        error instanceof Error ? error.message : "Unable to load notes",
      );
    } finally {
      setLoading(false);
    }
  }, [contactId, onNotesChanged]);

  useEffect(() => {
    (async () => {
      await loadNotes();
    })();
  }, [loadNotes]);

  const handleSave = async () => {
    if (!body.trim() || saving) return;
    setSaving(true);
    setSaveError(null);
    try {
      const res = await fetch(`/api/ghl/contacts/${contactId}/notes`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ body, eventId }),
      });
      const data = (await res.json()) as { error?: string };
      if (!res.ok) {
        throw new Error(data.error || "Unable to save the note");
      }
      setBody("");
      await loadNotes();
    } catch (error) {
      setSaveError(
        error instanceof Error ? error.message : "Unable to save the note",
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
                Notes
              </p>
              <h2 className="mt-0.5 text-lg font-semibold text-slate-950">
                {contactName || "Event contact"}
              </h2>
              <p className="mt-0.5 text-xs text-slate-500">
                Synced live from GoHighLevel. New notes save to the GHL
                contact so both tools stay in step.
              </p>
            </div>
            <SlideOverCloseButton onClick={requestClose} />
          </header>

          <div className="flex-1 space-y-3 overflow-y-auto bg-slate-50 p-5">
            {loading ? (
              <p className="text-sm text-slate-500">Loading notes…</p>
            ) : loadError ? (
              <div className="rounded-lg border border-red-200 bg-red-50 p-4 text-sm text-red-800">
                {loadError}
              </div>
            ) : notes.length === 0 ? (
              <p className="text-sm text-slate-500">
                No notes on this contact yet.
              </p>
            ) : (
              notes.map((note) => (
                <div
                  className="rounded-xl border border-amber-200 bg-amber-50 p-4 shadow-sm"
                  key={note.id}
                >
                  <p className="text-[11px] font-semibold uppercase tracking-wide text-amber-800">
                    {note.authorName || "GHL"}
                    {" · "}
                    {formatNoteDate(note.dateAdded)}
                  </p>
                  <p className="mt-1.5 whitespace-pre-wrap break-words text-sm leading-5 text-slate-800">
                    {note.body || "(empty note)"}
                  </p>
                </div>
              ))
            )}
          </div>

          <footer className="space-y-2 border-t border-slate-200 p-4">
            {saveError ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
                {saveError}
              </p>
            ) : null}
            <textarea
              className="min-h-20 w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800"
              onChange={(e) => setBody(e.target.value)}
              placeholder="Add a note about this contact…"
              value={body}
            />
            <div className="flex justify-end">
              <button
                className={buttonClasses("primary", "sm")}
                disabled={saving || !body.trim()}
                onClick={() => void handleSave()}
                type="button"
              >
                {saving ? "Saving…" : "Add note"}
              </button>
            </div>
          </footer>
        </>
      )}
    </SlideOver>
  );
}

function NotepadIcon({ size = 20 }: { size?: number }) {
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
        d="M16 3v4M8 3v4M4 7h16M6 5h12a2 2 0 0 1 2 2v12a2 2 0 0 1-2 2H6a2 2 0 0 1-2-2V7a2 2 0 0 1 2-2zM8 12h8M8 16h5"
        strokeLinecap="round"
        strokeLinejoin="round"
      />
    </svg>
  );
}
