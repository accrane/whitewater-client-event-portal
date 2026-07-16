"use client";

import { useEffect, useRef, useState, type MouseEvent } from "react";
import { createPortal } from "react-dom";

import { noteHtmlHasContent, type ScheduleTileFields } from "@/lib/schedule";

// Collapsed note height in px; keeps side notes from overlapping the next
// tile's note until the reader expands them.
const NOTE_CLAMP_PX = 176;

type ScheduleTimelineProps = {
  items: ScheduleTileFields[];
};

// Client-facing schedule template: repeatable tiles stacked as a timeline.
// Tiles with notes get a "!" badge; the note shows to the right on desktop
// (connected to the badge) and expands below the tile on mobile.
export function ScheduleTimeline({ items }: ScheduleTimelineProps) {
  if (items.length === 0) return null;

  return (
    <div className="relative space-y-8">
      {/* Timeline rail behind the tiles */}
      <div
        aria-hidden
        className="absolute top-4 bottom-4 left-5 w-px bg-slate-300 sm:left-6"
      />
      {items.map((item) => (
        <TimelineTile item={item} key={item.id} />
      ))}
    </div>
  );
}

function TimelineTile({ item }: { item: ScheduleTileFields }) {
  const [mobileOpen, setMobileOpen] = useState(false);
  const hasNote = noteHtmlHasContent(item.note_html);

  return (
    <div className="relative grid gap-x-14 md:grid-cols-[minmax(0,22rem)_minmax(0,1fr)]">
      <div className="relative rounded-lg border border-slate-300 bg-white p-5 shadow-sm">
        <div className="flex items-start justify-between gap-3">
          <h3 className="text-lg font-semibold text-slate-950">{item.title}</h3>
          {hasNote && (
            <button
              aria-expanded={mobileOpen}
              aria-label={`Notes for ${item.title}`}
              className="flex h-6 w-6 shrink-0 items-center justify-center rounded-full border border-amber-400 bg-amber-100 text-xs font-bold text-amber-700 transition hover:bg-amber-200 md:cursor-default"
              onClick={() => setMobileOpen((open) => !open)}
              type="button"
            >
              !
            </button>
          )}
        </div>
        {item.description && (
          <p className="mt-1 min-h-16 text-sm leading-6 text-slate-600">
            {item.description}
          </p>
        )}

        {/* Mobile: note tucks behind the tile until the "!" badge is tapped */}
        {hasNote && mobileOpen && (
          <div className="mt-4 border-t border-slate-200 pt-4 md:hidden">
            <NotePanel html={item.note_html} />
          </div>
        )}
      </div>

      {/* Desktop: note floats to the right, connected to the badge */}
      {hasNote && (
        <div className="relative hidden pt-4 md:block">
          <div
            aria-hidden
            className="absolute top-7 -left-14 h-px w-14 bg-slate-400"
          />
          <div className="max-w-md rounded-lg border border-slate-300 bg-white p-4 shadow-sm">
            <NotePanel html={item.note_html} />
          </div>
        </div>
      )}
    </div>
  );
}

function NotePanel({ html }: { html: string }) {
  const [expanded, setExpanded] = useState(false);
  const [needsClamp, setNeedsClamp] = useState(false);
  const contentRef = useRef<HTMLDivElement>(null);

  // Re-measure when embedded images load or the panel resizes.
  useEffect(() => {
    const element = contentRef.current;
    if (!element) return;

    const measure = () => setNeedsClamp(element.scrollHeight > NOTE_CLAMP_PX);
    measure();

    const observer = new ResizeObserver(measure);
    observer.observe(element);
    return () => observer.disconnect();
  }, [html]);

  return (
    <div>
      <p className="text-sm font-semibold text-slate-800">Notes:</p>
      <div
        className="relative overflow-hidden"
        style={expanded ? undefined : { maxHeight: `${NOTE_CLAMP_PX}px` }}
      >
        <div ref={contentRef}>
          <NoteHtml html={html} />
        </div>
        {needsClamp && !expanded && (
          <div
            aria-hidden
            className="pointer-events-none absolute inset-x-0 bottom-0 h-10 bg-gradient-to-t from-white"
          />
        )}
      </div>
      {needsClamp && (
        <button
          className="mt-2 block w-full text-center text-[11px] font-semibold tracking-widest text-slate-500 uppercase transition hover:text-slate-800"
          onClick={() => setExpanded((value) => !value)}
          type="button"
        >
          {expanded ? "See less" : "See more"}
        </button>
      )}
    </div>
  );
}

// Renders planner-authored WYSIWYG HTML (trusted admin input).
export function NoteHtml({ html }: { html: string }) {
  const [lightbox, setLightbox] = useState<{ src: string; alt: string } | null>(
    null,
  );

  const handleClick = (event: MouseEvent<HTMLDivElement>) => {
    const target = event.target;
    if (target instanceof HTMLImageElement) {
      setLightbox({ src: target.src, alt: target.alt });
    }
  };

  return (
    <>
      <div
        className="mt-2 space-y-2 text-sm leading-6 text-slate-700 [&_a]:text-blue-700 [&_a]:underline [&_b]:font-semibold [&_strong]:font-semibold [&_img]:my-2 [&_img]:max-w-full [&_img]:cursor-zoom-in [&_img]:rounded-lg [&_ol]:list-decimal [&_ol]:pl-5 [&_ul]:list-disc [&_ul]:pl-5"
        dangerouslySetInnerHTML={{ __html: html }}
        onClick={handleClick}
      />
      {lightbox && (
        <ImageLightbox
          alt={lightbox.alt}
          onClose={() => setLightbox(null)}
          src={lightbox.src}
        />
      )}
    </>
  );
}

// Fullscreen view of a note image; closes on backdrop click or Escape.
function ImageLightbox({
  src,
  alt,
  onClose,
}: {
  src: string;
  alt: string;
  onClose: () => void;
}) {
  useEffect(() => {
    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", handleKeyDown);
    return () => window.removeEventListener("keydown", handleKeyDown);
  }, [onClose]);

  return createPortal(
    <div
      aria-modal
      className="fixed inset-0 z-50 flex cursor-zoom-out items-center justify-center bg-slate-950/80 p-4 sm:p-10"
      onClick={onClose}
      role="dialog"
    >
      <button
        aria-label="Close image"
        className="absolute top-4 right-4 flex h-10 w-10 items-center justify-center rounded-full bg-white/10 text-2xl leading-none text-white transition hover:bg-white/20"
        type="button"
      >
        &times;
      </button>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        alt={alt}
        className="max-h-full max-w-full cursor-default rounded-lg shadow-2xl"
        onClick={(event) => event.stopPropagation()}
        src={src}
      />
    </div>,
    document.body,
  );
}
