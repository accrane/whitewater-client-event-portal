"use client";

import { useState, useTransition } from "react";

import { ScheduleTimeline } from "@/components/schedule/schedule-timeline";
import { AddTileForm, TileEditor } from "@/components/schedule/tile-editor";
import type { ScheduleTemplateItem } from "@/lib/schedule";
import {
  deleteScheduleTemplateItemAction,
  moveScheduleTemplateItemAction,
  saveScheduleTemplateItemAction,
} from "./actions";

type TemplateEditorProps = {
  items: ScheduleTemplateItem[];
};

export function TemplateEditor({ items }: TemplateEditorProps) {
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

      <section className="rounded-xl border border-slate-200 bg-white p-5 shadow-sm sm:p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="text-lg font-semibold text-slate-950">
              Template tiles
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              The skeleton every event starts from. Changes here only affect
              events where the template is applied afterwards &mdash; existing
              event schedules keep their own copies.
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
          {items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              The template is empty. Add a tile below.
            </p>
          ) : tab === "preview" ? (
            <div className="rounded-2xl bg-slate-50 p-4 sm:p-6">
              <ScheduleTimeline items={items} />
            </div>
          ) : (
            <div className="space-y-4">
              {items.map((item, index) => (
                <TileEditor
                  isFirst={index === 0}
                  isLast={index === items.length - 1}
                  isPending={isPending}
                  key={item.id}
                  onDelete={() =>
                    run(() => deleteScheduleTemplateItemAction(item.id))
                  }
                  onMove={(direction) =>
                    run(() =>
                      moveScheduleTemplateItemAction(item.id, direction),
                    )
                  }
                  onSave={(input) =>
                    run(() => saveScheduleTemplateItemAction(input))
                  }
                  tile={item}
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
                saveScheduleTemplateItemAction({
                  title,
                  description: "",
                  noteHtml: "",
                  sortOrder: items.length,
                }),
              )
            }
          />
        )}
      </section>
    </div>
  );
}
