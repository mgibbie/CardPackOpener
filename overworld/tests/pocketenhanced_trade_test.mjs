// Pocket Enhanced: trading and the timed pack inbox. The real server handler (server/pocket_trade.mjs) over an
// in-memory row store, with the collection sync (colsync.js) for what a device then sees.
//   1. the rules (trade.js): what can be offered; a held card is in exactly one place
//   2. a whole trade: offer, look, propose, accept; both collections end with the other's card, nothing made or lost
//   3. decline, withdraw, cancel: every card goes back to its owner
//   4. what is refused: a guest, your own offer, another rarity, a card you do not have, a second proposer, a stranger answering
//   5. requests that die half way and races: cards wait in escrow and are settled later; never doubled, never lost
//   6. the pack inbox: one pack every 12 hours up to 120, paused when full, a claim paid once
//   7. a device's collection follows the account through a trade
//   node overworld/tests/pocketenhanced_trade_test.mjs
import * as C from '../../pocketenhanced/js/collection.js';
import * as T from '../../pocketenhanced/js/trade.js';
import * as PT from '../../pocketenhanced/js/packtimer.js';
import { PRINTS } from '../../pocketenhanced/js/data/packs.js';
import { createSync } from '../../pocketenhanced/js/colsync.js';
import { handlePktrade, SETTLE_AFTER_MS } from '../../server/pocket_trade.mjs';
import { handlePkcol } from '../../server/pocket_collection.mjs';

let pass = 0, fail = 0;
const A = (ok, msg, extra) => { if (ok) { pass++; console.log('ok  - ' + msg); } else { fail++; console.log('FAIL: ' + msg, extra === undefined ? '' : JSON.stringify(extra).slice(0, 700)); } };

const rows = new Map(); let NOW = 1_800_000_000_000, seq = 0, failNext = null;
const store = {
	get: async k => (rows.has(k) ? JSON.parse(rows.get(k)) : null),
	setJSON: async (k, v) => { rows.set(k, JSON.stringify(v)); },
	setIfRev: async (k, v, expect) => { if (failNext && failNext(k, v)) { failNext = null; throw new Error('the request died'); } const cur = rows.has(k) ? JSON.parse(rows.get(k)) : null; if (((cur && cur.rev) || 0) !== expect) return false; rows.set(k, JSON.stringify(v)); return true; },
};
const ctx = (username, action, body) => ({ action, body: body || {}, store, username, json: (o, status) => ({ ...o, status: status || 200 }), now: NOW, randomHex: n => (++seq).toString(16).padStart(n * 2, '0'), rnd: () => ((seq * 0.6180339887 + 0.137) % 1) });
const call = (u, action, body) => handlePktrade(ctx(u, action, body));
const colOf = u => JSON.parse(rows.get('pkcol:' + u)).col;
const total = c => Object.values(c.prints).reduce((a, n) => a + n, 0) + Object.keys(c.escrow || {}).length;
const of = r => PRINTS.filter(p => p[2] === r).map(p => p[0]);
const D1 = of('1D'), D2 = of('2D'), S1 = of('1S'), S2 = of('2S');
const give = (u, prints) => rows.set('pkcol:' + u, JSON.stringify({ rev: 1, col: { ...C.newCollection(), prints: { ...C.newCollection().prints, ...prints } }, at: 1, ids: ['keepme01'] }));
const everything = users => users.reduce((m, u) => { const c = colOf(u); for (const [id, n] of Object.entries(c.prints)) m[id] = (m[id] || 0) + n; for (const h of Object.values(c.escrow || {})) m[h.p] = (m[h.p] || 0) + 1; return m; }, {});
const same = (a, b) => JSON.stringify(Object.entries(a).sort()) === JSON.stringify(Object.entries(b).sort());

// ===== 1. the rules =====
{
	const c = { ...C.newCollection(), prints: { [D1[0]]: 2, [S2[0]]: 1 } };
	A(T.tradeRarity(D1[0]) === '1D' && T.tradeRarity(S1[0]) === '1S' && T.tradeRarity(S2[0]) === null && T.tradeRarity('P-A-005') === null && T.tradeRarity('nope') === null, 'one to four diamonds and one star can be traded; rarer cards and promos cannot');
	A(T.whyNotGive(c, D1[0]) === null && /rarity/.test(T.whyNotGive(c, S2[0])) && /do not have/.test(T.whyNotGive(c, D1[1])) && /no such/.test(T.whyNotGive(c, 'nope')), 'a player can offer a tradable card they have, and is told why not otherwise');
	const h = T.hold(c, 'abcdefghij12', D1[0], 5), h2 = T.hold(h, 'abcdefghij13', D1[0], 6);
	A(h.prints[D1[0]] === 1 && h.escrow.abcdefghij12.p === D1[0] && h2.prints[D1[0]] === undefined && Object.keys(h2.escrow).length === 2 && T.hold(h2, 'abcdefghij14', D1[0], 7) === null && T.hold(h, 'abcdefghij12', D1[0], 7) === null && T.hold(c, 'BAD', D1[0], 7) === null, 'holding a card takes it out of the cards owned; one that is not there, or a trade id already holding, holds nothing');
	const back = T.release(h, 'abcdefghij12'), got = T.receive(h, 'abcdefghij12', D1[5]);
	A(same(back.prints, c.prints) && !back.escrow && got.prints[D1[0]] === 1 && got.prints[D1[5]] === 1 && !got.escrow && T.release(c, 'abcdefghij12') === null && T.receive(c, 'abcdefghij12', D1[5]) === null && T.receive(h, 'abcdefghij12', 'nope') === null, 'a held card comes back, or is swapped for the other card: once (with nothing held, nothing happens)');
	const round = C.cleanCollection(JSON.parse(JSON.stringify(h)));
	A(round.escrow.abcdefghij12.p === D1[0] && C.sameCollection(round, h) && !C.sameCollection(round, c) && C.cleanCollection({ ...c, escrow: { bad: { p: 'x' } } }).escrow === undefined && C.merge3(c, c, h).escrow.abcdefghij12.p === D1[0] && C.merge3(h, h, back).escrow === undefined, "a collection keeps its held cards through storage, and a device takes them from the account's copy");
}

// ===== 2. a whole trade =====
give('ann', { [D2[0]]: 2 }); give('bob', { [D2[7]]: 1, [D1[3]]: 1 }); give('cat', { [D2[9]]: 1 });
const before = everything(['ann', 'bob', 'cat']);
A((await call(null, 'pktrade-offer', { give: D2[0] })).status === 401 && (await call('zed', 'pktrade-offer', { give: D2[0] })).status === 409, 'trading needs an account, with a collection on it');
const o = await call('ann', 'pktrade-offer', { give: D2[0] });
A(o.trade && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(o.trade.code) && o.trade.state === 'open' && o.trade.rarity === '2D' && colOf('ann').prints[D2[0]] === 1 && colOf('ann').escrow[o.trade.id].p === D2[0] && JSON.parse(rows.get('pkcol:ann')).ids[0] === 'keepme01', 'ann offers a card: it is held (out of her cards), and she gets a code', o);
const look = await call('bob', 'pktrade-look', { code: o.trade.code.toLowerCase() });
A(look.trade && look.trade.give === D2[0] && look.trade.by === 'ann' && look.trade.mine === false && (await call('bob', 'pktrade-look', { code: 'ZZZZZ' })).status === 404 && (await call('bob', 'pktrade-look', { code: 'no' })).status === 400, 'bob looks the code up and sees whose card it is and which');
// ===== 4. what is refused =====
A(/your own/.test((await call('ann', 'pktrade-propose', { code: o.trade.code, give: D2[0] })).error) && /same rarity/.test((await call('bob', 'pktrade-propose', { code: o.trade.code, give: D1[3] })).error) && /do not have/.test((await call('bob', 'pktrade-propose', { code: o.trade.code, give: D2[3] })).error) && same(everything(['ann', 'bob', 'cat']), before), 'refused: your own offer, a card of another rarity, a card you do not have (and nothing has moved)');
const p = await call('bob', 'pktrade-propose', { code: o.trade.code, give: D2[7] });
A(p.trade && p.trade.state === 'proposed' && p.trade.with === 'bob' && p.trade.their === D2[7] && !colOf('bob').prints[D2[7]] && colOf('bob').escrow[o.trade.id].p === D2[7], 'bob proposes a card of the same rarity: it is held too', p);
A(/already/.test((await call('cat', 'pktrade-propose', { code: o.trade.code, give: D2[9] })).error) && colOf('cat').prints[D2[9]] === 1 && !colOf('cat').escrow && (await call('bob', 'pktrade-answer', { id: o.trade.id, accept: true })).status === 403 && (await call('cat', 'pktrade-cancel', { id: o.trade.id })).status === 403 && (await call('cat', 'pktrade-withdraw', { id: o.trade.id })).status === 409, 'refused: a second proposer, and anyone but the offerer answering or cancelling');
const mineA = await call('ann', 'pktrade-mine');
A(mineA.trades.length === 1 && mineA.trades[0].their === D2[7] && mineA.settled.length === 0, "ann sees bob's card on her trade");
const acc = await call('ann', 'pktrade-answer', { id: o.trade.id, accept: true });
A(acc.trade.state === 'matched' && acc.settled.length === 1 && acc.settled[0].got === D2[7] && colOf('ann').prints[D2[7]] === 1 && !colOf('ann').escrow && colOf('ann').prints[D2[0]] === 1, "ann accepts: she has bob's card at once", acc);
A(colOf('bob').escrow && !colOf('bob').prints[D2[0]], "(bob's side is settled when he next looks)");
const mineB = await call('bob', 'pktrade-mine');
A(mineB.settled.length === 1 && mineB.settled[0].got === D2[0] && colOf('bob').prints[D2[0]] === 1 && !colOf('bob').escrow && mineB.trades.length === 0, "bob looks: he has ann's card");
const after = everything(['ann', 'bob', 'cat']);
A(same(after, before) && (await call('bob', 'pktrade-mine')).settled.length === 0 && (await call('ann', 'pktrade-mine')).settled.length === 0 && same(everything(['ann', 'bob', 'cat']), before), 'between them the same cards exist as before, and looking again changes nothing');
A((await call('cat', 'pktrade-look', { code: o.trade.code })).status === 404, 'a finished trade is no longer found by its code');

// ===== 3. decline, withdraw, cancel =====
{
	const o2 = (await call('ann', 'pktrade-offer', { give: D2[0] })).trade;
	await call('cat', 'pktrade-propose', { code: o2.code, give: D2[9] });
	const dec = await call('ann', 'pktrade-answer', { id: o2.id, accept: false });
	A(dec.trade.state === 'open' && dec.trade.with === null && colOf('ann').escrow[o2.id] && colOf('cat').escrow[o2.id], 'ann declines: the trade is open again');
	A((await call('cat', 'pktrade-mine')).settled.length === 0 && colOf('cat').escrow[o2.id], '(a card is not given back while a request could still be in flight)');
	NOW += SETTLE_AFTER_MS + 1;
	const cb = await call('cat', 'pktrade-mine');
	A(cb.settled.length === 1 && cb.settled[0].back === D2[9] && colOf('cat').prints[D2[9]] === 1 && !colOf('cat').escrow, 'cat gets her card back');
	await call('bob', 'pktrade-propose', { code: o2.code, give: D2[0] });
	const wd = await call('bob', 'pktrade-withdraw', { id: o2.id });
	A(wd.trade.state === 'open' && wd.settled[0].back === D2[0] && colOf('bob').prints[D2[0]] === 1 && !colOf('bob').escrow, 'bob proposes, then takes his offer back: his card returns at once');
	await call('bob', 'pktrade-propose', { code: o2.code, give: D2[0] });
	const can = await call('ann', 'pktrade-cancel', { id: o2.id });
	A(can.trade.state === 'cancelled' && can.settled[0].back === D2[0] && !colOf('ann').escrow && colOf('ann').prints[D2[0]] === 1, 'ann cancels with an offer on it: her card returns');
	const bb = await call('bob', 'pktrade-mine');
	A(bb.settled[0].back === D2[0] && !colOf('bob').escrow && /done/.test((await call('ann', 'pktrade-cancel', { id: o2.id })).error) && (await call('ann', 'pktrade-answer', { id: o2.id, accept: true })).status === 409 && same(everything(['ann', 'bob', 'cat']), before), "and so does bob's; a cancelled trade cannot be cancelled or accepted again; every card is where it began");
	// at most three at once
	give('dan', { [D1[0]]: 5 });
	const made = []; for (let i = 0; i < 4; i++) made.push(await call('dan', 'pktrade-offer', { give: D1[0] }));
	A(made.slice(0, 3).every(m => m.trade) && /3 trades/.test(made[3].error) && colOf('dan').prints[D1[0]] === 2 && (await call('dan', 'pktrade-mine')).trades.length === 3, 'a player can have three trades going, not a fourth');
}

// ===== 5. requests that die half way, and races =====
{
	give('eve', { [S1[0]]: 1 }); give('fay', { [S1[4]]: 1 }); const all0 = everything(['eve', 'fay']);
	// the offer dies after the card is held, before the trade exists
	failNext = k => k.startsWith('pktradecode:'); let died = false; try { await call('eve', 'pktrade-offer', { give: S1[0] }); } catch (e) { died = true; }
	A(died && !colOf('eve').prints[S1[0]] && Object.keys(colOf('eve').escrow).length === 1 && same(everything(['eve', 'fay']), all0), 'an offer that dies after holding the card leaves it held: not lost');
	A((await call('eve', 'pktrade-mine')).settled.length === 0, '(not given back at once: the request might still be running)');
	NOW += SETTLE_AFTER_MS + 1;
	const e1 = await call('eve', 'pktrade-mine');
	A(e1.settled.length === 1 && e1.settled[0].back === S1[0] && colOf('eve').prints[S1[0]] === 1 && !colOf('eve').escrow, 'and it comes back when she next looks');
	// the proposal dies after bob's card is held, before the trade names him
	const o3 = (await call('eve', 'pktrade-offer', { give: S1[0] })).trade;
	failNext = k => k === 'pktrade:' + o3.id; died = false; try { await call('fay', 'pktrade-propose', { code: o3.code, give: S1[4] }); } catch (e) { died = true; }
	A(died && colOf('fay').escrow[o3.id] && JSON.parse(rows.get('pktrade:' + o3.id)).state === 'open' && same(everything(['eve', 'fay']), all0), 'a proposal that dies after holding the card leaves the trade open and the card held');
	NOW += SETTLE_AFTER_MS + 1;
	A((await call('fay', 'pktrade-mine')).settled[0].back === S1[4] && colOf('fay').prints[S1[4]] === 1, 'which comes back');
	// accepted, but the accept dies before ann's own side is settled
	await call('fay', 'pktrade-propose', { code: o3.code, give: S1[4] });
	failNext = k => k === 'pkcol:eve'; died = false; try { await call('eve', 'pktrade-answer', { id: o3.id, accept: true }); } catch (e) { died = true; }
	A(died && JSON.parse(rows.get('pktrade:' + o3.id)).state === 'matched' && colOf('eve').escrow[o3.id] && same(everything(['eve', 'fay']), all0), 'an accept that dies after the trade is matched has moved no card yet');
	const f1 = await call('fay', 'pktrade-mine'), e2 = await call('eve', 'pktrade-mine'), e3 = await call('eve', 'pktrade-mine');
	A(f1.settled[0].got === S1[0] && e2.settled[0].got === S1[4] && e3.settled.length === 0 && colOf('eve').prints[S1[4]] === 1 && colOf('fay').prints[S1[0]] === 1 && !colOf('eve').escrow && !colOf('fay').escrow && same(everything(['eve', 'fay']), all0), 'each side settles when it next looks, in either order, once');
	// accept and withdraw at the same moment: one of them wins, and the cards agree with the winner
	for (const first of ['answer', 'withdraw']) {
		give('gus', { [D2[1]]: 1 }); give('hal', { [D2[2]]: 1 }); const g0 = everything(['gus', 'hal']);
		const o4 = (await call('gus', 'pktrade-offer', { give: D2[1] })).trade; await call('hal', 'pktrade-propose', { code: o4.code, give: D2[2] });
		const stale = JSON.parse(rows.get('pktrade:' + o4.id));
		const r1 = first === 'answer' ? await call('gus', 'pktrade-answer', { id: o4.id, accept: true }) : await call('hal', 'pktrade-withdraw', { id: o4.id });
		// the other request read the trade before that write landed
		const real = store.get; store.get = async k => (k === 'pktrade:' + o4.id ? stale : real(k));
		const r2 = first === 'answer' ? await call('hal', 'pktrade-withdraw', { id: o4.id }) : await call('gus', 'pktrade-answer', { id: o4.id, accept: true });
		store.get = real; NOW += SETTLE_AFTER_MS + 1;
		await call('gus', 'pktrade-mine'); await call('hal', 'pktrade-mine');
		const swapped = colOf('gus').prints[D2[2]] === 1 && colOf('hal').prints[D2[1]] === 1, kept = colOf('hal').prints[D2[2]] === 1 && (colOf('gus').prints[D2[1]] === 1 || !!colOf('gus').escrow);
		A(!r1.error && r2.status === 409 && (first === 'answer' ? swapped : kept) && same(everything(['gus', 'hal']), g0), `accept and take-back at once, ${first} first: the later one is refused and the cards follow the first`, { r1: r1.trade && r1.trade.state, r2: r2.error });
	}
	// a collection write from a device lands between the server's read and write: the server tries again
	give('ian', { [D1[1]]: 1 }); let once = true; const real = store.setIfRev;
	store.setIfRev = async (k, v, expect) => { if (once && k === 'pkcol:ian') { once = false; const cur = JSON.parse(rows.get(k)); rows.set(k, JSON.stringify({ ...cur, rev: cur.rev + 1, col: C.addPacks(cur.col, 2) })); } return real(k, v, expect); };
	const o5 = await call('ian', 'pktrade-offer', { give: D1[1] }); store.setIfRev = real;
	A(o5.trade && colOf('ian').packs === C.START_PACKS + 2 && colOf('ian').escrow[o5.trade.id] && !colOf('ian').prints[D1[1]], "a device's save landing in the middle is not overwritten: the card is held on top of it");
}

// ===== 6. the pack inbox =====
{
	const H = 3600_000, t0 = 1_000_000_000_000;
	let s = PT.accrue(null, t0);
	A(s.inbox === 0 && s.base === t0 && PT.etaMs(s, t0) === PT.PACK_TIMER_MS && PT.PACK_TIMER_MS === 12 * H && PT.PACK_INBOX_CAP === 120, 'a new player starts with an empty inbox and 12 hours to wait (Battlecards\' numbers)');
	s = PT.accrue(s, t0 + 11 * H); A(s.inbox === 0 && PT.etaMs(s, t0 + 11 * H) === H, 'nothing before 12 hours; the wait counts down');
	s = PT.accrue(s, t0 + 30 * H); A(s.inbox === 2 && PT.etaMs(s, t0 + 30 * H) === 6 * H, 'after 30 hours, two packs, and the 6 hours left over count toward the third');
	const c1 = PT.claim(s, t0 + 30 * H); A(c1.claimed === 2 && c1.st.inbox === 0 && PT.etaMs(c1.st, t0 + 30 * H) === 6 * H && PT.claim(c1.st, t0 + 30 * H).claimed === 0, 'collecting empties the inbox and does not restart the wait; there is nothing to collect twice');
	const full = PT.accrue(s, t0 + 5000 * H); A(full.inbox === 120 && PT.etaMs(full, t0 + 5000 * H) === null && PT.accrue(full, t0 + 9000 * H).inbox === 120, 'the inbox holds 120; while it is full the timer is paused');
	const c2 = PT.claim(full, t0 + 9000 * H); A(c2.claimed === 120 && PT.etaMs(c2.st, t0 + 9000 * H) === PT.PACK_TIMER_MS, 'collecting a full inbox starts the timer again from then');
	A(PT.etaText(null).startsWith('paused') && PT.etaText(5 * H + 12 * 60000) === '5 h 12 min' && PT.etaText(30_000) === '1 min' && PT.cleanInbox({ base: 'x' }) === null && PT.cleanInbox({ base: 5, inbox: 9999 }).inbox === 120, 'the wait is said in hours and minutes; a stored inbox is read defensively');
	// the server
	NOW = 1_900_000_000_000;
	A((await call(null, 'pkinbox-get')).status === 401, 'the inbox on the account needs an account');
	const g0 = await call('ann', 'pkinbox-get'); A(g0.inbox === 0 && g0.nextMs === PT.PACK_TIMER_MS && g0.cap === 120, 'a first look starts the timer', g0);
	NOW += 25 * H; const g1 = await call('ann', 'pkinbox-get'); A(g1.inbox === 2 && g1.nextMs === 11 * H, 'two packs have arrived 25 hours later', g1);
	A((await call('ann', 'pkinbox-claim', {})).status === 400, 'a claim names itself');
	const k1 = await call('ann', 'pkinbox-claim', { id: 'claim00001' }), k2 = await call('ann', 'pkinbox-claim', { id: 'claim00001' }), k3 = await call('ann', 'pkinbox-claim', { id: 'claim00002' });
	A(k1.claimed === 2 && k2.claimed === 2 && k2.again === true && k3.claimed === 0 && (await call('ann', 'pkinbox-get')).inbox === 0, 'a claim pays what is there; asked again with the same id it gives the same answer (a lost answer is not a lost pack, nor a second one)', { k1, k2, k3 });
	A((await call('bob', 'pkinbox-get')).inbox === 0, "another player's inbox is their own");
}

// ===== 7. a device follows the account through a trade =====
{
	give('jon', { [D1[2]]: 1 }); give('kim', { [D1[6]]: 1 });
	const server = (username, action, body = {}) => handlePkcol({ action, body, store, username, json: (o, status) => ({ ...o, status: status || 200 }), now: 1 });
	const dev = user => { const mem = new Map(), d = { col: C.newCollection(), user }; d.sync = createSync({ storage: { getItem: k => (mem.has(k) ? mem.get(k) : null), setItem: (k, v) => { mem.set(k, String(v)); } }, delay: 0, user: () => user, getLocal: () => d.col, setLocal: c => { d.col = c; }, call: async (action, body) => server(user, action, JSON.parse(JSON.stringify(body))) }); return d; };
	const j = dev('jon'); await j.sync.now(); const had = total(j.col);
	const o6 = (await call('jon', 'pktrade-offer', { give: D1[2] })).trade; await j.sync.now();
	A(!j.col.prints[D1[2]] && j.col.escrow[o6.id].p === D1[2] && total(j.col) === had, "after offering, the device shows the card as held, not owned");
	j.col = C.addPacks(j.col, 1); await j.sync.now();
	A(colOf('jon').packs === j.col.packs && colOf('jon').escrow[o6.id] && !colOf('jon').prints[D1[2]], "a pack earned on the device meanwhile is saved without putting the held card back");
	await call('kim', 'pktrade-propose', { code: o6.code, give: D1[6] }); await call('jon', 'pktrade-answer', { id: o6.id, accept: true }); await call('kim', 'pktrade-mine'); await j.sync.now();
	A(j.col.prints[D1[6]] === 1 && !j.col.prints[D1[2]] && !j.col.escrow && total(j.col) === had && colOf('kim').prints[D1[2]] === 1, 'after the trade the device has the new card and not the old one');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
