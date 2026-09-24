import { redirect } from "next/navigation";

import type { User } from "@supabase/supabase-js";

import { getUserRole, type PortalRole } from "@/lib/admin/roles";
import { requireStaffUser, type StaffUser } from "@/lib/admin/session";
import { sendEmail } from "@/lib/email";
import { buildPasswordResetEmail } from "@/lib/email/password-reset";
import { createServiceRoleSupabaseClient } from "@/lib/supabase/server";

export { getUserRole, PORTAL_ROLES, type PortalRole } from "@/lib/admin/roles";

// Page/action guard for the admin-only section: signed out lands on login,
// coordinators land back on the dashboard.
export async function requireAdminUser(): Promise<StaffUser> {
  const staff = await requireStaffUser();

  if (staff.role !== "admin") {
    redirect("/admin");
  }

  return staff;
}

export type PortalUserSummary = {
  id: string;
  email: string;
  // Null: the account has no portal access until a manager picks a role.
  role: PortalRole | null;
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

// Sends the recovery email through Mailgun instead of Supabase's built-in
// mailer (rate-limited, unbranded). The service role generates the recovery
// token and the link lands on /reset-password, which verifies the token and
// lets the user pick a new password — no Supabase redirect allowlist needed.
export async function sendPasswordResetEmail(
  email: string,
  origin: string,
): Promise<void> {
  const supabase = createServiceRoleSupabaseClient();
  const { data, error } = await supabase.auth.admin.generateLink({
    type: "recovery",
    email,
  });

  // Includes "user not found" — the caller shows the same confirmation either
  // way so the form doesn't reveal which emails exist.
  if (error) {
    throw new Error(`Unable to create reset link: ${error.message}`);
  }

  const tokenHash = data.properties?.hashed_token;

  if (!tokenHash) {
    throw new Error("Unable to create reset link: no token in response");
  }

  const resetUrl = `${origin.replace(/\/+$/, "")}/reset-password?token_hash=${encodeURIComponent(tokenHash)}`;
  const { subject, html, text } = buildPasswordResetEmail(resetUrl);

  await sendEmail({ to: email, subject, html, text });
}
