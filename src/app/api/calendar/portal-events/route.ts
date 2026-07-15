import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import { listLinkableEvents } from "@/lib/admin/room-calendar";

export async function GET() {
  try {
    await requireAdminUser();
    return Response.json(await listLinkableEvents());
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
