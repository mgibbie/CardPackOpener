// services.js — Pokemon Center nurses/PCs and Poke Mart clerks, placed
// programmatically per map id (ported from MapObjects.lua).
import { getImage, META } from './engine.js';

// FireRed-layout centers: nurse at (7,2) (counter row 3), PC console at (12,2)
const FR_CENTERS = [
	'MAP_VIRIDIAN_CITY_POKEMON_CENTER_1F', 'MAP_PEWTER_CITY_POKEMON_CENTER_1F',
	'MAP_CERULEAN_CITY_POKEMON_CENTER_1F', 'MAP_VERMILION_CITY_POKEMON_CENTER_1F',
	'MAP_LAVENDER_TOWN_POKEMON_CENTER_1F', 'MAP_CELADON_CITY_POKEMON_CENTER_1F',
	'MAP_FUCHSIA_CITY_POKEMON_CENTER_1F', 'MAP_SAFFRON_CITY_POKEMON_CENTER_1F',
	'MAP_CINNABAR_ISLAND_POKEMON_CENTER_1F', 'MAP_INDIGO_PLATEAU_POKEMON_CENTER_1F',
	'MAP_ROUTE4_POKEMON_CENTER_1F', 'MAP_ROUTE10_POKEMON_CENTER_1F',
	'MAP_ONE_ISLAND_POKEMON_CENTER_1F', 'MAP_TWO_ISLAND_POKEMON_CENTER_1F',
	'MAP_THREE_ISLAND_POKEMON_CENTER_1F', 'MAP_FOUR_ISLAND_POKEMON_CENTER_1F',
	'MAP_FIVE_ISLAND_POKEMON_CENTER_1F', 'MAP_SIX_ISLAND_POKEMON_CENTER_1F',
	'MAP_SEVEN_ISLAND_POKEMON_CENTER_1F',
	'MAP_OLDALE_TOWN_POKEMON_CENTER_1F', 'MAP_PETALBURG_CITY_POKEMON_CENTER_1F',
	'MAP_RUSTBORO_CITY_POKEMON_CENTER_1F', 'MAP_DEWFORD_TOWN_POKEMON_CENTER_1F',
	'MAP_SLATEPORT_CITY_POKEMON_CENTER_1F', 'MAP_MAUVILLE_CITY_POKEMON_CENTER_1F',
	'MAP_VERDANTURF_TOWN_POKEMON_CENTER_1F', 'MAP_FALLARBOR_TOWN_POKEMON_CENTER_1F',
	'MAP_LAVARIDGE_TOWN_POKEMON_CENTER_1F', 'MAP_FORTREE_CITY_POKEMON_CENTER_1F',
	'MAP_LILYCOVE_CITY_POKEMON_CENTER_1F', 'MAP_MOSSDEEP_CITY_POKEMON_CENTER_1F',
	'MAP_SOOTOPOLIS_CITY_POKEMON_CENTER_1F', 'MAP_PACIFIDLOG_TOWN_POKEMON_CENTER_1F',
	'MAP_EVER_GRANDE_CITY_POKEMON_CENTER_1F', 'MAP_BATTLE_FRONTIER_POKEMON_CENTER_1F',
];
// Crystal-layout centers (Johto/JohKanto/Indigo/Silver Cave): nurse (3,1), PC (9,1)
const CR_CENTERS = [
	'MAP_CHERRYGROVE_POKECENTER_1F', 'MAP_VIOLET_POKECENTER_1F', 'MAP_AZALEA_POKECENTER_1F',
	'MAP_GOLDENROD_POKECENTER_1F', 'MAP_ECRUTEAK_POKECENTER_1F', 'MAP_OLIVINE_POKECENTER_1F',
	'MAP_CIANWOOD_POKECENTER_1F', 'MAP_MAHOGANY_POKECENTER_1F', 'MAP_BLACKTHORN_POKECENTER_1F',
	'MAP_ROUTE_32_POKECENTER_1F', 'MAP_ROUTE_10_POKECENTER_1F',
	'MAP_INDIGO_PLATEAU_POKECENTER_1F', 'MAP_SILVER_CAVE_POKECENTER_1F',
	'MAP_JOHKANTO_VIRIDIAN_POKECENTER_1F', 'MAP_JOHKANTO_PEWTER_POKECENTER_1F',
	'MAP_JOHKANTO_CERULEAN_POKECENTER_1F', 'MAP_JOHKANTO_VERMILION_POKECENTER_1F',
	'MAP_JOHKANTO_LAVENDER_POKECENTER_1F', 'MAP_JOHKANTO_CELADON_POKECENTER_1F',
	'MAP_JOHKANTO_FUCHSIA_POKECENTER_1F', 'MAP_JOHKANTO_SAFFRON_POKECENTER_1F',
	'MAP_JOHKANTO_CINNABAR_POKECENTER_1F', 'MAP_JOHKANTO_ROUTE_10_POKECENTER_1F',
];
// Kanto/Johto marts: clerk (2,3), counter at (3,3) + (2,4). Hoenn: one tile left.
const KANTO_MARTS = [
	'MAP_VIRIDIAN_CITY_MART', 'MAP_PEWTER_CITY_MART', 'MAP_CERULEAN_CITY_MART',
	'MAP_LAVENDER_TOWN_MART', 'MAP_VERMILION_CITY_MART', 'MAP_FUCHSIA_CITY_MART',
	'MAP_CINNABAR_ISLAND_MART', 'MAP_SAFFRON_CITY_MART',
	'MAP_CHERRYGROVE_MART', 'MAP_VIOLET_MART', 'MAP_AZALEA_MART',
	'MAP_ECRUTEAK_MART', 'MAP_OLIVINE_MART', 'MAP_BLACKTHORN_MART',
];
const HOENN_MARTS = [
	'MAP_OLDALE_TOWN_MART', 'MAP_RUSTBORO_CITY_MART', 'MAP_SLATEPORT_CITY_MART',
	'MAP_MAUVILLE_CITY_MART', 'MAP_VERDANTURF_TOWN_MART', 'MAP_FALLARBOR_TOWN_MART',
	'MAP_LAVARIDGE_TOWN_MART', 'MAP_FORTREE_CITY_MART', 'MAP_MOSSDEEP_CITY_MART',
	'MAP_SOOTOPOLIS_CITY_MART', 'MAP_PETALBURG_CITY_MART', 'MAP_BATTLE_FRONTIER_MART',
];

// GAME CORNERS: the counter clerks (existing decomp NPCs — no new sprites)
// become one 'gamecorner' service each. The zone shadows the NPC's mute
// script and opens the Game Corner hub (Voltorb Flip / coins / prizes).
// Tiles cover the clerk and the tile the player faces them from.
const GAME_CORNERS = {
	MAP_CELADON_CITY_GAME_CORNER: [[4, 2], [4, 3], [6, 2], [6, 3]],
	MAP_CELADON_CITY_GAME_CORNER_PRIZE_ROOM: [[4, 2], [4, 3], [6, 2], [6, 3]],
	MAP_GOLDENROD_GAME_CORNER: [[3, 2], [3, 3], [16, 2], [16, 3], [18, 2], [18, 3]],
	MAP_MAUVILLE_CITY_GAME_CORNER: [[11, 2], [11, 3], [13, 2], [13, 3], [14, 2], [14, 3]],
	MAP_JOHKANTO_CELADON_GAME_CORNER: [[3, 2], [3, 3], [5, 2], [5, 3]],
	MAP_JOHKANTO_CELADON_GAME_CORNER_PRIZE_ROOM: [[0, 2], [0, 3], [4, 4], [4, 5]],
};

// CONTEST HALL (Lilycove): the two reception counters run the contests, the
// Berry Blender corner (the Blend Master + the two group blenders) feeds
// berries into condition. All existing decomp NPCs — the zones shadow their
// mute scripts, no new sprites.
const CONTEST_LOBBIES = {
	MAP_LILYCOVE_CITY_CONTEST_LOBBY: {
		contest: [[14, 2], [14, 3], [15, 2], [15, 3]],
		blend: [[26, 5], [26, 6], [26, 9], [26, 10], [22, 9], [22, 10]],
	},
};

// BUG-CATCHING CONTEST: the officers in both National Park gates (the decomp
// NPCs whose Contest scripts never ran) become the sign-up/finish desk.
const BUG_CONTEST_GATES = {
	MAP_ROUTE_36_NATIONAL_PARK_GATE: [[3, 2], [3, 3], [0, 3], [1, 3]],
	MAP_ROUTE_35_NATIONAL_PARK_GATE: [[2, 1], [2, 2], [0, 3], [1, 3]],
};

// TRICK HOUSE (Route 110): the man in the entrance is the Trick Master's
// front; each puzzle room hides the SCROLL at its sign tile (the same spot
// Emerald tucks it near); the man in the End room takes the scroll and pays.
const TRICK_HOUSE = {
	MAP_ROUTE110_TRICK_HOUSE_ENTRANCE: { trickmaster: [[6, 2], [6, 3], [5, 2]] },
	MAP_ROUTE110_TRICK_HOUSE_PUZZLE1: { trickscroll: [[3, 16], [3, 17]] },
	MAP_ROUTE110_TRICK_HOUSE_PUZZLE2: { trickscroll: [[14, 14], [14, 15]] },
	MAP_ROUTE110_TRICK_HOUSE_PUZZLE3: { trickscroll: [[0, 14], [0, 15]] },
	MAP_ROUTE110_TRICK_HOUSE_PUZZLE4: { trickscroll: [[14, 13], [14, 14]] },
	MAP_ROUTE110_TRICK_HOUSE_PUZZLE5: { trickscroll: [[11, 21], [11, 22]] },
	MAP_ROUTE110_TRICK_HOUSE_PUZZLE6: { trickscroll: [[0, 10], [0, 11]] },
	MAP_ROUTE110_TRICK_HOUSE_PUZZLE7: { trickscroll: [[6, 17], [6, 18]] },
	MAP_ROUTE110_TRICK_HOUSE_PUZZLE8: { trickscroll: [[3, 21], [3, 22]] },
	MAP_ROUTE110_TRICK_HOUSE_END: { trickend: [[4, 5], [4, 6], [3, 5], [5, 5]] },
};

// RUINS OF ALPH: the ancient replica wall in each chamber is the sliding-tile
// puzzle; solving it opens the floor to that chamber's item room. All four
// chambers share the same layout (replica at (2,3)/(5,3)).
const RUINS_CHAMBERS = {
	MAP_RUINS_OF_ALPH_KABUTO_CHAMBER: 'kabuto',
	MAP_RUINS_OF_ALPH_OMANYTE_CHAMBER: 'omanyte',
	MAP_RUINS_OF_ALPH_AERODACTYL_CHAMBER: 'aerodactyl',
	MAP_RUINS_OF_ALPH_HO_OH_CHAMBER: 'hooh',
};

// SHOAL CAVE: the salt/shell dig spots (the decomp's mute ShoalSalt/ShoalShell
// bg events) and the SHELL BELL hermit at the entrance. KURT in Azalea turns
// apricorns into his handmade balls.
const SHOAL_SPOTS = {
	MAP_SHOAL_CAVE_LOW_TIDE_INNER_ROOM: [[31, 8], [14, 26], [41, 20], [41, 10], [6, 9], [16, 13]],
	MAP_SHOAL_CAVE_LOW_TIDE_LOWER_ROOM: [[18, 2]],
	MAP_SHOAL_CAVE_LOW_TIDE_STAIRS_ROOM: [[11, 11]],
};

// TRAINER HILL: the reception desk, the roof prize-giver, the elevator ride
// down — all decomp NPCs whose scripts never ran.
const TRAINER_HILL = {
	MAP_TRAINER_HILL_ENTRANCE: { trainerhill: [[11, 6], [11, 7], [12, 6]] },
	MAP_TRAINER_HILL_ROOF: { hillprize: [[12, 7], [12, 8], [11, 7], [13, 7]] },
	MAP_TRAINER_HILL_ELEVATOR: { hillelevator: [[0, 6], [0, 7], [1, 6]] },
};

// LILYCOVE MUSEUM 2F: the five contest-painting frames + the curator.
// RUINS word rooms, the Mirage Tower / Desert Underpass fossils, the Fossil
// Maniac's revival desk, and New Mauville's generator — all decomp spots
// whose scripts never ran.
const MISC_VENUES = {
	MAP_LILYCOVE_CITY_LILYCOVE_MUSEUM_2F: {
		museumpaint: [[2, 6], [3, 6], [10, 6], [11, 6], [18, 6], [19, 6], [6, 10], [7, 10], [14, 10], [15, 10]],
		museumcurator: [[10, 8], [10, 9]],
	},
	MAP_RUINS_OF_ALPH_KABUTO_WORD_ROOM: { ruinsword: [[6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1]] },
	MAP_RUINS_OF_ALPH_OMANYTE_WORD_ROOM: { ruinsword: [[6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1]] },
	MAP_RUINS_OF_ALPH_AERODACTYL_WORD_ROOM: { ruinsword: [[6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1]] },
	MAP_RUINS_OF_ALPH_HO_OH_WORD_ROOM: { ruinsword: [[6, 1], [7, 1], [8, 1], [9, 1], [10, 1], [11, 1], [12, 1], [13, 1]] },
	MAP_MIRAGE_TOWER_4F: { fossilroot: [[5, 4], [5, 5]], fossilclaw: [[7, 4], [7, 5]] },
	MAP_DESERT_UNDERPASS: { fossilunder: [[132, 10], [132, 11], [131, 10], [133, 10]] },
	MAP_ROUTE114_FOSSIL_MANIACS_HOUSE: { fossilmaniac: [[3, 2], [3, 3]] },
	MAP_NEW_MAUVILLE_INSIDE: { generator: [[32, 2], [32, 3], [32, 4], [33, 4], [34, 4], [35, 4], [35, 3], [35, 2]] },
};

// per-map service spec: sprites to draw + interact zones
function specFor(mapId) {
	if (MISC_VENUES[mapId]) {
		const zones = Object.entries(MISC_VENUES[mapId]).map(([kind, tiles]) => ({ kind, tiles }));
		return { sprites: [], zones, solid: [] };
	}
	if (TRAINER_HILL[mapId]) {
		const zones = Object.entries(TRAINER_HILL[mapId]).map(([kind, tiles]) => ({ kind, tiles }));
		return { sprites: [], zones, solid: [] };
	}
	if (SHOAL_SPOTS[mapId] || mapId === 'MAP_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM') {
		const zones = [];
		if (SHOAL_SPOTS[mapId]) zones.push({ kind: 'shoalspot', tiles: SHOAL_SPOTS[mapId] });
		if (mapId === 'MAP_SHOAL_CAVE_LOW_TIDE_ENTRANCE_ROOM') zones.push({ kind: 'shoalhermit', tiles: [[18, 15], [18, 16]] });
		return { sprites: [], zones, solid: [] };
	}
	if (mapId === 'MAP_KURTS_HOUSE') {
		return { sprites: [], zones: [{ kind: 'kurt', tiles: [[3, 2], [3, 3], [14, 3], [14, 4]] }], solid: [] };
	}
	if (BUG_CONTEST_GATES[mapId]) {
		return { sprites: [], zones: [{ kind: 'bugcontest', tiles: BUG_CONTEST_GATES[mapId] }], solid: [] };
	}
	if (TRICK_HOUSE[mapId]) {
		const zones = Object.entries(TRICK_HOUSE[mapId]).map(([kind, tiles]) => ({ kind, tiles }));
		return { sprites: [], zones, solid: [] };
	}
	if (RUINS_CHAMBERS[mapId]) {
		return { sprites: [], zones: [{ kind: 'ruinspuzzle', tiles: [[2, 3], [2, 4], [5, 3], [5, 4]] }], solid: [] };
	}
	if (GAME_CORNERS[mapId]) {
		return { sprites: [], zones: [{ kind: 'gamecorner', tiles: GAME_CORNERS[mapId] }], solid: [] };
	}
	if (CONTEST_LOBBIES[mapId]) {
		const c = CONTEST_LOBBIES[mapId];
		return {
			sprites: [],
			zones: [
				{ kind: 'contest', tiles: c.contest },
				{ kind: 'berryblend', tiles: c.blend },
			],
			solid: [],
		};
	}
	if (FR_CENTERS.includes(mapId)) {
		return {
			sprites: [{ img: 'nurse', tx: 7, ty: 2 }],
			zones: [
				{ kind: 'nurse', tiles: [[7, 2], [7, 3]] },
				{ kind: 'pc', tiles: [[12, 2]] },
			],
			solid: [[7, 2], [7, 3]],
		};
	}
	if (CR_CENTERS.includes(mapId)) {
		const spec = {
			sprites: [{ img: 'nurse', tx: 3, ty: 1 }],
			zones: [
				{ kind: 'nurse', tiles: [[3, 1], [3, 2]] },
				{ kind: 'pc', tiles: [[9, 1]] },
			],
			solid: [[3, 1], [3, 2]],
		};
		// THE POSTGAME PREMIUM VENDOR. The two league Centers get a clerk — the
		// counter where JohKanto's outsized payouts finally have something to
		// buy. main.js's shopStockNow() appends the premium stock only on these
		// maps and only once the JOHTO crown opens the postgame; before that he
		// sells the ordinary catalogue, which is harmless.
		if (mapId === 'MAP_INDIGO_PLATEAU_POKECENTER_1F' || mapId === 'MAP_SILVER_CAVE_POKECENTER_1F') {
			spec.sprites.push({ img: 'clerk', tx: 6, ty: 1 });
			spec.zones.push({ kind: 'shop', tiles: [[6, 1], [6, 2]] });
			spec.solid.push([6, 1]);
		}
		return spec;
	}
	if (KANTO_MARTS.includes(mapId)) {
		return {
			sprites: [{ img: 'clerk', tx: 2, ty: 3 }],
			zones: [{ kind: 'shop', tiles: [[2, 3], [3, 3], [2, 4]] }],
			solid: [[2, 3], [2, 4]],
		};
	}
	if (HOENN_MARTS.includes(mapId)) {
		return {
			sprites: [{ img: 'clerk', tx: 1, ty: 3 }],
			zones: [{ kind: 'shop', tiles: [[1, 3], [2, 3], [1, 4]] }],
			solid: [[1, 3], [1, 4]],
		};
	}
	// harbor maps: talking to the sailor (or the dockside) offers the ferry
	if (FERRY_PORTS[mapId]) {
		return { sprites: [], zones: [{ kind: 'ferry', tiles: 'any' }], solid: [] };
	}
	return null;
}

// region-hopping ferry: dock map -> the other two destinations
export const FERRY_PORTS = {
	'MAP_SSANNE_EXTERIOR': 'Vermilion Harbor (Kanto)',
	'MAP_OLIVINE_PORT': 'Olivine Port (Johto)',
	'MAP_SLATEPORT_CITY_HARBOR': 'Slateport Harbor (Hoenn)',
};

export class Services {
	constructor(world) {
		this.world = world;
		this.spec = null;
		this.imgs = {};
	}

	async init() {
		this.imgs.nurse = await getImage('data/npcs/nurse.png').catch(() => null);
		this.imgs.clerk = await getImage('data/npcs/clerk.png').catch(() => null);
	}

	loadForMap() {
		this.spec = specFor(this.world.current.map.id);
	}

	// 'nurse' | 'pc' | 'shop' | 'ferry' | null at a tile
	kindAt(tx, ty) {
		if (!this.spec) return null;
		for (const z of this.spec.zones) {
			if (z.tiles === 'any') return z.kind;
			if (z.tiles.some(([x, y]) => x === tx && y === ty)) return z.kind;
		}
		return null;
	}

	blocks(tx, ty) {
		return !!this.spec && this.spec.solid.some(([x, y]) => x === tx && y === ty);
	}

	draw(ctx, camX, camY) {
		if (!this.spec) return;
		for (const s of this.spec.sprites) {
			const img = this.imgs[s.img];
			if (!img) continue;
			ctx.drawImage(img, 0, 0, 16, 32, s.tx * META - camX, s.ty * META - 16 - camY, 16, 32);
		}
	}
}
