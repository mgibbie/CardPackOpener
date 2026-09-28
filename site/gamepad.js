// site/gamepad.js — the shared controller core (Plans/CONTROLLER_SUPPORT_PLAN.md, Phase 0).
//
// Turns the browser Gamepad API's raw state into LOGICAL actions, so every
// surface (overworld, Pokémon battles, Battlecards) speaks the same small
// vocabulary and remapping / the Nintendo A-B swap happen in one place:
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

// W3C "standard" mapping: button index -> logical action
const BUTTONS = {
	0: 'confirm',    // A / ✕ / B(Nintendo, bottom)
	1: 'cancel',     // B / ○
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
	swapAB: false,         // Nintendo layout: the right face button confirms
};

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

	const held = new Set();          // logical actions currently down
	const latched = new Set();       // released by force; wait for a physical release
	const since = new Map();         // action -> ms it went down
	const lastRepeat = new Map();    // direction -> ms of its last repeat
	let known = new Map();           // pad index -> id
	let kind = null;

	// the logical actions the pads are asserting right now (all pads merged)
	function sample() {
		const now = new Set();
		const pads = [...(readPads() || [])].filter(Boolean);
		const seen = new Map();
		for (const p of pads) {
			if (p.connected === false) continue;
			seen.set(p.index ?? seen.size, p.id || '');
			(p.buttons || []).forEach((b, i) => {
				let a = BUTTONS[i];
				if (!a || !pressed(b)) return;
				if (o.swapAB && (a === 'confirm' || a === 'cancel')) a = a === 'confirm' ? 'cancel' : 'confirm';
				now.add(a);
			});
			const dir = stickDirection(p.axes?.[0], p.axes?.[1], o.deadzone);
			if (dir) now.add(dir);
		}
		return { now, seen };
	}

	function release(a, forced) {
		if (!held.has(a)) return;
		held.delete(a); since.delete(a); lastRepeat.delete(a);
		if (forced) latched.add(a);
		onRelease(a, { forced: !!forced });
	}

	const api = {
		poll(t) {
			const { now, seen } = sample();
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
	const pad = createGamepad({ ...opts, readPads });
	let raf = 0, running = true;
	const frame = t => { if (!running) return; pad.poll(t); raf = requestAnimationFrame(frame); };
	raf = requestAnimationFrame(frame);
	const letGo = () => pad.releaseAll();
	const onVis = () => { if (document.hidden) pad.releaseAll(); };
	addEventListener('blur', letGo);
	document.addEventListener('visibilitychange', onVis);
	addEventListener('gamepaddisconnected', letGo);
	return Object.assign(pad, {
		stop() {
			running = false; cancelAnimationFrame(raf);
			removeEventListener('blur', letGo);
			document.removeEventListener('visibilitychange', onVis);
			removeEventListener('gamepaddisconnected', letGo);
			pad.releaseAll();
		},
	});
}
