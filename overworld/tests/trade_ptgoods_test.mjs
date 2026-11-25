// trade_ptgoods_test.mjs — Poketactica GOODS in the site's one trading system (server/trade.mjs). Owner, 2026-11-25:
// "Too many things say not tradeable. The only thing that shouldn't be tradeable is the overworld key items."
// (Plans/INVENTORY_TRADE_SELL_PLAN.md, stage 1.) A held item (with its level and gemstones), an evolution item, polish,
// a kit, a loose plush gemstone and a Mystery Maze storage item each move whole, by uid, as a figurine does.
// The REAL server (server/mp.mjs over an in-memory D1):
//   1. a whole trade: goods one way, dust the other; each arrives whole; nothing left held
//   2. the worth is the server's, read from the owner's own row (a page's claims are not believed)
//   3. one that is not yours, or that a figurine is wearing (it is not in the bag): the change is refused
//   4. a side with no room for what it would receive: the trade is cancelled and everything comes back
//   5. a cancel gives held goods back; a uid the receiver already uses gets a letter more
//   6. nothing made or lost
//   node overworld/tests/trade_ptgoods_test.mjs (needs esbuild, so it lives in the overworld gate)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import { merge3Figs, cleanFigs, MM_STORE_MAX } from '../../poketactica/js/figcol.js';
import { ptValue, PT_STARS_PER_ITEM_LEVEL, PT_STARS_PER_GEM_LEVEL } from '../../site/values.js';
import { goodStars } from '../../poketactica/js/goods.js';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } };

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-pttrade-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const api = async (action, body = {}, token) => {
	const res = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB });
	return { status: res.status, ...(await res.json()) };
};
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v), Date.now());

const reg = async name => (await api('register', { username: name, password: 'pt-trade-pass-1' })).token;
const TA = await reg('ptann'), TB = await reg('ptbob');
const fig = (id, species, level, extra = {}) => ({ v: 1, id, species, level, exp: level * 1000, ability: 'static', shiny: false, pool: [{ id: 'tackle', lv: 1, xp: 0 }], equipped: ['tackle'], ...extra });
const put = async (tok, col) => { const g = await api('ptfig-get', {}, tok); return api('ptfig-put', { figs: { v: 1, figs: {}, ...col }, rev: g.rev }, tok); };
const col = u => (cleanFigs((row('ptfig:' + u) || {}).figs) || { figs: {} });
const open = async (fromName, toName, toTok) => { setRow('challenge:' + toName, [{ from: fromName, type: 'trade', ts: Date.now() }]); return (await api('trade-open', { from: fromName }, toTok)).tradeId; };
/** Every good on both accounts, in the bag or held: nothing may be made or lost. */
const everything = () => ['ptann', 'ptbob'].flatMap(u => { const c = col(u), th = Object.values(c.escrow || {}).map(e => e.things || {}); return [...Object.values(c.items || {}), ...Object.values(c.gems || {}), ...Object.values((c.mm && c.mm.store) || {}), ...th.flatMap(t => [...Object.values(t.items || {}), ...Object.values(t.gems || {}), ...Object.values(t.store || {})])]; }).sort().join(',');

try {
	// ---------- values
	A(ptValue({ k: 'item', id: 'leftovers' }) === goodStars('leftovers') && ptValue({ k: 'item', id: 'leftovers', lv: 11, gems: ['atk:4'] }) === goodStars('leftovers') + 10 * PT_STARS_PER_ITEM_LEVEL + 4 * PT_STARS_PER_GEM_LEVEL, 'a held item is worth its shop price, more a level, and what its gemstones are worth');
	A(ptValue({ k: 'gem', gem: 'hp:10' }) + ptValue({ k: 'gem', gem: 'hp:5' }) === ptValue({ k: 'gem', gem: 'hp:15' }), 'gemstones are worth their levels: two combined are worth what they were apart');
	A(ptValue({ k: 'store', id: 'oran' }) === 30 && ptValue({ k: 'store', id: 'vaultkey' }) === null && ptValue({ k: 'store', id: 'stars' }) === null && ptValue({ k: 'item', id: 'nope' }) === null, 'a maze storage item is worth its shop price; a key, a pile of stars and an unknown thing are worth nothing');

	// ---------- 1. a whole trade
	A((await put(TA, { figs: { 'pika-ann-1': fig('pika-ann-1', 'pikachu', 20, { held: 'leftovers' }) }, items: { 'charcoal-aaaa': 'charcoal', 'firestone-aaaa': 'firestone', 'rarecandy-aaaa': 'rarecandy', 'leftovers-bbbb': 'leftovers' }, gear: { 'charcoal-aaaa': { lv: 31, gems: ['atk:15'] } }, gems: { 'gem-aaaa': 'spe:4', 'gem-bbbb': 'hp:9' }, mm: { clear: {}, best: {}, store: { 'oran-aaaa': 'oran', 'escapeorb-aaaa': 'escapeorb' } } })).ok, 'ann has goods of every kind on her account');
	A((await put(TB, { mm: { clear: {}, best: {}, store: { 'oran-aaaa': 'oran' } } })).ok, "bob has an Oran Bead in his maze storage (under the same uid as one of ann's)");
	{ const acc = row('ptbob'); acc.dust = 90; setRow('ptbob', acc); }
	const before = everything();
	let id = await open('ptann', 'ptbob', TB);
	let r = await api('trade-update', { id, offer: { pt: [{ k: 'item', uid: 'charcoal-aaaa', id: 'leftovers', lv: 100 }, { k: 'gem', uid: 'gem-aaaa', gem: 'hp:100' }, { k: 'store', uid: 'oran-aaaa' }, { k: 'item', uid: 'firestone-aaaa' }] } }, TA);
	const off = r.trade && r.trade.offerA.pt;
	A(off && off.length === 4 && off[0].id === 'charcoal' && off[0].lv === 31 && off[0].gems.join() === 'atk:15' && off[1].gem === 'spe:4' && off[2].id === 'oran' && off[3].id === 'firestone', 'ann offers four: the window shows what each IS, from her own row (not the Lv 100 item and the Lv 100 gemstone her page claimed)', off);
	// ---------- 2. the worth is the server's
	A(r.trade.worthA.pt.join() === [ptValue({ k: 'item', id: 'charcoal', lv: 31, gems: ['atk:15'] }), ptValue({ k: 'gem', gem: 'spe:4' }), 30, goodStars('firestone')].join() && r.trade.worthA.total === r.trade.worthA.pt.reduce((x, y) => x + y, 0), 'and values each one', r.trade.worthA);
	await api('trade-update', { id, offer: { dust: 40 } }, TB);
	await api('trade-lock', { id }, TA); r = await api('trade-lock', { id }, TB);
	A(r.trade && r.trade.done, 'both lock in: the trade is carried out', r.trade);
	let a = col('ptann'), b = col('ptbob');
	A(b.items['charcoal-aaaa'] === 'charcoal' && b.gear['charcoal-aaaa'].lv === 31 && b.gear['charcoal-aaaa'].gems.join() === 'atk:15' && b.items['firestone-aaaa'] === 'firestone' && b.gems['gem-aaaa'] === 'spe:4', 'bob has them, whole: the Charcoal Stick still Lv 31 with its gemstone set in it', [b.items, b.gear, b.gems]);
	A(Object.values(b.mm.store).filter(x => x === 'oran').length === 2 && b.mm.store['oran-aaaa'] === 'oran' && b.mm.store['oran-aaaax'] === 'oran', 'the Oran Bead arrived beside his own: a uid he already used got a letter more', b.mm.store);
	A(!a.items['charcoal-aaaa'] && !(a.gear || {})['charcoal-aaaa'] && !a.items['firestone-aaaa'] && !a.gems['gem-aaaa'] && !a.mm.store['oran-aaaa'] && a.items['rarecandy-aaaa'] && a.items['leftovers-bbbb'] && a.gems['gem-bbbb'] === 'hp:9' && a.mm.store['escapeorb-aaaa'] && a.figs['pika-ann-1'].held === 'leftovers', 'ann no longer has them; everything she did not offer is untouched (her Pikachu still wears its Leftover Clay)', [a.items, a.gems, a.mm.store]);
	A(!a.escrow && !b.escrow && (row('ptann').dust || 0) === 40, 'nothing is left held; the dust came the other way');
	A(everything() === before, 'no good made or lost');
	// a device of ann's that still had them merges with the account: they stay gone
	{
		const base = { v: 1, figs: {}, items: { 'charcoal-aaaa': 'charcoal', 'firestone-aaaa': 'firestone', 'rarecandy-aaaa': 'rarecandy', 'leftovers-bbbb': 'leftovers' }, gems: { 'gem-aaaa': 'spe:4', 'gem-bbbb': 'hp:9' }, mm: { clear: {}, best: {}, store: { 'oran-aaaa': 'oran', 'escapeorb-aaaa': 'escapeorb' } } };
		const m = merge3Figs(base, base, a);
		A(!m.items['charcoal-aaaa'] && !m.gems['gem-aaaa'] && !m.mm.store['oran-aaaa'] && m.items['rarecandy-aaaa'], "ann's device, behind, merges: what she traded stays gone", [m.items, m.gems]);
	}

	// ---------- 3. not yours, or worn
	id = await open('ptann', 'ptbob', TB);
	r = await api('trade-update', { id, offer: { pt: [{ k: 'item', uid: 'charcoal-aaaa' }] } }, TA);
	A(r.status === 400 && /not yours/.test(r.error) && r.trade.offerA.pt.length === 0, 'ann offers the Charcoal Stick she no longer has: refused, the offer stays as it was', r);
	r = await api('trade-update', { id, offer: { pt: [{ k: 'item', uid: 'leftovers-zzzz' }] } }, TA);
	A(r.status === 400 && /comes off first/.test(r.error), 'the Leftover Clay her Pikachu wears is not in her bag: refused, and told it comes off first', r.error);
	r = await api('trade-update', { id, offer: { pt: [{ k: 'bad', uid: 'x-aaaa' }, { k: 'item', uid: '../etc' }, { k: 'item', uid: 'rarecandy-aaaa' }, { k: 'item', uid: 'rarecandy-aaaa' }] } }, TA);
	A(r.trade && r.trade.offerA.pt.length === 1 && r.trade.offerA.pt[0].id === 'rarecandy', 'junk in an offer is dropped, and a thing is offered once', r.trade && r.trade.offerA.pt);

	// ---------- 5. a cancel gives held goods back
	await api('trade-update', { id, offer: { dust: 10 } }, TB);
	await api('trade-lock', { id, count: true }, TA); await api('trade-lock', { id, count: true }, TB);
	{ const t = row('xtrade:' + id); t.goAt = Date.now() - 1; t.rev++; setRow('xtrade:' + id, t); }
	{ const acc = row('ptbob'); acc.dust = 0; setRow('ptbob', acc); }   // (bob spends his dust meanwhile: the hold of his side fails)
	r = await api('trade-poll', { id }, TA);
	a = col('ptann');
	A(r.trade && r.trade.cancelled && a.items['rarecandy-aaaa'] === 'rarecandy' && !a.escrow, "bob no longer has the dust he put up: the trade is cancelled and ann's Rare Polish (held first) is back in her bag, nothing left held", [r.trade && r.trade.why, a.items, a.escrow]);

	// ---------- 4. no room
	{ const rw = row('ptfig:ptbob'), store = {}; for (let i = 0; i < MM_STORE_MAX; i++) store['apple-' + String(1000 + i)] = 'apple'; rw.figs.mm = { clear: {}, best: {}, store }; rw.rev++; setRow('ptfig:ptbob', rw); }
	const before2 = everything();
	id = await open('ptann', 'ptbob', TB);
	await api('trade-update', { id, offer: { pt: [{ k: 'store', uid: 'escapeorb-aaaa' }, { k: 'gem', uid: 'gem-bbbb' }] } }, TA);
	await api('trade-update', { id, offer: { pt: [{ k: 'item', uid: 'firestone-aaaa' }] } }, TB);
	await api('trade-lock', { id }, TA); r = await api('trade-lock', { id }, TB);
	a = col('ptann'); b = col('ptbob');
	A(r.trade && r.trade.cancelled && /no room/.test(r.trade.why || '') && /200/.test(r.trade.why || ''), "bob's maze storage is full: the trade is cancelled and says why", r.trade && r.trade.why);
	A(a.mm.store['escapeorb-aaaa'] === 'escapeorb' && a.gems['gem-bbbb'] === 'hp:9' && b.items['firestone-aaaa'] === 'firestone' && !a.escrow && !b.escrow && Object.keys(b.mm.store).length === MM_STORE_MAX, 'and everything is back where it was: nothing dropped, nothing left held', [a.mm.store, a.gems, b.items]);
	A(everything() === before2, 'no good made or lost');
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
