import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import {
  createCoordinator,
  listCoordinators,
} from "@/lib/admin/room-calendar";

export async function GET() {
  try {
    await requireAdminUser();
    return Response.json(await listCoordinators());
  } catch (error) {
    return calendarErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    await requireAdminUser();
    const body = (await request.json()) as { name?: string };
    const coordinator = await createCoordinator(body.name ?? "");
    return Response.json(coordinator, { status: 201 });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
