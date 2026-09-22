export function formatDisplayDate(date: string | Date): string {
  const value = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;

  return new Intl.DateTimeFormat("en-US", {
    month: "long",
    day: "numeric",
    year: "numeric",
  }).format(value);
}

export function daysUntil(date: string | Date, from = new Date()): number {
  const target = typeof date === "string" ? new Date(`${date}T00:00:00`) : date;
  const start = new Date(from.getFullYear(), from.getMonth(), from.getDate());
  const end = new Date(
    target.getFullYear(),
    target.getMonth(),
    target.getDate(),
  );

  return Math.ceil((end.getTime() - start.getTime()) / 86_400_000);
}

export function isWithinDays(date: string | Date, days: number): boolean {
  const remaining = daysUntil(date);

  return remaining >= 0 && remaining <= days;
}

// "Friday, November 20th": the event-day line coordinators put above a
// contract's items. Empty for a missing or unparseable date.
export function formatEventDayHeading(date: string | null): string {
  if (!date) return "";
  const value = new Date(`${date.slice(0, 10)}T00:00:00`);
  if (Number.isNaN(value.getTime())) return "";

  const day = value.getDate();
  const suffix =
    day % 100 >= 11 && day % 100 <= 13
      ? "th"
      : (["th", "st", "nd", "rd"][day % 10] ?? "th");
  const weekday = new Intl.DateTimeFormat("en-US", { weekday: "long" }).format(
    value,
  );
  const month = new Intl.DateTimeFormat("en-US", { month: "long" }).format(
    value,
  );
  return `${weekday}, ${month} ${day}${suffix}`;
}
