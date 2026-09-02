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

// 391 species (the Ransei/Uranium fakemon and a couple of forms) shipped with
// no cry file at all — every "appeared!" was mute. Each borrows the cry of its
// nearest real relative (same primary type, closest stat total —
// tools/gen_cry_donors.mjs). The map loads lazily and quietly; until it lands,
// a missing cry stays silent, which is exactly what it already was.
let cryDonors = {};
fetch('data/cry_donors.json').then(r => (r.ok ? r.json() : {})).then(d => { cryDonors = d || {}; }).catch(() => {});

export const cry = speciesId => play(`data/sounds/cries/${cryDonors[speciesId] || speciesId}.ogg`, 0.5);
export const sfx = name => play(`data/sounds/sfx/${name}.ogg`, 0.55);
