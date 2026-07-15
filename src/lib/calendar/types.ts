import type { Database } from "@/types/database";

export type Room = Database["public"]["Tables"]["rooms"]["Row"];
export type Coordinator = Database["public"]["Tables"]["coordinators"]["Row"];
export type Reservation = Database["public"]["Tables"]["reservations"]["Row"];

export type ReservationFormData = Omit<
  Database["public"]["Tables"]["reservations"]["Insert"],
  "id" | "created_at" | "updated_at"
>;

// Portal events a reservation can be linked to. `name` becomes the block
// title, `eventDate` auto-fills the booking date (live GHL "Date of
// Interest" when available).
export type PortalEventOption = {
  id: string;
  name: string;
  eventDate: string | null;
  label: string;
};

// GHL location users — the staff who coordinate events. Selecting one on a
// reservation also assigns them to the opportunity in GHL.
export type GhlUserOption = {
  id: string;
  name: string;
};

export type ViewMode = "week" | "day";

export interface CalendarState {
  currentDate: Date;
  viewMode: ViewMode;
  selectedRoomId: string | null;
  statusFilter: "all" | "held" | "booked";
}
