"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import { setSfContactStatus } from "@/lib/admin/sf-migration";
import { requireAdminUser } from "@/lib/admin/users";
import { pullSalesforceContacts } from "@/lib/salesforce/contacts";

const SF_MIGRATION_PATH = "/admin/system/sf-migration";

// Row actions carry the current filter query string so redirects land back
// on the same filtered view.
function returnPath(formData: FormData): string {
  const params = String(formData.get("returnParams") || "");
  return params ? `${SF_MIGRATION_PATH}?${params}` : SF_MIGRATION_PATH;
}

function withMessage(path: string, key: "notice" | "error", message: string): string {
  const joiner = path.includes("?") ? "&" : "?";
  return `${path}${joiner}${key}=${encodeURIComponent(message)}`;
}

function done(formData: FormData, message: string): never {
  revalidatePath(SF_MIGRATION_PATH);
  redirect(withMessage(returnPath(formData), "notice", message));
}

function fail(formData: FormData, message: string): never {
  redirect(withMessage(returnPath(formData), "error", message));
}

export async function pullContactsAction(formData: FormData) {
  await requireAdminUser();

  const mode = formData.get("mode") === "full" ? "full" : "incremental";

  let summary: string;
  try {
    const result = await pullSalesforceContacts(mode);
    summary = `Pull complete (${result.mode}): ${result.seen} contacts checked, ${result.upserted} added or updated.`;
  } catch (error) {
    fail(
      formData,
      error instanceof Error ? `Pull failed: ${error.message}` : "Pull failed.",
    );
  }

  done(formData, summary);
}

export async function excludeContactAction(formData: FormData) {
  await requireAdminUser();

  const sfId = String(formData.get("sfId") || "");
  const name = String(formData.get("name") || "Contact");

  try {
    await setSfContactStatus(sfId, "excluded");
  } catch (error) {
    fail(formData, error instanceof Error ? error.message : "Update failed.");
  }

  done(formData, `${name} excluded from the migration.`);
}

export async function restoreContactAction(formData: FormData) {
  await requireAdminUser();

  const sfId = String(formData.get("sfId") || "");
  const name = String(formData.get("name") || "Contact");

  try {
    await setSfContactStatus(sfId, "staged");
  } catch (error) {
    fail(formData, error instanceof Error ? error.message : "Update failed.");
  }

  done(formData, `${name} restored to staged.`);
}

export async function approveContactAction(formData: FormData) {
  await requireAdminUser();

  const sfId = String(formData.get("sfId") || "");
  const name = String(formData.get("name") || "Contact");

  try {
    await setSfContactStatus(sfId, "approved");
  } catch (error) {
    fail(formData, error instanceof Error ? error.message : "Update failed.");
  }

  done(formData, `${name} approved for push.`);
}
