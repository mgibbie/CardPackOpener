// fill_board_on_summon_death_test.mjs — a "fill the board" effect always terminates.
//
// 2026-11-05, Lorequest (Jace fight, run rmw36dw870ejzhk): the AI's turn 22 froze the tab and
// every "Continue the run" froze it again. Jace held Mad Summoner ("Fill each player's board with
// 1/1 Imps") and had the Duels treasure Spiked Arms equipped ("After you summon a creature, deal 1
// damage to it"). Each Imp died on entry, dead creatures don't count toward the 7, so
//   while (alive < 7) summon(Imp)
// never finished; every pass allocated a new card until the tab ran out of memory. summon()'s
// MAX_BOARD ceiling also counts only live creatures, so it never refused.
// Fix: every fill-board loop makes at most 7 summon attempts per board (a token that dies on entry
// is a used attempt), and summon() refuses once a board row holds MAX_BOARD_ENTRIES entries, dead
// ones included, as a backstop for any other loop of the same shape.
//
// Each scenario runs in a worker with a deadline, so the old code FAILS (times out) instead of
// hanging the suite.
import { Worker, isMainThread, workerData, parentPort } from 'worker_threads';
import fs from 'fs';

const SCENARIOS = ['each-spiked', 'each-spiked-nesting', 'each-plain', 'token-spiked', 'self-spiked', 'random-cost-spiked', 'ai-step-jace'];

if (!isMainThread) {
	const E = await import('../../engine.js');
	const AI = await import('../../ai.js');
	const { seededRng } = await import('../../engine/rng.js');
	const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
	const byId = {}; for (const c of raw.cards) byId[c.id] = c;
	byId._v = { id: '_v', name: 'V', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common' };
	byId._fillTok = { id: '_fillTok', name: 'Tok', type: 'sorcery', cost: 0, rarity: 'common', effects: [{ type: 'fill-board-token', name: 'Whelp', attack: 1, health: 1 }] };
	byId._oneOne = { id: '_oneOne', name: 'One', type: 'creature', cost: 2, attack: 1, health: 1, rarity: 'common', effects: [{ type: 'fill-board-self' }] };
	byId._rc = { id: '_rc', name: 'RC', type: 'sorcery', cost: 0, rarity: 'common', effects: [{ type: 'fill-board-random-cost', cost: 1 }] };
	const name = workerData;
	const st = E.createGame(byId, seededRng(11), ['_v', '_v', '_v', '_v', '_v', '_v'], 2);
	st.current = 1; st.priority = null; st.stack = [];
	if (name.includes('nesting')) st.anomaly = 'nesting';
	for (const p of st.players) { p.mana = { cur: 10, max: 10, bonus: 0 }; p.hand = []; p.board = []; }
	const give = (pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
	if (name.includes('spiked') || name === 'ai-step-jace') { const w = E.instantiate(byId.duels_spiked_arms, 1); w.zone = 'weapon'; st.players[1].weapon = w; }
	const t0 = Date.now();
	let res = {};
	if (name === 'ai-step-jace') {
		// the frozen turn's shape: the AI to act, Spiked Arms on, Mad Summoner in hand, nesting
		st.anomaly = 'nesting';
		const put = (pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); };
		for (let k = 0; k < 7; k++) put(0, '_v'); // the foe's row is full, so the Summoner only fills the AI's side
		give(1, 'mad_summoner');
		let n = 0; while (n < 300 && AI.step(st, 1)) n++;
		res.steps = n; res.playedSummoner = !st.players[1].hand.some(c => c.id === 'mad_summoner');
	} else {
		const id = name.startsWith('each') ? 'mad_summoner' : name.startsWith('token') ? '_fillTok' : name.startsWith('self') ? '_oneOne' : '_rc';
		const c = give(1, id);
		E.playCard(st, 1, c.uid, null, null);
		if (E.resolveStack) { let g = 0; while (st.stack && st.stack.length && g++ < 50) E.resolveStack(st); }
	}
	const alive = pi => st.players[pi].board.filter(c => !E.isDead(c) && c.type !== 'location').length;
	res = { ...res, ms: Date.now() - t0, alive0: alive(0), alive1: alive(1), len1: st.players[1].board.length, over: st.over };
	parentPort.postMessage(res);
} else {
	let pass = 0, fail = 0;
	const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
	const run = name => new Promise(resolve => {
		const w = new Worker(new URL(import.meta.url), { workerData: name, resourceLimits: { maxOldGenerationSizeMb: 512 } });
		const timer = setTimeout(() => { w.terminate(); resolve({ timeout: true }); }, 15000);
		w.on('message', m => { clearTimeout(timer); w.terminate(); resolve(m); });
		w.on('error', e => { clearTimeout(timer); resolve({ error: String(e && e.message || e) }); });
	});
	const r = {};
	for (const s of SCENARIOS) r[s] = await run(s);
	const done = s => !r[s].timeout && !r[s].error;
	ok('Mad Summoner with Spiked Arms on the caster terminates', done('each-spiked'), JSON.stringify(r['each-spiked']));
	ok('...the caster\'s Imps all die on entry (7 attempts, no live Imps), the board array stays small', done('each-spiked') && r['each-spiked'].alive1 <= 1 && r['each-spiked'].len1 <= 20, JSON.stringify(r['each-spiked']));
	ok('...the opponent (no weapon) still gets a full board of 7', done('each-spiked') && r['each-spiked'].alive0 === 7, JSON.stringify(r['each-spiked']));
	ok('Mad Summoner + Spiked Arms under the Nesting anomaly terminates', done('each-spiked-nesting'), JSON.stringify(r['each-spiked-nesting']));
	ok('Mad Summoner without weapons fills both boards to 7', done('each-plain') && r['each-plain'].alive0 === 7 && r['each-plain'].alive1 === 7, JSON.stringify(r['each-plain']));
	ok('fill-board-token with Spiked Arms terminates', done('token-spiked'), JSON.stringify(r['token-spiked']));
	ok('fill-board-self (1-Health copies) with Spiked Arms terminates', done('self-spiked'), JSON.stringify(r['self-spiked']));
	ok('fill-board-random-cost with Spiked Arms terminates', done('random-cost-spiked'), JSON.stringify(r['random-cost-spiked']));
	ok('an AI turn holding Mad Summoner under Spiked Arms + Nesting finishes quickly', done('ai-step-jace') && r['ai-step-jace'].ms < 5000, JSON.stringify(r['ai-step-jace']));
	console.log(`${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
}
