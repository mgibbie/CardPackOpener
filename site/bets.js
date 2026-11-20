// site/bets.js — spectator bets, the one widget every spectator view mounts (owner, 2026-11-19: "let spectators make bets").
// The rules and the money are the server's (server/bets.mjs); this only shows them and sends a bet.
//
//   watch({ game, runner, call })   a spectator: the "★ Bets" chip, and the panel it opens: each market of the game being
//                                   watched (the outcomes, the stars on each, what a star pays if it wins = pool / side), your
//                                   bet, an amount, Place / Raise, the closed state, and the result (+N ★ / refunded).
//   riding(n, bettors)              the PLAYER: a small "N ★ riding on this game" badge (n 0 hides it)
// micatro/js/net.js calls both (its publisher and its spectator loop), so every game on that channel has them.
// "Bet something else" (owner, 2026-11-19: "anything tradeable should be bettable"): instead of stars, things the bettor
// holds in any game (the Inventory's own pickers, inventory/inventory.js), each shown with its worth in stars
// (site/values.js). The bet's stake is what they are worth; they are SOLD TO THE BANK when it is placed, and winners
// (and a refund) are paid in stars. The overworld's things are taken out of its save on this device by the Inventory's
// hand-over (overworld/ow_handover.js), so the overworld game must not be open in another tab.
// Controls: click / tap; the B key or a controller's Y (context) opens and closes it; while open, arrows / d-pad move,
// Z / A press, X / B closes, and the amount opens the site's on-screen keyboard from a controller. Stars: the wallet
// (site/stars.js) is synced before a bet and after a payout, so the balance shown is the account's.
import * as Stars from './stars.js';
import { startInput, suspendInput, isTyping } from './input.js';
import { createFocusNav } from './focusnav.js';
import { askText } from './osk.js';

// Balatro's button sounds (the site's UI kit, site/ui/sfx.js), loaded when the chip first shows rather than with this
// module (Micatro's net.js imports it at boot). The kit unlocks audio on the next press, so the first tap already sounds.
let sfxMod = null;
const loadSfx = () => (sfxMod = sfxMod || import('./ui/sfx.js').catch(() => null));
const sound = name => { loadSfx().then(m => { try { m && m.sfx[name](); } catch (e) {} }); };
// which sound a press in the panel makes: close / back = Back, a goods tab = the tab rustle, an outcome = select,
// placing a bet = coins, anything else the button press
const soundOf = b => b.matches('.bm-x, .bm-gback') ? 'back' : b.matches('.bm-gtab') ? 'tab' : b.matches('.bm-o') ? 'select' : b.matches('.bm-place, .bm-gplace') ? 'coin' : 'press';
const POLL_OPEN_MS = 3000, POLL_SHUT_MS = 8000;
const W = { deadline: {}, tickT: 0, game: null, runner: null, call: null, markets: [], open: false, timer: 0, pick: {}, busy: false, msg: '', seenEnd: new Set(), inp: null, release: null, nav: null, opener: null, err: '', gd: null };
// the goods picker: gd = { mid, tab, picks: { key: n }, rows, loading, owWhy } (one market at a time); INV: the Inventory's module
let INV = null, invLoading = null;
const inv = () => (invLoading = invLoading || import('/inventory/inventory.js').then(async m => { await m.loadNames().catch(() => {}); INV = m; draw(); return m; }).catch(() => { invLoading = null; return null; }));
const GTABS = [['money', 'Currencies'], ['packs', 'Packs'], ['bc', 'Battlecards'], ['pk', 'Pocket'], ['ow', 'Overworld']];
/** What a stake's goods were, one line each (names once the Inventory's tables are in). */
const goodsLines = list => (INV ? INV.goodsText(list) : (list || []).map(g => `${g.name || g.id || g.k}${g.n > 1 ? ' ×' + fmt(g.n) : ''} (${fmt(g.v)} ★)`));
const goodsWorth = list => (list || []).reduce((a, g) => a + (g.v || 0), 0);
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
	// the kit's tokens + the m6x11 font (its classes are all prefixed: loading it changes nothing else on the page)
	if (!document.querySelector('link[href*="/site/ui/balatro.css"]')) {
		const k = document.createElement('link'); k.rel = 'stylesheet'; k.href = '/site/ui/balatro.css'; document.head.appendChild(k);
	}
	const st = document.createElement('style'); st.id = 'bets-style';
	st.textContent = `
	/* the Balatro look (site/ui/balatro.css tokens, literal fallbacks): the chip a gold kit button, the panel the kit's
	   dialog box, each outcome a row that rings orange when picked, Place a green button, the m6x11 font */
	#bets-chip, #bets-riding { position: fixed; right: 12px; top: 58px; z-index: 9000; font-family: var(--bal-font, 'm6x11', 'm6x11plus', monospace); font-size: 19px; line-height: 1;
		border-radius: 10px; padding: 9px 13px 7px; border: 0; background: var(--bal-gold, #eac058); color: #fff; box-shadow: 0 4px 0 var(--bal-gold-d, #b48f34); text-shadow: 0 2px 0 rgba(0,0,0,.3); }
	#bets-chip { cursor: pointer; touch-action: manipulation; transition: transform .06s, box-shadow .06s, filter .1s; }
	#bets-chip:hover { filter: brightness(1.1); }
	#bets-chip:active { transform: translateY(3px); box-shadow: 0 1px 0 var(--bal-gold-d, #b48f34); }
	#bets-chip.live { background: var(--bal-attn, #ff9a00); box-shadow: 0 4px 0 var(--bal-orange-d, #c27c00); }
	#bets-riding { pointer-events: none; top: auto; bottom: 14px; right: 14px; }
	#bets-panel { position: fixed; right: 12px; top: 100px; z-index: 9001; width: min(400px, calc(100vw - 24px)); max-height: calc(100vh - 120px); overflow: auto; box-sizing: border-box;
		background: var(--bal-panel, #3a4b4f); color: #fff; border-radius: 18px; padding: 14px; box-shadow: 0 8px 0 var(--bal-panel-dd, #1f2a2c), inset 0 0 0 4px var(--bal-outline-light, #bfc7d5);
		font-family: var(--bal-font, 'm6x11', 'm6x11plus', monospace); font-size: 18px; line-height: 1.15; scrollbar-width: thin; scrollbar-color: var(--bal-edge, #4f6367) rgba(0,0,0,.25); }
	#bets-panel b { font-weight: normal; color: var(--bal-money, #f3b958); }
	#bets-panel h3 { margin: 0 0 8px; font-size: 26px; font-weight: normal; color: #fff; text-shadow: 0 3px 0 rgba(0,0,0,.35); display: flex; justify-content: space-between; align-items: center; gap: 8px; }
	#bets-panel .bm { background: var(--bal-panel-d, #2a3739); border-radius: 12px; padding: 10px; margin-top: 10px; }
	#bets-panel .bm-title { font-size: 20px; margin-bottom: 6px; }
	#bets-panel .bm-o { display: flex; gap: 8px; align-items: center; width: 100%; text-align: left; margin: 4px 0; padding: 8px 10px 6px; border-radius: 10px;
		border: 0; background: var(--bal-panel-dd, #1f2a2c); color: #fff; font: inherit; font-size: 19px; cursor: pointer; touch-action: manipulation; }
	#bets-panel .bm-o:hover:not(:disabled) { box-shadow: inset 0 0 0 3px #fff; }
	#bets-panel .bm-o:disabled { cursor: default; opacity: .6; }
	#bets-panel .bm-o.sel { box-shadow: inset 0 0 0 3px var(--bal-attn, #ff9a00); opacity: 1; }
	#bets-panel .bm-o.won { box-shadow: inset 0 0 0 3px var(--bal-green, #4bc292); opacity: 1; }
	#bets-panel .bm-o span.l { flex: 1; }
	#bets-panel .bm-o span.p { color: var(--bal-text-muted, #9fb0b3); font-size: 15px; text-align: right; }
	#bets-panel .bm-row { display: flex; gap: 6px; margin-top: 8px; flex-wrap: wrap; align-items: center; }
	#bets-panel input { flex: 1; min-width: 80px; font: inherit; font-size: 20px; padding: 6px 10px 4px; border-radius: 9px; border: 3px solid var(--bal-outline-light, #bfc7d5); background: var(--bal-panel-dd, #1f2a2c); color: #fff; }
	#bets-panel input:focus { outline: none; border-color: #fff; }
	#bets-panel button.b { --b: var(--bal-grey, #5f7377); --bd: var(--bal-grey-d, #435357); font: inherit; font-size: 18px; line-height: 1; padding: 8px 11px 6px; margin-bottom: 4px; border-radius: 9px; border: 0;
		background: var(--b); color: #fff; box-shadow: 0 4px 0 var(--bd); text-shadow: 0 2px 0 rgba(0,0,0,.3); cursor: pointer; touch-action: manipulation; transition: transform .06s, box-shadow .06s, filter .1s; }
	#bets-panel button.b:hover:not(:disabled) { filter: brightness(1.1); }
	#bets-panel button.b:active:not(:disabled) { transform: translateY(3px); box-shadow: 0 1px 0 var(--bd); }
	#bets-panel button.b.go { --b: var(--bal-green, #4bc292); --bd: var(--bal-green-d, #33906b); }
	#bets-panel button.b.bm-x, #bets-panel button.b.bm-gback { --b: var(--bal-orange, #fda200); --bd: var(--bal-orange-d, #c27c00); }
	#bets-panel button.b:disabled { --b: var(--bal-disabled, #59676a); --bd: var(--bal-disabled-d, #3d4749); color: var(--bal-disabled-text, #b9c3c5); cursor: default; }
	#bets-panel .muted { color: var(--bal-text-muted, #9fb0b3); font-size: 15px; }
	#bets-panel .res { font-size: 20px; margin-top: 6px; }
	#bets-panel .res.win { color: var(--bal-green, #4bc292); } #bets-panel .res.lose { color: var(--bal-red, #fe5f55); }
	#bets-panel .focusnav-focus { outline: 3px solid #fff; outline-offset: 2px; }
	#bets-panel .bm-gd { margin-top: 8px; border-radius: 10px; padding: 8px; background: var(--bal-panel-dd, #1f2a2c); }
	#bets-panel .bm-gtabs { display: flex; gap: 5px; flex-wrap: wrap; margin-bottom: 6px; }
	#bets-panel button.b.bm-gtab { --b: var(--bal-tab-off, #7a4b48); --bd: var(--bal-tab-off-d, #4f302e); font-size: 16px; }
	#bets-panel button.b.bm-gtab.on { --b: var(--bal-red, #fe5f55); --bd: var(--bal-red-d, #c0453d); }
	#bets-panel .bm-glist { max-height: 220px; overflow: auto; }
	#bets-panel .bm-gr { display: flex; gap: 6px; align-items: center; padding: 5px 0; border-bottom: 2px solid var(--bal-panel-d, #2a3739); }
	#bets-panel .bm-gr .l { flex: 1; min-width: 0; } #bets-panel .bm-gr small { display: block; color: var(--bal-text-muted, #9fb0b3); font-size: 14px; }
	#bets-panel .bm-gr input { flex: 0 0 90px; min-width: 0; }
	#bets-panel .bm-gr .c { min-width: 52px; text-align: center; font-size: 15px; }
	#bets-panel .bm-gl, #bets-panel .bm-bets { margin: 3px 0 0 10px; padding: 0; font-size: 15px; color: var(--bal-text-soft, #dfe7e8); }
	#bets-panel .bm-bets li { list-style: none; margin-top: 2px; }`;
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
	// (the Watch page's "Bet" link adds bet=1 to the spectator link: the panel opens by itself, once, when the game's market is in)
	if (!W.autoDone && W.markets.length && !W.open && /[?&]bet=1(&|$)/.test(location.search)) { W.autoDone = true; toggle(true); }
	W.timer = setTimeout(poll, W.open ? POLL_OPEN_MS : POLL_SHUT_MS);
}

function chip() {
	let el = document.getElementById('bets-chip');
	const ms = W.markets;
	if (!ms.length) { if (el) el.style.display = 'none'; return; }
	if (!el) { el = document.createElement('button'); el.id = 'bets-chip'; el.type = 'button'; el.addEventListener('click', () => { sound('press'); toggle(!W.open); }); document.body.appendChild(el); loadSfx(); }
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
			if (a === 'confirm' && info.source === 'pad' && document.activeElement && (document.activeElement.classList.contains('bm-amt') || document.activeElement.classList.contains('bm-gamt'))) { amountByOsk(document.activeElement); return true; }
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
	if (!p) { p = document.createElement('div'); p.id = 'bets-panel'; p.setAttribute('role', 'dialog'); p.setAttribute('aria-modal', 'true'); p.setAttribute('aria-label', 'Bets'); document.body.appendChild(p);
		p.addEventListener('click', e => { const b = e.target.closest && e.target.closest('button'); if (b && !b.disabled) sound(soundOf(b)); }, true); }
	const keep = document.activeElement && p.contains(document.activeElement) ? document.activeElement.dataset.f : null;
	const amtWas = {}; for (const i of p.querySelectorAll('.bm-amt')) amtWas[i.dataset.m] = i.value;
	const bal = Stars.stars();
	let h = `<h3><span>★ Bets on ${esc(W.runner)}'s game</span><button class="b bm-x" data-f="x" type="button" aria-label="Close">✕</button></h3>`
		+ `<div class="muted">You have <b class="bm-bal">${fmt(bal)}</b> ★. Everything bet on a game is one pool: the winners share it by stake.</div>`;
	for (const m of W.markets) {
		const title = m.kind === 'tour' ? 'Who wins the tournament' : m.kind === 'pvp' ? 'Who wins the match' : m.game === 'overworld' ? 'How it ends' : 'How the run ends';   // (the overworld's: a battle, a Frontier run, a minigame)
		const sel = m.mine ? m.mine.o : W.pick[m.id];
		h += `<div class="bm" data-m="${esc(m.id)}"><div class="bm-title">${esc(title)} <span class="muted">· pool ${fmt(m.pool)} ★ · ${m.bettors} bettor${m.bettors === 1 ? '' : 's'}</span></div>`;
		for (const o of m.outcomes) {
			const per = perStar(m, o.k);
			const won = m.end && m.end.outcome === o.k;
			const lock = !m.open || !m.can || (m.mine && m.mine.o !== o.k);
			h += `<button type="button" class="bm-o${sel === o.k ? ' sel' : ''}${won ? ' won' : ''}" data-f="o:${esc(m.id)}:${esc(o.k)}" data-m="${esc(m.id)}" data-k="${esc(o.k)}"${lock ? ' disabled' : ''}>`
				+ `<span class="l">${won ? '🏆 ' : ''}${esc(o.label)}</span><span class="p">${fmt(o.pool)} ★<br>${per ? '×' + per.toFixed(2) + ' a star' : '—'}</span></button>`;
		}
		const labelOf = k => (m.outcomes.find(o => o.k === k) || {}).label || k;
		if (m.mine) {
			h += `<div class="muted bm-mine">Your bet: <b>${fmt(m.mine.n)} ★</b> on ${esc(labelOf(m.mine.o))}</div>`;
			if (m.mine.goods) h += `<div class="muted bm-sold">Sold to the bank for ${fmt(goodsWorth(m.mine.goods))} ★:</div><ul class="bm-gl">${goodsLines(m.mine.goods).map(t => `<li>${esc(t)}</li>`).join('')}</ul>`;
		}
		// every stake, and what it was (stars, or things sold to the bank at their worth)
		const others = (m.bets || []).filter(b => b.goods);
		if (others.length) h += `<ul class="bm-bets">${others.map(b => `<li><b>${esc(b.u)}</b> · ${fmt(b.n)} ★ on ${esc(labelOf(b.o))}: ${esc(goodsLines(b.goods).join(', '))}</li>`).join('')}</ul>`;
		if (m.end) {
			const mine = m.mine, pay = m.end.pay;
			const line = !mine ? (m.end.refund ? 'Settled: every bet was given back (' + esc(m.end.why) + ').' : 'Settled.')
				: m.end.refund ? `Refunded ${fmt(pay)} ★ (${esc(m.end.why)})${mine.goods ? ': in stars, as what you bet was sold to the bank' : ''}` : pay > 0 ? `+${fmt(pay)} ★` : `Your ${fmt(mine.n)} ★ went to the winners.`;
			h += `<div class="res ${mine && pay > mine.n ? 'win' : mine && !pay ? 'lose' : ''} bm-res">${line}</div>`;
		} else if (!m.open) h += `<div class="muted bm-closed">Betting closed: ${esc(m.why || '')}.</div>`;
		else if (!m.can) h += `<div class="muted bm-cant">${esc(m.cant || '')}</div>`;
		else if (W.gd && W.gd.mid === m.id) h += goodsPicker(m, sel);
		else {
			const amt = amtWas[m.id] ?? '';
			const n = Math.floor(+amt) || 0, k = sel;
			h += `<div class="bm-row"><input class="bm-amt" data-f="a:${esc(m.id)}" data-m="${esc(m.id)}" inputmode="numeric" pattern="[0-9]*" placeholder="Stars" value="${esc(amt)}" aria-label="Stars to bet">`
				+ `<button type="button" class="b bm-add" data-f="p10:${esc(m.id)}" data-m="${esc(m.id)}" data-add="10">+10</button><button type="button" class="b bm-add" data-f="p100:${esc(m.id)}" data-m="${esc(m.id)}" data-add="100">+100</button>`
				+ `<button type="button" class="b bm-all" data-f="all:${esc(m.id)}" data-m="${esc(m.id)}">All</button></div>`
				+ `<div class="bm-row"><button type="button" class="b go bm-place" data-f="go:${esc(m.id)}" data-m="${esc(m.id)}"${!k || n < 1 || W.busy ? ' disabled' : ''}>${m.mine ? 'Raise bet' : 'Place bet'}${n && k ? ` · wins ${fmt(Math.floor(n * perStar(m, k, n)))} ★` : ''}</button>`
				+ `<span class="muted">closes in <span class="bm-left" data-m="${esc(m.id)}"></span> or at the game's opening mark</span></div>`
				+ `<div class="bm-row"><button type="button" class="b bm-goods" data-f="g:${esc(m.id)}" data-m="${esc(m.id)}">Bet something else…</button><span class="muted">a card, a Pokémon, an item… at its worth in ★</span></div>`;
		}
		h += '</div>';
	}
	if (!W.markets.length) h += `<div class="muted">${esc(W.err || 'No betting on this game.')}</div>`;
	if (W.msg) h += `<div class="muted bm-msg">${esc(W.msg)}</div>`;
	if (!INV && W.markets.some(m => (m.bets || []).some(b => b.goods))) inv();   // (names for the things bet: drawn again once in)
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
	// the goods picker
	for (const b of p.querySelectorAll('.bm-goods')) b.onclick = () => openGoods(b.dataset.m);
	for (const b of p.querySelectorAll('.bm-gtab')) b.onclick = () => { W.gd.tab = b.dataset.tab; if (b.dataset.tab === 'ow') owCheck(); draw(); };
	for (const b of p.querySelectorAll('.bm-gpm')) b.onclick = () => pickAdd(b.dataset.key, +b.dataset.d);
	for (const i of p.querySelectorAll('.bm-gamt')) {
		i.oninput = () => { const v = i.value.replace(/\D/g, ''); if (v !== i.value) i.value = v; pickSet(i.dataset.key, +v || 0, true); const pos = i.selectionStart; draw(); const j = document.querySelector(`#bets-panel .bm-gamt[data-key="${CSS.escape(i.dataset.key)}"]`); if (j) { j.focus(); try { j.setSelectionRange(pos, pos); } catch { /* not a text field */ } } };
		i.onkeydown = e => e.stopPropagation();
	}
	for (const b of p.querySelectorAll('.bm-gplace')) b.onclick = () => placeGoods(b.dataset.m);
	for (const b of p.querySelectorAll('.bm-gback')) b.onclick = () => { W.gd = null; W.msg = ''; draw(); };
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

// ---------------------------------------------------------------- "Bet something else": goods at their star value
/** The picker for market m: tabs of what I hold, each with its worth in stars, the total, and Bet these. */
function goodsPicker(m, sel) {
	const g = W.gd, id = esc(m.id);
	let h = `<div class="bm-gd" data-m="${id}"><div class="bm-gtabs">${GTABS.map(([k, l]) => `<button type="button" class="b bm-gtab${g.tab === k ? ' on' : ''}" data-f="gt:${k}" data-tab="${k}">${l}</button>`).join('')}</div>`;
	if (g.loading || !INV) h += '<div class="muted">Looking at what you hold…</div>';
	else if (g.tab === 'ow' && g.owWhy !== null) h += `<div class="muted bm-owwhy">${esc(g.owWhy || 'Checking your overworld save…')}</div>`;
	else {
		const rows = g.rows.filter(r => r.tab === g.tab);
		h += `<div class="bm-glist">${rows.map(r => {
			const n = g.picks[r.key] || 0, k = esc(r.key), each = r.v1 >= 1 ? fmt(r.v1) + ' ★ each' : `${fmt(Math.round(1 / r.v1))} = 1 ★`;
			const ctl = r.amount ? `<input class="bm-gamt" data-f="ga:${k}" data-key="${k}" inputmode="numeric" pattern="[0-9]*" placeholder="0" value="${n || ''}" aria-label="${esc(r.name)} to bet">`
				: `<button type="button" class="b bm-gpm" data-f="gm:${k}" data-key="${k}" data-d="-1"${n ? '' : ' disabled'} aria-label="One fewer">−</button><span class="c">${n ? n + ' / ' : ''}${fmt(r.have)}</span><button type="button" class="b bm-gpm" data-f="gp:${k}" data-key="${k}" data-d="1"${n >= r.have ? ' disabled' : ''} aria-label="One more">+</button>`;
			return `<div class="bm-gr"><span class="l">${esc(r.name)}<small>${esc(r.sub)} · ${each} · you have ${fmt(r.have)}</small></span>${ctl}</div>`;
		}).join('') || '<div class="muted">Nothing here to bet.</div>'}</div>`;
		if (g.tab === 'ow') h += '<div class="muted">Things from the overworld are bet on their own, and leave your game on this device when the bet is placed.</div>';
	}
	const v = pickedValue();
	h += `<div class="muted bm-gsum">Worth <b class="bm-gtotal">${fmt(v)}</b> ★. They are sold to the bank for that when the bet is placed: winners are paid in stars, and a refund pays the ${fmt(v)} ★ back in stars.</div>`
		+ `<div class="bm-row"><button type="button" class="b go bm-gplace" data-f="gg:${id}" data-m="${id}"${!sel || v < 1 || W.busy ? ' disabled' : ''}>${sel ? `Bet these · ${fmt(v)} ★` : 'Pick who you back first'}</button><button type="button" class="b bm-gback" data-f="gb:${id}">Back to stars</button></div></div>`;
	return h;
}
const pickedValue = () => (INV && W.gd ? INV.offerValue(INV.offerOf(W.gd.picks)) : 0);
async function openGoods(mid) {
	W.gd = { mid, tab: 'money', picks: {}, rows: [], loading: true, owWhy: null }; W.msg = ''; draw();
	const m = await inv();
	if (!m || !W.gd || W.gd.mid !== mid) { if (!m) { W.gd = null; W.msg = 'Could not look at what you hold. Try again.'; draw(); } return; }
	await m.loadInventory().catch(() => {});
	if (!W.gd || W.gd.mid !== mid) return;
	W.gd.rows = m.pickables(); W.gd.loading = false;
	const first = GTABS.find(([k]) => W.gd.rows.some(r => r.tab === k)); if (first) W.gd.tab = first[0];
	if (W.gd.tab === 'ow') owCheck();
	draw();
	const f = document.querySelector('#bets-panel .bm-gtab.on'); if (f) f.focus();
}
/** May the overworld's things leave its save from this page now? (ow_handover.js: no game tab open, this device not behind) */
function owCheck() {
	const g = W.gd; if (!g || g.owChecked) return; g.owChecked = true; g.owWhy = '';
	import('/overworld/ow_handover.js').then(HO => HO.whyNot()).then(w => { if (W.gd === g) { g.owWhy = w || null; draw(); } }).catch(() => { if (W.gd === g) { g.owWhy = 'Your overworld game could not be checked.'; draw(); } });
}
const isOw = key => /^(owmoney|owcoins|mon|item)(:|$)/.test(key);
/** Set how many of a thing are picked (kept to what I hold). The overworld's things are bet on their own, so picking one
 *  of them clears the rest, and the other way round. */
function pickSet(key, n, quiet) {
	const g = W.gd, r = g && g.rows.find(x => x.key === key); if (!r) return;
	n = Math.max(0, Math.min(r.have, Math.floor(+n) || 0));
	if (n) for (const k of Object.keys(g.picks)) if (isOw(k) !== isOw(key)) { delete g.picks[k]; W.msg = 'Things from the overworld are bet on their own: the rest were taken off.'; }
	if (n) g.picks[key] = n; else delete g.picks[key];
	if (!quiet) draw();
}
const pickAdd = (key, d) => pickSet(key, ((W.gd && W.gd.picks[key]) || 0) + d);

async function placeGoods(id) {
	const m = W.markets.find(x => x.id === id), o = m && (m.mine ? m.mine.o : W.pick[id]);
	if (!m || !o || W.busy || !W.gd || !INV) return;
	const goods = INV.offerOf(W.gd.picks), value = INV.offerValue(goods);
	if (value < 1) return;
	W.busy = true; W.msg = 'Placing…'; draw();
	// one id for this placement: a retry of it never sells anything twice
	const bid = newBid();
	let r = null;
	for (let t = 0; t < 3 && !r; t++) { try { r = await W.call('bet-place', { id, o, bid, goods }); } catch { r = null; } }
	const done = market => { W.msg = `Sold to the bank for ${fmt(value)} ★, and bet.`; W.gd = null; const k = W.markets.findIndex(x => x.id === id); if (k >= 0 && market) W.markets[k] = market; };
	if (r && r.handover) {
		// the overworld's things: this device takes them out of its save first (the trade system's hand-over), then the bet lands
		W.msg = 'Taking them out of your overworld game…'; draw();
		let h = null; try { h = await (await import('/overworld/ow_handover.js')).betHandOver(bid, goods); } catch { h = null; }
		if (!h) W.msg = 'Your overworld game could not be reached: nothing was taken.';
		else if (!h.ok) W.msg = h.why;
		else if (h.landed) done(h.market);
		else if (h.back) W.msg = 'Betting closed before they arrived: they are back in your overworld game.';
		else if (h.restored) W.msg = 'The bet was not placed: they are back in your overworld game.';
		else W.msg = 'No answer yet: the bet is finished the next time the overworld or the Inventory is opened on this device.';
	} else if (r && r.ok) done(r.market);
	else W.msg = (r && r.error) || 'Offline: the bet was not placed.';
	W.busy = false;
	if (r && r.wallet) Stars.absorb(r.wallet);
	if (W.gd) { await INV.loadInventory().catch(() => {}); if (W.gd) { W.gd.rows = INV.pickables(); W.gd.picks = {}; } }
	draw();
}
