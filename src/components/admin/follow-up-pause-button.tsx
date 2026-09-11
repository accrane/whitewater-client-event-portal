"use client";

import { useRouter } from "next/navigation";
import { useEffect, useRef, useState } from "react";

import { buttonClasses } from "@/components/ui/button";
import { StatusBadge } from "@/components/ui/status-badge";

// "Pause follow-ups" switch for a GHL contact, used on opportunity cards,
// in the conversations drawer, on the event page, and on the dashboard's
// paused list. Paused → an amber badge plus Resume; not paused → a Pause
// control that asks for an optional reason (the call that GHL never saw).
// Pass `initialPause` when the page already knows the state (cards get it
// in one bulk query); leave it undefined and the button asks the API.

export type FollowUpPauseSummary = {
  pausedAt: string;
  pausedBy: string | null;
  reason: string | null;
};

export function FollowUpPauseButton({
  contactId,
  contactName,
  opportunityId,
  eventId,
  initialPause,
  compact = false,
}: {
  contactId: string;
  contactName: string | null;
  opportunityId?: string | null;
  eventId?: string | null;
  initialPause?: FollowUpPauseSummary | null;
  compact?: boolean;
}) {
  const router = useRouter();
  const [pause, setPause] = useState<FollowUpPauseSummary | null | undefined>(
    initialPause,
  );
  const [open, setOpen] = useState(false);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    if (initialPause !== undefined) return;
    let cancelled = false;
    (async () => {
      try {
        const res = await fetch(`/api/ghl/contacts/${contactId}/follow-ups`);
        const data = (await res.json()) as { pause?: FollowUpPauseSummary | null };
        if (!cancelled) setPause(res.ok ? (data.pause ?? null) : null);
      } catch {
        if (!cancelled) setPause(null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [contactId, initialPause]);

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) setOpen(false);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const act = async (action: "pause" | "resume") => {
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(`/api/ghl/contacts/${contactId}/follow-ups`, {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          action,
          reason: action === "pause" ? reason : undefined,
          opportunityId: opportunityId ?? undefined,
          contactName: contactName ?? undefined,
          eventId: eventId ?? undefined,
        }),
      });
      const data = (await res.json()) as {
        pause?: FollowUpPauseSummary | null;
        error?: string;
      };
      if (!res.ok) throw new Error(data.error || "Unable to update follow-ups");
      setPause(data.pause ?? null);
      setOpen(false);
      setReason("");
      router.refresh();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to update follow-ups");
    } finally {
      setBusy(false);
    }
  };

  if (pause === undefined) return null;

  if (pause) {
    const since = new Date(pause.pausedAt).toLocaleDateString("en-US", {
      month: "short",
      day: "numeric",
    });
    return (
      <div className="flex items-center gap-1.5" ref={rootRef}>
        <span
          title={`Follow-ups paused since ${since}${pause.pausedBy ? ` by ${pause.pausedBy}` : ""}${pause.reason ? `: ${pause.reason}` : ""}`}
        >
          <StatusBadge tone="warning">Paused</StatusBadge>
        </span>
        <button
          className="text-xs font-semibold text-slate-600 underline-offset-2 hover:text-slate-950 hover:underline disabled:opacity-50"
          disabled={busy}
          onClick={() => void act("resume")}
          title="Resume automated follow-ups for this contact"
          type="button"
        >
          {busy ? "Resuming…" : "Resume"}
        </button>
        {error ? <span className="text-xs text-red-700">{error}</span> : null}
      </div>
    );
  }

  return (
    <div className="relative" ref={rootRef}>
      <button
        aria-expanded={open}
        className={
          compact
            ? "rounded-full border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
            : `${buttonClasses("secondary", "sm")} gap-1.5`
        }
        onClick={() => setOpen((value) => !value)}
        title="Pause automated follow-ups (e.g. after a phone call)"
        type="button"
      >
        <PauseIcon size={compact ? 15 : 14} />
        {compact ? null : "Pause follow-ups"}
      </button>
      {open ? (
        <div
          className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-3 shadow-xl"
          role="dialog"
        >
          <p className="text-xs font-semibold text-slate-800">
            Pause follow-ups for {contactName || "this contact"}
          </p>
          <p className="mt-0.5 text-xs text-slate-500">
            GHL&apos;s automated chase messages will skip them until someone
            resumes. A note is added to the GHL contact.
          </p>
          <input
            autoFocus
            className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
            maxLength={300}
            onChange={(event) => setReason(event.target.value)}
            onKeyDown={(event) => {
              if (event.key === "Enter") void act("pause");
              if (event.key === "Escape") setOpen(false);
            }}
            placeholder="Reason (optional), e.g. spoke by phone"
            type="text"
            value={reason}
          />
          {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
          <div className="mt-2 flex justify-end gap-2">
            <button
              className={buttonClasses("ghost", "sm")}
              onClick={() => setOpen(false)}
              type="button"
            >
              Cancel
            </button>
            <button
              className={buttonClasses("primary", "sm")}
              disabled={busy}
              onClick={() => void act("pause")}
              type="button"
            >
              {busy ? "Pausing…" : "Pause"}
            </button>
          </div>
        </div>
      ) : null}
    </div>
  );
}

function PauseIcon({ size }: { size: number }) {
  return (
    <svg
      aria-hidden
      fill="none"
      height={size}
      stroke="currentColor"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={size}
    >
      <rect height="14" rx="1" width="3.5" x="6.5" y="5" />
      <rect height="14" rx="1" width="3.5" x="14" y="5" />
    </svg>
  );
}
