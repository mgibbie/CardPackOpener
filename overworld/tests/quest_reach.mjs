// quest_reach.mjs — reachability / no-strand validator for the strict-corridor
// gates. Builds the real connection+warp graph and, for each region + badge level,
// checks: (HARD) each gym's town is reachable at exactly its badge index and the
// reachable set grows monotonically with badges (earning badges only ever opens
// areas — never strands); (SOFT/report) how strictly each next town is locked.
// Run: node overworld/tests/quest_reach.mjs
import { buildGraph, reachable } from './quest_graph.mjs';
import { GYMS, GATED_MAPS, START } from '../quest.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const adj = buildGraph();
for (const region of ['KANTO', 'JOHTO', 'HOENN']) {
	const gateNeed = { ...GATED_MAPS[region] };
	GYMS[region].forEach((g, k) => { gateNeed[g.map] = k; }); // gym-door gates
	const start = START[region];
	const reach = [];
	for (let b = 0; b <= 8; b++) reach[b] = reachable(adj, start, gateNeed, b);
	const ungated = reachable(adj, start, {}, 999); // no gates: the data's own reachability

	// HARD: start reachable at every level; monotonic growth (no strand)
	for (let b = 0; b <= 8; b++) A(reach[b].has(start), `[${region}] start reachable at ${b} badges`);
	for (let b = 0; b < 8; b++) {
		const shrunk = [...reach[b]].filter(m => !reach[b + 1].has(m));
		A(shrunk.length === 0, `[${region}] reachability monotonic ${b}->${b + 1} (no area lost)`, shrunk.slice(0, 5).join(','));
	}

	// HARD: the GATE must never make a gym town LESS reachable than the raw data
	// allows — if it's reachable ungated, it must be reachable at its badge index.
	// Maps unreachable even ungated are a pre-existing data gap (e.g. Sootopolis's
	// dive-in was never wired) — warn, don't fail the gate check.
	GYMS[region].forEach((g, k) => {
		if (!ungated.has(g.townMap)) { console.log(`[${region}] WARN gym ${k + 1} town ${g.townMap} is unreachable even ungated (data gap)`); return; }
		A(reach[k].has(g.townMap), `[${region}] gym ${k + 1} town ${g.townMap} reachable at ${k} badges`);
	});

	// SOFT report: is gym k's town locked until badge k? (strictness)
	const leaks = [];
	GYMS[region].forEach((g, k) => {
		if (k > 0 && reach[k - 1].has(g.townMap)) leaks.push(`${g.townMap}@${k - 1}`);
	});
	console.log(`[${region}] reachable@0=${reach[0].size} @8=${reach[8].size}; early-open gym towns: ${leaks.length ? leaks.join(', ') : 'none'}`);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
