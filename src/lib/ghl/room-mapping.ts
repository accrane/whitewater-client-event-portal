// Maps GHL venue custom-field values to portal room names when they differ.
// Keys and values are matched case-insensitively after trimming; values that
// already match a portal room name exactly need no entry here. Unmatched
// values are logged as integration errors, so check the integration log to
// see what GHL actually sends before adding entries.
export const GHL_ROOM_NAME_MAP: Record<string, string> = {
  // "Room 1": "Room A",
};

export type RoomNameLookup = {
  id: string;
  name: string;
};

export function resolveRoomFromGhlValue<Room extends RoomNameLookup>(
  ghlValue: string,
  rooms: Room[],
): Room | null {
  const normalized = normalize(ghlValue);

  const mapped = Object.entries(GHL_ROOM_NAME_MAP).find(
    ([ghlName]) => normalize(ghlName) === normalized,
  );
  const targetName = normalize(mapped?.[1] ?? ghlValue);

  return rooms.find((room) => normalize(room.name) === targetName) ?? null;
}

function normalize(value: string): string {
  return value.trim().toLowerCase();
}
