// scene8.js — the art of an illustration (★) and an immersive (★★★) card: a scene in the manner of an 8-bit game,
// drawn here from nothing but the site's own sprite of the Pokémon and a handful of colours.
//
// A scene is 120 x 168 pixels (the card's shape), shown enlarged with hard pixels. It is built in layers, back to front:
// a dithered sky, something in it (a sun, a moon, stars, bolts), clouds, two ranges of far things (hills, peaks, a
// skyline, mesas, treetops, waves), the ground, small things on the ground. Then, on a layer of its own, the Pokémon
// with its shadow and a few things in front of it. The two layers are separate canvases, so an immersive card can
// move them against each other as the pointer moves (css/pocket.css): depth.
// Which scene a card gets comes from its Card Type; what it looks like within that (the time of day, where the hills
// are, how many stars) comes from the card's id, so a card always has the same scene and two cards of a type differ.
// Only a limited palette is used and gradients are dithered (an ordered 4x4 pattern), as the hardware this imitates did.

export const W = 120, H = 168;
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const hex = h => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const P = (...l) => l.map(hex);
function rng(seed) { let a = 0; for (const ch of String(seed)) a = (Math.imul(a, 31) + ch.charCodeAt(0)) >>> 0; return () => { a = (a + 0x6D2B79F5) >>> 0; let t = a; t = Math.imul(t ^ (t >>> 15), t | 1); t ^= t + Math.imul(t ^ (t >>> 7), t | 61); return ((t ^ (t >>> 14)) >>> 0) / 4294967296; }; }

// sky: colours from the top down. far/near: the two ranges. ground: from the horizon down. Three times of day each.
const THEMES = {
	Grass: { far: 'hills', near: 'trees', orb: 'sun', clouds: 3, bits: 'flowers', looks: [
		{ sky: P('#3f8fe0', '#6fb4f0', '#a9d8f8', '#e3f4fb'), far: P('#5aa85a', '#3f8a4c'), near: P('#2f6f3e', '#1f5230'), ground: P('#6cc04f', '#4ea33d', '#3a8432'), orb: P('#fff6b0', '#ffd84a') },
		{ sky: P('#f08a4b', '#f7b267', '#fbd48a', '#fff0c0'), far: P('#6f9a48', '#527f3a'), near: P('#35602c', '#234a22'), ground: P('#8fb84a', '#6a9a3a', '#4b7a30'), orb: P('#fff0c0', '#ff9a3c') },
		{ sky: P('#10204a', '#1c3a72', '#2f5c96', '#4c86b0'), far: P('#2c6a5a', '#1f5248'), near: P('#163e36', '#0e2c28'), ground: P('#2f8a5e', '#236e4a', '#18523a'), orb: P('#f4f1d0', '#cfd6e8') }] },
	Fire: { far: 'peaks', near: 'mesas', orb: 'sun', clouds: 0, bits: 'embers', looks: [
		{ sky: P('#3a0c14', '#8a1f1c', '#d9512a', '#ff9a4d', '#ffd76a'), far: P('#5a1a18', '#3d1012'), near: P('#2a0a0e', '#1a0508'), ground: P('#8a3a22', '#6a2a1a', '#4a1c14'), orb: P('#fff3a0', '#ffb347') },
		{ sky: P('#1a0a24', '#4a1436', '#9a2a3a', '#e0603a', '#ffb060'), far: P('#3a1230', '#280c22'), near: P('#1a0818', '#0e040e'), ground: P('#6a2c2c', '#4c1e22', '#321418'), orb: P('#ffe9a8', '#ff7a3c') },
		{ sky: P('#f2a03c', '#f7c060', '#fbe08a', '#fff4c0'), far: P('#b0522c', '#8c3e22'), near: P('#6a2c1a', '#4a1e12'), ground: P('#c8743a', '#a85a2c', '#864420'), orb: P('#ffffff', '#fff0a0') }] },
	Water: { far: 'peaks', near: 'waves', orb: 'sun', clouds: 3, bits: 'foam', looks: [
		{ sky: P('#3f8fe0', '#74b8f2', '#b4e0fa', '#e8f8ff'), far: P('#7fa8c8', '#5f8cb0'), near: P('#2f7fd0', '#256ab8'), ground: P('#4a9ae3', '#2f7fd0', '#1f62b0'), orb: P('#fffbe0', '#ffe27a') },
		{ sky: P('#2a2a6a', '#5a3a8a', '#b0507a', '#f08a6a', '#ffd08a'), far: P('#4a3a6a', '#362a54'), near: P('#2a4a8a', '#1f3a72'), ground: P('#3a62a8', '#2a4a8a', '#1c346a'), orb: P('#fff0c0', '#ff9a5a') },
		{ sky: P('#0a1436', '#12265a', '#1c3e80', '#2c5ea8'), far: P('#1c2e58', '#142244'), near: P('#12306a', '#0c2452'), ground: P('#1c4a8a', '#12366e', '#0a2452'), orb: P('#f4f1d0', '#cfd6e8') }] },
	Lightning: { far: 'peaks', near: 'hills', orb: 'bolts', clouds: 4, bits: 'sparks', looks: [
		{ sky: P('#1a1640', '#2e2a6a', '#5a4a96', '#9a86c0'), far: P('#3a3470', '#2a2658'), near: P('#6a5a20', '#4e4218'), ground: P('#d9b93a', '#b4962c', '#8e7422'), orb: P('#ffffff', '#fff27a') },
		{ sky: P('#f2c531', '#f7d860', '#fbe88e', '#fff7c8'), far: P('#c8962c', '#a67a22'), near: P('#7a5a1a', '#5a4212'), ground: P('#e6c84a', '#c4a43a', '#9e822c'), orb: P('#ffffff', '#fff6b0') },
		{ sky: P('#0c0c24', '#1a1a48', '#2c2c72', '#4a4aa0'), far: P('#1e1e50', '#14143a'), near: P('#3a3410', '#2a260c'), ground: P('#8e7a22', '#6e5e1a', '#4e4212'), orb: P('#ffffff', '#ffe84a') }] },
	Psychic: { far: 'peaks', near: 'crystals', orb: 'moon', clouds: 0, bits: 'stars', looks: [
		{ sky: P('#1a0a3a', '#3a1466', '#6e2a96', '#b25fc6', '#f3c4f7'), far: P('#4a1e72', '#36145a'), near: P('#8a4ab0', '#6a3492'), ground: P('#7a3a9a', '#5c2a7c', '#421e5e'), orb: P('#fff0ff', '#f3a0e8') },
		{ sky: P('#0a0a2a', '#1a1456', '#3a2a8a', '#6a4ab8'), far: P('#241a5e', '#181246'), near: P('#5a3aa0', '#42288a'), ground: P('#3e2a7a', '#2c1e5e', '#1e1444'), orb: P('#ffffff', '#c8b8ff') },
		{ sky: P('#f0a0d8', '#f7c0e6', '#fbdcf0', '#fff0fa'), far: P('#b86ac0', '#9a52a6'), near: P('#7a3a92', '#5e2a76'), ground: P('#d08ad8', '#b06ab8', '#8e4e98'), orb: P('#ffffff', '#ffe0f6') }] },
	Fighting: { far: 'mesas', near: 'mesas', orb: 'sun', clouds: 2, bits: 'rocks', looks: [
		{ sky: P('#e0844a', '#f0a868', '#f7cc8e', '#fdeab8'), far: P('#b8663a', '#9a502c'), near: P('#7a3c20', '#5e2c16'), ground: P('#d99a5a', '#b87c44', '#966032'), orb: P('#fff7c8', '#ffd060') },
		{ sky: P('#5aa0e0', '#8cc0f0', '#c0e0f8', '#f0f8fc'), far: P('#c8865a', '#a86c44'), near: P('#8a4e2c', '#6a3a20'), ground: P('#e0aa6e', '#c08c52', '#9e6e3c'), orb: P('#ffffff', '#fff0a0') },
		{ sky: P('#2a1a3a', '#5a2a4a', '#a04a4a', '#e08a5a'), far: P('#5a2a2e', '#421e22'), near: P('#2e1416', '#1e0c0e'), ground: P('#8a4a36', '#6a3628', '#4a241c'), orb: P('#ffe0b0', '#ff8a4a') }] },
	Darkness: { far: 'skyline', near: 'trees', orb: 'moon', clouds: 2, bits: 'fog', looks: [
		{ sky: P('#06081a', '#0e1430', '#1a2448', '#2f3d62'), far: P('#141c34', '#0c1224'), near: P('#080c18', '#04060e'), ground: P('#1f2a44', '#161e34', '#0e1424'), orb: P('#f4f1d0', '#a8b0c8') },
		{ sky: P('#1a0c2a', '#32164a', '#5a2a6a', '#8a4a82'), far: P('#261238', '#1a0c28'), near: P('#10081a', '#08040e'), ground: P('#3a2250', '#2a183c', '#1c102a'), orb: P('#ffe8f4', '#d08ab8') },
		{ sky: P('#0a1a1a', '#143030', '#225050', '#3a7a72'), far: P('#102828', '#0a1c1c'), near: P('#061212', '#030a0a'), ground: P('#1c3c3a', '#142c2a', '#0c1e1c'), orb: P('#e8fff0', '#8ad0b0') }] },
	Metal: { far: 'skyline', near: 'skyline', orb: 'sun', clouds: 2, bits: 'rivets', looks: [
		{ sky: P('#6d7f8a', '#8c9da7', '#b4c2ca', '#dfe6ea'), far: P('#5a6a74', '#48565e'), near: P('#343e44', '#262e32'), ground: P('#9fb0ba', '#82929c', '#66747c'), orb: P('#ffffff', '#e8f0f4') },
		{ sky: P('#2a323a', '#48545e', '#7a8690', '#b0b8c0'), far: P('#3a444c', '#2c343a'), near: P('#1c2226', '#121618'), ground: P('#6a767e', '#525c64', '#3c444a'), orb: P('#fff0d0', '#ffb860') },
		{ sky: P('#1a2a4a', '#2e4a72', '#5a7ea0', '#9ab8cc'), far: P('#2a3e5a', '#1e2e46'), near: P('#121c2c', '#0a121e'), ground: P('#5a7a96', '#44607a', '#30465c'), orb: P('#ffffff', '#c8e0f4') }] },
	Dragon: { far: 'peaks', near: 'peaks', orb: 'moon', clouds: 4, bits: 'stars', looks: [
		{ sky: P('#1c1650', '#3a2a8a', '#6a4ac0', '#a48cff'), far: P('#3a2e7a', '#2a2260'), near: P('#1a1444', '#100c30'), ground: P('#4a3a8e', '#382c72', '#281e56'), orb: P('#fff6c8', '#ffd666') },
		{ sky: P('#3a1a4a', '#7a2a5a', '#c8503a', '#f0a04a', '#ffe08a'), far: P('#5a2a56', '#421e42'), near: P('#28102a', '#1a0a1c'), ground: P('#7a3a5a', '#5e2a46', '#421c32'), orb: P('#fff0c0', '#ffb04a') },
		{ sky: P('#0c2a4a', '#1a4a72', '#3a7aa0', '#7ab4c8'), far: P('#1e4a66', '#14384e'), near: P('#0c2436', '#061824'), ground: P('#2a6a86', '#1e526a', '#143c50'), orb: P('#ffffff', '#c8f0ff') }] },
	Colorless: { far: 'hills', near: 'hills', orb: 'sun', clouds: 4, bits: 'flowers', looks: [
		{ sky: P('#6aa8e8', '#98c8f4', '#c8e4fa', '#f0f8fd'), far: P('#a8c88a', '#8cb070'), near: P('#6a9458', '#527a44'), ground: P('#cfe0a8', '#b0c888', '#90aa6a'), orb: P('#fffbe0', '#ffe890') },
		{ sky: P('#f0a078', '#f7c098', '#fbdcb8', '#fff2dc'), far: P('#c0a888', '#a48e70'), near: P('#7a6a52', '#5e503e'), ground: P('#e0d0a8', '#c4b28a', '#a6946e'), orb: P('#ffffff', '#ffd0a0') },
		{ sky: P('#2a3a6a', '#4a5e96', '#7a8ebc', '#b0c0dc'), far: P('#5a6a8a', '#46546e'), near: P('#2e3a52', '#202a3c'), ground: P('#8a9ab0', '#6e7e94', '#546278'), orb: P('#f4f1d0', '#d8dce8') }] },
};

// How often each of a type's three looks comes up (most cards by day or dusk; the types that live at night stay there).
const WEIGHT = { Grass: [5, 3, 2], Fire: [3, 2, 5], Water: [5, 3, 2], Lightning: [3, 5, 2], Fighting: [4, 4, 2], Metal: [5, 2, 3], Colorless: [5, 3, 2] };
const lookOf = (T, name, v) => { const w = WEIGHT[name] || [1, 1, 1], sum = w.reduce((a, b) => a + b, 0); let x = v * sum; for (let i = 0; i < w.length; i++) { if (x < w[i]) return T.looks[i]; x -= w[i]; } return T.looks[0]; };
const themeOf = t => (THEMES[t] ? t : 'Colorless');
/** The far things of a scene, as a height for each column (pixels above the horizon). */
function range(kind, r, amp) {
	const h = new Array(W).fill(0), a = r() * 6.28, b = r() * 6.28;
	if (kind === 'hills') for (let x = 0; x < W; x++) h[x] = amp * (0.55 + 0.3 * Math.sin(x / 19 + a) + 0.15 * Math.sin(x / 7 + b));
	else if (kind === 'peaks') { let x = -10; while (x < W + 10) { const w = 14 + r() * 26, top = amp * (0.5 + r() * 0.7), mid = x + w / 2; for (let i = Math.max(0, Math.floor(x)); i < Math.min(W, x + w); i++) h[i] = Math.max(h[i], top * (1 - Math.abs(i - mid) / (w / 2))); x += w * (0.45 + r() * 0.3); } }
	else if (kind === 'mesas') { let x = 0; while (x < W) { const w = 10 + Math.floor(r() * 22), top = Math.round(amp * (0.3 + r() * 0.8)); for (let i = x; i < Math.min(W, x + w); i++) h[i] = top - (i === x || i === x + w - 1 ? 2 : 0); x += w + Math.floor(r() * 8); } }
	else if (kind === 'skyline') { let x = 0; while (x < W) { const w = 5 + Math.floor(r() * 10), top = Math.round(amp * (0.25 + r() * 0.95)); for (let i = x; i < Math.min(W, x + w); i++) h[i] = top; x += w + (r() < 0.3 ? 2 : 0); } }
	else if (kind === 'trees') for (let x = 0; x < W; x++) { const k = (x + Math.floor(a * 3)) % 11; h[x] = amp * (0.45 + 0.25 * Math.sin(x / 23 + b)) + (k < 6 ? k : 11 - k) * 1.6; }
	else if (kind === 'crystals') { let x = 2; while (x < W) { const w = 4 + Math.floor(r() * 7), top = amp * (0.3 + r() * 0.9), mid = x + w / 2; for (let i = x; i < Math.min(W, x + w); i++) h[i] = Math.max(h[i], top * (1 - Math.abs(i - mid) / w)); x += w + Math.floor(r() * 9); } }
	else if (kind === 'waves') for (let x = 0; x < W; x++) h[x] = 2 + 1.5 * Math.sin(x / 5 + a);
	return h.map(v => Math.max(0, Math.round(v)));
}

/** The background of a card's scene, drawn into a W x H canvas context. */
export function paintBack(ctx, cardType, seed, plain) {
	const name = themeOf(cardType), T = THEMES[name], r = rng(seed), L = lookOf(T, name, r());
	const img = ctx.createImageData(W, H), d = img.data, hz = Math.round(H * (0.52 + r() * 0.08));
	const put = (x, y, c) => { if (x < 0 || y < 0 || x >= W || y >= H) return; const i = (y * W + x) * 4; d[i] = c[0]; d[i + 1] = c[1]; d[i + 2] = c[2]; d[i + 3] = 255; };
	const pick = (pal, t, x, y) => { const f = Math.max(0, Math.min(pal.length - 1.001, t * (pal.length - 1))), lo = Math.floor(f); return pal[f - lo > (BAYER[(y & 3) * 4 + (x & 3)] + 0.5) / 16 ? lo + 1 : lo]; };
	// the sky, dithered from one colour to the next
	for (let y = 0; y < hz; y++) for (let x = 0; x < W; x++) put(x, y, pick(L.sky, y / hz, x, y));
	// what is in it
	if (T.bits === 'stars' || T.orb === 'moon') for (let i = 0; i < 46; i++) { const x = Math.floor(r() * W), y = Math.floor(r() * hz * 0.8); put(x, y, L.orb[0]); if (r() < 0.2) { put(x + 1, y, L.orb[1]); put(x - 1, y, L.orb[1]); put(x, y + 1, L.orb[1]); put(x, y - 1, L.orb[1]); } }
	if (T.orb === 'sun' || T.orb === 'moon') { const cx = Math.round(W * (0.2 + r() * 0.6)), cy = Math.round(hz * (0.22 + r() * 0.3)), R = T.orb === 'sun' ? 9 : 7;
		for (let y = -R; y <= R; y++) for (let x = -R; x <= R; x++) { const q = x * x + y * y; if (q <= R * R) put(cx + x, cy + y, T.orb === 'moon' && (x - 3) * (x - 3) + (y + 2) * (y + 2) < (R - 2) * (R - 2) ? L.orb[0] : q > (R - 2) * (R - 2) ? L.orb[1] : L.orb[0]); } }
	if (T.orb === 'bolts') for (let n = 0; n < 2; n++) { let x = Math.round(W * (0.15 + r() * 0.7)), y = 0; while (y < hz - 6) { const len = 4 + Math.floor(r() * 7), dx = r() < 0.5 ? -1 : 1; for (let i = 0; i < len; i++) { put(x, y, L.orb[0]); put(x + 1, y, L.orb[1]); y++; if (i % 2) x += dx; } } }
	for (let n = 0; n < T.clouds; n++) { const cx = Math.floor(r() * W), cy = Math.floor(hz * (0.1 + r() * 0.45)), w = 10 + Math.floor(r() * 16), c = L.sky[L.sky.length - 1];
		for (let x = -w; x <= w; x++) { const hh = Math.round(3.4 * Math.sqrt(1 - (x * x) / (w * w)) + (x % 5 === 0 ? 1 : 0)); for (let y = 0; y < hh; y++) if ((x + y) % 2 || y < hh - 1) put(cx + x, cy - y, c); } }
	// the two ranges, far and near
	const hf = range(T.far, r, hz * 0.34), hn = range(T.near, r, hz * 0.2);
	for (let x = 0; x < W; x++) { for (let y = 0; y < hf[x]; y++) put(x, hz - 1 - y, y > hf[x] - 3 && ((x + y) & 1) ? L.far[0] : y > hf[x] * 0.5 ? L.far[0] : L.far[1]); }
	for (let x = 0; x < W; x++) { for (let y = 0; y < hn[x]; y++) put(x, hz - 1 - y, y > hn[x] - 2 ? L.near[0] : L.near[1]); }
	if (T.far === 'skyline') for (let i = 0; i < 60; i++) { const x = Math.floor(r() * W), y = Math.floor(r() * hf[x]); if (y > 1 && y < hf[x] - 1 && x % 2) put(x, hz - 1 - y, L.orb[r() < 0.5 ? 0 : 1]); }
	// the ground
	for (let y = hz; y < H; y++) for (let x = 0; x < W; x++) {
		const t = (y - hz) / (H - hz);
		let c = pick(L.ground, t, x, y);
		if (T.near === 'waves') { const band = Math.floor((y - hz) / (2 + t * 6)); if ((band & 1) && ((x + band * 7 + Math.round(3 * Math.sin(y / 3))) % 9 < 5)) c = L.ground[0]; }
		put(x, y, c);
	}
	// small things on the ground
	const bits = T.bits, n = bits === 'fog' ? 0 : 34;
	for (let i = 0; i < n; i++) {
		const x = Math.floor(r() * W), y = hz + 3 + Math.floor(r() * (H - hz - 6));
		if (bits === 'flowers') { put(x, y, L.near[1]); put(x, y - 1, L.near[0]); if (r() < 0.35) { put(x, y - 2, L.orb[0]); put(x - 1, y - 2, L.orb[1]); put(x + 1, y - 2, L.orb[1]); } }
		else if (bits === 'embers') { const yy = Math.floor(r() * H); put(x, yy, L.orb[r() < 0.5 ? 0 : 1]); if (r() < 0.3) put(x + 1, yy, L.orb[1]); }
		else if (bits === 'foam') { for (let k = 0; k < 3 + Math.floor(r() * 4); k++) put(x + k, y, L.sky[L.sky.length - 1]); }
		else if (bits === 'sparks') { put(x, y, L.orb[0]); put(x + 1, y - 1, L.orb[1]); put(x - 1, y + 1, L.orb[1]); }
		else if (bits === 'rocks') { put(x, y, L.near[1]); put(x + 1, y, L.near[1]); put(x, y - 1, L.near[0]); put(x + 1, y - 1, L.far[0]); }
		else if (bits === 'rivets') { if (y % 6 === 0) for (let k = 0; k < W; k += 2) put(k, y, L.near[0]); else { put(x, y, L.near[1]); put(x + 1, y, L.sky[L.sky.length - 1]); } }
		else if (bits === 'stars') { put(x, y, L.near[0]); put(x, y - 1, L.orb[1]); }
	}
	if (bits === 'fog') for (let y = hz - 8; y < hz + 14; y += 3) for (let x = 0; x < W; x++) if (((x + y * 3 + Math.round(4 * Math.sin(x / 9 + y))) % 5) < 2) put(x, y, L.sky[L.sky.length - 1]);
	// (the picture tube: red a pixel to the right, blue a pixel to the left)
	const src = new Uint8ClampedArray(d);
	if (!plain) for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const i = (y * W + x) * 4; if (x > 0) d[i] = src[i - 4]; if (x < W - 1) d[i + 2] = src[i + 6]; }
	ctx.putImageData(img, 0, 0);
	return { horizon: hz, look: L };
}

/** The front layer: the Pokémon (its sprite, trimmed to what is drawn in it and scaled with hard pixels), its shadow,
 *  and a few things in front of it. `big`: an immersive card's Pokémon is larger than the card. */
export function paintFront(ctx, sprite, cardType, seed, big) {
	const name = themeOf(String(cardType).split('+')[0]), T = THEMES[name], r = rng(seed + ':f'), L = lookOf(T, name, rng(seed)());
	ctx.clearRect(0, 0, W, H); ctx.imageSmoothingEnabled = false;
	// trim the sprite to its own pixels
	const t = document.createElement('canvas'); t.width = sprite.naturalWidth || sprite.width; t.height = sprite.naturalHeight || sprite.height;
	const tc = t.getContext('2d', { willReadFrequently: true }); tc.drawImage(sprite, 0, 0);
	const px = tc.getImageData(0, 0, t.width, t.height).data; let x0 = t.width, y0 = t.height, x1 = -1, y1 = -1;
	for (let y = 0; y < t.height; y++) for (let x = 0; x < t.width; x++) if (px[(y * t.width + x) * 4 + 3] > 20) { if (x < x0) x0 = x; if (x > x1) x1 = x; if (y < y0) y0 = y; if (y > y1) y1 = y; }
	if (x1 < 0) return;
	const sw = x1 - x0 + 1, sh = y1 - y0 + 1, maxW = big ? W * 1.02 : W * 0.84, maxH = big ? H * 0.66 : H * 0.52;
	// (not in the same place and at the same size on every card)
	const k = Math.min(maxW / sw, maxH / sh) * (big ? 1 : 0.86 + r() * 0.14), dw = Math.round(sw * k), dh = Math.round(sh * k), foot = Math.round(H * (big ? 0.74 : 0.66 + r() * 0.06)), cx = Math.round(W / 2 + (big ? 0 : (r() - 0.5) * Math.max(0, W - dw - 8))), dx = cx - Math.round(dw / 2), dy = foot - dh;
	// its shadow: a dithered ellipse on the ground
	const sc = `rgb(${L.ground[L.ground.length - 1].map(v => Math.round(v * 0.45)).join(',')})`; ctx.fillStyle = sc;
	for (let y = -4; y <= 4; y++) for (let x = -Math.round(dw * 0.42); x <= dw * 0.42; x++) if ((x * x) / (dw * dw * 0.18) + (y * y) / 16 <= 1 && ((x + y) & 1)) ctx.fillRect(cx + x, foot - 1 + y, 1, 1);
	ctx.drawImage(t, x0, y0, sw, sh, dx, dy, dw, dh);
	// a few things in front of it, at the bottom
	const near = `rgb(${L.near[1].join(',')})`, lit = `rgb(${L.near[0].join(',')})`;
	for (let i = 0; i < 10; i++) { const x = Math.floor(r() * W), y = H - 2 - Math.floor(r() * 16), hgt = 3 + Math.floor(r() * 6); ctx.fillStyle = near; ctx.fillRect(x, y - hgt, 1, hgt); ctx.fillRect(x + 1, y - hgt + 2, 1, hgt - 2); ctx.fillStyle = lit; ctx.fillRect(x - 1, y - hgt + 1, 1, hgt - 1); }
}

// ---- drawing the scenes of the cards on the page. A scene is drawn once and kept; every card that shows it copies it.
const backs = new Map(), fronts = new Map(), sprites = new Map();
function loadSprite(url) { if (!sprites.has(url)) sprites.set(url, new Promise(res => { const i = new Image(); i.onload = () => res(i); i.onerror = () => res(null); i.src = url; })); return sprites.get(url); }
/** A card's background. A Pokémon printed with two types ("Water+Darkness") has both scenes, split on the slant the card is split on, with a white seam. */
function backOf(type, seed) {
	const [a, b] = String(type).split('+'), o = document.createElement('canvas'); o.width = W; o.height = H; const g = o.getContext('2d');
	paintBack(g, a, seed);
	if (b) {
		const o2 = document.createElement('canvas'); o2.width = W; o2.height = H; paintBack(o2.getContext('2d'), b, seed + ':2');
		g.save(); g.beginPath(); g.moveTo(W * 0.6, 0); g.lineTo(W, 0); g.lineTo(W, H); g.lineTo(W * 0.4, H); g.closePath(); g.clip(); g.drawImage(o2, 0, 0); g.restore();
		g.fillStyle = '#fff'; for (let y = 0; y < H; y++) g.fillRect(Math.round(W * 0.6 - (W * 0.2) * (y / H)) - 1, y, 2, 1);
	}
	return o;
}
/** Fill every scene canvas under `root` that has not been drawn yet (main.js calls this as cards are added to the page). */
export function paintScenes(root) {
	for (const c of root.querySelectorAll('canvas.s8:not([data-ok])')) {
		c.dataset.ok = '1';
		const [layer, type, seed, big, url] = c.dataset.s8.split('|'), ctx = c.getContext('2d'), key = c.dataset.s8;
		if (layer === 'bg') { if (!backs.has(key)) backs.set(key, backOf(type, seed)); ctx.drawImage(backs.get(key), 0, 0); continue; }
		if (fronts.has(key)) { ctx.drawImage(fronts.get(key), 0, 0); continue; }
		loadSprite(url).then(img => { if (!img) return; if (!fronts.has(key)) { const o = document.createElement('canvas'); o.width = W; o.height = H; paintFront(o.getContext('2d'), img, type, seed, big === '1'); fronts.set(key, o); } if (c.isConnected) { ctx.clearRect(0, 0, W, H); ctx.drawImage(fronts.get(key), 0, 0); c.dataset.ok = '2'; } });
	}
}
/** The two canvases of a card's scene, as markup. */
export const sceneHtml = (cardType, seed, big, spriteUrl) => `<canvas class="s8 bg" width="${W}" height="${H}" data-s8="bg|${cardType}|${seed}" aria-hidden="true"></canvas><canvas class="s8 fg" width="${W}" height="${H}" data-s8="fg|${cardType}|${seed}|${big ? 1 : 0}|${spriteUrl}" aria-hidden="true"></canvas>`;
