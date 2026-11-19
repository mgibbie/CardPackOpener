// bets_goods_server_test.mjs — spectator bets of GOODS (owner, 2026-11-19: "anything tradeable should be bettable"; an item,
// card or Pokémon goes into the pool AT ITS STAR VALUE, is SOLD TO THE BANK, and winners are paid in STARS), through the
// real handler (server/mp.mjs bundled over node:sqlite). alice plays; bob and carol are her friends.
//   1. a Pocket card (Charizard ex ◆◆◆◆), a Battlecards card, a MicaSurvivor ticket and an overworld item (through the
//      hand-over: asked, taken out of the device's save under the bet journal, deposited) each staked: the goods leave the
//      bettor exactly once (the same bet id again takes nothing more), the pool grows by their star value, and the stake
//      lists what was bet
//   2. refused, nothing taken: a key item; more copies than held (the stars put with them come back too); a closed market;
//      overworld things mixed with stars; MicaSurvivor with no save
//   3. the overworld's things when the betting closes between the ask and the deposit: they come back through the delivery
//      box (once), not as stars; an ask the device never acted on is withdrawn; a deposit nobody asked for is told `gone`
//   4. settling: the winner is paid in stars; a refund (nobody on the winner) pays the goods' STAR VALUE back, not the goods
//   5. a goods stake left half way (not all held) is given back by the bettor's next look, never landed
//   6. nothing made or lost: wallets + every thing's star value (on the account, the collections, the device) + open pools
//   node overworld/tests/bets_goods_server_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import * as W from '../../site/stars.js';
import * as TL from '../ow_tradelog.js';
import { starValue } from '../../site/values.js';
import { newCollection } from '../../pocketenhanced/js/collection.js';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-betsgoods-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB })).json();
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
let skew = 0; globalThis.__msurvClock = () => Date.now() + skew;

const NAMES = ['alice', 'bob', 'carol', 'dave'];
const tok = {};
for (const n of NAMES) tok[n] = (await call('register', { username: n, password: 'bets-goods-pass' })).token;
for (const n of ['bob', 'carol', 'dave']) await call('add-friend', { username: 'alice' }, tok[n]);
for (const n of NAMES) setRow('stars:' + n, { rev: 1, e: { ['seed' + n]: 1000 }, s: {}, at: 1 });
// what each holds: bob a Pocket collection with 2 Charizard ex ◆◆◆◆ and a Battlecards Golden Guardian (epic); carol a
// MicaSurvivor save with 3 tickets, and an overworld game on her device with 3 Master Balls and a key item
const CZ = 'A1-036', GG = 'golden_guardian';
{ const col = newCollection(); col.prints[CZ] = 2; setRow('pkcol:bob', { rev: 1, col, ids: [] }); }
{ const acc = row('bob'); acc.collection = { ...(acc.collection || {}), [GG]: 1 }; setRow('bob', acc); }
setRow('micasurvivor:carol', { rev: 1, save: { coins: 40, tickets: { t1: 3, t10: 0 } }, updated_at: 1 });
const dev = { party: [{ name: 'Pika', speciesId: 'pikachu', level: 12 }, { name: 'Bulby', speciesId: 'bulbasaur', level: 9 }], box: [], bag: { masterball: 3, itemfinder: 1 }, money: 0, coins: 0, journal: {}, applied: [] };
const V = { cz: starValue({ kind: 'pk-card', id: CZ }), gg: starValue({ kind: 'bc-card', id: GG, rarity: 'epic' }), t1: starValue({ kind: 'ms-t1' }), mb: starValue({ kind: 'item', id: 'masterball' }) };
A(V.cz === 8000 && V.gg === 2000 && V.mb === 500 && V.t1 > 0, 'the star values: Charizard ex ◆◆◆◆ 8,000, an epic card 2,000, a Master Ball 500, a ticket ' + V.t1, V);

const bal = n => W.balance(row('stars:' + n));
const pkHas = (u, id) => (row('pkcol:' + u).col.prints || {})[id] || 0;
const bcHas = (u, id) => ((row(u) || {}).collection || {})[id] || 0;
const msT1 = u => (row('micasurvivor:' + u).save.tickets || {}).t1 || 0;
const pools = () => sqlite.prepare("SELECT value FROM mp_store WHERE key LIKE 'betm:%'").all().map(r => JSON.parse(r.value)).filter(m => !m.end).reduce((a, m) => a + (m.pool || 0), 0);
// everything's worth in stars: the wallets, the things (wherever they are: owned, or held for a bet), the open pools
const heldPk = u => Object.values((row('pkcol:' + u).col.escrow) || {}).reduce((a, h) => a + ((h.prints || {})[CZ] || 0), 0);
const heldBc = u => Object.values((row(u) || {}).tradeHeld || {}).reduce((a, h) => a + ((h.cards || {})[GG] || 0), 0);
const heldMs = u => Object.values((row('micasurvivor:' + u) || {}).th || {}).reduce((a, h) => a + (h.t1 || 0), 0);
const total = () => NAMES.reduce((a, n) => a + bal(n), 0) + (pkHas('bob', CZ) + heldPk('bob')) * V.cz + (bcHas('bob', GG) + heldBc('bob')) * V.gg + (msT1('carol') + heldMs('carol')) * V.t1 + (dev.bag.masterball || 0) * V.mb + pools();
const T0 = total();

let bidN = 0; const bid = () => 'bidg' + (++bidN).toString().padStart(6, '0');
const card = (who, bet, extra = {}) => call('publish-cardstate', { snapshot: { v: ++bidN }, mode: 'battle', label: 'x', seq: bidN, bet, ...extra }, tok[who]);
const place = (who, body) => call('bet-place', body, tok[who]);
const pkGoods = n => ({ pk: { prints: { [CZ]: n } } });
// the device's hand-over, as overworld/ow_handover.js betHandOver does it (the note, the removal, the note, the deposit)
async function handOver(b, goods) {
	const purse = { money: dev.money, coins: dev.coins }, after = TL.takeOut(goods, dev.party, dev.box, dev.bag, purse);
	if (!after) return { taken: false };
	dev.journal = TL.noteTaking(dev.journal, b, goods, dev.bag, 'A', purse);
	Object.assign(dev, { party: after.party, box: after.box, bag: after.bag, money: after.money, coins: after.coins });
	dev.journal = TL.noteOut(dev.journal, b);
	return { taken: true };
}
async function settleDevice() {   // (the journal, then the delivery box: ow_handover.js settle)
	for (const [b, entry] of Object.entries(dev.journal)) {
		const taken = TL.wasTaken(entry, dev.party, dev.box, dev.bag, dev), r = await call('bet-deposit', taken ? { bid: b } : { bid: b, cancel: true }, tok.carol), what = TL.resolveBet(taken, r);
		if (what === 'restore') { const p = TL.putIn(entry.offer, dev.box, dev.bag, dev); Object.assign(dev, { box: p.box, bag: p.bag, money: p.money, coins: p.coins }); }
		if (what !== 'keep') dev.journal = TL.drop(dev.journal, b);
	}
	const d = await call('trade-box', {}, tok.carol);
	if (d.deliveries && d.deliveries.length) { const r = TL.applyDeliveries(d.deliveries, dev.applied, dev.box, dev.bag, dev); Object.assign(dev, { box: r.box, bag: r.bag, money: r.money, coins: r.coins, applied: r.applied }); await call('trade-box-ack', { ids: r.ack }, tok.carol); return r.fresh.length; }
	return 0;
}

try {
// ===== 1. each kind staked =====
await card('alice', { run: 'qm1', prog: 1 });
const M1 = (await call('bet-get', { game: 'cards', runner: 'alice' }, tok.bob)).markets[0];
A(M1 && M1.open, 'bob sees alice\'s Quick Match market, open', M1);
const b1 = bid();
let r = await place('bob', { id: M1.id, o: 'win', bid: b1, goods: pkGoods(1) });
A(r.ok && pkHas('bob', CZ) === 1 && !row('pkcol:bob').col.escrow && row('betm:' + M1.id).pool === V.cz, 'bob bets a Charizard ex ◆◆◆◆: it leaves his collection (sold: nothing left held), the pool is 8,000 ★', r);
A(bal('bob') === 1000 && !(row('stars:bob').bq || {})[b1] && row('stars:bob').bx[b1] === 's', 'his stars are untouched; the bet is noted finished (sold)', row('stars:bob'));
const st1 = row('betm:' + M1.id).stakes.bob;
A(st1.stars === V.cz && st1.goods.length === 1 && st1.goods[0].k === 'pk-card' && st1.goods[0].id === CZ && st1.goods[0].v === V.cz, 'the stake is 8,000 ★ and lists the card with its value', st1);
r = await place('bob', { id: M1.id, o: 'win', bid: b1, goods: pkGoods(1) });
A(r.ok && pkHas('bob', CZ) === 1 && row('betm:' + M1.id).pool === V.cz, 'the same bet id again: nothing more leaves him, the pool is unchanged', r);
A(r.market && r.market.mine && r.market.mine.goods && r.market.mine.goods[0].id === CZ && !r.market.bets.some(b => b.u === 'bob'), 'the market shows bob\'s stake and what it was', r.market);
const b2 = bid();
r = await place('bob', { id: M1.id, o: 'win', bid: b2, n: 50, goods: { cards: { [GG]: 1 } } });
A(r.ok && bcHas('bob', GG) === 0 && !row('bob').tradeHeld && bal('bob') === 950 && row('betm:' + M1.id).pool === V.cz + V.gg + 50, 'bob raises with a Battlecards card and 50 ★: the card leaves his account once, the pool grows by 2,050', { pool: row('betm:' + M1.id).pool, held: row('bob').tradeHeld });
r = await place('bob', { id: M1.id, o: 'win', bid: b2, n: 50, goods: { cards: { [GG]: 1 } } });
A(r.ok && bal('bob') === 950 && row('betm:' + M1.id).pool === V.cz + V.gg + 50 && row('betm:' + M1.id).stakes.bob.goods.length === 2, 'the raise again: nothing more taken', row('betm:' + M1.id).stakes.bob);
const b3 = bid();
r = await place('carol', { id: M1.id, o: 'lose', bid: b3, goods: { ms: { t1: 1 } } });
A(r.ok && msT1('carol') === 2 && !row('micasurvivor:carol').th && row('micasurvivor:carol').save.led, 'carol bets a MicaSurvivor ticket: it leaves her save once (its ledger counts it spent)', row('micasurvivor:carol'));
r = await place('carol', { id: M1.id, o: 'lose', bid: b3, goods: { ms: { t1: 1 } } });
A(r.ok && msT1('carol') === 2 && row('betm:' + M1.id).stakes.carol.stars === V.t1, 'again: no second ticket', row('betm:' + M1.id).stakes.carol);
A(r.market.bets.some(b => b.u === 'bob' && b.n === V.cz + V.gg + 50 && b.goods.map(g => g.k).join() === 'pk-card,bc-card'), "carol sees bob's stake and what it was: the Pocket card and the Battlecards card", r.market.bets);
// the overworld item: asked, handed over by the device, deposited
const b4 = bid(), owGoods = { items: [{ id: 'masterball', count: 2 }] };
r = await place('carol', { id: M1.id, o: 'lose', bid: b4, goods: owGoods });
A(r.handover && r.value === 2 * V.mb && dev.bag.masterball === 3 && row('betm:' + M1.id).stakes.carol.stars === V.t1, 'carol bets 2 Master Balls: the server only notes it (handover); nothing has left her save, nothing is in the pool yet', r);
A((await place('carol', { id: M1.id, o: 'lose', bid: b4, goods: owGoods })).handover && Object.keys(row('stars:carol').bq).length === 1, 'asked again with the same id: one note');
await handOver(b4, owGoods);
A(dev.bag.masterball === 1 && dev.journal[b4] && dev.journal[b4].state === 'out', 'her device takes them out of the save, noted in the bet journal');
r = await call('bet-deposit', { bid: b4 }, tok.carol);
A(r.landed && row('betm:' + M1.id).stakes.carol.stars === V.t1 + 2 * V.mb && row('stars:carol').bx[b4] === 's', 'the deposit: the stake lands at their value (1,000 ★), sold', r);
r = await call('bet-deposit', { bid: b4 }, tok.carol);
A(r.landed && row('betm:' + M1.id).stakes.carol.stars === V.t1 + 2 * V.mb, 'the deposit again: told it landed, nothing added twice', r);
await settleDevice();
A(!Object.keys(dev.journal).length && dev.bag.masterball === 1, 'her device settles: the journal entry is dropped, the balls stay sold');
A(total() === T0, 'so far nothing was made or lost (in stars)', [total(), T0]);

// ===== 2. refused, nothing taken =====
r = await place('carol', { id: M1.id, o: 'lose', bid: bid(), goods: { items: [{ id: 'itemfinder', count: 1 }] } });
A(r.error && /key items/.test(r.error) && dev.bag.itemfinder === 1 && !Object.keys(row('stars:carol').bq || {}).length, 'a key item: refused (it has no star value), nothing noted', r);
const before = [pkHas('bob', CZ), bal('bob'), row('betm:' + M1.id).pool];
r = await place('bob', { id: M1.id, o: 'win', bid: bid(), n: 30, goods: pkGoods(5) });
A(r.error && r.refunded && JSON.stringify([pkHas('bob', CZ), bal('bob'), row('betm:' + M1.id).pool]) === JSON.stringify(before) && !row('pkcol:bob').col.escrow, 'five Charizards he does not have (with 30 ★): refused, his card and stars are back, nothing held', [r, before]);
r = await place('carol', { id: M1.id, o: 'lose', bid: bid(), n: 5, goods: owGoods });
A(r.error && /on their own/.test(r.error), 'overworld things mixed with stars: refused', r);
r = await place('dave', { id: M1.id, o: 'win', bid: bid(), goods: { ms: { t1: 1 } } });
A(r.error && /MicaSurvivor/.test(r.error) && !row('micasurvivor:dave'), 'dave has no MicaSurvivor save: refused, and none is made for him', r);

// ===== 3. the overworld's things when the betting closes in between =====
const b5 = bid();
r = await place('carol', { id: M1.id, o: 'lose', bid: b5, goods: { items: [{ id: 'masterball', count: 1 }] } });
await handOver(b5, { items: [{ id: 'masterball', count: 1 }] });
A(r.handover && !dev.bag.masterball, 'carol asks to bet her last Master Ball and her device takes it out');
await card('alice', { run: 'qm1', prog: 3 });   // (turn 3: betting closes)
r = await place('bob', { id: M1.id, o: 'win', bid: bid(), goods: pkGoods(1) });
A(r.error && /closed/.test(r.error) && pkHas('bob', CZ) === 1 && !row('pkcol:bob').col.escrow, 'the market has closed: bob\'s Charizard is refused and nothing is taken', r);
r = await call('bet-deposit', { bid: b5 }, tok.carol);
A(r.back && row('owtrade:carol').list.filter(e => e.id === 'bet:' + b5 + ':back').length === 1 && row('betm:' + M1.id).stakes.carol.stars === V.t1 + 2 * V.mb, 'her deposit arrives after the close: it is not in the pool; it comes back through the delivery box', r);
r = await call('bet-deposit', { bid: b5 }, tok.carol);
A(r.back && row('owtrade:carol').list.length === 1, 'the deposit again: told it is coming back, one delivery', r);
A(await settleDevice() === 1 && dev.bag.masterball === 1 && !Object.keys(dev.journal).length, 'her device takes the Master Ball back in (as goods, not stars) and clears the journal', dev.bag);
A(await settleDevice() === 0 && dev.bag.masterball === 1, 'settling again adds nothing');

// ===== 4. settling =====
await card('alice', { run: 'qm1', prog: 9, res: 'lose' }, { over: true, winner: 1 });
const pool1 = V.cz + V.gg + 50 + V.t1 + 2 * V.mb;
A(row('betm:' + M1.id).end?.result === 'lose' && bal('carol') === 1000 + pool1 && bal('bob') === 950 && pkHas('bob', CZ) === 1, `alice loses: carol (against) is paid the whole pool, ${pool1} ★, in stars; bob's things stay sold`, { end: row('betm:' + M1.id).end, carol: bal('carol') });
A(total() === T0, 'nothing made or lost', [total(), T0]);
// an ask the device never acted on, and a deposit nobody asked for
await card('alice', { run: 'qm2', prog: 0 });
const M2 = (await call('bet-get', { game: 'cards', runner: 'alice' }, tok.carol)).markets[0];
const b6 = bid();
r = await place('carol', { id: M2.id, o: 'win', bid: b6, goods: { items: [{ id: 'masterball', count: 1 }] } });
dev.journal = TL.noteTaking(dev.journal, b6, { items: [{ id: 'masterball', count: 1 }] }, dev.bag, 'A', dev);   // (the page died before taking it out)
await settleDevice();
A(r.handover && !(row('stars:carol').bq || {})[b6] && dev.bag.masterball === 1 && !Object.keys(dev.journal).length, 'the page died before taking it out: the device withdraws the ask, and keeps its ball', row('stars:carol').bq);
r = await call('bet-deposit', { bid: 'neverasked01' }, tok.carol);
A(r.gone, 'a deposit for a bet the server never noted: `gone` (the device puts its things back)', r);
A(total() === T0, 'still nothing made or lost', [total(), T0]);
// a refund: nobody on the winning side
const b7 = bid();
r = await place('bob', { id: M2.id, o: 'win', bid: b7, goods: pkGoods(1) });
A(r.ok && pkHas('bob', CZ) === 0, 'bob bets his last Charizard on alice\'s next fight');
await card('alice', { run: 'qm2', prog: 9, res: 'lose' }, { over: true, winner: 1 });
A(row('betm:' + M2.id).end?.result === null && bal('bob') === 950 + V.cz && pkHas('bob', CZ) === 0, 'she loses and nobody backed that: bob is refunded the card\'s STAR VALUE (8,000 ★), not the card (it was sold)', { end: row('betm:' + M2.id).end, bob: bal('bob'), cz: pkHas('bob', CZ) });
A(total() === T0, 'nothing made or lost', [total(), T0]);

// ===== 5. a goods stake left half way =====
{ const col = row('pkcol:bob'); col.col.prints[CZ] = 1; setRow('pkcol:bob', col); }   // (bob gets one more Charizard)
const T1 = total();
await card('alice', { run: 'qm3', prog: 0 });
const M3 = (await call('bet-get', { game: 'cards', runner: 'alice' }, tok.bob)).markets[0];
const b8 = bid();
{   // the request died after the stars were noted and the card held, before "all held" was written
	const w = row('stars:bob'); w.s.wagers0 = (w.s.wagers0 || 0) + 10; w.bq = { [b8]: { m: M3.id, n: 10 + V.cz, o: 'win', at: Date.now() - 60_000, st: 10, g: { cards: {}, packs: 0, dust: 0, gold: 0, pk: { prints: { [CZ]: 1 }, packs: 0, own: {} }, ms: { coins: 0, t1: 0, t10: 0 }, pokemon: [], items: [], money: 0, coins: 0 }, gl: [], h: 0 } }; w.rev++; setRow('stars:bob', w);
	const p = row('pkcol:bob'); p.col.prints = { ...p.col.prints }; delete p.col.prints[CZ]; p.col.escrow = { ['bet:' + b8]: { prints: { [CZ]: 1 }, packs: 0, at: 1 } }; p.rev++; setRow('pkcol:bob', p);
}
A(total() === T1 - 10, '(set up: 10 ★ and a held card on the way)');
await call('bet-mine', {}, tok.bob);
A(pkHas('bob', CZ) === 1 && !row('pkcol:bob').col.escrow && !(row('stars:bob').bq || {})[b8] && !(row('betm:' + M3.id).stakes || {}).bob && total() === T1, 'bob\'s next look: never all held, so it never lands: the card and the 10 ★ come back', { bq: row('stars:bob').bq, stakes: row('betm:' + M3.id).stakes });
A(total() === T1, 'at the end: every wallet and every thing adds up');
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
