// campaign.js — Campaign v1 (stage 6): ten hand-built maps in three chapters. Teaching maps first (move, attack, Execute,
// combos, height, throw and capture), then Geo puzzles, then height puzzles; a boss ends each chapter. A map opens when
// the one before it is cleared (the collection's `cleared`, figcol.js); its FIRST clear pays its reward: stars, and on
// some maps a figurine (its id is the map's, so two devices clearing it join into one figurine, never two).
//
// A map, as written here (overworld/tests/poketactica_campaign_test.mjs checks every one):
//   rows   heights, one string per row: '.' 0, '1'..'9' a level, '#' no tile (a gap)
//   geo    the same size: r red, b blue, p purple, o orange, c cyan, y yellow (electric), g green (grassy), . none
//   base   [x, y]: where the player's figurines are deployed from (a tile, clear of foes and symbols)
//   symbols  Geo Symbols: { x, y, color (what it repaints to; 'clear' removes colour), effect } (engine/geo.js GEO_EFFECTS)
//   foes   { sp, lv, x, y, ai ('aggro' | 'passive' | 'hold'), moves? (else the last four it learned), boss?, held? (goods.js HELD) }
//   reward { stars, fig?: { sp, lv } }   tip: what the map teaches, shown as it starts
import { makeFigurine, equip } from './figurine.js';
import { HELD } from './goods.js';
import { makeRng } from '../../overworld/rules/rng.js';

const COLOR = { r: 'red', b: 'blue', p: 'purple', o: 'orange', c: 'cyan', y: 'yellow', g: 'green' };

export const CHAPTERS = Object.freeze([
	{ n: 1, name: 'Pallet Meadow' },
	{ n: 2, name: 'Prism Ruins' },
	{ n: 3, name: 'Thunder Spire' },
]);

export const MAPS = Object.freeze([
	// ---------------- chapter 1: Pallet Meadow (the basics)
	{ id: 'c1-1', chapter: 1, name: 'First Steps',
		tip: 'Z on your base tile deploys a figurine. Move it, then Attack: attacks wait in a queue until you Execute (V / Y).',
		rows: [
			'........',
			'........',
			'...11...',
			'...11...',
			'........',
			'........',
			'........',
		],
		base: [1, 5],
		foes: [{ sp: 'rattata', lv: 3, x: 5, y: 1, ai: 'passive' }, { sp: 'pidgey', lv: 3, x: 6, y: 3, ai: 'passive' }],
		reward: { stars: 20 } },
	{ id: 'c1-2', chapter: 1, name: 'Combo Field',
		tip: 'Queue two attacks on one foe before you Execute: they land in the order you queued them, and each one after the first is a combo that hits harder.',
		rows: [
			'.........',
			'.........',
			'..1......',
			'..1...1..',
			'......1..',
			'.........',
			'.........',
			'.........',
		],
		base: [1, 6],
		foes: [{ sp: 'caterpie', lv: 4, x: 4, y: 1, ai: 'aggro' }, { sp: 'weedle', lv: 4, x: 7, y: 2, ai: 'aggro' }, { sp: 'rattata', lv: 5, x: 6, y: 5, ai: 'aggro' }],
		reward: { stars: 25 } },
	{ id: 'c1-3', chapter: 1, name: 'The Ledge',
		tip: 'Height matters: a figurine climbs only as many levels per step as its Jump (2; Ground, Rock and Fighting types 3; Flying ignores height). Find the ramp.',
		rows: [
			'..3333....',
			'..3333....',
			'..3333....',
			'...2......',
			'...1......',
			'..........',
			'......##..',
			'..........',
		],
		base: [1, 6],
		foes: [{ sp: 'geodude', lv: 6, x: 3, y: 0, ai: 'hold' }, { sp: 'sandshrew', lv: 6, x: 5, y: 1, ai: 'passive' }, { sp: 'spearow', lv: 6, x: 8, y: 2, ai: 'aggro' }],
		reward: { stars: 30 } },
	{ id: 'c1-4', chapter: 1, name: 'Catch!',
		tip: 'A weakened wild Pokémon thrown onto your base tile may be caught: it becomes your figurine. Fighting types and strong Pokémon can Lift and Throw. Or simply win.',
		rows: [
			'.........',
			'.11......',
			'.11......',
			'.........',
			'.....22..',
			'.....22..',
			'.........',
			'.........',
		],
		base: [1, 6],
		foes: [{ sp: 'eevee', lv: 5, x: 6, y: 2, ai: 'passive' }, { sp: 'pidgey', lv: 5, x: 3, y: 1, ai: 'passive' }],
		reward: { stars: 30, fig: { sp: 'eevee', lv: 5 } } },
	{ id: 'c1-5', chapter: 1, name: 'Boulder Pass', boss: true,
		tip: 'Chapter boss: Onix holds the pass. Bring Water and Grass figurines, and deal with the Geodude first.',
		rows: [
			'##..2222..##',
			'#...2222...#',
			'....1111....',
			'............',
			'..11....11..',
			'..11....11..',
			'............',
			'............',
			'#..........#',
		],
		base: [5, 7],
		foes: [{ sp: 'onix', lv: 11, x: 5, y: 0, ai: 'hold', boss: true, held: 'hardstone' }, { sp: 'geodude', lv: 8, x: 2, y: 4, ai: 'aggro' }, { sp: 'geodude', lv: 8, x: 9, y: 4, ai: 'aggro' }],
		reward: { stars: 60, fig: { sp: 'onix', lv: 10 } } },

	// ---------------- chapter 2: Prism Ruins (Geo Panels)
	{ id: 'c2-1', chapter: 2, name: 'Blue Shield',
		tip: 'A Geo Symbol gives its effect to every unit on tiles of the colour it sits on. These foes are Invincible on blue: attack the pyramid to break it.',
		rows: [
			'..........',
			'..........',
			'..........',
			'..........',
			'..........',
			'..........',
			'..........',
			'..........',
		],
		geo: [
			'....bbbbbb',
			'....bbbbbb',
			'....bbbbbb',
			'..........',
			'..........',
			'..........',
			'..........',
			'..........',
		],
		base: [1, 6],
		symbols: [{ x: 4, y: 2, color: 'clear', effect: { k: 'invincible' } }],
		foes: [{ sp: 'ekans', lv: 12, x: 6, y: 1, ai: 'hold' }, { sp: 'koffing', lv: 12, x: 8, y: 0, ai: 'hold' }, { sp: 'grimer', lv: 12, x: 5, y: 2, ai: 'passive' }],
		reward: { stars: 40 } },
	{ id: 'c2-2', chapter: 2, name: 'Chain Reaction',
		tip: 'A broken symbol repaints its colour to its own, one tile at a time, hurting everyone on a changing tile. A symbol caught in that repaint breaks too: chain them.',
		rows: [
			'...........',
			'...........',
			'...........',
			'...........',
			'...........',
			'...........',
			'...........',
			'...........',
		],
		geo: [
			'rrrrr......',
			'rrrrr.bbbbb',
			'rrrrr.bbbbb',
			'......bbbbb',
			'...........',
			'...........',
			'...........',
			'...........',
		],
		base: [1, 7],
		symbols: [{ x: 2, y: 2, color: 'blue', effect: { k: 'stat', stat: 'def', mult: 1.5 } }, { x: 4, y: 0, color: 'clear', effect: { k: 'heal' } }],
		foes: [{ sp: 'koffing', lv: 14, x: 1, y: 0, ai: 'passive' }, { sp: 'grimer', lv: 14, x: 8, y: 2, ai: 'passive' }, { sp: 'ekans', lv: 14, x: 4, y: 1, ai: 'aggro' }, { sp: 'ekans', lv: 14, x: 9, y: 3, ai: 'aggro' }],
		reward: { stars: 45 } },
	{ id: 'c2-3', chapter: 2, name: 'Mind Over Matter', boss: true,
		tip: 'Chapter boss: Kadabra sits on purple, healed every phase and its Psychic moves boosted. Break the symbols before you push in.',
		rows: [
			'...........',
			'...1111....',
			'...1221....',
			'...1221....',
			'...1111....',
			'...........',
			'...........',
			'...........',
			'...........',
		],
		geo: [
			'..ppppppp..',
			'..ppppppp..',
			'..ppppppp..',
			'..ppppppp..',
			'..ppppppp..',
			'...........',
			'...........',
			'...........',
			'...........',
		],
		base: [5, 8],
		symbols: [{ x: 2, y: 0, color: 'clear', effect: { k: 'heal' } }, { x: 8, y: 0, color: 'clear', effect: { k: 'typeBoost', type: 'Psychic' } }],
		foes: [{ sp: 'kadabra', lv: 19, x: 5, y: 2, ai: 'hold', boss: true, held: 'twistedspoon' }, { sp: 'drowzee', lv: 16, x: 3, y: 4, ai: 'aggro' }, { sp: 'drowzee', lv: 16, x: 7, y: 4, ai: 'aggro' }],
		reward: { stars: 90, fig: { sp: 'kadabra', lv: 16 } } },

	// ---------------- chapter 3: Thunder Spire (height)
	{ id: 'c3-1', chapter: 3, name: 'Updraft',
		tip: 'Flying foes perch on the pillars. Climb the steps (two levels at a time at most) or bring your own flyers and ranged moves.',
		rows: [
			'4.....##...',
			'3......6...',
			'2......6...',
			'1.....56...',
			'......4....',
			'...1233....',
			'...........',
			'...........',
			'...........',
		],
		base: [1, 8],
		foes: [{ sp: 'pidgeotto', lv: 22, x: 7, y: 1, ai: 'hold' }, { sp: 'fearow', lv: 22, x: 0, y: 0, ai: 'aggro' }, { sp: 'magnemite', lv: 21, x: 5, y: 5, ai: 'passive' }, { sp: 'spearow', lv: 20, x: 9, y: 5, ai: 'aggro' }],
		reward: { stars: 60 } },
	{ id: 'c3-2', chapter: 3, name: 'Thunder Spire', boss: true,
		tip: 'The last boss: Zapdos on the spire\'s crown, its Electric moves boosted on yellow. Climb, break the symbol, and bring Ground figurines.',
		rows: [
			'....666.....',
			'....666.....',
			'....444.....',
			'.....2......',
			'...........1',
			'..1.......11',
			'..1.........',
			'............',
			'............',
			'............',
		],
		geo: [
			'...yyyyy....',
			'...yyyyy....',
			'...yyyyy....',
			'...yyyyy....',
			'............',
			'............',
			'............',
			'............',
			'............',
			'............',
		],
		base: [6, 9],
		symbols: [{ x: 3, y: 3, color: 'clear', effect: { k: 'typeBoost', type: 'Electric' } }],
		foes: [{ sp: 'zapdos', lv: 28, x: 5, y: 0, ai: 'hold', boss: true, held: 'magnet' }, { sp: 'electabuzz', lv: 24, x: 4, y: 2, ai: 'aggro' }, { sp: 'magneton', lv: 24, x: 6, y: 2, ai: 'passive' }, { sp: 'magnemite', lv: 22, x: 11, y: 4, ai: 'aggro' }],
		reward: { stars: 150, fig: { sp: 'zapdos', lv: 25 } } },
].map((m) => Object.freeze(m)));

export const mapById = (id) => MAPS.find((m) => m.id === id) || null;

/** The engine's map (battle.js newBattle's setup.map) from a campaign map. */
export function buildMap(m) {
	const h = m.rows.length, w = m.rows[0].length, height = [], geo = [];
	for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
		const c = m.rows[y][x];
		height.push(c === '#' ? null : c === '.' ? 0 : Number(c));
		geo.push((m.geo && COLOR[m.geo[y][x]]) || null);
	}
	return { name: m.name, w, h, height, geo, base: { x: m.base[0], y: m.base[1] }, symbols: (m.symbols || []).map((s, i) => ({ id: 's' + i, ...s, effect: { ...s.effect } })) };
}

/** A foe figurine: the species at its level, its last four moves (or the listed ones), its held item (bosses hold one). */
export function foeFigure(f, data, seed) {
	let x = makeFigurine(f.sp, f.lv, makeRng(seed), data, { id: (f.sp + '-foe').slice(0, 60), shinyRate: 0 });
	if (f.moves && f.moves.length) {
		const pool = [...x.pool, ...f.moves.filter((mid) => !x.pool.some((p) => p.id === mid)).map((id) => ({ id, lv: 1, xp: 0 }))];
		x = equip({ ...x, pool }, f.moves);
	}
	return f.held && HELD[f.held] ? { ...x, held: f.held } : x;
}

/** The battle's setup: the player's team (up to six) against the map's foes. */
export function campaignSetup(m, team, data, seed) {
	return { map: buildMap(m), player: team.slice(0, 6), enemy: m.foes.map((f, i) => ({ fig: foeFigure(f, data, seed + ':foe' + i), x: f.x, y: f.y, ai: f.ai })) };
}

/** Open maps: the first, and each one whose predecessor is cleared. */
export const isOpen = (id, cleared) => { const i = MAPS.findIndex((m) => m.id === id); return i === 0 || (i > 0 && (cleared || []).includes(MAPS[i - 1].id)); };
/** The map a player is sent to next: the first open one not yet cleared (null when all are). */
export const nextMap = (cleared) => MAPS.find((m) => isOpen(m.id, cleared) && !(cleared || []).includes(m.id)) || null;
/** The reward figurine's id: the map's, so it exists once however many devices clear the map. */
export const rewardFigId = (m) => (m.reward.fig.sp + '-camp-' + m.id).replace(/[^a-z0-9_-]/g, '').slice(0, 60);
