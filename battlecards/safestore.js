// safestore.js — localStorage that degrades instead of bricking.
//
// Two failure modes used to be able to kill a page outright:
//   • a CORRUPT or truncated blob → JSON.parse throws on load → the page that
//     reads it (collection, deckbuilder, a saved run) dies before it renders.
//   • a FAILED write (quota exceeded, Safari private mode, storage disabled) →
//     setItem throws mid-flow → the action that was saving (open a pack, save a
//     deck, advance a run) blows up and can lose the very state it was storing.
//
// safeLoad falls back to a default on either missing or corrupt data; safeSave
// swallows a failed write and returns false. Both surface through the error
// beacon (window.reportErr, installed by site/topbar.js) so a real player's
// storage trouble shows up on /errors.html instead of a silent dead page.
//
// Node-safe: with no localStorage (tests, SSR) load returns the fallback and
// save returns false, without throwing.

const ls = () => { try { return globalThis.localStorage || null; } catch { return null; } }; // access itself can throw when storage is blocked
const report = (msg, where) => { try { globalThis.reportErr && globalThis.reportErr(msg, where); } catch {} };

// Read + JSON.parse a blob. Missing key → fallback (silent, that's normal).
// Corrupt value → fallback + a reported anomaly (that's a real, actionable event).
// A parsed null/undefined also yields the fallback so callers get a usable value.
export function safeLoad(key, fallback = null) {
	const store = ls();
	if (!store) return fallback;
	let raw;
	try { raw = store.getItem(key); } catch { return fallback; }
	if (raw == null) return fallback;
	try {
		const v = JSON.parse(raw);
		return v == null ? fallback : v;
	} catch {
		report('corrupt save discarded: ' + key, 'safestore.safeLoad');
		return fallback;
	}
}

// Write a JSON blob. Returns true on success, false (reported) on any failure —
// never throws, so a full/blocked store can't crash the flow that was saving.
export function safeSave(key, value) {
	const store = ls();
	if (!store) return false;
	try { store.setItem(key, JSON.stringify(value)); return true; }
	catch (e) { report('save failed (' + ((e && e.name) || 'error') + '): ' + key, 'safestore.safeSave'); return false; }
}

// Write a raw (already-stringified) value — gold counters, auth tokens — with the
// same quota safety. Same contract as safeSave.
export function safeSaveStr(key, str) {
	const store = ls();
	if (!store) return false;
	try { store.setItem(key, String(str)); return true; }
	catch (e) { report('save failed (' + ((e && e.name) || 'error') + '): ' + key, 'safestore.safeSave'); return false; }
}
