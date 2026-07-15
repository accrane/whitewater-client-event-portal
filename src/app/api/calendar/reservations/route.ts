import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import {
  createReservation,
  listReservations,
} from "@/lib/admin/room-calendar";
import { triggerPlanningStageForEvent } from "@/lib/ghl/planning-trigger";
import type { Database } from "@/types/database";

type ReservationInsert = Database["public"]["Tables"]["reservations"]["Insert"];

export async function GET(request: Request) {
  try {
    await requireAdminUser();
    const { searchParams } = new URL(request.url);
    const reservations = await listReservations({
      start: searchParams.get("start") ?? undefined,
      end: searchParams.get("end") ?? undefined,
      room_id: searchParams.get("room_id") ?? undefined,
      status: searchParams.get("status") ?? undefined,
    });
    return Response.json(reservations);
  } catch (error) {
    return calendarErrorResponse(error);
  }
}

export async function POST(request: Request) {
  try {
    const user = await requireAdminUser();
    const body = (await request.json()) as ReservationInsert;
    const reservation = await createReservation({
      ...body,
      created_by: body.created_by ?? user.email ?? null,
    });

    if (reservation.event_id) {
      await triggerPlanningStageForEvent(reservation.event_id);
    }

    return Response.json(reservation, { status: 201 });
  } catch (error) {
    return calendarErrorResponse(error);
  }
}
