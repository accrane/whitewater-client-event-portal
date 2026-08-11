import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import { listGhlPlannerUsers } from "@/lib/ghl/location-data";

// Feeds the Event Coordinator pickers (reservation modal, create-event
// dialog): staff planners only, never account admins.
export async function GET() {
  try {
    await requireAdminUser();
    return Response.json(await listGhlPlannerUsers());
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
