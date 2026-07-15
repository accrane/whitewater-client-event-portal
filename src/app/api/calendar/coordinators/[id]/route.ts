import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import { deleteCoordinator } from "@/lib/admin/room-calendar";

export async function DELETE(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    await requireAdminUser();
    const { id } = await params;
    await deleteCoordinator(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
