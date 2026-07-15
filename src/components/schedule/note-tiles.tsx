import { parseNoteContent, type EventNote } from "@/lib/schedule";

type NoteTilesProps = {
  notes: EventNote[];
};

// Sectioned event notes rendered as tiles; content uses the planners'
// "•" bullet / "°" sub-bullet convention.
export function NoteTiles({ notes }: NoteTilesProps) {
  const visible = notes.filter((note) => note.content.trim().length > 0);

  if (visible.length === 0) return null;

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      {visible.map((note) => (
        <div
          className="rounded-2xl border border-slate-200 bg-white p-5 shadow-sm"
          key={note.id}
        >
          <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-500">
            {note.title}
          </h3>
          <NoteContent content={note.content} />
        </div>
      ))}
    </div>
  );
}

export function NoteContent({ content }: { content: string }) {
  const lines = parseNoteContent(content);

  return (
    <div className="mt-3 space-y-1 text-sm leading-6 text-slate-700">
      {lines.map((line, index) => {
        if (line.level === 2) {
          return (
            <p className="flex gap-2 pl-8" key={index}>
              <span aria-hidden className="text-slate-400">
                ◦
              </span>
              <span>{line.text}</span>
            </p>
          );
        }
        if (line.level === 1) {
          return (
            <p className="flex gap-2 pl-2" key={index}>
              <span aria-hidden className="text-slate-400">
                •
              </span>
              <span className="font-medium text-slate-800">{line.text}</span>
            </p>
          );
        }
        return <p key={index}>{line.text}</p>;
      })}
    </div>
  );
}
