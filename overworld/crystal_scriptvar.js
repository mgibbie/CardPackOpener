// crystal_scriptvar.js — the Crystal comparisons the transpile dropped, restored.
//
// pokecrystal tests the script variable with ifequal/ifnotequal/ifgreater/ifless/
// iftrue/iffalse; the transpile kept only ifequal/ifnotequal after a `readvar`, so
// a `special` result or an ifgreater was never tested and the script ran straight
// into the next line — the Route 27 Sandstorm house refused TM37 at friendship
// 255 (2026-10-03), the Happiness Rater called every POKeMON mean, and the Victory
// Road gate turned back even an 8-badge player. tools/gen_crystal_scriptvar.mjs
// rebuilds each affected label with the test spliced back in (only labels still
// exactly as transpiled) into overworld/crystal_scriptvar_data.json; the map's
// scripts load with them merged over its own labels.
let PATCHES = {};
export async function loadCrystalScriptVarData(getJSON) {
	PATCHES = ((await getJSON('crystal_scriptvar_data.json').catch(() => null)) || {}).patches || {};
}
export function scriptVarPatches(stem) { return PATCHES[stem] || {}; }
