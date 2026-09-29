import assert from "node:assert/strict";
import test from "node:test";

import {
  SIGNED_CONTRACT_STEPS,
  SIGNED_CONTRACT_STEP_LABELS,
  contractPaymentLabel,
  contractPaymentReceived,
  failedSignedContractSteps,
  parseSignedContractSteps,
  signedContractStepsToRun,
} from "../../src/lib/contracts/shared.ts";

// A just-signed contract as signedContractStepsToRun sees it: steps not run
// yet, PandaDoc waiting on the payment step, no check recorded.
const signedUnpaid = {
  signedActionsAppliedAt: null,
  signedActionsPending: [],
  signedPdfPath: null,
  pandadocStatus: "document.waiting_pay",
  payByCheckAt: null,
  roomsBookedAt: null,
};
const afterFirstRun = {
  ...signedUnpaid,
  signedActionsAppliedAt: "2026-09-24T13:33:00Z",
  signedPdfPath: "contracts/e1/c1.pdf",
};

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

test("signing runs every step but the rooms, which wait for payment", () => {
  assert.deepEqual(signedContractStepsToRun(signedUnpaid), [
    "ghl_stage",
    "follow_ups",
    "signed_pdf",
  ]);
  // No payment step in PandaDoc: still no payment, so still no rooms.
  assert.deepEqual(
    signedContractStepsToRun({ ...signedUnpaid, pandadocStatus: "document.completed" }),
    ["ghl_stage", "follow_ups", "signed_pdf"],
  );
});

test("a contract signed and paid before its first run runs every step", () => {
  assert.deepEqual(
    signedContractStepsToRun({ ...signedUnpaid, pandadocStatus: "document.paid" }),
    SIGNED_CONTRACT_STEPS,
  );
});

test("the first payment books the rooms, and moves the opportunity to Booked again, once", () => {
  assert.deepEqual(signedContractStepsToRun(afterFirstRun), []);
  assert.deepEqual(
    signedContractStepsToRun({ ...afterFirstRun, pandadocStatus: "document.paid" }),
    ["reservations", "ghl_stage"],
  );
  assert.deepEqual(
    signedContractStepsToRun({
      ...afterFirstRun,
      pandadocStatus: "document.paid",
      roomsBookedAt: "2026-09-25T10:00:00Z",
    }),
    [],
  );
});

test("paying by check counts as the payment", () => {
  assert.deepEqual(
    signedContractStepsToRun({ ...afterFirstRun, payByCheckAt: "2026-09-25T09:00:00Z" }),
    ["reservations", "ghl_stage"],
  );
});

test("a failed rooms step retries only while the contract is paid", () => {
  assert.deepEqual(
    signedContractStepsToRun({
      ...afterFirstRun,
      pandadocStatus: "document.paid",
      signedActionsPending: ["reservations"],
    }),
    ["reservations", "ghl_stage"],
  );
  // Queued before rooms waited for payment, or the check was undone.
  assert.deepEqual(
    signedContractStepsToRun({ ...afterFirstRun, signedActionsPending: ["reservations"] }),
    [],
  );
});

test("after the first run only failed steps, plus a missing PDF, run again", () => {
  assert.deepEqual(
    signedContractStepsToRun({ ...afterFirstRun, signedActionsPending: ["ghl_stage"] }),
    ["ghl_stage"],
  );
  // Signed before steps were tracked: the failure was never recorded, but
  // the PDF is still missing, so it gets archived.
  assert.deepEqual(
    signedContractStepsToRun({ ...afterFirstRun, signedPdfPath: null }),
    ["signed_pdf"],
  );
  assert.deepEqual(
    signedContractStepsToRun({
      ...afterFirstRun,
      signedActionsPending: ["signed_pdf"],
      signedPdfPath: null,
    }),
    ["signed_pdf"],
  );
});

test("payment comes from PandaDoc or a check, never from the signature", () => {
  assert.equal(
    contractPaymentReceived({ pandadocStatus: "document.paid", payByCheckAt: null }),
    true,
  );
  assert.equal(
    contractPaymentReceived({
      pandadocStatus: "document.waiting_pay",
      payByCheckAt: "2026-09-25T09:00:00Z",
    }),
    true,
  );
  assert.equal(
    contractPaymentReceived({ pandadocStatus: "document.waiting_pay", payByCheckAt: null }),
    false,
  );
  assert.equal(
    contractPaymentReceived({ pandadocStatus: "document.completed", payByCheckAt: null }),
    false,
  );
});

test("payment labels for signed contracts", () => {
  const signed = { status: "completed", payByCheckAt: null };
  assert.equal(contractPaymentLabel({ ...signed, pandadocStatus: "document.paid" }), "Paid");
  assert.equal(
    contractPaymentLabel({
      ...signed,
      pandadocStatus: "document.waiting_pay",
      payByCheckAt: "2026-09-25T09:00:00Z",
    }),
    "Paying by check",
  );
  assert.equal(
    contractPaymentLabel({ ...signed, pandadocStatus: "document.waiting_pay" }),
    "Payment pending",
  );
  assert.equal(
    contractPaymentLabel({ ...signed, pandadocStatus: "document.completed" }),
    "No PandaDoc payment",
  );
  assert.equal(
    contractPaymentLabel({ status: "sent", pandadocStatus: "document.sent", payByCheckAt: null }),
    null,
  );
});
