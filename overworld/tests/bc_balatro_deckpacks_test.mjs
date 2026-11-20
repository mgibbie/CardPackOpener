// bc_balatro_deckpacks_test.mjs — the Battlecards deck builder (incl. crafting) and pack opening in the site's
// Balatro style (site/ui/ kit; the owner's 2026-11-19 "redo every UI into the Balatro style"), desktop and phone.
// For each page (bc_balatro_lib.mjs):
//   - no page errors; the kit is on the page (balatro.css, body.bal-page, m6x11 loaded and on every button, the felt);
//   - its panels and main buttons come out in the kit's token colours;
//   - its main buttons press with Micatro's button sound (Close / Back with cancel, CLASS / NEUTRAL with paper1);
//   - its behaviour still works: NEUTRAL switches the tab, a card opens its page (with Add and, missing a copy,
//     Craft) and Close shuts it, a full deck turns the DECK button green (now a class, not an inline colour),
//     the pack page still offers its packs.
//   node overworld/tests/bc_balatro_deckpacks_test.mjs      (screenshots: SHOTS=<dir>)
// Covers battlecards/deck.html, deck.js, packs.html, packs.js.
import fs from 'fs';
import path from 'path';
import { makeAsserter, startServer, launch, checkPage, waitFor, sleep, ROOT, TOK, rgb } from './bc_balatro_lib.mjs';

const res = makeAsserter(); const A = res.A;
const CARDS = JSON.parse(fs.readFileSync(path.join(ROOT, 'battlecards/cards.json'), 'utf8')).cards;
const POOL = JSON.parse(fs.readFileSync(path.join(ROOT, 'server/pool-rarity.json'), 'utf8'));
const owned = Object.keys(POOL).filter(id => CARDS.some(c => c.id === id && (!c.cardClass || c.cardClass === 'neutral'))).slice(0, 40);
// one copy each: every card is short of a playset, so its page offers Craft (dust 2000)
const STATE = { username: 'balpages', friendCode: 'BALDK0', decks: [], collection: Object.fromEntries(owned.map(id => [id, 1])), dust: 2000, packs: 3, packInbox: 3, gold: 400, packPrice: 100, stats: { runs: 0, wins: 0 } };
const { server, port } = await startServer({ onApi: (b) => {
	if (b.action === 'state') return { state: STATE };
	if (b.action === 'friends') return { friends: [] };
	return null;
} });
const browser = await launch();
const LOGGED_IN = { magepunk_mp_token_v1: 'tok', magepunk_mp_state_v1: JSON.stringify(STATE), mp_onboarded_v1: '1' };

try {
	for (const vp of ['desktop', 'phone']) {
		// ---------------------------------------------------------------- deck.html, the deck builder
		await checkPage(browser, port, A, {
			name: 'deck', vp, url: '/battlecards/deck.html?mp=1', storage: LOGGED_IN,
			ready: () => !!document.querySelector('.tab') && !!document.getElementById('save'),
			colors: [['.tab.on', 'red'], ['#mp-back', 'orange'], ['#save', 'green'], ['.crystal', 'grey']],
			panels: [['#deck-panel', 'panel']],
			presses: [
				{ sel: '.tab[data-tab="neutral"]', sound: 'tab' },
				{ sel: '.crystal' },
				{ sel: '.crystal' },                                   // (and off again: the full grid back)
				// (a card tile: a click opens its page on desktop; on a phone a tap that is not a drag does — there the
				// page is opened from the keyboard, Enter on the tile, as the controls sweep does)
				...(vp === 'desktop' ? [{ sel: '#grid .tile', before: async (p) => { await waitFor(() => p.evaluate(() => document.querySelectorAll('#grid .tile').length > 0), 15000); } }] : []),
				{ sel: '#zoom-close', sound: 'back', before: async (p) => {
					await waitFor(() => p.evaluate(() => document.querySelectorAll('#grid .tile').length > 0), 15000);
					await p.evaluate(() => { if (!document.getElementById('zoom').classList.contains('open')) document.querySelector('#grid .tile').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })); });
					await waitFor(() => p.evaluate(() => document.getElementById('zoom').classList.contains('open')), 4000);
					// (the card page rises in for 0.4 s: on a slow runner a click mid-rise misses its button)
					await sleep(700); },
					after: async (p) => { A(await waitFor(() => p.evaluate(() => !document.getElementById('zoom').classList.contains('open')), 3000), `deck (${vp}): a card opened its page and Close shut it`); } },
			],
			after: async (page, tag) => {
				const st = await page.evaluate(() => ({ neutral: document.querySelector('.tab[data-tab="neutral"]').classList.contains('on'), tabBg: getComputedStyle(document.querySelector('.tab[data-tab="neutral"]')).backgroundColor }));
				A(st.neutral && st.tabBg === 'rgb(254, 95, 85)', `${tag}: NEUTRAL is now the chosen (red) tab`, JSON.stringify(st));
				// the card page: Add is green, Craft (a copy short, dust in hand) is blue, both kit buttons
				await page.evaluate(() => document.querySelector('#grid .tile').dispatchEvent(new KeyboardEvent('keydown', { key: 'Enter', bubbles: true })));
				await waitFor(() => page.evaluate(() => document.getElementById('zoom').classList.contains('open')), 4000);
				const z = await page.evaluate(() => ({ add: getComputedStyle(document.getElementById('zoom-add')).backgroundColor,
					craft: document.getElementById('zoom-craft').hidden ? null : getComputedStyle(document.getElementById('zoom-craft')).backgroundColor,
					box: getComputedStyle(document.getElementById('zoom-inner')).backgroundColor }));
				A(z.add === 'rgb(75, 194, 146)' && z.box === 'rgb(58, 75, 79)', `${tag}: the card page is a kit panel with a green Add`, JSON.stringify(z));
				A(z.craft === 'rgb(0, 157, 255)', `${tag}: a missing copy offers a blue Craft button`, JSON.stringify(z));
				// a full deck: the DECK button / count turn green through a class (no inline colour any more)
				const full = await page.evaluate(() => { const t = document.getElementById('toggle-deck'); return { inline: t.style.background, cls: t.className }; });
				A(!full.inline && /bal-btn/.test(full.cls), `${tag}: the DECK button is a kit button with no inline colour`, JSON.stringify(full));
			},
		});

		// ---------------------------------------------------------------- packs.html, pack opening
		await checkPage(browser, port, A, {
			name: 'packs', vp, url: '/battlecards/packs.html?mp=1', storage: LOGGED_IN,
			ready: () => !!window.__packs || document.getElementById('gold').textContent !== '…',
			colors: [['#next-btn', 'green'], ['#buy-btn', 'gold'], ['#mp-back', 'orange']],
			panels: [['#gold', 'panel-dd']],
			after: async (page, tag) => {
				const st = await page.evaluate(() => ({ gold: document.getElementById('gold').textContent, tipFont: getComputedStyle(document.getElementById('card-tip')).fontFamily }));
				A(/pack|gold/i.test(st.gold), `${tag}: the gold / packs count shows`, st.gold);
				A(/m6x11/.test(st.tipFont), `${tag}: the card tooltip is set in m6x11`, st.tipFont);
				// under the 3D pack the page is the kit's flat colour, not its fixed felt (a fixed background behind a
				// canvas that redraws every frame makes Chrome repaint the whole page each frame)
				const bg = await page.evaluate(() => { const c = getComputedStyle(document.body); return { img: c.backgroundImage, color: c.backgroundColor }; });
				A(bg.img === 'none' && bg.color === rgb(TOK.bg), `${tag}: the page behind the pack is the flat --bal-bg (no fixed felt)`, JSON.stringify(bg));
				// a kit button sets a display: "Open another pack" must stay hidden until a pack has been opened
				const next = await page.evaluate(() => document.getElementById('next-btn').getClientRects().length);
				A(next === 0, `${tag}: Open another pack stays hidden before a pack is opened`, next);
			},
			// a press: Buy a pack (gold in hand)
			presses: [{ sel: '#buy-btn', sound: 'press', before: async (p) => {
				await waitFor(() => p.evaluate(() => !document.getElementById('buy-btn').hidden), 20000);
				await p.evaluate(() => { const b = document.getElementById('buy-btn'); if (!b.hidden) b.removeAttribute('data-sfx'); });   // (Buy is a coin sound; check the button press)
			} }],
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
