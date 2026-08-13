// deterministic_duel_test.mjs — PvP card duels are host-authoritative but the
// guest applies moves OPTIMISTICALLY before the host's snapshot lands. If the
// guest's rng doesn't track the host's, a random effect (Swamp conjure, Discover,
// random target, coin flip) resolves to a DIFFERENT result on the guest for
// ~1.3s and then snaps to the host's — the flicker/desync the land-tap report hit.
//
// The fix: the duel host seeds its engine (game.js seededRng(duelSeed(matchId)))
// and toSnapshot carries the rng POSITION ({seed, calls}); fromSnapshot, given no
// explicit rng, reconstructs that exact stream. This pins every link of that
// chain plus the backward-compat guarantee that unseeded (solo/AI) games are
// untouched.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng, restoreRng } from '../../engine/rng.js';
import { toSnapshot, fromSnapshot, normalize } from '../../engine/serialize.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };
const digest = st => JSON.stringify(normalize(st));

// mirror of game.js duelSeed (xmur3): the host derives its seed from the shared
// match id, so a duel is reproducible and a reconnecting host re-seeds identically.
function duelSeed(id) {
	const s = String(id);
	let h = 1779033703 ^ s.length;
	for (let i = 0; i < s.length; i++) { h = Math.imul(h ^ s.charCodeAt(i), 3432918353); h = (h << 13) | (h >>> 19); }
	return (h >>> 0) || 1;
}

// --- duelSeed: stable, uint32, never 0 (mulberry32 tolerates 0 but we avoid it) ---
{
	ok('duelSeed is deterministic for a given id', duelSeed('MATCH_abc123') === duelSeed('MATCH_abc123'));
	ok('duelSeed varies by id', duelSeed('MATCH_a') !== duelSeed('MATCH_b'));
	const s = duelSeed('anything');
	ok('duelSeed is a uint32', Number.isInteger(s) && s >= 0 && s <= 0xffffffff);
	ok('duelSeed is never 0', duelSeed('') !== 0 && duelSeed('\0') !== 0);
}

// --- toSnapshot carries the rng position for a SEEDED (duel) game ---
{
	const host = E.createGame(byId, seededRng(duelSeed('DUEL_1')), null, 2);
	for (let i = 0; i < 6 && !host.over; i++) E.endTurn(host);
	const snap = toSnapshot(host);
	ok('seeded snapshot carries {seed, calls}',
		snap.rng && snap.rng.seed === (duelSeed('DUEL_1') >>> 0) && typeof snap.rng.calls === 'number');
	ok('the carried position matches the live rng', snap.rng.calls === host.rng.snapshot().calls);
	ok('rng position is JSON-safe', (() => { const w = JSON.parse(JSON.stringify(snap)); return w.rng.seed === snap.rng.seed && w.rng.calls === snap.rng.calls; })());
}

// --- toSnapshot OMITS rng for an unseeded (solo/AI) game — backward compat ---
{
	const solo = E.createGame(byId, Math.random, null, 2);
	for (let i = 0; i < 4 && !solo.over; i++) E.endTurn(solo);
	const snap = toSnapshot(solo);
	ok('Math.random game emits NO rng field', !('rng' in snap));
	const restored = fromSnapshot(JSON.parse(JSON.stringify(snap)), byId);
	ok('unseeded ingest falls back to a Math.random function (no .snapshot)',
		typeof restored.rng === 'function' && typeof restored.rng.snapshot !== 'function');
}

// --- THE FIX: guest ingest with NO rng arg reconstructs the host's exact stream ---
{
	const host = E.createGame(byId, seededRng(duelSeed('DUEL_2')), null, 2);
	for (let i = 0; i < 7 && !host.over; i++) E.endTurn(host);
	const wire = JSON.parse(JSON.stringify(toSnapshot(host))); // server relay
	const guest = fromSnapshot(wire, byId); // guest passes no rng — auto-restore
	E.ensureUidsAbove(E.maxSnapshotUid(wire));

	ok('guest rng resumes at the host seed+position',
		typeof guest.rng.snapshot === 'function'
		&& guest.rng.snapshot().seed === wire.rng.seed
		&& guest.rng.snapshot().calls === wire.rng.calls);

	// the user-facing guarantee: the guest's rolls are byte-identical to the host's,
	// so a conjure/discover/random-target picks the SAME card on both sides.
	const hostRolls = [], guestRolls = [];
	for (let i = 0; i < 12; i++) { hostRolls.push(host.rng()); guestRolls.push(guest.rng()); }
	ok('guest rolls track host rolls exactly (no conjure divergence)',
		JSON.stringify(hostRolls) === JSON.stringify(guestRolls), guestRolls.join(','));
}

// --- end-to-end: seeded host + auto-restored guest stay board-identical ---
{
	const host = E.createGame(byId, seededRng(duelSeed('DUEL_3')), null, 2);
	for (let i = 0; i < 5 && !host.over; i++) E.endTurn(host);
	const wire = JSON.parse(JSON.stringify(toSnapshot(host)));
	const guest = fromSnapshot(wire, byId);
	E.ensureUidsAbove(E.maxSnapshotUid(wire));
	// both apply the identical sequence; rng-consuming steps must land the same
	for (let i = 0; i < 8 && !host.over && !guest.over; i++) { E.endTurn(host); E.endTurn(guest); }
	ok('deterministic duel: guest board digest == host board digest', digest(host) === digest(guest));
}

// --- an explicit rng arg still overrides the carried position (tests/replays) ---
{
	const host = E.createGame(byId, seededRng(duelSeed('DUEL_4')), null, 2);
	for (let i = 0; i < 3 && !host.over; i++) E.endTurn(host);
	const wire = JSON.parse(JSON.stringify(toSnapshot(host)));
	const forced = fromSnapshot(wire, byId, seededRng(999));
	ok('explicit rng arg wins over snap.rng', forced.rng.snapshot().seed === 999);
	// restoreRng(wire.rng) is exactly what the auto-path does — same stream
	const manual = fromSnapshot(JSON.parse(JSON.stringify(wire)), byId, restoreRng(wire.rng));
	const auto = fromSnapshot(JSON.parse(JSON.stringify(wire)), byId);
	ok('auto-restore == explicit restoreRng(snap.rng)',
		manual.rng.snapshot().calls === auto.rng.snapshot().calls && manual.rng.snapshot().seed === auto.rng.snapshot().seed);
}

// --- digest is rng-agnostic: normalize never leaks the transport position ---
{
	const host = E.createGame(byId, seededRng(1), null, 2);
	for (let i = 0; i < 4 && !host.over; i++) E.endTurn(host);
	ok('normalize digest carries no rng key', !('rng' in normalize(host)));
	// same gameplay reached via a differently-seeded restore must digest identically
	const wire = JSON.parse(JSON.stringify(toSnapshot(host)));
	const twin = fromSnapshot(wire, byId, seededRng(42)); // different seed, same board
	ok('same board, different rng seed → identical digest', digest(host) === digest(twin));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
