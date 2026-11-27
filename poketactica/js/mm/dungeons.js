// mm/dungeons.js — Mystery Maze's dungeons (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md, "Dungeons"). OURS: the generator and
// its settings format are the original's, but the list, names, themes, floor tables and Pokémon lists are written for
// Poketactica (owner: 8 named + 2 Lv 5 + the endless one at launch).
//   a dungeon: { id, name, theme, party (how many may enter), blurb, needs (the dungeon to clear first), reward: { first,
//               again } (stars), lv5? (everyone enters as a Lv 5 copy with an empty bag), endless?, hard? (even a
//               careful party expects to lose a figurine there: the camp says so), floors: [floor] }
// BALANCE (tools/poketactica/mm_explore.mjs, 2026-11-23 third pass, a careful party of the three starters and a bird
// evolved for its level, at each dungeon's suggested level, 20 runs each): figurines lost a run: Whisper Woods 0.1, Pebble
// Hollow 0.3, Tidepool Isles 0.3, Ember Rift 0.2, Frostspire 0.3, Sunken Ruins 0.6, Gale Tower 0.9, Starfall Spire 1.1,
// Sprout Trial 0.3 (of 3), Ancients' Descent 0.3 (of 1: the lone figurine comes back 14 times in 20). Starfall Spire,
// Ancients' Descent and the endless one are marked hard.
//   a floor:   { props (the generator's settings), water, vis (darkness: 0 lit, 2 dim, 1 the darkest), wild: [{ species,
//               level, w }], items: [{ id, w }], traps: [{ id, w }], sticky (% of items), boss?: { species, level } }
// A named dungeon ends on a BOSS floor: the boss stands on the stairs, and they open when it falls. The endless dungeon
// has no list: endlessFloor(n) makes floor n from its number alone, so any floor can be made again (replays).
// Pure data: node-tested (overworld/tests/poketactica_mm_dungeons_test.mjs).

import { HELD } from '../goods.js';
import { exitFloor, diveFloors, itemFoeLevel } from '../itemworld.js';

const BASE = { layout: 0, roomDensity: 5, floorConnectivity: 15, enemyDensity: 4, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
	itemDensity: 3, trapDensity: 2, numExtraHallways: 3, buriedItemDensity: 0, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
const W = (list) => list.map(([id, w]) => ({ id, w }));
export const COMMON_ITEMS = W([['stars', 30], ['apple', 22], ['oran', 18], ['pecha', 4], ['cheri', 3], ['rawst', 3], ['chesto', 3], ['sleepseed', 4], ['blastseed', 4], ['stunseed', 3], ['warpseed', 3], ['quickseed', 2],
	['ironthorn', 6], ['gravelrock', 5], ['elixir', 3], ['escapeorb', 2], ['luminousorb', 1], ['slumberorb', 1], ['petrifyorb', 1], ['trawlorb', 1], ['bigapple', 4], ['sitrus', 2], ['maxelixir', 1]]);
export const EASY_TRAPS = W([['chestnut', 4], ['mud', 3], ['spin', 2], ['slow', 2], ['wonder', 2], ['sticky', 1], ['warp', 1]]);
export const MID_TRAPS = W([['chestnut', 3], ['mud', 3], ['spin', 3], ['slow', 3], ['wonder', 2], ['sticky', 2], ['warp', 2], ['slumber', 2], ['poison', 2], ['spike', 2], ['gust', 2], ['grimy', 1], ['seal', 1], ['ppzero', 1], ['summon', 1]]);
export const HARD_TRAPS = W([['spike', 4], ['poison', 3], ['slumber', 3], ['spin', 3], ['slow', 3], ['seal', 3], ['ppzero', 3], ['summon', 3], ['gust', 2], ['warp', 2], ['sticky', 2], ['grimy', 2], ['mud', 2], ['wonder', 2],
	['selfdestruct', 2], ['explosion', 1], ['pitfall', 2], ['pokemon', 1], ['chestnut', 1]]);

/**
 * RULES 18 (the improvement plan, items 5 and 6): what joins every floor's list. 'find' is a held item of the camp's
 * (mm/items.js rollItem picks which, by the floor); the rest are the new food, the Vigor Pellet and the wands. A run or
 * replay recorded before it keeps the lists without them (dungeonAt).
 */
export const FINDS_REV = 18, OWN_LOOT_REV = 15;
/**
 * RULES 19 (the improvement plan, item 10): a dungeon's WEATHER. A recipe's `sky: [kind, from, every]` puts that weather
 * on every `every`th floor from that far into the dungeon (0..1), never on the boss's. It is the battle's weather (rain
 * and sun bend Water and Fire moves, hail and sand the usual rules) for the whole floor, and hail and sand wear down
 * whoever is not at home in them (mm/turn.js). A run recorded before it has clear skies.
 */
export const WEATHER_REV = 19;
/**
 * RULES 20 (the improvement plan, item 11): SPECIAL FLOORS. Every fourth floor from the third (never the boss's) is one of
 *   vault     a far room full of piles of stars, and guards standing over them, awake
 *   locked    a room behind locked doors with the floor's best things in it, and a Brass Key lying somewhere else
 *   sleepers  more wild Pokémon than usual and more to pick up, and every one of them asleep until you come beside it
 * in turn. mm/turn.js makes them on the floor as generated. A run recorded before it has none; a recipe's `special: 0`
 * (the first dungeon) has none either.
 */
export const SPECIAL_REV = 20;
/**
 * RULES 21 (the improvement plan, item 12): REAL BOSS FLOORS. A boss's recipe may name its HELPERS ([species, how
 * many]: they stand beside it, awake, three levels under it) and one TRICK it plays once, on its own turn:
 *   rage   at half HP it moves at double speed for the rest of the fight
 *   mend   at a third of its HP it takes a quarter of its HP back (a third made the two last bosses' fights too long: see the plan)
 *   rally  at half HP it calls two more helpers to its side
 * The two last story bosses have a trick and no helpers at the start: measured, a helper beside Dragonite or Tyranitar
 * cost the auto-explorer two more clears in twenty than the trick alone (the plan has the numbers).
 * mm/turn.js plays them. A run recorded before it meets the boss alone, as it was.
 */
export const BOSS_REV = 21;
export const BOSS_TRICKS = Object.freeze({ rage: { at: 2, name: 'Rage', say: 'At half HP it moves twice as fast.' }, mend: { at: 3, name: 'Mend', say: 'At a third of its HP it heals a quarter back, once.' }, rally: { at: 2, name: 'Rally', say: 'At half HP it calls two more to its side.' } });
export const HELPER_UNDER = 3, RALLY_N = 2, MEND_PART = 4;
export const SPECIALS = Object.freeze(['vault', 'locked', 'sleepers']);
export const SPECIAL_NAME = Object.freeze({ vault: 'A gold vault', locked: 'A locked room', sleepers: 'A floor of sleepers' });
export const SPECIAL_SAY = Object.freeze({ vault: 'Somewhere on this floor is a room full of stars, and guards over them.', locked: 'A room here is locked. Its key lies somewhere on this floor.', sleepers: 'Everything here is asleep until you come beside it. Tread around them.' });
/** Which special floor is floor index i (0 the first) of n, or null. */
export const specialAt = (i, n) => (i >= 2 && i % 4 === 2 ? SPECIALS[((i >> 2) + n) % 3] : null);
export const WEATHER_NAME = Object.freeze({ rain: 'Rain', sun: 'Harsh sun', hail: 'Hail', sand: 'A sandstorm' });
export const WEATHER_SAY = Object.freeze({ rain: 'Water moves hit harder, Fire moves softer.', sun: 'Fire moves hit harder, Water moves softer.', hail: 'It wears down everyone but Ice types, a little every few turns.', sand: 'It wears down everyone but Rock, Ground and Steel types, a little every few turns.' });
export const NEW_ITEMS = W([['find', 2], ['glazedapple', 3], ['waxfeast', 1], ['vigorseed', 2], ['dozewand', 2], ['slowwand', 2], ['banishwand', 1], ['swapwand', 1]]);
export const ALL_ITEMS = [...COMMON_ITEMS, ...NEW_ITEMS];
/**
 * A DUNGEON'S OWN items and traps (MM_RULES_REV 15; improvement plan, 2026-11-25: one list served every floor of every
 * dungeon). A recipe's `loot` and `hazard` bend the shared lists: [id, x] makes one already in the list x times as
 * common (0 takes it out); one not in it joins with the weight x. A hazard may wait: [id, x, from] only from that far
 * into the dungeon (0..1), so a blast is never under a new party's feet on the first floor.
 */
function own(list, mine, t = 1) {
	if (!mine || !mine.length) return list;
	const live = mine.filter(([, , from]) => t >= (from || 0)), m = new Map(live.map(([id, x]) => [id, x]));
	const out = list.map((e) => (m.has(e.id) ? { id: e.id, w: Math.round(e.w * m.get(e.id)) } : e)).filter((e) => e.w > 0);
	for (const [id, x] of live) if (x > 0 && !list.some((e) => e.id === id)) out.push({ id, w: x });
	return out;
}
/**
 * A dungeon's floors from a short recipe: n floors, levels rising from lo to hi, the layouts in turn, and a pool of wild
 * Pokémon each with the stretch of the dungeon it lives in ([species, from 0..1, to 0..1, weight]). The last floor is the
 * boss's: one plain layout, no shop or Monster House.
 */
function floors(n, c, rev = SPECIAL_REV) {
	const plain = rev < OWN_LOOT_REV, shared = rev < FINDS_REV ? COMMON_ITEMS : ALL_ITEMS;
	// (a dungeon's own taste for a rules-18 item is not part of the floors an older run was played on)
	const sky = rev >= WEATHER_REV && c.sky ? c.sky : null;
	const loot = rev < FINDS_REV && c.loot ? c.loot.filter(([id]) => !NEW_ITEMS.some((e) => e.id === id)) : c.loot;
	const out = Array.from({ length: n }, (_, i) => {
		const t = n > 1 ? i / (n - 1) : 0, last = !!c.boss && i === n - 1, lv = Math.round(c.lo + (c.hi - c.lo) * t);
		const wild = c.pool.filter(([, a, b]) => t >= a && t <= b).map(([species, , , w, up]) => ({ species, level: lv + (up || 0), w: w || 1 }));
		const liquid = !!c.liquid && i >= 1;
		const sp = rev >= SPECIAL_REV && !last && c.special !== 0 ? specialAt(i, n) : null, more = sp === 'sleepers' ? 3 : 0;
		return {
			props: { ...BASE, layout: last ? 7 : c.layouts[i % c.layouts.length], roomDensity: 4 + Math.round(4 * t), floorConnectivity: 12 + Math.round(20 * t), enemyDensity: last && c.bossAlone ? 0 : 3 + Math.round((c.foes || 5) * t) + more,
				itemDensity: last ? 2 : 3 + (i % 3 === 0 ? 1 : 0) + (more ? 2 : 0), trapDensity: last ? 0 : Math.round((c.trapMax || 8) * t), numExtraHallways: 2 + (i % 4), allowDeadEnds: i % 5 === 4,
				roomFlags: (liquid ? 1 : 0) | (t > 0.3 ? 4 : 0), standaloneLakeDensity: liquid ? 1 + (i % 2) : 0, secondaryStructuresBudget: t > 0.25 && !last ? 1 + (i % 3) : 0,
				kecleonShopChance: last || i < 2 ? 0 : c.shop == null ? 7 : c.shop, monsterHouseChance: last || t < 0.3 ? 0 : Math.round((c.house == null ? 5 : c.house) * t) },
			water: c.liquid !== 'lava', vis: c.dark && t >= c.dark ? (t > 0.75 ? 1 : 2) : 0, sticky: t > 0.5 ? 5 : 0,
			wild: wild.length ? wild : [{ species: c.pool[0][0], level: lv, w: 1 }], items: plain ? COMMON_ITEMS : own(shared, loot), traps: plain ? (t < 0.34 ? EASY_TRAPS : t < 0.7 ? MID_TRAPS : HARD_TRAPS) : own(t < 0.34 ? EASY_TRAPS : t < 0.7 ? MID_TRAPS : HARD_TRAPS, c.hazard, t), keeper: Math.max(90, c.hi + 40),
			...(sky && !last && t >= sky[1] && i % (sky[2] || 1) === 0 ? { weather: sky[0] } : {}),
			...(sp ? { special: sp } : {}),
			...(last ? { boss: c.boss, noRecruit: true } : {}),
		};
	});
	// (the recipe rides along, unseen: dungeonAt re-makes the floors as an older revision knew them)
	Object.defineProperty(out, 'recipe', { value: [n, c] });
	return out;
}
const ALL = [0, 0, 1], LATE = [0.5, 1, 1], EARLY = [0, 0.6, 1], MID = [0.25, 0.8, 1];
const P = (species, [a, b], w = 1, up = 0) => [species, a, b, w, up];
const SPROUT_POOL = [P('caterpie', EARLY, 3), P('pidgey', EARLY, 3), P('rattata', EARLY, 3), P('oddish', ALL, 2), P('spearow', MID, 2), P('ekans', MID, 2), P('mankey', MID, 2), P('gloom', LATE, 2), P('pidgeotto', LATE, 2), P('raticate', LATE, 2), P('ivysaur', LATE, 1)];
const ANCIENT_POOL = [P('zubat', EARLY, 3), P('geodude', EARLY, 3), P('paras', EARLY, 2), P('sandshrew', EARLY, 2), P('machop', MID, 2), P('onix', MID, 2), P('golbat', MID, 2), P('graveler', MID, 2), P('kabuto', MID, 1), P('omanyte', MID, 1),
	P('machoke', LATE, 2), P('rhyhorn', LATE, 2), P('kabutops', LATE, 1), P('omastar', LATE, 1), P('golem', LATE, 1), P('marowak', LATE, 2)];

export const DUNGEONS = [
	{ id: 'whisper-woods', name: 'Whisper Woods', theme: 'forest', party: 4, blurb: 'A quiet wood to learn the ropes.', needs: null, reward: { first: 150, again: 40 },
		floors: floors(5, { lo: 2, hi: 4, layouts: [1, 1, 11, 11], liquid: 'water', trapMax: 3, foes: 2, shop: 0, house: 0, special: 0, boss: { species: 'butterfree', level: 5 }, loot: [['apple', 1.5], ['oran', 1.5], ['pecha', 2], ['sleepseed', 2]], hazard: [['chestnut', 2], ['warp', 0]],
			pool: [P('caterpie', ALL, 4), P('pidgey', ALL, 3), P('rattata', ALL, 3), P('weedle', EARLY, 2), P('oddish', LATE, 2), P('bellsprout', LATE, 2)] }) },
	{ id: 'pebble-hollow', name: 'Pebble Hollow', theme: 'cave', party: 4, blurb: 'Tunnels full of rock and wings.', needs: 'whisper-woods', reward: { first: 250, again: 60 },
		floors: floors(8, { lo: 6, hi: 11, layouts: [11, 0, 6, 11, 8], sky: ['sand', 0.4, 3], trapMax: 5, foes: 3, boss: { species: 'onix', level: 12, helpers: ['geodude', 2] }, loot: [['gravelrock', 3], ['ironthorn', 2], ['blastseed', 2], ['luminousorb', 2]], hazard: [['chestnut', 3], ['pitfall', 2, 0.3], ['slow', 0]],
			pool: [P('zubat', ALL, 4), P('geodude', ALL, 3), P('sandshrew', ALL, 2), P('diglett', EARLY, 2), P('paras', MID, 2), P('machop', LATE, 2), P('cubone', LATE, 1)] }) },
	{ id: 'tidepool-isles', name: 'Tidepool Isles', theme: 'islands', party: 4, blurb: 'Sand, surf and long swims: bring a swimmer.', needs: 'pebble-hollow', reward: { first: 400, again: 90 },
		floors: floors(10, { lo: 11, hi: 18, layouts: [0, 10, 11, 3, 0], sky: ['rain', 0.2, 2], liquid: 'water', trapMax: 6, foes: 4, boss: { species: 'starmie', level: 19, helpers: ['staryu', 2], trick: 'mend' }, loot: [['oran', 1.5], ['quickseed', 3], ['trawlorb', 4], ['gravelrock', 0], ['cheri', 2], ['swapwand', 3]], hazard: [['mud', 2], ['slow', 2], ['warp', 2], ['chestnut', 0]],
			pool: [P('krabby', ALL, 3), P('psyduck', ALL, 3), P('poliwag', ALL, 3), P('tentacool', ALL, 2), P('shellder', EARLY, 2), P('staryu', MID, 2), P('horsea', LATE, 2), P('wingull', LATE, 2), P('slowpoke', MID, 1)] }) },
	{ id: 'ember-rift', name: 'Ember Rift', theme: 'volcano', party: 4, blurb: 'Rivers of lava cut the rooms apart.', needs: 'tidepool-isles', reward: { first: 600, again: 130 },
		floors: floors(12, { lo: 17, hi: 26, layouts: [0, 4, 8, 0, 9, 3], sky: ['sun', 0.3, 2], liquid: 'lava', trapMax: 8, foes: 4, boss: { species: 'magmar', level: 27, helpers: ['slugma', 2], trick: 'rage' }, loot: [['rawst', 4], ['blastseed', 3], ['elixir', 2], ['apple', 0.7]], hazard: [['selfdestruct', 3, 0.3], ['explosion', 1, 0.6], ['mud', 0], ['spike', 2]],
			pool: [P('vulpix', ALL, 3), P('growlithe', ALL, 3), P('ponyta', ALL, 2), P('slugma', ALL, 3), P('numel', MID, 2), P('houndour', LATE, 2), P('geodude', EARLY, 2), P('rhyhorn', LATE, 1), P('koffing', MID, 2)] }) },
	{ id: 'frostspire', name: 'Frostspire', theme: 'snow', party: 4, blurb: 'A frozen climb. The wind bites.', needs: 'ember-rift', reward: { first: 850, again: 180 },
		floors: floors(14, { lo: 25, hi: 34, layouts: [0, 8, 10, 0, 6, 4, 0], sky: ['hail', 0.2, 2], liquid: 'water', trapMax: 9, foes: 4, boss: { species: 'glalie', level: 35, helpers: ['snorunt', 2], trick: 'rally' }, loot: [['chesto', 3], ['sitrus', 2], ['slumberorb', 3], ['bigapple', 1.5], ['warpseed', 0], ['dozewand', 2], ['slowwand', 2]], hazard: [['slow', 3], ['slumber', 2], ['gust', 3], ['poison', 0]],
			pool: [P('swinub', ALL, 3), P('snorunt', ALL, 3), P('spheal', ALL, 3), P('seel', EARLY, 2), P('sneasel', MID, 2), P('jynx', LATE, 1), P('piloswine', LATE, 2), P('delibird', MID, 1), P('sealeo', LATE, 2)] }) },
	{ id: 'sunken-ruins', name: 'Sunken Ruins', theme: 'ruins', party: 4, blurb: 'Dark halls. You see only what is close.', needs: 'frostspire', reward: { first: 1150, again: 240 },
		floors: floors(16, { lo: 33, hi: 44, layouts: [0, 3, 0, 9, 8, 4, 0, 10], dark: 0.3, trapMax: 10, foes: 4, boss: { species: 'gengar', level: 45, helpers: ['haunter', 2], trick: 'rage' }, loot: [['luminousorb', 8], ['escapeorb', 2], ['petrifyorb', 3], ['pecha', 2], ['gravelrock', 0.5]], hazard: [['seal', 3], ['ppzero', 3], ['summon', 2], ['poison', 2], ['chestnut', 0]],
			pool: [P('gastly', EARLY, 3), P('haunter', ALL, 3), P('misdreavus', ALL, 2), P('duskull', ALL, 2), P('natu', EARLY, 2), P('xatu', LATE, 2), P('baltoy', MID, 2), P('claydol', LATE, 1), P('golbat', ALL, 2), P('sableye', MID, 1)] }) },
	{ id: 'gale-tower', name: 'Gale Tower', theme: 'tower', party: 4, blurb: 'Twenty floors up, with something old at the top.', needs: 'sunken-ruins', reward: { first: 1500, again: 320 },
		floors: floors(20, { lo: 43, hi: 56, layouts: [0, 8, 4, 0, 9, 3, 0, 10, 6], sky: ['sand', 0.5, 4], trapMax: 11, foes: 5, boss: { species: 'dragonite', level: 57, trick: 'mend' }, loot: [['warpseed', 3], ['quickseed', 3], ['gravelrock', 2], ['cheri', 3], ['elixir', 1.5], ['find', 1.5], ['banishwand', 2]], hazard: [['gust', 4], ['warp', 3], ['pitfall', 2, 0.2], ['spin', 2], ['mud', 0]],
			pool: [P('pidgeotto', EARLY, 3), P('fearow', ALL, 3), P('skarmory', MID, 2), P('swablu', EARLY, 2), P('altaria', LATE, 2), P('dratini', MID, 1), P('dragonair', LATE, 1), P('magneton', ALL, 2), P('electabuzz', MID, 2), P('scyther', LATE, 2), P('noctowl', ALL, 2)] }) },
	{ id: 'starfall-spire', hard: true, name: 'Starfall Spire', theme: 'spire', party: 4, blurb: 'Thirty floors. The last dungeon on the map.', needs: 'gale-tower', reward: { first: 2500, again: 500 },
		floors: floors(30, { lo: 55, hi: 68, layouts: [0, 4, 8, 0, 3, 9, 0, 10, 6, 0, 11], dark: 0.6, trapMax: 12, foes: 3, house: 8, boss: { species: 'tyranitar', level: 69, helpers: ['pupitar', 0], trick: 'rally' }, loot: [['maxelixir', 3], ['sitrus', 2.5], ['petrifyorb', 3], ['slumberorb', 3], ['escapeorb', 2], ['luminousorb', 3], ['find', 2], ['waxfeast', 2]], hazard: [['pokemon', 2, 0.3], ['seal', 2], ['ppzero', 2], ['chestnut', 0]],
			pool: [P('larvitar', EARLY, 2), P('pupitar', MID, 2), P('aron', EARLY, 2), P('lairon', MID, 2), P('aggron', LATE, 1), P('beldum', EARLY, 2), P('metang', LATE, 2), P('absol', ALL, 2), P('houndoom', MID, 2), P('solrock', ALL, 2), P('lunatone', ALL, 2),
				P('alakazam', LATE, 1), P('machamp', LATE, 1), P('rhydon', MID, 2), P('gyarados', LATE, 1)] }) },
	// ---- everyone enters as a Lv 5 copy of itself with an empty bag, and levels up inside
	{ id: 'sprout-trial', name: 'Sprout Trial', theme: 'meadow', party: 3, lv5: true, blurb: 'Lv 5 and an empty bag: 20 floors on wits alone.', needs: 'tidepool-isles', reward: { first: 900, again: 250 },
		floors: floors(20, { lo: 2, hi: 12, layouts: [1, 11, 0, 6, 11, 8, 0], liquid: 'water', trapMax: 8, foes: 3, house: 0, boss: { species: 'venusaur', level: 13 }, loot: [['apple', 1.5], ['oran', 1.5], ['sleepseed', 2], ['ironthorn', 2], ['stars', 0.5]], hazard: [['chestnut', 2], ['mud', 2], ['explosion', 0], ['selfdestruct', 0]],   // (no Monster Houses: three Lv 5s with an empty bag have no answer to one)
			pool: SPROUT_POOL }) },
	// (25 floors, not 50: owner, 2026-11-23, "shorten it if 50 floors alone cannot be made fair". One figurine has no one to cover it, so: lit, few wild Pokémon, no Monster Houses.)
	{ id: 'ancients-descent', hard: true, name: 'Ancients\' Descent', theme: 'cave', party: 1, lv5: true, blurb: 'Alone, from Lv 5, 25 floors down.', needs: 'sunken-ruins', reward: { first: 3000, again: 800 },
		floors: floors(25, { lo: 2, hi: 12, layouts: [1, 11, 0, 6, 8, 0, 4, 3, 0, 9, 10], trapMax: 8, foes: 1, house: 0, bossAlone: true, boss: { species: 'aerodactyl', level: 13 }, loot: [['oran', 2], ['sitrus', 2], ['escapeorb', 2], ['petrifyorb', 2], ['stars', 0.5], ['dozewand', 4], ['slowwand', 2], ['glazedapple', 3], ['waxfeast', 4]], hazard: [['spike', 2], ['pitfall', 2, 0.2], ['summon', 0], ['pokemon', 0], ['explosion', 0]],
			pool: ANCIENT_POOL }) },
	// ---- no bottom
	{ id: 'the-abyss', hard: true, name: 'The Abyss', theme: 'spire', party: 4, endless: true, blurb: 'It never ends. How deep can you go?', needs: 'frostspire', reward: { first: 0, again: 0 }, floors: [] },
];
/**
 * MILESTONES IN THE ABYSS (Plans/POKETACTICA_MODES_PLAN.md item M2): it was "endless with two marks". Reaching floors 10,
 * 25, 50, 75 and 100 each opens something to KEEP: one more thing in the kit every Abyss run then starts with, free. The
 * kit is worked out from the record the collection already keeps (the deepest floor reached, synced), so there is
 * nothing new to store. A kit item not used stays in the Abyss: it is never carried out into the storage (it would be
 * a free item a run otherwise).
 */
export const ABYSS_ID = 'the-abyss';
export const ABYSS_MARKS = Object.freeze([
	{ floor: 10, item: 'oran' }, { floor: 25, item: 'escapeorb' }, { floor: 50, item: 'maxelixir' }, { floor: 75, item: 'waxfeast' }, { floor: 100, item: 'sitrus' },
]);
/** The kit an Abyss run starts with, for a deepest floor reached: [item id], in the milestones' order. */
export const abyssKit = (best) => ABYSS_MARKS.filter((m) => (best | 0) >= m.floor).map((m) => m.item);
/** The milestones a run crossed: those above the old record and at or under the floor it reached. */
export const abyssCrossed = (was, floor) => ABYSS_MARKS.filter((m) => m.floor > (was | 0) && m.floor <= (floor | 0));
/**
 * RECRUITS THAT MATTER (plan item M3): what can be recruited where. A dungeon's kinds are the wild Pokémon of its floors;
 * the ones NO OTHER dungeon has are "only here" (worked out from the floors as they are: nothing to keep in step).
 */
const kindsMemo = new Map();
export function kindsOf(d) {
	if (!d || d.endless) return [];
	if (!kindsMemo.has(d.id)) kindsMemo.set(d.id, [...new Set(d.floors.flatMap((f) => (f.noRecruit ? [] : (f.wild || []).map((w) => w.species))))]);
	return kindsMemo.get(d.id);
}
export function onlyHere(d) {
	const others = new Set(DUNGEONS.filter((o) => o !== d && !o.endless && o.id !== d.id).flatMap((o) => kindsOf(o)));
	return kindsOf(d).filter((sp) => !others.has(sp));
}
export const SUGGEST_OVER = 2, STARTER_OK = 5;   // (the first dungeon is for a new player's Lv 5 starters)
/** The levels a dungeon's wild Pokémon run through, and its boss's: what to weigh before going in. */
export function dungeonLevels(d) {
	if (d.endless) return null;
	const all = d.floors.flatMap((f) => f.wild.map((w) => w.level)), boss = d.floors[d.floors.length - 1].boss;
	// (suggest: the party level the auto-explorer got through at with few losses, tools/poketactica/mm_explore.mjs: a
	// little over the boss. A Lv 5 dungeon has none: everyone starts at 5.)
	return { special: d.floors.some((f) => f.special), sky: (d.floors.find((f) => f.weather) || {}).weather || null, lo: Math.min(...all), hi: Math.max(...all), boss: boss ? boss.level : 0, bossSpecies: boss ? boss.species : null, bossHelpers: (boss && boss.helpers && boss.helpers[1] > 0 && boss.helpers) || null, bossTrick: (boss && boss.trick) || null, suggest: d.lv5 || !boss ? 0 : d.needs ? boss.level + SUGGEST_OVER : STARTER_OK };
}
/**
 * The ITEM WORLD played as a Mystery Maze (owner, 2026-11-24; itemworld.js): a dive into a held item, from its level to
 * its next exit floor, as a dungeon of that many floors. Its id is 'iw-<item>-<level>', so a run's recipe finds it again
 * (a resume, a replay, a friend watching). The wild Pokémon are those of one of the eight story dungeons, the deeper the
 * item the later the dungeon, at the item's own levels (a costlier item is a harder world); the last floor is the exit,
 * that dungeon's boss. It pays no prize and keeps no record: the item's level is what it is for.
 */
const IW_TIERS = ['whisper-woods', 'pebble-hollow', 'tidepool-isles', 'ember-rift', 'frostspire', 'sunken-ruins', 'gale-tower', 'starfall-spire'];
const IW_ID = /^iw-([a-z0-9]{1,24})-(\d{1,2})$/, IW_LAYOUTS = [0, 11, 8, 6, 4, 3, 10, 9, 0, 1];
const iwMade = {};
export const itemDungeonId = (itemId, from) => 'iw-' + itemId + '-' + from;
export function itemDungeon(itemId, from) {
	from = from | 0;
	const key = itemDungeonId(itemId, from), list = HELD[itemId] && from >= 1 ? diveFloors(from) : [];
	if (!list.length) return null;
	if (iwMade[key]) return iwMade[key];
	const exit = exitFloor(from), tier = DUNGEONS.find((d) => d.id === IW_TIERS[Math.min(IW_TIERS.length - 1, Math.floor(from / 12.5))]);
	const seen = new Map();
	for (const f of tier.floors) for (const w of f.wild) seen.set(w.species, Math.max(seen.get(w.species) || 0, w.w || 1));
	const boss = tier.floors[tier.floors.length - 1].boss;
	return (iwMade[key] = { id: key, name: `${HELD[itemId].name} · floors ${list[0]} to ${exit}`, theme: tier.theme, party: 4, needs: null, reward: { first: 0, again: 0 }, noRecord: true,
		blurb: `Inside the ${HELD[itemId].name}. Reach the last floor and beat what guards the exit: the item becomes level ${exit}.`,
		iw: { id: itemId, from, exit },
		floors: floors(list.length, { lo: itemFoeLevel(list[0], itemId), hi: itemFoeLevel(exit, itemId), layouts: IW_LAYOUTS, trapMax: 8, foes: 4, boss: { species: boss.species, level: itemFoeLevel(exit, itemId, true) }, pool: [...seen].map(([sp, w]) => P(sp, ALL, w)) }) });
}
export const dungeonById = (id) => DUNGEONS.find((d) => d.id === id) || ((m) => (m ? itemDungeon(m[1], +m[2]) : null))(IW_ID.exec(String(id || ''))) || null;
/**
 * A dungeon AS A RUN OF THAT RULES REVISION KNEW IT (MM_RULES_REV, kept in the run's recipe). A dungeon's floors are part
 * of what a recorded run replays by, exactly as the rules are: a run saved half way down, or a replay, re-runs its
 * actions on the floors it was played on. So when a dungeon changes, the old one stays here.
 *   before rev 10: Sprout Trial had Monster Houses; Ancients' Descent was 50 floors, dark, levels 2-20, boss Lv 21
 *   before rev 12: The Abyss's Monster Houses ran up to 30% a floor
 *   before rev 15: every dungeon had the same items and the same traps (no `loot`, no `hazard`)
 *   before rev 18: no finds, wands, Vigor Pellets or the two new foods on any floor (NEW_ITEMS)
 *   before rev 19: clear skies on every floor (no `sky`)
 *   before rev 20: no special floors
 */
const OLD = {
	'sprout-trial': [10, () => floors(20, { lo: 2, hi: 12, layouts: [1, 11, 0, 6, 11, 8, 0], liquid: 'water', trapMax: 8, foes: 3, boss: { species: 'venusaur', level: 13 }, pool: SPROUT_POOL }, 14)],
	'ancients-descent': [10, () => floors(50, { lo: 2, hi: 20, layouts: [1, 11, 0, 6, 8, 0, 4, 3, 0, 9, 10], dark: 0.5, trapMax: 12, foes: 2, boss: { species: 'aerodactyl', level: 21 }, pool: ANCIENT_POOL }, 14)],
};
const oldMade = {};
export function dungeonAt(id, rev) {
	const d = dungeonById(id);
	if (!d || !(rev > 0)) return d;
	if (d.endless) return rev < SPECIAL_REV ? { ...d, ...(rev < 12 ? { oldHouses: true } : {}), ...(rev < FINDS_REV ? { oldItems: true } : {}), ...(rev < WEATHER_REV ? { clearSky: true } : {}), plainFloors: true } : d;
	const o = OLD[id];
	if (o && rev < o[0]) return { ...d, floors: oldMade[id] || (oldMade[id] = o[1]()) };
	// (before rev 18: the floors without the new items; before rev 15: with the shared lists and no more)
	const rc = rev < SPECIAL_REV && d.floors.recipe, as = rev < OWN_LOOT_REV ? 14 : rev < FINDS_REV ? 17 : rev < WEATHER_REV ? 18 : 19;
	if (rc) return { ...d, floors: oldMade[as + ':' + id] || (oldMade[as + ':' + id] = floors(rc[0], rc[1], as)) };
	return d;
}
/** Is a dungeon open to a player who has cleared these? (its `needs`, or nothing) */
export const dungeonOpen = (d, cleared) => !d.needs || !!(cleared && cleared[d.needs]);

// the endless dungeon's wild Pokémon, by depth: each tier joins as the last one fades
const ABYSS = [['rattata', 'zubat', 'geodude', 'oddish', 'spearow'], ['machop', 'gastly', 'koffing', 'krabby', 'growlithe'], ['haunter', 'graveler', 'golbat', 'ponyta', 'magneton'], ['scyther', 'electabuzz', 'magmar', 'rhydon', 'kadabra'],
	['machamp', 'gengar', 'golem', 'alakazam', 'gyarados'], ['dragonair', 'aggron', 'metang', 'houndoom', 'absol'], ['dragonite', 'tyranitar', 'metagross', 'salamence', 'slaking']];
/** Floor n (1, 2, 3 ...) of the endless dungeon: every layout in turn, levels and dangers rising without end. */
const ABYSS_SKY = ['rain', 'sand', 'sun', 'hail'];
export function endlessFloor(n, oldHouses = false, oldItems = false, clearSky = false, plainFloors = false) {
	const k = Math.max(1, n | 0), tier = Math.min(ABYSS.length - 1, Math.floor((k - 1) / 6)), lv = Math.min(999, 4 + 2 * k), lava = (k % 7) >= 5, deep = Math.min(1, k / 60);
	const sp = !plainFloors && k >= 3 && k % 5 === 3 ? SPECIALS[Math.floor(k / 5) % 3] : null, more = sp === 'sleepers' ? 3 : 0;
	const wild = [...ABYSS[tier].map((species) => ({ species, level: lv, w: 3 })), ...(tier > 0 ? ABYSS[tier - 1].map((species) => ({ species, level: lv, w: 1 })) : [])];
	return {
		props: { ...BASE, layout: [0, 1, 11, 3, 4, 6, 8, 9, 10, 7, 0, 5][(k - 1) % 12], roomDensity: 4 + (k % 5), floorConnectivity: 12 + (k % 20), enemyDensity: Math.min(12, 3 + Math.floor(k / 4)) + more, itemDensity: 3 + (k % 3) + (more ? 2 : 0),
			trapDensity: Math.min(14, Math.floor(k / 2)), numExtraHallways: k % 6, allowDeadEnds: k % 4 === 3, roomFlags: (k % 3 ? 1 : 0) | 4, standaloneLakeDensity: k % 3, secondaryStructuresBudget: k % 4,
			kecleonShopChance: 6, monsterHouseChance: oldHouses ? Math.min(30, k) : Math.min(8, Math.floor(k / 3)) },   // (it was min(30, k): by floor 15 one floor in seven sprang 8 to 11 Pokémon on the party, and that, not the depth, ended most runs)
		water: !lava, vis: k > 20 && k % 5 === 0 ? 1 : k > 10 && k % 3 === 0 ? 2 : 0, sticky: Math.min(10, Math.floor(k / 5)), wild, ...(sp ? { special: sp } : {}), ...(!clearSky && k >= 4 && k % 4 === 2 ? { weather: ABYSS_SKY[Math.floor(k / 4) % 4] } : {}), items: oldItems ? COMMON_ITEMS : ALL_ITEMS, traps: deep < 0.15 ? EASY_TRAPS : deep < 0.4 ? MID_TRAPS : HARD_TRAPS, keeper: Math.min(999, lv + 60),
	};
}
