// sound.js — lazy audio for Pokémon cries + battle SFX. Files come from the
// Love2D build (data/sounds/cries/<speciesId>.ogg, data/sounds/sfx/<name>.ogg)
// and only download when first played. Failures (missing cry, autoplay
// policy before the first tap) are silent.
import * as Settings from './settings.js';

const cache = new Map();

function base(url) {
	if (!cache.has(url)) {
		const a = new Audio(url);
		a.preload = 'auto';
		cache.set(url, a);
	}
	return cache.get(url);
}

export function play(url, vol = 0.6) {
	const master = Settings.volumeMult();
	if (master <= 0) return; // sound off
	try {
		const a = base(url).cloneNode();
		a.volume = Math.max(0, Math.min(1, vol * master));
		a.play().catch(() => {});
	} catch (e) { /* no audio */ }
}

// 391 species (the Ransei/Uranium fakemon and a couple of forms) have no cry
// file yet — they stay SILENT on purpose (user call: no borrowed cries; each
// will get an original recording). The full worklist lives in the design wiki
// under "Missing Cries" (tools/gen_missing_cries.mjs).
export const cry = speciesId => play(`data/sounds/cries/${speciesId}.ogg`, 0.5);
export const sfx = name => play(`data/sounds/sfx/${name}.ogg`, 0.55);

// ---------- background music ----------
// One looping track at a time, keyed by music_map.json's file keys
// (data/sounds/bgm/<game>_<CONST>.ogg — the accurate per-map songs from
// Crystal/FireRed/Emerald, tools/gen_bgm.mjs). Crossing into a map that plays
// the SAME song must not restart it: routes and towns share tracks and a
// restart at every doorway would be jarring — that no-op is the whole reason
// this takes a key instead of a URL.
const BGM_BASE = 0.55;   // music sits under the punchier one-shot SFX
let bgmEl = null, bgmKey = null;

export function bgm(key) {
	if ((key || null) === bgmKey) { bgmKick(); return; }
	if (bgmEl) { bgmEl.pause(); bgmEl = null; }
	bgmKey = key || null;
	if (!bgmKey) return;
	try {
		bgmEl = new Audio(`data/sounds/bgm/${bgmKey}.ogg`);
		bgmEl.loop = true;
		bgmEl.volume = Math.max(0, Math.min(1, BGM_BASE * Settings.bgmMult()));
		// autoplay policy may refuse until the first gesture — bgmKick retries
		if (Settings.bgmMult() > 0) bgmEl.play().catch(() => {});
	} catch (e) { bgmEl = null; /* no audio */ }
}
export function bgmNow() { return bgmKey; }
// the BGM slider moved: retune the live track (0 pauses, >0 resumes)
export function syncBgmVolume() {
	if (!bgmEl) return;
	bgmEl.volume = Math.max(0, Math.min(1, BGM_BASE * Settings.bgmMult()));
	if (Settings.bgmMult() <= 0) bgmEl.pause();
	else if (bgmEl.paused) bgmEl.play().catch(() => {});
}
// browsers block audio before the first user gesture; the first key/tap
// unsticks whatever track was refused at map load
function bgmKick() {
	if (bgmEl && bgmEl.paused && Settings.bgmMult() > 0) bgmEl.play().catch(() => {});
}
if (typeof addEventListener === 'function') {
	addEventListener('keydown', bgmKick);
	addEventListener('pointerdown', bgmKick);
}
