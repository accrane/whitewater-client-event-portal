"use server";

import { headers } from "next/headers";
import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createPortalUser,
  deletePortalUser,
  requireAdminUser,
  sendPasswordResetEmail,
  setPortalUserPassword,
  setPortalUserRole,
  type PortalRole,
} from "@/lib/admin/users";

const USERS_PATH = "/admin/system/users";
const MIN_PASSWORD_LENGTH = 8;

function parseRole(value: FormDataEntryValue | null): PortalRole {
  return value === "admin" ? "admin" : "planner";
}

function done(message: string): never {
  revalidatePath(USERS_PATH);
  redirect(`${USERS_PATH}?notice=${encodeURIComponent(message)}`);
}

function fail(message: string): never {
  redirect(`${USERS_PATH}?error=${encodeURIComponent(message)}`);
}

export async function createUserAction(formData: FormData) {
  await requireAdminUser();

  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");
  const role = parseRole(formData.get("role"));

  if (!email || !password) {
    fail("Enter an email and a password to create a user.");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  try {
    await createPortalUser({ email, password, role });
  } catch (error) {
    fail(error instanceof Error ? error.message : "Unable to create user.");
  }

  done(`User ${email} created as ${role}.`);
}

export async function deleteUserAction(formData: FormData) {
  const { user: currentUser } = await requireAdminUser();

  const userId = String(formData.get("userId") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const confirmation = String(formData.get("deleteConfirmation") || "");

  if (!userId) {
    fail("Unable to delete user: missing user ID.");
  }

  if (confirmation !== "delete-user-confirmed") {
    fail("Check the confirmation box to delete a user.");
  }

  if (userId === currentUser.id) {
    fail("You cannot delete your own account while signed in.");
  }

  try {
    await deletePortalUser(userId);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Unable to delete user.");
  }

  done(`User ${email || userId} deleted.`);
}

export async function setUserRoleAction(formData: FormData) {
  const { user: currentUser } = await requireAdminUser();

  const userId = String(formData.get("userId") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const role = parseRole(formData.get("role"));

  if (!userId) {
    fail("Unable to change role: missing user ID.");
  }

  // Guard against locking everyone out by demoting the last admin.
  if (userId === currentUser.id && role !== "admin") {
    fail("You cannot remove your own admin role while signed in.");
  }

  try {
    await setPortalUserRole(userId, role);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Unable to change role.");
  }

  done(`${email || "User"} is now a ${role}.`);
}

export async function setUserPasswordAction(formData: FormData) {
  await requireAdminUser();

  const userId = String(formData.get("userId") || "").trim();
  const email = String(formData.get("email") || "").trim();
  const password = String(formData.get("password") || "");

  if (!userId) {
    fail("Unable to set password: missing user ID.");
  }

  if (password.length < MIN_PASSWORD_LENGTH) {
    fail(`Passwords need at least ${MIN_PASSWORD_LENGTH} characters.`);
  }

  try {
    await setPortalUserPassword(userId, password);
  } catch (error) {
    fail(error instanceof Error ? error.message : "Unable to set password.");
  }

  done(`Password updated for ${email || "user"}.`);
}

export async function sendResetEmailAction(formData: FormData) {
  await requireAdminUser();

  const email = String(formData.get("email") || "").trim();

  if (!email) {
    fail("Unable to send reset email: missing email.");
  }

  try {
    await sendPasswordResetEmail(email, await getRequestOrigin());
  } catch (error) {
    fail(error instanceof Error ? error.message : "Unable to send reset email.");
  }

  done(`Password reset email sent to ${email}.`);
}

async function getRequestOrigin(): Promise<string> {
  const headersList = await headers();
  const forwardedHost = headersList.get("x-forwarded-host")?.split(",")[0]?.trim();
  const host = forwardedHost || headersList.get("host")?.split(",")[0]?.trim();
  const forwardedProto = headersList.get("x-forwarded-proto")?.split(",")[0]?.trim();
  const proto = forwardedProto || (host?.startsWith("localhost") ? "http" : "https");

  return host ? `${proto}://${host}` : "http://localhost:3000";
}
