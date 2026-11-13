// divelight.js — MicaSurvivor 3D, Dive part 14 (Plans/MICASURVIVOR_3D_PLAN.md §5.67): the dark routes.
// The 2D Dive fills the view with the route's darkness (js/expedition/dive-art.js ROUTES' `dim`: [r, g, b, a]) and cuts a
// hole in it for your lamp. In 3D the same thing is the air itself: the darker the route, the nearer and the more
// coloured the fog, so what is close is lit (your lamp) and the rest of the floor is lost in the route's dark; and the
// edges of the screen are tinted with it (the 2D game's vignette). A lit route (the woods, the canyon, the Route of
// Origin) is the 3D game's own sky, untouched.
// (plan 3e) A route's FLOOR can be its own too (LOOK: the Ember Crater is basalt and lava, the 2D game's palette; the
// other routes keep the 3D game's ground), and two of the 2D light map's other lights are here: the lava flickers
// (lavaAt) and glows through the dark, and the landmark has a glow on the ground round it (glowAt).
// Pure: the page (main.js) applies what lightOf returns (render.js setFog, a vignette over the canvas).

/** The routes' darkness: the 2D game's own numbers (a test reads them from dive-art.js). null: a lit route. */
export const DIM = { forest: null, marsh: [14, 24, 16, 0.5], fungal: [26, 14, 36, 0.6], canyon: null, crater: [44, 16, 34, 0.74], reef: [6, 22, 44, 0.38], grotto: [16, 30, 48, 0.24], ruins: [22, 18, 26, 0.12], origin: null };
export const LK = {
	NEAR: 6, FAR: 26,   // the fog of the darkest air there could be (a = 1 / K): metres. Your lamp reaches about a dozen tiles
	K: 1.25,            // how fast the route's alpha takes the air to that
	VIGNETTE: 0.75,     // the screen edges' tint: the route's alpha x this
};
const lerp = (a, b, k) => a + (b - a) * k;

/** The air of a route. base: { color: 0xRRGGBB, near, far } (the 3D game's sky and fog).
 *  -> { color, near, far, vignette: css colour | null, dark: 0..1 (how far toward the darkest) } */
export function lightOf(route, base) {
	const d = DIM[route];
	if (!d) return { color: base.color, near: base.near, far: base.far, vignette: null, dark: 0 };
	const k = Math.min(1, d[3] * LK.K), br = (base.color >> 16) & 255, bg = (base.color >> 8) & 255, bb = base.color & 255;
	const r = Math.round(lerp(br, d[0], k)), g = Math.round(lerp(bg, d[1], k)), b = Math.round(lerp(bb, d[2], k));
	return { color: (r << 16) | (g << 8) | b, near: lerp(base.near, LK.NEAR, k), far: lerp(base.far, LK.FAR, k), vignette: `rgba(${d[0]},${d[1]},${d[2]},${+(d[3] * LK.VIGNETTE).toFixed(3)})`, dark: k };
}

/** A route's own floor: the colours render.js builds the room with (the 2D game's dive-art.js palette for it). A route
 *  not here has the 3D game's ground. top / slope / bed: the two checker shades; liquid: its sheet; map: the minimap's. */
export const LOOK = {
	crater: { top: [0x3c2127, 0x321b21], slope: [0x523034, 0x47282d], side: 0x1c1014, rim: 0x130a0e, bed: [0x5a1608, 0x3a0c06],
		liquid: { name: 'lava', color: 0xd04e12, hot: 0xf07a22, cool: 0xa8340c, opacity: 0.94, glow: true },
		map: { rim: '#08040a', liquid: '#d04e12', ground: [0x3c, 0x21, 0x27], slope: '#523034' } },
};
export const lookOf = (route) => LOOK[route] || null;
export const GLOW = { R: 3.2, EVERY: 0.3, LIFE: 0.6, F: 1.6, A: 0.2 };   // (A: each layer's opacity as it is laid down; two overlap, each fading: a soft pool, not a disc)   // the landmark's glow: metres, how often it is laid down, how long each lasts, its beat
/** The lava at time t (seconds): its colour between `cool` and `hot`, and its opacity. calm: no flicker (the 2D game's setting). */
export function lavaAt(look, t, calm = false) {
	const q = look && look.liquid; if (!q || !q.glow) return null;
	const k = calm ? 0.5 : 0.5 + 0.5 * Math.sin(t * 2.3) * Math.sin(t * 0.77 + 1.7);
	const ch = (sh) => Math.round(lerp((q.cool >> sh) & 255, (q.hot >> sh) & 255, k));
	return { color: (ch(16) << 16) | (ch(8) << 8) | ch(0), opacity: calm ? q.opacity : q.opacity - 0.1 + 0.1 * k, k };
}
/** The landmark's glow at time t: the radius of the disc of light on the ground round it (it breathes). */
export const glowAt = (t, calm = false) => GLOW.R * (calm ? 1 : 0.9 + 0.1 * Math.sin(t * GLOW.F));
