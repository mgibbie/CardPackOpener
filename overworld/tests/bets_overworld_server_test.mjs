// bets_overworld_server_test.mjs — spectator bets, stage 3: the OVERWORLD (owner, 2026-11-19: stars, a parimutuel pool, no
// limit, every kind of game; never on your own game, never a participant, friends only), through the real handler
// (server/mp.mjs bundled over node:sqlite). alice plays; bob, carol and erin are her friends; dave is not.
//   1. a WILD battle on her broadcast (publish-factory): bob watching opens its market ("alice wins" / "alice loses", 45 s);
//      alice and a stranger refused; turn 2 closes it; her page's reported win (a catch counts) settles it
//   2. a TRAINER battle lost; a Gym Leader's (boss) battle is the same market
//   3. an ESCAPE (res 'void') gives every stake back; the 45 s clock closes betting; a battle first heard of 50 s in opens no market
//   4. nobody watching and nobody betting: a battle's report writes nothing (the row is written for watchers / live markets)
//   5. a Battle Frontier run: ONE market on the run ("wins 7 in a row"), closed once the first bout is decided, the 7th
//      win reported mid-run settles it; a Dome run (fixed rounds) is "clears every round" and is lost when knocked out
//   6. Voltorb Flip and a Contest on the live-follow check (publish-world): "clears the level" / "flips a Voltorb",
//      the 2nd flip closes it; a Contest lost
//   7. a LIVE battle between friends (challenge / accept-challenge / match-action): one outcome per player, both players
//      refused, the server's turn closes it, alice forfeits on the server and the MATCH ROW settles it (her page says
//      nothing); her match poll answers what rides on it
//   8. a MAIL battle (async-create / async-accept, game 'pokemon'): one outcome per player, its battle's turn 2 closes
//      it, async-resign settles it
//   9. nothing made or lost: every wallet plus the open pools is the same throughout
//   node overworld/tests/bets_overworld_server_test.mjs
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
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-bets3-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => (await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB })).json();
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, 1) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v));
const delRow = k => sqlite.prepare('DELETE FROM mp_store WHERE key = ?').run(k);
let skew = 0; globalThis.__msurvClock = () => Date.now() + skew;

const NAMES = ['alice', 'bob', 'carol', 'erin', 'dave'];
const tok = {};
for (const n of NAMES) tok[n] = (await call('register', { username: n, password: 'bets-test-pass' })).token;
for (const n of ['bob', 'carol', 'erin']) await call('add-friend', { username: 'alice' }, tok[n]);
await call('add-friend', { username: 'bob' }, tok.carol);   // (carol is a friend of both players of the live battle)
for (const n of NAMES) setRow('stars:' + n, { rev: 1, e: { ['seed' + n]: 1000 }, s: {}, at: 1 });
const bal = n => W.balance(row('stars:' + n));
const openPools = () => sqlite.prepare("SELECT value FROM mp_store WHERE key LIKE 'betm:%'").all().map(r => JSON.parse(r.value)).filter(m => !m.end).reduce((a, m) => a + (m.pool || 0), 0);
const total = () => NAMES.reduce((a, n) => a + bal(n), 0) + openPools();
const T0 = total();
let bidN = 0; const bid = () => 'bidow' + (++bidN).toString().padStart(6, '0');
let seqN = 0;
// alice's battle broadcast (ow_frontier.js frontierPublish), with its bet report (ow_bets.js)
const cast = (bet, extra = {}) => call('publish-factory', { snapshot: { kind: 'battle', facility: 'Wild ZIGZAGOON', v: ++seqN }, label: 'Wild ZIGZAGOON', seq: seqN, bet, ...extra }, tok.alice);
const world = (bet) => call('publish-world', { snapshot: { map: 'MAP_ROUTE101', x: 3, y: 4, f: 'down', v: ++seqN }, seq: seqN, bet }, tok.alice);
const watchBattle = (who) => call('factory-state', { username: 'alice' }, tok[who]);   // (watching: the spec:alice:<who> heartbeat)
const get = (who, runner = 'alice') => call('bet-get', { game: 'overworld', runner }, tok[who]);
const place = (who, id, o, n) => call('bet-place', { id, o, n, bid: bid() }, tok[who]);
const mon = (name) => ({ name, speciesId: name.toLowerCase(), level: 20, curHP: 50, maxHP: 50, types: ['Normal'], stats: { hp: 50, atk: 30, def: 30, spa: 30, spd: 30, spe: 30 }, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], status: null });

try {   // (on the old code the overworld is unknown to the bets: the first market is missing and this throws, counted as a failure)
// ===== 4 first: a battle nobody watches or bets on =====
let r = await cast({ run: 'quiet1', prog: 1, md: 'wild', el: 0 });
A(r.ok && r.riding === 0 && !row('owbet:alice'), 'nobody watching, nobody betting: the battle\'s report writes nothing (riding 0)', { r, row: row('owbet:alice') });
await cast({ run: 'quiet1', prog: 2, md: 'wild', el: 9000, res: 'win' }, { over: true });

// ===== 1. a wild battle =====
await watchBattle('bob');
r = await cast({ run: 'wild1', prog: 1, md: 'wild', el: 1500 });
A(r.ok && row('owbet:alice')?.bet?.run === 'wild1', 'bob watches: the battle\'s report is written (owbet:alice)', row('owbet:alice'));
A((await get('alice')).markets?.length === 0, 'alice looking at her own battle opens no market');
A((await get('dave')).markets?.length === 0, 'a stranger opens none');
const g1 = await get('bob'), B1 = g1.markets && g1.markets[0];
A(B1 && B1.id === 's:overworld:alice:wild1' && B1.open && B1.outcomes.map(o => o.label).join() === 'alice wins,alice loses' && B1.closesAt - B1.now <= 45_000 && B1.closesAt - B1.now >= 42_000,
	'bob opens the battle\'s market: "alice wins" / "alice loses", 45 s from its start (the page said 1.5 s ago)', B1);
A(/own game/.test((await place('alice', B1.id, 'lose', 5)).error || ''), 'alice cannot bet on her own battle');
A(/friends/.test((await place('dave', B1.id, 'win', 5)).error || ''), 'a stranger is refused');
A((await place('bob', B1.id, 'win', 10)).ok && (await place('carol', B1.id, 'lose', 6)).ok, 'bob bets 10 that she wins, carol 6 that she loses');
r = await cast({ run: 'wild1', prog: 1, md: 'wild', el: 3000 });
A(r.riding === 16 && r.bettors === 2, 'her broadcast\'s answer: 16 ★ riding, 2 bettors (her badge)', r);
await cast({ run: 'wild1', prog: 2, md: 'wild', el: 6000 });
A(/opening/.test((await place('erin', B1.id, 'win', 5)).error || '') && bal('erin') === 1000, 'turn 2 starts: betting has closed');
r = await cast({ run: 'wild1', prog: 2, md: 'wild', el: 9000, res: 'win' }, { over: true, snapshot: null });
A(row('betm:' + B1.id).end?.result === 'win' && bal('bob') === 1006 && bal('carol') === 994 && total() === T0, 'she catches it (her page reports a win): bob takes the pool of 16', row('betm:' + B1.id).end);

// ===== 2. a trainer battle lost; a boss =====
r = await cast({ run: 'trn2', prog: 1, md: 'trainer', el: 0 });
const T2 = (await get('carol')).markets[0];
A(T2 && T2.outcomes[0].label === 'alice wins' && T2.id.endsWith(':trn2'), 'a trainer battle: wins / loses', T2);
await place('carol', T2.id, 'win', 20); await place('bob', T2.id, 'lose', 20);
await cast({ run: 'trn2', prog: 2, md: 'trainer', el: 20000, res: 'lose' }, { over: true });
A(row('betm:' + T2.id).end?.result === 'lose' && bal('bob') === 1026 && total() === T0, 'she blacks out (a loss): bob takes 40');
await cast({ run: 'gym3', prog: 1, md: 'boss', el: 0 });
const G3 = (await get('erin')).markets[0];
A(G3 && G3.id.endsWith(':gym3') && G3.open, 'a Gym Leader\'s battle (boss) has a market the same way', G3);

// ===== 3. an escape; the clock; a late first report =====
await cast({ run: 'esc4', prog: 1, md: 'wild', el: 0 });
const E4 = (await get('bob')).markets[0];
await place('bob', E4.id, 'win', 30); await place('erin', E4.id, 'lose', 10);
A(bal('bob') === 996 && bal('erin') === 990, 'bob 30, erin 10 on a new wild battle');
await cast({ run: 'esc4', prog: 1, md: 'wild', el: 4000, res: 'void' }, { over: true });
const e4 = row('betm:' + E4.id).end;
A(e4 && e4.result === null && /escape/.test(e4.why) && bal('bob') === 1026 && bal('erin') === 1000 && total() === T0, 'she runs away: no result, every stake back', e4);
await cast({ run: 'clk5', prog: 1, md: 'wild', el: 0 });
const C5 = (await get('carol')).markets[0];
skew = 46_000;
A(/window/.test((await place('carol', C5.id, 'win', 5)).error || ''), '46 seconds in, still on turn 1: betting has closed');
skew = 0;
await cast({ run: 'late6', prog: 1, md: 'wild', el: 50_000 });
A((await get('carol')).markets.length === 0, 'a battle first heard of 50 s in (a watcher arriving late) opens no market');

// ===== 5. the Battle Frontier =====
await cast({ run: 'frun7', prog: 0, md: 'frontier', el: 0 });
const F7 = (await get('bob')).markets[0];
A(F7 && F7.outcomes.map(o => o.label).join() === 'alice wins 7 in a row,alice falls short of 7' && F7.closesAt - F7.now > 170_000, 'a Battle Tower run: ONE market, "wins 7 in a row" / "falls short of 7", 3 minutes to bet', F7);
const c7 = bal('carol');
await place('bob', F7.id, 'lose', 50); await place('carol', F7.id, 'win', 25);
await cast({ run: 'frun7', prog: 1, md: 'frontier', el: 60_000 });
A(/opening/.test((await place('erin', F7.id, 'lose', 5)).error || ''), 'the first bout decided: betting has closed');
r = await cast({ run: 'frun7', prog: 1, md: 'frontier', el: 600_000 });
A(r.riding === 75 && !row('betm:' + F7.id).end, 'six bouts on, the run goes on: 75 ★ riding, nothing settled');
await cast({ run: 'frun7', prog: 1, md: 'frontier', el: 700_000, res: 'win' });
A(row('betm:' + F7.id).end?.result === 'win' && bal('carol') === c7 + 50 && total() === T0, 'the 7th win in a row (reported while the run goes on): carol takes 75', row('betm:' + F7.id).end);
await cast({ run: 'dome8', prog: 0, md: 'frontier-cup', el: 0 });
const D8 = (await get('erin')).markets[0];
A(D8 && D8.outcomes[0].label === 'alice clears every round', 'a Battle Dome run: "clears every round" / "is knocked out"', D8);
await place('erin', D8.id, 'lose', 40); await place('bob', D8.id, 'win', 40);
await cast({ run: 'dome8', prog: 1, md: 'frontier-cup', el: 90_000, res: 'lose' }, { over: true, snapshot: null });
A(row('betm:' + D8.id).end?.result === 'lose' && bal('erin') === 1040 && total() === T0, 'knocked out in round 2: erin takes 80');

// ===== 6. minigames on the live-follow check =====
await call('heartbeat', { map: 'MAP_MAUVILLE_CITY_GAME_CORNER', x: 3, y: 4, facing: 'down', status: 'roaming', region: 'Game Corner' }, tok.alice);
const fol = await call('world-state', { username: 'alice' }, tok.carol);
A(fol && fol.online, 'carol follows alice (live follow)', fol);
r = await world({ run: 'vf9', prog: 0, md: 'vflip', el: 0 });
const V9 = (await get('carol')).markets[0];
A(V9 && V9.outcomes.map(o => o.label).join() === 'alice clears the level,alice flips a Voltorb' && V9.closesAt - V9.now <= 45_000, 'a Voltorb Flip board: "clears the level" / "flips a Voltorb"', V9);
const c9 = bal('carol');
await place('carol', V9.id, 'win', 15); await place('bob', V9.id, 'lose', 45);
r = await world({ run: 'vf9', prog: 1, md: 'vflip', el: 3000 });
A(r.riding === 60, 'her live-follow check answers 60 ★ riding', r);
await world({ run: 'vf9', prog: 2, md: 'vflip', el: 5000 });
A(/opening/.test((await place('erin', V9.id, 'win', 5)).error || ''), 'the 2nd card flipped: betting has closed');
await world({ run: 'vf9', prog: 2, md: 'vflip', el: 20000, res: 'win' });
A(row('betm:' + V9.id).end?.result === 'win' && bal('carol') === c9 + 45 && total() === T0, 'the board is cleared: carol takes 60', row('betm:' + V9.id).end);
await world({ run: 'ct10', prog: 0, md: 'contest', el: 0 });
const K10 = (await get('bob')).markets[0];
A(K10 && K10.outcomes.map(o => o.label).join() === 'alice wins first place,alice does not win', 'a Contest: "wins first place" / "does not win"', K10);
await place('bob', K10.id, 'win', 10); await place('erin', K10.id, 'lose', 10);
await world({ run: 'ct10', prog: 1, md: 'contest', el: 40000, res: 'lose' });
A(row('betm:' + K10.id).end?.result === 'lose' && total() === T0, 'she places second: erin takes 20');
A((await get('bob')).markets[0]?.end?.result === 'lose', 'just after, bob still sees how it ended');
skew = 61_000;
A((await get('bob')).markets.length === 0, 'a minute later (walking about): nothing listed');
skew = 0;
r = await world(undefined);
A(r.ok && r.riding === undefined, 'walking about (no report): no market, nothing riding');

// ===== 7. a live battle between friends =====
await call('challenge', { to: 'bob', battleType: 'pokemon', party: [mon('PIKACHU')] }, tok.alice);
const acc = await call('accept-challenge', { from: 'alice', party: [mon('EEVEE')] }, tok.bob);
const MID = acc.matchId;
A(/^[A-Z]{12}$/.test(MID || '') && row('match:' + MID)?.createdAt > 0, 'bob accepts alice\'s challenge: a live battle, stamped with when it began', acc);
const V = (await get('erin')).markets?.[0];
A(V && V.id === 'v:' + MID && V.kind === 'pvp' && V.outcomes.map(o => o.k).join() === 'alice,bob' && V.closesAt - V.now <= 60_000, 'a live battle: one outcome per player, a minute to bet', V);
A(/playing in this match/.test((await place('alice', V.id, 'alice', 10)).error || '') && /playing in this match/.test((await place('bob', V.id, 'alice', 10)).error || ''), 'both players are refused');
A((await get('carol', 'bob')).markets?.[0]?.id === V.id, 'found from either player (carol looks at bob\'s game)');
await place('erin', V.id, 'alice', 30); await place('carol', V.id, 'bob', 10);
const poll = await call('match', { id: MID, bets: 1 }, tok.alice);
A(poll.match && poll.riding === 40 && poll.bettors === 2, 'alice\'s match poll answers 40 ★ riding', { riding: poll.riding });
{ const m = row('match:' + MID); m.turn = 2; setRow('match:' + MID, m); }
A(/opening/.test((await place('erin', V.id, 'alice', 5)).error || ''), 'the server\'s turn 2: betting has closed');
await call('match-action', { id: MID, act: { kind: 'forfeit' } }, tok.alice);
A(row('betm:' + V.id).end?.result === 'bob' && /server/.test(row('betm:' + V.id).end.why) && total() === T0, 'alice forfeits on the server: the match row hands bob the win, carol takes 40', row('betm:' + V.id).end);
// (a page's own claim settles nothing: a fresh match, alice's broadcast saying she won)
await call('challenge', { to: 'bob', battleType: 'pokemon', party: [mon('PIKACHU')] }, tok.alice);
const M2 = (await call('accept-challenge', { from: 'alice', party: [mon('EEVEE')] }, tok.bob)).matchId;
const V2 = (await get('erin')).markets[0];
await place('erin', V2.id, 'bob', 10); await place('carol', V2.id, 'alice', 10);
await cast({ run: M2, prog: 9, md: 'wild', res: 'win' }, { over: true });
A(!row('betm:' + V2.id).end, 'her page saying "I won" settles nothing: only the match row');
await call('leave-match', { id: M2, type: 'pokemon' }, tok.bob);
A(row('betm:' + V2.id).end?.result === 'alice' && total() === T0, 'bob leaves the match: the server gives alice the win', row('betm:' + V2.id).end);

// ===== 8. a mail battle =====
const ac = await call('async-create', { to: 'bob', game: 'pokemon', party: [mon('MUDKIP')] }, tok.alice);
const AM = ac.match && ac.match.id;
await call('async-accept', { id: AM, party: [mon('TORCHIC')] }, tok.bob);
await world({ run: AM, am: AM, prog: 0 });
const M8 = (await get('erin')).markets.find(m => m.id.startsWith('a:'));
A(M8 && M8.id === 'a:' + AM && M8.open && M8.outcomes.map(o => o.k).join() === 'alice,bob', 'a mail battle open on alice\'s screen: one outcome per player', M8);
A(/playing/.test((await place('bob', M8.id, 'bob', 5)).error || ''), 'bob (playing) is refused');
await place('erin', M8.id, 'bob', 25); await place('carol', M8.id, 'alice', 25);
{ const am = row('amatch:' + AM); am.pk.turn = 2; setRow('amatch:' + AM, am); }
A(/opening/.test((await place('erin', M8.id, 'bob', 5)).error || ''), 'its battle\'s turn 2: betting has closed');
await call('async-resign', { id: AM }, tok.alice);
A(row('betm:' + M8.id).end?.result === 'bob' && total() === T0, 'alice resigns: the match row settles it, erin takes 50', row('betm:' + M8.id).end);

// ===== 9 =====
A(total() === T0, 'every wallet plus the open pools: nothing made or lost', { T0, now: total() });
} catch (e) {
	A(false, 'the test threw: ' + (e && e.message));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
