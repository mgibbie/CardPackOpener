// POKETACTICA MAP MAKER — sharing a made map by code (owner, 2026-11-22: "Map editor"); server/mp.mjs routes ptmap-*.
//   ptmap-put { map }   (signed in) -> { code }   the map read defensively (poketactica/js/editor.js cleanMap) and kept
//                                                 under a new 6-letter code; the same map from the same player gets the
//                                                 same code back (its hash names it)
//   ptmap-get { code }  -> { map, by, at }      anyone (signed in or not) can load a shared map
// Rows: ptmap:<CODE> = { map, by, at, h } (swept 120 days after its last write: GC_TABLE), ptmaph:<user>:<hash> = { code }.
import { cleanMap, saveBlock } from '../poketactica/js/editor.js';

export const PTMAP_CODE_RE = /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{6}$/;
const ABC = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
const MAX_CHARS = 12000;   // (a 32 x 32 map with 24 foes is ~5k)
const hashOf = (s) => { let h = 2166136261 >>> 0; for (let i = 0; i < s.length; i++) { h ^= s.charCodeAt(i); h = Math.imul(h, 16777619) >>> 0; } return h.toString(36); };

export async function handlePtmap({ action, body, store, username, json, now, rnd }) {
	if (action === 'ptmap-get') {
		const code = String(body.code || '').trim().toUpperCase();
		if (!PTMAP_CODE_RE.test(code)) return json({ error: 'a map code is 6 letters and numbers' }, 400);
		const row = await store.get('ptmap:' + code);
		const map = row && cleanMap(row.map);
		if (!map) return json({ error: 'no map with that code' }, 404);
		return json({ map, by: row.by || null, at: row.at || 0 });
	}
	if (action === 'ptmap-put') {
		if (!username) return json({ error: 'sign in to share a map' }, 401);
		if (JSON.stringify(body.map || null).length > MAX_CHARS) return json({ error: 'that map is too big' }, 400);
		const map = cleanMap(body.map);
		if (!map) return json({ error: 'that map cannot be read' }, 400);
		if (saveBlock(map)) return json({ error: 'a map needs at least 2 PvP bases to share' }, 400);
		const h = hashOf(JSON.stringify(map)), hk = 'ptmaph:' + username + ':' + h;
		const had = await store.get(hk);
		if (had && PTMAP_CODE_RE.test(String(had.code))) {
			const row = await store.get('ptmap:' + had.code);
			if (row && row.by === username && row.h === h) { await store.setJSON('ptmap:' + had.code, { ...row, at: now }); return json({ code: had.code }); }
		}
		for (let i = 0; i < 12; i++) {
			let code = ''; for (let k = 0; k < 6; k++) code += ABC[Math.floor(rnd() * ABC.length)];
			if (!(await store.setIfRev('ptmap:' + code, { rev: 1, map, by: username, at: now, h }, 0))) continue;
			await store.setJSON(hk, { code });
			return json({ code });
		}
		return json({ error: 'busy, try again' }, 503);
	}
	return json({ error: 'unknown action' }, 400);
}
