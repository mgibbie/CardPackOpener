// savefile.js — the player-facing backup: the whole overworld save as a
// downloadable file, and the restore that reads one back.
//
// The key list is owreset's OW_RESET_KEYS — the one canonical inventory of
// everything the overworld owns — so export, import, and reset can never
// drift apart. A restore CLEARS those keys first: a save file is a moment in
// time, and keys it lacks (a repel that was burning, a battle left mid-fight)
// must not leak through from the game being replaced.
import { OW_RESET_KEYS } from '../site/owreset.js';

const MAGIC = 'magepunk-ow-save';

export function buildSave() {
	const keys = {};
	for (const k of OW_RESET_KEYS) {
		try { const v = localStorage.getItem(k); if (v != null) keys[k] = v; } catch (e) {}
	}
	return { magic: MAGIC, version: 1, exported_at: new Date().toISOString(), keys };
}

// download the current game as a file; returns how many keys it captured
export function exportSave() {
	const doc = buildSave();
	const who = (localStorage.getItem('magepunk_name') || 'player').toLowerCase().replace(/[^a-z0-9]+/g, '-');
	const blob = new Blob([JSON.stringify(doc, null, '\t')], { type: 'application/json' });
	const a = document.createElement('a');
	a.href = URL.createObjectURL(blob);
	a.download = `magepunk-save-${who}-${doc.exported_at.slice(0, 10)}.json`;
	document.body.appendChild(a); a.click(); a.remove();
	setTimeout(() => URL.revokeObjectURL(a.href), 5000);
	return Object.keys(doc.keys).length;
}

// ---------- validation: the WHOLE file, before anything is touched ----------
// Every problem is collected (not just the first), so a failed import says
// exactly what to fix. Nothing in here writes storage.
export const SAVE_VERSION = 1;
// plain-text keys (written with safeSaveStr, not JSON)
const TEXT_KEYS = new Set(['magepunk_region', 'magepunk_starter', 'magepunk_rival', 'magepunk_name', 'magepunk_repellast']);
// non-negative integer keys
const INT_KEYS = new Set(['magepunk_ow_rev', 'magepunk_playtime', 'magepunk_tid', 'magepunk_money', 'magepunk_coins_v1', 'magepunk_repel_v1']);
const isObj = v => v != null && typeof v === 'object' && !Array.isArray(v);
// shape checks for the keys a broken value would wreck on boot
const SHAPES = {
	magepunk_party_v1: v => Array.isArray(v) && v.length <= 6 && v.every(isObj) ? null : 'must be a list of at most 6 POKeMON objects',
	magepunk_box_v1: v => Array.isArray(v) ? null : 'must be a list',
	magepunk_pos_v1: v => isObj(v) && typeof v.map === 'string' && Number.isFinite(v.x) && Number.isFinite(v.y) ? null : 'must be { map, x, y }',
	magepunk_story: v => isObj(v) ? null : 'must be an object',
	magepunk_badges_v1: v => isObj(v) || Array.isArray(v) ? null : 'must be an object',
	magepunk_bag_v1: v => isObj(v) ? null : 'must be an object',
	magepunk_dex_v1: v => isObj(v) ? null : 'must be an object',
};
// Does the file hold an actual GAME? (the same absence test the sync uses)
function gameWeight(keys) {
	let w = 0;
	const arr = k => { try { const v = JSON.parse(keys[k] || 'null'); return Array.isArray(v) ? v.length : 0; } catch (e) { return 0; } };
	if (arr('magepunk_party_v1') > 0) w++;
	if (arr('magepunk_box_v1') > 0) w++;
	if (keys['magepunk_region']) w++;
	try { const b = JSON.parse(keys['magepunk_badges_v1'] || 'null'); if (b && Object.keys(b).length) w++; } catch (e) {}
	return w;
}

// Validate a save export (text or an already-parsed object).
// -> { ok, errors: [..], keys, fileRev, exported_at, version }
export function validateSave(input) {
	const errors = [];
	let doc = input;
	if (typeof input === 'string') {
		try { doc = JSON.parse(input); } catch (e) { return { ok: false, errors: ['The file is not valid JSON: ' + (e && e.message || e)] }; }
	}
	if (!isObj(doc)) return { ok: false, errors: ['Expected a Magepunk save export object ({ magic, version, keys }).'] };
	if (doc.magic !== MAGIC) return { ok: false, errors: [`Not a Magepunk overworld save: "magic" must be "${MAGIC}" (got ${JSON.stringify(doc.magic)}).`] };
	const version = doc.version == null ? SAVE_VERSION : doc.version;   // pre-versioned exports read as v1
	if (version !== SAVE_VERSION) errors.push(`Unsupported save version ${JSON.stringify(version)}; this build reads version ${SAVE_VERSION}.`);
	if (!isObj(doc.keys)) return { ok: false, errors: [...errors, '"keys" must be an object of save strings.'] };
	const known = new Set(OW_RESET_KEYS);
	const unknown = Object.keys(doc.keys).filter(k => !known.has(k));
	if (unknown.length) errors.push(`Unknown save keys (from a different build?): ${unknown.join(', ')}. Nothing was imported.`);
	const keys = {};
	for (const k of OW_RESET_KEYS) {
		if (!(k in doc.keys)) continue;
		const v = doc.keys[k];
		if (typeof v !== 'string') { errors.push(`${k}: must be a string (got ${v === null ? 'null' : typeof v}).`); continue; }
		if (TEXT_KEYS.has(k)) { if (v.length > 200) errors.push(`${k}: text longer than 200 characters.`); }
		else if (INT_KEYS.has(k)) { if (!/^\d+$/.test(v.trim())) errors.push(`${k}: must be a whole number (got ${JSON.stringify(v.slice(0, 40))}).`); }
		else {
			let parsed;
			try { parsed = JSON.parse(v); } catch (e) { errors.push(`${k}: not valid JSON (${e && e.message || e}).`); continue; }
			const why = SHAPES[k] ? SHAPES[k](parsed) : null;
			if (why) errors.push(`${k}: ${why}.`);
		}
		keys[k] = v;
	}
	if (!errors.length && !Object.keys(keys).length) errors.push('The save file holds no save keys.');
	if (!errors.length && gameWeight(keys) === 0) errors.push('The save file holds no game (no POKeMON, region or badges); refusing to replace a game with it.');
	const fileRev = Math.max(0, parseInt(keys['magepunk_ow_rev'], 10) || 0);
	return { ok: errors.length === 0, errors, keys, fileRev, exported_at: doc.exported_at || null, version };
}

// parse + validate a chosen file; throws with a human message on junk.
// Only known keys are accepted: a doctored file can't plant foreign localStorage.
export function parseSave(text) {
	const v = validateSave(text);
	if (!v.ok) throw new Error(v.errors.join('\n'));
	return { keys: v.keys, exported_at: v.exported_at, fileRev: v.fileRev };
}

// replace the current game with a parsed save; returns how many keys landed
// (the raw primitive; the import paths use applySaveSafely below)
export function applySave(keys) {
	for (const k of OW_RESET_KEYS) { try { localStorage.removeItem(k); } catch (e) {} }
	let n = 0;
	for (const [k, v] of Object.entries(keys)) { try { localStorage.setItem(k, v); n++; } catch (e) {} }
	return n;
}

// ---------- apply with a backup and a rollback ----------
// The game being replaced is written to a LOCAL-ONLY backup key first (it is not
// in OW_RESET_KEYS, so it never syncs and a reset never sweeps it); if that
// write fails, nothing is touched. Every key is then read back; any write that
// did not stick rolls the whole game back to the backup.
export const IMPORT_BACKUP_KEY = 'magepunk_ow_import_backup';
const currentKeys = () => { const o = {}; for (const k of OW_RESET_KEYS) { try { const v = localStorage.getItem(k); if (v != null) o[k] = v; } catch (e) {} } return o; };
function writeAll(keys) {
	for (const k of OW_RESET_KEYS) { try { localStorage.removeItem(k); } catch (e) {} }
	const failed = [];
	for (const [k, v] of Object.entries(keys)) {
		try { localStorage.setItem(k, v); } catch (e) {}
		if (localStorage.getItem(k) !== v) failed.push(k);
	}
	return failed;
}
// -> { ok, applied, backupAt } or { ok:false, error, rolledBack }
export function applySaveSafely(keys) {
	const before = currentKeys();
	const backup = { magic: MAGIC, version: SAVE_VERSION, backed_up_at: new Date().toISOString(), keys: before };
	const raw = JSON.stringify(backup);
	try { localStorage.setItem(IMPORT_BACKUP_KEY, raw); } catch (e) {}
	if (localStorage.getItem(IMPORT_BACKUP_KEY) !== raw) {
		return { ok: false, rolledBack: false, error: 'Could not back up the current game (browser storage full?), so nothing was changed.' };
	}
	const failed = writeAll(keys);
	if (failed.length) {
		const back = writeAll(before);
		return { ok: false, rolledBack: back.length === 0, error: `Storage refused ${failed.length} key(s) (${failed.slice(0, 5).join(', ')}); the previous game was restored${back.length ? ' EXCEPT ' + back.join(', ') + ' (a copy is in ' + IMPORT_BACKUP_KEY + ')' : ''}.` };
	}
	return { ok: true, applied: Object.keys(keys).length, backupAt: backup.backed_up_at };
}
// the game an import replaced, or null
export function importBackup() {
	try { const d = JSON.parse(localStorage.getItem(IMPORT_BACKUP_KEY) || 'null'); return d && d.keys ? d : null; } catch (e) { return null; }
}

// raise a file picker; resolves { name, text } or null if cancelled
export function pickSaveFile() {
	return new Promise(resolve => {
		// in the DOM (hidden, with an id) while it is open, so upload tooling can
		// target it; a detached input can only be driven by the native chooser
		document.getElementById('ow-save-file')?.remove();
		const inp = document.createElement('input');
		inp.type = 'file';
		inp.id = 'ow-save-file';
		inp.accept = '.json,application/json';
		inp.style.display = 'none';
		document.body.appendChild(inp);
		inp.onchange = () => {
			const f = inp.files && inp.files[0];
			inp.remove();
			if (!f) { resolve(null); return; }
			const r = new FileReader();
			r.onload = () => resolve({ name: f.name, text: String(r.result || '') });
			r.onerror = () => resolve(null);
			r.readAsText(f);
		};
		inp.click();
	});
}
