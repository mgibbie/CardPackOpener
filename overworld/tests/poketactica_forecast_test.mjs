// poketactica_forecast_test.mjs — what the player is told BEFORE committing (owner, 2026-11-21, playability batch 2):
//   - the forecast (engine forecast()): each target's hit chance, damage range and KO, read without rolling anything;
//     every real hit (no critical) must land inside it, and the misses must come at about its rate
//   - the enemy range (engine threat()): every tile a foe really strikes in its phase is inside it
//   - a queued attack taken back (unqueue): PP and SP come back, the unit acts again; the Execute list reordered
//     (order): it resolves in the new order; both replay exactly from seed + actions
// Pure: node only.
//   node overworld/tests/poketactica_forecast_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as B from '../../poketactica/js/engine/battle.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { validRecipe, recipeOf, replayTo } from '../../poketactica/js/replay.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json') };
const flat = (w = 8, h = 8) => ({ w, h, height: Array(w * h).fill(0), base: { x: 1, y: h - 2 } });
const fig = (sp, lv, moves, seed = sp) => { let f = makeFigurine(sp, lv, makeRng(seed), data); f = { ...f, pool: [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))] }; return equip(f, moves); };

// ---- the forecast against real hits, over many seeds (single target, a spread move, a multi-hit move, a team attack)
{
	const cases = [
		{ name: 'Karate Chop (one target, melee)', atk: ['machamp', 30, ['karatechop']], move: 'karatechop', foes: [[2, 3]], aim: [2, 3], at: [2, 4] },
		{ name: 'Earthquake (all around)', atk: ['machamp', 40, ['earthquake']], move: 'earthquake', foes: [[2, 3], [3, 4]], aim: null, at: [2, 4] },
		{ name: 'Double Kick (two hits)', atk: ['machamp', 30, ['doublekick']], move: 'doublekick', foes: [[2, 3]], aim: [2, 3], at: [2, 4] },
		{ name: 'Thunderbolt (ranged, from higher ground)', atk: ['pikachu', 35, ['thunderbolt']], move: 'thunderbolt', foes: [[2, 1]], aim: [2, 1], at: [2, 4], high: true, foe: 'rattata' },
		{ name: 'Dynamic Punch (50% accurate)', atk: ['machamp', 30, ['dynamicpunch']], move: 'dynamicpunch', foes: [[2, 3]], aim: [2, 3], at: [2, 4] },
		{ name: 'Cross Chop (80% accurate)', atk: ['machamp', 30, ['crosschop']], move: 'crosschop', foes: [[2, 3]], aim: [2, 3], at: [2, 4] },
	];
	for (const c of cases) {
		let inside = 0, out = [], hits = 0, tries = 0, missChance = 0, koSaid = { yes: 0, yesKo: 0 };
		for (let i = 0; i < 160; i++) {
			const map = flat(); if (c.high) map.height[4 * 8 + 2] = 2;
			const enemy = c.foes.map(([x, y], k) => ({ fig: fig(c.foe || 'geodude', 18 + (i % 9), ['tackle'], 'g' + k + i), x, y, ai: 'hold' }));
			const S = B.newBattle('fc' + c.move + i, { map, player: [fig(...c.atk)], enemy }, data);
			const u = S.units[0];
			B.act(S, { t: 'deploy', uid: u.uid }, data); B.act(S, { t: 'move', uid: u.uid, x: c.at[0], y: c.at[1] }, data);
			const m = B.moveOf(u, c.move, data), aim = c.aim || B.aimTiles(S, u, m)[0];
			const f = B.forecast(S, u, c.move, aim[0], aim[1], data);
			if (!f || !f.targets.length) { out.push('no forecast'); continue; }
			const r = B.act(S, { t: 'attack', uid: u.uid, move: c.move, x: aim[0], y: aim[1] }, data);
			if (!r.ok) { out.push('refused ' + r.why); continue; }
			const ev = B.act(S, { t: 'execute' }, data).events;
			for (const t of f.targets) {
				tries++; missChance += 1 - t.hit / 100;
				const h = ev.find((e) => e.t === 'hit' && e.target === t.uid && e.uid === u.uid);
				if (!h) continue;
				hits++;
				if (h.crit) continue;   // (a critical hit is the one thing the forecast leaves out)
				if (h.dmg >= t.min && h.dmg <= t.max) inside++; else out.push(`${h.dmg} not in ${t.min}-${t.max}`);
				if (t.ko === 'yes') { koSaid.yes++; if (h.hp === 0) koSaid.yesKo++; }
			}
		}
		A(out.length === 0 && inside > 20, `${c.name}: every non-critical hit lands inside the forecast's range (${inside} hits)`, out.slice(0, 5).join(' | '));
		const missRate = 1 - hits / tries, expect = missChance / tries;
		A(Math.abs(missRate - expect) < 0.08, `${c.name}: the misses come at the forecast's rate (${(missRate * 100).toFixed(0)}% vs ${(expect * 100).toFixed(0)}%)`);
		A(koSaid.yes === koSaid.yesKo, `${c.name}: a forecast "KO" always knocks out when it lands`, koSaid);
	}
}
// facing and height show in the forecast: from behind a foe hits more often; from higher ground hits harder
{
	const S = B.newBattle('face', { map: flat(), player: [fig('machamp', 30, ['dynamicpunch'])], enemy: [{ fig: fig('geodude', 60, ['tackle']), x: 3, y: 3, ai: 'hold' }] }, data);
	const u = S.units[0], v = S.units[1];
	B.act(S, { t: 'deploy', uid: u.uid }, data); B.act(S, { t: 'move', uid: u.uid, x: 3, y: 4 }, data);
	v.facing = 's'; const front = B.forecast(S, u, 'dynamicpunch', 3, 3, data).targets[0];
	v.facing = 'n'; const back = B.forecast(S, u, 'dynamicpunch', 3, 3, data).targets[0];
	A(front.face === 'front' && back.face === 'back' && back.hit > front.hit, 'the forecast reads facing: from behind, a better chance to hit', [front.hit, back.hit]);
	const S2 = B.newBattle('height', { map: (() => { const m = flat(); m.height[4 * 8 + 3] = 2; return m; })(), player: [fig('machamp', 30, ['dynamicpunch'])], enemy: [{ fig: fig('geodude', 60, ['tackle']), x: 3, y: 3, ai: 'hold' }] }, data);
	const u2 = S2.units[0]; B.act(S2, { t: 'deploy', uid: u2.uid }, data); B.act(S2, { t: 'move', uid: u2.uid, x: 3, y: 4 }, data);
	S2.units[1].facing = 's';
	const hi = B.forecast(S2, u2, 'dynamicpunch', 3, 3, data).targets[0];
	A(hi.max > front.max, 'the forecast reads height: from higher ground, more damage', [front.max, hi.max]);
	const st = B.forecast(S, u, 'dynamicpunch', 3, 3, data);
	A(st.targets.length === 1 && st.targets[0].uid === v.uid && st.targets[0].side === 'e' && st.targets[0].hp === v.hp, 'a target carries its uid, side and HP');
	// a type immunity: Thunderbolt into a Ground type
	const S3 = B.newBattle('imm', { map: flat(), player: [fig('pikachu', 30, ['thunderbolt'])], enemy: [{ fig: fig('geodude', 25, ['tackle']), x: 3, y: 2, ai: 'hold' }] }, data);
	const u3 = S3.units[0]; B.act(S3, { t: 'deploy', uid: u3.uid }, data); B.act(S3, { t: 'move', uid: u3.uid, x: 3, y: 5 }, data);
	const im = B.forecast(S3, u3, 'thunderbolt', 3, 2, data);
	A(im && im.targets[0] && im.targets[0].hit === 0 && im.targets[0].immune, 'an immune target: 0% and why', im && im.targets[0]);
}

// ---- the enemy range: every tile a foe strikes is inside its threat
{
	let checked = 0; const bad = [];
	for (let i = 0; i < 60; i++) {
		const S = B.newBattle('thr' + i, { map: flat(10, 10), player: [fig('machamp', 20, ['karatechop'], 'mc' + i), fig('pikachu', 20, ['thundershock'], 'pk' + i)],
			enemy: [{ fig: fig('rattata', 14 + (i % 6), ['tackle', 'quickattack'], 'r' + i), x: 2 + (i % 5), y: 1 }, { fig: fig('spearow', 14, ['peck'], 's' + i), x: 7, y: 2 }] }, data);
		const [mc, pk] = S.units.filter((u) => u.side === 'p');
		B.act(S, { t: 'deploy', uid: mc.uid }, data); B.act(S, { t: 'move', uid: mc.uid, x: 2 + (i % 4), y: 5 }, data);
		B.act(S, { t: 'deploy', uid: pk.uid }, data); B.act(S, { t: 'move', uid: pk.uid, x: 5, y: 6 }, data);
		const th = Object.fromEntries(B.onMap(S, 'e').map((e) => [e.uid, B.threat(S, e, data)]));
		const ev = B.act(S, { t: 'end' }, data).events;
		for (const h of ev.filter((e) => e.t === 'hit' && e.uid[0] === 'e')) {
			const v = B.unit(S, h.target), t = th[h.uid];
			checked++;
			// (the foe's victim stood where it was hit: the player's units don't move in the enemy phase)
			if (!t.attack.some(([x, y]) => x === v.x && y === v.y)) bad.push(h.uid + ' hit ' + v.x + ',' + v.y);
		}
		for (const mv of ev.filter((e) => e.t === 'move' && e.uid[0] === 'e')) { const end = mv.path[mv.path.length - 1]; if (!th[mv.uid].move.some(([x, y]) => x === end[0] && y === end[1])) bad.push(mv.uid + ' moved off its range'); }
	}
	A(checked > 5 && !bad.length, `the enemy range holds every tile the foes reach and strike (${checked} hits)`, bad.slice(0, 5).join(' | '));
	const S = B.newBattle('hold', { map: flat(), player: [fig('machamp', 20, ['karatechop'])], enemy: [{ fig: fig('rattata', 14, ['tackle']), x: 4, y: 2, ai: 'hold' }] }, data);
	const t = B.threat(S, S.units[1], data);
	A(t.move.length === 1 && t.attack.length === 4 && t.attack.every(([x, y]) => Math.abs(x - 4) + Math.abs(y - 2) === 1), "a 'hold' foe: its own tile, and Tackle's reach around it", t);
}

// ---- unqueue and order
{
	const setup = () => ({ map: flat(), player: [fig('machamp', 30, ['karatechop'], 'm'), fig('pikachu', 30, ['thundershock'], 'p')],
		enemy: [{ fig: fig('geodude', 40, ['tackle'], 'g'), x: 2, y: 3, ai: 'hold' }] });
	const S = B.newBattle('uq', setup(), data), acts = [];
	const go = (a) => { const r = B.act(S, a, data); if (r.ok) acts.push(a); return r; };
	const [mc, pk] = S.units.filter((u) => u.side === 'p');
	go({ t: 'deploy', uid: mc.uid }); go({ t: 'move', uid: mc.uid, x: 2, y: 4 });
	go({ t: 'deploy', uid: pk.uid }); go({ t: 'move', uid: pk.uid, x: 3, y: 3 });
	const pp0 = mc.pp.karatechop, sp0 = mc.sp;
	go({ t: 'attack', uid: mc.uid, move: 'karatechop', x: 2, y: 3 });
	A(mc.acted && mc.pp.karatechop === pp0 - 1 && mc.sp < sp0 && S.queue.length === 1, 'queued: it has acted, PP and SP spent');
	const r = go({ t: 'unqueue', uid: mc.uid });
	A(r.ok && !mc.acted && mc.pp.karatechop === pp0 && mc.sp === sp0 && !S.queue.length && r.events.some((e) => e.t === 'unqueue'), 'unqueue: PP and SP back, it can act again, the queue is empty');
	A(B.act(S, { t: 'unqueue', uid: mc.uid }, data).why === 'nothing queued', 'unqueue with nothing queued is refused');
	A(mc.moved && go({ t: 'undo', uid: mc.uid }).ok && go({ t: 'move', uid: mc.uid, x: 2, y: 4 }).ok, 'taken back, its move can be undone again too');
	go({ t: 'attack', uid: mc.uid, move: 'karatechop', x: 2, y: 3 }); go({ t: 'attack', uid: pk.uid, move: 'thundershock', x: 2, y: 3 });
	A(B.act(S, { t: 'order', uids: [pk.uid] }, data).why === 'not the queue' && B.act(S, { t: 'order', uids: [pk.uid, pk.uid] }, data).why === 'not the queue', 'an order that is not the whole queue is refused');
	A(go({ t: 'order', uids: [pk.uid, mc.uid] }).ok && S.queue[0].uid === pk.uid, 'order: the Execute list in the new order');
	const ev = go({ t: 'execute' }).events.filter((e) => e.t === 'use');
	A(ev.length === 2 && ev[0].uid === pk.uid && ev[1].uid === mc.uid, 'Execute resolves in the new order', ev.map((e) => e.uid));
	const rec = recipeOf('uq', setup(), acts);
	A(validRecipe(rec), 'a recipe with unqueue and order is a valid replay');
	A(JSON.stringify(B.view(replayTo(rec, acts.length, data))) === JSON.stringify(B.view(S)), 'and it replays to the same board');
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
