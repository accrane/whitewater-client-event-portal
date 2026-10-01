import "server-only";

import { listPortalUsers } from "@/lib/admin/users";
import { listGhlUsers } from "@/lib/ghl/location-data";

import type { ViewAs } from "./view-as";

// The logins a manager can view the portal as: every portal user with the
// Coordinator role, resolved to a GHL user by email the same way their own
// sign-in would be (current-coordinator.ts), so "my events" comes out the
// same. A login with no GHL match is still offered — it is what that
// coordinator would see — and the menu labels it by email.
export type ViewAsCoordinator = ViewAs & { userId: string };

export async function listViewAsCoordinators(): Promise<ViewAsCoordinator[]> {
  const [users, ghlUsers] = await Promise.all([listPortalUsers(), listGhlUsers()]);
  return users
    .filter((user) => user.role === "coordinator")
    .map((user) => {
      const match = ghlUsers.find(
        (ghlUser) => ghlUser.email?.trim().toLowerCase() === user.email.trim().toLowerCase(),
      );
      return {
        userId: user.id,
        email: user.email,
        ghlUserId: match?.id ?? null,
        name: match?.name ?? null,
      };
    })
    .sort((a, b) => (a.name ?? a.email).localeCompare(b.name ?? b.email));
}
