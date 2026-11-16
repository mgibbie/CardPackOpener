// pocket_collection.mjs — a signed-in player's Pocket Enhanced card collection, kept on their account.
//
// One row per account, `pkcol:<user>` = { rev, col, at }. It is never swept (not in GC_TABLE): it is a save.
//   pkcol-get {}                -> { rev, col, ids }   (col null: this account has none yet)
//   pkcol-put { col, rev, id }  -> { ok, rev }         written only if `rev` is still the row's (compare-and-set), or
//                              { stale, rev, col } the row moved on (another device): the client merges and sends again
// The page owns the rules (pocketenhanced/js/collection.js: what a pack gives, what an exchange costs); the server
// keeps what it is sent, read defensively (unknown cards and bad numbers dropped), and never lets a device working
// from an older copy overwrite a newer one. `ids` are the last few writes' ids (each put names itself): a device whose
// page closed before it heard the answer can tell, next time, whether its write landed.
import { cleanCollection } from '../pocketenhanced/js/collection.js';

export async function handlePkcol({ action, body, store, username, json, now }) {
	if (!username) return json({ error: 'not logged in' }, 401);
	const key = 'pkcol:' + username;
	const cur = await store.get(key), rev = (cur && Number.isInteger(cur.rev) && cur.rev > 0) ? cur.rev : 0;
	const held = cur ? cleanCollection(cur.col) : null;
	const ids = cur && Array.isArray(cur.ids) ? cur.ids.filter(x => typeof x === 'string').slice(-8) : [];
	if (action === 'pkcol-get') return json({ rev, col: held, ids });
	if (action === 'pkcol-put') {
		const col = cleanCollection(body.col);
		if (!col) return json({ error: 'that collection cannot be read' }, 400);
		if (body.rev !== rev) return json({ stale: true, rev, col: held });
		const id = /^[a-z0-9]{6,24}$/.test(String(body.id || '')) ? String(body.id) : null;
		if (await store.setIfRev(key, { rev: rev + 1, col, at: now, ids: id ? [...ids, id].slice(-8) : ids }, rev)) return json({ ok: true, rev: rev + 1 });
		const after = await store.get(key);
		return json({ stale: true, rev: (after && after.rev) || 0, col: after ? cleanCollection(after.col) : null });
	}
	return json({ error: 'unknown action' }, 400);
}
