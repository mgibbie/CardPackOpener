// johkanto_gate.js — JohKanto (Crystal's Kanto: the postgame region, its eight gyms,
// then MT SILVER and RED) opens only to the GRAND CHAMPION.
//
// OWNER RULE (2026-10-12): "the johkanto should only be unlocked after beating elite
// 4 in every region". It used to open on the JOHTO crown alone (the Magnet Train ran
// again), and its doors — Route 26/28's Victory Road Gate, Diglett's Cave, the
// Underground Path, Vermilion's port passage, the Magnet Train — never asked at all.
//
// "JohKanto side" = a map map_regions.json files under JOHKANTO, except the corridor
// maps the shared regions need: Crystal's VICTORY ROAD GATE stands between Route 26
// and Victory Road on the way to the JOHTO League, so it stays open; only its door
// onto JohKanto's Route 22 is shut. Every entrance is gated in one place:
//   - walking onto a door into JohKanto: the door is solid (player.blocked) and
//     bumping it says why — the player is never put on a warp tile it refuses;
//   - warpTo / flyTo refuse the same crossing (a scripted warp such as the Magnet
//     Train, Fly) as a backstop, and so does visiting / following a friend into it.
// A save that already holds a JohKanto badge or crown keeps its access.
import * as Badges from './badges.js';
import { mapRegionOf } from './region_sync.js';

export const SHARED_REGIONS = ['KANTO', 'JOHTO', 'HOENN'];
export const GATE_TEXT = 'Only the GRAND CHAMPION of KANTO,\nJOHTO and HOENN may travel to the\nKANTO of old.';
// JohKanto-filed maps the shared regions walk through
export const CORRIDORS = new Set(['JohKantoVictoryRoadGate']);
// Crystal's Kanto interiors that map_regions.json files elsewhere (KANTO / OTHER) but
// that can only be reached FROM JohKanto — their every door leads into it. They are
// JohKanto too, or walking back out of Mt. Moon would count as "entering" JohKanto.
// johkanto_gate_test recomputes this from the map data so it cannot drift.
export const JOHKANTO_ONLY = new Set(['DiglettsCave', 'MountMoon', 'MountMoonSquare', 'MountMoonGiftShop',
	'SafariZoneBeta', 'SafariZoneFuchsiaGateBeta', 'UndergroundPath']);

export const isGrandChampion = () => SHARED_REGIONS.every(r => Badges.isChampion(r));
// progress made in JohKanto before the gate existed is never taken away
export const grandfathered = () => Badges.count('JOHKANTO') > 0 || Badges.isChampion('JOHKANTO');
export const johKantoOpen = () => isGrandChampion() || grandfathered();

export function isJohKantoSide(stem) {
	return !!stem && !CORRIDORS.has(stem) && (mapRegionOf(stem) === 'JOHKANTO' || JOHKANTO_ONLY.has(stem));
}
// would moving from map `fromStem` to map `toStem` enter JohKanto while it is shut?
export function blocksEntry(fromStem, toStem) {
	return isJohKantoSide(toStem) && !isJohKantoSide(fromStem) && !johKantoOpen();
}
// the door at (tx,ty) on the current map leads into a shut JohKanto
export function doorBlocked(world, tx, ty) {
	const w = world.warpAt(tx, ty);
	if (!w) return false;
	return blocksEntry(world.current?.name, world.fileFor(w.dest_map));
}
