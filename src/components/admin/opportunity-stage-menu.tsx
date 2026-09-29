"use client";

import { useEffect, useRef, useState } from "react";

import { buttonClasses } from "@/components/ui/button";
import { Tooltip } from "@/components/ui/tooltip";
import { isLostStage } from "@/lib/ghl/stage-move";

// "Move to…" on a pipeline card: pick any other stage, see what the move
// sets off in GHL (the notice comes from the server, see stageMoveNotice),
// and confirm. A move to Lost asks for an optional reason, which becomes a
// note on the GHL contact. The board takes the card out of its current tab
// as soon as GHL accepts the move (onMoved).

export type StageMoveTarget = {
  key: string;
  name: string;
  notice: string | null;
};

export function OpportunityStageMenu({
  opportunityId,
  currentStageKey,
  stages,
  contactId,
  eventId,
  onMoved,
}: {
  opportunityId: string;
  currentStageKey: string;
  stages: StageMoveTarget[];
  contactId: string | null;
  eventId: string | null;
  onMoved: (stageKey: string, warning: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [target, setTarget] = useState<StageMoveTarget | null>(null);
  const [reason, setReason] = useState("");
  const [busy, setBusy] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const close = () => {
    setOpen(false);
    setTarget(null);
    setReason("");
    setError(null);
  };

  useEffect(() => {
    if (!open) return;
    const onMouseDown = (event: MouseEvent) => {
      if (rootRef.current?.contains(event.target as Node)) return;
      setOpen(false);
      setTarget(null);
      setReason("");
      setError(null);
    };
    document.addEventListener("mousedown", onMouseDown);
    return () => document.removeEventListener("mousedown", onMouseDown);
  }, [open]);

  const move = async () => {
    if (!target) return;
    setBusy(true);
    setError(null);
    try {
      const res = await fetch(
        `/api/ghl/opportunities/${encodeURIComponent(opportunityId)}/stage`,
        {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            stageId: target.key,
            fromStageId: currentStageKey === "orphaned" ? undefined : currentStageKey,
            contactId: contactId ?? undefined,
            reason: isLostStage(target.name) ? reason : undefined,
            eventId: eventId ?? undefined,
          }),
        },
      );
      const data = (await res.json()) as { noteError?: string | null; error?: string };
      if (!res.ok) throw new Error(data.error || "Unable to move the opportunity");
      close();
      onMoved(
        target.key,
        data.noteError
          ? `Moved to ${target.name}, but the note didn't save in GHL: ${data.noteError}`
          : null,
      );
    } catch (err) {
      setError(err instanceof Error ? err.message : "Unable to move the opportunity");
    } finally {
      setBusy(false);
    }
  };

  const choices = stages.filter((stage) => stage.key !== currentStageKey);
  const lost = target ? isLostStage(target.name) : false;

  return (
    <div className="relative" ref={rootRef}>
      <Tooltip align="end" label="Move to another stage">
        <button
          aria-expanded={open}
          aria-label="Move to another stage"
          className="rounded-full border border-slate-300 p-1.5 text-slate-600 transition hover:bg-slate-100 hover:text-slate-900"
          onClick={() => (open ? close() : setOpen(true))}
          type="button"
        >
          <MoveIcon />
        </button>
      </Tooltip>
      {open ? (
        <div
          className="absolute right-0 z-20 mt-1 w-72 rounded-lg border border-slate-200 bg-white p-2 shadow-xl"
          role="dialog"
        >
          {target ? (
            <div className="p-1">
              <p className="text-xs font-semibold text-slate-800">
                Move to {target.name}?
              </p>
              {target.notice ? (
                <p className="mt-0.5 text-xs text-slate-500">{target.notice}</p>
              ) : null}
              {lost ? (
                <input
                  autoFocus
                  className="mt-2 w-full rounded-md border border-slate-300 px-2 py-1.5 text-sm text-slate-800"
                  maxLength={500}
                  onChange={(event) => setReason(event.target.value)}
                  onKeyDown={(event) => {
                    if (event.key === "Enter") void move();
                    if (event.key === "Escape") close();
                  }}
                  placeholder="Reason (optional), e.g. went with another venue"
                  type="text"
                  value={reason}
                />
              ) : null}
              {error ? <p className="mt-1 text-xs text-red-700">{error}</p> : null}
              <div className="mt-2 flex justify-end gap-2">
                <button
                  className={buttonClasses("ghost", "sm")}
                  disabled={busy}
                  onClick={() => {
                    setTarget(null);
                    setError(null);
                  }}
                  type="button"
                >
                  Back
                </button>
                <button
                  autoFocus={!lost}
                  className={buttonClasses("primary", "sm")}
                  disabled={busy}
                  onClick={() => void move()}
                  type="button"
                >
                  {busy ? "Moving…" : "Move"}
                </button>
              </div>
            </div>
          ) : (
            <>
              <p className="px-2 pb-1 pt-0.5 text-xs font-semibold text-slate-500">
                Move to
              </p>
              <ul>
                {choices.map((stage) => (
                  <li key={stage.key}>
                    <button
                      className="w-full rounded-md px-2 py-1.5 text-left text-sm text-slate-800 hover:bg-slate-100"
                      onClick={() => setTarget(stage)}
                      type="button"
                    >
                      {stage.name}
                    </button>
                  </li>
                ))}
              </ul>
            </>
          )}
        </div>
      ) : null}
    </div>
  );
}

function MoveIcon() {
  return (
    <svg
      aria-hidden
      fill="none"
      height={15}
      stroke="currentColor"
      strokeLinecap="round"
      strokeLinejoin="round"
      strokeWidth="2"
      viewBox="0 0 24 24"
      width={15}
    >
      <path d="M4 8h13l-3.5-3.5M20 16H7l3.5 3.5" />
    </svg>
  );
}
