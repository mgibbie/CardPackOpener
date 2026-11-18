// pocketenhanced_weekly_test.mjs — the weekend tournament (owner's third improvement list, 2026-11-18, "yes to all": "A
// scheduled weekly tournament. One automatic tournament each weekend using that week's event rule, filled with computer
// players if too few people join. Its winners get a weekly emblem"). server/pocket_pvp.mjs pkpvp-tweekly, tourBegin,
// tourTick; emblems.js 'weekly'. The real server over sqlite, its clock set by the test (globalThis.__msurvClock).
//   1. the week's tournament: one row for the week (the same for everyone who joins), 8 seats, the week's event rule
//      and its match options; a deck that does not keep the rule is refused
//   2. nobody can start it by hand; before Saturday 18:00 UTC a look does not start it
//   3. after that time the first look starts it: computer players in the empty seats, the draw; its matches play by the
//      event's options; a join now is refused
//   4. next week: a new tournament
//   5. the Weekly Champion emblem: earned by a weekly win
//   node overworld/tests/pocketenhanced_weekly_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import * as E from '../../pocketenhanced/js/engine/engine.js';
import * as C from '../../pocketenhanced/js/collection.js';
import * as EV from '../../pocketenhanced/js/events.js';
import { STARTERS, starterDeck } from '../../pocketenhanced/js/decks.js';
import { THEME_DECKS } from '../../pocketenhanced/js/data/theme_decks.js';
import { newEmblems } from '../../pocketenhanced/js/emblems.js';
import * as SO from '../../pocketenhanced/js/solo.js';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); } };
let NOW = 0; globalThis.__msurvClock = () => NOW;
const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-weekly-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
const PKV = { pv: +fs.readFileSync(path.join(ROOT, 'server/pocket_pvp.mjs'), 'utf8').match(/PKPVP_PROTOCOL = (\d+)/)[1], ev: E.ENGINE_VERSION };
let ipN = 0;
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.2.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...(action.startsWith('pkpvp-') ? PKV : {}), ...body }) }), { MP_DB })).json();
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));

// a Sprint week (first to 2 points: an event that changes the match) and the week after
const MON0 = Date.UTC(2026, 10, 16);
let SPRINT = null; for (let n = 0; n < 7 && !SPRINT; n++) { const t = MON0 + n * 7 * 86400000; if (EV.eventOf(t + 3600000).id === 'sprint') SPRINT = t; }
NOW = SPRINT + 2 * 86400000;   // a Wednesday
const tok = {};
for (const n of ['ann', 'ben']) { tok[n] = (await call('register', { username: n, password: 'pocket-weekly-pass' })).token; setRow('pkcol:' + n, { rev: 1, col: C.newCollection(), at: 1, ids: [] }); }
const D = starterDeck('pikachu');
// ===== 1 =====
const a1 = await call('pkpvp-tweekly', D, tok.ann);
const b1 = await call('pkpvp-tweekly', D, tok.ben);
A(a1.tour && b1.tour && a1.tour.id === b1.tour.id && a1.tour.weekly && a1.tour.size === 8 && a1.tour.event === 'sprint' && b1.tour.players.join() === 'ann,ben', "the week's tournament: one for everyone, 8 seats, this week's event (Sprint)", { a: a1.tour, b: b1.error });
A(row('pktour:' + a1.tour.id).opts.points === 2, 'it plays by the event: first to 2 points');
// a week whose rule refuses a deck: Basic Training refuses an evolution
{
	let BASIC = null; for (let n = 0; n < 7 && !BASIC; n++) { const t = MON0 + n * 7 * 86400000; if (EV.eventOf(t + 3600000).id === 'basics') BASIC = t; }
	const keep = NOW; NOW = BASIC + 86400000;
	const evo = [...STARTERS.map(s => starterDeck(s.id)), ...THEME_DECKS.map(t => ({ deck: t.cards, energy: t.energy }))].find(d => EV.eventDeckError(EV.EVENTS.find(e => e.id === 'basics'), d.deck, d.energy) && !C.deckOwnedError(C.newCollection(), d.deck, C.START_DECKS.map(id => starterDeck(id).deck)));
	const r = evo ? await call('pkpvp-tweekly', evo, tok.ann) : { error: 'no deck' };
	A(/does not keep this week's rule/.test(r.error || ''), "a Basic Training week: a deck with an evolution is refused", r);
	NOW = keep;
}
// ===== 2 =====
const tid = a1.tour.id;
A(/starts by itself/.test((await call('pkpvp-tstart', { tid }, tok.ann)).error || ''), 'nobody starts it by hand');
await call('pkpvp-tget', { tid }, tok.ann);
A(row('pktour:' + tid).state === 'lobby', 'Wednesday: a look does not start it');
// ===== 3 =====
NOW = row('pktour:' + tid).startAt + 60_000;
const t3 = (await call('pkpvp-tget', { tid }, tok.ann)).tour;
const r3 = row('pktour:' + tid);
A(t3.state === 'running' && r3.cpus.length === 6 && r3.rounds[0].length === 4, 'Saturday 18:00 UTC: the first look starts it; six computer players fill the seats; four pairings', { state: t3.state, cpus: r3.cpus });
const lid = (t3.mine || {}).lid, lb = lid && row('pkpvp:' + lid);
A(lb && lb.m.config.opts && lb.m.config.opts.points === 2, "ann's match plays by the event (first to 2 points)", lb && lb.m.config.opts);
await call('register', { username: 'cat', password: 'pocket-weekly-pass' }); tok.cat = (await call('login', { username: 'cat', password: 'pocket-weekly-pass' })).token; setRow('pkcol:cat', { rev: 1, col: C.newCollection(), at: 1, ids: [] });
A(/has started/.test((await call('pkpvp-tweekly', D, tok.cat)).error || ''), 'a join after the start is refused');
// ===== 4 =====
NOW = SPRINT + 9 * 86400000;
const nw = await call('pkpvp-tweekly', D, tok.cat);
A(nw.tour && nw.tour.id !== tid && nw.tour.state === 'lobby', 'next week: a new tournament', nw.tour);
// ===== 5 =====
const zero = { won: 0, onlineWon: 0, typeWins: {}, soloCleared: 0, soloTotal: 509, gymsBeaten: 0, gymsTotal: 24, setsDone: 0, unique: 0, opened: 0, rating: 0, weeklyWins: 0 };
A(!newEmblems(SO.newProgress(), zero).includes('weekly') && newEmblems(SO.newProgress(), { ...zero, weeklyWins: 1 }).includes('weekly'), 'a weekly win earns Weekly Champion');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
