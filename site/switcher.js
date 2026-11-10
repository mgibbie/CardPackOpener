// site/switcher.js — the Games switcher (controls sweep B2): one overlay, on every
// page, listing Home and every game, reachable with no mouse.
//
// OPENS WITH
//   keyboard   ` (Backquote), or HOLD Esc ~0.6 s. A quick Esc tap keeps the page's
//              own meaning: the tap is held back until the key comes up, then
//              replayed to the page (a synthetic keydown + keyup Escape).
//   controller Start + Select pressed together (alone, each keeps its game meaning).
//   touch      the ⚙️ in the top bar (site/topbar.js calls openSwitcher()).
// Nothing opens it while typing in a field (site/input.js isTyping).
//
// While open it takes the input exclusively: keys are caught in the CAPTURE phase
// on window (no game handler sees them), every controller poller is paused
// (site/gamepad.js pausePads), and input.js surfaces are suspended. The overlay is
// aria-modal. Arrows / WASD / d-pad move, Z / Enter / Space / A pick, X / Esc /
// ` / B close; tap works too, and tapping outside the panel closes it.
//
// LEAVING SAFELY — each game declares its leave state on window:
//   window.mpLeaveGuard = () => ({
//     state: 'safe' | 'confirm' | 'block',   // default 'safe'
//     message: 'Leaving counts as a loss.',  // shown for confirm / block
//     beforeLeave: async () => { ... },      // runs (max ~4 s) before navigating
//   });
// 'block' stops the switcher from opening at all (a cutscene); its message is
// shown as a toast. 'confirm' asks "Leave?" with the message when a destination
// is picked. The page also gets window events 'mp-switcher-open' and
// 'mp-switcher-close' (pause a real-time game while the overlay is up).
import { actionForKey, isTyping, suspendInput } from './input.js';
import { createGamepad, loadPadSettings } from './gamepad.js';
import { createFocusNav } from './focusnav.js';

export const HOLD_ESC_MS = 600;

// Home first, then the games (the main page's Play grid), then the extras
export const ENTRIES = [
	{ id: 'home', name: 'Home', icon: '🏠', href: '/' },
	{ id: 'battlecards', name: 'Battlecards', icon: '🃏', href: '/battlecards/start.html' },
	{ id: 'overworld', name: 'Overworld', icon: '🗺️', href: '/overworld/' },
	{ id: 'pokechess', name: 'PokéChess', icon: '♟️', href: '/overworld/pokechess.html' },
	{ id: 'factory', name: 'Battle Factory', icon: '🏭', href: '/overworld/?factory=1' },
	{ id: 'micatro', name: 'Micatro', icon: '🂡', href: '/micatro/' },
	{ id: 'micasurvivor', name: 'MicaSurvivor', icon: '🔥', href: '/micasurvivor/' },
	{ id: 'pairofpears', name: 'Pair of Pears', icon: '🍐', href: '/pairofpears/' },
	{ id: 'scoundrel', name: 'Scoundrel', icon: '🗡️', href: '/scoundrel/' },
	{ id: 'collection', name: 'Collection', icon: '📚', href: '/collection/', extra: true },
	{ id: 'designwiki', name: 'Wiki', icon: '📖', href: '/designwiki/', extra: true },
	{ id: 'news', name: 'News', icon: '📰', href: '/magepunknews/', extra: true },
	{ id: 'bugs', name: 'Report a bug', icon: '🐞', href: '/bugs/', extra: true },
];

// which entry is this page? (null: none of them)
export function currentEntry(loc = location) {
	const p = loc.pathname.replace(/index\.html$/, ''), q = new URLSearchParams(loc.search);
	if (p === '/') return 'home';
	if (p.startsWith('/overworld/pokechess')) return 'pokechess';
	if (p.startsWith('/overworld/')) return q.has('factory') ? 'factory' : 'overworld';
	if (p.startsWith('/battlecards/')) return 'battlecards';
	if (p.startsWith('/magepunknews/')) return 'news';
	for (const e of ENTRIES) if (e.href !== '/' && p.startsWith(e.href)) return e.id;
	return null;
}

const leaveState = () => {
	let g = null;
	try { g = typeof window.mpLeaveGuard === 'function' ? window.mpLeaveGuard() : null; } catch (e) { console.warn('[switcher] mpLeaveGuard failed', e); }
	const state = g && (g.state === 'confirm' || g.state === 'block') ? g.state : 'safe';
	return { state, message: (g && g.message) || '', beforeLeave: g && typeof g.beforeLeave === 'function' ? g.beforeLeave : null };
};

function injectStyle() {
	if (document.getElementById('mpsw-style')) return;
	const st = document.createElement('style');
	st.id = 'mpsw-style';
	st.textContent = `
	@font-face { font-family: 'mpsw-m6x11'; src: url('/micatro/assets/fonts/m6x11plus.ttf?v=2') format('truetype'); font-display: swap; }
	#mpsw { position: fixed; inset: 0; z-index: 2147483000; display: grid; place-items: center; padding: max(10px, env(safe-area-inset-top)) 10px max(10px, env(safe-area-inset-bottom));
		background: rgba(14, 22, 24, .72); backdrop-filter: blur(3px); font-family: 'mpsw-m6x11', 'Courier New', monospace; color: #fff; -webkit-tap-highlight-color: transparent; }
	#mpsw .mpsw-panel { width: min(760px, 100%); max-height: 100%; overflow: auto; overscroll-behavior: contain; box-sizing: border-box; padding: 16px 16px 12px; border-radius: 18px;
		background: #3a4b4f; box-shadow: 0 8px 0 #1f2a2c, inset 0 0 0 3px #46595d; }
	#mpsw .mpsw-head { display: flex; align-items: center; justify-content: space-between; gap: 10px; margin: 0 0 10px; }
	#mpsw h2 { margin: 0; font: inherit; font-size: 34px; line-height: 1; letter-spacing: 1px; text-shadow: 0 3px 0 rgba(0,0,0,.35); }
	#mpsw .mpsw-grid { display: grid; grid-template-columns: repeat(auto-fill, minmax(150px, 1fr)); gap: 10px 10px; }
	#mpsw .mpsw-grid.extra { margin-top: 12px; grid-template-columns: repeat(auto-fill, minmax(120px, 1fr)); }
	#mpsw .mpsw-btn { --b: #5f7377; --bd: #435357; position: relative; display: flex; align-items: center; gap: 10px; min-height: 58px; padding: 8px 12px; box-sizing: border-box;
		font: inherit; font-size: 24px; line-height: 1; color: #fff; text-align: left; background: var(--b); border: 0; border-radius: 12px; box-shadow: 0 6px 0 var(--bd);
		text-shadow: 0 2px 0 rgba(0,0,0,.3); cursor: pointer; margin-bottom: 6px; touch-action: manipulation; }
	#mpsw .mpsw-btn .ic { font-size: 26px; font-family: system-ui, 'Segoe UI Emoji', sans-serif; text-shadow: none; }
	#mpsw .mpsw-btn.home { --b: #009dff; --bd: #0076c2; }
	#mpsw .mpsw-btn.here { --b: #fda200; --bd: #c27c00; }
	#mpsw .mpsw-btn.extra { min-height: 46px; font-size: 20px; }
	#mpsw .mpsw-btn .tag { position: absolute; right: 8px; top: 4px; font-size: 14px; opacity: .9; }
	#mpsw .mpsw-btn:hover { filter: brightness(1.1); }
	#mpsw .mpsw-btn:active { transform: translateY(4px); box-shadow: 0 2px 0 var(--bd); }
	#mpsw .mpsw-btn.red { --b: #fe5f55; --bd: #c0453d; }
	#mpsw .mpsw-btn.close { min-height: 40px; font-size: 20px; padding: 6px 12px; }
	#mpsw .mpsw-focus { outline: 4px solid #ffd27a; outline-offset: 3px; }
	#mpsw .mpsw-btn:focus-visible { outline: 4px solid #ffd27a; outline-offset: 3px; }
	#mpsw .mpsw-hint { margin: 10px 2px 0; font-size: 17px; color: #c9d6d8; line-height: 1.25; }
	#mpsw .mpsw-confirm p { font-size: 24px; line-height: 1.25; margin: 6px 0 14px; }
	#mpsw .mpsw-row { display: flex; gap: 10px; flex-wrap: wrap; }
	#mpsw .mpsw-row .mpsw-btn { flex: 1 1 160px; justify-content: center; }
	@media (max-width: 520px) { #mpsw .mpsw-grid { grid-template-columns: repeat(2, 1fr); } #mpsw .mpsw-btn { font-size: 20px; min-height: 50px; } #mpsw h2 { font-size: 28px; } }
	@media (max-height: 460px) { #mpsw .mpsw-grid { grid-template-columns: repeat(auto-fill, minmax(140px, 1fr)); gap: 6px; } #mpsw .mpsw-btn { min-height: 42px; font-size: 17px; margin-bottom: 4px; gap: 7px; padding: 6px 9px; } #mpsw .mpsw-hint { display: none; } }
	#mpsw-toast { position: fixed; left: 50%; bottom: max(24px, env(safe-area-inset-bottom)); transform: translateX(-50%); z-index: 2147483001; padding: 10px 16px; border-radius: 12px;
		background: #3a4b4f; box-shadow: 0 6px 0 #1f2a2c; color: #fff; font: 20px 'mpsw-m6x11', 'Courier New', monospace; max-width: 90vw; text-align: center; pointer-events: none; }
	`;
	document.head.appendChild(st);
}

const h = (tag, cls, text) => { const e = document.createElement(tag); if (cls) e.className = cls; if (text != null) e.textContent = text; return e; };

let root = null, nav = null, resume = null, prevFocus = null, busy = false;
export const isSwitcherOpen = () => !!root;

function toast(msg) {
	injectStyle();
	let t = document.getElementById('mpsw-toast');
	if (!t) { t = h('div'); t.id = 'mpsw-toast'; t.setAttribute('role', 'status'); document.body.appendChild(t); }
	t.textContent = msg;
	clearTimeout(toast.timer);
	toast.timer = setTimeout(() => t.remove(), 2600);
}

function entryButton(e, here) {
	const b = h('button', 'mpsw-btn' + (e.id === 'home' ? ' home' : '') + (e.extra ? ' extra' : '') + (here ? ' here' : ''));
	b.type = 'button';
	b.dataset.entry = e.id;
	b.appendChild(h('span', 'ic', e.icon));
	b.appendChild(h('span', 'nm', e.name));
	if (here) b.appendChild(h('span', 'tag', 'here'));
	b.addEventListener('click', () => pick(e));
	return b;
}

function renderList() {
	const panel = root.querySelector('.mpsw-panel');
	panel.replaceChildren();
	const head = h('div', 'mpsw-head');
	const title = h('h2', null, 'Games'); title.id = 'mpsw-title';
	const close = h('button', 'mpsw-btn close', '✕'); close.type = 'button'; close.setAttribute('aria-label', 'Close'); close.dataset.entry = 'close';
	close.addEventListener('click', () => closeSwitcher());
	head.append(title, close);
	const here = currentEntry();
	const grid = h('div', 'mpsw-grid'), extra = h('div', 'mpsw-grid extra');
	for (const e of ENTRIES) (e.extra ? extra : grid).appendChild(entryButton(e, e.id === here));
	const hint = h('p', 'mpsw-hint', 'Arrows / WASD / d-pad move · Z / Enter / A open · X / Esc / B close');
	panel.append(head, grid, extra, hint);
	focusFirst(grid.querySelector('[data-entry="home"]'));
}

function focusFirst(el) {
	requestAnimationFrame(() => { if (nav && el && el.isConnected) nav.focusTo(el); });
	if (nav && el) nav.focusTo(el);
}

function renderConfirm(e, g) {
	const panel = root.querySelector('.mpsw-panel');
	panel.replaceChildren();
	const head = h('div', 'mpsw-head');
	const title = h('h2', null, 'Leave?'); title.id = 'mpsw-title';
	head.appendChild(title);
	const box = h('div', 'mpsw-confirm');
	box.appendChild(h('p', null, g.message || 'Leave this game?'));
	const row = h('div', 'mpsw-row');
	const go = h('button', 'mpsw-btn red', `Leave → ${e.name}`); go.type = 'button'; go.dataset.entry = 'leave';
	const stay = h('button', 'mpsw-btn', 'Stay'); stay.type = 'button'; stay.dataset.entry = 'stay';
	go.addEventListener('click', () => leave(e, g));
	stay.addEventListener('click', () => renderList());
	row.append(stay, go);
	box.appendChild(row);
	panel.append(head, box);
	focusFirst(stay);
}

async function leave(e, g) {
	if (busy) return;
	busy = true;
	try {
		if (g && g.beforeLeave) await Promise.race([Promise.resolve().then(() => g.beforeLeave()), new Promise(r => setTimeout(r, 4000))]);
	} catch (err) { console.warn('[switcher] beforeLeave failed', err); }
	window.__mpSwitcherLeaving = e.href;
	location.href = e.href;
	// (a same-page hash/href: nothing unloads, so let go of the input again)
	setTimeout(() => { busy = false; if (location.href.endsWith(e.href)) closeSwitcher(); }, 1500);
}

function pick(e) {
	if (!root || busy) return;
	if (e.id === currentEntry() && e.id !== 'home') { closeSwitcher(); return; }
	if (e.id === 'home' && currentEntry() === 'home') { closeSwitcher(); return; }
	const g = leaveState();
	if (g.state === 'block') { toast(g.message || 'You can\'t leave right now.'); return; }
	if (g.state === 'confirm') { renderConfirm(e, g); return; }
	leave(e, g);
}

export function openSwitcher() {
	if (root) return true;
	const g = leaveState();
	if (g.state === 'block') { toast(g.message || 'You can\'t switch games right now.'); return false; }
	injectStyle();
	prevFocus = document.activeElement;
	root = h('div');
	root.id = 'mpsw';
	root.setAttribute('role', 'dialog');
	root.setAttribute('aria-modal', 'true');
	root.setAttribute('aria-labelledby', 'mpsw-title');
	const panel = h('div', 'mpsw-panel');
	root.appendChild(panel);
	// tap the dim veil (not the panel): close
	root.addEventListener('pointerdown', ev => { if (ev.target === root) { ev.preventDefault(); closeSwitcher(); } });
	document.body.appendChild(root);
	resume = suspendInput('games-switcher');
	nav = createFocusNav({ scope: () => root && root.querySelector('.mpsw-panel'), ringClass: 'mpsw-focus', domFocus: true, scrollFallback: false });
	renderList();
	try { window.dispatchEvent(new CustomEvent('mp-switcher-open')); } catch (e) {}
	return true;
}

export function closeSwitcher() {
	if (!root) return;
	if (nav) nav.destroy();
	nav = null;
	root.remove();
	root = null;
	busy = false;
	if (resume) resume();
	resume = null;
	try { if (prevFocus && prevFocus.isConnected && typeof prevFocus.focus === 'function') prevFocus.focus({ preventScroll: true }); } catch (e) {}
	prevFocus = null;
	try { window.dispatchEvent(new CustomEvent('mp-switcher-close')); } catch (e) {}
}
export const toggleSwitcher = () => (root ? (closeSwitcher(), false) : openSwitcher());

// ---------- input while open ----------
function act(action, info) {
	if (!root || !nav) return;
	if (action === 'cancel') {
		// on the confirm screen, back goes to the list; on the list it closes
		if (root.querySelector('.mpsw-confirm')) renderList(); else closeSwitcher();
		return;
	}
	if (action === 'menu' || action === 'confirm') { nav.activate({ ...info, source: info && info.source === 'key' ? 'key' : 'pad' }); return; }
	if (action === 'up' || action === 'down' || action === 'left' || action === 'right') nav.move(action);
}

// ---------- the triggers (installed once per page) ----------
function install() {
	if (window.__mpSwitcher) return;
	let escTimer = 0, escDown = null;
	const swallow = e => { e.preventDefault(); e.stopImmediatePropagation(); };
	const replayEsc = target => {
		const t = target && target.isConnected ? target : (document.activeElement || window);
		for (const type of ['keydown', 'keyup']) t.dispatchEvent(new KeyboardEvent(type, { key: 'Escape', code: 'Escape', keyCode: 27, which: 27, bubbles: true, cancelable: true, composed: true }));
	};
	addEventListener('keydown', e => {
		if (!e.isTrusted) return;                      // our own replayed Esc, a game's synthetic keys
		if (root) {
			swallow(e);
			if (e.code === 'Backquote' || e.key === 'Escape') { if (!e.repeat) closeSwitcher(); return; }
			if (e.key === 'Tab') { nav && nav.move(e.shiftKey ? 'left' : 'right'); return; }
			if (e.key === ' ' || e.code === 'Space') { if (!e.repeat) act('confirm', { source: 'key' }); return; }
			const a = actionForKey(e);
			if (!a) return;
			if (e.repeat && !/^(up|down|left|right)$/.test(a)) return;
			act(a, { source: 'key', repeat: e.repeat });
			return;
		}
		if (e.ctrlKey || e.metaKey || e.altKey) return;
		if (isTyping(e.target && e.target.tagName ? e.target : undefined)) return;
		if (e.code === 'Backquote' || (!e.code && e.key === '`')) { swallow(e); if (!e.repeat) openSwitcher(); return; }
		if (e.key === 'Escape') {
			// a capture-phase handler that ran before this one already used the Esc (it
			// prevented the default: Battlecards' card reader / log drawer): the tap is theirs
			if (e.defaultPrevented) return;
			swallow(e);
			if (e.repeat || escDown) return;             // held: the timer is already running
			escDown = { target: e.target };
			escTimer = setTimeout(() => { escTimer = 0; openSwitcher(); }, HOLD_ESC_MS);
		}
	}, true);
	addEventListener('keyup', e => {
		if (!e.isTrusted) return;
		if (e.key === 'Escape' && escDown) {
			swallow(e);
			const d = escDown; escDown = null;
			if (escTimer) { clearTimeout(escTimer); escTimer = 0; replayEsc(d.target); }   // a quick tap: the page's own Esc
			return;
		}
		if (root) swallow(e);
	}, true);
	addEventListener('blur', () => { if (escTimer) { clearTimeout(escTimer); escTimer = 0; } escDown = null; });

	// any [data-mp-switcher] (the top bar's ⚙️, a game's own Games button) opens the
	// switcher; a modified / middle click keeps the link's own meaning (a new tab home)
	document.addEventListener('click', e => {
		const el = e.target && e.target.closest ? e.target.closest('[data-mp-switcher]') : null;
		if (!el || e.button !== 0 || e.ctrlKey || e.metaKey || e.shiftKey || e.altKey) return;
		e.preventDefault();
		e.stopPropagation();
		openSwitcher();
	});

	// the controller: Start + Select together opens; while open, it drives the overlay
	// (exclusive: it runs while every game poller is paused)
	// (a TIMER, not requestAnimationFrame: the games own the frame loop — some tests freeze
	// rAF and hold a single pending frame, and a second rAF loop would steal it)
	const nav0 = typeof navigator !== 'undefined' ? navigator : null;
	const readPads = window.__owFakePads ? () => window.__owFakePads : () => (nav0 && nav0.getGamepads ? [...nav0.getGamepads()] : []);
	const pad = createGamepad({
		readPads,
		exclusive: true,
		...(() => { const v = loadPadSettings(); return { layout: v.layout, remap: v.remap }; })(),
		onPress: (a, info) => {
			if (root) { if ((a === 'menu' || a === 'select') && pad.held('menu') && pad.held('select')) return; act(a, { ...info, source: 'pad' }); return; }
			if ((a === 'menu' && pad.held('select')) || (a === 'select' && pad.held('menu'))) openSwitcher();
		},
	});
	setInterval(() => { if (!document.hidden) pad.poll(performance.now()); }, 20);
	addEventListener('blur', () => pad.releaseAll());
	window.__mpSwitcher = { open: openSwitcher, close: closeSwitcher, toggle: toggleSwitcher, isOpen: isSwitcherOpen, get nav() { return nav; }, ENTRIES, currentEntry };
}
if (typeof window !== 'undefined' && typeof document !== 'undefined') install();
