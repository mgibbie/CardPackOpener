// safestore.js — localStorage that degrades instead of bricking (overworld copy).
//
// Mirrors battlecards/safestore.js so the overworld's import graph stays
// self-contained (the two games deploy from one repo but don't cross-import).
// A CORRUPT blob → JSON.parse throws on load → the page dies before it renders;
// a FAILED write (quota exceeded, private mode, storage disabled) → setItem
// throws mid-flow → the save that was happening blows up. safeLoad falls back to
// a default on missing OR corrupt; safeSave swallows a failed write and returns
// false. Both surface through the error beacon (window.reportErr, from
// site/topbar.js) so a real player's storage trouble shows up on /errors.html.
// Node-safe: with no localStorage, load returns the fallback and save returns
// false, without throwing.

const ls = () => { try { return globalThis.localStorage || null; } catch { return null; } };
const report = (msg, where) => { try { globalThis.reportErr && globalThis.reportErr(msg, where); } catch {} };

// Read + JSON.parse a blob. Missing → fallback (silent, normal). Corrupt →
// fallback + a reported anomaly. A parsed null/undefined also yields the fallback.
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

// Write a JSON blob. true on success, false (reported) on any failure — never
// throws, so a full/blocked store can't crash the flow that was saving.
export function safeSave(key, value) {
	const store = ls();
	if (!store) return false;
	try { store.setItem(key, JSON.stringify(value)); return true; }
	catch (e) { report('save failed (' + ((e && e.name) || 'error') + '): ' + key, 'safestore.safeSave'); return false; }
}

// Write an already-stringified value (money/playtime counters, names) with the
// same quota safety. Same contract as safeSave.
export function safeSaveStr(key, str) {
	const store = ls();
	if (!store) return false;
	try { store.setItem(key, String(str)); return true; }
	catch (e) { report('save failed (' + ((e && e.name) || 'error') + '): ' + key, 'safestore.safeSave'); return false; }
}
