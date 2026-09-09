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
    card: "border-red-200 bg-white hover:border-red-400",
    divider: "border-red-200",
    badge: "border-red-200 bg-red-50 text-red-700",
    badgeLabel: "To do",
  },
  ready_for_review: {
    card: "border-amber-200 bg-white hover:border-amber-400",
    divider: "border-amber-200",
    badge: "border-amber-200 bg-amber-50 text-amber-900",
    badgeLabel: "Waiting on planner review",
  },
  complete: {
    card: "border-emerald-200 bg-white hover:border-emerald-400",
    divider: "border-emerald-200",
    badge: "border-emerald-200 bg-emerald-50 text-emerald-800",
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
    <div className={`rounded-lg border transition ${styles.card}`}>
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
              className={`type-label rounded-sm border px-1.5 py-0.5 ${styles.badge}`}
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
                className="rounded-md border border-[var(--brand-border)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)] transition hover:bg-[var(--brand-hover)]"
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
