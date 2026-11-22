// poketactica_pvp_test.mjs — Poketactica PvP (owner, 2026-11-22: "PvP up to 4 players"): the engine's 2-4 sides (whose
// turn it is, each seat's own base, conceding, the server's idle clock, computer seats playing the enemy AI, the last side
// standing, the round limit) and the arenas (poketactica/js/arenas.js). Pure: node only.
//   node overworld/tests/poketactica_pvp_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as G from '../../poketactica/js/engine/grid.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { ARENAS, arenaById, arenaSetup } from '../../poketactica/js/arenas.js';
import { GROUND_CHAR } from '../../poketactica/js/campaign.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';
import { recipeOf, validRecipe, replayTo, packRecipe, unpackRecipe } from '../../poketactica/js/replay.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 600) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv, seed) => makeFigurine(sp, lv, makeRng(seed || sp), data, { id: (sp + '-' + (seed || 'x')).slice(0, 60), shinyRate: 0 });
const team = (k, sps, lv = 30) => sps.map((sp, i) => fig(sp, lv, k + i));
const T1 = ['charmander', 'squirtle', 'bulbasaur'], T2 = ['pikachu', 'machop', 'geodude'], T3 = ['eevee', 'pidgey', 'rattata'], T4 = ['oddish', 'poliwag', 'growlithe'];

try {
	// ---------- the arenas
	A(ARENAS.length >= 3 && new Set(ARENAS.map((a) => a.id)).size === ARENAS.length, `${ARENAS.length} arenas, ids unique`);
	for (const ar of ARENAS) {
		const s = arenaSetup(ar, [{ team: [] }, { team: [] }, { team: [] }, { team: [] }]), M = s.map;
		A(ar.rows.every((r) => r.length === M.w) && (!ar.geo || (ar.geo.length === M.h && ar.geo.every((r) => r.length === M.w))), `${ar.id}: rows and geo are one size`);
		A(ar.bases.length === 4 && new Set(ar.bases.map(String)).size === 4 && ar.bases.every(([x, y]) => G.isTile(M, x, y)), `${ar.id}: four different bases, each a tile`);
		A(ar.bases.every(([x, y]) => !(ar.symbols || []).some((g) => g.x === x && g.y === y)), `${ar.id}: no Geo Symbol on a base`);
		const [a0, a1] = ar.bases;
		A(G.manhattan(a0[0], a0[1], a1[0], a1[1]) >= M.w + M.h - 4, `${ar.id}: the two-player bases are across the map`);
		for (const [x, y] of ar.bases) {
			const r = G.reach(M, x, y, 99, 2, () => null);
			A(ar.bases.every(([bx, by]) => (bx === x && by === y) || r.has(G.key(bx, by))), `${ar.id}: from base ${x},${y} a Jump-2 figurine can walk to every other base`);
		}
		for (const g of ar.symbols || []) A(G.isTile(M, g.x, g.y) && M.geo[g.y * M.w + g.x], `${ar.id}: symbol at ${g.x},${g.y} sits on a coloured panel`);
		// living terrain (engine/terrain.js): dressed, safe bases, a normal-cost walk between bases, and FAIR: the ground is
		// the same under every rotation / mirror that keeps the arena's heights, Geo and bases (each seat sees one board)
		A(!!ar.theme && /^[a-z]+$/.test(ar.theme) && M.theme === ar.theme, `${ar.id}: has a theme (${ar.theme})`);
		A(Array.isArray(ar.ground) && ar.ground.length === M.h && ar.ground.every((r) => r.length === M.w), `${ar.id}: its ground rows are the arena's size`);
		A((ar.ground || []).every((r) => [...r].every((c) => c === '.' || c in GROUND_CHAR)), `${ar.id}: every ground char is a known one`);
		const gr = (x, y) => (M.ground && G.inside(M, x, y) ? M.ground[y * M.w + x] : null);
		const HARSH = new Set(['water', 'ice', 'lava']);
		A(ar.bases.every(([x, y]) => !HARSH.has(gr(x, y))), `${ar.id}: no water, ice or lava on a base`);
		A(ar.bases.every(([x, y]) => [[1, 0], [-1, 0], [0, 1], [0, -1]].every(([dx, dy]) => gr(x + dx, y + dy) !== 'lava')), `${ar.id}: no lava next to a base`);
		for (const [x, y] of ar.bases) {
			const r = G.reach(M, x, y, 500, 2, () => null, (tx, ty) => (HARSH.has(gr(tx, ty)) ? 1000 : 1));
			A(ar.bases.every(([bx, by]) => r.has(G.key(bx, by))), `${ar.id}: from base ${x},${y} a normal-cost walk (no water, ice or lava) reaches every other base`);
		}
		const n = M.w, OPS = { r90: (x, y) => [n - 1 - y, x], r180: (x, y) => [n - 1 - x, n - 1 - y], r270: (x, y) => [y, n - 1 - x], mx: (x, y) => [n - 1 - x, y], my: (x, y) => [x, n - 1 - y], tr: (x, y) => [y, x], atr: (x, y) => [n - 1 - y, n - 1 - x] };
		const keeps = (f, grid) => !grid || grid.every((row, y) => [...row].every((c, x) => { const [u, v] = f(x, y); return grid[v][u] === c; }));
		const syms = M.w === M.h ? Object.entries(OPS).filter(([, f]) => keeps(f, ar.rows) && keeps(f, ar.geo) && ar.bases.every(([x, y]) => ar.bases.some(([bx, by]) => String(f(x, y)) === String([bx, by])))) : [];
		A(syms.length >= 1 && syms.some(([, f]) => String(f(...ar.bases[0])) === String(ar.bases[1])), `${ar.id}: a symmetry of the arena takes seat 1's base to seat 2's`, syms.map(([k]) => k));
		for (const [k, f] of syms) A(keeps(f, ar.ground), `${ar.id}: its ground is symmetric under ${k}, like its heights, Geo and bases`);
	}
	A(arenaById('plateau') && !arenaById('nope'), 'arenaById');

	// ---------- two players
	const ar = arenaById('plateau');
	const setup2 = arenaSetup(ar, [{ team: team('a', T1) }, { team: team('b', T2) }]);
	let S = B.newBattle('pvp-2', setup2, data);
	A(S.pvp && S.pvp.sides.join() === 'a,b' && B.curSide(S) === 'a' && S.phase === 'player', 'two seats: sides a and b, seat 1 plays first');
	A(S.units.every((u) => u.x == null) && S.units.filter((u) => u.side === 'a').length === 3 && S.units.filter((u) => u.side === 'b').length === 3, 'every figurine waits to be deployed');
	A(S.bonus === null && B.view(S).pvp && B.view(S).pvp.cur === 0 && B.view(S).pvp.bases.b.x === 9, 'no Bonus Gauge; the view has the seats, whose turn, the bases');
	A(S.units.find((u) => u.side === 'a').facing === B.view(S).units.find((u) => u.side === 'a').facing && ['n', 'e'].includes(S.units.find((u) => u.side === 'a').facing), "seat 1's figurines face into the map", S.units[0].facing);
	let r = B.act(S, { t: 'deploy', uid: 'b3', by: 'b' }, data);
	A(!r.ok && r.why === 'not your turn', "seat 2 can't act in seat 1's phase", r.why);
	r = B.act(S, { t: 'deploy', uid: 'b3' }, data);
	A(!r.ok, 'an action with no seat does nothing in PvP');
	r = B.act(S, { t: 'deploy', uid: 'b3', by: 'a' }, data);
	A(!r.ok && r.why === 'not your unit', "seat 1 can't move seat 2's figurine", r.why);
	r = B.act(S, { t: 'deploy', uid: 'a0', by: 'a' }, data);
	A(r.ok && B.unit(S, 'a0').x === 0 && B.unit(S, 'a0').y === 9, 'seat 1 deploys onto ITS base (0,9)', JSON.stringify([r.why, B.unit(S, 'a0').x, B.unit(S, 'a0').y]));
	A(B.act(S, { t: 'move', uid: 'a0', x: 2, y: 8, by: 'a' }, data).ok, 'and moves off it');
	r = B.act(S, { t: 'end', by: 'b' }, data);
	A(!r.ok, "seat 2 can't end seat 1's phase");
	r = B.act(S, { t: 'end', by: 'a' }, data);
	A(r.ok && B.curSide(S) === 'b' && S.turn === 1 && r.events.some((e) => e.t === 'phase' && e.side === 'b'), "ending seat 1's phase passes to seat 2 (same round)");
	A(B.act(S, { t: 'deploy', uid: 'b3', by: 'b' }, data).ok && B.unit(S, 'b3').x === 9 && B.unit(S, 'b3').y === 0, 'seat 2 deploys onto its own base (9,0)');
	A(!B.act(S, { t: 'move', uid: 'a0', x: 3, y: 8, by: 'b' }, data).ok, "seat 2 can't move seat 1's figurine in its phase");
	r = B.act(S, { t: 'end', by: 'b' }, data);
	A(r.ok && B.curSide(S) === 'a' && S.turn === 2, 'back round to seat 1: round 2');
	A(!B.unit(S, 'a0').moved && !B.unit(S, 'a0').acted, "seat 1's figurines are fresh for their phase");
	// the server's idle clock ends whoever's phase it is; conceding
	r = B.act(S, { t: 'idle', by: 'b' }, data);
	A(r.ok && B.curSide(S) === 'b' && r.events.some((e) => e.t === 'idle' && e.side === 'a'), "an idle claim ends the playing seat's phase (seat 1 took too long)");
	r = B.act(S, { t: 'concede', by: 'a' }, data);
	A(r.ok && S.over === 'done' && S.pvp.winner === 'b' && S.phase === 'over' && B.results(S).winner === 'b', 'seat 1 concedes: seat 2 wins', JSON.stringify([S.over, S.pvp.winner]));
	A(B.results(S).bonus.length === 0 && Object.keys(B.results(S).exp).length === 0, 'PvP pays no EXP and no Bonus Gauge');
	A(!B.act(S, { t: 'end', by: 'b' }, data).ok, 'nothing happens after the end');

	// a knockout ends it; no capture onto a base in PvP
	{
		const S2 = B.newBattle('pvp-2b', arenaSetup(ar, [{ team: team('a', ['machamp'], 60) }, { team: team('b', ['caterpie'], 3) }]), data);
		B.act(S2, { t: 'deploy', uid: 'a0', by: 'a' }, data); B.act(S2, { t: 'end', by: 'a' }, data);
		B.act(S2, { t: 'deploy', uid: 'b1', by: 'b' }, data);
		const c = B.unit(S2, 'b1'), m = B.unit(S2, 'a0');
		c.x = 4; c.y = 7; m.x = 3; m.y = 7;   // (set the scene: next to each other, the caterpie in reach)
		B.act(S2, { t: 'end', by: 'b' }, data);
		const mv = m.fig.equipped.find((id) => { const mm = B.moveOf(m, id, data); return mm && mm.category !== 'Status' && B.aimTiles(S2, m, mm).some(([x, y]) => x === 4 && y === 7); });
		r = mv ? B.act(S2, { t: 'attack', uid: 'a0', move: mv, x: 4, y: 7, by: 'a' }, data) : { ok: false, why: 'no move' };
		A(r.ok, 'seat 1 queues an attack', r.why);
		B.act(S2, { t: 'execute', by: 'a' }, data);
		A(S2.over === 'done' && S2.pvp.winner === 'a' && S2.pvp.out.includes('b'), "knocking out seat 2's last figurine wins", JSON.stringify([S2.over, S2.pvp, c.hp]));
		const S3 = B.newBattle('pvp-2c', arenaSetup(ar, [{ team: team('a', ['machamp'], 60) }, { team: team('b', ['caterpie', 'weedle'], 3) }]), data);
		B.act(S3, { t: 'deploy', uid: 'a0', by: 'a' }, data); B.act(S3, { t: 'move', uid: 'a0', x: 0, y: 8, by: 'a' }, data); B.act(S3, { t: 'end', by: 'a' }, data);
		B.act(S3, { t: 'deploy', uid: 'b1', by: 'b' }, data); B.act(S3, { t: 'end', by: 'b' }, data);
		const v = B.unit(S3, 'b1'); v.x = 1; v.y = 8;
		r = B.act(S3, { t: 'throw', uid: 'a0', fx: 1, fy: 8, x: 0, y: 9, by: 'a' }, data);
		A(!(r.events || []).some((e) => e.t === 'capture') && !(S3.captured || []).length, 'a foe thrown onto a base is never captured in PvP', JSON.stringify([r.ok, r.why]));
	}

	// ---------- four seats, two of them computers; determinism
	const seats4 = [{ team: team('a', T1) }, { team: team('b', T2), cpu: true }, { team: team('c', T3) }, { team: team('d', T4), cpu: true }];
	const setup4 = arenaSetup(arenaById('crossroads'), seats4);
	S = B.newBattle('pvp-4', setup4, data);
	A(S.pvp.sides.join() === 'a,b,c,d' && S.pvp.cpu.b && S.pvp.cpu.d && !S.pvp.cpu.a, 'four seats; b and d are computers');
	A(B.act(S, { t: 'deploy', uid: 'a0', by: 'a' }, data).ok, 'seat 1 deploys');
	r = B.act(S, { t: 'end', by: 'a' }, data);
	A(r.ok && B.curSide(S) === 'c', "after seat 1, the computer in seat 2 plays at once and the turn reaches seat 3", B.curSide(S));
	A(r.events.some((e) => e.t === 'deploy' && e.uid.startsWith('b')) && r.events.some((e) => e.t === 'phase' && e.side === 'b'), "seat 2's phase: it deployed", JSON.stringify(r.events.map((e) => e.t + ':' + (e.uid || e.side || ''))).slice(0, 300));
	const b0 = S.units.find((u) => u.side === 'b' && u.x != null);
	A(b0 && !(b0.x === 11 && b0.y === 0), "seat 2's first figurine stepped off its base so the next can deploy", JSON.stringify(b0 && [b0.x, b0.y]));
	r = B.act(S, { t: 'end', by: 'c' }, data);
	A(r.ok && B.curSide(S) === 'a' && S.turn === 2 && r.events.some((e) => e.t === 'phase' && e.side === 'd'), 'seat 3 ends; the computer in seat 4 plays; round 2 starts with seat 1');
	// a recipe replays exactly (every device plays the computers the same)
	{
		const acts = [{ t: 'deploy', uid: 'a0', by: 'a' }, { t: 'end', by: 'a' }, { t: 'end', by: 'c' }, { t: 'end', by: 'a' }, { t: 'deploy', uid: 'c6', by: 'c' }, { t: 'end', by: 'c' }, { t: 'end', by: 'a' }];
		const x = B.replay('pvp-4r', setup4, acts, data), y = B.replay('pvp-4r', JSON.parse(JSON.stringify(setup4)), acts, data);
		A(JSON.stringify(B.view(x)) === JSON.stringify(B.view(y)) && x.log.length === y.log.length && x.log.length > 10, 'the same seed + actions = the same match, computers included', x.log.length);
	}

	// ---------- an online match's replay: the recipe (seats, concede, idle) re-runs to the same battle
	{
		const acts = [{ t: 'deploy', uid: 'a0', by: 'a' }, { t: 'end', by: 'a' }, { t: 'idle' }, { t: 'deploy', uid: 'a1', by: 'a' }, { t: 'end', by: 'a' }, { t: 'concede', by: 'c' }];
		const x = B.replay('pvp-rec', setup4, acts, data);
		const rec = recipeOf('pvp-rec', setup4, acts, { label: 'Crossroads', won: false });
		A(validRecipe(rec) && rec.setup.pvp.seats.length === 4 && rec.setup.pvp.seats[1].cpu, 'an online match makes a valid replay recipe (its seats, the computers marked)');
		const back = await unpackRecipe(await packRecipe(rec));
		A(back && JSON.stringify(B.view(replayTo(back, acts.length, data))) === JSON.stringify(B.view(x)), 'packed and unpacked, it replays to the same battle');
		A(!validRecipe({ ...rec, setup: { ...rec.setup, pvp: { seats: rec.setup.pvp.seats.slice(0, 1) } } }), 'a recipe with one seat is not a match');
	}
	// ---------- two computers fight each other while the one player waits (passes every phase)
	{
		const t0 = Date.now();
		const S4 = B.newBattle('pvp-cpu', arenaSetup(arenaById('garden'), [{ team: team('a', ['charmander']) }, { team: team('b', T2), cpu: true }, { team: team('c', T3), cpu: true }]), data);
		for (let i = 0; i < 20 && !S4.over; i++) B.act(S4, { t: 'end', by: 'a' }, data);
		const hits = S4.log.filter((e) => e.t === 'hit').map((e) => [(B.unit(S4, e.uid) || {}).side, (B.unit(S4, e.target) || {}).side]);
		A(hits.some(([x, y]) => x === 'b' && y === 'c') && S4.pvp.out.length >= 1, 'the computers deploy and fight each other (not only the player)', JSON.stringify([hits.slice(0, 6), S4.pvp.out]));
		A(Date.now() - t0 < 20000, '20 rounds of two computers in reasonable time', Date.now() - t0);
		// only computers left: the match ends (no one is left to play it)
		const r4 = B.act(S4, { t: 'concede', by: 'a' }, data);
		A(r4.ok && S4.over === 'done' && ['b', 'c'].includes(S4.pvp.winner), 'the player leaves a match of computers: it ends, the computer with most HP left wins', JSON.stringify([S4.over, S4.pvp.winner]));
	}
	{
		const S5 = B.newBattle('pvp-cpu1', arenaSetup(ar, [{ team: team('a', T1), cpu: true }, { team: team('b', T2) }]), data);
		A(!S5.over && B.curSide(S5) === 'b' && S5.units.some((u) => u.side === 'a' && u.x != null), "a computer in seat 1 plays its phase at the start; seat 2's turn", B.curSide(S5));
		// the human leaves: only computers are left, so the match ends
		r = B.act(S5, { t: 'concede', by: 'b' }, data);
		A(r.ok && S5.over === 'done' && S5.pvp.winner === 'a', 'the only player concedes: the computer wins');
	}
	// three players: one concedes in the middle of the round, the play goes on round the other two
	{
		const S6 = B.newBattle('pvp-3', arenaSetup(ar, [{ team: team('a', T1) }, { team: team('b', T2) }, { team: team('c', T3) }]), data);
		B.act(S6, { t: 'end', by: 'a' }, data);
		r = B.act(S6, { t: 'concede', by: 'b' }, data);
		A(r.ok && !S6.over && B.curSide(S6) === 'c' && S6.pvp.out.includes('b'), "seat 2 concedes in its phase: seat 3 plays, the match goes on", JSON.stringify(S6.pvp));
		A(!B.act(S6, { t: 'concede', by: 'b' }, data).ok, 'a seat that is out cannot concede again');
		B.act(S6, { t: 'end', by: 'c' }, data);
		A(B.curSide(S6) === 'a' && S6.turn === 2, 'the play skips the seat that left');
		r = B.act(S6, { t: 'concede', by: 'a' }, data);
		A(S6.over === 'done' && S6.pvp.winner === 'c', 'one left: seat 3 wins');
	}
	// the round limit: the side with the most HP left wins
	{
		const S7 = B.newBattle('pvp-lim', arenaSetup(ar, [{ team: team('a', T1) }, { team: team('b', T2) }]), data);
		B.unit(S7, 'a0').hp = 1;
		for (let i = 0; i < B.PVP_ROUNDS * 2 + 2 && !S7.over; i++) B.act(S7, { t: 'end', by: B.curSide(S7) }, data);
		A(S7.over === 'done' && S7.pvp.winner === 'b' && S7.turn === B.PVP_ROUNDS + 1, `past ${B.PVP_ROUNDS} rounds the side with more HP left wins`, JSON.stringify([S7.over, S7.pvp.winner, S7.turn]));
	}
	// the campaign is untouched: one side 'p', no seats
	{
		const S8 = B.newBattle('camp', { map: setup2.map, player: team('p', T1), enemy: [{ fig: fig('rattata', 3), x: 5, y: 5, ai: 'aggro' }] }, data);
		A(!S8.pvp && B.curSide(S8) === 'p' && S8.bonus && B.view(S8).pvp === null, 'a campaign battle has no seats');
		A(B.act(S8, { t: 'deploy', uid: 'p0' }, data).ok, 'and the player acts with no seat');
	}
} catch (e) { A(false, 'crashed: ' + (e && e.stack)); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
