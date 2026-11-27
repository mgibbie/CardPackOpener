// td/heroes.js — Tower Defense, MAZE BUILDER: HEROES (owner, 2026-11-24: "the heroes system ... different characters,
// different starting decks of block cards, offered different passives. Use characters from Pokémon like Brock & Lance").
// Pure data and the rules that read it. A run is played AS a hero:
//   - the hero's own DECK of block cards replaces the shared bag: it is dealt through, then shuffled again (from the seed);
//     reward cards the player picks join the deck for the rest of the run
//   - one SIGNATURE passive from the start; after every boss wave, a pick of 1 of 3 more (two from the hero's own list,
//     one from everyone's)
//   - Brock is free; the others open when a wave is cleared in Maze Builder (with any hero, on any map)
// A PASSIVE is a rule for the whole run, as a few numbers the simulation reads (td/sim.js `perk`). Every one is a gain:
// none takes anything away (the research's lesson: a restriction feels worse than a goal).
//   type: { Type: pct }   moves of that type hit that much harder          waveGold / bossGold / koGold   more gold
//   deal / hand           cards dealt each round / the hand limit          drawLess / firstFree           cheaper cards
//   placeLess / liftLess  cheaper figurines / Lift                         discardMore                    a discard pays more
//   lives                 lives, at once and to the limit                  cdPct / spPct                  faster moves / SP back faster
//   holdTicks             enemies can be held that much longer            tall: [shapes]                 those plain blocks are Tall
import { SHAPES } from './maze.js';
import { makeRng } from '../../../overworld/rules/rng.js';

const T15 = (type) => ({ name: type + ' Badge', text: type + ' moves hit 15% harder.', type: { [type]: 15 } });
export const PASSIVES = Object.freeze({
	// ---- signatures (one a hero, from the start)
	rocksolid: { name: 'Rock Solid', text: 'Your O and I blocks are Tall: one level higher, for nothing.', tall: ['O', 'I'] },
	cascade: { name: 'Cascade', text: 'The first extra card you draw each round is free.', firstFree: 1 },
	tempo: { name: 'Lightning Tempo', text: 'Your figurines\' moves come back 12% sooner.', cdPct: 12 },
	garden: { name: 'Garden', text: 'One more card is dealt each round, and your hand holds 2 more.', deal: 1, hand: 2 },
	champion: { name: 'Champion\'s Purse', text: '3 more gold for every wave cleared, and 15 more for a boss wave.', waveGold: 3, bossGold: 15 },
	// (rules 21, plan item B2: Koga's and Sabrina's)
	venom: { name: 'Venom', text: 'Poison moves hit 20% harder, and enemies can be held still half a second longer.', type: { Poison: 20 }, holdTicks: 10 },
	foresight: { name: 'Foresight', text: 'Your hand holds 1 more card, and extra cards cost 2 less gold.', hand: 1, drawLess: 2 },
	// ---- type badges
	rock: T15('Rock'), ground: T15('Ground'), steel: T15('Steel'), water: T15('Water'), ice: T15('Ice'), electric: T15('Electric'), flying: T15('Flying'),
	grass: T15('Grass'), poison: T15('Poison'), bug: T15('Bug'), dragon: T15('Dragon'), fire: T15('Fire'), psychic: T15('Psychic'), normal: T15('Normal'),
	// ---- everyone's
	purse: { name: 'Deep Pockets', text: '4 more gold for every wave cleared.', waveGold: 4 },
	bounty: { name: 'Bounty', text: '1 more gold for every knockout.', koGold: 1 },
	bighand: { name: 'Big Hand', text: 'Your hand holds 2 more cards.', hand: 2 },
	dealer: { name: 'Dealer', text: 'One more card is dealt each round.', deal: 1 },
	bargain: { name: 'Bargain', text: 'Extra cards cost 3 less gold.', drawLess: 3 },
	recruiter: { name: 'Recruiter', text: 'Figurines cost 5 less gold to place.', placeLess: 5 },
	crane: { name: 'Crane', text: 'Lift costs 10 less gold.', liftLess: 10 },
	scrap: { name: 'Scrap', text: 'A discarded card pays 3 more gold.', discardMore: 3 },
	heart: { name: 'Big Heart', text: '3 more lives, now and for the rest of the run.', lives: 3 },
	focus: { name: 'Focus', text: 'Your figurines\' SP comes back half as fast again.', spPct: 50 },
	grip: { name: 'Grip', text: 'Enemies can be held still for 1 second longer.', holdTicks: 20 },
	quick: { name: 'Quick Hands', text: 'Your figurines\' moves come back 8% sooner.', cdPct: 8 },
	// ---- RARE ones (rules 22, plan item B3): everyone's, offered from boss wave RARE_FROM on and less often than the rest
	warchest: { name: 'War Chest', rare: true, text: '6 more gold for every wave cleared, and 1 more for every knockout.', waveGold: 6, koGold: 1 },
	overclock: { name: 'Overclock', rare: true, text: 'Your figurines\' moves come back 15% sooner.', cdPct: 15 },
	fortress: { name: 'Fortress', rare: true, text: '5 more lives, now and for the rest of the run.', lives: 5 },
	architect: { name: 'Architect', rare: true, text: 'One more card is dealt each round, your hand holds 2 more, and extra cards cost 2 less gold.', deal: 1, hand: 2, drawLess: 2 },
	ironwill: { name: 'Iron Will', rare: true, text: 'Enemies can be held still 1.5 seconds longer, and your figurines\' SP comes back a quarter as fast again.', holdTicks: 30, spPct: 25 },
});
/**
 * PASSIVE RARITY, AND PAIRS THAT WORK TOGETHER (Plans/POKETACTICA_MODES_PLAN.md item B3; rules 22). "31 passives, mostly
 * flat bonuses."
 *   rarity   a passive is a hero's SIGNATURE, a TYPE BADGE, COMMON, or RARE (`rare`). A rare one is everyone's, is offered
 *            only from boss wave RARE_FROM on, and takes the shared place in an offer RARE_CHANCE times in 100.
 *   pairs    two passives that are more together: a run that holds BOTH gets the pair's own bonus on top (PAIRS), in
 *            the same numbers every other passive is made of. An offer says when a passive would finish a pair.
 */
export const PASSIVE_REV = 22, RARE_FROM = 20, RARE_CHANCE = 35;
export const RARES = Object.freeze(Object.keys(PASSIVES).filter((id) => PASSIVES[id].rare));
export const PAIRS = Object.freeze([
	{ id: 'treasury', name: 'Treasury', ids: ['purse', 'bounty'], text: '3 more gold for every wave cleared.', waveGold: 3 },
	{ id: 'fullhouse', name: 'Full House', ids: ['dealer', 'bighand'], text: 'Extra cards cost 2 less gold.', drawLess: 2 },
	{ id: 'flow', name: 'Flow', ids: ['focus', 'quick'], text: 'Your figurines\' moves come back 6% sooner still.', cdPct: 6 },
	{ id: 'standfast', name: 'Stand Fast', ids: ['grip', 'heart'], text: 'Enemies can be held still half a second longer still.', holdTicks: 10 },
	{ id: 'foreman', name: 'Foreman', ids: ['recruiter', 'crane'], text: 'Figurines cost 3 less gold to place.', placeLess: 3 },
	{ id: 'salvage', name: 'Salvage', ids: ['scrap', 'bargain'], text: 'A discarded card pays 2 more gold.', discardMore: 2 },
].map((p) => Object.freeze(p)));
/** What kind of passive this is: 'signature' | 'badge' | 'rare' | 'common'. */
export const rarityOf = (id) => (HEROES_SIG.has(id) ? 'signature' : PASSIVES[id] && PASSIVES[id].rare ? 'rare' : PASSIVES[id] && PASSIVES[id].type && / Badge$/.test(PASSIVES[id].name) ? 'badge' : 'common');
/** The pairs a run holds both halves of (rules 22 on). */
export const pairsOf = (S) => (S && S.rev >= PASSIVE_REV ? PAIRS.filter((p) => p.ids.every((id) => (S.passives || []).includes(id))) : []);
/** The pair a passive would FINISH if it were taken now (the other half is held), or null. */
export const pairWith = (S, id) => (S && S.rev >= PASSIVE_REV ? PAIRS.find((p) => p.ids.includes(id) && !(S.passives || []).includes(id) && p.ids.every((x) => x === id || (S.passives || []).includes(x))) || null : null);
/** The pair a passive belongs to (whether or not it is held), or null. */
export const pairFor = (id) => PAIRS.find((p) => p.ids.includes(id)) || null;
/** Everyone's list (a hero's own list is on the hero). */
export const SHARED = Object.freeze(['purse', 'bounty', 'bighand', 'dealer', 'bargain', 'recruiter', 'crane', 'scrap', 'heart', 'focus', 'grip', 'quick']);
const HEROES_SIG = new Set(['rocksolid', 'cascade', 'tempo', 'garden', 'champion', 'venom', 'foresight']);   // (the signatures: heroProblems checks this list against the heroes)

const deck = (spec) => Object.freeze(spec.flatMap(([shape, n = 1, bonus]) => Array.from({ length: n }, () => Object.freeze(bonus ? { shape, bonus } : { shape }))));
/**
 * { id, name, title, type, art (overworld/data/people/<art>.png: a 48 x 32 sheet, the first 16 x 32 frame faces us),
 *   unlock (the Maze Builder wave that opens them; 0 = free), say, deck, passive (the signature), pool (their own list) }
 */
/** (rules 20, plan item B1) A hero's own card joins its deck from this revision: `card: { shape, bonus }`, a kind only that hero has (td/cards.js). */
export const HERO_CARD_REV = 20;
/**
 * MORE HEROES, AND SOMETHING TO EARN WITH EACH (Plans/POKETACTICA_MODES_PLAN.md item B2; rules 21). "Five heroes, all
 * open by wave 25." Two more (Koga at wave 30, Sabrina at 35), and with EACH hero, by the best wave cleared AS that hero:
 *   a portrait frame   bronze at FRAME_WAVES[0], silver at [1], gold at [2] (the look only)
 *   a second deck      `deck2`, from DECK2_WAVE: another mix of the same hero's pieces, chosen before the run
 *                      (`setup.deck2`, kept in the run's recipe). The hero's own card and passive are the same.
 */
export const MORE_HEROES_REV = 21, DECK2_WAVE = 15, FRAME_WAVES = Object.freeze([10, 20, 30]), FRAMES = Object.freeze(['bronze', 'silver', 'gold']);
/** The frame a hero's portrait has earned ('' for none), for the best wave cleared as that hero. */
export const frameOf = (bestAsHero) => { let f = ''; FRAME_WAVES.forEach((w, i) => { if ((bestAsHero | 0) >= w) f = FRAMES[i]; }); return f; };
export const deck2Open = (h, bestAsHero) => !!(h && h.deck2) && (bestAsHero | 0) >= DECK2_WAVE;
export const HEROES = Object.freeze([
	{ id: 'brock', name: 'Brock', title: 'Pewter City Gym Leader', type: 'Rock', art: 'brock', unlock: 0,
		say: 'Big, solid pieces. His O and I blocks stand a level higher, so the figurines on them hit harder.',
		deck: deck([['O', 3], ['I', 2], ['L', 2], ['J', 2], ['T'], ['three'], ['corner']]), passive: 'rocksolid', pool: ['rock', 'ground', 'steel', 'heart', 'crane', 'recruiter'], card: Object.freeze({ shape: 'O', bonus: 'bastion' }),
		deck2: deck([['I', 3], ['O', 2], ['T', 2], ['L'], ['J'], ['three', 2], ['O', 1, 'tall']]), deck2Say: 'Longer walls: more I blocks, and a Tall block to start.' },
	{ id: 'misty', name: 'Misty', title: 'Cerulean City Gym Leader', type: 'Water', art: 'misty', unlock: 10,
		say: 'Winding pieces for a winding way, and a Water block to start. Her first extra card each round is free.',
		deck: deck([['S', 2], ['Z', 2], ['T', 2], ['L'], ['J'], ['three', 2], ['two'], ['L', 1, 'water']]), passive: 'cascade', pool: ['water', 'ice', 'psychic', 'bargain', 'bighand', 'scrap'], card: Object.freeze({ shape: 'S', bonus: 'tidepool' }),
		deck2: deck([['S'], ['Z'], ['L', 2], ['J', 2], ['T'], ['corner', 2], ['two', 2], ['O', 1, 'ice']]), deck2Say: 'Corners and hooks for tight turns, and an Ice block to start.' },
	{ id: 'surge', name: 'Lt. Surge', title: 'Vermilion City Gym Leader', type: 'Electric', art: 'lt_surge', unlock: 15,
		say: 'Small pieces that fit anywhere: the tightest mazes. His figurines\' moves come back sooner.',
		deck: deck([['one', 2], ['two', 3], ['three', 2], ['corner', 3], ['T']]), passive: 'tempo', pool: ['electric', 'steel', 'normal', 'quick', 'focus', 'grip'], card: Object.freeze({ shape: 'corner', bonus: 'dynamo' }),
		deck2: deck([['one', 3], ['two', 2], ['corner', 2], ['three', 3], ['I'], ['two', 1, 'red']]), deck2Say: 'Straight little pieces, one long one, and a Red panel to start.' },
	{ id: 'erika', name: 'Erika', title: 'Celadon City Gym Leader', type: 'Grass', art: 'erika', unlock: 20,
		say: 'One of everything, and more of it: an extra card each round and a bigger hand. A Grass block to start.',
		deck: deck([['I'], ['O'], ['T'], ['L'], ['J'], ['S'], ['Z'], ['three'], ['corner'], ['two'], ['one'], ['T', 1, 'grass']]), passive: 'garden', pool: ['grass', 'poison', 'bug', 'dealer', 'grip', 'focus'], card: Object.freeze({ shape: 'T', bonus: 'trellis' }),
		deck2: deck([['T', 3], ['S', 2], ['Z', 2], ['L'], ['J'], ['corner'], ['two'], ['O', 1, 'grass']]), deck2Say: 'A thicket: T, S and Z pieces that lock together, and a Grass block to start.' },
	{ id: 'lance', name: 'Lance', title: 'Pokémon League Champion', type: 'Dragon', art: 'lance', unlock: 25,
		say: 'Long pieces and a Tall one to start. Every wave pays him more gold, and a boss wave much more.',
		deck: deck([['I', 3], ['L', 2], ['J', 2], ['T', 2], ['S'], ['Z'], ['I', 1, 'tall']]), passive: 'champion', pool: ['dragon', 'flying', 'fire', 'purse', 'bounty', 'quick'], card: Object.freeze({ shape: 'I', bonus: 'dragonspire' }),
		deck2: deck([['I', 2], ['O', 2], ['L', 2], ['J', 2], ['three', 2], ['T'], ['L', 1, 'lava']]), deck2Say: 'Squarer and sturdier, with a Lava block to start.' },
	// (rules 21: a run recorded before them cannot be played as one of these two)
	{ id: 'koga', name: 'Koga', title: 'Fuchsia City Gym Leader', type: 'Poison', art: 'koga', unlock: 30, since: 21,
		say: 'Crooked pieces and Caltrops for the way itself. His Poison moves hit harder, and enemies stay held longer.',
		deck: deck([['S', 2], ['Z', 2], ['corner', 2], ['two', 2], ['L'], ['J'], ['three'], ['three', 1, 'caltrops']]), passive: 'venom', pool: ['poison', 'bug', 'ground', 'grip', 'scrap', 'bounty'], card: Object.freeze({ shape: 'corner', bonus: 'ninjaperch' }),
		deck2: deck([['corner', 3], ['three', 2], ['S'], ['Z'], ['T', 2], ['two', 2], ['two', 1, 'mud']]), deck2Say: 'More corners, and Mud for the way in place of Caltrops.' },
	{ id: 'sabrina', name: 'Sabrina', title: 'Saffron City Gym Leader', type: 'Psychic', art: 'sabrina', unlock: 35, since: 21,
		say: 'A balanced deck with a Blue panel to start. Her hand is bigger, and extra cards cost her less.',
		deck: deck([['T', 2], ['L', 2], ['J', 2], ['I'], ['O'], ['S'], ['Z'], ['three'], ['T', 1, 'blue']]), passive: 'foresight', pool: ['psychic', 'ice', 'normal', 'focus', 'bighand', 'dealer'], card: Object.freeze({ shape: 'T', bonus: 'mindspire' }),
		deck2: deck([['O', 2], ['T', 2], ['I', 2], ['L'], ['J'], ['S'], ['Z'], ['three'], ['O', 1, 'purple']]), deck2Say: 'Bigger blocks, and a Purple panel (moves from it never miss) to start.' },
].map((h) => Object.freeze(h)));
export const heroById = (id) => HEROES.find((h) => h.id === id) || null;
/** The heroes a player may pick, by the best wave they have cleared in Maze Builder (any map, any hero). */
export const heroOpen = (h, bestWave) => (bestWave | 0) >= h.unlock;

/** The total of one number across a run's passives (0 when it has none). */
export function perk(S, key) {
	let n = 0;
	for (const id of S.passives || []) n += (PASSIVES[id] && PASSIVES[id][key]) || 0;
	for (const p of pairsOf(S)) n += p[key] || 0;   // (rules 22: a pair held whole adds its own)
	return n;
}
/** How much harder (in %) a move of this type hits for this run. */
export function typePerk(S, type) {
	let n = 0;
	for (const id of S.passives || []) n += (PASSIVES[id] && PASSIVES[id].type && PASSIVES[id].type[type]) || 0;
	return n;
}
/** Is a plain block of this shape Tall for this run? */
export const tallPerk = (S, shape) => (S.passives || []).some((id) => PASSIVES[id] && PASSIVES[id].tall && PASSIVES[id].tall.includes(shape));

/** A hero's deck, shuffled for its n-th time through (from the seed). `cards`: the deck as it now is. */
export function shuffled(seed, n, cards) {
	const rng = makeRng(seed + ':td-deck' + n), out = cards.map((c) => ({ ...c }));
	for (let i = out.length - 1; i > 0; i--) { const j = Math.floor(rng() * (i + 1)); [out[i], out[j]] = [out[j], out[i]]; }
	return out;
}
/**
 * The passives offered after boss wave n: up to 3 the run does not have yet, two from the hero's own list and one from
 * everyone's (fewer when a list has run out). -> [passive id]
 */
export function perksOf(seed, n, heroId, owned, rev = 0) {
	const h = heroById(heroId);
	if (!h) return [];
	const rng = makeRng(seed + ':td-perk' + n), has = new Set(owned || []), out = [];
	const take = (list, k) => { const left = list.filter((id) => !has.has(id) && !out.includes(id)); while (k-- > 0 && left.length) out.push(left.splice(Math.floor(rng() * left.length), 1)[0]); };
	take(h.pool, 2);
	// (rules 22: from boss wave RARE_FROM the shared place is sometimes a RARE passive; by a die of its own, so the
	// rest of the offer is what it would have been)
	if (rev >= PASSIVE_REV && n >= RARE_FROM && out.length < 3) {
		const r2 = makeRng(seed + ':td-rare' + n), left = RARES.filter((id) => !has.has(id));
		if (left.length && Math.floor(r2() * 100) < RARE_CHANCE) out.push(left[Math.floor(r2() * left.length)]);
	}
	take(SHARED, 3 - out.length); take(h.pool, 3 - out.length);
	return out;
}
/** Problems with the data (a test's check): every deck card a real shape, every passive known, the unlocks in order. */
export function heroProblems(bonusOk) {
	const out = [];
	for (const h of HEROES) {
		if (h.deck.length < 8 || h.deck.length > 16) out.push(h.id + ': a deck of ' + h.deck.length);
		for (const c of h.deck) { if (!SHAPES[c.shape]) out.push(h.id + ': no such shape ' + c.shape); if (c.bonus && !bonusOk(c.bonus)) out.push(h.id + ': no such bonus ' + c.bonus); }
		for (const id of [h.passive, ...h.pool]) if (!PASSIVES[id]) out.push(h.id + ': no such passive ' + id);
		if (!HEROES_SIG.has(h.passive)) out.push(h.id + ': its signature ' + h.passive + ' is not in the signatures\' list');
		if (h.pool.length < 5) out.push(h.id + ': a short list');
	}
	if (HEROES[0].unlock !== 0 || HEROES.some((h, i) => i && h.unlock <= HEROES[i - 1].unlock)) out.push('the unlocks are not in order');
	for (const id of SHARED) if (!PASSIVES[id]) out.push('no such passive ' + id);
	return out;
}
