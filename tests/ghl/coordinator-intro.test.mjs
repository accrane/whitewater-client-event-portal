import assert from "node:assert/strict";
import test from "node:test";

import {
  COORDINATOR_INTRO_TAG,
  hasCoordinatorIntroSnippet,
  isCoordinatorIntroSnippet,
} from "../../src/lib/ghl/coordinator-intro.ts";

test("the tag matches the one the GHL chase workflow triggers on", () => {
  assert.equal(COORDINATOR_INTRO_TAG, "coordinator-intro-sent");
});

test("snippet names containing EC Welcome count, whatever the case or spacing", () => {
  assert.equal(isCoordinatorIntroSnippet("Day Pass - EC Welcome Email"), true);
  assert.equal(isCoordinatorIntroSnippet("ec   welcome"), true);
  assert.equal(isCoordinatorIntroSnippet("Wildwoods EC WELCOME"), true);
});

test("the existing long form still counts", () => {
  assert.equal(
    isCoordinatorIntroSnippet("Educational Adventures - Event Coordinator Welcome Email"),
    true,
  );
});

test("other snippets do not start a chase", () => {
  assert.equal(isCoordinatorIntroSnippet("Day Pass Email 3 Weeks Before Event"), false);
  assert.equal(isCoordinatorIntroSnippet("Proposal Email"), false);
  assert.equal(isCoordinatorIntroSnippet("Welcome"), false);
  assert.equal(isCoordinatorIntroSnippet(""), false);
});

test("a message counts when any inserted snippet is an intro", () => {
  assert.equal(hasCoordinatorIntroSnippet(["Proposal Email", "Day Pass - EC Welcome Email"]), true);
  assert.equal(hasCoordinatorIntroSnippet(["Proposal Email"]), false);
  assert.equal(hasCoordinatorIntroSnippet([]), false);
});
