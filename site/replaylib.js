// site/replaylib.js — the account's replay library, shared by the Watch page (/watch/) and the profile.
//
// Owner, 2026-11-19: "one list of my replays across every game". The server's `replay-library` returns every replay
// of yours it holds ({game, id, label, when, kept?}); Scoundrel and Pair of Pears keep theirs on this device (their
// replay is the run's recipe, a URL param), so those are read from localStorage and shown as "on this device".
// Each entry opens the game's own replay viewer. KEEP (☆/★) asks the server to keep a replay past the 30-day sweep
// (`replay-keep`, at most 20; only your own); a device replay never expires, so it has no Keep.

// where each game plays a replay, by its id
export const GAME_NAME = {
	battlecards: 'Battlecards', pokechess: 'PokéChess', micatro: 'Micatro', pocket: 'Pocket Enhanced', overworld: 'Overworld battle',
	journey: 'Overworld journey', micasurvivor: 'MicaSurvivor', micasurvivor3d: 'MicaSurvivor 3D', mail: 'Battlecards mail duel',
	scoundrel: 'Scoundrel', pears: 'Pair of Pears',
};
export const GAME_ICON = {
	battlecards: '🃏', pokechess: '♟️', micatro: '🂡', pocket: '⚡', overworld: '⚔️', journey: '🗺️', micasurvivor: '🔥', micasurvivor3d: '🔥', mail: '✉️', scoundrel: '🗡️', pears: '🍐',
};
export function replayHref(game, id) {
	const e = encodeURIComponent(String(id || ''));
	switch (game) {
		case 'battlecards': return '/battlecards/index.html?rshare=' + e;
		case 'pokechess': return '/overworld/pokechess.html?replay=' + e;
		case 'micatro': return '/micatro/?replay=' + e;
		case 'pocket': return '/pocketenhanced/?replay=' + e;
		case 'overworld': return '/overworld/?owreplay=' + e;
		case 'journey': return '/overworld/?journey=' + e;
		case 'micasurvivor': return '/micasurvivor/?replay=' + e;
		case 'micasurvivor3d': return '/micasurvivor/m3d/?replay=' + e;
		case 'mail': return '/battlecards/index.html?amreplay=' + e;
		// (a device replay's "id" is its whole recipe param, <seed>.<actions>)
		case 'scoundrel': return '/scoundrel/?replay=' + e;
		case 'pears': return '/pairofpears/?replay=' + e;
		default: return null;
	}
}

// this device's Scoundrel + Pair of Pears replays (their own lists: scoundrel/js/save.js, pairofpears/js/save.js)
const DEVICE_LISTS = [
	{ game: 'scoundrel', key: 'scoundrel_replays_v1', label: (r) => { const x = r.result && typeof r.result === 'object' ? r.result : {}; return 'Scoundrel' + (x.dungeons ? ' · ' + x.dungeons + ' dungeons' : '') + (x.reason === 'complete' ? ' · cleared' : x.reason === 'dead' ? ' · fell' : ''); } },
	{ game: 'pears', key: 'magepunk_pears_replays_v1', label: (r) => 'Pair of Pears' + (r.level ? ' · Level ' + r.level : '') + (r.won ? ' · won' : '') },
];
const PARAM_OK = /^[A-Za-z0-9_-]{1,24}\.[A-Za-z0-9_-]{1,6000}$/;
export function deviceReplays() {
	const out = [];
	for (const d of DEVICE_LISTS) {
		let list = null;
		try { list = JSON.parse(localStorage.getItem(d.key) || 'null'); } catch (e) { list = null; }
		for (const r of Array.isArray(list) ? list : []) {
			if (!r || typeof r !== 'object') continue;
			const id = String(r.seed) + '.' + String(r.actions || '');
			if (!PARAM_OK.test(id)) continue;
			out.push({ game: d.game, id, label: d.label(r), when: +r.when || +r.ts || 0, device: true });
		}
	}
	return out;
}

// the whole library: the account's (when signed in) + this device's, newest first
export async function loadLibrary(MP) {
	let acct = { replays: [], kept: 0, keepMax: 20 }, error = null;
	if (MP && MP.hasToken()) {
		try { const r = await MP.call('replay-library', {}); if (r && Array.isArray(r.replays)) acct = r; else error = (r && r.error) || 'could not load'; } catch (e) { error = 'could not load'; }
	}
	const all = [...acct.replays, ...deviceReplays()].sort((a, b) => (b.when || 0) - (a.when || 0));
	return { replays: all, kept: acct.kept || 0, keepMax: acct.keepMax || 20, error };
}

const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
function ago(ts) {
	if (!ts) return '';
	const s = Math.max(0, (Date.now() - ts) / 1000);
	if (s < 3600) return Math.max(1, Math.round(s / 60)) + ' min ago';
	if (s < 86400) return Math.round(s / 3600) + ' h ago';
	return Math.round(s / 86400) + ' d ago';
}

// draw the library into `box`: one row per replay with Watch (the game's own link) and, for an account replay, Keep.
// opts: {limit, onChange}. Returns the loaded library.
export async function renderLibrary(box, MP, opts = {}) {
	box.innerHTML = '<p class="rl-note">Loading your replays…</p>';
	const lib = await loadLibrary(MP);
	const draw = () => {
		const list = opts.limit ? lib.replays.slice(0, opts.limit) : lib.replays;
		box.innerHTML = '';
		const head = document.createElement('p'); head.className = 'rl-note';
		head.textContent = lib.error ? 'Could not load your account\'s replays just now.' : !list.length ? 'No replays yet. Finish a game in any mode and its replay lands here.'
			: `Replays are kept for 30 days. ★ Keep up to ${lib.keepMax} of your favourites for good (${lib.kept} kept).`;
		box.appendChild(head);
		const ul = document.createElement('ul'); ul.className = 'rl-list';
		for (const r of list) {
			const href = replayHref(r.game, r.id);
			if (!href) continue;
			const li = document.createElement('li'); li.className = 'rl-row'; li.dataset.game = r.game; li.dataset.id = r.id;
			li.innerHTML = `<span class="rl-ico" aria-hidden="true">${GAME_ICON[r.game] || '🎬'}</span>
				<span class="rl-main"><span class="rl-title">${esc(r.label || GAME_NAME[r.game] || r.game)}</span>
				<span class="rl-sub">${esc(GAME_NAME[r.game] || r.game)}${r.when ? ' · ' + esc(ago(r.when)) : ''}${r.device ? ' · on this device' : ''}${r.kept ? ' · kept' : ''}</span></span>
				<a class="rl-watch" href="${esc(href)}">▶ Watch</a>`;
			if (!r.device && MP && MP.hasToken()) {
				const k = document.createElement('button'); k.type = 'button'; k.className = 'rl-keep' + (r.kept ? ' on' : '');
				k.textContent = r.kept ? '★ Kept' : '☆ Keep';
				k.title = r.kept ? 'Let it go: it expires 30 days after it was made' : 'Keep it past the 30-day sweep';
				k.setAttribute('aria-pressed', r.kept ? 'true' : 'false');
				k.addEventListener('click', async () => {
					k.disabled = true;
					let res = null;
					try { res = await MP.call('replay-keep', { game: r.game, id: r.id, keep: !r.kept, label: r.label }); } catch (e) { res = null; }
					if (res && res.ok) { r.kept = !!res.kept; lib.kept = res.count; draw(); if (opts.onChange) opts.onChange(lib); }
					else { k.disabled = false; head.textContent = (res && res.error) || 'Could not change that just now.'; }
				});
				li.appendChild(k);
			}
			ul.appendChild(li);
		}
		box.appendChild(ul);
	};
	draw();
	return lib;
}

// the list's look (both pages inject it once)
export const LIBRARY_CSS = `
.rl-note{ color:var(--muted,#9aa3c8); font-size:.9rem; margin:6px 0 10px; }
.rl-list{ list-style:none; margin:0; padding:0; display:grid; gap:8px; }
.rl-row{ display:flex; align-items:center; gap:10px; background:var(--panel,#1a2140); border:1px solid var(--border,#2e3a63); border-radius:10px; padding:9px 12px; }
.rl-ico{ font-size:1.4rem; width:32px; text-align:center; flex-shrink:0; }
.rl-main{ flex:1; min-width:0; display:flex; flex-direction:column; }
.rl-title{ font-weight:600; overflow:hidden; text-overflow:ellipsis; white-space:nowrap; }
.rl-sub{ color:var(--muted,#9aa3c8); font-size:.8rem; }
.rl-watch, .rl-keep{ flex-shrink:0; border-radius:8px; padding:7px 12px; font:inherit; font-size:.86rem; cursor:pointer; text-decoration:none; min-height:36px; display:inline-flex; align-items:center; }
.rl-watch{ background:var(--blue,#6ea8ff); color:#0c1122; font-weight:700; }
.rl-keep{ background:transparent; color:var(--text,#e8eaf6); border:1px solid var(--border,#2e3a63); }
.rl-keep.on{ color:var(--gold,#ffcf6b); border-color:var(--gold,#ffcf6b); }
@media (max-width:520px){ .rl-row{ flex-wrap:wrap; } .rl-main{ flex-basis:calc(100% - 42px); } }
`;
