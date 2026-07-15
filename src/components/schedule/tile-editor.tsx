"use client";

import { useState } from "react";

import { NoteWysiwyg } from "@/components/schedule/note-wysiwyg";
import { noteHtmlHasContent, type ScheduleTileFields } from "@/lib/schedule";

export type TileSaveInput = {
  id: string;
  title: string;
  description: string;
  noteHtml: string;
};

type TileEditorProps = {
  tile: ScheduleTileFields;
  isFirst: boolean;
  isLast: boolean;
  isPending: boolean;
  onSave: (input: TileSaveInput) => void;
  onDelete: () => void;
  onMove: (direction: "up" | "down") => void;
};

// Editor card for one timeline tile; shared by the per-event schedule builder
// and the template settings page.
export function TileEditor({
  tile,
  isFirst,
  isLast,
  isPending,
  onSave,
  onDelete,
  onMove,
}: TileEditorProps) {
  const [title, setTitle] = useState(tile.title);
  const [description, setDescription] = useState(tile.description);
  const [noteHtml, setNoteHtml] = useState(tile.note_html);
  const [notesOpen, setNotesOpen] = useState(false);

  const hasNote = noteHtmlHasContent(noteHtml);
  const dirty =
    title.trim() !== tile.title ||
    description !== tile.description ||
    noteHtml !== tile.note_html;

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
            placeholder="Tile title"
            type="text"
            value={title}
          />
          <textarea
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm leading-6 focus:ring-2 focus:ring-blue-500 focus:outline-none"
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Description of the tile."
            rows={2}
            value={description}
          />

          <button
            className="text-sm font-medium text-blue-700 transition hover:text-blue-900"
            onClick={() => setNotesOpen((open) => !open)}
            type="button"
          >
            {notesOpen ? "Hide notes" : hasNote ? "Edit notes" : "+ Add notes"}
          </button>

          {notesOpen && (
            <NoteWysiwyg initialHtml={noteHtml} onChange={setNoteHtml} />
          )}
        </div>

        <button
          className="rounded-lg px-2 py-2 text-sm text-slate-400 transition-colors hover:bg-red-50 hover:text-red-600"
          disabled={isPending}
          onClick={() => {
            if (confirm(`Delete the "${tile.title}" tile?`)) {
              onDelete();
            }
          }}
          title={`Delete ${tile.title}`}
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
                id: tile.id,
                title: title.trim(),
                description,
                // Editor residue like "<br>" saves as an empty note so the
                // client timeline never shows an empty callout.
                noteHtml: hasNote ? noteHtml : "",
              })
            }
            type="button"
          >
            Save tile
          </button>
        </div>
      )}
    </div>
  );
}

type AddTileFormProps = {
  isPending: boolean;
  placeholder?: string;
  onAdd: (title: string) => void;
};

export function AddTileForm({ isPending, placeholder, onAdd }: AddTileFormProps) {
  const [title, setTitle] = useState("");

  return (
    <form
      className="mt-5 flex flex-wrap gap-2"
      onSubmit={(e) => {
        e.preventDefault();
        if (!title.trim()) return;
        onAdd(title.trim());
        setTitle("");
      }}
    >
      <input
        className="min-w-0 flex-1 rounded-lg border border-slate-300 px-3 py-2 text-sm focus:ring-2 focus:ring-blue-500 focus:outline-none"
        onChange={(e) => setTitle(e.target.value)}
        placeholder={placeholder ?? "New tile title (e.g. Lunch)"}
        type="text"
        value={title}
      />
      <button
        className="rounded-lg bg-blue-600 px-4 py-2 text-sm font-medium text-white transition-colors hover:bg-blue-700 disabled:opacity-50"
        disabled={isPending || !title.trim()}
        type="submit"
      >
        + Add tile
      </button>
    </form>
  );
}

function MoveButton({
  direction,
  disabled,
  onClick,
}: {
  direction: "up" | "down";
  disabled: boolean;
  onClick: () => void;
}) {
  return (
    <button
      className="rounded-lg border border-slate-300 bg-white px-2 py-1 text-xs text-slate-500 transition hover:bg-slate-100 disabled:opacity-40"
      disabled={disabled}
      onClick={onClick}
      title={direction === "up" ? "Move up" : "Move down"}
      type="button"
    >
      {direction === "up" ? "▲" : "▼"}
    </button>
  );
}

