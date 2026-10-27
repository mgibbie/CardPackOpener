// micatro_challenges_ui_test.mjs — Micatro step 8's UI (Plans/MICATRO_MODS_PLAN.md §7), in headless Chrome:
//   - Challenges (micatro/js/ui/screens.js challengesScreen, engine/challenge.js challengeInfo / apply_challenge,
//     micatro/data/challenges.js, mods/*/challenges.js): the main menu's Challenges button; Balatro's 20 listed,
//     the enabled mods' challenges grouped under their badges (none without mods); Rules / Restrictions / Deck
//     tabs; Start Challenge runs it (view.challenge, recipe.challenge, Challenge Deck, stake 1); Run Info names it;
//     Continue after a reload keeps it; a lost challenge run posts no score and its Game Over says so;
//     completed challenges are ticked (markChallengeDone, per player)
//   - Sleeves (engine/sleeve.js sleeveInfo / prepareSleeve, mods/*/sleeves.js): New Run's sleeve row appears
//     with Pokermon on, cycles, its text follows the deck pairing, the run carries recipe.sleeve, the pick
//     is remembered per player
//   - Deck skins (ui/skins.js initSkins / drawSkinFront, mods/pokermon/skins.js, mods/bunco/skins.js):
//     Options lists them per suit; choosing one redraws the hand's K (pixels change), remembered per player,
//     restored after a reload; never part of the recipe
//   - Pokermon UI (mods/pokermon/ui.js POKE_UI / openPokedex, ui/modui.js modUIs, gl.js extra passes,
//     cardsprite.js faceData / animStep / setDeco): type pill + Energy pips on Pokémon jokers; right-click
//     opens the Pokédex with the family; the Dex card button; Run Info's Pokédex tab; poke_evolve plays the
//     evolution pass; the Shiny edition has its shader; the Unown swarm animates; a disguised Zorua shows the
//     rightmost joker
//   - Reverie regression (board.js modAreaRect): the Cine slots never cover the consumables' "0/2" counter
//     (desktop + 390px phone)
//   - Controller: every new screen's controls are pad stops (pad.js stops via __micatroPad.ensure)
//   - a spectator sees the challenge in Run Info; no console errors
//   node overworld/tests/micatro_challenges_ui_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
// Mod art is gitignored: in a worktree missing it, /micatro/mods/** falls back (read-only) to the main
// checkout two levels up (MICATRO_MAIN overrides).
const MAIN = process.env.MICATRO_MAIN || path.resolve(ROOT, '../..');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9531;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const STATE = { username: 'chtester', friendCode: 'CHT000', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: ['bob'] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

// ---- a challenge run, in node, for the spectator snapshot
globalThis.localStorage = { getItem() { return null; }, setItem() { }, removeItem() { } };
const { Session } = await import(pathToFileURL(path.join(ROOT, 'micatro/js/engine/session.js')).href);
const sess = new Session();
sess.start({ seed: 'CHSPEC', challenge: 'c_omelette_1' });
sess.act({ type: 'select_blind' });
const SNAP = { view: sess.view(), events: [] };

const seen = { score: [] };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let body = {}; try { body = JSON.parse(raw); } catch { }
		let out = { ok: true, state: STATE };
		if (body.action === 'publish-micatro') out = { ok: true, watchers: 0, watcherNames: [] };
		else if (body.action === 'micatro-state') out = { snapshot: SNAP, seq: 1, label: 'Ante 1', room: 'u:bob', over: false, watchers: 1, watcherNames: ['chtester'] };
		else if (body.action === 'run-score') { seen.score.push(body); out = { ok: true, rank: 1 }; }
		else if (body.action === 'run-leaderboard') out = { top: [], you: null };
		else if (body.action === 'chat-get') out = { messages: [] };
		else if (body.action === 'micatro-replay-put') out = { ok: true, id: 'abcdef12' };
		res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	const send = (d) => { res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); };
	const nf = () => { res.writeHead(404); res.end('nf'); };
	fs.readFile(path.join(ROOT, f), (e, d) => {
		if (!e) return send(d);
		if (!f.startsWith('/micatro/mods/') || path.resolve(MAIN) === ROOT || f.includes('..')) return nf();
		fs.readFile(path.join(MAIN, f), (e2, d2) => (e2 ? nf() : send(d2)));
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const open = async ({ url = '/micatro/', w = 1600, h = 900, mobile = false, mods = null, ctx: ctx0 = null } = {}) => {
		const ctx = ctx0 || await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200) + (m.location() && m.location().url ? ' @ ' + m.location().url : '')); });   // (a 404's URL: which file)
		await page.evaluateOnNewDocument((st, mods) => {
			try {
				localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
				if (!sessionStorage.getItem('chui_init')) {
					sessionStorage.setItem('chui_init', '1');
					localStorage.removeItem('micatro_run_v1');
					if (mods) localStorage.setItem('micatro_mods', JSON.stringify({ ids: mods, options: {} })); else localStorage.removeItem('micatro_mods');
				}
				localStorage.setItem('magepunk_mp_token_v1', 'ch-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			} catch { }
		}, STATE, mods);
		await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		// __micatro.ready comes BEFORE the main menu: boot first reads the account's run in progress (ui/runsync.js,
		// up to 3 s) so the menu's Continue is right, then draws it. Wait for the menu itself (not when spectating).
		if (!/spectate=/.test(url)) await waitFor(() => page.evaluate(() => !!document.querySelector('.menu-modal .menu-bar')), 30000);
		return { page, errors, ctx };
	};
	const idle = (page) => waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000);
	const V = (page) => page.evaluate(() => window.__micatro.view());
	const padHas = (page, sel) => page.evaluate((sel) => { const P = window.__micatroPad; if (!P) return false; const r = P.ensure(); return r.list.some((s) => s.el && s.el.matches(sel)); }, sel);
	const click = (page, sel) => page.evaluate((sel) => { const e = document.querySelector(sel); if (!e) return false; e.click(); return true; }, sel);

	// ======================================================= challenges, vanilla only
	{
		const { page, errors, ctx } = await open();
		A(await page.evaluate(() => !!document.querySelector('.menu-bar .b-challenges')), 'the main menu has a Challenges button');
		A(await padHas(page, '.b-challenges'), 'the controller can reach the Challenges button');
		await click(page, '.b-challenges');
		A(await waitFor(() => page.evaluate(() => document.querySelectorAll('.ch-item').length === 20), 15000), 'without mods the Challenges screen lists Balatro\'s 20', await page.evaluate(() => document.querySelectorAll('.ch-item').length));
		const first = await page.evaluate(() => ({ title: document.querySelector('.ch-title').textContent, rules: document.querySelector('.ch-body').textContent, eggs: document.querySelectorAll('.ch-body .ch-card').length }));
		A(first.title === 'The Omelette' && /no reward money/.test(first.rules) && first.eggs === 5, 'the first challenge shows its rules and 5 Eggs', JSON.stringify(first));
		await click(page, '[data-ch="c_jokerless_1"]');
		await click(page, '.b-ch-restrictions');
		const restr = await page.evaluate(() => document.querySelector('.ch-body').textContent);
		A(/Judgement/.test(restr) && /Rare Tag/.test(restr) && /Acorn/.test(restr), 'Restrictions list banned cards, tags and blinds', restr.slice(0, 200));
		await click(page, '[data-ch="c_medusa_1"]');
		await click(page, '.b-ch-deck');
		const deck = await page.evaluate(() => ({ text: document.querySelector('.ch-body').textContent, n: document.querySelectorAll('.ch-dcard').length }));
		A(/52 cards/.test(deck.text) && /12 Stone Card/.test(deck.text) && deck.n === 52, 'Deck shows the challenge deck (52 cards, 12 Stone)', JSON.stringify(deck));
		A(await padHas(page, '.ch-item') && await padHas(page, '.b-ch-start') && await padHas(page, '.b-ch-rules'), 'the controller can reach the list, the tabs and Start');
		// start Luxury Tax
		await click(page, '[data-ch="c_luxury_1"]');
		await click(page, '.b-ch-start');
		await waitFor(() => page.evaluate(() => !!window.__micatro.session && !!window.__micatro.view()), 15000);
		await idle(page);
		let v = await V(page);
		const rec = await page.evaluate(() => window.__micatro.session.recipe);
		A(v.challenge && v.challenge.id === 'c_luxury_1' && rec.challenge === 'c_luxury_1' && rec.stake === 1 && v.back === 'b_challenge' && v.hand_limit === 10, 'Start Challenge runs it: view + recipe carry it, Challenge Deck, stake 1, hand size 10', JSON.stringify({ c: v.challenge, rc: rec.challenge, st: rec.stake, b: v.back, hl: v.hand_limit }));
		await page.evaluate(() => document.querySelector('.b-runinfo').click());
		A(await waitFor(() => page.evaluate(() => /Luxury Tax/.test((document.querySelector('.ri-challenge') || {}).textContent || '')), 5000), 'Run Info names the challenge');
		await page.evaluate(() => document.querySelector('.ri-modal .b-back').click());
		// Continue after a reload keeps the challenge
		await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
		await idle(page);
		await page.reload({ waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		await waitFor(() => page.evaluate(() => !!document.querySelector('.b-continue')), 10000);
		await click(page, '.b-continue');
		await waitFor(() => page.evaluate(() => !!window.__micatro.session), 15000);
		await idle(page);
		v = await V(page);
		A(v.challenge && v.challenge.id === 'c_luxury_1' && v.state === 'SELECTING_HAND' && v.hand_limit === 10, 'Continue restores the challenge run', JSON.stringify({ c: v.challenge, s: v.state }));
		// lose it: no score posted, the Game Over says it was a challenge
		await page.evaluate(async () => {
			const { G } = await import('/micatro/js/engine/core.js');
			G.GAME.blind.chips = 1e12; G.GAME.current_round.hands_left = 1;
			const ids = G.hand.cards.slice(0, 1).map((c) => c.sort_id);
			window.__micatro.act({ type: 'highlight', ids });
			window.__micatro.act({ type: 'play' });
		});
		A(await waitFor(() => page.evaluate(() => !!document.querySelector('.go-modal .go-challenge')), 20000), 'the Game Over of a challenge says so');
		await sleep(600);
		A(seen.score.length === 0 && await page.evaluate(() => !document.querySelector('.go-modal .b-newrun + .b-mainmenu + .btn.green')), 'a challenge run posts no high score (and offers no leaderboard)', seen.score.length);
		// a completed challenge is ticked
		await page.evaluate(async () => { const UI = await import('/micatro/js/ui/screens.js'); UI.markChallengeDone('chtester', 'c_medusa_1'); });
		await click(page, '.b-mainmenu');
		await waitFor(() => page.evaluate(() => !!document.querySelector('.b-challenges')), 5000);
		await click(page, '.b-challenges');
		await waitFor(() => page.evaluate(() => document.querySelectorAll('.ch-item').length === 20), 15000);
		A(await page.evaluate(() => !!document.querySelector('[data-ch="c_medusa_1"] .ch-tick') && !document.querySelector('[data-ch="c_city_1"] .ch-tick')), 'completed challenges are ticked (per player)');
		A(errors.length === 0, 'no console errors (vanilla challenges)', errors.join(' | '));
		await ctx.close();
	}

	// ======================================================= mods on: mod challenges, sleeves, skins, Pokermon UI
	{
		const { page, errors, ctx } = await open({ mods: ['pokermon', 'betmma'] });
		await click(page, '.b-challenges');
		A(await waitFor(() => page.evaluate(() => document.querySelectorAll('.ch-item').length === 37), 60000), 'with Pokermon + BETMMA on: 20 + 12 (Pokermon 3.9.1) + 5 challenges', await page.evaluate(() => document.querySelectorAll('.ch-item').length));
		const groups = await page.evaluate(() => [...document.querySelectorAll('.ch-group')].map((g) => g.textContent));
		A(groups.join('|') === 'Balatro|Pokermon|Betmma Vouchers', 'mod challenges are grouped under their mod badges', groups.join('|'));
		await click(page, '[data-ch="c_poke_nuzlocke"]');
		const nz = await page.evaluate(() => document.querySelector('.ch-body').textContent);
		A(/Buffoon Pack/.test(nz) && /up to 5/.test(nz), 'a mod challenge shows its own rules (Nuzlocke)', nz.slice(0, 160));
		await click(page, '[data-ch="c_poke_littlecup"]');
		await click(page, '.b-ch-start');
		await waitFor(() => page.evaluate(() => !!window.__micatro.session && !!window.__micatro.view() && window.__micatro.idle()), 30000);
		let v = await V(page);
		A(v.challenge && v.challenge.id === 'c_poke_littlecup' && v.mods.includes('pokermon') && v.areas.jokers.some((j) => j.center === 'j_poke_everstone'), 'a mod challenge starts with its mod and its jokers', JSON.stringify({ c: v.challenge, m: v.mods }));
		await page.evaluate(() => window.__micatro.newRun({ seed: 'X' })); // (leave the challenge)
		await idle(page);

		// ---- sleeves
		await page.evaluate(() => { const m = document.querySelector('.b-options'); if (m) m.click(); });
		await page.evaluate(() => { const b = document.querySelector('.opt-modal .btn.blue'); if (b) b.click(); }); // New Run
		await waitFor(() => page.evaluate(() => !!document.querySelector('.new-run')), 8000);
		A(await waitFor(() => page.evaluate(() => { const r = document.querySelector('.nr-sleeve'); return r && r.style.display !== 'none'; }), 30000), 'New Run shows a sleeve row with Pokermon on');
		A(await page.evaluate(() => /No Sleeve/.test(document.querySelector('.nr-sleeve').textContent)), 'no sleeve by default');
		await click(page, '.b-sleeve-next');
		let sl = await page.evaluate(() => document.querySelector('.nr-sleeve').textContent);
		A(/Trainer Sleeve/.test(sl) && /Good Rod/.test(sl), 'the arrows cycle through the sleeves (Trainer Sleeve first)', sl);
		A(await padHas(page, '.b-sleeve-next'), 'the controller can reach the sleeve arrows');
		await click(page, '.b-start');
		await waitFor(() => page.evaluate(() => !!window.__micatro.session && window.__micatro.session.recipe.sleeve), 30000);
		await idle(page);
		v = await V(page);
		const rec = await page.evaluate(() => window.__micatro.session.recipe);
		A(rec.sleeve === 'sleeve_poke_pokemonsleeve' && v.sleeve && v.sleeve.name === 'Trainer Sleeve' && v.vouchers.includes('v_poke_goodrod'), 'the run plays the sleeve (recipe.sleeve, Good Rod redeemed)', JSON.stringify({ s: rec.sleeve, vs: v.vouchers }));
		A(await page.evaluate(() => localStorage.getItem('micatro_sleeve_v1:chtester')) === 'sleeve_poke_pokemonsleeve', 'the sleeve pick is remembered per player');

		// ---- deck skins
		await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
		await idle(page);
		const kSpade = () => page.evaluate(() => {
			const b = window.__micatro.board;
			for (const id of b.areas.hand) { const s = b.sprites.get(id); if (s && s.d.front && /^S_[KQJ]$/.test(s.d.front)) { const c = s.base.getContext('2d'); return { f: s.d.front, px: [...c.getImageData(40, 60, 60, 60).data].reduce((a, x) => a + x, 0) }; } }
			return null;
		});
		// make sure a spade face card is in hand
		await page.evaluate(async () => {
			const { G, P_CARDS, P_CENTERS, create_playing_card } = await import('/micatro/js/engine/core.js');
			create_playing_card({ front: P_CARDS.S_K, center: P_CENTERS.c_base }, G.hand);
			window.__micatro.act({ type: 'sort_hand', by: 'rank' });
		});
		await idle(page);
		const before = await kSpade();
		await click(page, '.b-options');
		A(await waitFor(() => page.evaluate(() => document.querySelectorAll('.sk-row').length >= 4), 15000), 'Options lists the card skins per suit');
		A(await padHas(page, '.b-skin-next'), 'the controller can reach the skin arrows');
		await page.evaluate(() => document.querySelector('.sk-row[data-suit="Spades"] .b-skin-next').click());
		const skName = await page.evaluate(() => document.querySelector('.sk-row[data-suit="Spades"] .sk-name').textContent);
		A(/RBY Sprites: Ghost Trio/.test(skName), 'Spades -> RBY Sprites: Ghost Trio', skName);
		A(await waitFor(async () => { const a = await kSpade(); return a && before && a.px !== before.px; }, 10000), 'the hand\'s spade face card redraws with the skin', JSON.stringify([before, await kSpade()]));
		const pref = await page.evaluate(() => JSON.parse(localStorage.getItem('micatro_skins_v1:chtester') || '{}'));
		A(pref.Spades && pref.Spades.skin === 'poke_rby_spades', 'the skin choice is remembered per player', JSON.stringify(pref));
		A(!('skins' in (await page.evaluate(() => window.__micatro.session.recipe))), 'skins are cosmetic: not in the run recipe');
		await page.evaluate(() => document.querySelector('.opt-modal .b-back').click());

		// ---- Pokermon UI
		await page.evaluate(async () => {
			const { G, add_joker } = await import('/micatro/js/engine/core.js');
			const b = add_joker('j_poke_bulbasaur'); b.ability.extra.energy_count = 2;
			const c = add_joker('j_poke_charmander'); c.set_edition({ poke_shiny: true }, true, true);
			add_joker('j_poke_unown_swarm');
			add_joker('j_poke_zorua');
			add_joker('j_joker');
			G.E_MANAGER.flush();
			window.__micatro.act({ type: 'sort_hand', by: 'suit' });
		});
		await idle(page);
		await sleep(400);
		const deco = await page.evaluate(() => {
			const b = window.__micatro.board;
			const at = (k) => { for (const id of b.areas.jokers) { const s = b.sprites.get(id); if (s && s.d.center === k) return s; } return null; };
			const bu = at('j_poke_bulbasaur'), zo = at('j_poke_zorua'), un = at('j_poke_unown_swarm');
			return {
				type: bu && bu.deco ? bu.deco.querySelector('.poke-type').textContent : null,
				pips: bu && bu.deco ? bu.deco.querySelectorAll('.pip.on').length : -1,
				zfd: zo && zo.fd ? zo.fd.center : null, unAnim: !!(un && un.anim && un.anim.frames === 36),
				shinyFs: !!(window.__micatro.board && true),
			};
		});
		A(deco.type === 'Grass' && deco.pips === 2, 'a Pokémon joker shows its type pill and its Energy pips', JSON.stringify(deco));
		A(deco.zfd === 'j_joker', 'Zorua (active) is drawn as the rightmost joker', deco.zfd);
		A(deco.unAnim, 'the Unown swarm is animated (36 frames)');
		const f1 = await page.evaluate(() => { const b = window.__micatro.board; for (const id of b.areas.jokers) { const s = b.sprites.get(id); if (s.d.center === 'j_poke_unown_swarm') return s.animIdx; } return null; });
		await sleep(400);
		const f2 = await page.evaluate(() => { const b = window.__micatro.board; for (const id of b.areas.jokers) { const s = b.sprites.get(id); if (s.d.center === 'j_poke_unown_swarm') return s.animIdx; } return null; });
		A(f1 != null && f2 != null && f1 !== f2, 'the swarm\'s frame advances', JSON.stringify([f1, f2]));
		A(await page.evaluate(async () => { const { P_CENTERS } = await import('/micatro/js/engine/core.js'); return !!(P_CENTERS.e_poke_shiny.shader_fs && P_CENTERS.e_poke_shiny.shader_overlay); }), 'the Shiny edition carries its star shader (drawn over the card)');
		// the Pokédex: right-click on Bulbasaur
		await page.evaluate(() => { const b = window.__micatro.board; for (const id of b.areas.jokers) { const s = b.sprites.get(id); if (s.d.center === 'j_poke_bulbasaur') s.el.dispatchEvent(new MouseEvent('contextmenu', { bubbles: true, cancelable: true })); } });
		A(await waitFor(() => page.evaluate(() => document.querySelectorAll('.dex-modal .dex-card').length === 4), 5000), 'right-click opens the Pokédex with the family (Bulbasaur, Ivysaur, Venusaur, Mega Venusaur)', await page.evaluate(() => [...document.querySelectorAll('.dex-card')].map((x) => x.dataset.key).join()));
		// a Mega's sprite is its soul layer: the Pokédex card must draw it, not just the rainbow background
		// (the Mega's 3.9.1 sheet may still be loading when the Pokédex opens: the card redraws when it lands, so poll)
		let megaSoul = null;
		const megaOk = (m) => m && m.vsSoul === 0 && m.vsBare > 500;
		await waitFor(async () => megaOk(megaSoul = await page.evaluate(async () => {
			const { composeFace, soulLayer, drawSoul } = await import('/micatro/js/ui/cardsprite.js');
			const cv = document.querySelector('.dex-card[data-key="j_poke_mega_venusaur"] canvas');
			if (!cv) return null;
			const c = (await import('/micatro/js/engine/core.js')).P_CENTERS.j_poke_mega_venusaur;
			const d = { center: c.key, mod: c.mod, set: c.set, name: c.name, atlas: c.atlas, pos: c.pos, soul_pos: c.soul_pos };
			const draw = (withSoul) => {
				const k = document.createElement('canvas'); k.width = cv.width; k.height = cv.height;
				const ctx = k.getContext('2d'); composeFace(ctx, d, null, { collection: true });
				if (withSoul) drawSoul(ctx, soulLayer(d));
				return ctx.getImageData(0, 0, k.width, k.height).data;
			};
			const got = cv.getContext('2d').getImageData(0, 0, cv.width, cv.height).data;
			const diff = (y) => { let n = 0; for (let i = 0; i < got.length; i += 4) if (got[i] !== y[i] || got[i + 1] !== y[i + 1] || got[i + 2] !== y[i + 2]) n++; return n; };
			return { vsSoul: diff(draw(true)), vsBare: diff(draw(false)) };
		})), 10000);
		A(megaOk(megaSoul), "the Pokédex draws Mega Venusaur's sprite (its soul layer), not only the background", JSON.stringify(megaSoul));
		await page.evaluate(() => document.querySelector('.dex-card[data-key="j_poke_venusaur"]').click());
		A(await page.evaluate(() => /Venusaur/.test(document.querySelector('.dex-name').textContent) && /Grass/.test(document.querySelector('.dex-badges').textContent)), 'picking a family member shows its card text and type');
		A(await padHas(page, '.dex-card'), 'the controller can reach the Pokédex cards');
		await page.evaluate(() => document.querySelector('.dex-modal .b-back').click());
		// the Dex card button
		await page.evaluate(() => { const b = window.__micatro.board; for (const id of b.areas.jokers) { const s = b.sprites.get(id); if (s.d.center === 'j_poke_charmander') b.clickCard(s, 'mouse'); } });
		A(await waitFor(() => page.evaluate(() => !!document.querySelector('.card-btns .btn.modui')), 3000), 'a selected Pokémon joker has a Dex button');
		await page.evaluate(() => document.querySelector('.card-btns .btn.modui').click());
		A(await waitFor(() => page.evaluate(() => document.querySelectorAll('.dex-modal .dex-card').length === 5), 5000), 'Dex opens Charmander\'s family (with both Mega Charizards)', await page.evaluate(() => document.querySelectorAll('.dex-card').length));
		await page.evaluate(() => document.querySelector('.dex-modal .b-back').click());
		await page.evaluate(() => { const b = window.__micatro.board; b.sel = null; b.refreshSelection(); });
		// Run Info's Pokédex tab (the controller's way in)
		await click(page, '.b-runinfo');
		await waitFor(() => page.evaluate(() => !!document.querySelector('.b-ri-pokedex')), 5000);
		A(await padHas(page, '.b-ri-pokedex'), 'Run Info has a Pokédex tab the controller can reach');
		await click(page, '.b-ri-pokedex');
		const owned = await page.evaluate(() => [...document.querySelectorAll('.ri-modal .dex-card')].length);
		A(owned === 4, 'the tab lists the Pokémon on the joker row', owned);
		await page.evaluate(() => document.querySelector('.ri-modal .dex-card').click());
		A(await waitFor(() => page.evaluate(() => !!document.querySelector('.dex-modal')), 3000), 'picking one opens its Pokédex');
		await page.evaluate(() => { document.querySelector('.dex-modal .b-back').click(); document.querySelector('.ri-modal .b-back').click(); });
		// evolution: the poke_evolve event plays the evolution pass
		await page.evaluate(async () => {
			window.__micatro.player.setSpeed(1, { save: false });
			const { G } = await import('/micatro/js/engine/core.js');
			const { poke_evolve } = await import('/micatro/mods/pokermon/systems/evolution.js');
			poke_evolve(G.jokers.cards.find((c) => c.config.center.key === 'j_poke_bulbasaur'), 'j_poke_ivysaur');
			window.__micatro.act({ type: 'sort_hand', by: 'rank' });
		});
		const evo = await waitFor(() => page.evaluate(() => { const b = window.__micatro.board; for (const s of b.sprites.values()) if (s.pokeEvo && s.extra && s.extra.some((x) => x.key === 'poke_evolution')) return true; return false; }), 4000);
		A(evo, 'poke_evolve plays the evolution shader pass on the card');
		await idle(page);
		A(await page.evaluate(() => window.__micatro.view().areas.jokers.some((j) => j.center === 'j_poke_ivysaur')), 'and the card becomes Ivysaur');
		A(errors.length === 0, 'no console errors (mods)', errors.join(' | '));
		// skins + sleeve survive a reload (same browser profile)
		const p2 = await ctx.newPage();
		await p2.setViewport({ width: 1600, height: 900 });
		await p2.goto(`http://localhost:${PORT}/micatro/`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => p2.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		A(await waitFor(() => p2.evaluate(async () => { const S = await import('/micatro/js/ui/skins.js'); const c = S.choiceFor('Spades'); return c && c.skin === 'poke_rby_spades'; }), 10000), 'the skin choice is restored after a reload');
		await ctx.close();
	}

	// ======================================================= Reverie: the Cine slots never cover the consumables counter
	for (const [w, h, mobile, tag] of [[1600, 900, false, 'desktop'], [390, 844, true, 'phone']]) {
		const { page, errors, ctx } = await open({ w, h, mobile });
		await page.evaluate(() => window.__micatro.newRun({ seed: 'REV1', mods: ['reverie'] }));
		await waitFor(() => page.evaluate(() => window.__micatro.view() && window.__micatro.idle()), 40000);
		await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
		await idle(page);
		const r = await page.evaluate(() => {
			const b = window.__micatro.board;
			const box = b.modLbls.get('cine_quests');
			if (!box) return null;
			const a = b.lblCons.getBoundingClientRect(), m = box.box.getBoundingClientRect();
			// (overlapping, or touching: the counter needs a clear gap above the slots' box)
			const overlap = !(a.right <= m.left || m.right <= a.left || a.bottom + 4 <= m.top || m.bottom <= a.top);
			return { overlap, cons: b.lblCons.textContent, a: [a.top, a.bottom], m: [m.top, m.bottom] };
		});
		A(r && !r.overlap && r.cons === '0/2', `${tag}: Reverie's Cine slots don't cover the consumables "0/2" counter`, JSON.stringify(r));
		A(errors.length === 0, `no console errors (reverie ${tag})`, errors.join(' | '));
		await ctx.close();
	}

	// ======================================================= a spectator sees the challenge
	{
		const { page, errors, ctx } = await open({ url: '/micatro/?spectate=bob' });
		A(await waitFor(() => page.evaluate(() => (window.__micatro.board.view || {}).state === 'SELECTING_HAND'), 15000), 'the spectator renders the challenge snapshot');
		await page.evaluate(() => document.querySelector('.b-runinfo').click());
		A(await waitFor(() => page.evaluate(() => /The Omelette/.test((document.querySelector('.ri-challenge') || {}).textContent || '')), 5000), 'the spectator\'s Run Info names the challenge');
		A(errors.length === 0, 'no console errors (spectator)', errors.join(' | '));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => { });
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
