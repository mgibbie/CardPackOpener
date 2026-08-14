// pokedex.js — persistent "seen" and "caught" species tracking, backing the
// Pokédex menu and the Trainer Card counts. Seen is recorded when a species
// shows up in battle; caught when it joins the party (or is already there).
import { safeLoad, safeSave } from './safestore.js';
const KEY = 'magepunk_dex_v1';

function load() {
	const d = safeLoad(KEY, null);
	if (d && Array.isArray(d.seen) && Array.isArray(d.caught)) {
		return { seen: new Set(d.seen), caught: new Set(d.caught) };
	}
	return { seen: new Set(), caught: new Set() };
}
function save(d) {
	safeSave(KEY, { seen: [...d.seen], caught: [...d.caught] });
}

let dex = load();

export function markSeen(id) {
	if (!id || dex.seen.has(id)) return;
	dex.seen.add(id);
	save(dex);
}
// caught implies seen
export function markCaught(id) {
	if (!id) return;
	let changed = false;
	if (!dex.seen.has(id)) { dex.seen.add(id); changed = true; }
	if (!dex.caught.has(id)) { dex.caught.add(id); changed = true; }
	if (changed) save(dex);
}
// seed from the current party/box on boot so existing saves aren't blank
export function seedFrom(mons) {
	let changed = false;
	for (const m of mons || []) {
		if (!m || !m.speciesId) continue;
		if (!dex.seen.has(m.speciesId)) { dex.seen.add(m.speciesId); changed = true; }
		if (!dex.caught.has(m.speciesId)) { dex.caught.add(m.speciesId); changed = true; }
	}
	if (changed) save(dex);
}

export function isSeen(id) { return dex.seen.has(id); }
export function isCaught(id) { return dex.caught.has(id); }
export function counts() { return { seen: dex.seen.size, caught: dex.caught.size }; }
