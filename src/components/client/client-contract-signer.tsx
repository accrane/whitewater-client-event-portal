"use client";

import { useEffect, useState } from "react";

import type { ClientContract } from "@/lib/contracts/shared";

// Client-portal contracts card body: each contract with its status, the
// items it covers, and — while PandaDoc is waiting on the client — a
// "Review and sign" button that opens PandaDoc's embedded signer right
// here in the portal. When the signer reports completion, the portal tells
// the app immediately so rooms are booked within seconds rather than
// waiting for a webhook.

const currency = new Intl.NumberFormat("en-US", {
  style: "currency",
  currency: "USD",
});

const statusCopy: Record<
  ClientContract["status"],
  { label: string; tone: string }
> = {
  draft: {
    label: "Preparing",
    tone: "border-slate-300 bg-slate-100 text-slate-700",
  },
  creating: {
    label: "Preparing",
    tone: "border-slate-300 bg-slate-100 text-slate-700",
  },
  approval: {
    label: "Being finalized",
    tone: "border-slate-300 bg-slate-100 text-slate-700",
  },
  sent: {
    label: "Ready to sign",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
  },
  viewed: {
    label: "Ready to sign",
    tone: "border-amber-200 bg-amber-50 text-amber-900",
  },
  completed: {
    label: "Signed",
    tone: "border-emerald-200 bg-emerald-50 text-emerald-800",
  },
  declined: {
    label: "Declined",
    tone: "border-red-200 bg-red-50 text-red-700",
  },
  voided: {
    label: "Cancelled",
    tone: "border-slate-300 bg-slate-100 text-slate-700",
  },
  error: {
    label: "Unavailable",
    tone: "border-slate-300 bg-slate-100 text-slate-700",
  },
};

function formatDate(iso: string | null): string {
  if (!iso) return "";
  return new Intl.DateTimeFormat("en-US", { dateStyle: "medium" }).format(
    new Date(iso),
  );
}

export function ClientContractSigner({
  token,
  contracts: initialContracts,
}: {
  token: string;
  contracts: ClientContract[];
}) {
  const [contracts, setContracts] = useState(initialContracts);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [signingUrl, setSigningUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [finishing, setFinishing] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [justSigned, setJustSigned] = useState<string | null>(null);

  const endpoint = (contractId: string) =>
    `/api/portal/${encodeURIComponent(token)}/contracts/${encodeURIComponent(contractId)}`;

  const openSigner = async (contractId: string) => {
    setError(null);
    setLoading(true);
    setActiveId(contractId);
    setSigningUrl(null);
    try {
      const res = await fetch(endpoint(contractId), {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ action: "session" }),
      });
      const data = (await res.json()) as {
        signingUrl?: string;
        error?: string;
      };
      if (!res.ok || !data.signingUrl) {
        throw new Error(data.error || "Unable to open the contract right now.");
      }
      setSigningUrl(data.signingUrl);
    } catch (openError) {
      setError(
        openError instanceof Error
          ? openError.message
          : "Unable to open the contract right now.",
      );
      setActiveId(null);
    } finally {
      setLoading(false);
    }
  };

  // PandaDoc's embedded signer posts session_view.document.completed when
  // the client finishes; that's our cue to confirm with the app.
  useEffect(() => {
    if (!activeId || !signingUrl) return;

    const onMessage = (event: MessageEvent) => {
      if (!event.origin.endsWith("pandadoc.com")) return;
      const data = event.data as
        { type?: string; event?: string } | string | null;
      const type =
        typeof data === "string"
          ? data
          : data && typeof data === "object"
            ? (data.type ?? data.event ?? "")
            : "";
      // The planner edited the contract while it was open here: PandaDoc
      // ends the session. Tell the client what happened instead of leaving
      // a dead frame.
      if (type === "session_view.document.exception") {
        setActiveId(null);
        setSigningUrl(null);
        setError(
          "This contract was just updated by your planner. Reload the page to review and sign the latest version.",
        );
        return;
      }
      if (type !== "session_view.document.completed") return;

      const contractId = activeId;
      setFinishing(true);
      (async () => {
        try {
          const res = await fetch(endpoint(contractId), {
            method: "POST",
            headers: { "Content-Type": "application/json" },
            body: JSON.stringify({ action: "complete" }),
          });
          const result = (await res.json()) as { contract?: ClientContract };
          if (result.contract) {
            setContracts((current) =>
              current.map((contract) =>
                contract.id === contractId
                  ? (result.contract as ClientContract)
                  : contract,
              ),
            );
          }
        } finally {
          setFinishing(false);
          setJustSigned(contractId);
          setActiveId(null);
          setSigningUrl(null);
        }
      })();
    };

    window.addEventListener("message", onMessage);
    return () => window.removeEventListener("message", onMessage);
    // endpoint is stable for a given token.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [activeId, signingUrl, token]);

  if (contracts.length === 0) {
    return (
      <p className="text-sm text-slate-600">
        No contracts have been sent yet. When your planner sends one, you can
        review and sign it right here.
      </p>
    );
  }

  return (
    <div className="space-y-4">
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {contracts.map((contract) => {
        const status = statusCopy[contract.status];
        const isActive = activeId === contract.id;
        return (
          <div
            className="rounded-xl border border-slate-200 bg-white p-4"
            key={contract.id}
          >
            <div className="flex flex-wrap items-start justify-between gap-2">
              <div className="min-w-0">
                <p className="font-semibold text-slate-950">{contract.name}</p>
                <p className="mt-0.5 text-xs text-slate-500">
                  {contract.status === "completed" && contract.completedAt
                    ? `Signed ${formatDate(contract.completedAt)}`
                    : contract.revisedAt
                      ? `Updated ${formatDate(contract.revisedAt)}`
                      : contract.sentAt
                        ? `Sent ${formatDate(contract.sentAt)}`
                        : ""}
                </p>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-slate-950">
                  {currency.format(contract.grandTotal ?? contract.subtotal)}
                </span>
                <span
                  className={`type-label inline-flex items-center rounded-sm border px-1.5 py-0.5 ${status.tone}`}
                >
                  {status.label}
                </span>
              </div>
            </div>

            {contract.lineItems.length > 0 ? (
              <ul className="mt-3 divide-y divide-slate-100 text-sm">
                {contract.lineItems.map((item, index) => (
                  <li
                    className="flex justify-between gap-3 py-1.5"
                    key={`${item.name}-${index}`}
                  >
                    <span className="text-slate-700">
                      {item.name}
                      {item.quantity !== 1 ? ` × ${item.quantity}` : ""}
                      {item.description ? (
                        <span className="block text-xs text-slate-500">
                          {item.description}
                        </span>
                      ) : null}
                    </span>
                    <span className="shrink-0 text-slate-800">
                      {currency.format(item.quantity * item.unitPrice)}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}

            {justSigned === contract.id ? (
              <p className="mt-3 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
                Thank you — your signed contract is on file. Your planner has
                been notified and your rooms are confirmed.
              </p>
            ) : null}

            {contract.canSign && !isActive ? (
              <div className="mt-3">
                <button
                  className="inline-flex items-center justify-center rounded-md border border-[var(--brand-border)] bg-[var(--brand)] px-4 py-2 text-sm font-medium text-[var(--brand-foreground)] transition hover:bg-[var(--brand-hover)] disabled:opacity-50"
                  disabled={loading || Boolean(activeId)}
                  onClick={() => void openSigner(contract.id)}
                  type="button"
                >
                  Review and sign
                </button>
              </div>
            ) : null}

            {isActive ? (
              <div className="mt-4 space-y-2">
                {loading ? (
                  <p className="text-sm text-slate-600">
                    Opening your contract…
                  </p>
                ) : signingUrl ? (
                  <>
                    <div className="overflow-hidden rounded-xl border border-slate-200">
                      <iframe
                        allow="camera; microphone"
                        className="h-[80vh] min-h-[640px] w-full bg-white"
                        src={signingUrl}
                        title={`Sign ${contract.name}`}
                      />
                    </div>
                    <div className="flex items-center justify-between gap-3">
                      <p className="text-xs text-slate-500">
                        {finishing
                          ? "Finalizing your signature…"
                          : "Sign in the window above. It closes automatically when you're done."}
                      </p>
                      <button
                        className="text-xs font-semibold text-slate-600 underline-offset-2 hover:underline"
                        disabled={finishing}
                        onClick={() => {
                          setActiveId(null);
                          setSigningUrl(null);
                        }}
                        type="button"
                      >
                        Close without signing
                      </button>
                    </div>
                  </>
                ) : null}
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
