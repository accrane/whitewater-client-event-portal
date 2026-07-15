import {
  calendarErrorResponse,
  requireAdminUser,
} from "@/lib/admin/calendar-api";
import {
  deleteReservation,
  getReservation,
  updateReservation,
} from "@/lib/admin/room-calendar";
import { triggerPlanningStageForEvent } from "@/lib/ghl/planning-trigger";
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
    const before = await getReservation(id);
    const updated = await updateReservation(id, patch);

    // Linking a portal event to a block is what moves its GHL opportunity
    // into Planning; only fire when the link is new.
    if (updated.event_id && updated.event_id !== before.event_id) {
      await triggerPlanningStageForEvent(updated.event_id);
    }

    return Response.json(updated);
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
