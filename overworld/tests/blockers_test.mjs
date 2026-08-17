// blockers_test.mjs — strand-safety proof for the authentic per-spot gate graph.
// Pure node (no browser). Reuses the real map-reachability harness (quest_graph.mjs)
// and cross-checks the authentic blockers/givers (blockers.js) against the quest.js
// gate spine (the proven-strand-free backstop). Proves the graph is soft-lock-free:
//   1. NO-SKIP   — the authentic gates never open a corridor-gated map EARLIER than
//                  the badge backstop would (so every wall the spine has is really
//                  enforced by an authentic obstacle; a missing/weak blocker fails).
//   2. GIVERREACH— every key item a blocker needs is OBTAINABLE on the near side: its
//                  giver's map is reachable at the giver's prereq badge level, and the
//                  item is in hand by the time its far map matters. (no soft-lock)
//   3. NO-STRAND — with all badges + obtainable items, everything the backstop can
//                  reach is still reachable through the authentic gates.
//   4. DAG       — the item -> giver.prereq dependency graph is acyclic.
// Run: node overworld/tests/blockers_test.mjs   (WORKLIST=1 prints per-region gates)
import { buildGraph, reachable, mapIndex } from './quest_graph.mjs';
import { GYMS, GATED_MAPS, START, VILLAIN_BEATS } from '../quest.js';
import { BLOCKERS, GIVERS } from '../blockers.js';
import * as Badges from '../badges.js';

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const idx = mapIndex();                 // MAP_id -> stem
const stemOf = id => idx[id] || id;     // BLOCKERS/GIVERS keys are MAP_ids
const adj = buildGraph();
// Every Pokemon Center's 2F teleports to a shared multiplayer link room (UnionRoom /
// TradeCenter / Colosseum / RecordCorner / Hoenn's variants), which would let
// reachability hop between any two towns. These are not progression paths — drop the
// 2F link floors and the link rooms so reachability follows the real overworld map.
const LINK = /PokemonCenter_2F$|Pokecenter2F$|UnionRoom|TradeCenter|Colosseum|RecordCorner|RecordCenter|Cable/i;
for (const n of [...adj.keys()]) if (LINK.test(n)) adj.delete(n);
for (const s of adj.values()) for (const n of [...s]) if (!adj.has(n)) s.delete(n);
const REGIONS = ['KANTO', 'JOHTO', 'HOENN'];

// HM-inherent terrain gates: a far-map opened by an HM whose badge requirement EQUALS
// the corridor badge (water/dive tiles or a code-seeded cut tree / rock enforce it in
// game). Only the matching ones live here; mismatches (Cinnabar/Mossdeep/Blackthorn,
// where the corridor badge is higher than the HM) are badge-guard BLOCKERS instead.
const TERRAIN_GATES = {
	KANTO: { CinnabarIsland: 5 },                          // Surf(5) — island reached by sea
	JOHTO: { GoldenrodCity: 2, CianwoodCity: 4 },          // Ilex Cut(2), Route40/41 Surf(4)
	HOENN: { FortreeCity: 5, SootopolisCity: 7, MossdeepCity: 5, EverGrandeCity: 5 }, // Surf(5)/Dive(7)/Surf(5)/Surf(5)
};

// the safe badge-corridor gateNeed (proven strand-free by quest_reach.mjs)
function safeGateNeed(region) {
	const g = { ...GATED_MAPS[region] };
	GYMS[region].forEach((gym, k) => { g[gym.map] = k; });
	return g;
}
// item -> { mapStem, prereq } from the GIVERS table
const givers = (() => {
	const m = {};
	for (const [mapId, arr] of Object.entries(GIVERS)) for (const g of arr) m[g.item] = { mapStem: stemOf(mapId), prereq: g.prereq || null };
	return m;
})();
// badge-equivalent threshold at which a condition becomes satisfiable (recurses
// item -> its giver's prereq). 0..8, or 99 for an unsatisfiable/cyclic condition.
function threshold(cond, region, seen = new Set()) {
	if (!cond) return 0;
	if (cond.all) return Math.max(0, ...cond.all.map(c => threshold(c, region, seen)));
	if (cond.any) return Math.min(...cond.any.map(c => threshold(c, region, seen)));
	if (cond.badge != null) return cond.badge;
	if (cond.hm) return Badges.hmReq(region, cond.hm);
	if (cond.flag) { const b = (VILLAIN_BEATS[region] || []).find(v => v.doneFlag === cond.flag); return b ? Math.min(8, b.afterBadges) : 0; }
	if (cond.item) { if (seen.has(cond.item)) return 99; seen.add(cond.item); const g = givers[cond.item]; return g ? threshold(g.prereq, region, seen) : 99; }
	return 0;
}
// the authentic gateNeed: each far-map gated to the badge level at which its blocker's
// / terrain's condition becomes satisfiable (take the strictest contributor).
function authenticGateNeed(region) {
	const g = {}; const set = (stem, t) => { g[stem] = Math.max(g[stem] ?? 0, t); };
	for (const arr of Object.values(BLOCKERS)) for (const b of arr) if (b.gates) set(b.gates, Math.min(8, threshold(b.cond, region)));
	for (const [stem, t] of Object.entries(TERRAIN_GATES[region] || {})) set(stem, t);
	return g;
}
function collectItems(cond) {
	if (!cond) return [];
	if (cond.all) return cond.all.flatMap(collectItems);
	if (cond.any) return cond.any.flatMap(collectItems);
	if (cond.item) return [cond.item];
	return [];
}

const raByRegion = {}, safeByRegion = {};
for (const region of REGIONS) {
	const safe = safeGateNeed(region), auth = authenticGateNeed(region), start = START[region];
	const rs = [], ra = [];
	for (let b = 0; b <= 8; b++) { rs[b] = reachable(adj, start, safe, b); ra[b] = reachable(adj, start, auth, b); }
	if (process.env.WORKLIST) console.log(`[${region}] authentic-gated:`, Object.entries(auth).map(([k, v]) => `${k}@${v}`).join(', '));

	// 1. NO-SKIP — every corridor-gated map is gated by an authentic obstacle at least
	// as late (so a spine wall with no blocker, or a too-weak condition, fails here).
	for (const [m, t] of Object.entries(safe)) {
		if (t <= 0 || t > 8) continue;
		if (!rs[t - 1].has(m) && ra[t - 1].has(m)) A(false, `[${region}] '${m}' opens too early — needs an authentic blocker (safe gates it at ${t})`);
		else pass++;
	}

	// 3. NO-STRAND — with 8 badges + obtainable items, the authentic gates reach
	// everything the backstop reaches (nothing is permanently walled off).
	const stranded = [...rs[8]].filter(m => !ra[8].has(m));
	A(stranded.length === 0, `[${region}] no map reachable by the spine is permanently walled by an authentic gate`, stranded.slice(0, 5).join(','));

	raByRegion[region] = ra; safeByRegion[region] = safe;
}

// 2. GIVER REACH — every key item a blocker needs is obtainable on the near side,
// resolved in the item's OWN region (a blocker's map decides which region it's in).
const ungatedReach = {}; for (const r of REGIONS) ungatedReach[r] = reachable(adj, START[r], {}, 8);
const regionOfStem = stem => REGIONS.find(r => ungatedReach[r].has(stem)) || 'KANTO';
for (const [mapId, arr] of Object.entries(BLOCKERS)) for (const b of arr) for (const it of collectItems(b.cond)) {
	const region = regionOfStem(stemOf(mapId));
	const g = givers[it];
	A(!!g, `[${region}] item '${it}' has a giver`);
	if (!g) continue;
	const t = threshold(g.prereq, region);
	A(t < 9, `[${region}] item '${it}' giver prereq is satisfiable`, `t=${t}`);
	A(raByRegion[region][Math.min(8, t)].has(g.mapStem), `[${region}] giver for '${it}' (${g.mapStem}) reachable at ${t} badges`);
	if (b.gates && safeByRegion[region][b.gates] != null) A(t <= safeByRegion[region][b.gates], `[${region}] '${it}' obtainable (t=${t}) before '${b.gates}' matters`);
}

// 4. DAG — the item -> giver.prereq(item) dependency graph is acyclic
{
	const edges = {}; for (const [it, g] of Object.entries(givers)) edges[it] = collectItems(g.prereq);
	const state = {}; let cyclic = null;
	const dfs = n => { if (state[n] === 1) { cyclic = n; return; } if (state[n] === 2) return; state[n] = 1; for (const m of edges[n] || []) { dfs(m); if (cyclic) return; } state[n] = 2; };
	for (const it of Object.keys(edges)) { dfs(it); if (cyclic) break; }
	A(!cyclic, 'the key-item dependency graph is acyclic', cyclic ? `cycle at ${cyclic}` : '');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
