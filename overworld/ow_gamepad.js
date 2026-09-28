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
import { startGamepad, loadPadSettings, savePadSettings, remapButton, buttonLabel, buttonName, REMAPPABLE, rumble } from '../site/gamepad.js';
import { heldKeys, typingInChat } from './ow_input.js';
import { menuBlocking, pressKey, pcMenu, shopMenu } from './ow_menukeys.js';
import { dexMenu, optionsMenu, partyMenu, trainerCard } from './ow_menustate.js';
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
	if (swallow || optionsMenu.padCapture) return;   // a remap capture owns this press
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
	swallow = false;
	const free = !menuBlocking() && !typingInChat() && !optionsMenu.padCapture;
	setPadDir(free ? pad.direction() : null);
	syncHints(pad.connected());
}

// ---------- OPTIONS > CONTROLS: the controller rows (Phase 5) ----------
export const PAD_ROWS = [
	['confirm', 'CONFIRM'], ['cancel', 'CANCEL / RUN'], ['menu', 'START MENU'], ['select', 'PARTY'],
	['secondary', 'BAG'], ['context', 'CONTEXT (bike, sort...)'], ['prev', 'PAGE LEFT'], ['next', 'PAGE RIGHT'],
];
// labels follow the pad in your hands; with none connected, the Nintendo names
export const padKind = () => (pad && pad.connected() && pad.kind()) || 'switch';
export const padLabel = action => buttonLabel(action, padKind(), loadPadSettings());
export function padSettingRows() {
	const v = loadPadSettings();
	const rows = [
		`CONTROLLER LAYOUT   —   ${v.layout === 'xbox' ? 'XBOX (bottom button confirms)' : 'NINTENDO (right button confirms)'}`,
		`CONTROLLER RUMBLE   —   ${v.rumble ? 'ON' : 'OFF'}`,
	];
	for (const [a, label] of PAD_ROWS) rows.push(optionsMenu.padCapture === a
		? `PAD: ${label}   >>> PRESS A CONTROLLER BUTTON (Esc cancels)` : `PAD: ${label}   —   ${padLabel(a)}`);
	rows.push('RESET CONTROLLER BUTTONS');
	return rows;
}
// j = which controller row (0 = layout, 1 = rumble, 2.. = buttons, last = reset)
export function padSettingPick(j) {
	const v = loadPadSettings();
	if (j === 0) {
		v.layout = v.layout === 'xbox' ? 'nintendo' : 'xbox';
		v.remap = null;   // a layout switch starts the buttons from that layout's defaults
		savePadSettings(v); reloadGamepad();
		return `Layout: ${v.layout === 'xbox' ? 'XBOX' : 'NINTENDO'}. ${padLabel('confirm')} confirms, ${padLabel('cancel')} cancels.`;
	}
	if (j === 1) {
		v.rumble = !v.rumble; savePadSettings(v);
		if (v.rumble) rumble(0.7, 200);
		return v.rumble ? 'Rumble on.' : 'Rumble off.';
	}
	if (j >= 2 && j < 2 + PAD_ROWS.length) {
		if (!(pad && pad.connected())) return 'Connect a controller to remap its buttons.';
		optionsMenu.padCapture = PAD_ROWS[j - 2][0];
		return null;
	}
	v.remap = null; savePadSettings(v); reloadGamepad();
	return 'Controller buttons are back to their defaults.';
}
export function reloadGamepad() { if (pad && pad.reloadSettings) pad.reloadSettings(); }
// capture: the next physical button pressed takes the chosen action
let swallow = false;
function onPadButton(i) {
	const action = optionsMenu.open && optionsMenu.padCapture;
	if (!action) return;
	swallow = true;   // this press assigns; it must not ALSO act this frame
	if (!REMAPPABLE.includes(i)) { optionsMenu.flash = 'That button always moves. Pick another.'; return; }
	const v = loadPadSettings();
	v.remap = remapButton(v, i, action);
	savePadSettings(v); reloadGamepad();
	const label = (PAD_ROWS.find(r => r[0] === action) || [])[1] || action;
	optionsMenu.flash = `${label} is now ${buttonName(i, padKind())}.`;
	optionsMenu.padCapture = null;
}

// ---------- the hint bar: what the buttons do HERE, on this pad ----------
let hintEl = null, keyboardHints = null, lastHint = '';
export function padHints() {
	const L = a => `[${padLabel(a)}]`;
	if (battle.blocking) {
		const moves = battle.active?.phase === 'moves';
		return `D-pad choose · ${L('confirm')} select · ${L('cancel')} back · ${L('context')} ${moves ? 'swap moves' : 'throw last ball'}`;
	}
	if (pcMenu.open) return `${L('confirm')} pick · ${L('cancel')} back · ${L('context')} sort · ${L('secondary')} switch side · ${L('select')} release · ${L('prev')}${L('next')} box`;
	if (dexMenu.open) return `${L('confirm')} open · ${L('cancel')} back · ${L('context')} type · ${L('secondary')} caught · ${L('select')} grid · ${L('prev')}${L('next')} region`;
	if (partyMenu.open) return partyMenu.summary
		? `◄► moves · ${L('confirm')} swap · ${L('context')} make lead · ${L('cancel')} back`
		: `${L('confirm')} choose · ${L('context')} take item · ${L('cancel')} back`;
	if (shopMenu.open) return `${L('confirm')} buy/sell · ${L('secondary')} buy ↔ sell · ${L('cancel')} leave`;
	if (menuBlocking()) return `D-pad choose · ${L('confirm')} OK · ${L('cancel')} back · ${L('prev')}${L('next')} page`;
	return `Stick move · ${L('confirm')} talk · hold ${L('cancel')} run · ${L('menu')} menu · ${L('select')} party · ${L('secondary')} bag · ${L('context')} bike`;
}
function syncHints(connected) {
	hintEl ||= document.getElementById('keyhints');
	if (!hintEl) return;
	if (keyboardHints == null) keyboardHints = hintEl.textContent;
	const text = connected ? padHints() : keyboardHints;
	if (text !== lastHint) { hintEl.textContent = text; lastHint = text; }
}

let pad = null;
// Called once the account is loaded. `hooks.onConnect/onDisconnect` let
// main.js swap the touch HUD out while a controller is in use.
export function initGamepad(hooks = {}) {
	if (pad) return pad;
	pad = startGamepad({
		...(hooks.readPads ? { readPads: hooks.readPads } : {}),
		onPress: onPadPress, onRelease: onPadRelease, onFrame: onPadFrame, onButton: onPadButton,
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
