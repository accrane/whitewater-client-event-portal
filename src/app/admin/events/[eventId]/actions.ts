"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  applyChecklistTemplateToEvent,
  updateEventChecklistItem,
} from "@/lib/admin/checklist-templates";
import {
  deleteAdminEvent,
  markEventUploadReviewed,
  markEventVendorReviewed,
} from "@/lib/admin/events";
import { prepareAdminPortalLaunch } from "@/lib/admin/portal-launch";
import { createServerSupabaseClient } from "@/lib/supabase/server";

const launchConfirmationValue = "planner-approved-launch";

export async function launchPortalAction(formData: FormData) {
  const eventId = String(formData.get("eventId") || "").trim();
  const confirmation = String(formData.get("launchConfirmation") || "").trim();

  if (!eventId) {
    throw new Error("Unable to launch portal: missing event ID");
  }

  if (confirmation !== launchConfirmationValue) {
    throw new Error("Unable to launch portal: planner approval confirmation missing");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  await prepareAdminPortalLaunch(eventId);

  revalidatePath("/admin");
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);

  redirect(`/admin/events/${eventId}?launched=1`);
}

const deleteConfirmationValue = "delete-event-confirmed";

export async function deleteEventAction(formData: FormData) {
  const eventId = String(formData.get("eventId") || "").trim();
  const confirmation = String(formData.get("deleteConfirmation") || "").trim();

  if (!eventId) {
    throw new Error("Unable to delete event: missing event ID");
  }

  if (confirmation !== deleteConfirmationValue) {
    throw new Error("Unable to delete event: confirmation missing");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  await deleteAdminEvent(eventId);

  revalidatePath("/admin");
  revalidatePath("/admin/events");
  revalidatePath("/admin/calendar");

  redirect("/admin/events?deleted=1");
}

export async function applyChecklistTemplateAction(formData: FormData) {
  const eventId = String(formData.get("eventId") || "").trim();
  const templateId = String(formData.get("templateId") || "").trim();

  if (!eventId) {
    throw new Error("Unable to apply checklist template: missing event ID");
  }

  if (!templateId) {
    throw new Error("Unable to apply checklist template: missing template ID");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  await applyChecklistTemplateToEvent({ eventId, templateId });

  revalidatePath("/admin");
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);

  redirect(`/admin/events/${eventId}?checklist=applied`);
}

export async function updateChecklistItemAction(formData: FormData) {
  const eventId = String(formData.get("eventId") || "").trim();
  const itemId = String(formData.get("itemId") || "").trim();
  const title = String(formData.get("title") || "").trim();
  const descriptionValue = formData.get("description");
  const description =
    typeof descriptionValue === "string" ? descriptionValue : null;
  const status = String(formData.get("status") || "").trim();

  if (!eventId) {
    throw new Error("Unable to update checklist item: missing event ID");
  }

  if (!itemId) {
    throw new Error("Unable to update checklist item: missing checklist item ID");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  await updateEventChecklistItem({
    clientVisible: formData.get("clientVisible") === "on",
    completedBy: user.email ?? null,
    description,
    eventId,
    itemId,
    required: formData.get("required") === "on",
    status,
    title,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);

  redirect(`/admin/events/${eventId}?checklist=updated`);
}

export async function reviewVendorSubmissionAction(formData: FormData) {
  const eventId = String(formData.get("eventId") || "").trim();
  const vendorId = String(formData.get("vendorId") || "").trim();

  if (!eventId) {
    throw new Error("Unable to review vendor submission: missing event ID");
  }

  if (!vendorId) {
    throw new Error("Unable to review vendor submission: missing vendor ID");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  await markEventVendorReviewed({
    eventId,
    reviewedBy: user.email ?? null,
    vendorId,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);

  redirect(`/admin/events/${eventId}?vendor=reviewed`);
}

export async function reviewUploadAction(formData: FormData) {
  const eventId = String(formData.get("eventId") || "").trim();
  const uploadId = String(formData.get("uploadId") || "").trim();

  if (!eventId) {
    throw new Error("Unable to review upload: missing event ID");
  }

  if (!uploadId) {
    throw new Error("Unable to review upload: missing upload ID");
  }

  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  await markEventUploadReviewed({
    eventId,
    reviewedBy: user.email ?? null,
    uploadId,
  });

  revalidatePath("/admin");
  revalidatePath("/admin/events");
  revalidatePath(`/admin/events/${eventId}`);

  redirect(`/admin/events/${eventId}?upload=reviewed`);
}
