// async_smoke.mjs — correspondence (play-by-mail) matches, API-level. CARDS:
// challenge, accept, opening deal, alternating turns, turn-order enforcement,
// resign, list shapes. POKEMON: the server hosts the real pvpbattle match —
// both sides may act whenever and the turn resolves on the second action.
// Boots the REAL dev server on a fresh sqlite (dust_smoke pattern).
//   node battlecards/tests/integration/async_smoke.mjs
import { spawn } from 'child_process';
import fs from 'fs';
import os from 'os';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const PORT = 8884;
const BASE = `http://localhost:${PORT}`;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const api = (action, body = {}, token) => fetch(BASE + '/api/mp', {
	method: 'POST',
	headers: { 'content-type': 'application/json', ...(token ? { authorization: 'Bearer ' + token } : {}) },
	body: JSON.stringify({ action, ...body }),
}).then(r => r.json());
const waitUp = async () => {
	for (let i = 0; i < 100; i++) {
		try { if ((await fetch(BASE + '/')).ok) return true; } catch {}
		await new Promise(r => setTimeout(r, 150));
	}
	return false;
};

(async () => {
	const dbFile = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'async-')), 'users.sqlite');
	const server = spawn(process.execPath, [path.join(ROOT, 'mp-dev-server.mjs'), String(PORT)],
		{ cwd: ROOT, stdio: 'ignore', env: { ...process.env, MP_DEV_DB: dbFile, MP_TEST_PHASE: '0' } });
	try {
		A(await waitUp(), 'dev server is up');
		const ta = (await api('register', { username: 'penny', password: 'localdev1' })).token;
		const tb = (await api('register', { username: 'quill', password: 'localdev1' })).token;
		const tc = (await api('register', { username: 'nosy', password: 'localdev1' })).token;
		A(!!ta && !!tb && !!tc, 'three accounts registered');

		// async duels are friends-only
		A((await api('async-create', { to: 'quill' }, ta)).error === 'not your friend', 'challenging a non-friend is refused');
		await api('add-friend', { username: 'quill' }, ta);

		const party = d => ({ deck: ['wisp'], classId: 'mage', commander: null, companion: null, tag: d });
		const c1 = await api('async-create', { to: 'quill', party: party('a') }, ta);
		A(c1.ok && c1.match?.status === 'invited', 'challenge created', JSON.stringify(c1));
		const id = c1.match.id;

		const la = await api('async-list', {}, ta);
		const lb = await api('async-list', {}, tb);
		A(la.matches?.length === 1 && !la.matches[0].yourInvite, "challenger's list shows the invite (not theirs to accept)");
		A(lb.matches?.length === 1 && lb.matches[0].yourInvite && lb.yourTurn === 1, "invitee's list flags it as waiting on them", JSON.stringify(lb));

		// only the invitee may accept; only they may deal the opening state
		A((await api('async-accept', { id, party: party('x') }, ta)).error === 'not your invite', 'challenger cannot accept their own invite');
		A((await api('async-move', { id, snap: { t: 0 }, turnTo: 'quill' }, ta)).error?.includes('not active'), 'no moves before acceptance');
		const acc = await api('async-accept', { id, party: party('b') }, tb);
		A(acc.ok && acc.match.status === 'active' && acc.you === 1, 'invitee accepted with their deck');
		A((await api('async-move', { id, snap: { t: 1 }, turnTo: 'penny' }, ta)).error?.includes('accepter deals'), 'only the accepter deals the opening');
		const deal = await api('async-move', { id, snap: { t: 1, board: 'opening' }, turnTo: 'penny', lines: ['dealt'] }, tb);
		A(deal.ok && deal.match.turn === 'penny' && deal.match.turnNumber === 1, 'opening dealt, challenger to move', JSON.stringify(deal));

		// strict alternation
		A((await api('async-move', { id, snap: { t: 2 }, turnTo: 'penny' }, tb)).error === 'not your turn', 'moving out of turn is refused');
		const mv1 = await api('async-move', { id, snap: { t: 2 }, turnTo: 'quill', lines: ['penny played a Wisp', 'penny ended the turn'] }, ta);
		A(mv1.ok && mv1.match.turn === 'quill' && mv1.match.turnNumber === 2, "challenger's turn went through");
		const g = await api('async-get', { id }, tb);
		A(g.match?.snap?.t === 2 && g.you === 1 && g.match.lines.length === 2, 'the snapshot + away-turn digest round-trip', JSON.stringify(g.match?.lines));
		A((await api('async-get', { id }, tc)).error === 'not your match', 'a third party cannot read the match');
		A((await api('async-move', { id, snap: 'x'.repeat(800_000), turnTo: 'penny' }, tb)).error === 'bad snapshot', 'oversized snapshots are rejected');

		// resign: the other player wins; lists agree
		const rs = await api('async-resign', { id }, tb);
		A(rs.ok && rs.match.status === 'over' && rs.match.winner === 'penny', 'resigning hands the match to the opponent');
		const la2 = await api('async-list', {}, ta);
		A(la2.matches[0].status === 'over' && la2.matches[0].winner === 'penny' && la2.yourTurn === 0, 'finished match reads right in the list');
		A((await api('async-move', { id, snap: { t: 9 }, turnTo: 'quill' }, ta)).error?.includes('not active'), 'no moves after the end');

		// ---- correspondence POKEMON: the server hosts the real battle ----
		const mon = (name, hp, power) => ({
			speciesId: name.toLowerCase(), name, level: 20, types: ['Normal'], sprite: 's1.png', weightkg: 10,
			stats: { hp, atk: 60, def: 40, spa: 40, spd: 40, spe: 50 }, maxHP: hp, curHP: hp, status: null,
			moves: [{ id: 'tackle', name: 'Tackle', pp: 30, maxPp: 30, power, type: 'Normal', category: 'Physical', acc: 100 }],
		});
		const pkParty = tag => [mon(tag + '1', 60, 40), mon(tag + '2', 60, 40)];
		A((await api('async-create', { to: 'quill', game: 'pokemon', party: { not: 'an array' } }, ta)).error === 'send a party',
			'a pokemon challenge must carry a party');
		const pc = await api('async-create', { to: 'quill', game: 'pokemon', party: pkParty('A') }, ta);
		A(pc.ok && pc.match.game === 'pokemon' && pc.match.status === 'invited', 'pokemon challenge created', JSON.stringify(pc.match));
		const pid = pc.match.id;
		A((await api('async-act', { id: pid, act: { kind: 'move', moveIdx: 0 } }, ta)).error?.includes('not active'),
			'no moves before the invite is accepted');
		const pacc = await api('async-accept', { id: pid, party: pkParty('B') }, tb);
		A(pacc.ok && !!pacc.match.pk && pacc.match.pk.sides.length === 2, 'accepting builds the server-side battle');
		A(pacc.match.pk.sides[0].name === 'penny' && pacc.match.pk.sides[1].name === 'quill', 'both parties seated correctly');

		// BOTH sides may move whenever; the turn resolves when the second lands
		const pl1 = await api('async-list', {}, ta);
		const pm1 = pl1.matches.find(m => m.id === pid);
		A(pm1.yourTurn === true && pm1.game === 'pokemon', 'a fresh pokemon turn waits on you');
		const pmv1 = await api('async-act', { id: pid, act: { kind: 'move', moveIdx: 0 } }, ta);
		A(pmv1.ok && pmv1.match.pk.turn === 1, "one side's move alone does not advance the turn");
		A((await api('async-act', { id: pid, act: { kind: 'move', moveIdx: 0 } }, ta)).error === 'you already moved this turn',
			'a side cannot move twice in one turn');
		const waiting = (await api('async-list', {}, ta)).matches.find(m => m.id === pid);
		A(waiting.yourTurn === false, 'after moving, the match waits on them');
		A((await api('async-list', {}, tb)).matches.find(m => m.id === pid).yourTurn === true, '...and flags THEIR turn');
		const pmv2 = await api('async-act', { id: pid, act: { kind: 'move', moveIdx: 0 } }, tb);
		A(pmv2.ok && pmv2.match.pk.turn === 2, 'the second action resolves the turn');
		A(pmv2.match.pk.sides.some(s => s.party[s.active].curHP < 60), 'damage actually happened');
		A((await api('async-get', { id: pid }, tc)).error === 'not your match', 'a third party still cannot read it');
		A((await api('async-move', { id: pid, snap: { x: 1 }, turnTo: 'quill' }, ta)).error?.includes('async-act'),
			'the card move endpoint refuses a pokemon match');

		// resigning ends the hosted battle too
		const prs = await api('async-resign', { id: pid }, ta);
		A(prs.ok && prs.match.status === 'over' && prs.match.winner === 'quill', 'resigning a pokemon match hands it over');
		A((await api('async-get', { id: pid }, tb)).match.pk.over === true, 'the hosted battle is marked over');

		// an over match declared via async-move (game finished on the board)
		const c2 = await api('async-create', { to: 'quill', party: party('a2') }, ta);
		await api('async-accept', { id: c2.match.id, party: party('b2') }, tb);
		await api('async-move', { id: c2.match.id, snap: { t: 1 }, turnTo: 'penny' }, tb);
		const fin = await api('async-move', { id: c2.match.id, snap: { t: 2, done: 1 }, turnTo: 'quill', over: true, winner: 'quill' }, ta);
		A(fin.ok && fin.match.status === 'over' && fin.match.winner === 'quill', 'a played-out finish records its winner');
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
		console.error(e);
	} finally {
		server.kill();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
