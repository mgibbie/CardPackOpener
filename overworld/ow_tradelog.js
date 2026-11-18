// ow_tradelog.js — how the overworld hands Pokémon and items to a trade, and takes them from one, without ever losing
// or doubling them. Pure: plain data in, plain data out (ow_pvp.js does the storage and the server calls).
//
// The server never writes a save (server/trade.mjs): this game takes what was offered OUT of the save and tells the
// server ("deposit"), and puts what arrives INTO the save and tells the server ("ack"). Both are two things that cannot
// happen at once (a change here, a message there), so each keeps a note IN THE SAVE of what it was doing:
//
//   the journal   one entry per trade this game has handed things to: { offer, state, bagWas }
//                 state 'taking'  written BEFORE anything is removed  (a page that dies here may or may not have removed)
//                 state 'out'     written AFTER everything is removed (they are out of the save for certain)
//                 The entry stays until the server says how the trade ended; `resolve()` then says what to do.
//   the applied   the ids of deliveries already added to the save. A delivery is added and its id noted in the same
//   list          breath; one seen again (the ack was lost) is not added twice.
export const JOURNAL_KEY = 'magepunk_trade_journal_v1', APPLIED_KEY = 'magepunk_trade_applied_v1';
// Money and Game Corner coins travel the same way (2026-11-18). `purse` = { money, coins }: what the save holds now.
// Every function takes it last and optional, so a caller with no purse trades Pokémon and items exactly as before.
const amt = v => Math.max(0, Math.floor(+v) || 0);
const bare = m => { const c = { ...m }; delete c._src; return JSON.stringify(c); };

/** Where each offered Pokémon is in the save right now -> { party: [index…], box: [index…] }, or null if one is not
 *  there any more (it was moved, changed or released since the offer was made). Each slot answers for one Pokémon. */
export function locate(pokemon, party, box) {
	const used = { party: new Set(), box: new Set() }, out = { party: [], box: [] };
	for (const m of pokemon || []) {
		const want = bare(m), [z, i] = String(m._src || '').split(':'), hint = z === 'party' || z === 'box' ? [z, +i] : null;
		let hit = null;
		if (hint) { const arr = hint[0] === 'party' ? party : box; if (arr[hint[1]] && !used[hint[0]].has(hint[1]) && bare(arr[hint[1]]) === want) hit = hint; }
		if (!hit) for (const [zone, arr] of [['party', party], ['box', box]]) { const k = arr.findIndex((x, n) => !used[zone].has(n) && bare(x) === want); if (k >= 0) { hit = [zone, k]; break; } }
		if (!hit) return null;
		used[hit[0]].add(hit[1]); out[hit[0]].push(hit[1]);
	}
	return out;
}
/** Can this offer be handed over from this save? -> why not, or null. (The last Pokémon of the party stays.) */
export function whyNotTake(offer, party, box, bag, purse) {
	const at = locate(offer.pokemon, party, box); if (!at) return 'a Pokémon you offered is no longer where it was';
	if (party.length > 0 && at.party.length >= party.length) return 'you cannot trade away your whole party';
	for (const it of offer.items || []) if (((bag || {})[it.id] || 0) < it.count) return 'you no longer have an item you offered';
	if (amt(offer.money) > amt(purse && purse.money)) return 'you no longer have the money you offered';
	if (amt(offer.coins) > amt(purse && purse.coins)) return 'you no longer have the coins you offered';
	return null;
}
/** The save without what was offered -> { party, box, bag }, or null if it cannot be taken. */
export function takeOut(offer, party, box, bag, purse) {
	if (whyNotTake(offer, party, box, bag, purse)) return null;
	const at = locate(offer.pokemon, party, box), b = { ...bag };
	for (const it of offer.items || []) { b[it.id] -= it.count; if (!(b[it.id] > 0)) delete b[it.id]; }
	return { party: party.filter((_, i) => !at.party.includes(i)), box: box.filter((_, i) => !at.box.includes(i)), bag: b, money: amt(purse && purse.money) - amt(offer.money), coins: amt(purse && purse.coins) - amt(offer.coins) };
}
/** The save with a bundle added: Pokémon to the PC box, items to the bag, money and coins to the purse -> { box, bag, money, coins }.
 *  (Coins from a trade are all kept, even past what the COIN CASE takes in winnings: bag.js addCoins never cuts a balance down.) */
export function putIn(bundle, box, bag, purse) {
	const b = { ...bag }; for (const it of bundle.items || []) if (it && it.id && it.count > 0) b[it.id] = (b[it.id] || 0) + it.count;
	return { box: [...box, ...(bundle.pokemon || []).map(m => { const c = { ...m }; delete c._src; return c; })], bag: b, money: amt(purse && purse.money) + amt(bundle.money), coins: amt(purse && purse.coins) + amt(bundle.coins) };
}

// ---------- the journal ----------
export const readJournal = raw => { try { const j = JSON.parse(raw || '{}'); return j && typeof j === 'object' && !Array.isArray(j) ? j : {}; } catch { return {}; } };
/** Before removing: note what is about to leave, and how many of each offered item the bag holds now. */
export function noteTaking(journal, tid, offer, bag, side, purse) {
	const bagWas = {}; for (const it of offer.items || []) bagWas[it.id] = (bag || {})[it.id] || 0;
	return { ...journal, [tid]: { state: 'taking', side: side === 'B' ? 'B' : 'A', offer: { pokemon: offer.pokemon || [], items: offer.items || [], money: amt(offer.money), coins: amt(offer.coins) }, bagWas, purseWas: { money: amt(purse && purse.money), coins: amt(purse && purse.coins) }, at: Date.now() } };
}
export const noteOut = (journal, tid) => (journal[tid] ? { ...journal, [tid]: { ...journal[tid], state: 'out' } } : journal);
export const drop = (journal, tid) => { const j = { ...journal }; delete j[tid]; return j; };
/** A page that died in the middle of 'taking': did the removal happen? (Are the Pokémon gone and the items fewer?) */
export function wasTaken(entry, party, box, bag, purse) {
	if (entry.state === 'out') return true;
	const o = entry.offer;
	if (o.pokemon.length) return !locate(o.pokemon, party, box);
	if (o.items.some(it => ((bag || {})[it.id] || 0) < (entry.bagWas[it.id] || 0))) return true;
	const was = entry.purseWas || {};
	return (amt(o.money) > 0 && amt(purse && purse.money) < amt(was.money)) || (amt(o.coins) > 0 && amt(purse && purse.coins) < amt(was.coins));
}
/** What to do about a journal entry, given what the server says of its trade (`t`: the trade's view, or null if the
 *  server has no such trade; `mine`: 'A' or 'B'). -> 'keep' | 'drop' | 'restore' | 'deposit'
 *    drop     the things are the trade's (it was carried out, or the server is sending them back itself)
 *    restore  the server never had them and never will: put them back in the save
 *    deposit  the server is still waiting for them: say so again */
export function resolve(entry, t, mine, taken) {
	if (!taken) return 'drop';                                  // nothing ever left the save
	if (!t) return 'restore';                                   // no such trade: it never had them
	const depo = mine === 'A' ? t.depoA : t.depoB;
	if (t.phase === 'done' || t.phase === 'deliver') return depo ? 'drop' : 'restore';   // (carried out without them cannot happen; if it somehow did, they are still the player's)
	if (t.phase === 'cancelled') return depo ? 'drop' : 'restore';   // (handed over, then cancelled: the server returns them through the delivery box)
	if (t.phase === 'wait') return depo ? 'keep' : 'deposit';
	return 'restore';                                           // (still talking: nothing was meant to leave yet)
}

// ---------- the mailbox trade (a POKeMON sent to a friend who may not be here): its notes ----------
// { out: [{ oid, to, mon }], acc: [{ id, from, mon }] }: offers sent and trades accepted that the server has not yet
// been heard to have taken. Each is asked again until it answers (the server gives the same answer to the same question).
export const MAIL_KEY = 'magepunk_mailtrade_v1';
export const readMail = raw => { try { const m = JSON.parse(raw || '{}'); return { out: Array.isArray(m.out) ? m.out : [], acc: Array.isArray(m.acc) ? m.acc : [] }; } catch { return { out: [], acc: [] }; } };
export const newOid = () => 'o' + Date.now().toString(36) + Math.random().toString(36).slice(2, 8);
/** A reply that settles the matter (the server heard and said yes or no), as against no reply at all. */
export const heard = r => !!r && (r.ok === true || typeof r.error === 'string');

// ---------- deliveries ----------
export const readApplied = raw => { try { const a = JSON.parse(raw || '[]'); return Array.isArray(a) ? a.map(String) : []; } catch { return []; } };
/** Add the deliveries not yet in the save -> { box, bag, applied, fresh: [the ones added], ack: [every id seen] }. */
export function applyDeliveries(list, applied, box, bag, purse) {
	let b = box, g = bag, p = { money: amt(purse && purse.money), coins: amt(purse && purse.coins) }; const done = applied.slice(), fresh = [], ack = [];
	for (const e of list || []) {
		if (!e || typeof e.id !== 'string') continue;
		ack.push(e.id);
		if (done.includes(e.id)) continue;
		const r = putIn(e, b, g, p); b = r.box; g = r.bag; p = { money: r.money, coins: r.coins }; done.push(e.id); fresh.push(e);
	}
	return { box: b, bag: g, money: p.money, coins: p.coins, applied: done.slice(-80), fresh, ack };
}
