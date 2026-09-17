// Salesforce → staging pulls (contacts, accounts, opportunities, PandaDoc
// documents), runnable
// outside Next:
//   npx tsx --env-file=.env.local scripts/sf-pull.ts [--full] [--only=contacts|accounts|opportunities|documents]
// Incremental by default (each object resumes from its own last watermark).

import { pullSalesforceAccounts } from "../src/lib/salesforce/accounts";
import { pullSalesforceContacts } from "../src/lib/salesforce/contacts";
import { pullSalesforceOpportunities } from "../src/lib/salesforce/opportunities";
import { pullSalesforcePandaDocDocuments } from "../src/lib/salesforce/pandadoc-documents";
import type { PullResult } from "../src/lib/salesforce/pull-engine";

const mode = process.argv.includes("--full") ? "full" : "incremental";
const only = process.argv
  .find((arg) => arg.startsWith("--only="))
  ?.slice("--only=".length);

const pulls: Record<string, () => Promise<PullResult>> = {
  accounts: () => pullSalesforceAccounts(mode),
  contacts: () => pullSalesforceContacts(mode),
  opportunities: () => pullSalesforceOpportunities(mode),
  documents: () => pullSalesforcePandaDocDocuments(mode),
};

if (only && !pulls[only]) {
  console.error(`Unknown --only value "${only}" (use ${Object.keys(pulls).join("|")})`);
  process.exit(1);
}

async function main() {
  for (const [name, pull] of Object.entries(pulls)) {
    if (only && only !== name) continue;
    const result = await pull();
    console.log(
      `${name} pull complete (${result.mode}): ${result.seen} seen, ${result.upserted} upserted, watermark ${result.watermark}`,
    );
  }
}

main().catch((error) => {
  console.error("Pull failed:", error.message);
  process.exit(1);
});
