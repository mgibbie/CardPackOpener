// demo.js — the first playable map, "Training Grounds" (stage 4). A hand-built 12 x 10 board with ledges, a pillar, Geo
// colours and two Geo Symbols, a starting team of five figurines and four wild Pokémon. Stage 5 brings the player's own
// figurines (found in the overworld) and stage 6 the campaign's maps; until then this is what the page plays.
import { makeFigurine, equip } from './figurine.js';
import { makeRng } from '../../overworld/rules/rng.js';

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
/** team: the player's figurines (up to 6); level: the wild ones' level. */
export function trainingSetup(team, level, data, seed = 'training') {
	const enemy = WILD.map((w, i) => {
		let x = makeFigurine(w.sp, level, makeRng(seed + ':wild' + i), data);
		const pool = [...x.pool, ...w.moves.filter((m) => !x.pool.some((p) => p.id === m)).map((id) => ({ id, lv: 1, xp: 0 }))];
		return { fig: equip({ ...x, pool }, w.moves), x: w.x, y: w.y, ai: w.ai };
	});
	return { map: demoMap(), player: team.slice(0, 6), enemy };
}
