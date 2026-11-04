// micasurvivor_expedition_forceload.mjs — a node --import preload (NOT a suite) for MicaSurvivor DLC D0b: it makes the
// UNCHANGED D0a golden-run test (micasurvivor_dlc_base_unchanged_test.mjs) force-load the Expedition code into every
// page before that page's base-mode sim or replay playback starts:
//   node --import ./overworld/tests/micasurvivor_expedition_forceload.mjs overworld/tests/micasurvivor_dlc_base_unchanged_test.mjs
// It wraps puppeteer-core's launch -> browser contexts -> pages, and before the first page.evaluate that runs the
// D0a sim (`__golden.sim(`) or replay player (`__golden.play(`) it awaits G.Expedition.load() in that page (the
// base tables frozen, js/expedition/* injected, G.Exp.init() attached to the G.Hooks seams). Each load prints
// `forceload: ok <n> <ms> <objects>`; a page whose load failed prints `forceload: FAIL ...`.
// The run must still match the D0a fixtures exactly: loading the Expedition code does not leak into the base modes.
// micasurvivor_expedition_forceload_test.mjs runs this and checks both.
import puppeteer from 'puppeteer-core';

let n = 0;
const wrapPage = (page) => {
	const evaluate = page.evaluate.bind(page);
	let loaded = false;
	page.evaluate = async (fn, ...args) => {
		const src = typeof fn === 'function' ? fn.toString() : String(fn);
		if (!loaded && /__golden\.(sim|play)\(/.test(src)) {
			loaded = true;
			const r = await evaluate(async () => {
				try {
					const t0 = Date.now(); await G.Expedition.load(); window.__expLoadMs = Date.now() - t0;
					return { ok: G.Expedition.loaded && !!G.Exp && G.Exp.inited, ms: window.__expLoadMs, frozen: G.Expedition.frozen, seams: G.Hooks.SEAMS.map(s => G.Hooks.count(s)),
						scripts: [...document.querySelectorAll('script[data-expedition]')].map(s => s.getAttribute('src')) };
				} catch (e) { return { ok: false, error: String(e && e.message || e) }; }
			});
			n++;
			console.log(r.ok ? `forceload: ok ${n} loaded in ${r.ms} ms, freeze ${r.frozen.ms} ms, ${r.frozen.objects} objects frozen · seams ${r.seams.join('/')} · ${r.scripts.join(' ')}` : `forceload: FAIL ${n} ${JSON.stringify(r)}`);
		}
		return evaluate(fn, ...args);
	};
	return page;
};
const launch = puppeteer.launch.bind(puppeteer);
puppeteer.launch = async (...a) => {
	const browser = await launch(...a);
	const cbc = browser.createBrowserContext.bind(browser);
	browser.createBrowserContext = async (...b) => {
		const ctx = await cbc(...b);
		const np = ctx.newPage.bind(ctx);
		ctx.newPage = async (...c) => wrapPage(await np(...c));
		return ctx;
	};
	const np = browser.newPage.bind(browser);
	browser.newPage = async (...c) => wrapPage(await np(...c));
	return browser;
};
