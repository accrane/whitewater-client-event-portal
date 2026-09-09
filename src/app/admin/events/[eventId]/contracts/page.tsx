import { notFound, redirect } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { ButtonLink } from "@/components/ui/button";
import {
  getContractTemplateOptions,
  listEventContracts,
  syncEventContracts,
} from "@/lib/admin/contracts";
import { getAdminEventById } from "@/lib/admin/events";
import { createServerSupabaseClient } from "@/lib/supabase/server";

import { ContractsManager } from "./contracts-manager";

type AdminContractsPageProps = {
  params: Promise<{ eventId: string }>;
};

// Contracts tab: every PandaDoc contract ever sent for the event (status,
// totals, links, archived PDF) plus the form to create the next one.
// Open contracts are refreshed from PandaDoc on load, like GHL data on the
// event page.
export default async function AdminContractsPage({
  params,
}: AdminContractsPageProps) {
  const supabase = await createServerSupabaseClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    redirect("/admin/login");
  }

  const { eventId } = await params;
  const event = await getAdminEventById(eventId);

  if (!event) {
    notFound();
  }

  await syncEventContracts(eventId);

  const [contracts, templateOptions] = await Promise.all([
    listEventContracts(eventId, { withSignedUrls: true }),
    getContractTemplateOptions(),
  ]);

  return (
    <AdminShell
      actions={
        <>
          <ButtonLink href={`/admin/events/${eventId}/checklist`} variant="secondary">
            Checklist
          </ButtonLink>
          <ButtonLink href={`/admin/events/${eventId}/schedule`} variant="secondary">
            Schedule &amp; Notes
          </ButtonLink>
        </>
      }
      backHref={`/admin/events/${eventId}`}
      backLabel="Back to event"
      description="Create PandaDoc contracts with line items and terms. Clients review and sign inside their portal; every contract stays here for the life of the event."
      eyebrow="Contracts"
      title={event.eventName}
      userEmail={user.email}
    >
      <ContractsManager
        contacts={{
          name: event.contactName,
          email: event.contactEmail,
        }}
        contracts={contracts}
        eventId={eventId}
        eventName={event.eventName}
        portalLaunched={event.status === "launched"}
        templateOptions={templateOptions}
      />
    </AdminShell>
  );
}
