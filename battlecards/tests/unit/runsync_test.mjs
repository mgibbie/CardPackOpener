// runsync_test.mjs — boot-time reconciliation of the server run copy vs the local one.
// The bug this guards: after a hard tab-close the server's async final push never lands,
// so hydrate used to overwrite the exact local mid-fight snapshot with the server's stale
// (snapshot-less) copy → resume booted a fresh fight at turn 1. keepLocalRun() must protect
// a fresher local snapshot while still yielding to genuine cross-device progress.
import { keepLocalRun } from '../../runsync.js';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };
const snap = { schemaVersion: 1, players: [] }; // stand-in in-fight snapshot

// ── the reported bug: hard close, server never got the snapshot ──
ok('hard close: keep local snapshot when server has none (same floor)',
	keepLocalRun({ snapshot: snap, snapshotAt: 100, level: 2 }, { level: 2 }) === true);

ok('hard close: keep local even if server copy is entirely absent',
	keepLocalRun({ snapshot: snap, snapshotAt: 100, level: 2 }, undefined) === true);

// ── genuine cross-device progress must still win ──
ok('cross-device: server advanced a floor -> take the server (no stale replay)',
	keepLocalRun({ snapshot: snap, snapshotAt: 100, level: 2 }, { level: 3 }) === false);

ok('cross-device: both mid-fight, server snapshot is newer -> take the server',
	keepLocalRun({ snapshot: snap, snapshotAt: 100, level: 2 }, { snapshot: snap, snapshotAt: 200, level: 2 }) === false);

ok('cross-device: both mid-fight, local snapshot is newer -> keep local',
	keepLocalRun({ snapshot: snap, snapshotAt: 200, level: 2 }, { snapshot: snap, snapshotAt: 100, level: 2 }) === true);

ok('tie on freshness -> keep local (avoids needless clobber)',
	keepLocalRun({ snapshot: snap, snapshotAt: 100, level: 2 }, { snapshot: snap, snapshotAt: 100, level: 2 }) === true);

// ── nothing local worth protecting -> take the server ──
ok('no local snapshot -> take the server',
	keepLocalRun({ level: 2 }, { snapshot: snap, snapshotAt: 100, level: 2 }) === false);

ok('no local run at all -> take the server',
	keepLocalRun(null, { snapshot: snap, snapshotAt: 100, level: 2 }) === false);

// ── legacy local snapshot without a timestamp is still protected vs a snapshot-less server ──
ok('legacy local snapshot (no snapshotAt) still kept when server has none',
	keepLocalRun({ snapshot: snap, level: 2 }, { level: 2 }) === true);

// ── level guard beats snapshot presence: a server further along wins even if it has a snapshot ──
ok('server snapshot on a HIGHER floor -> take the server',
	keepLocalRun({ snapshot: snap, snapshotAt: 999, level: 2 }, { snapshot: snap, snapshotAt: 1, level: 3 }) === false);

console.log(`\n${pass}/${pass + fail} checks passed`);
process.exit(fail ? 1 : 0);
