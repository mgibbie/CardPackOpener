// runsync.js — decides which copy of a run is CANONICAL at boot: the local
// (localStorage) one or the server's.
//
// Two very different situations look superficially alike and must not be conflated:
//
//   SAME RUN, two checkpoints. localStorage is written on every settled frame, the
//   server only gets the mid-fight snapshot on a graceful close (the 5s heartbeat
//   pushes run metadata with the snapshot STRIPPED). After a hard tab-close the
//   server copy is therefore behind — the local one is the real state.
//
//   DIFFERENT RUNS. The local cache can hold an old/abandoned run while the server
//   holds a newer one started elsewhere (or after a local clear). Here the NEWER RUN
//   must win, no matter which copy happens to carry a mid-fight snapshot.
//
// The old rule — "if the server copy has no snapshot, keep local" — could not tell
// these apart, so a stale local run (which almost always still had a snapshot) beat
// the newer server run. Whether a given load showed the canonical or the stale record
// depended on whether the last server write happened to include a snapshot, which is
// exactly the reported flapping. Its one progress check also read `level`, a field
// the wins/losses modes (Lorequest, Duels, Arena, Middle-earth, Sword Coast, Final
// Fantasy, Multiverse) do not have — so their progress was never compared at all.
//
// Ordering now, in strict priority:
//   1. an ACTIVE run outranks a finished/abandoned one
//   2. SAME run (matching identity): rev -> progress -> snapshot turn -> stamp
//   3. DIFFERENT runs: the newer one by stamp, else the further-along one
//   4. unknown identity (legacy saves): progress -> snapshot turn -> stamp
// Snapshot PRESENCE never decides on its own.
//
// Nothing here deletes: pickCanonicalRun reports the loser as `preserve` so the
// caller can stash a recoverable copy instead of dropping progress.

// A run's identity. New saves carry an explicit runId; older ones are fingerprinted
// from the immutable identity fields the run modes set at creation. Returns null when
// nothing identifying is available (then we fall back to progress/recency ordering).
export function runIdentity(run) {
	if (!run || typeof run !== 'object') return null;
	if (run.runId) return String(run.runId);
	const who = run.characterId || run.heroId || run.explorerId || run.classId || run.bossId || '';
	const anomaly = (run.anomaly && (run.anomaly.id || run.anomaly.name)) || (typeof run.anomaly === 'string' ? run.anomaly : '');
	const branch = run.wing ?? run.chapter ?? run.classChoice ?? '';
	const sig = `${who}|${anomaly}|${branch}`;
	return sig === '||' ? null : 'legacy:' + sig;
}

// How far a run has got. `level` covers the floor-based modes (dungeon/heist/tombs);
// wins+losses covers the fight-based ones. A mode uses one or the other, so summing
// is safe and keeps this a single comparable number.
export function runProgress(run) {
	if (!run || typeof run !== 'object') return -1;
	return (run.level || 0) + (run.wins || 0) + (run.losses || 0);
}

const runTurn = run => (run && run.snapshot && run.snapshot.turnNumber) || 0;
const runRev = run => (run && run.rev) || 0;
// best available recency for a copy. The server's own updated_at is authoritative for
// the server copy (it is stamped server-side on every write, immune to client clocks).
const runStamp = (run, serverAt) => Math.max((run && run.updatedAt) || 0, (run && run.snapshotAt) || 0, serverAt || 0);
const isActive = run => !!(run && run.active);

// Choose the canonical copy.
//   local          — the localStorage run (or null)
//   server         — the server's run (or null/undefined)
//   serverUpdatedAt— the server row's updated_at (ms), if the caller has it
// Returns { pick: 'local'|'server', reason, preserve: 'local'|'server'|null }
// `preserve` names a copy that is NOT canonical but still holds progress worth
// keeping a recoverable copy of (never delete it).
export function pickCanonicalRun(local, server, serverUpdatedAt) {
	const hasLocal = !!(local && typeof local === 'object');
	const hasServer = !!(server && typeof server === 'object');
	if (!hasLocal && !hasServer) return { pick: 'local', reason: 'nothing-to-reconcile', preserve: null };
	if (!hasLocal) return { pick: 'server', reason: 'no-local-copy', preserve: null };
	if (!hasServer) return { pick: 'local', reason: 'no-server-copy', preserve: null };

	const lp = runProgress(local), sp = runProgress(server);
	const li = runIdentity(local), si = runIdentity(server);
	const sameRun = li != null && si != null && li === si;
	const differentRun = li != null && si != null && li !== si;

	// A copy that still holds progress must never be silently dropped. Two cases
	// qualify: it is strictly further along than the winner, or it is a DIFFERENT run
	// carrying an in-fight snapshot — a whole run's position that nothing else holds.
	// (A superseded checkpoint of the SAME run is not stashed: the winner already
	// contains that run's progress, and a snapshot copy is expensive to store.)
	const preserveFor = pick => {
		const loser = pick === 'local' ? server : local;
		const loserProg = pick === 'local' ? sp : lp;
		const keptProg = pick === 'local' ? lp : sp;
		if (!loser) return null;
		const side = pick === 'local' ? 'server' : 'local';
		if (loserProg > keptProg) return side;
		if (differentRun && loser.snapshot) return side;
		return null;
	};
	const decide = (pick, reason) => ({ pick, reason, preserve: preserveFor(pick) });

	// 1. an active run outranks a finished/abandoned one
	if (isActive(local) !== isActive(server)) return decide(isActive(local) ? 'local' : 'server', 'active-beats-inactive');

	// 3. DIFFERENT runs: the newer run wins, regardless of who holds a snapshot
	if (differentRun) {
		const ls = runStamp(local, 0), ss = runStamp(server, serverUpdatedAt);
		if (ls !== ss) return decide(ls > ss ? 'local' : 'server', 'different-run-newer-stamp');
		if (lp !== sp) return decide(lp > sp ? 'local' : 'server', 'different-run-further-along');
		return decide('server', 'different-run-ambiguous-prefer-server'); // server is shared state; local copy is preserved
	}

	// 2/4. SAME run, or identity unknown: compare how far each copy got.
	const lr = runRev(local), sr = runRev(server);
	if (lr !== sr) return decide(lr > sr ? 'local' : 'server', sameRun ? 'same-run-higher-rev' : 'higher-rev');
	if (lp !== sp) return decide(lp > sp ? 'local' : 'server', sameRun ? 'same-run-further-along' : 'further-along');
	const lt = runTurn(local), st = runTurn(server);
	if (lt !== st) return decide(lt > st ? 'local' : 'server', 'later-snapshot-turn');
	const ls = runStamp(local, 0), ss = runStamp(server, serverUpdatedAt);
	if (ls !== ss) return decide(ls > ss ? 'local' : 'server', 'newer-stamp');
	return decide('local', 'tie-keep-local'); // identical standing: don't clobber
}

// The server's answer that a run is OVER. Ending a run leaves `{ ended: runId }` in
// its slot on the server (run-clear), and from then on every save of that run is
// refused. A local copy of the SAME run is therefore a zombie: the browser lost the
// writes that removed it (a killed/crashed browser drops recent localStorage writes),
// so it still holds the run as it was mid-fight. Booting it replays a fight whose
// result is already on the server, and since every save of it is refused, the replay
// can never "commit" — Remy's Final Fantasy run: one loss, 27 identical replays,
// "Continue the run" offered after every one (2026-10-14..16). Only the runId
// decides: a different (newer) local run is never touched.
export function serverEndedRun(local, entry) {
	if (!entry || typeof entry !== 'object' || entry.run || !entry.ended) return false;
	if (!local || typeof local !== 'object' || !local.runId) return false;
	return String(entry.ended) === String(local.runId);
}

// The server's slot says a run ended — a DIFFERENT run than the local copy — and it
// ended AFTER the local copy was last written. The local copy is then an older run's
// zombie: this browser lost every write since (its replays and ended-runs list stop at
// the same moment), while the run(s) that followed were played and finished. The
// ended marker names only the LAST finished run, so serverEndedRun cannot see this
// one: instinctgauntlet ended run 12, reloaded, and was offered run 11 at 0W/2L
// (2026-10-22). A local run written after the marker (started since, e.g. offline)
// is never touched; neither is a copy with no stamp to compare.
export function serverSupersededRun(local, entry) {
	if (!entry || typeof entry !== 'object' || entry.run || !entry.ended) return false;
	if (!local || typeof local !== 'object' || !local.active) return false;
	if (local.runId && String(entry.ended) === String(local.runId)) return false; // that one is serverEndedRun's
	const endedAt = Number(entry.updated_at) || 0;
	const localAt = runStamp(local, 0);
	return endedAt > 0 && localAt > 0 && localAt < endedAt;
}

// Back-compat boolean wrapper: true = keep the local copy, false = take the server's.
export function keepLocalRun(local, serverRun, serverUpdatedAt) {
	return pickCanonicalRun(local, serverRun, serverUpdatedAt).pick === 'local';
}

// Async (correspondence) matches are server-authoritative and only publish at TURN
// END, so a mid-turn close would restart your current turn. We keep a LOCAL mid-turn
// snapshot too — but must only restore it when it's genuinely the SAME unsubmitted
// turn on THIS match (else the server has moved on and the local copy is stale).
// `local`      = { id, turnNumber, snap } saved by the client mid-turn
// `serverSnap` = the match's server snapshot (published at the start of your turn)
// `matchId`    = the async match we're opening
// `mySeat`     = our player index in the match
export function useLocalAsyncTurn(local, serverSnap, matchId, mySeat) {
	if (!local || !local.snap || local.id !== matchId) return false; // no local, or a different match
	if (!serverSnap) return false;
	if (serverSnap.current !== mySeat) return false;                 // server says it isn't your turn (you already submitted)
	// same turn number on the same match = the exact unsubmitted turn the local copy extends
	return local.snap.turnNumber === serverSnap.turnNumber;
}
