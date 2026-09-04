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

// ---------- the UNOWN DEX ----------
// Each Unown letter is its own species (unown, unown_b … unown_z, unown_exclaim,
// unown_question). For the NATIONAL dex they must all count as the single #201
// "unown" — otherwise catching a letter would inflate the owned count by up to
// 28. So the letter is recorded in a dedicated set, and the id is folded to the
// base before it touches seen/caught.
const UNOWN_KEY = 'magepunk_unown_v1';
let unownSet = new Set(safeLoad(UNOWN_KEY, []));
const UNOWN_SPECIAL = { unown: 'A', unown_exclaim: '!', unown_question: '?' };
function unownLetterOf(id) {
	if (UNOWN_SPECIAL[id]) return UNOWN_SPECIAL[id];
	const m = /^unown_([a-z])$/.exec(id || '');
	return m ? m[1].toUpperCase() : null;
}
export function markUnown(letter) {
	if (!letter || unownSet.has(letter)) return;
	unownSet.add(letter);
	safeSave(UNOWN_KEY, [...unownSet]);
}
export function unownLetters() { return [...unownSet]; }
export function unownCount() { return unownSet.size; }
export function isUnownCaught(letter) { return unownSet.has(letter); }
// fold any Unown letter id to the base #201, recording the letter on the way
function foldUnown(id) {
	const L = unownLetterOf(id);
	if (!L) return id;
	markUnown(L);
	return 'unown';
}

export function markSeen(id) {
	id = foldUnown(id);
	if (!id || dex.seen.has(id)) return;
	dex.seen.add(id);
	save(dex);
}
// caught implies seen
export function markCaught(id) {
	if (!id) return;
	id = foldUnown(id);
	let changed = false;
	if (!dex.seen.has(id)) { dex.seen.add(id); changed = true; }
	if (!dex.caught.has(id)) { dex.caught.add(id); changed = true; }
	if (changed) save(dex);
}
// caught-count milestones -> rewards (claimed once each; batch E item 22)
const CLAIM_KEY = 'magepunk_dexclaims_v1';
export const MILESTONES = [
	[25, 'ultraball', 10, '10 ULTRA BALLS'],
	[75, 'rarecandy', 5, '5 RARE CANDIES'],
	[150, 'destinyknot', 1, 'a DESTINY KNOT'],
	[200, 'shinycharm', 1, 'the SHINY CHARM'],
	// The RIFT PRISM cycles a POKeMON through its alternate forms. It is the only
	// way to register the 41 forms that are transformations rather than catches
	// (weather, held items, abilities, fusions), so it has to be reliably
	// obtainable — a dex reward for dex completion, rather than something hidden
	// at the end of a region only some saves finish.
	[300, 'riftprism', 1, 'the RIFT PRISM'],
	// The ladder used to STOP here — 300 of 1,751 catchable, ~17%, with nothing
	// for the long back half of the dex. These carry it to completion.
	[500, 'masterball', 1, 'a MASTER BALL'],
	[750, 'rarecandy', 20, '20 RARE CANDIES'],
	[1000, 'masterball', 3, '3 MASTER BALLS'],
	[1400, 'rarecandy', 50, '50 RARE CANDIES'],
	[1751, 'dexcrown', 1, 'the DEX CROWN — every POKeMON in the world, caught'],
];
// newly crossed milestones since the last claim (persisted); caller grants
export function claimMilestones() {
	const raw = safeLoad(CLAIM_KEY, []);
	const claimed = new Set(Array.isArray(raw) ? raw : []);
	const n = dex.caught.size;
	const out = [];
	for (const [t, item, count, label] of MILESTONES) {
		if (n >= t && !claimed.has(t)) { claimed.add(t); out.push({ t, item, count, label }); }
	}
	if (out.length) safeSave(CLAIM_KEY, [...claimed]);
	return out;
}
export function caughtCount() { return dex.caught.size; }

// seed from the current party/box on boot so existing saves aren't blank
export function seedFrom(mons) {
	let changed = false;
	for (const m of mons || []) {
		if (!m || !m.speciesId) continue;
		const id = foldUnown(m.speciesId); // an Unown in the party seeds its letter too
		if (!dex.seen.has(id)) { dex.seen.add(id); changed = true; }
		if (!dex.caught.has(id)) { dex.caught.add(id); changed = true; }
	}
	if (changed) save(dex);
}

export function isSeen(id) { return dex.seen.has(id); }
export function isCaught(id) { return dex.caught.has(id); }
export function counts() { return { seen: dex.seen.size, caught: dex.caught.size }; }
