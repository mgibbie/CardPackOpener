// engine/serialize.js — versioned game-state snapshots (docs/engine-hardening/07).
//
// One authoritative snapshot shape replaces the two hand-maintained allow-lists
// in game.js (snapshotForDuel / snapshotState — "drift by construction"). The
// serialized state is everything except the three runtime attachments:
//   - state.rng       (a function; reattached by fromSnapshot)
//   - state.cardsById (the shared immutable card DB; reattached, never sent)
//   - state.events    (presentation-only animation queue; restored empty)
// plus dev-only scratch (state.debug, state._fxCount).
//
// v0 = the pre-version snapshots the old allow-lists published (no
// schemaVersion field). They silently dropped fifteen lazily-created top-level
// fields (docs/07 "silent-loss list"); migrate() fills those with the engine's
// defaults — exactly what the old spread-rebuild ingest accidentally produced —
// so v0 publishers keep working against new ingesters during rollout.
//
// Pure module: no engine.js imports, no I/O. game.js delegates its snapshot
// fns here (adapter); the guest/spectator ingest switch to fromSnapshot is a
// separate PR (docs/09 PR 7).

import { restoreRng } from './rng.js';

export const SCHEMA_VERSION = 1;

// Runtime attachments + dev scratch — never serialized as live fields. `rng` is
// special: the function itself can't cross the wire, but if it's a SEEDED rng
// (engine/rng.js seededRng — has .snapshot()) toSnapshot records its {seed,
// calls} POSITION under a top-level `rng` key so an ingester can rebuild the
// identical stream (deterministic duels/replays). fromSnapshot restores it.
const EXCLUDED = new Set(['rng', 'cardsById', 'events', 'debug', '_fxCount']);

// Every top-level state field the engine writes, with the default a fresh /
// v0-migrated state should carry when the field is absent. Sourced from
// createGame's literal plus every lazily-created `state.X = (state.X || …)`
// site in engine.js (the docs/07 silent-loss list).
const FIELD_DEFAULTS = {
	players: null,          // required — no default; validated below
	current: 0,
	turnNumber: 1,
	over: false,
	winner: null,
	classPicks: null,
	scryQueue: () => [], discardQueue: () => [], pickQueue: () => [],
	askQueue: () => [], sacQueue: () => [], dredgeQueue: () => [],
	stack: () => [], priority: null, passers: () => [], priorityNext: 0,
	plane: null,
	anomaly: null,
	pendingReturns: () => [],
	// — the silent-loss list (dropped by the old allow-lists) —
	forcedTurns: () => [],  // Temporus / extra-turn chains
	shortTurns: false,      // Nozdormu Eternal
	expanseEvents: 0,       // The Ceaseless Expanse counter
	minionsDiedGame: 0,     // Reska
	diedThisTurn: 0,        // Volcanic Drake discounts
	exactKills: 0,
	hpResolver: null,       // Wilfred Fizzlebang (transient during hero power)
	hpDamageBonus: 0,
	hpDoubling: false,
	dealt: true,            // a mid-game snapshot is always past the opening deal
	blinkDepth: 0,
	summonDepth: 0,         // runaway-summon recursion guard (0 between actions)
	recasting: false,       // transient locks; false between actions
	ponderLock: false,
	drawTrigLock: false,
	enemyDrawLock: false,
	emergeLock: false,
};

const defaultFor = key => {
	const d = FIELD_DEFAULTS[key];
	return typeof d === 'function' ? d() : d;
};

// Drift detector: warn once per unknown field name, per page/process life.
const warnedDrift = new Set();

// Serialize `state` to a JSON-safe snapshot. Known fields are enumerated;
// an unknown top-level field (a future engine addition this module doesn't
// know yet) is COPIED anyway and warned about — dropping it silently would
// recreate the exact bug class this module exists to fix.
// NOTE: values are passed by reference, not cloned (matching the old snapshot
// fns) — callers transmit via JSON.stringify, which does the copy.
export function toSnapshot(state) {
	if (!state) return null;
	const snap = { schemaVersion: SCHEMA_VERSION };
	for (const key of Object.keys(FIELD_DEFAULTS)) {
		snap[key] = state[key] !== undefined ? state[key] : defaultFor(key);
	}
	for (const key of Object.keys(state)) {
		if (key in FIELD_DEFAULTS || EXCLUDED.has(key)) continue;
		snap[key] = state[key];
		if (!warnedDrift.has(key)) {
			warnedDrift.add(key);
			console.warn(`serialize: unknown state field '${key}' — add it to FIELD_DEFAULTS in engine/serialize.js`);
		}
	}
	snap.playerCount = state.players.length; // legacy ingest sites read this
	// deterministic-rng carry: only a SEEDED rng exposes .snapshot(); an unseeded
	// Math.random game emits no `rng` field, so its ingest falls back to Math.random
	// (unchanged behavior). {seed, calls} is JSON-safe.
	if (state.rng && typeof state.rng.snapshot === 'function') snap.rng = state.rng.snapshot();
	return snap;
}

// Bring an older snapshot up to the current schema. v0 (no schemaVersion) is
// what the old allow-list publishers send: fill their dropped fields with the
// engine defaults the spread-rebuild ingest accidentally produced.
// NOTE: nested card objects are fixed up IN PLACE — callers pass snapshots
// fresh from JSON.parse (wire) or fs.read (fixtures), never live state.
export function migrate(snap) {
	const out = { ...snap };
	for (const key of Object.keys(FIELD_DEFAULTS)) {
		if (out[key] === undefined) out[key] = defaultFor(key);
	}
	// pre-uid publishers stored the Faceless Replicator killer as an object ref,
	// which JSON.stringify DUPLICATED into the victim (docs/07 hazard list) —
	// convert to the uid form the engine reads now, applied at any version
	// (a v1 publisher on a pre-uid engine build still emits the object form)
	const fixLastDamager = v => {
		if (Array.isArray(v)) { for (const x of v) fixLastDamager(x); return; }
		if (v && typeof v === 'object') {
			if (v._lastDamager && typeof v._lastDamager === 'object') {
				if (v._lastDamagerUid == null) v._lastDamagerUid = v._lastDamager.uid;
				delete v._lastDamager;
			}
			// pre-rename publishers called the Miracle field 'swiftdraw'
			if (v.swiftdraw !== undefined) {
				if (v.miracle === undefined) v.miracle = v.swiftdraw;
				delete v.swiftdraw;
			}
			for (const k of Object.keys(v)) fixLastDamager(v[k]);
		}
	};
	fixLastDamager(out.players);
	out.schemaVersion = SCHEMA_VERSION;
	return out;
}

// Rebuild a live engine state from a snapshot: migrate → validate shape →
// reattach the runtime fields. Pass a seeded rng (engine/rng.js seededRng /
// restoreRng) for deterministic replay-resume; defaults to Math.random.
// CALLER NOTE: instantiate's uid counter is process-global, so a process that
// restores a snapshot from ELSEWHERE (duel guest, spectator) must lift its
// counter past the restored uids before minting new instances — call
// engine.js `ensureUidsAbove(maxSnapshotUid(snap))` — or fresh instances can
// collide with restored ones (renderer keys and `includes()` checks break).
export function maxSnapshotUid(snap) {
	let max = 0;
	const walk = v => {
		if (Array.isArray(v)) { for (const x of v) walk(x); return; }
		if (v && typeof v === 'object') {
			if (typeof v.uid === 'number' && v.uid > max) max = v.uid;
			for (const k of Object.keys(v)) walk(v[k]);
		}
	};
	walk(snap);
	return max;
}

export function fromSnapshot(snap, cardsById, rng) {
	if (!snap || !Array.isArray(snap.players) || !snap.players.length) {
		throw new Error('fromSnapshot: snapshot has no players');
	}
	const state = migrate(snap);
	delete state.schemaVersion; // transport-only fields; not engine state
	delete state.playerCount;
	delete state.digest;        // the host's wire fingerprint; not engine state (would else leak into re-serialization)
	delete state.rng;           // the {seed,calls} carry (below) is not a live rng
	state.cardsById = cardsById;
	// An explicit rng arg always wins (tests pass their own). Otherwise, if the
	// snapshot carried a seeded-rng position, rebuild that exact stream so a guest
	// or spectator's rolls track the host's; an unseeded snapshot → Math.random.
	state.rng = rng !== undefined ? rng : (snap.rng ? restoreRng(snap.rng) : Math.random);
	state.events = [];
	return state;
}

// Canonical form for tests and digest comparison: the serializable subset with
// recursively sorted object keys and DETERMINISTICALLY REMAPPED uids, so
// JSON.stringify(normalize(a)) is a stable gameplay digest. The remap matters
// because instantiate's uid counter is module-global (engine.js `nextUid`),
// not part of state — two gameplay-identical timelines (an original and a
// snapshot-restored twin) mint different raw uids for post-snapshot draws.
// Uid-valued fields follow a naming convention: `uid`, `uids` (array), and
// any `*Uid` reference (_lastDamagerUid, sourceUid, …) — all remapped through
// one first-encounter-ordered map so cross-references stay consistent.
// Nothing is stripped — in this engine, underscore-prefixed card fields are
// load-bearing gameplay state (_takaId, _doomAtTurn, …), not scratch.
export function normalize(state) {
	const uidMap = new Map();
	const remap = u => {
		if (typeof u !== 'number') return u;
		if (!uidMap.has(u)) uidMap.set(u, uidMap.size + 1);
		return uidMap.get(u);
	};
	const isUidKey = k => k === 'uid' || k.endsWith('Uid');
	const sort = v => {
		if (Array.isArray(v)) return v.map(sort);
		if (v && typeof v === 'object') {
			const out = {};
			for (const k of Object.keys(v).sort()) {
				if (typeof v[k] === 'function') continue;
				if (isUidKey(k)) out[k] = remap(v[k]);
				else if (k === 'uids' && Array.isArray(v[k])) out[k] = v[k].map(remap);
				else out[k] = sort(v[k]);
			}
			return out;
		}
		return v;
	};
	const snap = toSnapshot(state);
	delete snap.schemaVersion;
	delete snap.playerCount;
	delete snap.rng; // rng POSITION is transport, not gameplay — a digest is stream-agnostic
	return sort(snap);
}

// A compact FNV-1a fingerprint of normalize(state) — identical for any two
// gameplay-identical states regardless of rng position or raw uid numbering
// (normalize strips events/rng/cardsById and remaps uids). The host stamps
// stateDigest(liveState) into each wire snapshot; a guest recomputes it on its
// freshly-deserialized state and, on a mismatch, knows the wire round-trip
// silently dropped or mangled a gameplay field it can't otherwise see. The guest
// is already on the authoritative rebuild (so play self-heals), but the drift is
// reported instead of passing unseen. A faithful round-trip ALWAYS matches, so
// this never false-alarms. (Do NOT compute this inside toSnapshot — normalize
// calls toSnapshot, which would recurse.)
export function stateDigest(state) {
	if (!state || !Array.isArray(state.players)) return '00000000';
	const s = JSON.stringify(normalize(state));
	let h = 0x811c9dc5;
	for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 0x01000193);
	return (h >>> 0).toString(16).padStart(8, '0');
}
