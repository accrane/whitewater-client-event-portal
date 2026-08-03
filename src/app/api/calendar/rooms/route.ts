import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import { createRoom, listRooms } from "@/lib/admin/room-calendar";

export async function GET() {
  try {
    await requireAdminUser();
    return Response.json(await listRooms());
  } catch (error) {
    return calendarErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminUser();
    const body = await request.json();
    const room = await createRoom(body);
    return Response.json(room, { status: 201 });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
