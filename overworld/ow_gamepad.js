// ow_gamepad.js — controller play for the overworld and Pokémon battles
// (Plans/CONTROLLER_SUPPORT_PLAN.md, Phase 1). Signed-in players only.
//
// It adds no new input path. Exactly like the touch d-pad, it feeds the two
// entry points every other input already uses:
//   * walking: the pad's direction rides in `heldKeys` (its own slot, so a
//     keyboard keyup of the same arrow can't cancel a held stick);
//   * everything else: `pressKey(k)` with the keyboard's key names, so menus,
//     dialogs and battles never know a controller exists.
//
// Layout (Nintendo standard; site/gamepad.js):
//   right face  confirm (z)          bottom face  cancel (x), hold = run
//   Start       start menu (Enter)   Select       party (p)
//   left face   context (per screen) top face     bag (b) / per screen
//   LB / RB     per screen (paging, filters)
import { startGamepad } from '../site/gamepad.js';
import { heldKeys, typingInChat } from './ow_input.js';
import { menuBlocking, pressKey, pcMenu, shopMenu } from './ow_menukeys.js';
import { dexMenu, partyMenu, trainerCard } from './ow_menustate.js';
import { battle, hud } from './ow_core.js';
import { S } from './ow_state.js';
import { bgmKick } from './sound.js';

const ARROW = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
const BASE = { confirm: 'z', cancel: 'x', menu: 'Enter' };

// The letter-only shortcuts, on buttons: which key each extra button sends on
// the screen that is up. `null` = the button does nothing there.
export function contextKey(action) {
	if (battle.blocking) {
		// X/left face: RETHROW the last ball from the battle menu, SWAP moves on the move list
		if (action === 'context') return battle.active?.phase === 'moves' ? 's' : 'r';
		return null;
	}
	if (pcMenu.open) return { context: 's', secondary: 'Tab', select: 'r', prev: 'ArrowLeft', next: 'ArrowRight' }[action] || null;
	if (dexMenu.open) return { context: 't', secondary: 'f', select: 'g', prev: 'r', next: 'r' }[action] || null;
	if (trainerCard.open) return { context: 's', prev: 'ArrowLeft', next: 'ArrowRight' }[action] || null;
	if (shopMenu.open) return { secondary: 'Tab', prev: 'ArrowLeft', next: 'ArrowRight' }[action] || null;
	if (partyMenu.open) {
		if (partyMenu.summary) return { context: 'l', prev: 'ArrowLeft', next: 'ArrowRight' }[action] || null;
		if (!partyMenu.action) return { context: 't' }[action] || null;   // TAKE the held item
		return null;
	}
	if (menuBlocking()) return { prev: 'ArrowLeft', next: 'ArrowRight' }[action] || null;
	// roaming: bike, bag, party
	return { context: 'c', secondary: 'b', select: 'p' }[action] || null;
}

// the pad's own slot in heldKeys (mirrors main.js's dpadDir)
let padDir = null;
function setPadDir(dir) {
	if (dir !== padDir) {
		if (padDir) { const i = heldKeys.indexOf(padDir); if (i >= 0) heldKeys.splice(i, 1); }
		padDir = dir;
	}
	// re-assert every frame: a keyboard keyup of the same arrow removes it
	if (padDir && !heldKeys.includes(padDir)) heldKeys.unshift(padDir);
}

let soundAsked = false;
function wakeSound() {
	bgmKick().then(ok => {
		if (ok || soundAsked) return;
		soundAsked = true;   // browsers don't count a controller press as a gesture
		hud.textContent = 'Controller connected. Click or tap the game once to turn the sound on.';
	});
}

export function onPadPress(action, { repeat } = {}) {
	if (typingInChat()) return;
	if (!repeat) wakeSound();
	if (ARROW[action]) {
		// roaming, the stick walks via heldKeys (onPadFrame); in a menu it steps
		if (menuBlocking()) pressKey(ARROW[action]);
		return;
	}
	if (action === 'cancel') S.runHeld = true;      // hold B to run
	const k = BASE[action] || contextKey(action);
	if (k) pressKey(k);
}
export function onPadRelease(action) {
	if (action === 'cancel') S.runHeld = false;
}
export function onPadFrame(pad) {
	const free = !menuBlocking() && !typingInChat();
	setPadDir(free ? pad.direction() : null);
}

let pad = null;
// Called once the account is loaded. `hooks.onConnect/onDisconnect` let
// main.js swap the touch HUD out while a controller is in use.
export function initGamepad(hooks = {}) {
	if (pad) return pad;
	pad = startGamepad({
		...(hooks.readPads ? { readPads: hooks.readPads } : {}),
		onPress: onPadPress, onRelease: onPadRelease, onFrame: onPadFrame,
		onConnect: e => { hooks.onConnect?.(e); if (!hooks.quiet) hud.textContent = 'Controller connected.'; },
		onDisconnect: e => { setPadDir(null); S.runHeld = false; hooks.onDisconnect?.(e); },
	});
	return pad;
}
// Signed out: a controller does nothing, but says why, once.
export function gamepadNeedsLogin() {
	if (typeof addEventListener !== 'function') return;
	addEventListener('gamepadconnected', () => { hud.textContent = 'Sign in to play with a controller.'; }, { once: true });
}
