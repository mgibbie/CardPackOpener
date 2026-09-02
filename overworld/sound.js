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
