// site/gamepad.js — the shared controller core (Plans/CONTROLLER_SUPPORT_PLAN.md, Phase 0).
//
// Turns the browser Gamepad API's raw state into LOGICAL actions, so every
// surface (overworld, Pokémon battles, Battlecards) speaks the same small
// vocabulary and remapping / the button layout happen in one place:
//
//   confirm cancel context secondary prev next select menu   (face / shoulder / meta)
//   up down left right                                       (d-pad OR left stick)
//
// The core never touches the page by itself. `createGamepad()` is pure: feed it
// a `readPads()` and call `poll(now)` once a frame. Tests pass a fake readPads,
// since headless Chrome has no controllers. `startGamepad()` is the browser
// wiring (requestAnimationFrame + blur/visibility), used by the surfaces.
//
// Edges, not levels: onPress fires once per physical press, onRelease once per
// release. Directions also REPEAT while held (menus scroll), marked repeat:true.
// A release forced by blur/visibility/disconnect LATCHES the button: it must be
// physically let go before it can press again, so returning to the tab with the
// stick still pushed does not fire a surprise step.

// W3C "standard" mapping, by POSITION: button index -> logical action. Face
// buttons 0/1 are the bottom/right ones; which of them confirms is the LAYOUT.
const BUTTONS = {
	0: 'confirm',    // bottom face: Xbox A, PlayStation ✕, Nintendo B
	1: 'cancel',     // right face:  Xbox B, PlayStation ○, Nintendo A
	2: 'context',    // X / □
	3: 'secondary',  // Y / △
	4: 'prev',       // LB / L1
	5: 'next',       // RB / R1
	8: 'select',     // View / Back / Share
	9: 'menu',       // Menu / Start / Options
	12: 'up', 13: 'down', 14: 'left', 15: 'right',
};
export const ACTIONS = [...new Set(Object.values(BUTTONS))];
export const DIRECTIONS = ['up', 'down', 'left', 'right'];

export const DEFAULTS = {
	deadzone: 0.35,        // radial, on the left stick
	repeatDelay: 250,      // ms before a held direction starts repeating
	repeatInterval: 90,    // ms between repeats
	// 'nintendo' (the owner's standard): the RIGHT face button confirms and the
	// bottom one cancels, as on a Switch / SNES / GBA. 'xbox': bottom confirms.
	layout: 'nintendo',
};

// ---------- player settings (Phase 5) ----------
// One store for every surface: the overworld's OPTIONS > CONTROLS writes it,
// Battlecards reads it. `remap` is a full button-index -> action table (only
// the face / shoulder / meta buttons; the d-pad and stick always move).
export const PAD_SETTINGS_KEY = 'magepunk_pad_v1';
export const REMAPPABLE = [0, 1, 2, 3, 4, 5, 8, 9];
export function loadPadSettings() {
	try {
		const v = JSON.parse(localStorage.getItem(PAD_SETTINGS_KEY) || 'null') || {};
		return { layout: v.layout === 'xbox' ? 'xbox' : 'nintendo', rumble: v.rumble === true, remap: v.remap && typeof v.remap === 'object' ? v.remap : null };
	} catch (e) { return { layout: 'nintendo', rumble: false, remap: null }; }
}
export function savePadSettings(v) {
	try { localStorage.setItem(PAD_SETTINGS_KEY, JSON.stringify(v)); } catch (e) {}
}
// the action a physical button performs under these settings
export function actionAt(i, o = DEFAULTS) {
	if (o.remap && Object.prototype.hasOwnProperty.call(o.remap, i)) return o.remap[i] || null;
	let a = BUTTONS[i] || null;
	if (o.layout === 'nintendo' && (a === 'confirm' || a === 'cancel')) a = a === 'confirm' ? 'cancel' : 'confirm';
	return a;
}
export function effectiveTable(o = DEFAULTS) {
	const t = {}; for (const i of REMAPPABLE) t[i] = actionAt(i, o); return t;
}
// put `action` on button `index`; whatever button had it takes index's old action
// (a swap, so no action can be orphaned)
export function remapButton(o, index, action) {
	const t = effectiveTable(o);
	const from = Object.keys(t).find(k => t[k] === action);
	if (from != null && +from !== index) t[from] = t[index];
	t[index] = action;
	return t;
}
// what to call a button, by the family of the pad in your hands
const NAMES = {
	xbox: { 0: 'A', 1: 'B', 2: 'X', 3: 'Y', 4: 'LB', 5: 'RB', 8: 'View', 9: 'Menu' },
	playstation: { 0: '✕', 1: '○', 2: '□', 3: '△', 4: 'L1', 5: 'R1', 8: 'Create', 9: 'Options' },
	switch: { 0: 'B', 1: 'A', 2: 'Y', 3: 'X', 4: 'L', 5: 'R', 8: '−', 9: '+' },
	generic: { 0: '⬇', 1: '➡', 2: '⬅', 3: '⬆', 4: 'L', 5: 'R', 8: 'Select', 9: 'Start' },
};
export function buttonName(index, kind = 'generic') { return (NAMES[kind] || NAMES.generic)[index] || '?'; }
export function buttonLabel(action, kind = 'generic', o = DEFAULTS) {
	if (DIRECTIONS.includes(action)) return 'D-pad';
	const t = effectiveTable(o);
	const i = Object.keys(t).find(k => t[k] === action);
	return i == null ? '—' : buttonName(+i, kind);
}
// A short rumble, only if the player turned it on (OPTIONS > CONTROLS). Every
// connected pad with a vibration actuator buzzes; a pad without one is ignored.
export function rumble(strength = 0.5, ms = 120) {
	if (!loadPadSettings().rumble) return false;
	const pads = (typeof window !== 'undefined' && window.__owFakePads) ? window.__owFakePads
		: (typeof navigator !== 'undefined' && navigator.getGamepads ? [...navigator.getGamepads()] : []);
	let buzzed = false;
	for (const p of pads) {
		const act = p && p.vibrationActuator;
		if (!act || typeof act.playEffect !== 'function') continue;
		const m = Math.max(0, Math.min(1, strength));
		try { act.playEffect('dual-rumble', { duration: ms, strongMagnitude: m, weakMagnitude: m * 0.6 }); buzzed = true; } catch (e) {}
	}
	return buzzed;
}

// what the pad calls itself -> which button labels to show (Phase 5)
export function controllerKind(id) {
	const s = String(id || '');
	if (/xbox|xinput|045e/i.test(s)) return 'xbox';
	if (/playstation|dualshock|dualsense|wireless controller|054c/i.test(s)) return 'playstation';
	if (/nintendo|switch|pro controller|joy-con|057e/i.test(s)) return 'switch';
	return 'generic';
}

const pressed = b => !!b && (typeof b === 'object' ? (b.pressed || b.value > 0.5) : b > 0.5);

// the left stick as one direction (or null), dominant axis wins, radial deadzone
export function stickDirection(x, y, deadzone = DEFAULTS.deadzone) {
	x = +x || 0; y = +y || 0;
	if (Math.hypot(x, y) < deadzone) return null;
	return Math.abs(x) >= Math.abs(y) ? (x > 0 ? 'right' : 'left') : (y > 0 ? 'down' : 'up');
}

export function createGamepad(opts = {}) {
	const o = { ...DEFAULTS, ...opts };
	const readPads = o.readPads || (() => []);
	const onPress = o.onPress || (() => {});
	const onRelease = o.onRelease || (() => {});
	const onConnect = o.onConnect || (() => {});
	const onDisconnect = o.onDisconnect || (() => {});
	const onButton = o.onButton || null;   // raw index presses (remap capture)
	let rawHeld = new Set();

	const held = new Set();          // logical actions currently down
	const latched = new Set();       // released by force; wait for a physical release
	const since = new Map();         // action -> ms it went down
	const lastRepeat = new Map();    // direction -> ms of its last repeat
	let known = new Map();           // pad index -> id
	let kind = null;

	// the logical actions the pads are asserting right now (all pads merged)
	function sample() {
		const now = new Set(), raw = new Set();
		const pads = [...(readPads() || [])].filter(Boolean);
		const seen = new Map();
		for (const p of pads) {
			if (p.connected === false) continue;
			seen.set(p.index ?? seen.size, p.id || '');
			(p.buttons || []).forEach((b, i) => {
				if (!pressed(b)) return;
				raw.add(i);
				const a = actionAt(i, o);
				if (a) now.add(a);
			});
			const dir = stickDirection(p.axes?.[0], p.axes?.[1], o.deadzone);
			if (dir) now.add(dir);
		}
		return { now, seen, raw };
	}

	function release(a, forced) {
		if (!held.has(a)) return;
		held.delete(a); since.delete(a); lastRepeat.delete(a);
		if (forced) latched.add(a);
		onRelease(a, { forced: !!forced });
	}

	const api = {
		poll(t) {
			const { now, seen, raw } = sample();
			if (onButton) for (const i of raw) if (!rawHeld.has(i)) onButton(i);
			rawHeld = raw;
			// connect / disconnect, by pad index
			for (const [i, id] of seen) if (!known.has(i)) { kind = controllerKind(id); onConnect({ index: i, id, kind }); }
			for (const [i, id] of known) if (!seen.has(i)) onDisconnect({ index: i, id });
			const lostAll = known.size > 0 && seen.size === 0;
			known = seen;
			if (lostAll) { api.releaseAll(); latched.clear(); return; }
			// a latched action unlatches once physically let go
			for (const a of [...latched]) if (!now.has(a)) latched.delete(a);
			for (const a of [...held]) if (!now.has(a)) release(a, false);
			for (const a of now) {
				if (latched.has(a)) continue;
				if (!held.has(a)) {
					held.add(a); since.set(a, t);
					onPress(a, { repeat: false });
				} else if (DIRECTIONS.includes(a)) {
					const down = since.get(a), last = lastRepeat.get(a);
					if (last == null ? t - down >= o.repeatDelay : t - last >= o.repeatInterval) {
						lastRepeat.set(a, t);
						onPress(a, { repeat: true });
					}
				}
			}
		},
		// blur / hidden tab / disconnect: let go of everything, and latch it
		releaseAll() { for (const a of [...held]) release(a, true); },
		held: a => held.has(a),
		// the direction to WALK in: the most recently pressed held direction
		direction() {
			let best = null, t = -Infinity;
			for (const d of DIRECTIONS) if (held.has(d) && since.get(d) > t) { best = d; t = since.get(d); }
			return best;
		},
		connected: () => known.size > 0,
		kind: () => kind,
		setOptions(next) { Object.assign(o, next); },
	};
	return api;
}

// ---------- browser wiring ----------
// One rAF poller for the page, released on blur/hidden. Returns the core (so a
// surface can ask held()/direction()) plus stop().
export function startGamepad(opts = {}) {
	const nav = typeof navigator !== 'undefined' ? navigator : null;
	const readPads = opts.readPads || (() => (nav && nav.getGamepads ? nav.getGamepads() : []));
	const saved = loadPadSettings();
	const pad = createGamepad({ layout: saved.layout, remap: saved.remap, ...opts, readPads });
	let raf = 0, running = true;
	// onFrame(pad) runs after every poll: a surface syncs continuous state
	// (the overworld's walk direction) from pad.direction() there
	const frame = t => { if (!running) return; pad.poll(t); if (opts.onFrame) opts.onFrame(pad); raf = requestAnimationFrame(frame); };
	raf = requestAnimationFrame(frame);
	const letGo = () => pad.releaseAll();
	const onVis = () => { if (document.hidden) pad.releaseAll(); };
	addEventListener('blur', letGo);
	document.addEventListener('visibilitychange', onVis);
	addEventListener('gamepaddisconnected', letGo);
	return Object.assign(pad, {
		// re-read OPTIONS > CONTROLS (the overworld calls this when they change)
		reloadSettings() { const v = loadPadSettings(); pad.setOptions({ layout: opts.layout || v.layout, remap: v.remap }); },
		stop() {
			running = false; cancelAnimationFrame(raf);
			removeEventListener('blur', letGo);
			document.removeEventListener('visibilitychange', onVis);
			removeEventListener('gamepaddisconnected', letGo);
			pad.releaseAll();
		},
	});
}
