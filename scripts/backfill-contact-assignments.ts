// One-time catch-up: sets each GHL contact's Assigned To to the coordinator
// on their pipeline opportunity, so contacts that were assigned before the
// portal started writing the contact owner (2026-09-23) stop showing
// "Unassigned" in GHL. Safe to re-run: contacts already on the right user
// are skipped. Runnable outside Next:
//   npx tsx --env-file=.env.local scripts/backfill-contact-assignments.ts [--apply] [--limit=N] [--include-closed]
// Dry run by default — prints what would change. --apply writes to GHL.
// Open and won opportunities are considered; --include-closed adds lost and
// abandoned ones. A contact with several opportunities follows the newest
// open one (see src/lib/ghl/contact-assignment.ts).

import { planContactAssignments } from "../src/lib/ghl/contact-assignment";
import { assignContactUser, fetchGhlContact } from "../src/lib/ghl/contacts";
import { listGhlUsers } from "../src/lib/ghl/location-data";
import {
  searchPipelineOpportunities,
  type GhlOpportunityStatus,
} from "../src/lib/ghl/opportunities";

const apply = process.argv.includes("--apply");
const includeClosed = process.argv.includes("--include-closed");
const limitArg = process.argv.find((arg) => arg.startsWith("--limit="));
const limit = limitArg ? Number(limitArg.slice("--limit=".length)) : Infinity;

if (!Number.isFinite(limit) && limitArg) {
  console.error(`Bad --limit value "${limitArg}"`);
  process.exit(1);
}

const pause = (ms: number) => new Promise((resolve) => setTimeout(resolve, ms));

async function main() {
  const statuses: GhlOpportunityStatus[] = includeClosed
    ? ["open", "won", "lost", "abandoned"]
    : ["open", "won"];

  const opportunities = (
    await Promise.all(statuses.map((status) => searchPipelineOpportunities(status)))
  ).flat();
  console.log(
    `${opportunities.length} opportunities read (${statuses.join(", ")}).`,
  );

  const users = await listGhlUsers();
  const userName = (id: string) =>
    users.find((user) => user.id === id)?.name ?? `unknown user ${id}`;

  const plan = planContactAssignments(
    opportunities.map((opportunity) => ({
      id: opportunity.id,
      contactId: opportunity.contact?.id ?? null,
      assignedTo: opportunity.assignedTo,
      status: opportunity.status,
      createdAt: opportunity.createdAt,
    })),
  ).slice(0, limit);
  console.log(
    `${plan.length} contacts have a coordinator on an opportunity${
      apply ? " — applying." : " — dry run (pass --apply to write)."
    }`,
  );

  const counts = { unchanged: 0, updated: 0, failed: 0, would: 0 };
  const label = (contactId: string, name: string | null) =>
    name ? `${name} (${contactId})` : contactId;

  for (const item of plan) {
    const contact = await fetchGhlContact(item.contactId);
    const current = contact?.assignedTo ?? null;

    if (current === item.ghlUserId) {
      counts.unchanged += 1;
      continue;
    }

    const change = `${label(item.contactId, contact?.name ?? null)}: ${
      current ? userName(current) : "Unassigned"
    } → ${userName(item.ghlUserId)} (opportunity ${item.opportunityId})`;

    if (!apply) {
      counts.would += 1;
      console.log(`would set  ${change}`);
      continue;
    }

    const result = await assignContactUser(item.contactId, item.ghlUserId);
    if (result.ok) {
      counts.updated += 1;
      console.log(`updated    ${change}`);
    } else {
      counts.failed += 1;
      console.error(`FAILED     ${change}: ${result.error}`);
    }
    // Stay well under GHL's burst limit (100 requests / 10 s).
    await pause(150);
  }

  console.log(
    apply
      ? `Done: ${counts.updated} updated, ${counts.unchanged} already correct, ${counts.failed} failed.`
      : `Dry run: ${counts.would} would change, ${counts.unchanged} already correct.`,
  );
  if (counts.failed > 0) process.exit(1);
}

main().catch((error) => {
  console.error(error);
  process.exit(1);
});
