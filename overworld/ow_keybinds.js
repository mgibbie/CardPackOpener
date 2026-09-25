// ow_keybinds.js — remappable key bindings (load/save and the action lookup the input layer uses).
// Split out of main.js (Plans/MAIN_JS_SPLIT_PLAN.md, phase 3); cut and paste only.
import { S } from './ow_state.js';
import { safeLoad, safeSave } from './safestore.js';

// ---------- key bindings ----------
// The single-key shortcuts (S to swap move slots, F to search the PC, C for
// the bike, R to re-throw a ball...) were undiscoverable and unmovable. The
// CONTROLS screen lists every one and lets each be rebound; a custom key
// TRANSLATES to the action's default at the input door, so the defaults keep
// working alongside (forgiving, not exclusive). Device preference, like the
// volume sliders — spared by the owner reset.
export const KEYBIND_KEY = 'magepunk_keys_v1';
export const KEY_ACTIONS = [
	{ id: 'confirm', label: 'CONFIRM / INTERACT', def: 'z' },
	{ id: 'cancel', label: 'CANCEL / BACK', def: 'x' },
	{ id: 'menu', label: 'MAIN MENU', def: 'Enter' },
	{ id: 'party', label: 'PARTY', def: 'p' },
	{ id: 'bag', label: 'BAG', def: 'b' },
	{ id: 'bike', label: 'BIKE ON/OFF', def: 'c' },
	{ id: 'find', label: 'FIND (PC BOX SEARCH)', def: 'f' },
	{ id: 'swap', label: 'SWAP MOVE SLOTS (BATTLE)', def: 's' },
	{ id: 'rethrow', label: 'RE-THROW BALL (BATTLE)', def: 'r' },
];
S.keyBinds = safeLoad(KEYBIND_KEY, {}); // action id -> custom key
// keys that may never be rebound over: movement, the defaults, system keys
const KEY_RESERVED = new Set(['arrowup', 'arrowdown', 'arrowleft', 'arrowright', 'w', 'a', 's', 'd',
	'z', 'x', 'enter', 'p', 'b', 'c', 'f', 'r', 'escape', 'm', ' ']);
export const normKey = k => (k && k.length === 1 ? k.toLowerCase() : k);
export function translateKey(k) {
	const kk = normKey(k);
	for (const a of KEY_ACTIONS) if (S.keyBinds[a.id] && S.keyBinds[a.id] === kk) return a.def;
	return k;
}
export function assignKeyBind(actionId, rawKey) {
	const kk = normKey(rawKey);
	if (kk && kk.toLowerCase() === 'escape') return 'cancelled';
	if (!kk || kk.length > 12 || KEY_RESERVED.has(kk.toLowerCase())) return 'reserved';
	for (const a of KEY_ACTIONS) if (S.keyBinds[a.id] === kk && a.id !== actionId) delete S.keyBinds[a.id];
	S.keyBinds[actionId] = kk;
	safeSave(KEYBIND_KEY, S.keyBinds);
	return 'bound';
}
