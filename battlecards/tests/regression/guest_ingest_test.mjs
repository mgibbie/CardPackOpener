// guest_ingest_test.mjs — PR 7: the duel-guest/spectator ingest path and the
// _lastDamager → _lastDamagerUid identity fix.
//
// The old spread-rebuild ingest had two latent defects this pins the fixes for:
//   1. Silent field drops: the guest's optimistic engine simulated on a state
//      missing every lazily-created field the allow-list didn't know.
//   2. Identity loss: Faceless Replicator's killer was an OBJECT REF, which
//      JSON.stringify duplicated into the victim — after ingest, the ref no
//      longer pointed at the board instance, so killerTransform dead-ended
//      (and could never work for a resumed host or a guest).
import fs from 'fs';
import * as E from '../../engine.js';
import { validateGameState } from '../../engine/validate.js';
import { seededRng } from '../../engine/rng.js';
import { toSnapshot, fromSnapshot, migrate } from '../../engine/serialize.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// --- killerTransform still works live (behavior parity for the uid rewrite) ---
{
	const r = new Scenario(byId)
		.def('t_killer', { type: 'creature', cost: 3, attack: 4, health: 9 })
		.board(0, ['t_killer'])
		.board(1, ['faceless_replicator'])
		.attack(0, 0, { targetBoard: [1, 0] })
		.expect('killer became a Faceless Replicator', st =>
			st.players[0].board.length === 1 && st.players[0].board[0].id === 'faceless_replicator')
		.expect('the dead replicator is in the graveyard', st =>
			st.players[1].graveyard.some(c => c.id === 'faceless_replicator'))
		.run();
	ok('killerTransform: live game parity', r.failures.length === 0, r.failures);
}
// --- killerTransform survives a snapshot round-trip (THE identity fix) ---
{
	const s = new Scenario(byId)
		.def('t_pinger', { type: 'creature', cost: 1, attack: 1, health: 9 })
		.board(0, ['t_pinger'])
		.board(1, ['faceless_replicator'])
		.attack(0, 0, { targetBoard: [1, 0] }); // damages, doesn't kill: _lastDamagerUid set
	const { state } = s.run();
	ok('setup: replicator damaged, still alive', state.players[1].board[0]?.damage === 1);
	ok('setup: killer tracked by uid', state.players[1].board[0]._lastDamagerUid === state.players[0].board[0].uid);

	// wire round-trip mid-combat, then finish the kill on the RESTORED state
	const wire = JSON.parse(JSON.stringify(toSnapshot(state)));
	const restored = fromSnapshot(wire, byId, seededRng(1));
	E.ensureUidsAbove(E.maxSnapshotUid(wire));
	const rep = restored.players[1].board[0];
	rep.damage = rep.maxHealth; // lethal; sweep runs killerTransform
	E.endTurn(restored);
	ok('killerTransform fires on the restored state', restored.players[0].board.some(c => c.id === 'faceless_replicator'),
		restored.players[0].board.map(c => c.id).join(','));
}
// --- migrate converts pre-uid snapshots (object ref, duplicated by JSON) ---
{
	const s = new Scenario(byId)
		.def('t_killer', { type: 'creature', cost: 3, attack: 4, health: 9 })
		.board(0, ['t_killer'])
		.board(1, ['faceless_replicator']);
	const { state } = s.run();
	const killer = state.players[0].board[0];
	const victim = state.players[1].board[0];
	victim._lastDamager = JSON.parse(JSON.stringify(killer)); // what a pre-uid publisher's wire JSON holds
	victim.damage = victim.maxHealth;
	delete victim._lastDamagerUid;
	const m = migrate(JSON.parse(JSON.stringify(toSnapshot(state))));
	const mv = m.players[1].board[0];
	ok('migrate: object ref converted to uid', mv._lastDamagerUid === killer.uid && mv._lastDamager === undefined);
	const restored = fromSnapshot(m, byId, seededRng(2));
	E.endTurn(restored);
	ok('migrate: killerTransform works from a pre-uid snapshot', restored.players[0].board.some(c => c.id === 'faceless_replicator'));
}
// --- stale killer uid = safe no-op (parity with the old dead-ref guards) ---
{
	// filler decks: an empty deck reshuffles the graveyard back in at the next
	// draw step, which would empty the graveyard this test asserts against
	const s = new Scenario(byId)
		.def('t_fill', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.deck(0, Array(5).fill('t_fill'))
		.deck(1, Array(5).fill('t_fill'))
		.board(1, ['faceless_replicator']);
	const { state } = s.run();
	const victim = state.players[1].board[0];
	victim._lastDamagerUid = 999999; // killer long gone
	victim.damage = victim.maxHealth;
	let threw = null;
	try { E.endTurn(state); } catch (e) { threw = e.message; }
	ok('stale killer uid: dies without transform, no throw', threw === null
		&& state.players[0].board.length === 0
		&& state.players[1].graveyard.some(c => c.id === 'faceless_replicator'), threw);
}
// --- full guest-ingest simulation: host plays, guest ingests, guest acts ---
{
	const rng = seededRng(777);
	const host = E.createGame(byId, rng, null, 2);
	for (let i = 0; i < 8 && !host.over; i++) E.endTurn(host);
	host.expanseEvents = 55; // lazily-created state the old ingest dropped
	const wire = JSON.parse(JSON.stringify(toSnapshot(host))); // server relay
	const guest = fromSnapshot(wire, byId);
	E.ensureUidsAbove(E.maxSnapshotUid(wire));
	ok('guest state passes the validator', validateGameState(guest).length === 0, validateGameState(guest).join(' | '));
	ok('guest sees the complete host state', guest.expanseEvents === 55 && guest.dealt === true);
	// the guest's optimistic engine must be able to act on the ingested state
	let threw = null;
	try { E.endTurn(guest); E.endTurn(guest); } catch (e) { threw = e.message; }
	ok('guest optimistic actions run clean', threw === null && validateGameState(guest).length === 0, threw);
	// uid hygiene: everything the guest minted is globally unique
	const seen = new Set(); let dup = null;
	for (const p of guest.players) for (const z of [p.hand, p.board, p.graveyard]) for (const c of z) {
		if (seen.has(c.uid)) dup = c.uid; seen.add(c.uid);
	}
	ok('no uid collisions after guest actions', dup === null, `dup ${dup}`);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
