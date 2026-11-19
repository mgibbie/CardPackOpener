// bets_server_test.mjs — spectator bets on the server (owner, 2026-11-19: "let spectators make bets": stars, a parimutuel
// pool, no limit, every kind of game). server/bets.mjs through the real handler (server/mp.mjs bundled over node:sqlite).
// alice plays; bob, carol and erin are her friends; dave is not.
//   1. the pool split (pure): uneven stakes, the rounding remainder to the largest winning stake, nobody on the winner
//   2. a solo run (Micatro): only a friend opens a market; the player and a stranger are refused; a stake leaves the wallet
//      once per bet id; a bet is raised, never moved; no more than you hold; the milestone (ante 2) closes it; the
//      reported win pays the winners the whole pool (remainder included) and nothing is made or lost
//   3. settling is exactly once: the result reported again, every look at once, star syncs: paid once
//   4. nobody backed the winner: everyone refunded; the 3-minute clock closes betting; a game silent for 15 minutes and
//      a run the player leaves for a new one refund everything
//   5. a stake half way (taken from the wallet, its market never written) is finished by the bettor's star sync
//   6. a Pocket Enhanced online match: the server's result (not the player's), a player in the match can't bet
//   7. a Micatro Multiplayer match: the referee's result; a draw refunds
//   8. a tournament: a tournament-mate who is not a friend may bet on another match of it, never on who wins the
//      tournament; a friend outside it may; the placings settle it
//   9. the wallet: every writer keeps the bet notes; the tournament prize counter `tour0` now counts in the balance
//   node overworld/tests/bets_server_test.mjs
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-bets-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.5.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB })).json();
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
// the clock the bets read (the tests' injectable clock, server/mp.mjs msurvNow)
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
let bidN = 0; const bid = () => 'bid' + (++bidN).toString().padStart(6, '0');
const pub = (who, bet, extra = {}, game = 'micatro') => call(game === 'micatro' ? 'publish-micatro' : 'publish-' + game, { seq: Date.now() + (++bidN), label: 'x', snapshot: { v: bidN }, bet, ...extra }, tok[who]);
const get = (who, runner = 'alice', game = 'micatro') => call('bet-get', { game, runner }, tok[who]);
const place = (who, id, o, n, b = bid()) => call('bet-place', { id, o, n, bid: b }, tok[who]);

// ===== 1. the pool split =====
{
	let payouts = () => ({ pay: {}, refund: false });
	try { ({ payouts } = await import(pathToFileURL(path.join(ROOT, 'server/bets.mjs')).href)); } catch (e) { A(false, 'server/bets.mjs loads', String(e)); }
	const p = payouts({ bob: { o: 'win', stars: 7 }, carol: { o: 'win', stars: 5 }, erin: { o: 'lose', stars: 3 } }, 'win');
	A(p.pay.bob === 9 && p.pay.carol === 6 && !p.pay.erin && p.pay.bob + p.pay.carol === 15, 'uneven stakes: 7 and 5 on the winner, 3 against: 8.75 and 6.25 round down to 8 and 6, the 1 left goes to the largest stake (bob 9)', p);
	const q = payouts({ bob: { o: 'lose', stars: 4 }, carol: { o: 'lose', stars: 6 } }, 'win');
	A(q.refund && q.pay.bob === 4 && q.pay.carol === 6, 'nobody on the winning outcome: every stake back', q);
	const big = payouts({ a: { o: 'x', stars: 999_999_999 }, b: { o: 'x', stars: 333_333_333 }, c: { o: 'y', stars: 777_777_777 } }, 'x');
	A(big.pay.a + big.pay.b === 999_999_999 + 333_333_333 + 777_777_777, 'big stakes (pool x stake past 2^53): the pool is paid out exactly', big);
	A(payouts({ a: { o: 'x', stars: 5 } }, null).refund, 'no result (a draw, a stopped game): refunds');
}

try {   // (on the old code a missing market throws: counted as one more failure)
// ===== 2. a solo run =====
let pub1 = await pub('alice', { run: 'run-1', prog: 1 });
A(pub1.ok && !pub1.riding, 'alice publishes her Micatro run (ante 1): nothing riding yet', pub1);
const own = await get('alice');
A(Array.isArray(own.markets) && own.markets.length === 0 && !row('betm:s:micatro:alice:run-1'), 'alice looking at her own game opens no market');
const stranger = await get('dave');
A(stranger.markets && stranger.markets.length === 0 && !row('betm:s:micatro:alice:run-1'), 'a stranger (not her friend) opens none either');
const g1 = await get('bob');
const M1 = g1.markets && g1.markets[0];
A(M1 && M1.id === 's:micatro:alice:run-1' && M1.open && M1.can && M1.outcomes.map(o => o.k).join() === 'win,lose' && M1.outcomes[0].label === 'alice wins', "bob (her friend) looks: the run's market opens: alice wins / alice loses", g1);
const selfBet = await place('alice', M1.id, 'lose', 50);
A(/own game/.test(selfBet.error || '') && bal('alice') === 1000, 'alice cannot bet on her own run (not even against herself)', selfBet);
const daveBet = await place('dave', M1.id, 'win', 50);
A(/friends/.test(daveBet.error || '') && bal('dave') === 1000, 'a stranger is refused', daveBet);
const b1 = bid();
const p1 = await place('bob', M1.id, 'win', 5, b1);
A(p1.ok && bal('bob') === 995 && p1.market.pool === 5 && p1.market.mine.n === 5 && W.balance(p1.wallet) === 995, 'bob bets 5 on "alice wins": the stars leave his wallet, the pool holds them', p1);
const p1again = await place('bob', M1.id, 'win', 5, b1);
A(p1again.ok && bal('bob') === 995 && row('betm:' + M1.id).pool === 5, 'the same bet sent again (a retry): taken once');
const moved = await place('bob', M1.id, 'lose', 5);
A(/raise/.test(moved.error || '') && bal('bob') === 995, 'bob cannot move his bet to the other outcome', moved);
const raised = await place('bob', M1.id, 'win', 2);
A(raised.ok && raised.market.mine.n === 7 && bal('bob') === 993, 'bob raises it to 7');
const tooMuch = await place('carol', M1.id, 'win', 1001);
A(/1000 stars/.test(tooMuch.error || '') && bal('carol') === 1000, 'no limit, but not more than you hold', tooMuch);
A((await place('carol', M1.id, 'win', 5)).ok && (await place('erin', M1.id, 'lose', 3)).ok, 'carol bets 5 on alice, erin 3 against');
pub1 = await pub('alice', { run: 'run-1', prog: 1 });
A(pub1.riding === 15 && pub1.bettors === 3, "alice's publish answers: 15 stars riding on her game, three bettors", pub1);
A(total() === T0, 'stars on the table: nothing made or lost (wallets + the open pool)');
await pub('alice', { run: 'run-1', prog: 2 });
const late = await place('erin', M1.id, 'lose', 10);
A(late.error && /closed/.test(late.error) && bal('erin') === 997, 'ante 2 reached: betting has closed, a late bet takes nothing', late);
const shown = (await get('carol')).markets[0];
A(!shown.open && /opening/.test(shown.why), 'the widget shows it closed (past its opening)', shown);
await pub('alice', { run: 'run-1', prog: 9, res: 'win' });
const m1 = row('betm:' + M1.id);
A(m1.end && m1.end.result === 'win' && bal('bob') === 993 + 9 && bal('carol') === 995 + 6 && bal('erin') === 997, 'alice beats ante 8: the pool of 15 goes to bob 9 (7 + the remainder) and carol 6; erin lost her 3', m1 && { end: m1.end, pay: m1.pay });
A(total() === T0, 'after settling: the sum of every wallet is what it was before any bet');

// ===== 3. exactly once =====
await pub('alice', { run: 'run-1', prog: 9, res: 'win' }, { over: true, won: true });
await Promise.all([get('bob'), get('carol'), call('bet-mine', {}, tok.bob), call('stars-sync', { wallet: W.cleanWallet(null) }, tok.bob), call('bet-mine', {}, tok.carol), get('erin')]);
// a settle that died half way: the market fixed, nobody marked paid -> the next look pays only through the wallet notes
{ const m = row('betm:' + M1.id); m.paid = {}; setRow('betm:' + M1.id, m); }
await Promise.all([get('bob'), call('bet-mine', {}, tok.carol), call('bet-mine', {}, tok.bob)]);
A(bal('bob') === 1002 && bal('carol') === 1001 && total() === T0, 'reported again, looked at by everyone at once, and a settle re-run from the start: each paid once');

// ===== 4. refunds and the clock =====
await pub('alice', { run: 'run-2', prog: 1 });
const M2 = (await get('bob')).markets[0];
await place('bob', M2.id, 'lose', 40); await place('carol', M2.id, 'lose', 60);
await pub('alice', { run: 'run-2', prog: 3, res: 'win' });
A(row('betm:' + M2.id).end.result === null && bal('bob') === 1002 && bal('carol') === 1001 && total() === T0, 'nobody backed the winner: bob and carol get their 40 and 60 back');
await pub('alice', { run: 'run-3', prog: 1 });
const M3 = (await get('bob')).markets[0];
skew = 3 * 60_000 + 1000;
const clock = await place('bob', M3.id, 'win', 10);
A(/window/.test(clock.error || '') && bal('bob') === 1002, 'three minutes after the run started (still ante 1): betting has closed', clock);
skew = 0;
await pub('alice', { run: 'run-4', prog: 1 });
const M4 = (await get('carol')).markets[0];
await place('carol', M4.id, 'win', 100);
A(bal('carol') === 901, 'carol bets 100 on run 4');
skew = 16 * 60_000;
await call('stars-sync', { wallet: W.cleanWallet(null) }, tok.carol);
A(row('betm:' + M4.id).end && /stopped/.test(row('betm:' + M4.id).end.why) && bal('carol') === 1001, 'the run went silent for 15 minutes: her star sync refunds it', row('betm:' + M4.id).end);
skew = 0;
await pub('alice', { run: 'run-5', prog: 1 });
const M5 = (await get('erin')).markets[0];
await place('erin', M5.id, 'lose', 20);
await pub('alice', { run: 'run-6', prog: 1 });
A(row('betm:' + M5.id).end && /left/.test(row('betm:' + M5.id).end.why) && bal('erin') === 997, 'alice left run 5 for a new run: erin gets her 20 back', row('betm:' + M5.id).end);
A(total() === T0, 'still nothing made or lost');

// ===== 5. a stake half way =====
{
	const M6 = (await get('bob')).markets[0];
	const w = row('stars:bob'); w.s.wagers0 = (w.s.wagers0 || 0) + 25; w.bq = { halfway01: { m: M6.id, n: 25, o: 'win', at: Date.now() - 60_000 } }; w.rev++; setRow('stars:bob', w);
	A(bal('bob') === 977, 'a request died after taking 25 stars from bob and before writing his bet');
	await call('stars-sync', { wallet: W.cleanWallet(null) }, tok.bob);
	A(row('betm:' + M6.id).stakes.bob && row('betm:' + M6.id).stakes.bob.stars === 25 && !row('stars:bob').bq && total() === T0, 'his next star sync lands it in the (still open) market');
	const w2 = row('stars:bob'); w2.s.wagers0 += 5; w2.bq = { halfway02: { m: M6.id, n: 5, o: 'win', at: Date.now() - 60_000 } }; w2.rev++; setRow('stars:bob', w2);
	await pub('alice', { run: 'run-6', prog: 2 });
	await call('bet-mine', {}, tok.bob);
	A(row('betm:' + M6.id).stakes.bob.stars === 25 && !row('stars:bob').bq && total() === T0, 'one left half way after betting closed is given back, not landed');
	await pub('alice', { run: 'run-6', prog: 2, res: 'lose' });
}

// ===== 6. a Pocket Enhanced online match: the server decides =====
const now = Date.now(), LID = 'aaaaaaaaaaa1';
setRow('pkpvp:' + LID, { id: LID, rev: 1, ts: now, host: 'alice', players: [{ name: 'alice' }, { name: 'bob' }], m: { config: { players: [{ name: 'alice', ai: false }, { name: 'bob', ai: false }] }, actions: [], startAt: now, at: now, over: null } });
await pub('alice', { run: 'pk-x', prog: 1, pk: LID }, {}, 'pocket');
await pub('bob', { run: 'pk-x', prog: 1, pk: LID }, {}, 'pocket');
const MP1 = (await get('carol', 'alice', 'pocket')).markets[0];
A(MP1 && MP1.id === 'p:' + LID + ':' + now && MP1.outcomes.map(o => o.k).join() === 'alice,bob' && MP1.kind === 'pvp', 'a Pocket online match: one outcome per player', MP1);
const inMatch = await place('bob', MP1.id, 'bob', 10);
A(/playing in this match/.test(inMatch.error || ''), 'bob plays in the match: he cannot bet on it (on himself or anyone)', inMatch);
await place('carol', MP1.id, 'alice', 10); await place('erin', MP1.id, 'bob', 20);
await pub('alice', { run: 'pk-x', prog: 2, pk: LID, res: 'win' }, {}, 'pocket');
A(!row('betm:' + MP1.id).end, "alice's page saying she won settles nothing: an online match's result is the server's");
{ const lb = row('pkpvp:' + LID); lb.m.over = { winner: 1, why: 'test' }; setRow('pkpvp:' + LID, lb); }
await get('carol', 'alice', 'pocket');
A(row('betm:' + MP1.id).end.result === 'bob' && bal('erin') === 997 + 10 && total() === T0, "the server's match row says bob won: erin takes the pool of 30", row('betm:' + MP1.id).end);

// ===== 7. Micatro Multiplayer: the referee =====
const MLID = 'bbbbbbbbbbb2';
setRow('mtpvp:' + MLID, { id: MLID, rev: 1, ts: now, m: { n: 1, at: now, players: ['alice', 'bob'], over: null } });
await pub('alice', { run: 'mp-1', prog: 1 }, { pvp: MLID });
const MM = (await get('erin')).markets[0];
A(MM && MM.id === 'm:' + MLID + ':1' && MM.outcomes.map(o => o.k).join() === 'alice,bob', 'a Micatro Multiplayer match: one outcome per player', MM);
A(/playing/.test((await place('bob', MM.id, 'alice', 5)).error || ''), 'bob (in the match) is refused');
await place('erin', MM.id, 'alice', 50); await place('carol', MM.id, 'bob', 50);
{ const lb = row('mtpvp:' + MLID); lb.m.over = { winner: '', draw: true, why: 'lives' }; setRow('mtpvp:' + MLID, lb); }
await get('erin');
A(row('betm:' + MM.id).end.result === null && bal('erin') === 1007 && total() === T0, 'the referee calls a draw: both get their 50 back');

// ===== 8. a tournament =====
const TID = 'ccccccccccc3', TL = 'ddddddddddd4';
setRow('pktour:' + TID, { id: TID, rev: 1, ts: now, startAt: now, state: 'running', players: [{ name: 'alice' }, { name: 'bob' }, { name: 'dave' }], cpus: ['CPU Blue'], rounds: [[{ a: 'alice', b: 'bob', lid: TL, winner: null }, { a: 'dave', b: 'CPU Blue', lid: null, winner: null }]], placed: {}, paid: {} });
setRow('pkpvp:' + TL, { id: TL, rev: 1, ts: now, tid: TID, host: 'alice', players: [{ name: 'alice' }, { name: 'bob' }], m: { config: { players: [{ name: 'alice', ai: false }, { name: 'bob', ai: false }] }, actions: [], startAt: now + 1, at: now, over: null } });
await pub('alice', { run: 'pk-t', prog: 1, pk: TL }, {}, 'pocket');
const daveSees = (await get('dave', 'alice', 'pocket')).markets;
const daveMatch = daveSees.find(m => m.kind === 'pvp'), daveTour = daveSees.find(m => m.kind === 'tour');
A(daveMatch && daveMatch.can && (!daveTour || !daveTour.can), 'dave (in the tournament, not her friend) may bet on the alice-bob match of it, not on who wins it', daveSees);
A((await place('dave', daveMatch.id, 'bob', 30)).ok, 'dave bets 30 on bob in that match');
const carolSees = (await get('carol', 'alice', 'pocket')).markets, TM = carolSees.find(m => m.kind === 'tour');
A(TM && TM.id === 't:' + TID && TM.can && TM.outcomes.map(o => o.k).join() === 'alice,bob,dave,CPU Blue' && TM.outcomes[0].label === 'alice wins the tournament', 'carol (her friend, not in it) sees "who wins the tournament": every seat, computer players too', carolSees);
A(/playing in this tournament/.test((await place('alice', TM.id, 'alice', 5)).error || '') && /playing in this tournament/.test((await place('dave', TM.id, 'dave', 5)).error || ''), 'a player of the tournament cannot bet on who wins it');
await place('carol', TM.id, 'bob', 100); await place('erin', TM.id, 'alice', 100);
{ const t = row('pktour:' + TID); t.state = 'over'; t.placed = { bob: 1, alice: 2 }; setRow('pktour:' + TID, t); }
{ const lb = row('pkpvp:' + TL); lb.m.over = { winner: 1, why: 'test' }; setRow('pkpvp:' + TL, lb); }
await get('carol', 'alice', 'pocket');
A(row('betm:' + TM.id).end.result === 'bob' && row('betm:' + daveMatch.id).end.result === 'bob' && total() === T0, 'bob wins the match and the tournament: both settle, nothing made or lost', [row('betm:' + TM.id).end, row('betm:' + daveMatch.id).end]);

// ===== 8b. PokéChess: move 6 closes betting, a stalemate gives every stake back =====
await pub('alice', { run: 'c1', prog: 1 }, {}, 'pokechess');
const MC = (await get('bob', 'alice', 'pokechess')).markets[0];
A(MC && MC.id === 's:pokechess:alice:c1' && MC.open, 'a PokéChess game against the AI has its market', MC);
await place('bob', MC.id, 'win', 50);
await pub('alice', { run: 'c1', prog: 6 }, {}, 'pokechess');
A(/closed/.test((await place('carol', MC.id, 'lose', 5)).error || ''), 'move 6: betting has closed');
await pub('alice', { run: 'c1', prog: 30, res: 'draw' }, { over: true }, 'pokechess');
A(row('betm:' + MC.id).end && row('betm:' + MC.id).end.result === null && total() === T0, 'a stalemate: bob gets his 50 back', row('betm:' + MC.id).end);

// ===== 9. the wallet =====
{
	const before = row('stars:bob');
	await call('stars-sync', { wallet: { e: { phonebob01: 1 }, s: {} } }, tok.bob);
	const after = row('stars:bob');
	A(JSON.stringify(after.bw) === JSON.stringify(before.bw) && after.bw.length > 0, "a star sync keeps the wallet's bet notes (bw: markets paid)", { before: before.bw, after: after.bw });
	A(W.balance({ e: { tour0: 400 }, s: {} }) === 400 && W.cleanWallet({ e: { tour0: 400, ab: 9 } }).e.tour0 === 400, "the tournament prize counter `tour0` counts in the balance (it was dropped: names had to be 6+ letters)");
	A(JSON.stringify(W.walletNotes({ th: 1, rk: 2, tp: 3, bq: 4, bw: 5, junk: 6 })) === '{"th":1,"rk":2,"tp":3,"bq":4,"bw":5}', 'walletNotes keeps the bet notes too (every other writer of the row keeps them)');
}
A(total() === T0 + 1, 'at the end: every wallet adds up to what it started with (plus the 1 star bob earned on his phone)', { T0, now: total() });

} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
