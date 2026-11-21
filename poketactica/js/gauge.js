// gauge.js — paying the Bonus Gauge's items and card packs (stage 5b). progress.js lists them as `owed`; this turns each
// into the real thing, in the game that owns it, without touching another game's save behind its back:
//   - an ITEM (common / uncommon / rare) waits on this device (ITEMS_KEY) until the overworld next opens, which puts it
//     in the Bag itself (overworld/main.js -> drainItems), so only the overworld ever writes the overworld's save
//   - a POCKET pack goes into Pocket Enhanced's collection on this device (what ow_pocketcard.js does with a card); its
//     sync adds it to the account the next time Pocket opens (colsync merge3 adds what changed on the device)
//   - a BATTLECARDS pack lives on the account: the server pays it (`ptgauge-claim`, server/ptgauge.mjs), once per
//     battle seed and at most PACKS_PER_DAY a day. The claim is noted first (BC_KEY) and asked again until answered.
// Nothing here throws into the game.

export const ITEMS_KEY = 'magepunk_poketactica_items_v1';   // [{ id, n }] items won, not yet in the overworld's Bag
export const BC_KEY = 'magepunk_poketactica_bcpacks_v1';     // { seed: packs } Battlecards claims not yet answered
export const QUEUE_MAX = 60, BC_NOTES_MAX = 20;

/** What each tier gives (overworld/bag.js ids). One is picked from the battle's seed. */
export const ITEM_TIERS = Object.freeze({
	common: Object.freeze(['potion', 'superpotion', 'pokeball', 'greatball', 'fullheal', 'ether']),
	uncommon: Object.freeze(['hyperpotion', 'ultraball', 'revive', 'maxpotion', 'rarecandy']),
	rare: Object.freeze(['rarecandy', 'ppup', 'maxrevive', 'fullrestore', 'nugget']),
});
export const itemFor = (tier, rng) => { const l = ITEM_TIERS[tier] || ITEM_TIERS.common; return l[Math.floor(rng() * l.length) % l.length]; };

const read = (LS, k, d) => { try { const v = JSON.parse(LS.getItem(k) || 'null'); return v == null ? d : v; } catch (e) { return d; } };
const write = (LS, k, v) => { try { LS.setItem(k, JSON.stringify(v)); return true; } catch (e) { return false; } };

/** Splits the owed list: -> { items: [id], pocket: n, battlecards: n }. */
export function sortOwed(owed, rng) {
	const out = { items: [], pocket: 0, battlecards: 0 };
	for (const b of owed || []) {
		if (b.kind === 'item') out.items.push(itemFor(b.tier, rng));
		else if (b.kind === 'pack' && b.game === 'pocket') out.pocket++;
		else if (b.kind === 'pack' && b.game === 'battlecards') out.battlecards++;
	}
	return out;
}

/** Items into the device queue for the overworld. */
export function queueItems(ids, LS = globalThis.localStorage) {
	if (!ids.length) return true;
	const q = read(LS, ITEMS_KEY, []), list = Array.isArray(q) ? q : [];
	for (const id of ids) { const e = list.find((x) => x && x.id === id); if (e) e.n = (e.n || 0) + 1; else list.push({ id, n: 1 }); }
	return write(LS, ITEMS_KEY, list.slice(-QUEUE_MAX));
}

/** The overworld's half: the queue into the Bag (`bag`: overworld/bag.js), then the queue is gone. No await between the
 *  two, so a page that dies part way loses nothing and pays nothing twice. -> [{ id, n }] put in the Bag. */
export function drainItems(bag, LS = globalThis.localStorage) {
	const q = read(LS, ITEMS_KEY, null);
	if (!Array.isArray(q) || !q.length) { if (q != null) try { LS.removeItem(ITEMS_KEY); } catch (e) { /* nothing to remove */ } return []; }
	const got = [];
	for (const e of q) {
		const n = Math.max(0, Math.min(99, Math.floor(+(e && e.n)) || 0));
		if (!n || !e.id || !bag.ITEMS[e.id]) continue;   // (an id this build does not know)
		bag.addItem(e.id, n); got.push({ id: e.id, n });
	}
	try { LS.removeItem(ITEMS_KEY); } catch (e) { /* it was read; a second drain would pay again, so say so */ return got; }
	return got;
}

/** Pocket packs into Pocket Enhanced's collection on this device. `sv`: pocketenhanced/js/save.js (passed for tests). */
export async function givePocketPacks(n, sv) {
	if (!(n > 0)) return 0;
	try {
		const SV = sv || await import('../../pocketenhanced/js/save.js');
		const c = SV.collection();
		const add = Math.max(0, Math.min(n, 999 - (c.packs || 0)));
		if (!add) return 0;
		SV.setCollection({ ...c, packs: (c.packs || 0) + add });
		return add;
	} catch (e) { return 0; }
}

/** Notes a Battlecards claim (before asking), so it is asked again if the answer never comes. */
export function noteBattlecards(seed, n, LS = globalThis.localStorage) {
	if (!(n > 0)) return;
	const m = read(LS, BC_KEY, {}), notes = m && typeof m === 'object' && !Array.isArray(m) ? m : {};
	notes[String(seed).slice(0, 80)] = Math.min(9, n);
	const keys = Object.keys(notes); for (const k of keys.slice(0, Math.max(0, keys.length - BC_NOTES_MAX))) delete notes[k];
	write(LS, BC_KEY, notes);
}
/** Asks the server for every noted claim; an answered one (paid, already paid, or refused) is crossed off.
 *  -> { packs, capped } paid now. `call`: MP.call. Only a final answer (`done`: paid, already paid, the day's limit) crosses it off. */
export async function claimBattlecards(call, LS = globalThis.localStorage) {
	const m = read(LS, BC_KEY, {}), notes = m && typeof m === 'object' && !Array.isArray(m) ? m : {};
	let packs = 0, capped = false;
	for (const [seed, n] of Object.entries(notes)) {
		let r = null;
		try { r = await call('ptgauge-claim', { seed, n }); } catch (e) { continue; }   // (no answer: asked again next time)
		if (!r || !r.done) continue;   // (not signed in, rate-limited, offline: the note stays)
		packs += r.packs || 0; capped = capped || !!r.capped;
		const cur = read(LS, BC_KEY, {}); if (cur && typeof cur === 'object') { delete cur[seed]; write(LS, BC_KEY, cur); }
	}
	return { packs, capped };
}

/** The names the results screen shows (the Bag's own, in its case). */
export const ITEM_NAMES = Object.freeze({ potion: 'Potion', superpotion: 'Super Potion', pokeball: 'Poké Ball', greatball: 'Great Ball', fullheal: 'Full Heal', ether: 'Ether', hyperpotion: 'Hyper Potion', ultraball: 'Ultra Ball', revive: 'Revive', maxpotion: 'Max Potion', rarecandy: 'Rare Candy', ppup: 'PP Up', maxrevive: 'Max Revive', fullrestore: 'Full Restore', nugget: 'Nugget' });

/** Pays a won battle's owed rewards. -> { items: [id], pocket: n, battlecards: { want, paid, capped, pending } }.
 *  `signedIn`: whether the Battlecards claim can be asked now (a guest's waits on the device until they sign in). */
export async function payOwed({ owed, seed, rng, call, signedIn, LS = globalThis.localStorage, sv }) {
	const s = sortOwed(owed, rng);
	queueItems(s.items, LS);
	const pocket = await givePocketPacks(s.pocket, sv);
	const bc = { want: s.battlecards, paid: 0, capped: false, pending: false };
	if (s.battlecards) {
		noteBattlecards(seed, s.battlecards, LS);
		if (signedIn) { const r = await claimBattlecards(call, LS); bc.paid = r.packs; bc.capped = r.capped; }
		const left = read(LS, BC_KEY, {}); bc.pending = !!(left && left[String(seed).slice(0, 80)]);
	}
	return { items: s.items, pocket, battlecards: bc };
}
