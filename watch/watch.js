// watch/watch.js — the Watch page (owner, 2026-11-19): every friend live in any game right now, each with Watch (the
// game's own spectator link, site/livewatch.js watchHref), the player's replays from every game (site/replaylib.js),
// and TV MODE: one live friend's game at a time, full screen, moving on every couple of minutes and lingering on a game
// whose label sounds close (a final, a boss, match point...) or that more people are watching.
//
// The live list is the server's `live-friends` (friends only; a stranger's games never show). It is re-read every
// LIVE_POLL_MS while the page is visible, and at each TV change, never while the tab is hidden.
// POOLS (owner, 2026-11-19: "show what's riding on each live game ('1,240 ★ on Ann'), so the big-stakes games stand out"):
// a live game friends have bet on carries `pool` (server/mp.mjs live-friends: the total, the bettors, each outcome's stars,
// and whether betting is still open, with the seconds left). Each card shows it in one line, a big pool (BIG_POOL ★ and up)
// gets a gold badge and border, "Biggest pools" orders the list by it, and a "★ Bet" link opens the game's spectator view
// with its bet panel open (`&bet=1`, site/bets.js). TV mode weighs it too (tvOrder, tvDwellMs below).
import * as MP from '/battlecards/mpmode.js';
import { watchHref } from '/site/livewatch.js';
import { renderLibrary, LIBRARY_CSS, replayHref, GAME_NAME, GAME_ICON } from '/site/replaylib.js';
import { startInput, suspendInput } from '/site/input.js';

const LIVE_POLL_MS = 20_000;
const $ = (s) => document.querySelector(s);
const esc = (s) => String(s == null ? '' : s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

// what each kind of live game is called
const KIND_NAME = { card: 'Battlecards', pokemon: 'Pokémon battle', factory: 'Battle Frontier', world: 'Overworld', micatro: 'Micatro', scoundrel: 'Scoundrel', pears: 'Pair of Pears', pocket: 'Pocket Enhanced', pokechess: 'PokéChess', poketactica: 'Poketactica', micasurvivor: 'MicaSurvivor' };
const KIND_ICON = { card: '🃏', pokemon: '⚔️', factory: '🏭', world: '🗺️', micatro: '🂡', scoundrel: '🗡️', pears: '🍐', pocket: '⚡', pokechess: '♟️', poketactica: '🛡️', micasurvivor: '🔥' };
export const liveTitle = (f) => (KIND_NAME[f.kind] || 'A game') + (f.label && f.label !== KIND_NAME[f.kind] ? ' — ' + f.label : '');

// ---------- pools ----------
export const BIG_POOL = 1000;
const fmt = (n) => (Math.round(+n) || 0).toLocaleString('en-US');
const clock = (s) => { s = Math.max(0, Math.ceil(s)); return Math.floor(s / 60) + ':' + String(s % 60).padStart(2, '0'); };
/** Each outcome, short: the runner's name said once ("Ann wins 900 / loses 340"); a match's ("Ann wins 600 / Bo wins 300") as they are. */
export function outcomeText(outcomes) {
	const os = Array.isArray(outcomes) ? outcomes : [];
	const first = os.length > 1 ? String(os[0].label).split(' ')[0] + ' ' : '';
	const same = !!first && os.every((o) => String(o.label).startsWith(first));
	return os.map((o, i) => (same && i ? String(o.label).slice(first.length) : String(o.label)) + ' ' + fmt(o.n)).join(' / ');
}
/** "1,240 ★ riding · 6 bettors · Ann wins 900 / loses 340 · betting open 1:20" (secsLeft: the countdown now). */
export function poolText(p, secsLeft = p && p.left) {
	if (!p) return '';
	return `${fmt(p.total)} ★ riding · ${p.bettors} bettor${p.bettors === 1 ? '' : 's'}${p.total ? ' · ' + outcomeText(p.outcomes) : ''} · `
		+ (p.open ? 'betting open ' + clock(secsLeft) : 'betting closed');
}
/** How much a game's pool counts in TV mode's order: open for betting +8, then the size, by its order of magnitude
 *  (100 ★ = 4, 1,000 ★ = 6, 10,000 ★ and up = 8). No pool: 0. */
export function poolScore(p) {
	if (!p) return 0;
	return (p.open ? 8 : 0) + Math.min(8, Math.log10(1 + Math.max(0, +p.total || 0)) * 2);
}
// "Biggest pools": the largest pool first (an open one first on a tie), then the order the server gave
export function byPool(list) {
	return [...list].map((f, i) => [f, i]).sort(([a, i], [b, j]) => ((b.pool ? b.pool.total : -1) - (a.pool ? a.pool.total : -1)) || ((b.pool && b.pool.open ? 1 : 0) - (a.pool && a.pool.open ? 1 : 0)) || i - j).map(([f]) => f);
}

// ---------- TV mode: how long a game stays on screen ----------
// A label that sounds like the game is near its end (each game writes its own progress string: "Final", "Boss",
// "Ante 8", "Match point", "1 HP", a tied score "2–2"...) lingers longer, and so does a game more friends are watching.
// THE POOL counts as well (owner, 2026-11-19), in both:
//   order   score = 10 if the label sounds close + watchers (up to 6) + poolScore: +8 while betting is still open, plus
//           2 x log10(1 + the stars riding), at most 8. So a game open for betting with a big pool (1,000 ★: 14) comes
//           before a close-sounding one nobody bet on (10), and of two otherwise alike the bigger pool comes first.
//   dwell   base x 1.75 if close, + base/8 a watcher, + base x log10(1 + the stars)/4 (at most base x 0.75: 1,000 ★),
//           + base/4 while betting is open (time to place one); never more than base x 2.5.
const CLOSE_RE = /\b(final|finals|boss|champion|elite four|match point|game point|sudden death|overtime|tie ?break|last (round|fight|life|turn)|1 HP)\b|\bante\s*(8|9|1\d)\b/i;
export function soundsClose(label) {
	const l = String(label || '');
	if (CLOSE_RE.test(l)) return true;
	const m = l.match(/(\d+)\s*[–-]\s*(\d+)/);   // a score within one point ("2–2", "3-2")
	return !!m && Math.abs(+m[1] - +m[2]) <= 1 && +m[1] + +m[2] > 0;
}
export function tvDwellMs(f, base) {
	const watchers = Math.max(0, Math.min(6, +(f && f.watchers) || 0));
	const p = f && f.pool;
	const ms = base * (soundsClose(f && f.label) ? 1.75 : 1) + watchers * base / 8
		+ (p ? base * Math.min(0.75, Math.log10(1 + Math.max(0, +p.total || 0)) / 4) + (p.open ? base / 4 : 0) : 0);
	return Math.round(Math.min(base * 2.5, ms));
}
// the order TV mode shows them in: the closest-sounding, most-watched and biggest-pool first, then by name (a steady order)
export function tvOrder(list) {
	const score = (f) => (soundsClose(f.label) ? 10 : 0) + Math.min(6, +f.watchers || 0) + poolScore(f.pool);
	return [...list].sort((a, b) => score(b) - score(a) || String(a.username).localeCompare(String(b.username)));
}
const keyOf = (f) => (f.replay ? 'replay:' + f.kind + ':' + f.id : f.username + ':' + f.kind);

// ---------- the live list ----------
let live = [];
async function fetchLive() {
	if (!MP.hasToken()) return [];
	try {
		const r = await MP.call('live-friends', {}), t = Date.now();
		const list = (r && Array.isArray(r.live) ? r.live : []).filter((f) => watchHref(f));
		for (const f of list) if (f.pool && f.pool.open) f.pool.until = t + (+f.pool.left || 0) * 1000;   // (the countdown runs here between reads)
		return list;
	} catch (e) { return live; }
}
const secsLeft = (p) => (p && p.until ? (p.until - Date.now()) / 1000 : 0);
const betHref = (f) => { const h = watchHref(f); return h + (h.includes('?') ? '&' : '?') + 'bet=1'; };
// the list's order: 'live' (as the server gives it, the default) or 'pool' (Biggest pools); remembered on this device
let order = 'live';
try { if (localStorage.getItem('watch_order_v1') === 'pool') order = 'pool'; } catch (e) { /* storage blocked: the default */ }
function poolHtml(f) {
	const p = f.pool;
	if (!p) return '';
	return `<div class="pool${p.open ? ' open' : ''}" data-pool-of="${esc(keyOf(f))}">${p.total >= BIG_POOL ? '<span class="big-badge">★ Big pool</span> ' : ''}<span class="pool-text">${esc(poolText(p, secsLeft(p)))}</span></div>`;
}
// once a second: the countdowns, and a pool whose betting window ran out says closed (its Bet link goes)
setInterval(() => {
	for (const el of document.querySelectorAll('[data-pool-of]')) {
		const f = [...live, ...(tv.cur ? [tv.cur] : [])].find((x) => keyOf(x) === el.dataset.poolOf);
		if (!f || !f.pool || !f.pool.open) continue;
		if (secsLeft(f.pool) <= 0) { f.pool.open = false; const card = el.closest('.live'), bet = card && card.querySelector('a.bet'); if (bet) bet.remove(); }
		const t = el.querySelector('.pool-text'); if (t) t.textContent = poolText(f.pool, secsLeft(f.pool));
	}
}, 1000);
function drawLive() {
	const box = $('#live');
	if (!MP.hasToken()) { box.innerHTML = `<p class="note"><a href="/login/?next=${encodeURIComponent('/watch/')}">Log in</a> to see your friends playing live. Without an account, <b>TV mode</b> still plays Interdimensional: recent replays from everyone.</p>`; return; }
	if (!live.length) { box.innerHTML = '<p class="note">None of your friends is in a game right now. Add friends from the 🔔 inbox\'s Friends tab.</p>'; return; }
	const shown = order === 'pool' ? byPool(live) : live;
	box.innerHTML = '<div class="live-grid">' + shown.map((f) => `<div class="live${f.pool && f.pool.total >= BIG_POOL ? ' big' : ''}" data-user="${esc(f.username)}" data-kind="${esc(f.kind)}">
		<div class="who"><span aria-hidden="true">${KIND_ICON[f.kind] || '🎮'}</span>${esc(f.username)} <span class="dot">● LIVE</span></div>
		<div class="what">${esc(liveTitle(f))}</div>
		${poolHtml(f)}
		<div class="row"><span class="eyes">${f.watchers ? '👁 ' + f.watchers + ' watching' : ''}</span>
		${f.full ? '<span class="note">Full</span>' : `${f.pool && f.pool.open ? `<a class="btn bet bal-btn bal-gold" href="${esc(betHref(f))}" title="Watch with the bet panel open">★ Bet</a>` : ''}<a class="btn watch bal-btn bal-blue" href="${esc(watchHref(f))}">👁 Watch</a>`}</div></div>`).join('') + '</div>';
}
async function refreshLive() { live = await fetchLive(); drawLive(); return live; }

// ---------- TV mode ----------
const params = new URLSearchParams(location.search);
const TV_BASE_MS = Math.max(1000, +params.get('tvbase') || 120_000);   // (?tvbase=<ms>: tests run it fast)
const tv = { open: false, list: [], i: 0, cur: null, timer: 0, t0: 0, dwell: 0, input: null, release: null, waitTimer: 0 };
// INTERDIMENSIONAL (owner, 2026-11-25): "plays replays that are recent from any account even if you aren't friends".
// TV mode has two channels: 'friends' (live games, the one it always had; it needs a login) and 'inter' (the server's
// `replay-feed`: the newest replays from everyone, public). A visitor who is not logged in gets 'inter', so TV mode
// works without an account. The channel is remembered on this device; ?inter=1 opens on it.
const INTER_KEY = 'watch_tv_channel_v1';
function channel0() {
	if (!MP.hasToken() || params.get('inter') === '1') return 'inter';
	try { return localStorage.getItem(INTER_KEY) === 'inter' ? 'inter' : 'friends'; } catch (e) { return 'friends'; }
}
tv.mode = 'friends';
let feed = [];
async function fetchFeed() {
	try {
		const r = await MP.call('replay-feed', {});
		feed = (r && Array.isArray(r.replays) ? r.replays : []).filter((e) => e && replayHref(e.game, e.id)).map((e) => ({ replay: true, kind: e.game, id: e.id, username: e.by, label: e.label || '', when: e.when }));
	} catch (e) { /* the last list stands */ }
	return feed;
}
const hrefOf = (f) => (f.replay ? replayHref(f.kind, f.id) : watchHref(f));
const titleOf = (f) => (f.replay ? (GAME_NAME[f.kind] || 'A replay') + (f.label && f.label !== GAME_NAME[f.kind] ? ' — ' + f.label : '') : liveTitle(f));
function drawChannel() {
	const b = $('#tv-mode'), inter = tv.mode === 'inter';
	b.textContent = inter ? '🌀 Interdimensional' : '👥 Friends live';
	b.setAttribute('aria-pressed', String(inter));
	b.title = inter ? 'Recent replays from every account. Press for your friends\' live games.' : 'Your friends\' live games. Press for Interdimensional: recent replays from every account.';
	$('#tv-frame').title = inter ? 'A recent replay' : 'A friend\'s live game';
}
function tvChannel(mode) {
	if (mode === 'friends' && !MP.hasToken()) { $('#tv-now').innerHTML = `Friends live needs an account.<small><a href="/login/?next=${encodeURIComponent('/watch/?tv=1')}">Log in</a> to watch your friends; Interdimensional needs none.</small>`; return; }
	tv.mode = mode === 'inter' ? 'inter' : 'friends';
	try { localStorage.setItem(INTER_KEY, tv.mode); } catch (e) { /* not kept: fine */ }
	drawChannel();
	tv.cur = null; tv.i = 0;
	if (tv.open) tvStep(0);
}
function tvShow(f) {
	tv.cur = f;
	clearTimeout(tv.timer); clearTimeout(tv.waitTimer);
	const frame = $('#tv-frame'), empty = $('#tv-empty'), now = $('#tv-now'), prog = $('#tv-prog');
	if (!f) {
		frame.hidden = true; frame.removeAttribute('src'); empty.hidden = false;
		empty.textContent = tv.mode === 'inter' ? 'No recent replays yet. Interdimensional waits for the next one…' : 'Nobody is live right now. TV mode waits for the next friend to start a game…';
		now.textContent = tv.mode === 'inter' ? 'Waiting for a replay…' : 'Waiting for a friend to go live…';
		prog.style.transition = 'none'; prog.style.width = '0';
		tv.waitTimer = setTimeout(() => tvStep(0), Math.min(LIVE_POLL_MS, TV_BASE_MS));
		return;
	}
	const href = hrefOf(f);
	empty.hidden = true; frame.hidden = false;
	if (frame.getAttribute('src') !== href) frame.setAttribute('src', href);
	tv.dwell = tvDwellMs(f, TV_BASE_MS); tv.t0 = Date.now();
	now.innerHTML = `${f.replay ? (GAME_ICON[f.kind] || '🎬') + ' ' : ''}${esc(f.username)} · ${esc(titleOf(f))}<small>${f.replay ? 'a replay · ' : ''}${tv.i + 1} of ${tv.list.length}${f.watchers ? ' · 👁 ' + f.watchers : ''}${soundsClose(f.label) ? ' · a close one: staying a little longer' : ''}</small>`
		+ (f.pool ? `<small class="tv-pool" data-pool-of="${esc(keyOf(f))}">${f.pool.total >= BIG_POOL ? '★ Big pool · ' : '★ '}<span class="pool-text">${esc(poolText(f.pool, secsLeft(f.pool)))}</span></small>` : '');
	prog.style.transition = 'none'; prog.style.width = '0';
	requestAnimationFrame(() => { prog.style.transition = `width ${tv.dwell}ms linear`; prog.style.width = '100%'; });
	tv.timer = setTimeout(() => tvStep(1), tv.dwell);
}
// move by `dir` (1 next, -1 previous, 0 stay on / find the current one) over a FRESH live list
async function tvStep(dir) {
	if (!tv.open) return;
	const mode = tv.mode, fresh = mode === 'inter' ? await fetchFeed() : tvOrder(await refreshLive());
	if (tv.mode !== mode) return;   // (the channel was changed while this one was being read)
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
	tv.mode = channel0(); drawChannel();
	$('#tv').classList.add('open');
	// the keys and the pad are TV mode's while it is open (the page's focus nav lets go)
	tv.release = suspendInput(tv);
	tv.input = startInput({
		exclusive: true, pad: true,
		onAction: (a) => {
			if (a === 'right' || a === 'next' || a === 'down') { tvStep(1); return true; }
			if (a === 'left' || a === 'prev' || a === 'up') { tvStep(-1); return true; }
			if (a === 'cancel' || a === 'select') { tvLeave(); return true; }
			if (a === 'secondary') { tvChannel(tv.mode === 'inter' ? 'friends' : 'inter'); return true; }
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
	{
		const sel = $('#live-order');
		sel.value = order;
		sel.addEventListener('change', () => { order = sel.value === 'pool' ? 'pool' : 'live'; try { localStorage.setItem('watch_order_v1', order); } catch (e) { /* not kept: fine */ } drawLive(); });
	}
	$('#tv-next').addEventListener('click', () => tvStep(1));
	$('#tv-prev').addEventListener('click', () => tvStep(-1));
	$('#tv-leave').addEventListener('click', tvLeave);
	$('#tv-mode').addEventListener('click', () => tvChannel(tv.mode === 'inter' ? 'friends' : 'inter'));
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
		live: () => live, refresh: refreshLive, order: () => order,
		tv: { open: tvOpen, leave: tvLeave, next: () => tvStep(1), prev: () => tvStep(-1), channel: tvChannel, feed: () => feed, state: () => ({ mode: tv.mode, open: tv.open, i: tv.i, n: tv.list.length, cur: tv.cur && keyOf(tv.cur), href: $('#tv-frame').getAttribute('src'), dwell: tv.dwell }) },
	};
}
