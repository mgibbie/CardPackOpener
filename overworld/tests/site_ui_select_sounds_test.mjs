// site_ui_select_sounds_test.mjs — every drop-down (<select>) a visitor uses makes Balatro's sound when a choice is
// picked (owner, 2026-11-19: every UI in the Balatro style, "include button press type sound effects"). A click on a
// <select> opens the browser's own list, which does not reliably send the page a click, so the kit's buttons-only
// wiring left them silent: the kit (site/ui/sfx.js wire, for .bal-select), the site pages' wiring (site/pagesounds.js,
// any <select>) and Battlecards' (battlecards/bal-ui.js, any <select>) now sound a pick on its 'change'.
// For each page (desktop 1600x900): nothing plays before a gesture; picking another option (as a mouse or the keyboard
// does: the select's 'change') plays Micatro's highlight1.ogg; the pick still does its job (the value changes); with
// sounds off (Micatro's micatro_sfx = '0') it is silent; a select in a kit-wired page sounds once, not twice.
//   node overworld/tests/site_ui_select_sounds_test.mjs
// Covers site/ui/sfx.js, site/pagesounds.js, battlecards/bal-ui.js.
import { makeAsserter, startServer, launch, waitFor, sleep, VIEWPORTS } from './bc_balatro_lib.mjs';

const R = makeAsserter(), A = R.A;
const STATE = { username: 'tester', friendCode: 'ABCD1234', collection: { c1: 2 }, decks: [], packs: 0, dust: 10 };
const { server, port } = await startServer({ onApi: (b) => (b.action === 'state' ? { state: STATE } : null) });
const browser = await launch();
// [name, url, select, wiring]
const PAGES = [
	['style guide', '/site/ui/', '#sg-sel', 'sfx.wire (.bal-select)'],
	['watch', '/watch/', '#live-order', 'pagesounds + sfx.wire (.bal-select)'],
	['collection', '/collection/', '#f-sort', 'pagesounds'],
	['report a bug', '/bugs/', '#severity', 'pagesounds'],
	['deck builder', '/battlecards/deck.html', '#sort-by', 'bal-ui'],
	['card gallery', '/battlecards/viewer.html', '#rarity-filter', 'bal-ui'],
];
const SPY = (off) => {
	window.__au = { starts: [] };
	const AC = window.AudioContext;
	if (AC) { const st = AudioBufferSourceNode.prototype.start; AudioBufferSourceNode.prototype.start = function (...a) { window.__au.starts.push(this.buffer ? this.buffer.length : -1); return st.apply(this, a); }; }
	try { localStorage.setItem('micatro_sfx', off ? '0' : '1'); localStorage.setItem('mp_onboarded_v1', '1');
		localStorage.setItem('magepunk_mp_token_v1', 'tester.9999999999.' + 'a'.repeat(64)); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'tester' })); } catch { }
};
try {
	let LEN = null;
	for (const [name, url, sel, how] of PAGES) for (const off of [false, true]) {
		const tag = `${name}${off ? ' (sounds off)' : ''}`;
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport(VIEWPORTS.desktop);
		const errors = [];
		page.on('pageerror', (e) => errors.push(e.message));
		await page.evaluateOnNewDocument(SPY, off);
		await page.goto(`http://localhost:${port}${url}`, { waitUntil: 'load', timeout: 60000 });
		const there = await waitFor(() => page.evaluate((s) => { const e = document.querySelector(s); return e && e.options.length > 1 && e.getClientRects().length > 0; }, sel), 20000);
		A(there, `${tag}: its drop-down ${sel} is on the page`);
		if (!there) { await ctx.close(); continue; }
		await sleep(800);   // (the page's own scripts wire up)
		if (!LEN) LEN = await page.evaluate(async () => { const ac = new AudioContext(); const b = await (await fetch('/micatro/assets/sounds/highlight1.ogg')).arrayBuffer(); const n = (await ac.decodeAudioData(b)).length; ac.close(); return n; });
		A(await page.evaluate(() => window.__au.starts.length === 0), `${tag}: nothing plays before a gesture`);
		await page.keyboard.down('Shift'); await page.keyboard.up('Shift'); await sleep(700);   // (the first gesture unlocks audio)
		const before = await page.evaluate((s) => document.querySelector(s).value, sel);
		const pick = await page.evaluate((s) => { const e = document.querySelector(s); return [...e.options].map((o) => o.value).find((v) => v !== e.value); }, sel);
		const n0 = await page.evaluate(() => window.__au.starts.length);
		await page.select(sel, pick);   // (a pick: sets the value and sends 'change', as the browser's list does)
		await sleep(900);
		const played = await page.evaluate((n) => window.__au.starts.slice(n), n0);
		const after = await page.evaluate((s) => document.querySelector(s).value, sel);
		A(after === pick && after !== before, `${tag}: the pick still changes the choice`, JSON.stringify([before, after]));
		if (off) A(played.length === 0, `${tag}: silent with Micatro's sound setting off`, JSON.stringify(played));
		else {
			A(played.includes(LEN), `${tag}: picking a choice plays Micatro's highlight1.ogg (${how})`, JSON.stringify({ played, want: LEN }));
			A(played.length === 1, `${tag}: one sound for one pick, not two`, JSON.stringify(played));
		}
		A(!errors.length, `${tag}: no page errors`, errors.slice(0, 3).join(' | '));
		await ctx.close();
	}
} catch (e) {
	A(false, 'threw ' + (e && e.stack || e));
} finally {
	await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
