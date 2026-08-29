// async_smoke.mjs — correspondence (play-by-mail) duels, API-level: challenge,
// accept, opening deal, alternating turns, turn-order enforcement, resign,
// list shapes. Boots the REAL dev server on a fresh sqlite (dust_smoke pattern).
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
