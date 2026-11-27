// demo.js — the first playable map, "Training Grounds" (stage 4). A hand-built 12 x 10 board with ledges, a pillar, Geo
// colours and two Geo Symbols, a starting team of five figurines and four wild Pokémon. Stage 5 brings the player's own
// figurines (found in the overworld) and stage 6 the campaign's maps; until then this is what the page plays.
import { makeFigurine, equip } from './figurine.js';
import { makeRng } from '../../overworld/rules/rng.js';
import { effectiveness } from '../../overworld/rules/tables.js';

const W = 12, H = 10;
// heights: '.' 0, '1'..'4' levels, '#' no tile (a gap)
const HEIGHTS = [
	'....11....22',
	'....11...222',
	'..........2.',
	'.11....3....',
	'.11....3....',
	'.......3..1.',
	'..........1.',
	'....##......',
	'....##..11..',
	'........11..',
];
// Geo colours: r red, b blue, p purple, . none
const GEO = [
	'rrrr........',
	'rrrr....bbbb',
	'rr......bbbb',
	'........bbbb',
	'..pp........',
	'..pp........',
	'............',
	'............',
	'.....bb.....',
	'.....bb.....',
];
const COLOR = { r: 'red', b: 'blue', p: 'purple' };

export function demoMap() {
	const height = [], geo = [];
	for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
		const c = HEIGHTS[y][x];
		height.push(c === '#' ? null : c === '.' ? 0 : Number(c));
		geo.push(COLOR[GEO[y][x]] || null);
	}
	return {
		name: 'Training Grounds', w: W, h: H, height, geo, base: { x: 1, y: 8 },
		symbols: [
			{ id: 'atk', x: 2, y: 1, color: 'blue', effect: { k: 'stat', stat: 'atk', mult: 1.5 } },   // ATK +50% on red; breaks red into blue
			{ id: 'inv', x: 10, y: 2, color: 'clear', effect: { k: 'invincible' } },                     // Invincible on blue; breaking it clears blue
		],
	};
}

/** The starting team (until the player's own figurines arrive in stage 5) and the wild Pokémon. */
export function demoSetup(data, seed = 'training') {
	const f = (sp, lv, moves, k) => {
		let x = makeFigurine(sp, lv, makeRng(seed + ':' + k), data);
		const pool = [...x.pool, ...moves.filter((m) => !x.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))];
		return equip({ ...x, pool }, moves);
	};
	return {
		map: demoMap(),
		player: [
			f('pikachu', 30, ['thunderbolt', 'quickattack', 'thunderwave', 'electricterrain'], 'p1'),
			f('machamp', 30, ['karatechop', 'rockslide', 'bulkup', 'earthquake'], 'p2'),
			f('charmander', 30, ['ember', 'flamethrower', 'scratch', 'smokescreen'], 'p3'),
			f('squirtle', 30, ['watergun', 'bubblebeam', 'tackle', 'withdraw'], 'p4'),
			f('bulbasaur', 30, ['vinewhip', 'razorleaf', 'sleeppowder', 'leechseed'], 'p5'),
		],
		enemy: [
			{ fig: f('rattata', 26, ['tackle', 'quickattack', 'tailwhip', 'bite'], 'e1'), x: 3, y: 2, ai: 'aggro' },
			{ fig: f('spearow', 26, ['peck', 'growl', 'furyattack', 'aerialace'], 'e2'), x: 6, y: 1, ai: 'aggro' },
			{ fig: f('geodude', 28, ['tackle', 'rockthrow', 'defensecurl', 'magnitude'], 'e3'), x: 9, y: 1, ai: 'passive' },
			{ fig: f('oddish', 26, ['absorb', 'acid', 'poisonpowder', 'stunspore'], 'e4'), x: 10, y: 6, ai: 'passive' },
		],
	};
}

// ---------- stage 5: the player's own team against Training Grounds' wild Pokémon at the team's level
export const WILD = [
	{ sp: 'rattata', moves: ['tackle', 'quickattack', 'tailwhip', 'bite'], x: 3, y: 2, ai: 'aggro' },
	{ sp: 'spearow', moves: ['peck', 'growl', 'furyattack', 'aerialace'], x: 6, y: 1, ai: 'aggro' },
	{ sp: 'geodude', moves: ['tackle', 'rockthrow', 'defensecurl', 'magnitude'], x: 9, y: 1, ai: 'passive' },
	{ sp: 'oddish', moves: ['absorb', 'acid', 'poisonpowder', 'stunspore'], x: 10, y: 6, ai: 'passive' },
];
export const WILD_SPECIES = WILD.map((w) => w.sp);
/**
 * TRAINING SAYS WHAT IT IS FOR (Plans/POKETACTICA_MODES_PLAN.md item D4): it was one plain battle with no aim. You pick
 * what to practise and get that fight, on the same ground, at your team's level, with what to try said at its start.
 *   free    the wild four, as it always was
 *   combo   three sturdy foes that stand still: every hit after the first in one Execute deals more
 *   throw   foes on the ledges: Lift and Throw an ally up to them
 *   catch   wild Pokémon by your base, already weak: throw one onto the base tile
 *   types   a foe for each of your team that is weak to it: read the forecast, send the right one
 */
export const DRILLS = Object.freeze({
	free: { name: 'A free battle', icon: '🎯', say: 'wild Pokémon at your level', tip: '' },
	combo: { name: 'Combos', icon: '🔗', say: 'many hits in one Execute', tip: 'Queue an attack from each of your figurines on ONE foe, then Execute: each hit after the first deals 10% more than the one before. These three are sturdy and stand still.' },
	throw: { name: 'Throwing', icon: '🤾', say: 'toss an ally up a ledge', tip: 'The foes stand on ledges. A figurine that can Lift (a Fighting type, or a strong one) stands next to an ally, picks it up with Throw and tosses it up there. No lifter in this team? Moves with reach get there too.' },
	catch: { name: 'Catching', icon: '🫳', say: 'throw a weak wild one onto your base', tip: 'These wild Pokémon are already weak. Lift one with Throw and throw it onto your base tile (the pale square): it may be caught and join your figurines. Knock it out and it is gone.' },
	types: { name: 'Type matchups', icon: '⚖️', say: 'each foe is weak to one of your team', tip: 'Each foe here is weak to one of your team. Aim a move and read the forecast: "×2" is the right figurine for that foe.' },
});
export const DRILL_IDS = Object.freeze(Object.keys(DRILLS));
const STURDY = ['slowpoke', 'geodude', 'lickitung'], LEDGES = [[7, 3], [7, 5], [10, 1]], BY_BASE = [[3, 6], [1, 6], [3, 8]];   // (the ledges: 3, 3 and 2 levels up; by the base: open ground two or three tiles from it)
// (a foe weak to each type, the first that the game's own type chart agrees with)
const WEAK_POOL = ['oddish', 'geodude', 'poliwag', 'spearow', 'rattata', 'machop', 'abra', 'gastly', 'dratini', 'charmander', 'magnemite', 'paras', 'koffing', 'seel'];
export function weakTo(type, data) { return WEAK_POOL.find((sp) => data.species[sp] && effectiveness(type, data.species[sp].types) > 1) || 'rattata'; }
const wildFig = (sp, level, data, seed, moves) => {
	const x = makeFigurine(sp, level, makeRng(seed), data);
	if (!moves) return x;
	const pool = [...x.pool, ...moves.filter((m) => !x.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))];
	return equip({ ...x, pool }, moves);
};
function drillFoes(drill, team, level, data, seed) {
	if (drill === 'combo') return STURDY.map((sp, i) => ({ fig: wildFig(sp, level + 2, data, seed + ':drill' + i), x: WILD[i].x, y: WILD[i].y, ai: 'hold' }));
	if (drill === 'throw') return LEDGES.map(([x, y], i) => ({ fig: wildFig(WILD[i].sp, level, data, seed + ':drill' + i, WILD[i].moves), x, y, ai: 'hold' }));
	if (drill === 'catch') return BY_BASE.map(([x, y], i) => ({ fig: wildFig(WILD[i].sp, Math.max(1, level - 3), data, seed + ':drill' + i, WILD[i].moves), x, y, ai: 'passive', hpFrac: 0.2 }));
	if (drill === 'types') return team.slice(0, 4).map((f, i) => ({ fig: wildFig(weakTo(((data.species[f.species] || {}).types || ['Normal'])[0], data), level, data, seed + ':drill' + i), x: WILD[i].x, y: WILD[i].y, ai: i < 2 ? 'aggro' : 'passive' }));
	return null;
}
/** team: the player's figurines (up to 6); level: the wild ones' level; drill: what is practised (DRILLS; none: the free battle). */
export function trainingSetup(team, level, data, seed = 'training', drill = 'free') {
	const foes = DRILLS[drill] && drill !== 'free' ? drillFoes(drill, team, level, data, seed) : null;
	if (foes && foes.length) return { map: demoMap(), player: team.slice(0, 6), enemy: foes, drill };
	const enemy = WILD.map((w, i) => {
		let x = makeFigurine(w.sp, level, makeRng(seed + ':wild' + i), data);
		const pool = [...x.pool, ...w.moves.filter((m) => !x.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))];
		return { fig: equip({ ...x, pool }, w.moves), x: w.x, y: w.y, ai: w.ai };
	});
	return { map: demoMap(), player: team.slice(0, 6), enemy };
}
