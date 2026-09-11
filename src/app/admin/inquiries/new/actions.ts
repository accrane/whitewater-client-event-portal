"use server";

import { redirect } from "next/navigation";

import { getSignedInPortalUser } from "@/lib/admin/users";
import {
  backfillInquiryEvent,
  createPhoneInquiry,
  type ExistingOpportunity,
  type YesNo,
} from "@/lib/ghl/phone-inquiries";

export type PhoneInquiryFormState = {
  error: string | null;
  existing: ExistingOpportunity | null;
};

function text(formData: FormData, key: string): string | null {
  const value = String(formData.get(key) ?? "").trim();
  return value ? value : null;
}

function yesNo(formData: FormData, key: string): YesNo | null {
  const value = text(formData, key);
  return value === "Yes" || value === "No" ? value : null;
}

export async function createPhoneInquiryAction(
  _previous: PhoneInquiryFormState,
  formData: FormData,
): Promise<PhoneInquiryFormState> {
  const portalUser = await getSignedInPortalUser();
  if (!portalUser) redirect("/admin/login");

  const firstName = text(formData, "firstName") ?? "";
  const lastName = text(formData, "lastName") ?? "";
  const email = text(formData, "email");
  const phone = text(formData, "phone");
  const dateOfInterest = text(formData, "dateOfInterest");
  const expedited = formData.get("expedited") === "on";
  const guestsRaw = text(formData, "numberOfGuests");
  const numberOfGuests = guestsRaw && /^\d+$/.test(guestsRaw) ? Number(guestsRaw) : null;

  if (!firstName) return { error: "Enter the caller's first name.", existing: null };
  if (!email && !phone) {
    return { error: "Enter an email or a phone number so GHL can reach them.", existing: null };
  }
  if (dateOfInterest && !/^\d{4}-\d{2}-\d{2}$/.test(dateOfInterest)) {
    return { error: "The date of interest isn't a valid date.", existing: null };
  }
  if (expedited && !email) {
    return { error: "Expedited events need an email address: the portal link goes out by email.", existing: null };
  }
  if (expedited && !text(formData, "coordinatorGhlUserId")) {
    return { error: "Expedited events need a coordinator so the room holds are assigned.", existing: null };
  }

  const result = await createPhoneInquiry({
    firstName,
    lastName,
    email,
    phone,
    companyName: text(formData, "companyName"),
    groupEventName: text(formData, "groupEventName"),
    inquiryType: text(formData, "inquiryType"),
    location: text(formData, "location"),
    dateOfInterest,
    numberOfGuests,
    activityInterest: text(formData, "activityInterest"),
    message: text(formData, "message"),
    catering: yesNo(formData, "catering"),
    venueRental: yesNo(formData, "venueRental"),
    visitedPrior: yesNo(formData, "visitedPrior"),
    dateFlexibility: yesNo(formData, "dateFlexibility"),
    accommodationInterest: yesNo(formData, "accommodationInterest"),
    coordinatorGhlUserId: text(formData, "coordinatorGhlUserId"),
    expedited,
    takenByEmail: portalUser.user.email ?? null,
  });

  if (!result.ok) {
    return { error: result.error, existing: result.existing ?? null };
  }

  redirect(
    `/admin/events/${result.eventId}?inquiry=phone${expedited ? "&rooms=open" : ""}`,
  );
}

export async function backfillInquiryEventAction(formData: FormData) {
  const portalUser = await getSignedInPortalUser();
  if (!portalUser) redirect("/admin/login");

  const opportunityId = String(formData.get("opportunityId") ?? "").trim();
  if (!opportunityId) throw new Error("Missing opportunity id");

  const result = await backfillInquiryEvent(opportunityId, portalUser.user.email ?? null);
  if (!result.ok) throw new Error(result.error);

  redirect(`/admin/events/${result.eventId}?inquiry=backfilled`);
}
