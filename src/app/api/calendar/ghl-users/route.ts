import {
  calendarErrorResponse,
  requireStaffApiUser,
} from "@/lib/admin/calendar-api";
import { listGhlCoordinatorUsers } from "@/lib/ghl/location-data";

// Feeds the Event Coordinator pickers (reservation modal, create-event
// dialog): staff coordinators only, never account admins.
export async function GET() {
  try {
    await requireStaffApiUser();
    return Response.json(await listGhlCoordinatorUsers());
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
