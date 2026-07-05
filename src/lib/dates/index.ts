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
