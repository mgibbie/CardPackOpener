// modal_tip_persist_smoke.mjs — a card you must CHOOSE between has to keep
// explaining itself after its art loads.
//
// Reported: "When you scry there is no zoom text. Same with discovering."
//
// CAUSE. openScryModal and openPickModal both attachTip() their faces, and the
// source guard in tests/unit/modal_card_tips_test.mjs confirmed it — but they are
// also the only two modals that call wireModalArt(), whose repaint did:
//
//     const fresh = drawCardFace(en.def);
//     en.cell.replaceChild(fresh, en.cell.firstChild);
//
// A brand-new canvas, swapped in over the one the tip listeners were bound to.
// The listeners went to the garbage collector with the old element. That repaint
// is not rare: cardart fires artListeners('*') when the MANA FONT loads, so every
// scry and every Discover lost its tips within a frame or two of opening.
//
// This is exactly the regression a source guard cannot see — attachTip is still
// called, on an element that is no longer in the document. Hence a live test:
// open the real modal, long-press a real card, force the repaint, press again.
//
// Standalone (headless Chrome + puppeteer-core); NOT in run-all.
//   node battlecards/tests/integration/modal_tip_persist_smoke.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8877;
const STATE = { username: 'tips', friendCode: 'TIPS00', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf' };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = await new Promise(r => {
	const s = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
		const f = u.endsWith('/') ? u + 'index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	s.listen(PORT, () => r(s));
});

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	await page.setViewport({ width: 1280, height: 720 });
	await page.evaluateOnNewDocument(st => { localStorage.setItem('magepunk_mp_token_v1', 'tips'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }, STATE);
	await page.goto(`http://localhost:${PORT}/battlecards/index.html?players=2`, { waitUntil: 'domcontentloaded' });
	const t0 = Date.now();
	while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__game && window.__game.state)).catch(() => false))) await sleep(200);
	A(await page.evaluate(() => !!window.__game?.state), 'booted');
	await sleep(2200);
	await page.evaluate(() => { const b = [...document.querySelectorAll('button')].find(x => /keep hand/i.test(x.textContent)); if (b) { b.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true })); b.click(); } });
	await sleep(900);

	// ---------- helpers ----------
	// three real cards that carry rules text, so an empty tip is unambiguous
	const pickIds = () => page.evaluate(() => {
		const s = window.__game.state;
		return Object.values(s.cardsById)
			.filter(c => c && c.description && c.description.length > 12 && !c.token && c.type === 'creature')
			.slice(0, 3).map(c => c.id);
	});
	// attachTip's touch path: pointerdown, hold past its 350ms threshold, read the tip
	const longPress = async () => {
		const got = await page.evaluate(() => {
			const c = document.querySelector('#scry-modal .scry-cell canvas');
			if (!c) return null;
			const r = c.getBoundingClientRect();
			c.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch', clientX: r.left + r.width / 2, clientY: r.top + r.height / 2 }));
			return true;
		});
		if (!got) return { ok: false, why: 'no card face in the modal' };
		await sleep(520);
		return page.evaluate(() => {
			const t = document.getElementById('mini-tip');
			const shown = !!t && getComputedStyle(t).display !== 'none';
			const text = t ? (t.textContent || '').trim() : '';
			// dismiss for the next probe (anything that is not a canvas hides it)
			document.body.dispatchEvent(new PointerEvent('pointerdown', { bubbles: true, pointerType: 'touch' }));
			return { ok: shown && text.length > 0, shown, chars: text.length, sample: text.slice(0, 40) };
		});
	};
	// the repaint the bug rode in on. cardart fires this for real when an image or
	// the mana font lands; '*' is the same broadcast the font uses.
	const repaint = () => page.evaluate(async () => {
		const m = await import('/battlecards/cardart.js');   // same URL => same module instance
		let n = 0; for (const fn of m.artListeners) { fn('*'); n++; }
		return n;
	});

	// ---------- scry ----------
	{
		const ids = await pickIds();
		await page.evaluate(ids => {
			const g = window.__game, s = g.state;
			s.current = g.HUMAN; s.priority = null; s.stack = [];
			s.scryQueue.push({ chooser: g.HUMAN, deckOwner: g.HUMAN, ids });
			g.pump();
		}, ids);
		await sleep(900);
		A(await page.evaluate(() => getComputedStyle(document.getElementById('scry-modal')).display !== 'none'), 'scry: the modal is open');
		const before = await longPress();
		A(before.ok, 'scry: a long-press on a card shows its rules', JSON.stringify(before));
		const fired = await repaint();
		A(fired > 0, 'scry: the art repaint actually ran', fired + ' listeners');
		await sleep(200);
		const after = await longPress();
		A(after.ok, 'scry: and it STILL shows them after the art repaint', JSON.stringify(after));
		await page.evaluate(() => { window.__game.state.scryQueue.length = 0; document.getElementById('scry-modal').style.display = 'none'; });
	}

	// ---------- discover ----------
	{
		const ids = await pickIds();
		await page.evaluate(ids => {
			const g = window.__game, s = g.state;
			s.current = g.HUMAN; s.priority = null; s.stack = [];
			s.pickQueue.push({ player: g.HUMAN, ids });
			g.pump();
		}, ids);
		await sleep(900);
		A(await page.evaluate(() => getComputedStyle(document.getElementById('scry-modal')).display !== 'none'), 'discover: the modal is open');
		const before = await longPress();
		A(before.ok, 'discover: a long-press on a card shows its rules', JSON.stringify(before));
		await repaint();
		await sleep(200);
		const after = await longPress();
		A(after.ok, 'discover: and it STILL shows them after the art repaint', JSON.stringify(after));
	}

	// ---------- the invariant, at the source ----------
	{
		const src = fs.readFileSync(path.join(ROOT, 'battlecards/game.js'), 'utf8');
		const i = src.indexOf('function wireModalArt');
		const body = src.slice(i, src.indexOf('\n}', i));
		A(/attachTip\(fresh/.test(body), 'the repaint re-binds the tip to the element it just swapped in');
	}
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
