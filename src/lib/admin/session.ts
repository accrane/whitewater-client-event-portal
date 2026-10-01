import "server-only";

import { cache } from "react";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import type { User } from "@supabase/supabase-js";

import { getUserRole, type PortalRole } from "@/lib/admin/roles";
import { resolveViewAs, VIEW_AS_COOKIE, type ViewAs } from "@/lib/admin/view-as";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// `role` is the role this request runs with. For a manager viewing as a
// coordinator (view-as.ts) that is "coordinator", and `user` carries the same
// role so every getUserRole(user) check agrees; `realRole` stays "admin" and
// `viewAs` names the coordinator. The user's id and email are always the
// real login's, so anything saved is recorded under the manager.
export type StaffUser = {
  user: User;
  role: PortalRole;
  realRole: PortalRole;
  viewAs: ViewAs | null;
};

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

  const realRole = getUserRole(user);
  if (!realRole) return null;

  const viewAs = resolveViewAs(
    realRole,
    (await cookies()).get(VIEW_AS_COOKIE)?.value,
  );
  if (!viewAs) return { user, role: realRole, realRole, viewAs: null };

  return {
    user: { ...user, app_metadata: { ...user.app_metadata, role: "coordinator" } },
    role: "coordinator",
    realRole,
    viewAs,
  };
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
