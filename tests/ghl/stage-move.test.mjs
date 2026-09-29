import assert from "node:assert/strict";
import test from "node:test";

import {
  isLostStage,
  lostNoteBody,
  stageMoveNotice,
} from "../../src/lib/ghl/stage-move.ts";

test("Lost is matched by name, whatever the case or spacing", () => {
  assert.equal(isLostStage("Lost"), true);
  assert.equal(isLostStage("  LOST "), true);
  assert.equal(isLostStage("Lost Cause"), false);
});

test("Proposal Sent warns that the chase starts", () => {
  assert.match(
    stageMoveNotice({ id: "s4", name: "Proposal  Sent" }, "s5") ?? "",
    /chase/,
  );
});

test("Booked warns that no rooms are booked, by id or by name", () => {
  assert.match(stageMoveNotice({ id: "s5", name: "Signed" }, "s5") ?? "", /Rooms/);
  assert.match(stageMoveNotice({ id: "x", name: "Booked" }, null) ?? "", /Rooms/);
});

test("Lost mentions the note; plain selling stages say nothing", () => {
  assert.match(stageMoveNotice({ id: "s6", name: "Lost" }, "s5") ?? "", /note/);
  assert.equal(stageMoveNotice({ id: "s2", name: "Contacted" }, "s5"), null);
  assert.equal(stageMoveNotice({ id: "s3", name: "Planning" }, "s5"), null);
});

test("the Lost note carries the reason when there is one", () => {
  assert.equal(
    lostNoteBody({ fromStage: "Proposal Sent", reason: "Went with another venue", byEmail: "cathy@example.org" }),
    "Moved to Lost from Proposal Sent: Went with another venue (by cathy@example.org).",
  );
  assert.equal(
    lostNoteBody({ fromStage: null, reason: null, byEmail: null }),
    "Moved to Lost (by the portal). No reason given.",
  );
});
