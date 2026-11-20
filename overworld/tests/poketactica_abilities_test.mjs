// poketactica_abilities_test.mjs — statuses and abilities on the grid (stage 3d): sleep / freeze / paralysis / confusion
// as in Pokémon (paralysis also costs a tile of Move), and the field abilities with their areas from
// poketactica/data/ability_shapes.json: landing (Intimidate, weather, Surges), always-on (Pressure, Friend Guard, Damp,
// the trapping abilities), pull (Lightning Rod), contact (Static, Rough Skin). Pure: node only.
//   node overworld/tests/poketactica_abilities_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import * as B from '../../poketactica/js/engine/battle.js';
import * as Geo from '../../poketactica/js/engine/geo.js';
import { makeFigurine, equip } from '../../poketactica/js/figurine.js';
import { makeRng } from '../rules/rng.js';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + extra : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
const fig = (sp, lv, moves, ability, seed = sp) => { let f = makeFigurine(sp, lv, makeRng(seed), data); f = { ...f, pool: [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))] }; f = equip(f, moves); return ability !== undefined ? { ...f, ability } : f; };
const flat = (w = 8, h = 8) => ({ w, h, height: Array(w * h).fill(0), base: { x: 1, y: h - 2 } });
const at = (u, x, y) => { u.x = x; u.y = y; };

// ---- landing abilities
{
	const S = B.newBattle('int', { map: flat(), player: [fig('gyarados', 50, ['bite'], 'intimidate')], enemy: [{ fig: fig('rattata', 30, ['tackle'], null, 'a'), x: 1, y: 4 }, { fig: fig('rattata', 30, ['tackle'], null, 'b'), x: 6, y: 0 }] }, data);
	B.act(S, { t: 'deploy', uid: S.units[0].uid }, data);
	A(S.units[1].boosts.atk === -1 && S.units[2].boosts.atk === 0, 'Intimidate on landing: foes within 2 lose Attack, a far one doesn\'t', JSON.stringify([S.units[1].boosts.atk, S.units[2].boosts.atk]));
	const T = B.newBattle('dro', { map: flat(), player: [fig('pikachu', 50, ['thunderbolt'])], enemy: [{ fig: fig('vulpix', 40, ['ember'], 'drought', 'v'), x: 3, y: 2 }] }, data);
	A(T.field.weather && T.field.weather.kind === 'sun', 'a foe with Drought brings sun from the start');
	const P = B.newBattle('srg', { map: flat(), player: [fig('pikachu', 50, ['thunderbolt'], 'electricsurge')], enemy: [{ fig: fig('rattata', 30, ['tackle'], null, 'c'), x: 6, y: 0 }] }, data);
	B.act(P, { t: 'deploy', uid: P.units[0].uid }, data);
	A(Geo.colorAt(P, 1, 6) === 'yellow' && Geo.colorAt(P, 1, 4) === 'yellow' && Geo.colorAt(P, 1, 3) !== 'yellow', 'Electric Surge paints yellow around it (radius 2) when it lands');
}

// ---- always-on: Pressure, Friend Guard, the trapping abilities, Damp
{
	const S = B.newBattle('prs', { map: flat(), player: [fig('pikachu', 50, ['thunderbolt'])], enemy: [{ fig: fig('articuno', 50, ['peck'], 'pressure', 'ar'), x: 3, y: 3 }] }, data);
	const u = S.units[0]; at(u, 3, 5);
	const sp0 = u.sp, cost = B.moveOf(u, 'thunderbolt', data).spCost;
	B.act(S, { t: 'attack', uid: u.uid, move: 'thunderbolt', x: 3, y: 3 }, data);
	A(sp0 - u.sp === cost + 1, 'Pressure: a foe within 2 pays +1 SP', JSON.stringify([cost, sp0 - u.sp]));
	const dmg = (guard) => {
		const T = B.newBattle('fg', { map: flat(), player: [fig('machamp', 60, ['karatechop'])], enemy: [{ fig: fig('snorlax', 80, ['tackle'], null, 'sn'), x: 3, y: 3 }, { fig: fig('clefairy', 40, ['pound'], guard ? 'friendguard' : null, 'cf'), x: 4, y: 3 }] }, data);
		at(T.units[0], 3, 4); T.units[0].boosts.acc = 6; T.units[1].boosts.eva = -6;
		B.act(T, { t: 'attack', uid: T.units[0].uid, move: 'karatechop', x: 3, y: 3 }, data); B.act(T, { t: 'execute' }, data);
		return (T.log.find((e) => e.t === 'hit') || {}).dmg || 0;
	};
	A(dmg(true) < dmg(false), 'Friend Guard: an ally beside the target softens the hit', JSON.stringify([dmg(false), dmg(true)]));
	const T = B.newBattle('trap', { map: flat(), player: [fig('pikachu', 50, ['thunderbolt'])], enemy: [{ fig: fig('dugtrio', 50, ['dig'], 'arenatrap', 'dg'), x: 3, y: 3 }] }, data);
	at(T.units[0], 3, 4);
	const far = Math.max(...[...B.moveTiles(T, T.units[0]).values()].map((t) => t.d));
	A(far === 1, 'Arena Trap: a grounded foe next to it can only move 1 tile', far);
	const D = B.newBattle('damp', { map: flat(), player: [fig('geodude', 50, ['selfdestruct'])], enemy: [{ fig: fig('psyduck', 40, ['scratch'], 'damp', 'pd'), x: 3, y: 2 }] }, data);
	at(D.units[0], 3, 4);
	B.act(D, { t: 'attack', uid: D.units[0].uid, move: 'selfdestruct', x: 3, y: 4 }, data); B.act(D, { t: 'execute' }, data);
	A(D.log.some((e) => e.t === 'blocked' && e.by === 'damp') && D.units[0].hp === D.units[0].maxHP, 'Damp within 3: no one can explode');
}

// ---- pull and contact
{
	const S = B.newBattle('rod', { map: flat(), player: [fig('pikachu', 50, ['thunderbolt'])], enemy: [{ fig: fig('rattata', 30, ['tackle'], null, 'rr'), x: 3, y: 2 }, { fig: fig('raichu', 40, ['spark'], 'lightningrod', 'rc'), x: 4, y: 2 }] }, data);
	at(S.units[0], 3, 4);
	B.act(S, { t: 'attack', uid: S.units[0].uid, move: 'thunderbolt', x: 3, y: 2 }, data); B.act(S, { t: 'execute' }, data);
	A(S.log.some((e) => e.t === 'pulled' && e.uid === S.units[2].uid) && S.units[1].hp === S.units[1].maxHP, 'Lightning Rod pulls a Thunderbolt aimed beside it (and the target is spared)');
	let paralysed = 0, chipped = 0;
	for (let i = 0; i < 30; i++) {
		const T = B.newBattle('st' + i, { map: flat(), player: [fig('machamp', 60, ['karatechop'])], enemy: [{ fig: fig('pikachu', 60, ['thundershock'], 'static', 'ps' + i), x: 3, y: 3, ai: 'hold' }] }, data);
		at(T.units[0], 3, 4); T.units[0].boosts.acc = 6; T.units[1].boosts.eva = -6; T.units[1].hp = T.units[1].maxHP = 9999;   // (it must survive the hit for Static to fire)
		B.act(T, { t: 'attack', uid: T.units[0].uid, move: 'karatechop', x: 3, y: 3 }, data); B.act(T, { t: 'execute' }, data);
		if (T.units[0].status === 'par') paralysed++;
	}
	A(paralysed > 3 && paralysed < 20, `Static: touching it paralyses about 30% of the time (${paralysed}/30)`);
	const R = B.newBattle('rs', { map: flat(), player: [fig('machamp', 60, ['karatechop'])], enemy: [{ fig: fig('garchomp', 60, ['tackle'], 'roughskin', 'gc'), x: 3, y: 3, ai: 'hold' }] }, data);
	at(R.units[0], 3, 4); R.units[0].boosts.acc = 6; R.units[1].boosts.eva = -6;
	B.act(R, { t: 'attack', uid: R.units[0].uid, move: 'karatechop', x: 3, y: 3 }, data); B.act(R, { t: 'execute' }, data);
	A(R.units[0].hp === R.units[0].maxHP - Math.floor(R.units[0].maxHP / 8), 'Rough Skin: a contact hit costs the attacker 1/8');
}

// ---- statuses
{
	const mk = (st, seed) => { const S = B.newBattle(seed, { map: flat(), player: [fig('machamp', 60, ['karatechop'])], enemy: [{ fig: fig('snorlax', 90, ['tackle'], null, 'sl'), x: 3, y: 3, ai: 'hold' }] }, data); at(S.units[0], 3, 4); S.units[0].status = st; S.units[0].sleepTurns = 3; S.units[0].boosts.acc = 6; return S; };
	const S = mk('slp', 'sleep');
	B.act(S, { t: 'attack', uid: S.units[0].uid, move: 'karatechop', x: 3, y: 3 }, data); B.act(S, { t: 'execute' }, data);
	A(S.log.some((e) => e.t === 'asleep') && !S.log.some((e) => e.t === 'hit'), 'asleep: its action does nothing');
	const P = mk('par', 'par');
	const far = Math.max(...[...B.moveTiles(P, P.units[0]).values()].map((t) => t.d));
	A(far === P.units[0].move - 1, 'paralysis costs a tile of Move', JSON.stringify([P.units[0].move, far]));
	let fullPar = 0, frozenSkip = 0, selfHit = 0;
	for (let i = 0; i < 40; i++) {
		const T = mk('par', 'p' + i); B.act(T, { t: 'attack', uid: T.units[0].uid, move: 'karatechop', x: 3, y: 3 }, data); B.act(T, { t: 'execute' }, data); if (T.log.some((e) => e.t === 'paralysed')) fullPar++;
		const F = mk('frz', 'f' + i); B.act(F, { t: 'attack', uid: F.units[0].uid, move: 'karatechop', x: 3, y: 3 }, data); B.act(F, { t: 'execute' }, data); if (F.log.some((e) => e.t === 'frozen')) frozenSkip++;
		const C = mk(null, 'c' + i); C.units[0].confused = 3; B.act(C, { t: 'attack', uid: C.units[0].uid, move: 'karatechop', x: 3, y: 3 }, data); B.act(C, { t: 'execute' }, data); if (C.log.some((e) => e.t === 'confused-hit')) selfHit++;
	}
	A(fullPar > 3 && fullPar < 20, `fully paralysed about 25% of the time (${fullPar}/40)`);
	A(frozenSkip > 25, `frozen: it mostly can't act; 20% thaw (${frozenSkip}/40 stuck)`);
	A(selfHit > 5 && selfHit < 25, `confused: it hurts itself about a third of the time (${selfHit}/40)`);
}

// determinism with abilities
{
	const play = () => { const S = B.newBattle('d', { map: flat(), player: [fig('gyarados', 50, ['bite'], 'intimidate'), fig('pikachu', 50, ['thunderbolt'], 'static')], enemy: [{ fig: fig('vulpix', 40, ['ember'], 'drought', 'vv'), x: 2, y: 3 }] }, data);
		for (const u of S.units.filter((x) => x.side === 'p')) { B.act(S, { t: 'deploy', uid: u.uid }, data); B.act(S, { t: 'move', uid: u.uid, x: u.uid === 'p0' ? 1 : 2, y: 4 }, data); }
		for (let i = 0; i < 4; i++) B.act(S, { t: 'end' }, data); return JSON.stringify(S); };
	A(play() === play(), 'battles with abilities replay exactly');
}
const t = fs.readFileSync(path.join(ROOT, 'poketactica/js/engine/abilities.js'), 'utf8').replace(/\/\/.*$/gm, '');
A(!/\b(window|document|localStorage)\b|Math\.random/.test(t), 'engine/abilities.js is pure');

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
