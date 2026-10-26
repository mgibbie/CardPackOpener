// micasurvivor_expedition_meta_test.mjs — MicaSurvivor DLC D10: the League meta. micasurvivor/js/expedition/meta.js (G.ExpMeta),
// and its seams in core.js (run.start / run.end / the x block v9), items.js (stats, slots, the drop pool), levelups.js (the
// Lab's tools, move slot, fourth option), economy.js (offers, cages), capture.js (Support team, Shiny Charm, Dawn Stone, Master
// Ball), js/ui/modes-ui.js (the "League HQ" button). Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md 2.5, 2.6, 2.14 and the D10 row.
// The REAL server handler (bundled like the dev server, over sqlite) behind a static server, headless Chrome. One browser at a
// time (and it always exits).
//   0. pure (meta.js + save.js + tiers.js in a vm): the Lab's prices (study 2.14's formula), a run's pay x the tier's (x1 / 1.75 /
//      2.5) in POKÉMONEDAS (DLC D11, owner decision #4: the base game's coins, the D10 tables x K.SCALE), every Lab upgrade's
//      effect from a row, the shiny perks, a purchase spends the base save's coins (G.Expedition.wallet) and is refused short,
//      tasks: seeded per day / week, rollover by the date PASSED IN, progress, streak, the reroll; achievements claimed once;
//      the save merge of two devices (Lab levels max, the Archive's latest toggle, the purchase records' union)
//   1. the server: two devices' Expedition saves merge through micasurvivor-exp-save-put (the higher Lab level, the union of
//      bought items / achievements / avatars / purchase records); a stale put takes nothing away; exact keys only. The same
//      item bought on BOTH devices while apart is refunded once, by the second device (reconcile), never twice
//   2. the browser: a run pays Pokémonedas (Normal x1, Hard x1.75, the run-over line) into the BASE save, booked on this
//      device's ledger entry (save.led[device]); the base coins change by exactly the Expedition's earnings and spends;
//      loading the Expedition never writes the base save
//   3. each Lab upgrade in a run (stats, tools, slots, the fourth card, the Max Revive, Support team, research x)
//   4. item unlocks: a locked item never drops; its goal reveals it; Pokémonedas buy it into the pool. The Archive keeps items out
//   5. research: KOs / a cage add to the family; a finished family is an avatar; the card's avatar / frame / title
//   6. boosts and shiny perks in a run: Rare Candy, Lucky Egg, Amulet Coin, Honey, Dawn Stone, Master Ball; the Shiny Charm perk
//   7. sync: the x block v9 `k`, the replay header h.k, a fresh viewer page reads the same effects; a v8 block still loads;
//      a co-op host frame's k.q; the content version is 9
//   8. the panel ("League HQ" on the Classic card): Lab purchase by click, items, Archive, research, tasks, achievements,
//      card; desktop and phone (844 x 390, touch) fit with no sideways scroll; screenshots
//   node overworld/tests/micasurvivor_expedition_meta_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. MICASURVIVOR_ROOT=<dir> serves
//  micasurvivor/ from another tree: how the "fails before D10" count was taken. SHOTS=<dir> saves the screenshots.)
import http from 'http';
import fs from 'fs';
import os from 'os';
import vm from 'vm';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const AROOT = process.env.MAGEPUNK_ASSET_ROOT ? path.resolve(process.env.MAGEPUNK_ASSET_ROOT) : ROOT;
const MROOT = process.env.MICASURVIVOR_ROOT ? path.resolve(process.env.MICASURVIVOR_ROOT) : ROOT;
const MP_SERVER = process.env.MP_SERVER ? path.resolve(process.env.MP_SERVER) : path.join(ROOT, 'server/mp.mjs');
const SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8868;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const T0 = Date.now();
const DAY = 86400000;

// ======================== 0. pure: meta.js (+ save.js, tiers.js) in a vm
function vmMeta(devId) {
	const store = new Map();
	if (devId) store.set('micasurvivorexp_dev.guest', devId);
	const G = {
		I18n: { add() {}, lang: 'es', t: s => s, f: (s, ...v) => { let i = 0; return s.replace(/\{x\}/g, () => v[i++]); } },
		U: { mmss: s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') }, Expedition: { BOARD: 'micasurvivor_expedition' },
		DLC: {}, Modes: { isExp: () => false },
		// (DLC D11: the base save's coins and the wallet, as js/systems/expedition.js has them; commits counted)
		DB: { save: { coins: 0, stats: {} }, commits: 0, commit() { this.commits++; return true; } },
	};
	G.Expedition.wallet = {
		balance: () => G.DB.save.coins || 0,
		earn(n) { n = Math.floor(+n); const s = G.DB.save; if (!(n > 0)) return false; s.coins += n; s.stats.coinsEarned = (s.stats.coinsEarned || 0) + n; G.DB.commit(true); return true; },
		spend(n) { n = Math.floor(+n); const s = G.DB.save; if (!(n > 0) || s.coins < n) return false; s.coins -= n; G.DB.commit(true); return true; }
	};
	const ctx = { G, console, Date, Math, JSON, addEventListener() {}, setTimeout, clearTimeout,
		localStorage: { getItem: k => (store.has(k) ? store.get(k) : null), setItem: (k, v) => store.set(k, String(v)), removeItem: k => store.delete(k) } };
	vm.createContext(ctx);
	for (const f of ['terrain.js', 'save.js', 'tiers.js', 'meta.js']) {
		let src = fs.readFileSync(path.join(MROOT, 'micasurvivor/js/expedition', f), 'utf8');
		if (f === 'terrain.js') src = 'G.DLC = G.DLC || {};\n' + src.match(/G\.DLC\.rng = G\.DLC\.rng \|\| function rng\(seed\) \{[\s\S]*?\n\};/)[0];   // (just the seeded stream)
		vm.runInContext(src, ctx, { filename: f });
	}
	return { G, store };
}
let M0 = null, G0 = null;
try { ({ G: G0 } = vmMeta()); M0 = G0.ExpMeta || null; } catch (e) { console.log('     (meta.js: ' + String(e.message).slice(0, 160) + ')'); }
A(!!M0, 'meta.js loads on its own (G.ExpMeta)');
if (M0) {
	await G0.ExpSave.open();
	const M = M0, S = G0.ExpSave;
	// the Lab: 19 upgrades, study 2.14's price formula round(base x growth^level / 5) x 5 and its fixed prices
	A(M.LAB.length === 19 && M.price('training', 0) === 300 && M.price('training', 1) === Math.round(300 * 1.35 / 5) * 5 && M.price('training', 7) === Math.round(300 * Math.pow(1.35, 7) / 5) * 5 && M.price('training', 8) === Infinity,
		'the Lab: 19 upgrades; Training costs round(300 x 1.35^level / 5) x 5 (300, 405, ... 2,445), max 8', [M.price('training', 0), M.price('training', 1), M.price('training', 7)].join(' '));
	A(JSON.stringify([M.price('vitamins', 0), M.price('vitamins', 1), M.price('moveslot', 0), M.price('option', 0), M.price('revive', 0), M.price('support', 0)]) === '[1200,3000,1500,3000,5000,3500]',
		'study 2.14\'s fixed prices: vitamin slots 1,200 / 3,000, 4th move slot 1,500, fourth option 3,000, Revive 5,000, Support team 3,500');
	// a run's pay x the tier's multiplier, in Pokémonedas (D11: the D10 units x K.SCALE, rounded to 5)
	const p = { kills: 2000, time: 1500, zone: 4, bosses: 4, won: true, catches: 2 };
	const base = Math.round(10 + 2000 / 40 + 25 * 3 + 30 * 4 + 120 + 15 * 2), coins = n => Math.round(n * 3 / 5) * 5;
	const pn = M.payOf(p, 'normal'), ph = M.payOf(p, 'hard'), px = M.payOf(p, 'nightmare');
	A(M.K.SCALE === 3 && pn.base === base && base === 405 && pn.pay === 1215 && ph.pay === coins(base * 1.75) && ph.pay === 2125 && px.pay === 3040 && ph.mul === 1.75 && px.mul === 2.5,
		'a run\'s pay: (10 + KOs / 40 + 25 (zone - 1) + 30 a boss + 120 won + 15 a catch = 405) x the tier\'s (study 2.11) x3 Pokémonedas: 1,215 / 2,125 / 3,040', JSON.stringify([pn, ph, px]));
	A(M.payOf({ ...p, time: 59 }, 'hard').pay === 0 && M.payOf({ kills: 0, time: 60, zone: 1, bosses: 0, won: false, catches: 0 }, 'normal').pay === 30, 'a run under a minute pays nothing (no quit-farming); a minute pays the base 10 x3 = 30');
	// a purchase spends the base save's coins through the wallet (refused short, nothing taken)
	// (DLC D18: Training and the other 8 stat rows are retired: a purchase is refused; Refresh shows the spending)
	G0.DB.save.coins = 1195;
	const poor = M.buyLab('refresh'), c0 = G0.DB.save.coins, ret = M.buyLab('training');
	G0.DB.save.coins = 1200;
	const okL = M.buyLab('refresh');
	A(poor.error === 'poor' && poor.need === 1200 && c0 === 1195 && ret.error === 'retired' && okL.ok && okL.price === 1200 && G0.DB.save.coins === 0 && M.labLv('refresh') === 1 && S.list('cur.spend').includes('lab.refresh.0:' + M.dev()) && M.balance() === 0,
		'the Lab spends Pokémonedas: Refresh Lv 1 costs 400 x3 = 1,200 of the base save\'s coins (1,195 is refused, nothing taken; Training is retired); the purchase is recorded with this device\'s id (cur.spend)', JSON.stringify({ poor, ret, okL, coins: G0.DB.save.coins, spend: S.list('cur.spend') }));
	// every Lab upgrade's effect from a row
	const lv = { training: 8, stamina: 8, agility: 6, study: 5, trading: 5, fortune: 5, magnetism: 4, leftovers: 4, shell: 5, refresh: 4, skip: 4, banish: 5, vitamins: 2, moveslot: 1, option: 1, revive: 1, research: 4, support: 1, archive: 3 };
	for (const [k, n] of Object.entries(lv)) S.best('lab.' + k, n);
	const e = M.effects(M.rowNow([]));
	const st = e.stats, r2 = x => Math.round(x * 1000) / 1000;
	// (DLC D18: the 9 stat rows are retired: the shop's per-Pokémon upgrades do this in both modes now; at max they add nothing)
	A(Object.keys(st).length === 0, 'the 9 stat rows at max (Training ... Shell) add nothing to a run: retired (DLC D18)', JSON.stringify(st));
	A(JSON.stringify(['refresh', 'skip', 'banish', 'vitamins', 'moveslot', 'option', 'revive', 'research', 'support', 'archive'].map(k => e.lab[k])) === '[4,4,5,2,0,1,1,4,1,3]' && M.arcSlots(3) === 9,   // (DLC D16: the move slot is retired: 0 whatever the row says)
		'... and the others: Refresh / Skip / Banish +4 / +4 / +5 (to 6 each), 2 vitamin slots, no move slot (retired, DLC D16), the fourth option, the Max Revive, Research x2, a Support slot, 9 Archive slots', JSON.stringify(e.lab));
	A(M.labCost('training', 8) === [0, 1, 2, 3, 4, 5, 6, 7].reduce((a, i) => a + M.price('training', i), 0), 'the Lab\'s total (Σ the prices of its levels)');
	G0.DB.save.coins = 1000;
	A(M.balance() === 1000, 'the balance is the base save\'s Pokémonedas (1,000)', M.balance());
	// the shiny perks (study 2.14): 2 / 4 / 6 / 10 / 15
	A([0, 1, 2, 3, 4, 5, 6, 9, 10, 14, 15, 99].map(M.perkTier).join() === '0,0,1,1,2,2,3,3,4,4,5,5', 'shiny perks by shinies caught: 2, 4, 6, 10, 15');
	const pe = M.effects(['0', 5, 0, 1]), pe4 = M.effects(['0', 4, 0, 1]), pe5n = M.effects(['0', 5, 0, 0]);
	A(pe.stats.luck === 3 && pe.stats.xp === 0.04 && pe.charm && r2(pe.stats.dmg) === 0.23 && r2(pe4.stats.dmg) === 0.03 && r2(pe5n.stats.dmg) === 0.03,
		'... +3 luck, +4 % XP, the Shiny Charm, +3 % damage, +20 % damage as a shiny member (only when the member is shiny)', JSON.stringify([pe, pe5n.stats]));
	// boosts in the row
	const be = M.effects(['0', 0, 0b111111, 0]);
	A(be.boosts.candy && be.boosts.egg && be.boosts.coin && be.boosts.honey && be.boosts.dawn && be.boosts.master && be.stats.xp === 0.25 && be.stats.coin === 0.5,
		'the 6 boosts in the row\'s mask: Rare Candy, Lucky Egg (+25 % XP), Amulet Coin (+50 % ₽), Honey, Dawn Stone, Master Ball', JSON.stringify(be));
	A(JSON.stringify(M.effects(null)) === JSON.stringify(M.effects([])) && !M.effects(null).stats.dmg, 'no row (a base player, an old block): no effect');
	// tasks: the date is passed in; seeded per period and account
	const d1 = Date.UTC(2026, 9, 22, 10), d1b = Date.UTC(2026, 9, 22, 23, 59), d2 = Date.UTC(2026, 9, 23, 1), w2 = Date.UTC(2026, 9, 26, 1);
	const tA = M.tasksOf('d', d1, 7), tB = M.tasksOf('d', d1b, 7), tC = M.tasksOf('d', d2, 7), tO = M.tasksOf('d', d1, 8);
	A(tA.length === 3 && JSON.stringify(tA.map(t => t.id)) === JSON.stringify(tB.map(t => t.id)) && JSON.stringify(tA.map(t => t.star)) === '[60,100,160]' && new Set(tA.map(t => t.id)).size === 3,
		'daily tasks: 3 a day (60 / 100 / 160 ★), the same all day', JSON.stringify(tA.map(t => [t.id, t.need, t.star])));
	const days = []; for (let i = 0; i < 6; i++) days.push(M.tasksOf('d', d1 + i * DAY, 7).map(t => t.id).join());
	A(new Set(days).size >= 4 && JSON.stringify(tA.map(t => t.id)) === JSON.stringify(M.tasksOf('d', d1, 7).map(t => t.id)), 'a new day draws new tasks (seeded by the day and the account; the same inputs, the same tasks)', JSON.stringify([days, tO.map(t => t.id)]));
	const wA = M.tasksOf('w', d1, 7), wB = M.tasksOf('w', Date.UTC(2026, 9, 25, 23), 7), wC = M.tasksOf('w', w2, 7);
	A(JSON.stringify(wA.map(t => t.star)) === '[300,450,700]' && JSON.stringify(wA.map(t => t.id)) === JSON.stringify(wB.map(t => t.id)) && M.weekOf(w2) === M.weekOf(d1) + 1,
		'weekly tasks: 3 (300 / 450 / 700 ★), the same Monday to Sunday (UTC); Monday 26 Oct is a new week', JSON.stringify([wA.map(t => t.id), wC.map(t => t.id)]));
	// progress, payment, rollover (in the guest save, whose account key is the 'guest' hash)
	const g0 = M.earned();
	const today = M.tasksOf('d', d1);
	const big = { runs: 9, kos: 1e5, mins: 999, zone: 4, wins: 9, guardians: 99, balls: 99, altars: 99, casts: 99, reactions: 9999, alphas: 99, catches: 99, evos: 99, freed: 99, smins: 999, miles: 99 };
	const half = Object.fromEntries(Object.entries(big).map(([k]) => [k, 0]));
	const ti = Math.max(0, today.findIndex(t => t.need >= 2)), t0 = today[ti]; half[t0.m] = Math.max(1, Math.floor(t0.need / 2));
	if (t0.mode === 'max') half[t0.m] = Math.max(1, t0.need - 1);
	M.taskRun(half, d1);
	const mid = M.tasksOf('d', d1)[ti];
	A(mid.have === half[t0.m] && !mid.done && !mid.claimed, 'a run counts toward a task (' + t0.id + ': ' + mid.have + ' / ' + mid.need + ')', JSON.stringify(mid));
	const nxt = M.tasksOf('d', d2)[ti];
	A(nxt.have === 0, 'the next day: progress starts again from 0 (the counter carries its period: a newer one wins the max merge)', JSON.stringify(nxt));
	const lines = M.taskRun(big, d1);
	const after = M.tasksOf('d', d1), wk = M.tasksOf('w', d1);
	const paid = M.earned() - g0;
	A(after.every(t => t.claimed) && wk.every(t => t.claimed) && paid === 3 * (60 + 100 + 160 + 50 + 300 + 450 + 700 + 500) && paid === 6960 && lines.length === 8 && /\+480 Pokémonedas/.test(lines.join(' ')),
		'a big run finishes all 6: (60 + 100 + 160 + the daily bonus 50 x streak 1 + 300 + 450 + 700 + the weekly 500) x3 = 6,960 Pokémonedas', JSON.stringify({ paid, lines }));
	const boostsGot = M.BOOSTS.reduce((a, b) => a + M.boostHave(b.id), 0);
	A(boostsGot === 4, 'the bonuses give boosts: 1 for the 3 dailies, 3 for the 3 weeklies', boostsGot);
	const again = M.taskRun(big, d1b);
	A(!again.length && M.earned() - g0 === paid, 'later the same day: nothing pays twice');
	M.taskRun(big, d2);
	A(M.dailyStreak(M.dayOf(d2)) === 2 && M.earned() - g0 === paid + 3 * (60 + 100 + 160 + 100), 'the next day: new tasks; all 3 done the day after makes a streak of 2 (+300)', M.earned() - g0);
	M.taskRun(big, Date.UTC(2026, 9, 25, 3));
	A(M.dailyStreak(M.dayOf(Date.UTC(2026, 9, 25, 3))) === 1, 'a missed day resets the streak to 1');
	// the reroll: one a period, not a finished task
	const d5 = Date.UTC(2026, 10, 2, 10), r0 = M.tasksOf('d', d5);
	const ok1 = M.reroll('d', 1, d5), r1 = M.tasksOf('d', d5), ok2 = M.reroll('d', 2, d5);
	A(ok1 && !ok2 && r1[1].id !== r0[1].id && r1[0].id === r0[0].id && r1[2].id === r0[2].id && !r1.some((t, i) => i !== 1 && t.id === r1[1].id),
		'the reroll: one task a day gets another template (once a day)', JSON.stringify([r0.map(t => t.id), r1.map(t => t.id)]));
	// achievements: claimed once into the set; their ★ derived from it
	S.best('runs', 12);
	const e0 = M.earned(), b0 = G0.DB.save.coins, c1 = M.checkAch(), c2 = M.checkAch();
	A(c1.some(a => a.id === 'run1') && c1.some(a => a.id === 'run10') && !c2.length && M.earned() - e0 === c1.reduce((a, x) => a + M.coinsOf(x.star), 0) && G0.DB.save.coins - b0 === M.earned() - e0 && S.list('ach').includes('run10'),
		'achievements: "finish 10 runs" and the rest reached are claimed once (the set `ach`) and paid once in Pokémonedas', JSON.stringify(c1.map(a => a.id)));
	A(M.ACH.length >= 30 && M.ACH.every(a => a.star >= 50 && a.star <= 1500), '~30 achievements (' + M.ACH.length + '), 50-1,500 units each (study 2.14), x3 in Pokémonedas');
	// the save merge of two devices: G-counters add, the Lab takes the max, the Archive the latest toggle
	const devA = { v: 1, counters: { 'lab.training': 2, 'arc.lifeorb': 3 }, sets: { 'items.bought': ['scopelens'], ach: ['run1'], 'cur.spend': ['item.scopelens:aaaa11'] } };
	const devB = { v: 1, counters: { 'lab.training': 3, 'arc.lifeorb': 4 }, sets: { 'items.bought': ['scopelens', 'widelens'], ach: ['run1', 'zone2'], 'cur.spend': ['item.scopelens:bbbb22', 'item.widelens:bbbb22'] } };
	const mg = S.merge(devA, devB);
	A(mg.counters['lab.training'] === 3 && mg.counters['arc.lifeorb'] === 4 && JSON.stringify(mg.sets['items.bought']) === '["scopelens","widelens"]' && mg.sets['cur.spend'].length === 3,
		'the merge: the higher Lab level, the Archive\'s later toggle (off), the union of bought items and of the purchase records (who paid what)', JSON.stringify(mg));
}

// ======================== 1. the server (the real handler over sqlite)
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const SQL = [];
const MP_DB = { prepare(sql) { SQL.push(sql); const stmt = sqlite.prepare(sql); const bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return stmt.get(...bound) ?? null; }, async run() { return stmt.run(...bound); }, async all() { return { results: stmt.all(...bound) }; } }; return api; } };
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const put = (k, v) => sqlite.prepare('INSERT OR REPLACE INTO mp_store (key, value, updated_at) VALUES (?, ?, unixepoch())').run(k, JSON.stringify(v));
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-meta-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [MP_SERVER], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.68.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const tokens = {}, states = {};
const reg = async n => { const r = (await raw('register', { username: n, password: 'msurv-meta-pass-1' })).body; tokens[n] = r.token; states[n] = r.state || (await raw('state', {}, r.token)).body.state; };
for (const n of ['alice', 'bob', 'carl']) await reg(n);
A(Object.values(tokens).every(Boolean), 'test accounts registered');
{
	// two devices of bob: each puts its own progress; the server merges (never backwards)
	const i0 = SQL.length;
	const g0 = await raw('micasurvivor-exp-save-get', {}, tokens.bob);
	const a = await raw('micasurvivor-exp-save-put', { save: { v: 1, counters: { 'lab.training': 2, 'lab.support': 1 }, sets: { 'items.bought': ['scopelens'], ach: ['run1'], avatar: ['10'], 'cur.spend': ['item.scopelens:aaaa11'], 'cur.earn': ['ach.run1:aaaa11'] } }, rev: g0.body.rev || 0 }, tokens.bob);
	// device B is stale (rev 0): 409 with the stored save; it merges and retries
	// (device B bought Scope Lens too while apart, and claimed "First steps" too: both devices paid / were paid)
	const B = { v: 1, counters: { 'lab.training': 3 }, sets: { 'items.bought': ['scopelens', 'widelens'], ach: ['run1', 'zone2'], 'cur.spend': ['item.scopelens:bbbb22', 'item.widelens:bbbb22'], 'cur.earn': ['ach.run1:bbbb22', 'ach.zone2:bbbb22'] } };
	const b0 = await raw('micasurvivor-exp-save-put', { save: B, rev: 0 }, tokens.bob);
	const b1 = await raw('micasurvivor-exp-save-put', { save: B, rev: b0.body.rev }, tokens.bob);
	const sv = row('micasurvivorexp:bob');
	A(a.status === 200 && b0.status === 409 && b1.status === 200 && sv && sv.save.counters['lab.training'] === 3 && sv.save.counters['lab.support'] === 1
		&& JSON.stringify(sv.save.sets['items.bought']) === '["scopelens","widelens"]' && JSON.stringify(sv.save.sets.ach) === '["run1","zone2"]' && JSON.stringify(sv.save.sets.avatar) === '["10"]'
		&& sv.save.sets['cur.spend'].length === 3 && sv.save.sets['cur.earn'].length === 3,
		'the server merges two devices: Lab Training 3 (the higher), Support 1, the union of bought items / achievements / avatars / who-paid-what records', JSON.stringify(sv && sv.save));
	const lower = await raw('micasurvivor-exp-save-put', { save: { v: 1, counters: { 'lab.training': 0 }, sets: {} }, rev: sv.rev }, tokens.bob);
	const sv2 = row('micasurvivorexp:bob');
	A(lower.status === 200 && sv2.save.counters['lab.training'] === 3 && sv2.save.sets['items.bought'].length === 2 && sv2.save.sets['cur.spend'].length === 3, 'a put with less (an old device) takes nothing away', JSON.stringify(sv2.save.counters));
	if (M0) {
		// each device reads the merged save: Scope Lens was paid on both and "First steps" paid to both. The second device
		// (by id) undoes its own copy, ONCE (a refund / a claw-back through the wallet); the first device changes nothing.
		const load = async (id, coins) => { const { G: G1 } = vmMeta(id); await G1.ExpSave.open(); Object.assign(G1.ExpSave.data, G1.ExpSave.merge(G1.ExpSave.data, JSON.parse(JSON.stringify(sv2.save)))); G1.DB.save.coins = coins; return G1; };
		const GA = await load('aaaa11', 5000), GB = await load('bbbb22', 5000), MB = GB.ExpMeta;
		const mA = GA.ExpMeta.reconcile(), mB = MB.reconcile(), mB2 = MB.reconcile();
		const want = MB.coinsOf(MB.UNLOCKS.find(u => u.id === 'scopelens').cost) - MB.coinsOf(MB.ACH_BY.run1.star);
		A(mA === 0 && GA.DB.save.coins === 5000 && GA.DB.commits === 0 && mB === want && GB.DB.save.coins === 5000 + want && mB2 === 0 && GB.DB.save.coins === 5000 + want
			&& JSON.stringify(GB.ExpSave.list('cur.fix').sort()) === '["ach.run1:bbbb22","item.scopelens:bbbb22"]',
			'a double payment across devices: the second device refunds its Scope Lens (+900) and gives back its "First steps" (-' + MB.coinsOf(MB.ACH_BY.run1.star) + '), once (cur.fix); the first device and a second reconcile change nothing',
			JSON.stringify({ mA, mB, mB2, a: GA.DB.save.coins, b: GB.DB.save.coins, fix: GB.ExpSave.list('cur.fix') }));
		// and a device that only READS (nothing to undo) never writes the base save
		const GC = await load('cccc33', 5000);
		GC.ExpMeta.reconcile(); GC.ExpMeta.balance();
		A(GC.DB.commits === 0 && GC.DB.save.coins === 5000, 'a third device with nothing to undo: no base-save write (G.DB.commit never called)', GC.DB.commits);
	}
	const q = SQL.slice(i0).filter(s => /^\s*SELECT/i.test(s));
	A(q.length >= 3 && !q.some(s => /LIKE/i.test(s)), 'the Expedition save reads are exact keys (no SELECT ... LIKE)', q.slice(0, 3).join(' | '));
}

// ======================== the browser (the static server proxies /api/mp to the same handler)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let body = ''; for await (const c of req) body += c;
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.69.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); }
		catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data|overworld\/item_icons)\//.test(f) ? AROOT : /^\/micasurvivor\//.test(f) ? MROOT : ROOT;
	fs.readFile(path.join(base, f), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d);
	});
});
const SAVE = name => ({
	v: 3, name, created: 1, updated: 1, coins: 500,
	owned: { 1: { at: 1, from: 'starter' }, 4: { at: 1, from: 'gacha' }, 25: { at: 1, from: 'gacha' } },
	shiny: {}, partner: 1, partnerShiny: false, starter: 1, personality: { trait: 'brave', scores: {} },
	upgrades: {}, ptm: {}, pz: {}, zmis: {}, tickets: { t1: 0, t10: 0 }, pity: {}, legends: {}, arenas: {}, itemsFound: {},
	evoMoves: {}, ach: {}, missions: {}, profile: { favs: [], title: '' }, modes: {}, pupgDone: true, pupg: {}, stats: {},
});
const BEFORE = (o) => {
	const H = window.__t = { frozen: false, pending: null };
	const realRaf = window.requestAnimationFrame.bind(window);
	window.requestAnimationFrame = cb => realRaf(ts => { if (!H.frozen) cb(ts); else H.pending = cb; });
	H.freeze = () => { H.frozen = true; };
	H.thaw = () => { if (!H.frozen) return; H.frozen = false; const cb = H.pending; H.pending = null; if (cb) realRaf(cb); };
	try {
		localStorage.setItem('micasurvivor_dev', 'dmeta10');
		if (!sessionStorage.getItem('seeded')) {
			sessionStorage.setItem('seeded', '1');
			if (o.user) {
				localStorage.setItem('magepunk_mp_token_v1', o.token);
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(o.state));
				localStorage.setItem('micasurvivor_save.mp:' + o.user, JSON.stringify(o.save));
				localStorage.setItem('micasurvivor_migrated.guest', JSON.stringify({ to: o.user, at: 1, choice: 'skip' }));
			} else {
				localStorage.setItem('micasurvivor_accounts', JSON.stringify({ guest: { name: 'Trainer', guest: true, created: 1 } }));
				localStorage.setItem('micasurvivor_session', JSON.stringify('guest'));
				localStorage.setItem('micasurvivor_save.guest', JSON.stringify(o.save));
			}
		}
	} catch (e) { /* the test reports a boot failure */ }
	H.sturdy = () => { const pl = G.Game.player; H.hurts = 0; pl.hurt = function () { H.hurts++; }; return pl; };
	H.step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) G.Game.debugStep(1, dt); };
	H.wipe = () => { for (const e of G.EnemyMgr.all()) { e.remote = true; } G.EnemyMgr.clear(); if (G.ExpCap && G.ExpCap.run) G.ExpCap.run.tg.clear(); };
	H.quiet = () => { if (G.ExpClassic.run) G.ExpClassic.run.acc = -1e6; };
	/** force a win (the legendary down at the shrine) after `t` s of run time, and end the run -> the run.end summary */
	H.win = t => { const S = G.ExpClassic.run; S.won = true; S.zone = 4; S.ph = 4; S.splits[3] = t; G.Game.debugTime(t); G.Game.endRun(false); return window.__sum; };
	/** end a run that isn't won after `t` s */
	H.lose = t => { G.Game.debugTime(t); G.Game.endRun(false); return window.__sum; };
	/** D11: Pokémonedas into the base save through the Expedition's wallet (counted in the tally like any earning) */
	H.fund = n => G.Expedition.wallet.earn(n);
	/** the player's stats as the Lab touches them */
	H.stats = () => { const pl = G.Game.player; const x = pl.xap || {}; return { atk: pl.atkMul / (x.atkMul || 1), atkMul: pl.atkMul, spd: pl.spdMul, xp: pl.xpMul, coin: pl.coinMul, mag: pl.magnet, regen: pl.regenFlat, red: pl.dmgReduce, luck: pl.xluck, maxHp: pl.maxHp, hpFlat: x.hpFlat || 0,
		reroll: pl.rerollBonus, bans: pl.bansLeft, skips: G.ExpLevel.run ? G.ExpLevel.run.skips : null, moves: pl.maxMoves, vit: G.ExpItems.slots(pl), maxrev: (pl.xi || {}).maxrevive || 0, sa: G.ExpCap.slotsMax(), row: pl.xmr }; };
};

await new Promise(r => server.listen(PORT, r));
const errors = [];
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 600000, args: ['--no-sandbox', '--autoplay-policy=no-user-gesture-required', '--mute-audio'] });
	async function bootPage(o, view, ctx0) {
		const ctx = ctx0 || await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(view || { width: 1280, height: 720, deviceScaleFactor: 1 });
		await page.evaluateOnNewDocument(BEFORE, o);
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of (400|404|409|429)/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
		await page.goto(`http://localhost:${PORT}/micasurvivor/`, { waitUntil: 'domcontentloaded' });
		const visible = id => page.evaluate(id => { const el = document.getElementById(id); return !!el && !el.classList.contains('hidden') && el.getClientRects().length > 0; }, id);
		await waitFor(() => page.evaluate(() => typeof G === 'object' && G.Game && document.getElementById('boot').classList.contains('hidden')), 30000);
		if (await visible('tap-start')) await page.click('#tap-start');
		const menu = await waitFor(() => visible('scr-menu'), 15000);
		await page.evaluate(() => { G.Audio.sfx = () => {}; G.Audio.music = () => {}; });
		return { ctx, page, menu, visible };
	}
	const E = async (page, fn, ...args) => { try { return await page.evaluate(fn, ...args); } catch (e) { return { error: String(e && e.message || e).slice(0, 400) }; } };
	const shoot = async (page, name, ms = 450) => {
		if (!SHOTS) return null;
		await page.evaluate(() => window.__t.thaw());
		await sleep(ms);
		fs.mkdirSync(SHOTS, { recursive: true });
		const f = path.join(SHOTS, name);
		await page.screenshot({ path: f });
		await page.evaluate(() => window.__t.freeze());
		console.log('     screenshot: ' + f);
		return f;
	};
	const prep = page => E(page, async () => {
		const ok = await G.Expedition.load().catch(e => String(e));
		if (ok !== true) return { ok: false, err: ok };
		await G.ExpSave.open();
		if (!window.__hooked) { window.__hooked = 1; G.Hooks.on('run.end', (out, sum) => { window.__sum = JSON.parse(JSON.stringify(sum)); window.__out = { lines: out.lines.slice() }; return out; }); }
		// (D11: every Pokémoneda the Expedition moves goes through the wallet: tally them)
		if (!window.__wal) {
			const W = G.Expedition.wallet, e0 = W.earn, s0 = W.spend, r0 = W.refund, T = window.__wal = { earn: 0, spend: 0, refund: 0 };
			W.earn = n => { const ok = e0(n); if (ok) T.earn += Math.floor(n); return ok; };
			W.spend = n => { const ok = s0(n); if (ok) T.spend += Math.floor(n); return ok; };
			// (DLC D16: a retired Lab row's refund, the move slot this test sets at Lv 1 below: coins in, not counted as earned)
			W.refund = n => { const ok = r0(n); if (ok) T.refund += Math.floor(n); return ok; };
		}
		return { ok: true, meta: !!G.ExpMeta, dv: G.Expedition.DV, xv: G.Exp.XV, cdv: G.Exp.dv };
	});
	/** start Classic on the device's pick; freeze the frames; a sturdy player; no foes */
	const startClassic = page => E(page, async () => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		window.__t.thaw();
		if (G.Game.state === 'playing' || G.Game.state === 'levelup' || G.Game.state === 'choice') { G.Game.quit(); await wait(300); }
		if (G.Game.state === 'over') { document.getElementById('btn-again').click(); await wait(300); }
		if (G.UI.isOpen('scr-modes')) G.UI.show('scr-menu', true);
		const ok = await G.Flow.play('exp-classic');
		window.__t.freeze();
		window.__t.sturdy();
		window.__t.wipe();
		window.__t.quiet();
		return { ok, state: G.Game.state, diff: G.Modes.run.diff, dv: G.Modes.run.dv, meta: !!(G.ExpMeta && G.ExpMeta.run) };
	});
	const quit = page => E(page, async () => { window.__t.thaw(); if (G.Game.state !== 'over') G.Game.quit(); await new Promise(r => setTimeout(r, 300)); if (G.UI.isOpen('scr-over')) G.UI.show('scr-menu', true); });
	const overText = page => E(page, async () => { window.__t.thaw(); await new Promise(r => setTimeout(r, 350)); window.__t.freeze(); return (document.getElementById('scr-over') || {}).innerText || ''; });

	const d0 = await bootPage({ user: 'alice', token: tokens.alice, state: states.alice, save: SAVE('alice') });
	const { page } = d0;
	A(d0.menu, 'boots to the menu signed in (alice)');
	const baseCoins0 = await E(page, () => JSON.stringify({ coins: G.DB.save.coins, stats: G.DB.save.stats, ach: G.DB.save.ach }));
	// (D11: the base save as stored, before any Expedition code loads: loading must never write it)
	const rawBase = () => E(page, () => localStorage.getItem('micasurvivor_save.mp:alice'));
	const base0 = await rawBase();
	// the "League HQ" button before the Expedition code loads
	const btn0 = await E(page, async () => { window.__t.thaw(); G.ModesUI.open(); await new Promise(r => setTimeout(r, 200)); const b = document.getElementById('modes-meta-pick'); return { txt: b && b.innerText.trim(), loaded: G.Expedition.loaded }; });
	A(btn0.txt === 'League HQ: Lab, tasks and achievements' && btn0.loaded === false, 'the Classic card has a third button, "League HQ: Lab, tasks and achievements" (before any Expedition code loads)', JSON.stringify(btn0));
	await E(page, () => G.UI.show('scr-menu', true));
	const pr = await prep(page);
	A(pr.ok && pr.meta && pr.dv === 18 && pr.cdv === 18 && pr.xv === 10, 'the Expedition code loads with meta.js; the content version is 18 (D19), the x block v10 (D11)', JSON.stringify(pr));
	if (!pr.ok || !pr.meta) throw new Error('no G.ExpMeta: the rest needs it');
	// loading the Expedition (and its save, and reading the balance) never writes the base save
	const base1 = await rawBase(), led0 = await E(page, () => ({ coins: G.DB.save.coins, dev: JSON.parse(localStorage.getItem('micasurvivor_dev')), led: JSON.parse(JSON.stringify(G.DB.save.led || {})), bal: G.ExpMeta.balance(), wal: Object.assign({}, window.__wal) }));
	A(base1 === base0 && led0.bal === led0.coins, 'loading the Expedition and its save never writes the base save (the stored copy is byte-equal); the League HQ balance is the base save\'s coins', JSON.stringify({ same: base1 === base0, bal: led0.bal, coins: led0.coins }));

	// ======================== 2. a run pays Pokémonedas x the tier's pay, into the base save through this device's ledger
	const rN = await startClassic(page);
	const s0 = await E(page, () => ({ row: G.ExpMeta.row(), pay: G.ExpSave.get('pay.total') }));
	const pN = await E(page, () => {
		const M = G.ExpMeta, dev = JSON.parse(localStorage.getItem('micasurvivor_dev')), ledC = () => ((G.DB.save.led || {})[dev] || {}).c || [0, 0];
		const pay0 = G.ExpSave.get('pay.total'), c0 = G.DB.save.coins, l0 = ledC().slice(), w0 = window.__wal.earn - window.__wal.spend;
		// (what the next commit books to this device that isn't the Expedition's: a base change not folded yet)
		const unb = c0 - Object.values(G.DB.save.led || {}).reduce((a, e) => a + (e.c ? e.c[0] - e.c[1] : 0), 0);
		G.ExpCap.run.n = 2;
		const sum = window.__t.win(1200);
		const l1 = ledC();
		return { sum, lines: window.__out.lines, pay: G.ExpSave.get('pay.total') - pay0, coins: G.DB.save.coins - c0, led: [l1[0] - l0[0] - unb, l1[1] - l0[1]], unb, wal: window.__wal.earn - window.__wal.spend - w0, want: M.payOf(sum.parts, 'normal') };
	});
	const oN = await overText(page);
	A(rN.ok && rN.meta && s0.row && s0.row[0] === '0'.repeat(19), 'Classic starts with the meta row (a fresh save: every Lab level 0)', JSON.stringify(s0));
	A(pN.want && pN.pay === pN.want.pay && pN.want.mul === 1 && pN.pay > 300 && pN.lines.includes('Pokémonedas: +' + pN.pay),
		'a won Normal run pays its Pokémonedas (x1), with a run-over line "Pokémonedas: +N"', JSON.stringify({ pay: pN.pay, want: pN.want, lines: pN.lines }));
	A(pN.coins === pN.wal && pN.coins >= pN.pay && pN.led[0] === pN.coins && pN.led[1] === 0,
		'... into the BASE save: its coins rise by exactly what the wallet paid (the run + its achievements), booked as earned on this device\'s ledger entry (save.led[device].c)', JSON.stringify({ pay: pN.pay, coins: pN.coins, wal: pN.wal, led: pN.led }));
	A(/Pokémonedas: \+\d+/.test(oN) && !/Stardust/.test(oN), 'the run-over screen shows it (no Stardust anywhere)', oN.slice(0, 900));
	await shoot(page, 'meta-desktop-runover.png');
	// Hard (unlocked by the win): x1.75
	await E(page, () => G.ExpTier.setPick('viridian', 'hard'));
	await startClassic(page);
	const pH = await E(page, () => { const pay0 = G.ExpSave.get('pay.total'); G.ExpCap.run.n = 2; const sum = window.__t.win(1200); return { pay: G.ExpSave.get('pay.total') - pay0, want: G.ExpMeta.payOf(sum.parts, 'hard'), base: G.ExpMeta.payOf(sum.parts, 'normal'), lines: window.__out.lines }; });
	A(pH.pay === pH.want.pay && pH.want.mul === 1.75 && pH.pay === Math.round(pH.want.base * 1.75 * 3 / 5) * 5 && pH.lines.some(l => l === 'Pokémonedas: +' + pH.pay + ' (×1.75 Hard)'),
		'a Hard run pays x1.75 (the tier\'s pay): "Pokémonedas: +N (×1.75 Hard)"', JSON.stringify(pH));
	await E(page, () => G.ExpTier.setPick('viridian', 'normal'));
	const ach1 = await E(page, () => ({ ach: G.ExpSave.list('ach'), lines: window.__out.lines }));
	A(ach1.ach.includes('run1') && ach1.ach.includes('win1') && ach1.ach.includes('zone4'), 'achievements from the runs: "First steps", "Map complete", "The shrine" (claimed into the set `ach`)', JSON.stringify(ach1.ach));
	const baseCoins1 = await E(page, () => { const s = G.DB.save, st = Object.assign({}, s.stats); delete st.coinsEarned; return { coins: s.coins, earned: s.stats.coinsEarned || 0, rest: JSON.stringify({ stats: st, ach: s.ach }), wal: window.__wal }; });
	const b0j = JSON.parse(baseCoins0), st0 = Object.assign({}, b0j.stats); delete st0.coinsEarned;
	A(baseCoins1.coins - b0j.coins === baseCoins1.wal.earn + baseCoins1.wal.refund - baseCoins1.wal.spend && baseCoins1.earned - (b0j.stats.coinsEarned || 0) === baseCoins1.wal.earn && baseCoins1.rest === JSON.stringify({ stats: st0, ach: b0j.ach }),
		'the base save\'s coins (and coinsEarned) changed by exactly the Expedition\'s earnings; its other stats and achievements are untouched', JSON.stringify({ before: b0j.coins, after: baseCoins1.coins, wal: baseCoins1.wal }));

	// ======================== 3. each Lab upgrade in a run
	const base = await (async () => { await startClassic(page); return E(page, () => window.__t.stats()); })();
	await quit(page);
	// (the levels set straight into the Expedition save: what each one does, not what it costs)
	await E(page, () => { const S = G.ExpSave, M = G.ExpMeta; for (const [k, n] of Object.entries({ training: 8, stamina: 8, agility: 6, study: 5, trading: 5, fortune: 5, magnetism: 4, leftovers: 4, shell: 5, refresh: 4, skip: 4, banish: 5, vitamins: 2, moveslot: 1, option: 1, revive: 1, research: 4, support: 1 })) S.best('lab.' + k, n); S.commit(); });
	await startClassic(page);
	const lab = await E(page, () => {
		const H = window.__t, st = H.stats(), pl = G.Game.player;
		const cards = G.ExpLevel.offer(pl, 3);
		return { st, cards: cards ? cards.length : 0 };
	});
	const L = lab.st, B = base, near = (a, b, e = 1e-6) => Math.abs(a - b) < e;
	// (DLC D18: the 9 stat rows are retired: the same stats with them at max as without; was "Training 8 +32 %, Stamina 8 +64 HP...")
	A(near(L.atkMul / B.atkMul, 1, 0.002), 'Training 8 (retired): no damage bonus', JSON.stringify([B.atkMul, L.atkMul]));
	A(L.hpFlat - B.hpFlat === 0, 'Stamina 8 (retired): no HP bonus', JSON.stringify([B.maxHp, L.maxHp, B.hpFlat, L.hpFlat]));
	A(near(L.spd / B.spd, 1, 0.002) && near(L.xp / B.xp, 1, 0.002) && near(L.coin / B.coin, 1, 0.002) && near(L.mag / B.mag, 1, 0.002),
		'Agility, Study, Trading, Magnetism (retired): nothing', JSON.stringify([L.spd / B.spd, L.xp / B.xp, L.coin / B.coin, L.mag / B.mag]));
	A(L.luck - B.luck === 0 && near(L.regen - B.regen, 0, 1e-9) && near(L.red - B.red, 0, 1e-9), 'Fortune, Leftovers, Shell (retired): nothing', JSON.stringify([L.luck, B.luck, L.regen, B.regen, L.red, B.red]));
	A(L.reroll - B.reroll === 4 && L.bans - B.bans === 5 && L.skips - B.skips === 4 && L.reroll + 1 === 6 && L.bans === 6 && L.skips === 6,
		'Refresh / Banish / Skip: +4 / +5 / +4, to 6 each (study 2.5: max 6)', JSON.stringify([B.reroll, L.reroll, B.bans, L.bans, B.skips, L.skips]));
	// (DLC D16: 4 move slots in every run, the Lab's +1 retired: was "move slots 6 -> 7")
	A(L.vit === B.vit + 2 && L.moves === 4 && B.moves === 4 && lab.cards === 4, 'vitamin slots 3 -> 5, move slots 4 with or without the (retired) Lab move slot, and a level-up deals 4 cards (the fourth option)', JSON.stringify([B.vit, L.vit, B.moves, L.moves, lab.cards]));
	A(L.maxrev === 1 && B.maxrev === 0 && L.sa === 3 && B.sa === 2, 'Revive: the run starts with a Max Revive; Support team: 3 Support Alpha slots (2 without)', JSON.stringify([L.maxrev, L.sa, B.sa]));
	A(Array.isArray(L.row) && L.row[0] === '8865554454452111410', 'the run\'s row carries the Lab levels (base 36, one an upgrade, in the Lab\'s order)', JSON.stringify(L.row));
	// research x2 at Research 4
	const rs = await E(page, () => {
		const pl = G.Game.player, before = G.ExpSave.get('rs.10');
		const foe = o => Object.assign({ x: pl.x, y: pl.y, r: 10, maxHp: 10, hp: 0, dead: true }, o);
		G.Hooks.call('enemy.ko', foe({ dex: 10, xk: 'alpha' }), pl);   // an alpha Caterpie: 5
		G.Hooks.call('enemy.ko', foe({ dex: 11, xk: '' }), pl);        // a Metapod: 1 (same family)
		G.Hooks.call('enemy.ko', foe({ dex: 12, boss: true }), pl);    // a Butterfree boss: 10
		G.Hooks.call('enemy.ko', foe({ dex: 13, xk: 'elite' }), pl);   // a Weedle elite: 2 (another family)
		const tally = JSON.parse(JSON.stringify(G.ExpMeta.run.rs));
		window.__t.lose(300);
		return { tally, d10: G.ExpSave.get('rs.10') - before, d13: G.ExpSave.get('rs.13'), lines: window.__out.lines };
	});
	A(rs.tally && rs.tally[10] === 16 && rs.tally[13] === 2 && rs.d10 === 32 && rs.d13 === 4 && rs.lines.some(l => /^Research: \+\d+/.test(l)),
		'research: an alpha 5 + a KO 1 + a boss 10 to the Caterpie family, an elite 2 to Weedle\'s; x2 with Research 4 (+25 % a level)', JSON.stringify(rs));

	// ======================== 4. item unlocks and the Archive
	const un = await E(page, () => {
		const M = G.ExpMeta, out = {};
		out.locked = M.locked('scopelens'); out.goal = M.stat('kos');
		out.early = M.buyItem('scopelens');
		return out;
	});
	await startClassic(page);
	const roll0 = await E(page, () => { const I = G.ExpItems, pl = G.Game.player, rng = G.DLC.rng(321), seen = {}; for (let i = 0; i < 4000; i++) { const id = I.rollItem(pl, rng); seen[id] = (seen[id] || 0) + 1; } const offers = new Set(); for (let i = 0; i < 400; i++) for (const id of G.ExpEco.rollOffers(pl, G.DLC.rng(i), 3, 0)) offers.add(id); return { scope: seen.scopelens || 0, lockedSeen: G.ExpMeta.UNLOCKS.filter(u => seen[u.id] || offers.has(u.id)).map(u => u.id), kinds: Object.keys(seen).length, lifeorb: seen.lifeorb || 0 }; });
	await quit(page);
	A(un.locked && un.early && un.early.error === 'goal' && roll0.scope === 0 && !roll0.lockedSeen.length && roll0.kinds > 20,
		'a fresh save: Scope Lens (and the other 24 locked items) never drop or show in an offer; buying before its goal ("Defeat 2,000 Pokémon") is refused', JSON.stringify({ un, roll0 }));
	const un2 = await E(page, () => {
		const M = G.ExpMeta, S = G.ExpSave;
		S.best('kos', 2500);
		const need = M.coinsOf(300);
		if (M.balance() >= need) G.Expedition.wallet.spend(M.balance() - need + 5);   // (5 short)
		const bal0 = M.balance(), poor = M.buyItem('scopelens'), bal0b = M.balance();
		window.__t.fund(1000);
		const bal1 = M.balance(), ok = M.buyItem('scopelens'), twice = M.buyItem('scopelens');
		return { bal0, poor, bal0b, ok, twice, spent: bal1 - M.balance(), bought: S.list('items.bought'), rec: S.list('cur.spend').filter(x => x.startsWith('item.')) };
	});
	A(un2.poor && un2.poor.error === 'poor' && un2.bal0 === un2.bal0b && un2.ok && un2.ok.ok && un2.twice.error === 'have' && un2.spent === 900 && JSON.stringify(un2.bought) === '["scopelens"]' && un2.rec.length === 1 && /^item\.scopelens:/.test(un2.rec[0]),
		'its goal reached, 300 x3 = 900 Pokémonedas buy Scope Lens into the pool (5 short is refused, nothing taken; bought once; `items.bought`, its record in cur.spend)', JSON.stringify(un2));
	// the Archive: Lab level 1 = 3 slots
	const arc = await E(page, () => {
		const M = G.ExpMeta, S = G.ExpSave, out = {};
		out.none = M.toggleArchive('lifeorb', true);
		window.__t.fund(M.coinsOf(2000));
		out.buy = M.buyLab('archive');
		out.locked = M.toggleArchive('widelens', true);
		out.a = ['lifeorb', 'protector', 'quickclaw'].map(id => M.toggleArchive(id, true));
		out.full = M.toggleArchive('leftovers', true);
		out.list = M.archived();
		out.off = M.toggleArchive('protector', false); out.on = M.toggleArchive('leftovers', true); out.list2 = M.archived();
		return out;
	});
	A(arc.none.error === 'full' && arc.buy.ok && arc.locked.error === 'locked' && arc.a.every(r => r.ok && r.on) && arc.full.error === 'full' && arc.off.ok && arc.on.ok && JSON.stringify(arc.list2.sort()) === '["leftovers","lifeorb","quickclaw"]',
		'the Archive: no slots without the Lab; Archive Lv 1 = 3 slots (a 4th is refused; a locked item can\'t be archived); taking one out frees its slot', JSON.stringify(arc));
	await startClassic(page);
	const roll1 = await E(page, () => { const I = G.ExpItems, pl = G.Game.player, rng = G.DLC.rng(321), seen = {}; for (let i = 0; i < 4000; i++) { const id = I.rollItem(pl, rng); seen[id] = (seen[id] || 0) + 1; } return { lifeorb: seen.lifeorb || 0, left: seen.leftovers || 0, scope: seen.scopelens || 0, mus: seen.muscleband || 0 }; });
	await quit(page);
	A(roll1.lifeorb === 0 && roll1.left === 0 && roll1.scope > 0 && roll1.mus > 0 && roll0.lifeorb > 0, 'the next run: the archived Life Orb and Leftovers never drop; the bought Scope Lens does', JSON.stringify({ roll0: roll0.lifeorb, roll1 }));

	// ======================== 5. research -> avatar, frame, title; the card
	const av = await E(page, () => {
		const M = G.ExpMeta, S = G.ExpSave, out = {};
		S.best('rs.16', M.needOf(16) - 3);   // Pidgey's family: 3 short
		return { need: M.needOf(16) };
	});
	await startClassic(page);
	const av2 = await E(page, () => {
		const M = G.ExpMeta, S = G.ExpSave, pl = G.Game.player;
		const foe = o => Object.assign({ x: pl.x, y: pl.y, r: 10, maxHp: 10, hp: 0, dead: true }, o);
		G.Hooks.call('enemy.ko', foe({ dex: 17, xk: '' }), pl); G.Hooks.call('enemy.ko', foe({ dex: 17, xk: 'elite' }), pl);
		window.__t.lose(300);
		return { lines: window.__out.lines, avatars: M.avatars(), leaf: M.frameOpen(M.FRAMES[1]), ach: S.list('ach') };
	});
	A(av2.avatars.includes(16) && av2.lines.includes('New avatar: Pidgey!') && av2.leaf && av2.ach.includes('avatar1'),
		'research: the last 3 points (a Pidgeotto KO + an elite) finish Pidgey\'s family: "New avatar: Pidgey!", the Leaf frame opens, "Researcher" achievement', JSON.stringify(av2));
	const cd = await E(page, () => {
		const M = G.ExpMeta, out = {};
		out.a = M.chooseAvatar(16); out.f = M.chooseFrame('leaf'); out.lockedF = M.chooseFrame('prism'); out.t = M.chooseTitle('Pesadilla andante'); out.t2 = M.chooseTitle('Profesor');
		out.card = M.card(); out.card.frame = out.card.frame.id;
		return out;
	});
	A(cd.a && cd.f && !cd.lockedF && !cd.t && cd.t2 && cd.card.avatar === 16 && cd.card.frame === 'leaf' && cd.card.title === 'Profesor', 'the card: avatar Pidgey, the Leaf frame and the title Professor (Lab 50 levels) chosen; a locked frame (Prism) and title (Walking Nightmare) refused', JSON.stringify(cd));

	// ======================== 6. boosts and shiny perks in a run
	const bo = await E(page, () => {
		const M = G.ExpMeta, out = {};
		out.have0 = M.BOOSTS.map(b => M.boostHave(b.id));
		for (const b of M.BOOSTS) M.giveBoost(b.id, 2);
		out.have = M.BOOSTS.map(b => M.boostHave(b.id));
		out.arm = M.BOOSTS.map(b => M.arm(b.id, true));
		G.ExpSave.best('cap.shiny', 6);   // 6 shinies: +3 luck, +4 % XP, the Shiny Charm
		return out;
	});
	await startClassic(page);
	const bo2 = await E(page, () => {
		const H = window.__t, M = G.ExpMeta, pl = G.Game.player, out = {};
		out.row = M.row(); out.eff = M.effects(out.row); out.left = M.BOOSTS.map(b => M.boostHave(b.id)); out.armed = M.armed();
		out.st = H.stats(); out.lv0 = pl.level;
		H.step(3); out.lv1 = pl.level + (G.Game.state === 'levelup' ? 0 : 0); out.state = G.Game.state;
		// zone 1's plan: the Dawn Stone's shiny, the charm
		G.ExpCap.tick(0, pl);
		const zp = G.ExpCap.run.zplan; out.zp = zp ? { shiny: !!zp.shiny, p: zp.p } : null;
		out.plainP = G.ExpCap.shinyChance(pl.xluck || 0, false);
		// Master Ball: the first shiny encounter faints at once
		const e = G.ExpCap.spawnShiny(0.1, pl); out.shinyHp = e ? e.hp : null;
		const e2 = G.ExpCap.spawnShiny(0.2, pl); out.shiny2Hp = e2 ? e2.hp : null;
		// Honey: an extra alpha in zone 1 at its seeded time (200-300 s in)
		H.wipe();
		const run = G.ExpClassic.run;
		G.Game.debugTime(run.zs + 301); H.quiet();
		M.tick(0, pl);
		out.honey = G.EnemyMgr.all().filter(x => x.xk === 'alpha' && !x.dead).length; out.honeyDone = !!M.run.honey[1];
		return out;
	});
	A(bo.have.every((n, i) => n === Math.min(9, bo.have0[i] + 2)) && bo.arm.every(Boolean) && bo2.left.every((n, i) => n === bo.have[i] - 1) && !bo2.armed.length && bo2.row[2] === 63,
		'boosts: +2 of each; armed, the run spends one of each (mask 63) and disarms them', JSON.stringify([bo, bo2.left, bo2.row]));
	A(bo2.eff.boosts.egg && near(bo2.eff.stats.xp, 0.25 + 0.04, 1e-9) && near(bo2.eff.stats.coin, 0.5, 1e-9) && bo2.eff.stats.luck === 3 && bo2.eff.perk === 3 && bo2.eff.charm && bo2.st.luck >= 3,
		'Lucky Egg +25 % XP, Amulet Coin +50 % ₽ (DLC D18: no Study / Trading on top, retired); 6 shinies: perk tier 3 (+3 luck, +4 % XP, the Shiny Charm)', JSON.stringify(bo2.eff));
	A(bo2.lv1 >= bo2.lv0 + 2, 'Rare Candy: +2 levels at the start of the run', JSON.stringify([bo2.lv0, bo2.lv1, bo2.state]));
	A(bo2.zp && bo2.zp.shiny && bo2.zp.p > bo2.plainP, 'Dawn Stone: zone 1 has a shiny; the Shiny Charm perk raises the chance (x1.5)', JSON.stringify([bo2.zp, bo2.plainP]));
	A(bo2.shinyHp === 1 && bo2.shiny2Hp > 1, 'Master Ball: the run\'s first encounter faints at once (1 HP); the next one doesn\'t', JSON.stringify([bo2.shinyHp, bo2.shiny2Hp]));
	A(bo2.honey >= 1 && bo2.honeyDone, 'Honey: an extra alpha in zone 1 (at its seeded time)', JSON.stringify([bo2.honey, bo2.honeyDone]));

	// ======================== 7. sync: x v9 `k`, the replay header, a fresh viewer, a co-op host frame, an old block
	const sy = await E(page, () => {
		const snap = JSON.parse(JSON.stringify(G.Spectate.snap()));
		const gf = G.Hooks.reduce('net.frame', { k: 'f' }, null).x;
		const h = G.Hooks.reduce('replay.header', { v: 1 });
		const m = { uid: 'bob', name: 'bob', connected: true, pl: G.Game.player };
		const had = Object.getOwnPropertyDescriptor(G.Net, 'uid');
		Object.defineProperty(G.Net, 'uid', { configurable: true, get: () => 'alice' });
		const hf = G.Hooks.reduce('net.frame', { k: 'f' }, m).x;
		if (had) Object.defineProperty(G.Net, 'uid', had); else delete G.Net.uid;
		return { x: snap.x && { xv: snap.x.xv, k: snap.x.k }, dv: snap.dv, gf: gf && gf.k, hf: hf && hf.k, h: h && h.k, row: G.ExpMeta.row(), eff: G.ExpMeta.effects(G.ExpMeta.row()), seed: G.World.seed };
	});
	A(sy.x && sy.x.xv === 10 && sy.x.k && JSON.stringify(sy.x.k.p) === JSON.stringify(sy.row) && sy.dv === 18, 'a live snapshot: dv 14, x v10 with `k` {p: the run\'s row}', JSON.stringify(sy.x));
	A(sy.gf && JSON.stringify(sy.gf.p) === JSON.stringify(sy.row), 'a co-op frame carries the same row (k.p)', JSON.stringify(sy.gf));
	A(Array.isArray(sy.h) && JSON.stringify(sy.h) === JSON.stringify(sy.row), 'the replay header carries the row (h.k)', JSON.stringify(sy.h));
	A(sy.hf && sy.hf.q && JSON.stringify(sy.hf.q.alice) === JSON.stringify(sy.row), 'a co-op host frame carries the host\'s row by uid (k.q.alice)', JSON.stringify(sy.hf));
	await quit(page);
	const d1 = await bootPage({ save: SAVE('viewer') });
	const vw = await E(d1.page, async (x, seed) => {
		const out = { loadedBefore: G.Expedition.loaded };
		await G.Expedition.load();
		const pup = new G.Player(G.DEX_BY[1], {}, false); pup.remote = true;
		G.World.reset(seed);
		G.Exp.applyX(seed, x);
		G.Exp.viewAir({ x, dv: 9 }, pup, null);
		out.row = pup.xmr; out.eff = G.ExpMeta.effects(pup.xmr); out.dmg = G.ExpMeta.statOf(pup, 'dmg'); out.xp = G.ExpMeta.statOf(pup, 'xp');
		const old = { xv: 8, m: 'viridian', z: 1, th: '' };
		const pup2 = new G.Player(G.DEX_BY[1], {}, false); pup2.remote = true;
		G.Exp.viewAir({ x: old, dv: 8 }, pup2, null);
		out.old = { row: pup2.xmr || null, ok: G.Expedition.replayOk(8), notice: G.Expedition.viewNotice('exp-classic', 8), newer: G.Expedition.viewNotice('exp-classic', G.Expedition.DV + 1) };
		return out;
	}, { xv: 9, m: 'viridian', z: 1, th: '', k: sy.x && sy.x.k }, sy.seed);
	A(vw.loadedBefore === false && JSON.stringify(vw.row) === JSON.stringify(sy.row) && JSON.stringify(vw.eff) === JSON.stringify(sy.eff) && near(vw.xp, sy.eff.stats.xp, 1e-9),
		'a fresh viewer page reads the row from the x block and gets the host\'s effects (the same Lab / perk / boost numbers)', JSON.stringify(vw).slice(0, 400));
	A(vw.old && vw.old.row === null && vw.old.ok && !vw.old.notice && vw.old.newer, 'an old dv-8 / x v8 block (no `k`) still loads with no notice: no Lab shown; a newer dv gets one', JSON.stringify(vw.old));
	await d1.ctx.close();

	// ======================== 8. the panel
	await E(page, () => { window.__t.fund(40000); G.ExpMeta.clock = () => Date.UTC(2026, 9, 22, 12); });
	const pn = await E(page, async () => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		window.__t.thaw(); G.ModesUI.open(); await wait(150);
		const btn = document.getElementById('modes-meta-pick'), txt = btn.innerText.trim();
		btn.click(); await wait(400);
		const el = document.getElementById('modes-xmeta'), out = { txt, shown: G.ExpMeta.shown, main: document.getElementById('modes-main').classList.contains('hidden') };
		out.tabs = [...el.querySelectorAll('[data-xtab]')].map(b => b.innerText.trim());
		out.lab = el.querySelectorAll('[data-lab]').length;
		const bal0 = G.ExpMeta.balance();
		const lvA = G.ExpMeta.labLv('archive');
		el.querySelector('[data-buy="archive"]').click(); await wait(100);
		out.bought = { lv: G.ExpMeta.labLv('archive') - lvA, paid: bal0 - G.ExpMeta.balance(), price: G.ExpMeta.price('archive', lvA), bal: document.getElementById('xm-bal').innerText.trim(), coins: G.DB.save.coins };
		out.head = document.querySelector('#modes-xmeta .xm-head').innerText.replace(/\s+/g, ' ');
		out.labBtn = (document.querySelector('[data-buy="training"], [data-buy="stamina"], [data-buy="agility"]') || { innerText: '' }).innerText.trim();
		out.labText = document.querySelector('[data-lab="archive"]').innerText.replace(/\s+/g, ' ');
		out.maxed = document.querySelector('[data-lab="refresh"]').innerText.replace(/\s+/g, ' ');   // (DLC D18: Training is retired: Refresh 4 / 4)
		return out;
	});
	A(pn.txt === 'League HQ: Lab, tasks and achievements' && pn.shown && pn.main && JSON.stringify(pn.tabs) === '["Lab","Items","Archive","Research","Tasks","Achievements","Card"]' && pn.lab === 9,
		'"League HQ: Lab, tasks and achievements" opens the panel: Lab, Items, Archive, Research, Tasks, Achievements, Card; the Lab\'s 9 upgrades (the move slot, D16, and the 9 stat rows, D18, are retired: not listed)', JSON.stringify(pn).slice(0, 400));
	A(pn.bought && pn.bought.lv === 1 && pn.bought.price === 1600 && pn.bought.paid === 4800 && pn.bought.bal === pn.bought.coins.toLocaleString('en') && /Archive Lv 2\/3 · Now: \+6 Archive slots/.test(pn.labText) && /Refresh Lv 4\/4 · Now: \+4 use.*Max/.test(pn.maxed),
		'a click buys Archive Lv 2 (1,600 x3 = 4,800 Pokémonedas off the base save): "Now: +6 Archive slots"; the head shows the base balance; Refresh at 4 / 4 says Max', JSON.stringify(pn.bought) + ' ' + pn.labText + ' | ' + pn.maxed);
	A(!/★|Stardust/.test(pn.head + ' ' + pn.labText) && /Your usual Pokémonedas/.test(pn.head + ' ' + (await E(page, () => document.querySelector('#modes-xmeta .xm-note').innerText))), 'no Stardust (★) left on the panel: "Your usual Pokémonedas: earned by playing ..., never sold."', pn.head);
	await shoot(page, 'meta-desktop-lab.png');
	const tabs = await E(page, async () => {
		const wait = ms => new Promise(r => setTimeout(r, ms)), out = {};
		const go = async t => { document.querySelector('[data-xtab="' + t + '"]').click(); await wait(200); return document.getElementById('xm-body'); };
		let b = await go('items'); out.items = { n: b.querySelectorAll('[data-item]').length, scope: b.querySelector('[data-item="scopelens"]').innerText.replace(/\s+/g, ' '), head: b.querySelector('.xm-note').innerText };
		b = await go('archive'); out.archive = { head: b.querySelector('#xm-arc').innerText, n: b.querySelectorAll('[data-arc]').length, on: [...b.querySelectorAll('.xm-c.done')].map(x => x.dataset.arc) };
		const t0 = b.querySelector('[data-atog="muscleband"]'); t0.click(); await wait(150); out.archive.click = G.ExpMeta.archived().includes('muscleband');
		b = await go('research'); out.research = { n: b.querySelectorAll('[data-fam]').length, head: b.querySelector('.xm-note').innerText, first: b.querySelector('[data-fam]').innerText.replace(/\s+/g, ' ') };
		b = await go('tasks'); out.tasks = { d: b.querySelectorAll('#xm-daily [data-task]').length, w: b.querySelectorAll('#xm-weekly [data-task]').length, boosts: b.querySelectorAll('[data-boost]').length, text: b.innerText.replace(/\s+/g, ' ').slice(0, 600) };
		b = await go('ach'); out.ach = { n: b.querySelectorAll('[data-ach]').length, head: b.querySelector('.xm-note').innerText, done: b.querySelectorAll('.xm-c.done').length };
		b = await go('card'); out.card = { text: b.innerText.replace(/\s+/g, ' ').slice(0, 500), avs: b.querySelectorAll('[data-avatar]').length, frames: b.querySelectorAll('[data-frame]').length };
		return out;
	});
	A(tabs.items && tabs.items.n === 25 && /In the drop pool/.test(tabs.items.scope) && /36 \/ 60 items in the drop pool/.test(tabs.items.head), 'Items: the 25 unlocks with their goals; Scope Lens "In the drop pool"; 36 / 60 in the pool', JSON.stringify(tabs.items));
	A(tabs.archive && /3 \/ 6 slots/.test(tabs.archive.head) && tabs.archive.n === 36 && tabs.archive.click, 'Archive: "3 / 6 slots" over the 36 items in the pool; a click archives Muscle Band', JSON.stringify(tabs.archive));
	A(tabs.research && tabs.research.n === 553 && /Avatars: 1 \/ 553/.test(tabs.research.head) && /Pidgey/.test(tabs.research.first), 'Research: the 553 League families (D19: every family), "Avatars: 1 / 553", Pidgey (finished) first', JSON.stringify(tabs.research));
	A(tabs.tasks && tabs.tasks.d === 3 && tabs.tasks.w === 3 && tabs.tasks.boosts === 6 && /Daily/.test(tabs.tasks.text) && /Weekly/.test(tabs.tasks.text) && /Reset in/.test(tabs.tasks.text), 'Tasks: 3 daily + 3 weekly with "Reset in …", the bonuses, the 6 boosts', tabs.tasks.text);
	A(tabs.ach && tabs.ach.n === 48 && /\d+ \/ 48 achievements/.test(tabs.ach.head) && tabs.ach.done >= 4, 'Achievements: 48 (D10\'s 33 + Survival\'s 5 + League mode\'s 5: D13 + Mega Evolution\'s 3: D14 + the full League\'s 2: D19), the ones you have marked done', JSON.stringify(tabs.ach));
	A(tabs.card && /Your Expedition card/.test(tabs.card.text) && tabs.card.avs === 2 && tabs.card.frames === 10 && /Shiny perks \(6 caught\)/.test(tabs.card.text), 'Card: your avatar / frame / title, 10 frames, the shiny perks (6 caught)', JSON.stringify(tabs.card).slice(0, 400));
	for (const [t, f] of [['lab', 'lab'], ['archive', 'archive'], ['tasks', 'tasks'], ['ach', 'achievements'], ['card', 'card']]) {
		if (t === 'lab') continue;
		await E(page, async t => { document.querySelector('[data-xtab="' + t + '"]').click(); await new Promise(r => setTimeout(r, 200)); }, t);
		await shoot(page, 'meta-desktop-' + f + '.png');
	}
	// a reroll by click (Tasks)
	const rr = await E(page, async () => {
		const wait = ms => new Promise(r => setTimeout(r, ms)), D = Date.UTC(2026, 10, 9, 12);
		G.ExpMeta.clock = () => D;
		document.querySelector('[data-xtab="ach"]').click(); await wait(100);
		document.querySelector('[data-xtab="tasks"]').click(); await wait(150);
		const ids0 = G.ExpMeta.tasksOf('d', D).map(t => t.id);
		const b = document.querySelector('#xm-daily [data-rr]'); if (!b) return { none: true };
		b.click(); await wait(150);
		const ids1 = G.ExpMeta.tasksOf('d', D).map(t => t.id);
		return { ids0, ids1, left: document.querySelectorAll('#xm-daily [data-rr]').length };
	});
	A(rr.ids0 && rr.ids1 && JSON.stringify(rr.ids0) !== JSON.stringify(rr.ids1) && rr.left === 0, 'Tasks: a click rerolls one daily task; no more reroll buttons today', JSON.stringify(rr));
	await E(page, () => { G.ExpMeta.close(); G.UI.show('scr-menu', true); });

	// ======================== the save on the server (the real merge, after all of this)
	await E(page, () => G.ExpSave.flush());
	await waitFor(() => { const r = row('micasurvivorexp:alice'); return r && (r.save.sets.avatar || []).includes('16'); }, 8000);
	const xs = row('micasurvivorexp:alice');
	A(xs && xs.save.counters['pay.total'] > 0 && (xs.save.sets.ach || []).includes('win1') && (xs.save.sets['items.bought'] || []).includes('scopelens') && (xs.save.sets.avatar || []).includes('16') && (xs.save.sets['cur.spend'] || []).some(x => /^item\.scopelens:/.test(x)),
		'alice\'s Expedition save on the server: pay.total, achievements, the bought item and who paid for it (cur.spend), the avatar', JSON.stringify(xs && Object.keys(xs.save.counters).filter(k => /^(st|pay|lab|tk)\./.test(k))));
	A(xs && !Object.keys(xs.save.counters).some(k => /^st\.|^coins$|^bal/.test(k)), 'no balance and no Stardust in the Expedition save (the coins are the base save\'s)');
	// the base save (the account row): the coins the Expedition moved, through the ledger, never more
	await E(page, () => G.DB.commit(true));
	const fin = await E(page, () => ({ coins: G.DB.save.coins, wal: window.__wal, dev: JSON.parse(localStorage.getItem('micasurvivor_dev')), led: G.DB.save.led }));
	const b0c = JSON.parse(baseCoins0).coins;
	await waitFor(() => { const r = row('micasurvivor:alice'); return r && (r.save || r).coins === fin.coins; }, 12000);
	const brow = row('micasurvivor:alice'), bsave = brow && (brow.save || brow);
	const sb0 = JSON.parse(base0 || '{}'), le0 = ((sb0.led || {})[fin.dev] || {}).c || [0, 0], unbooked = b0c - (sb0.coins || 0);   // (a base earning not yet booked when the stored copy was read)
	const ledSum = l => Object.values(l || {}).reduce((a, e) => a + (e.c ? e.c[0] - e.c[1] : 0), 0);
	A(fin.coins - b0c === fin.wal.earn + fin.wal.refund - fin.wal.spend && fin.wal.refund > 4500 && bsave && bsave.coins === fin.coins && ledSum(bsave.led) === fin.coins && bsave.led[fin.dev] && bsave.led[fin.dev].c[0] - le0[0] === fin.wal.earn + fin.wal.refund + unbooked && bsave.led[fin.dev].c[1] - le0[1] === fin.wal.spend,
		'all through the test the base coins moved by exactly the Expedition\'s earnings + refunds - spends (+' + fin.wal.earn + ' + ' + fin.wal.refund + ' (D16 / D18: the retired move slot and stat rows, once) / -' + fin.wal.spend + '), booked on this device\'s ledger entry, and reached the account row (micasurvivor:alice)', JSON.stringify({ b0c, fin: fin.coins, wal: fin.wal, row: bsave && bsave.coins, led: bsave && bsave.led && bsave.led[fin.dev] }));

	// ======================== phone (844 x 390, touch) and desktop: the panel fits
	for (const [tag, view] of [['desktop', null], ['phone', { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
		const d = tag === 'desktop' ? d0 : await bootPage({ user: 'alice', token: tokens.alice, state: states.alice, save: SAVE('alice') }, view);
		if (tag === 'phone') { await prep(d.page); await E(d.page, () => { G.ExpMeta.clock = () => Date.UTC(2026, 9, 22, 12); }); }
		for (const t of ['lab', 'items', 'archive', 'research', 'tasks', 'ach', 'card']) {
			const lay = await E(d.page, async t => {
				const wait = ms => new Promise(r => setTimeout(r, ms));
				window.__t.thaw();
				if (!G.UI.isOpen('scr-modes')) { G.ModesUI.open(); await wait(150); }
				if (!G.ExpMeta.shown) { document.getElementById('modes-meta-pick').click(); await wait(400); }
				document.querySelector('[data-xtab="' + t + '"]').click(); await wait(250);
				const W = innerWidth, Hh = innerHeight, r = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
				const cards = [...document.querySelectorAll('#xm-body .xm-c')].slice(0, 6).map(r);
				const box = document.querySelector('#scr-modes .modes-box');
				return { W, Hh, touch: G.Touch.active, n: document.querySelectorAll('#xm-body .xm-c').length, cards, side: document.documentElement.scrollWidth - W, boxSide: box.scrollWidth - box.clientWidth, back: r(document.getElementById('xm-back')), tabs: [...document.querySelectorAll('[data-xtab]')].map(r) };
			}, t);
			const inW = b => b && b.x >= -1 && b.x + b.w <= lay.W + 1;
			A(lay.cards && (lay.n > 0) && lay.cards.every(inW) && lay.side <= 0 && lay.boxSide <= 1 && inW(lay.back) && lay.back.y >= -1 && lay.back.y + lay.back.h <= lay.Hh && lay.tabs.every(inW) && lay.tabs.every(b => b.y + b.h <= lay.Hh),
				`${tag} (${lay.W}x${lay.Hh}${lay.touch ? ', touch' : ''}): the ${t} tab fits (cards and tabs on screen, Back reachable, no sideways scroll)`, JSON.stringify(lay).slice(0, 500));
			if (tag === 'phone' && ['lab', 'archive', 'tasks', 'ach'].includes(t)) await shoot(d.page, `meta-phone-${t === 'ach' ? 'achievements' : t}.png`);
		}
		if (tag === 'phone') await d.ctx.close();
	}
	await d0.ctx.close();
} catch (e) {
	fail++;
	console.log('FAIL: the test crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
const errs = errors.filter(e => !/favicon|ResizeObserver/.test(e));
A(!errs.length, 'no page errors', errs.slice(0, 5).join('\n'));
console.log(`\n${pass} passed, ${fail} failed (${((Date.now() - T0) / 1000).toFixed(0)} s)`);
process.exit(fail ? 1 : 0);
