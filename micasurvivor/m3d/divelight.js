// divelight.js — MicaSurvivor 3D, Dive part 14 (Plans/MICASURVIVOR_3D_PLAN.md §5.67): the dark routes.
// The 2D Dive fills the view with the route's darkness (js/expedition/dive-art.js ROUTES' `dim`: [r, g, b, a]) and cuts a
// hole in it for your lamp. In 3D the same thing is the air itself: the darker the route, the nearer and the more
// coloured the fog, so what is close is lit (your lamp) and the rest of the floor is lost in the route's dark; and the
// edges of the screen are tinted with it (the 2D game's vignette). A lit route (the woods, the canyon, the Route of
// Origin) is the 3D game's own sky, untouched.
// Not here: the 2D light map's other holes (the landmark's glow, the lava's flicker).
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
