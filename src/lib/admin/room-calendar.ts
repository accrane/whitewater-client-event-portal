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

export type LinkableEvent = {
  id: string;
  name: string;
  eventDate: string | null;
  label: string;
};

// Active portal events a planner can attach a reservation to. Linking one
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

// Reservations with their room, for the Planner Assignments view. Defaults
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
