// pocketenhanced_tournament_test.mjs — Pocket Enhanced tournaments on the server (owner's second improvement list,
// 2026-11-18, "yes to all": "A 4- or 8-player bracket on the existing online system, with stars and a badge for the
// winner"). server/pocket_pvp.mjs pkpvp-t*, tourTick, tourPay; site/stars.js walletNotes. The real server over sqlite.
//   1. create (a code), join by code, only the host starts, a started or full one refuses a join; leave before the start
//   2. start: the empty seats are computer players, the bracket is drawn; each human's pairing is an ordinary started
//      two-seat match (pkpvp-mine takes them to it); two computer players settle by themselves
//   3. a match that ends moves its winner on; the next round is made; the final places everyone
//   4. the prizes (4 seats: 400 / 150) go into the star wallet once: looking again pays nothing more
//   5. the wallet's notes: star sync and trades used to drop the others' notes (`rk`, now `tp` too); every writer keeps all
//   6. an 8-seat tournament: three rounds, 800 / 300 / 100 for a semi-finalist
//   node overworld/tests/pocketenhanced_tournament_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import * as E from '../../pocketenhanced/js/engine/engine.js';
import * as C from '../../pocketenhanced/js/collection.js';
import { starterDeck } from '../../pocketenhanced/js/decks.js';
import { walletNotes } from '../../site/stars.js';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 600) : '')); } };
const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-tour-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
const PKV = { pv: +fs.readFileSync(path.join(ROOT, 'server/pocket_pvp.mjs'), 'utf8').match(/PKPVP_PROTOCOL = (\d+)/)[1], ev: E.ENGINE_VERSION };
let ipN = 0;
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.4.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...(action.startsWith('pkpvp-') ? PKV : {}), ...body }) }), { MP_DB })).json();
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
const tok = {};
for (const n of ['ann', 'ben', 'cat', 'dan', 'eve', 'fay']) { tok[n] = (await call('register', { username: n, password: 'pocket-tour-pass' })).token; setRow('pkcol:' + n, { rev: 1, col: C.newCollection(), at: 1, ids: [] }); }
const D = starterDeck('charizard');
/** End a pairing's match with this winner (as if it were played to the end), then let the server look. */
const finish = async (lid, winner, who) => { const lb = row('pkpvp:' + lid); const seat = lb.m.config.players.findIndex(p => p.name === winner); lb.m.over = { winner: seat, why: 'test' }; lb.rev = (lb.rev || 0) + 1; setRow('pkpvp:' + lid, lb); return call('pkpvp-sync', { id: lid, n: -1 }, tok[who]); };
const view = async (tid, who) => (await call('pkpvp-tget', { tid }, tok[who])).tour;
const myLid = async (tid, who) => { const t = await view(tid, who); return t && t.mine ? t.mine.lid : null; };

// ===== 1 =====
const made = await call('pkpvp-tcreate', { size: 4, ...D }, tok.ann);
const T = made.tour;
A(!!T && /^[A-Z2-9]{5}$/.test(T.code) && T.state === 'lobby' && T.players.join() === 'ann', 'ann creates a 4-seat tournament with a code', made);
A(!!(await call('pkpvp-tjoin', { code: T.code, ...D }, tok.ben)).tour, 'ben joins with the code');
const notHost = await call('pkpvp-tstart', { tid: T.id }, tok.ben);
A(/only the host/.test(notHost.error || ''), 'only the host starts', notHost);
await call('pkpvp-tjoin', { code: T.code, ...D }, tok.cat);
A((await call('pkpvp-tleave', { tid: T.id }, tok.cat)).ok && (await view(T.id, 'ann')).players.join() === 'ann,ben', 'cat joins and leaves before the start');
// ===== 2 =====
const st = await call('pkpvp-tstart', { tid: T.id }, tok.ann);
const t1 = st.tour;
A(t1 && t1.state === 'running' && t1.cpus.length === 2 && t1.rounds[0].length === 2, 'started: two computer players fill the seats; round 1 has two pairings', st);
A(/started/.test((await call('pkpvp-tjoin', { code: T.code, ...D }, tok.dan)).error || ''), 'a started tournament refuses a join');
const lidA = await myLid(T.id, 'ann'), lidB = await myLid(T.id, 'ben');
const lbA = lidA && row('pkpvp:' + lidA);
A(!!lbA && lbA.m && !lbA.m.over && lbA.tid === T.id && lbA.m.config.players.some(p => p.name === 'ann'), "ann's pairing is a started two-seat match of this tournament", lbA && { tid: lbA.tid, players: lbA.m.config.players.map(p => p.name) });
const mine = await call('pkpvp-mine', {}, tok.ann);
A(mine.lobby && mine.lobby.id === lidA && mine.lobby.started, 'pkpvp-mine takes ann to it (a reload, another device)');
// ===== 3 =====
const r0 = (await view(T.id, 'ann')).rounds[0];
const pairedTogether = r0.some(g => [g.a, g.b].sort().join() === 'ann,ben');
if (pairedTogether) { await finish(lidA, 'ann', 'ann'); }
else { await finish(lidA, 'ann', 'ann'); await finish(lidB, 'ben', 'ben'); }
let t2 = await view(T.id, 'ann');
A(t2.rounds.length === 2 && t2.rounds[1].length === 1 && t2.rounds[1][0].a && t2.rounds[1][0].b && t2.rounds[0].every(g => g.winner), 'round 1 decided: the final is made from its winners', t2.rounds);
const finLid = await myLid(T.id, 'ann');
A(!!finLid && finLid !== lidA, 'ann has a new match: the final');
await call('pkpvp-leave', { id: lidA }, tok.ann);
A(row('pkpvpcur:ann').id === finLid, 'leaving her finished round-1 match afterwards does not forget the final (pkpvp-leave clears only its own match)', row('pkpvpcur:ann'));
await finish(finLid, 'ann', 'ann');
t2 = await view(T.id, 'ann');
const second = t2.rounds[1][0].a === 'ann' ? t2.rounds[1][0].b : t2.rounds[1][0].a;
A(t2.state === 'over' && t2.placed.ann === 1 && t2.placed[second] === 2, 'the final decided: ann first, her opponent second', t2.placed);
// ===== 4 =====
const w1 = row('stars:ann');
A(w1 && w1.e.tour0 === 400 && (w1.tp || []).includes(T.id) && t2.paid === 400, 'the winner: 400 stars into her wallet, noted paid', w1);
await view(T.id, 'ann'); await view(T.id, 'ann');
A(row('stars:ann').e.tour0 === 400, 'looking again pays nothing more');
if (second === 'ben') A((row('stars:ben') || { e: {} }).e.tour0 === 150, 'the runner-up (ben): 150');
else A(!row('stars:ben') || !(row('stars:ben').e || {}).tour0, 'ben, out in round 1 of 4: nothing');
// ===== 5 =====
{
	const before = row('stars:ann'); before.rk = ['2026-10']; setRow('stars:ann', before);
	const s = await call('stars-sync', { wallet: { e: { abcdef01: 5 }, s: {} } }, tok.ann);
	const after = row('stars:ann');
	A(!s.error && after.e.abcdef01 === 5 && (after.tp || []).includes(T.id) && (after.rk || []).includes('2026-10'), 'star sync keeps the notes: tournaments paid (tp) and ranked seasons paid (rk)', after);
	A(JSON.stringify(walletNotes({ th: { x: 1 }, rk: ['a'], tp: ['b'], e: {}, junk: 1 })) === '{"th":{"x":1},"rk":["a"],"tp":["b"]}', 'walletNotes: the three notes, nothing else');
}
// ===== 6. eight seats =====
{
	const e8 = (await call('pkpvp-tcreate', { size: 8, ...D }, tok.eve)).tour;
	await call('pkpvp-tstart', { tid: e8.id }, tok.eve);
	for (let round = 0; round < 3; round++) { const lid = await myLid(e8.id, 'eve'); if (!lid) break; await finish(lid, 'eve', 'eve'); }
	const v = await view(e8.id, 'eve');
	A(v.state === 'over' && v.rounds.length === 3 && v.placed.eve === 1 && Object.values(v.placed).filter(p => p === 3).length === 2, 'eight seats (eve and 7 computer players): three rounds, eve wins, two semi-finalists third', { state: v.state, rounds: v.rounds.length, placed: v.placed });
	A(row('stars:eve').e.tour0 === 800, 'the winner of eight: 800 stars');
}
A(/not in that tournament/.test((await call('pkpvp-tget', { tid: T.id }, tok.fay)).error || ''), 'someone not in it cannot look at it');
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
