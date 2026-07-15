"use client";

import { useState, useEffect, useCallback } from "react";
import type {
  Room,
  Reservation,
  CalendarState,
  Coordinator,
  PortalEventOption,
  GhlUserOption,
} from "./types";
import { api } from "./api";
import { getWeekRange, getDayRange } from "./utils";

export function useCalendarData() {
  const [rooms, setRooms] = useState<Room[]>([]);
  const [reservations, setReservations] = useState<Reservation[]>([]);
  const [coordinators, setCoordinators] = useState<Coordinator[]>([]);
  const [portalEvents, setPortalEvents] = useState<PortalEventOption[]>([]);
  const [ghlUsers, setGhlUsers] = useState<GhlUserOption[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [calendarState, setCalendarState] = useState<CalendarState>({
    currentDate: new Date(),
    viewMode: "week",
    selectedRoomId: null,
    statusFilter: "all",
  });

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);

      const range =
        calendarState.viewMode === "week"
          ? getWeekRange(calendarState.currentDate)
          : getDayRange(calendarState.currentDate);

      const [
        roomsData,
        reservationsData,
        coordinatorsData,
        portalEventsData,
        ghlUsersData,
      ] = await Promise.all([
        api.rooms.list(),
        api.reservations.list({
          start: range.start.toISOString(),
          end: range.end.toISOString(),
          ...(calendarState.selectedRoomId
            ? { room_id: calendarState.selectedRoomId }
            : {}),
          ...(calendarState.statusFilter !== "all"
            ? { status: calendarState.statusFilter }
            : {}),
        }),
        api.coordinators.list(),
        api.portalEvents.list(),
        api.ghlUsers.list(),
      ]);

      setRooms(roomsData);
      setReservations(reservationsData);
      setCoordinators(coordinatorsData);
      setPortalEvents(portalEventsData);
      setGhlUsers(ghlUsersData);
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load data");
    } finally {
      setLoading(false);
    }
  }, [
    calendarState.currentDate,
    calendarState.viewMode,
    calendarState.selectedRoomId,
    calendarState.statusFilter,
  ]);

  useEffect(() => {
    // Deferred so state updates happen in the fetch callback rather than
    // synchronously in the effect body; also debounces rapid week/day paging.
    const id = setTimeout(fetchData, 0);
    return () => clearTimeout(id);
  }, [fetchData]);

  return {
    rooms,
    reservations,
    coordinators,
    portalEvents,
    ghlUsers,
    loading,
    error,
    calendarState,
    setCalendarState,
    refetch: fetchData,
  };
}
