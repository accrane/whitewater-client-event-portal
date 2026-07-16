"use client";

import { useState } from "react";

import { NoteWysiwyg } from "@/components/schedule/note-wysiwyg";
import { MoveButton } from "@/components/schedule/tile-editor";
import type {
  ChecklistSectionFields,
  ChecklistSectionStatus,
} from "@/lib/checklist";
import { noteHtmlHasContent } from "@/lib/schedule";

export type SectionSaveInput = {
  id: string;
  title: string;
  contentHtml: string;
};

type SectionEditorProps = {
  section: ChecklistSectionFields;
  isFirst: boolean;
  isLast: boolean;
  isPending: boolean;
  onSave: (input: SectionSaveInput) => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
  /** Review workflow for per-event sections; template sections omit these. */
  status?: ChecklistSectionStatus;
  onSetStatus?: (status: ChecklistSectionStatus) => void;
};

// Every state is always clickable so the planner can move a section anywhere:
// reopen a submitted or completed section, or check one off directly.
const STATUS_OPTIONS: Array<{
  value: ChecklistSectionStatus;
  label: string;
  activeClass: string;
}> = [
  {
    value: "open",
    label: "Open for client",
    activeClass: "border-red-600 bg-red-600 text-white",
  },
  {
    value: "ready_for_review",
    label: "Ready for review",
    activeClass: "border-amber-500 bg-amber-500 text-white",
  },
  {
    value: "complete",
    label: "Complete",
    activeClass: "border-emerald-600 bg-emerald-600 text-white",
  },
];

// Editor card for one checklist section: a title plus rich-text content that
// clients see as an expandable FAQ-style item.
export function SectionEditor({
  section,
  isFirst,
  isLast,
  isPending,
  onSave,
  onDelete,
  onMove,
  status,
  onSetStatus,
}: SectionEditorProps) {
  const [title, setTitle] = useState(section.title);
  const [contentHtml, setContentHtml] = useState(section.content_html);

  const hasContent = noteHtmlHasContent(contentHtml);
  const dirty =
    title.trim() !== section.title || contentHtml !== section.content_html;

  return (
    <div className="rounded-2xl border border-slate-200 bg-slate-50 p-4">
      <div className="flex items-start gap-2">
        <div className="flex flex-col gap-1">
          <MoveButton
            direction="up"
            disabled={isPending || isFirst}
            onClick={() => onMove("up")}
          />
          <MoveButton
            direction="down"
            disabled={isPending || isLast}
            onClick={() => onMove("down")}
          />
        </div>

        <div className="min-w-0 flex-1 space-y-2">
          <input
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold focus:ring-2 focus:ring-blue-500 focus:outline-none"
            onChange={(e) => setTitle(e.target.value)}
            placeholder="Section title"
            type="text"
            value={title}
          />
          <NoteWysiwyg initialHtml={contentHtml} onChange={setContentHtml} />

          {status && onSetStatus && (
            <div className="flex flex-wrap items-center gap-2 pt-1">
              <span className="text-xs font-semibold text-slate-500">
                Client status:
              </span>
              {STATUS_OPTIONS.map((option) => {
                const active = option.value === status;
                return (
                  <button
                    className={`rounded-full border px-3 py-1 text-xs font-semibold transition ${
                      isPending ? "opacity-60" : ""
                    } ${
                      active
                        ? option.activeClass
                        : "border-slate-300 bg-white text-slate-600 hover:bg-slate-100"
                    }`}
                    disabled={isPending || active}
                    key={option.value}
                    onClick={() => onSetStatus(option.value)}
                    type="button"
                  >
                    {option.label}
                  </button>
                );
              })}
            </div>
          )}
        </div>

        <button
          className="rounded-lg px-2 py-2 text-sm text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
          disabled={isPending}
          onClick={() => {
            if (confirm(`Delete the "${section.title}" section?`)) {
              onDelete();
            }
          }}
          title={`Delete ${section.title}`}
          type="button"
        >
          <svg
            className="h-4 w-4"
            fill="none"
            stroke="currentColor"
            viewBox="0 0 24 24"
          >
            <path
              d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16"
              strokeLinecap="round"
              strokeLinejoin="round"
              strokeWidth={2}
            />
          </svg>
        </button>
      </div>

      {dirty && (
        <div className="mt-3 flex justify-end">
          <button
            className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
            disabled={isPending || !title.trim()}
            onClick={() =>
              onSave({
                id: section.id,
                title: title.trim(),
                // Editor residue like "<br>" saves as empty content so the
                // client accordion never expands into an empty panel.
                contentHtml: hasContent ? contentHtml : "",
              })
            }
            type="button"
          >
            Save section
          </button>
        </div>
      )}
    </div>
  );
}
