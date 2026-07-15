import type { Database } from "@/types/database";

export type Room = Database["public"]["Tables"]["rooms"]["Row"];
export type Coordinator = Database["public"]["Tables"]["coordinators"]["Row"];
export type Reservation = Database["public"]["Tables"]["reservations"]["Row"];

export type ReservationFormData = Omit<
  Database["public"]["Tables"]["reservations"]["Insert"],
  "id" | "created_at" | "updated_at"
>;

// Portal events a reservation can be linked to (id + display label).
export type PortalEventOption = {
  id: string;
  label: string;
};

export type ViewMode = "week" | "day";

export interface CalendarState {
  currentDate: Date;
  viewMode: ViewMode;
  selectedRoomId: string | null;
  statusFilter: "all" | "held" | "booked";
}
