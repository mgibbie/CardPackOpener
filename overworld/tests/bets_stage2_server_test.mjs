// bets_stage2_server_test.mjs — spectator bets, stage 2 (owner, 2026-11-19: stars, a parimutuel pool, no limit, every kind of
// game; never on your own game, never a participant, friends only): Battlecards and MicaSurvivor through the real handler
// (server/mp.mjs bundled over node:sqlite). alice plays; bob, carol and erin are her friends; dave is not.
//   1. a Battlecards RUN (Dungeon): its market is the whole run; a fight's end settles nothing; the first fight decided closes
//      betting; the run's reported win pays; a concede / a lost run pays the other side; strangers and alice refused
//   2. a Battlecards single fight (Quick Match): turn 3 closes it; its reported loss settles it
//   3. a Battlecards live DUEL: one outcome per seat; bob (playing) refused; a page saying "I won" settles nothing; the
//      server's own call (alice leaves the match: the row hands bob the win) settles it; a free-for-all with a computer seat
//   4. a Battlecards MAIL duel: the match row's move count closes it, the server's resign settles it
//   5. a MicaSurvivor run: 75 s closes it; the beacon's reported result settles it; a run that ends without one ("over")
//      is "falls first"; a co-op party is ONE market (the host's run), a party member (dave) refused, found from the guest too
//   6. nothing made or lost: every wallet plus the open pools is the same throughout
//   node overworld/tests/bets_stage2_server_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import * as W from '../../site/stars.js';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const sqlite = new DatabaseSync(':memory:'); sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-bets2-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.6.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB })).json();
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
let skew = 0; globalThis.__msurvClock = () => Date.now() + skew;

const NAMES = ['alice', 'bob', 'carol', 'erin', 'dave'];
const tok = {};
for (const n of NAMES) tok[n] = (await call('register', { username: n, password: 'bets-test-pass' })).token;
for (const n of ['bob', 'carol', 'erin']) await call('add-friend', { username: 'alice' }, tok[n]);
for (const n of NAMES) setRow('stars:' + n, { rev: 1, e: { ['seed' + n]: 1000 }, s: {}, at: 1 });
const bal = n => W.balance(row('stars:' + n));
const openPools = () => sqlite.prepare("SELECT value FROM mp_store WHERE key LIKE 'betm:%'").all().map(r => JSON.parse(r.value)).filter(m => !m.end).reduce((a, m) => a + (m.pool || 0), 0);
const total = () => NAMES.reduce((a, n) => a + bal(n), 0) + openPools();
const T0 = total();
let bidN = 0; const bid = () => 'bidb' + (++bidN).toString().padStart(6, '0');
const card = (who, mode, bet, extra = {}) => call('publish-cardstate', { snapshot: { v: ++bidN }, mode, label: 'x', seq: bidN, bet, ...extra }, tok[who]);
const get = (who, runner = 'alice', game = 'cards') => call('bet-get', { game, runner }, tok[who]);
const place = (who, id, o, n) => call('bet-place', { id, o, n, bid: bid() }, tok[who]);

try {   // (on the old code the games are unknown to the bets: the first market is missing and this throws, counted as a failure)
// ===== 1. a Battlecards run =====
let r = await card('alice', 'dungeon', { run: 'rdun1', prog: 0 });
A(r.ok && !r.riding, 'alice starts a Dungeon run and publishes its first fight');
const own = await get('alice');
A(Array.isArray(own.markets) && own.markets.length === 0, 'alice looking at her own run opens no market', own);
A((await get('dave')).markets?.length === 0, 'a stranger opens none');
const g1 = await get('bob'), R1 = g1.markets && g1.markets[0];
A(R1 && R1.id === 's:cards:alice:rdun1' && R1.open && R1.outcomes.map(o => o.label).join() === 'alice wins the run,alice loses the run', 'bob (her friend) sees the run\'s market: wins the run / loses the run', g1);
A(/own game/.test((await place('alice', R1.id, 'lose', 5)).error || ''), 'alice cannot bet on her own run');
A(/friends/.test((await place('dave', R1.id, 'win', 5)).error || ''), 'a stranger is refused');
A((await place('bob', R1.id, 'win', 10)).ok && (await place('carol', R1.id, 'lose', 6)).ok, 'bob bets 10 on the run, carol 6 against');
r = await card('alice', 'dungeon', { run: 'rdun1', prog: 0 }, { over: true, winner: 0 });
A(r.riding === 16 && !row('betm:' + R1.id).end, 'the first FIGHT ends (its board says over): the run\'s market is not settled, 16 ★ riding', { r, end: row('betm:' + R1.id).end });
await card('alice', 'dungeon', { run: 'rdun1', prog: 1 });
A(/opening/.test((await place('erin', R1.id, 'win', 5)).error || '') && bal('erin') === 1000, 'the first fight decided: betting has closed');
await card('alice', 'dungeon', { run: 'rdun1', prog: 8, res: 'win' }, { over: true, winner: 0 });
A(row('betm:' + R1.id).end?.result === 'win' && bal('bob') === 1006 && bal('carol') === 994 && total() === T0, 'the run is cleared (its reported win): bob takes the pool of 16', row('betm:' + R1.id).end);
// a conceded run: the page reports a loss
await card('alice', 'heist', { run: 'rhei2', prog: 0 });
const R2 = (await get('erin')).markets[0];
await place('erin', R2.id, 'lose', 30); await place('bob', R2.id, 'win', 10);
await card('alice', 'heist', { run: 'rhei2', prog: 0, res: 'lose' }, { over: true });
A(row('betm:' + R2.id).end?.result === 'lose' && bal('erin') === 1010 && total() === T0, 'alice concedes her Heist: erin (against) takes 40');

// ===== 2. a single fight =====
await card('alice', 'battle', { run: 'qm1', prog: 1 });
const Q = (await get('carol')).markets[0];
A(Q && Q.outcomes[0].label === 'alice wins', 'a Quick Match: alice wins / alice loses', Q);
await place('carol', Q.id, 'win', 20); await place('bob', Q.id, 'lose', 20);
await card('alice', 'battle', { run: 'qm1', prog: 3 });
A(/opening/.test((await place('erin', Q.id, 'win', 5)).error || ''), 'turn 3: betting has closed');
await card('alice', 'battle', { run: 'qm1', prog: 9, res: 'lose' }, { over: true, winner: 1 });
A(row('betm:' + Q.id).end?.result === 'lose' && bal('bob') === 1016 && total() === T0, 'alice loses the fight: bob takes 40');

// ===== 3. a live duel, and a free-for-all =====
const DID = 'ABCDEFGHJKLM', now = Date.now();
setRow('cardmatch:' + DID, { id: DID, type: 'card', host: 'alice', guest: 'bob', over: false, winner: null, createdAt: now, lastActive: now });
r = await call('card-publish', { id: DID, snapshot: { v: 1 }, seq: 1, label: 'alice vs bob', bet: { run: DID, prog: 1 } }, tok.alice);
A(r.ok, 'alice (the host) publishes the duel', r);
const D = (await get('carol')).markets[0];
A(D && D.id === 'c:' + DID && D.kind === 'pvp' && D.outcomes.map(o => o.k).join() === 'alice,bob', 'a duel: one outcome per seat (alice, bob)', D);
A(/playing in this match/.test((await place('bob', D.id, 'bob', 10)).error || ''), 'bob plays in the duel: refused');
A(/playing in this match/.test((await place('alice', D.id, 'alice', 10)).error || ''), 'alice too');
await place('carol', D.id, 'alice', 20); await place('erin', D.id, 'bob', 10);
await card('bob', 'pvp', { run: DID, cm: DID, prog: 2, res: 'win' });
A(!row('betm:' + D.id).end, "bob's page (the guest) saying he won settles nothing: the match row decides");
await card('bob', 'pvp', { run: DID, cm: DID, prog: 3 });
A(/opening/.test((await place('erin', D.id, 'bob', 5)).error || ''), "turn 3 (on the guest's page): betting has closed");
await call('leave-match', { id: DID, type: 'card' }, tok.alice);
await get('carol');
A(row('betm:' + D.id).end?.result === 'bob' && bal('erin') === 1030 && total() === T0, 'alice leaves the duel: the server hands bob the win, erin takes the pool of 30', row('betm:' + D.id).end);
const FID = 'MLKJHGFEDCBA';
setRow('cardmatch:' + FID, { id: FID, type: 'card', size: 3, host: 'alice', humans: ['alice', 'dave'], seats: [{ seat: 0, name: 'alice' }, { seat: 1, name: 'dave' }, { seat: 2, name: null, ai: true, aiName: 'Botty' }], over: false, winner: null, createdAt: now });
await call('card-publish', { id: FID, snapshot: { v: 2 }, seq: 2, label: 'ffa', bet: { run: FID, prog: 1 } }, tok.alice);
const F = (await get('bob')).markets[0];
A(F && F.outcomes.map(o => o.k).join() === 'alice,dave,ai2' && F.outcomes[2].label === 'Botty wins', 'a free-for-all: every seat, the computer one too', F);
await place('bob', F.id, 'ai2', 10); await place('carol', F.id, 'alice', 10);
await call('card-publish', { id: FID, snapshot: { v: 3 }, seq: 3, label: 'ffa', over: true, winner: 2, bet: { run: FID, prog: 9 } }, tok.alice);
A(row('betm:' + F.id).end?.result === 'ai2' && total() === T0, 'the computer seat wins: bob takes 20', row('betm:' + F.id).end);

// ===== 4. a mail duel =====
const MID = 'QWERTYUPASDF';
setRow('amatch:' + MID, { id: MID, players: ['alice', 'bob'], game: 'cards', status: 'active', turn: 'alice', turnNumber: 1, winner: null, createdAt: now - 3 * 86400_000, updatedAt: now, lines: [] });
await card('alice', 'async', { run: MID, am: MID, prog: 5 });
const M = (await get('erin')).markets[0];
A(M && M.id === 'a:' + MID && M.open && M.outcomes.map(o => o.k).join() === 'alice,bob', 'a mail duel started three days ago, at its first move: open (a week to bet, until the 4th move)', M);
A(/playing/.test((await place('bob', M.id, 'alice', 5)).error || ''), 'bob (playing) is refused');
await place('erin', M.id, 'alice', 50); await place('carol', M.id, 'bob', 25);
{ const am = row('amatch:' + MID); am.turnNumber = 4; setRow('amatch:' + MID, am); }
A(/opening/.test((await place('bob', M.id, 'x', 5)).error || '') || /closed/.test((await place('carol', M.id, 'bob', 5)).error || ''), 'the 4th move: betting has closed');
await call('async-resign', { id: MID }, tok.bob);
await call('bet-mine', {}, tok.erin);
A(row('betm:' + M.id).end?.result === 'alice' && total() === T0, 'bob resigns (the server\'s match row): erin takes 75', row('betm:' + M.id).end);

// ===== 5. MicaSurvivor =====
const ms = (who, body) => call('publish-micasurvivor', { label: 'x', dex: 25, group: [], ...body }, tok[who]);
r = await ms('alice', { run: 'aaaa0001', mode: 'normal', bet: { run: 'aaaa0001' } });
const S = (await get('bob', 'alice', 'micasurvivor')).markets?.[0];
A(S && S.id === 's:micasurvivor:alice:aaaa0001' && S.outcomes.map(o => o.label).join() === 'alice survives 10 minutes,alice falls first' && S.closesAt - S.now <= 75_000, 'a MicaSurvivor run: survives 10 minutes / falls first, 75 seconds to bet', S);
await place('bob', S.id, 'win', 30); await place('carol', S.id, 'lose', 10);
r = await ms('alice', { run: 'aaaa0001', mode: 'normal', bet: { run: 'aaaa0001' } });
A(r.riding === 40, 'her check-in answers: 40 ★ riding', r);
skew = 76_000;
A(/window/.test((await place('erin', S.id, 'win', 5)).error || ''), '76 seconds in: betting has closed');
await ms('alice', { run: 'aaaa0001', mode: 'normal', bet: { run: 'aaaa0001', res: 'win' } });
A(row('betm:' + S.id).end?.result === 'win' && total() === T0, 'ten minutes reached (the reported win): bob takes 40', row('betm:' + S.id).end);
skew = 0;
await ms('alice', { run: 'aaaa0002', mode: 'tower', bet: { run: 'aaaa0002' } });
const S2 = (await get('carol', 'alice', 'micasurvivor')).markets[0];
A(S2.outcomes[0].label === 'alice wins the Tower', 'the Tower is bet on its own win', S2);
await place('carol', S2.id, 'win', 15); await place('erin', S2.id, 'lose', 5);
await ms('alice', { run: 'aaaa0002', mode: 'tower', over: true });   // (the tab closed: an "over" with no result)
A(row('betm:' + S2.id).end?.result === 'lose' && total() === T0, 'the run ends with no win reported: "falls first", erin takes 20', row('betm:' + S2.id).end);
// a co-op party: alice hosts, dave (not anyone's friend here) is her guest
await ms('alice', { run: 'aaaa0003', mode: 'coop', group: ['alice', 'dave'], bet: { run: 'aaaa0003' } });
await ms('dave', { run: 'dddd0003', mode: 'coop', group: ['alice', 'dave'], bet: { run: 'dddd0003', host: 'alice' } });
const P = (await get('bob', 'alice', 'micasurvivor')).markets[0];
A(P && P.id === 's:micasurvivor:alice:aaaa0003' && P.players.join() === 'alice,dave', "a party's run is one market on the host's run, both players in it", P);
A(/own game/.test((await place('dave', P.id, 'lose', 5)).error || ''), 'dave (in the party) is refused');
const viaGuest = (await get('erin', 'dave', 'micasurvivor')).markets?.[0];
A(viaGuest && viaGuest.id === P.id, "erin (alice's friend) watching the guest finds the same market", viaGuest);
await place('bob', P.id, 'lose', 12); await place('erin', P.id, 'win', 12);
const dv = await ms('dave', { run: 'dddd0003', mode: 'coop', group: ['alice', 'dave'], over: true, bet: { run: 'dddd0003', host: 'alice', res: 'win' } });
A(!row('betm:' + P.id).end && dv.riding === 24, "the guest's own page ending settles nothing (it shows the 24 riding)", { end: row('betm:' + P.id).end, dv });
await ms('alice', { run: 'aaaa0003', mode: 'coop', group: ['alice', 'dave'], over: true, bet: { run: 'aaaa0003' } });
A(row('betm:' + P.id).end?.result === 'lose' && total() === T0, "the host's run falls: bob takes 24", row('betm:' + P.id).end);
A(total() === T0, 'at the end: every wallet adds up to what it started with');
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
