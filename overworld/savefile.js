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

// parse + sanity-check a chosen file; throws with a human message on junk.
// Only known keys survive — a doctored file can't plant foreign localStorage.
export function parseSave(text) {
	let doc;
	try { doc = JSON.parse(text); } catch (e) { throw new Error('That file is not readable as JSON.'); }
	if (!doc || doc.magic !== MAGIC || !doc.keys || typeof doc.keys !== 'object') {
		throw new Error('That is not a Magepunk save file.');
	}
	const keys = {};
	for (const k of OW_RESET_KEYS) if (typeof doc.keys[k] === 'string') keys[k] = doc.keys[k];
	if (!Object.keys(keys).length) throw new Error('That save file is empty.');
	return { keys, exported_at: doc.exported_at || null };
}

// replace the current game with a parsed save; returns how many keys landed
export function applySave(keys) {
	for (const k of OW_RESET_KEYS) { try { localStorage.removeItem(k); } catch (e) {} }
	let n = 0;
	for (const [k, v] of Object.entries(keys)) { try { localStorage.setItem(k, v); n++; } catch (e) {} }
	return n;
}

// raise a file picker; resolves { name, text } or null if cancelled
export function pickSaveFile() {
	return new Promise(resolve => {
		const inp = document.createElement('input');
		inp.type = 'file';
		inp.accept = '.json,application/json';
		inp.onchange = () => {
			const f = inp.files && inp.files[0];
			if (!f) { resolve(null); return; }
			const r = new FileReader();
			r.onload = () => resolve({ name: f.name, text: String(r.result || '') });
			r.onerror = () => resolve(null);
			r.readAsText(f);
		};
		inp.click();
	});
}
