import {
  startOfWeek,
  endOfWeek,
  startOfDay,
  endOfDay,
  addDays,
  addWeeks,
  subWeeks,
  format,
  isSameDay,
  differenceInMinutes,
  setHours,
  setMinutes,
} from "date-fns";

export const HOUR_HEIGHT = 60; // px per hour
export const START_HOUR = 7;
export const END_HOUR = 20;
export const TOTAL_HOURS = END_HOUR - START_HOUR;

export function getWeekDays(date: Date): Date[] {
  const start = startOfWeek(date, { weekStartsOn: 1 }); // Monday
  return Array.from({ length: 7 }, (_, i) => addDays(start, i));
}

export function getWeekRange(date: Date) {
  const start = startOfWeek(date, { weekStartsOn: 1 });
  const end = endOfWeek(date, { weekStartsOn: 1 });
  return { start, end };
}

export function getDayRange(date: Date) {
  return { start: startOfDay(date), end: endOfDay(date) };
}

export function nextWeek(date: Date): Date {
  return addWeeks(date, 1);
}

export function prevWeek(date: Date): Date {
  return subWeeks(date, 1);
}

export function nextDay(date: Date): Date {
  return addDays(date, 1);
}

export function prevDay(date: Date): Date {
  return addDays(date, -1);
}

export function formatDayHeader(date: Date): string {
  return format(date, "EEE M/d");
}

export function formatDateRange(start: Date, end: Date): string {
  return `${format(start, "MMM d")} – ${format(end, "MMM d, yyyy")}`;
}

export function isToday(date: Date): boolean {
  return isSameDay(date, new Date());
}

// Calculate top offset and height for a reservation block on the calendar grid
export function getBlockPosition(startStr: string, endStr: string) {
  const start = new Date(startStr);
  const end = new Date(endStr);

  const startMinutesFromDayStart = start.getHours() * 60 + start.getMinutes();
  const gridStartMinutes = START_HOUR * 60;
  const gridEndMinutes = END_HOUR * 60;

  const clampedStart = Math.max(startMinutesFromDayStart, gridStartMinutes);
  const endMinutesFromDayStart = end.getHours() * 60 + end.getMinutes();
  const clampedEnd = Math.min(endMinutesFromDayStart, gridEndMinutes);

  const topMinutes = clampedStart - gridStartMinutes;
  const durationMinutes = clampedEnd - clampedStart;

  const top = (topMinutes / 60) * HOUR_HEIGHT;
  const height = Math.max((durationMinutes / 60) * HOUR_HEIGHT, 20); // min 20px

  return { top, height };
}

// Round minutes to nearest 15
export function roundToNearest15(date: Date): Date {
  const minutes = date.getMinutes();
  const rounded = Math.round(minutes / 15) * 15;
  const result = setMinutes(setHours(new Date(date), date.getHours()), rounded);
  if (rounded === 60) {
    result.setHours(result.getHours() + 1);
    result.setMinutes(0);
  }
  return result;
}

export function formatTime(date: Date | string): string {
  const d = typeof date === "string" ? new Date(date) : date;
  return format(d, "h:mm a");
}

export function formatDuration(startStr: string, endStr: string): string {
  const mins = differenceInMinutes(new Date(endStr), new Date(startStr));
  const hours = Math.floor(mins / 60);
  const remainingMins = mins % 60;
  if (hours === 0) return `${remainingMins}m`;
  if (remainingMins === 0) return `${hours}h`;
  return `${hours}h ${remainingMins}m`;
}
