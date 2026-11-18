// trade_micasurvivor_test.mjs — MicaSurvivor coins and gacha tickets in the site's one trading system (server/trade.mjs).
// Owner, 2026-11-17: the Inventory is to hold "the tickets from MicaSurvivor ... & every collectible item or currency
// from every game mode so we can have a unified inventory/trading system".
//
// The REAL server (server/mp.mjs over an in-memory D1) and the game's REAL merge (micasurvivor/js/core/db.js):
//   1. a whole trade: coins and tickets one way, a 10-pull ticket and dust the other; each ends with what the other put
//      up, the balances are what the game's ledger adds up to, and nothing is left held
//   2. a save from before the ledger (no `led`) trades too: its balance becomes the ledger's base
//   3. the game with an OLDER copy open (it earned coins meanwhile) saves: the server refuses the stale write, the
//      game's own merge joins the two, and the trade is still in it (not written over)
//   4. a game saving in the MIDDLE of a trade does not lose the note of what is held: a cancel gives it all back
//   5. more than there is: the trade is cancelled and everything put up comes back
//   6. a player who has never played MicaSurvivor: the trade is refused, saying so, and nothing moves
//   7. nothing is made or lost, across every one of the above
//   node overworld/tests/trade_micasurvivor_test.mjs (needs esbuild, so it lives in the overworld gate)
import fs from 'fs';
import os from 'os';
import path from 'path';
import vm from 'vm';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } };

// ---- the real server
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { return st.run(...b); }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-mstrade-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const api = async (action, body = {}, token) => {
	const res = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB });
	return { status: res.status, ...(await res.json()) };
};
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v), Date.now());

// ---- the game's real merge (db.js is a browser script: run it with the little of a browser it touches at load)
const ls = new Map();
const sandbox = { G: {}, console, JSON, Math, Date, Object, Array, Number, String, Set, Map, Promise, setTimeout, clearTimeout, setInterval, clearInterval,
	localStorage: { getItem: k => (ls.has(k) ? ls.get(k) : null), setItem: (k, v) => { ls.set(k, String(v)); }, removeItem: k => { ls.delete(k); }, key: i => [...ls.keys()][i] || null, get length() { return ls.size; } },
	document: { addEventListener() {}, visibilityState: 'visible', createElement: () => ({}), head: { appendChild() {} } }, location: { protocol: 'http:', hostname: 'localhost', search: '' }, navigator: { onLine: true }, addEventListener() {}, removeEventListener() {} };
sandbox.window = sandbox; sandbox.globalThis = sandbox;
vm.createContext(sandbox);
vm.runInContext('var G = globalThis.G;\n' + fs.readFileSync(path.join(ROOT, 'micasurvivor/js/core/db.js'), 'utf8'), sandbox, { filename: 'db.js' });
const merge = sandbox.G.DB && sandbox.G.DB.merge;
A(typeof merge === 'function', "the game's own save merge is loaded (micasurvivor/js/core/db.js)");

// ---- two players
const reg = async name => (await api('register', { username: name, password: 'trade-pass-1' }));
const ann = await reg('msann'), bob = await reg('msbob'), cy = await reg('mscy');
const TA = ann.token, TB = bob.token, TC = cy.token;
const SAVE = (coins, t1, t10, led) => ({ v: 3, updated: 1000, coins, tickets: { t1, t10 }, owned: { pikachu: { at: 1 } }, shiny: {}, upgrades: {}, stats: {}, ...(led ? { led } : {}) });
const put = async (tok, save, rev) => api('micasurvivor-save-put', { save, rev }, tok);
const get = async tok => api('micasurvivor-save-get', {}, tok);
const bal = async tok => { const s = (await get(tok)).save; return s ? [s.coins, s.tickets.t1, s.tickets.t10] : null; };
const ledSum = (s, k) => Object.values(s.led || {}).reduce((n, e) => n + (e[k] ? e[k][0] - e[k][1] : 0), 0);
const adds = s => s.coins === ledSum(s, 'c') && s.tickets.t1 === ledSum(s, 't1') && s.tickets.t10 === ledSum(s, 't10');
const open = async (fromName, toName, toTok) => { setRow('challenge:' + toName, [{ from: fromName, type: 'trade', ts: Date.now() }]); const r = await api('trade-open', { from: fromName }, toTok); return r.tradeId; };
const fresh = async () => {
	// ann: a save with the ledger (1,000 earned and 200 spent on one device = 800 coins; 5 tickets). bob: one from before the ledger.
	const ra = (await get(TA)).rev, rb = (await get(TB)).rev;
	const a = await put(TA, SAVE(800, 5, 0, { dann0001: { c: [1000, 200], t1: [5, 0] } }), ra), b = await put(TB, SAVE(40, 0, 3), rb);
	const acc = row('msbob'); acc.dust = 90; setRow('msbob', acc);
	return a.ok && b.ok;
};
const total = async () => { const x = await bal(TA), y = await bal(TB), held = [row('micasurvivor:msann'), row('micasurvivor:msbob')].flatMap(r => Object.values((r && r.th) || {})); return [x[0] + y[0] + held.reduce((n, h) => n + (h.c || 0), 0), x[1] + y[1] + held.reduce((n, h) => n + (h.t1 || 0), 0), x[2] + y[2] + held.reduce((n, h) => n + (h.t10 || 0), 0)].join(','); };

// ---------- 1 + 2. a whole trade
A(await fresh(), 'both players have a MicaSurvivor save on their account (written by the real save handler)');
const before = await total();
let id = await open('msann', 'msbob', TB);
A(!!id, 'bob accepts ann\'s request: the trade window opens');
await api('trade-update', { id, offer: { ms: { coins: 300, t1: 2 } } }, TA); await api('trade-update', { id, offer: { ms: { t10: 1 }, dust: 50 } }, TB);
await api('trade-lock', { id, accepted: true }, TA); let r = await api('trade-lock', { id, accepted: true }, TB);
A(r.trade && r.trade.done, 'both lock in: the trade is carried out', r.trade && [r.trade.phase, r.trade.why]);
A(JSON.stringify(await bal(TA)) === '[500,3,1]' && JSON.stringify(await bal(TB)) === '[340,2,2]', 'ann: 800 coins - 300 = 500, 5 tickets - 2 = 3, and bob\'s 10-pull ticket; bob: 40 + 300 = 340 coins, 2 tickets, 3 - 1 = 2 10-pull tickets', [await bal(TA), await bal(TB)]);
A(row('msann').dust === 50 && row('msbob').dust === 40, 'the dust in the same trade went the other way (50 to ann)', [row('msann').dust, row('msbob').dust]);
const sa = (await get(TA)).save, sb = (await get(TB)).save;
A(adds(sa) && adds(sb) && sa.led.trades0 && sb.led.trades0 && sb.led.base && sb.led.base.c[0] === 40, "each save's balance is what its ledger adds up to; the trade is one more counter in it, and bob's older save got a ledger with his balance as its base", [sa.led, sb.led]);
A(!row('micasurvivor:msann').th && !row('micasurvivor:msbob').th && await total() === before, 'nothing is left held, and nothing was made or lost', [before, await total()]);
A(sa.owned.pikachu && sa.v === 3 && sa.updated === 1000, 'the rest of the save is untouched (its Pokémon, its version, its "last played")');

// ---------- 3. the game with an older copy open saves
{
	// ann's game still holds the save from before the trade, and earned 70 coins since
	const local = SAVE(870, 5, 0, { dann0001: { c: [1070, 200], t1: [5, 0] } }); local.updated = 2000;
	const stale = await put(TA, local, 1);
	A(stale.status === 409 && stale.error === 'stale' && stale.save && stale.save.coins === 500, 'her game saves its older copy: the server refuses it (stale) and hands back the save the trade wrote', [stale.status, stale.error]);
	const joined = JSON.parse(JSON.stringify(merge(local, stale.save))), again = JSON.parse(JSON.stringify(merge(stale.save, local)));
	A(joined.coins === 570 && joined.tickets.t1 === 3 && joined.tickets.t10 === 1 && again.coins === 570 && again.tickets.t1 === 3, "the game's own merge joins them: 500 + the 70 earned = 570 coins, 3 tickets, the 10-pull ticket (either way round)", [joined.coins, joined.tickets, again.coins]);
	const ok = await put(TA, joined, stale.rev);
	A(ok.ok && JSON.stringify(await bal(TA)) === '[570,3,1]', 'and writes the joined save: the trade was not written over');
}

// ---------- 4. a game saving in the middle of a trade
{
	A(await fresh(), '(a new pair of saves)');
	const t0 = await total();
	id = await open('msann', 'msbob', TB);
	// bob puts up an overworld item too, so the trade waits for his game to hand it over: everything else is held meanwhile
	await api('trade-update', { id, offer: { ms: { coins: 100, t1: 1 } } }, TA); await api('trade-update', { id, offer: { ms: { coins: 10 }, items: [{ id: 'potion', count: 1 }] } }, TB);
	await api('trade-lock', { id, accepted: true }, TA); r = await api('trade-lock', { id, accepted: true }, TB);
	const mid = row('micasurvivor:msann');
	A(r.trade.phase === 'wait' && mid.th && mid.th[id] && mid.th[id].c === 100 && mid.save.coins === 700 && mid.save.tickets.t1 === 4, 'waiting for the hand-over: her 100 coins and 1 ticket are out of her balance and noted as held beside the save', [r.trade.phase, mid.th, mid.save.coins]);
	const s = (await get(TA)); s.save.updated = 3000; s.save.stats = { runs: 1 };
	const w = await put(TA, s.save, s.rev);
	A(w.ok && row('micasurvivor:msann').th && row('micasurvivor:msann').th[id].c === 100, 'her game saves meanwhile: the note of what is held is still beside the save', row('micasurvivor:msann').th);
	r = await api('trade-cancel', { id }, TB);
	A(r.trade && r.trade.cancelled && JSON.stringify(await bal(TA)) === '[800,5,0]' && JSON.stringify(await bal(TB)) === '[40,0,3]' && !row('micasurvivor:msann').th && !row('micasurvivor:msbob').th && await total() === t0, 'bob cancels: every coin and ticket is back with its owner, and nothing is held', [await bal(TA), await bal(TB)]);
	A((await get(TA)).save.stats.runs === 1 && adds((await get(TA)).save), 'and what her game saved in between is kept');
}

// ---------- 5. more than there is
for (const [what, offer] of [['coins', { coins: 801 }], ['tickets', { t1: 6 }], ['10-pull tickets', { t10: 1 }]]) {
	A(await fresh(), `(a new pair of saves: ${what})`);
	id = await open('msann', 'msbob', TB);
	await api('trade-update', { id, offer: { ms: offer } }, TA); await api('trade-update', { id, offer: { ms: { coins: 5 }, dust: 20 } }, TB);
	await api('trade-lock', { id, accepted: true }, TA); r = await api('trade-lock', { id, accepted: true }, TB);
	A(r.trade.cancelled && JSON.stringify(await bal(TA)) === '[800,5,0]' && JSON.stringify(await bal(TB)) === '[40,0,3]' && row('msbob').dust === 90 && !row('micasurvivor:msbob').th && !row('msbob').tradeHeld, `offering more ${what} than she has: the trade is cancelled, and what bob put up is back with him`, [r.trade.why, await bal(TA), await bal(TB), row('msbob').dust]);
}

// ---------- 6. a player who has never played MicaSurvivor
{
	A(await fresh(), '(a new pair of saves)');
	id = await open('msann', 'mscy', TC);
	await api('trade-update', { id, offer: { ms: { coins: 50 } } }, TA); await api('trade-update', { id, offer: {} }, TC);
	await api('trade-lock', { id, accepted: true }, TA); r = await api('trade-lock', { id, accepted: true }, TC);
	A(r.trade.cancelled && /mscy has not played MicaSurvivor/.test(r.trade.why || '') && JSON.stringify(await bal(TA)) === '[800,5,0]' && !row('micasurvivor:msann').th && !row('micasurvivor:mscy'), 'cy has no MicaSurvivor save to receive coins in: the trade is cancelled and says why; ann keeps her coins, and no save is invented for cy', [r.trade.why, await bal(TA)]);
	// a trade with no coins or tickets in it does not need a save
	const acc = row('msann'); acc.dust = 30; setRow('msann', acc);
	id = await open('msann', 'mscy', TC);
	await api('trade-update', { id, offer: { dust: 30 } }, TA);
	await api('trade-lock', { id, accepted: true }, TA); r = await api('trade-lock', { id, accepted: true }, TC);
	A(r.trade.done && row('mscy').dust === 30, 'a trade with no coins or tickets in it goes through for cy as before');
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
