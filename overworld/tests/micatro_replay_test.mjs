// micatro_replay_test.mjs — Micatro RUN replays in headless Chrome: a replay is always a WHOLE run
// (first blind to game over / win / the end of Endless), never one round.
//   1. a signed-in run is forced to a game over: the replay is uploaded BEFORE the score is posted
//      (the score carries its id), the final publish carries it to spectators, the run is kept in
//      the local list; the game-over modal offers "▶ Watch replay" + "🔗 Copy replay link"
//   1b. a run that WINS then goes into Endless keeps ONE replay: uploaded at the win (score linked),
//      then extended in place (same id) at the game over to cover the whole run
//   2. Watch replay re-simulates the run on the board: it animates through to the same end
//      (checksum matches -> no "older version" notice); pause, step back/forward, speed, Space
//   3. a multi-ante server replay (?replay=<id>, a recipe from the shared test bot): ante chips,
//      scrubber marks, scrubbing, the controller (RB step, Y play/pause, a bar button is a pad stop)
//   4. a tampered / older recipe: the end-of-replay notice; a rejected action stops gracefully
//   5. the leaderboard ▶ on a row with a replay; the main menu's Replays list (watch / delete)
//   6. a guest (signed out) watches the local copy (no share button); a phone (390 px) layout;
//      a friend spectating the finished run gets "▶ Watch the full run"
// Covers micatro/js/ui/replayview.js, micatro/js/replays.js, micatro/js/ui/main.js (replay mode,
// recordReplay, the endings), micatro/js/ui/screens.js (gameOver replay buttons, leaderboard ▶,
// replaysList), micatro/js/ui/pad.js (replay controls), micatro/js/ui/player.js (cancel, setSpeed),
// micatro/js/net.js (uploadReplay, fetchReplay, submitScore replay, finish replay),
// micatro/js/engine/session.js (ReplayStepper, viewChecksum), micatro/css/micatro.css (.replay-bar).
//   node overworld/tests/micatro_replay_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 8752;
const SHOTS = process.env.MICATRO_SHOTS || '';   // a folder: save screenshots there
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml' };
const STATE = { username: 'replayer', friendCode: 'MICRP0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 }, friends: ['bob'] };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }

// ---- recipes made by the engine in node (the same bot as micatro/tests/replay_test.mjs)
globalThis.localStorage = { getItem() { return null; }, setItem() { }, removeItem() { } };
const { playRun } = await import(pathToFileURL(path.join(ROOT, 'micatro/tests/replay_bot.mjs')).href);
const RPm = await import(pathToFileURL(path.join(ROOT, 'micatro/js/replays.js')).href);
const { Session } = await import(pathToFileURL(path.join(ROOT, 'micatro/js/engine/session.js')).href);
const long = playRun({ seed: 'REPLAY1', back: 'b_blue', stake: 2 }, { seed: 11 });
const longMeta = RPm.buildMeta(long.recipe, long.finalView, { username: 'bob' });
const longScan = Session.stepper(long.recipe).scan();
const tampered = { ...long.recipe, stake: 1 };                       // an "older" recording: plays out elsewhere
const QUICK_WIN = { name: 'Quick Win', params: { win_ante: 1, blind_scaling: 0.3 } };
const winRun = playRun({ seed: 'RPWIN1', back: 'b_red', stake: 1, customDeck: QUICK_WIN }, { seed: 5, endless: true, weakAfterWin: true, maxSteps: 400 });
const endlessAt = winRun.recipe.actions.findIndex((a) => a.type === 'endless');
if (endlessAt < 0 || !winRun.session.over) throw new Error('the quick-win fixture run must win, go Endless and end');
const broken = { ...long.recipe, actions: long.recipe.actions.slice(0, 6).concat([{ type: 'buy', id: 99999 }], long.recipe.actions.slice(6)) };
const SERVER = {
	feed0001: { code: await RPm.packRecipe(long.recipe), meta: longMeta, by: 'bob', when: Date.now() },
	bad00001: { code: await RPm.packRecipe(tampered), meta: longMeta, by: 'bob', when: Date.now() },
	bad00002: { code: await RPm.packRecipe(broken), meta: longMeta, by: 'bob', when: Date.now() },
};

// ---- server: static files + /api/mp stub
const seen = { put: [], score: [], publish: [], order: [] };
let putN = 0;
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let body = {}; try { body = JSON.parse(raw); } catch { }
		let out = { ok: true, state: STATE };
		const a = body.action;
		if (a === 'micatro-replay-put') {
			seen.put.push(body); seen.order.push('put');
			const id = body.id && SERVER[body.id] ? body.id : 'abcd' + String(++putN).padStart(4, '0');
			SERVER[id] = { code: body.code, meta: body.meta, by: 'replayer', when: Date.now() };
			out = { ok: true, id };
		} else if (a === 'micatro-replay-get') {
			const r = SERVER[body.id];
			out = r ? { code: r.code, meta: r.meta, by: r.by, when: r.when } : { error: 'not found' };
			res.writeHead(r ? 200 : 404, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return;
		} else if (a === 'run-score') { seen.score.push(body); seen.order.push('score'); out = { ok: true, rank: 2 }; }
		else if (a === 'run-leaderboard') out = { top: [{ name: 'bob', score: 54321, ante: 4, back: 'b_blue', stake: 2, replay: 'feed0001' }, { name: 'sam', score: 777, ante: 2, back: 'b_red', stake: 1 }], you: null };
		else if (a === 'publish-micatro') { seen.publish.push(body); out = { ok: true, watchers: 0, watcherNames: [] }; }
		else if (a === 'micatro-state') out = { snapshot: { view: long.frames[long.frames.length - 1] ? JSON.parse(long.frames[long.frames.length - 1].view) : null, events: [] }, seq: 9, label: 'Ante 2', room: 'u:bob', over: true, won: false, replay: 'feed0001', watchers: 1, watcherNames: ['replayer'] };
		else if (a === 'chat-get') out = { messages: [] };
		res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify(out)); return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));

const PADB = { cancel: 0, confirm: 1, context: 2, secondary: 3, L: 4, R: 5, select: 8, start: 9, up: 12, down: 13, left: 14, right: 15 };
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist', '--enable-unsafe-swiftshader', '--autoplay-policy=no-user-gesture-required'] });
	const newCtx = async ({ w = 1600, h = 900, signedIn = true, mobile = false } = {}) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		await page.setViewport({ width: w, height: h, deviceScaleFactor: 1, isMobile: mobile, hasTouch: mobile });
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 200)); });
		await page.evaluateOnNewDocument((st, signedIn) => {
			const pad = { id: 'Pro Controller 057e', index: 0, connected: true, mapping: 'standard', buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0 })), axes: [0, 0, 0, 0] };
			window.__owFakePads = [pad]; window.__pad = pad;
			try {
				if (!sessionStorage.getItem('rp_init')) {
					sessionStorage.setItem('rp_init', '1');
					localStorage.setItem('micatro_speed', '4'); localStorage.setItem('micatro_sfx', '0'); localStorage.setItem('micatro_music', '0');
					localStorage.removeItem('micatro_run_v1');
				}
				if (signedIn) { localStorage.setItem('magepunk_mp_token_v1', 'rp-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st)); }
				else { localStorage.removeItem('magepunk_mp_token_v1'); localStorage.removeItem('magepunk_mp_state_v1'); }
			} catch { }
		}, STATE, signedIn);
		const go = async (url) => {
			await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
			await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		};
		const tap = async (b, hold = 70) => { await page.evaluate(b => { window.__pad.buttons[b] = { pressed: true, value: 1 }; }, b); await sleep(hold); await page.evaluate(b => { window.__pad.buttons[b] = { pressed: false, value: 0 }; }, b); await sleep(160); };
		return { ctx, page, errors, go, tap };
	};
	const idle = (page) => waitFor(() => page.evaluate(() => window.__micatro.idle()), 30000);
	const shot = async (page, name) => { if (SHOTS) { await sleep(700); await page.screenshot({ path: path.join(SHOTS, name) }); } };   // (modals fade + rise in)
	const R = (page) => page.evaluate(() => { const r = window.__micatro.replay; return r && r.ready ? { index: r.index, playing: r.playing, speed: r.speed, ended: r.ended, notice: r.notice, total: r.total, mismatch: !!r.mismatch } : null; });
	const replayReady = (page) => waitFor(() => page.evaluate(() => !!(window.__micatro.replay && window.__micatro.replay.ready)), 30000);
	/** a quick game over: select the blind, play one card four times */
	const loseRun = async (page, seed) => {
		await page.evaluate((seed) => window.__micatro.newRun({ seed }), seed);
		await idle(page);
		await page.evaluate(() => window.__micatro.act({ type: 'select_blind' }));
		await idle(page);
		for (let i = 0; i < 6; i++) {
			const v = await page.evaluate(() => window.__micatro.view());
			if (v.over || v.state !== 'SELECTING_HAND') break;
			await page.evaluate((id) => window.__micatro.act({ type: 'highlight', ids: [id] }), v.areas.hand[0].id);
			await idle(page);
			await page.evaluate(() => window.__micatro.act({ type: 'play' }));
			await idle(page);
		}
		const shown = await waitFor(() => page.evaluate(() => !!document.querySelector('.go-modal .b-watch-replay')), 15000);
		await idle(page); await sleep(1200);   // (the modal rises in while the last cards fly off)
		return shown;
	};

	// ================================================================ 1-2. a signed-in run -> its replay
	{
		const { ctx, page, errors, go } = await newCtx();
		await go('/micatro/');
		A(await loseRun(page, 'RPLOSE1'), 'a run forced to a game over shows the game-over modal with "▶ Watch replay"');
		A(await page.evaluate(() => !!document.querySelector('.go-modal .b-copy-replay')), 'signed in, it also offers "🔗 Copy replay link"');
		await waitFor(() => seen.score.length > 0, 8000);
		const put = seen.put[0], sc = seen.score[0];
		A(put && /^G1\.[A-Za-z0-9_-]+$/.test(put.code) && put.meta && put.meta.checksum && put.meta.actions > 4, 'the finished run is uploaded (packed recipe + meta)', JSON.stringify(put && put.meta));
		A(sc && sc.replay === 'abcd0001' && seen.order.indexOf('put') < seen.order.indexOf('score'), 'the replay is uploaded BEFORE the score, and the score carries its id', JSON.stringify({ order: seen.order, replay: sc && sc.replay }));
		const recipe = await RPm.unpackRecipe(put.code);
		A(recipe && recipe.seed === 'RPLOSE1' && recipe.actions[0].type === 'select_blind' && recipe.actions.length === put.meta.actions, 'the uploaded code is the whole run (from its first action)', recipe && recipe.actions.length);
		A(await waitFor(() => seen.publish.some(b => b.over && b.replay === 'abcd0001'), 8000), 'the final publish carries the replay id (spectators can watch the full run)');
		const local = await page.evaluate(() => JSON.parse(localStorage.getItem('micatro_replays_v1') || '[]'));
		A(local.length === 1 && local[0].serverId === 'abcd0001' && local[0].recipe.actions.length === recipe.actions.length && local[0].meta.username === 'replayer', 'the run is kept in the local list with its server id', JSON.stringify(local.map(e => [e.id, e.serverId])));
		A(await page.evaluate(() => localStorage.getItem('micatro_run_v1') === null), 'the live run save is gone (the run is over)');
		await shot(page, 'gameover_replay_desktop.png');
		await page.click('.b-copy-replay');
		A(await waitFor(() => page.evaluate(() => /\/mr\/abcd0001$/.test(document.querySelector('.b-copy-replay').dataset.url || '')), 5000), 'Copy replay link gives the /mr/<id> short link', await page.evaluate(() => document.querySelector('.b-copy-replay').textContent));
		// watch it
		await page.click('.b-watch-replay');
		await waitFor(() => page.evaluate(() => /replay=local%3A|replay=local:/.test(location.search)), 8000);
		A(/replay=local:L/.test(decodeURIComponent(await page.evaluate(() => location.search))), 'Watch replay opens the local copy (?replay=local:<id>)', await page.evaluate(() => location.search));
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		A(await replayReady(page) && await page.evaluate(() => window.__micatro.mode === 'replay'), 'replay mode boots and the viewer is ready');
		A(await page.evaluate(() => !!document.querySelector('#replay-bar .rb-play') && document.querySelector('.controls').classList.contains('readonly')), 'the replay bar shows over a read-only table');
		A(await page.evaluate(() => /Seed\s*RPLOSE1/.test(document.querySelector('.banner').textContent) && /replayer/.test(document.querySelector('.banner').textContent)), 'the banner names the player and the seed');
		const total = (await R(page)).total;
		A(total === recipe.actions.length, 'the viewer has the whole run', total);
		A(await waitFor(async () => (await R(page)).playing && (await R(page)).index > 0, 5000), 'it starts playing by itself');
		A(await waitFor(() => page.evaluate(() => !window.__micatro.idle() || document.querySelectorAll('.pop-layer .popup').length > 0), 8000), 'the board animates the moves (the player is busy / popups show)');
		await shot(page, 'replay_midplay_desktop.png');
		A(await waitFor(async () => (await R(page)).ended, 60000), 'it plays through to the end of the run');
		await idle(page);
		let r = await R(page);
		const bv = await page.evaluate(() => ({ over: window.__micatro.board.view.over, state: window.__micatro.board.view.state }));
		A(r.index === total && !r.mismatch && /End of the run/.test(r.notice) && bv.over, 'the end matches the recording (no "older version" notice) and the table shows the game over', JSON.stringify({ r, bv }));
		A(await page.evaluate(() => !document.querySelector('.go-modal')), 'no game-over modal (and no score posted) in the viewer');
		// controls
		await page.click('.rb-first'); await sleep(300);
		r = await R(page);
		A(r.index === 0 && !r.playing, '⏮ goes back to the start (paused)', JSON.stringify(r));
		await page.click('.rb-next'); await idle(page);
		const i1 = (await R(page)).index;
		A(i1 >= 1 && !(await R(page)).playing, '▶| steps one move forward', i1);
		await page.click('.rb-next'); await idle(page);
		const i2 = (await R(page)).index;
		A(i2 > i1, '▶| again: the next move (selections run with it)', JSON.stringify({ i1, i2 }));
		await page.click('.rb-prev'); await sleep(300); await idle(page);
		const back = await page.evaluate(() => { const r = window.__micatro.replay; const v = r.stepper.view(); const b = window.__micatro.board.view; return { index: r.index, same: v.seq === b.seq && v.chips === b.chips && v.state === b.state && JSON.stringify(v.areas.hand.map(c => c.id)) === JSON.stringify(b.areas.hand.map(c => c.id)) }; });
		A(back.index === i1 && back.same, '◀ steps back one move and the table jumps to it', JSON.stringify(back));
		const speedBefore = await page.evaluate(() => localStorage.getItem('micatro_speed'));
		await page.click('.rb-speed[data-speed="2"]');
		r = await R(page);
		A(r.speed === 2 && await page.evaluate(() => document.querySelector('.rb-speed[data-speed="2"]').classList.contains('on') && window.__micatro.player.speed === 2), 'the 2× speed button sets the replay speed');
		A(await page.evaluate(() => localStorage.getItem('micatro_speed')) === speedBefore, "the replay speed leaves the player's game-speed setting alone");
		await page.keyboard.press('Space');
		A(await waitFor(async () => (await R(page)).playing, 2000), 'Space plays');
		await page.keyboard.press('Space');
		await sleep(150);
		r = await R(page);
		const held = r.index;
		await sleep(900);
		A(!r.playing && (await R(page)).index === held, 'Space pauses (the position holds)', JSON.stringify({ held, now: (await R(page)).index }));
		await page.keyboard.press('ArrowRight'); await idle(page);
		A((await R(page)).index > held, '→ steps forward');
		await page.keyboard.press('ArrowLeft'); await sleep(300);
		A((await R(page)).index <= held, '← steps back');
		await page.click('.rb-play');
		A(await waitFor(async () => (await R(page)).playing, 2000), 'the ▶ button plays');
		await page.click('.rb-play');
		A(!(await R(page)).playing, 'and pauses');

		// 5b. the main menu's Replays list (same browser: the local copy is there)
		await go('/micatro/');
		await page.waitForSelector('.main-menu .b-replays', { visible: true, timeout: 8000 });
		await page.click('.b-replays');
		await page.waitForSelector('.rp-modal .rp-row', { visible: true, timeout: 8000 });
		const rows = await page.evaluate(() => [...document.querySelectorAll('.rp-row')].map(r => ({ id: r.dataset.id, text: r.textContent, watch: !!r.querySelector('.b-rp-watch'), link: !!r.querySelector('.b-rp-link'), del: !!r.querySelector('.b-rp-del') })));
		A(rows.length === 1 && rows[0].watch && rows[0].link && rows[0].del && /Game over/.test(rows[0].text) && /Ante/.test(rows[0].text), 'the Replays menu lists the finished run with Watch / Copy link / Delete', JSON.stringify(rows));
		await shot(page, 'replays_menu_desktop.png');
		await page.click('.b-rp-link');
		A(await waitFor(() => page.evaluate(() => /\/mr\/abcd0001$/.test(document.querySelector('.b-rp-link').dataset.url || '')), 5000), "the list's link button gives the run's share link");
		await page.click('.b-rp-del');
		A(await page.evaluate(() => document.querySelectorAll('.rp-row').length === 1 && /Delete\?/.test(document.querySelector('.b-rp-del').textContent)), 'Delete asks first');
		await page.click('.b-rp-del');
		A(await page.evaluate(() => document.querySelectorAll('.rp-row').length === 0 && !!document.querySelector('.rp-empty') && JSON.parse(localStorage.getItem('micatro_replays_v1') || '[]').length === 0), 'a second press deletes it');
		const fatal = errors.filter(e => !/Failed to load resource|favicon/i.test(e));
		A(fatal.length === 0, 'no uncaught errors (run, game over, replay, menu)', fatal.slice(0, 4).join(' | '));
		await ctx.close();
	}

	// ================================================================ 1b. a win, then Endless: ONE replay, extended
	{
		const { ctx, page, errors, go } = await newCtx();
		await go('/micatro/');
		const putsBefore = seen.put.length, scoresBefore = seen.score.length;
		await page.evaluate((o) => window.__micatro.newRun(o), { seed: 'RPWIN1', back: 'b_red', stake: 1, customDeck: QUICK_WIN });
		await idle(page);
		const feed = async (acts) => {
			for (const a of acts) {
				await idle(page);
				const r = await page.evaluate((a) => window.__micatro.act(a), a);
				if (!r || !r.ok) return { a, r };
			}
			await idle(page);
			return null;
		};
		const bad1 = await feed(winRun.recipe.actions.slice(0, endlessAt));
		A(!bad1 && await waitFor(() => page.evaluate(() => !!document.querySelector('.go-modal.open, .go-modal') && !!document.querySelector('.go-modal .b-endless')), 15000), 'a quick custom-deck run WINS (the win modal offers Endless)', JSON.stringify(bad1));
		A(await page.evaluate(() => !!document.querySelector('.go-modal .b-watch-replay') && !!document.querySelector('.go-modal .b-copy-replay')), 'the win modal has the replay buttons too');
		await waitFor(() => seen.score.length > scoresBefore, 8000);
		const winPut = seen.put[putsBefore], winScore = seen.score[scoresBefore];
		const winId = winScore && winScore.replay;
		A(winPut && !winPut.id && winPut.meta.won && !winPut.meta.endless && /^abcd\d{4}$/.test(winId || ''), 'at the win the run so far is uploaded and the score links it', JSON.stringify({ id: winId, meta: winPut && winPut.meta }));
		await sleep(800);
		await page.click('.go-modal .b-endless');
		await sleep(300); await idle(page);
		const bad2 = await feed(winRun.recipe.actions.slice(endlessAt + 1));
		A(!bad2 && await waitFor(() => page.evaluate(() => !!document.querySelector('.go-modal .b-watch-replay') && !document.querySelector('.go-modal .b-endless')), 15000), 'Endless plays on to a game over', JSON.stringify(bad2));
		await waitFor(() => seen.score.length > scoresBefore + 1, 8000);
		const endPut = seen.put[seen.put.length - 1], endScore = seen.score[seen.score.length - 1];
		A(seen.put.length === putsBefore + 2 && endPut.id === winId && endPut.meta.endless && endPut.meta.actions === winRun.recipe.actions.length, 'at the game over the SAME replay id is extended to the whole run (win + Endless)', JSON.stringify({ puts: seen.put.length - putsBefore, id: endPut.id, actions: endPut.meta.actions }));
		A(endScore.replay === winId, 'the final score links the same replay');
		const full = await RPm.unpackRecipe(SERVER[winId].code);
		A(full && full.actions.length === winRun.recipe.actions.length && full.actions.some(a => a.type === 'endless'), 'the stored replay covers the whole run, Endless included');
		const local = await page.evaluate(() => JSON.parse(localStorage.getItem('micatro_replays_v1') || '[]'));
		A(local.length === 1 && local[0].serverId === winId && local[0].recipe.actions.length === winRun.recipe.actions.length && local[0].meta.endless, 'one local entry for the run (extended, not duplicated)', JSON.stringify(local.map(e => [e.id, e.serverId, e.recipe.actions.length])));
		await page.click('.go-modal .b-watch-replay');
		await waitFor(() => page.evaluate(() => /replay=local/.test(location.search)), 8000);
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		A(await replayReady(page), 'the whole-run replay opens');
		A(await page.evaluate(() => !!document.querySelector('.rb-ante.rb-win') && document.querySelectorAll('.rb-mark.win').length === 1), 'the scrubber marks the win (★) inside the run');
		await page.click('.rb-last'); await sleep(400);
		const r = await R(page);
		A(r.ended && !r.mismatch && /won, then Endless/.test(r.notice), 'it re-simulates to the same end: won, then Endless', JSON.stringify(r));
		const fatal = errors.filter(e => !/Failed to load resource|favicon/i.test(e));
		A(fatal.length === 0, 'no uncaught errors (win, Endless, replay)', fatal.slice(0, 4).join(' | '));
		await ctx.close();
	}

	// ================================================================ 3. a multi-ante server replay + the controller
	{
		const { ctx, page, errors, go, tap } = await newCtx();
		await go('/micatro/?replay=feed0001&autoplay=0');
		A(await replayReady(page), 'a server replay (?replay=<id>) loads', JSON.stringify(await page.evaluate(() => window.__micatro.replay && window.__micatro.replay.error)));
		const chips = await page.evaluate(() => [...document.querySelectorAll('.rb-ante')].map(c => ({ ante: +c.dataset.ante, index: +c.dataset.index })));
		A(chips.length === longScan.antes.length && chips.length >= 2 && chips.every((c, i) => c.index === longScan.antes[i].index), 'one "Ante N" chip per ante the run reached', JSON.stringify(chips));
		const marks = await page.evaluate(() => ({ blind: document.querySelectorAll('.rb-mark.blind').length, ante: document.querySelectorAll('.rb-mark.ante').length }));
		A(marks.blind === longScan.blinds.length && marks.ante === longScan.antes.length - 1, 'the scrubber marks every blind and ante boundary', JSON.stringify(marks));
		await page.click('.rb-ante[data-ante="2"]');
		await sleep(300); await idle(page);
		let r = await R(page);
		const bv = await page.evaluate(() => window.__micatro.board.view);
		A(r.index === chips[1].index && bv.ante === 2 && !r.playing, 'the "Ante 2" chip skips there (the table shows ante 2)', JSON.stringify({ index: r.index, ante: bv.ante }));
		A(await page.evaluate(() => document.querySelector('.rb-ante[data-ante="2"]').classList.contains('on')), 'the current ante chip is lit');
		// scrub
		const mid = Math.floor(long.recipe.actions.length / 2);
		await page.evaluate((v) => { const el = document.querySelector('.rb-range'); el.value = String(v); el.dispatchEvent(new Event('input', { bubbles: true })); el.dispatchEvent(new Event('change', { bubbles: true })); }, mid);
		await sleep(300); await idle(page);
		r = await R(page);
		const sv = await page.evaluate(() => ({ seq: window.__micatro.board.view.seq }));
		A(r.index === mid && sv.seq === JSON.parse(long.frames[mid].view).seq, 'scrubbing jumps to that action (the same table as the live run had)', JSON.stringify({ index: r.index, seq: sv.seq }));
		A(await page.evaluate((m) => /<b>\d+<\/b> \/ \d+/.test(document.querySelector('.rb-count').innerHTML) && document.querySelector('.rb-count b').textContent === String(m), mid), 'the counter shows the action index');
		// controller: RB steps, Y plays/pauses, LB steps back
		await tap(PADB.R); await idle(page);
		const afterR = (await R(page)).index;
		A(afterR > mid, 'controller RB steps forward', JSON.stringify({ mid, afterR }));
		await tap(PADB.L); await sleep(300);
		A((await R(page)).index < afterR, 'controller LB steps back');
		await tap(PADB.secondary);
		A(await waitFor(async () => (await R(page)).playing, 2000), 'controller Y (secondary) plays');
		await shot(page, 'replay_midplay_ante_desktop.png');
		await tap(PADB.secondary);
		A(!(await R(page)).playing, 'and pauses');
		// a bar button is a pad stop: move the reticle onto ⏮ and press confirm
		const reach = await page.evaluate(() => { const P = window.__micatroPad; const b = document.querySelector('#replay-bar .rb-first'); P.ensure(); return !!b; });
		await page.evaluate(() => { const P = window.__micatroPad; const el = document.querySelector('#replay-bar .rb-play'); P.ensure(); });
		const hint = await page.evaluate(() => document.getElementById('pad-hints').textContent);
		A(reach && /Play\/Pause/.test(hint) && /Step/.test(hint), 'the controller hints say Play/Pause + Step', hint);
		const stops = await page.evaluate(() => { let n = 0; for (let i = 0; i < 60; i++) { const f = window.__micatroPad.focus; if (f && f.el && f.el.closest && f.el.closest('#replay-bar')) return f.cls; window.__micatroPad.move('down'); n++; } return null; });
		A(stops && /rb-/.test(stops), 'the d-pad reaches the replay bar buttons', stops);
		const fatal = errors.filter(e => !/Failed to load resource|favicon/i.test(e));
		A(fatal.length === 0, 'no uncaught errors in the server replay', fatal.slice(0, 4).join(' | '));
		await ctx.close();
	}

	// ================================================================ 4. tampered / older + rejected
	{
		const { ctx, page, errors, go } = await newCtx({ signedIn: false });
		await go('/micatro/?replay=bad00001&autoplay=0');
		A(await replayReady(page), 'an older recording still opens (public, signed out)');
		await page.click('.rb-last'); await sleep(400);
		let r = await R(page);
		A(r.ended && r.mismatch && /recorded on an older version and may play out differently/.test(r.notice) && await page.evaluate(() => document.querySelector('.rb-note').classList.contains('warn') && document.querySelector('.rb-note').style.display !== 'none'), 'at the end, a different outcome shows the "older version" notice', JSON.stringify(r));
		await go('/micatro/?replay=bad00002&autoplay=0');
		A(await replayReady(page), 'a replay with an action the engine rejects opens');
		await page.evaluate(() => window.__micatro.replay.setSpeed(4));
		await page.click('.rb-play');
		A(await waitFor(async () => (await R(page)).ended, 30000), 'playing it stops at the rejected action (no crash)');
		r = await R(page);
		A(r.index === 6 && !r.playing && /older version/.test(r.notice) && /move 7 of/.test(r.notice), 'it stops gracefully with the notice, at the rejected move', JSON.stringify(r));
		A(await page.evaluate(() => !!document.querySelector('.rb-mark.stop')), 'the scrubber marks where it stops');
		await go('/micatro/?replay=0000dead');
		A(await waitFor(() => page.evaluate(() => /expired|never existed/.test(document.querySelector('.banner').textContent)), 8000), 'a missing replay says it expired');
		await go('/micatro/?replay=local:Lnope');
		A(await waitFor(() => page.evaluate(() => /no longer on this device/.test(document.querySelector('.banner').textContent)), 8000), 'a missing local replay says so');
		const fatal = errors.filter(e => !/Failed to load resource|favicon|404/i.test(e));
		A(fatal.length === 0, 'no uncaught errors for broken replays', fatal.slice(0, 4).join(' | '));
		await ctx.close();
	}

	// ================================================================ 5. leaderboard ▶ + spectator link
	{
		const { ctx, page, errors, go } = await newCtx();
		await go('/micatro/');
		await page.waitForSelector('.main-menu .b-leaders', { visible: true, timeout: 8000 });
		await page.click('.b-leaders');
		await page.waitForSelector('.lb-row:not(.lb-h)', { visible: true, timeout: 8000 });
		const lb = await page.evaluate(() => [...document.querySelectorAll('.lb-row:not(.lb-h)')].map(r => { const a = r.querySelector('.b-lb-replay'); return a ? a.getAttribute('href') : null; }));
		A(lb[0] === '/micatro/?replay=feed0001' && lb[1] === null, 'a leaderboard row with a replay gets a ▶ (rows without one do not)', JSON.stringify(lb));
		await shot(page, 'leaderboard_replay_desktop.png');
		await page.click('.b-lb-replay');
		await waitFor(() => page.evaluate(() => location.search === '?replay=feed0001'), 8000);
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		A(await replayReady(page), 'the ▶ opens that run in the viewer');
		await go('/micatro/?spectate=bob');
		A(await waitFor(() => page.evaluate(() => { const a = document.querySelector('.banner .b-watch-full'); return !!a && a.getAttribute('href') === '/micatro/?replay=feed0001'; }), 10000), 'a friend spectating the finished run gets "▶ Watch the full run"');
		const fatal = errors.filter(e => !/Failed to load resource|favicon/i.test(e));
		A(fatal.length === 0, 'no uncaught errors (leaderboard, spectate)', fatal.slice(0, 4).join(' | '));
		await ctx.close();
	}

	// ================================================================ 6. a guest on a phone
	{
		const { ctx, page, errors, go } = await newCtx({ w: 390, h: 844, signedIn: false, mobile: true });
		await go('/micatro/');
		const puts = seen.put.length;
		A(await loseRun(page, 'RPPHONE'), 'a guest run on a phone ends with "▶ Watch replay"');
		A(await page.evaluate(() => !document.querySelector('.b-copy-replay')) && seen.put.length === puts, 'a guest gets no share button and nothing is uploaded');
		const goLay = await page.evaluate(() => { const b = document.querySelector('.b-watch-replay').getBoundingClientRect(); return { l: b.left, r: b.right, t: b.top, b: b.bottom, sw: document.documentElement.scrollWidth }; });
		A(goLay.l >= 0 && goLay.r <= 390 && goLay.b <= 844 && goLay.sw <= 390, 'the Watch replay button fits the phone screen', JSON.stringify(goLay));
		await shot(page, 'gameover_replay_phone.png');
		await page.tap('.b-watch-replay');
		await waitFor(() => page.evaluate(() => /replay=local/.test(location.search)), 8000);
		await waitFor(() => page.evaluate(() => !!(window.__micatro && window.__micatro.ready)), 30000);
		A(await replayReady(page), 'the guest watches the local copy', await page.evaluate(() => location.search + ' | ' + (document.querySelector('.banner') || {}).textContent));
		await go('/micatro/?replay=feed0001');
		A(await replayReady(page), 'a phone opens a shared replay');
		await waitFor(async () => (await R(page)).index > 8, 15000);
		await shot(page, 'replay_midplay_phone_tucked.png');
		await page.evaluate(() => { window.__micatro.replay.pause(); dispatchEvent(new PointerEvent('pointerdown')); });
		await sleep(400);
		const lay = await page.evaluate(() => {
			const bar = document.getElementById('replay-bar').getBoundingClientRect();
			const btns = [...document.querySelectorAll('#replay-bar .rb-row .rb-btn')].map(b => b.getBoundingClientRect());
			const hit = (sel) => { const b = document.querySelector(sel).getBoundingClientRect(); const e = document.elementFromPoint(b.left + b.width / 2, b.top + b.height / 2); return !!e && (e === document.querySelector(sel) || document.querySelector(sel).contains(e)); };
			return { l: bar.left, r: bar.right, b: bar.bottom, t: bar.top, sw: document.documentElement.scrollWidth, sh: document.documentElement.scrollHeight, minW: Math.min(...btns.map(b => b.width)), minH: Math.min(...btns.map(b => b.height)), inside: btns.every(b => b.left >= 0 && b.right <= 390), playHit: hit('.rb-play'), exitHit: hit('.rb-exit') };
		});
		A(lay.l >= 0 && lay.r <= 390 && lay.b <= 844 && lay.sw <= 390 && lay.sh <= 844, 'the replay bar fits a 390 px phone (no sideways scroll)', JSON.stringify(lay));
		A(lay.inside && lay.minW >= 30 && lay.minH >= 36 && lay.playHit && lay.exitHit, 'its buttons are on screen, tappable and not covered', JSON.stringify(lay));
		await shot(page, 'replay_midplay_phone.png');
		await page.tap('.rb-play');
		A((await R(page)).playing, 'tapping ▶ plays on touch');
		// the bar tucks away while it plays untouched, and comes back on a tap
		A(await waitFor(() => page.evaluate(() => document.getElementById('replay-bar').classList.contains('tucked')), 8000), 'while it plays untouched the bar tucks away');
		await sleep(600);   // (let it finish sliding down)
		await page.tap('.rb-handle');
		A(await page.evaluate(() => !document.getElementById('replay-bar').classList.contains('tucked')) && (await R(page)).playing, 'a tap brings it back (without pressing what slides up under the finger)', JSON.stringify(await R(page)));
		await sleep(500);
		await page.tap('.rb-play');
		A(!(await R(page)).playing, 'tapping ❚❚ pauses on touch', JSON.stringify({ r: await R(page), cls: await page.evaluate(() => document.getElementById('replay-bar').className + ' ' + document.querySelector('.rb-play').textContent) }));
		await page.evaluate(() => window.__micatro.replay.pause());
		await go('/micatro/');
		await page.waitForSelector('.main-menu .b-replays', { visible: true, timeout: 8000 });
		await page.tap('.b-replays');
		await page.waitForSelector('.rp-modal .rp-row', { visible: true, timeout: 8000 });
		const rl = await page.evaluate(() => { const r = document.querySelector('.rp-row').getBoundingClientRect(); return { l: r.left, r: r.right, link: !!document.querySelector('.b-rp-link'), sw: document.documentElement.scrollWidth }; });
		A(rl.l >= 0 && rl.r <= 390 && rl.sw <= 390 && !rl.link, 'the Replays list fits the phone; a guest gets no link button', JSON.stringify(rl));
		await shot(page, 'replays_menu_phone.png');
		const fatal = errors.filter(e => !/Failed to load resource|favicon/i.test(e));
		A(fatal.length === 0, 'no uncaught errors on the phone', fatal.slice(0, 4).join(' | '));
		await ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message); console.error(e);
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
