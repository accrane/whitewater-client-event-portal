// Salesforce → sf_contacts staging pull, runnable outside Next:
//   npx tsx --env-file=.env.local scripts/sf-pull.ts [--full]
// Incremental by default (resumes from the last run's watermark).

import { pullSalesforceContacts } from "../src/lib/salesforce/contacts";

const mode = process.argv.includes("--full") ? "full" : "incremental";

pullSalesforceContacts(mode)
  .then((result) => {
    console.log(
      `Pull complete (${result.mode}): ${result.seen} seen, ${result.upserted} upserted, watermark ${result.watermark}`,
    );
  })
  .catch((error) => {
    console.error("Pull failed:", error.message);
    process.exit(1);
  });
