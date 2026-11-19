// site/bets.js — spectator bets, the one widget every spectator view mounts (owner, 2026-11-19: "let spectators make bets").
// The rules and the money are the server's (server/bets.mjs); this only shows them and sends a bet.
//
//   watch({ game, runner, call })   a spectator: the "★ Bets" chip, and the panel it opens: each market of the game being
//                                   watched (the outcomes, the stars on each, what a star pays if it wins = pool / side), your
//                                   bet, an amount, Place / Raise, the closed state, and the result (+N ★ / refunded).
//   riding(n, bettors)              the PLAYER: a small "N ★ riding on this game" badge (n 0 hides it)
// micatro/js/net.js calls both (its publisher and its spectator loop), so every game on that channel has them.
// Controls: click / tap; the B key or a controller's Y (context) opens and closes it; while open, arrows / d-pad move,
// Z / A press, X / B closes, and the amount opens the site's on-screen keyboard from a controller. Stars: the wallet
// (site/stars.js) is synced before a bet and after a payout, so the balance shown is the account's.
import * as Stars from './stars.js';
import { startInput, suspendInput, isTyping } from './input.js';
import { createFocusNav } from './focusnav.js';
import { askText } from './osk.js';

const POLL_OPEN_MS = 3000, POLL_SHUT_MS = 8000;
const W = { deadline: {}, tickT: 0, game: null, runner: null, call: null, markets: [], open: false, timer: 0, pick: {}, busy: false, msg: '', seenEnd: new Set(), inp: null, release: null, nav: null, opener: null, err: '' };
const fmt = n => (Math.round(n) || 0).toLocaleString('en-US');
const esc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]);
/** What one star on outcome k pays if it wins, after `add` more stars go on it (the parimutuel odds). */
export function perStar(m, k, add = 0) {
	const o = m.outcomes.find(x => x.k === k), side = (o ? o.pool : 0) + add, pool = m.pool + add;
	return side > 0 ? pool / side : 0;
}
const newBid = () => { const a = new Uint32Array(2); try { crypto.getRandomValues(a); } catch { a[0] = Date.now() >>> 0; a[1] = (Math.random() * 2 ** 32) >>> 0; } return ('b' + a[0].toString(36) + a[1].toString(36)).slice(0, 20).padEnd(9, '0'); };

function style() {
	if (document.getElementById('bets-style')) return;
	const st = document.createElement('style'); st.id = 'bets-style';
	st.textContent = `
	#bets-chip, #bets-riding { position: fixed; right: 12px; top: 58px; z-index: 9000; font: 600 14px/1.2 system-ui, sans-serif; border-radius: 999px;
		padding: 7px 13px; border: 2px solid #c9a227; background: #2a2210; color: #ffe08a; box-shadow: 0 3px 12px rgba(0,0,0,.45); }
	#bets-chip { cursor: pointer; touch-action: manipulation; }
	#bets-chip.live { background: #3a2c0c; }
	#bets-riding { pointer-events: none; top: auto; bottom: 14px; right: 14px; }
	#bets-panel { position: fixed; right: 12px; top: 100px; z-index: 9001; width: min(380px, calc(100vw - 24px)); max-height: calc(100vh - 120px); overflow: auto;
		background: #171a28; color: #e8ecff; border: 2px solid #c9a227; border-radius: 12px; padding: 12px; box-shadow: 0 10px 40px rgba(0,0,0,.6);
		font: 14px/1.35 system-ui, sans-serif; }
	#bets-panel h3 { margin: 0 0 6px; font-size: 16px; color: #ffe08a; display: flex; justify-content: space-between; align-items: center; }
	#bets-panel .bm { border-top: 1px solid #333a55; padding-top: 8px; margin-top: 8px; }
	#bets-panel .bm-title { font-weight: 600; margin-bottom: 4px; }
	#bets-panel .bm-o { display: flex; gap: 8px; align-items: center; width: 100%; text-align: left; margin: 3px 0; padding: 7px 9px; border-radius: 8px;
		border: 2px solid #333a55; background: #222740; color: inherit; font: inherit; cursor: pointer; touch-action: manipulation; }
	#bets-panel .bm-o.sel { border-color: #ffd27a; background: #3a3420; }
	#bets-panel .bm-o.won { border-color: #4caf50; }
	#bets-panel .bm-o span.l { flex: 1; }
	#bets-panel .bm-o span.p { opacity: .8; font-size: 12px; text-align: right; }
	#bets-panel .bm-row { display: flex; gap: 6px; margin-top: 6px; flex-wrap: wrap; }
	#bets-panel input { flex: 1; min-width: 80px; font: inherit; font-size: 16px; padding: 6px 8px; border-radius: 7px; border: 2px solid #3d4870; background: #0f1322; color: #fff; }
	#bets-panel button.b { font: inherit; padding: 6px 10px; border-radius: 7px; border: 2px solid transparent; background: #2c3452; color: #e8ecff; cursor: pointer; touch-action: manipulation; }
	#bets-panel button.b.go { background: #6b5513; color: #fff3c4; }
	#bets-panel button.b:disabled { opacity: .45; cursor: default; }
	#bets-panel .muted { opacity: .7; font-size: 12px; }
	#bets-panel .res { font-weight: 700; margin-top: 6px; }
	#bets-panel .res.win { color: #7ee08a; } #bets-panel .res.lose { color: #ff8a80; }
	#bets-panel .focusnav-focus { outline: 3px solid #ffd27a; outline-offset: 1px; }`;
	document.head.appendChild(st);
}

// ---------------------------------------------------------------- the player's badge
/** The player's "N ★ riding on this game" (0: hidden). */
export function riding(n, bettors = 0) {
	if (typeof document === 'undefined') return;
	style();
	let el = document.getElementById('bets-riding');
	if (!(n > 0)) { if (el) el.style.display = 'none'; return; }
	if (!el) { el = document.createElement('div'); el.id = 'bets-riding'; document.body.appendChild(el); }
	el.style.display = '';
	el.textContent = `★ ${fmt(n)} riding on this game`;
	el.title = bettors ? `${bettors} friend${bettors === 1 ? '' : 's'} bet on your game` : '';
}

// ---------------------------------------------------------------- the spectator's widget
/** Watching `runner`'s `game`: the chip, the panel, the polling. Calling it again for the same game and runner does nothing. */
export function watch({ game, runner, call } = {}) {
	if (typeof document === 'undefined' || !call || !game || !runner) return;
	runner = String(runner).toLowerCase();
	if (W.game === game && W.runner === runner && W.call) return;
	Object.assign(W, { game, runner, call, markets: [], pick: {}, msg: '', err: '' });
	style();
	if (!W.opener) {
		// B (keyboard) or a controller's Y opens / closes it; never while typing or while another overlay holds the input
		addEventListener('keydown', e => { if (e.code === 'KeyB' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping() && W.call && !W.open && document.getElementById('bets-chip')) { e.preventDefault(); toggle(true); } });
		W.opener = startInput({ pad: true, own: ['KeyV'], onAction: (a, info) => { if (a === 'context' && info.source === 'pad' && W.call && !W.open && document.getElementById('bets-chip')) { toggle(true); return true; } return false; } });
	}
	poll();
}
/** Stop watching (the page left spectating). */
export function unwatch() {
	clearTimeout(W.timer); toggle(false); W.call = null; W.game = W.runner = null;
	const c = document.getElementById('bets-chip'); if (c) c.remove();
}
export const state = () => ({ open: W.open, markets: W.markets, msg: W.msg, err: W.err });

async function poll() {
	clearTimeout(W.timer);
	if (!W.call) return;
	const at = W.game + ':' + W.runner;
	let r = null; try { r = await W.call('bet-get', { game: W.game, runner: W.runner }); } catch { r = null; }
	if (at !== W.game + ':' + W.runner) return;
	if (r && Array.isArray(r.markets)) {
		W.markets = r.markets; W.err = '';
		for (const m of r.markets) W.deadline[m.id] = Date.now() + (m.closesAt - m.now);
		// a market of mine just settled: the payout is in the account's wallet; bring it here
		for (const m of r.markets) if (m.end && m.mine && !W.seenEnd.has(m.id)) { W.seenEnd.add(m.id); Stars.sync(W.call).then(draw).catch(() => {}); }
	} else if (r && r.error) W.err = r.error;
	draw();
	W.timer = setTimeout(poll, W.open ? POLL_OPEN_MS : POLL_SHUT_MS);
}

function chip() {
	let el = document.getElementById('bets-chip');
	const ms = W.markets;
	if (!ms.length) { if (el) el.style.display = 'none'; return; }
	if (!el) { el = document.createElement('button'); el.id = 'bets-chip'; el.type = 'button'; el.addEventListener('click', () => toggle(!W.open)); document.body.appendChild(el); }
	el.style.display = W.open ? 'none' : '';
	const pool = ms.reduce((a, m) => a + m.pool, 0), open = ms.some(m => m.open && m.can);
	el.classList.toggle('live', open);
	el.textContent = `★ Bets${pool ? ' · ' + fmt(pool) : ''}${open ? ' · open' : ''}`;
	el.title = 'Bet stars on this game (B / Y)';
}

function toggle(on) {
	if (on === W.open) return;
	W.open = on;
	if (on) {
		// the panel takes the keyboard and the controller while it is open (the game underneath is only being watched)
		W.release = suspendInput(W);
		W.nav = createFocusNav({ scope: () => document.getElementById('bets-panel'), onCancel: () => toggle(false) });
		W.inp = startInput({ exclusive: true, pad: true, onAction: (a, info) => {
			if (a === 'cancel' || a === 'context') { if (!isTyping()) { toggle(false); return true; } return false; }
			if (a === 'confirm' && info.source === 'pad' && document.activeElement && document.activeElement.classList.contains('bm-amt')) { amountByOsk(document.activeElement); return true; }
			return W.nav.onAction(a, info);
		} });
		draw();
		poll();
		const first = document.querySelector('#bets-panel .bm-o:not([disabled])') || document.querySelector('#bets-panel .bm-x');
		if (first) first.focus();
	} else {
		if (W.inp) { W.inp.stop(); W.inp = null; }
		if (W.release) { W.release(); W.release = null; }
		W.nav = null;
		const p = document.getElementById('bets-panel'); if (p) p.remove();
		chip();
	}
}
async function amountByOsk(input) {
	const v = await askText({ title: 'How many stars?', initial: input.value || '', maxLength: 10, charset: 'number' });
	if (v != null) { input.value = String(v).replace(/\D/g, ''); input.dispatchEvent(new Event('input')); }
}

function draw() {
	chip();
	if (!W.open) return;
	let p = document.getElementById('bets-panel');
	if (!p) { p = document.createElement('div'); p.id = 'bets-panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-label', 'Bets'); document.body.appendChild(p); }
	const keep = document.activeElement && p.contains(document.activeElement) ? document.activeElement.dataset.f : null;
	const amtWas = {}; for (const i of p.querySelectorAll('.bm-amt')) amtWas[i.dataset.m] = i.value;
	const bal = Stars.stars();
	let h = `<h3><span>★ Bets on ${esc(W.runner)}'s game</span><button class="b bm-x" data-f="x" type="button" aria-label="Close">✕</button></h3>`
		+ `<div class="muted">You have <b class="bm-bal">${fmt(bal)}</b> ★. Everything bet on a game is one pool: the winners share it by stake.</div>`;
	for (const m of W.markets) {
		const title = m.kind === 'tour' ? 'Who wins the tournament' : m.kind === 'pvp' ? 'Who wins the match' : 'How the run ends';
		const sel = m.mine ? m.mine.o : W.pick[m.id];
		h += `<div class="bm" data-m="${esc(m.id)}"><div class="bm-title">${esc(title)} <span class="muted">· pool ${fmt(m.pool)} ★ · ${m.bettors} bettor${m.bettors === 1 ? '' : 's'}</span></div>`;
		for (const o of m.outcomes) {
			const per = perStar(m, o.k);
			const won = m.end && m.end.outcome === o.k;
			const lock = !m.open || !m.can || (m.mine && m.mine.o !== o.k);
			h += `<button type="button" class="bm-o${sel === o.k ? ' sel' : ''}${won ? ' won' : ''}" data-f="o:${esc(m.id)}:${esc(o.k)}" data-m="${esc(m.id)}" data-k="${esc(o.k)}"${lock ? ' disabled' : ''}>`
				+ `<span class="l">${won ? '🏆 ' : ''}${esc(o.label)}</span><span class="p">${fmt(o.pool)} ★<br>${per ? '×' + per.toFixed(2) + ' a star' : '—'}</span></button>`;
		}
		if (m.mine) h += `<div class="muted bm-mine">Your bet: <b>${fmt(m.mine.n)} ★</b> on ${esc((m.outcomes.find(o => o.k === m.mine.o) || {}).label || m.mine.o)}</div>`;
		if (m.end) {
			const mine = m.mine, pay = m.end.pay;
			const line = !mine ? (m.end.refund ? 'Settled: every bet was given back (' + esc(m.end.why) + ').' : 'Settled.')
				: m.end.refund ? `Refunded ${fmt(pay)} ★ (${esc(m.end.why)})` : pay > 0 ? `+${fmt(pay)} ★` : `Your ${fmt(mine.n)} ★ went to the winners.`;
			h += `<div class="res ${mine && pay > mine.n ? 'win' : mine && !pay ? 'lose' : ''} bm-res">${line}</div>`;
		} else if (!m.open) h += `<div class="muted bm-closed">Betting closed: ${esc(m.why || '')}.</div>`;
		else if (!m.can) h += `<div class="muted bm-cant">${esc(m.cant || '')}</div>`;
		else {
			const amt = amtWas[m.id] ?? '';
			const n = Math.floor(+amt) || 0, k = sel;
			h += `<div class="bm-row"><input class="bm-amt" data-f="a:${esc(m.id)}" data-m="${esc(m.id)}" inputmode="numeric" pattern="[0-9]*" placeholder="Stars" value="${esc(amt)}" aria-label="Stars to bet">`
				+ `<button type="button" class="b bm-add" data-f="p10:${esc(m.id)}" data-m="${esc(m.id)}" data-add="10">+10</button><button type="button" class="b bm-add" data-f="p100:${esc(m.id)}" data-m="${esc(m.id)}" data-add="100">+100</button>`
				+ `<button type="button" class="b bm-all" data-f="all:${esc(m.id)}" data-m="${esc(m.id)}">All</button></div>`
				+ `<div class="bm-row"><button type="button" class="b go bm-place" data-f="go:${esc(m.id)}" data-m="${esc(m.id)}"${!k || n < 1 || W.busy ? ' disabled' : ''}>${m.mine ? 'Raise bet' : 'Place bet'}${n && k ? ` · wins ${fmt(Math.floor(n * perStar(m, k, n)))} ★` : ''}</button>`
				+ `<span class="muted">closes in <span class="bm-left" data-m="${esc(m.id)}"></span> or at the game's opening mark</span></div>`;
		}
		h += '</div>';
	}
	if (!W.markets.length) h += `<div class="muted">${esc(W.err || 'No betting on this game.')}</div>`;
	if (W.msg) h += `<div class="muted bm-msg">${esc(W.msg)}</div>`;
	// (only when something changed: a poll that rewrote the panel would take the button from under a click or the focus)
	if (p.dataset.h === h) { tick(); return; }
	p.dataset.h = h;
	p.innerHTML = h;
	tick();
	p.querySelector('.bm-x').onclick = () => toggle(false);
	for (const b of p.querySelectorAll('.bm-o')) b.onclick = () => { W.pick[b.dataset.m] = b.dataset.k; W.msg = ''; draw(); };
	for (const i of p.querySelectorAll('.bm-amt')) {
		i.oninput = () => { const v = i.value.replace(/\D/g, ''); if (v !== i.value) i.value = v; const pos = i.selectionStart; draw(); const j = document.querySelector(`#bets-panel .bm-amt[data-m="${CSS.escape(i.dataset.m)}"]`); if (j) { j.focus(); try { j.setSelectionRange(pos, pos); } catch { /* not a text field */ } } };
		i.onkeydown = e => { if (e.key === 'Enter') { e.preventDefault(); place(i.dataset.m); } e.stopPropagation(); };
	}
	const amtOf = id => p.querySelector(`.bm-amt[data-m="${CSS.escape(id)}"]`);
	for (const b of p.querySelectorAll('.bm-add')) b.onclick = () => { const i = amtOf(b.dataset.m); if (i) { i.value = String((Math.floor(+i.value) || 0) + +b.dataset.add); i.oninput(); } };
	for (const b of p.querySelectorAll('.bm-all')) b.onclick = () => { const i = amtOf(b.dataset.m); if (i) { i.value = String(Stars.stars()); i.oninput(); } };
	for (const b of p.querySelectorAll('.bm-place')) b.onclick = () => place(b.dataset.m);
	if (keep) { const el = p.querySelector(`[data-f="${CSS.escape(keep)}"]`); if (el && !el.disabled && el !== document.activeElement) el.focus(); }
}

/** The time left to bet, counted on this device's clock from the server's last answer (in place: no redraw). */
function tick() {
	clearTimeout(W.tickT);
	const p = document.getElementById('bets-panel'); if (!p) return;
	for (const e of p.querySelectorAll('.bm-left')) { const d = W.deadline[e.dataset.m], secs = Math.max(0, Math.round(((d || 0) - Date.now()) / 1000)); e.textContent = `${Math.floor(secs / 60)}:${String(secs % 60).padStart(2, '0')}`; }
	W.tickT = setTimeout(tick, 1000);
}
async function place(id) {
	const m = W.markets.find(x => x.id === id), p = document.getElementById('bets-panel');
	const i = p && p.querySelector(`.bm-amt[data-m="${CSS.escape(id)}"]`), n = Math.floor(+(i && i.value)) || 0, o = m && (m.mine ? m.mine.o : W.pick[id]);
	if (!m || !o || n < 1 || W.busy) return;
	W.busy = true; W.msg = 'Placing…'; draw();
	await Stars.sync(W.call).catch(() => {});   // (the account's balance is what pays: stars earned here reach it first)
	// one id for this placement: a retry of it (a timeout) never takes the stars twice
	const bid = newBid();
	let r = null;
	for (let t = 0; t < 3 && !r; t++) { try { r = await W.call('bet-place', { id, o, n, bid }); } catch { r = null; } }
	W.busy = false;
	if (r && r.wallet) Stars.absorb(r.wallet);
	if (r && r.ok) { W.msg = `Bet ${fmt(n)} ★.`; if (i) i.value = ''; const k = W.markets.findIndex(x => x.id === id); if (k >= 0 && r.market) W.markets[k] = r.market; }
	else W.msg = (r && r.error) || 'Offline: the bet was not placed.';
	draw();
}
