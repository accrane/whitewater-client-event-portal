"use server";

import { revalidatePath } from "next/cache";
import { redirect } from "next/navigation";

import {
  createEventContract,
  deleteFailedEventContract,
  refreshEventContract,
  type CreateEventContractOutcome,
} from "@/lib/admin/contracts";
import type { ContractLineItem, EventContract } from "@/lib/contracts/shared";
import { createServerSupabaseClient } from "@/lib/supabase/server";

async function requirePlanner() {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }
  return user;
}

function revalidateContracts(eventId: string) {
  revalidatePath(`/admin/events/${eventId}/contracts`);
  revalidatePath(`/admin/events/${eventId}`);
}

export type CreateContractFormInput = {
  name: string;
  description: string;
  templateId: string;
  recipientName: string;
  recipientEmail: string;
  notifyByEmail: boolean;
  lineItems: ContractLineItem[];
};

export async function createContractAction(
  eventId: string,
  input: CreateContractFormInput,
): Promise<CreateEventContractOutcome> {
  const user = await requirePlanner();
  const outcome = await createEventContract({
    eventId,
    name: input.name,
    description: input.description || null,
    lineItems: input.lineItems,
    templateId: input.templateId || null,
    recipientName: input.recipientName || null,
    recipientEmail: input.recipientEmail || null,
    notifyByEmail: input.notifyByEmail,
    createdBy: user.email ?? null,
  });
  revalidateContracts(eventId);
  return outcome;
}

export async function refreshContractAction(
  eventId: string,
  contractId: string,
): Promise<EventContract | null> {
  await requirePlanner();
  const contract = await refreshEventContract(eventId, contractId);
  revalidateContracts(eventId);
  return contract;
}

export async function deleteFailedContractAction(
  eventId: string,
  contractId: string,
): Promise<{ ok: true } | { ok: false; error: string }> {
  await requirePlanner();
  try {
    await deleteFailedEventContract(eventId, contractId);
    revalidateContracts(eventId);
    return { ok: true };
  } catch (error) {
    return {
      ok: false,
      error: error instanceof Error ? error.message : "Unable to remove the contract.",
    };
  }
}
