import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import { listGhlUsers } from "@/lib/ghl/location-data";

export async function GET() {
  try {
    await requireAdminUser();
    return Response.json(await listGhlUsers());
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
