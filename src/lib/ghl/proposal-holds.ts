import {
  createReservation,
  listRooms,
  RoomCalendarError,
} from "@/lib/admin/room-calendar";
import { logIntegrationEvent } from "@/lib/ghl/integration-log";
import { resolveRoomFromGhlValue } from "@/lib/ghl/room-mapping";
import type { ProposalSentPayload } from "@/lib/ghl/types";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type ReservationInsert = Database["public"]["Tables"]["reservations"]["Insert"];

export class ProposalHoldError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export type CreateProposalHoldResult = {
  created: boolean;
  reservation: ReservationRow;
};

export async function createOrReuseProposalHold(
  payload: ProposalSentPayload,
): Promise<CreateProposalHoldResult> {
  const supabase = createServiceRoleSupabaseClient();

  const { data: existingReservation, error: existingError } = await supabase
    .from("reservations")
    .select("*")
    .eq("ghl_event_record_id", payload.ghl_event_record_id)
    .maybeSingle();

  if (existingError) {
    await logIntegrationEvent({
      eventType: "proposal_sent_hold",
      ghlLocationId: payload.ghl_location_id,
      ghlEventRecordId: payload.ghl_event_record_id,
      status: "error",
      message: "Failed checking for existing proposal hold.",
      details: { error: existingError.message },
    });

    throw new Error(existingError.message);
  }

  const existing = existingReservation as ReservationRow | null;

  if (existing) {
    await logIntegrationEvent({
      eventType: "proposal_sent_hold_duplicate",
      ghlLocationId: payload.ghl_location_id,
      ghlEventRecordId: payload.ghl_event_record_id,
      status: "warning",
      message: "Duplicate proposal-sent webhook ignored; existing hold reused.",
      details: { reservation_id: existing.id },
    });

    return { created: false, reservation: existing };
  }

  const rooms = await listRooms();
  const room = resolveRoomFromGhlValue(payload.event.room, rooms);

  if (!room) {
    await logIntegrationEvent({
      eventType: "proposal_sent_hold",
      ghlLocationId: payload.ghl_location_id,
      ghlEventRecordId: payload.ghl_event_record_id,
      status: "error",
      message: `No portal room matches GHL venue "${payload.event.room}"; hold not created.`,
      details: {
        ghl_room_value: payload.event.room,
        known_rooms: rooms.map((r) => r.name),
      },
    });

    throw new ProposalHoldError(
      `Unknown room "${payload.event.room}"`,
      422,
    );
  }

  const insertPayload: ReservationInsert = {
    room_id: room.id,
    title: payload.event.name,
    status: "held",
    start_datetime: payload.event.start,
    end_datetime: payload.event.end,
    client_name: payload.client_name ?? null,
    salesperson_name: payload.salesperson_name ?? null,
    source: "ghl",
    ghl_event_record_id: payload.ghl_event_record_id,
    created_by: "ghl-webhook",
    notes: "Held automatically when the GHL proposal was sent.",
  };

  let reservation: ReservationRow;

  try {
    reservation = await createReservation(insertPayload);
  } catch (error) {
    const isConflict =
      error instanceof RoomCalendarError && error.status === 409;

    await logIntegrationEvent({
      eventType: "proposal_sent_hold",
      ghlLocationId: payload.ghl_location_id,
      ghlEventRecordId: payload.ghl_event_record_id,
      status: "error",
      message: isConflict
        ? `Proposal hold conflicts with an existing reservation in ${room.name}.`
        : "Failed creating proposal hold.",
      details: {
        room: room.name,
        start: payload.event.start,
        end: payload.event.end,
        error: error instanceof Error ? error.message : String(error),
      },
    });

    if (error instanceof RoomCalendarError) {
      throw new ProposalHoldError(error.message, error.status);
    }

    throw error;
  }

  await logIntegrationEvent({
    eventType: "proposal_sent_hold",
    ghlLocationId: payload.ghl_location_id,
    ghlEventRecordId: payload.ghl_event_record_id,
    status: "success",
    message: `Room ${room.name} held from GHL proposal-sent webhook.`,
    details: { reservation_id: reservation.id, room: room.name },
  });

  return { created: true, reservation };
}
