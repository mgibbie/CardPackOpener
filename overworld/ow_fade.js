// ow_fade.js — the warp/door screen fade: fadeTo(), the fade state the renderer draws, and fading() for input gating (split from main.js).


// ---------- screen fade (warp/door transitions) ----------
// Warps used to hard-cut between maps. A short fade-to-black on the way out and
// a fade-in on the new map reads instantly more finished. The main tick BAILS
// while `loading` is true, so the fade animates in the loading=false windows on
// either side of the load: fadeTo(1) (out) → set loading + swap the map →
// fadeTo(0) (in). While a fade runs, `fading` freezes input via menuBlocking so
// no stray step slips through the black. Honors REDUCED_MOTION (instant cut).
export const REDUCED_MOTION_OW = typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
export const fade = { alpha: 0, target: 0 };
export const FADE_SPEED = 6; // alpha units/sec (~170ms each way)
export const fading = () => fade.alpha > 0.001 || fade.target > 0.001;
export function fadeTo(target) {
	if (REDUCED_MOTION_OW) { fade.alpha = target; fade.target = target; return Promise.resolve(); }
	fade.target = target;
	return new Promise(res => {
		const check = () => {
			if (Math.abs(fade.alpha - fade.target) < 0.02) { fade.alpha = fade.target; res(); }
			else requestAnimationFrame(check);
		};
		check();
	});
}
