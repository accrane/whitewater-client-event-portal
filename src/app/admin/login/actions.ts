"use server";

import { headers } from "next/headers";
import { redirect } from "next/navigation";

import { sendPasswordResetEmail } from "@/lib/admin/users";
import { createServerSupabaseClient } from "@/lib/supabase/server";

export async function loginAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const next = String(formData.get("next") || "/admin");

  if (!email || !password) {
    redirect("/admin/login?error=missing-fields");
  }

  const supabase = await createServerSupabaseClient();
  const { error } = await supabase.auth.signInWithPassword({
    email,
    password,
  });

  if (error) {
    redirect("/admin/login?error=invalid-login");
  }

  redirect(next.startsWith("/admin") ? next : "/admin");
}

export async function forgotPasswordAction(formData: FormData) {
  const email = String(formData.get("email") || "").trim();

  if (!email) {
    redirect("/admin/login?view=forgot&error=missing-email");
  }

  try {
    await sendPasswordResetEmail(email, await getRequestOrigin());
  } catch (error) {
    console.error(
      "Failed sending password reset email",
      error instanceof Error ? error.message : error,
    );
    // Fall through to the same confirmation — don't reveal which emails exist.
  }

  redirect("/admin/login?view=forgot&sent=1");
}

async function getRequestOrigin(): Promise<string> {
  const headersList = await headers();
  const forwardedHost = headersList.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headersList.get("host")?.split(",")[0]?.trim();
  const forwardedProto = headersList.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || (host?.startsWith("localhost") ? "http" : "https");

  return host ? `${proto}://${host}` : "http://localhost:3000";
}
