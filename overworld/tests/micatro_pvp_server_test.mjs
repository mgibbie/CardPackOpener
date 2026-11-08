// micatro_pvp_server_test.mjs — Micatro Multiplayer (PvP): the lobby + match referee (server/micatro_pvp.mjs, routed
// from server/mp.mjs) run in-process over sqlite, like micatro_server_test.
//   1. the pure rules: scoreCmp (plain / e-notation / big / Infinity), the 2-player round resolver matrix
//      (resolve2p), the pending-death table (decidePending), lobby option validation
//   2. lobby: create (protocol check, a 5-letter code without I/O/0/1, mtpvpcode + mtpvpcur rows), peek, join
//      (pins mismatch -> 409 "reload", full lobby, rejoin), guest ready, host options, start
//   3. the match: READY handshake + countdown, hand reports -> round results, lives (once per round), a tie,
//      the leader-out-first case, a failed normal blind costs a life once, PvP last life ends the match
//   4. pending death: beat / skip / fail-with-lives / fail-on-last-life (draw) / already played / opponent leaves
//   5. disconnects: the 120 s forfeit clock (lazy), the dead player leaving is not a forfeit; forfeit; rematch; leave
//   6. sync: the opponent's summary by seq, unchanged delta, write budget; presence + friends + live-friends;
//      publish-micatro's PvP status; GC + rate-limit registration
//   node overworld/tests/micatro_pvp_server_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';

process.env.MP_GC_RATE = '0';
process.env.MTPVP_COUNTDOWN_MS = '3000';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- 1. pure rules ----------
const R = await import(pathToFileURL(path.join(ROOT, 'server/micatro_pvp.mjs')).href);
{
	const { scoreCmp, resolve2p, decidePending, cleanOpts, pinSig } = R;
	A(scoreCmp('100', '99') > 0 && scoreCmp('99', '100') < 0 && scoreCmp('100', '100') === 0, 'scoreCmp: plain numbers');
	A(scoreCmp('1.5e+25', '9e24') > 0 && scoreCmp('1e+25', '10000000000000000000000000') === 0, 'scoreCmp: e-notation compares by value');
	A(scoreCmp('1.5e450', '9e449') > 0 && scoreCmp('1e400', '1e+300') > 0 && scoreCmp('2e450', '2e450') === 0, 'scoreCmp: big (past 1e308) scores');
	A(scoreCmp('Infinity', '9.99e999') > 0 && scoreCmp('0', '1') < 0, 'scoreCmp: naneinf tops everything, 0 is lowest');
	const S = (s, h) => ({ s, h });
	const M = [
		[S('100', 3), S('50', 0), { loser: 'b' }, 'the trailer is out of hands -> it loses'],
		[S('100', 0), S('50', 2), null, 'the leader is out first -> the trailer keeps playing'],
		[S('100', 0), S('150', 1), { loser: 'a' }, 'the trailer passes an out-of-hands leader -> the round ends at once'],
		[S('100', 0), S('100', 0), { tie: true }, 'both out, exact tie -> nobody loses'],
		[S('100', 0), S('100', 2), null, 'a tie while one still has hands -> keep playing'],
		[S('80', 0), S('90', 0), { loser: 'a' }, 'both out -> the lower score loses'],
		[S('0', null), S('0', 0), null, 'no report yet from one side -> keep playing'],
		[S('1e400', 0), S('9e399', 0), { loser: 'b' }, 'big scores resolve too'],
	];
	for (const [a, b, want, why] of M) A(JSON.stringify(resolve2p(a, b)) === JSON.stringify(want), 'resolve2p: ' + why, JSON.stringify(resolve2p(a, b)));
	const P = [
		[{ result: 'b', lives: 2, present: true }, 'win', 'opp', 'the opponent beats (or skips) the blind -> the opponent wins'],
		[{ result: 'f', lives: 1, present: true }, 'win', 'opp', 'the opponent fails it with lives left -> the opponent wins'],
		[{ result: 'f', lives: 0, present: true }, 'draw', null, 'the opponent fails it on their last life -> draw'],
		[{ result: undefined, lives: 2, present: false }, 'win', 'dead', 'the opponent leaves before playing it -> the dead player wins'],
		[{ result: undefined, lives: 2, present: true }, 'pending', null, 'not played yet -> pending'],
	];
	for (const [o, outc, w, why] of P) { const d = decidePending(o); A(d.outcome === outc && d.winner === w, 'decidePending: ' + why, JSON.stringify(d)); }
	const o = cleanOpts({ lives: 99, pvpStart: 0, deathOnLoss: false, seed: 'ab c', stake: 9, back: 'b_<x>' });
	A(o.lives === 4 && o.pvpStart === 2 && o.deathOnLoss === false && o.comeback === true && o.seed === '' && o.stake === 1 && o.back === 'b_red', 'cleanOpts: out-of-range values fall back to the defaults', JSON.stringify(o));
	A(cleanOpts({ lives: 2, pvpStart: 3, seed: 'pvp12', stake: 'stake_mod_x' }).seed === 'PVP12' && cleanOpts({ stake: 'stake_mod_x' }).stake === 'stake_mod_x', 'cleanOpts: a custom seed (upper-cased) and a mod stake key are kept');
	A(pinSig({ engineRev: 3, modVersions: { b: '1', a: '2' } }) === 'e3|a=2,b=1', 'pinSig is canonical (sorted)');
}

// ---------- the handler over sqlite ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const writes = [];
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { if (/^\s*INSERT/i.test(sql)) writes.push(String(bound[0])); return stmt.run(...bound); },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-mtpvp-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let clock = Date.now();
globalThis.__msurvClock = () => clock;
let ipN = 0;
const raw = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return { status: res.status, body: await res.json() };
};
const T = {};
const reg = async (n) => { T[n] = (await raw('register', { username: n, password: 'pvp-pass-12' })).body.token; };
const PINS = { engineRev: 3, modVersions: { pokermon: '3.9.1+r60' } };
const MODS = { ids: ['pokermon'], options: { pokermon: { 'content:j_poke_x': false } }, pins: PINS };
const PV = R.MTPVP_PROTOCOL;
const as = (who) => ({ call: (a, b = {}) => raw(a, b, T[who]) });

const newMatch = async (h, g, opts = {}) => {
	const c = (await as(h).call('mtpvp-create', { pv: PV, mods: MODS, opts })).body.lobby;
	await as(g).call('mtpvp-join', { code: c.code, pv: PV, pins: PINS });
	await as(g).call('mtpvp-update', { id: c.id, ready: true });
	const s = await as(h).call('mtpvp-update', { id: c.id, start: true });
	return s.body.lobby;
};
const ready2 = async (id, a, b, ante) => { await as(a).call('mtpvp-ready', { id, ante, ready: true }); return (await as(b).call('mtpvp-ready', { id, ante, ready: true })).body; };
const hand = (who, id, ante, score, hands, n) => as(who).call('mtpvp-hand', { id, ante, score: String(score), hands, n });
const blind = (who, id, ante, slot, result) => as(who).call('mtpvp-blind', { id, ante, slot, result });
const lobbyOf = (id) => row('mtpvp:' + id);

try {
	for (const n of ['alice', 'bob', 'carol', 'dave', 'erin', 'fred']) await reg(n);
	A(Object.values(T).every(Boolean), 'test accounts register');
	await raw('add-friend', { username: 'alice' }, T.carol);

	// ===== 2. lobby =====
	const bad = await as('alice').call('mtpvp-create', { pv: 0, mods: MODS });
	A(bad.status === 409 && /reload/.test(bad.body.error), 'create with an old protocol -> 409 reload', JSON.stringify(bad.body));
	const cr = await as('alice').call('mtpvp-create', { pv: PV, mods: MODS, opts: { lives: 3, pvpStart: 2 } });
	const L = cr.body.lobby;
	A(cr.status === 200 && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(L.code) && /^[0-9a-f]{12}$/.test(L.id), 'create -> a 5-letter code (no I/O/0/1) + a lobby id', JSON.stringify(cr.body).slice(0, 200));
	A(row('mtpvpcode:' + L.code)?.id === L.id && row('mtpvpcur:alice')?.id === L.id && row('mtpvp:' + L.id)?.host === 'alice', 'rows: mtpvpcode:<CODE>, mtpvpcur:<user>, mtpvp:<id>');
	A(L.opts.lives === 3 && L.mods.ids[0] === 'pokermon' && L.mods.options.pokermon['content:j_poke_x'] === false, 'the lobby carries the host options and mod set (+ content switches)');
	const pk = await as('bob').call('mtpvp-peek', { code: L.code.toLowerCase() });
	A(pk.status === 200 && pk.body.lobby.id === L.id && pk.body.lobby.mods.pins.modVersions.pokermon === '3.9.1+r60' && !pk.body.full, 'peek by code (any case) shows the mods + pins before joining');
	A((await as('bob').call('mtpvp-peek', { code: 'ZZZZZ' })).status === 404, 'peek: an unknown code -> 404');
	const mism = await as('bob').call('mtpvp-join', { code: L.code, pv: PV, pins: { engineRev: 3, modVersions: { pokermon: '3.9.0' } } });
	A(mism.status === 409 && /reload/.test(mism.body.error), 'join with different mod pins -> 409 reload to update', JSON.stringify(mism.body));
	const mism2 = await as('bob').call('mtpvp-join', { code: L.code, pv: PV, pins: { engineRev: 2, modVersions: PINS.modVersions } });
	A(mism2.status === 409, 'join on another engine rules rev -> 409');
	const jn = await as('bob').call('mtpvp-join', { code: L.code, pv: PV, pins: PINS });
	A(jn.status === 200 && jn.body.lobby.guest === 'bob' && row('mtpvpcur:bob')?.id === L.id, 'join with matching pins -> the guest seat', JSON.stringify(jn.body).slice(0, 160));
	const full = await as('carol').call('mtpvp-join', { code: L.code, pv: PV, pins: PINS });
	A(full.status === 409 && /full/.test(full.body.error), 'a third player -> lobby full');
	const rj = await as('bob').call('mtpvp-join', { code: L.code, pv: PV, pins: PINS });
	A(rj.status === 200 && rj.body.rejoined, 'joining again (a reload) rejoins');
	const early = await as('alice').call('mtpvp-update', { id: L.id, start: true });
	A(early.status === 409 && /not ready/.test(early.body.error), 'start before the guest is ready -> 409');
	A((await as('bob').call('mtpvp-update', { id: L.id, start: true })).status === 403, 'only the host starts');
	await as('bob').call('mtpvp-update', { id: L.id, ready: true });
	const ch = await as('alice').call('mtpvp-update', { id: L.id, opts: { lives: 4 } });
	A(ch.body.lobby.opts.lives === 4 && ch.body.lobby.gready === false, 'a host option change un-readies the guest');
	await as('bob').call('mtpvp-update', { id: L.id, ready: true });
	const st = await as('alice').call('mtpvp-update', { id: L.id, start: true });
	const m0 = st.body.lobby.m;
	A(st.status === 200 && m0 && m0.n === 1 && /^[A-Z1-9]{8}$/.test(m0.seed) && m0.lives.alice === 4 && m0.lives.bob === 4, 'start -> a match: server-picked 8-char seed, lives from the options', JSON.stringify(m0).slice(0, 200));
	A((await as('alice').call('mtpvp-update', { id: L.id, opts: { lives: 2 } })).status === 409, 'options are locked once the match started');

	// ===== 3. the match =====
	const r1 = await as('alice').call('mtpvp-ready', { id: L.id, ante: 2, ready: true });
	A(r1.body.lobby.m.round.ante === 2 && !r1.body.lobby.m.round.startAt, 'one READY -> waiting for the other');
	const r2 = await as('bob').call('mtpvp-ready', { id: L.id, ante: 2, ready: true });
	A(r2.body.lobby.m.round.startAt === clock + 3000 && r2.body.now === clock, 'both READY -> a start time 3 s ahead (+ the server clock)', JSON.stringify(r2.body.lobby.m.round));
	A((await hand('alice', L.id, 1, 5, 4, 0)).status === 409, 'a report for another ante is refused');
	await hand('alice', L.id, 2, 0, 4, 0); await hand('bob', L.id, 2, 0, 4, 0);
	await hand('alice', L.id, 2, 300, 3, 1);
	await hand('bob', L.id, 2, 100, 0, 1);
	let m = lobbyOf(L.id).m;
	A(m.round.res && m.round.res.loser === 'bob' && m.lives.bob === 3 && m.lives.alice === 4, 'the trailer runs out of hands -> they lose a life', JSON.stringify(m.round));
	A(m.hist.length === 1 && m.hist[0].s.alice === '300' && m.hist[0].loser === 'bob', 'the round goes into the history (end screen)');
	await hand('alice', L.id, 2, 900, 0, 2);
	A(lobbyOf(L.id).m.lives.bob === 3, 'a decided round never takes a second life');
	await ready2(L.id, 'alice', 'bob', 3);
	await hand('alice', L.id, 3, 500, 0, 1);
	await hand('bob', L.id, 3, 400, 2, 1);
	A(!lobbyOf(L.id).m.round.res, 'leader out of hands, trailer behind with hands -> still playing');
	await hand('bob', L.id, 3, 300, 1, 0);
	A(lobbyOf(L.id).m.round.scores.bob.s === '400', 'a late, older report (lower n) is dropped');
	await hand('bob', L.id, 3, 501, 1, 2);
	m = lobbyOf(L.id).m;
	A(m.round.res.loser === 'alice' && m.lives.alice === 3, 'the trailer passes the out-of-hands leader -> the leader loses at once', JSON.stringify(m.round));
	await ready2(L.id, 'alice', 'bob', 4);
	await hand('alice', L.id, 4, 700, 0, 1); await hand('bob', L.id, 4, 700, 0, 1);
	m = lobbyOf(L.id).m;
	A(m.round.res && m.round.res.loser === '' && m.lives.alice === 3 && m.lives.bob === 3, 'an exact tie with both out -> nobody loses a life');
	await blind('bob', L.id, 5, 'Small', 'fail');
	await blind('bob', L.id, 5, 'Small', 'fail');
	A(lobbyOf(L.id).m.lives.bob === 2, 'a failed normal blind costs one life, once', lobbyOf(L.id).m.lives.bob);
	await blind('bob', L.id, 5, 'Big', 'beat');
	A(lobbyOf(L.id).m.res.bob['5:Big'] === 'b', 'a beaten blind is recorded (for a pending death)');
	await ready2(L.id, 'alice', 'bob', 5);
	await hand('alice', L.id, 5, 100, 0, 1); await hand('bob', L.id, 5, 50, 0, 1);
	await ready2(L.id, 'alice', 'bob', 6);
	await hand('alice', L.id, 6, 100, 0, 1); await hand('bob', L.id, 6, 50, 0, 1);
	m = lobbyOf(L.id).m;
	A(m.lives.bob === 0 && m.over && m.over.winner === 'alice' && m.over.why === 'lives', 'the last life lost in a Nemesis round ends the match', JSON.stringify(m.over));
	A((await ready2(L.id, 'alice', 'bob', 7)).lobby.m.round.ante === 6, 'no new round once the match is over');

	// ===== 5a. rematch =====
	const rm1 = await as('alice').call('mtpvp-rematch', { id: L.id });
	A(rm1.body.lobby.m.n === 1 && rm1.body.lobby.m.rematch.alice, 'one rematch press -> waiting');
	const rm2 = await as('bob').call('mtpvp-rematch', { id: L.id });
	A(rm2.body.lobby.m.n === 2 && !rm2.body.lobby.m.over && rm2.body.lobby.m.lives.bob === 4 && rm2.body.lobby.m.seed !== m.seed, 'both press -> match 2: fresh lives, a new seed');

	// ===== 4. pending death =====
	const pend = async (o, label, expect) => {
		const lb = await newMatch('carol', 'dave', { lives: 1 });
		if (o.before) await o.before(lb.id);
		await blind('dave', lb.id, 1, 'Big', 'fail');
		let mm = lobbyOf(lb.id).m;
		if (!o.before) A(mm.lives.dave === 0 && mm.pending && mm.pending.dead === 'dave' && mm.pending.key === '1:Big' && !mm.over, label + ': the last life on a normal blind -> pending (not over)', JSON.stringify(mm));
		if (o.after) await o.after(lb.id);
		mm = lobbyOf(lb.id).m;
		A(JSON.stringify(mm.over && { w: mm.over.winner, d: mm.over.draw }) === JSON.stringify(expect), label, JSON.stringify(mm.over));
		await as('carol').call('mtpvp-leave', { id: lb.id }); await as('dave').call('mtpvp-leave', { id: lb.id });
	};
	await pend({ after: (id) => blind('carol', id, 1, 'Big', 'beat') }, 'pending: the opponent beats the same blind -> wins', { w: 'carol', d: false });
	await pend({ after: (id) => blind('carol', id, 1, 'Big', 'skip') }, 'pending: the opponent skips it (counts as beaten) -> wins', { w: 'carol', d: false });
	await pend({ after: (id) => blind('carol', id, 1, 'Big', 'fail') }, 'pending: the opponent fails it on their last life -> draw', { w: '', d: true });
	await pend({ before: (id) => blind('carol', id, 1, 'Big', 'beat') }, 'pending: the opponent already beat it -> wins at once', { w: 'carol', d: false });
	await pend({ after: (id) => blind('carol', id, 1, 'Small', 'beat') }, 'pending: another blind does not settle it', null);
	{
		const lb = await newMatch('erin', 'fred', { lives: 2 });
		await blind('fred', lb.id, 1, 'Small', 'beat');
		await blind('erin', lb.id, 1, 'Small', 'fail');
		await blind('erin', lb.id, 1, 'Big', 'fail');
		A(lobbyOf(lb.id).m.pending?.dead === 'erin' && !lobbyOf(lb.id).m.over, 'pending: erin dies on 1:Big');
		await blind('fred', lb.id, 1, 'Big', 'fail');
		const mm = lobbyOf(lb.id).m;
		A(mm.over && mm.over.winner === 'fred' && mm.lives.fred === 1, 'pending: the opponent fails it with a life left -> the opponent wins', JSON.stringify(mm.over));
		await as('erin').call('mtpvp-leave', { id: lb.id }); await as('fred').call('mtpvp-leave', { id: lb.id });
	}

	// ===== 5. disconnects =====
	{
		const lb = await newMatch('erin', 'fred');
		await as('erin').call('mtpvp-sync', { id: lb.id });
		clock += 60_000;
		await as('erin').call('mtpvp-sync', { id: lb.id });
		A(!lobbyOf(lb.id).m.over, 'an opponent quiet for 60 s has not forfeited (grace 120 s)');
		const s1 = await as('erin').call('mtpvp-sync', { id: lb.id });
		A(s1.body.opp && s1.body.opp.age >= 60_000, 'sync reports how long the opponent has been quiet (the disconnect banner)', JSON.stringify(s1.body.opp));
		clock += 61_000;
		const s2 = await as('erin').call('mtpvp-sync', { id: lb.id });
		const mm = lobbyOf(lb.id).m;
		A(mm.over && mm.over.winner === 'erin' && mm.over.why === 'forfeit' && s2.body.lobby.m.over.winner === 'erin', 'quiet past 120 s -> forfeit, decided lazily by the one still polling', JSON.stringify(mm.over));
		await as('erin').call('mtpvp-leave', { id: lb.id }); await as('fred').call('mtpvp-leave', { id: lb.id });
	}
	{
		// the dead player of a pending death may go: the opponent's result decides; the opponent leaving -> the dead player wins
		const lb = await newMatch('erin', 'fred', { lives: 1 });
		await blind('fred', lb.id, 1, 'Small', 'fail');
		clock += 130_000;
		await as('erin').call('mtpvp-sync', { id: lb.id });
		A(!lobbyOf(lb.id).m.over, 'pending: the dead player going quiet is not a forfeit');
		await blind('erin', lb.id, 1, 'Small', 'beat');
		A(lobbyOf(lb.id).m.over?.winner === 'erin', 'pending: ... the opponent then beats the blind and wins');
		await as('erin').call('mtpvp-leave', { id: lb.id }); await as('fred').call('mtpvp-leave', { id: lb.id });
		const lb2 = await newMatch('erin', 'fred', { lives: 1 });
		await blind('fred', lb2.id, 1, 'Small', 'fail');
		await as('erin').call('mtpvp-forfeit', { id: lb2.id });
		A(lobbyOf(lb2.id).m.over?.winner === 'fred', 'pending: the opponent leaving before playing the blind -> the dead player wins');
		await as('erin').call('mtpvp-leave', { id: lb2.id }); await as('fred').call('mtpvp-leave', { id: lb2.id });
	}
	{
		const lb = await newMatch('erin', 'fred');
		const f = await as('fred').call('mtpvp-forfeit', { id: lb.id });
		A(f.body.lobby.m.over.winner === 'erin' && f.body.lobby.m.over.why === 'forfeit', 'forfeit -> the opponent wins');
		const cm = await as('erin').call('mtpvp-create', { pv: PV, mods: MODS });
		A(cm.status === 200, 'a finished match does not block a new lobby');
		await as('fred').call('mtpvp-leave', { id: lb.id });
		const lb3 = await newMatch('carol', 'dave');
		const busy = await as('carol').call('mtpvp-create', { pv: PV, mods: MODS });
		A(busy.status === 409 && busy.body.id === lb3.id, 'one lobby per player: a live match must be finished first', JSON.stringify(busy.body));
		const lv = await as('carol').call('mtpvp-leave', { id: lb3.id });
		A(lv.body.ok && lobbyOf(lb3.id).m.over?.winner === 'dave', 'leaving a live match forfeits it');
		await as('dave').call('mtpvp-leave', { id: lb3.id });
		await as('erin').call('mtpvp-leave', { id: cm.body.lobby.id });
		A(!row('mtpvpcode:' + cm.body.lobby.code) && lobbyOf(cm.body.lobby.id).closed, "the host leaving a waiting lobby closes it (its code row goes)");
	}
	{
		// a waiting lobby closes once its host stops polling; a quiet guest is dropped
		const c = (await as('erin').call('mtpvp-create', { pv: PV, mods: MODS })).body.lobby;
		await as('fred').call('mtpvp-join', { code: c.code, pv: PV, pins: PINS });
		clock += 50_000; await as('erin').call('mtpvp-sync', { id: c.id });
		const u = await as('erin').call('mtpvp-update', { id: c.id, opts: { lives: 5 } });
		A(u.body.lobby.guest === null, 'a guest quiet for 45 s+ is dropped from a waiting lobby');
		clock += 70_000;
		A((await as('fred').call('mtpvp-peek', { code: c.code })).status === 404, 'a waiting lobby whose host went quiet is closed');
	}

	// ===== 6. sync, presence, budget =====
	await as('alice').call('mtpvp-leave', { id: L.id }); await as('bob').call('mtpvp-leave', { id: L.id });
	{
		const c = (await as('alice').call('mtpvp-create', { pv: PV, mods: MODS })).body.lobby;
		await as('alice').call('mtpvp-sync', { id: c.id });
		let pr = row('presence:alice');
		A(pr && pr.status === 'micatropvp:lobby:' + c.code, 'a waiting lobby: presence micatropvp:lobby:<CODE> (friends see Join)', JSON.stringify(pr));
		const fr = (await raw('friends', {}, T.carol)).body.friends.find((f) => f.username === 'alice');
		A(fr && fr.online && fr.status === 'micatropvp:lobby:' + c.code, 'the friends list passes the lobby status through');
		await as('bob').call('mtpvp-join', { code: c.code, pv: PV, pins: PINS });
		clock += 31_000;
		await as('alice').call('mtpvp-sync', { id: c.id });
		A(row('presence:alice').status === 'micatropvp:full:' + c.code, 'a full lobby is no longer joinable');
		await as('bob').call('mtpvp-update', { id: c.id, ready: true });
		await as('alice').call('mtpvp-update', { id: c.id, start: true });
		const sum = { ante: 1, state: 'SHOP', dollars: 9, lives: 4, jokers: [['j_joker', null]] };
		await as('alice').call('mtpvp-sync', { id: c.id, sum, seq: 5 });
		A(!(row('mtpvpp:' + c.id + ':alice').sum), 'a changed summary within 0.9 s of the last write waits (write floor)');
		clock += 1000;
		await as('alice').call('mtpvp-sync', { id: c.id, sum, seq: 5 });
		const b1 = await as('bob').call('mtpvp-sync', { id: c.id, oseq: 0 });
		A(b1.body.opp && b1.body.opp.name === 'alice' && b1.body.opp.sum.dollars === 9 && b1.body.opp.seq === 5, "the opponent's summary arrives by seq");
		const b2 = await as('bob').call('mtpvp-sync', { id: c.id, oseq: 5, v: b1.body.lobby.v });
		A(b2.body.unchanged && !b2.body.opp.sum, 'same lobby rev + same opponent seq -> a tiny unchanged reply');
		const w0 = writes.length;
		for (let i = 0; i < 4; i++) await as('alice').call('mtpvp-sync', { id: c.id, sum, seq: 5 });
		A(writes.filter((k) => k.startsWith('mtpvp')).length === writes.slice(0, w0).filter((k) => k.startsWith('mtpvp')).length, 'write budget: an unchanged summary within 10 s writes nothing', writes.slice(w0).join(','));
		clock += 11_000;
		await as('alice').call('mtpvp-sync', { id: c.id, sum, seq: 5 });
		A(writes.slice(w0).filter((k) => k === 'mtpvpp:' + c.id + ':alice').length === 1, 'write budget: one heartbeat write per 10 s');
		const big = await as('alice').call('mtpvp-sync', { id: c.id, sum: { x: 'y'.repeat(7000) }, seq: 6 });
		A(big.status === 413, 'an oversized summary -> 413');
		await as('alice').call('mtpvp-sync', { id: c.id, end: { jokers: [['j_joker', 'foil']], deck: [['S_A', 'c_base', null, null]] } });
		const e1 = await as('bob').call('mtpvp-sync', { id: c.id, wantEnd: true });
		A(e1.body.opp.end && e1.body.opp.end.jokers[0][1] === 'foil', "the end screen gets the opponent's jokers + deck");
		const pub = await raw('publish-micatro', { snapshot: { ante: 1 }, label: 'PvP vs bob', seq: 1, pvp: c.id }, T.alice);
		pr = row('presence:alice');
		A(pub.status === 200 && pr.status === 'micatropvp:match:' + c.id + ':PvP vs bob', 'publish-micatro in a match -> presence micatropvp:match:<id>:<label>', JSON.stringify(pr));
		const lf = (await raw('live-friends', {}, T.carol)).body.live;
		A(lf.some((x) => x.username === 'alice' && x.kind === 'micatro'), 'live-friends lists a friend in a PvP match as watchable (kind micatro)', JSON.stringify(lf));
		const mine = await as('bob').call('mtpvp-mine', {});
		A(mine.body.lobby && mine.body.lobby.id === c.id, 'mtpvp-mine finds the match to rejoin after a reload');
		A((await as('carol').call('mtpvp-sync', { id: c.id })).body.closed, 'a non-member cannot sync a lobby');
		A((await as('carol').call('mtpvp-hand', { id: c.id, ante: 2, score: '5', hands: 1, n: 1 })).status === 403, 'a non-member cannot report');
		A((await as('alice').call('mtpvp-hand', { id: c.id, ante: 2, score: 'NaN', hands: 1, n: 1 })).status === 400, 'a malformed score is refused');
	}

	// registration
	const src = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	const gc = src.slice(src.indexOf('const GC_TABLE'), src.indexOf('];', src.indexOf('const GC_TABLE')));
	for (const p of ['mtpvp:', 'mtpvpcode:', 'mtpvpcur:', 'mtpvpp:']) A(gc.includes("['" + p + "'"), 'GC_TABLE sweeps ' + p);
	const rl = src.slice(src.indexOf('const RATE_LIMITS'), src.indexOf('const HIT_LIMIT'));
	for (const a of ['create', 'peek', 'join', 'leave', 'mine', 'update', 'sync', 'ready', 'hand', 'blind', 'forfeit', 'rematch']) A(new RegExp("'mtpvp-" + a + "': \\[\\d+, [\\d_]+\\]").test(rl), 'mtpvp-' + a + ' is rate-limited');
} catch (e) {
	fail++; console.log('FAIL: threw ' + (e && e.stack));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
