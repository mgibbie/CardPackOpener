// actionlog_test.mjs — engine/actionlog.js: dispatch, replay, shrink (PR 16).
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { normalize } from '../../engine/serialize.js';
import { dispatch, replayActions, shrinkTrace } from '../../engine/actionlog.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };
const digest = st => JSON.stringify(normalize(st));

// --- dispatch contract ---
{
	const state = E.createGame(byId, seededRng(1), null, 2);
	ok('endTurn dispatches', dispatch(state, { k: 'endTurn' }) === true && state.current === 1);
	let threw = null;
	try { dispatch(state, { k: 'time-travel' }); } catch (e) { threw = e.message; }
	ok('unknown kind throws with the kind named', !!threw && threw.includes('time-travel'), threw);
}
// --- replay fidelity: same seed + same actions → identical game ---
{
	// record: drive a real game through dispatch (game rng isolated, exactly
	// like the fuzzer's --split mode)
	const seed = 20260729;
	const rec = E.createGame(byId, seededRng(seed), null, 2);
	const actions = Array.from({ length: 9 }, () => ({ k: 'endTurn' }));
	for (const a of actions) dispatch(rec, a);
	const r = replayActions(byId, seed, actions, { strict: false });
	ok('replay runs clean', r.error === null, r.error);
	ok('replay reproduces the identical game (digest match)', digest(rec) === digest(r.state));
}
// --- replay failure reporting ---
{
	const r = replayActions(byId, 5, [{ k: 'endTurn' }, { k: 'not-real' }, { k: 'endTurn' }]);
	ok('failure reports the failing index', r.failedAt === 1 && r.error.includes('not-real'), `${r.failedAt} ${r.error}`);
}
// --- shrinkTrace: ddmin to the minimal failing subset ---
{
	const actions = Array.from({ length: 40 }, (_, i) => i + 1);
	const fails = cand => cand.includes(13) && cand.includes(27);
	const min = shrinkTrace(actions, fails);
	ok('shrinks 40 actions to the 2 that matter, order kept', JSON.stringify(min) === '[13,27]', JSON.stringify(min));
	const single = shrinkTrace(actions, cand => cand.includes(40));
	ok('single-culprit shrink', JSON.stringify(single) === '[40]', JSON.stringify(single));
	ok('non-failing input returns itself unshrunk', shrinkTrace([1, 2], () => false).length === 2);
}
// --- shrink + replay end to end: engineered failing trace ---
{
	// a trace whose failure depends on ONE action: the unknown-kind throw
	const seed = 31337;
	const noise = Array.from({ length: 12 }, () => ({ k: 'endTurn' }));
	const trace = [...noise.slice(0, 6), { k: 'boom' }, ...noise.slice(6)];
	const sig = (replayActions(byId, seed, trace).error || '').slice(0, 20);
	ok('engineered trace fails', sig.length > 0);
	const fails = cand => (replayActions(byId, seed, cand).error || '').slice(0, 20) === sig;
	const min = shrinkTrace(trace, fails);
	ok('end-to-end shrink isolates the culprit action', min.length === 1 && min[0].k === 'boom', JSON.stringify(min));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
