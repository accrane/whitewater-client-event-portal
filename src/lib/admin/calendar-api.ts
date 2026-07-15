import { createServerSupabaseClient } from "@/lib/supabase/server";
import { RoomCalendarError } from "@/lib/admin/room-calendar";

// /api routes are outside the /admin proxy matcher, so each calendar handler
// authenticates the planner session itself.
export async function requireAdminUser() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    throw new RoomCalendarError("Unauthorized", 401);
  }
  return user;
}

export function calendarErrorResponse(error: unknown) {
  if (error instanceof RoomCalendarError) {
    return Response.json({ error: error.message }, { status: error.status });
  }
  console.error("Room calendar API error", error);
  return Response.json({ error: "Internal server error" }, { status: 500 });
}
