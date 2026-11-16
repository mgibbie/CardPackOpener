// flydata.js — Town Map / Fly destinations, ported from the Lua game's
// FlyDestinations.lua + TownMapLayout.lua. Each town: { name, map, x, y } where
// x/y are the landing tile; grid[map] = [col, row] positions the town's dot on
// the region panel (gridW x gridH). Fly warps straight to (map, x, y).

// one PAGE of the fly map each. SEVII is Kanto's island chain: its own page, because it is not on Kanto's map.
export const REGION_ORDER = ['kanto', 'sevii', 'johto', 'johkanto', 'hoenn', 'sinnoh'];
export const REGION_LABEL = {
	kanto: 'KANTO', sevii: 'SEVII ISLES', johto: 'JOHTO', johkanto: 'KANTO (PAST)', hoenn: 'HOENN', sinnoh: 'SINNOH',
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
		// FireRed's two roadside POKeMON CENTERS are fly points there too (its heal locations)
		{ name: 'Route 4 (Mt. Moon)', map: 'MAP_ROUTE4', x: 12, y: 6 },
		{ name: 'Route 10 (Rock Tunnel)', map: 'MAP_ROUTE10', x: 13, y: 21 },
	],
	// the SEVII ISLANDS (FireRed's heal locations, in front of each island's POKeMON CENTER)
	sevii: [
		{ name: 'One Island', map: 'MAP_ONE_ISLAND', x: 14, y: 6 },
		{ name: 'Two Island', map: 'MAP_TWO_ISLAND', x: 21, y: 8 },
		{ name: 'Three Island', map: 'MAP_THREE_ISLAND', x: 14, y: 28 },
		{ name: 'Four Island', map: 'MAP_FOUR_ISLAND', x: 18, y: 21 },
		{ name: 'Five Island', map: 'MAP_FIVE_ISLAND', x: 18, y: 7 },
		{ name: 'Six Island', map: 'MAP_SIX_ISLAND', x: 11, y: 12 },
		{ name: 'Seven Island', map: 'MAP_SEVEN_ISLAND', x: 12, y: 4 },
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
		// Crystal's other two fly points (data/maps/spawn_points.asm)
		{ name: 'Lake of Rage', map: 'MAP_LAKE_OF_RAGE', x: 21, y: 29 },
		{ name: 'Mt. Silver', map: 'MAP_SILVER_CAVE_OUTSIDE', x: 23, y: 20 },
	],
	johkanto: [
		{ name: 'Pallet Town', map: 'MAP_JOHKANTO_PALLET_TOWN', x: 5, y: 6 },
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
		{ name: 'Battle Frontier', map: 'MAP_BATTLE_FRONTIER_OUTSIDE_EAST', x: 4, y: 52 },
	],
	// SINNOH: the landing tiles are its source's own heal locations (src/data/heal_locations.json: the tile in
	// front of each town's POKeMON CENTER, or your door in Twinleaf)
	sinnoh: [
		{ name: 'Twinleaf Town', map: 'MAP_SINNOH_TWINLEAF_TOWN', x: 16, y: 19 },
		{ name: 'Sandgem Town', map: 'MAP_SINNOH_SANDGEM_TOWN', x: 17, y: 9 },
		{ name: 'Jubilife City', map: 'MAP_SINNOH_JUBILIFE_CITY', x: 55, y: 37 },
		{ name: 'Oreburgh City', map: 'MAP_SINNOH_OREBURGH_CITY', x: 51, y: 23 },
		{ name: 'Floaroma Town', map: 'MAP_SINNOH_FLOAROMA_TOWN', x: 18, y: 29 },
		{ name: 'Eterna City', map: 'MAP_SINNOH_ETERNA_CITY', x: 16, y: 18 },
		{ name: 'Hearthome City', map: 'MAP_SINNOH_HEARTHOME_CITY', x: 14, y: 20 },
		{ name: 'Solaceon Town', map: 'MAP_SINNOH_SOLACEON_TOWN', x: 24, y: 25 },
		{ name: 'Veilstone City', map: 'MAP_SINNOH_VEILSTONE_CITY', x: 41, y: 37 },
		{ name: 'Pastoria City', map: 'MAP_SINNOH_PASTORIA_CITY', x: 26, y: 15 },
		{ name: 'Celestic Town', map: 'MAP_SINNOH_CELESTIC_TOWN', x: 27, y: 28 },
		{ name: 'Canalave City', map: 'MAP_SINNOH_CANALAVE_CITY', x: 28, y: 23 },
		{ name: 'Snowpoint City', map: 'MAP_SINNOH_SNOWPOINT_CITY', x: 29, y: 46 },
		{ name: 'Sunyshore City', map: 'MAP_SINNOH_SUNYSHORE_CITY', x: 32, y: 43 },
		{ name: 'Pokemon League', map: 'MAP_SINNOH_POKMON_LEAGUE', x: 11, y: 59 },
		{ name: 'Fight Area', map: 'MAP_SINNOH_FIGHT_AREA', x: 39, y: 15 },
		{ name: 'Survival Area', map: 'MAP_SINNOH_SURVIVAL_AREA', x: 17, y: 19 },
		{ name: 'Resort Area', map: 'MAP_SINNOH_RESORT_AREA', x: 9, y: 11 },
	],
};

// grid geometry + (col,row) dot positions per region for the town-map panel
export const GRID = {
	kanto: { w: 22, h: 15 },
	sevii: { w: 22, h: 15 },
	johto: { w: 20, h: 15 },
	johkanto: { w: 22, h: 15 },
	hoenn: { w: 28, h: 15 },
	sinnoh: { w: 28, h: 15 },
};
export const POS = {
	MAP_PALLET_TOWN: [4, 11], MAP_VIRIDIAN_CITY: [4, 8], MAP_PEWTER_CITY: [4, 4],
	MAP_CERULEAN_CITY: [14, 3], MAP_VERMILION_CITY: [14, 9], MAP_LAVENDER_TOWN: [18, 6],
	MAP_CELADON_CITY: [11, 6], MAP_FUCHSIA_CITY: [12, 12], MAP_SAFFRON_CITY: [14, 6],
	MAP_CINNABAR_ISLAND: [4, 14], MAP_INDIGO_PLATEAU_EXTERIOR: [2, 3],
	MAP_ROUTE4: [8, 3], MAP_ROUTE10: [18, 3],
	// the Sevii page has no art: the islands in their chain, 1-3 to the north-west, 4-5 in the middle, 6-7 south
	MAP_ONE_ISLAND: [3, 2], MAP_TWO_ISLAND: [7, 1], MAP_THREE_ISLAND: [11, 3],
	MAP_FOUR_ISLAND: [5, 7], MAP_FIVE_ISLAND: [12, 8], MAP_SIX_ISLAND: [8, 12], MAP_SEVEN_ISLAND: [15, 13],
	MAP_LAKE_OF_RAGE: [13, 1], MAP_SILVER_CAVE_OUTSIDE: [19, 7], MAP_JOHKANTO_PALLET_TOWN: [4, 11],
	MAP_BATTLE_FRONTIER_OUTSIDE_EAST: [20, 13],
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
	// Sinnoh has no map art yet: its dots are laid out by hand to the region's shape (west coast, Mt. Coronet
	// down the middle, Snowpoint in the far north, the League and the Battle Zone to the north-east)
	MAP_SINNOH_TWINLEAF_TOWN: [3, 13], MAP_SINNOH_SANDGEM_TOWN: [5, 12], MAP_SINNOH_JUBILIFE_CITY: [5, 9],
	MAP_SINNOH_CANALAVE_CITY: [1, 9], MAP_SINNOH_OREBURGH_CITY: [9, 9], MAP_SINNOH_FLOAROMA_TOWN: [5, 6],
	MAP_SINNOH_ETERNA_CITY: [9, 4], MAP_SINNOH_HEARTHOME_CITY: [14, 9], MAP_SINNOH_SOLACEON_TOWN: [17, 7],
	MAP_SINNOH_CELESTIC_TOWN: [14, 5], MAP_SINNOH_VEILSTONE_CITY: [20, 6], MAP_SINNOH_PASTORIA_CITY: [18, 12],
	MAP_SINNOH_SUNYSHORE_CITY: [23, 10], MAP_SINNOH_SNOWPOINT_CITY: [11, 0], MAP_SINNOH_POKMON_LEAGUE: [24, 6],
	MAP_SINNOH_FIGHT_AREA: [21, 2], MAP_SINNOH_SURVIVAL_AREA: [22, 0], MAP_SINNOH_RESORT_AREA: [25, 2],
};

// region background art. Marker pixels sit on the baked city markers in each
// image. Hoenn used to be null — the LARGEST region, with 16 fly destinations,
// drew as a bare dot grid while the other three got a map (tools/build_hoenn_townmap.py).
export const IMG = {
	kanto: { file: 'townmap/kanto.png', w: 240, h: 160 },
	johkanto: { file: 'townmap/kanto.png', w: 240, h: 160 },
	johto: { file: 'townmap/johto.png', w: 160, h: 144 },
	hoenn: { file: 'townmap/hoenn.png', w: 240, h: 160 },
	// Sinnoh's is its source's own region map (tools/build_hoenn_townmap.py --region=sinnoh)
	sinnoh: { file: 'townmap/sinnoh.png', w: 240, h: 160 },
};
// Johto uses authentic landmark pixel coords (pokecrystal); Kanto/JohKanto use
// the FireRed grid marker formula pixel = (8*col + 36, 8*row + 36).
const JOHTO_PX = {
	MAP_NEW_BARK_TOWN: [140, 100], MAP_CHERRYGROVE_CITY: [100, 100], MAP_VIOLET_CITY: [84, 60],
	MAP_AZALEA_TOWN: [68, 124], MAP_GOLDENROD_CITY: [52, 92], MAP_ECRUTEAK_CITY: [68, 44],
	MAP_OLIVINE_CITY: [36, 60], MAP_CIANWOOD_CITY: [20, 100], MAP_MAHOGANY_TOWN: [108, 44],
	MAP_BLACKTHORN_CITY: [132, 44],
	MAP_LAKE_OF_RAGE: [108, 28], MAP_SILVER_CAVE_OUTSIDE: [150, 68],
};
// Hoenn: Emerald's own MAPSEC grid, converted with the region map's screen
// offset — the grid area starts at tile (1,2), so a cell centre is
// (8x + 12, 8y + 20). Verified by drawing these over the assembled art and
// checking every one lands on a baked city marker.
const HOENN_PX = {
	MAP_LITTLEROOT_TOWN: [44, 108], MAP_OLDALE_TOWN: [44, 92], MAP_PETALBURG_CITY: [20, 92],
	MAP_RUSTBORO_CITY: [12, 60], MAP_DEWFORD_TOWN: [28, 132], MAP_SLATEPORT_CITY: [76, 100],
	MAP_MAUVILLE_CITY: [76, 68], MAP_VERDANTURF_TOWN: [44, 68], MAP_FALLARBOR_TOWN: [36, 20],
	MAP_LAVARIDGE_TOWN: [52, 44], MAP_FORTREE_CITY: [108, 20], MAP_LILYCOVE_CITY: [156, 44],
	MAP_MOSSDEEP_CITY: [204, 60], MAP_SOOTOPOLIS_CITY: [180, 76], MAP_PACIFIDLOG_TOWN: [148, 100],
	MAP_EVER_GRANDE_CITY: [228, 84], MAP_BATTLE_FRONTIER_OUTSIDE_EAST: [172, 124],
};
// Sinnoh: read off the assembled art, each on its baked town marker
const SINNOH_PX = {
	MAP_SINNOH_TWINLEAF_TOWN: [28, 132], MAP_SINNOH_SANDGEM_TOWN: [44, 124], MAP_SINNOH_JUBILIFE_CITY: [40, 108],
	MAP_SINNOH_CANALAVE_CITY: [12, 104], MAP_SINNOH_OREBURGH_CITY: [68, 112], MAP_SINNOH_FLOAROMA_TOWN: [44, 84],
	MAP_SINNOH_ETERNA_CITY: [72, 72], MAP_SINNOH_CELESTIC_TOWN: [108, 68], MAP_SINNOH_HEARTHOME_CITY: [104, 100],
	MAP_SINNOH_SOLACEON_TOWN: [124, 84], MAP_SINNOH_VEILSTONE_CITY: [148, 80], MAP_SINNOH_PASTORIA_CITY: [128, 124],
	MAP_SINNOH_SUNYSHORE_CITY: [176, 108], MAP_SINNOH_POKMON_LEAGUE: [180, 76], MAP_SINNOH_SNOWPOINT_CITY: [92, 20],
	MAP_SINNOH_FIGHT_AREA: [132, 44], MAP_SINNOH_SURVIVAL_AREA: [140, 28], MAP_SINNOH_RESORT_AREA: [172, 52],
};
// marker pixel for a town within its region image, or null if the region has no art
export function markerPx(region, mapId) {
	if (region === 'johto') return JOHTO_PX[mapId] || null;
	if (region === 'hoenn') return HOENN_PX[mapId] || null;
	if (region === 'sinnoh') return SINNOH_PX[mapId] || null;
	if (region === 'kanto' || region === 'johkanto') {
		const g = POS[mapId];
		return g ? [8 * g[0] + 36, 8 * g[1] + 36] : null;
	}
	return null;
}

// which region a fly-dest map belongs to (for auto-selecting the starting tab)
export const REGION_OF = {};
for (const r of REGION_ORDER) for (const t of FLY[r]) REGION_OF[t.map] = r;
