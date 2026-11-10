// micatro_keys_lib.mjs — keyboard helpers for the Micatro browser suites (controls sweep B5). Not a suite (no _test suffix).
//
// keyWalk(page, target): walk Micatro's reticle (micatro/js/ui/pad.js, driven from the keyboard by site/input.js) onto a card
// (its id) or the first element matching a selector, with the ARROW keys only, and say whether it got there. Each step reads
// where the reticle is and presses the arrow pointing at the target (the larger of the two offsets). `press(arrow)` swaps the
// keyboard for another input (a fake controller's d-pad): it gets 'ArrowUp' | 'ArrowDown' | 'ArrowLeft' | 'ArrowRight'.
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));

export async function keyWalk(page, target, { steps = 40, pause = 90, press: pressFn = null } = {}) {
	for (let i = 0; i < steps; i++) {
		const step = await page.evaluate((t) => {
			const P = window.__micatroPad, f = P && P.focus;
			const tgt = typeof t === 'number' ? document.querySelector(`.card[data-id="${t}"]`) : document.querySelector(t);
			if (!tgt) return 'missing';
			const ring = document.querySelector('.pad-reticle');
			if (!f || !ring || ring.style.display === 'none') return 'show';
			const fe = f.card != null ? document.querySelector(`.card[data-id="${f.card}"]`) : f.el;
			if (!fe) return 'show';
			if (fe === tgt) return 'done';
			const a = fe.getBoundingClientRect(), b = tgt.getBoundingClientRect();
			const dx = (b.left + b.width / 2) - (a.left + a.width / 2), dy = (b.top + b.height / 2) - (a.top + a.height / 2);
			return Math.abs(dx) > Math.abs(dy) ? (dx > 0 ? 'ArrowRight' : 'ArrowLeft') : (dy > 0 ? 'ArrowDown' : 'ArrowUp');
		}, target);
		if (step === 'done') return true;
		if (step === 'missing') { await sleep(150); continue; }
		const k = step === 'show' ? 'ArrowRight' : step;
		if (pressFn) await pressFn(k); else await page.keyboard.press(k);
		await sleep(pause);
	}
	return false;
}

/** The reticle's focus, flattened: {card, area} | {cls} | null. */
export const keyFocus = (page) => page.evaluate(() => { const f = window.__micatroPad && window.__micatroPad.focus; return f ? (f.card != null ? { card: f.card, area: f.area } : { cls: String(f.cls) }) : null; });

/** Press a key (by code), let the game settle. */
export async function press(page, code, ms = 160) { await page.keyboard.press(code); await sleep(ms); }
