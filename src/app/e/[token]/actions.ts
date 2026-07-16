"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  completeClientChecklistItemForToken,
  markClientChecklistSectionReadyForToken,
  submitClientVendorForToken,
  uploadClientFileForToken,
} from "@/lib/client/portal";

export async function markChecklistSectionReadyAction(formData: FormData) {
  const token = String(formData.get("token") || "").trim();
  const sectionId = String(formData.get("sectionId") || "").trim();

  if (!token) {
    throw new Error("Unable to update checklist section: missing portal token");
  }

  if (!sectionId) {
    throw new Error("Unable to update checklist section: missing section ID");
  }

  await markClientChecklistSectionReadyForToken({ sectionId, token });

  revalidatePath(`/e/${token}`);
  redirect(`/e/${encodeURIComponent(token)}?checklist=received`);
}

export async function completeChecklistItemAction(formData: FormData) {
  const token = String(formData.get("token") || "").trim();
  const itemId = String(formData.get("itemId") || "").trim();

  if (!token) {
    throw new Error("Unable to update checklist item: missing portal token");
  }

  if (!itemId) {
    throw new Error("Unable to update checklist item: missing checklist item ID");
  }

  await completeClientChecklistItemForToken({ itemId, token });

  revalidatePath(`/e/${token}`);
  redirect(`/e/${encodeURIComponent(token)}?checklist=received`);
}

export async function submitVendorAction(formData: FormData) {
  const token = String(formData.get("token") || "").trim();

  if (!token) {
    throw new Error("Unable to submit vendor: missing portal token");
  }

  await submitClientVendorForToken({
    token,
    vendor: {
      companyName: String(formData.get("companyName") || ""),
      contactName: String(formData.get("contactName") || ""),
      email: String(formData.get("email") || ""),
      notes: String(formData.get("notes") || ""),
      phone: String(formData.get("phone") || ""),
      vendorType: String(formData.get("vendorType") || ""),
    },
  });

  revalidatePath(`/e/${token}`);
  redirect(`/e/${encodeURIComponent(token)}?vendor=received`);
}

export async function uploadFileAction(formData: FormData) {
  const token = String(formData.get("token") || "").trim();
  const file = formData.get("file");

  if (!token) {
    throw new Error("Unable to upload file: missing portal token");
  }

  if (!(file instanceof File)) {
    throw new Error("Unable to upload file: missing file");
  }

  await uploadClientFileForToken({ file, token });

  revalidatePath(`/e/${token}`);
  redirect(`/e/${encodeURIComponent(token)}?upload=received`);
}
