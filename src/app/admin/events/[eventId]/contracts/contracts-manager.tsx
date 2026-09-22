"use client";

import { useEffect, useState, useTransition } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import type { ContractTemplateOptions } from "@/lib/admin/contracts";
import {
  draftTablesForLayout,
  draftTablesToLineItems,
  fallbackDraftTables,
  type DraftTable,
} from "@/lib/contracts/draft-tables";
import {
  EDITABLE_CONTRACT_STATUSES,
  contractStatusLabels,
  groupContractLineItems,
  isCountedLineItem,
  type ContractLineItem,
  type EventContract,
} from "@/lib/contracts/shared";

import {
  createContractAction,
  deleteFailedContractAction,
  loadContractCatalogAction,
  loadContractTemplateLayoutAction,
  refreshContractAction,
  updateContractAction,
} from "./actions";
import { ContractItemsEditor, type CatalogState } from "./contract-items-editor";

// Contracts tab body: the event's contract history (newest first) and the
// contract form — name, template, terms, the items (from the PandaDoc
// catalog or typed, grouped by the template's pricing tables), and the
// recipient. Creating one builds and sends the PandaDoc document
// server-side; the client then signs it from their portal. Unsigned
// contracts can be edited in place: same form, prefilled, and the document
// is updated and re-sent.

type ContractsManagerProps = {
  eventId: string;
  eventName: string;
  contracts: EventContract[];
  templateOptions: ContractTemplateOptions;
  contacts: { name: string | null; email: string | null };
  portalLaunched: boolean;
  // Event day line ("Friday, November 20th - 9:45am arrival") offered as the
  // first items group's sub-heading on a new contract.
  defaultSectionTitle: string;
};

const statusTones: Record<EventContract["status"], BadgeTone> = {
  draft: "neutral",
  creating: "info",
  approval: "info",
  sent: "warning",
  viewed: "info",
  completed: "success",
  declined: "danger",
  voided: "neutral",
  error: "danger",
};

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

function formatDateTime(iso: string | null): string {
  if (!iso) return "—";
  return new Intl.DateTimeFormat("en-US", {
    dateStyle: "medium",
    timeStyle: "short",
  }).format(new Date(iso));
}

export function ContractsManager({
  eventId,
  eventName,
  contracts,
  templateOptions,
  contacts,
  portalLaunched,
  defaultSectionTitle,
}: ContractsManagerProps) {
  const [showForm, setShowForm] = useState(contracts.length === 0);

  return (
    <div className="space-y-6">
      {!portalLaunched ? (
        <p className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          The client portal isn&apos;t launched yet. Contracts can be created
          now, but the client can only sign once the portal is live (or if you
          tick &ldquo;also email from PandaDoc&rdquo;).
        </p>
      ) : null}

      <div className="flex items-center justify-between gap-3">
        <h2 className="text-lg font-semibold text-slate-950">
          Contracts{contracts.length ? ` (${contracts.length})` : ""}
        </h2>
        {!showForm ? (
          <Button onClick={() => setShowForm(true)} size="sm">
            New contract
          </Button>
        ) : null}
      </div>

      {showForm ? (
        <ContractForm
          contacts={contacts}
          defaultSectionTitle={defaultSectionTitle}
          eventId={eventId}
          eventName={eventName}
          onDone={() => setShowForm(false)}
          templateOptions={templateOptions}
        />
      ) : null}

      {contracts.length === 0 && !showForm ? (
        <EmptyState
          action={
            <Button onClick={() => setShowForm(true)} size="sm">
              New contract
            </Button>
          }
          description="Create the first contract for this event. Add the items and prices it covers, and the client signs it from their portal."
          title="No contracts yet"
        />
      ) : (
        <ul className="space-y-4">
          {contracts.map((contract) => (
            <ContractCard
              contract={contract}
              eventId={eventId}
              key={contract.id}
            />
          ))}
        </ul>
      )}
    </div>
  );
}

function ContractCard({
  contract,
  eventId,
}: {
  contract: EventContract;
  eventId: string;
}) {
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);
  const [expanded, setExpanded] = useState(false);
  const [editing, setEditing] = useState(false);

  const removable =
    ["draft", "creating", "error"].includes(contract.status) &&
    !contract.pandadocDocumentId;
  const editable =
    EDITABLE_CONTRACT_STATUSES.includes(contract.status) &&
    Boolean(contract.pandadocDocumentId);

  if (editing) {
    return (
      <li>
        <ContractForm
          contract={contract}
          eventId={eventId}
          onDone={() => setEditing(false)}
        />
      </li>
    );
  }

  return (
    <li className="rounded-xl border border-slate-200 bg-white p-5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-semibold text-slate-950">
              {contract.name}
            </h3>
            <StatusBadge tone={statusTones[contract.status]}>
              {contractStatusLabels[contract.status]}
            </StatusBadge>
          </div>
          <p className="mt-1 text-xs text-slate-500">
            {contract.recipientName || contract.recipientEmail
              ? `To ${contract.recipientName ?? ""}${
                  contract.recipientEmail ? ` <${contract.recipientEmail}>` : ""
                } · `
              : ""}
            Created {formatDateTime(contract.createdAt)}
            {contract.createdBy ? ` by ${contract.createdBy}` : ""}
            {contract.revisedAt
              ? ` · Revised ${formatDateTime(contract.revisedAt)}${
                  contract.revisedBy ? ` by ${contract.revisedBy}` : ""
                } (revision ${contract.revision})`
              : ""}
          </p>
        </div>
        <p className="text-right">
          <span className="block text-lg font-semibold text-slate-950">
            {currency.format(contract.grandTotal ?? contract.subtotal)}
          </span>
          <span className="block type-label text-slate-500">
            {contract.grandTotal !== null ? "PandaDoc total" : "Subtotal"}
          </span>
        </p>
      </div>

      <dl className="mt-3 grid gap-x-6 gap-y-1 text-xs text-slate-600 sm:grid-cols-3">
        <div>
          <dt className="font-semibold text-slate-500">Sent</dt>
          <dd>{formatDateTime(contract.sentAt)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500">Viewed</dt>
          <dd>{formatDateTime(contract.viewedAt)}</dd>
        </div>
        <div>
          <dt className="font-semibold text-slate-500">Signed</dt>
          <dd>{formatDateTime(contract.completedAt)}</dd>
        </div>
      </dl>

      {contract.lastError ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {contract.lastError}
        </p>
      ) : null}
      {error ? (
        <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-xs text-red-800">
          {error}
        </p>
      ) : null}

      {contract.status === "approval" ? (
        <p className="mt-3 rounded-lg border border-sky-200 bg-sky-100 px-3 py-2 text-xs text-sky-900">
          This template has an approval workflow in PandaDoc. Once it&apos;s
          approved there, the app sends it to the client on the next refresh and
          the portal offers signing.
        </p>
      ) : null}

      {contract.status === "completed" && contract.signedActionsAppliedAt ? (
        <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-xs text-emerald-800">
          Signed {formatDateTime(contract.completedAt)}. Room reservations were
          marked booked and the GHL opportunity moved to Booked. Details are in
          the integration logs.
          {contract.pandadocStatus === "document.waiting_pay"
            ? " PandaDoc is still waiting on the payment step this template collects; the signature itself is on file."
            : ""}
        </p>
      ) : null}

      <div className="mt-4 flex flex-wrap items-center gap-2">
        {editable ? (
          <button
            className={buttonClasses("secondary", "sm")}
            disabled={pending}
            onClick={() => {
              setError(null);
              setEditing(true);
            }}
            type="button"
          >
            Edit
          </button>
        ) : null}
        {contract.lineItems.length > 0 || contract.description ? (
          <button
            className={buttonClasses("ghost", "sm")}
            onClick={() => setExpanded((value) => !value)}
            type="button"
          >
            {expanded ? "Hide details" : "Show details"}
          </button>
        ) : null}
        {contract.pandadocUrl ? (
          <a
            className={buttonClasses("secondary", "sm")}
            href={contract.pandadocUrl}
            rel="noreferrer"
            target="_blank"
          >
            Open in PandaDoc
          </a>
        ) : null}
        {contract.signedPdfUrl ? (
          <a
            className={buttonClasses("secondary", "sm")}
            href={contract.signedPdfUrl}
            rel="noreferrer"
            target="_blank"
          >
            Signed PDF
          </a>
        ) : null}
        {contract.pandadocDocumentId &&
        !["completed", "declined", "voided"].includes(contract.status) ? (
          <button
            className={buttonClasses("secondary", "sm")}
            disabled={pending}
            onClick={() => {
              setError(null);
              startTransition(async () => {
                try {
                  await refreshContractAction(eventId, contract.id);
                } catch (refreshError) {
                  setError(
                    refreshError instanceof Error
                      ? refreshError.message
                      : "Unable to refresh the contract.",
                  );
                }
              });
            }}
            type="button"
          >
            {pending ? "Refreshing…" : "Refresh status"}
          </button>
        ) : null}
        {removable ? (
          <button
            className={buttonClasses("ghost", "sm")}
            disabled={pending}
            onClick={() => {
              if (!window.confirm("Remove this failed contract?")) return;
              setError(null);
              startTransition(async () => {
                const result = await deleteFailedContractAction(
                  eventId,
                  contract.id,
                );
                if (!result.ok) setError(result.error);
              });
            }}
            type="button"
          >
            Remove
          </button>
        ) : null}
      </div>

      {expanded ? (
        <div className="mt-4 space-y-3 border-t border-slate-100 pt-4">
          {contract.description ? (
            <div>
              <p className="type-label text-slate-500">Description / terms</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
                {contract.description}
              </p>
            </div>
          ) : null}
          {contract.lineItems.length > 0 ? (
            <LineItemsTable
              items={contract.lineItems}
              subtotal={contract.subtotal}
            />
          ) : null}
        </div>
      ) : null}
    </li>
  );
}

function LineItemsTable({
  items,
  subtotal,
}: {
  items: ContractLineItem[];
  subtotal: number;
}) {
  return (
    <div className="overflow-x-auto">
      <table className="w-full text-sm">
        <thead>
          <tr className="text-left type-label text-slate-500">
            <th className="py-1 pr-3 font-semibold">Item</th>
            <th className="py-1 pr-3 font-semibold text-right">Qty</th>
            <th className="py-1 pr-3 font-semibold text-right">Unit price</th>
            <th className="py-1 font-semibold text-right">Total</th>
          </tr>
        </thead>
        {groupContractLineItems(items.filter(isCountedLineItem)).map(
          (group, groupIndex) => (
            <tbody
              className="divide-y divide-slate-100"
              key={`${group.table ?? "items"}-${groupIndex}`}
            >
              {group.heading ? (
                <tr>
                  <th
                    className="pt-3 pb-1 text-left text-xs font-semibold text-slate-700"
                    colSpan={4}
                    scope="colgroup"
                  >
                    {group.heading}
                  </th>
                </tr>
              ) : null}
              {group.sections.map((section, sectionIndex) => [
                section.title ? (
                  <tr key={`title-${sectionIndex}`}>
                    <td
                      className="py-1 text-xs font-medium text-slate-500"
                      colSpan={4}
                    >
                      {section.title}
                    </td>
                  </tr>
                ) : null,
                ...section.items.map((item, index) => (
                  <tr key={`${sectionIndex}-${item.name}-${index}`}>
                    <td className="py-2 pr-3">
                      <span className="font-medium text-slate-800">
                        {item.optional ? "✓ " : ""}
                        {item.name}
                      </span>
                      {item.description ? (
                        <span className="block text-xs text-slate-500">
                          {item.description}
                        </span>
                      ) : null}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-700">
                      {item.optional ? "" : item.quantity}
                    </td>
                    <td className="py-2 pr-3 text-right text-slate-700">
                      {item.optional && item.unitPrice === 0
                        ? ""
                        : currency.format(item.unitPrice)}
                    </td>
                    <td className="py-2 text-right font-medium text-slate-800">
                      {item.optional && item.unitPrice === 0
                        ? ""
                        : currency.format(item.quantity * item.unitPrice)}
                    </td>
                  </tr>
                )),
              ])}
            </tbody>
          ),
        )}
        <tfoot>
          <tr>
            <td
              className="pt-2 text-right type-label text-slate-500"
              colSpan={3}
            >
              Subtotal
            </td>
            <td className="pt-2 text-right font-semibold text-slate-950">
              {currency.format(subtotal)}
            </td>
          </tr>
        </tfoot>
      </table>
    </div>
  );
}

type ContractFormProps = {
  eventId: string;
  onDone: () => void;
} & (
  | {
      // Create: template picker and recipient are editable.
      contract?: undefined;
      eventName: string;
      templateOptions: ContractTemplateOptions;
      contacts: { name: string | null; email: string | null };
      defaultSectionTitle: string;
    }
  | {
      // Edit: prefilled from the contract; template and recipient are fixed
      // because the PandaDoc document already exists for that recipient.
      contract: EventContract;
      eventName?: undefined;
      templateOptions?: undefined;
      contacts?: undefined;
      defaultSectionTitle?: undefined;
    }
);

function ContractForm(props: ContractFormProps) {
  const { eventId, onDone } = props;
  const editing = props.contract !== undefined;
  const templateOptions = props.templateOptions;

  const [name, setName] = useState(
    editing ? props.contract.name : `${props.eventName} — Event Contract`,
  );
  // The configured default only counts if PandaDoc actually lists it;
  // otherwise the first template is selected so the picker never shows a
  // name the form isn't holding.
  const [templateId, setTemplateId] = useState(() => {
    if (editing) return props.contract.pandadocTemplateId ?? "";
    const list = templateOptions?.templates ?? [];
    const preferred = templateOptions?.defaultTemplateId;
    if (preferred && list.some((template) => template.id === preferred)) {
      return preferred;
    }
    return list[0]?.id ?? preferred ?? "";
  });
  const [description, setDescription] = useState(
    editing ? (props.contract.description ?? "") : "",
  );
  const savedItems = editing ? props.contract.lineItems : undefined;
  const defaultSectionTitle = props.defaultSectionTitle;
  // Until the template's tables arrive the items sit in one plain group.
  const [tables, setTables] = useState<DraftTable[]>(() =>
    fallbackDraftTables(savedItems ?? []),
  );
  const [layoutStatus, setLayoutStatus] = useState<{
    loading: boolean;
    error: string | null;
  }>({ loading: Boolean(templateId), error: null });
  const [catalog, setCatalog] = useState<CatalogState>({ status: "loading" });
  const [recipientName, setRecipientName] = useState(
    editing
      ? (props.contract.recipientName ?? "")
      : (props.contacts.name ?? ""),
  );
  const [recipientEmail, setRecipientEmail] = useState(
    editing
      ? (props.contract.recipientEmail ?? "")
      : (props.contacts.email ?? ""),
  );
  const [notifyByEmail, setNotifyByEmail] = useState(false);
  const [pending, startTransition] = useTransition();
  const [error, setError] = useState<string | null>(null);

  // The template's pricing tables shape the items section; re-read whenever
  // another template is picked.
  useEffect(() => {
    if (!templateId) return;
    let cancelled = false;
    loadContractTemplateLayoutAction(templateId)
      .then((outcome) => {
        if (cancelled) return;
        if (outcome.ok) {
          setTables((previous) =>
            draftTablesForLayout(outcome.layout, {
              saved: savedItems,
              previous,
              defaultSectionTitle,
            }),
          );
          setLayoutStatus({ loading: false, error: null });
        } else {
          setLayoutStatus({ loading: false, error: outcome.error });
        }
      })
      .catch(() => {
        if (!cancelled) {
          setLayoutStatus({ loading: false, error: "PandaDoc didn't respond" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, [templateId, savedItems, defaultSectionTitle]);

  useEffect(() => {
    let cancelled = false;
    loadContractCatalogAction()
      .then((outcome) => {
        if (cancelled) return;
        setCatalog(
          outcome.ok
            ? { status: "ready", items: outcome.items }
            : { status: "error", error: outcome.error },
        );
      })
      .catch(() => {
        if (!cancelled) {
          setCatalog({ status: "error", error: "PandaDoc didn't respond" });
        }
      });
    return () => {
      cancelled = true;
    };
  }, []);

  const changeTemplate = (id: string) => {
    setTemplateId(id);
    setLayoutStatus({ loading: Boolean(id), error: null });
  };

  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800";
  const readOnlyClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600";

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const outcome = editing
        ? await updateContractAction(eventId, props.contract.id, {
            name,
            description,
            notifyByEmail,
            lineItems: draftTablesToLineItems(tables),
          })
        : await createContractAction(eventId, {
            name,
            description,
            templateId,
            recipientName,
            recipientEmail,
            notifyByEmail,
            lineItems: draftTablesToLineItems(tables),
            templateTablesShown: tables.some((table) => table.name),
          });
      if (outcome.ok) {
        onDone();
      } else {
        setError(outcome.error);
      }
    });
  };

  return (
    <form
      className="space-y-5 rounded-xl border border-slate-200 bg-white p-5"
      onSubmit={(event) => {
        event.preventDefault();
        submit();
      }}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <h3 className="text-base font-semibold text-slate-950">
            {editing ? `Edit ${props.contract.name}` : "New contract"}
          </h3>
          <p className="mt-1 text-sm text-slate-600">
            {editing
              ? "Updates the same PandaDoc document and re-sends it. Anything the client already filled in stays; signature fields are cleared and their earlier signing link stops working."
              : "Builds the document in PandaDoc from the chosen template, with these items in its pricing tables and the description as its terms."}
          </p>
        </div>
        <button
          className={buttonClasses("ghost", "sm")}
          onClick={onDone}
          type="button"
        >
          Cancel
        </button>
      </div>

      {templateOptions?.error ? (
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {templateOptions.error}
        </p>
      ) : null}

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-semibold text-slate-700">Contract name</span>
          <input
            className={`mt-1 ${inputClass}`}
            onChange={(event) => setName(event.target.value)}
            placeholder="e.g. Event Contract, Order change, 50% deposit"
            required
            value={name}
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-slate-700">
            PandaDoc template
          </span>
          {editing ? (
            <input
              className={`mt-1 ${readOnlyClass}`}
              readOnly
              value={templateId || "—"}
            />
          ) : templateOptions && templateOptions.templates.length > 0 ? (
            <select
              className={`mt-1 ${inputClass}`}
              onChange={(event) => changeTemplate(event.target.value)}
              value={templateId}
            >
              {templateOptions.templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.name}
                </option>
              ))}
            </select>
          ) : (
            <input
              className={`mt-1 ${inputClass}`}
              onChange={(event) => changeTemplate(event.target.value)}
              placeholder="Template id (or set PANDADOC_TEMPLATE_ID)"
              value={templateId}
            />
          )}
          {editing ? (
            <span className="mt-1 block text-xs text-slate-500">
              The template can&apos;t change once the document exists.
            </span>
          ) : null}
        </label>
      </div>

      <label className="block text-sm">
        <span className="font-semibold text-slate-700">
          Description / terms
        </span>
        <textarea
          className={`mt-1 min-h-24 ${inputClass}`}
          onChange={(event) => setDescription(event.target.value)}
          placeholder="Anything specific to this contract: deposit terms, what changed from the last order, cancellation notes…"
          value={description}
        />
        <span className="mt-1 block text-xs text-slate-500">
          Appears wherever the template uses the [contract.description] token.
        </span>
      </label>

      <ContractItemsEditor
        catalog={catalog}
        layoutError={layoutStatus.error}
        loadingLayout={layoutStatus.loading}
        onChange={setTables}
        tables={tables}
      />

      <div className="grid gap-4 sm:grid-cols-2">
        <label className="block text-sm">
          <span className="font-semibold text-slate-700">Recipient name</span>
          <input
            className={`mt-1 ${editing ? readOnlyClass : inputClass}`}
            onChange={(event) => setRecipientName(event.target.value)}
            readOnly={editing}
            value={recipientName}
          />
        </label>
        <label className="block text-sm">
          <span className="font-semibold text-slate-700">Recipient email</span>
          <input
            className={`mt-1 ${editing ? readOnlyClass : inputClass}`}
            onChange={(event) => setRecipientEmail(event.target.value)}
            readOnly={editing}
            required
            type="email"
            value={recipientEmail}
          />
          <span className="mt-1 block text-xs text-slate-500">
            {editing
              ? "To send to someone else, create a new contract."
              : "Prefilled from the event\u2019s GHL contact."}
          </span>
        </label>
      </div>

      <label className="flex items-start gap-2 text-sm text-slate-700">
        <input
          checked={notifyByEmail}
          className="mt-1 h-4 w-4 rounded border-slate-300"
          onChange={(event) => setNotifyByEmail(event.target.checked)}
          type="checkbox"
        />
        <span>
          {editing
            ? "Also email the updated contract from PandaDoc."
            : "Also email the signing invite from PandaDoc."}{" "}
          <span className="text-slate-500">
            Off by default: the client signs from the portal, so share the
            portal link (or a conversations message) instead.
          </span>
        </span>
      </label>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      <div className="flex justify-end gap-2">
        <Button
          disabled={
            pending ||
            layoutStatus.loading ||
            !name.trim() ||
            !recipientEmail.trim()
          }
          type="submit"
        >
          {pending
            ? editing
              ? "Updating in PandaDoc…"
              : "Creating in PandaDoc…"
            : editing
              ? "Save and re-send"
              : "Create and send contract"}
        </Button>
      </div>
    </form>
  );
}
