// mm/dungeons.js — Mystery Maze's dungeons (Plans/POKETACTICA_MYSTERY_MAZE_PLAN.md, "Dungeons"). OURS: the generator and
// its settings format are the original's, but the list, names, themes, floor tables and Pokémon lists are written for
// Poketactica. A dungeon is { id, name, theme, party (how many may enter), blurb, floors: [floor] }; a floor is
// { props (the generator's settings), water, vis (darkness: 0 lit, 1 the darkest), wild: [{ species, level, w }],
//   items: [{ id, w }], traps: [{ id, w }], sticky (% of items) }.
// (Stage 8 adds the rest of the launch list, the Lv 5 dungeons and the endless one.)
// Pure data: node-tested (overworld/tests/poketactica_mm_page_test.mjs opens one; stage 8's test checks them all).

const BASE = { layout: 0, roomDensity: 5, floorConnectivity: 15, enemyDensity: 4, kecleonShopChance: 0, monsterHouseChance: 0, mazeRoomChance: 0, allowDeadEnds: false, secondaryStructuresBudget: 0, roomFlags: 0,
	itemDensity: 3, trapDensity: 2, numExtraHallways: 3, buriedItemDensity: 0, standaloneLakeDensity: 0, kecleonShopLayout: 0, itemlessMonsterHouseChance: 0 };
const W = (list) => list.map(([id, w]) => ({ id, w }));
export const COMMON_ITEMS = W([['stars', 30], ['apple', 14], ['oran', 14], ['pecha', 4], ['cheri', 3], ['rawst', 3], ['chesto', 3], ['sleepseed', 4], ['blastseed', 4], ['stunseed', 3], ['warpseed', 3], ['quickseed', 2],
	['ironthorn', 6], ['gravelrock', 5], ['elixir', 3], ['escapeorb', 2], ['luminousorb', 1], ['slumberorb', 1], ['petrifyorb', 1], ['trawlorb', 1], ['bigapple', 2], ['sitrus', 1], ['maxelixir', 1]]);
export const EASY_TRAPS = W([['chestnut', 4], ['mud', 3], ['spin', 2], ['slow', 2], ['wonder', 2], ['sticky', 1], ['warp', 1]]);

export const DUNGEONS = [
	{
		id: 'whisper-woods', name: 'Whisper Woods', theme: 'forest', party: 4, blurb: 'A quiet wood to learn the ropes: 5 short floors.',
		floors: Array.from({ length: 5 }, (_, i) => ({
			props: { ...BASE, layout: i < 2 ? 1 : 11, roomDensity: 4 + (i >> 1), enemyDensity: 3 + (i >> 1), itemDensity: 4, trapDensity: i < 2 ? 0 : 3, roomFlags: i >= 3 ? 1 : 0, standaloneLakeDensity: i >= 3 ? 1 : 0 },
			water: true, vis: 0, sticky: 0, items: COMMON_ITEMS, traps: EASY_TRAPS,
			wild: [{ species: 'caterpie', level: 3 + i, w: 4 }, { species: 'pidgey', level: 3 + i, w: 3 }, { species: 'rattata', level: 4 + i, w: 3 }, { species: 'oddish', level: 5 + i, w: i >= 2 ? 2 : 0 }].filter((e) => e.w > 0),
		})),
	},
];
export const dungeonById = (id) => DUNGEONS.find((d) => d.id === id) || null;
