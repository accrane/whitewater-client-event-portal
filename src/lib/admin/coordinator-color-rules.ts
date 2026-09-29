// Which color a coordinator gets. Colors are handed out once and stored
// (coordinator_colors), so a coordinator keeps theirs on every screen and a
// new hire takes the first color nobody holds rather than reshuffling
// everyone. Past the palette, colors are generated around the hue wheel.
//
// Import-free so the rules are testable directly.

// Distinct hues with enough weight for white text, in both themes. The first
// ten are the Coordinator Assignments calendar's original order, so the
// people it already showed keep their colors.
export const COORDINATOR_PALETTE = [
  "#2563eb",
  "#d97706",
  "#7c3aed",
  "#db2777",
  "#0d9488",
  "#ea580c",
  "#4f46e5",
  "#65a30d",
  "#0891b2",
  "#b91c1c",
  "#9333ea",
  "#15803d",
  "#c026d3",
  "#0369a1",
  "#a16207",
  "#be123c",
] as const;

export const UNASSIGNED_COLOR = "#94a3b8";

// The first palette color not in `taken`; once the palette is used up, a
// generated one (golden-angle hue steps at a fixed saturation/lightness)
// that is also not taken.
export function pickCoordinatorColor(taken: Iterable<string>): string {
  const used = new Set([...taken].map((color) => color.toLowerCase()));
  const free = COORDINATOR_PALETTE.find((color) => !used.has(color));
  if (free) return free;
  for (let step = 0; ; step++) {
    const color = hslToHex((step * 137.508 + 17) % 360, 62, 42);
    if (!used.has(color)) return color;
  }
}

// Colors for the given users, in order: stored ones as they are, the rest
// picked one after another so none repeat. `stored` maps user id → color.
export function assignCoordinatorColors(
  userIds: readonly string[],
  stored: ReadonlyMap<string, string>,
): { colors: Map<string, string>; added: [string, string][] } {
  const colors = new Map(stored);
  const added: [string, string][] = [];
  for (const id of userIds) {
    if (!id || colors.has(id)) continue;
    const color = pickCoordinatorColor(colors.values());
    colors.set(id, color);
    added.push([id, color]);
  }
  return { colors, added };
}

function hslToHex(h: number, s: number, l: number): string {
  const sat = s / 100;
  const light = l / 100;
  const a = sat * Math.min(light, 1 - light);
  const channel = (n: number) => {
    const k = (n + h / 30) % 12;
    const value = light - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
    return Math.round(value * 255)
      .toString(16)
      .padStart(2, "0");
  };
  return `#${channel(0)}${channel(8)}${channel(4)}`;
}
