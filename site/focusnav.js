// site/focusnav.js — spatial focus navigation for DOM pages and menus
// (controls sweep B1; generalized from battlecards/padnav.js, which now runs on it).
//
// Every visible, clickable thing on the TOP layer is a stop, and up/down/left/
// right moves to the nearest one in that direction. "Top layer" is decided the
// way a mouse would: an element counts only if it is not covered at its centre,
// so an open overlay scopes focus to itself; a modal (aria-modal, or one of the
// page's own `modals` selectors) scopes it explicitly.
//
// Drive it with logical actions (site/input.js / site/gamepad.js):
//   up down left right   move focus (the first press only SHOWS where focus is)
//   confirm              activate (a click; or a replayed mouse click, see below)
//   cancel               an Escape keydown (each page's own back / close)
//   prev / next          ArrowLeft / ArrowRight keydowns (pages, tabs)
//   menu                 Enter on the keyboard / Start on a pad: activate (DOM
//                        pages have no "Start" meaning) — or `onMenu` if given
// A gold ring marks focus for keyboard and pad users; the mouse hides it.
//
// USAGE (a plain page):  import { initFocusNav } from '/site/focusnav.js'; initFocusNav();
//   -> arrows / WASD / Z / X / Q / E / Enter and a controller all navigate.
// A surface with its own input loop: const nav = createFocusNav({...}); nav.onAction(a, info).
//
// Options (createFocusNav):
//   modals      extra modal selectors (aria-modal and open <dialog> always count)
//   scope       () => Element|null: only stops inside it (an overlay's own nav)
//   ringClass   the focus class (default 'focusnav-focus')
//   pointer     activate by replaying pointerdown/mousedown/pointerup/mouseup/click
//               at the element's centre (Battlecards' pointerdown-only modals)
//   hover       dispatch hover events on focus (tooltips, card zoom)
//   domFocus    also move the real DOM focus (default true; text fields excepted)
//   guard       () => true while something else owns the input (ignore actions)
//   onMenu      (info) => void, replaces the default 'menu' = activate
//   onCancel    (info) => void, replaces the default Escape keydown
//   scrollFallback  up/down with no stop that way scrolls the page (default true)
import { startInput, isTyping } from './input.js';
import { askText, oskOpen } from './osk.js';

export const STOP_SELECTOR = 'button, a[href], summary, input:not([type=hidden]), select, textarea, [tabindex]:not([tabindex="-1"]), [data-padnav], [data-focusnav]';
const TEXTY = /^(text|search|email|url|number|tel|password)?$/i;
const BASE_MODALS = ['[aria-modal="true"]', 'dialog[open]'];

const center = r => ({ x: r.left + r.width / 2, y: r.top + r.height / 2 });
export function shown(el) {
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
// the fixed-position layer an element lives in, if that layer is a real overlay.
// Memoized per lookup pass over each ancestor: a long page (the news feed, ~9,000 links)
// shares a few parents, and walking every link's ancestors with getComputedStyle made
// one key press take ~0.4 s there.
function overlayFinder() {
	const memo = new Map();
	const of = n => {
		if (!n || n === document.body || n === document.documentElement) return null;
		if (memo.has(n)) return memo.get(n);
		let r = null;
		if (getComputedStyle(n).position === 'fixed') {
			const b = n.getBoundingClientRect();
			r = b.width * b.height > innerWidth * innerHeight * 0.12 ? n : of(n.parentElement);
		} else r = of(n.parentElement);
		memo.set(n, r);
		return r;
	};
	return of;
}
const isTextField = el => (el.tagName === 'INPUT' && TEXTY.test(el.type)) || el.tagName === 'TEXTAREA';

function injectStyle(cls) {
	const id = 'focusnav-style-' + cls;
	if (document.getElementById(id)) return;
	const st = document.createElement('style');
	st.id = id;
	st.textContent = `.${cls} { outline: 3px solid #ffd27a !important; outline-offset: 2px !important;
		box-shadow: 0 0 0 6px rgba(255, 210, 122, .28) !important; }`;
	document.head.appendChild(st);
}

const DIRS = { up: [0, -1], down: [0, 1], left: [-1, 0], right: [1, 0] };
const WINDOW_MIN = 400;

export function createFocusNav(opts = {}) {
	const o = { ringClass: 'focusnav-focus', pointer: false, hover: false, domFocus: true, scrollFallback: true, modals: [], ...opts };
	const MODALS = [...(o.modals || []), ...BASE_MODALS];
	let focused = null, lastRect = null, ringOn = false, typedInto = null;

	function openModal() {
		let best = null, bestZ = -Infinity;
		for (const sel of MODALS) for (const m of document.querySelectorAll(sel)) {
			if (m.closest('#osk') || !shown(m)) continue;
			if (!m.querySelector(STOP_SELECTOR) && !m.matches(STOP_SELECTOR)) continue;
			const z = +getComputedStyle(m).zIndex || 0;
			if (z >= bestZ) { bestZ = z; best = m; }
		}
		return best;
	}

	// `wide`: the whole page. Otherwise a long page (more than WINDOW_MIN stops: the news feed
	// has ~9,000 links) only looks at the stops within a few screens of the view (plus the
	// focused one) — checking every one's style made a key press take ~0.4 s; move() widens
	// the search when nothing is found that way.
	function candidates(wide) {
		const scope = o.scope ? o.scope() : null;
		if (o.scope && !scope) return [];
		let raw = [...(scope || document).querySelectorAll(STOP_SELECTOR)];
		const modal = scope ? null : openModal();
		if (!scope && !modal && !wide && raw.length > WINDOW_MIN) {
			const lo = -2 * innerHeight, hi = 3 * innerHeight;
			raw = raw.filter(el => { if (el === focused) return true; const r = el.getBoundingClientRect(); return r.bottom > lo && r.top < hi; });
		}
		const all = raw.filter(el => shown(el) && !el.closest('#osk'));
		if (scope) return all;
		if (modal) return all.filter(el => modal.contains(el));
		const overlayOf = overlayFinder();
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
		if (!el || !o.hover) return;
		const r = el.getBoundingClientRect(), c = center(r);
		const init = { bubbles: true, clientX: c.x, clientY: c.y, pointerType: 'mouse' };
		const names = on ? ['pointerover', 'pointerenter', 'mouseover', 'mouseenter', 'pointermove', 'mousemove'] : ['pointerout', 'pointerleave', 'mouseout', 'mouseleave'];
		for (const n of names) {
			const bubbles = !/enter|leave/.test(n);
			el.dispatchEvent(n.startsWith('pointer') ? new PointerEvent(n, { ...init, bubbles }) : new MouseEvent(n, { ...init, bubbles }));
		}
	}
	function setFocus(el) {
		if (el === focused) { if (el && !ringOn) showRing(); return; }
		if (focused) { focused.classList.remove(o.ringClass); hover(focused, false); }
		focused = el;
		if (!el) return;
		injectStyle(o.ringClass);
		el.classList.add(o.ringClass);
		ringOn = true;
		try { el.scrollIntoView({ block: 'nearest', inline: 'nearest' }); } catch (e) {}
		// the real focus too (screen readers, the page's :focus-visible ring, native
		// Space) — never a text field: that would swallow the arrows (isTyping)
		if (o.domFocus && !isTextField(el) && el.tagName !== 'SELECT' && typeof el.focus === 'function') {
			try { el.focus({ preventScroll: true }); } catch (e) {}
		}
		lastRect = el.getBoundingClientRect();
		hover(el, true);
	}
	function showRing() { if (focused && focused.isConnected) { injectStyle(o.ringClass); focused.classList.add(o.ringClass); ringOn = true; } }
	function hideRing() { ringOn = false; if (focused) focused.classList.remove(o.ringClass); }
	// Is focus still on a live stop? 'same' = yes. Otherwise the page changed under
	// it (a new modal, a re-render): land on whatever took its place and return
	// 'moved' — the caller then only SHOWS the new focus, so a press never acts on
	// an element the player hasn't seen highlighted.
	function ensureFocus(list) {
		if (focused && focused.isConnected && list.includes(focused)) { lastRect = focused.getBoundingClientRect(); return 'same'; }
		if (focused) focused.classList.remove(o.ringClass);
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
		return list.find(el => el.autofocus || el.classList.contains('primary') || el.hasAttribute('data-focusnav-first')) ||
			list.slice().sort((a, b) => { const ra = a.getBoundingClientRect(), rb = b.getBoundingClientRect(); return (ra.top - rb.top) || (ra.left - rb.left); })[0];
	}

	// returns true when it moved (or showed) focus
	function move(dir) {
		const list = candidates();
		const st = ensureFocus(list);
		if (st !== 'same') return !!st;       // first press (or a changed page): just show focus
		const [dx, dy] = DIRS[dir];
		const c0 = center(focused.getBoundingClientRect());
		const pick = stops => {
			let best = null, bestScore = Infinity;
			for (const el of stops) {
				if (el === focused) continue;
				const c = center(el.getBoundingClientRect());
				const along = (c.x - c0.x) * dx + (c.y - c0.y) * dy;       // distance in the pressed direction
				if (along <= 2) continue;
				const across = Math.abs((c.x - c0.x) * dy) + Math.abs((c.y - c0.y) * dx);
				const score = along + across * 2.2;
				if (score < bestScore) { bestScore = score; best = el; }
			}
			return best;
		};
		let best = pick(list);
		if (!best) { const all = candidates(true); if (all.length !== list.length) best = pick(all); }   // a long page: look further
		if (best) { setFocus(best); return true; }
		return false;
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
	async function activate(info = {}) {
		const list = candidates();
		if (ensureFocus(list) !== 'same') return;       // first press only shows where you are
		const el = focused;
		const tag = el.tagName;
		if (isTextField(el)) {
			if (info.source === 'key') {
				// a keyboard: just type there (Esc / Tab leaves the field)
				typedInto = el;
				try { el.focus(); } catch (e) {}
				return;
			}
			// a controller: the on-screen keyboard, then the events a typist fires
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
		if (o.pointer) clickLike(el); else el.click();
		// the click may have re-rendered or closed things: re-home focus next frame, so
		// the player sees where it went (and the next press acts on what they see)
		requestAnimationFrame(() => { if (ringOn) ensureFocus(candidates()); });
	}
	const key = k => { const t = document.activeElement && document.activeElement !== document.body ? document.activeElement : window;
		t.dispatchEvent(new KeyboardEvent('keydown', { key: k, code: k === 'Escape' ? 'Escape' : k === ' ' ? 'Space' : k, bubbles: true, cancelable: true })); };

	// one logical action; returns true when it was used (the keyboard layer then
	// prevents the key's default, e.g. the page scrolling on an arrow)
	function onAction(action, info = {}) {
		if (oskOpen()) return false;                    // the on-screen keyboard runs its own pad
		if (o.guard && o.guard()) return false;
		// back from the mouse: show the ring again where focus was
		if (!ringOn && focused && focused.isConnected) showRing();
		if (DIRS[action]) {
			if (move(action)) return true;
			// nothing further that way on a long page: scroll it instead (WASD has no native scroll)
			if (o.scrollFallback && !o.scope && (action === 'up' || action === 'down') && !openModal()) { scrollBy(0, action === 'up' ? -160 : 160); return true; }
			return true;
		}
		if (action === 'confirm') { activate(info); return true; }
		if (action === 'cancel') { if (o.onCancel) o.onCancel(info); else key('Escape'); return true; }
		if (action === 'prev') { key('ArrowLeft'); return true; }
		if (action === 'next') { key('ArrowRight'); return true; }
		if (action === 'menu') { if (o.onMenu) o.onMenu(info); else activate(info); return true; }
		return false;
	}

	// Tab moves the real focus: follow it, so arrows continue from where Tab left you
	const onFocusIn = e => {
		const el = e.target;
		if (!o.domFocus || !el || el === focused || !el.matches || !el.matches(STOP_SELECTOR)) return;
		if (o.scope) { const s = o.scope(); if (!s || !s.contains(el)) return; }
		if (focused) { focused.classList.remove(o.ringClass); hover(focused, false); }
		focused = el; lastRect = el.getBoundingClientRect();
		if (ringOn) { injectStyle(o.ringClass); el.classList.add(o.ringClass); }
	};
	// the mouse takes over: hide the ring (focus is kept for the next key / pad press)
	const onPointer = e => { if (ringOn && e.isTrusted) hideRing(); };
	// Esc in a text field the keyboard entered: leave the field (back to arrow navigation)
	const onEsc = e => {
		if (e.key !== 'Escape' || !e.isTrusted || !typedInto || document.activeElement !== typedInto) { if (typedInto && document.activeElement !== typedInto) typedInto = null; return; }
		e.preventDefault(); e.stopPropagation(); typedInto.blur(); typedInto = null; showRing();
	};
	document.addEventListener('focusin', onFocusIn);
	addEventListener('pointermove', onPointer, { passive: true });
	addEventListener('keydown', onEsc, true);

	return {
		onAction, move, activate, candidates, openModal, ensureFocus, showRing, hideRing,
		get focused() { return focused; },
		get ringOn() { return ringOn; },
		focusTo: setFocus,
		// a pad was unplugged: drop the ring and the hover it was showing (focus is kept)
		dropRing() { if (!ringOn) return; ringOn = false; if (focused) { focused.classList.remove(o.ringClass); hover(focused, false); } },
		destroy() {
			if (focused) { focused.classList.remove(o.ringClass); hover(focused, false); }
			focused = null;
			document.removeEventListener('focusin', onFocusIn);
			removeEventListener('pointermove', onPointer);
			removeEventListener('keydown', onEsc, true);
		},
	};
}

// A plain page: keyboard (arrows / WASD / Z X C V Q E Enter) and controller both
// drive one navigator. Returns { nav, input }. Pass keyboard:false or pad:false
// to leave one source to the page. `own` lists keys the page keeps for itself.
let pageNav = null;
export function initFocusNav(opts = {}) {
	if (pageNav || typeof window === 'undefined') return pageNav;
	const nav = createFocusNav(opts);
	const keyboard = opts.keyboard !== false, pad = opts.pad !== false;
	let lastSource = null;
	const input = startInput({
		own: opts.own,
		pad,
		onAction: (a, info) => {
			if (!keyboard && info.source === 'key') return false;
			lastSource = info.source;
			return nav.onAction(a, info);
		},
		// the last pad unplugged: drop the ring it was showing (focus is kept)
		onFrame: p => { if (lastSource === 'pad' && !p.connected() && nav.ringOn) nav.dropRing(); },
	});
	pageNav = { nav, input };
	window.__focusnav = nav;
	return pageNav;
}
export { isTyping };
