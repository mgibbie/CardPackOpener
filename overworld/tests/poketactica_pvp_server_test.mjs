// poketactica_pvp_server_test.mjs — Poketactica online (server/ptpvp.mjs) on the REAL server (mp.mjs bundled, D1 in sqlite):
// a lobby by code for 2-4, teams read from each player's own figurines (never the page's word), computer seats, the start,
// actions stamped with the sender's seat and appended in order (stale -> the newer ones back), the clock (an idle phase
// ends; a player who went away concedes), leaving, the result. Then the recipe the server holds is played by the engine,
// as every device does, to the same end.
//   node overworld/tests/poketactica_pvp_server_test.mjs
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import * as B from '../../poketactica/js/engine/battle.js';
import { matchSetup, PTPVP_PROTOCOL, CPU_SPECIES, CPU_NAMES } from '../../poketactica/js/arenas.js';
import { makeFigurine } from '../../poketactica/js/figurine.js';
import { newFigs, addFig } from '../../poketactica/js/figcol.js';
import { makeRng } from '../rules/rng.js';
import { PT } from '../../server/ptpvp.mjs';

process.env.MP_GC_RATE = '0';
const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const J = (f) => JSON.parse(fs.readFileSync(path.join(ROOT, f), 'utf8'));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + JSON.stringify(extra).slice(0, 700) : '')); } };
const data = { species: J('overworld/data/species_battle.json'), abilities: J('overworld/data/species_abilities.json'), extra: J('overworld/data/species_extra.json'),
	moves: J('overworld/data/moves_battle.json'), shapes: J('poketactica/data/move_shapes.json'), abilityShapes: J('poketactica/data/ability_shapes.json') };
let clock = 1_800_000_000_000;
globalThis.__msurvClock = () => clock;

try {
	const sqlite = new DatabaseSync(':memory:');
	sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
	const MP_DB = { prepare(sql) { const st = sqlite.prepare(sql); const b = []; const api = { bind(...a) { b.length = 0; b.push(...a); return api; }, async first() { return st.get(...b) ?? null; }, async run() { const r = st.run(...b); return { meta: { changes: r.changes } }; }, async all() { return { results: st.all(...b) }; } }; return api; } };
	const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-ptpvp-')), 'mp.bundle.mjs');
	buildSync({ entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle, banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent' });
	const { default: handler } = await import(pathToFileURL(bundle).href);
	let ipN = 0;
	const api = async (action, body = {}, token) => {
		const res = await handler(new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.7.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) }, body: JSON.stringify({ action, ...body }) }), { MP_DB });
		return { status: res.status, ...(await res.json()) };
	};
	const row = (k) => { const r = sqlite.prepare('SELECT value FROM mp_store WHERE key = ?').get(k); return r ? JSON.parse(r.value) : null; };
	const setRow = (k, v) => sqlite.prepare('INSERT INTO mp_store (key, value, updated_at) VALUES (?, ?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value').run(k, JSON.stringify(v), Date.now());
	// three players, each with their own figurines on their account
	const P = {};
	const SP = { ptann: ['charmander', 'squirtle', 'pikachu'], ptbob: ['machop', 'geodude'], ptcyd: ['eevee', 'oddish', 'poliwag'] };
	for (const [name, sps] of Object.entries(SP)) {
		const tok = (await api('register', { username: name, password: 'pt-pass-' + name })).token;
		let col = newFigs();
		sps.forEach((sp, i) => { col = addFig(col, makeFigurine(sp, 10 + i * 5, makeRng(name + i), data, { id: sp + '-' + name, shinyRate: 0 })); });
		setRow('ptfig:' + name, { rev: 1, figs: col, at: clock });
		P[name] = { tok, ids: sps.map((sp) => sp + '-' + name), call: (a, b = {}) => api(a, { pv: PTPVP_PROTOCOL, ...b }, tok) };
	}
	const { ptann: ann, ptbob: bob, ptcyd: cyd } = P;

	// ---------- the lobby
	A((await api('ptpvp-mine', { pv: PTPVP_PROTOCOL })).status === 401, 'online play needs an account');
	A((await api('ptpvp-mine', { pv: 0 }, ann.tok)).status === 409, 'an out-of-date page is told to reload');
	let r = await ann.call('ptpvp-create', { size: 3, cpus: 1, arena: 'crossroads', team: ['pikachu-ptbob'] });
	A(r.status === 400 && /not yours/.test(r.error), "a team must be the player's own figurines (the server's row, not the page's word)", r);
	r = await ann.call('ptpvp-create', { size: 3, cpus: 1, arena: 'crossroads', team: ann.ids });
	A(r.lobby && /^[A-Z2-9]{5}$/.test(r.lobby.code) && r.lobby.size === 3 && r.lobby.cpus === 1 && r.lobby.lv === 50 && r.lobby.players[0].team.length === 3, 'the host makes a 3-seat lobby (one computer), Levels 50 by default', r);
	const lid = r.lobby.id, code = r.lobby.code;
	A(row('ptpvp:' + lid).players[0].team[0].id === 'charmander-ptann', "the lobby holds the host's figurines from their account");
	r = await bob.call('ptpvp-join', { code: 'ZZZZZ', team: bob.ids });
	A(r.status === 404, 'a wrong code: no match');
	r = await bob.call('ptpvp-join', { code, team: bob.ids });
	A(r.lobby && r.lobby.players.length === 2 && !r.lobby.players[1].ready, 'a friend joins with the code');
	r = await cyd.call('ptpvp-join', { code, team: cyd.ids });
	A(r.status === 409 && /full/.test(r.error), 'a third player is refused: two players + one computer is full', r);
	r = await ann.call('ptpvp-start', { id: lid });
	A(r.status === 409 && /ready/.test(r.error), "the host can't start before everyone is ready");
	r = await bob.call('ptpvp-update', { id: lid, ready: true, team: [bob.ids[0]] });
	A(r.lobby && r.lobby.players[1].ready && r.lobby.players[1].team.length === 1, 'the friend picks a team and is ready');
	r = await bob.call('ptpvp-start', { id: lid });
	A(r.status === 403, 'only the host starts');
	r = await ann.call('ptpvp-start', { id: lid });
	const m0 = r.match;
	A(m0 && m0.config.seats.length === 3 && m0.n === 0 && /^[0-9a-f]{16}$/.test(m0.seed), 'the host starts: three seats, a seed, no actions yet', r);
	const cpu = m0.config.seats.find((s) => s.cpu);
	A(cpu && cpu.name === CPU_NAMES[0] && cpu.picks.length === 3 && cpu.picks.every((sp) => CPU_SPECIES.includes(sp)) && cpu.level === 50, 'the computer seat gets three Pokémon at Lv 50 (as big as the biggest team, at least 3)', cpu);
	const seatOf = (name) => 'abcd'[m0.config.seats.findIndex((s) => s.name === name)];
	const sa = seatOf('ptann'), sb = seatOf('ptbob');
	A(m0.config.seats.findIndex((s) => s.cpu) === 2 && sa && sb && sa !== sb, 'the players take the first seats (in a random order), the computer the last');
	A(m0.side === sa, "the start tells the host its seat");

	// ---------- the engine, as each device runs it
	const setup = matchSetup(m0.config, m0.seed, data, makeFigurine, makeRng);
	const S = B.newBattle(m0.seed, setup, data);
	A(S.pvp.sides.length === 3 && S.units.filter((u) => u.side === sa).every((u) => u.level === 50), 'every device builds the same battle from the config (Levels 50 applied)');
	const first = B.curSide(S), firstP = first === sa ? ann : bob, other = first === sa ? bob : ann;
	const uidOf = (side) => S.units.find((u) => u.side === side).uid;
	// a player can only ever be their own seat
	r = await other.call('ptpvp-act', { id: lid, n: 0, a: { t: 'deploy', uid: uidOf(first), by: first } });
	A(r.ok && row('ptpvp:' + lid).m.actions[0].by !== first, "an action is stamped with the SENDER's seat (a 'by' in it is overwritten)", row('ptpvp:' + lid).m.actions[0]);
	const a0 = row('ptpvp:' + lid).m.actions[0];
	A(!B.act(S, a0, data).ok, "so the engine refuses it on every device (not the sender's turn)");
	r = await firstP.call('ptpvp-act', { id: lid, n: 0, a: { t: 'deploy', uid: uidOf(first) } });
	A(r.stale && r.match.from === 0 && r.match.actions.length === 1, 'an action sent on an old count is stale: the newer actions come back', r);
	r = await firstP.call('ptpvp-act', { id: lid, n: 1, a: { t: 'deploy', uid: uidOf(first) } });
	A(r.ok && r.n === 2, 'sent on the right count, it is appended');
	A(B.act(S, row('ptpvp:' + lid).m.actions[1], data).ok, 'and the engine plays it');
	r = await firstP.call('ptpvp-act', { id: lid, n: 2, a: { t: 'hack' } });
	A(r.status === 400, 'an unknown kind of action is refused');
	r = await firstP.call('ptpvp-act', { id: lid, n: 2, a: { t: 'end' } });
	A(r.ok && B.act(S, row('ptpvp:' + lid).m.actions[2], data).ok && B.curSide(S) !== first, 'end: the next seat plays');
	// the poll: only what is new
	r = await other.call('ptpvp-state', { id: lid, n: 1 });
	A(r.match && r.match.from === 1 && r.match.actions.length === 2 && !r.match.config && r.lobby.started, 'a poll with a count gets only the newer actions');
	// ---------- the clock: a phase that ran too long ends; a player gone too long concedes
	const n0 = row('ptpvp:' + lid).m.actions.length;
	clock += PT.TURN_MS / 2 + 500; await other.call('ptpvp-state', { id: lid, n: n0 }); await firstP.call('ptpvp-state', { id: lid, n: n0 });
	A(row('ptpvp:' + lid).m.actions.length === n0, 'within the clock nothing is added');
	clock += PT.TURN_MS / 2 + 500;
	r = await firstP.call('ptpvp-state', { id: lid, n: n0 });
	const added = r.match.actions;
	A(added.some((a) => a.t === 'idle'), 'a phase older than the turn clock is ended by the server (idle)', added);
	for (const a of added) B.act(S, a, data);
	// the other player stops polling
	clock += PT.GRACE_MS - 20_000;
	await firstP.call('ptpvp-state', { id: lid, n: 0 });
	clock += 30_000;
	r = await firstP.call('ptpvp-state', { id: lid, n: S.log.length ? row('ptpvp:' + lid).m.actions.length : 0 });
	const all = row('ptpvp:' + lid).m.actions;
	const gone = other === ann ? 'ptann' : 'ptbob';
	A(all.some((a) => a.t === 'concede' && a.by === seatOf(gone)), 'a player who stopped polling concedes', all.slice(-3));
	for (const a of all.slice(n0 + added.length)) B.act(S, a, data);
	A(S.pvp.out.includes(seatOf(gone)), 'and on every device that seat is out');
	r = await (other).call('ptpvp-act', { id: lid, n: all.length, a: { t: 'end' } });
	A(r.status === 409, 'a player who was conceded for cannot act again', r);
	// the end: one player against the computer; the survivor concedes too -> the computer wins
	const lastN = row('ptpvp:' + lid).m.actions.length;
	r = await firstP.call('ptpvp-leave', { id: lid });
	const fin = row('ptpvp:' + lid).m.actions;
	for (const a of fin.slice(lastN)) B.act(S, a, data);
	A(S.over === 'done' && S.pvp.winner === 'c', 'the last player leaves: the computer wins (on every device)', JSON.stringify([S.over, S.pvp]));
	r = await firstP.call('ptpvp-over', { id: lid, n: fin.length, winner: S.pvp.winner });
	A(row('ptpvp:' + lid).m.over && row('ptpvp:' + lid).m.over.winner === CPU_NAMES[0], "the page reports the end: the lobby notes the winner", row('ptpvp:' + lid).m.over);
	// the whole recipe replays to the same end
	const S2 = B.replay(m0.seed, matchSetup(m0.config, m0.seed, data, makeFigurine, makeRng), fin, data);
	A(JSON.stringify(B.view(S2)) === JSON.stringify(B.view(S)), "the server's recipe replays to the same battle");

	// ---------- a new lobby after the last one; leaving a waiting lobby; four seats
	r = await cyd.call('ptpvp-create', { size: 4, cpus: 0, arena: 'garden', lv: 'own', team: cyd.ids });
	const l2 = r.lobby;
	A(l2 && l2.size === 4 && l2.lv === null, 'a 4-seat lobby, own levels');
	// A CAPPED MATCH (owner, 2026-11-24: "optional and off by default"): the host's switch, kept on the lobby and in the match
	A(l2.plain === false && !('plain' in row('ptpvp:' + l2.id)), 'a match is not capped unless the host says so');
	r = await cyd.call('ptpvp-update', { id: l2.id, plain: true });
	A(r.lobby.plain === true && row('ptpvp:' + l2.id).plain === true, 'the host switches the cap on: item levels and gemstones will not count');
	r = await cyd.call('ptpvp-update', { id: l2.id, plain: false });
	A(r.lobby.plain === false && !('plain' in row('ptpvp:' + l2.id)), 'and off again');
	r = await cyd.call('ptpvp-update', { id: l2.id, plain: 'yes' });
	A(r.lobby.plain === false, 'anything but true or false changes nothing');
	await ann.call('ptpvp-join', { code: l2.code, team: ann.ids });
	await bob.call('ptpvp-join', { code: l2.code, team: bob.ids });
	r = await bob.call('ptpvp-leave', { id: l2.id });
	A(row('ptpvp:' + l2.id).players.length === 2 && !row('ptpvp:' + l2.id).closed, 'a guest leaves a waiting lobby');
	r = await cyd.call('ptpvp-update', { id: l2.id, cpus: 2 });
	A(r.lobby.cpus === 2, 'the host fills the empty seats with computers');
	await ann.call('ptpvp-update', { id: l2.id, ready: true });
	r = await cyd.call('ptpvp-start', { id: l2.id });
	A(r.match && r.match.config.seats.length === 4 && r.match.config.seats.filter((s) => s.cpu).length === 2, 'four seats: two players, two computers', r);
	const cpuLv = r.match.config.seats.find((s) => s.cpu).level;
	A(cpuLv === Math.round([10, 15, 20, 10, 15, 20].reduce((a, b) => a + b) / 6), "own levels: the computers play at the players' average level", cpuLv);
	const S4 = B.newBattle(r.match.seed, matchSetup(r.match.config, r.match.seed, data, makeFigurine, makeRng), data);
	A(S4.units.filter((u) => !S4.pvp.cpu[u.side]).map((u) => u.level).sort().join() === '10,10,15,15,20,20', 'own levels: the figurines keep theirs');
	A((await ann.call('ptpvp-mine')).lobby.id === l2.id, 'mine: a player finds their match again after a reload');
	r = await ann.call('ptpvp-create', { size: 2, team: ann.ids });
	A(r.status === 409 && r.code === l2.code, "a player in a live match can't open another until they leave it", r);
	// the cap, set when the match is made, goes into the match's config (every device builds its battle from that)
	{
		const { matchSetup: MS, plainFig } = await import('../../poketactica/js/arenas.js');
		const geared = { ...makeFigurine('charmander', 50, makeRng('cap'), data, { id: 'char-cap1', shinyRate: 0 }), held: 'charcoal', gear: { lv: 100, gems: ['atk:100', 'atk:100'] } };
		const plainOne = makeFigurine('squirtle', 50, makeRng('cap2'), data, { id: 'squi-cap2', shinyRate: 0 });
		const cfg = (plain) => ({ arena: 'crossroads', lv: null, ...(plain ? { plain: true } : {}), seats: [{ name: 'a', team: [geared] }, { name: 'b', team: [plainOne] }] });
		const open = B.newBattle('capseed', MS(cfg(false), 'capseed', data, makeFigurine, makeRng), data), capped = B.newBattle('capseed', MS(cfg(true), 'capseed', data, makeFigurine, makeRng), data);
		const uo = open.units.find((u) => u.species === 'charmander'), uc = capped.units.find((u) => u.species === 'charmander');
		A(uo.held.k === 3 && uo.stats.atk === Math.floor(uc.stats.atk * 2) && uc.heldId === 'charcoal' && !uc.held.k && !uc.fig.gear, 'uncapped: the level 100 Charcoal Stick and its gemstones count (Attack doubled); capped: the same item, plain', [uo.stats.atk, uc.stats.atk, uo.held.k, uc.held.k]);
		A(JSON.stringify(capped.units.find((u) => u.species === 'squirtle').stats) === JSON.stringify(open.units.find((u) => u.species === 'squirtle').stats) && plainFig(plainOne) === plainOne && geared.gear.lv === 100, 'a figurine with a plain item is the same either way (and nobody\'s own figurine is changed)');
	}
} catch (e) { fail++; console.log('FAIL: threw ' + (e && e.stack || e)); }
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
