// td/cards.js — Tower Defense, MAZE BUILDER: block cards, gold prices and rewards (owner, 2026-11-24;
// Plans/POKETACTICA_MAZE_BUILDER_PLAN.md). Pure: everything comes from the run's seed, so a replay deals the same cards
// and offers the same rewards.
//
//   - cards come from a seeded BAG: the 7 tetrominoes and the 4 small shapes, dealt without repeats until the bag is
//     empty, then refilled (never five S pieces in a row)
//   - 3 are dealt each build phase (5 before the first wave); hand limit 6; a reward card is never lost to a full hand
//   - gold (run-only) buys placements, draws and boosts: it stands where the Road mode has slots and energy
//   - after a cleared wave, pick 1 of 3 rewards (after a boss wave, 2 of 4)
//
// The functions work on the run's state S: { seed, bag, bagN, hand, nc }.
import { SHAPES, SMALL, TETROMINOES } from './maze.js';
import { shuffled } from './heroes.js';
import { makeRng } from '../../../overworld/rules/rng.js';

// TUNE (stage 5, with the auto-player): every number here is a starting value
export const GOLD = Object.freeze({
	start: 60, wave: 10, noLeak: 5, discard: 2,
	place: 20, placeMore: 10, draw: 5, drawMore: 5, lift: 15, sp: 8, overdrive: 15,
	rewardGold: 15, lateWave: 25,
});
export const HAND_MAX = 6, DEAL = 3, DEAL_FIRST = 5, LATE_CARDS = 2;
export const BAG = Object.freeze([...TETROMINOES, ...SMALL]);
/**
 * What a card may carry (the whole block gets it), all from rules battles already have:
 *   up      the block is that many levels high (a plain one is 1): the high-ground rule, +10% a level
 *   ground  living terrain (engine/terrain.js): +20% to that type's moves used from it
 *   geo     a Geo colour, with the panel effect Maze Builder gives that colour (engine/geo.js effectsAt)
 */
export const BONUS = Object.freeze({
	tall: { name: 'Tall', text: 'One level higher: +10% damage from up there.', up: 2 },
	water: { name: 'Water', text: 'Water moves +20% from it.', ground: 'water' },
	lava: { name: 'Lava', text: 'Fire moves +20% from it.', ground: 'lava' },
	grass: { name: 'Grass', text: 'Grass moves +20% from it.', ground: 'tallgrass' },
	ice: { name: 'Ice', text: 'Ice moves +20% from it.', ground: 'ice' },
	red: { name: 'Red panel', text: 'Attack +20% on it.', geo: 'red', effect: { k: 'stat', stat: 'atk', mult: 1.2 } },
	blue: { name: 'Blue panel', text: 'Sp. Atk +20% on it.', geo: 'blue', effect: { k: 'stat', stat: 'spa', mult: 1.2 } },
	purple: { name: 'Purple panel', text: 'Moves used from it never miss.', geo: 'purple', effect: { k: 'noMiss' } },
});
export const BONUSES = Object.freeze(Object.keys(BONUS));
/** The off-board Geo symbols that power the panel colours (one a colour), for a Maze Builder run's board. */
export const panelSymbols = () => BONUSES.filter((k) => BONUS[k].geo).map((k) => ({ id: 'mz-' + k, x: -1, y: -1, color: BONUS[k].geo, panel: BONUS[k].geo, effect: { ...BONUS[k].effect } }));

/** Bag number n of a run, in the order it is dealt. */
export function bagOf(seed, n) {
	const rng = makeRng(seed + ':td-bag' + n), out = [...BAG];
	for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
	return out;
}
/** A new card into the hand (a plain one, or with a bonus). -> the card */
export function addCard(S, shape, bonus = null) {
	const c = { id: 'c' + (S.nc++), shape, ...(bonus ? { bonus } : {}) };
	S.hand.push(c);
	return c;
}
/** The next card out of the bag, into the hand. -> the card */
export function drawCard(S) {
	// (a run played as a hero deals from the hero's own deck, td/heroes.js: through it, then shuffled again)
	if (!S.bag.length) S.bag = S.deck ? shuffled(S.seed, S.bagN++, S.deck) : bagOf(S.seed, S.bagN++);
	const c = S.bag.shift();
	return typeof c === 'string' ? addCard(S, c) : addCard(S, c.shape, c.bonus || null);
}
/** A build phase's deal: up to `n` cards, never past the hand limit. -> how many came */
export function deal(S, n, max = HAND_MAX) {
	let k = 0;
	while (k < n && S.hand.length < max) { drawCard(S); k++; }
	return k;
}
/** The price of the next figurine with `towers` already on the board. */
export const placeCost = (towers) => GOLD.place + GOLD.placeMore * towers;
/** The price of the next extra card this round, after `draws` bought already. */
export const drawCost = (draws) => GOLD.draw + GOLD.drawMore * draws;
/** A late start (a checkpoint): the gold and cards for the waves skipped (cards in whole bags). */
export const lateGold = (skipped) => GOLD.start + GOLD.lateWave * Math.max(0, skipped);
export const lateCards = (skipped) => Math.floor(Math.max(0, skipped) * LATE_CARDS / BAG.length) * BAG.length;

// a bonus card's shape: mostly the big ones (small blocks make the tightest mazes, so a 1-tile bonus block is rare)
function bonusShape(rng, big) {
	const r = big ? 0 : rng();
	const from = r < 0.75 ? TETROMINOES : r < 0.90 ? ['three', 'corner'] : r < 0.98 ? ['two'] : ['one'];
	return from[Math.floor(rng() * from.length)];
}
/**
 * The rewards offered for clearing wave n: { pick (how many to take), opts: [option] }.
 *   { k: 'bonus', shape, bonus }   a block card with a bonus
 *   { k: 'gold', n }               gold
 *   { k: 'cards', n: 2 }           two plain cards, of shapes the player chooses
 *   { k: 'life' }                  one life back (only offered when one is missing)
 */
export function rewardsOf(seed, n, boss, hurt) {
	const rng = makeRng(seed + ':td-reward' + n), opts = [], has = (k) => opts.some((o) => o.k === k);
	const bonus = (big) => {
		for (let tries = 0; tries < 20; tries++) {
			const o = { k: 'bonus', shape: bonusShape(rng, big), bonus: BONUSES[Math.floor(rng() * BONUSES.length)] };
			if (!opts.some((x) => x.k === 'bonus' && x.shape === o.shape && x.bonus === o.bonus)) return o;
		}
		return { k: 'gold', n: GOLD.rewardGold + n };
	};
	if (boss) opts.push(bonus(true));   // (after a boss wave one of the four is always a bonus tetromino)
	while (opts.length < (boss ? 4 : 3)) {
		const r = rng();
		if (r < 0.05 && hurt && !has('life')) opts.push({ k: 'life' });
		else if (r < 0.25 && !has('cards')) opts.push({ k: 'cards', n: 2 });
		else if (r < 0.50 && !has('gold')) opts.push({ k: 'gold', n: GOLD.rewardGold + n });
		else opts.push(bonus(false));
	}
	return { pick: boss ? 2 : 1, opts };
}
export const isShape = (s) => !!SHAPES[s];
