// Shared by the intake form (client) and the phone-inquiry library
// (server): what counts as a rush. Kept dependency-free so the client
// bundle never pulls in server-only code.

// Events dated inside this window start with Expedited ticked.
export const EXPEDITED_WINDOW_DAYS = 14;

export function isInsideExpeditedWindow(date: string | null): boolean {
  if (!date || !/^\d{4}-\d{2}-\d{2}$/.test(date)) return false;
  const [y, m, d] = date.split("-").map(Number);
  const target = new Date(y, m - 1, d);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  const days = Math.round((target.getTime() - today.getTime()) / 86_400_000);
  return days >= 0 && days <= EXPEDITED_WINDOW_DAYS;
}
