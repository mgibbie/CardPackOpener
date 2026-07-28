// serialize_test.mjs — engine/serialize.js contract tests.
//
// Covers: full round-trip fidelity (including the docs/07 "silent-loss list"
// the old allow-lists dropped), v0 migration from a committed wire fixture,
// the drift detector, dungeon RUN_KEY contract canary, and the headline
// capability: snapshot + rng snapshot → deterministic replay-resume.
import fs from 'fs';
import * as E from '../../engine.js';
import { validateGameState } from '../../engine/validate.js';
import { seededRng, restoreRng } from '../../engine/rng.js';
import { SCHEMA_VERSION, toSnapshot, fromSnapshot, migrate, normalize } from '../../engine/serialize.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };
const digest = st => JSON.stringify(normalize(st));

// --- round-trip: everything survives the wire, including the silent-loss list ---
{
	const state = E.createGame(byId, seededRng(1), null, 2);
	for (let i = 0; i < 4; i++) E.endTurn(state);
	// populate lazily-created fields the OLD allow-lists silently dropped
	state.expanseEvents = 41;
	state.minionsDiedGame = 7;
	state.forcedTurns = [1, 1];
	state.shortTurns = true;
	state.blinkDepth = 0;

	const snap = toSnapshot(state);
	ok('snapshot is version-stamped', snap.schemaVersion === SCHEMA_VERSION);
	ok('snapshot is JSON-safe', (() => { JSON.parse(JSON.stringify(snap)); return true; })());

	const wire = JSON.parse(JSON.stringify(snap)); // what the server relay does
	const restored = fromSnapshot(wire, byId, seededRng(2));
	ok('restored state passes the validator', validateGameState(restored).length === 0, validateGameState(restored).join(' | '));
	ok('silent-loss fields survive the wire', restored.expanseEvents === 41 && restored.minionsDiedGame === 7
		&& JSON.stringify(restored.forcedTurns) === '[1,1]' && restored.shortTurns === true);
	ok('dealt survives (Emerge stays armed)', restored.dealt === true);
	ok('runtime fields reattached', restored.cardsById === byId && typeof restored.rng === 'function' && restored.events.length === 0);
	ok('transport-only fields stripped from state', !('schemaVersion' in restored) && !('playerCount' in restored));
	ok('round-trip digest identical', digest(state) === digest(restored));
	ok('restored game is playable', (() => { E.endTurn(restored); return !validateGameState(restored).length; })());
}
// --- v0 migration: the committed wire fixture from a pre-versioning host ---
{
	const v0 = JSON.parse(fs.readFileSync(new URL('../fixtures/duel_snapshot_v0.json', import.meta.url)));
	ok('fixture really is v0', v0.schemaVersion === undefined);
	const m = migrate(v0);
	ok('migrate stamps the version', m.schemaVersion === SCHEMA_VERSION);
	ok('migrate fills the silent-loss defaults', m.dealt === true && m.expanseEvents === 0
		&& Array.isArray(m.forcedTurns) && Array.isArray(m.pendingReturns) && m.hpResolver === null);
	const restored = fromSnapshot(v0, byId, seededRng(3));
	ok('v0 fixture restores clean', validateGameState(restored).length === 0, validateGameState(restored).join(' | '));
	ok('v0 fixture is playable after restore', (() => { for (let i = 0; i < 4; i++) E.endTurn(restored); return !restored.players.some(p => Number.isNaN(p.life)); })());
	let threw = null;
	try { fromSnapshot({ turnNumber: 3 }, byId); } catch (e) { threw = e.message; }
	ok('junk snapshot rejected loudly', !!threw && threw.includes('players'), threw);
}
// --- drift detector: unknown state fields are copied AND warned about ---
{
	const state = E.createGame(byId, seededRng(4), null, 2);
	state.someFutureField = { a: 1 };
	const warnings = [];
	const realWarn = console.warn;
	console.warn = m => warnings.push(String(m));
	const snap = toSnapshot(state);
	toSnapshot(state); // second call must not re-warn
	console.warn = realWarn;
	ok('unknown field still serialized (fail-safe)', snap.someFutureField?.a === 1);
	ok('drift warned exactly once', warnings.filter(w => w.includes('someFutureField')).length === 1, warnings.join(' | '));
}
// --- replay-resume: snapshot + rng snapshot → identical continuation ---
{
	const rng = seededRng(555);
	const state = E.createGame(byId, rng, null, 2);
	for (let i = 0; i < 3; i++) E.endTurn(state);
	const wire = JSON.parse(JSON.stringify(toSnapshot(state)));
	const rngSnap = rng.snapshot();
	// original timeline continues…
	for (let i = 0; i < 6; i++) E.endTurn(state);
	// …and the restored copy replays the same actions from the same rng position
	const twin = fromSnapshot(wire, byId, restoreRng(rngSnap));
	for (let i = 0; i < 6; i++) E.endTurn(twin);
	ok('replay-resume: identical timelines', digest(state) === digest(twin));
}
// --- uid safety: restoring foreign state must not mint colliding uids ---
{
	const wire = JSON.parse(fs.readFileSync(new URL('../fixtures/duel_snapshot_v0.json', import.meta.url)));
	// simulate a foreign snapshot whose uids are far ahead of this process
	const bump = 100000;
	const lift = v => {
		if (Array.isArray(v)) return v.forEach(lift);
		if (v && typeof v === 'object') { if (typeof v.uid === 'number') v.uid += bump; Object.values(v).forEach(lift); }
	};
	lift(wire);
	const restored = fromSnapshot(wire, byId, seededRng(6));
	const maxU = E.maxSnapshotUid(wire);
	ok('maxSnapshotUid finds the ceiling', maxU > bump, maxU);
	E.ensureUidsAbove(maxU);
	// force new instantiations (draws) and check global uniqueness
	for (let i = 0; i < 4; i++) E.endTurn(restored);
	const seen = new Set(); let dup = null;
	for (const p of restored.players) for (const z of [p.hand, p.board, p.graveyard]) for (const c of z) {
		if (seen.has(c.uid)) dup = c.uid; seen.add(c.uid);
	}
	ok('no uid collisions after restore + ensureUidsAbove', dup === null, `dup uid ${dup}`);
}
// --- dungeon RUN_KEY canary: saved-run contract must keep loading ---
{
	const run = JSON.parse(fs.readFileSync(new URL('../fixtures/dungeon_run_v0.json', import.meta.url)));
	const D = await import('../../dungeon.js');
	ok('run blob shape intact', run.active === true && typeof run.classId === 'string'
		&& Number.isInteger(run.level) && Array.isArray(run.deck) && Array.isArray(run.passives) && typeof run.bossId === 'string');
	const missing = run.deck.filter(id => !byId[id]);
	ok('every deck card id still exists in cards.json', missing.length === 0, missing.join(','));
	ok('boss id still exists', !!D.BOSSES[run.bossId], run.bossId);
	const badTreasure = run.passives.filter(t => !D.TREASURES[t]);
	ok('treasure keys still exist', badTreasure.length === 0, badTreasure.join(','));
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
