// settings.js — player-facing options, persisted in localStorage. Other modules
// read these live (sound volume, dialog speed, auto-run, day/night tint).
import { safeLoad, safeSave } from './safestore.js';
const KEY = 'magepunk_settings';

// each option: ordered value list; the stored value is one of these
export const OPTIONS = {
	textSpeed: { label: 'TEXT SPEED', values: ['slow', 'mid', 'fast', 'instant'], show: v => v.toUpperCase() },
	sound: { label: 'SOUND', values: ['off', 'low', 'mid', 'full'], show: v => v.toUpperCase() },
	autoRun: { label: 'AUTO-RUN', values: [false, true], show: v => (v ? 'ON' : 'OFF') },
	dayNight: { label: 'DAY & NIGHT', values: [true, false], show: v => (v ? 'ON' : 'OFF') },
	followers: { label: 'FOLLOWERS', values: [true, false], show: v => (v ? 'ON' : 'OFF') },
	// every modern game ships this; grinding here meant eating full ball-shake and
	// attack sequences forever, with only a per-message tap to skip
	battleAnim: { label: 'BATTLE ANIM', values: ['full', 'fast', 'off'], show: v => v.toUpperCase() },
};
const DEFAULTS = { textSpeed: 'mid', sound: 'full', autoRun: false, dayNight: true, followers: true, battleAnim: 'full' };

function load() {
	const d = safeLoad(KEY, null);
	if (d && typeof d === 'object') return { ...DEFAULTS, ...d };
	return { ...DEFAULTS };
}
let cfg = load();
function save() { safeSave(KEY, cfg); }

export function get(k) { return cfg[k]; }
export function set(k, v) { if (k in cfg) { cfg[k] = v; save(); } }
// step a setting to its next value (wraps); returns the new value
export function cycle(k, dir = 1) {
	const o = OPTIONS[k];
	if (!o) return;
	const i = o.values.indexOf(cfg[k]);
	cfg[k] = o.values[(i + dir + o.values.length) % o.values.length];
	save();
	return cfg[k];
}
export function displayValue(k) { return OPTIONS[k].show(cfg[k]); }

// derived helpers other modules consume
const VOL = { off: 0, low: 0.35, mid: 0.65, full: 1 };
export function volumeMult() { return VOL[cfg.sound] ?? 1; }
const CPS = { slow: 18, mid: 42, fast: 90, instant: Infinity };
export function charsPerSec() { return CPS[cfg.textSpeed] ?? 42; }
// multiplier the battle applies to every queued animation duration
const ANIM = { full: 1, fast: 0.4, off: 0 };
export function animScale() { return ANIM[cfg.battleAnim] ?? 1; }
