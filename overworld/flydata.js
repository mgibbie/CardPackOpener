// flydata.js — Town Map / Fly destinations, ported from the Lua game's
// FlyDestinations.lua + TownMapLayout.lua. Each town: { name, map, x, y } where
// x/y are the landing tile; grid[map] = [col, row] positions the town's dot on
// the region panel (gridW x gridH). Fly warps straight to (map, x, y).

export const REGION_ORDER = ['kanto', 'johto', 'johkanto', 'hoenn'];
export const REGION_LABEL = {
	kanto: 'KANTO', johto: 'JOHTO', johkanto: 'KANTO (PAST)', hoenn: 'HOENN',
};

export const FLY = {
	kanto: [
		{ name: 'Pallet Town', map: 'MAP_PALLET_TOWN', x: 12, y: 10 },
		{ name: 'Viridian City', map: 'MAP_VIRIDIAN_CITY', x: 26, y: 27 },
		{ name: 'Pewter City', map: 'MAP_PEWTER_CITY', x: 17, y: 26 },
		{ name: 'Cerulean City', map: 'MAP_CERULEAN_CITY', x: 22, y: 20 },
		{ name: 'Vermilion City', map: 'MAP_VERMILION_CITY', x: 15, y: 7 },
		{ name: 'Lavender Town', map: 'MAP_LAVENDER_TOWN', x: 6, y: 6 },
		{ name: 'Celadon City', map: 'MAP_CELADON_CITY', x: 48, y: 12 },
		{ name: 'Fuchsia City', map: 'MAP_FUCHSIA_CITY', x: 25, y: 32 },
		{ name: 'Saffron City', map: 'MAP_SAFFRON_CITY', x: 24, y: 39 },
		{ name: 'Cinnabar Island', map: 'MAP_CINNABAR_ISLAND', x: 14, y: 12 },
		{ name: 'Indigo Plateau', map: 'MAP_INDIGO_PLATEAU_EXTERIOR', x: 11, y: 7 },
	],
	johto: [
		{ name: 'New Bark Town', map: 'MAP_NEW_BARK_TOWN', x: 10, y: 9 },
		{ name: 'Cherrygrove City', map: 'MAP_CHERRYGROVE_CITY', x: 29, y: 4 },
		{ name: 'Violet City', map: 'MAP_VIOLET_CITY', x: 31, y: 26 },
		{ name: 'Azalea Town', map: 'MAP_AZALEA_TOWN', x: 15, y: 10 },
		{ name: 'Goldenrod City', map: 'MAP_GOLDENROD_CITY', x: 15, y: 28 },
		{ name: 'Ecruteak City', map: 'MAP_ECRUTEAK_CITY', x: 23, y: 28 },
		{ name: 'Olivine City', map: 'MAP_OLIVINE_CITY', x: 13, y: 22 },
		{ name: 'Cianwood City', map: 'MAP_CIANWOOD_CITY', x: 23, y: 44 },
		{ name: 'Mahogany Town', map: 'MAP_MAHOGANY_TOWN', x: 15, y: 14 },
		{ name: 'Blackthorn City', map: 'MAP_BLACKTHORN_CITY', x: 21, y: 30 },
	],
	johkanto: [
		{ name: 'Viridian City', map: 'MAP_JOHKANTO_VIRIDIAN_CITY', x: 23, y: 26 },
		{ name: 'Pewter City', map: 'MAP_JOHKANTO_PEWTER_CITY', x: 13, y: 26 },
		{ name: 'Cerulean City', map: 'MAP_JOHKANTO_CERULEAN_CITY', x: 19, y: 22 },
		{ name: 'Vermilion City', map: 'MAP_JOHKANTO_VERMILION_CITY', x: 9, y: 6 },
		{ name: 'Lavender Town', map: 'MAP_JOHKANTO_LAVENDER_TOWN', x: 5, y: 6 },
		{ name: 'Celadon City', map: 'MAP_JOHKANTO_CELADON_CITY', x: 29, y: 10 },
		{ name: 'Fuchsia City', map: 'MAP_JOHKANTO_FUCHSIA_CITY', x: 19, y: 28 },
		{ name: 'Saffron City', map: 'MAP_JOHKANTO_SAFFRON_CITY', x: 9, y: 30 },
		{ name: 'Cinnabar Island', map: 'MAP_JOHKANTO_CINNABAR_ISLAND', x: 11, y: 12 },
	],
	hoenn: [
		{ name: 'Littleroot Town', map: 'MAP_LITTLEROOT_TOWN', x: 10, y: 10 },
		{ name: 'Oldale Town', map: 'MAP_OLDALE_TOWN', x: 6, y: 17 },
		{ name: 'Petalburg City', map: 'MAP_PETALBURG_CITY', x: 20, y: 17 },
		{ name: 'Rustboro City', map: 'MAP_RUSTBORO_CITY', x: 16, y: 39 },
		{ name: 'Dewford Town', map: 'MAP_DEWFORD_TOWN', x: 2, y: 11 },
		{ name: 'Slateport City', map: 'MAP_SLATEPORT_CITY', x: 19, y: 20 },
		{ name: 'Mauville City', map: 'MAP_MAUVILLE_CITY', x: 22, y: 6 },
		{ name: 'Verdanturf Town', map: 'MAP_VERDANTURF_TOWN', x: 16, y: 4 },
		{ name: 'Fallarbor Town', map: 'MAP_FALLARBOR_TOWN', x: 14, y: 8 },
		{ name: 'Lavaridge Town', map: 'MAP_LAVARIDGE_TOWN', x: 9, y: 7 },
		{ name: 'Fortree City', map: 'MAP_FORTREE_CITY', x: 5, y: 7 },
		{ name: 'Lilycove City', map: 'MAP_LILYCOVE_CITY', x: 24, y: 15 },
		{ name: 'Mossdeep City', map: 'MAP_MOSSDEEP_CITY', x: 28, y: 17 },
		{ name: 'Sootopolis City', map: 'MAP_SOOTOPOLIS_CITY', x: 43, y: 32 },
		{ name: 'Pacifidlog Town', map: 'MAP_PACIFIDLOG_TOWN', x: 8, y: 16 },
		{ name: 'Ever Grande City', map: 'MAP_EVER_GRANDE_CITY', x: 27, y: 49 },
	],
};

// grid geometry + (col,row) dot positions per region for the town-map panel
export const GRID = {
	kanto: { w: 22, h: 15 },
	johto: { w: 20, h: 15 },
	johkanto: { w: 22, h: 15 },
	hoenn: { w: 28, h: 15 },
};
export const POS = {
	MAP_PALLET_TOWN: [4, 11], MAP_VIRIDIAN_CITY: [4, 8], MAP_PEWTER_CITY: [4, 4],
	MAP_CERULEAN_CITY: [14, 3], MAP_VERMILION_CITY: [14, 9], MAP_LAVENDER_TOWN: [18, 6],
	MAP_CELADON_CITY: [11, 6], MAP_FUCHSIA_CITY: [12, 12], MAP_SAFFRON_CITY: [14, 6],
	MAP_CINNABAR_ISLAND: [4, 14], MAP_INDIGO_PLATEAU_EXTERIOR: [2, 3],
	MAP_NEW_BARK_TOWN: [16, 9], MAP_CHERRYGROVE_CITY: [13, 9], MAP_VIOLET_CITY: [11, 5],
	MAP_AZALEA_TOWN: [8, 11], MAP_GOLDENROD_CITY: [10, 8], MAP_ECRUTEAK_CITY: [9, 5],
	MAP_OLIVINE_CITY: [4, 9], MAP_CIANWOOD_CITY: [2, 11], MAP_MAHOGANY_TOWN: [13, 3],
	MAP_BLACKTHORN_CITY: [17, 4],
	MAP_JOHKANTO_VIRIDIAN_CITY: [4, 8], MAP_JOHKANTO_PEWTER_CITY: [4, 4],
	MAP_JOHKANTO_CERULEAN_CITY: [14, 3], MAP_JOHKANTO_VERMILION_CITY: [14, 9],
	MAP_JOHKANTO_LAVENDER_TOWN: [18, 6], MAP_JOHKANTO_CELADON_CITY: [11, 6],
	MAP_JOHKANTO_FUCHSIA_CITY: [12, 12], MAP_JOHKANTO_SAFFRON_CITY: [14, 6],
	MAP_JOHKANTO_CINNABAR_ISLAND: [4, 14],
	MAP_LITTLEROOT_TOWN: [4, 11], MAP_OLDALE_TOWN: [4, 9], MAP_PETALBURG_CITY: [1, 9],
	MAP_RUSTBORO_CITY: [0, 5], MAP_DEWFORD_TOWN: [2, 14], MAP_SLATEPORT_CITY: [8, 10],
	MAP_MAUVILLE_CITY: [8, 6], MAP_VERDANTURF_TOWN: [4, 6], MAP_FALLARBOR_TOWN: [3, 0],
	MAP_LAVARIDGE_TOWN: [5, 3], MAP_FORTREE_CITY: [12, 0], MAP_LILYCOVE_CITY: [18, 3],
	MAP_MOSSDEEP_CITY: [24, 5], MAP_SOOTOPOLIS_CITY: [21, 7], MAP_PACIFIDLOG_TOWN: [17, 10],
	MAP_EVER_GRANDE_CITY: [27, 8],
};

// which region a fly-dest map belongs to (for auto-selecting the starting tab)
export const REGION_OF = {};
for (const r of REGION_ORDER) for (const t of FLY[r]) REGION_OF[t.map] = r;
