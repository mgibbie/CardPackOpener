// figballs.js — where the overworld's FIGURINE BALLS lie (overworld/ow_figurine.js re-exports it; items.js draws and picks
// them up; the Figurine book, book.js, lists them). Data only.
/**
 * The hand-placed figurine balls (owner, 2026-11-20: "placed figurine balls"): three routes per region (early, middle,
 * late; HOENN2 is gleep's), each on a reachable dead-end nook where the solid ball cuts no path, on foot (no sea
 * routes), holding a species that lives on that route at the route's top wild level. Picked by the overworld's own
 * walkability: tools/poketactica/place_figballs.mjs. overworld/tests/ow_figurine_balls_test.mjs re-checks each one.
 * A ball is collected once (items.js: key fig_<map>_<x>_<y>).
 */
export const FIGURINE_BALLS = {
	MAP_ROUTE2:                [{ tx: 15, ty: 62, fig: 'caterpie', lv: 5 }],
	MAP_ROUTE14:               [{ tx: 13, ty: 35, fig: 'gloom', lv: 30 }],
	MAP_ROUTE25:               [{ tx: 30, ty: 2, fig: 'metapod', lv: 14 }],
	MAP_ROUTE_26:              [{ tx: 17, ty: 58, fig: 'arbok', lv: 32 }],
	MAP_ROUTE_35:              [{ tx: 7, ty: 11, fig: 'ditto', lv: 14 }],
	MAP_ROUTE_45:              [{ tx: 7, ty: 32, fig: 'skarmory', lv: 30 }],
	MAP_ROUTE101:              [{ tx: 2, ty: 8, fig: 'zigzagoon', lv: 3 }],
	MAP_ROUTE115:              [{ tx: 15, ty: 72, fig: 'jigglypuff', lv: 26 }],
	MAP_ROUTE123:              [{ tx: 20, ty: 6, fig: 'kecleon', lv: 28 }],
	MAP_SINNOH_ROUTE201:       [{ tx: 57, ty: 8, fig: 'kricketot', lv: 4 }],
	MAP_SINNOH_ROUTE212_SOUTH: [{ tx: 48, ty: 10, fig: 'croagunk', lv: 26 }],
	MAP_SINNOH_ROUTE229:       [{ tx: 61, ty: 3, fig: 'beautifly', lv: 50 }],
	MAP_JOHKANTO_ROUTE_2:      [{ tx: 9, ty: 25, fig: 'pikachu', lv: 7 }],
	MAP_JOHKANTO_ROUTE_13:     [{ tx: 21, ty: 13, fig: 'chansey', lv: 27 }],
	MAP_JOHKANTO_ROUTE_25:     [{ tx: 31, ty: 9, fig: 'butterfree', lv: 14 }],
};
