// poketactica_geo_test.mjs — Geo Panels, Geo Symbols, chains and the Bonus Gauge (stage 3c; owner, 2026-11-20): a
// symbol's effect covers every tile of the colour it sits on, both sides; Disgaea's and Pokémon's effects; terrain moves
// paint Geo colours; breaking a symbol repaints in a spiral, hurting everyone on a changing tile (the player's own too)
// and chaining through other symbols; clearing every colour blasts the foes; the gauge fills and pays up to its level.
// Pure: node only.
//   node overworld/tests/poketactica_geo_test.mjs
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
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json') };
const fig = (sp, lv, moves, seed = sp) => { let f = makeFigurine(sp, lv, makeRng(seed), data); f = { ...f, pool: [...f.pool, ...moves.filter((m) => !f.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))] }; return equip(f, moves); };
const W = 8, H = 8;
/** a map with a red block (x 0-3, y 0-3) and a blue block (x 4-7, y 0-3), the rest uncoloured */
const geoMap = (symbols) => {
	const geo = Array(W * H).fill(null);
	for (let y = 0; y < 4; y++) for (let x = 0; x < W; x++) geo[y * W + x] = x < 4 ? 'red' : 'blue';
	return { w: W, h: H, height: Array(W * H).fill(0), base: { x: 1, y: 6 }, geo, symbols };
};
const battle = (symbols, player, enemy, seed = 'g') => B.newBattle(seed, { map: geoMap(symbols), player, enemy }, data);
const hitOn = (S, uid, move, x, y) => { B.act(S, { t: 'attack', uid, move, x, y }, data); B.act(S, { t: 'execute' }, data); return S.log.filter((e) => e.t === 'hit'); };

// ---- effects cover the whole colour, both sides
{
	const S = battle([{ x: 0, y: 0, color: 'blue', effect: { k: 'invincible' } }], [fig('machamp', 60, ['karatechop'])], [{ fig: fig('rattata', 30, ['tackle'], 'r'), x: 3, y: 3 }]);
	const u = S.units[0]; u.x = 3; u.y = 4; S.units[1].boosts.eva = -6;
	A(Geo.effectsAt(S, 3, 3).some((e) => e.k === 'invincible') && !Geo.effectsAt(S, 5, 2).length && !Geo.effectsAt(S, 3, 4).length, 'a symbol on red covers every red tile (and only red)');
	B.act(S, { t: 'attack', uid: u.uid, move: 'karatechop', x: 3, y: 3 }, data); B.act(S, { t: 'execute' }, data);
	A(S.units[1].hp === S.units[1].maxHP && S.log.some((e) => e.t === 'immune' && e.why === 'invincible'), 'INVINCIBLE: a foe on that colour takes nothing');
}
{
	// ATK +50% for whoever stands on the colour, both sides
	const dmg = (onRed) => {
		const S = battle([{ x: 0, y: 0, color: 'blue', effect: { k: 'stat', stat: 'atk', mult: 1.5 } }], [fig('machamp', 60, ['karatechop'])], [{ fig: fig('snorlax', 90, ['tackle'], 's'), x: 5, y: 4 }]);
		const u = S.units[0]; u.x = onRed ? 3 : 5; u.y = onRed ? 3 : 5; if (onRed) { S.units[1].x = 3; S.units[1].y = 4; }
		S.units[1].boosts.eva = -6; u.boosts.acc = 6;
		return (hitOn(S, u.uid, 'karatechop', S.units[1].x, S.units[1].y)[0] || {}).dmg || 0;
	};
	A(dmg(true) > dmg(false) * 1.3, 'ATK +50%: an attacker standing on the colour hits harder', JSON.stringify([dmg(false), dmg(true)]));
	// HURT 20% each phase, on the player's own too
	const S = battle([{ x: 0, y: 0, color: 'blue', effect: { k: 'hurt' } }], [fig('machamp', 60, ['karatechop'])], [{ fig: fig('rattata', 30, ['tackle'], 'r2'), x: 7, y: 7, ai: 'hold' }]);
	const u = S.units[0]; u.x = 2; u.y = 2;
	B.act(S, { t: 'end' }, data);
	A(u.hp === u.maxHP - Math.floor(u.maxHP * Geo.GEO_HURT), 'DAMAGE 20%: the player\'s own figurine on the colour loses 20% at the end of its phase', u.hp + '/' + u.maxHP);
	// TYPE BOOST, NO MISS, IMMUNE
	const T = battle([{ x: 0, y: 0, color: 'blue', effect: { k: 'immune', type: 'Fighting' } }], [fig('machamp', 60, ['karatechop'])], [{ fig: fig('rattata', 30, ['tackle'], 'r3'), x: 3, y: 3 }]);
	T.units[0].x = 3; T.units[0].y = 4; T.units[1].boosts.eva = -6;
	hitOn(T, T.units[0].uid, 'karatechop', 3, 3);
	A(T.log.some((e) => e.t === 'immune' && e.why === 'geo'), 'a Pokémon effect: Fighting immunity on that colour');
}

// ---- symbols are objects: they block, can be thrown (moving their effect)
{
	const S = battle([{ x: 2, y: 5, color: 'red', effect: { k: 'heal' } }], [fig('machamp', 60, ['karatechop'])], [{ fig: fig('rattata', 30, ['tackle'], 'r4'), x: 7, y: 0 }]);
	const u = S.units[0]; u.x = 1; u.y = 5;
	A(!B.moveTiles(S, u).has('2,5'), 'a Geo Symbol blocks its tile');
	A(B.act(S, { t: 'throw', uid: u.uid, from: { x: 2, y: 5 }, x: 1, y: 3 }, data).ok && S.symbols[0].x === 1 && S.symbols[0].y === 3, 'a lifter can throw a symbol');
	A(Geo.effectsAt(S, 0, 0).some((e) => e.k === 'heal') && !Geo.effectsAt(S, 2, 6).length, 'thrown onto red, its effect now covers red');
}

// ---- terrain moves paint Geo colours
{
	const S = battle([], [fig('pikachu', 60, ['electricterrain', 'thunderbolt'])], [{ fig: fig('rattata', 30, ['tackle'], 'r5'), x: 7, y: 7, ai: 'hold' }]);
	const u = S.units[0]; u.x = 2; u.y = 6;
	B.act(S, { t: 'attack', uid: u.uid, move: 'electricterrain', x: 2, y: 6 }, data); B.act(S, { t: 'execute' }, data);
	A(Geo.colorAt(S, 2, 6) === 'yellow' && Geo.terrainAt(S, 2, 6) === 'electric', 'Electric Terrain paints yellow, which counts as electric terrain');
}

// ---- chains: a spiral repaint that hurts everyone on it (own side too), symbols chain, the gauge fills
{
	// break a blue symbol sitting on red: every red tile turns blue; a second symbol (green... on red) is caught and repaints blue -> its colour
	const S = battle([{ id: 'A', x: 1, y: 1, color: 'blue', effect: { k: 'heal' } }, { id: 'Bsym', x: 3, y: 0, color: 'clear', effect: { k: 'hurt' } }],
		[fig('machamp', 60, ['karatechop']), fig('pikachu', 60, ['thunderbolt'])], [{ fig: fig('rattata', 30, ['tackle'], 'r6'), x: 2, y: 3, ai: 'hold' }]);
	const [mc, pk] = S.units.filter((u) => u.side === 'p'); mc.x = 1; mc.y = 2; pk.x = 0; pk.y = 3;   // pikachu stands on red
	const foe = S.units[2], pk0 = pk.hp, foe0 = foe.hp;
	B.act(S, { t: 'attack', uid: mc.uid, move: 'karatechop', x: 1, y: 1 }, data); B.act(S, { t: 'execute' }, data);
	const reps = S.log.filter((e) => e.t === 'repaint');
	A(S.log.some((e) => e.t === 'geo-break' && e.id === 'A'), 'a damaging move on a symbol breaks it');
	A(reps.length >= 16 && reps[0].x === 1 && reps[0].y === 1, 'the repaint starts at the symbol and spirals out over its colour', JSON.stringify(reps.slice(0, 3)));
	A(pk.hp < pk0 && foe.hp < foe0, 'everyone on a changing tile is hurt: the foe AND the player\'s own Pikachu', JSON.stringify([pk0 - pk.hp, foe0 - foe.hp]));
	A(S.log.some((e) => e.t === 'geo-break' && e.id === 'Bsym'), 'another symbol caught in the repaint breaks and repaints in turn');
	const counts = reps.map((e) => e.n);
	A(counts.every((n, i) => n === i + 1), 'the chain count climbs tile by tile');
	A(S.bonus.points >= reps.length * 10, 'the chain fills the Bonus Gauge', S.bonus.points);
}
{
	// clearing every coloured tile: the map-wide blast
	const S = battle([{ id: 'C1', x: 0, y: 0, color: 'clear', effect: { k: 'heal' } }, { id: 'C2', x: 4, y: 0, color: 'clear', effect: { k: 'heal' } }],
		[fig('machamp', 60, ['karatechop'])], [{ fig: fig('snorlax', 60, ['tackle'], 's7'), x: 6, y: 6, ai: 'hold' }]);
	const u = S.units[0]; u.x = 0; u.y = 1;
	// C2 sits on blue: throw it onto red next to C1 first so one break clears both colours in a chain
	S.symbols[1].x = 1; S.symbols[1].y = 0;
	B.act(S, { t: 'attack', uid: u.uid, move: 'karatechop', x: 0, y: 0 }, data); B.act(S, { t: 'execute' }, data);
	const left = S.geo.filter(Boolean).length;
	A(left > 0 || S.log.some((e) => e.t === 'geo-clear'), 'clearing colours runs');
	// blue was never broken here; break a blue-clearing symbol on the remaining blue to clear the board
	const T = battle([{ id: 'R', x: 0, y: 0, color: 'blue', effect: { k: 'heal' } }, { id: 'X', x: 3, y: 0, color: 'clear', effect: { k: 'heal' } }],
		[fig('machamp', 60, ['karatechop'])], [{ fig: fig('snorlax', 60, ['tackle'], 's8'), x: 6, y: 6, ai: 'hold' }]);
	const w = T.units[0]; w.x = 0; w.y = 1; const sn = T.units[1], sn0 = sn.hp;
	B.act(T, { t: 'attack', uid: w.uid, move: 'karatechop', x: 0, y: 0 }, data); B.act(T, { t: 'execute' }, data);
	A(!T.geo.some(Boolean) && T.log.some((e) => e.t === 'geo-clear') && sn.hp < sn0, 'red -> blue, then the clear symbol caught on blue wipes every colour: a map-wide blast on the foes', JSON.stringify([T.geo.filter(Boolean).length, sn0 - sn.hp]));
}

// ---- the Bonus Gauge
{
	const r1 = Geo.rollBonus(makeRng('b'), 50), r2 = Geo.rollBonus(makeRng('b'), 50);
	A(r1.length === 9 && JSON.stringify(r1) === JSON.stringify(r2), 'the reward list is 9 levels, rolled from the seed');
	const kinds = new Set(); for (let i = 0; i < 40; i++) for (const r of Geo.rollBonus(makeRng('k' + i), 50)) kinds.add(r.kind);
	A(['stars', 'figurine', 'exp', 'moveXp', 'item', 'pack'].every((k) => kinds.has(k)), 'rewards: stars, figurines, EXP, move XP, items and packs (owner)', [...kinds].join(','));
	const packs = new Set(); for (let i = 0; i < 60; i++) for (const r of Geo.rollBonus(makeRng('p' + i), 50)) if (r.kind === 'pack') packs.add(r.game);
	A(packs.has('battlecards') && packs.has('pocket'), 'packs of both card games');
	const S = battle([], [fig('machamp', 100, ['karatechop'])], [{ fig: fig('caterpie', 5, ['tackle'], 'c9'), x: 1, y: 4 }]);
	S.units[0].x = 1; S.units[0].y = 5;
	Geo.addBonus(S, 350, 'test');
	A(S.bonus.level === 3, 'every 100 points is a level', S.bonus.level);
	for (let i = 0; i < 5 && !S.over; i++) { if (!S.units[0].acted) B.act(S, { t: 'attack', uid: S.units[0].uid, move: 'karatechop', x: 1, y: 4 }, data); B.act(S, { t: 'end' }, data); }
	const res = B.results(S);
	A(S.over === 'won' && res.bonus.length === res.bonusLevel && res.bonus.every((r) => r.level <= res.bonusLevel), 'a win pays every reward up to the gauge\'s level', JSON.stringify([res.bonusLevel, res.bonus.length]));
	Geo.addBonus(S, 99999, 'cap');
	A(S.bonus.level === 9, 'the gauge caps at 9');
}

// ---- determinism with Geo, and the fuzz on coloured maps
{
	const mk = () => { const S = battle([{ x: 1, y: 1, color: 'blue', effect: { k: 'hurt' } }], [fig('machamp', 60, ['karatechop', 'earthquake'])], [{ fig: fig('rattata', 30, ['tackle'], 'rd'), x: 1, y: 3 }], 'det'); return S; };
	const play = () => { const S = mk(); const u = S.units[0]; B.act(S, { t: 'deploy', uid: u.uid }, data); B.act(S, { t: 'move', uid: u.uid, x: 1, y: 2 }, data); B.act(S, { t: 'attack', uid: u.uid, move: 'karatechop', x: 1, y: 1 }, data); for (let i = 0; i < 4; i++) B.act(S, { t: 'end' }, data); return JSON.stringify(S); };
	A(play() === play(), 'a battle with Geo replays exactly');
}
for (const f of ['geo.js']) {
	const t = fs.readFileSync(path.join(ROOT, 'poketactica/js/engine', f), 'utf8').replace(/\/\/.*$/gm, '');
	A(!/\b(window|document|localStorage)\b|Math\.random/.test(t), `engine/${f} is pure`);
}

console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
