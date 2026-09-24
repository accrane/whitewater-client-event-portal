import assert from "node:assert/strict";
import test from "node:test";

import {
  SIGNED_CONTRACT_STEPS,
  SIGNED_CONTRACT_STEP_LABELS,
  failedSignedContractSteps,
  parseSignedContractSteps,
  signedContractStepsToRun,
} from "../../src/lib/contracts/shared.ts";

test("only failed steps stay pending; done and skipped steps are finished", () => {
  assert.deepEqual(
    failedSignedContractSteps({
      reservations: "booked",
      ghl_stage: "error: GHL responded 503",
      follow_ups: "not paused",
      signed_pdf: 'error: Bucket not found (bucket "PORTAL_BASE_URL")',
    }),
    ["ghl_stage", "signed_pdf"],
  );
  assert.deepEqual(
    failedSignedContractSteps({
      ghl_stage: "skipped: Event has no GHL opportunity id",
      signed_pdf: "contracts/e1/c1.pdf",
    }),
    [],
  );
});

test("a retry that runs one step reports only that step", () => {
  assert.deepEqual(failedSignedContractSteps({ signed_pdf: "error: timeout" }), [
    "signed_pdf",
  ]);
  assert.deepEqual(failedSignedContractSteps({}), []);
});

test("stored steps are read defensively and kept in order", () => {
  assert.deepEqual(parseSignedContractSteps(["signed_pdf", "ghl_stage"]), [
    "ghl_stage",
    "signed_pdf",
  ]);
  assert.deepEqual(parseSignedContractSteps(["bogus", "follow_ups"]), ["follow_ups"]);
  assert.deepEqual(parseSignedContractSteps(null), []);
  assert.deepEqual(parseSignedContractSteps("signed_pdf"), []);
});

test("every step has a plain-language label for the Contracts tab", () => {
  for (const step of SIGNED_CONTRACT_STEPS) {
    assert.ok(SIGNED_CONTRACT_STEP_LABELS[step]);
  }
});

test("a contract that never ran its steps runs all of them", () => {
  assert.deepEqual(
    signedContractStepsToRun({
      signedActionsAppliedAt: null,
      signedActionsPending: [],
      signedPdfPath: null,
    }),
    SIGNED_CONTRACT_STEPS,
  );
});

test("after the first run only failed steps, plus a missing PDF, run again", () => {
  assert.deepEqual(
    signedContractStepsToRun({
      signedActionsAppliedAt: "2026-09-24T13:33:00Z",
      signedActionsPending: ["ghl_stage"],
      signedPdfPath: "contracts/e1/c1.pdf",
    }),
    ["ghl_stage"],
  );
  // Signed before steps were tracked: the failure was never recorded, but
  // the PDF is still missing, so it gets archived.
  assert.deepEqual(
    signedContractStepsToRun({
      signedActionsAppliedAt: "2026-09-24T13:33:00Z",
      signedActionsPending: [],
      signedPdfPath: null,
    }),
    ["signed_pdf"],
  );
  assert.deepEqual(
    signedContractStepsToRun({
      signedActionsAppliedAt: "2026-09-24T13:33:00Z",
      signedActionsPending: ["signed_pdf"],
      signedPdfPath: null,
    }),
    ["signed_pdf"],
  );
  assert.deepEqual(
    signedContractStepsToRun({
      signedActionsAppliedAt: "2026-09-24T14:24:00Z",
      signedActionsPending: [],
      signedPdfPath: "contracts/e2/c2.pdf",
    }),
    [],
  );
});
