import "server-only";

import { cache } from "react";
import { redirect } from "next/navigation";

import type { User } from "@supabase/supabase-js";

import { getUserRole, type PortalRole } from "@/lib/admin/roles";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export type StaffUser = { user: User; role: PortalRole };

// The signed-in staff member for this request, or null when signed out or when
// the account has no portal role (see roles.ts). Cached per render, so a page
// and its shell share one Supabase Auth round trip. Every page, server action
// and API route checks through here: the proxy only covers /admin pages, and
// a server action can be called directly by anyone who knows its id.
export const getStaffUser = cache(async (): Promise<StaffUser | null> => {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) return null;

  const role = getUserRole(user);
  return role ? { user, role } : null;
});

// Pages and server actions: anyone without staff access goes to the login
// page (the proxy explains a signed-in account that has no role).
export async function requireStaffUser(): Promise<StaffUser> {
  const staff = await getStaffUser();

  if (!staff) {
    redirect("/admin/login");
  }

  return staff;
}
