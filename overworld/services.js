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

// per-map service spec: sprites to draw + interact zones
function specFor(mapId) {
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
		return {
			sprites: [{ img: 'nurse', tx: 3, ty: 1 }],
			zones: [
				{ kind: 'nurse', tiles: [[3, 1], [3, 2]] },
				{ kind: 'pc', tiles: [[9, 1]] },
			],
			solid: [[3, 1], [3, 2]],
		};
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
	return null;
}

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

	// 'nurse' | 'pc' | 'shop' | null at a tile
	kindAt(tx, ty) {
		if (!this.spec) return null;
		for (const z of this.spec.zones) {
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
