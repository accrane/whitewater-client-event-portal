import {
  calendarErrorResponse,
  requireStaffApiUser,
} from "@/lib/admin/calendar-api";
import { listLinkableEvents } from "@/lib/admin/room-calendar";

export async function GET() {
  try {
    await requireStaffApiUser();
    return Response.json(await listLinkableEvents());
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
