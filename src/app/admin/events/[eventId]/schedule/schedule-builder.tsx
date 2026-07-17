"use client";

import Link from "next/link";
import { useState, useTransition } from "react";

import { ScheduleTimeline } from "@/components/schedule/schedule-timeline";
import { AddTileForm, TileEditor } from "@/components/schedule/tile-editor";
import type { ScheduleItem } from "@/lib/schedule";
import {
  applyScheduleItemsTemplateAction,
  deleteScheduleItemAction,
  moveScheduleItemAction,
  saveScheduleItemAction,
} from "./actions";

type ScheduleBuilderProps = {
  eventId: string;
  items: ScheduleItem[];
};

export function ScheduleBuilder({ eventId, items }: ScheduleBuilderProps) {
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
      items.length > 0 &&
      !confirm(
        "Applying the template replaces the current schedule tiles, including their notes. Continue?",
      )
    ) {
      return;
    }
    run(() => applyScheduleItemsTemplateAction(eventId));
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
              Schedule timeline
            </h2>
            <p className="mt-1 text-sm text-slate-600">
              Repeatable tiles with a title and description. Add notes to a
              tile and they show beside it on the client schedule. Tiles here
              belong to this event only &mdash; edit the skeleton on the{" "}
              <Link
                className="font-medium text-blue-700 underline hover:text-blue-900"
                href="/admin/settings/schedule-template"
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
              {items.length > 0 ? "Reapply template" : "Apply template"}
            </button>
          </div>
        </div>

        <div className="mt-6">
          {items.length === 0 ? (
            <p className="rounded-2xl border border-dashed border-slate-300 bg-slate-50 p-6 text-center text-sm text-slate-500">
              No schedule tiles yet. Apply the template or add a tile below.
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
                    run(() => deleteScheduleItemAction(eventId, item.id))
                  }
                  onMove={(direction) =>
                    run(() =>
                      moveScheduleItemAction(eventId, item.id, direction),
                    )
                  }
                  onSave={(input) =>
                    run(() => saveScheduleItemAction(eventId, input))
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
                saveScheduleItemAction(eventId, {
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
