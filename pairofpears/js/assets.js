// assets.js — the game's own art (fruit, charms, condition icons, hearts, berries, stars).
// Everything else on the page — the card base and back, the font, the sounds, the swirling
// background — is Micatro's (../../micatro/js/ui/*). IMG.<name> is an HTMLImageElement.
import { FRUITS, CHARM_ORDER, COND_INFO } from './pear.js';

export const IMG = {};
export const ICONS = ['heart', 'berry', 'star'];
export const NAMES = [...new Set([...FRUITS, ...CHARM_ORDER, ...Object.values(COND_INFO).map((c) => c.icon), ...ICONS])];
export const src = (name) => new URL('../assets/' + name + '.png', import.meta.url).href;

export function loadAll() {
	return Promise.all(NAMES.map((name) => new Promise((res) => {
		const im = new Image();
		im.onload = () => res();
		im.onerror = () => { console.warn('pairofpears: missing sprite ' + name); res(); };
		im.src = src(name);
		IMG[name] = im;
	})));
}
export const img = (key) => IMG[key] || null;
