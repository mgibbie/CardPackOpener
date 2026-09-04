// runsync.js — reconciles the server's run copy with the local one at boot.
//
// Background: a single-player run's mid-fight snapshot is written to localStorage
// SYNCHRONOUSLY on every settled frame (and on pagehide), so localStorage is always
// exact. The SERVER only receives that snapshot on a graceful close via an async
// fetch — which does NOT complete when you hard-close the tab ("X out"). The 5s
// heartbeat pushes run metadata with the snapshot stripped. So after a hard close
// the server is behind while localStorage holds the true in-fight state.
//
// The old boot did `hydrateRunsFromServer()` → unconditionally overwrite localStorage
// with the server copy → the good local snapshot was destroyed → resume booted a
// fresh fight (turn 1). keepLocalRun() is the guard: never let the server clobber a
// fresher local in-fight snapshot, while still honouring genuine cross-device progress.

export function keepLocalRun(local, serverRun) {
	// nothing local worth protecting — take the server copy
	if (!local || !local.snapshot) return false;
	// the server advanced further in the run (e.g. you finished a fight on another
	// device and moved to the next floor) — the server wins, replay isn't progress
	if ((serverRun?.level || 0) > (local.level || 0)) return false;
	// server has no in-fight snapshot at an equal/earlier floor — the local hard-close
	// copy is the real state; keep it
	if (!serverRun || !serverRun.snapshot) return true;
	// both sides hold a mid-fight snapshot at the same floor — the more recently saved
	// one wins (covers legit cross-device: whichever device you touched last)
	return (local.snapshotAt || 0) >= (serverRun.snapshotAt || 0);
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
