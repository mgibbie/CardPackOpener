// mm/dungeons.js — Mystery Maze's dungeons (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md, "Dungeons"). OURS: the generator and
// its settings format are the original's, but the list, names, themes, floor tables and Pokémon lists are written for
// Poketactica (owner: 8 named + 2 Lv 5 + the endless one at launch).
//   a dungeon: { id, name, theme, party (how many may enter), blurb, needs (the dungeon to clear first), reward: { first,
//               again } (stars), lv5? (everyone enters as a Lv 5 copy with an empty bag), endless?, floors: [floor] }
//   a floor:   { props (the generator's settings), water, vis (darkness: 0 lit, 2 dim, 1 the darkest), wild: [{ species,
//               level, w }], items: [{ id, w }], traps: [{ id, w }], sticky (% of items), boss?: { species, level } }
// A named dungeon ends on a BOSS floor: the boss stands on the stairs, and they open when it falls. The endless dungeon
// has no list: endlessFloor(n) makes floor n from its number alone, so any floor can be made again (replays).
// Pure data: node-tested (overworld/tests/poketactica_mm_dungeons_test.mjs).

const BASE = { layout: 0, roomDensity: 5, floorConnectivity: 15, enemyDensity: 4, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
	itemDensity: 3, trapDensity: 2, numExtraHallways: 3, buriedItemDensity: 0, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
const W = (list) => list.map(([id, w]) => ({ id, w }));
export const COMMON_ITEMS = W([['stars', 30], ['apple', 14], ['oran', 14], ['pecha', 4], ['cheri', 3], ['rawst', 3], ['chesto', 3], ['sleepseed', 4], ['blastseed', 4], ['stunseed', 3], ['warpseed', 3], ['quickseed', 2],
	['ironthorn', 6], ['gravelrock', 5], ['elixir', 3], ['escapeorb', 2], ['luminousorb', 1], ['slumberorb', 1], ['petrifyorb', 1], ['trawlorb', 1], ['bigapple', 2], ['sitrus', 1], ['maxelixir', 1]]);
export const EASY_TRAPS = W([['chestnut', 4], ['mud', 3], ['spin', 2], ['slow', 2], ['wonder', 2], ['sticky', 1], ['warp', 1]]);
export const MID_TRAPS = W([['chestnut', 3], ['mud', 3], ['spin', 3], ['slow', 3], ['wonder', 2], ['sticky', 2], ['warp', 2], ['slumber', 2], ['poison', 2], ['spike', 2], ['gust', 2], ['grimy', 1], ['seal', 1], ['ppzero', 1], ['summon', 1]]);
export const HARD_TRAPS = W([['spike', 4], ['poison', 3], ['slumber', 3], ['spin', 3], ['slow', 3], ['seal', 3], ['ppzero', 3], ['summon', 3], ['gust', 2], ['warp', 2], ['sticky', 2], ['grimy', 2], ['mud', 2], ['wonder', 2],
	['selfdestruct', 2], ['explosion', 1], ['pitfall', 2], ['pokemon', 1], ['chestnut', 1]]);

/**
 * A dungeon's floors from a short recipe: n floors, levels rising from lo to hi, the layouts in turn, and a pool of wild
 * Pokémon each with the stretch of the dungeon it lives in ([species, from 0..1, to 0..1, weight]). The last floor is the
 * boss's: one plain layout, no shop or Monster House.
 */
function floors(n, c) {
	return Array.from({ length: n }, (_, i) => {
		const t = n > 1 ? i / (n - 1) : 0, last = !!c.boss && i === n - 1, lv = Math.round(c.lo + (c.hi - c.lo) * t);
		const wild = c.pool.filter(([, a, b]) => t >= a && t <= b).map(([species, , , w, up]) => ({ species, level: lv + (up || 0), w: w || 1 }));
		const liquid = !!c.liquid && i >= 1;
		return {
			props: { ...BASE, layout: last ? 7 : c.layouts[i % c.layouts.length], roomDensity: 4 + Math.round(4 * t), floorConnectivity: 12 + Math.round(20 * t), enemyDensity: 3 + Math.round((c.foes || 5) * t),
				itemDensity: last ? 2 : 3 + (i % 3 === 0 ? 1 : 0), trapDensity: last ? 0 : Math.round((c.trapMax || 8) * t), numExtraHallways: 2 + (i % 4), allowDeadEnds: i % 5 === 4,
				roomFlags: (liquid ? 1 : 0) | (t > 0.3 ? 4 : 0), standaloneLakeDensity: liquid ? 1 + (i % 2) : 0, secondaryStructuresBudget: t > 0.25 && !last ? 1 + (i % 3) : 0,
				kecleonShopChance: last || i < 2 ? 0 : c.shop == null ? 7 : c.shop, monsterHouseChance: last || t < 0.3 ? 0 : Math.round((c.house == null ? 8 : c.house) * t) },
			water: c.liquid !== 'lava', vis: c.dark && t >= c.dark ? (t > 0.75 ? 1 : 2) : 0, sticky: t > 0.5 ? 5 : 0,
			wild: wild.length ? wild : [{ species: c.pool[0][0], level: lv, w: 1 }], items: COMMON_ITEMS, traps: t < 0.34 ? EASY_TRAPS : t < 0.7 ? MID_TRAPS : HARD_TRAPS, keeper: Math.max(90, c.hi + 40),
			...(last ? { boss: c.boss, noRecruit: true } : {}),
		};
	});
}
const ALL = [0, 0, 1], LATE = [0.5, 1, 1], EARLY = [0, 0.6, 1], MID = [0.25, 0.8, 1];
const P = (species, [a, b], w = 1, up = 0) => [species, a, b, w, up];

export const DUNGEONS = [
	{ id: 'whisper-woods', name: 'Whisper Woods', theme: 'forest', party: 4, blurb: 'A quiet wood to learn the ropes.', needs: null, reward: { first: 150, again: 40 },
		floors: floors(5, { lo: 3, hi: 8, layouts: [1, 1, 11, 11], liquid: 'water', trapMax: 3, foes: 2, shop: 0, house: 0, boss: { species: 'butterfree', level: 11 },
			pool: [P('caterpie', ALL, 4), P('pidgey', ALL, 3), P('rattata', ALL, 3), P('weedle', EARLY, 2), P('oddish', LATE, 2), P('bellsprout', LATE, 2)] }) },
	{ id: 'pebble-hollow', name: 'Pebble Hollow', theme: 'cave', party: 4, blurb: 'Tunnels full of rock and wings.', needs: 'whisper-woods', reward: { first: 250, again: 60 },
		floors: floors(8, { lo: 8, hi: 15, layouts: [11, 0, 6, 11, 8], trapMax: 5, foes: 3, boss: { species: 'onix', level: 19 },
			pool: [P('zubat', ALL, 4), P('geodude', ALL, 3), P('sandshrew', ALL, 2), P('diglett', EARLY, 2), P('paras', MID, 2), P('machop', LATE, 2), P('cubone', LATE, 1)] }) },
	{ id: 'tidepool-isles', name: 'Tidepool Isles', theme: 'islands', party: 4, blurb: 'Sand, surf and long swims: bring a swimmer.', needs: 'pebble-hollow', reward: { first: 400, again: 90 },
		floors: floors(10, { lo: 14, hi: 22, layouts: [0, 10, 11, 3, 0], liquid: 'water', trapMax: 6, foes: 4, boss: { species: 'starmie', level: 27 },
			pool: [P('krabby', ALL, 3), P('psyduck', ALL, 3), P('poliwag', ALL, 3), P('tentacool', ALL, 2), P('shellder', EARLY, 2), P('staryu', MID, 2), P('horsea', LATE, 2), P('wingull', LATE, 2), P('slowpoke', MID, 1)] }) },
	{ id: 'ember-rift', name: 'Ember Rift', theme: 'volcano', party: 4, blurb: 'Rivers of lava cut the rooms apart.', needs: 'tidepool-isles', reward: { first: 600, again: 130 },
		floors: floors(12, { lo: 20, hi: 30, layouts: [0, 4, 8, 0, 9, 3], liquid: 'lava', trapMax: 8, foes: 4, boss: { species: 'magmar', level: 35 },
			pool: [P('vulpix', ALL, 3), P('growlithe', ALL, 3), P('ponyta', ALL, 2), P('slugma', ALL, 3), P('numel', MID, 2), P('houndour', LATE, 2), P('geodude', EARLY, 2), P('rhyhorn', LATE, 1), P('koffing', MID, 2)] }) },
	{ id: 'frostspire', name: 'Frostspire', theme: 'snow', party: 4, blurb: 'A frozen climb. The wind bites.', needs: 'ember-rift', reward: { first: 850, again: 180 },
		floors: floors(14, { lo: 28, hi: 38, layouts: [0, 8, 10, 0, 6, 4, 0], liquid: 'water', trapMax: 9, foes: 5, boss: { species: 'glalie', level: 43 },
			pool: [P('swinub', ALL, 3), P('snorunt', ALL, 3), P('spheal', ALL, 3), P('seel', EARLY, 2), P('sneasel', MID, 2), P('jynx', LATE, 1), P('piloswine', LATE, 2), P('delibird', MID, 1), P('sealeo', LATE, 2)] }) },
	{ id: 'sunken-ruins', name: 'Sunken Ruins', theme: 'ruins', party: 4, blurb: 'Dark halls. You see only what is close.', needs: 'frostspire', reward: { first: 1150, again: 240 },
		floors: floors(16, { lo: 36, hi: 48, layouts: [0, 3, 0, 9, 8, 4, 0, 10], dark: 0.3, trapMax: 10, foes: 5, boss: { species: 'gengar', level: 53 },
			pool: [P('gastly', EARLY, 3), P('haunter', ALL, 3), P('misdreavus', ALL, 2), P('duskull', ALL, 2), P('natu', EARLY, 2), P('xatu', LATE, 2), P('baltoy', MID, 2), P('claydol', LATE, 1), P('golbat', ALL, 2), P('sableye', MID, 1)] }) },
	{ id: 'gale-tower', name: 'Gale Tower', theme: 'tower', party: 4, blurb: 'Twenty floors up, with something old at the top.', needs: 'sunken-ruins', reward: { first: 1500, again: 320 },
		floors: floors(20, { lo: 46, hi: 60, layouts: [0, 8, 4, 0, 9, 3, 0, 10, 6], trapMax: 11, foes: 6, boss: { species: 'dragonite', level: 66 },
			pool: [P('pidgeotto', EARLY, 3), P('fearow', ALL, 3), P('skarmory', MID, 2), P('swablu', EARLY, 2), P('altaria', LATE, 2), P('dratini', MID, 1), P('dragonair', LATE, 1), P('magneton', ALL, 2), P('electabuzz', MID, 2), P('scyther', LATE, 2), P('noctowl', ALL, 2)] }) },
	{ id: 'starfall-spire', name: 'Starfall Spire', theme: 'spire', party: 4, blurb: 'Thirty floors. The last dungeon on the map.', needs: 'gale-tower', reward: { first: 2500, again: 500 },
		floors: floors(30, { lo: 58, hi: 82, layouts: [0, 4, 8, 0, 3, 9, 0, 10, 6, 0, 11], dark: 0.6, trapMax: 12, foes: 6, house: 14, boss: { species: 'tyranitar', level: 92 },
			pool: [P('larvitar', EARLY, 2), P('pupitar', MID, 2), P('aron', EARLY, 2), P('lairon', MID, 2), P('aggron', LATE, 1), P('beldum', EARLY, 2), P('metang', LATE, 2), P('absol', ALL, 2), P('houndoom', MID, 2), P('solrock', ALL, 2), P('lunatone', ALL, 2),
				P('alakazam', LATE, 1), P('machamp', LATE, 1), P('rhydon', MID, 2), P('gyarados', LATE, 1)] }) },
	// ---- everyone enters as a Lv 5 copy of itself with an empty bag, and levels up inside
	{ id: 'sprout-trial', name: 'Sprout Trial', theme: 'meadow', party: 3, lv5: true, blurb: 'Lv 5 and an empty bag: 20 floors on wits alone.', needs: 'tidepool-isles', reward: { first: 900, again: 250 },
		floors: floors(20, { lo: 3, hi: 26, layouts: [1, 11, 0, 6, 11, 8, 0], liquid: 'water', trapMax: 8, foes: 4, boss: { species: 'venusaur', level: 30 },
			pool: [P('caterpie', EARLY, 3), P('pidgey', EARLY, 3), P('rattata', EARLY, 3), P('oddish', ALL, 2), P('spearow', MID, 2), P('ekans', MID, 2), P('mankey', MID, 2), P('gloom', LATE, 2), P('pidgeotto', LATE, 2), P('raticate', LATE, 2), P('ivysaur', LATE, 1)] }) },
	{ id: 'ancients-descent', name: 'Ancients\' Descent', theme: 'cave', party: 1, lv5: true, blurb: 'Alone, from Lv 5, 50 floors down.', needs: 'sunken-ruins', reward: { first: 3000, again: 800 },
		floors: floors(50, { lo: 3, hi: 52, layouts: [1, 11, 0, 6, 8, 0, 4, 3, 0, 9, 10], dark: 0.5, trapMax: 12, foes: 5, boss: { species: 'aerodactyl', level: 58 },
			pool: [P('zubat', EARLY, 3), P('geodude', EARLY, 3), P('paras', EARLY, 2), P('sandshrew', EARLY, 2), P('machop', MID, 2), P('onix', MID, 2), P('golbat', MID, 2), P('graveler', MID, 2), P('kabuto', MID, 1), P('omanyte', MID, 1),
				P('machoke', LATE, 2), P('rhyhorn', LATE, 2), P('kabutops', LATE, 1), P('omastar', LATE, 1), P('golem', LATE, 1), P('marowak', LATE, 2)] }) },
	// ---- no bottom
	{ id: 'the-abyss', name: 'The Abyss', theme: 'spire', party: 4, endless: true, blurb: 'It never ends. How deep can you go?', needs: 'frostspire', reward: { first: 0, again: 0 }, floors: [] },
];
export const dungeonById = (id) => DUNGEONS.find((d) => d.id === id) || null;
/** Is a dungeon open to a player who has cleared these? (its `needs`, or nothing) */
export const dungeonOpen = (d, cleared) => !d.needs || !!(cleared && cleared[d.needs]);

// the endless dungeon's wild Pokémon, by depth: each tier joins as the last one fades
const ABYSS = [['rattata', 'zubat', 'geodude', 'oddish', 'spearow'], ['machop', 'gastly', 'koffing', 'krabby', 'growlithe'], ['haunter', 'graveler', 'golbat', 'ponyta', 'magneton'], ['scyther', 'electabuzz', 'magmar', 'rhydon', 'kadabra'],
	['machamp', 'gengar', 'golem', 'alakazam', 'gyarados'], ['dragonair', 'aggron', 'metang', 'houndoom', 'absol'], ['dragonite', 'tyranitar', 'metagross', 'salamence', 'slaking']];
/** Floor n (1, 2, 3 ...) of the endless dungeon: every layout in turn, levels and dangers rising without end. */
export function endlessFloor(n) {
	const k = Math.max(1, n | 0), tier = Math.min(ABYSS.length - 1, Math.floor((k - 1) / 6)), lv = Math.min(999, 4 + 2 * k), lava = (k % 7) >= 5, deep = Math.min(1, k / 60);
	const wild = [...ABYSS[tier].map((species) => ({ species, level: lv, w: 3 })), ...(tier > 0 ? ABYSS[tier - 1].map((species) => ({ species, level: lv, w: 1 })) : [])];
	return {
		props: { ...BASE, layout: [0, 1, 11, 3, 4, 6, 8, 9, 10, 7, 0, 5][(k - 1) % 12], roomDensity: 4 + (k % 5), floorConnectivity: 12 + (k % 20), enemyDensity: Math.min(12, 3 + Math.floor(k / 4)), itemDensity: 3 + (k % 3),
			trapDensity: Math.min(14, Math.floor(k / 2)), numExtraHallways: k % 6, allowDeadEnds: k % 4 === 3, roomFlags: (k % 3 ? 1 : 0) | 4, standaloneLakeDensity: k % 3, secondaryStructuresBudget: k % 4,
			kecleonShopChance: 6, monsterHouseChance: Math.min(30, k) },
		water: !lava, vis: k > 20 && k % 5 === 0 ? 1 : k > 10 && k % 3 === 0 ? 2 : 0, sticky: Math.min(10, Math.floor(k / 5)), wild, items: COMMON_ITEMS, traps: deep < 0.15 ? EASY_TRAPS : deep < 0.4 ? MID_TRAPS : HARD_TRAPS, keeper: Math.min(999, lv + 60),
	};
}
