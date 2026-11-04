// crystal_object_consts.js — a Crystal object constant -> the map object it names.
//
// pokecrystal's object constants are indices into the map's object_event list
// (tools/gen_crystal_object_consts.mjs). Used only as a FALLBACK when matching the
// constant's name against the converted local_id fails, and only when the map's
// object count equals the constant count — so a map converted differently can
// never resolve to the wrong object.
let CONSTS = {};
export async function loadCrystalObjectConsts(getJSON) {
	CONSTS = (await getJSON('crystal_object_consts.json').catch(() => null)) || {};
}
// -> the object_event, or null
export function crystalObjectEvent(map, name) {
	if (!map || !map._crystal_tileset || typeof name !== 'string') return null;
	const list = CONSTS[map.name];
	const evs = map.object_events || [];
	if (!list || list.length !== evs.length) return null;
	const i = list.indexOf(name);
	return i >= 0 ? evs[i] : null;
}
