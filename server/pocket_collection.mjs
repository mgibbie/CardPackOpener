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
import { cleanDecks } from '../pocketenhanced/js/decklist.js';

// The player's saved decks are kept the same way: `pkdeck:<user>` = { rev, decks, at, ids }, pkdeck-get / pkdeck-put
// { decks, rev, id }. Only legal decks are kept (the engine's own check).
const KINDS = { pkcol: { field: 'col', clean: cleanCollection, what: 'collection' }, pkdeck: { field: 'decks', clean: cleanDecks, what: 'deck list' } };

export async function handlePkcol({ action, body, store, username, json, now }) {
	if (!username) return json({ error: 'not logged in' }, 401);
	const [prefix, verb] = String(action).split('-'), K = KINDS[prefix];
	if (!K) return json({ error: 'unknown action' }, 400);
	const key = prefix + ':' + username, F = K.field;
	const cur = await store.get(key), rev = (cur && Number.isInteger(cur.rev) && cur.rev > 0) ? cur.rev : 0;
	const held = cur ? K.clean(cur[F]) : null;
	const ids = cur && Array.isArray(cur.ids) ? cur.ids.filter(x => typeof x === 'string').slice(-8) : [];
	if (verb === 'get') return json({ rev, [F]: held, ids });
	if (verb === 'put') {
		const col = K.clean(body[F]);
		if (!col) return json({ error: `that ${K.what} cannot be read` }, 400);
		if (body.rev !== rev) return json({ stale: true, rev, [F]: held });
		const id = /^[a-z0-9]{6,24}$/.test(String(body.id || '')) ? String(body.id) : null;
		if (await store.setIfRev(key, { rev: rev + 1, [F]: col, at: now, ids: id ? [...ids, id].slice(-8) : ids }, rev)) return json({ ok: true, rev: rev + 1 });
		const after = await store.get(key);
		return json({ stale: true, rev: (after && after.rev) || 0, [F]: after ? K.clean(after[F]) : null });
	}
	return json({ error: 'unknown action' }, 400);
}
