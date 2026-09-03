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

// per-map service spec: sprites to draw + interact zones
function specFor(mapId) {
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
