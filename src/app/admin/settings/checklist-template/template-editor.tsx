"use client";

import { useState, useTransition } from "react";

import { ChecklistFaq } from "@/components/checklist/checklist-faq";
import { SectionEditor } from "@/components/checklist/section-editor";
import { AddTileForm } from "@/components/schedule/tile-editor";
import type { ChecklistTemplateSection } from "@/lib/checklist";
import {
  deleteChecklistTemplateSectionAction,
  moveChecklistTemplateSectionAction,
  saveChecklistTemplateSectionAction,
} from "./actions";

type TemplateEditorProps = {
  sections: ChecklistTemplateSection[];
};

export function TemplateEditor({ sections }: TemplateEditorProps) {
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

  return (
    <div className="space-y-6">
      {error && (
        <div className="rounded-2xl border border-red-200 bg-red-50 p-4 text-sm text-red-700">
          {error}
        </div>
      )}

      <section className="rounded-3xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Checklist sections
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Clients see each section as an expandable FAQ-style item covering
              something they need to do before their event.
            </p>
          </div>
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
        </div>

        <div className="mt-6">
          {sections.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              The template is empty. Add a section below.
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
                    run(() => deleteChecklistTemplateSectionAction(section.id))
                  }
                  onMove={(direction) =>
                    run(() =>
                      moveChecklistTemplateSectionAction(section.id, direction),
                    )
                  }
                  onSave={(input) =>
                    run(() => saveChecklistTemplateSectionAction(input))
                  }
                  section={section}
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
                saveChecklistTemplateSectionAction({
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
