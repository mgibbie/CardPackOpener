// trade_figurine_test.mjs — Poketactica FIGURINES in the site's one trading system (server/trade.mjs) and in spectator bets
// (server/bets.mjs). Owner, 2026-11-20: figurines are collectibles like any other, so they trade and bet like any other.
// A figurine is ONE OF A KIND, so it moves whole (its EXP, its move pool with each move's level, its equipped four), by id.
//
// The REAL server (server/mp.mjs over an in-memory D1) and the page's REAL sync merge (poketactica/js/figcol.js):
//   1. a whole trade: a figurine one way, a figurine and dust the other; each ends with the other's figurine, whole, and
//      nothing is left held; a receiver who never opened Poketactica gets a collection
//   2. the offer's worth is the server's: a page that claims its Caterpie is a shiny Lv 999 Mewtwo is shown a Caterpie's
//   3. a figurine that is not yours (or already held): the change is refused
//   4. while a figurine is held, the page's sync can't bring it back (the put keeps the account's hold); a device that
//      still has it merges it away; a cancel gives it back
//   5. a held figurine with no trade left (swept) comes back on the next look
//   6. a figurine bet: it leaves the collection once, the pool grows by its star value, the stake names it; one that is not
//      the bettor's is refused
//   7. nothing made or lost
//   node overworld/tests/trade_figurine_test.mjs (needs esbuild, so it lives in the overworld gate)
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import { merge3Figs, cleanFigs } from '../../poketactica/js/figcol.js';
import { starValue, figValue } from '../../site/values.js';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } };

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-figtrade-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const api = async (action, body = {}, token) => {
	const res = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.8.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB });
	return { status: res.status, ...(await res.json()) };
};
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v), Date.now());

const fig = (id, species, level, extra = {}) => ({ v: 1, id, species, level, exp: level * 1000, ability: 'static', shiny: false, pool: [{ id: 'tackle', lv: 40, xp: 9000 }, { id: 'thundershock', lv: 12, xp: 800 }], equipped: ['thundershock', 'tackle'], from: 'catch', ...extra });
const reg = async name => (await api('register', { username: name, password: 'fig-trade-pass-1' })).token;
const TA = await reg('figann'), TB = await reg('figbob'), TC = await reg('figcy'), TD = await reg('figdee');
const putFigs = async (tok, figs) => { const g = await api('ptfig-get', {}, tok); return api('ptfig-put', { figs: { v: 1, figs: Object.fromEntries(figs.map(f => [f.id, f])) }, rev: g.rev }, tok); };
const figsOf = u => (cleanFigs((row('ptfig:' + u) || {}).figs) || { figs: {} });
const has = (u, id) => !!figsOf(u).figs[id];
const held = u => Object.values(figsOf(u).escrow || {}).flatMap(h => h.ids || []);
const open = async (fromName, toName, toTok) => { setRow('challenge:' + toName, [{ from: fromName, type: 'trade', ts: Date.now() }]); return (await api('trade-open', { from: fromName }, toTok)).tradeId; };
const everyFig = () => ['figann', 'figbob', 'figcy', 'figdee'].flatMap(u => [...Object.keys(figsOf(u).figs), ...held(u)]).sort().join(',');

try {
	// ---------- 1. a whole trade
	A((await putFigs(TA, [fig('pika-ann-1', 'pikachu', 40), fig('cater-ann-2', 'caterpie', 5)])).ok, 'ann has two figurines on her account (written by the real sync handler)');
	A((await putFigs(TB, [fig('mudk-bob-1', 'mudkip', 22, { shiny: true })])).ok, 'bob has one');
	{ const acc = row('figbob'); acc.dust = 90; setRow('figbob', acc); }
	const before = everyFig();
	let id = await open('figann', 'figbob', TB);
	A(!!id, 'bob accepts ann\'s request: the window opens');
	let r = await api('trade-update', { id, offer: { fg: ['pika-ann-1'] } }, TA);
	A(r.trade && r.trade.offerA.fg.length === 1 && r.trade.offerA.fg[0].species === 'pikachu' && r.trade.offerA.fg[0].level === 40, 'ann offers her Pikachu: the window shows what it is (from her row)', r.trade && r.trade.offerA);
	r = await api('trade-update', { id, offer: { fg: [{ id: 'mudk-bob-1' }], dust: 50 } }, TB);
	A(r.trade && r.trade.worthB && r.trade.worthB.fg[0] === figValue({ species: 'mudkip', level: 22, shiny: true }) && r.trade.worthA.fg[0] === starValue({ kind: 'figurine', fig: { species: 'pikachu', level: 40 } }), 'each side\'s worth counts its figurine (site/values.js figValue; shiny x10)', [r.trade && r.trade.worthA, r.trade && r.trade.worthB]);
	await api('trade-lock', { id }, TA); r = await api('trade-lock', { id }, TB);
	A(r.trade && r.trade.done, 'both lock in: the trade is carried out', r.trade);
	A(!has('figann', 'pika-ann-1') && has('figbob', 'pika-ann-1') && has('figann', 'mudk-bob-1') && !has('figbob', 'mudk-bob-1') && has('figann', 'cater-ann-2'), 'each has the other\'s figurine, and ann keeps the one she did not offer', [Object.keys(figsOf('figann').figs), Object.keys(figsOf('figbob').figs)]);
	const got = figsOf('figbob').figs['pika-ann-1'];
	A(got && got.exp === 40000 && got.pool.length === 2 && got.pool[0].lv === 40 && got.equipped.join() === 'thundershock,tackle' && got.ability === 'static', 'the figurine arrived WHOLE: its EXP, its move pool with each move\'s level, its equipped four, its ability', got);
	A(figsOf('figann').figs['mudk-bob-1'].shiny === true, 'the shiny is still shiny');
	A(!figsOf('figann').escrow && !figsOf('figbob').escrow && (row('figann').dust || 0) === 50, 'nothing is left held; the dust came with it', [figsOf('figann').escrow, figsOf('figbob').escrow]);
	A(everyFig() === before, 'no figurine made or lost');
	// a device that still had the old copy merges with the account: the traded-away one stays gone, the new one arrives
	{
		const base = { v: 1, figs: { 'pika-ann-1': fig('pika-ann-1', 'pikachu', 40), 'cater-ann-2': fig('cater-ann-2', 'caterpie', 5) } };
		const m = merge3Figs(base, base, figsOf('figann'));
		A(!m.figs['pika-ann-1'] && m.figs['mudk-bob-1'] && m.figs['cater-ann-2'], 'ann\'s device, behind, merges: the Pikachu she traded stays gone, the Mudkip arrives', Object.keys(m.figs));
	}
	// a receiver who never opened Poketactica
	id = await open('figbob', 'figcy', TC);
	await api('trade-update', { id, offer: { fg: ['pika-ann-1'] } }, TB); await api('trade-update', { id, offer: { dust: 0 } }, TC);
	await api('trade-lock', { id }, TB); r = await api('trade-lock', { id }, TC);
	A(r.trade && r.trade.done && has('figcy', 'pika-ann-1') && !has('figbob', 'pika-ann-1'), 'a gift to cy, who has never opened Poketactica: the trade gives him a collection with it', r.trade);

	// ---------- 2. the worth is the server's
	id = await open('figann', 'figbob', TB);
	r = await api('trade-update', { id, offer: { fg: [{ id: 'cater-ann-2', species: 'mewtwo', level: 999, shiny: true }] } }, TA);
	A(r.trade && r.trade.offerA.fg[0].species === 'caterpie' && r.trade.offerA.fg[0].level === 5 && !r.trade.offerA.fg[0].shiny && r.trade.worthA.total === figValue({ species: 'caterpie', level: 5 }), 'a page claiming its Caterpie is a shiny Lv 999 Mewtwo is shown, and priced as, a Lv 5 Caterpie', r.trade && r.trade.offerA);

	// ---------- 3. not yours
	r = await api('trade-update', { id, offer: { fg: ['mudk-bob-1', 'pika-ann-1'] } }, TA);
	A(r.status === 400 && /not yours/.test(r.error || '') && r.trade.offerA.fg[0].id === 'cater-ann-2', 'offering a figurine she does not have (traded away): refused, the offer stays as it was', r);

	// ---------- 4. held: the page's sync can't bring it back; a cancel gives it back
	await api('trade-update', { id, offer: { fg: ['cater-ann-2'] } }, TA);
	{ const acc = row('figbob'); acc.dust = 10; setRow('figbob', acc); }
	await api('trade-update', { id, offer: { dust: 10 } }, TB);
	await api('trade-lock', { id, count: true }, TA); await api('trade-lock', { id, count: true }, TB);   // (a countdown: nothing held yet)
	// held by hand as the hold step would (the countdown keeps the trade in talk): run settle by moving the clock past goAt
	{ const t = row('xtrade:' + id); t.goAt = Date.now() - 1; t.rev++; setRow('xtrade:' + id, t); }
	{ const acc = row('figbob'); acc.dust = 0; setRow('figbob', acc); }   // (bob spends his dust meanwhile: the hold of his side will fail)
	r = await api('trade-poll', { id }, TA);
	A(r.trade && r.trade.cancelled && has('figann', 'cater-ann-2') && !held('figann').length, 'bob no longer has the dust he put up: the trade is cancelled and ann\'s Caterpie (held first) is back, nothing left held', [r.trade, figsOf('figann')]);
	// a hold the page tries to write over
	id = await open('figann', 'figbob', TB);
	await api('trade-update', { id, offer: { fg: ['cater-ann-2'] } }, TA); await api('trade-update', { id, offer: { fg: ['mudk-bob-1'] } }, TB);   // (bob has none: refused)
	{ const acc = row('figbob'); acc.dust = 5; setRow('figbob', acc); }
	await api('trade-update', { id, offer: { dust: 5, fg: [] } }, TB);
	// bob's game will never hand over: put a Pokémon in his offer so the trade waits after holding
	{ const t = row('xtrade:' + id); t.offerB.pokemon = [{ name: 'X', speciesId: 'pikachu', level: 3 }]; t.rev++; setRow('xtrade:' + id, t); }
	await api('trade-lock', { id }, TA); r = await api('trade-lock', { id }, TB);
	A(r.trade && r.trade.phase === 'wait' && held('figann').includes('cater-ann-2') && !has('figann', 'cater-ann-2'), 'both lock in: ann\'s Caterpie is held for the trade (out of her figurines)', [r.trade && r.trade.phase, figsOf('figann')]);
	{
		const g = await api('ptfig-get', {}, TA), stale = { v: 1, figs: { ...g.figs.figs, 'cater-ann-2': fig('cater-ann-2', 'caterpie', 5) } };   // (a page writing it back in, escrow dropped)
		const p = await api('ptfig-put', { figs: stale, rev: g.rev }, TA);
		A(p.ok && !has('figann', 'cater-ann-2') && held('figann').includes('cater-ann-2'), 'the page\'s sync writes its copy with the held Caterpie in it and no hold: the account keeps the hold, the Caterpie is not doubled', figsOf('figann'));
	}
	r = await api('trade-cancel', { id }, TA);
	A(r.trade && r.trade.cancelled && has('figann', 'cater-ann-2') && !held('figann').length, 'ann cancels: the Caterpie is hers again, nothing held', figsOf('figann'));

	// ---------- 5. a hold with no trade left
	{ const rw = row('ptfig:figann'), c = rw.figs; c.escrow = { GHOSTTRADE1: { ids: ['cater-ann-2'], at: 1, figs: [c.figs['cater-ann-2']] } }; delete c.figs['cater-ann-2']; rw.rev++; setRow('ptfig:figann', rw); }
	await api('trade-mine', {}, TA);
	A(has('figann', 'cater-ann-2') && !held('figann').length, 'a figurine held for a trade that is gone comes back on her next look', figsOf('figann'));
	A(everyFig() === before, 'still, no figurine made or lost');

	// ---------- 6. a figurine bet
	for (const n of ['figbob', 'figdee']) await api('add-friend', { username: 'figann' }, n === 'figbob' ? TB : TD);
	setRow('stars:figdee', { rev: 1, e: { seeddee: 100 }, s: {}, at: 1 });
	await putFigs(TD, [fig('eevee-dee-1', 'eevee', 30)]);
	await api('publish-cardstate', { snapshot: { v: 1 }, mode: 'battle', label: 'x', seq: 1, bet: { run: 'fq1', prog: 1 } }, TA);
	const M = (await api('bet-get', { game: 'cards', runner: 'figann' }, TD)).markets[0];
	A(M && M.open, 'dee sees ann\'s market, open', M);
	const V = figValue({ species: 'eevee', level: 30 });
	r = await api('bet-place', { id: M.id, o: 'win', bid: 'figbid000001', goods: { fg: [{ id: 'eevee-dee-1', species: 'mew', level: 999 }] } }, TD);
	A(r.ok && !has('figdee', 'eevee-dee-1') && !held('figdee').length && row('betm:' + M.id).pool === V, 'dee bets her Eevee: it leaves her collection (sold to the bank, nothing held) and the pool grows by an Eevee\'s worth, not a Mew\'s', [r, row('betm:' + M.id).pool, V]);
	const st = row('betm:' + M.id).stakes.figdee;
	A(st && st.goods.length === 1 && st.goods[0].k === 'figurine' && st.goods[0].sp === 'eevee' && st.goods[0].lv === 30 && st.goods[0].v === V, 'the stake names the figurine with its worth', st);
	r = await api('bet-place', { id: M.id, o: 'win', bid: 'figbid000001', goods: { fg: ['eevee-dee-1'] } }, TD);
	A(r.ok && row('betm:' + M.id).pool === V, 'the same bet id again: nothing more', r);
	r = await api('bet-place', { id: M.id, o: 'win', bid: 'figbid000002', goods: { fg: ['mudk-bob-1'] } }, TD);
	A(r.error && /not yours/.test(r.error) && has('figann', 'mudk-bob-1') && row('betm:' + M.id).pool === V, 'betting someone else\'s figurine: refused, nothing moves', r);
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
