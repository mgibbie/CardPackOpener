// colsync.js — keeps a signed-in player's collection on their account (server/pocket_collection.mjs), so every
// device they sign in on has the same cards. A guest's collection stays on the device, as before.
//
// The device keeps what it last agreed with the account ({ user, rev, base }), and, while a write is out, what it sent
// ({ sent: { id, base } }): if the page closes before the answer, the next sync asks the account whether that write
// landed (its `ids`) instead of guessing, so a change is never applied twice or dropped.
// A sync reads the account's copy and applies what changed HERE since `base` on top of it (collection.js merge3):
// packs opened on two devices both count, and neither copy is ever simply overwritten. A device signing in for the first time adds what was earned
// on it to the account (linkFirst). Nothing here throws into the game; offline, the device copy carries on and the
// next sync sends the difference.
import { merge3, linkFirst, sameCollection, cleanCollection } from './collection.js';
import { mergeDecks3, linkDecks, sameDecks, cleanDecks } from './decklist.js';
import { mergeProgress, sameProgress, readProgress } from './solo.js';

/** What is kept on the account: its two server actions, the field it travels in, the device's note of the agreed copy, and its merge rules. */
export const COLLECTION = Object.freeze({ get: 'pkcol-get', put: 'pkcol-put', field: 'col', key: 'magepunk_pocket_collection_sync_v1', merge3, link: linkFirst, same: sameCollection, clean: cleanCollection });
export const DECKS = Object.freeze({ get: 'pkdeck-get', put: 'pkdeck-put', field: 'decks', key: 'magepunk_pocket_decks_sync_v1', merge3: mergeDecks3, link: linkDecks, same: sameDecks, clean: cleanDecks });

// (solo battles cleared, tasks done, missions claimed: progress only grows, so any two copies are simply joined)
export const SOLO = Object.freeze({ get: 'pksolo-get', put: 'pksolo-put', field: 'solo', key: 'magepunk_pocket_solo_sync_v1', merge3: (base, mine, theirs) => mergeProgress(mine, theirs), link: mergeProgress, same: sameProgress, clean: readProgress });

export const SYNC_KEY = COLLECTION.key;
const readMeta = (LS, K, user) => {
	try {
		const m = JSON.parse(LS.getItem(K.key) || 'null'); if (!m || m.user !== user || !Number.isInteger(m.rev)) return null;
		const base = K.clean(m.base), sent = m.sent && typeof m.sent.id === 'string' && K.clean(m.sent.base) ? { id: m.sent.id, base: K.clean(m.sent.base) } : null;
		return base || sent ? { user, rev: m.rev, base, sent } : null;
	} catch (e) { return null; }
};
const newId = () => { const a = new Uint32Array(2); try { crypto.getRandomValues(a); } catch (e) { a[0] = Date.now() >>> 0; a[1] = (Math.random() * 2 ** 32) >>> 0; } return (a[0].toString(36) + a[1].toString(36)).padStart(8, '0'); };
const writeMeta = (LS, K, m) => { try { LS.setItem(K.key, JSON.stringify(m)); } catch (e) { /* no room: the next sync links again */ } };

/**
 * createSync({ call, user, getLocal, setLocal, onStatus }) -> { now(), soon(), status() }
 *   call(action, body) -> the server's reply (or throws / null offline); user() -> the signed-in name or null;
 *   getLocal() -> the device's collection; setLocal(col) keeps a collection changed by the account's copy.
 * status: 'guest' | 'syncing' | 'saved' | 'offline'.
 */
export function createSync({ call, user, getLocal, setLocal, onStatus, delay = 1200, storage, kind }) {
	const K = kind || COLLECTION;
	const LS = storage || localStorage;   // (a test gives each pretend device its own)
	let running = null, again = false, timer = 0, status = user() ? 'syncing' : 'guest';
	const set = s => { if (s !== status) { status = s; if (onStatus) { try { onStatus(s); } catch (e) { /* the page's business */ } } } };
	async function once() {
		const me = user(); if (!me) { set('guest'); return; }
		set('syncing');
		for (let tries = 0; tries < 4; tries++) {
			let meta = readMeta(LS, K, me);
			let r = null; try { r = await call(K.get, {}); } catch (e) { r = null; }
			if (!r || r.error || !Number.isInteger(r.rev)) { set('offline'); return; }
			// a write this device sent and never heard back about: did it land?
			if (meta && meta.sent) meta = (r.ids || []).includes(meta.sent.id) ? { user: me, rev: r.rev, base: meta.sent.base } : meta.base ? { user: me, rev: meta.rev, base: meta.base } : null;
			const theirs = r[K.field] ? K.clean(r[K.field]) : null, mine = getLocal();
			// what the account should hold now: its copy plus what this device did since they last agreed
			// (a device with no note of an agreed copy whose cards ARE the account's has nothing to add: it lost its note)
			const merged = !theirs ? mine : meta ? K.merge3(meta.base, mine, theirs) : K.same(mine, theirs) ? theirs : K.link(mine, theirs);
			if (theirs && K.same(merged, theirs)) { writeMeta(LS, K, { user: me, rev: r.rev, base: merged }); if (!K.same(mine, merged)) setLocal(merged); set('saved'); return; }
			const id = newId();
			writeMeta(LS, K, { user: me, rev: meta ? meta.rev : r.rev, base: meta ? meta.base : null, sent: { id, base: mine } });
			let p = null; try { p = await call(K.put, { [K.field]: merged, rev: r.rev, id }); } catch (e) { p = null; }
			if (!p || p.error) { set('offline'); return; }
			if (p.stale) { writeMeta(LS, K, meta ? { user: me, rev: meta.rev, base: meta.base } : { user: me, rev: 0, base: null }); continue; }   // another device wrote in between (ours did not land): read again
			// agreed. Anything done here while the request was out stays on top (it goes up with the next sync).
			const nowLocal = getLocal(), kept = K.same(nowLocal, mine) ? merged : K.merge3(mine, nowLocal, merged);
			writeMeta(LS, K, { user: me, rev: p.rev, base: merged });
			if (!K.same(nowLocal, kept)) setLocal(kept);
			if (!K.same(kept, merged)) again = true;
			set('saved'); return;
		}
		set('offline');
	}
	function now() {
		if (running) { again = true; return running; }
		running = once().catch(() => set('offline')).then(() => { running = null; if (again) { again = false; return now(); } });
		return running;
	}
	/** After a change on this device: send it shortly (several changes in a row go up together). */
	function soon() { if (!user()) { set('guest'); return; } clearTimeout(timer); timer = setTimeout(now, delay); }
	return { now, soon, status: () => status };
}
