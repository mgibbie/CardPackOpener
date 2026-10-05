// scroll_multichoice.js — Emerald's `special ShowScrollableMultichoice`.
//
// The script puts a SCROLL_MULTI_* list in VAR_0x8004 and waits for the pick in
// VAR_RESULT. It was never implemented, so the Glass Workshop's flute and
// furniture menu never opened and the script branched on a stale VAR_RESULT
// (2026-10-05). The lists come from the decomp via tools/gen_scroll_multichoice.mjs;
// the menu is the same one the restored multichoice op uses (choice.js).
let DATA = { lists: {}, byNumber: {} };
export async function loadScrollMultichoice(getJSON) {
	DATA = (await getJSON('scroll_multichoice_data.json').catch(() => null)) || DATA;
}
// a list by name (SCROLL_MULTI_GLASS_WORKSHOP_VENDOR) or by its decomp number
export function scrollOptions(v) {
	const name = typeof v === 'number' ? DATA.byNumber[v] : String(v || '');
	return name && DATA.lists[name] ? { name, options: DATA.lists[name] } : null;
}
