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

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
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
	r = await sell({ money: 5000, items: [{ id: 'potion', count: 1 }] });
	A(r.status === 400 && /overworld/.test(r.error), 'the overworld\'s things: not here yet', r.error);
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
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
