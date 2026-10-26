// micasurvivor_expedition_tiers_test.mjs — MicaSurvivor DLC D9: tiers, score and boards. micasurvivor/js/expedition/tiers.js
// (G.ExpTier), classic.js (the tier table in play), core.js (run.end, the board mark), server/mp.mjs (run-score /
// run-leaderboard for mode micasurvivor_expedition: parts, time attack, the weekly season). Plans/MICASURVIVOR_POKEBONK_DLC_STUDY.md
// 2.11-2.13 and the D9 row. The REAL handler (bundled like the dev server, over sqlite) behind a static server, headless
// Chrome. One browser at a time (and it always exits).
//   0. pure: the tier tables (study 2.11), the score formula (2.12 + the catch term), the medals by time (2.13), the season
//      weeks and ribbons; tiers.js loaded in a vm (no browser)
//   1. the server: a score with its parts is recomputed (parity with G.ExpTier.score on 16 runs); junk is refused (a wrong
//      score, a bad zone, a win off the shrine, a 2-minute clear, too many KOs / damage / catches, a dv-8 score without its
//      parts, a forged / foreign / mismatched replay); a dv-7 score without parts is still taken under a ceiling; time attack
//      (won runs, fastest first, the medal) and the weekly season boards; run-leaderboard's views; the rate limit; exact-key
//      reads only (no LIKE scan); the base board untouched; the season rows in the GC table
//   2. the tiers change the run: a foe's HP / damage / speed / XP, the plan (events earlier and bigger), the boss's escorts and
//      damage, the trickle's elites, the cap; Normal unchanged (no extra draw, x1)
//   3. unlocks per map: Normal only at first (Hard refused); a Normal win unlocks Hard ("Hard unlocked"), a Hard win Nightmare;
//      the run-over screen's score line and medal; the save's tier / medal counters (max-merged on the server)
//   4. the panel: "Difficulty: Normal · leaderboards" on the Classic card -> the tier cards (locked / chosen), the medal limits,
//      the boards through the real server (Score, Time attack with the medal and a Watch link, Season with its prizes); last
//      season's place -> a cosmetic ribbon in the Expedition save, once
//   5. sync: a Hard run's snapshot carries c.d = 1 in the x block v8 (no bump), a fresh viewer page shows the tier on its HUD
//      and plans the Hard timeline; the replay header has diff; an old dv-7 snapshot still loads; the content version is 8
//   6. phone (844 x 390, touch) and desktop: the panel fits (no sideways scroll, the cards and the board on screen); screenshots
//   node overworld/tests/micasurvivor_expedition_tiers_test.mjs
// (In a git worktree add MAGEPUNK_ASSET_ROOT=<main checkout> for the gitignored sprites. MICASURVIVOR_ROOT=<dir> serves
//  micasurvivor/ from another tree and MP_SERVER=<file> bundles another server/mp.mjs: how the "fails before D9" count was
//  taken. SHOTS=<dir> saves the screenshots.)
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
const PORT = 8866;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(extra).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(60); } return false; }
const T0 = Date.now();

// ======================== 0. pure: tiers.js in a vm
let XT = null;
{
	const G = {
		I18n: { add() {}, t: s => s, f: (s, ...v) => { let i = 0; return s.replace(/\{x\}/g, () => v[i++]); } },
		U: { mmss: s => Math.floor(s / 60) + ':' + String(Math.floor(s % 60)).padStart(2, '0') }, Expedition: { BOARD: 'micasurvivor_expedition' },
	};
	try {
		vm.runInNewContext(fs.readFileSync(path.join(MROOT, 'micasurvivor/js/expedition/tiers.js'), 'utf8'), { G, console, Date, Math, JSON });
		XT = G.ExpTier;
	} catch (e) { console.log('     (tiers.js: ' + String(e.message).slice(0, 120) + ')'); }
}
A(!!XT, 'tiers.js loads on its own (G.ExpTier)');
if (XT) {
	const t = XT.K.TIERS;
	A(JSON.stringify([t.normal.hp, t.hard.hp, t.nightmare.hp, t.normal.dmg, t.hard.dmg, t.nightmare.dmg, t.hard.spd, t.nightmare.spd, t.hard.amount, t.nightmare.amount, t.hard.cap, t.nightmare.cap])
		=== JSON.stringify([1, 1.4, 1.9, 1, 1.42, 1.96, 1.08, 1.16, 1.3, 1.6, 1.15, 1.3]),
		'the tier table (study 2.11): HP x1 / 1.4 / 1.9, damage x1 / 1.42 / 1.96, speed x1.08 / 1.16, amount x1.3 / 1.6, cap x1.15 / 1.3');
	A(JSON.stringify([t.hard.elite, t.nightmare.elite, t.hard.event, t.nightmare.event, t.hard.early, t.nightmare.early, t.hard.tele, t.nightmare.tele, t.hard.escorts, t.nightmare.escorts, t.hard.xp, t.nightmare.xp, t.hard.score, t.nightmare.score])
		=== JSON.stringify([0.04, 0.08, 1.2, 1.4, 15, 30, 0.92, 0.85, 1, 2, 1.15, 1.3, 1.5, 2]) && Object.values(t.normal).every(v => v === 1 || v === 0),
		'... elites +4 / +8 %, events x1.2 / 1.4 and 15 / 30 s earlier, telegraphs x0.92 / 0.85, escorts 1 / 2, XP x1.15 / 1.3, score x1.5 / 2; Normal is all x1 / 0');
	const p0 = { kills: 500, time: 1500, dmg: 400000, zone: 4, bosses: 4, won: true, catches: 3 };
	const want0 = Math.floor(2 * 500 + 3 * 1500 + 400000 / 200 + 1500 * 3 + 800 * 4 + 6000 + 400 * 3);
	A(XT.score(p0, 'normal') === want0 && want0 === 22400 && XT.score(p0, 'hard') === Math.floor(want0 * 1.5) && XT.score(p0, 'nightmare') === want0 * 2,
		'the score: 2 KOs + 3 s + damage / 200 + 1,500 (zone - 1) + 800 bosses + 6,000 won + 400 a catch, x(1 + 0.5 tier): 22,400 / 33,600 / 44,800', [XT.score(p0, 'normal'), XT.score(p0, 'hard'), XT.score(p0, 'nightmare')].join(' '));
	A(XT.score({ ...p0, catches: 5 }, 'hard') - XT.score(p0, 'hard') === 1200 && XT.score({ ...p0, catches: 0 }, 'normal') === want0 - 1200,
		'the catch term: +400 a catch (x1.5 on Hard: +600)');
	const m = (s, d) => XT.medalOf(s, d, 'viridian');
	A([m(1049, 'normal'), m(1050, 'normal'), m(1379, 'normal'), m(1380, 'normal'), m(1799, 'normal'), m(1800, 'normal'), m(9999, 'normal')].join() === '4,3,3,2,2,1,1',
		'medals on Normal (+3 min for the shrine): champion < 17:30, gold < 23:00, silver < 30:00, bronze to finish');
	A([m(1119, 'hard'), m(1120, 'hard'), m(1189, 'nightmare'), m(1190, 'nightmare'), m(1929, 'hard'), m(1930, 'hard')].join() === '4,3,4,3,2,1',
		'... x(1 + 0.08 tier): Hard champion < 18:40, Nightmare < 19:50, Hard silver < 32:10', JSON.stringify(XT.limits('hard', 'viridian')));
	const s1 = XT.seasonOf(Date.UTC(2026, 9, 12, 0, 0, 1)), s2 = XT.seasonOf(Date.UTC(2026, 9, 22, 12)), s3 = XT.seasonOf(Date.UTC(2026, 9, 26));
	A(s1.id === 1 && s2.id === 2 && s3.id === 3 && s2.starts === Date.UTC(2026, 9, 19) && s2.ends === Date.UTC(2026, 9, 26),
		'weekly seasons from Monday 2026-10-12 UTC: season 2 is 19-26 Oct', JSON.stringify([s1, s2, s3]));
	A([1, 2, 3, 4, 10, 11, 25, 26, 50, 51, 0].map(XT.prizeOf).join() === 'master,elite,elite,top10,top10,top25,top25,top50,top50,,',
		'the season ribbons by place: Master #1, Elite #2-3, Top 10, Top 25, Top 50 (cosmetic only)');
}

// ======================== 1. the server (the real handler over sqlite)
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const SQL = [];
const MP_DB = { prepare(sql) { SQL.push(sql); const stmt = sqlite.prepare(sql); const bound = []; const api = { bind(...a) { bound.length = 0; bound.push(...a); return api; }, async first() { return stmt.get(...bound) ?? null; }, async run() { return stmt.run(...bound); }, async all() { return { results: stmt.all(...bound) }; } }; return api; } };
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const put = (k, v) => sqlite.prepare('INSERT OR REPLACE INTO mp_store (key, value, updated_at) VALUES (?, ?, unixepoch())').run(k, JSON.stringify(v));
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-msurv-tiers-')), 'mp.bundle.mjs');
buildSync({ entryPoints: [MP_SERVER], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
const { default: handler } = await import(pathToFileURL(bundle).href);
const NOW = Date.UTC(2026, 9, 22, 12);   // season 2
let clock = NOW;
globalThis.__msurvClock = () => clock;
let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.66.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) });
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const tokens = {}, states = {};
const reg = async n => { const r = (await raw('register', { username: n, password: 'msurv-tiers-pass-1' })).body; tokens[n] = r.token; states[n] = r.state || (await raw('state', {}, r.token)).body.state; };
for (const n of ['alice', 'bob', 'carl', 'dora', 'eve', 'fay', 'gus', 'hal']) await reg(n);
A(Object.values(tokens).every(Boolean), 'test accounts registered');
// a base board row to prove it stays pure
await raw('run-score', { mode: 'micasurvivor', time: 600, kills: 100, level: 10, dex: 4 }, tokens.hal);
const base0 = JSON.stringify(row('runboard:micasurvivor')), halBase0 = JSON.stringify(row('hal').runBest.micasurvivor);
const SQLX = [];
const tracked = async f => { const i = SQL.length; const r = await f(); SQLX.push(...SQL.slice(i)); return r; };
const sc = (tok, b) => tracked(() => raw('run-score', { mode: 'micasurvivor_expedition', expMode: 'exp-classic', dv: 8, map: 'viridian', diff: 'normal', level: 20, dex: 1, ...b }, tok));
const scoreOf = (p, d) => XT ? XT.score(p, d) : -1;
{
	// parity: the client's formula = the server's, on 16 runs (4 a player: the run-score brake is 20 a minute)
	let rnd = 7;
	const r = n => { rnd = (rnd * 1103515245 + 12345) >>> 0; return rnd % n; };
	const bad = [];
	for (let i = 0; i < 16; i++) {
		const won = i % 3 === 0, zone = won ? 4 : 1 + r(4), time = (won ? 1100 : 60) + r(1800);
		const p = { kills: r(Math.min(5000, 15 * time)), time, dmg: r(3_000_000), zone, bosses: Math.min(zone, r(5)), won, catches: r(8) };
		const diff = ['normal', 'hard', 'nightmare'][i % 3];
		const res = await sc(tokens[['alice', 'bob', 'carl', 'dora'][i % 4]], { ...p, diff, score: scoreOf(p, diff) });
		if (res.status !== 200) bad.push([i, res.status, res.body.error, res.body.want, scoreOf(p, diff)]);
	}
	A(XT && !bad.length, 'parity: 16 runs (all tiers, won and not) — the server recomputes each score from its parts and takes it', JSON.stringify(bad));
}
{
	const p = { kills: 300, time: 1200, dmg: 200000, zone: 4, bosses: 4, won: true, catches: 2 };
	const ok = scoreOf(p, 'normal');
	const junk = [
		['a score that is not its parts', { ...p, score: ok + 50 }, /does not match/],
		['zone 5', { ...p, zone: 5, won: false, score: 1 }, /bad zone/],
		['a win off the shrine', { ...p, zone: 3, score: 1 }, /shrine/],
		['a 2-minute clear', { ...p, time: 120, score: 1 }, /clear time/],
		['too many KOs', { ...p, kills: 15 * 1200 + 201, score: 1 }, /KOs/],
		['too much damage', { ...p, dmg: 100000 * 1200 + 1, score: 1 }, /damage/],
		['61 catches', { ...p, catches: 61, score: 1 }, /catches/],
		['too many bosses', { ...p, bosses: 13, score: 1 }, /bosses/],
		['a string zone', { ...p, zone: '4', score: ok }, /bad zone/],
		['won as a string', { ...p, won: 'true', score: ok }, /bad won/],
		['a dv-8 score without its parts', { time: 1200, kills: 300, score: 9000 }, /needs its parts/],
		['a junk replay id', { ...p, score: ok, replay: '../../x' }, /replay/],
		['a replay that does not exist', { ...p, score: ok, replay: 'deadbeef' }, /replay/],
	];
	const before = JSON.stringify([row('runboard:micasurvivor_expedition:viridian:normal'), row('runboard:micasurvivor_expedition:viridian:normal:time')]);
	const res = [];
	for (const [i, [label, b, re]] of junk.entries()) { const r = await sc(tokens[['eve', 'fay', 'gus'][i % 3]], b); res.push([label, r.status, r.body.error]); A(r.status === 400 && re.test(r.body.error || ''), 'the server refuses ' + label + ' (400: ' + (r.body.error || '') + ')', JSON.stringify(r)); }
	A(JSON.stringify([row('runboard:micasurvivor_expedition:viridian:normal'), row('runboard:micasurvivor_expedition:viridian:normal:time')]) === before, '... and nothing reached a board');
	// a dv-7 client (no parts) is still taken, under a ceiling
	await reg('ivy'); await reg('jon');
	const old = await raw('run-score', { mode: 'micasurvivor_expedition', expMode: 'exp-classic', dv: 7, map: 'viridian', diff: 'normal', score: 5000, time: 600, kills: 100 }, tokens.ivy);
	const oldBig = await raw('run-score', { mode: 'micasurvivor_expedition', expMode: 'exp-classic', dv: 7, map: 'viridian', diff: 'normal', score: 9e11, time: 60, kills: 10 }, tokens.jon);
	A(old.status === 200 && old.body.ok && oldBig.status === 400 && /implausible/.test(oldBig.body.error), 'an older client (dv 7, no parts) is still taken; an implausible one (9e11 in a minute) is refused', JSON.stringify([old.body, oldBig.body]));
}
{
	// replays: only your own upload, and it must be this run's
	const meta = (o) => ({ dex: 1, mode: 'exp-classic', time: 1200, level: 20, kills: 300, bosses: 4, dv: 8, map: 'viridian', diff: 'hard', ...o });
	put('msurvreplay:aaaa1111', { code: 'G1.x', meta: meta(), by: 'fay', when: 1 });
	put('msurvreplay:bbbb2222', { code: 'G1.x', meta: meta({ diff: 'normal' }), by: 'gus', when: 1 });
	put('msurvreplay:cccc3333', { code: 'G1.x', meta: meta(), by: 'eve', when: 1 });
	const p = { kills: 300, time: 1200, dmg: 200000, zone: 4, bosses: 4, won: true, catches: 2 };
	const s = scoreOf(p, 'hard');
	const foreign = await sc(tokens.eve, { ...p, diff: 'hard', score: s, replay: 'aaaa1111' });
	const other = await sc(tokens.gus, { ...p, diff: 'hard', score: s, replay: 'bbbb2222' });
	const good = await sc(tokens.eve, { ...p, diff: 'hard', score: s, replay: 'cccc3333' });
	A(foreign.status === 400 && other.status === 400 && good.status === 200, "a replay id must be one of YOUR uploads with this run's mode / map / difficulty / time / KOs", JSON.stringify([foreign.body, other.body, good.body]).slice(0, 300));
	const tb = row('runboard:micasurvivor_expedition:viridian:hard:time');
	A(tb && tb[0] && tb[0].name === 'eve' && tb[0].replay === 'cccc3333' && tb[0].medal === XT?.medalOf(1200, 'hard') && tb[0].medal === 3 && good.body.time && good.body.time.rank === 1,
		'time attack: the won run lands on runboard:...:viridian:hard:time with its medal (20:00 on Hard: gold, < 24:36) and its replay', JSON.stringify(tb).slice(0, 300));
}
{
	// time attack: fastest first; a run that isn't won never reaches it; your best only improves
	const won = (time, kills = 100) => { const p = { kills, time, dmg: 50000, zone: 4, bosses: 4, won: true, catches: 0 }; return { ...p, score: scoreOf(p, 'nightmare'), diff: 'nightmare', map: 'mtmoon' }; };
	await reg('kim'); await reg('lou'); await reg('max');
	await sc(tokens.kim, won(1500)); await sc(tokens.lou, won(1100)); await sc(tokens.max, { ...won(900), won: false, zone: 3, score: scoreOf({ kills: 100, time: 900, dmg: 50000, zone: 3, bosses: 4, won: false, catches: 0 }, 'nightmare') });
	let tb = row('runboard:micasurvivor_expedition:mtmoon:nightmare:time');
	A(tb && tb.map(e => e.name).join() === 'lou,kim' && tb[0].medal === 4 && tb[1].medal === 3, 'time attack: fastest first (lou 18:20 champion, kim 25:00 gold on Nightmare); a lost run is not on it', JSON.stringify(tb));
	const slower = await sc(tokens.lou, won(1300, 900));
	tb = row('runboard:micasurvivor_expedition:mtmoon:nightmare:time');
	A(slower.body.ok && slower.body.better && slower.body.time && !slower.body.time.better && tb[0].name === 'lou' && tb[0].time === 1100,
		'a slower win with a higher score: a better SCORE mark, but the time-attack mark stays 18:20', JSON.stringify(slower.body).slice(0, 300));
	const lb = await tracked(() => raw('run-leaderboard', { mode: 'micasurvivor_expedition', map: 'mtmoon', diff: 'nightmare', board: 'time' }, tokens.kim));
	A(lb.status === 200 && lb.body.board === 'time' && lb.body.top.length === 2 && lb.body.you && lb.body.you.rank === 2 && lb.body.you.time === 1500, 'run-leaderboard board: time -> the top + your rank', JSON.stringify(lb.body).slice(0, 300));
}
{
	// the weekly season
	const sid = XT ? XT.seasonOf(NOW).id : 2;
	const s2 = row('msurvseason:' + sid + ':mtmoon:nightmare');
	A(s2 && s2.map(e => e.name).join() === 'lou,kim,max' && s2[0].score > s2[1].score, 'the season board msurvseason:2:mtmoon:nightmare holds this week\'s scores (by score)', JSON.stringify(s2 && s2.map(e => [e.name, e.score])));
	clock = NOW + 7 * 86400000;   // next week: season 3
	const p = { kills: 50, time: 400, dmg: 1000, zone: 2, bosses: 1, won: false, catches: 0 };
	const r3 = await sc(tokens.kim, { ...p, diff: 'nightmare', map: 'mtmoon', score: scoreOf(p, 'nightmare') });
	A(r3.body.season && r3.body.season.id === sid + 1 && r3.body.season.rank === 1 && row('msurvseason:' + (sid + 1) + ':mtmoon:nightmare').length === 1 && row('msurvseason:' + sid + ':mtmoon:nightmare').length === 3,
		'a week later: a new season board (season 3) from zero; last week\'s stays', JSON.stringify(r3.body.season));
	const cur = await tracked(() => raw('run-leaderboard', { mode: 'micasurvivor_expedition', map: 'mtmoon', diff: 'nightmare', board: 'season' }, tokens.kim));
	const prev = await tracked(() => raw('run-leaderboard', { mode: 'micasurvivor_expedition', map: 'mtmoon', diff: 'nightmare', board: 'season', season: sid }, tokens.kim));
	A(cur.status === 200 && cur.body.season === sid + 1 && cur.body.current === sid + 1 && cur.body.ends === Date.UTC(2026, 10, 2) && cur.body.top.length === 1 && cur.body.you.rank === 1
		&& prev.status === 200 && prev.body.season === sid && prev.body.top.length === 3 && prev.body.you.rank === 2,
		'run-leaderboard board: season -> this week (ends Mon 2 Nov) or a past week (kim was #2 last season)', JSON.stringify([cur.body.ends, prev.body.you]));
	const fut = await tracked(() => raw('run-leaderboard', { mode: 'micasurvivor_expedition', map: 'mtmoon', diff: 'nightmare', board: 'season', season: sid + 2 }, tokens.kim));
	clock = NOW + 7 * 7 * 86400000;
	const tooOld = await tracked(() => raw('run-leaderboard', { mode: 'micasurvivor_expedition', map: 'mtmoon', diff: 'nightmare', board: 'season', season: sid }, tokens.kim));
	const bogus = await tracked(() => raw('run-leaderboard', { mode: 'micasurvivor_expedition', map: 'mtmoon', diff: 'nightmare', board: 'kos' }, tokens.kim));
	const strS = await tracked(() => raw('run-leaderboard', { mode: 'micasurvivor_expedition', map: 'mtmoon', diff: 'nightmare', board: 'season', season: '2' }, tokens.kim));
	clock = NOW;
	A(fut.status === 400 && tooOld.status === 400 && bogus.status === 400 && strS.status === 400, 'a future season, one more than 4 weeks old, a string season or an unknown board: 400', JSON.stringify([fut.body, tooOld.body, bogus.body, strS.body]));
	const mp = fs.readFileSync(MP_SERVER, 'utf8');
	A(/\['msurvseason:', 42 \* 24 \* HR\]/.test(mp), 'the season rows are swept 6 weeks after their last write (GC_TABLE); the all-time boards are not');
}
{
	// the rate limit (run-score: 20 a minute) holds for Expedition scores
	await reg('ned');
	const p = { kills: 1, time: 30, dmg: 10, zone: 1, bosses: 0, won: false, catches: 0 };
	const st = [];
	for (let i = 0; i < 22; i++) st.push((await sc(tokens.ned, { ...p, score: scoreOf(p, 'normal') })).status);
	A(st.slice(0, 20).every(s => s === 200) && st[20] === 429 && st[21] === 429, 'the run-score brake: 20 a minute, then 429 (slow down)', st.join(','));
	// no prefix scans: every SELECT the Expedition boards ran is an exact key
	const scans = SQLX.filter(q => /^\s*SELECT/i.test(q) && /LIKE/i.test(q));
	A(SQLX.length > 20 && !scans.length, 'every board read / write was an exact key: no SELECT ... LIKE prefix scan', scans.slice(0, 3).join(' | '));
	A(JSON.stringify(row('runboard:micasurvivor')) === base0 && JSON.stringify(row('hal').runBest.micasurvivor) === halBase0, 'the BASE board (runboard:micasurvivor) and a base best are untouched');
	const forged = await raw('run-score', { mode: 'micasurvivor', time: 300, kills: 3, zone: 4, won: true, dmg: 5, bosses: 1, catches: 0, expMode: 'exp-classic', dv: 8, map: 'viridian', diff: 'hard' }, tokens.hal);
	A(forged.status === 400 && JSON.stringify(row('runboard:micasurvivor')) === base0, 'an Expedition score sent to the base board is still refused');
}

// ======================== the browser (the static server proxies /api/mp to the same handler)
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ico': 'image/x-icon', '.ttf': 'font/ttf', '.woff2': 'font/woff2', '.md': 'text/markdown; charset=utf-8', '.txt': 'text/plain', '.svg': 'image/svg+xml' };
const apiLog = [];
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let body = ''; for await (const c of req) body += c;
		let b = {}; try { b = JSON.parse(body); } catch { }
		apiLog.push({ action: b.action, mode: b.mode, board: b.board, body: b });
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.67.0.' + (req.socket.remotePort % 250 + 1), ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body });
		try { const r = await handler(request, { MP_DB }); res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text()); }
		catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const base = /^\/(micasurvivor\/assets|overworld\/data)\//.test(f) ? AROOT : /^\/micasurvivor\//.test(f) ? MROOT : ROOT;
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
		localStorage.setItem('micasurvivor_dev', 'dtier9');
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
	H.sturdy = () => { const pl = G.Game.player; H.hurts = 0; pl.hurt = function () { H.hurts++; }; pl.gainXp = () => 0; return pl; };
	H.step = (n, dt = 1 / 30) => { for (let i = 0; i < n; i++) G.Game.debugStep(1, dt); };
	H.wipe = () => { for (const e of G.EnemyMgr.all()) { e.remote = true; } G.EnemyMgr.clear(); if (G.ExpCap && G.ExpCap.run) G.ExpCap.run.tg.clear(); };
	H.go = (x, y) => { const pl = G.Game.player; pl.x = x; pl.y = y; pl.zMask = null; pl.air = null; pl.airZ = 0; pl._px = null; pl.vx = 0; pl.vy = 0; G.Camera.x = x; G.Camera.y = y; };
	H.quiet = () => { if (G.ExpClassic.run) G.ExpClassic.run.acc = -1e6; };
	/** a foe of the zone (Classic's spawner) -> its numbers */
	H.foeStats = dex => { const pl = G.Game.player, e = G.ExpClassic.spawnFoe(dex, pl.x + 300, pl.y, { hp: 50 });   // (x50 HP: the ratios free of rounding)
		 const o = { hp: e.maxHp, dmg: e.dmg, spd: e.spd, xp: e.xp }; e.remote = true; G.EnemyMgr.clear(); return o; };
	/** wake the zone's guardian (stand on the altar) -> its escorts */
	H.wake = () => { const C = G.ExpClassic, S = C.run, [ax, ay] = C.siteXY(S.sites.altar); H.wipe(); H.quiet(); H.go(ax, ay); H.step(Math.ceil((C.K.ALTAR_T + 0.3) * 30)); const all = G.EnemyMgr.all(); return { boss: !!S.boss, bossDmg: S.boss ? S.boss.dmg : 0, escorts: all.filter(e => e.xescort && !e.dead).length, elites: all.filter(e => e.xk === 'elite').length }; };
	/** force a win (the legendary down at the shrine) after `t` s of run time, and end the run -> the run.end summary */
	H.win = t => { const S = G.ExpClassic.run; S.won = true; S.zone = 4; S.ph = 4; S.splits[3] = t; G.Game.debugTime(t); G.Game.endRun(false); return window.__sum; };
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
		page.on('console', m => { if (m.type() === 'error' && !/Failed to load resource|status of (400|409|429)/.test(m.text())) errors.push('console: ' + m.text().slice(0, 200)); });
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
	/** load the Expedition code, open its save, a hook keeping the run.end summary */
	const prep = page => E(page, async () => {
		const ok = await G.Expedition.load().catch(e => String(e));
		if (ok !== true) return { ok: false, err: ok };
		await G.ExpSave.open();
		if (!window.__hooked) { window.__hooked = 1; G.Hooks.on('run.end', (out, sum) => { window.__sum = JSON.parse(JSON.stringify(sum)); window.__out = { lines: out.lines, medal: out.medal || null, unlocked: out.unlocked || null, score: out.score }; return out; }); }
		return { ok: true, tier: !!G.ExpTier, dv: G.Expedition.DV, xv: G.Exp.XV };
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
		return { ok, state: G.Game.state, diff: G.Modes.run.diff, map: G.Modes.run.map, dv: G.Modes.run.dv, cdiff: G.ExpClassic.run && G.ExpClassic.run.diff };
	});
	const overText = page => E(page, async () => { window.__t.thaw(); await new Promise(r => setTimeout(r, 350)); window.__t.freeze(); return (document.getElementById('scr-over') || {}).innerText || ''; });

	const d0 = await bootPage({ user: 'alice', token: tokens.alice, state: states.alice, save: SAVE('alice') });
	const { page } = d0;
	A(d0.menu, 'boots to the menu signed in (alice)');
	const pr = await prep(page);
	A(pr.ok && pr.tier && pr.dv === 18 && pr.xv === 10, 'the Expedition code loads with tiers.js; the content version is 18 (D19), the x block v10', JSON.stringify(pr));
	if (!pr.ok || !pr.tier) throw new Error('no G.ExpTier: the rest needs it');

	// ======================== 3a. unlocks: Normal only at first
	const u0 = await E(page, () => ({ unl: G.ExpTier.unlocked('viridian'), pick: G.ExpTier.pick(), hard: G.ExpTier.setPick('viridian', 'hard'), night: G.ExpTier.setPick('viridian', 'nightmare'), mtmoon: G.ExpTier.setPick('mtmoon', 'normal'), normal: G.ExpTier.setPick('viridian', 'normal'), xpick: G.Expedition.pick() }));
	A(u0.unl === 0 && u0.pick.diff === 'normal' && u0.hard === false && u0.night === false && u0.mtmoon === false && u0.normal === true && u0.xpick.diff === 'normal' && u0.xpick.map === 'viridian',
		'a fresh save: only Normal is open on Viridian Forest (Hard / Nightmare / an unplayable map refused)', JSON.stringify(u0));
	// the panel, by the mode select's button (a click)
	const pn0 = await E(page, async () => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		window.__t.thaw(); G.ModesUI.open(); await wait(150);
		const btn = document.getElementById('modes-tier-pick');
		const txt = btn && btn.innerText.trim();
		btn.click(); await wait(400);
		const el = document.getElementById('modes-xtier');
		const tiers = [...el.querySelectorAll('[data-tier]')].map(b => ({ d: b.dataset.tier, on: b.classList.contains('on'), locked: b.classList.contains('locked'), text: b.innerText.replace(/\s+/g, ' ') }));
		document.querySelector('[data-tier="hard"]').click(); await wait(100);
		const after = { pick: G.ExpTier.pick().diff, hardOn: document.querySelector('[data-tier="hard"]').classList.contains('on') };
		return { txt, shown: G.ExpTier.shown, main: document.getElementById('modes-main').classList.contains('hidden'), tiers, after, maps: [...el.querySelectorAll('[data-map]')].map(b => b.innerText.replace(/\s+/g, ' ')), medals: el.querySelector('.xt-medals').innerText.replace(/\s+/g, ' ') };
	});
	A(pn0.txt === 'Difficulty: Normal · leaderboards' && pn0.shown && pn0.main, 'the Classic card\'s "Difficulty: Normal · leaderboards" opens the panel (in English)', JSON.stringify(pn0).slice(0, 300));
	A(pn0.tiers && pn0.tiers.length === 3 && pn0.tiers[0].on && !pn0.tiers[0].locked && pn0.tiers[1].locked && pn0.tiers[2].locked && /Win the map on Normal to unlock it/.test(pn0.tiers[1].text) && /Win the map on Hard to unlock it/.test(pn0.tiers[2].text)
		&& /HP ×1\.4 · damage ×1\.42 · speed ×1\.08/.test(pn0.tiers[1].text) && /escorts 2/.test(pn0.tiers[2].text),
		'the tier cards: Normal chosen; Hard and Nightmare locked ("Win the map on Normal / Hard to unlock it") with their tables', JSON.stringify(pn0.tiers));
	A(pn0.after && pn0.after.pick === 'normal' && !pn0.after.hardOn, 'a click on a locked tier changes nothing', JSON.stringify(pn0.after));
	A(pn0.maps && /Viridian Forest/.test(pn0.maps[0]) && /Mt\. Moon .*Clear Viridian Forest first/.test(pn0.maps[1]) && /Cerulean Cape .*Clear Mt\. Moon first/.test(pn0.maps[2]) && !pn0.maps.some(m => /Coming soon/.test(m)) && /Medals \(Normal\).*Bronze Finish.*Silver < 30:00.*Gold < 23:00.*Champion < 17:30/.test(pn0.medals),
		'the map tabs (D12: Mt. Moon "Clear Viridian Forest first", Cerulean Cape "Clear Mt. Moon first"; no "Coming soon") and the medal limits', JSON.stringify([pn0.maps, pn0.medals]));
	await shoot(page, 'tiers-desktop-picker-locked.png');
	await E(page, () => { G.ExpTier.close(); G.UI.show('scr-menu', true); });

	// ======================== 2 + 3. Normal: the reference numbers; a win unlocks Hard
	const rN = await startClassic(page);
	A(rN.ok && rN.diff === 'normal' && rN.cdiff === 'normal' && rN.dv === 18, 'Classic starts on Normal', JSON.stringify(rN));
	const nS = await E(page, () => {
		const H = window.__t, C = G.ExpClassic;
		const foe = H.foeStats(10), seed = G.World.seed;
		const plans = Object.fromEntries(['normal', 'hard', 'nightmare'].map(d => [d, C.plan(seed, 'viridian', 1, d).events.map(e => [e.at, e.kind, e.n])]));
		const wk = H.wake();
		return { foe, plans, wk, line: C.hudLine(G.Game.player), seed };
	});
	A(nS.foe && nS.foe.hp > 0 && nS.wk.boss && nS.wk.escorts === 0, 'Normal: a guardian wakes with no escorts', JSON.stringify(nS.wk));
	const evN = nS.plans.normal, evH = nS.plans.hard, evX = nS.plans.nightmare;
	const fixed = { alpha: [150, 330, 480], totem: [290, 420], summoner: [360], elite: [330, 450] };
	A(evN.filter(e => fixed[e[1]]).every(e => fixed[e[1]].includes(e[0])) && evN.length === evH.length && evN.every((e, i) => evH[i][1] === e[1]),
		'Normal\'s plan is D3\'s (the fixed events at their times); Hard has the same events', JSON.stringify(evN));
	const shifted = (A0, B0, s) => A0.every((e, i) => B0[i][0] === Math.max(30, e[0] - s));
	const bigger = (A0, B0, k) => A0.every((e, i) => B0[i][2] === (e[2] > 1 ? Math.round(e[2] * k) : e[2]));
	A(shifted(evN, evH, 15) && shifted(evN, evX, 30) && bigger(evN, evH, 1.2) && bigger(evN, evX, 1.4) && evX.some(e => e[1] === 'swarm' && e[2] > 30),
		'Hard / Nightmare plans: every event 15 / 30 s earlier and x1.2 / x1.4 bigger (swarms, stampedes, flocks, elite waves, rock slides)', JSON.stringify(evX));
	A(!/HARD|NIGHTMARE/.test(nS.line), 'the Normal HUD line has no tier tag', nS.line);
	// a win on Normal: the score line, the medal, Hard unlocked
	const wN = await E(page, () => { G.ExpCap.run.n = 1; const s = window.__t.win(1000); return { sum: s, out: window.__out, unl: G.ExpTier.unlocked('viridian'), medal: G.ExpTier.medal('viridian', 'normal'), tier: G.ExpSave.get('tier.viridian'), wins: G.ExpSave.get('wins.viridian.normal') }; });
	const oN = await overText(page);
	A(wN.sum && wN.sum.parts && wN.sum.parts.won === true && wN.sum.parts.zone === 4 && wN.sum.parts.catches === 1 && wN.sum.score === XT.score(wN.sum.parts, 'normal') && wN.sum.parts.time === 1000,
		'run.end: the score\'s parts (won, zone 4, 1 catch, 16:40) and the score = G.ExpTier.score of them', JSON.stringify(wN.sum && { parts: wN.sum.parts, score: wN.sum.score }));
	A(wN.unl === 1 && wN.tier === 1 && wN.medal === 4 && wN.wins === 1 && wN.out && wN.out.unlocked === 'hard' && wN.out.medal && wN.out.medal.id === 'champion' && wN.out.medal.isNew,
		'a Normal win at 16:40: Champion (< 17:30), saved (medal.viridian.normal 4); Hard unlocks (tier.viridian 1)', JSON.stringify([wN.unl, wN.tier, wN.medal, wN.out]));
	A(/Hard unlocked on Viridian Forest/.test(oN) && /New medal: Champion/.test(oN) && /Score: [\d,]+/.test(oN) && /Medal\s+Champion · 16:40/i.test(oN),
		'the run-over screen: the score line, "New medal: Champion", "Hard unlocked on Viridian Forest" and the medal block', oN.slice(0, 600));
	await shoot(page, 'tiers-desktop-runover-medal.png');
	// the mark to the boards through the real server: its parts and its replay (time attack)
	const sb = await E(page, async () => { const r = await G.Exp.submitScore(window.__sum); return { r, last: G.Replay.last && G.Replay.last.id }; });
	// (DLC D16: this build's run, dv 15+, ranks on the new rules' boards: ...:r2:<map>:<diff>[:time])
	const aliceT = row('runboard:micasurvivor_expedition:r2:viridian:normal:time') || [];
	const aRow = aliceT.find(e => e.name === 'alice');
	A(sb.r && sb.r.ok && sb.r.time && sb.r.time.better && aRow && aRow.time === 1000 && aRow.medal === 4 && aRow.replay && aRow.replay === sb.last && row('msurvreplay:' + aRow.replay).by === 'alice',
		'G.Exp.submitScore: the won run lands on the Score and Time-attack boards with its parts, its medal and its own uploaded replay', JSON.stringify(sb).slice(0, 400));
	const sentBody = (apiLog.filter(e => e.action === 'run-score' && e.mode === 'micasurvivor_expedition').pop() || {}).body || {};
	A(sentBody.zone === 4 && sentBody.won === true && Number.isInteger(sentBody.dmg) && sentBody.catches === 1 && sentBody.dv === 18 && sentBody.diff === 'normal', 'what the client sent: its parts (whole numbers), dv 9, the tier', JSON.stringify(sentBody));

	// ======================== 2. Hard (picked in the panel), then Nightmare
	const pk = await E(page, async () => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		window.__t.thaw(); G.ModesUI.open(); await wait(150);
		document.getElementById('modes-tier-pick').click(); await wait(300);
		document.querySelector('[data-tier="hard"]').click(); await wait(150);
		const out = { pick: G.ExpTier.pick().diff, on: document.querySelector('[data-tier="hard"]').classList.contains('on') };
		G.ExpTier.close(); await wait(100);
		out.btn = document.getElementById('modes-tier-pick').innerText.trim();
		G.UI.show('scr-menu', true);
		return out;
	});
	A(pk.pick === 'hard' && pk.on && pk.btn === 'Difficulty: Hard · leaderboards', 'unlocked, Hard can be chosen in the panel; the button says "Difficulty: Hard"', JSON.stringify(pk));
	const rH = await startClassic(page);
	const hS = await E(page, () => {
		const H = window.__t, C = G.ExpClassic;
		const foe = H.foeStats(10);
		const snap = JSON.parse(JSON.stringify(G.Spectate.snap()));
		const line = C.hudLine(G.Game.player);
		const wk = H.wake();
		return { foe, snap: { dv: snap.dv, x: snap.x && { xv: snap.x.xv, c: snap.x.c } }, line, wk, seed: G.World.seed };
	});
	A(rH.ok && rH.diff === 'hard' && rH.cdiff === 'hard', 'a Classic run starts on Hard', JSON.stringify(rH));
	const ratio = (a, b) => +(a / b).toFixed(3);
	A(hS.foe && ratio(hS.foe.hp, nS.foe.hp) >= 1.39 && ratio(hS.foe.hp, nS.foe.hp) <= 1.41 && Math.abs(ratio(hS.foe.dmg, nS.foe.dmg) - 1.42) < 0.01 && Math.abs(ratio(hS.foe.spd, nS.foe.spd) - 1.08) < 0.01 && Math.abs(hS.foe.xp / nS.foe.xp - 1.15) < 0.1,
		'Hard: the same foe has x1.4 HP, x1.42 damage, x1.08 speed, x1.15 XP', JSON.stringify([nS.foe, hS.foe]));
	A(hS.wk.boss && hS.wk.escorts === 1 && ratio(hS.wk.bossDmg, nS.wk.bossDmg || 1) > 1.3, 'Hard: the guardian wakes with 1 escort (an elite) and x1.42 damage', JSON.stringify([nS.wk, hS.wk]));
	A(/HARD/.test(hS.line), 'Hard: the HUD line shows HARD', hS.line);
	A(hS.snap.dv === 18 && hS.snap.x && hS.snap.x.xv === 10 && hS.snap.x.c && hS.snap.x.c.d === 1, 'sync: the snapshot carries dv 17 and the tier as c.d = 1 (the x block v10)', JSON.stringify(hS.snap));
	const wH = await E(page, () => { window.__t.win(1300); return { unl: G.ExpTier.unlocked('viridian'), out: window.__out, medal: G.ExpTier.medal('viridian', 'hard') }; });
	A(wH.unl === 2 && wH.out.unlocked === 'nightmare' && wH.medal === 3 && wH.out.medal.id === 'gold', 'a Hard win at 21:40: Gold (< 24:36 on Hard) and Nightmare unlocks', JSON.stringify(wH));
	await E(page, () => G.ExpTier.setPick('viridian', 'nightmare'));
	const rX = await startClassic(page);
	const xS = await E(page, () => {
		const H = window.__t, C = G.ExpClassic;
		const foe = H.foeStats(10);
		// the trickle for 90 s (before any timeline elite wave): its elites
		H.wipe(); C.run.acc = 0; H.go(0, 0);
		const seen = new Set();
		for (let i = 0; i < 90; i++) { H.step(30); for (const e of G.EnemyMgr.all()) if (e.xk === 'elite' && !e.xescort) seen.add(e.id); }
		const wk = H.wake();
		return { foe, elites: seen.size, wk };
	});
	A(rX.ok && rX.diff === 'nightmare' && xS.foe && Math.abs(ratio(xS.foe.hp, nS.foe.hp) - 1.9) < 0.02 && Math.abs(ratio(xS.foe.dmg, nS.foe.dmg) - 1.96) < 0.01 && Math.abs(ratio(xS.foe.spd, nS.foe.spd) - 1.16) < 0.01,
		'Nightmare: x1.9 HP, x1.96 damage, x1.16 speed', JSON.stringify(xS.foe));
	A(xS.elites >= 1 && xS.wk.escorts === 2, 'Nightmare: the trickle sends elites (+8 %) and the guardian comes with 2 escorts', JSON.stringify(xS));
	// Normal again: no trickle elites in the same 90 s
	await E(page, () => G.ExpTier.setPick('viridian', 'normal'));
	await startClassic(page);
	const nE = await E(page, () => { const H = window.__t; H.wipe(); G.ExpClassic.run.acc = 0; H.go(0, 0); const seen = new Set(); let n = 0; for (let i = 0; i < 90; i++) { H.step(30); for (const e of G.EnemyMgr.all()) { if (e.xk === 'elite') seen.add(e.id); n = Math.max(n, G.EnemyMgr.count); } } return { elites: seen.size, peak: n }; });
	A(nE.elites === 0, 'Normal: no trickle elites', JSON.stringify(nE));
	await E(page, async () => { window.__t.thaw(); G.Game.quit(); await new Promise(r => setTimeout(r, 300)); });

	// ======================== 3b. the save merges on the server (tier / medal counters: max)
	await E(page, () => G.ExpSave.flush());
	await waitFor(() => { const r = row('micasurvivorexp:alice'); return r && r.save.counters['tier.viridian'] === 2; }, 8000);
	const xs = row('micasurvivorexp:alice');
	A(xs && xs.save.counters['tier.viridian'] === 2 && xs.save.counters['medal.viridian.normal'] === 4 && xs.save.counters['medal.viridian.hard'] === 3,
		'the Expedition save on the server: tier.viridian 2, medal.viridian.normal 4, .hard 3 (max-merged counters)', JSON.stringify(xs && xs.save.counters));
	const lower = await raw('micasurvivor-exp-save-put', { save: { v: 1, counters: { 'tier.viridian': 0, 'medal.viridian.normal': 1 }, sets: {} }, rev: xs.rev }, tokens.alice);
	A(lower.status === 200 && row('micasurvivorexp:alice').save.counters['tier.viridian'] === 2 && row('micasurvivorexp:alice').save.counters['medal.viridian.normal'] === 4, 'a put from a device with less (tier 0, bronze) takes nothing away', JSON.stringify(lower.body).slice(0, 200));

	// ======================== 4. the boards in the panel (the real server), the season, the ribbon
	const sid = XT.seasonOf(NOW).id;
	// last season: alice was #2 on Normal (a row as the server writes it), so she earns the Elite ribbon
	put('msurvseason:' + (sid - 1) + ':r2:viridian:normal', [{ name: 'bob', score: 90000, time: 1500 }, { name: 'alice', score: 80000, time: 1400 }, { name: 'carl', score: 100, time: 99 }]);
	// (DLC D16: the panel reads the new rules' boards; the marks part 1 sent (dv 8, the legacy boards) are copied there as a
	//  dv-15 client's would be, so the panel has a board to show. Its "Legacy" chip reads the old keys: checked below.)
	for (const k of ['', ':time']) { const old = row('runboard:micasurvivor_expedition:viridian:normal' + k) || [], nw = row('runboard:micasurvivor_expedition:r2:viridian:normal' + k) || []; put('runboard:micasurvivor_expedition:r2:viridian:normal' + k, nw.concat(old.filter(e => !nw.some(n => n.name === e.name)))); }
	const bd = await E(page, async () => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		const until = async (f, ms = 4000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await wait(60); } return false; };
		window.__t.thaw(); G.ModesUI.open(); await wait(150);
		document.getElementById('modes-tier-pick').click(); await wait(200);
		const out = {};
		const list = () => [...document.querySelectorAll('#xt-list .rk-row')].map(r => r.innerText.replace(/\s+/g, ' ').trim());
		await until(() => list().length > 0);
		out.score = { rows: list(), me: document.getElementById('xt-me').innerText };
		document.querySelector('[data-view="time"]').click();
		await until(() => list().length > 0 && /16:40/.test(list().join()));
		out.time = { rows: list(), me: document.getElementById('xt-me').innerText, watch: !!document.querySelector('#xt-list a.xt-watch'), medal: !!document.querySelector('#xt-list .rk-row .time img, #xt-list .rk-row .time canvas, #xt-list .rk-row .time svg, #xt-list .rk-row .time i, #xt-list .rk-row .time span') };
		// (DLC D16) the "Legacy" chip: the boards from before the new rules (alice's dv-15 run is not there)
		document.querySelector('[data-view="score"]').click();
		await until(() => list().length > 0);
		document.querySelector('[data-legacy]').click();
		await until(() => document.querySelector('[data-legacy]').classList.contains('on') && list().length > 0 && !list().some(r => /16:40/.test(r)));
		out.legacy = { on: document.querySelector('[data-legacy]').classList.contains('on'), rows: list() };
		document.querySelector('[data-legacy]').click();
		await until(() => !document.querySelector('[data-legacy]').classList.contains('on'));
		return out;
	});
	A(bd.score && bd.score.rows.length >= 4 && bd.score.rows.some(r => /alice/.test(r)) && /Your best rank: #\d+/.test(bd.score.me), 'the Score board in the panel: the real server\'s top for Viridian Forest · Normal and your rank', JSON.stringify(bd.score).slice(0, 400));
	A(bd.legacy && bd.legacy.on && bd.legacy.rows.length > 0 && !bd.legacy.rows.some(r => /16:40/.test(r)), 'its "Legacy" chip shows the board from before the new rules (DLC D16), without this build\'s run', JSON.stringify(bd.legacy));
	A(bd.time && bd.time.rows.length >= 1 && /alice/.test(bd.time.rows.join()) && /16:40/.test(bd.time.rows.join()) && bd.time.watch && /Your best rank: #1 · 16:40/.test(bd.time.me), 'the Time-attack board: alice\'s 16:40 with her medal and a Watch link to its replay', JSON.stringify(bd.time).slice(0, 400));
	await shoot(page, 'tiers-desktop-board-time.png');
	// the Season tab is hidden by default (owner decision #8: no weekly seasons for now) — the panel shows Score + Time attack only
	const hid = await E(page, () => ({ tab: !!document.querySelector('[data-view="season"]'), ribbons: document.getElementById('xt-ribbons').classList.contains('hidden'), flag: G.ExpTier.K.SEASON_TAB }));
	A(hid.flag === false && !hid.tab && hid.ribbons, 'the Season tab and the ribbon chip are hidden (SEASON_TAB off)', JSON.stringify(hid));
	// (the view still works when switched on: the rest of this section turns it on)
	await E(page, async () => { G.ExpTier.K.SEASON_TAB = true; document.querySelector('[data-view="score"]').click(); await new Promise(r => setTimeout(r, 250)); });
	const ss = await E(page, async () => {
		const wait = ms => new Promise(r => setTimeout(r, ms));
		const until = async (f, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await wait(60); } return false; };
		const t0 = G.ExpSave.list('season.prize').length;
		document.querySelector('[data-view="season"]').click();
		await until(() => /Last season/.test(document.getElementById('xt-season').innerText));
		const head = document.getElementById('xt-season').innerText.replace(/\s+/g, ' ');
		const out = { head, rows: [...document.querySelectorAll('#xt-list .rk-row')].map(r => r.innerText.replace(/\s+/g, ' ')), prizes: G.ExpSave.list('season.prize'), best: G.ExpSave.get('season.best'), t0, ribbons: document.getElementById('xt-ribbons').innerText };
		// looking again claims nothing more
		document.querySelector('[data-view="score"]').click(); await wait(200);
		document.querySelector('[data-view="season"]').click();
		await until(() => /Last season/.test(document.getElementById('xt-season').innerText));
		out.again = G.ExpSave.list('season.prize').length;
		return out;
	});
	A(ss.head && new RegExp('Season ' + sid + ' · ends in \\d+ d \\d+ h').test(ss.head) && /Season prizes \(cosmetic ribbons only, earned by playing\)/.test(ss.head) && /Master #1/.test(ss.head) && /Elite #2–3/.test(ss.head) && /Top 50/.test(ss.head),
		'the Season view: "Season 2 · ends in N d N h", the prize ladder (cosmetic ribbons only: Master, Elite, Top 10, 25, 50)', ss.head);
	A(ss.rows && ss.rows.some(r => /alice/.test(r)), 'this week\'s board lists alice\'s run', JSON.stringify(ss.rows).slice(0, 300));
	A(/Last season: #2 · Elite ribbon/.test(ss.head) && ss.t0 === 0 && JSON.stringify(ss.prizes) === JSON.stringify(['s' + (sid - 1) + '.viridian.normal.elite']) && ss.best === 4 && /Your ribbons: Elite ×1/.test(ss.ribbons) && ss.again === 1,
		'last season\'s #2 earns the Elite ribbon into the Expedition save (season.prize, season.best 4), once', JSON.stringify(ss));
	await shoot(page, 'tiers-desktop-season.png');
	await E(page, () => { G.ExpTier.close(); G.UI.show('scr-menu', true); });
	A(apiLog.filter(e => e.action === 'run-leaderboard' && e.mode === 'micasurvivor_expedition').every(e => !e.body.season || Number.isInteger(e.body.season)), 'the panel reads only Expedition views (score / time / season)');

	// ======================== 5. sync: a fresh viewer page; the replay header; an old dv-7 snapshot
	const d1 = await bootPage({ save: SAVE('viewer') });
	const vw = await E(d1.page, async (snapX, seed, rid) => {
		const out = { loadedBefore: G.Expedition.loaded };
		await G.Expedition.load();
		const pup = new G.Player(G.DEX_BY[1], {}, false); pup.remote = true;
		G.World.reset(seed);
		G.Exp.applyX(seed, snapX);
		G.Exp.viewAir({ x: snapX, dv: 8 }, pup, null);
		const C = G.ExpClassic, cur = C.cur();
		out.view = { diff: cur && cur.diff, line: C.hudLine(pup, { time: 0 }) };
		const z = G.World.zone, P = C.plan(z.seed, z.map, z.zone, 'hard'), N = C.plan(z.seed, z.map, z.zone, 'normal');
		out.planHard = P.events[0].at < N.events[0].at || P.events.some((e, i) => e.at < N.events[i].at);
		out.old = { ok: G.Expedition.replayOk(7), notice: G.Expedition.viewNotice('exp-classic', 7), newer: G.Expedition.viewNotice('exp-classic', G.Expedition.DV + 1) };
		const r = await G.Replay.fetchShared(rid);
		out.rep = r.ok ? { mode: r.meta.mode, diff: r.meta.diff, map: r.meta.map, dv: r.meta.dv } : { err: r.error };
		return out;
	}, { xv: 8, m: 'viridian', z: 1, th: '', c: hS.snap.x.c }, hS.seed, aRow ? aRow.replay : 'none');
	A(vw.loadedBefore === false && vw.view && vw.view.diff === 'hard' && /HARD/.test(vw.view.line) && vw.planHard,
		'a fresh viewer page: the x block\'s c.d gives the tier (its HUD shows HARD; it plans the Hard timeline)', JSON.stringify(vw).slice(0, 400));
	A(vw.old && vw.old.ok && !vw.old.notice && vw.old.newer, 'an old dv-7 replay / snapshot still plays with no notice; a newer dv gets one', JSON.stringify(vw.old));
	A(vw.rep && vw.rep.mode === 'exp-classic' && vw.rep.diff === 'normal' && vw.rep.map === 'viridian' && vw.rep.dv === 18, 'the board\'s replay carries the mode, map, tier and dv 17', JSON.stringify(vw.rep));
	await d1.ctx.close();

	// ======================== 6. phone and desktop: the panel fits
	for (const [tag, view] of [['desktop', null], ['phone', { width: 844, height: 390, deviceScaleFactor: 2, isMobile: true, hasTouch: true }]]) {
		const d = tag === 'desktop' ? d0 : await bootPage({ user: 'alice', token: tokens.alice, state: states.alice, save: SAVE('alice') }, view);
		if (tag === 'phone') await prep(d.page);
		for (const v of ['score']) {
			const lay = await E(d.page, async v => {
				const wait = ms => new Promise(r => setTimeout(r, ms));
				const until = async (f, ms = 5000) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { if (f()) return true; await wait(60); } return false; };
				window.__t.thaw();
				if (!G.UI.isOpen('scr-modes')) { G.ModesUI.open(); await wait(150); }
				if (!G.ExpTier.shown) { document.getElementById('modes-tier-pick').click(); await wait(250); }
				document.querySelector('[data-view="' + v + '"]').click();
				await until(() => document.querySelectorAll('#xt-list .rk-row').length > 0);
				await wait(200);
				const W = innerWidth, Hh = innerHeight, r = el => { const b = el.getBoundingClientRect(); return { x: b.left, y: b.top, w: b.width, h: b.height }; };
				const cards = [...document.querySelectorAll('#modes-xtier [data-tier]')].map(r);
				const box = document.querySelector('#scr-modes .modes-box');
				return { W, Hh, touch: G.Touch.active, cards, side: document.documentElement.scrollWidth - W, boxSide: box.scrollWidth - box.clientWidth, back: r(document.getElementById('xt-back')), list: r(document.getElementById('xt-list')), rows: document.querySelectorAll('#xt-list .rk-row').length };
			}, v);
			const inW = b => b && b.x >= -1 && b.x + b.w <= lay.W + 1;
			A(lay.cards && lay.cards.length === 3 && lay.cards.every(inW) && lay.side <= 0 && lay.boxSide <= 1 && inW(lay.back) && lay.back.y >= -1 && lay.back.y + lay.back.h <= lay.Hh && lay.rows > 0 && lay.list.w > 200,
				`${tag} (${lay.W}x${lay.Hh}${lay.touch ? ', touch' : ''}): the panel fits (3 tier cards across, Back on screen, the ${v} board listed, no sideways scroll)`, JSON.stringify(lay).slice(0, 500));
			await shoot(d.page, `tiers-${tag}-${v === 'score' ? 'picker-board' : 'season'}.png`);
		}
		if (tag === 'phone') {
			// the run-over medal on the phone
			await E(d.page, () => { G.ExpTier.close(); G.UI.show('scr-menu', true); });
			await startClassic(d.page);
			await E(d.page, () => window.__t.win(1500));
			const oP = await overText(d.page);
			A(/Medal\s+Silver · 25:00/i.test(oP) && /Next: Gold under 23:00/.test(oP), 'phone: a won run\'s medal on the run-over screen (25:00 on Normal: Silver)', oP.slice(0, 300));
			await shoot(d.page, 'tiers-phone-runover-medal.png');
			await d.ctx.close();
		}
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
