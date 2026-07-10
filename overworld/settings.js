// settings.js — player-facing options, persisted in localStorage. Other modules
// read these live (sound volume, dialog speed, auto-run, day/night tint).
const KEY = 'magepunk_settings';

// each option: ordered value list; the stored value is one of these
export const OPTIONS = {
	textSpeed: { label: 'TEXT SPEED', values: ['slow', 'mid', 'fast', 'instant'], show: v => v.toUpperCase() },
	sound: { label: 'SOUND', values: ['off', 'low', 'mid', 'full'], show: v => v.toUpperCase() },
	autoRun: { label: 'AUTO-RUN', values: [false, true], show: v => (v ? 'ON' : 'OFF') },
	dayNight: { label: 'DAY & NIGHT', values: [true, false], show: v => (v ? 'ON' : 'OFF') },
};
const DEFAULTS = { textSpeed: 'mid', sound: 'full', autoRun: false, dayNight: true };

function load() {
	try {
		const d = JSON.parse(localStorage.getItem(KEY));
		if (d && typeof d === 'object') return { ...DEFAULTS, ...d };
	} catch (e) {}
	return { ...DEFAULTS };
}
let cfg = load();
function save() { try { localStorage.setItem(KEY, JSON.stringify(cfg)); } catch (e) {} }

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
