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
import { cleanCollection, newCollection, craftCost, dustValue, spareOf, spares, MAX_COPIES } from '../pocketenhanced/js/collection.js';
import { cleanDecks } from '../pocketenhanced/js/decklist.js';
import { readProgress } from '../pocketenhanced/js/solo.js';

// The player's saved decks are kept the same way: `pkdeck:<user>` = { rev, decks, at, ids }, pkdeck-get / pkdeck-put
// { decks, rev, id }. Only legal decks are kept (the engine's own check).
const KINDS = { pkcol: { field: 'col', clean: cleanCollection, what: 'collection' }, pkdeck: { field: 'decks', clean: cleanDecks, what: 'deck list' },
	// and their solo progress (battles cleared, tasks done, missions claimed): `pksolo:<user>` = { rev, solo, at, ids }
	pksolo: { field: 'solo', clean: readProgress, what: 'solo progress' } };

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
		// (`owed`: dust a breaking-down still owes the account, pkdust-* below: the server's note, kept across the page's writes)
		if (await store.setIfRev(key, { rev: rev + 1, [F]: col, at: now, ids: id ? [...ids, id].slice(-8) : ids, ...(cur && cur.owed ? { owed: cur.owed } : {}) }, rev)) return json({ ok: true, rev: rev + 1 });
		const after = await store.get(key);
		return json({ stale: true, rev: (after && after.rev) || 0, [F]: after ? K.clean(after[F]) : null });
	}
	return json({ error: 'unknown action' }, 400);
}

// ---------------------------------------------------------------------------------------------------------------
// Dust: making a printing, and breaking spare copies down. Dust is on the ACCOUNT row (the dust Battlecards crafts
// with); cards are on the collection row. There is no transaction across two rows, so each is a small state machine
// of single guarded writes that can be run again from wherever it stopped (as a trade is, server/trade.mjs):
//
//   pkdust-craft { print, id }   1. account: dust -= cost, and a note `pkCraft[id] = { print, cost }` (ONE write)
//                                2. collection: the printing added, `id` among the row's ids (ONE write)
//                                3. account: the note removed
//   pkdust-break { print, n, id } or { all: true, id }
//                                1. collection: the spare copies removed, and a note `owed[id] = dust` (ONE write)
//                                2. account: dust += owed, `id` among `pkBroke` (ONE write)
//                                3. collection: the note removed
//   pkdust-settle {}             carries on whatever is half done (every call here does that first)
//
// A request that dies between two steps leaves a note, never a card or dust made or lost: dust that has left the
// account is owed a card; cards that have left the collection are owed dust. `id` is the page's name for the action
// (as a put's is): the same action sent twice is done once.
// -> { ok, dust, col, rev } so the page can take the collection as it now is.
const OPID = /^[a-z0-9]{6,24}$/;
export async function handlePkdust({ action, body, store, username, json, now }) {
	if (!username) return json({ error: 'not logged in' }, 401);
	const CKEY = 'pkcol:' + username;
	/** The account row: read, change, write only if nobody wrote in between. fn(user) -> true to write, 'done', or false. */
	const account = async fn => { for (let i = 0; i < 6; i++) { const cur = await store.getWithLength(username); if (!cur.value) return false; const r = fn(cur.value); if (r === 'done') return true; if (!r) return false; if (await store.setIfLength(username, cur.value, cur.n)) return true; } return false; };
	/** The collection row, on its rev. fn(col, row) -> { col, owed? , id? } to write, 'done', or null. */
	const collection = async fn => { for (let i = 0; i < 6; i++) { const row = (await store.get(CKEY)) || { rev: 0, col: newCollection(), ids: [] }, col = cleanCollection(row.col); if (!col) return false; const r = fn(col, row); if (r === 'done') return true; if (!r) return false;
		const ids = Array.isArray(row.ids) ? row.ids.filter(x => typeof x === 'string') : [], next = { ...row, rev: (row.rev || 0) + 1, col: r.col, at: now, ids: r.id ? [...ids, r.id].slice(-8) : ids };
		if (r.owed && Object.keys(r.owed).length) next.owed = r.owed; else delete next.owed;
		if (await store.setIfRev(CKEY, next, row.rev || 0)) return true; } return false; };
	const addPrint = (id, print) => collection((col, row) => ((row.ids || []).includes(id) ? 'done' : { col: { ...col, prints: { ...col.prints, [print]: Math.min(MAX_COPIES, (col.prints[print] || 0) + 1) } }, owed: row.owed, id }));
	const payOwed = async id => { const row = await store.get(CKEY), n = row && row.owed ? row.owed[id] | 0 : 0; if (!n) return true;
		if (!await account(u => { const done = Array.isArray(u.pkBroke) ? u.pkBroke : []; if (done.includes(id)) return 'done'; u.dust = (u.dust || 0) + n; u.pkBroke = [...done, id].slice(-30); return true; })) return false;
		return collection((col, r2) => { if (!r2.owed || !(id in r2.owed)) return 'done'; const owed = { ...r2.owed }; delete owed[id]; return { col, owed }; }); };
	/** Whatever is half done, carried on. */
	const settle = async () => {
		const u = await store.get(username); if (!u) return false;
		for (const [id, c] of Object.entries(u.pkCraft || {})) { if (!c || !craftCost(c.print)) continue; if (!await addPrint(id, c.print)) return false; if (!await account(x => { if (!x.pkCraft || !(id in x.pkCraft)) return 'done'; delete x.pkCraft[id]; if (!Object.keys(x.pkCraft).length) delete x.pkCraft; return true; })) return false; }
		const row = await store.get(CKEY);
		for (const id of Object.keys((row && row.owed) || {})) if (!await payOwed(id)) return false;
		return true;
	};
	const answer = async extra => { const u = await store.get(username), row = await store.get(CKEY); return json({ ok: true, dust: (u && u.dust) || 0, col: row ? cleanCollection(row.col) : null, rev: (row && row.rev) || 0, ...extra }); };
	if (!await settle()) return json({ error: 'busy: try again' }, 409);
	if (action === 'pkdust-settle') return answer({});
	const id = OPID.test(String(body.id || '')) ? String(body.id) : null;
	if (!id) return json({ error: 'that action has no name' }, 400);

	if (action === 'pkdust-craft') {
		const print = String(body.print || ''), cost = craftCost(print);
		if (!cost) return json({ error: 'that printing cannot be made with dust' }, 400);
		{ const row = await store.get(CKEY); if (row && (row.ids || []).includes(id)) return answer({ made: print, again: true });   // (this very action already landed)
			const col = row ? cleanCollection(row.col) : null; if (col && (col.prints[print] || 0) >= MAX_COPIES) return json({ error: 'you cannot hold any more of that printing' }, 400); }
		let why = '';
		const took = await account(u => { if (u.pkCraft && u.pkCraft[id]) return 'done'; if ((u.dust || 0) < cost) { why = `that takes ${cost} dust (you have ${u.dust || 0})`; return false; } u.dust -= cost; u.pkCraft = { ...(u.pkCraft || {}), [id]: { print, cost } }; return true; });
		if (!took) return json({ error: why || 'busy: try again' }, why ? 400 : 409);
		if (!await settle()) return json({ error: 'busy: it will be finished the next time you open your collection' }, 409);
		return answer({ made: print, cost });
	}
	if (action === 'pkdust-break') {
		let gained = 0, broke = 0, why = '';
		const ok = await collection((col, row) => {
			if ((row.ids || []).includes(id)) return 'done';
			let list;
			if (body.all === true) list = spares(col).list;
			else { const print = String(body.print || ''), n = Math.max(1, Math.min(99, Math.floor(+body.n) || 1)); if (!dustValue(print)) { why = 'that printing cannot be broken down'; return null; } if (spareOf(col, print) < n) { why = `you keep ${Math.min(2, col.prints[print] || 0)} of a card: there ${spareOf(col, print) === 1 ? 'is 1 spare copy' : 'are ' + spareOf(col, print) + ' spare copies'} of that one`; return null; } list = [[print, n]]; }
			if (!list.length) { why = 'you have no spare copies'; return null; }
			const prints = { ...col.prints }; gained = 0; broke = 0;
			for (const [p, n] of list) { prints[p] -= n; if (!(prints[p] > 0)) delete prints[p]; gained += dustValue(p) * n; broke += n; }
			return { col: { ...col, prints }, owed: { ...(row.owed || {}), [id]: gained }, id };
		});
		if (!ok) return json({ error: why || 'busy: try again' }, why ? 400 : 409);
		if (!await settle()) return json({ error: 'busy: the dust will arrive the next time you open your collection' }, 409);
		return answer({ gained, broke });
	}
	return json({ error: 'unknown action' }, 400);
}
