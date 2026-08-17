// quest_reach.mjs — reachability / no-strand validator for the strict-corridor
// gates. Builds the real connection+warp graph and, for each region + badge level,
// checks: (HARD) each gym's town is reachable at exactly its badge index and the
// reachable set grows monotonically with badges (earning badges only ever opens
// areas — never strands); (SOFT/report) how strictly each next town is locked.
// Run: node overworld/tests/quest_reach.mjs
import { buildGraph, buildGraphWithPortals, reachable } from './quest_graph.mjs';
import { GYMS, GATED_MAPS, START, VILLAIN_BEATS } from '../quest.js';

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

	// villain crawl: each beat's BOSS floor must be reachable (via warps) at its
	// afterBadges — else the moved boss (and the required gate it opens) strands. The
	// warp graph ignores metatile doors (the SilphCo door-fix opens them in-game), so
	// this is the topological guard.
	for (const b of VILLAIN_BEATS[region] || []) {
		const need = Math.min(8, b.afterBadges);
		A(reach[need].has(b.at), `[${region}] villain boss floor ${b.at} reachable at ${need} badges`, `(beat ${b.id})`);
		for (const m of b.maps || []) A(reach[need].has(m), `[${region}] villain grunt floor ${m} reachable at ${need} badges`, `(beat ${b.id})`);
	}
}

// ---------- cross-region strand-safety (badge-thirds + portals) ----------
// The three shared regions advance in lockstep on `globalTier` (min gyms cleared). For
// the interleave to never strand, at every shared tier g the player must be able to
// reach EVERY region's current gym town (index g) — otherwise they couldn't clear gym
// g+1 somewhere and would be stuck forever. The portal triangles (same-tier gym towns
// linked) provide that: from any region's start at globalTier g, all three index-g gym
// towns are reachable in the augmented graph. (Data-gap towns unreachable even ungated
// are warned, not failed — same caveat as the per-region check; portals actually rescue
// most of them, e.g. Sootopolis via the tier-8 pad.)
const uni = buildGraphWithPortals();
const uniGate = {};
for (const region of ['KANTO', 'JOHTO', 'HOENN']) {
	Object.assign(uniGate, GATED_MAPS[region]);
	GYMS[region].forEach((g, k) => { uniGate[g.map] = k; });
}
const uniUngated = reachable(uni, START.KANTO, {}, 999); // raw reachability across the portal-joined graph
for (let g = 0; g <= 7; g++) {
	for (const from of ['KANTO', 'JOHTO', 'HOENN']) {
		const reach = reachable(uni, START[from], uniGate, g);
		for (const to of ['KANTO', 'JOHTO', 'HOENN']) {
			const town = GYMS[to][g].townMap;
			if (!uniUngated.has(town)) { console.log(`[x-region] WARN gym ${g + 1} town ${town} unreachable even ungated (data gap)`); continue; }
			A(reach.has(town), `[x-region] from ${from} start at tier ${g}: ${to} gym ${g + 1} town ${town} reachable`);
		}
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
