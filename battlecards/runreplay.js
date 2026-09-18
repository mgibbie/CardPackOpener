// runreplay.js — the bookkeeping behind a run's "super replay".
//
// A cleared run is watchable as ONE sitting: every fight's tape is uploaded as it
// finishes and the run keeps only the short share ids, in order. It has to be done
// per fight rather than at the end — the local replay store is a 10-deep ring buffer
// and a 12-win run is ~14 fights, so the opening fights would be evicted long before
// the run is cleared.
//
// Pure helpers so the ordering/dedupe/cap rules are testable without a browser.

export const MAX_RUN_FIGHTS = 40; // the server caps a playlist at 40 ids too

// Append one fight to a run's list. Order is chronological and preserved; a repeated
// id is ignored (a retried upload must not double-append); the list stays bounded.
export function appendFightReplay(list, entry, cap = MAX_RUN_FIGHTS) {
	const out = (Array.isArray(list) ? list : []).filter(f => f && f.id);
	if (!entry || !entry.id) return out;
	if (out.some(f => f.id === entry.id)) return out;
	out.push(entry);
	return out.length > cap ? out.slice(-cap) : out;
}

// The fights worth chaining. One fight is just an ordinary replay, so a playlist
// needs at least two.
export const playlistFights = run => (run && Array.isArray(run.fightReplays) ? run.fightReplays : []).filter(f => f && f.id);
export const canBuildPlaylist = run => playlistFights(run).length >= 2;

// Display meta stored alongside the ids (the server re-validates and clamps this).
export function playlistMeta(run, mode) {
	const fights = playlistFights(run);
	return {
		mode: mode || '',
		hero: (run && (run.characterId || run.heroId || run.explorerId || run.classId)) || '',
		wins: (run && run.wins) || 0,
		losses: (run && run.losses) || 0,
		labels: fights.map(f => f.label || ''),
	};
}

// "Fight 3 — Vivian (win)" — the chapter title shown in the playlist bar
export function fightLabel(run, result) {
	const n = (((run && run.wins) || 0) + ((run && run.losses) || 0)) + 1;
	const foe = (run && run.enemy && (run.enemy.name || run.enemy.heroId)) || '';
	return `Fight ${n}${foe ? ' — ' + foe : ''}${result ? ' (' + result + ')' : ''}`;
}
