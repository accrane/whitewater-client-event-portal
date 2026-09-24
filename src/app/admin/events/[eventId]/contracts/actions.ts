"use server";

import { revalidatePath } from "next/cache";

import {
  createEventContract,
  deleteFailedEventContract,
  getContractCatalog,
  getContractTemplateLayout,
  refreshEventContract,
  updateEventContract,
  type ContractCatalogOutcome,
  type ContractTemplateLayoutOutcome,
  type CreateEventContractOutcome,
} from "@/lib/admin/contracts";
import type { ContractLineItem, EventContract } from "@/lib/contracts/shared";
import { requireStaffUser } from "@/lib/admin/session";

function revalidateContracts(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/contracts`);
  revalidatePath(`/admin/events/${eventId}`);
}

// The contract form reads these when it opens (and when the template
// changes): the template's pricing tables and the PandaDoc product catalog.
export async function loadContractTemplateLayoutAction(
  templateId: string,
): Promise<ContractTemplateLayoutOutcome> {
  await requireStaffUser();
  return getContractTemplateLayout(templateId);
}

export async function loadContractCatalogAction(): Promise<ContractCatalogOutcome> {
  await requireStaffUser();
  return getContractCatalog();
}

export type CreateContractFormInput = {
  name: string;
  description: string;
  templateId: string;
  recipientName: string;
  recipientEmail: string;
  notifyByEmail: boolean;
  lineItems: ContractLineItem[];
  templateTablesShown: boolean;
};

export async function createContractAction(
  eventId: string,
  input: CreateContractFormInput,
): Promise<CreateEventContractOutcome> {
  const { user } = await requireStaffUser();
  const outcome = await createEventContract({
    eventId,
    name: input.name,
    description: input.description || null,
    lineItems: input.lineItems,
    templateTablesShown: input.templateTablesShown,
    templateId: input.templateId || null,
    recipientName: input.recipientName || null,
    recipientEmail: input.recipientEmail || null,
    notifyByEmail: input.notifyByEmail,
    createdBy: user.email ?? null,
  });
  revalidateContracts(eventId);
  return outcome;
}

export type UpdateContractFormInput = {
  name: string;
  description: string;
  notifyByEmail: boolean;
  lineItems: ContractLineItem[];
};

export async function updateContractAction(
  eventId: string,
  contractId: string,
  input: UpdateContractFormInput,
): Promise<CreateEventContractOutcome> {
  const { user } = await requireStaffUser();
  const outcome = await updateEventContract({
    eventId,
    contractId,
    name: input.name,
    description: input.description || null,
    lineItems: input.lineItems,
    notifyByEmail: input.notifyByEmail,
    updatedBy: user.email ?? null,
  });
  revalidateContracts(eventId);
  return outcome;
}

export async function refreshContractAction(
  eventId: string,
  contractId: string,
): Promise<EventContract | null> {
  await requireStaffUser();
  const contract = await refreshEventContract(eventId, contractId);
  revalidateContracts(eventId);
  return contract;
}

export async function deleteFailedContractAction(
  eventId: string,
  contractId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requireStaffUser();
  try {
    await deleteFailedEventContract(eventId, contractId);
    revalidateContracts(eventId);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error:
        error instanceof Error
          ? error.message
          : "Unable to remove the contract.",
    };
  }
}
