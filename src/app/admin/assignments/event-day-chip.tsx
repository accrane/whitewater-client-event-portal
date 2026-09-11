"use client";

import Link from "next/link";
import { useEffect, useState } from "react";

import { SlideOverCloseButton } from "@/components/admin/slide-over";
import { buttonClasses } from "@/components/ui/button";

// One calendar chip per event per day (not per room): the chip only says
// "this planner has this event today"; clicking it opens a summary of every
// room booked for the event, with a link out to the event page. Keeps a
// four-room event from stacking four tiles in one cell.

export type EventDayRoom = {
  id: string;
  roomName: string;
  roomColor: string;
  timeRange: string;
  status: "held" | "booked";
};

export type EventDaySummary = {
  key: string;
  title: string;
  plannerName: string;
  color: string;
  eventId: string | null;
  clientName: string | null;
  dateLabel: string;
  // Earliest start on this day, or "cont." when the event began earlier.
  timeLabel: string;
  rooms: EventDayRoom[];
  // True only when every room is still just held.
  allHeld: boolean;
};

export function EventDayChip({ summary }: { summary: EventDaySummary }) {
  const [open, setOpen] = useState(false);
  const roomsLabel =
    summary.rooms.length === 1
      ? summary.rooms[0].roomName
      : `${summary.rooms.length} rooms`;

  return (
    <>
      <button
        aria-haspopup="dialog"
        className="block w-full rounded-sm px-1.5 py-1 text-left text-[11px] leading-tight text-white transition hover:brightness-110"
        onClick={() => setOpen(true)}
        style={{
          backgroundColor: summary.color,
          opacity: summary.allHeld ? 0.55 : 1,
          outline: summary.allHeld ? `1.5px dashed ${summary.color}` : undefined,
          outlineOffset: summary.allHeld ? "-1.5px" : undefined,
        }}
        title={`${summary.title} · ${summary.plannerName} · ${roomsLabel}`}
        type="button"
      >
        <span className="block truncate font-semibold">
          <span className="font-normal opacity-90">{summary.timeLabel}</span>{" "}
          {summary.title}
        </span>
        <span className="block truncate text-[10px] opacity-85">
          {summary.plannerName} · {roomsLabel}
        </span>
      </button>
      {open ? (
        <EventSummaryDialog onClose={() => setOpen(false)} summary={summary} />
      ) : null}
    </>
  );
}

function EventSummaryDialog({
  onClose,
  summary,
}: {
  onClose: () => void;
  summary: EventDaySummary;
}) {
  useEffect(() => {
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [onClose]);

  const heldCount = summary.rooms.filter((room) => room.status === "held").length;

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4">
      <button
        aria-label="Close"
        className="absolute inset-0 bg-black/40"
        onClick={onClose}
        type="button"
      />
      <div
        aria-labelledby="event-summary-title"
        aria-modal="true"
        className="relative w-full max-w-md overflow-hidden rounded-xl border border-slate-200 bg-white shadow-2xl"
        role="dialog"
      >
        <div
          aria-hidden
          className="h-1.5"
          style={{ backgroundColor: summary.color }}
        />
        <header className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div className="min-w-0">
            <p className="type-label text-slate-500">Event summary</p>
            <h2
              className="mt-0.5 truncate text-base font-semibold text-slate-950"
              id="event-summary-title"
            >
              {summary.title}
            </h2>
            <p className="mt-0.5 text-xs text-slate-500">
              {summary.dateLabel} · {summary.plannerName}
              {summary.clientName ? ` · ${summary.clientName}` : ""}
            </p>
          </div>
          <div className="flex shrink-0 items-center gap-1">
            {summary.eventId ? (
              <Link
                className={buttonClasses("primary", "sm")}
                href={`/admin/events/${summary.eventId}`}
              >
                Open event
                <ArrowIcon />
              </Link>
            ) : null}
            <SlideOverCloseButton onClick={onClose} />
          </div>
        </header>

        <div className="px-5 py-4">
          <div className="flex items-baseline justify-between">
            <h3 className="text-xs font-semibold text-slate-700">
              {summary.rooms.length === 1
                ? "1 room"
                : `${summary.rooms.length} rooms`}
            </h3>
            {heldCount > 0 ? (
              <p className="text-xs text-slate-500">
                {heldCount === summary.rooms.length
                  ? "All held, not yet booked"
                  : `${heldCount} held`}
              </p>
            ) : null}
          </div>
          <ul className="mt-2 divide-y divide-slate-100 rounded-lg border border-slate-200">
            {summary.rooms.map((room) => (
              <li
                className="flex items-center gap-3 px-3 py-2 text-sm"
                key={room.id}
              >
                <span
                  aria-hidden
                  className="h-2.5 w-2.5 shrink-0 rounded-full"
                  style={{ backgroundColor: room.roomColor }}
                />
                <span className="min-w-0 flex-1 truncate font-medium text-slate-900">
                  {room.roomName}
                </span>
                <span className="shrink-0 text-xs text-slate-500">
                  {room.timeRange}
                </span>
                <span
                  className={`shrink-0 rounded-sm px-1.5 py-0.5 text-[11px] font-semibold ${
                    room.status === "booked"
                      ? "bg-emerald-50 text-emerald-700"
                      : "bg-amber-50 text-amber-700"
                  }`}
                >
                  {room.status === "booked" ? "Booked" : "Held"}
                </span>
              </li>
            ))}
          </ul>
          {!summary.eventId ? (
            <p className="mt-3 text-xs text-slate-500">
              This reservation isn&apos;t linked to a portal event yet. Link it
              from the Room Calendar to open the event from here.
            </p>
          ) : null}
        </div>
      </div>
    </div>
  );
}

function ArrowIcon() {
  return (
    <svg aria-hidden fill="none" height="14" stroke="currentColor" strokeWidth="2" viewBox="0 0 24 24" width="14">
      <path d="M7 17L17 7M9 7h8v8" strokeLinecap="round" strokeLinejoin="round" />
    </svg>
  );
}
