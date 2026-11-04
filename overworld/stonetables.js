// stonetables.js — Crystal's STONE TABLES: a Strength boulder that comes to rest on
// one of its map's holes falls through (tools/gen_crystal_stonetables.mjs).
//
// FRLG decides that by the tile (MB_FALL_WARP, main.js pushBoulder); Crystal by a
// per-map table naming the boulder and the hole, whose script disappears the
// boulder (setting its event flag — on the floor below, Blackthorn Gym 1F's callback
// lays a bridge for each), may show its twin below (Ice Path), and says "The boulder
// fell through." Only Blackthorn Gym 2F and Ice Path B1F have one.
let TABLES = {};
export async function loadStoneTables(getJSON) {
	TABLES = (await getJSON('crystal_stonetables.json').catch(() => null)) || {};
}
// -> the row whose hole is (x,y) and whose boulder is the one with `flag`, or null
export function stoneTableRow(mapName, x, y, flag) {
	const rows = TABLES[mapName];
	if (!rows || !flag) return null;
	return rows.find(r => r.x === x && r.y === y && r.flag === flag) || null;
}
