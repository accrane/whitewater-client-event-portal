// Portal roles live in Supabase auth app_metadata.role — only the service
// role can write it, so nobody can promote themselves. Access is granted, not
// assumed: an account without a recognized role (a public sign-up, an
// anonymous session, a user added straight in the Supabase dashboard) gets no
// portal access until a manager assigns one on System → Users. The "admin"
// role is shown to people as "Manager"; "admin" stays the stored value.
// Import-free so proxy.ts and the tests can use it.

export type PortalRole = "admin" | "coordinator";

export const PORTAL_ROLES: PortalRole[] = ["admin", "coordinator"];

export function getUserRole(user: {
  app_metadata?: Record<string, unknown> | null;
  is_anonymous?: boolean;
}): PortalRole | null {
  if (user.is_anonymous) return null;
  const role = user.app_metadata?.role;
  return role === "admin" || role === "coordinator" ? role : null;
}
