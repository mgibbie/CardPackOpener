// settings.js — player-facing options, persisted in localStorage. Other modules
// read these live (sound volume, dialog speed, auto-run, day/night tint).
import { safeLoad, safeSave } from './safestore.js';
const KEY = 'magepunk_settings';

// each option: ordered value list; the stored value is one of these
// volume sliders run 0..100 in tens; ◄► steps them like every other option
const PCTS = [0, 10, 20, 30, 40, 50, 60, 70, 80, 90, 100];
// plain '=' bars: the m6x11plus pixel font has no block-glyph coverage
const pctBar = v => (v === 0 ? 'OFF' : '='.repeat(Math.round(v / 10)) + ' ' + v + '%');
export const OPTIONS = {
	textSpeed: { label: 'TEXT SPEED', values: ['slow', 'mid', 'fast', 'instant'], show: v => v.toUpperCase() },
	// music and effects get SEPARATE sliders — the old single 'sound' option is
	// migrated in load() so nobody's saved preference is lost
	bgmVol: { label: 'MUSIC (BGM)', values: PCTS, show: pctBar },
	sfxVol: { label: 'SOUND FX', values: PCTS, show: pctBar },
	autoRun: { label: 'AUTO-RUN', values: [false, true], show: v => (v ? 'ON' : 'OFF') },
	dayNight: { label: 'DAY & NIGHT', values: [true, false], show: v => (v ? 'ON' : 'OFF') },
	weather: { label: 'WEATHER FX', values: [true, false], show: v => (v ? 'ON' : 'OFF') },
	followers: { label: 'FOLLOWERS', values: [true, false], show: v => (v ? 'ON' : 'OFF') },
	// every modern game ships this; grinding here meant eating full ball-shake and
	// attack sequences forever, with only a per-message tap to skip
	battleAnim: { label: 'BATTLE ANIM', values: ['full', 'fast', 'off'], show: v => v.toUpperCase() },
};
const DEFAULTS = { textSpeed: 'mid', bgmVol: 70, sfxVol: 100, autoRun: false, dayNight: true, weather: true, followers: true, battleAnim: 'full' };

function load() {
	const d = safeLoad(KEY, null);
	if (d && typeof d === 'object') {
		// legacy single 'sound' knob -> both sliders (music a notch under sfx)
		if (d.sound != null && d.sfxVol == null) {
			d.sfxVol = { off: 0, low: 40, mid: 70, full: 100 }[d.sound] ?? 100;
			d.bgmVol = Math.min(d.sfxVol, 70);
		}
		return { ...DEFAULTS, ...d };
	}
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
export function volumeMult() { return Math.max(0, Math.min(1, (cfg.sfxVol ?? 100) / 100)); }
export function bgmMult() { return Math.max(0, Math.min(1, (cfg.bgmVol ?? 70) / 100)); }
const CPS = { slow: 18, mid: 42, fast: 90, instant: Infinity };
export function charsPerSec() { return CPS[cfg.textSpeed] ?? 42; }
// multiplier the battle applies to every queued animation duration
const ANIM = { full: 1, fast: 0.4, off: 0 };
export function animScale() { return ANIM[cfg.battleAnim] ?? 1; }
