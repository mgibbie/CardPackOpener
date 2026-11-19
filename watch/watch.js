// watch/watch.js — the Watch page (owner, 2026-11-19): every friend live in any game right now, each with Watch (the
// game's own spectator link, site/livewatch.js watchHref), the player's replays from every game (site/replaylib.js),
// and TV MODE: one live friend's game at a time, full screen, moving on every couple of minutes and lingering on a game
// whose label sounds close (a final, a boss, match point...) or that more people are watching.
//
// The live list is the server's `live-friends` (friends only; a stranger's games never show). It is re-read every
// LIVE_POLL_MS while the page is visible, and at each TV change, never while the tab is hidden.
import * as MP from '/battlecards/mpmode.js';
import { watchHref } from '/site/livewatch.js';
import { renderLibrary, LIBRARY_CSS } from '/site/replaylib.js';
import { startInput, suspendInput } from '/site/input.js';

const LIVE_POLL_MS = 20_000;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// what each kind of live game is called
const KIND_NAME = { card: 'Battlecards', pokemon: 'Pokémon battle', factory: 'Battle Frontier', world: 'Overworld', micatro: 'Micatro', scoundrel: 'Scoundrel', pears: 'Pair of Pears', pocket: 'Pocket Enhanced', pokechess: 'PokéChess', micasurvivor: 'MicaSurvivor' };
const KIND_ICON = { card: '🃏', pokemon: '⚔️', factory: '🏭', world: '🗺️', micatro: '🂡', scoundrel: '🗡️', pears: '🍐', pocket: '⚡', pokechess: '♟️', micasurvivor: '🔥' };
export const liveTitle = (f) => (KIND_NAME[f.kind] || 'A game') + (f.label && f.label !== KIND_NAME[f.kind] ? ' — ' + f.label : '');

// ---------- TV mode: how long a game stays on screen ----------
// A label that sounds like the game is near its end (each game writes its own progress string: "Final", "Boss",
// "Ante 8", "Match point", "1 HP", a tied score "2–2"...) lingers longer, and so does a game more friends are watching.
const CLOSE_RE = /\b(final|finals|boss|champion|elite four|match point|game point|sudden death|overtime|tie ?break|last (round|fight|life|turn)|1 HP)\b|\bante\s*(8|9|1\d)\b/i;
export function soundsClose(label) {
	const l = String(label || '');
	if (CLOSE_RE.test(l)) return true;
	const m = l.match(/(\d+)\s*[–-]\s*(\d+)/);   // a score within one point ("2–2", "3-2")
	return !!m && Math.abs(+m[1] - +m[2]) <= 1 && +m[1] + +m[2] > 0;
}
export function tvDwellMs(f, base) {
	const watchers = Math.max(0, Math.min(6, +(f && f.watchers) || 0));
	const ms = base * (soundsClose(f && f.label) ? 1.75 : 1) + watchers * base / 8;
	return Math.round(Math.min(base * 2.5, ms));
}
// the order TV mode shows them in: the closest-sounding and most-watched first, then by name (a steady order)
export function tvOrder(list) {
	const score = (f) => (soundsClose(f.label) ? 10 : 0) + Math.min(6, +f.watchers || 0);
	return [...list].sort((a, b) => score(b) - score(a) || String(a.username).localeCompare(String(b.username)));
}
const keyOf = (f) => f.username + ':' + f.kind;

// ---------- the live list ----------
let live = [];
async function fetchLive() {
	if (!MP.hasToken()) return [];
	try { const r = await MP.call('live-friends', {}); return (r && Array.isArray(r.live) ? r.live : []).filter((f) => watchHref(f)); } catch (e) { return live; }
}
function drawLive() {
	const box = $('#live');
	if (!MP.hasToken()) { box.innerHTML = `<p class="note"><a href="/login/?next=${encodeURIComponent('/watch/')}">Log in</a> to see your friends playing live.</p>`; return; }
	if (!live.length) { box.innerHTML = '<p class="note">None of your friends is in a game right now. Add friends from the 🔔 inbox\'s Friends tab.</p>'; return; }
	box.innerHTML = '<div class="live-grid">' + live.map((f) => `<div class="live" data-user="${esc(f.username)}" data-kind="${esc(f.kind)}">
		<div class="who"><span aria-hidden="true">${KIND_ICON[f.kind] || '🎮'}</span>${esc(f.username)} <span class="dot">● LIVE</span></div>
		<div class="what">${esc(liveTitle(f))}</div>
		<div class="row"><span class="eyes">${f.watchers ? '👁 ' + f.watchers + ' watching' : ''}</span>
		${f.full ? '<span class="note">Full</span>' : `<a class="btn" href="${esc(watchHref(f))}">👁 Watch</a>`}</div></div>`).join('') + '</div>';
}
async function refreshLive() { live = await fetchLive(); drawLive(); return live; }

// ---------- TV mode ----------
const params = new URLSearchParams(location.search);
const TV_BASE_MS = Math.max(1000, +params.get('tvbase') || 120_000);   // (?tvbase=<ms>: tests run it fast)
const tv = { open: false, list: [], i: 0, cur: null, timer: 0, t0: 0, dwell: 0, input: null, release: null, waitTimer: 0 };
function tvShow(f) {
	tv.cur = f;
	clearTimeout(tv.timer); clearTimeout(tv.waitTimer);
	const frame = $('#tv-frame'), empty = $('#tv-empty'), now = $('#tv-now'), prog = $('#tv-prog');
	if (!f) {
		frame.hidden = true; frame.removeAttribute('src'); empty.hidden = false; now.textContent = 'Waiting for a friend to go live…';
		prog.style.transition = 'none'; prog.style.width = '0';
		tv.waitTimer = setTimeout(() => tvStep(0), Math.min(LIVE_POLL_MS, TV_BASE_MS));
		return;
	}
	const href = watchHref(f);
	empty.hidden = true; frame.hidden = false;
	if (frame.getAttribute('src') !== href) frame.setAttribute('src', href);
	tv.dwell = tvDwellMs(f, TV_BASE_MS); tv.t0 = Date.now();
	now.innerHTML = `${esc(f.username)} · ${esc(liveTitle(f))}<small>${tv.i + 1} of ${tv.list.length}${f.watchers ? ' · 👁 ' + f.watchers : ''}${soundsClose(f.label) ? ' · a close one: staying a little longer' : ''}</small>`;
	prog.style.transition = 'none'; prog.style.width = '0';
	requestAnimationFrame(() => { prog.style.transition = `width ${tv.dwell}ms linear`; prog.style.width = '100%'; });
	tv.timer = setTimeout(() => tvStep(1), tv.dwell);
}
// move by `dir` (1 next, -1 previous, 0 stay on / find the current one) over a FRESH live list
async function tvStep(dir) {
	if (!tv.open) return;
	const fresh = tvOrder(await refreshLive());
	if (!tv.open) return;
	tv.list = fresh;
	if (!fresh.length) { tv.i = 0; tvShow(null); return; }
	const at = tv.cur ? fresh.findIndex((f) => keyOf(f) === keyOf(tv.cur)) : -1;
	if (at < 0) tv.i = dir < 0 ? Math.max(0, Math.min(fresh.length - 1, tv.i - 1)) : (dir === 0 ? 0 : Math.min(tv.i, fresh.length - 1) % fresh.length);   // (the one shown has stopped: what moved into its place)
	else tv.i = (at + dir + fresh.length) % fresh.length;
	tvShow(fresh[tv.i]);
}
function tvOpen() {
	if (tv.open) return;
	tv.open = true; tv.cur = null; tv.i = 0;
	$('#tv').classList.add('open');
	// the keys and the pad are TV mode's while it is open (the page's focus nav lets go)
	tv.release = suspendInput(tv);
	tv.input = startInput({
		exclusive: true, pad: true,
		onAction: (a) => {
			if (a === 'right' || a === 'next' || a === 'down') { tvStep(1); return true; }
			if (a === 'left' || a === 'prev' || a === 'up') { tvStep(-1); return true; }
			if (a === 'cancel' || a === 'select') { tvLeave(); return true; }
			return true;   // (nothing else leaks to the page underneath)
		},
	});
	const el = $('#tv');
	try { if (el.requestFullscreen && !document.fullscreenElement) el.requestFullscreen().catch(() => {}); } catch (e) { /* not allowed here: the overlay still fills the window */ }
	$('#tv-next').focus();
	tvStep(0);
}
function tvLeave() {
	if (!tv.open) return;
	tv.open = false;
	clearTimeout(tv.timer); clearTimeout(tv.waitTimer);
	$('#tv').classList.remove('open');
	const frame = $('#tv-frame'); frame.removeAttribute('src');   // (stop watching: the friend's watcher count drops)
	if (tv.input) { tv.input.stop(); tv.input = null; }
	if (tv.release) { tv.release(); tv.release = null; }
	try { if (document.fullscreenElement) document.exitFullscreen().catch(() => {}); } catch (e) { /* ignore */ }
	$('#tv-open').focus();
}

// ---------- boot ----------
{
	const st = document.createElement('style'); st.textContent = LIBRARY_CSS; document.head.appendChild(st);
	$('#tv-open').addEventListener('click', tvOpen);
	$('#tv-next').addEventListener('click', () => tvStep(1));
	$('#tv-prev').addEventListener('click', () => tvStep(-1));
	$('#tv-leave').addEventListener('click', tvLeave);
	// Escape leaves too (it is not one of the site's logical keys); leaving full screen by the browser's own Esc as well
	addEventListener('keydown', (e) => { if (tv.open && e.key === 'Escape') { e.preventDefault(); tvLeave(); } }, true);
	document.addEventListener('fullscreenchange', () => { if (tv.open && !document.fullscreenElement && tv._wasFull) tvLeave(); tv._wasFull = !!document.fullscreenElement; });
	// a swipe on the TV: left = next, right = previous
	let sx = null;
	$('#tv').addEventListener('touchstart', (e) => { sx = e.touches[0].clientX; }, { passive: true });
	$('#tv').addEventListener('touchend', (e) => { if (sx == null) return; const dx = e.changedTouches[0].clientX - sx; sx = null; if (Math.abs(dx) > 60) tvStep(dx < 0 ? 1 : -1); }, { passive: true });

	refreshLive();
	setInterval(() => { if (!document.hidden && !tv.open) refreshLive(); }, LIVE_POLL_MS);
	renderLibrary($('#library'), MP);
	if (params.get('tv') === '1') tvOpen();
	// (tests, and anyone curious in the console)
	window.__watch = {
		live: () => live, refresh: refreshLive,
		tv: { open: tvOpen, leave: tvLeave, next: () => tvStep(1), prev: () => tvStep(-1), state: () => ({ open: tv.open, i: tv.i, n: tv.list.length, cur: tv.cur && keyOf(tv.cur), href: $('#tv-frame').getAttribute('src'), dwell: tv.dwell }) },
	};
}
