import { notFound } from "next/navigation";

import { AdminShell } from "@/components/admin/admin-shell";
import { ButtonLink } from "@/components/ui/button";
import {
  getContractTemplateOptions,
  listEventContracts,
  syncEventContracts,
} from "@/lib/admin/contracts";
import { getAdminEventById } from "@/lib/admin/events";
import { getUserRole } from "@/lib/admin/users";
import { formatEventDayHeading } from "@/lib/dates";
import { eventDayList } from "@/lib/dates/event-dates";
import { requireEventAccess } from "@/lib/admin/event-access";
import { requireStaffUser } from "@/lib/admin/session";

import { defaultContractName } from "@/lib/contracts/shared";

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
  const staff = await requireStaffUser();
  const { user } = staff;
  const isAdmin = getUserRole(user) === "admin";

  const { eventId } = await params;
  const event = await getAdminEventById(eventId);

  if (!event) {
    notFound();
  }
  await requireEventAccess(staff, event);

  await syncEventContracts(eventId);

  const [allContracts, templateOptions] = await Promise.all([
    listEventContracts(eventId, { withSignedUrls: true }),
    getContractTemplateOptions(),
  ]);
  // PandaDoc is where contracts are approved and coordinators may not
  // approve their own, so only managers get the staff PandaDoc link (left
  // out of the page entirely for coordinators, not just hidden).
  const contracts = isAdmin
    ? allContracts
    : allContracts.map((contract) => ({ ...contract, pandadocUrl: null }));

  const eventDay = formatEventDayHeading(event.eventDate);
  const defaultSectionTitle =
    eventDay && event.arrivalTime
      ? `${eventDay} - ${event.arrivalTime} arrival`
      : eventDay;
  // Every event day as a sub-heading suggestion; the first carries the
  // arrival time like the default does.
  const sectionSuggestions = eventDayList(event.eventDate, event.eventEndDate).map(
    (day, index) =>
      index === 0 ? defaultSectionTitle : formatEventDayHeading(day),
  );

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
        defaultName={defaultContractName({
          eventDate: event.eventDate,
          eventName: event.eventName,
          contactName: event.contactName,
        })}
        defaultSectionTitle={defaultSectionTitle}
        eventId={eventId}
        sectionSuggestions={sectionSuggestions}
        eventName={event.eventName}
        portalLaunched={event.status === "launched"}
        templateOptions={templateOptions}
      />
    </AdminShell>
  );
}
