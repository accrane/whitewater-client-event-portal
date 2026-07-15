import type {
  Room,
  Reservation,
  ReservationFormData,
  PortalEventOption,
  GhlUserOption,
} from "./types";

const BASE = "/api/calendar";

// Admin session cookies authenticate these requests; the route handlers
// verify the Supabase user server-side.
async function request<T>(url: string, options?: RequestInit): Promise<T> {
  const res = await fetch(`${BASE}${url}`, {
    ...options,
    headers: { "Content-Type": "application/json", ...options?.headers },
  });

  if (res.status === 204) return undefined as T;

  const data = await res.json();
  if (!res.ok) throw new Error(data.error || "Request failed");
  return data;
}

export const api = {
  rooms: {
    list: () => request<Room[]>("/rooms"),
  },
  portalEvents: {
    list: () => request<PortalEventOption[]>("/portal-events"),
  },
  ghlUsers: {
    list: () => request<GhlUserOption[]>("/ghl-users"),
  },
  coordinatorAssignment: {
    set: (event_id: string, ghl_user_id: string) =>
      request<{ ok: boolean }>("/coordinator-assignment", {
        method: "POST",
        body: JSON.stringify({ event_id, ghl_user_id }),
      }),
  },
  reservations: {
    list: (params?: {
      start?: string;
      end?: string;
      room_id?: string;
      status?: string;
    }) => {
      const qs = params
        ? "?" +
          new URLSearchParams(
            Object.entries(params).filter(([, v]) => v) as [string, string][],
          ).toString()
        : "";
      return request<Reservation[]>(`/reservations${qs}`);
    },
    create: (data: ReservationFormData) =>
      request<Reservation>("/reservations", {
        method: "POST",
        body: JSON.stringify(data),
      }),
    update: (id: string, data: Partial<ReservationFormData>) =>
      request<Reservation>(`/reservations/${id}`, {
        method: "PUT",
        body: JSON.stringify(data),
      }),
    delete: (id: string) =>
      request<void>(`/reservations/${id}`, { method: "DELETE" }),
  },
};
