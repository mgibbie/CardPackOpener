// livewatch.js — ONE place that knows how to watch a live friend. Every list of
// live friends (the Battlecards "Live now" hub, the top bar's Friends tab, the
// Overworld friends menu) routes through here, so a new watchable game kind is
// added once instead of being misrouted somewhere (the hub used to send Battle
// Frontier runs to the Battlecards spectator, which can't show them).
//
// Two shapes come in:
//   - a `live-friends` entry: { username, kind, matchId?, label? }
//   - a presence row (friends / presence actions): { username, status, region }
//     where status is battling:<matchId> | card:<mode> | factory:<label> | micatro:<label> | micasurvivor:run
//     (a MicaSurvivor run, M5 batch 12c: the server's `friends` marks a friend in one by its run beacon)

// what a presence status means → { live, kind, matchId?, mode?, label }
export function activityFromStatus(status, region) {
	const st = String(status || '');
	if (st.startsWith('battling:')) return { live: true, kind: 'pokemon', matchId: st.slice('battling:'.length), label: 'Pokémon battle' };
	if (st.startsWith('card:')) return { live: true, kind: 'card', mode: st.slice('card:'.length), label: region || '' };
	if (st.startsWith('factory:')) return { live: true, kind: 'factory', label: region || st.slice('factory:'.length) || 'BATTLE FRONTIER' };
	if (st.startsWith('micatro:')) return { live: true, kind: 'micatro', label: region || st.slice('micatro:'.length) };
	if (st === 'micasurvivor:run') return { live: true, kind: 'micasurvivor', label: micasurvivorActivityLabel(region) };
	return { live: false, kind: null, label: '' };
}

// "Playing Micatro — Ante 3" (the label is the runner's own progress string)
export function micatroActivityLabel(label) {
	const l = String(label || '').trim();
	return 'Playing Micatro' + (l && !/^micatro$/i.test(l) ? ' — ' + l : '');
}

// "Playing MicaSurvivor — Pikachu" (the label is the runner's Pokémon / mode / co-op group)
export function micasurvivorActivityLabel(label) {
	const l = String(label || '').trim();
	return 'Playing MicaSurvivor' + (l && !/^micasurvivor$/i.test(l) ? ' — ' + l : '');
}

// the spectator URL for a live friend, or null when there's nothing to open
export function watchHref(f) {
	if (!f) return null;
	const kind = f.kind || activityFromStatus(f.status, f.region).kind;
	const u = encodeURIComponent(f.username || '');
	if (kind === 'pokemon') {
		const id = f.matchId || activityFromStatus(f.status).matchId;
		return id ? '/overworld/?mp=1&watch=' + encodeURIComponent(id) : null;
	}
	if (!f.username) return null;
	if (kind === 'card') return '/battlecards/?spectate=' + u + '&mp=1';
	if (kind === 'factory') return '/overworld/?watchfactory=' + u + '&mp=1';
	if (kind === 'micatro') return '/micatro/?spectate=' + u;
	if (kind === 'micasurvivor') return '/micasurvivor/?watch=' + u;
	return null;
}
