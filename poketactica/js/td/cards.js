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
	reroll: 10, rerollMore: 10,
});
/** What changing a wave's rewards costs: more each time it is done for the same wave. */
export const rerollCost = (done) => GOLD.reroll + GOLD.rerollMore * Math.max(0, done | 0);
export const HAND_MAX = 6, DEAL = 3, DEAL_FIRST = 5, LATE_CARDS = 2;
/** ON THE BIG MAPS (rules 16: four times the ground, so a wall across the field takes twice the blocks): this many more cards in the first hand, in each wave's deal, and in a full hand. */
export const BIG = Object.freeze({ first: 3, deal: 2, hand: 2 });
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
	// ---- rules 17 (the improvement plan, item 12): kinds that are not "stand here, be stronger"
	//   aura   figurines on the raised tiles TOUCHING the block (not on it) deal that many % more
	//   floor  the card is laid ON the way, not across it: the tiles stay open ground, nobody stands on them, and enemies
	//          walking over them are slowed (mud) or hurt (caltrops)
	beacon: { name: 'Beacon', text: 'Figurines on the blocks and rocks touching it deal +15% damage. (Not the one standing on it.)', aura: 15 },
	mud: { name: 'Mud', text: 'Laid ON the way, not across it: enemies wade through it at half speed.', floor: 'mud' },
	caltrops: { name: 'Caltrops', text: 'Laid ON the way, not across it: each tile hurts an enemy as it crosses.', floor: 'caltrops' },
	// ---- rules 20 (Plans/POKETACTICA_MODES_PLAN.md item B1): HERO CARDS. One kind a hero (`hero`): only that hero's deck
	// holds it, and no reward offers it. Each is made of what the kinds above already do (a height, a ground, a panel,
	// an aura), put together or made stronger, so the rules that play them are the rules that were there.
	bastion: { name: 'Bastion', hero: 'brock', text: 'Two levels higher: +20% damage from up there.', up: 3 },
	tidepool: { name: 'Tide Pool', hero: 'misty', text: 'Water moves +20% from it, and figurines on the blocks and rocks touching it deal +10% damage.', ground: 'water', aura: 10 },
	dynamo: { name: 'Dynamo', hero: 'surge', text: 'Figurines on the blocks and rocks touching it deal +25% damage. (Not the one standing on it.)', aura: 25 },
	trellis: { name: 'Trellis', hero: 'erika', text: 'Grass moves +20% from it, and it stands a level higher: +10% damage from up there.', ground: 'tallgrass', up: 2 },
	dragonspire: { name: 'Dragon Spire', hero: 'lance', text: 'One level higher (+10% damage), and moves used from it never miss.', up: 2, geo: 'purple' },
	// (rules 21, plan item B2: the two heroes that came after)
	ninjaperch: { name: 'Ninja Perch', hero: 'koga', text: 'One level higher (+10% damage), and Attack +20% on it.', up: 2, geo: 'red' },
	mindspire: { name: 'Mind Spire', hero: 'sabrina', text: 'One level higher (+10% damage), and Sp. Atk +20% on it.', up: 2, geo: 'blue' },
});
/** The bonuses a run of that rules revision may be offered (before 17: the first eight, so an older run's rewards are what they were). */
export const NEW_BONUS_REV = 17;
const OLD_BONUSES = Object.freeze(Object.keys(BONUS).filter((k) => !BONUS[k].aura && !BONUS[k].floor && !BONUS[k].hero));
/** The hero cards' kinds (rules 20): in a hero's own deck only. */
export const HERO_BONUSES = Object.freeze(Object.keys(BONUS).filter((k) => BONUS[k].hero));
export const BONUSES = Object.freeze(Object.keys(BONUS).filter((k) => !BONUS[k].hero));   // (what a reward may offer: never a hero's own card)
export const bonusesAt = (rev) => (rev >= NEW_BONUS_REV ? BONUSES : OLD_BONUSES);
/** A FLOOR card's numbers. An enemy is slowed by mud for MUD_MAX ticks in all, and hurt by caltrops for CALTROP_MAX of its HP in all: the way is long, and neither may be laid end to end for ever. */
export const FLOOR = Object.freeze({ mudTicks: 8, mudMax: 160, caltrop: 0.02, caltropMax: 0.2, bossPart: 4 });
export const AURA_MAX = 30;
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
export function rewardsOf(seed, n, boss, hurt, list = OLD_BONUSES) {
	const rng = makeRng(seed + ':td-reward' + n), opts = [], has = (k) => opts.some((o) => o.k === k);
	const bonus = (big) => {
		for (let tries = 0; tries < 20; tries++) {
			const o = { k: 'bonus', shape: bonusShape(rng, big), bonus: list[Math.floor(rng() * list.length)] };
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

/**
 * A DECK WORTH BUILDING (rules 15; owner, 2026-11-24: "remove and upgrade"). A run played as a hero has a deck, and its
 * rewards could only add to it. Now a reward may also change it:
 *   { k: 'trim' }             take one card out of the deck for the rest of the run (never below DECK_MIN cards)
 *   { k: 'upgrade', bonus }   one plain card of the deck gets that bonus, for the rest of the run
 * The player says which card (the pick's `card`: its place in the deck). An offer is made on a stream of its own and
 * takes the place of the LAST option of the usual set, so the usual set is what it always was; after a boss wave there is
 * always one. A deck too small to trim, or with no plain card left, is offered the other, or neither.
 */
export const DECK_MIN = 6, DECK_OFFER = 0.4;
export function withDeckOffer(pick, seed, n, boss, deck, list = OLD_BONUSES) {
	if (!deck || !deck.length) return pick;
	const rng = makeRng(seed + ':td-deck' + n);
	if (!boss && rng() >= DECK_OFFER) return pick;
	const canTrim = deck.length > DECK_MIN, canUp = deck.some((c) => !c.bonus);
	const wantTrim = rng() < 0.5, bonus = list[Math.floor(rng() * list.length)];
	const o = (wantTrim && canTrim) || (!canUp && canTrim) ? { k: 'trim' } : canUp ? { k: 'upgrade', bonus } : null;
	if (!o) return pick;
	const opts = pick.opts.slice(); opts[opts.length - 1] = o;
	return { ...pick, opts };
}
/** The deck's cards by kind, for choosing one: [{ shape, bonus, n, at (the first one's place in the deck) }], in deck order. */
export function deckKinds(deck) {
	const out = [];
	(deck || []).forEach((c, i) => { const k = out.find((x) => x.shape === c.shape && (x.bonus || null) === (c.bonus || null)); if (k) k.n++; else out.push({ shape: c.shape, bonus: c.bonus || null, n: 1, at: i }); });
	return out;
}
/** A reward that changes the deck, applied. -> null, or why not */
export function applyDeckReward(S, o, at) {
	const c = Number.isInteger(at) ? S.deck[at] : null;
	if (!c) return 'choose a card of your deck';
	const inBag = (bonus) => S.bag.findIndex((b) => typeof b !== 'string' && b.shape === c.shape && (b.bonus || null) === (bonus || null));
	if (o.k === 'trim') {
		if (S.deck.length <= DECK_MIN) return 'your deck is too small';
		const j = inBag(c.bonus);
		S.deck.splice(at, 1);
		if (j >= 0) S.bag.splice(j, 1);   // (it does not come round again this time through either)
		return null;
	}
	if (c.bonus) return 'that card has a bonus already';
	const j = inBag(null);
	S.deck[at] = { shape: c.shape, bonus: o.bonus };
	if (j >= 0) S.bag[j] = { shape: c.shape, bonus: o.bonus };
	return null;
}
