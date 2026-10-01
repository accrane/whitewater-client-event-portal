import "server-only";

import { redirect } from "next/navigation";

import { resolveStaffCoordinator } from "./current-coordinator";
import { isCurrentCoordinatorsEvent, type FilterableEvent } from "./event-filters";
import type { StaffUser } from "./session";

// Address a coordinator lands on when they open an event that isn't theirs;
// the Events page explains why.
export const EVENT_DENIED_HREF = "/admin/events?denied=1";

// Event pages (the event itself and its Contracts, Schedule and Checklist
// tabs) are open to managers for every event and to a coordinator only for
// their own, by the same rule the Events list uses. Anyone else is sent to
// the Events list with a note — the lists never show them, but an address
// can be pasted, bookmarked, or left on screen when a manager switches
// "View as" to a coordinator who isn't on the event.
export async function requireEventAccess(
  staff: StaffUser,
  event: FilterableEvent,
): Promise<void> {
  if (staff.role === "admin") return;
  const me = await resolveStaffCoordinator(staff);
  if (me && isCurrentCoordinatorsEvent(event, me)) return;
  redirect(EVENT_DENIED_HREF);
}
