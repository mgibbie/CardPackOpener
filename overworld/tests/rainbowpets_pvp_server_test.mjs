// rainbowpets_pvp_server_test.mjs — RAINBOW PETS ONLINE on the REAL server handler (server/mp.mjs over sqlite;
// server/rpets_pvp.mjs): the lobby (a code, a team of 3 to 5 Pets, computer seats, ready, start), the match the SERVER
// plays (each player sees their own hand and nobody else's; an action out of turn or illegal is refused; the computer
// seats play themselves), the clock (out of time: the turn is passed; gone: a concession), and the finished match's
// recipe, which rebuilds the same match.
//   node overworld/tests/rainbowpets_pvp_server_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import * as R from '../../rainbowpets/js/rules.js';
import { RPVP_PROTOCOL, RP, cleanTeam, cleanAction } from '../../server/rpets_pvp.mjs';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } };
let clock = 1_800_000_000_000;
globalThis.__msurvClock = () => clock;

try {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
	const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
	const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-rpvp-')), 'mp.bundle.mjs');
	buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
	const { default: handler } = await import(pathToFileURL(bundle).href);
	let ipN = 0;
	const api = async (action, body = {}, token) => {
		const res = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB });
		return { status: res.status, ...(await res.json()) };
	};
	const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
	const P = {};
	for (const name of ['rpann', 'rpbob', 'rpcyd']) {
		const tok = (await api('register', { username: name, password: 'rp-pass-' + name })).token;
		P[name] = { tok, call: (a, b = {}) => api(a, { pv: RPVP_PROTOCOL, ...b }, tok) };
	}
	const { rpann: ann, rpbob: bob, rpcyd: cyd } = P;
	const TEAM = { ann: ['p1', 'p2', 'p3', 'p4'], bob: ['p10', 'p11', 'p12'], cyd: ['p20', 'p21', 'p22'] };

	// ---------- what the page may send
	A(cleanTeam(['p1', 'p2', 'p3']) && !cleanTeam(['p1', 'p2']) && !cleanTeam(['p1', 'p1', 'p2']) && !cleanTeam(['p1', 'p2', 'zz']) && !cleanTeam('p1'), 'a team: 3 to 5 Pets of the 42, none twice');
	A((({ t, pet, slot, card, evil }) => t === 'paint' && pet === 'a0' && slot === 1 && card === 'a12' && evil === undefined)(cleanAction({ t: 'paint', pet: 'a0', slot: 1, card: 'a12', evil: 'x' })) && Object.keys(cleanAction({ t: 'paint', pet: 'a0', slot: 1, card: 'a12', evil: 'x' })).length === 4 && cleanAction({ t: 'nuke' }) === null && cleanAction({ t: 'paint', slot: 99 }).slot === undefined, 'an action is kept to the fields the engine reads');

	// ---------- the lobby
	A((await api('rpvp-mine', { pv: RPVP_PROTOCOL })).status === 401, 'online play needs an account');
	A((await api('rpvp-mine', { pv: 0 }, ann.tok)).status === 409, 'an out-of-date page is told to reload');
	let r = await ann.call('rpvp-create', { size: 3, cpus: 1, team: ['p1'] });
	A(r.status === 400, 'a team of 1 is refused', r);
	r = await ann.call('rpvp-create', { size: 3, cpus: 1, team: TEAM.ann, opts: { whiteClear: true, bogus: true }, level: 'easy' });
	A(r.lobby && /^[A-Z2-9]{5}$/.test(r.lobby.code) && r.lobby.size === 3 && r.lobby.cpus === 1 && r.lobby.level === 'easy' && JSON.stringify(r.lobby.opts) === '{"whiteClear":true}', 'the host makes a 3-seat lobby with one computer painter and an optional rule', r);
	const lid = r.lobby.id, code = r.lobby.code;
	A((await bob.call('rpvp-join', { code: 'ZZZZZ', team: TEAM.bob })).status === 404, 'a wrong code finds nothing');
	r = await bob.call('rpvp-join', { code, team: TEAM.bob });
	A(r.lobby && r.lobby.players.length === 2 && !r.lobby.players[1].ready, 'bob joins with the code (not ready yet)');
	A((await cyd.call('rpvp-join', { code, team: TEAM.cyd })).status === 409, 'the lobby is full (2 people + 1 computer)');
	A((await bob.call('rpvp-start', { id: lid })).status === 403, 'only the host starts');
	A((await ann.call('rpvp-start', { id: lid })).status === 400, 'not while someone is not ready');
	await bob.call('rpvp-update', { id: lid, ready: true });
	r = await ann.call('rpvp-start', { id: lid });
	A(r.lobby && r.lobby.started, 'everyone ready: the match starts', r);
	const m = row('rpvp:' + lid).m;
	A(m.setup.seats.length === 3 && m.setup.seats[2].cpu === 'easy' && m.setup.seats[2].pets.length === 4 && m.setup.seats[2].pets.every((p) => !TEAM.ann.includes(p) && !TEAM.bob.includes(p)), 'the computer painter gets 4 Pets nobody else has');

	// ---------- the match the server plays
	const sa = (await ann.call('rpvp-sync', { id: lid, n: -1 })).match, sb = (await bob.call('rpvp-sync', { id: lid, n: -1 })).match;
	A(sa.seat === 'a' && sb.seat === 'b' && sa.view.players[0].hand && sa.view.players[1].hand === null && sb.view.players[1].hand && sb.view.players[0].hand === null, 'each player sees their own hand, and only a count of the others');
	A(!JSON.stringify(sa).includes('"deck":[') && !sa.recipe, 'no decks, and no recipe until it is over');
	const local = () => R.replay({ setup: row('rpvp:' + lid).m.setup, actions: row('rpvp:' + lid).m.actions });
	let S = local();
	// (the seed is the server's own: when the computer went first and threw at a person holding a Newspaper, the match
	// waits on that person's answer; they let it land, and then it is a person's turn)
	for (let k = 0; k < 6 && S.pending && !R.playerOf(S, R.toAct(S)).cpu; k++) { await (R.toAct(S) === 'a' ? ann : bob).call('rpvp-act', { id: lid, n: -1, a: { t: 'let' } }); S = local(); }
	A(!R.curPlayer(S).cpu && !S.pending, 'whoever is to move is a person (the computer moves at once when it is its turn)', { cur: R.curPlayer(S).seat, pending: S.pending });
	{
		const turnSeat = R.curPlayer(S).seat, me = turnSeat === 'a' ? ann : bob, other = turnSeat === 'a' ? bob : ann;
		r = await other.call('rpvp-act', { id: lid, n: -1, a: { t: 'pass' } });
		A(r.refused === 'it is not your turn', 'an action out of turn is refused, and nothing changes', r.refused);
		const c = R.playerOf(S, turnSeat).hand.find((x) => S.cards[x].c !== 'N');   // (a color card: a Newspaper is refused for being one)
		r = await me.call('rpvp-act', { id: lid, n: -1, a: { t: 'paint', pet: (turnSeat === 'a' ? 'b0' : 'a0'), slot: 0, card: c } });
		A(r.refused === 'you can only paint your own Pets', 'an illegal action is refused with the reason the engine gives', r.refused);
		r = await me.call('rpvp-act', { id: lid, n: -1, a: { t: 'pass' } });
		A(!r.refused && r.match.n >= 1, 'a pass is taken, and the computer plays its own turn at once when it is next', r.match.n);
	}
	// play it out: the people move a Pet when they can, else pass (the computer plays itself); it ends
	for (let k = 0; k < 600; k++) {
		const st = local(); if (st.over) break;
		const seat = R.toAct(st); if (!seat) break;
		const who = seat === 'a' ? ann : seat === 'b' ? bob : null;
		if (!who) { await ann.call('rpvp-sync', { id: lid, n: -1 }); continue; }
		const a = st.pending ? { t: 'let' } : (R.legal(st, seat).find((x) => x.t === 'move') || { t: 'pass' });
		await who.call('rpvp-act', { id: lid, n: -1, a });
	}
	S = local();
	const fin = (await ann.call('rpvp-sync', { id: lid, n: -1 })).match;
	A(S.over && fin.over && fin.recipe && fin.recipe.actions.length === row('rpvp:' + lid).m.actions.length, 'the match ends, and its recipe comes with the end', fin.over);
	A(JSON.stringify(R.replay(fin.recipe)) === JSON.stringify(S), 'the recipe rebuilds the very same match (a replay of it)');

	// ---------- the clock
	{
		r = await ann.call('rpvp-create', { size: 2, cpus: 0, team: TEAM.ann });
		const l2 = r.lobby.id; await bob.call('rpvp-join', { code: r.lobby.code, team: TEAM.bob }); await bob.call('rpvp-update', { id: l2, ready: true }); await ann.call('rpvp-start', { id: l2 });
		const L2 = () => R.replay({ setup: row('rpvp:' + l2).m.setup, actions: row('rpvp:' + l2).m.actions });
		const va = (await ann.call('rpvp-sync', { id: l2, n: -1 })).match.view;
		A(va.toAct === R.toAct(L2()) && va.pending === null, 'the view says whose move it is');
		const seat0 = R.toAct(L2()), n0 = row('rpvp:' + l2).m.actions.length;
		// (both pages keep syncing while the one to move does nothing: they are there, just not moving)
		for (let t = 0; t < 4; t++) { clock += Math.ceil(RP.TURN_MS / 4) + 300; await ann.call('rpvp-sync', { id: l2, n: -1 }); await bob.call('rpvp-sync', { id: l2, n: -1 }); }
		A(row('rpvp:' + l2).m.actions.length === n0 + 1 && row('rpvp:' + l2).m.actions[n0][1].t === 'pass' && R.toAct(L2()) !== seat0, 'out of time: their turn is passed for them');
		clock += RP.GRACE_MS + 1000;
		await ann.call('rpvp-sync', { id: l2, n: -1 });
		const end = L2();
		A(end.over && end.over.winner === 'a' && R.playerOf(end, 'b').out, 'a player gone too long concedes: the other wins');
	}
	// ---------- leaving, and rejoining after a reload
	{
		r = await cyd.call('rpvp-create', { size: 2, cpus: 1, team: TEAM.cyd });
		const l3 = r.lobby.id;
		A((await cyd.call('rpvp-mine')).lobby.id === l3, 'a reload finds the lobby again');
		await cyd.call('rpvp-start', { id: l3 });
		A((await cyd.call('rpvp-create', { size: 2, cpus: 1, team: TEAM.cyd })).status === 409, 'no second match while one is live');
		await cyd.call('rpvp-leave', { id: l3 });
		const L3 = R.replay({ setup: row('rpvp:' + l3).m.setup, actions: row('rpvp:' + l3).m.actions });
		A(L3.over && L3.over.winner === 'b', 'leaving a live match concedes it');
	}
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
