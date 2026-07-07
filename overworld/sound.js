// sound.js — lazy audio for Pokémon cries + battle SFX. Files come from the
// Love2D build (data/sounds/cries/<speciesId>.ogg, data/sounds/sfx/<name>.ogg)
// and only download when first played. Failures (missing cry, autoplay
// policy before the first tap) are silent.
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
	try {
		const a = base(url).cloneNode();
		a.volume = vol;
		a.play().catch(() => {});
	} catch (e) { /* no audio */ }
}

export const cry = speciesId => play(`data/sounds/cries/${speciesId}.ogg`, 0.5);
export const sfx = name => play(`data/sounds/sfx/${name}.ogg`, 0.55);
