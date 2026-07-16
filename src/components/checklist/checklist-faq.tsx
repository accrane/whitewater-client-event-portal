"use client";

import { useState } from "react";

import { NoteHtml } from "@/components/schedule/schedule-timeline";
import type {
  ChecklistSectionFields,
  ChecklistSectionStatus,
} from "@/lib/checklist";
import { noteHtmlHasContent } from "@/lib/schedule";

type ChecklistFaqSection = ChecklistSectionFields & {
  status?: ChecklistSectionStatus;
};

type ChecklistFaqProps = {
  sections: ChecklistFaqSection[];
  /** Server action for the client's "Mark ready" button; needs `token` too. */
  markReadyAction?: (formData: FormData) => Promise<void>;
  token?: string;
};

// Status-driven look: red = the client still has work to do, amber = waiting
// on planner review, green = planner checked it off. Template sections have
// no status and render in the red "to do" style without a badge.
const STATUS_STYLES: Record<
  ChecklistSectionStatus,
  { card: string; divider: string; badge: string; badgeLabel: string }
> = {
  open: {
    card: "border-red-300 bg-red-50/40 hover:border-red-500",
    divider: "border-red-200",
    badge: "bg-white text-red-700 ring-1 ring-red-200",
    badgeLabel: "To do",
  },
  ready_for_review: {
    card: "border-amber-300 bg-amber-50/40 hover:border-amber-500",
    divider: "border-amber-200",
    badge: "bg-white text-amber-700 ring-1 ring-amber-300",
    badgeLabel: "Waiting on planner review",
  },
  complete: {
    card: "border-emerald-300 bg-emerald-50/40 hover:border-emerald-500",
    divider: "border-emerald-200",
    badge: "bg-white text-emerald-700 ring-1 ring-emerald-300",
    badgeLabel: "Complete",
  },
};

// Client-facing checklist: FAQ-style cards of things the client needs to do.
// Each section is a title that expands to reveal its rich-text content and,
// for open sections, the "Mark ready for planner review" action.
export function ChecklistFaq({
  sections,
  markReadyAction,
  token,
}: ChecklistFaqProps) {
  if (sections.length === 0) return null;

  return (
    <div className="space-y-3">
      {sections.map((section) => (
        <FaqSection
          key={section.id}
          markReadyAction={markReadyAction}
          section={section}
          token={token}
        />
      ))}
    </div>
  );
}

function FaqSection({
  section,
  markReadyAction,
  token,
}: {
  section: ChecklistFaqSection;
  markReadyAction?: (formData: FormData) => Promise<void>;
  token?: string;
}) {
  const [open, setOpen] = useState(false);
  const hasContent = noteHtmlHasContent(section.content_html);
  const styles = STATUS_STYLES[section.status ?? "open"];

  return (
    <div className={`rounded-2xl border-2 transition ${styles.card}`}>
      <button
        aria-expanded={open}
        className="flex w-full items-center justify-between gap-3 px-4 py-4 text-left sm:px-5"
        onClick={() => setOpen((value) => !value)}
        type="button"
      >
        <span className="text-base font-semibold text-slate-950">
          {section.title}
        </span>
        <span className="flex shrink-0 items-center gap-2">
          {section.status && (
            <span
              className={`rounded-full px-2.5 py-1 text-xs font-semibold ${styles.badge}`}
            >
              {styles.badgeLabel}
            </span>
          )}
          <svg
            aria-hidden
            className={`h-5 w-5 text-slate-400 transition-transform ${
              open ? "rotate-180" : ""
            }`}
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M19 9l-7 7-7-7"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </svg>
        </span>
      </button>

      {open && (
        <div className={`mx-4 border-t pb-4 sm:mx-5 ${styles.divider}`}>
          {hasContent ? (
            <NoteHtml html={section.content_html} />
          ) : (
            <p className="mt-2 text-sm leading-6 text-slate-500">
              Details for this item are coming soon.
            </p>
          )}

          {section.status === "open" && markReadyAction && token && (
            <form action={markReadyAction} className="mt-4">
              <input name="token" type="hidden" value={token} />
              <input name="sectionId" type="hidden" value={section.id} />
              <button
                className="rounded-full bg-slate-950 px-4 py-2 text-sm font-semibold text-white transition hover:bg-slate-800"
                type="submit"
              >
                Mark ready for planner review
              </button>
            </form>
          )}
        </div>
      )}
    </div>
  );
}
