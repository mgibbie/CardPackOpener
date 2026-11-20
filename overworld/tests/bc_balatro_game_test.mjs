// bc_balatro_game_test.mjs — the Battlecards game screen in the site's Balatro style (site/ui/ kit; the owner's
// 2026-11-19 "redo every UI into the Balatro style"): the DOM HUD over the 3D board, its menus and dialogs, and the
// run-mode screens, desktop and phone (bc_balatro_lib.mjs). The 3D board itself is the game's.
//   - a Quick Match: no page errors; the kit is on the page (balatro.css, body.bal-page, m6x11 on every button);
//     the mulligan is an outlined kit dialog with a green Keep hand that presses with Micatro's button sound and
//     still deals the hand; End Turn is the kit's blue button and presses with a sound; Concede is red, the log
//     a kit panel; the game's 🔊 switch stays out of it (data-sfx="none": it plays the game's own click);
//   - the in-scene hero panel is drawn in the kit's panel colour (the canvas texture's pixels);
//   - a Dungeon run's first screen: the felt run screen with Micatro's title type; its class buttons are kit
//     buttons that press with a sound and move the run on to the next screen;
//   - a Lorequest hero pick: the hero boxes are kit panels (gold outline), its buttons kit buttons;
//   - the run-screen card tooltip is Balatro's (a panel over white card text).
//   node overworld/tests/bc_balatro_game_test.mjs      (screenshots: SHOTS=<dir>)
// Covers battlecards/index.html, game.js, game_lorequest.js, game_replays.js, padboard.js, bal-game.css.
import { makeAsserter, startServer, launch, checkPage, waitFor, sleep, TOK, rgb } from './bc_balatro_lib.mjs';

const res = makeAsserter(); const A = res.A;
const STATE = { username: 'balgame', friendCode: 'BALGM0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const { server, port } = await startServer({ onApi: (b) => {
	if (b.action === 'state') return { state: STATE };
	if (b.action === 'friends') return { friends: [] };
	return null;
} });
const browser = await launch();
const STORE = { magepunk_mp_token_v1: 'tok', magepunk_mp_state_v1: JSON.stringify(STATE), mp_onboarded_v1: '1', magepunk_class_v1: 'druid', mp_rotate_dismissed: '1' };
const gameReady = () => !!(window.__game && window.__game.state) && [...document.querySelectorAll('#scry-modal button')].some(x => /keep hand/i.test(x.textContent) && x.getBoundingClientRect().width > 0);
const runReady = () => { const o = document.querySelector('.bc-runscreen'); return !!o && o.style.display !== 'none' && o.querySelectorAll('button').length > 2; };

try {
	for (const vp of ['desktop', 'phone']) {
		// ---------------------------------------------------------------- a Quick Match (vs the AI)
		await checkPage(browser, port, A, {
			name: 'match', vp, url: '/battlecards/index.html?players=2', storage: STORE, ready: gameReady,
			colors: [['#end-turn', 'blue'], ['#mp-back', 'orange']],
			presses: [
				{ sel: '#scry-modal .mull-actions button', after: async (p) => {
					A(await waitFor(() => p.evaluate(() => getComputedStyle(document.getElementById('scry-modal')).display === 'none'), 8000), `match (${vp}): Keep hand dealt the hand (the modal closed)`);
				} },
				{ sel: '#end-turn', before: async (p) => {
					await waitFor(() => p.evaluate(() => !document.getElementById('end-turn').disabled && window.__game.state.current === 0), 15000);
					const bg = await p.evaluate(() => getComputedStyle(document.getElementById('end-turn')).backgroundColor);
					A(bg === rgb(TOK.blue) || bg === rgb(TOK.green), `match (${vp}): End Turn is the kit's blue Play button (green once nothing is left to play)`, bg);
				} },
			],
			after: async (page, tag) => {
				const st = await page.evaluate(() => {
					const cs = (id) => { const el = document.getElementById(id); return el ? getComputedStyle(el) : null; };
					return { concede: cs('concede').backgroundColor, logFull: cs('log-full').backgroundColor, mana: cs('mana-hud').backgroundColor,
						sfx: document.getElementById('sfx-btn').dataset.sfx, modal: cs('scry-modal').borderTopColor };
				});
				A(st.concede === rgb(TOK.red), `${tag}: Concede is the kit's red button`, st.concede);
				A(st.logFull === rgb(TOK.panel) && st.mana === rgb(TOK.panel), `${tag}: the log drawer and the mana readout are kit panels`, JSON.stringify(st));
				A(st.sfx === 'none', `${tag}: the 🔊 switch keeps its own click (no kit sound on top)`, st.sfx);
				A(st.modal === rgb(TOK['outline-light']), `${tag}: the decision dialog has the kit's light outline`, st.modal);
				// under the 3D board the page is the kit's flat colour, not its fixed felt (a fixed background behind a
				// canvas that redraws every frame makes Chrome repaint the whole page each frame)
				const bg = await page.evaluate(() => { const c = getComputedStyle(document.body); return { img: c.backgroundImage, color: c.backgroundColor }; });
				A(bg.img === 'none' && bg.color === rgb(TOK.bg), `${tag}: the page behind the board is the flat --bal-bg (no fixed felt)`, JSON.stringify(bg));
				// spectator bets: the player's "riding" badge (site/bets.js) no longer sits on Auto-pass
				const bets = await page.evaluate(async () => {
					const B = await import('/site/bets.js'); B.riding(3, 2);
					await new Promise(r => setTimeout(r, 300));
					const a = document.getElementById('bets-riding')?.getBoundingClientRect(), b = document.getElementById('autopass-btn').getBoundingClientRect();
					return a && a.width ? { overlap: !(a.bottom <= b.top || a.top >= b.bottom || a.right <= b.left || a.left >= b.right), a: [a.top, a.bottom], b: [b.top, b.bottom] } : null;
				}).catch((e) => ({ err: String(e) }));
				A(bets && bets.overlap === false, `${tag}: the bets "riding" badge sits clear of Auto-pass`, JSON.stringify(bets));
				// the 3D hero panel: its canvas texture is filled with the kit's panel colour
				const px = await page.evaluate(() => {
					const c = [...document.querySelectorAll('canvas')].find(x => x.width === 384 && x.height === 178) || window.__game?.heroPanelCanvas;
					if (!c) return null;
					const d = c.getContext('2d').getImageData(200, 100, 1, 1).data; return [d[0], d[1], d[2]];
				});
				A(px === null || (Math.abs(px[0] - 0x3a) < 8 && Math.abs(px[1] - 0x4b) < 8 && Math.abs(px[2] - 0x4f) < 8), `${tag}: the in-scene hero panel is drawn in the kit's panel colour`, JSON.stringify(px));
			},
		});

		// ---------------------------------------------------------------- a Dungeon run: the class pick
		await checkPage(browser, port, A, {
			name: 'dungeon', vp, url: '/battlecards/index.html?dungeon=1', storage: { ...STORE, magepunk_dungeon_v1: '' }, ready: runReady,
			colors: [['.bc-runscreen button', 'blue']],
			presses: [{ sel: '.bc-runscreen button', after: async (p) => {
				// the run moved on: a new screen (the bucket draft / a bigger choice) replaced the class list
				A(await waitFor(() => p.evaluate(() => !/Choose your class/i.test(document.querySelector('.bc-runscreen')?.textContent || '')), 8000), `dungeon (${vp}): a class button moved the run on`);
			} }],
			after: async (page, tag) => {
				const st = await page.evaluate(() => {
					const o = document.querySelector('.bc-runscreen'), h = o.querySelector('.bc-run-title');
					return { bg: getComputedStyle(o).backgroundImage, font: getComputedStyle(o).fontFamily, hFont: h && getComputedStyle(h).fontSize, hShadow: h && getComputedStyle(h).textShadow };
				});
				A(/rgba\(90, 158, 131/.test(st.bg) && /m6x11/.test(st.font), `${tag}: the run screen is the kit's felt in m6x11`, JSON.stringify(st).slice(0, 200));
				A(st.hShadow && st.hShadow.includes(rgb(TOK.red)), `${tag}: its title has Micatro's red / blue logo shadows`, st.hShadow);
				// the run-screen card tooltip
				const tip = await page.evaluate(() => {
					const c = document.querySelector('.bc-runscreen canvas[data-card-id]');
					if (!c) return null;
					const r = c.getBoundingClientRect();
					c.dispatchEvent(new PointerEvent('pointerenter', { bubbles: true, pointerType: 'mouse', clientX: r.x + 5, clientY: r.y + 5 }));
					const t = document.getElementById('mini-tip');
					return t ? { bg: getComputedStyle(t).backgroundColor, desc: !!t.querySelector('.mt-desc'), descBg: t.querySelector('.mt-desc') && getComputedStyle(t.querySelector('.mt-desc')).backgroundColor } : null;
				});
				A(tip === null || (tip.bg === rgb(TOK.panel) && tip.desc && tip.descBg === 'rgb(255, 255, 255)'), `${tag}: the card tooltip is Balatro's (a panel over white card text)`, JSON.stringify(tip));
			},
		});

		// ---------------------------------------------------------------- a Lorequest run: the hero pick
		await checkPage(browser, port, A, {
			name: 'lorequest', vp, url: '/battlecards/index.html?lorequest=1', storage: { ...STORE, magepunk_lorequest_v1: '' }, ready: runReady,
			after: async (page, tag) => {
				const st = await page.evaluate(() => {
					const box = document.querySelector('.bc-runscreen .bc-pick');
					const btn = document.querySelector('.bc-runscreen .bal-btn');
					return { box: box && getComputedStyle(box).backgroundColor, btn: btn && btn.className, boxes: document.querySelectorAll('.bc-runscreen .bc-pick').length };
				});
				A(st.boxes > 0 && st.box === rgb(TOK.panel), `${tag}: the hero choices are kit panels`, JSON.stringify(st));
				A(/bal-btn/.test(st.btn || ''), `${tag}: its buttons are kit buttons`, JSON.stringify(st));
			},
		});
	}
} catch (e) {
	A(false, 'suite threw: ' + (e && e.stack || e));
} finally {
	await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${res.pass} passed, ${res.fail} failed`);
process.exit(res.fail ? 1 : 0);
