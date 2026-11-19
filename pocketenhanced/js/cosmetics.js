// cosmetics.js — sleeves, mats and coins bought with stars (owner's fourth improvement list, 2026-11-19: "Looks you buy
// with stars. It gives stars something to spend on besides packs").
// A sleeve is the back of YOUR cards (your deck pile and the cards-in-deck mark on your side); a mat is the table every
// match is played on, on your screen; a coin is the coin your screen tosses. What is bought is kept in the solo progress
// (solo.js `cos`, joined across devices like everything there); what is worn is this device's choice (prefs.look).
// The first of each kind is free and always owned. Prices are whole packs' worth of stars (100 each), so a look bought
// on two devices at once is paid back exactly (solo.js boughtTwice).

export const KINDS = Object.freeze(['sleeve', 'mat', 'coin']);
export const KIND_NAME = Object.freeze({ sleeve: 'Sleeves', mat: 'Mats', coin: 'Coins' });
export const PRICE = Object.freeze({ sleeve: 300, mat: 500, coin: 200 });

// sleeve: a, b (the back's two colours), dot (its middle). mat: bg (the mat's background). coin: h, t (the faces'
// colours), hi, ti (the faces' signs), hc, tc (the signs' colours). A mat with `dark` dims the ring in its middle.
export const LOOKS = Object.freeze([
	{ id: 'sl-classic', kind: 'sleeve', name: 'Classic', free: true, a: '#6aa5f5', b: '#2a4fa8', dot: '#ffd75a' },
	{ id: 'sl-ember', kind: 'sleeve', name: 'Ember', a: '#ff9a5c', b: '#b8321a', dot: '#ffe08a' },
	{ id: 'sl-tide', kind: 'sleeve', name: 'Tide', a: '#5fe0e6', b: '#1a6c9c', dot: '#e8fbff' },
	{ id: 'sl-leaf', kind: 'sleeve', name: 'Leaf', a: '#8ee07a', b: '#2f7d32', dot: '#f4ffb0' },
	{ id: 'sl-spark', kind: 'sleeve', name: 'Spark', a: '#ffe36b', b: '#c99400', dot: '#ffffff' },
	{ id: 'sl-mind', kind: 'sleeve', name: 'Mind', a: '#d89cf5', b: '#6b2d9b', dot: '#ffd1f5' },
	{ id: 'sl-night', kind: 'sleeve', name: 'Night', a: '#4a5568', b: '#11151c', dot: '#c7b8ff' },
	{ id: 'sl-gold', kind: 'sleeve', name: 'Gold', a: '#ffe9a8', b: '#b7832b', dot: '#fff8dc' },
	{ id: 'mat-pocket', kind: 'mat', name: 'Pocket', free: true, bg: '' },
	{ id: 'mat-meadow', kind: 'mat', name: 'Meadow', bg: 'linear-gradient(180deg, #cfeec0 0%, #def6cf 40%, #f2fbe9 49%, #f2fbe9 51%, #d7f1c6 60%, #b9e3a3 100%)' },
	{ id: 'mat-beach', kind: 'mat', name: 'Beach', bg: 'linear-gradient(180deg, #a9dcf2 0%, #c8eaf7 40%, #fbf1d3 49%, #fbf1d3 51%, #f6e3b0 60%, #ecd38f 100%)' },
	{ id: 'mat-volcano', kind: 'mat', name: 'Volcano', dark: true, bg: 'linear-gradient(180deg, #4a2a26 0%, #6b3329 40%, #f0a072 49%, #f0a072 51%, #6b3329 60%, #3a201c 100%)' },
	{ id: 'mat-starry', kind: 'mat', name: 'Starry night', dark: true, bg: 'radial-gradient(circle at 20% 30%, rgba(255,255,255,.7) 0 1px, transparent 2px) 0 0 / 60px 60px, radial-gradient(circle at 70% 70%, rgba(255,255,255,.5) 0 1px, transparent 2px) 0 0 / 90px 90px, linear-gradient(180deg, #1b1f4a 0%, #2b2f6b 48%, #3b3f86 50%, #2b2f6b 52%, #141838 100%)' },
	{ id: 'mat-snow', kind: 'mat', name: 'Snowfield', bg: 'linear-gradient(180deg, #e4eef8 0%, #f1f6fb 40%, #ffffff 49%, #ffffff 51%, #eaf2fa 60%, #d4e3f2 100%)' },
	{ id: 'coin-star', kind: 'coin', name: 'Star', free: true, h: '', t: '', hi: '★', ti: '●' },
	{ id: 'coin-ball', kind: 'coin', name: 'Ball', h: 'radial-gradient(circle at 35% 30%, #fff, #f2f2f2 40%, #cfcfcf)', t: 'linear-gradient(180deg, #ff6b6b 0 47%, #222 47% 53%, #f4f4f4 53%)', hi: '◉', ti: '◉', hc: '#d33a3a', tc: '#ffffff' },
	{ id: 'coin-moon', kind: 'coin', name: 'Moon', h: 'radial-gradient(circle at 35% 30%, #fffbe0, #f0de8a 55%, #b8a24a)', t: 'radial-gradient(circle at 35% 30%, #5a6390, #2c3366 55%, #151a3d)', hi: '☀', ti: '☾', hc: '#8a6a00', tc: '#e8ecff' },
	{ id: 'coin-leaf', kind: 'coin', name: 'Leaf', h: 'radial-gradient(circle at 35% 30%, #e6ffd0, #8fd36a 55%, #3f8a2a)', t: 'radial-gradient(circle at 35% 30%, #fff1d6, #e2a65a 55%, #8f5a1f)', hi: '❦', ti: '❧', hc: '#1f5214', tc: '#5a3510' },
	{ id: 'coin-ruby', kind: 'coin', name: 'Ruby', h: 'radial-gradient(circle at 35% 30%, #ffd6dc, #e34b62 55%, #8a1428)', t: 'radial-gradient(circle at 35% 30%, #d6e8ff, #4b7be3 55%, #142f8a)', hi: '♦', ti: '♠', hc: '#ffffff', tc: '#ffffff' },
]);
const BY_ID = new Map(LOOKS.map(l => [l.id, l]));
export const lookById = id => BY_ID.get(id) || null;
export const priceOf = id => { const l = lookById(id); return !l || l.free ? 0 : PRICE[l.kind]; };
export const isLook = id => BY_ID.has(id);
/** The free one of a kind (what is worn when nothing else is). */
export const defaultOf = kind => LOOKS.find(l => l.kind === kind && l.free);
/** Does the player own this look? (progress: solo.js progress, with `cos` the looks bought) */
export const ownsLook = (progress, id) => { const l = lookById(id); return !!l && (l.free || !!(progress && progress.cos && progress.cos[id])); };
/** What is worn, for each kind: the device's choice where it is owned, otherwise the free one. */
export function worn(progress, choice) {
	const out = {};
	for (const k of KINDS) { const id = choice && choice[k]; out[k] = id && lookById(id) && lookById(id).kind === k && ownsLook(progress, id) ? lookById(id) : defaultOf(k); }
	return out;
}
