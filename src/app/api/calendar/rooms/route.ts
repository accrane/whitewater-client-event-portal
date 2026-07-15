import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import { listRooms } from "@/lib/admin/room-calendar";

export async function GET() {
  try {
    await requireAdminUser();
    return Response.json(await listRooms());
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
