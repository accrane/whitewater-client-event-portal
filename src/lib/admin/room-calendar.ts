import { fetchDatesOfInterest } from "@/lib/ghl/location-data";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";
import type { Database } from "@/types/database";

type RoomRow = Database["public"]["Tables"]["rooms"]["Row"];
type ReservationRow = Database["public"]["Tables"]["reservations"]["Row"];
type ReservationInsert = Database["public"]["Tables"]["reservations"]["Insert"];
type ReservationUpdate = Database["public"]["Tables"]["reservations"]["Update"];

export const CONFLICT_MESSAGE =
  "This reservation conflicts with an existing reservation in the same room";

// Postgres error code surfaced by the reservations overlap constraint.
const EXCLUSION_VIOLATION = "23P01";

// Postgres error code for unique-constraint violations (rooms.name).
const UNIQUE_VIOLATION = "23505";

export class RoomCalendarError extends Error {
  constructor(
    message: string,
    public readonly status: number,
  ) {
    super(message);
  }
}

export async function listRooms() {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("rooms")
    .select("*")
    .eq("is_active", true)
    .order("name");

  if (error) throw error;
  return (data ?? []) as RoomRow[];
}

export type RoomInput = {
  name: string;
  color: string;
  capacity?: number | null;
  description?: string | null;
};

export async function createRoom(input: RoomInput) {
  const name = input.name?.trim();
  if (!name) {
    throw new RoomCalendarError("Room name is required", 400);
  }
  if (!/^#[0-9a-fA-F]{6}$/.test(input.color ?? "")) {
    throw new RoomCalendarError("Room color must be a hex value like #3B82F6", 400);
  }
  if (input.capacity != null && (!Number.isInteger(input.capacity) || input.capacity <= 0)) {
    throw new RoomCalendarError("Capacity must be a positive whole number", 400);
  }

  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("rooms")
    .insert({
      name,
      color: input.color.toUpperCase(),
      capacity: input.capacity ?? null,
      description: input.description?.trim() || null,
    } as never)
    .select()
    .single();

  if (error) {
    if (error.code === UNIQUE_VIOLATION) {
      throw new RoomCalendarError("A room with this name already exists", 409);
    }
    throw error;
  }
  return data as RoomRow;
}

export type LinkableEvent = {
  id: string;
  name: string;
  eventDate: string | null;
  label: string;
};

// Active portal events a coordinator can attach a reservation to. Linking one
// pushes its GHL opportunity into the Planning stage (see
// src/lib/ghl/planning-trigger.ts). `eventDate` is the live GHL "Date of
// Interest" when available, falling back to the stored snapshot.
export async function listLinkableEvents(): Promise<LinkableEvent[]> {
  const supabase = createServiceRoleSupabaseClient();
  const [{ data, error }, liveDates] = await Promise.all([
    supabase
      .from("events")
      .select("id, status, ghl_opportunity_id, ghl_snapshot")
      .in("status", ["draft", "launched"])
      .order("created_at", { ascending: false })
      .limit(100),
    fetchDatesOfInterest(),
  ]);

  if (error) throw error;

  const rows = (data ?? []) as {
    id: string;
    status: string;
    ghl_opportunity_id: string | null;
    ghl_snapshot: unknown;
  }[];

  return rows.map((row) => {
    const snapshot =
      row.ghl_snapshot && typeof row.ghl_snapshot === "object" && !Array.isArray(row.ghl_snapshot)
        ? (row.ghl_snapshot as Record<string, unknown>)
        : {};
    const name =
      typeof snapshot.eventName === "string" && snapshot.eventName
        ? snapshot.eventName
        : "Untitled event";
    const snapshotDate =
      typeof snapshot.eventDate === "string" && snapshot.eventDate
        ? snapshot.eventDate
        : null;
    const eventDate =
      (row.ghl_opportunity_id
        ? liveDates.get(row.ghl_opportunity_id)
        : undefined) ?? snapshotDate;

    return {
      id: row.id,
      name,
      eventDate,
      label: `${name}${eventDate ? ` — ${eventDate}` : ""} (${row.status})`,
    };
  });
}

export type EventRoomReservation = ReservationRow & {
  rooms: Pick<RoomRow, "name" | "color"> | null;
};

// Room reservations linked to a single portal event, for the admin event
// detail view. Includes held and booked blocks, past and future.
export async function listEventReservations(
  eventId: string,
): Promise<EventRoomReservation[]> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("*, rooms(name, color)")
    .eq("event_id", eventId)
    .order("start_datetime");

  if (error) throw error;
  return (data ?? []) as unknown as EventRoomReservation[];
}

// Flip linked reservations between held and booked from the admin event
// detail view. Scoped to the event so a stale form can't touch another
// event's reservations; pass reservationId to change one, omit it for all.
export async function setEventReservationsStatus(params: {
  eventId: string;
  status: Database["public"]["Enums"]["reservation_status"];
  reservationId?: string;
}) {
  const supabase = createServiceRoleSupabaseClient();
  let query = supabase
    .from("reservations")
    .update({ status: params.status } as never)
    .eq("event_id", params.eventId);

  if (params.reservationId) {
    query = query.eq("id", params.reservationId);
  }

  const { data, error } = await query.select("id");

  if (error) throw error;
  if (params.reservationId && !data.length) {
    throw new RoomCalendarError("Reservation not found for this event", 404);
  }
}

export type ReservationConflict = {
  title: string;
  status: ReservationRow["status"];
  start: string;
  end: string;
};

// The reservation holding a room at an overlapping time, if any.
async function findSlotHolder(
  roomId: string,
  start: string,
  end: string,
  excludeId?: string,
): Promise<ReservationConflict | null> {
  const supabase = createServiceRoleSupabaseClient();
  let query = supabase
    .from("reservations")
    .select("title, status, start_datetime, end_datetime")
    .eq("room_id", roomId)
    .lt("start_datetime", end)
    .gt("end_datetime", start)
    .limit(1);
  if (excludeId) query = query.neq("id", excludeId);

  const { data, error } = await query;
  if (error) throw error;

  const holder = (data ?? [])[0] as
    | Pick<ReservationRow, "title" | "status" | "start_datetime" | "end_datetime">
    | undefined;
  return holder
    ? {
        title: holder.title,
        status: holder.status,
        start: holder.start_datetime,
        end: holder.end_datetime,
      }
    : null;
}

// Holds a room for an event (rooms added in the event dates dialog). A
// taken slot comes back as the reservation holding it — or null when the
// database's overlap guard caught a booking made a moment ago.
export async function addEventReservation(params: {
  eventId: string;
  roomId: string;
  title: string;
  coordinatorName: string | null;
  start: string;
  end: string;
  createdBy: string | null;
}): Promise<{ ok: true } | { ok: false; conflict: ReservationConflict | null }> {
  validateTimes(params.start, params.end);
  const holder = await findSlotHolder(params.roomId, params.start, params.end);
  if (holder) return { ok: false, conflict: holder };

  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase.from("reservations").insert({
    room_id: params.roomId,
    title: params.title,
    status: "held",
    start_datetime: params.start,
    end_datetime: params.end,
    event_id: params.eventId,
    coordinator_name: params.coordinatorName,
    created_by: params.createdBy,
  } as never);

  if (error) {
    if (error.code === EXCLUSION_VIOLATION) return { ok: false, conflict: null };
    throw error;
  }
  return { ok: true };
}

// Moves one of an event's reservations to another room and/or time (the
// event dates dialog). Scoped to the event like setEventReservationsStatus.
// A taken slot comes back as the reservation holding it — or null when the
// database's overlap guard caught a booking made a moment ago.
export async function moveEventReservation(params: {
  eventId: string;
  reservationId: string;
  roomId: string;
  start: string;
  end: string;
}): Promise<{ ok: true } | { ok: false; conflict: ReservationConflict | null }> {
  validateTimes(params.start, params.end);
  const holder = await findSlotHolder(
    params.roomId,
    params.start,
    params.end,
    params.reservationId,
  );
  if (holder) return { ok: false, conflict: holder };

  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("reservations")
    .update({
      room_id: params.roomId,
      start_datetime: params.start,
      end_datetime: params.end,
    } as never)
    .eq("id", params.reservationId)
    .eq("event_id", params.eventId)
    .select("id");

  if (error) {
    if (error.code === EXCLUSION_VIOLATION) return { ok: false, conflict: null };
    throw error;
  }
  if (!data.length) {
    throw new RoomCalendarError("Reservation not found for this event", 404);
  }
  return { ok: true };
}

// Deletes one of an event's reservations (released from the dates dialog).
export async function releaseEventReservation(params: {
  eventId: string;
  reservationId: string;
}) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("reservations")
    .delete()
    .eq("id", params.reservationId)
    .eq("event_id", params.eventId)
    .select("id");

  if (error) throw error;
  if (!data.length) {
    throw new RoomCalendarError("Reservation not found for this event", 404);
  }
}

export type ReservationFilters = {
  start?: string;
  end?: string;
  room_id?: string;
  status?: string;
};

export async function listReservations(filters: ReservationFilters) {
  const supabase = createServiceRoleSupabaseClient();
  let query = supabase.from("reservations").select("*");

  if (filters.start) query = query.gt("end_datetime", filters.start);
  if (filters.end) query = query.lt("start_datetime", filters.end);
  if (filters.room_id) query = query.eq("room_id", filters.room_id);
  if (filters.status === "held" || filters.status === "booked") {
    query = query.eq("status", filters.status);
  }

  const { data, error } = await query.order("start_datetime");
  if (error) throw error;
  return (data ?? []) as ReservationRow[];
}

export type UpcomingAssignment = ReservationRow & {
  rooms: Pick<RoomRow, "name" | "color"> | null;
};

// Reservations with their room, for the Coordinator Assignments view. Defaults
// to upcoming (not yet ended); an explicit date range filters on the event's
// start date instead, so past ranges can be reviewed too.
export async function listUpcomingAssignments(range?: {
  from?: string | null;
  to?: string | null;
}) {
  const supabase = createServiceRoleSupabaseClient();
  let query = supabase.from("reservations").select("*, rooms(name, color)");

  if (range?.from) {
    query = query.gte(
      "start_datetime",
      new Date(`${range.from}T00:00:00`).toISOString(),
    );
  } else {
    query = query.gte("end_datetime", new Date().toISOString());
  }

  if (range?.to) {
    const endOfDay = new Date(`${range.to}T00:00:00`);
    endOfDay.setDate(endOfDay.getDate() + 1);
    query = query.lt("start_datetime", endOfDay.toISOString());
  }

  const { data, error } = await query.order("start_datetime");

  if (error) throw error;
  return (data ?? []) as unknown as UpcomingAssignment[];
}

function validateTimes(start: string, end: string) {
  if (new Date(start) >= new Date(end)) {
    throw new RoomCalendarError("End time must be after start time", 400);
  }
}

async function assertNoConflict(
  roomId: string,
  start: string,
  end: string,
  excludeId?: string,
) {
  const supabase = createServiceRoleSupabaseClient();
  let query = supabase
    .from("reservations")
    .select("id", { count: "exact", head: true })
    .eq("room_id", roomId)
    .lt("start_datetime", end)
    .gt("end_datetime", start);

  if (excludeId) query = query.neq("id", excludeId);

  const { count, error } = await query;
  if (error) throw error;
  if ((count ?? 0) > 0) {
    throw new RoomCalendarError(CONFLICT_MESSAGE, 409);
  }
}

export async function createReservation(input: ReservationInsert) {
  if (!input.room_id || !input.title || !input.start_datetime || !input.end_datetime) {
    throw new RoomCalendarError(
      "room_id, title, status, start_datetime, and end_datetime are required",
      400,
    );
  }
  validateTimes(input.start_datetime, input.end_datetime);
  await assertNoConflict(input.room_id, input.start_datetime, input.end_datetime);

  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("reservations")
    .insert(input as never)
    .select()
    .single();

  if (error) {
    if (error.code === EXCLUSION_VIOLATION) {
      throw new RoomCalendarError(CONFLICT_MESSAGE, 409);
    }
    throw error;
  }
  return data as ReservationRow;
}

export async function getReservation(id: string) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("reservations")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error) throw error;
  if (!data) {
    throw new RoomCalendarError("Reservation not found", 404);
  }
  return data as ReservationRow;
}

export async function updateReservation(id: string, patch: ReservationUpdate) {
  const existing = await getReservation(id);

  const merged: ReservationRow = { ...existing, ...patch };
  validateTimes(merged.start_datetime, merged.end_datetime);
  await assertNoConflict(
    merged.room_id,
    merged.start_datetime,
    merged.end_datetime,
    id,
  );

  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("reservations")
    .update(patch as never)
    .eq("id", id)
    .select()
    .single();

  if (error) {
    if (error.code === EXCLUSION_VIOLATION) {
      throw new RoomCalendarError(CONFLICT_MESSAGE, 409);
    }
    throw error;
  }
  return data as ReservationRow;
}

export async function deleteReservation(id: string) {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase
    .from("reservations")
    .delete()
    .eq("id", id)
    .select("id");

  if (error) throw error;
  if (!data.length) {
    throw new RoomCalendarError("Reservation not found", 404);
  }
}
