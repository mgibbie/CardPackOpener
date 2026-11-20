// poketactica_engine_test.mjs — Poketactica's battle engine core (stage 3a; Plans/POKETACTICA_PLAN.md): the grid (Move +
// Jump reach, shapes, height rules), Disgaea's phases (move / undo / queue, Execute in queue order with the combo bonus,
// end phase -> the enemy phase), Pokémon's damage through overworld/rules/, knockouts, EXP and move XP, the enemy AI's
// three patterns, exact replays from `seed + actions`, and a fuzz of random legal play that must keep every invariant.
// Pure: node only.
//   node overworld/tests/poketactica_engine_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as G from '../../poketactica/js/engine/grid.js';
import * as B from '../../poketactica/js/engine/battle.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + extra : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json') };

// a flat 8x8 map with a 3-level pillar at (4,4) and a 1-level step at (2,4)
const flat = (w = 8, h = 8) => ({ w, h, height: Array(w * h).fill(0), base: { x: 1, y: h - 2 } });
const M = flat(); M.height[4 * 8 + 4] = 3; M.height[4 * 8 + 2] = 1;
const fig = (sp, lv, moves, seed = sp) => { let f = makeFigurine(sp, lv, makeRng(seed), data); if (moves) { f = { ...f, pool: [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))] }; f = equip(f, moves); } return f; };

// ---- the grid
{
	const r = G.reach(M, 3, 4, 3, 2, () => null);
	A(r.has(G.key(2, 4)) && !r.has(G.key(4, 4)), 'Jump 2: a 1-level step yes, the 3-level pillar no');
	A(G.reach(M, 3, 4, 3, Infinity, () => null).has(G.key(4, 4)), 'Jump Infinity (Flying) climbs anything');
	const occ = (x, y) => (x === 3 && y === 3 ? 'ally' : x === 3 && y === 5 ? 'foe' : null);
	const r2 = G.reach(M, 3, 4, 2, 2, occ);
	A(!r2.has(G.key(3, 3)) && r2.has(G.key(3, 2)) && !r2.has(G.key(3, 5)) && !r2.has(G.key(3, 6)), 'allies can be passed but not stood on; foes block');
	A(G.shapeTiles(flat(), { s: 'line', n: 3 }, 3, 3, 3, 2).length === 3 && G.shapeTiles(flat(), { s: 'cone', n: 3 }, 3, 4, 3, 3).length === 9 && G.shapeTiles(flat(), { s: 'arc', n: 2 }, 3, 3, 3, 2).length === 6, 'line 3 = 3 tiles, cone 3 = 9, arc 2 = 6');
	A(G.shapeTiles(flat(), { s: 'burst', n: 1 }, 3, 3, 3, 3).length === 4 && G.shapeTiles(flat(), { s: 'dia', n: 1 }, 0, 0, 5, 5).length === 5, 'burst 1 = 4 around the user, diamond 1 = 5');
	A(G.heightReach(M, 'melee', 4, 3, 4, 4) === false && G.heightReach(M, 'melee', 3, 4, 2, 4) === true, 'melee reaches 2 levels, not 3');
	const W = flat(); W.height[3 * 8 + 3] = 5;
	A(G.heightReach(W, 'beam', 3, 1, 3, 5) === false && G.heightReach(W, 'lob', 3, 1, 3, 5) === true, 'a beam is blocked by a wall; a lobbed shot isn\'t');
}

// ---- a scripted battle
const setup = () => ({ map: flat(), player: [fig('machamp', 80, ['karatechop', 'earthquake', 'bulkup', 'rockslide']), fig('pikachu', 80, ['thunderbolt', 'quickattack', 'thunderwave', 'surf'])],
	enemy: [{ fig: fig('rattata', 30, ['tackle'], 'r1'), x: 1, y: 3 }, { fig: fig('rattata', 30, ['tackle'], 'r2'), x: 2, y: 3 }] });
{
	const S = B.newBattle('t1', setup(), data);
	const [mc, pk] = S.units.filter((u) => u.side === 'p');
	A(B.act(S, { t: 'move', uid: mc.uid, x: 1, y: 5 }, data).why === 'not deployed', 'a figurine must be deployed first');
	A(B.act(S, { t: 'deploy', uid: mc.uid }, data).ok && mc.x === 1 && mc.y === 6, 'deploy puts it on the base tile');
	A(!B.act(S, { t: 'deploy', uid: pk.uid }, data).ok, 'the base tile must be free to deploy another');
	A(B.act(S, { t: 'move', uid: mc.uid, x: 1, y: 4 }, data).ok && B.act(S, { t: 'undo', uid: mc.uid }, data).ok && mc.y === 6, 'moving is undoable until it acts');
	B.act(S, { t: 'move', uid: mc.uid, x: 1, y: 4 }, data);
	B.act(S, { t: 'deploy', uid: pk.uid }, data); B.act(S, { t: 'move', uid: pk.uid, x: 2, y: 5 }, data);
	A(B.act(S, { t: 'attack', uid: mc.uid, move: 'karatechop', x: 3, y: 0 }, data).why === 'out of reach', 'an aim out of reach is refused');
	A(B.act(S, { t: 'attack', uid: mc.uid, move: 'hyperbeam', x: 1, y: 3 }, data).why === 'not equipped', 'only equipped moves');
	const sp0 = pk.sp;
	A(B.act(S, { t: 'attack', uid: mc.uid, move: 'karatechop', x: 1, y: 3 }, data).ok && B.act(S, { t: 'attack', uid: pk.uid, move: 'thunderbolt', x: 2, y: 3 }, data).ok, 'two attacks queued');
	A(pk.sp < sp0 && pk.pp.thunderbolt === data.moves.thunderbolt.pp - 1, 'a queued move spends its PP and SP');
	A(B.act(S, { t: 'undo', uid: mc.uid }, data).why === 'nothing to undo', 'no undo once it has acted');
	B.act(S, { t: 'execute' }, data);
	const hits = S.log.filter((e) => e.t === 'hit');
	A(hits.length >= 1 && hits.every((h) => h.dmg >= 0), 'Execute resolves the queue', JSON.stringify(hits.map((h) => [h.target, h.dmg, h.combo])));
	A(hits.length < 2 || hits[1].combo === 1, 'the second hit in one Execute carries the combo', JSON.stringify(hits.map((h) => h.combo)));
	A(Object.keys(S.xp).some((k) => k.endsWith(':thunderbolt') || k.endsWith(':karatechop')), 'move XP for the moves that dealt damage', JSON.stringify(S.xp));
	const order = S.log.filter((e) => e.t === 'use').map((e) => e.uid);
	A(order[0] === mc.uid && order[1] === pk.uid, 'the queue resolves in the order it was queued (not by Speed: owner)', order.join(','));
}

// REGRESSION (found by the fuzz below): undo must not send a figurine back onto its starting tile when another has been
// deployed there since (two units stood on the base tile)
{
	const S = B.newBattle('undo', setup(), data);
	const [mc, pk] = S.units.filter((u) => u.side === 'p');
	B.act(S, { t: 'deploy', uid: mc.uid }, data); B.act(S, { t: 'move', uid: mc.uid, x: 3, y: 6 }, data); B.act(S, { t: 'deploy', uid: pk.uid }, data);
	const r = B.act(S, { t: 'undo', uid: mc.uid }, data);
	A(!r.ok && mc.x === 3 && pk.x === 1 && pk.y === 6, 'undo is refused when its starting tile is taken', r.why);
}

// ---- Earthquake hits allies too; height adds damage
{
	const S = B.newBattle('t2', { map: flat(), player: [fig('machamp', 80, ['earthquake']), fig('pikachu', 80, ['thunderbolt'])], enemy: [{ fig: fig('rattata', 30, ['tackle'], 'r3'), x: 1, y: 5 }] }, data);
	const [mc, pk] = S.units.filter((u) => u.side === 'p');
	B.act(S, { t: 'deploy', uid: mc.uid }, data); B.act(S, { t: 'move', uid: mc.uid, x: 1, y: 6 }, data);
	B.act(S, { t: 'deploy', uid: pk.uid }, data);   // (base is (1,6): machamp stayed; move pikachu off first)
	S.units.find((u) => u.uid === pk.uid).x = 2; S.units.find((u) => u.uid === pk.uid).y = 6;
	B.act(S, { t: 'attack', uid: mc.uid, move: 'earthquake', x: 1, y: 6 }, data);
	B.act(S, { t: 'execute' }, data);
	const tg = S.log.filter((e) => e.t === 'hit' || e.t === 'immune' || e.t === 'miss').map((e) => e.target || e.uid);
	A(tg.includes(pk.uid), 'Earthquake hits an adjacent ally too (Pokémon\'s own rule)', JSON.stringify(tg));
	// height: the same hit from 2 levels up deals more
	const dmgFrom = (h) => {
		const MM = flat(); MM.height[5 * 8 + 3] = h;
		const T = B.newBattle('h', { map: MM, player: [fig('machamp', 60, ['karatechop'])], enemy: [{ fig: fig('snorlax', 90, ['tackle'], 'sn'), x: 3, y: 4 }] }, data);
		const u = T.units[0]; u.x = 3; u.y = 5; u.boosts.acc = 6;
		T.units[1].facing = 'n';
		B.act(T, { t: 'attack', uid: u.uid, move: 'karatechop', x: 3, y: 4 }, data); B.act(T, { t: 'execute' }, data);
		return (T.log.find((e) => e.t === 'hit') || {}).dmg || 0;
	};
	A(dmgFrom(2) > dmgFrom(0), 'striking from higher ground deals more', JSON.stringify([dmgFrom(0), dmgFrom(2)]));
}

// ---- the enemy phase: aggro comes, passive waits, hold never moves
{
	const mk = (ai) => B.newBattle('ai-' + ai, { map: flat(10, 10), player: [fig('machamp', 50, ['karatechop'])], enemy: [{ fig: fig('rattata', 20, ['tackle'], 'ra'), x: 8, y: 0, ai }] }, data);
	const run = (ai) => { const S = mk(ai); const u = S.units[0]; B.act(S, { t: 'deploy', uid: u.uid }, data); B.act(S, { t: 'end' }, data); return S; };
	const ag = run('aggro'), pa = run('passive'), ho = run('hold');
	const eAt = (S) => { const e = S.units[1]; return [e.x, e.y]; };
	A(JSON.stringify(eAt(ag)) !== '[8,0]', 'an aggro enemy comes at you', JSON.stringify(eAt(ag)));
	A(JSON.stringify(eAt(pa)) === '[8,0]' && JSON.stringify(eAt(ho)) === '[8,0]', 'a passive enemy waits until you come near; a holding one stays put');
	A(ag.phase === 'player' && ag.turn === 2, 'after the enemy phase it is the player\'s turn 2');
	// adjacent: the aggro enemy attacks
	const S = B.newBattle('adj', { map: flat(), player: [fig('machamp', 50, ['karatechop'])], enemy: [{ fig: fig('rattata', 20, ['tackle'], 'rb'), x: 1, y: 4 }] }, data);
	B.act(S, { t: 'deploy', uid: S.units[0].uid }, data); B.act(S, { t: 'move', uid: S.units[0].uid, x: 1, y: 5 }, data); B.act(S, { t: 'end' }, data);
	A(S.log.some((e) => e.t === 'use' && e.uid === S.units[1].uid), 'an enemy in reach attacks');
}

// ---- winning, EXP
{
	const S = B.newBattle('win', { map: flat(), player: [fig('machamp', 100, ['karatechop'])], enemy: [{ fig: fig('rattata', 5, ['tackle'], 'rc'), x: 1, y: 4 }] }, data);
	const u = S.units[0];
	B.act(S, { t: 'deploy', uid: u.uid }, data); B.act(S, { t: 'move', uid: u.uid, x: 1, y: 5 }, data);
	for (let i = 0; i < 6 && !S.over; i++) { if (!u.acted) B.act(S, { t: 'attack', uid: u.uid, move: 'karatechop', x: 1, y: 4 }, data); B.act(S, { t: 'end' }, data); }
	A(S.over === 'won' && B.results(S).exp[u.uid] > 0, 'knocking out every enemy wins, and pays EXP', JSON.stringify(B.results(S)));
	A(!B.act(S, { t: 'end' }, data).ok, 'nothing more happens after the end');
}

// ---- stage 3b: team attacks, lift & throw, capture
{
	// TEAM ATTACK: a melee hit with two allies beside the attacker draws them in, by chance (some seeds yes, some no)
	let joined = 0, plain = 0, comboUp = true;
	for (let i = 0; i < 40; i++) {
		const S = B.newBattle('team' + i, { map: flat(), player: [fig('machamp', 60, ['karatechop']), fig('primeape', 60, ['karatechop'], 'pa'), fig('hitmonlee', 60, ['doublekick'], 'hl')],
			enemy: [{ fig: fig('snorlax', 90, ['tackle'], 'snt'), x: 3, y: 3 }] }, data);
		const [a1, a2, a3] = S.units.filter((u) => u.side === 'p');
		[[a1, 3, 4], [a2, 2, 4], [a3, 4, 4]].forEach(([u, x, y]) => { u.x = x; u.y = y; });
		S.units[3].boosts.eva = -6;
		A(i || B.teamChance(S, a1, S.units[3], data).length === 2, 'teamChance lists the adjacent allies whose moves reach the target');
		B.act(S, { t: 'attack', uid: a1.uid, move: 'karatechop', x: 3, y: 3 }, data); B.act(S, { t: 'execute' }, data);
		const team = S.log.filter((e) => e.t === 'team');
		if (team.length) { joined++; const hits = S.log.filter((e) => e.t === 'hit'); if (!(hits[hits.length - 1].combo >= 1)) comboUp = false; } else plain++;
	}
	A(joined > 0 && plain > 0, `team attacks happen by chance (${joined} of 40 with a joiner, ${plain} without)`);
	A(comboUp, "a joiner's hit counts toward the combo");
	// LIFT & THROW: Machamp throws Pikachu 2 tiles; Pikachu can still act; Pikachu can't lift
	const S = B.newBattle('throw', { map: flat(), player: [fig('machamp', 50, ['karatechop']), fig('pikachu', 50, ['thunderbolt'])], enemy: [{ fig: fig('rattata', 5, ['tackle'], 'rt'), x: 6, y: 0 }] }, data);
	const [mc, pk] = S.units.filter((u) => u.side === 'p');
	mc.x = 3; mc.y = 5; pk.x = 3; pk.y = 4;
	A(!B.act(S, { t: 'throw', uid: pk.uid, from: { x: 3, y: 5 }, x: 3, y: 6 }, data).ok, "a Pokémon that can't lift can't throw");
	A(!B.act(S, { t: 'throw', uid: mc.uid, from: { x: 3, y: 4 }, x: 3, y: 0 }, data).ok, 'beyond its throw range is refused', mc.throw);
	A(B.act(S, { t: 'throw', uid: mc.uid, from: { x: 3, y: 4 }, x: 3, y: 2 }, data).ok && pk.y === 2 && mc.acted, 'Machamp lifts and throws Pikachu 2 tiles (its action)');
	A(!pk.acted && B.act(S, { t: 'attack', uid: pk.uid, move: 'thunderbolt', x: 3, y: 0 }, data).why !== 'already acted', 'a thrown ally can still act');
	// CAPTURE: a weakened foe thrown onto the base tile; the catch formula's odds; success adds a figurine and can win
	let caught = 0, broke = 0, wonBy = 0;
	for (let i = 0; i < 40; i++) {
		const T = B.newBattle('cap' + i, { map: flat(), player: [fig('machamp', 50, ['karatechop'])], enemy: [{ fig: fig('caterpie', 10, ['tackle'], 'ct'), x: 1, y: 4 }] }, data);
		const u = T.units[0], v = T.units[1];
		u.x = 1; u.y = 5; v.hp = 1;
		const odds = B.captureOdds(v, data);
		if (i === 0) A(odds > 0.9 && B.captureOdds({ ...v, hp: v.maxHP }, data) < odds, 'capture odds rise as its HP falls (Caterpie at 1 HP: ' + odds.toFixed(2) + ')');
		const r = B.act(T, { t: 'throw', uid: u.uid, from: { x: 1, y: 4 }, x: 1, y: 6 }, data);
		const c = T.log.find((e) => e.t === 'capture');
		if (r.ok && c && c.ok) { caught++; if (T.over === 'won' && B.results(T).captured.length === 1 && B.results(T).captured[0].species === 'caterpie') wonBy++; }
		else if (c) broke++;
	}
	A(caught > 30 && wonBy === caught, `a weakened Caterpie is usually caught (${caught}/40), the figurine is the player's, and catching the last foe wins`);
	// a tough one at full HP mostly breaks free, lands beside the base, angrier
	const T = B.newBattle('capfail', { map: flat(), player: [fig('machamp', 50, ['karatechop'])], enemy: [{ fig: fig('snorlax', 50, ['tackle'], 'sx'), x: 1, y: 4 }] }, data);
	T.units[0].x = 1; T.units[0].y = 5;
	B.act(T, { t: 'throw', uid: T.units[0].uid, from: { x: 1, y: 4 }, x: 1, y: 6 }, data);
	const cf = T.log.find((e) => e.t === 'capture');
	A(cf && (cf.ok || (T.units[1].boosts.atk === 1 && !(T.units[1].x === 1 && T.units[1].y === 6))), 'breaking free: it lands beside the base with +1 Attack', JSON.stringify(cf));
}

// ---- replays: seed + actions -> the same battle
{
	const acts = (S) => { const out = []; const rng = makeRng('acts'); return { out, rng }; };
	const play = (seed) => {
		const S = B.newBattle(seed, setup(), data), log = [];
		const doA = (a) => { log.push(a); B.act(S, a, data); };
		for (const u of S.units.filter((x) => x.side === 'p')) { doA({ t: 'deploy', uid: u.uid }); doA({ t: 'move', uid: u.uid, x: u.uid.endsWith('0') ? 1 : 2, y: 4 }); }
		doA({ t: 'attack', uid: 'p0', move: 'karatechop', x: 1, y: 3 }); doA({ t: 'attack', uid: 'p1', move: 'thunderbolt', x: 2, y: 3 });
		for (let i = 0; i < 5; i++) doA({ t: 'end' });
		return { S, log };
	};
	const a = play('same'), b = play('same');
	A(JSON.stringify(a.S) === JSON.stringify(b.S), 'the same seed and actions give the same battle, exactly');
	const r = B.replay('same', setup(), a.log, data);
	A(JSON.stringify(r) === JSON.stringify(a.S), 'replay(seed, setup, actions) rebuilds it exactly (replays, spectating, resume)');
	A(JSON.stringify(JSON.parse(JSON.stringify(a.S))) === JSON.stringify(a.S), 'the state is plain JSON (it saves and resumes)');
}

// ---- fuzz: random legal play keeps every invariant
{
	const SPECIES = ['machamp', 'pikachu', 'geodude', 'pidgeotto', 'gengar', 'snorlax', 'alakazam', 'gyarados', 'charizard', 'bulbasaur', 'eevee', 'onix'];
	let games = 0, ended = 0, broke = [];
	for (let gidx = 0; gidx < 60; gidx++) {
		const rng = makeRng('fuzz' + gidx), pick = (l) => l[rng.int(l.length)];
		const map = flat(9, 9); for (let i = 0; i < 81; i++) map.height[i] = rng.int(4) === 0 ? rng.int(4) : 0; map.height[7 * 9 + 1] = 0;
		const mkF = (k) => makeFigurine(pick(SPECIES), 5 + rng.int(200), makeRng('f' + gidx + k), data);
		const S = B.newBattle('fz' + gidx, { map, player: [mkF('a'), mkF('b'), mkF('c')], enemy: [0, 1, 2].map((k) => ({ fig: mkF('e' + k), x: 1 + 3 * k, y: rng.int(3), ai: pick(['aggro', 'aggro', 'passive', 'hold']) })) }, data);
		try {
			for (let step = 0; step < 300 && !S.over; step++) {
				const mine = S.units.filter((u) => u.side === 'p' && u.hp > 0);
				const u = pick(mine), r = rng.int(10);
				if (u.x == null) B.act(S, { t: 'deploy', uid: u.uid }, data);
				else if (r < 3) { const t = [...B.moveTiles(S, u).values()]; const d = pick(t); if (d) B.act(S, { t: 'move', uid: u.uid, x: d.x, y: d.y }, data); }
				else if (r < 6) { const mid = pick(u.fig.equipped); const m = B.moveOf(u, mid, data); if (m) { const aims = B.aimTiles(S, u, m); const at = pick(aims); if (at) B.act(S, { t: 'attack', uid: u.uid, move: mid, x: at[0], y: at[1] }, data); } }
				else if (r < 7) { if (rng.int(2)) B.act(S, { t: 'undo', uid: u.uid }, data); else { const nb = S.units.find((o) => o.hp > 0 && o !== u && o.x != null && Math.abs(o.x - u.x) + Math.abs(o.y - u.y) === 1); if (nb) B.act(S, { t: 'throw', uid: u.uid, from: { x: nb.x, y: nb.y }, x: u.x + rng.int(5) - 2, y: u.y + rng.int(5) - 2 }, data); } }
				else if (r < 8) B.act(S, { t: 'execute' }, data);
				else B.act(S, { t: 'end' }, data);
				// invariants
				const live = S.units.filter((x) => x.hp > 0 && x.x != null);
				const spots = new Set(live.map((x) => x.x + ',' + x.y));
				if (spots.size !== live.length) broke.push(`g${gidx} s${step}: two units on one tile`);
				for (const x of S.units) {
					if (x.hp < 0 || x.hp > x.maxHP || x.sp < 0 || Object.values(x.pp).some((p) => p < 0)) broke.push(`g${gidx}: ${x.uid} hp/sp/pp out of range`);
					if (x.hp > 0 && x.x != null && !G.isTile(map, x.x, x.y)) broke.push(`g${gidx}: ${x.uid} off the map`);
				}
				if (S.units.filter((x) => x.side === 'p' && x.hp > 0 && x.x != null).length > B.MAX_DEPLOYED) broke.push(`g${gidx}: more than 6 deployed`);
				if (broke.length) break;
			}
		} catch (e) { broke.push(`g${gidx}: threw ${e.message}`); }
		games++; if (S.over) ended++;
		if (broke.length) break;
	}
	A(!broke.length, `random legal play keeps every invariant (${games} games)`, broke.slice(0, 3).join(' | '));
	A(ended > 0, `some of them reach a result (${ended}/${games})`);
}

// pure
for (const f of ['battle.js', 'grid.js', 'ai.js']) {
	const t = fs.readFileSync(path.join(ROOT, 'poketactica/js/engine', f), 'utf8').replace(/\/\/.*$/gm, '');
	A(!/\b(window|document|localStorage)\b|Math\.random/.test(t), `engine/${f} is pure (no DOM, storage or Math.random)`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
