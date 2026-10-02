// fallthrough.js — a label with no `end` runs on into the next one, as in the decomps.
//
// The transpile split each local label into its own op list and lost the edge
// between them, so pokecrystal's gym leaders gave the badge and stopped before
// `.FightDone:`, which hands over the TM (Jasmine's TM23 IRON TAIL, 2026-10-02).
// tools/gen_fallthrough.mjs verifies each edge against the decomp source and
// writes overworld/fallthrough_data.json; here each one becomes a trailing
// `goto` on the map's loaded labels.
let EDGES = {};
export async function loadFallthroughData(getJSON) {
	EDGES = ((await getJSON('fallthrough_data.json').catch(() => null)) || {}).edges || {};
}
const TERM = new Set(['end', 'return', 'goto']);
// returns `scripts` with the stem's fall-through edges applied (new arrays; the
// cached label lists are never mutated). A CRYSTAL map's program is also marked:
// pokecrystal's `end` inside an `scall`ed label RETURNS to the caller
// (Script_end -> ExitScriptSubroutine) — Jasmine's badge path calls
// OlivineGymActivateRockets, whose `end` must hand back to `.FightDone`. The
// runner (events.js) reads the mark; FireRed/Emerald `end` still ends it all.
export function applyFallthrough(stem, scripts, crystal) {
	if (crystal) Object.defineProperty(scripts, '__crystalEnd', { value: true });
	const edges = EDGES[stem];
	if (!edges) return scripts;
	for (const [label, next] of Object.entries(edges)) {
		const ops = scripts[label];
		if (!Array.isArray(ops) || !scripts[next]) continue;
		if (ops.length && TERM.has(ops[ops.length - 1].op)) continue;   // a patched copy already ends
		scripts[label] = [...ops, { op: 'goto', label: next }];
	}
	return scripts;
}
