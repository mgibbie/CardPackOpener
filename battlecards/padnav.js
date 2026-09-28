// padnav.js — controller navigation for Battlecards' DOM screens
// (Plans/CONTROLLER_SUPPORT_PLAN.md, Phase 3). Signed-in players only.
//
// A spatial navigator: every visible, clickable thing on the TOP layer is a
// stop, and the d-pad moves to the nearest one in that direction. "Top layer"
// is decided the way a mouse would: an element counts only if it is not
// covered at its centre, so an open modal/overlay automatically scopes focus to
// itself. It covers the lobby, the ~115 run-mode overlay screens, every
// in-match modal (#scry-modal / #walker-menu / #inspect), game over, the deck
// builder, gallery, packs and replays.
//
// ACTIVATING an element replays exactly what a mouse click sends (pointerdown,
// mousedown, pointerup, mouseup, click at its centre). The in-match modals
// listen on pointerdown and stop its propagation; a synthetic click alone would
// never reach them, and switching them to 'click' would let the page-wide
// pointerdown handler close a menu before its button ran. Replaying the real
// sequence keeps every existing handler exactly as it is for mouse and touch.
//
// Buttons (Nintendo layout, site/gamepad.js):
//   d-pad / stick  move focus            confirm (right face)  activate
//   cancel (bottom) Esc (back / close)   LB / RB  ← / → (pages, replay steps)
//   Start           Space (open a pack, play/pause)
// Focus shows a hover (tooltips, card zoom) and a gold ring; moving the mouse
// hides the ring so mouse players never see it.
import { startGamepad } from '../site/gamepad.js';
import { askText, oskOpen } from '../site/osk.js';

const SEL = 'button, a[href], input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"]), [data-padnav]';
const TEXTY = /^(text|search|email|url|number|tel|password)?$/i;

const signedIn = () => {
	try { return !!localStorage.getItem('magepunk_mp_token_v1') && !!JSON.parse(localStorage.getItem('magepunk_mp_state_v1') || 'null')?.username; }
	catch (e) { return false; }
};

let focused = null, lastRect = null, ringOn = false;

function injectStyle() {
	if (document.getElementById('padnav-style')) return;
	const st = document.createElement('style');
	st.id = 'padnav-style';
	st.textContent = `.padnav-focus { outline: 3px solid #ffd27a !important; outline-offset: 2px !important;
		box-shadow: 0 0 0 6px rgba(255, 210, 122, .28) !important; }`;
	document.head.appendChild(st);
}

const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
function shown(el) {
	if (el.disabled || el.closest('[hidden],[aria-hidden="true"]')) return false;
	const r = el.getBoundingClientRect();
	if (r.width < 4 || r.height < 4) return false;
	const cs = getComputedStyle(el);
	return cs.visibility !== 'hidden' && cs.display !== 'none' && +cs.opacity !== 0 && cs.pointerEvents !== 'none';
}
const onScreen = r => r.bottom > 0 && r.right > 0 && r.top < innerHeight && r.left < innerWidth;
// not covered at its centre by something else (the way a click would land)
function onTop(el, r) {
	const c = center(r);
	const hit = document.elementFromPoint(Math.min(innerWidth - 1, Math.max(0, c.x)), Math.min(innerHeight - 1, Math.max(0, c.y)));
	return !!hit && (hit === el || el.contains(hit) || hit.contains(el));
}
// the fixed-position layer an element lives in, if that layer is a real overlay
function overlayOf(el) {
	for (let n = el; n && n !== document.body; n = n.parentElement) {
		if (getComputedStyle(n).position === 'fixed') {
			const r = n.getBoundingClientRect();
			if (r.width * r.height > innerWidth * innerHeight * 0.12) return n;
		}
	}
	return null;
}

// The game's modal containers. A decision modal is a small box over a separate
// veil, so "a big fixed layer" alone can't find it; the page chrome (top bar,
// Back) stays clickable above the veil but must not steal a modal's focus.
const MODALS = ['#scry-modal', '#walker-menu', '#inspect', '#dungeon-overlay', '[aria-modal="true"]'];
function openModal() {
	let best = null, bestZ = -Infinity;
	for (const sel of MODALS) for (const m of document.querySelectorAll(sel)) {
		if (m.closest('#osk') || !shown(m)) continue;
		if (!m.querySelector(SEL) && !m.matches(SEL)) continue;
		const z = +getComputedStyle(m).zIndex || 0;
		if (z >= bestZ) { bestZ = z; best = m; }
	}
	return best;
}

export function candidates() {
	const all = [...document.querySelectorAll(SEL)].filter(el => shown(el) && !el.closest('#osk'));
	const modal = openModal();
	if (modal) return all.filter(el => modal.contains(el));
	const live = all.filter(el => { const r = el.getBoundingClientRect(); return onScreen(r) && onTop(el, r); });
	// an open overlay/modal scopes focus to itself (incl. its scrolled-away rows)
	const layers = [...new Set(live.map(overlayOf).filter(Boolean))];
	if (layers.length) {
		const top = layers[layers.length - 1];
		return all.filter(el => top.contains(el) && (onTop(el, el.getBoundingClientRect()) || !onScreen(el.getBoundingClientRect())));
	}
	// the page itself: on-screen stops that aren't covered, plus scrolled-away ones
	return all.filter(el => { const r = el.getBoundingClientRect(); return onScreen(r) ? onTop(el, r) : !overlayOf(el); });
}

function hover(el, on) {
	if (!el) return;
	const r = el.getBoundingClientRect(), c = center(r);
	const init = { bubbles: true, clientX: c.x, clientY: c.y, pointerType: 'mouse' };
	const names = on ? ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove'] : ['pointerout', 'pointerleave', 'mouseout', 'mouseleave'];
	for (const n of names) {
		const bubbles = !/enter|leave/.test(n);
		el.dispatchEvent(n.startsWith('pointer') ? new PointerEvent(n, { ...init, bubbles }) : new MouseEvent(n, { ...init, bubbles }));
	}
}
function setFocus(el) {
	if (el === focused) return;
	if (focused) { focused.classList.remove('padnav-focus'); hover(focused, false); }
	focused = el;
	if (!el) return;
	injectStyle();
	el.classList.add('padnav-focus');
	ringOn = true;
	try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
	lastRect = el.getBoundingClientRect();
	hover(el, true);
}
// Is focus still on a live stop? 'same' = yes. Otherwise the page changed under
// it (a new modal, a re-render): land on whatever took its place and return
// 'moved' — the caller then only SHOWS the new focus, so a press never acts on
// an element the player hasn't seen highlighted.
function ensureFocus(list) {
	if (focused && focused.isConnected && list.includes(focused)) { lastRect = focused.getBoundingClientRect(); return 'same'; }
	if (focused) focused.classList.remove('padnav-focus');
	focused = null;
	if (!list.length) return false;
	if (lastRect) {
		const c0 = center(lastRect);
		const near = list.map(el => ({ el, d: Math.hypot(center(el.getBoundingClientRect()).x - c0.x, center(el.getBoundingClientRect()).y - c0.y) })).sort((a, b) => a.d - b.d)[0];
		if (near && near.d < 160) { setFocus(near.el); return 'moved'; }
	}
	const f = initial(list);
	if (f) setFocus(f);
	return f ? 'moved' : false;
}
// the first stop: the page's primary action if it marks one, else top-left
function initial(list) {
	return list.find(el => el.autofocus || el.classList.contains('primary')) ||
		list.slice().sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (ra.top - rb.top) || (ra.left - rb.left); })[0];
}

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
export function move(dir) {
	const list = candidates();
	if (ensureFocus(list) !== 'same') return;       // first press (or a changed page): just show focus
	const [dx, dy] = DIRS[dir];
	const c0 = center(focused.getBoundingClientRect());
	let best = null, bestScore = Infinity;
	for (const el of list) {
		if (el === focused) continue;
		const c = center(el.getBoundingClientRect());
		const along = (c.x - c0.x) * dx + (c.y - c0.y) * dy;       // distance in the pressed direction
		if (along <= 2) continue;
		const across = Math.abs((c.x - c0.x) * dy) + Math.abs((c.y - c0.y) * dx);
		const score = along + across * 2.2;
		if (score < bestScore) { bestScore = score; best = el; }
	}
	if (best) setFocus(best);
}

function clickLike(el) {
	const r = el.getBoundingClientRect(), c = center(r);
	const init = { bubbles: true, cancelable: true, clientX: c.x, clientY: c.y, button: 0, buttons: 1, pointerType: 'mouse', pointerId: 1, isPrimary: true };
	el.dispatchEvent(new PointerEvent('pointerdown', init));
	el.dispatchEvent(new MouseEvent('mousedown', init));
	el.dispatchEvent(new PointerEvent('pointerup', { ...init, buttons: 0 }));
	el.dispatchEvent(new MouseEvent('mouseup', { ...init, buttons: 0 }));
	el.dispatchEvent(new MouseEvent('click', { ...init, buttons: 0 }));
}
export async function activate() {
	const list = candidates();
	if (ensureFocus(list) !== 'same') return;       // first press only shows where you are
	const el = focused;
	const tag = el.tagName;
	if ((tag === 'INPUT' && TEXTY.test(el.type)) || tag === 'TEXTAREA') {
		// text fields: the on-screen keyboard (Phase 2), then the events a typist fires
		const v = await askText({ title: el.getAttribute('aria-label') || el.placeholder || el.title || 'Enter text', initial: el.value,
			maxLength: el.maxLength > 0 ? el.maxLength : 200 });
		if (v != null) { el.value = v; el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }
		return;
	}
	if (tag === 'SELECT') {
		el.selectedIndex = (el.selectedIndex + 1) % Math.max(1, el.options.length);
		el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true }));
		return;
	}
	if (tag === 'INPUT') { el.click(); return; }   // checkbox / radio / file
	clickLike(el);
	// the click may have re-rendered or closed things: re-home focus next frame, so
	// the player sees where it went (and the next press acts on what they see)
	requestAnimationFrame(() => ensureFocus(candidates()));
}
const key = k => { const t = document.activeElement && document.activeElement !== document.body ? document.activeElement : window;
	t.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })); };

export function onPress(action) {
	if (oskOpen()) return;                         // the on-screen keyboard runs its own pad
	// back from the mouse: show the ring again where focus was
	if (!ringOn && focused && focused.isConnected) { focused.classList.add('padnav-focus'); ringOn = true; }
	if (DIRS[action]) return move(action);
	if (action === 'confirm') return activate();
	if (action === 'cancel') return key('Escape');
	if (action === 'prev') return key('ArrowLeft');
	if (action === 'next') return key('ArrowRight');
	if (action === 'menu') return key(' ');
}

let pad = null;
export function initPadnav() {
	if (pad || typeof window === 'undefined' || !signedIn()) return null;
	pad = startGamepad({
		readPads: window.__owFakePads ? () => window.__owFakePads : undefined,
		onPress,
	});
	// the mouse takes over: hide the ring (focus is kept for the next pad press)
	addEventListener('pointermove', e => {
		if (!ringOn || !e.isTrusted) return;
		ringOn = false;
		if (focused) focused.classList.remove('padnav-focus');
	}, { passive: true });
	window.__padnav = { get focused() { return focused; }, candidates, move, activate, focusTo: setFocus };
	return pad;
}
initPadnav();
