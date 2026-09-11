// replayrec_test.mjs — the replay recorder's core fidelity guarantee: every
// frame it captures, after gzip → localStorage → unpack → fromSnapshot, restores
// to the EXACT state it was taken from (identical stateDigest). Runs the whole
// pipeline (capture → freeze → toSnapshot → packString → ring buffer → getReplay)
// against a real seeded engine game, with a tiny localStorage shim.
import { readFileSync } from 'fs';
import * as E from '../../engine/index.js';

// localStorage shim so safestore (and thus the recorder's persistence) works in node
globalThis.localStorage = (() => {
	const m = new Map();
	return { getItem: k => (m.has(k) ? m.get(k) : null), setItem: (k, v) => { m.set(k, String(v)); }, removeItem: k => m.delete(k), clear: () => m.clear() };
})();
const R = await import('../../replayrec.js'); // import AFTER the shim exists

let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const cardsData = JSON.parse(readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {};
for (const c of cardsData.cards) cardsById[c.id] = c;

// a real, seeded 2-player game; random decks from the pool (the fuzzer's createGame path)
const state = E.createGame(cardsById, E.seededRng(12345), null, 2, null);

// record start + a handful of end-turns; keep an expected digest per captured frame,
// mirroring the recorder's own dedup so the two stay aligned
const expected = [];
let lastDg = null;
const step = label => {
	const dg = E.stateDigest(state);
	if (dg === lastDg) return;   // same as recorder's skip-unchanged rule
	lastDg = dg; expected.push(dg); R.capture(state, label);
};
R.startRecording({ mode: 'test', heroes: [{ classId: 'a' }, { classId: 'b' }] });
step('start');
for (let i = 0; i < 8 && !state.over; i++) { E.endTurn(state); step('turn ' + (i + 1)); }
ok('recorder captured several distinct frames', expected.length >= 4, expected.length);

const id = await R.finish({ winner: state.winner ?? null, result: 'test' });
ok('finish() persisted a replay and returned an id', typeof id === 'string' && id.startsWith('r_'), id);

const listed = R.listReplays();
ok('the replay shows up in the index', listed.some(r => r.id === id), listed.length);
ok('index carries plaintext meta (no decode needed to list)', listed[0]?.meta?.mode === 'test' && listed[0]?.meta?.frames === expected.length, JSON.stringify(listed[0]?.meta));

const tape = await R.getReplay(id);
ok('getReplay decodes the gzipped tape', tape && Array.isArray(tape.frames), tape && typeof tape);
ok('frame count matches what was captured', tape.frames.length === expected.length, `${tape.frames.length} vs ${expected.length}`);

// THE fidelity check: each stored frame restores to the exact state it was taken from
let allFaithful = true, worst = '';
for (let i = 0; i < tape.frames.length; i++) {
	const snap = tape.frames[i].snap;
	const st = E.fromSnapshot(snap, cardsById);
	E.ensureUidsAbove(E.maxSnapshotUid(snap)); // process-global uid safety (renderer/key parity)
	const got = E.stateDigest(st);
	if (got !== expected[i]) { allFaithful = false; worst = `frame ${i}: ${got} != ${expected[i]}`; break; }
}
ok('EVERY frame restores to its exact captured state (digest match)', allFaithful, worst);
ok('captions + turn numbers are stored per frame', tape.frames.every(f => 'cap' in f && typeof f.turn === 'number'));

// ring buffer + delete
R.deleteReplay(id);
ok('deleteReplay removes it from the index', !R.listReplays().some(r => r.id === id));

// ---- slim (v2) tapes: cards diffed against their defs, inflated on load ----
// A full game's raw tape measured ~2.4MB packed — 3× the 800KB share cap, so
// every "Copy replay link" fell back to a gigantic paste-able code. With the
// card db handed over, save() slims each card to {id, uid, diffs} and getReplay
// inflates it back; fidelity must stay EXACT and the code must shrink hard.
{
	const { packString } = await import('../../codec.js');
	R.setCards(cardsById);
	const st2 = E.createGame(cardsById, E.seededRng(777), null, 2, null);
	const expected2 = [];
	let last2 = null;
	const step2 = label => {
		const dg = E.stateDigest(st2);
		if (dg === last2) return;
		last2 = dg; expected2.push(dg); R.capture(st2, label);
	};
	R.startRecording({ mode: 'slimtest' });
	step2('start');
	for (let i = 0; i < 14 && !st2.over; i++) { E.endTurn(st2); step2('turn ' + (i + 1)); }
	const id2 = await R.finish({ result: 'slimtest' });
	ok('v2: finish() saved a slim tape', typeof id2 === 'string');
	const slimCode = R.exportCode(id2);
	ok('v2: the packed code still speaks the share codec', /^[GR]1\./.test(slimCode || ''));
	const tape2 = await R.getReplay(id2);
	ok('v2: getReplay hands the renderer a fully hydrated tape', tape2 && tape2.v === 1 && tape2.frames.length === expected2.length, tape2 && tape2.v);
	let faithful2 = true, worst2 = '';
	for (let i = 0; i < tape2.frames.length; i++) {
		const st = E.fromSnapshot(tape2.frames[i].snap, cardsById);
		E.ensureUidsAbove(E.maxSnapshotUid(tape2.frames[i].snap));
		const got = E.stateDigest(st);
		if (got !== expected2[i]) { faithful2 = false; worst2 = `frame ${i}: ${got} != ${expected2[i]}`; break; }
	}
	ok('v2: EVERY inflated frame restores to its exact captured state', faithful2, worst2);
	// the size win: repack the same (inflated) tape without slimming and compare
	const fullCode = await packString(JSON.stringify(tape2));
	ok('v2: the slim code is under a third of the full-frame code',
		slimCode.length < fullCode.length / 3, `slim ${slimCode.length} vs full ${fullCode.length}`);
	console.log(`slim tape: ${(slimCode.length / 1024).toFixed(0)}KB packed vs ${(fullCode.length / 1024).toFixed(0)}KB unslimmed (${tape2.frames.length} frames)`);
	R.deleteReplay(id2);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
