import type { SoqlRecord } from "@/lib/salesforce/client";
import {
  bool,
  contentHash,
  loadHashPages,
  rawRecord,
  runObjectPull,
  str,
  type ObjectPullSpec,
  type PullResult,
} from "@/lib/salesforce/pull-engine";
import type { Database } from "@/types/database";

// Salesforce pandadoc__PandaDocDocument__c → sf_pandadoc_documents staging
// pull (docs/developer-notes.md §2). The PandaDoc managed package keeps one
// row per document, linked to its Opportunity and carrying the PandaDoc
// document UUID — which is all the booking history needs to link a past
// event to its contract.

const INPUT_JSON_FIELDS = [
  "pandadoc__InputJSON_EV2__c", // current editor
  "pandadoc__InputJSON__c", // pre-2021 "EV1" documents
] as const;

const DOCUMENT_FIELDS = [
  "Id",
  "Name",
  "pandadoc__Opportunity__c",
  "pandadoc__Account__c",
  "pandadoc__UUID__c",
  "pandadoc__Status__c",
  "pandadoc__Template_Id__c",
  "pandadoc__Template_Name__c",
  "pandadoc__Editor_Version__c",
  "pandadoc__Is_Deleted__c",
  ...INPUT_JSON_FIELDS,
  "CreatedDate",
  "LastModifiedDate",
  "SystemModstamp",
] as const;

type SfPandaDocDocumentInsert =
  Database["public"]["Tables"]["sf_pandadoc_documents"]["Insert"];

type PayloadFacts = {
  total: number | null;
  dateSent: string | null;
  dateCompleted: string | null;
};

// The package stores PandaDoc's last webhook payload as JSON text: an object
// for EV2 documents, a one-element array for EV1. Only these facts are kept —
// the payload also holds each recipient's tokenized shared_link, which must
// not land in staging.
function payloadFacts(record: SoqlRecord): PayloadFacts {
  const none = { total: null, dateSent: null, dateCompleted: null };
  const json = INPUT_JSON_FIELDS.map((field) => str(record[field])).find(
    Boolean,
  );
  if (!json) return none;

  try {
    const parsed: unknown = JSON.parse(json);
    const payload = (Array.isArray(parsed) ? parsed[0] : parsed) as
      | { data?: Record<string, unknown> }
      | undefined;
    const data = payload?.data;
    if (!data) return none;

    const pricing = data.pricing as { total?: unknown } | undefined;
    const grandTotal = data.grand_total as { amount?: unknown } | undefined;
    const total = Number(pricing?.total ?? grandTotal?.amount);

    return {
      total: Number.isFinite(total) ? total : null,
      dateSent: str(data.date_sent),
      dateCompleted: str(data.date_completed),
    };
  } catch {
    return none;
  }
}

function mapDocument(record: SoqlRecord): SfPandaDocDocumentInsert {
  const facts = payloadFacts(record);
  const mapped = {
    sf_id: String(record.Id),
    name: str(record.Name),
    opportunity_id: str(record.pandadoc__Opportunity__c),
    account_id: str(record.pandadoc__Account__c),
    pandadoc_uuid: str(record.pandadoc__UUID__c),
    status: str(record.pandadoc__Status__c),
    template_name: str(record.pandadoc__Template_Name__c),
    total: facts.total,
    date_sent: facts.dateSent,
    date_completed: facts.dateCompleted,
    is_deleted: bool(record.pandadoc__Is_Deleted__c),
    sf_created_at: str(record.CreatedDate),
    sf_modified_at: str(record.LastModifiedDate),
  };

  const raw = rawRecord(record);
  for (const field of INPUT_JSON_FIELDS) delete raw[field];

  return {
    ...mapped,
    raw: raw as SfPandaDocDocumentInsert["raw"],
    content_hash: contentHash(mapped),
    pulled_at: new Date().toISOString(),
  };
}

const documentPullSpec: ObjectPullSpec<SfPandaDocDocumentInsert> = {
  sfObject: "pandadoc__PandaDocDocument__c",
  runObject: "pandadoc_document",
  fields: DOCUMENT_FIELDS,
  map: mapDocument,
  loadExistingHashes: (supabase) =>
    loadHashPages(async (from, to) => {
      const { data, error } = await supabase
        .from("sf_pandadoc_documents")
        .select("sf_id, content_hash")
        .range(from, to);
      if (error) {
        throw new Error(`Could not load existing hashes: ${error.message}`);
      }
      return data;
    }),
  upsert: async (supabase, rows) => {
    const { error } = await supabase
      .from("sf_pandadoc_documents")
      .upsert(rows, { onConflict: "sf_id" });
    if (error) throw new Error(`Upsert failed: ${error.message}`);
  },
};

export function pullSalesforcePandaDocDocuments(
  requestedMode: "full" | "incremental" = "incremental",
): Promise<PullResult> {
  return runObjectPull(documentPullSpec, requestedMode);
}
