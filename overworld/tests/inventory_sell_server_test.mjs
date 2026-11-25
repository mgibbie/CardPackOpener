// inventory_sell_server_test.mjs — SELLING a thing for stars (server/sell.mjs). Owner, 2026-11-25: "everything else you
// can trade or sell for stars"; a sale pays the FULL star value; cards stay dust-only (Plans/INVENTORY_TRADE_SELL_PLAN.md
// stage 2). The REAL server (server/mp.mjs over an in-memory D1):
//   1. a figurine sold: it is gone, the wallet has its star value more; taken back: the stars go, it returns whole
//   2. goods sold (a levelled held item, a gemstone, a maze storage item) and taken back, level and gemstones intact
//   3. currencies sold (dust, gold, packs)
//   4. the price is the server's (a page's claims are not believed)
//   5. refused: cards, stars, overworld things, a thing that is not yours, one a figurine wears, nothing
//   6. taking back: once; not after the stars are spent; not after ten minutes; only the newest sale
//   7. a sale that died half way is carried on, and pays once
//   8. the trade system's clean-up never gives a sold thing back
//   9. a sale whose "paid" note was lost pays ONCE when it is carried on; a take-back whose "done" note was lost gives back ONCE
//   node overworld/tests/inventory_sell_server_test.mjs (needs esbuild, so it lives in the overworld gate)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import { cleanFigs } from '../../poketactica/js/figcol.js';
import { figValue, ptValue, starValue } from '../../site/values.js';
import { cleanWallet, balance } from '../../site/stars.js';
import { UNDO_MS } from '../../server/sell.mjs';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } };

// (LOSE: the next write whose value holds this text is LOST, as a guarded write that lost a race, or a request that died there, would be)
let LOSE = null, LOST = 0;
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { if (LOSE && b.some((x) => typeof x === 'string' && x.includes(LOSE))) { LOSE = null; LOST++; return { meta: { changes: 0 } }; } const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-sell-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const api = async (action, body = {}, token) => {
	const res = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB });
	return { status: res.status, ...(await res.json()) };
};
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v), Date.now());

const TA = (await api('register', { username: 'sellann', password: 'sell-pass-1x' })).token;
const fig = (id, species, level, extra = {}) => ({ v: 1, id, species, level, exp: level * 1000, ability: 'static', shiny: false, pool: [{ id: 'tackle', lv: 40, xp: 9000 }], equipped: ['tackle'], ...extra });
const put = async (col) => { const g = await api('ptfig-get', {}, TA); return api('ptfig-put', { figs: { v: 1, figs: {}, ...col }, rev: g.rev }, TA); };
const col = () => (cleanFigs((row('ptfig:sellann') || {}).figs) || { figs: {} });
const stars = () => balance(cleanWallet(row('stars:sellann')));
const sell = (offer) => api('inv-sell', { offer }, TA);

try {
	A((await put({ figs: { 'pika-s-1': fig('pika-s-1', 'pikachu', 40), 'cater-s-2': fig('cater-s-2', 'caterpie', 5, { held: 'leftovers' }) },
		items: { 'charcoal-aaaa': 'charcoal', 'rarecandy-aaaa': 'rarecandy', 'rarecandy-bbbb': 'rarecandy' }, gear: { 'charcoal-aaaa': { lv: 31, gems: ['atk:15'] } }, gems: { 'gem-aaaa': 'spe:4' },
		mm: { clear: {}, best: {}, store: { 'oran-aaaa': 'oran' } } })).ok, 'ann has figurines and goods on her account');
	{ const acc = row('sellann'); acc.dust = 30; acc.gold = 300; acc.packs = 2; setRow('sellann', acc); }
	const s0 = stars();

	// ---------- 1. a figurine
	const vPika = figValue({ species: 'pikachu', level: 40 });
	let r = await sell({ fg: ['pika-s-1'] });
	A(r.ok && r.stars === vPika && r.sale.phase === 'paid' && r.sale.undoLeft > 0 && r.sale.undoLeft <= UNDO_MS, 'ann sells her Pikachu: paid its full star value, and it can be taken back for ten minutes', r);
	A(!col().figs['pika-s-1'] && !col().escrow && stars() === s0 + vPika, 'it is gone from her collection (nothing left held) and her wallet has exactly that much more', [Object.keys(col().figs), stars() - s0]);
	r = await api('inv-sell-undo', {}, TA);
	const back = col().figs['pika-s-1'];
	A(r.ok && r.sale.phase === 'undone' && stars() === s0 && back && back.exp === 40000 && back.pool[0].lv === 40 && back.equipped.join() === 'tackle' && !col().escrow, 'she takes it back: the stars go and the Pikachu returns whole (its EXP, its move levels)', [r, back]);
	r = await api('inv-sell-undo', {}, TA);
	A(r.status === 400 && /already taken back/.test(r.error) && stars() === s0, 'a sale is taken back once', r.error);

	// ---------- 4. the price is the server's
	r = await sell({ fg: [{ id: 'cater-s-2', species: 'mewtwo', level: 999, shiny: true }] });
	A(r.ok && r.stars === figValue({ species: 'caterpie', level: 5 }) && r.stars < 200, 'a page that says its Caterpie is a shiny Lv 999 Mewtwo is paid for a Caterpie', r.stars);
	await api('inv-sell-undo', {}, TA);
	A(col().figs['cater-s-2'] && col().figs['cater-s-2'].held === 'leftovers' && stars() === s0, '(taken back: it still wears its Leftover Clay)');

	// ---------- 2. goods
	const vGoods = ptValue({ k: 'item', id: 'charcoal', lv: 31, gems: ['atk:15'] }) + ptValue({ k: 'gem', gem: 'spe:4' }) + ptValue({ k: 'store', id: 'oran' }) + ptValue({ k: 'item', id: 'rarecandy' });
	r = await sell({ pt: [{ k: 'item', uid: 'charcoal-aaaa' }, { k: 'gem', uid: 'gem-aaaa' }, { k: 'store', uid: 'oran-aaaa' }, { k: 'item', uid: 'rarecandy-aaaa' }] });
	let c = col();
	A(r.ok && r.stars === vGoods && !c.items['charcoal-aaaa'] && !(c.gear || {})['charcoal-aaaa'] && !(c.gems || {})['gem-aaaa'] && !((c.mm || {}).store || {})['oran-aaaa'] && c.items['rarecandy-bbbb'] && stars() === s0 + vGoods, 'four goods sold together: a Lv 31 held item with its gemstone, a loose gemstone, a maze storage item, one of two Rare Polish', [r.stars, vGoods, c.items]);
	r = await api('inv-sell-undo', {}, TA); c = col();
	A(r.ok && c.items['charcoal-aaaa'] === 'charcoal' && c.gear['charcoal-aaaa'].lv === 31 && c.gear['charcoal-aaaa'].gems.join() === 'atk:15' && c.gems['gem-aaaa'] === 'spe:4' && c.mm.store['oran-aaaa'] === 'oran' && c.items['rarecandy-aaaa'] && stars() === s0, 'taken back: the item is still Lv 31 with its gemstone in it, and everything else is where it was', [c.items, c.gear, c.gems]);

	// ---------- 3. currencies
	const vCur = starValue({ kind: 'dust', n: 10 }) + starValue({ kind: 'gold', n: 150 }) + starValue({ kind: 'bc-pack', n: 1 });
	r = await sell({ dust: 10, gold: 150, packs: 1 });
	let acc = row('sellann');
	A(r.ok && r.stars === vCur && acc.dust === 20 && acc.gold === 150 && acc.packs === 1 && !acc.tradeHeld && stars() === s0 + vCur, '10 dust, 150 gold and a pack sold for what each is worth', [r.stars, vCur, acc.dust, acc.gold, acc.packs]);
	r = await api('inv-sell-undo', {}, TA); acc = row('sellann');
	A(r.ok && acc.dust === 30 && acc.gold === 300 && acc.packs === 2 && stars() === s0, 'and taken back');
	r = await sell({ dust: 999 });
	A(r.status === 400 && row('sellann').dust === 30 && stars() === s0, 'more dust than she has: refused, nothing moves', r.error);

	// ---------- 5. refused
	{ const a2 = row('sellann'); a2.collection = { ...(a2.collection || {}), white_knight: 2 }; setRow('sellann', a2); }
	r = await sell({ cards: { white_knight: 1 } });
	A(r.status === 400 && /dust/.test(r.error) && row('sellann').collection.white_knight === 2, 'a card: refused (cards turn into dust in their own game)', r.error);
	r = await sell({ stars: 50 });
	A(r.status === 400 && /nothing to sell/.test(r.error), 'stars are not sold for stars');
	r = await sell({ money: 5000, dust: 1 });
	A(r.status === 400 && /on their own/.test(r.error), 'overworld things with anything else: refused (they are sold on their own)', r.error);
	r = await sell({ fg: ['nobody-fig-9'] });
	A(r.status === 400 && /not yours/.test(r.error), 'a figurine that is not hers: refused');
	r = await sell({ pt: [{ k: 'item', uid: 'leftovers-zzzz' }] });
	A(r.status === 400 && /comes off first/.test(r.error) && col().figs['cater-s-2'].held === 'leftovers', 'the Leftover Clay her Caterpie wears: refused, it comes off first');
	r = await sell({});
	A(r.status === 400 && stars() === s0, 'nothing: refused; the wallet never moved through all of that', stars() - s0);
	A((await api('inv-sell', { offer: { dust: 1 } })).status === 401, 'not logged in: refused');

	// ---------- 6. taking back
	r = await sell({ pt: [{ k: 'item', uid: 'rarecandy-aaaa' }] });
	const v1 = r.stars;
	r = await sell({ pt: [{ k: 'item', uid: 'rarecandy-bbbb' }] });
	A(r.ok && stars() === s0 + 2 * v1, 'two sales, one after the other');
	r = await api('inv-sell-undo', {}, TA);
	A(r.ok && col().items['rarecandy-bbbb'] && !col().items['rarecandy-aaaa'] && stars() === s0 + v1, 'only the newest can be taken back: the one before it is sold for good', col().items);
	r = await sell({ fg: ['pika-s-1'] });
	{ const s = row('sale:sellann'); s.at = Date.now() - UNDO_MS - 1000; setRow('sale:sellann', s); }
	const sLate = stars();
	r = await api('inv-sell-undo', {}, TA);
	A(r.status === 400 && /too late/.test(r.error) && !col().figs['pika-s-1'] && stars() === sLate && (await api('inv-sale', {}, TA)).sale.undoLeft === 0, 'after ten minutes: too late, the sale stands', r.error);
	r = await sell({ fg: ['cater-s-2'] });
	{ const w = row('stars:sellann'); w.s = { ...(w.s || {}), spent0: (w.s && w.s.spent0 || 0) + stars() }; w.rev = (w.rev || 0) + 1; setRow('stars:sellann', w); }   // (she spends every star she has)
	r = await api('inv-sell-undo', {}, TA);
	A(r.status === 400 && /no longer have the/.test(r.error) && !col().figs['cater-s-2'] && stars() === 0 && !row('stars:sellann').th, 'the stars it sold for are spent: it cannot be taken back, and nothing is left held', [r.error, stars()]);

	// ---------- 7. a sale that died half way
	A((await put({ figs: { 'eevee-s-3': fig('eevee-s-3', 'eevee', 12) } })).ok || true, '(a fresh figurine)');
	{ const g = await api('ptfig-get', {}, TA); if (!cleanFigs(g.figs).figs['eevee-s-3']) { const rw = row('ptfig:sellann'); rw.figs.figs['eevee-s-3'] = fig('eevee-s-3', 'eevee', 12); rw.rev++; setRow('ptfig:sellann', rw); } }
	const vE = figValue({ species: 'eevee', level: 12 }), sBefore = stars();
	{ const s = row('sale:sellann'); setRow('sale:sellann', { rev: s.rev + 1, id: 'DEADHALFWAY1', phase: 'hold', offer: { cards: {}, packs: 0, dust: 0, gold: 0, stars: 0, pk: { prints: {}, packs: 0, own: {} }, ms: { coins: 0, t1: 0, t10: 0 }, fg: [{ id: 'eevee-s-3', species: 'eevee', level: 12 }], pt: [], pokemon: [], items: [], money: 0, coins: 0 }, stars: vE, at: Date.now() }); }
	r = await api('inv-sale', {}, TA);
	A(r.sale && r.sale.phase === 'paid' && !col().figs['eevee-s-3'] && stars() === sBefore + vE, 'a sale written down and never carried out is carried on by the next look: held, emptied, paid', [r.sale && r.sale.phase, stars() - sBefore]);
	await api('inv-sale', {}, TA); await api('inv-sale', {}, TA);
	A(stars() === sBefore + vE && !col().escrow, 'and looking again pays nothing more');

	// ---------- 8. the trade system's clean-up leaves a sale's hold alone
	{ const rw = row('ptfig:sellann'); rw.figs.escrow = { 'sell:STILLBEINGSOLD': { ids: ['ghost-s-9'], at: Date.now(), figs: [fig('ghost-s-9', 'gastly', 9)] } }; rw.rev++; setRow('ptfig:sellann', rw); }
	await api('trade-mine', {}, TA);
	A(!col().figs['ghost-s-9'] && col().escrow && col().escrow['sell:STILLBEINGSOLD'], 'a thing held for a sale is not handed back by the trade system\'s own tidy-up (that would be a figurine AND its stars)', [Object.keys(col().figs), col().escrow]);
	// ---------- 9. the note that it was paid is lost: carried on, it is paid once
	// (a sale used to make the wallet's place for the stars and use it in ONE step: with the note of that step lost, the
	// step ran again, made the place again and paid again. The same for a take-back, which gave the things back twice.)
	{
		{ const acc = row('sellann'); acc.dust = 50; delete acc.tradeHeld; setRow('sellann', acc); }
		const b0 = stars(), v10 = starValue({ kind: 'dust', n: 10 });
		LOSE = '"phase":"paid"'; LOST = 0;
		r = await sell({ dust: 10 });
		await api('inv-sale', {}, TA);
		A(LOST === 1 && row('sellann').dust === 40 && stars() === b0 + v10, 'the write that says "paid" is lost once: the 10 dust are sold and paid for ONCE, not twice', [LOST, row('sellann').dust, stars() - b0, v10]);
		A((await api('inv-sale', {}, TA)).sale.phase === 'paid', 'and the sale ends up paid');
		const b1 = stars();
		LOSE = '"phase":"undone"'; LOST = 0;
		r = await api('inv-sell-undo', {}, TA);
		await api('inv-sale', {}, TA);
		A(LOST === 1 && row('sellann').dust === 50 && stars() === b1 - v10 && !row('sellann').tradeHeld, 'the write that says "taken back" is lost once: the 10 dust come back ONCE (50, not 60) and the stars go once', [LOST, row('sellann').dust, b1 - stars()]);
		A((await api('inv-sale', {}, TA)).sale.phase === 'undone' && !row('stars:sellann').th, 'and nothing is left held');
	}
	// ---------- 10. THE OVERWORLD'S THINGS: asked for, handed over by the game, then paid (the server never writes a save)
	{
		const TB = (await api('register', { username: 'sellbob', password: 'sell-pass-2x' })).token;
		const stars = () => balance(cleanWallet(row('stars:sellbob'))), sell = (offer) => api('inv-sell', { offer }, TB);
		const RAT = { speciesId: 'rattata', name: 'RATTATA', level: 7, shiny: false, ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 } };
		const offer = { pokemon: [RAT], items: [{ id: 'potion', count: 5 }], money: 1000, coins: 50 };
		const want = starValue({ kind: 'pokemon', mon: RAT }) + starValue({ kind: 'item', id: 'potion', n: 5 }) + starValue({ kind: 'money', n: 1000 }) + starValue({ kind: 'coins', n: 50 });
		const b0 = stars();
		r = await sell(offer);
		A(r.handover === true && r.stars === want && r.sale.phase === 'ask' && r.sale.ow === true && stars() === b0, 'a sale of overworld things is ASKED for: valued by the server, written down, and nothing is paid yet', [r, want]);
		const id = r.id;
		A(!row('ow:sellbob'), 'the server writes no overworld save (the game takes the things out itself)');
		r = await api('inv-sell-deposit', { id }, TB);
		A(r.landed === true && r.stars === want && stars() === b0 + want && r.sale.phase === 'paid' && r.sale.undoLeft > 0, 'the game says it has handed them over: the stars are paid', [r, stars() - b0]);
		r = await api('inv-sell-deposit', { id }, TB); await api('inv-sell-deposit', { id }, TB);
		A(r.landed === true && stars() === b0 + want, 'saying so again pays nothing more');
		// taken back: the things come to the delivery box, which the game empties into the save
		r = await api('inv-sell-undo', {}, TB);
		const box = (row('owtrade:sellbob') || { list: [] }).list;
		A(r.ok && stars() === b0 && box.length === 1 && box[0].id === 'sell:' + id + ':back' && box[0].back === true && box[0].pokemon[0].speciesId === 'rattata' && box[0].items[0].count === 5 && box[0].money === 1000 && box[0].coins === 50, 'taken back: the stars go, and everything is in the delivery box for the game to take in', [r, box]);
		await api('inv-sale', {}, TB);
		A((row('owtrade:sellbob') || { list: [] }).list.length === 1, 'once (looking again adds no second delivery)');
		// the device never took them out
		r = await sell({ money: 300 }); const id2 = r.id;
		r = await api('inv-sell-deposit', { id: id2, cancel: true }, TB);
		A(r.cancelled === true && stars() === b0 && (await api('inv-sell-deposit', { id: id2 }, TB)).cancelled === true, 'the device could not take them out and says so: nothing is paid, then or later', r);
		// an ask replaced by a newer sale
		r = await sell({ money: 300 }); const id3 = r.id;
		r = await sell({ money: 700 }); const id4 = r.id;
		r = await api('inv-sell-deposit', { id: id3 }, TB);
		A(r.gone === true && stars() === b0, 'an ask that a newer sale replaced is gone: its device keeps its things, nothing is paid', r);
		r = await api('inv-sell-deposit', { id: id4 }, TB);
		A(r.landed === true && stars() === b0 + starValue({ kind: 'money', n: 700 }), 'the newer one is paid');
		A((await api('inv-sell-deposit', { id: 'NOPE1234NOPE' }, TB)).gone === true, 'an id nobody asked with is gone too');
		// key and story items
		r = await sell({ items: [{ id: 'bicycle', count: 1 }, { id: 'potion', count: 1 }] });
		A(r.status === 400 && /key items cannot be sold/.test(r.error) && r.untradeable.includes('bicycle'), 'a key item: refused (the one thing that is never traded or sold)', r.error);
		// an account sale after an overworld one is an account sale again
		{ const acc = row('sellbob'); acc.dust = 20; delete acc.tradeHeld; setRow('sellbob', acc); }
		r = await sell({ dust: 5 });
		A(r.ok && !r.sale.ow && !r.handover, 'a sale of account things afterwards is carried out at once, as before');
	}
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
