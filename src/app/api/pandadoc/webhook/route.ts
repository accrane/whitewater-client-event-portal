import { logIntegrationEvent } from "@/lib/ghl/integration-log";
import { syncContractByDocumentId } from "@/lib/admin/contracts";
import { verifyPandaDocWebhookSignature } from "@/lib/pandadoc/client";

// PandaDoc webhook receiver. Register this URL in PandaDoc (Settings →
// Integrations → API → Webhooks) for document_state_changed and
// recipient_completed, with the shared key saved as PANDADOC_WEBHOOK_KEY.
// PandaDoc signs the raw body (HMAC-SHA256) and passes the hex digest as a
// `signature` query parameter. Each delivery is an array of events; every
// document mentioned is re-read from the PandaDoc API so the app never
// trusts the payload's status directly. Idempotent: syncing an already
// completed contract is a no-op.
//
// The app must be reachable from the internet for this to fire (deploy or
// tunnel). Until then the portal's embedded signer and page-load refreshes
// keep contract status current.

export async function POST(request: Request) {
  const rawBody = await request.text();
  const signature = new URL(request.url).searchParams.get("signature");

  if (!verifyPandaDocWebhookSignature(rawBody, signature)) {
    return Response.json({ error: "Invalid signature" }, { status: 401 });
  }

  let payload: unknown;
  try {
    payload = JSON.parse(rawBody);
  } catch {
    return Response.json({ error: "Invalid JSON body" }, { status: 400 });
  }

  const events = Array.isArray(payload) ? payload : [payload];
  const documentIds = new Set<string>();

  for (const raw of events) {
    if (!raw || typeof raw !== "object") continue;
    const data = (raw as { data?: { id?: unknown } }).data;
    if (data && typeof data.id === "string" && data.id) {
      documentIds.add(data.id);
    }
  }

  const results: Record<string, string> = {};

  for (const documentId of documentIds) {
    try {
      const row = await syncContractByDocumentId(documentId);
      results[documentId] = row ? row.status : "not_tracked";
    } catch (error) {
      console.error("PandaDoc webhook sync failed", documentId, error);
      results[documentId] = "error";
      await logIntegrationEvent({
        direction: "PANDADOC_TO_PORTAL",
        eventType: "contract_webhook",
        status: "error",
        message: "Failed processing a PandaDoc webhook delivery.",
        details: {
          pandadoc_document_id: documentId,
          error: error instanceof Error ? error.message : String(error),
        },
      });
    }
  }

  return Response.json({ ok: true, documents: results });
}
