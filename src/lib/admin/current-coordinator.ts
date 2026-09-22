import { listGhlUsers } from "@/lib/ghl/location-data";

import type { CurrentCoordinator } from "./event-filters";

// The signed-in user as a coordinator: their login email plus the GHL user
// with that email, if any. Events store the coordinator in a snapshot
// written at assignment time, so matching may need the email, the GHL id,
// or the name (see isCurrentCoordinatorsEvent). Null when the login has no
// email, which hides "My events" and, for coordinators, shows nothing.
export async function resolveCurrentCoordinator(
  email: string | null | undefined,
): Promise<CurrentCoordinator | null> {
  if (!email) return null;
  const ghlUsers = await listGhlUsers();
  const match = ghlUsers.find(
    (ghlUser) => ghlUser.email?.trim().toLowerCase() === email.trim().toLowerCase(),
  );
  return { email, ghlUserId: match?.id ?? null, name: match?.name ?? null };
}
