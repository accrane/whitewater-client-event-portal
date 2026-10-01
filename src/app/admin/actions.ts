"use server";

import { refresh } from "next/cache";
import { cookies } from "next/headers";
import { redirect } from "next/navigation";

import { requireStaffUser } from "@/lib/admin/session";
import {
  serializeViewAs,
  VIEW_AS_COOKIE,
  VIEW_AS_MAX_AGE_SECONDS,
} from "@/lib/admin/view-as";
import { listViewAsCoordinators } from "@/lib/admin/view-as-coordinators";
import { createServerSupabaseClient } from "@/lib/supabase/server";

// Managers only: see the portal as one coordinator login does (view-as.ts).
// The login is looked up here rather than trusted from the form.
export async function startViewAsAction(formData: FormData) {
  const staff = await requireStaffUser();
  if (staff.realRole !== "admin") redirect("/admin");

  const userId = String(formData.get("userId") ?? "");
  const coordinator = (await listViewAsCoordinators()).find(
    (candidate) => candidate.userId === userId,
  );
  if (!coordinator) redirect("/admin");

  (await cookies()).set(
    VIEW_AS_COOKIE,
    serializeViewAs({
      email: coordinator.email,
      ghlUserId: coordinator.ghlUserId,
      name: coordinator.name,
    }),
    {
      httpOnly: true,
      maxAge: VIEW_AS_MAX_AGE_SECONDS,
      path: "/",
      sameSite: "lax",
      secure: process.env.NODE_ENV === "production",
    },
  );
  // Re-render where they are; a manager-only page sends them to the
  // dashboard by itself, as it would a coordinator.
  refresh();
}

export async function stopViewAsAction() {
  (await cookies()).delete(VIEW_AS_COOKIE);
  refresh();
}

export async function logoutAction() {
  const supabase = await createServerSupabaseClient();
  await supabase.auth.signOut();
  (await cookies()).delete(VIEW_AS_COOKIE);

  redirect("/admin/login");
}
