"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { ChecklistFaq } from "@/components/checklist/checklist-faq";
import { SectionEditor } from "@/components/checklist/section-editor";
import { AddTileForm } from "@/components/schedule/tile-editor";
import type { EventChecklistSection } from "@/lib/checklist";
import {
  applyChecklistSectionsTemplateAction,
  deleteEventChecklistSectionAction,
  moveEventChecklistSectionAction,
  saveEventChecklistSectionAction,
  setEventChecklistSectionStatusAction,
} from "./actions";

type ChecklistBuilderProps = {
  eventId: string;
  sections: EventChecklistSection[];
};

export function ChecklistBuilder({ eventId, sections }: ChecklistBuilderProps) {
  const [isPending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<"edit" | "preview">("edit");

  const run = (work: () => Promise<void>) => {
    setError(null);
    startTransition(async () => {
      try {
        await work();
      } catch (err) {
        setError(err instanceof Error ? err.message : "Something went wrong");
      }
    });
  };

  const handleApplyTemplate = () => {
    if (
      sections.length > 0 &&
      !confirm(
        "Applying the template replaces the current checklist sections, including their content. Continue?",
      )
    ) {
      return;
    }
    run(() => applyChecklistSectionsTemplateAction(eventId));
  };

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Checklist sections
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              FAQ-style sections clients expand on their portal&apos;s Action
              checklist. Sections here belong to this event only &mdash; edit
              the default set on the{" "}
              <Link
                className="font-medium text-blue-700 underline hover:text-blue-900"
                href="/admin/settings/checklist-template"
              >
                template settings page
              </Link>
              .
            </p>
          </div>
          <div className="flex items-center gap-2">
            <div className="flex rounded-full border border-slate-300 p-1">
              {(["edit", "preview"] as const).map((value) => (
                <button
                  className={`rounded-full px-4 py-1.5 text-sm font-semibold transition ${
                    tab === value
                      ? "bg-slate-950 text-white"
                      : "text-slate-600 hover:bg-slate-100"
                  }`}
                  key={value}
                  onClick={() => setTab(value)}
                  type="button"
                >
                  {value === "edit" ? "Edit" : "Client preview"}
                </button>
              ))}
            </div>
            <button
              className="inline-flex items-center justify-center rounded-full bg-slate-950 px-5 py-2.5 text-sm font-semibold text-white transition hover:bg-slate-800 disabled:opacity-50"
              disabled={isPending}
              onClick={handleApplyTemplate}
              type="button"
            >
              {sections.length > 0 ? "Reapply template" : "Apply template"}
            </button>
          </div>
        </div>

        <div className="mt-6">
          {sections.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No checklist sections yet. Apply the template or add a section
              below.
            </p>
          ) : tab === "preview" ? (
            <div className="rounded-2xl bg-slate-50 p-4 sm:p-6">
              <ChecklistFaq sections={sections} />
            </div>
          ) : (
            <div className="space-y-4">
              {sections.map((section, index) => (
                <SectionEditor
                  isFirst={index === 0}
                  isLast={index === sections.length - 1}
                  isPending={isPending}
                  key={section.id}
                  onDelete={() =>
                    run(() =>
                      deleteEventChecklistSectionAction(eventId, section.id),
                    )
                  }
                  onMove={(direction) =>
                    run(() =>
                      moveEventChecklistSectionAction(
                        eventId,
                        section.id,
                        direction,
                      ),
                    )
                  }
                  onSave={(input) =>
                    run(() => saveEventChecklistSectionAction(eventId, input))
                  }
                  onSetStatus={(status) =>
                    run(() =>
                      setEventChecklistSectionStatusAction(
                        eventId,
                        section.id,
                        status,
                      ),
                    )
                  }
                  section={section}
                  status={section.status}
                />
              ))}
            </div>
          )}
        </div>

        {tab === "edit" && (
          <AddTileForm
            isPending={isPending}
            onAdd={(title) =>
              run(() =>
                saveEventChecklistSectionAction(eventId, {
                  title,
                  contentHtml: "",
                  sortOrder: sections.length,
                }),
              )
            }
            placeholder="New section title (e.g. Sign your waivers)"
            submitLabel="+ Add section"
          />
        )}
      </section>
    </div>
  );
}
