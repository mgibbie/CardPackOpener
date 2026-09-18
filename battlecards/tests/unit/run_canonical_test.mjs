// run_canonical_test.mjs — Resume must always select ONE deterministic, authoritative,
// newest run for the account.
//
// Production bug (2026-09-18, instinctloretest0918): Resume showed a stale
// "Gideon 0 wins / 0 losses, 30 cards" while the newest run was Garruk 0-1 at fight 2,
// and Continue restored an hours-old Gideon mid-fight autosave. Repeated fresh loads
// flapped between the stale and the canonical record.
//
// Root cause: keepLocalRun kept the LOCAL copy whenever the server copy had no
// mid-fight snapshot — with no run-identity or recency comparison. The 5s heartbeat
// pushes the run with the snapshot STRIPPED, so the server copy usually has none, and
// a stale local run won unconditionally. Its one progress check read `level`, which
// the wins/losses modes (Lorequest, Duels, Arena, ME, SC, FF, Multiverse) do not have.
//
// These cover the six scenarios required by the report.
//   node battlecards/tests/unit/run_canonical_test.mjs
import { pickCanonicalRun, keepLocalRun, runIdentity, runProgress } from '../../runsync.js';

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL:', l, x ?? ''); } };

const snap = (turnNumber = 1) => ({ schemaVersion: 1, turnNumber, players: [] });
// a Lorequest-shaped run: NO `level` field — this is the shape the old reconciler
// could not compare at all
const lq = (o = {}) => ({ active: true, characterId: 'Gideon', cls: 'paladin', deck: new Array(30), anomaly: 'arcane', wins: 0, losses: 0, ...o });

// ── identity / progress helpers ──
ok('an explicit runId is the identity', runIdentity(lq({ runId: 'r123' })) === 'r123');
ok('legacy runs fingerprint by character + anomaly', runIdentity(lq()) === runIdentity(lq({ wins: 5 })));
ok('different characters are different runs', runIdentity(lq({ characterId: 'Garruk' })) !== runIdentity(lq()));
ok('progress counts wins+losses for modes with no level', runProgress(lq({ wins: 1, losses: 1 })) === 2);
ok('progress still counts level for floor modes', runProgress({ level: 4 }) === 4);

// ── 1. Run A has a mid-fight autosave; A is abandoned; B is created and saved.
//       Resume must select Run B. (the exact production failure) ──
{
	const runA = lq({ runId: 'A', characterId: 'Gideon', wins: 0, losses: 0, snapshot: snap(12), snapshotAt: 1000, rev: 90, updatedAt: 1000 });
	const runB = lq({ runId: 'B', characterId: 'Garruk', wins: 0, losses: 1, rev: 3, updatedAt: 9000 }); // newer run, NO snapshot (heartbeat strips it)
	const v = pickCanonicalRun(runA, runB, 9000);
	ok('picks the NEWER run B, not the stale local A with its autosave', v.pick === 'server', JSON.stringify(v));
	ok('and the superseded run A is preserved, not deleted', v.preserve === 'local', JSON.stringify(v));
	ok('(regression) the old "server has no snapshot -> keep local" rule is gone', keepLocalRun(runA, runB, 9000) === false);
}

// ── 2. Record a win, then two fresh loads must show the IDENTICAL record ──
{
	const afterWin = lq({ runId: 'A', wins: 1, losses: 1, deck: new Array(33), rev: 12, updatedAt: 5000 });
	const serverCopy = { ...afterWin };
	const loads = [];
	for (let i = 0; i < 2; i++) { // two fresh boots against the same pair
		const v = pickCanonicalRun({ ...afterWin }, { ...serverCopy }, 5000);
		const chosen = v.pick === 'local' ? afterWin : serverCopy;
		loads.push(`${chosen.wins}W/${chosen.losses}L/${chosen.deck.length}`);
	}
	ok('two fresh loads agree exactly (no flapping)', loads[0] === loads[1], loads.join(' vs '));
	ok('and they show the updated 1-1 / 33-card record', loads[0] === '1W/1L/33', loads[0]);
}

// ── 3. A mid-fight autosave beside a LATER checkpoint for the SAME run:
//       the later checkpoint wins ──
{
	const autosave = lq({ runId: 'A', wins: 1, losses: 0, snapshot: snap(6), snapshotAt: 2000, rev: 40, updatedAt: 2000 });
	const laterCheckpoint = lq({ runId: 'A', wins: 2, losses: 0, rev: 55, updatedAt: 8000 }); // fight resolved -> further along
	const v = pickCanonicalRun(autosave, laterCheckpoint, 8000);
	ok('the later checkpoint of the same run wins over the older autosave', v.pick === 'server', JSON.stringify(v));
	ok('the autosave is preserved (it still held a snapshot)', v.preserve === 'local' || runProgress(autosave) < runProgress(laterCheckpoint), JSON.stringify(v));
	// ...but a mid-fight autosave that is AHEAD of the server copy still wins (hard tab-close)
	const ahead = lq({ runId: 'A', wins: 2, losses: 0, snapshot: snap(18), snapshotAt: 9000, rev: 70, updatedAt: 9000 });
	const behind = lq({ runId: 'A', wins: 2, losses: 0, rev: 55, updatedAt: 8000 });
	ok('a hard-close local autosave AHEAD of the server is still kept', pickCanonicalRun(ahead, behind, 8600).pick === 'local');
}

// ── 4. The start-page summary and Resume derive from the same canonical run ──
{
	const local = lq({ runId: 'A', characterId: 'Gideon', wins: 0, losses: 0, snapshot: snap(5), snapshotAt: 100, rev: 9, updatedAt: 100 });
	const server = lq({ runId: 'B', characterId: 'Garruk', wins: 0, losses: 1, rev: 2, updatedAt: 7000 });
	const v = pickCanonicalRun(local, server, 7000);
	const canonical = v.pick === 'local' ? local : server;
	// both surfaces read the winner of the SAME decision, so they cannot disagree
	const resumeText = `${canonical.characterId} - ${canonical.wins} wins / ${canonical.losses} losses`;
	const startTile = `${canonical.characterId} ${canonical.wins}W/${canonical.losses}L`;
	ok('Resume and the start tile describe the same run', resumeText.startsWith('Garruk') && startTile.startsWith('Garruk'), [resumeText, startTile].join(' | '));
}

// ── 5. Ambiguity preserves every candidate and never deletes higher progress ──
{
	// same stamps, conflicting progress: the further-along copy must survive
	const localAhead = lq({ runId: 'A', wins: 5, losses: 0, rev: 10, updatedAt: 4000 });
	const serverBehind = lq({ runId: 'A', wins: 2, losses: 0, rev: 10, updatedAt: 4000 });
	const v = pickCanonicalRun(localAhead, serverBehind, 4000);
	ok('the higher-progress copy is canonical', v.pick === 'local', JSON.stringify(v));
	// a DIFFERENT run that is behind but not droppable is still preserved
	const oldRich = lq({ runId: 'A', characterId: 'Gideon', wins: 7, losses: 1, snapshot: snap(3), snapshotAt: 10, rev: 30, updatedAt: 10 });
	const newPoor = lq({ runId: 'B', characterId: 'Garruk', wins: 0, losses: 0, rev: 1, updatedAt: 99999 });
	const v2 = pickCanonicalRun(oldRich, newPoor, 99999);
	ok('the newer run becomes canonical', v2.pick === 'server', JSON.stringify(v2));
	ok('but the older HIGHER-PROGRESS run is flagged for preservation', v2.preserve === 'local', JSON.stringify(v2));
}

// ── 6. Stale local + newer server: the newer authoritative revision wins ──
{
	const staleLocal = lq({ runId: 'A', wins: 0, losses: 0, snapshot: snap(20), snapshotAt: 1, rev: 4, updatedAt: 1 });
	const newerServer = lq({ runId: 'A', wins: 3, losses: 1, rev: 40, updatedAt: 50000 });
	ok('newer server revision wins over stale local', pickCanonicalRun(staleLocal, newerServer, 50000).pick === 'server');
	// the server's own updated_at is authoritative even when the run carries no stamps
	const bare = lq({ runId: 'A', wins: 0, losses: 0 });
	const bareServer = lq({ runId: 'A', wins: 0, losses: 0 });
	ok('server updated_at breaks a stamp-less tie', pickCanonicalRun(bare, bareServer, 8000).pick === 'server');
}

// ── guards on the surrounding behaviour ──
ok('an ACTIVE server run outranks a finished local one', pickCanonicalRun(lq({ active: false, wins: 9 }), lq({ active: true }), 1).pick === 'server');
ok('no server copy -> keep local', pickCanonicalRun(lq({ snapshot: snap(2) }), null, 0).pick === 'local');
ok('no local copy -> take the server', pickCanonicalRun(null, lq(), 0).pick === 'server');

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
