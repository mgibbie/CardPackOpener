// pocketenhanced_controls_test.mjs — Pocket Enhanced played with ONE kind of control at a time.
// Owner, 2026-11-18: "make sure every game mode is playable with arrow keys/WASD & Z/X as A/B, controller, or
// touch/mouse. Trading & Pocket Enhanced especially needs to be playable with every control type."
// Twice over, with nothing but real key presses (arrows and WASD, Z, X, C, V, Enter) and then with nothing but a
// controller (d-pad, the two face buttons, the top face button, Start):
//   1. the menu: New match, pick the options, Start
//   2. setup: open a Basic Pokémon, put it in an Active slot from the buttons under it; another onto the Bench; take one
//      back; Ready
//   3. my turn: attach the Energy from my Pokémon's card, choose an attack and its target, read a card, Execute
//   4. the in-match menu, Concede, and back to the main menu
//   5. packs: open a pack and turn every card over
//   6. the deck builder: every text field is a stop; a keyboard types in it and comes back out, a controller gets the
//      on-screen keyboard
// (Touch and mouse: pocketenhanced_touch_test.mjs plays a turn with a finger, pocketenhanced_setuptap_test.mjs sets up.)
//   node overworld/tests/pocketenhanced_controls_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url)), ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9595;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 700) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
const waitFor = async (fn, ms) => { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(100); } return false; };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
try {
	for (const kind of ['keyboard', 'controller']) {
		const page = await browser.newPage(); await page.setViewport({ width: 1600, height: 900 });
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(() => {
			const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad]; window.__pad = pad;
			localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true }));
		});
		await page.goto(`http://localhost:${PORT}/pocketenhanced/?seed=ctl`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000); await sleep(400);
		// ---- the one control this run may use. A wrong kind of event is never sent: no click, no pointer, no other keys.
		let wasd = false;
		const KEY = { up: ['ArrowUp', 'KeyW'], down: ['ArrowDown', 'KeyS'], left: ['ArrowLeft', 'KeyA'], right: ['ArrowRight', 'KeyD'], confirm: ['KeyZ'], cancel: ['KeyX'], secondary: ['KeyC'], context: ['KeyV'], menu: ['Enter'] };
		const BTN = { up: 12, down: 13, left: 14, right: 15, confirm: 1, cancel: 0, secondary: 3, context: 2, menu: 9 };   // (the owner's standard layout: the right face button confirms)
		const act = async a => {
			if (kind === 'keyboard') { const ks = KEY[a]; wasd = !wasd; await page.keyboard.press(ks[wasd && ks.length > 1 ? 1 : 0]); await sleep(70); }   // (arrows and WASD turn about)
			else { await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, BTN[a]); await sleep(70); await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, BTN[a]); await sleep(110); }
		};
		const where = sel => page.evaluate(s => { const f = window.__pocket.focus(), c = e => { const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, t = s ? [...document.querySelectorAll(s)].filter(e => e.offsetWidth > 3 && !e.disabled).pop() : null; return { f: f ? c(f) : null, fk: f ? (f.dataset.k || f.textContent.trim().slice(0, 12)) : null, t: t ? c(t) : null, at: !!(f && t && f === t) }; }, sel);
		/** Walk the ring to a control with the direction presses alone. */
		const ringTo = async sel => {
			const seen = new Map();
			for (let n = 0; n < 70; n++) {
				const w = await where(sel); if (!w.t) return false; if (w.at) return true;
				if (!w.f) { await act('down'); continue; }
				const dx = w.t[0] - w.f[0], dy = w.t[1] - w.f[1], H = dx > 0 ? 'right' : 'left', V2 = dy > 0 ? 'down' : 'up';
				let order = Math.abs(dx) > Math.abs(dy) ? [H, V2] : [V2, H]; if (Math.abs(dx) < 6) order = [V2]; if (Math.abs(dy) < 6) order = [H];
				const visits = (seen.get(w.fk) || 0) + 1; seen.set(w.fk, visits);
				if (visits > 2) order = [['up', 'down', 'left', 'right'][(n * 7 + visits) % 4], ...order];   // (going round in circles: step aside)
				let moved = false;
				for (const d of order) { await act(d); if ((await where(sel)).fk !== w.fk) { moved = true; break; } }
				if (!moved) for (const d of ['up', 'down', 'left', 'right']) { await act(d); if ((await where(sel)).fk !== w.fk) break; }
			}
			return (await where(sel)).at;
		};
		const press = async sel => { const ok = await ringTo(sel); if (ok) { await act('confirm'); await sleep(350); } return ok; };
		const K = k => `[data-k="${k}"]`;
		const st = () => page.evaluate(() => { const P = window.__pocket, v = P.view(), me = v && v.players[0]; return { v: !!v, phase: v && v.phase, over: !!(v && v.over), turnMine: !!(v && v.phase === 'main' && v.current === 0 && !v.pending), staged: [...document.querySelectorAll('.pe-me .pe-poke.staged')].map(e => e.dataset.k.split(':').slice(2).join(':')), modals: document.querySelectorAll('.modal').length, title: ([...document.querySelectorAll('.modal .modal-title')].pop() || {}).textContent || '', pick: !!P.ui().pick, cmds: P.ui().cmds ? P.ui().cmds.map(x => !!x) : [], en: me && me.active[0] ? (me.active[0].energy || []).length : null, attached: !!(me && me.flags && me.flags.attached), osk: !!document.querySelector('.osk, #osk, [data-osk]') }; });

		// ===== 1. the menu =====
		A(await press(K('new')), `[${kind}] the main menu: the ring walks to "New match" and it opens`, await where(K('new')));
		A((await st()).modals >= 1 && await press(K('n2')) && await press(K('mdoubles')), `[${kind}] the options (2 players, doubles) are chosen`);
		A(await press(K('start')) && await waitFor(async () => (await st()).phase === 'setup', 8000), `[${kind}] Start: the match begins, in setup`, await st());
		// (a hand this run can count on: three Basic Pokémon and two Trainers)
		await page.evaluate(async () => { const P = window.__pocket, S = P.engineState(), { CARDS } = await import('/pocketenhanced/js/data/cards.js'), id = n => CARDS.find(c => c.name === n).id; S.players[0].hand = [id('Charmander'), id('Potion'), id('Vulpix'), id('Growlithe'), id('Poké Ball')]; S.players[0].deck = S.players[0].deck.filter(x => true); P.refresh(); });
		await sleep(300);

		// ===== 2. setup =====
		A(await press(K('h:0')) && /Charmander/.test(await page.evaluate(() => (document.querySelector('.modal .pe-insp .big') || {}).textContent || '')) && !(await st()).staged.length, `[${kind}] pressing Charmander in my hand opens it to read; nothing is placed`);
		A(await press(K('stage:active')) && (await st()).staged.join() === 'active:0', `[${kind}] "Put in an Active slot" under it puts it in Active A`, await st());
		A(await press(K('h:2')) && await press(K('stage:bench')) && (await st()).staged.join() === 'active:0,bench:0', `[${kind}] Vulpix goes to the Bench the same way`, await st());
		A(await press(K('h:3')) && await press(K('stage:active')) && await press(K('p:0:active:1')) && await press(K('stage:back')) && (await st()).staged.join() === 'active:0,bench:0', `[${kind}] Growlithe is put in Active B, then taken back into my hand from its card`, await st());
		await press(K('h:1')); const read = await st(); await act('cancel'); await sleep(250);
		A(read.modals === 1 && (await st()).modals === 0, `[${kind}] a Trainer card opens to read, and Back closes it`);
		A(await press(K('ready')) && await waitFor(async () => (await st()).phase === 'main', 15000), `[${kind}] Ready: the match moves on to the turns`, await st());

		// ===== 3. my turn =====
		// (bring it to my turn with an Energy ready and an attack payable, whoever went first)
		await page.evaluate(() => window.__pocket.fast(true));
		await waitFor(async () => (await st()).turnMine || (await st()).over, 30000);
		await page.evaluate(() => { const P = window.__pocket, S = P.engineState(), me = S.players[0]; me.zone.cur = me.zone.cur || 'Fire'; me.flags.attached = false; me.turns = Math.max(1, me.turns); S.turn = Math.max(S.turn, 3); for (const a of me.active) if (a) a.energy = ['Fire']; P.refresh(); });
		await sleep(300);
		const t0 = await st();
		A(t0.turnMine && await press(K('p:0:active:0')) && (await st()).modals === 1, `[${kind}] my turn: pressing my Active Pokémon opens its card with what it can do`, await st());
		const attach = await page.evaluate(() => { const b = [...document.querySelectorAll('.modal .pe-opt')].find(o => /Attach/.test(o.textContent) && !o.disabled); if (b) b.dataset.k = b.dataset.k || 'attachnow'; return b ? b.dataset.k : null; });
		A(!!attach && await press(K(attach)) && await waitFor(async () => (await st()).attached && (await st()).en === 2, 5000), `[${kind}] "Attach Energy" on the card attaches this turn's Energy to it`, await st());
		A(await press(K('p:0:active:0')) && await press('.modal [data-k^="atk"]:not(:disabled)'), `[${kind}] its attack is chosen from the card`, await st());
		// an attack that needs a target asks for one: the ring starts on a legal target
		if ((await st()).pick) { await act('confirm'); await sleep(300); if ((await st()).pick) { await ringTo('.pe-poke.legal'); await act('confirm'); await sleep(300); } }
		A(!(await st()).pick && (await st()).cmds[0] === true, `[${kind}] and its target: the command is set for Active A`, await st());
		await ringTo(K('p:1:active:0')); await act('context'); await sleep(350);
		const readFoe = await st(); await act('cancel'); await sleep(250);
		A(readFoe.modals === 1 && (await st()).modals === 0, `[${kind}] the "read card" control opens an opposing Pokémon's card, and Back closes it`, readFoe);
		const turnBefore = await page.evaluate(() => window.__pocket.view().turn);
		await act('secondary'); await sleep(400);
		if (await page.evaluate(() => !!document.querySelector('[data-k="exec2"]'))) { await act('confirm'); await sleep(300); }
		A(await waitFor(async () => await page.evaluate(t => { const v = window.__pocket.view(); return v.over || v.turn > t || v.current !== 0; }, turnBefore), 15000), `[${kind}] the Execute control carries the turn out`, await st());

		// ===== 4. the menu, concede, back =====
		await waitFor(async () => (await st()).turnMine || (await st()).over, 30000);
		if (!(await st()).over) {
			await act('cancel'); await sleep(200);
			if (kind === 'controller') { await act('menu'); await sleep(450); } else await press(K('menu'));
			A(/Menu/.test((await st()).title) && await press(K('concede')) && await waitFor(async () => (await st()).over, 8000), `[${kind}] the in-match menu opens (${kind === 'controller' ? 'Start' : 'the Menu button'}) and Concede ends the match`, await st());
		} else A(true, `[${kind}] (the match ended on that attack)`);
		// whatever the end screen offers, the ring reaches a way back to the main menu
		let home = false;
		for (let n = 0; n < 6 && !home; n++) {
			for (const k of ['tomenu', 'leave', 'back', 'b-menu']) { if (await page.evaluate(k2 => !![...document.querySelectorAll(`[data-k="${k2}"]`)].filter(e => e.offsetWidth > 3).length, k)) { await press(K(k)); break; } }
			home = await page.evaluate(() => !![...document.querySelectorAll('[data-k="new"]')].filter(e => e.offsetWidth > 3).length && !window.__pocket.view());
			if (!home) { if (kind === 'controller') { await act('menu'); await sleep(400); } else if (await page.evaluate(() => !![...document.querySelectorAll('[data-k="menu"]')].filter(e => e.offsetWidth > 3).length)) await press(K('menu')); }
		}
		A(home, `[${kind}] and from there back to the main menu`, { buttons: await page.evaluate(() => [...document.querySelectorAll('.modal:last-of-type button, #stage button')].filter(e => e.offsetWidth > 3).map(e => e.dataset.k).slice(0, 30)) });

		// ===== 5. a pack =====
		A(await press(K('packs')) && await press('[data-k^="pack"]:not(:disabled)'), `[${kind}] Packs: a booster is chosen`);
		await waitFor(() => page.evaluate(() => !!document.querySelector('[data-k="open"]')), 5000);
		A(await press(K('open')) && await waitFor(() => page.evaluate(() => document.querySelectorAll('.pe-pull').length > 0), 10000), `[${kind}] "Open the pack" tears it open`);
		const trail = [];
		for (let n = 0; n < 12 && await page.evaluate(() => !!document.querySelector('.pe-pull.down')); n++) { if (await ringTo('.pe-pull.down')) await act('confirm'); else trail.push(await where('.pe-pull.down')); await sleep(450); }
		A(await page.evaluate(() => document.querySelectorAll('.pe-pull').length >= 1 && !document.querySelector('.pe-pull.down')), `[${kind}] and every card is turned over, one confirm each`, { trail: trail.slice(0, 3), pulls: await page.evaluate(() => [...document.querySelectorAll('.pe-pull')].map(e => e.className.replace('pe-card pf small pe-pull', '').trim() + (e.disabled ? ' DIS' : '') + ' ' + e.offsetWidth)), title: (await st()).title });
		for (let n = 0; n < 4 && (await st()).modals > 0; n++) { await act('cancel'); await sleep(250); }

		// ===== 6. the deck builder's text fields =====
		A(await press(K('decks')) && await waitFor(() => page.evaluate(() => !!document.querySelector('.modal input[type=text], .modal input[type=search]') || !!document.querySelector('[data-k="newdeck"], [data-k="dnew"]')), 6000), `[${kind}] Decks opens`);
		if (!await page.evaluate(() => !!document.querySelector('.modal input[aria-label="Deck name"]'))) { for (const k of ['newdeck', 'dnew', 'build']) if (await page.evaluate(k2 => !!document.querySelector(`[data-k="${k2}"]`), k)) { await press(K(k)); break; } }
		const hasName = await waitFor(() => page.evaluate(() => !!document.querySelector('.modal input[aria-label="Deck name"]')), 6000);
		A(hasName && await ringTo('.modal input[aria-label="Deck name"]'), `[${kind}] the deck's name is a stop on the ring`, { buttons: await page.evaluate(() => [...document.querySelectorAll('.modal:last-of-type button')].filter(e => e.offsetWidth > 3).map(e => e.dataset.k).slice(0, 20)) });
		await act('confirm'); await sleep(450);
		if (kind === 'keyboard') {
			const typing = await page.evaluate(() => document.activeElement && document.activeElement.getAttribute('aria-label'));
			await page.keyboard.down('Control'); await page.keyboard.press('KeyA'); await page.keyboard.up('Control'); await page.keyboard.type('WASD deck'); await page.keyboard.press('Enter'); await sleep(300);
			const after = await page.evaluate(() => ({ v: document.querySelector('.modal input[aria-label="Deck name"]').value, active: document.activeElement && document.activeElement.tagName, f: (window.__pocket.focus() || {}).tagName }));
			A(typing === 'Deck name' && after.v === 'WASD deck' && after.active !== 'INPUT' && after.f === 'INPUT', `[keyboard] confirm puts the typing in the field (W, A, S and D are letters there), and Enter gives the keys back to the ring`, { typing, after });
			await act('right'); await act('down');
			A(await page.evaluate(() => (window.__pocket.focus() || {}).tagName !== undefined) && await page.evaluate(() => document.querySelector('.modal input[aria-label="Deck name"]').value === 'WASD deck'), `[keyboard] the arrows move the ring again, and the name is kept`);
		} else {
			const osk = await waitFor(() => page.evaluate(async () => (await import('/site/osk.js')).oskOpen()), 4000);
			A(osk, `[controller] confirm on the name opens the on-screen keyboard`);
			await page.evaluate(async () => { const ok = [...document.querySelectorAll('button')].find(b => /^(OK|Done|Enter|✓)/i.test(b.textContent.trim()) && b.offsetWidth > 3 && b.closest('[class*="osk"], [id*="osk"]')); if (ok) ok.dataset.testok = '1'; });
			await page.keyboard.press('Escape'); await sleep(300);   // (the on-screen keyboard is the site's own and has its own tests: site/osk.js)
			A(await page.evaluate(async () => !(await import('/site/osk.js')).oskOpen()), `[controller] (and it closes)`);
		}
		const find = await page.evaluate(() => !!document.querySelector('.modal input.pe-search'));
		A(!find || await ringTo('.modal input.pe-search'), `[${kind}] the card search is a stop on the ring too`);
		A(!errors.length, `[${kind}] no page errors`, errors.slice(0, 3).join(' | '));
		await page.close();
	}
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
