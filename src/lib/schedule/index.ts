import type { Database } from "@/types/database";

export type ScheduleGroup =
  Database["public"]["Tables"]["event_schedule_groups"]["Row"];
export type ScheduleBlock =
  Database["public"]["Tables"]["event_schedule_blocks"]["Row"];
export type EventNote = Database["public"]["Tables"]["event_notes"]["Row"];
export type ScheduleItem =
  Database["public"]["Tables"]["event_schedule_items"]["Row"];
export type ScheduleTemplateItem =
  Database["public"]["Tables"]["schedule_template_items"]["Row"];

// The shared shape edited by the tile editor UI, common to event tiles and
// template tiles.
export type ScheduleTileFields = {
  id: string;
  title: string;
  description: string;
  note_html: string;
};
export type ScheduleBlockColor =
  Database["public"]["Enums"]["schedule_block_color"];

export const SLOT_MINUTES = 15;

// Pastel palette matching the planner's spreadsheet template.
export const BLOCK_COLORS: Record<
  ScheduleBlockColor,
  { label: string; background: string }
> = {
  green: { label: "Green", background: "#d5e8d4" },
  purple: { label: "Purple", background: "#e6d5ee" },
  yellow: { label: "Yellow", background: "#fff2cc" },
  blue: { label: "Blue", background: "#cfe2f3" },
  plain: { label: "White", background: "#ffffff" },
};

export const BLOCK_COLOR_KEYS = Object.keys(
  BLOCK_COLORS,
) as ScheduleBlockColor[];

/** "13:05" (from <input type="time">) → minutes from midnight. */
// WYSIWYG editors leave residue like "<br>" or "<p></p>" when notes were
// opened but never written. A note only counts as content when visible text
// or an image survives stripping the markup.
export function noteHtmlHasContent(html: string): boolean {
  if (!html) return false;
  if (/<img\b/i.test(html)) return true;

  return (
    html
      .replace(/<[^>]*>/g, " ")
      .replace(/&nbsp;/gi, " ")
      .trim().length > 0
  );
}

export function timeInputToMinutes(value: string): number | null {
  const match = /^(\d{1,2}):(\d{2})$/.exec(value.trim());
  if (!match) return null;
  const hours = Number(match[1]);
  const minutes = Number(match[2]);
  if (hours > 23 || minutes > 59) return null;
  return hours * 60 + minutes;
}

/** Minutes from midnight → "13:05" for <input type="time"> values. */
export function minutesToTimeInput(minutes: number): string {
  const h = Math.floor(minutes / 60);
  const m = minutes % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

/** Minutes from midnight → "1:05pm". */
export function formatScheduleTime(minutes: number): string {
  const h24 = Math.floor(minutes / 60) % 24;
  const m = minutes % 60;
  const suffix = h24 >= 12 ? "pm" : "am";
  const h12 = h24 % 12 === 0 ? 12 : h24 % 12;
  return m === 0 ? `${h12}:00${suffix}` : `${h12}:${String(m).padStart(2, "0")}${suffix}`;
}

export function formatScheduleRange(start: number, end: number): string {
  return `${formatScheduleTime(start)}–${formatScheduleTime(end)}`;
}

export type NoteLine = {
  /** 0 = paragraph, 1 = bullet (•), 2 = sub-bullet (°) */
  level: 0 | 1 | 2;
  text: string;
};

// Planners paste notes using "•" bullets and "°" sub-bullets (also accepts
// "-" and "*" for bullets, "--" for sub-bullets).
export function parseNoteContent(content: string): NoteLine[] {
  return content
    .split("\n")
    .map((raw) => raw.trim())
    .filter((line) => line.length > 0)
    .map((line) => {
      const sub = /^(°|--|◦)\s*/.exec(line);
      if (sub) return { level: 2 as const, text: line.slice(sub[0].length) };
      const bullet = /^(•|-|\*)\s*/.exec(line);
      if (bullet) {
        return { level: 1 as const, text: line.slice(bullet[0].length) };
      }
      return { level: 0 as const, text: line };
    });
}
