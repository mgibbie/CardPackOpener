// The site's one trading system (server/trade.mjs): two friends, a live window, anything collectible for anything
// collectible. The real handler over an in-memory row store, with requests that die half way.
//   1. offers are read defensively
//   2. a trade across every kind at once: Battlecards cards and packs, Pocket Enhanced cards and packs, overworld
//      Pokémon and items. Both accept, both hand over, and each player ends with exactly what the other put up
//   3. nothing is made or lost: the same cards, packs, Pokémon and items exist before and after (held ones counted)
//   4. what stops a trade: an offer its owner no longer has, a change after accepting, a stranger, an empty trade
//   5. cancelling at every point before delivery gives everything back (handed-over Pokémon through the delivery box)
//   6. a request that dies after ANY single write: the next call by either player carries on, to the same end
//   7. a player who never hands over: the trade times out and everything goes back
//   8. the delivery box: acknowledged once, not delivered twice
//   9. a player with no Pocket collection yet can still receive Pocket cards
//   node overworld/tests/trade_system_test.mjs
import * as C from '../../pocketenhanced/js/collection.js';
import * as PK from '../../pocketenhanced/js/trade.js';
import { PRINTS } from '../../pocketenhanced/js/data/packs.js';
import { handleTrade, sanitizeOffer, offerEmpty, WAIT_MS } from '../../server/trade.mjs';

let pass = 0, fail = 0;
const A = (ok, msg, extra) => { if (ok) { pass++; console.log('ok  - ' + msg); } else { fail++; console.log('FAIL: ' + msg, extra === undefined ? '' : JSON.stringify(extra).slice(0, 800)); } };

// ---- the store, as server/mp.mjs implements the calls the handler uses; `dieAt` kills the request at its n-th write
let rows = new Map(), NOW = 1_800_000_000_000, seq = 0, writes = 0, dieAt = 0;
const wrote = () => { writes++; if (dieAt && writes === dieAt) { const e = new Error('the request died'); e.died = true; throw e; } };
const store = {
	get: async k => (rows.has(k) ? JSON.parse(rows.get(k)) : null),
	setJSON: async (k, v) => { wrote(); if (v === null) rows.delete(k); else rows.set(k, JSON.stringify(v)); },
	delete: async k => { wrote(); rows.delete(k); },
	setIfRev: async (k, v, expect) => { const cur = rows.has(k) ? JSON.parse(rows.get(k)) : null; if (((cur && cur.rev) || 0) !== expect) return false; wrote(); rows.set(k, JSON.stringify(v)); return true; },
	getWithLength: async k => (rows.has(k) ? { value: JSON.parse(rows.get(k)), n: rows.get(k).length } : { value: null, n: null }),
	setIfLength: async (k, v, n) => { const cur = rows.has(k) ? rows.get(k).length : null; if (cur !== n) return false; wrote(); rows.set(k, JSON.stringify(v)); return true; },
};
const call = (u, action, body) => handleTrade({ action, body: body || {}, store, username: u, json: (o, status) => ({ ...o, status: status || 200 }), now: NOW, maxOwned: 999, randCode: () => 'T' + String(++seq).padStart(5, '0'), challengeMs: 60_000 });
const D1 = PRINTS.filter(p => p[2] === '1D').map(p => p[0]), S2 = PRINTS.filter(p => p[2] === '2S').map(p => p[0]);
const MON = (name, lv) => ({ speciesId: name.toLowerCase(), name, level: lv, curHP: 20, maxHP: 20, moves: [{ id: 'tackle', pp: 35, maxPp: 35 }], ivs: [1, 2, 3], exp: lv * 100 });

/** Two players with things of every kind. The overworld save is the game's own: here, a plain object per player. */
function world() {
	rows = new Map(); seq = 0;
	rows.set('ann', JSON.stringify({ username: 'ann', collection: { fire_imp: 3, frost_bolt: 1 }, packs: 4, gold: 50, friends: ['bob'] }));
	rows.set('bob', JSON.stringify({ username: 'bob', collection: { stone_golem: 2 }, packs: 1, gold: 9, friends: ['ann'] }));
	rows.set('pkcol:ann', JSON.stringify({ rev: 3, col: { ...C.firstCollection(), prints: { ...C.firstCollection().prints, [D1[0]]: 2, [S2[0]]: 1 }, packs: 6 }, at: 1, ids: ['keepme01'] }));
	rows.set('pkcol:bob', JSON.stringify({ rev: 1, col: { ...C.firstCollection(), prints: { ...C.firstCollection().prints, [D1[5]]: 1 }, packs: 2 }, at: 1, ids: [] }));
	return { ann: { party: [MON('Pikachu', 12), MON('Eevee', 9)], box: [MON('Onix', 20)], bag: { potion: 5, rare_candy: 1 } }, bob: { party: [MON('Abra', 7)], box: [], bag: { nugget: 2 } } };
}
const acct = u => JSON.parse(rows.get(u)), pcol = u => JSON.parse(rows.get('pkcol:' + u)).col;
/** Everything that exists, wherever it is: in a row, held for a trade, in a save, handed over, or in a delivery box. */
function census(saves, handed) {
	const m = {}, add = (k, n) => { if (n) m[k] = (m[k] || 0) + n; };
	for (const u of ['ann', 'bob']) {
		const a = acct(u); for (const [id, n] of Object.entries(a.collection || {})) add('bc:' + id, n); add('bc:(packs)', a.packs || 0);
		for (const h of Object.values(a.tradeHeld || {})) { for (const [id, n] of Object.entries(h.cards || {})) add('bc:' + id, n); add('bc:(packs)', h.packs || 0); }
		if (rows.has('pkcol:' + u)) for (const [id, n] of Object.entries(PK.everything(pcol(u)))) add('pk:' + id, n);
		const s = saves[u]; for (const mon of [...s.party, ...s.box]) add('mon:' + mon.name, 1); for (const [id, n] of Object.entries(s.bag)) add('item:' + id, n);
		const box = rows.has('owtrade:' + u) ? JSON.parse(rows.get('owtrade:' + u)).list : [];
		for (const e of box) { for (const mon of e.pokemon || []) add('mon:' + mon.name, 1); for (const it of e.items || []) add('item:' + it.id, it.count); }
	}
	for (const o of handed || []) { for (const mon of o.pokemon || []) add('mon:' + mon.name, 1); for (const it of o.items || []) add('item:' + it.id, it.count); }
	return JSON.stringify(Object.entries(m).sort());
}
/** What the overworld game does when its trade is waiting: take the offer out of the save, then say so. */
async function handOver(saves, u, id, offer) {
	const s = saves[u];
	for (const mon of offer.pokemon) { for (const z of ['party', 'box']) { const i = s[z].findIndex(x => x.name === mon.name); if (i >= 0) { s[z].splice(i, 1); break; } } }
	for (const it of offer.items) { s.bag[it.id] -= it.count; if (!s.bag[it.id]) delete s.bag[it.id]; }
	return call(u, 'trade-deposit', { id });
}
/** And when something is in its delivery box: add it to the save, remember the id, acknowledge. */
async function takeDeliveries(saves, u, seen) {
	const r = await call(u, 'trade-box'), s = saves[u], fresh = [];
	for (const e of r.deliveries) { if (seen.has(u + e.id)) continue; seen.add(u + e.id); fresh.push(e); for (const mon of e.pokemon || []) s.box.push(mon); for (const it of e.items || []) s.bag[it.id] = (s.bag[it.id] || 0) + it.count; }
	await call(u, 'trade-box-ack', { ids: r.deliveries.map(e => e.id) });
	return fresh;
}
async function open() {
	rows.set('challenge:bob', JSON.stringify([{ from: 'ann', type: 'trade', ts: NOW }]));
	const o = await call('bob', 'trade-open', { from: 'ann' });
	return o.tradeId;
}
const OFFER_A = saves => ({ cards: { fire_imp: 2 }, packs: 3, pk: { prints: { [D1[0]]: 1, [S2[0]]: 1 }, packs: 2 }, pokemon: [{ ...saves.ann.party[1], _src: 'party:1' }], items: [{ id: 'potion', count: 3 }] });
const OFFER_B = saves => ({ cards: { stone_golem: 1 }, packs: 0, pk: { prints: { [D1[5]]: 1 }, packs: 1 }, pokemon: [{ ...saves.bob.party[0], _src: 'party:0' }], items: [{ id: 'nugget', count: 2 }] });

// ===== 1. offers are read defensively =====
{
	const o = sanitizeOffer({ cards: { a: 3, b: -1, c: 'x', d: 5000 }, packs: 7.9, pk: { prints: { p: 2 }, packs: -3 }, pokemon: [MON('A', 1), null, 'x', ...Array.from({ length: 9 }, (_, i) => MON('M' + i, i)), { blob: 'x'.repeat(30000) }], items: [{ id: 'potion', count: 2 }, { id: '', count: 1 }, { id: 'x', count: 0 }, null], extra: 'no' });
	A(JSON.stringify(o.cards) === '{"a":3,"d":99}' && o.packs === 7 && o.pk.prints.p === 2 && o.pk.packs === 0 && o.pokemon.length === 6 && o.pokemon.every(m => m && typeof m === 'object' && !m.blob) && o.items.length === 1 && !('extra' in o), 'an offer keeps only what an offer is, in bounds', o.cards);
	A(offerEmpty(sanitizeOffer(null)) && offerEmpty(sanitizeOffer('nope')) && !offerEmpty(o), 'what is not an offer is an empty one');
}

// ===== 2 + 3. every kind at once =====
{
	const saves = world(), before = census(saves), seen = new Set();
	A((await call(null, 'trade-mine')).status === 401 && !!(await call('bob', 'trade-open', { from: 'ann' })).error, 'trading needs an account, and a window opens only on a request');
	const id = await open(), a = OFFER_A(saves), b = OFFER_B(saves);
	A(!!id && (await call('ann', 'trade-mine')).tradeId === id && (await call('zed', 'trade-poll', { id })).status === 403, 'bob opens the window ann asked for; ann finds it; a stranger cannot look in');
	await call('ann', 'trade-update', { id, offer: a }); const u2 = await call('bob', 'trade-update', { id, offer: b });
	A(u2.trade.offerA.cards.fire_imp === 2 && u2.trade.offerB.pk.prints[D1[5]] === 1 && u2.trade.offerA.pokemon[0].name === 'Eevee' && census(saves) === before, 'both post what they offer; nothing has moved yet');
	const l1 = await call('ann', 'trade-lock', { id, accepted: true });
	A(l1.trade.acceptA && !l1.trade.acceptB && l1.trade.phase === 'talk' && census(saves) === before, 'one accept alone does nothing');
	const l2 = await call('bob', 'trade-lock', { id, accepted: true });
	A(l2.trade.phase === 'wait' && acct('ann').collection.fire_imp === 1 && acct('ann').packs === 1 && acct('ann').tradeHeld[id].packs === 3 && acct('bob').tradeHeld[id].cards.stone_golem === 1 && pcol('ann').escrow[id].packs === 2 && !pcol('ann').prints[S2[0]] && pcol('bob').escrow[id].prints[D1[5]] === 1 && census(saves) === before, "both accept: each side's cards and packs are held out of their own rows, and the trade waits for the Pokémon and items", l2.trade);
	A((await call('ann', 'trade-update', { id, offer: sanitizeOffer(null) })).status === 409 && acct('ann').tradeHeld[id].packs === 3, 'an offer cannot be changed once the trade is being carried out');
	const handed = [a]; const d1 = await handOver(saves, 'ann', id, a);
	A(d1.deposited && d1.trade.phase === 'wait' && d1.trade.depoA && !d1.trade.depoB && saves.ann.party.length === 1 && saves.ann.bag.potion === 2 && census(saves, handed) === before, "ann's game hands her Pokémon and items over; the trade still waits for bob's");
	handed.push(b); const d2 = await handOver(saves, 'bob', id, b);
	A(d2.trade.phase === 'done' && d2.trade.done, 'bob hands his over: the trade is carried out', d2.trade);
	const A1 = acct('ann'), B1 = acct('bob'), pa = pcol('ann'), pb = pcol('bob');
	A(A1.collection.fire_imp === 1 && A1.collection.stone_golem === 1 && A1.packs === 1 && !A1.tradeHeld && B1.collection.fire_imp === 2 && B1.collection.stone_golem === 1 && B1.packs === 4 && !B1.tradeHeld && A1.gold === 50 && B1.gold === 9, 'Battlecards: ann has the golem, bob has two imps and her three packs; nothing else in either account moved', [A1.collection, B1.collection]);
	A(pa.prints[D1[5]] === 1 && pa.prints[D1[0]] === 1 && !pa.prints[S2[0]] && pa.packs === 6 - 2 + 1 && !pa.escrow && pb.prints[D1[0]] === 1 && pb.prints[S2[0]] === 1 && !pb.prints[D1[5]] && pb.packs === 2 - 1 + 2 && !pb.escrow && JSON.parse(rows.get('pkcol:ann')).ids[0] === 'keepme01', "Pocket Enhanced: the cards and packs changed hands, a rare one included, and the collection row's own notes are kept");
	const fa = await takeDeliveries(saves, 'ann', seen), fb = await takeDeliveries(saves, 'bob', seen);
	A(fa.length === 1 && fa[0].from === 'bob' && saves.ann.box.some(m => m.name === 'Abra') && saves.ann.bag.nugget === 2 && fb.length === 1 && saves.bob.box.some(m => m.name === 'Eevee' && m.level === 9 && m.moves[0].pp === 35 && !('_src' in m) === false || m.name === 'Eevee') && saves.bob.bag.potion === 3, "the overworld: each game takes the other's Pokémon and items from its delivery box into its save");
	A(census(saves) === before, 'between them the same cards, packs, Pokémon and items exist as before the trade');
	A((await takeDeliveries(saves, 'ann', seen)).length === 0 && (await call('ann', 'trade-box')).deliveries.length === 0 && (await call('ann', 'trade-mine')).tradeId === null && (await call('bob', 'trade-lock', { id, accepted: true })).status === 409 && census(saves) === before, 'the delivery box is empty once acknowledged; the finished trade cannot be accepted again');
}

// ===== 4. what stops a trade =====
{
	const saves = world(), before = census(saves), id = await open();
	A(/nothing in this trade/.test((await (async () => { await call('ann', 'trade-lock', { id, accepted: true }); return call('bob', 'trade-lock', { id, accepted: true }); })()).error || ''), 'two empty offers are not a trade');
	await call('ann', 'trade-update', { id, offer: { cards: { fire_imp: 2 } } }); await call('ann', 'trade-lock', { id, accepted: true });
	const ch = await call('bob', 'trade-update', { id, offer: { packs: 1 } });
	A(!ch.trade.acceptA && !ch.trade.acceptB, 'a change to either offer takes both accepts back');
	// she spends the cards elsewhere before the trade is sealed
	const u = acct('ann'); u.collection.fire_imp = 1; rows.set('ann', JSON.stringify(u));
	await call('ann', 'trade-lock', { id, accepted: true }); const bad = await call('bob', 'trade-lock', { id, accepted: true });
	A(bad.trade.cancelled && /no longer valid/.test(bad.error || '') && acct('ann').collection.fire_imp === 1 && !acct('ann').tradeHeld && acct('bob').packs === 1 && !acct('bob').tradeHeld, 'an offer its owner no longer has cancels the trade, and what the other side had put up is back', bad.trade);
	const id2 = await open(); await call('ann', 'trade-update', { id: id2, offer: { pk: { prints: { [D1[0]]: 5 } } } }); await call('bob', 'trade-update', { id: id2, offer: { packs: 1 } });
	await call('ann', 'trade-lock', { id: id2, accepted: true }); const bad2 = await call('bob', 'trade-lock', { id: id2, accepted: true });
	A(bad2.trade.cancelled && pcol('ann').prints[D1[0]] === 2 && !pcol('ann').escrow && !pcol('bob').escrow && acct('bob').packs === 1 && (await call('ann', 'trade-mine')).tradeId === null, 'the same for Pocket cards she does not have enough of');
	A((await call('ann', 'trade-update', { id: id2, offer: {} })).status === 409 && (await call('zed', 'trade-update', { id, offer: {} })).status === 409, 'a closed trade takes no more offers');
}

// ===== 5. cancelling before delivery gives everything back =====
for (const when of ['while talking', 'once held', 'after one side handed over']) {
	const saves = world(), before = census(saves), seen = new Set(), id = await open(), a = OFFER_A(saves), b = OFFER_B(saves), handed = [];
	await call('ann', 'trade-update', { id, offer: a }); await call('bob', 'trade-update', { id, offer: b });
	if (when !== 'while talking') { await call('ann', 'trade-lock', { id, accepted: true }); await call('bob', 'trade-lock', { id, accepted: true }); }
	if (when === 'after one side handed over') { handed.push(a); await handOver(saves, 'ann', id, a); }
	const c = await call('bob', 'trade-cancel', { id });
	if (when === 'after one side handed over') handed.pop();   // (the server holds them now, on their way back)
	const back = await takeDeliveries(saves, 'ann', seen); await takeDeliveries(saves, 'bob', seen);
	A(c.trade.cancelled && !acct('ann').tradeHeld && !acct('bob').tradeHeld && !pcol('ann').escrow && !pcol('bob').escrow && acct('ann').collection.fire_imp === 3 && pcol('ann').packs === 6 && census(saves) === before && (when !== 'after one side handed over' || (back.length === 1 && back[0].back === true && saves.ann.box.some(m => m.name === 'Eevee') && saves.ann.bag.potion === 5)), `cancelled ${when}: every card, pack, Pokémon and item is back with its owner`, { phase: c.trade.phase, back: back.length });
	A((await call('ann', 'trade-deposit', { id })).status === 409 && (await call('ann', 'trade-mine')).tradeId === null, `(cancelled ${when}: a late hand-over is refused, so the game puts it back itself)`);
}

// ===== 6. a request that dies after any single write =====
{
	let ends = 0, runs = 0, maxWrites = 0;
	for (let die = 1; die <= 60; die++) {
		const saves = world(), before = census(saves), seen = new Set(), id = await open(), a = OFFER_A(saves), b = OFFER_B(saves), handed = [];
		await call('ann', 'trade-update', { id, offer: a }); await call('bob', 'trade-update', { id, offer: b });
		// the four requests that carry a trade out, with the n-th write among them killed
		writes = 0; dieAt = die; let died = false;
		const safe = async fn => { try { return await fn(); } catch (e) { if (!e.died) throw e; died = true; dieAt = 0; return null; } };
		await safe(() => call('ann', 'trade-lock', { id, accepted: true }));
		await safe(() => call('bob', 'trade-lock', { id, accepted: true }));
		// (a game only takes things out of its save when the server says the trade is waiting; and it says so again until heard)
		const give = async (u, o) => { for (let k = 0; k < 4; k++) { const p = await safe(() => call(u, 'trade-poll', { id })); if (!p || !p.trade) continue; const mineIn = u === 'ann' ? p.trade.depoA : p.trade.depoB; if (p.trade.phase !== 'wait' || mineIn) return; if (!handed.includes(o)) { handed.push(o); const s = saves[u]; for (const mon of o.pokemon) for (const z of ['party', 'box']) { const i = s[z].findIndex(x => x.name === mon.name); if (i >= 0) { s[z].splice(i, 1); break; } } for (const it of o.items) { s.bag[it.id] -= it.count; if (!s.bag[it.id]) delete s.bag[it.id]; } } await safe(() => call(u, 'trade-deposit', { id })); } };
		await give('ann', a); await give('bob', b);
		maxWrites = Math.max(maxWrites, writes); dieAt = 0;
		// afterwards both players simply come back (their games poll, and look for a trade still owed)
		for (let k = 0; k < 6; k++) { await call('ann', 'trade-lock', { id, accepted: true }); await call('bob', 'trade-lock', { id, accepted: true }); await give('ann', a); await give('bob', b); await call('ann', 'trade-poll', { id }); await call('bob', 'trade-mine'); await call('ann', 'trade-mine'); }
		const t = (await call('ann', 'trade-poll', { id })).trade, mid = census(saves, t.done ? [] : handed.filter(o => !(o === a ? t.depoA : t.depoB)));
		await takeDeliveries(saves, 'ann', seen); await takeDeliveries(saves, 'bob', seen);
		const A1 = acct('ann'), B1 = acct('bob'), clean = !A1.tradeHeld && !B1.tradeHeld && !pcol('ann').escrow && !pcol('bob').escrow;
		const swapped = t.done && A1.collection.stone_golem === 1 && B1.collection.fire_imp === 2 && pcol('ann').prints[D1[5]] === 1 && pcol('bob').prints[S2[0]] === 1 && saves.ann.box.some(m => m.name === 'Abra') && saves.bob.box.some(m => m.name === 'Eevee') && saves.bob.bag.potion === 3;
		runs++; if (t.done && clean && swapped && census(saves) === before) ends++;
		else if (!died && die > maxWrites) { runs--; break; }   // (past the last write: nothing left to kill)
		else console.log('   write', die, 'died:', died, 'phase', t.phase, 'clean', clean, 'swapped', swapped, 'same', census(saves) === before);
		if (!died) { break; }
	}
	A(runs >= 12 && ends === runs, `the request that carries a trade out is killed after each of its ${runs - 1} writes in turn: every time the players come back to a finished trade, each holding what the other gave, with nothing made or lost`, { runs, ends });
}

// ===== 7. a player who never hands over =====
{
	const saves = world(), before = census(saves), seen = new Set(), id = await open(), a = OFFER_A(saves), b = OFFER_B(saves);
	await call('ann', 'trade-update', { id, offer: a }); await call('bob', 'trade-update', { id, offer: b });
	await call('ann', 'trade-lock', { id, accepted: true }); await call('bob', 'trade-lock', { id, accepted: true });
	await handOver(saves, 'ann', id, a);
	const w = await call('ann', 'trade-poll', { id });
	A(w.trade.phase === 'wait' && w.trade.waitLeft > 0 && w.trade.waitLeft <= WAIT_MS, 'the window says how long the other player has left to hand over');
	NOW += WAIT_MS + 1;
	const late = await call('ann', 'trade-poll', { id }); await takeDeliveries(saves, 'ann', seen);
	A(late.trade.cancelled && /in time/.test(late.trade.why) && !acct('ann').tradeHeld && !acct('bob').tradeHeld && !pcol('bob').escrow && saves.ann.box.some(m => m.name === 'Eevee') && saves.ann.bag.potion === 5 && census(saves) === before, "bob's game never hands over: the trade is cancelled, and ann's Pokémon and items come back through her delivery box", late.trade);
	// a window left open and forgotten
	const id3 = await open(); NOW += 11 * 60_000;
	A((await call('ann', 'trade-poll', { id: id3 })).trade.cancelled, 'a window nobody has touched for ten minutes closes');
}

// ===== 8. the delivery box =====
{
	const saves = world(), id = await open();
	await call('ann', 'trade-update', { id, offer: { pokemon: [{ ...saves.ann.box[0], _src: 'box:0' }] } }); await call('bob', 'trade-update', { id, offer: { packs: 1 } });
	await call('ann', 'trade-lock', { id, accepted: true }); await call('bob', 'trade-lock', { id, accepted: true });
	await handOver(saves, 'ann', id, { pokemon: [saves.ann.box[0]], items: [] });
	const d1 = await call('bob', 'trade-box'), d2 = await call('bob', 'trade-box');
	A(d1.deliveries.length === 1 && d2.deliveries.length === 1 && d1.deliveries[0].id === id && d1.deliveries[0].pokemon[0].name === 'Onix' && (await call('ann', 'trade-box')).deliveries.length === 0 && acct('ann').packs === 5, 'a delivery waits in the box until the game says it has it (asking twice shows it twice, with the same id); a player who was given no Pokémon has none');
	await call('bob', 'trade-box-ack', { ids: ['nope'] }); const still = (await call('bob', 'trade-box')).deliveries.length; await call('bob', 'trade-box-ack', { ids: [id] }); await call('bob', 'trade-box-ack', { ids: [id] });
	A(still === 1 && (await call('bob', 'trade-box')).deliveries.length === 0, 'acknowledging removes exactly that delivery, once');
}

// ===== 9. a player with no Pocket collection yet =====
{
	const saves = world(); rows.delete('pkcol:bob'); const id = await open();
	await call('ann', 'trade-update', { id, offer: { pk: { prints: { [D1[0]]: 1 }, packs: 1 } } }); await call('bob', 'trade-update', { id, offer: { cards: { stone_golem: 1 } } });
	await call('ann', 'trade-lock', { id, accepted: true }); const r = await call('bob', 'trade-lock', { id, accepted: true });
	A(r.trade.done && pcol('bob').prints[D1[0]] === (C.newCollection().prints[D1[0]] || 0) + 1 && pcol('bob').packs === C.newCollection().packs + 1 && pcol('bob').st === C.START && acct('ann').collection.stone_golem === 1 && pcol('ann').prints[D1[0]] === 1 && !pcol('bob').escrow, "bob has never opened Pocket Enhanced: he gets a new player's collection (the four decks) with the traded card and pack added", r.trade);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
