// pocketenhanced_server_test.mjs — Pocket Enhanced online: the lobby + match referee (server/pocket_pvp.mjs, routed
// from server/mp.mjs) run in-process over sqlite, with a clock the test moves.
//   1. lobby: create (signed in, a legal deck, protocol check, a 5-letter code), join by code, full / started / bad
//      code, ready, host options, only the host starts, not before everyone is ready
//   2. the match is the SERVER's: each player is sent their own hand and nobody else's, no deck; an action is applied
//      only for the sender's own seat, only if the engine accepts it, only on the position the sender saw
//   3. computer seats are played by the server; a whole 3-seat match (two people + a computer player) plays to its end
//      through the referee, and the recipe sent at the end replays to the same position
//   4. the clock: a player there but idle has the move made for them; a player gone concedes; a host gone closes a
//      waiting lobby; leaving a match concedes
//   node overworld/tests/pocketenhanced_server_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import * as E from '../../pocketenhanced/js/engine/engine.js';
import { nextAction } from '../../pocketenhanced/js/ai.js';
import { starterDeck } from '../../pocketenhanced/js/decks.js';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };

const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { const r = stmt.run(...bound); return { meta: { changes: r.changes } }; },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-pocket-srv-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let clock = Date.now();
// (the rate limits run on Date.now: the test moves it along with the referee's clock, so a test's minutes are real minutes to them)
let rlShift = 0;
{ const realNow = Date.now.bind(Date); Date.now = () => realNow() + rlShift; }
const tick = ms => { clock += ms; rlShift += ms; };
globalThis.__msurvClock = () => clock;
let ipN = 0;
const PV = { pv: 28, ev: E.ENGINE_VERSION };
const call = async (action, body = {}, token, noPv) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...(noPv ? {} : PV), ...body }),
	});
	return (await handler(req, { MP_DB })).json();
};
const tok = {};
for (const n of ['ann', 'ben', 'cat', 'dan', 'eve']) tok[n] = (await call('register', { username: n, password: 'pocket-srv-pass' })).token;
const D = id => starterDeck(id);
const row = k => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };

// ===== 1. the lobby =====
A(!!(await call('pkpvp-create', { size: 3, bots: 1, ...D('charizard') })).error, 'creating a match needs an account');
A(/out of date/.test((await call('pkpvp-create', { size: 2, ...D('charizard'), pv: 0 }, tok.ann)).error || ''), 'an out-of-date client is told to reload');
A(/not legal/.test((await call('pkpvp-create', { size: 2, deck: D('charizard').deck.slice(1), energy: ['Fire'] }, tok.ann)).error || ''), 'an illegal deck is refused, with the reason');
const made = await call('pkpvp-create', { size: 3, bots: 1, ...D('charizard') }, tok.ann);
const L = made.lobby;
A(L && /^[ABCDEFGHJKLMNPQRSTUVWXYZ23456789]{5}$/.test(L.code) && L.host === 'ann' && L.size === 3 && L.bots === 1 && L.players.length === 1 && !L.started, 'ann creates a 3-seat match with one computer player and gets a 5-letter code', made);
A(JSON.stringify(L).indexOf('A1-') < 0, "the lobby everyone sees carries nobody's deck");
A((await call('pkpvp-mine', {}, tok.ann)).lobby.id === L.id && (await call('pkpvp-mine', {}, tok.ben)).lobby === null, 'a player can find the match they are in (after a reload)');
A(/no match/.test((await call('pkpvp-join', { code: 'ZZZZZ', ...D('pikachu') }, tok.ben)).error || '') && /5 letters/.test((await call('pkpvp-join', { code: 'x', ...D('pikachu') }, tok.ben)).error || ''), 'a wrong code finds nothing');
const j = await call('pkpvp-join', { code: L.code.toLowerCase(), ...D('pikachu') }, tok.ben);
A(j.lobby && j.lobby.players.map(p => p.name).join() === 'ann,ben' && j.lobby.players[1].ready === false, 'ben joins with the code (typed in lower case)', j);
A(/full/.test((await call('pkpvp-join', { code: L.code, ...D('mewtwo') }, tok.cat)).error || ''), 'a third person finds it full (two people + the computer player = 3 seats)');
A(/only the host/.test((await call('pkpvp-start', { id: L.id }, tok.ben)).error || '') && /not everyone is ready/.test((await call('pkpvp-start', { id: L.id }, tok.ann)).error || ''), 'only the host starts, and not before everyone is ready');
A(/not in that match/.test((await call('pkpvp-update', { id: L.id, ready: true }, tok.cat)).error || ''), 'someone outside the match cannot change it');
A((await call('pkpvp-update', { id: L.id, ready: true, ...D('blastoise') }, tok.ben)).lobby.players[1].ready === true, 'ben changes his deck and readies up');
{ const u = (await call('pkpvp-update', { id: L.id, bots: 3, size: 1 }, tok.ann)).lobby; A(u.bots === 1 && u.size === 3, 'the host cannot over-fill the match with computer players, or make it smaller than 2 seats', u); }

// ===== 2. the match belongs to the server =====
const st = await call('pkpvp-start', { id: L.id }, tok.ann);
A(st.match && st.match.seat === 0 && st.match.view.players.length === 3 && st.match.view.phase === 'setup', 'ann starts: three seats, in setup', st);
const va = st.match.view, sb = await call('pkpvp-sync', { id: L.id, n: -1 }, tok.ben), vb = sb.match.view;
A(va.players[0].hand.length === 5 && va.players[1].hand === null && va.players[2].hand === null && vb.players[1].hand.length === 5 && vb.players[0].hand === null && sb.match.seat === 1, "each player is sent their own five cards and nobody else's");
A(!JSON.stringify(st.match).includes('"config"') && typeof va.players[0].deck === 'number' && !st.match.recipe, 'no deck and no recipe is sent while the match is on');
A(va.players[2].ai && va.players[2].setup && !va.players[0].setup, 'the computer seat has already set up: the server plays it');
A(/started/.test((await call('pkpvp-join', { code: L.code, ...D('mewtwo') }, tok.cat)).error || '') && /not in that match/.test((await call('pkpvp-sync', { id: L.id }, tok.cat)).error || '') && /not in that match/.test((await call('pkpvp-act', { id: L.id, a: { t: 'concede' } }, tok.cat)).error || ''), 'someone outside the match cannot join, read or act in it');
// acting for another seat: the seat a client sends is ignored
const basicsOf = v => v.players[v.you].hand.map((c, i) => i).slice(0, 1);
void basicsOf;
const setupFor = (v, seat) => nextAction({ ...v, you: seat });
const bad = await call('pkpvp-act', { id: L.id, n: st.match.n, a: { ...setupFor(vb, 1), seat: 0 } }, tok.ben);
A(!bad.refused && bad.match.view.players[1].setup && !bad.match.view.players[0].setup, "an action is applied to the SENDER's seat, whatever seat it names (ben sent seat 0: ben's side set up)", bad.refused);
const ok0 = await call('pkpvp-act', { id: L.id, n: st.match.n, a: setupFor(va, 0) }, tok.ann);
A(!ok0.refused && ok0.match.view.phase === 'main', 'setting up does not wait on anyone (ann set up from the position before ben did); when everyone has, the match begins', ok0.refused);
{
	// in a turn, an action is for the position its sender saw: the same request arriving twice acts once
	const who = ok0.match.view.current === 1 ? tok.ben : tok.ann, seatNow = ok0.match.view.current;
	if (seatNow !== 2) {
		const s0 = await call('pkpvp-sync', { id: L.id }, who), v0 = s0.match.view, canAttach = v0.players[seatNow].zone.cur && !v0.players[seatNow].flags.attached;
		const a = canAttach ? { t: 'attach', at: { seat: seatNow, zone: 'active', idx: v0.players[seatNow].active.findIndex(Boolean) } } : { t: 'playBasic', hand: 99 };
		const first = await call('pkpvp-act', { id: L.id, n: s0.match.n, a }, who), second = await call('pkpvp-act', { id: L.id, n: s0.match.n, a }, who);
		A(canAttach ? (!first.refused && /changed/.test(second.refused || '') && second.match.n === first.match.n) : !!first.refused, 'in a turn, a request that arrives twice acts once: the second is refused and the current position comes back', [first.refused, second.refused]);
	} else A(true, '(the computer player moved first)');
}
const cur = ok0.match.view.current;
const notMine = cur === 0 ? tok.ben : tok.ann;
const r1 = await call('pkpvp-act', { id: L.id, a: { t: 'execute', commands: [null, null] } }, cur === 2 ? tok.ann : notMine);
A(cur === 2 || /not your turn/.test(r1.refused || ''), "a player cannot act on someone else's turn (the engine refuses it)", r1.refused);
A(/not an action/.test((await call('pkpvp-act', { id: L.id, a: { t: 'win' } }, tok.ann)).error || '') && /not an action/.test((await call('pkpvp-act', { id: L.id, a: { t: 'execute', junk: 'x'.repeat(4000) } }, tok.ann)).error || ''), 'unknown or oversized actions are not actions');
A(!/not an action/.test((await call('pkpvp-act', { id: L.id, a: { t: 'stadium' } }, tok.ann)).error || ''), 'the Use of a Stadium is an action the referee takes to the engine (which accepts or refuses it)');
const same = await call('pkpvp-sync', { id: L.id, n: (await call('pkpvp-sync', { id: L.id }, tok.ann)).match.n }, tok.ann);
A(same.match && !same.match.view, 'a sync that already has the position is sent no view (only its number)');

// ===== 3. a whole match through the referee =====
async function playOut(id, people, limit = 1500) {
	let last = null;
	for (let i = 0; i < limit; i++) {
		let moved = false;
		for (const who of people) {
			const s = await call('pkpvp-sync', { id }, tok[who]);
			if (!s.match) return { error: s };
			last = s;
			if (s.match.over) continue;
			const v = s.match.view, seat = s.match.seat;
			const mine = v.pending ? v.pending.seat === seat : v.phase === 'setup' ? !v.players[seat].setup : v.current === seat;
			if (!mine || v.players[seat].eliminated) continue;
			const banned = new Set();
			for (let t = 0; t < 40; t++) {
				const a = nextAction(v, banned) || { t: 'execute', commands: [null, null] };
				const r = await call('pkpvp-act', { id, n: s.match.n, a }, tok[who]);
				if (r.error) return { error: r };
				if (!r.refused) { moved = true; break; }
				banned.add(JSON.stringify(a));
			}
		}
		if (last.match.over) return last;
		tick(1000);
	}
	return { error: 'too long' };
}
const end = await playOut(L.id, ['ann', 'ben']);
A(end.match && end.match.over && end.match.recipe && end.lobby.over, 'two people and a computer player play a whole match through the referee', end.error);
{
	const r = end.match.recipe, S = E.replay(r.config, r.actions);
	A(S.over && S.over.winner === end.match.over.winner && r.actions.every(a => Number.isInteger(a.seat)) && r.config.players.map(p => p.name).join() === 'ann,ben,Blue', "the recipe sent at the end replays to the same result: it is the match's replay", [S.over, end.match.over]);
	const bothSee = await call('pkpvp-sync', { id: L.id }, tok.ben);
	A(bothSee.match.over && bothSee.match.recipe.actions.length === r.actions.length, 'every player gets it');
	A(row('pkpvp:' + L.id).m.actions.length === r.actions.length, "the match is one row: 'pkpvp:<id>'");
}
// a rematch: the host starts again from the same lobby
A((await call('pkpvp-update', { id: L.id, ready: true }, tok.ben)).lobby.players[1].ready, 'after a match the same lobby can be readied again');
const again = await call('pkpvp-start', { id: L.id }, tok.ann);
A(again.match && again.match.n >= 1 && !again.match.over && again.match.view.phase === 'setup', 'the host starts a new match in it (a new seed)');

// ===== 4. the clock =====
{
	// both people set up; then whoever's turn it is goes idle (still polling) past the turn clock
	for (const who of ['ann', 'ben']) { const s = await call('pkpvp-sync', { id: L.id }, tok[who]); await call('pkpvp-act', { id: L.id, n: s.match.n, a: nextAction(s.match.view) }, tok[who]); }
	let s = await call('pkpvp-sync', { id: L.id }, tok.ann);
	A(s.match.view.phase === 'main' && s.match.deadline > clock, 'the match is on; a turn has a deadline');
	const turn0 = s.match.view.turn, seat0 = s.match.view.current;
	for (let i = 0; i < 40; i++) { tick(5000); await call('pkpvp-sync', { id: L.id }, tok.ann); await call('pkpvp-sync', { id: L.id }, tok.ben); }
	s = await call('pkpvp-sync', { id: L.id }, tok.ann);
	A(s.match.view.turn > turn0 && !s.match.over && s.match.view.players.every(p => !p.eliminated) && Object.keys(row('pkpvp:' + L.id).m.auto).length >= 1, `a player who is there but does not act (seat ${seat0 + 1}) has the turn passed for them after 3 minutes; nobody is thrown out`, [turn0, s.match.view.turn]);
	// ben stops polling altogether: past the grace period he concedes
	for (let i = 0; i < 30; i++) { tick(5000); s = await call('pkpvp-sync', { id: L.id }, tok.ann); }
	A(s.match.view.players[1].eliminated && s.match.view.log.some(e => /ben concedes/.test(e.msg)), 'a player who is gone for 2 minutes concedes', s.match.view.players.map(p => p.eliminated));
	// ann leaves: that is a concession too, and the match ends with the computer player the last one in
	await call('pkpvp-leave', { id: L.id }, tok.ann);
	const m = row('pkpvp:' + L.id).m;
	A(m.over && m.over.winner === 2 && (await call('pkpvp-mine', {}, tok.ann)).lobby === null, 'leaving a match concedes it; the last player in wins', m.over);
}
{
	// a waiting lobby: a guest who goes quiet is dropped; a host who goes quiet closes it
	const l2 = (await call('pkpvp-create', { size: 4, bots: 0, ...D('venusaur') }, tok.cat)).lobby;
	await call('pkpvp-join', { code: l2.code, ...D('machamp') }, tok.dan);
	await call('pkpvp-join', { code: l2.code, ...D('nidos') }, tok.eve);
	let s = await call('pkpvp-sync', { id: l2.id }, tok.cat);
	A(s.lobby.players.length === 3 && /two players|ready/.test((await call('pkpvp-start', { id: l2.id }, tok.cat)).error || ''), 'three people wait in a 4-seat lobby with no computer players');
	for (let i = 0; i < 25; i++) { tick(5000); await call('pkpvp-sync', { id: l2.id }, tok.cat); await call('pkpvp-sync', { id: l2.id }, tok.dan); }
	s = await call('pkpvp-sync', { id: l2.id }, tok.cat);
	A(s.lobby.players.map(p => p.name).join() === 'cat,dan', 'eve stopped polling and is dropped from the waiting lobby');
	await call('pkpvp-update', { id: l2.id, ready: true }, tok.dan);
	const go = await call('pkpvp-start', { id: l2.id }, tok.cat);
	A(go.match && go.match.view.players.length === 2 && go.match.view.players.every(p => !p.ai), 'two people, no computer players: a 2-player match starts');
	await call('pkpvp-leave', { id: l2.id }, tok.dan);
	const over = await call('pkpvp-sync', { id: l2.id }, tok.cat);
	A(over.match.over && over.match.over.winner === 0, 'dan leaves: cat wins');
	const l3 = (await call('pkpvp-create', { size: 2, bots: 0, ...D('venusaur') }, tok.cat)).lobby;
	A(l3 && row('pkpvp:' + l2.id).closed === true, 'creating a new match leaves the finished one (its host: it closes)');
	await call('pkpvp-join', { code: l3.code, ...D('machamp') }, tok.dan);
	for (let i = 0; i < 130; i++) { tick(5000); await call('pkpvp-sync', { id: l3.id }, tok.dan); }
	const gone = await call('pkpvp-sync', { id: l3.id }, tok.dan);
	A(gone.closed === true, 'a waiting lobby whose host has been gone 10 minutes closes', gone);
}
// rate limits are registered for every action
{
	const src = fs.readFileSync(path.join(ROOT, 'server/mp.mjs'), 'utf8');
	const acts = ['create', 'join', 'mine', 'update', 'start', 'sync', 'act', 'leave'];
	A(acts.every(a => src.includes(`'pkpvp-${a}': [`)), 'every pkpvp action has a rate limit');
}
// ===== the collection on the account (server/pocket_collection.mjs, through the real route) =====
{
	const col = { v: 1, prints: { 'A1-001': 2, 'P-A-005': 2 }, packs: 7, points: 15, opened: 3 };
	A(!!(await call('pkcol-get', {})).error && !!(await call('pkcol-put', { col, rev: 0 })).error, 'the collection on the account needs an account');
	const g0 = await call('pkcol-get', {}, tok.eve);
	A(g0.col === null && g0.rev === 0, 'eve has no collection on her account yet', g0);
	const p1 = await call('pkcol-put', { col, rev: 0, id: 'device0001' }, tok.eve);
	A(p1.ok && p1.rev === 1 && JSON.stringify(row('pkcol:eve').col) === JSON.stringify(col), "eve's collection is kept in her own row", p1);
	const stale = await call('pkcol-put', { col: { ...col, packs: 99 }, rev: 0 }, tok.eve);
	A(stale.stale && stale.rev === 1 && stale.col.packs === 7 && row('pkcol:eve').col.packs === 7, 'a device working from an older copy does not overwrite it', stale);
	const g1 = await call('pkcol-get', {}, tok.eve);
	A(g1.rev === 1 && g1.col.opened === 3 && g1.ids.join() === 'device0001' && (await call('pkcol-get', {}, tok.dan)).col === null, 'she reads it back; dan does not see it', g1);
	// her saved decks, the same way
	const decks = [{ name: 'Fire', ...D('charizard') }];
	A(!!(await call('pkdeck-get', {})).error && (await call('pkdeck-get', {}, tok.eve)).decks === null, 'decks on the account need an account; eve has none there yet');
	const d1 = await call('pkdeck-put', { decks: [...decks, { name: 'Bad', deck: ['A1-001'], energy: ['Fire'] }], rev: 0, id: 'device0002' }, tok.eve);
	A(d1.ok && row('pkdeck:eve').decks.length === 1 && row('pkdeck:eve').decks[0].name === 'Fire' && row('pkcol:eve').col.packs === 7, "eve's legal decks are kept in their own row (an illegal one is dropped; her collection is untouched)", d1);
	const d2 = await call('pkdeck-put', { decks: [], rev: 0 }, tok.eve);
	A(d2.stale && d2.decks.length === 1 && row('pkdeck:eve').decks.length === 1, 'an older copy of the deck list does not wipe the decks');
}

// ---------- the server's computer players look ahead (as the ones on a device do), within a per-request allowance ----------
{
	const { autoAction, BOT_LOOKS } = await import('../../server/pocket_pvp.mjs'), { chooseAction } = await import('../../pocketenhanced/js/ai_search.js'), { THEME_DECKS } = await import('../../pocketenhanced/js/data/theme_decks.js');
	const seatOf = S => (S.pending ? S.pending.seat : S.phase === 'setup' ? S.players.find(p => !p.setup && !p.eliminated).seat : S.current);
	let differ = 0, lookOk = 0, ruleOk = 0, passOk = 0, t0 = Date.now();
	for (let i = 0; i < 6 && differ < 5; i++) {
		const config = { seed: 'srvbot' + i, rules: E.RULES, players: [THEME_DECKS[i * 11], THEME_DECKS[i * 11 + 4]].map((d, n) => ({ name: 'P' + n, ai: true, deck: d.cards.slice(), energy: d.energy.slice() })) }, actions = [];
		let S = E.createGame(config);
		for (let g = 0; g < 400 && !S.over && differ < 5; g++) {
			const seat = seatOf(S), want = chooseAction(S, seat), rule = nextAction(E.view(S, seat), new Set());
			if (want && rule && JSON.stringify(want) !== JSON.stringify(rule)) {
				differ++;
				const mA = { config, actions: actions.slice() }, mB = { config, actions: actions.slice() }, mC = { config, actions: actions.slice() };
				autoAction(E.replay(config, actions), mA, seat, false, true); autoAction(E.replay(config, actions), mB, seat, false, false); autoAction(E.replay(config, actions), mC, seat, true, true);
				if (JSON.stringify(mA.actions.at(-1)) === JSON.stringify(want)) lookOk++;
				if (JSON.stringify(mB.actions.at(-1)) === JSON.stringify(rule)) ruleOk++;
				{ const mD = { config, actions: actions.slice() }; autoAction(E.replay(config, actions), mD, seat, true, false); if (JSON.stringify(mC.actions.at(-1)) === JSON.stringify(mD.actions.at(-1)) && ['setup', 'choose', 'execute'].includes(mC.actions.at(-1).t)) passOk++; }   // (the move made for someone out of time is what it always was)
			}
			const m = { config, actions }; S = autoAction(S, m, seat, false, true);
		}
	}
	A(differ === 5 && lookOk === 5 && ruleOk === 5, "where looking ahead finds a better play than the rule of thumb, the server's computer player makes it; past its allowance it plays by rule of thumb", { differ, lookOk, ruleOk });
	A(passOk === 5 && BOT_LOOKS >= 8 && BOT_LOOKS <= 40, 'the move made for a player who ran out of time is unchanged: it is never thought out by looking ahead', { passOk, BOT_LOOKS });
	console.log(`    (server computer player: ${Date.now() - t0} ms for the matches above)`);
}

// ---------- solo progress on the account, through the real server ----------
{
	const prog = { v: 1, cleared: { 'A1:b1': 1 }, tasks: { 'A1:b1': [1, 0] }, paid: {}, missions: {} };
	A(!!(await call('pksolo-get', {})).error && (await call('pksolo-get', {}, tok.eve)).solo === null, 'solo progress on the account needs an account; eve has none there yet');
	const s1 = await call('pksolo-put', { solo: prog, rev: 0, id: 'device0009' }, tok.eve), s2 = await call('pksolo-put', { solo: { v: 1, cleared: {} }, rev: 0 }, tok.eve), s3 = await call('pksolo-get', {}, tok.eve);
	A(s1.ok && s1.rev === 1 && s2.stale && s3.rev === 1 && s3.solo.cleared['A1:b1'] === 1 && s3.solo.tasks['A1:b1'].join('') === '10' && row('pksolo:eve').solo.cleared['A1:b1'] === 1 && row('pkcol:eve').col.packs === 7, "eve's solo progress is kept in its own row; an older copy does not overwrite it; her collection is untouched", { s1, s2 });
}

// ---------- singles: the host's choice, kept by the lobby and played by the match ----------
{
	for (const who of ['ann', 'bob', 'cat']) await call('pkpvp-leave', {}, tok[who]).catch(() => null);
	const lb = await call('pkpvp-create', { size: 2, bots: 1, singles: true, ...D('charizard') }, tok.ann);
	A(lb.lobby && lb.lobby.singles === true, 'a lobby made as singles says so', lb.lobby && { singles: lb.lobby.singles, error: lb.error });
	const st = await call('pkpvp-start', { id: lb.lobby.id }, tok.ann), v = st.view || (st.match && st.match.view) || (await call('pkpvp-state', { id: lb.lobby.id }, tok.ann)).view;
	A(v && v.singles === true && v.players.every(p => p.active.length === 1 && p.bench.length === 3), 'its match is singles: one Active slot and a Bench of three for every seat, the computer player included', v && { singles: v.singles, sizes: v.players.map(p => [p.active.length, p.bench.length]) });
	await call('pkpvp-leave', { id: lb.lobby.id }, tok.ann).catch(() => null);
	const lb2 = await call('pkpvp-create', { size: 2, bots: 1, ...D('charizard') }, tok.ann);
	A(lb2.lobby && lb2.lobby.singles === false, 'a lobby made without a choice is doubles, as before', lb2.lobby && lb2.lobby.singles);
	await call('pkpvp-leave', { id: lb2.lobby.id }, tok.ann).catch(() => null);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
