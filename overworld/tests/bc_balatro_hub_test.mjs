// bc_balatro_hub_test.mjs — the Battlecards hub pages in the site's Balatro style (site/ui/ kit; the owner's
// 2026-11-19 "redo every UI into the Balatro style"): start.html (the menu: Play, Live now, Card of the Week, the
// run-mode tiles, the tour and the matchmaking dialogs), boards.html, replays.html, viewer.html (the card gallery)
// and arttune.html (the owner's art tuner), desktop and phone. For each (bc_balatro_lib.mjs):
//   - no page errors; the kit is on the page (balatro.css, body.bal-page, m6x11 loaded and on every button, the felt);
//   - its panels and main buttons come out in the kit's token colours;
//   - its main buttons press with Micatro's button sound (Back / Close / Skip with cancel, a board tab with paper1),
//     through battlecards/bal-ui.js;
//   - its behaviour still works: the tour opens and Skip closes it, a board tab switches the board, the gallery
//     zoom opens and closes, the Quick Match tile still points at the game.
// Also: the game's own 🔊 mute (bc_sfx_muted_v1) silences the UI sounds too.
//   node overworld/tests/bc_balatro_hub_test.mjs      (screenshots: SHOTS=<dir>)
// Covers battlecards/start.html, boards.html, replays.html, replays.js, viewer.html, arttune.html, nav.js,
// bal-ui.js, bal-skin.css.
import { makeAsserter, startServer, launch, checkPage, waitFor, sleep, TOK, rgb } from './bc_balatro_lib.mjs';

const res = makeAsserter(); const Assert = res.A;
const STATE = { username: 'mgibbie', friendCode: 'BALHUB', decks: [], collection: { fireball: 2, frostbolt: 1 }, dust: 900, packs: 0, stats: { runs: 0, wins: 0 } };
const TOP = [{ name: 'alice', rating: 1240, wins: 12, losses: 1, hero: 'Mage' }, { name: 'mgibbie', rating: 1100, wins: 9, losses: 3, hero: 'Rogue' }];
const { server, port } = await startServer({ onApi: (b) => {
	if (b.action === 'state') return { state: STATE };
	if (b.action === 'live-friends') return { live: [{ username: 'coolfriend', kind: 'card', mode: 'dungeon', label: 'Fight 3/8', watchers: 2, full: false }] };
	if (/leaderboard/.test(b.action || '')) return { top: TOP, you: { rating: 1100, wins: 9, losses: 3, rank: 2 } };
	if (b.action === 'friends') return { friends: [] };
	return null;
} });
const browser = await launch();
const LOGGED_IN = { magepunk_mp_token_v1: 'tok', magepunk_mp_state_v1: JSON.stringify(STATE), mp_onboarded_v1: '1' };

try {
	for (const vp of ['desktop', 'phone']) {
		// ---------------------------------------------------------------- start.html, the Battlecards menu
		await checkPage(browser, port, Assert, {
			name: 'start', vp, url: '/battlecards/start.html', storage: LOGGED_IN,
			ready: () => !!document.querySelector('#live-list .live-watch') && !!document.querySelector('.cw-collect'),
			panels: [['.tile[data-mode="dungeon"]', 'panel'], ['a.primary', 'panel'], ['#cotw', 'panel']],
			colors: [['#live-list .live-watch', 'blue'], ['.primary .go', 'blue'], ['#find-match .go', 'red']],
			presses: [
				{ sel: 'a.primary' },                                  // Quick Match (a link: held on the page by the harness)
				{ sel: '.tile[data-mode="dungeon"]' },                 // a run-mode tile
				{ sel: '#live-list .live-watch' },                     // Live now → Watch
				{ sel: '#take-tour' },                                 // the footer link opens the tour
				{ sel: '#ob-next', before: async (p) => {
					await waitFor(() => p.evaluate(() => !document.getElementById('onboard').hidden), 3000);
					// a kit button sets a display: the tour's Back must still be hidden on the first slide
					const back = await p.evaluate(() => document.getElementById('ob-back').getClientRects().length);
					Assert(back === 0, `start (${vp}): the tour's Back stays hidden on its first slide`, back);
					const next = await p.evaluate(() => getComputedStyle(document.getElementById('ob-next')).backgroundColor);
					Assert(next === rgb(TOK.green), `start (${vp}): the tour's Next is the green go button`, next);
					await sleep(500);   // (the dialog rises in)
				} },
				{ sel: '#ob-skip', sound: 'back' },
			],
			after: async (page, tag) => {
				const st = await page.evaluate(() => ({
					tourClosed: document.getElementById('onboard').hidden,
					quick: document.querySelector('a.primary').getAttribute('href'),
					next: getComputedStyle(document.getElementById('ob-next')).backgroundColor,
					tiles: document.querySelectorAll('.tile[data-run]').length,
					overflow: document.documentElement.scrollWidth > innerWidth + 1,
				}));
				Assert(st.tourClosed, `${tag}: Skip closed the tour`);
				Assert(st.quick === 'index.html' && st.tiles === 10, `${tag}: Quick Match still opens the game and all 10 run-mode tiles are there`, JSON.stringify(st));
				Assert(!st.overflow, `${tag}: no sideways scroll`);
			},
		});

		// ---------------------------------------------------------------- boards.html
		await checkPage(browser, port, Assert, {
			name: 'boards', vp, url: '/battlecards/boards.html', storage: LOGGED_IN,
			ready: () => document.querySelectorAll('#board .row').length > 1,
			panels: [['#board', 'panel'], ['#board .row:not(.head)', 'panel-d']],
			colors: [['#tabs .bal-tab.is-on', 'red'], ['a.back', 'orange']],
			presses: [{ sel: '#tabs [data-key="arena"]', sound: 'tab' }],
			after: async (page, tag) => {
				const on = await waitFor(() => page.evaluate(() => location.hash === '#arena' && document.querySelector('#tabs [data-key="arena"]').classList.contains('is-on')
					&& getComputedStyle(document.querySelector('#tabs [data-key="arena"]')).backgroundColor === getComputedStyle(document.querySelector('#tabs .bal-tab.is-on')).backgroundColor), 4000);
				Assert(on, `${tag}: the Arena tab switched the board and is now the red chosen tab`);
				const me = await page.evaluate(() => !!document.querySelector('#board .row.you'));
				Assert(me, `${tag}: your own row is marked`);
			},
		});

		// ---------------------------------------------------------------- replays.html (one saved replay to list)
		await checkPage(browser, port, Assert, {
			name: 'replays', vp, url: '/battlecards/replays.html', storage: LOGGED_IN,
			ready: () => !!document.getElementById('import-btn'),
			colors: [['#import-btn', 'blue'], ['#clear-btn', 'red'], ['a.back', 'orange']],
			presses: [{ sel: '#import-btn', after: (p) => p.keyboard.press('Escape') }, { sel: '#clear-btn' }],
			after: async (page, tag) => {
				// the keyboard presses too (Enter on a focused button is a click, with no pointer)
				await sleep(300);
				const n0 = await page.evaluate(() => { document.getElementById('clear-btn').focus(); return window.__au.starts.length; });
				await page.keyboard.press('Enter');
				Assert(await waitFor(() => page.evaluate((n) => window.__au.starts.length > n, n0), 3000), `${tag}: Enter on a focused button presses with a sound`);
			},
		});

		// ---------------------------------------------------------------- viewer.html, the card gallery
		await checkPage(browser, port, Assert, {
			name: 'viewer', vp, url: '/battlecards/viewer.html', storage: LOGGED_IN,
			ready: () => document.querySelectorAll('#grid .tile').length > 0,
			// (one page of cards: both page arrows are disabled, in the kit's disabled grey)
			colors: [['#next', 'disabled'], ['#mp-back', 'orange'], ['.crystal', 'grey']],
			presses: [
				{ sel: '#grid .tile' },
				{ sel: '#zoom-close', sound: 'back', before: async (p) => { await waitFor(() => p.evaluate(() => document.getElementById('zoom').classList.contains('open')), 3000); },
					after: async (p) => { Assert(await waitFor(() => p.evaluate(() => !document.getElementById('zoom').classList.contains('open')), 3000), 'viewer: the zoom opened on a card and ✕ closed it'); } },
				{ sel: '#owned-only', sound: 'select' },
				{ sel: '.crystal' },
			],
			after: async (page, tag) => {
				const on = await page.evaluate(() => document.querySelector('.crystal').classList.contains('on') && document.getElementById('owned-only').checked);
				Assert(on, `${tag}: the mana filter and the owned-only checkbox still filter`);
				const tip = await page.evaluate(() => getComputedStyle(document.getElementById('tip')).backgroundColor);
				Assert(tip === 'rgb(58, 75, 79)', `${tag}: the card tooltip is a kit panel`, tip);
			},
		});

		// ---------------------------------------------------------------- arttune.html (owner tool)
		await checkPage(browser, port, Assert, {
			name: 'arttune', vp, url: '/battlecards/arttune.html', storage: LOGGED_IN,
			ready: () => document.querySelectorAll('#list .row').length > 0,
			colors: [['#save', 'green'], ['#reset', 'red'], ['#next', 'blue']],
			presses: [{ sel: '#next' }],
		});
	}

	// ---------------------------------------------------------------- the game's mute silences the UI sounds too
	await checkPage(browser, port, Assert, {
		name: 'start-muted', vp: 'desktop', url: '/battlecards/start.html', storage: { ...LOGGED_IN, bc_sfx_muted_v1: '1' },
		ready: () => !!document.querySelector('#live-list .live-watch'),
		after: async (page, tag) => {
			await page.evaluate(() => { window.__holdLinks = true; });
			await page.mouse.click(2, 890); await sleep(300);
			await page.click('#live-list .live-watch');
			await sleep(1200);
			const n = await page.evaluate(() => window.__au.starts.length);
			Assert(n === 0, `${tag}: with Battlecards' sound off (🔊 → 🔇) a press is silent`, n);
		},
	});
} catch (e) {
	Assert(false, 'suite threw: ' + (e && e.stack || e));
} finally {
	await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${res.pass} passed, ${res.fail} failed`);
process.exit(res.fail ? 1 : 0);
