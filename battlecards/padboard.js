// padboard.js — playing a Battlecards match on a controller
// (Plans/CONTROLLER_SUPPORT_PLAN.md, Phase 4). Signed-in players only.
//
// The board is a Three.js canvas, so the DOM navigator (padnav.js) can't see
// it. This keeps its own focus over what's on screen — your hand, both boards
// (creatures, lands, artifacts, walkers…), your hero panel and the enemy heroes
// — and drives the game through the paths a mouse already uses:
//   * a HAND card: creatures/locations pick a board slot with ←/→ (the game's own
//     green place marker shows where), then releasePlay() — the same function a
//     drag-and-drop ends in, so every rule (adventure, trade, magnetic, targeted
//     spells) routes exactly as it does for a mouse. Other cards play the same way.
//   * anything ON the board: a replayed quick click at its screen position, so
//     arming an attack, tapping a land or opening an artifact's menu is the
//     game's own routing, untouched.
//   * TARGETING (a spell's target, an armed attacker): focus visits only the legal
//     targets and the red arrow follows it; confirm commits, cancel backs out.
// Menus that open along the way (choose-one, discover, …) belong to padnav.js.
//
// Buttons (Nintendo layout, site/gamepad.js):
//   d-pad / stick  move focus (spatially)     confirm (right)  play / attack / pick
//   cancel (bottom) back out (clearModes)      LB / RB   hand ← → your side ← → enemy ← → buttons
//   left face      read the focused card (the centered focus view; also confirm on a card you can't act on)
//   Start          the match menu (log, auto-pass, sound, concede)
// END TURN, the HERO POWER orb and the LOG are places on the board you move to
// and confirm (owner, 2026-10-01: no dedicated hero-power button, no end turn on
// Start, and the selector must be able to reach End Turn).
import { startGamepad, buttonLabel, loadPadSettings } from '../site/gamepad.js';
import { oskOpen } from '../site/osk.js';
import { openModal, setBoardGuard } from './padnav.js';

const signedIn = () => {
	try { return !!localStorage.getItem('magepunk_mp_token_v1') && !!JSON.parse(localStorage.getItem('magepunk_mp_state_v1') || 'null')?.username; }
	catch (e) { return false; }
};

let api = null, pad = null;
let focusKey = null;        // 'u:<uid>' | 'h:<playerIndex>'
let slot = null;            // { card, i } while placing a creature
let visible = false;        // hidden once the mouse moves
let lastMode = 'browse';
let reticle = null, hints = null, lastHints = '';
let menuEl = null;          // the Start menu, while open

const keyOf = s => s.kind === 'hero' ? 'h:' + s.player : s.kind === 'die' ? 'die' : s.kind === 'orb' ? 'orb' : s.kind === 'btn' ? 'b:' + s.el.id : 'u:' + s.uid;
const ZONES = ['hand', 'mine', 'enemy', 'hud'];
// the HUD buttons the selector can land on (only while shown and enabled)
const HUD_BUTTONS = ['end-turn', 'coin-btn', 'planeswalk-btn', 'log-btn'];

export function boardActive() {
	if (!api) return false;
	const s = api.state;
	return !!s && !s.over && !api.busy() && !openModal() && !oskOpen();
}

// every focusable thing on screen right now
function stops() {
	const s = api.state, H = api.HUMAN, out = [];
	if (!s) return out;
	for (const uid of api.entityUids()) {
		const c = api.cardOf(uid);
		if (!c || c.controller == null) continue;
		if (c.controller !== H && (c.zone === 'hand' || c.zone === 'trap' || c.zone === 'deck')) continue;   // hidden info
		if (c.zone === 'deck' || c.zone === 'graveyard' || c.zone === 'exile') continue;
		const p = api.screenPos(uid);
		if (!p || p.x < 0 || p.y < 0 || p.x > innerWidth || p.y > innerHeight) continue;
		out.push({ kind: 'card', uid, card: c, x: p.x, y: p.y, zone: c.zone === 'hand' ? 'hand' : c.controller === H ? 'mine' : 'enemy' });
	}
	const pp = api.panelPos();
	if (pp) out.push({ kind: 'hero', player: H, x: pp.x, y: pp.y, zone: 'mine' });
	const dp = api.diePos && api.diePos();   // the planar die orb on your panel
	if (dp) out.push({ kind: 'die', x: dp.x, y: dp.y, zone: 'mine' });
	const op = api.orbPos && api.orbPos();   // your HERO POWER: move onto it and confirm
	if (op) out.push({ kind: 'orb', x: op.x, y: op.y, zone: 'mine' });
	for (const id of HUD_BUTTONS) {
		const el = document.getElementById(id);
		if (!el || el.disabled) continue;
		const r = el.getBoundingClientRect();
		if (r.width < 4 || getComputedStyle(el).display === 'none' || getComputedStyle(el).visibility === 'hidden') continue;
		out.push({ kind: 'btn', el, x: r.left + r.width / 2, y: r.top + r.height / 2, zone: 'hud' });
	}
	for (const [pi, el] of api.foePanels()) {
		const r = el.getBoundingClientRect();
		if (r.width < 4 || getComputedStyle(el).display === 'none') continue;
		out.push({ kind: 'hero', player: pi, el, x: r.left + r.width / 2, y: r.top + r.height / 2, zone: 'enemy' });
	}
	return out;
}

// while targeting: only the legal targets, each carrying its engine target
function targetStops() {
	const s = api.state, H = api.HUMAN, E = api.E;
	let targets = null;
	if (api.pending) targets = api.pending.targets || [];
	else if (api.attacker === 'HERO') targets = E.heroAttackTargets(s, H);
	else if (api.attacker) { const a = api.cardOf(api.attacker); targets = a ? E.attackTargets(s, H, a) : []; }
	if (!targets) return null;
	const all = stops();
	return targets.map(t => {
		const st = t.type === 'hero' ? all.find(x => x.kind === 'hero' && x.player === t.player) : all.find(x => x.uid === t.uid);
		return st ? { ...st, target: t } : null;
	}).filter(Boolean);
}

const mode = () => slot ? 'slot' : (api.pending || api.attacker) ? 'target' : 'browse';
const current = list => list.find(s => keyOf(s) === focusKey) || null;

function setFocus(s) {
	focusKey = s ? keyOf(s) : null;
	visible = true;
	if (!s) { api.setHover(null); return; }
	if (s.kind === 'card') api.setHover(s.uid, s.x, s.y);
	else api.setHover(s.player === api.HUMAN ? 'heropanel' : null, s.x, s.y);
	if (mode() === 'target') api.setMouse(s.x, s.y);   // the red arrow points where focus is
}

// spatial: nearest stop in the pressed direction (same scoring as padnav)
const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
function nearest(list, from, dir) {
	const [dx, dy] = DIRS[dir];
	let best = null, bestScore = Infinity;
	for (const s of list) {
		if (keyOf(s) === keyOf(from)) continue;
		const along = (s.x - from.x) * dx + (s.y - from.y) * dy;
		if (along <= 4) continue;
		const score = along + (Math.abs((s.x - from.x) * dy) + Math.abs((s.y - from.y) * dx)) * 2.2;
		if (score < bestScore) { bestScore = score; best = s; }
	}
	return best;
}
function firstIn(list, zone) {
	const z = list.filter(s => s.zone === zone).sort((a, b) => a.x - b.x);
	return z[Math.floor(z.length / 2)] || null;
}
function pickDefault(list) {
	return firstIn(list, 'hand') || firstIn(list, 'mine') || list[0] || null;
}

// ---------- slot pick (placing a creature) ----------
function slotX(i) {
	const xs = api.boardScreenXs();
	if (!xs.length) return innerWidth / 2;
	if (i <= 0) return xs[0].x - 44;
	if (i >= xs.length) return xs[xs.length - 1].x + 44;
	return (xs[i - 1].x + xs[i].x) / 2;
}
function slotY() {
	const H = api.HUMAN, b = api.state.players[H].board.map(c => api.screenPos(c.uid)).filter(Boolean);
	return b.length ? b.reduce((a, p) => a + p.y, 0) / b.length : innerHeight * 0.6;
}
function showSlot() {
	api.setMouse(slotX(slot.i), slotY());
	api.setPlacing(slot.card);
}
function place() {
	const ev = { clientX: slotX(slot.i), clientY: slotY(), button: 0 };
	const card = slot.card;
	slot = null;
	api.setPlacing(null);
	api.releasePlay(card, ev);
}

// ---------- actions ----------
function vclick(x, y, target) {
	const init = { bubbles: true, cancelable: true, clientX: x, clientY: y, button: 0, buttons: 1, pointerId: 1, pointerType: 'mouse', isPrimary: true };
	(target || api.canvas).dispatchEvent(new PointerEvent('pointerdown', init));
	(target || api.canvas).dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
}
function confirm() {
	const m = mode();
	if (m === 'slot') return place();
	if (m === 'target') {
		const s = current(targetStops() || []);
		if (!s) return;
		if (api.pending) return api.commitPending(s.target);
		if (s.kind === 'hero') return api.panelClick(s.player);
		return vclick(s.x, s.y);                 // the attack commits on the press, as for a mouse
	}
	const s = current(stops());
	if (!s) return;
	if (s.kind === 'hero') return s.player === api.HUMAN ? vclick(s.x, s.y) : api.panelClick(s.player);
	if (s.kind === 'die' || s.kind === 'orb') return vclick(s.x, s.y);   // the orb: the hero power, as a click on it
	if (s.kind === 'btn') return s.el.click();                         // End Turn / Coin / Planeswalk / Log
	const c = s.card;
	// nothing to DO with it (an enemy's card): read it in the focus view instead
	if (c.controller !== api.HUMAN) return openFocus(c);
	if (c.zone === 'hand') {
		const S = api.state, H = api.HUMAN, E = api.E;
		if (S.current !== H) return openFocus(c);   // their turn: read it (it says why it can't be played)
		const canPlay = E.canPlay(S, H, c);
		if ((c.type === 'creature' || c.type === 'location') && canPlay && S.players[H].board.length && !c.adventure) {
			slot = { card: c, i: Math.min(S.players[H].board.length, Math.ceil(S.players[H].board.length / 2)) };
			showSlot();
			return;
		}
		if (!canPlay && !(c.tradeable || c.prepare || c.forge || c.adventure)) return openFocus(c);   // the reader says why
		// spells and the rest: the drag-drop entry, dropped on empty felt (nothing under it)
		return api.releasePlay(c, { clientX: 2, clientY: 2, button: 0 });
	}
	return vclick(s.x, s.y);                     // board: the game's own click routing
}
// the card focus view (game.js); closing it puts board focus back on that card
function openFocus(card) {
	api.openCardFocus(card, c => {
		const s = c && stops().find(x => x.uid === c.uid);
		if (s) setFocus(s);
	});
}
function cancel() {
	if (slot) { slot = null; api.setPlacing(null); return; }
	if (api.pending || api.attacker) { api.clearModes(); return; }
	api.hideInspect();
}
function move(dir) {
	const m = mode();
	if (m === 'slot') {
		const n = api.state.players[api.HUMAN].board.length;
		if (dir === 'left') slot.i = Math.max(0, slot.i - 1);
		if (dir === 'right') slot.i = Math.min(n, slot.i + 1);
		return showSlot();
	}
	const list = m === 'target' ? targetStops() || [] : stops();
	const cur = current(list);
	if (!cur || !visible) return setFocus(cur || (m === 'target' ? list[0] : pickDefault(list)));
	const next = nearest(list, cur, dir);
	if (next) setFocus(next);
}
function jumpZone(step) {
	if (mode() !== 'browse') return;
	const list = stops(), cur = current(list);
	let zi = cur ? ZONES.indexOf(cur.zone) : 0;
	for (let k = 0; k < ZONES.length; k++) {
		zi = (zi + step + ZONES.length) % ZONES.length;
		// the buttons start on End Turn (the one you'll want most)
		const f = (ZONES[zi] === 'hud' && list.find(x => x.kind === 'btn' && x.el.id === 'end-turn')) || firstIn(list, ZONES[zi]);
		if (f) return setFocus(f);
	}
}

function onPress(action) {
	if (!boardActive()) return;
	if (!visible && action !== 'menu') {             // first press after the mouse: just show focus
		const list = mode() === 'target' ? targetStops() || [] : stops();
		visible = true;
		return setFocus(current(list) || (mode() === 'target' ? list[0] : pickDefault(list)));
	}
	if (DIRS[action]) return move(action);
	if (action === 'confirm') return confirm();
	if (action === 'cancel') return cancel();
	if (action === 'prev') return jumpZone(-1);
	if (action === 'next') return jumpZone(1);
	if (action === 'context') {
		const s = current(stops());
		if (s?.card) openFocus(s.card);
		else if (s?.kind === 'orb') { const hp = api.heroPowerCard(); if (hp) openFocus(hp); }
		return;
	}
	if (action === 'menu') { if (mode() === 'browse') openMatchMenu(); return; }
}

// ---------- the Start menu ----------
// A small DOM modal (aria-modal, so padnav drives it); cancel / Esc / Back close it.
function closeMatchMenu() {
	if (!menuEl) return;
	menuEl.remove(); menuEl = null;
	removeEventListener('keydown', menuKey, true);
}
function menuKey(e) { if (e.key === 'Escape' && menuEl) { e.stopPropagation(); closeMatchMenu(); } }
function openMatchMenu() {
	if (menuEl) return;
	api.hideInspect();
	menuEl = document.createElement('div');
	menuEl.id = 'pad-match-menu';
	menuEl.setAttribute('role', 'dialog');
	menuEl.setAttribute('aria-modal', 'true');
	Object.assign(menuEl.style, { position: 'fixed', left: '50%', top: '50%', transform: 'translate(-50%,-50%)', zIndex: '9100',
		minWidth: '240px', padding: '12px', display: 'flex', flexDirection: 'column', gap: '7px',
		background: 'rgba(20,15,34,.97)', border: '1px solid #8f6fff', borderRadius: '12px', boxShadow: '0 14px 44px rgba(0,0,0,.7)',
		font: '600 14px "Segoe UI", sans-serif', color: '#e8e2f4' });
	const title = document.createElement('div');
	title.textContent = 'Menu';
	Object.assign(title.style, { fontWeight: '800', letterSpacing: '1px', color: '#c9b8ff', marginBottom: '2px' });
	menuEl.appendChild(title);
	const item = (label, fn) => {
		const b = document.createElement('button');
		b.textContent = label;
		Object.assign(b.style, { textAlign: 'left', padding: '9px 12px', borderRadius: '8px', cursor: 'pointer',
			background: '#3a2e5c', color: '#e8e2f4', border: '1px solid #5a4a8a', font: 'inherit' });
		b.addEventListener('click', e => { e.stopPropagation(); fn(b); });
		menuEl.appendChild(b);
		return b;
	};
	const click = id => document.getElementById(id)?.click();
	const shownBtn = id => { const el = document.getElementById(id); return !!el && getComputedStyle(el).display !== 'none'; };
	item('📜 Game log', () => { closeMatchMenu(); api.openLog ? api.openLog() : click('log-btn'); });
	if (shownBtn('autopass-btn')) {
		const ap = () => document.getElementById('autopass-btn').textContent;
		item(ap(), b => { click('autopass-btn'); b.textContent = ap(); });
	}
	const sfx = () => (document.getElementById('sfx-btn')?.classList.contains('muted') ? '🔇 Sound: OFF' : '🔊 Sound: ON');
	item(sfx(), b => { click('sfx-btn'); b.textContent = sfx(); });
	if (shownBtn('concede')) item('🏳 Concede', () => { closeMatchMenu(); click('concede'); });
	item('Back', () => closeMatchMenu());
	document.body.appendChild(menuEl);
	addEventListener('keydown', menuKey, true);
}

// ---------- the per-frame bits: reticle, targeting entry, the end-turn hold ----------
function ensureDom() {
	if (reticle) return;
	reticle = document.createElement('div');
	reticle.id = 'padboard-reticle';
	Object.assign(reticle.style, { position: 'fixed', width: '86px', height: '86px', marginLeft: '-43px', marginTop: '-43px',
		border: '3px solid #ffd27a', borderRadius: '50%', boxShadow: '0 0 14px rgba(255,210,122,.6)', pointerEvents: 'none',
		zIndex: '70', display: 'none', transition: 'left .06s, top .06s' });
	hints = document.createElement('div');
	hints.id = 'padboard-hints';
	Object.assign(hints.style, { position: 'fixed', left: '50%', bottom: '8px', transform: 'translateX(-50%)', zIndex: '72', pointerEvents: 'none',
		background: 'rgba(20,16,34,.86)', color: '#e8e2f4', border: '1px solid #6a5f8a', borderRadius: '8px', padding: '5px 12px',
		font: '600 13px "Segoe UI", sans-serif', whiteSpace: 'nowrap', display: 'none' });
	document.body.append(reticle, hints);
}
// what the buttons do in this mode, named for the pad in your hands (Phase 5)
function hintText(m) {
	const L = a => `[${buttonLabel(a, (pad && pad.kind()) || 'switch', loadPadSettings())}]`;
	if (m === 'slot') return `◄► choose a slot · ${L('confirm')} place · ${L('cancel')} cancel`;
	if (m === 'target') return `D-pad pick a target · ${L('confirm')} confirm · ${L('cancel')} cancel`;
	return `D-pad move · ${L('confirm')} play / attack / use · ${L('prev')}${L('next')} zones · ${L('context')} inspect · ${L('menu')} menu`;
}
function onFrame() {
	if (!api) return;
	ensureDom();
	// UNPLUGGED (the last pad gone — checked here, not in onDisconnect, so a second
	// pad still in use keeps everything): hide the reticle, the hints, the end-turn
	// and the card's hover lift. Focus is remembered; the next press shows it.
	if (visible && pad && !pad.connected()) {
		visible = false;
		reticle.style.display = 'none'; hints.style.display = 'none';
		api.setHover(null);
	}
	const active = boardActive();
	const m = active ? mode() : 'off';
	// a spell or attack just started targeting: jump focus onto the first legal target
	if (m === 'target' && lastMode !== 'target' && visible) {
		const t = targetStops() || [];
		const cur = current(t);
		if (!cur && t.length) setFocus(t.find(s => s.kind === 'hero' && s.player !== api.HUMAN) || t[0]);
	}
	if (m === 'browse' && lastMode === 'target') api.setMouse(-9999, -9999);
	lastMode = m;
	// the reticle rides on whatever is focused (cards animate, so every frame)
	const list = m === 'target' ? targetStops() || [] : stops();
	const cur = active && visible && m !== 'slot' ? current(list) : null;
	if (cur && cur.kind === 'btn') {
		// a HUD button: the reticle becomes a rounded box around it
		const r = cur.el.getBoundingClientRect();
		Object.assign(reticle.style, { display: 'block', left: cur.x + 'px', top: cur.y + 'px', width: (r.width + 12) + 'px', height: (r.height + 12) + 'px',
			marginLeft: -(r.width + 12) / 2 + 'px', marginTop: -(r.height + 12) / 2 + 'px', borderRadius: '12px', borderColor: '#ffd27a' });
	} else if (cur) {
		Object.assign(reticle.style, { display: 'block', left: cur.x + 'px', top: cur.y + 'px', width: '86px', height: '86px',
			marginLeft: '-43px', marginTop: '-43px', borderRadius: '50%', borderColor: m === 'target' ? '#ff6b6b' : '#ffd27a' });
	}
	else reticle.style.display = 'none';
	const showHints = active && visible && pad && pad.connected();
	if (showHints) { const t = hintText(m); if (t !== lastHints) { hints.textContent = t; lastHints = t; } hints.style.display = 'block'; }
	else hints.style.display = 'none';
}

export function initPadboard(gameApi) {
	if (pad || typeof window === 'undefined' || !signedIn()) return null;
	api = gameApi;
	setBoardGuard(boardActive);
	pad = startGamepad({
		readPads: window.__owFakePads ? () => window.__owFakePads : undefined,
		onPress, onFrame,
	});
	// the mouse takes over: hide the reticle until the next pad press
	addEventListener('pointermove', e => { if (e.isTrusted && visible) { visible = false; if (reticle) reticle.style.display = 'none'; } }, { passive: true });
	window.__padboard = { get focus() { return focusKey; }, get menuOpen() { return !!menuEl; }, openMatchMenu, closeMatchMenu,
		focusKey(k) { const s = stops().find(x => keyOf(x) === k); if (s) setFocus(s); return !!s; }, get slot() { return slot && { uid: slot.card.uid, i: slot.i }; }, get mode() { return api ? mode() : 'off'; }, stops, targetStops, active: boardActive,
		// tests: put focus on a card directly (walking there depends on layout)
		focusUid(uid) { const s = stops().find(x => x.uid === uid); if (s) setFocus(s); return !!s; } };
	return pad;
}
