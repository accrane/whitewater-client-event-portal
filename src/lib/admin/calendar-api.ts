import { RoomCalendarError } from "@/lib/admin/room-calendar";
import { getStaffUser } from "@/lib/admin/session";

// /api routes are outside the /admin proxy matcher, so each handler checks
// for a staff session itself: signed in, with a portal role (any role —
// coordinators use these routes too).
export async function requireStaffApiUser() {
  const staff = await getStaffUser();

  if (!staff) {
    throw new RoomCalendarError("Unauthorized", 401);
  }
  return staff.user;
}

export function calendarErrorResponse(error: unknown) {
  if (error instanceof RoomCalendarError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Room calendar API error", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
