"use client";

import { useState, useTransition } from "react";

import { Button, buttonClasses } from "@/components/ui/button";
import { EmptyState } from "@/components/ui/empty-state";
import { StatusBadge, type BadgeTone } from "@/components/ui/status-badge";
import type { ContractTemplateOptions } from "@/lib/admin/contracts";
import {
  EDITABLE_CONTRACT_STATUSES,
  calculateContractSubtotal,
  contractStatusLabels,
  type ContractLineItem,
  type EventContract,
} from "@/lib/contracts/shared";

import {
  createContractAction,
  deleteFailedContractAction,
  refreshContractAction,
  updateContractAction,
} from "./actions";

// Contracts tab body: the event's contract history (newest first) and the
// contract form — name, template, terms, line items with prices, and the
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

type DraftLineItem = {
  key: number;
  name: string;
  description: string;
  quantity: string;
  unitPrice: string;
};

let nextKey = 1;
function blankItem(): DraftLineItem {
  return {
    key: nextKey++,
    name: "",
    description: "",
    quantity: "1",
    unitPrice: "",
  };
}

function toLineItems(drafts: DraftLineItem[]): ContractLineItem[] {
  return drafts
    .filter((item) => item.name.trim())
    .map((item) => ({
      name: item.name.trim(),
      description: item.description.trim(),
      quantity: Number(item.quantity) > 0 ? Number(item.quantity) : 1,
      unitPrice: Number.isFinite(Number(item.unitPrice))
        ? Number(item.unitPrice)
        : 0,
    }));
}

export function ContractsManager({
  eventId,
  eventName,
  contracts,
  templateOptions,
  contacts,
  portalLaunched,
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
        <tbody className="divide-y divide-slate-100">
          {items.map((item, index) => (
            <tr key={`${item.name}-${index}`}>
              <td className="py-2 pr-3">
                <span className="font-medium text-slate-800">{item.name}</span>
                {item.description ? (
                  <span className="block text-xs text-slate-500">
                    {item.description}
                  </span>
                ) : null}
              </td>
              <td className="py-2 pr-3 text-right text-slate-700">
                {item.quantity}
              </td>
              <td className="py-2 pr-3 text-right text-slate-700">
                {currency.format(item.unitPrice)}
              </td>
              <td className="py-2 text-right font-medium text-slate-800">
                {currency.format(item.quantity * item.unitPrice)}
              </td>
            </tr>
          ))}
        </tbody>
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
    }
  | {
      // Edit: prefilled from the contract; template and recipient are fixed
      // because the PandaDoc document already exists for that recipient.
      contract: EventContract;
      eventName?: undefined;
      templateOptions?: undefined;
      contacts?: undefined;
    }
);

function toDraftItems(items: ContractLineItem[]): DraftLineItem[] {
  if (items.length === 0) return [blankItem()];
  return items.map((item) => ({
    key: nextKey++,
    name: item.name,
    description: item.description,
    quantity: String(item.quantity),
    unitPrice: String(item.unitPrice),
  }));
}

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
  const [items, setItems] = useState<DraftLineItem[]>(() =>
    editing ? toDraftItems(props.contract.lineItems) : [blankItem()],
  );
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

  const subtotal = calculateContractSubtotal(toLineItems(items));
  const inputClass =
    "w-full rounded-lg border border-slate-300 px-3 py-2 text-sm text-slate-800";
  const readOnlyClass =
    "w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600";

  const updateItem = (key: number, patch: Partial<DraftLineItem>) =>
    setItems((current) =>
      current.map((item) => (item.key === key ? { ...item, ...patch } : item)),
    );

  const submit = () => {
    setError(null);
    startTransition(async () => {
      const outcome = editing
        ? await updateContractAction(eventId, props.contract.id, {
            name,
            description,
            notifyByEmail,
            lineItems: toLineItems(items),
          })
        : await createContractAction(eventId, {
            name,
            description,
            templateId,
            recipientName,
            recipientEmail,
            notifyByEmail,
            lineItems: toLineItems(items),
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
              : "Builds the document in PandaDoc from the chosen template, with these line items as its pricing table and the description as its terms."}
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
              onChange={(event) => setTemplateId(event.target.value)}
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
              onChange={(event) => setTemplateId(event.target.value)}
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

      <div>
        <div className="flex items-center justify-between">
          <span className="text-sm font-semibold text-slate-700">
            Items and prices
          </span>
          <button
            className={buttonClasses("secondary", "sm")}
            onClick={() => setItems((current) => [...current, blankItem()])}
            type="button"
          >
            Add item
          </button>
        </div>
        <div className="mt-2 space-y-2">
          {items.map((item) => (
            <div
              className="grid gap-2 rounded-lg border border-slate-200 p-3 sm:grid-cols-[2fr_2fr_70px_110px_auto] sm:items-start"
              key={item.key}
            >
              <input
                aria-label="Item name"
                className={inputClass}
                onChange={(event) =>
                  updateItem(item.key, { name: event.target.value })
                }
                placeholder="Item (e.g. Team building session)"
                value={item.name}
              />
              <input
                aria-label="Item description"
                className={inputClass}
                onChange={(event) =>
                  updateItem(item.key, { description: event.target.value })
                }
                placeholder="Description (optional)"
                value={item.description}
              />
              <input
                aria-label="Quantity"
                className={inputClass}
                inputMode="decimal"
                min="0"
                onChange={(event) =>
                  updateItem(item.key, { quantity: event.target.value })
                }
                placeholder="Qty"
                step="any"
                type="number"
                value={item.quantity}
              />
              <input
                aria-label="Unit price"
                className={inputClass}
                inputMode="decimal"
                min="0"
                onChange={(event) =>
                  updateItem(item.key, { unitPrice: event.target.value })
                }
                placeholder="Price"
                step="0.01"
                type="number"
                value={item.unitPrice}
              />
              <button
                aria-label="Remove item"
                className="rounded-lg px-2 py-2 text-sm text-slate-500 hover:bg-slate-100 hover:text-red-700"
                onClick={() =>
                  setItems((current) =>
                    current.length === 1
                      ? [blankItem()]
                      : current.filter(
                          (candidate) => candidate.key !== item.key,
                        ),
                  )
                }
                type="button"
              >
                ✕
              </button>
            </div>
          ))}
        </div>
        <p className="mt-2 text-right text-sm text-slate-700">
          Subtotal{" "}
          <span className="font-semibold text-slate-950">
            {currency.format(subtotal)}
          </span>
        </p>
      </div>

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
          disabled={pending || !name.trim() || !recipientEmail.trim()}
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
