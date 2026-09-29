import assert from "node:assert/strict";
import test from "node:test";

import {
  COORDINATOR_PALETTE,
  assignCoordinatorColors,
  pickCoordinatorColor,
} from "../../src/lib/admin/coordinator-color-rules.ts";

test("the first free palette color is picked, whatever the case", () => {
  assert.equal(pickCoordinatorColor([]), COORDINATOR_PALETTE[0]);
  assert.equal(
    pickCoordinatorColor([COORDINATOR_PALETTE[0].toUpperCase()]),
    COORDINATOR_PALETTE[1],
  );
});

test("a freed color is reused before moving down the palette", () => {
  assert.equal(
    pickCoordinatorColor([COORDINATOR_PALETTE[0], COORDINATOR_PALETTE[2]]),
    COORDINATOR_PALETTE[1],
  );
});

test("past the palette, generated colors keep coming and never repeat", () => {
  const taken = [...COORDINATOR_PALETTE];
  for (let i = 0; i < 40; i++) {
    const color = pickCoordinatorColor(taken);
    assert.match(color, /^#[0-9a-f]{6}$/);
    assert.equal(taken.includes(color), false);
    taken.push(color);
  }
});

test("stored colors stay put and a new hire gets an unused one", () => {
  const stored = new Map([
    ["cathy", COORDINATOR_PALETTE[1]],
    ["sarah", COORDINATOR_PALETTE[0]],
  ]);
  const { colors, added } = assignCoordinatorColors(["sarah", "cathy", "new", "new"], stored);
  assert.equal(colors.get("sarah"), COORDINATOR_PALETTE[0]);
  assert.equal(colors.get("cathy"), COORDINATOR_PALETTE[1]);
  assert.deepEqual(added, [["new", COORDINATOR_PALETTE[2]]]);
});
