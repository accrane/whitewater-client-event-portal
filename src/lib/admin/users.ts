import { redirect } from "next/navigation";

import type { User } from "@supabase/supabase-js";

import {
  createServerSupabaseClient,
  createServiceRoleSupabaseClient,
} from "@/lib/supabase/server";

// Roles live in Supabase auth app_metadata.role — only the service role can
// write it, so a signed-in user cannot escalate themselves. Anyone without an
// explicit role is treated as a planner (least privilege).
export type PortalRole = "admin" | "planner";

export const PORTAL_ROLES: PortalRole[] = ["admin", "planner"];

export function getUserRole(user: User): PortalRole {
  return user.app_metadata?.role === "admin" ? "admin" : "planner";
}

export async function getSignedInPortalUser(): Promise<{
  user: User;
  role: PortalRole;
} | null> {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return null;
  }

  return { user, role: getUserRole(user) };
}

// Page/action guard for the admin-only section: signed out lands on login,
// planners land back on the dashboard.
export async function requireAdminUser(): Promise<{
  user: User;
  role: PortalRole;
}> {
  const portalUser = await getSignedInPortalUser();

  if (!portalUser) {
    redirect("/admin/login");
  }

  if (portalUser.role !== "admin") {
    redirect("/admin");
  }

  return portalUser;
}

export type PortalUserSummary = {
  id: string;
  email: string;
  role: PortalRole;
  createdAt: string;
  lastSignInAt: string | null;
};

export async function listPortalUsers(): Promise<PortalUserSummary[]> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase.auth.admin.listUsers({
    page: 1,
    perPage: 200,
  });

  if (error) {
    throw new Error(`Unable to list users: ${error.message}`);
  }

  return data.users
    .map((user) => ({
      id: user.id,
      email: user.email ?? "(no email)",
      role: getUserRole(user as User),
      createdAt: user.created_at,
      lastSignInAt: user.last_sign_in_at ?? null,
    }))
    .sort((a, b) => a.email.localeCompare(b.email));
}

export async function createPortalUser({
  email,
  password,
  role,
}: {
  email: string;
  password: string;
  role: PortalRole;
}): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase.auth.admin.createUser({
    email,
    password,
    email_confirm: true,
    app_metadata: { role },
  });

  if (error) {
    throw new Error(`Unable to create user: ${error.message}`);
  }
}

export async function deletePortalUser(userId: string): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase.auth.admin.deleteUser(userId);

  if (error) {
    throw new Error(`Unable to delete user: ${error.message}`);
  }
}

export async function setPortalUserRole(
  userId: string,
  role: PortalRole,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    app_metadata: { role },
  });

  if (error) {
    throw new Error(`Unable to update user role: ${error.message}`);
  }
}

export async function setPortalUserPassword(
  userId: string,
  password: string,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const { error } = await supabase.auth.admin.updateUserById(userId, {
    password,
  });

  if (error) {
    throw new Error(`Unable to set user password: ${error.message}`);
  }
}

// Sends the Supabase recovery email; the link lands on /reset-password where
// the user picks a new password. Uses the anon client — no session needed.
export async function sendPasswordResetEmail(
  email: string,
  origin: string,
): Promise<void> {
  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.resetPasswordForEmail(email, {
    redirectTo: `${origin.replace(/\/+$/, "")}/reset-password`,
  });

  if (error) {
    throw new Error(`Unable to send reset email: ${error.message}`);
  }
}
