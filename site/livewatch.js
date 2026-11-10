// livewatch.js — ONE place that knows how to watch a live friend. Every list of
// live friends (the Battlecards "Live now" hub, the top bar's Friends tab, the
// Overworld friends menu) routes through here, so a new watchable game kind is
// added once instead of being misrouted somewhere (the hub used to send Battle
// Frontier runs to the Battlecards spectator, which can't show them).
//
// Two shapes come in:
//   - a `live-friends` entry: { username, kind, matchId?, label? }
//   - a presence row (friends / presence actions): { username, status, region }
//     where status is battling:<matchId> | card:<mode> | factory:<label> | micatro:<label> | scoundrel:<label> | micasurvivor:run
//     | micatropvp:lobby:<CODE> (a Micatro Multiplayer lobby with a free seat: JOIN, not watch) | micatropvp:full:<CODE>
//     | micatropvp:match:<lobbyId>:<label> (a Multiplayer match: watched like a Micatro run)
//     (a MicaSurvivor run, M5 batch 12c: the server's `friends` marks a friend in one by its run beacon)

// what a presence status means → { live, kind, matchId?, mode?, label }
export function activityFromStatus(status, region) {
	const st = String(status || '');
	if (st.startsWith('battling:')) return { live: true, kind: 'pokemon', matchId: st.slice('battling:'.length), label: 'Pokémon battle' };
	if (st.startsWith('card:')) return { live: true, kind: 'card', mode: st.slice('card:'.length), label: region || '' };
	if (st.startsWith('factory:')) return { live: true, kind: 'factory', label: region || st.slice('factory:'.length) || 'BATTLE FRONTIER' };
	if (st.startsWith('micatro:')) return { live: true, kind: 'micatro', label: region || st.slice('micatro:'.length) };
	if (st.startsWith('micatropvp:match:')) return { live: true, kind: 'micatro', pvp: true, label: region || 'Micatro PvP' };
	if (/^micatropvp:lobby:[A-Z0-9]{5}$/.test(st)) return { live: false, kind: 'micatro-lobby', joinable: true, code: st.slice('micatropvp:lobby:'.length), label: 'In a Micatro lobby' };
	if (st.startsWith('micatropvp:full:')) return { live: false, kind: null, label: 'In a Micatro lobby' };
	if (st === 'micasurvivor:run') return { live: true, kind: 'micasurvivor', label: micasurvivorActivityLabel(region) };
	if (st.startsWith('scoundrel:')) return { live: true, kind: 'scoundrel', label: scoundrelActivityLabel(region || st.slice('scoundrel:'.length)) };
	return { live: false, kind: null, label: '' };
}

// "Playing Micatro — Ante 3" (the label is the runner's own progress string)
export function micatroActivityLabel(label) {
	const l = String(label || '').trim();
	return 'Playing Micatro' + (l && !/^micatro$/i.test(l) ? ' — ' + l : '');
}

// "Playing Scoundrel — Dungeon 3 · 14/18 HP" (the label is the runner's own progress string)
export function scoundrelActivityLabel(label) {
	const l = String(label || '').trim();
	return 'Playing Scoundrel' + (l && !/^scoundrel$/i.test(l) ? ' — ' + l : '');
}

// "Playing MicaSurvivor — Pikachu" (the label is the runner's Pokémon / mode / co-op group)
export function micasurvivorActivityLabel(label) {
	const l = String(label || '').trim();
	return 'Playing MicaSurvivor' + (l && !/^micasurvivor$/i.test(l) ? ' — ' + l : '');
}

// a friend's Micatro Multiplayer lobby they can be joined in: /micatro/?join=CODE, or null
export function joinHref(f) {
	const a = f && activityFromStatus(f.status, f.region);
	return a && a.joinable ? '/micatro/?join=' + encodeURIComponent(a.code) : null;
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
	if (kind === 'scoundrel') return '/scoundrel/?spectate=' + u;
	if (kind === 'micasurvivor') return '/micasurvivor/?watch=' + u;
	return null;
}
