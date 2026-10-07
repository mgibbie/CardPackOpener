// maplayout.js — the decomps' `setmaplayoutindex`, which the transpile dropped.
//
// 21 labels in pokeemerald + pokefirered switch the map to another layout as it
// loads: Route 131's Sky Pillar approach (without it the tower's island is cut
// off from the sea, 2026-10-07), the Sky Pillar's clean floors, Shoal Cave's
// tides, Seafoam's stopped currents, Mirage Island, Birch's lab table.
// tools/gen_maplayout.mjs re-inserts the op into each label
// (overworld/maplayout_data.json); the runner (events.js) hands it to
// ctx.setMapLayout, and runMapSetupScripts (ow_story.js) swaps the layout in.
let PATCHES = {};
export async function loadMapLayoutData(getJSON) {
	PATCHES = ((await getJSON('maplayout_data.json').catch(() => null)) || {}).patches || {};
}
export const mapLayoutPatches = stem => PATCHES[stem] || {};
