import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import {
  deleteReservation,
  getReservation,
  updateReservation,
} from "@/lib/admin/room-calendar";
import type { Database } from "@/types/database";

type ReservationUpdate = Database["public"]["Tables"]["reservations"]["Update"];

type RouteParams = { params: Promise<{ id: string }> };

export async function GET(_request: Request, { params }: RouteParams) {
  try {
    await requireAdminUser();
    const { id } = await params;
    return Response.json(await getReservation(id));
  } catch (error) {
    return calendarErrorResponse(error);
  }
}

export async function PUT(request: Request, { params }: RouteParams) {
  try {
    await requireAdminUser();
    const { id } = await params;
    const patch = (await request.json()) as ReservationUpdate;
    return Response.json(await updateReservation(id, patch));
  } catch (error) {
    return calendarErrorResponse(error);
  }
}

export async function DELETE(_request: Request, { params }: RouteParams) {
  try {
    await requireAdminUser();
    const { id } = await params;
    await deleteReservation(id);
    return new Response(null, { status: 204 });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
