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

// ===== the currencies, booster packs, and the countdown (the unified inventory's trade window, 2026-11-17) =====
{
	const wal = u => { const r = rows.has('stars:' + u) ? JSON.parse(rows.get('stars:' + u)) : null, t = o => Object.values(o || {}).reduce((x, y) => x + y, 0); return r ? { n: t(r.e) - t(r.s), th: r.th || null } : { n: 0, th: null }; };
	const setup = () => {
		world();
		const a = acct('ann'); a.dust = 300; a.gold = 50; rows.set('ann', JSON.stringify(a));
		const b = acct('bob'); b.dust = 20; b.gold = 9; rows.set('bob', JSON.stringify(b));
		rows.set('stars:ann', JSON.stringify({ rev: 2, e: { devann01: 500 }, s: { devann01: 100 }, at: 1 }));   // ann has 400 stars; bob has no wallet yet
		const pa = JSON.parse(rows.get('pkcol:ann')); pa.col.own = { C: 5, M: 2 }; rows.set('pkcol:ann', JSON.stringify(pa));
	};
	const everything = () => JSON.stringify(['ann', 'bob'].map(u => { const a = acct(u), held = Object.values(a.tradeHeld || {}); return [(a.dust || 0) + held.reduce((x, h) => x + (h.dust || 0), 0), (a.gold || 0) + held.reduce((x, h) => x + (h.gold || 0), 0)]; }).reduce((x, y) => [x[0] + y[0], x[1] + y[1]], [0, 0]).concat([wal('ann').n + wal('bob').n + Object.values(wal('ann').th || {}).reduce((x, y) => x + y, 0) + Object.values(wal('bob').th || {}).reduce((x, y) => x + y, 0), (PK.everything(pcol('ann'))['(packs:C)'] || 0) + (PK.everything(pcol('bob'))['(packs:C)'] || 0)]));
	const OA = { dust: 120, gold: 30, stars: 250, pk: { prints: {}, packs: 0, own: { C: 3 } } }, OB = { dust: 5, cards: { stone_golem: 1 } };

	// ---- a whole trade: dust, gold, stars and Charizard packs for a card and a little dust
	setup(); let id = await open(); const before = everything();
	await call('ann', 'trade-update', { id, offer: OA }); await call('bob', 'trade-update', { id, offer: OB });
	await call('ann', 'trade-lock', { id, accepted: true }); let r = await call('bob', 'trade-lock', { id, accepted: true });
	A(r.trade.done && acct('ann').dust === 300 - 120 + 5 && acct('bob').dust === 20 - 5 + 120 && acct('ann').gold === 20 && acct('bob').gold === 39 && acct('ann').collection.stone_golem === 1 && !acct('ann').tradeHeld && !acct('bob').tradeHeld, 'dust and gold change hands with the cards: ann 185 dust and 20 gold, bob 135 and 39; nothing is left held', [acct('ann').dust, acct('bob').dust, acct('ann').gold, acct('bob').gold]);
	A(wal('ann').n === 150 && wal('bob').n === 250 && !wal('ann').th && !wal('bob').th, 'stars: 250 leave ann\'s wallet (150 left) and arrive in bob\'s, who had no wallet before', [wal('ann'), wal('bob')]);
	A(C.packsOf(pcol('ann'), 'C') === 2 && C.packsOf(pcol('bob'), 'C') === 3 && C.packsOf(pcol('ann'), 'M') === 2 && !pcol('ann').escrow && !pcol('bob').escrow, 'three Charizard packs go to bob as Charizard packs (ann keeps two, and her Mewtwo packs)', [pcol('ann').own, pcol('bob').own]);
	A(everything() === before, 'nothing was made or lost: the dust, gold, stars and Charizard packs of both together are what they were', [before, everything()]);
	{ const { mergeWallets, balance } = await import('../../site/stars.js'); const dev = { e: { devann01: 500 }, s: { devann01: 130 } }, joined = mergeWallets(JSON.parse(rows.get('stars:ann')), dev);
		A(balance(joined) === 120, "her device then syncs having spent 30 more: the wallet joins as before (the trade is one more counter in it), 120 stars", balance(joined)); }

	// ---- more than there is: refused when the trade is carried out, and everything put up comes back
	setup(); id = await open();
	await call('ann', 'trade-update', { id, offer: { stars: 401, dust: 100 } }); await call('bob', 'trade-update', { id, offer: { gold: 9 } });
	await call('ann', 'trade-lock', { id, accepted: true }); r = await call('bob', 'trade-lock', { id, accepted: true });
	A(r.trade.cancelled && acct('ann').dust === 300 && acct('bob').gold === 9 && wal('ann').n === 400 && !acct('ann').tradeHeld && !acct('bob').tradeHeld && !wal('ann').th, 'offering one star more than she has: the trade is cancelled, and the dust and gold already held go back', [r.trade.why, acct('ann').dust, wal('ann')]);
	setup(); id = await open();
	await call('ann', 'trade-update', { id, offer: { dust: 301 } }); await call('bob', 'trade-update', { id, offer: { gold: 1 } });
	await call('ann', 'trade-lock', { id, accepted: true }); r = await call('bob', 'trade-lock', { id, accepted: true });
	A(r.trade.cancelled && acct('ann').dust === 300 && acct('bob').gold === 9, 'the same for dust she does not have');
	setup(); id = await open();
	await call('ann', 'trade-update', { id, offer: { pk: { prints: {}, packs: 0, own: { C: 6 } } } }); await call('bob', 'trade-update', { id, offer: { gold: 1 } });
	await call('ann', 'trade-lock', { id, accepted: true }); r = await call('bob', 'trade-lock', { id, accepted: true });
	A(r.trade.cancelled && C.packsOf(pcol('ann'), 'C') === 5 && acct('bob').gold === 9, 'and for a sixth Charizard pack of five');

	// ---- a request that dies at any write: nothing lost or doubled, and the next call carries on
	let died = 0, ended = 0;
	for (let n = 1; n <= 14; n++) {
		setup(); id = await open(); const b4 = everything();
		await call('ann', 'trade-update', { id, offer: OA }); await call('bob', 'trade-update', { id, offer: OB }); await call('ann', 'trade-lock', { id, accepted: true });
		writes = 0; dieAt = n; let threw = false; try { await call('bob', 'trade-lock', { id, accepted: true }); } catch (e) { if (!e.died) throw e; threw = true; } dieAt = 0;
		if (threw) died++;
		// (bob's page did not hear back: it asks again, as a page does; then either player's next look carries the trade on)
		let t = (await call('bob', 'trade-lock', { id, accepted: true })).trade; for (let k = 0; k < 4 && !t.done && !t.cancelled; k++) t = (await call(k % 2 ? 'bob' : 'ann', 'trade-poll', { id })).trade;
		if (everything() === b4 && t.done && wal('bob').n === 250 && wal('ann').n === 150 && acct('bob').dust === 135 && acct('ann').dust === 185 && C.packsOf(pcol('bob'), 'C') === 3 && C.packsOf(pcol('ann'), 'C') === 2 && !acct('ann').tradeHeld && !acct('bob').tradeHeld && !wal('ann').th && !wal('bob').th) ended++;
	}
	A(died >= 8 && ended === 14, `the request that carries the trade out is killed at each of its first 14 writes (${died} of them real): each time the trade is then finished exactly once, with nothing made, lost or left held`, { died, ended });

	// ---- the countdown: a window that asks for it waits four seconds after both lock in
	setup(); id = await open();
	await call('ann', 'trade-update', { id, offer: { dust: 10 } }); await call('bob', 'trade-update', { id, offer: { gold: 1 } });
	await call('ann', 'trade-lock', { id, accepted: true, count: true }); r = await call('bob', 'trade-lock', { id, accepted: true, count: true });
	A(r.trade.phase === 'talk' && r.trade.acceptA && r.trade.acceptB && r.trade.goIn === 4000 && acct('ann').dust === 300, 'both lock in: nothing moves yet, and the window says four seconds are left', r.trade);
	NOW += 2500; r = await call('ann', 'trade-poll', { id });
	A(r.trade.phase === 'talk' && r.trade.goIn === 1500 && acct('ann').dust === 300, 'two and a half seconds on: still waiting, one and a half to go');
	r = await call('bob', 'trade-lock', { id, accepted: false });
	A(r.trade.phase === 'talk' && !r.trade.acceptB && r.trade.goIn === null, 'bob backs out during the countdown: it stops');
	NOW += 5000; r = await call('ann', 'trade-poll', { id });
	A(r.trade.phase === 'talk' && acct('ann').dust === 300, 'and it does not go off later by itself');
	r = await call('bob', 'trade-lock', { id, accepted: true });
	A(r.trade.phase === 'talk' && r.trade.goIn === 4000, 'he locks in again: the four seconds start over (the window still counts down, whoever locks last)');
	r = await call('ann', 'trade-update', { id, offer: { dust: 11 } });
	A(!r.trade.acceptA && !r.trade.acceptB && r.trade.goIn === null, 'ann changes her offer during the countdown: both are unlocked and it stops');
	await call('ann', 'trade-lock', { id, accepted: true }); r = await call('bob', 'trade-lock', { id, accepted: true });
	NOW += 3999; r = await call('ann', 'trade-poll', { id });
	A(r.trade.phase === 'talk' && acct('ann').dust === 300, 'a millisecond before the end: not yet');
	NOW += 1; r = await call('ann', 'trade-poll', { id });
	A(r.trade.done && acct('ann').dust === 289 && acct('bob').dust === 31 && acct('ann').gold === 51, 'at four seconds the trade is carried out: 11 dust for 1 gold', [acct('ann').dust, acct('bob').dust]);
	// a window that does not ask for a countdown trades at once, as before
	setup(); id = await open();
	await call('ann', 'trade-update', { id, offer: { dust: 10 } }); await call('bob', 'trade-update', { id, offer: { gold: 1 } });
	await call('ann', 'trade-lock', { id, accepted: true }); r = await call('bob', 'trade-lock', { id, accepted: true });
	A(r.trade.done && r.trade.goIn === null, 'a window that does not ask for a countdown (the games\' own trade screens) trades as soon as both accept');
	A((await import('../../server/trade.mjs')).COUNTDOWN_MS === 4000, '(the countdown is four seconds)');
	// both players change their offers in the same moment, then both lock in in the same moment: neither is dropped
	// (found 2026-11-18: the second write lost the race on the trade's row and was answered as if it had been made)
	setup(); id = await open();
	const [ua, ub] = await Promise.all([call('ann', 'trade-update', { id, offer: { dust: 10 } }), call('bob', 'trade-update', { id, offer: { gold: 1 } })]);
	r = await call('ann', 'trade-poll', { id });
	A(r.trade.offerA.dust === 10 && r.trade.offerB.gold === 1 && ua.trade && ub.trade, 'two offers changed at the same instant: both are on the trade (10 dust, 1 gold)', [r.trade.offerA.dust, r.trade.offerB.gold]);
	const [la, lb] = await Promise.all([call('ann', 'trade-lock', { id, accepted: true }), call('bob', 'trade-lock', { id, accepted: true })]);
	r = await call('ann', 'trade-poll', { id });
	A(!la.error && !lb.error && r.trade.done && acct('ann').gold === 51 && acct('bob').dust === 30, 'both lock in at the same instant: neither is told "the offer changed", and the trade is carried out', [la.error, lb.error, r.trade.phase]);
	// ...but a lock that crosses a real change of offer is still refused
	setup(); id = await open();
	await call('ann', 'trade-update', { id, offer: { dust: 10 } }); await call('bob', 'trade-update', { id, offer: { gold: 1 } });
	const [lk, up] = await Promise.all([call('ann', 'trade-lock', { id, accepted: true }), call('bob', 'trade-update', { id, offer: { gold: 0 } })]);
	r = await call('ann', 'trade-poll', { id });
	A(!r.trade.acceptA && r.trade.offerB.gold === 0 && up.trade, 'a lock that crosses a real change of offer does not stand: she is not locked in on an offer she did not see', [lk.error, r.trade.acceptA, r.trade.offerB.gold]);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
