// replay_clips_test.mjs — CLIPS (owner, 2026-11-19): a replay link that starts at a moment. Every game's replay viewer
// reads `&t=<position>` (site/clip.js) and has a "Copy link to this moment" button that copies its own link with t set to
// where the viewer is.
//   - site/clip.js on its own: t read (whole numbers, clamped, junk ignored), a link built with t and the viewer's params
//   - headless, the REAL server over sqlite behind a static server, four games end to end:
//       Scoundrel  /scoundrel/?replay=<seed>.<actions>&t=4   (move 4, then step, copy, and the copied link opens there)
//       Pair of Pears /pairofpears/?replay=...&t=3           (the same)
//       Pocket Enhanced /pocketenhanced/?replay=<id>&t=7     (a match kept on the account: pocket-replay-put)
//       PokéChess /overworld/pokechess.html?replay=<id>&t=6  (a tape kept with replay-put)
//     a link without t still starts at the beginning
//   - every other viewer reads t and has the button (Battlecards ?rshare= / ?amreplay= / ?rrun=, Micatro, MicaSurvivor 2D
//     and 3D, the overworld's battle replays and journeys): checked in their source
//   node overworld/tests/replay_clips_test.mjs
import fs from 'fs';
import os from 'os';
import http from 'http';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import { DatabaseSync } from 'node:sqlite';
import { buildSync } from 'esbuild';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8734;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { /* retry */ } await sleep(150); } return false; }
const src = (f) => { try { return fs.readFileSync(path.join(ROOT, f), 'utf8'); } catch { return ''; } };

// ---------- site/clip.js on its own ----------
{
	let C = null;
	try { C = await import(pathToFileURL(path.join(ROOT, 'site/clip.js')).href); } catch { C = null; }
	A(!!C && typeof C.clipStart === 'function' && typeof C.clipUrl === 'function' && typeof C.clipButton === 'function', 'site/clip.js exports clipStart / clipUrl / clipButton');
	if (C) {
		const at = (u) => { globalThis.location = new URL(u); };
		at('http://x/scoundrel/?replay=s1.0123&t=12');
		A(C.clipStart() === 12 && C.clipStart(5) === 5, 'clipStart reads t (and clamps it to the last position)');
		at('http://x/scoundrel/?replay=s1.0123&t=abc'); const junk = C.clipStart();
		at('http://x/scoundrel/?replay=s1.0123'); const none = C.clipStart();
		A(junk === null && none === null, 'no t, or junk, is no start position');
		at('http://x/battlecards/index.html?rrun=abcd1234&fight=1&t=3#x');
		const u = new URL(C.clipUrl(9, { fight: 2 }));
		A(u.searchParams.get('t') === '9' && u.searchParams.get('fight') === '2' && u.searchParams.get('rrun') === 'abcd1234' && !u.hash, 'clipUrl keeps the replay params and sets t (and any others)', u.toString());
		const u2 = new URL(C.clipUrl(4, { replay: 'ab12cd34', spectate: null }));
		A(u2.searchParams.get('replay') === 'ab12cd34' && u2.searchParams.get('t') === '4', 'clipUrl can name the replay itself', u2.toString());
		delete globalThis.location;
	}
}

// ---------- every viewer: reads t, has the button ----------
{
	const bc = src('battlecards/game_replays.js'), mt = src('micatro/js/ui/replayview.js'), ms = src('micasurvivor/js/ui/watch-ui.js'), m3 = src('micasurvivor/m3d/main.js');
	const fs_ = src('overworld/factoryspec.js'), fo = src('overworld/ow_follow.js'), om = src('overworld/main.js');
	A(/renderReplayFrame\(clipStart\(replayTape\.frames\.length - 1\) \|\| 0\)/.test(bc) && /get\('fight'\)/.test(bc) && /rb-clip/.test(bc), 'Battlecards: a shared tape / mail match / run playlist starts at &t= (a run: &fight=), and the bar has the link button');
	A(/clipStart\(total\)/.test(mt) && /seekTo\(clipAt/.test(mt) && /rb-clip/.test(mt), 'Micatro: a replay link starts paused at &t=<action>, and the bar has the link button');
	A(/function clipAt\(\)/.test(ms) && /wc-clip/.test(ms) && /id: p\.arg/.test(ms), 'MicaSurvivor 2D: a shared replay starts at &t=<second>, and its controls have the link button');
	A(/watchT = Math\.min\(tapeEnd, p\.from \+ \+Q\.get\('t'\)\)/.test(m3) && /m3d-clip/.test(m3) && /q\.set\('t', Q\.get\('t'\)\)/.test(m3), 'MicaSurvivor 3D: a replay starts at &t=<second> (kept through its reload), with the link button');
	A(/playTape\(tape, onEnd, startAt\)/.test(fs_) && /copyMoment\(\)/.test(fs_) && /factorySpec\.playTape\(t, \(\) => \{\}, /.test(om), 'Overworld battle replays: ?owreplay=<id>&t=<frame> opens there, C / the button copy the link');
	A(/clipStart\(tape\.frames\.length - 1\)/.test(fo) && /floatingClipButton/.test(fo), 'Overworld journeys: ?journey=<id>&t=<frame> opens there, L / the button copy the link');
}

// ---------- the real handler over sqlite ----------
const sqlite = new DatabaseSync(':memory:');
sqlite.exec('CREATE TABLE mp_store (key TEXT PRIMARY KEY, value TEXT, updated_at INTEGER)');
const MP_DB = {
	prepare(sql) {
		const stmt = sqlite.prepare(sql);
		const bound = [];
		const api = {
			bind(...args) { bound.length = 0; bound.push(...args); return api; },
			async first() { return stmt.get(...bound) ?? null; },
			async run() { return stmt.run(...bound); },
			async all() { return { results: stmt.all(...bound) }; },
		};
		return api;
	},
};
const bundle = path.join(fs.mkdtempSync(path.join(os.tmpdir(), 'mp-clips-')), 'mp.bundle.mjs');
buildSync({
	entryPoints: [path.join(ROOT, 'server/mp.mjs')], bundle: true, platform: 'node', format: 'esm', outfile: bundle,
	banner: { js: "import { createRequire } from 'node:module'; const require = createRequire(import.meta.url);" }, logLevel: 'silent',
});
const { default: handler } = await import(pathToFileURL(bundle).href);
let ipN = 0;
const call = async (action, body = {}, token) => {
	const req = new Request('http://localhost/api/mp', {
		method: 'POST',
		headers: { 'content-type': 'application/json', 'cf-connecting-ip': '10.9.' + (1 + (ipN >> 8 & 0xff)) + '.' + (1 + (ipN++ & 0xff)), ...(token ? { authorization: 'Bearer ' + token } : {}) },
		body: JSON.stringify({ action, ...body }),
	});
	const res = await handler(req, { MP_DB });
	return res.json();
};
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ogg': 'audio/ogg', '.ttf': 'font/ttf', '.svg': 'image/svg+xml', '.webp': 'image/webp' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		const ip = req.headers['x-test-ip'] || ('10.8.0.' + (req.socket.remotePort % 250 + 1));
		const request = new Request('http://localhost/api/mp', { method: 'POST', headers: { 'content-type': 'application/json', 'cf-connecting-ip': ip, ...(req.headers.authorization ? { authorization: req.headers.authorization } : {}) }, body: raw });
		try {
			const r = await handler(request, { MP_DB });
			res.writeHead(r.status, { 'content-type': 'application/json' }); res.end(await r.text());
		} catch (e) { res.writeHead(500); res.end(JSON.stringify({ error: String(e) })); }
		return;
	}
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));

const token = (await call('register', { username: 'alice', password: 'clips-test-pass' })).token;
A(!!token, 'a real account');

// a Scoundrel run (the engine on its own: potions + weapons first, bare-handed fights)
const SE = await import(pathToFileURL(path.join(ROOT, 'scoundrel/js/engine.js')).href);
const run = SE.newRun('clip1');
for (let g = 0; g < 2000 && run.state !== SE.STATE.OVER; g++) {
	if (run.state === SE.STATE.FIGHT_CHOICE) { SE.apply(run, 'b'); continue; }
	if (run.state === SE.STATE.CLEARED) { SE.apply(run, 'd'); continue; }
	const i = run.room.findIndex((c) => SE.cardEnabled(run, c) && SE.kindOf(c) !== 'monster');
	SE.apply(run, String(i >= 0 ? i : run.room.findIndex((c) => SE.cardEnabled(run, c))));
}
A(run.actions.length >= 6, 'a Scoundrel run to replay', run.actions.length);

// a Pocket Enhanced match, computer against computer, kept on the account
const PE = await import(pathToFileURL(path.join(ROOT, 'pocketenhanced/js/engine/engine.js')).href);
const { nextAction } = await import(pathToFileURL(path.join(ROOT, 'pocketenhanced/js/ai.js')).href);
const { STARTERS, starterDeck } = await import(pathToFileURL(path.join(ROOT, 'pocketenhanced/js/decks.js')).href);
const { packString } = await import(pathToFileURL(path.join(ROOT, 'battlecards/codec.js')).href);
const cfg = { seed: 'clip-pocket', players: [{ name: 'A', ai: true, ...starterDeck(STARTERS[0].id) }, { name: 'B', ai: true, ...starterDeck(STARTERS[1].id) }] };
const PS = PE.createGame(JSON.parse(JSON.stringify(cfg))), acts = [];
for (let guard = 0; !PS.over && guard < 4000; guard++) {
	const seat = PS.pending ? PS.pending.seat : PS.phase === 'setup' ? PS.players.find(p => !p.setup && !p.eliminated).seat : PS.current;
	const banned = new Set(); let done = false;
	for (let t = 0; t < 60 && !done; t++) {
		const a = nextAction(PE.view(PS, seat), banned) || { t: 'execute', seat, commands: [null, null] };
		try { PE.apply(PS, a); acts.push(a); done = true; } catch (e) { if (!e.refused) throw e; banned.add(JSON.stringify(a)); }
	}
	if (!done) break;
}
const pput = await call('pocket-replay-put', { code: await packString(JSON.stringify({ v: PE.ENGINE_VERSION, config: cfg, actions: acts })), meta: { kind: 'test', players: [{ name: 'A' }, { name: 'B' }], winner: 'A', turns: 3 } }, token);
A(PS.over && acts.length > 12 && pput && /^[a-f0-9]{8}$/.test(pput.id || ''), 'a Pocket match kept on the account', JSON.stringify(pput));

// a PokéChess tape (what the screen showed, step by step) kept with the generic replay-put
const chessTape = { v: 1, game: 'pokechess', when: Date.now(), frames: Array.from({ length: 10 }, (_, i) => ({ v: 1, board: Array(64).fill(null), turn: 'w', last: null, cap: [0, 0], phase: 'player', result: null, msg: 'step ' + i, bt: null })) };
const cput = await call('replay-put', { code: await packString(JSON.stringify(chessTape)) }, token);
A(cput && /^[a-f0-9]{8}$/.test(cput.id || ''), 'a PokéChess tape kept on the account', JSON.stringify(cput));

const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--disable-gpu', '--mute-audio', '--autoplay-policy=no-user-gesture-required'] });
const ctx = await browser.createBrowserContext();
const open = async (url) => {
	const page = await ctx.newPage();
	await page.setViewport({ width: 1400, height: 900, deviceScaleFactor: 1 });
	page.on('dialog', (d) => d.dismiss().catch(() => {}));   // (a clipboard the browser refuses falls back to a prompt)
	page.on('pageerror', (e) => console.log('   [page error] ' + String(e.message || e).slice(0, 160)));
	await page.goto(`http://localhost:${PORT}${url}`, { waitUntil: 'domcontentloaded' });
	return page;
};
const clipOf = (page) => page.evaluate(() => window.__lastClip || '');
const tOf = (u) => { try { return new URL(u).searchParams.get('t'); } catch { return null; } };
try {
	// ---------- Scoundrel ----------
	{
		const param = 'clip1.' + run.actions;
		const page = await open('/scoundrel/?replay=' + param + '&t=4');
		const ok = await waitFor(() => page.evaluate(() => !!(window.__scoundrel && window.__scoundrel.ready && window.__scoundrel.replayAt)), 30000);
		A(ok && (await page.evaluate(() => window.__scoundrel.replayAt())) === 4, 'Scoundrel: &t=4 opens the replay at move 4', ok ? await page.evaluate(() => window.__scoundrel.replayAt()) : 'no viewer');
		const has = await page.evaluate(() => !!document.querySelector('.b-rp-clip'));
		A(has, 'Scoundrel: the replay bar has a "Copy link to this moment" button');
		if (has) {
			await page.evaluate(() => document.querySelector('.b-rp-step').click());
			await sleep(200);
			await page.evaluate(() => document.querySelector('.b-rp-clip').click());
			await waitFor(async () => !!(await clipOf(page)), 3000);
			const link = await clipOf(page);
			A(tOf(link) === '5' && new URL(link).searchParams.get('replay') === param, 'Scoundrel: after a step the button copies a link at move 5', link.slice(0, 80) + '…' + link.slice(-12));
			const p2 = await open(new URL(link).pathname + new URL(link).search);
			A(await waitFor(() => p2.evaluate(() => !!(window.__scoundrel && window.__scoundrel.ready && window.__scoundrel.replayAt && window.__scoundrel.replayAt() === 5)), 30000), 'Scoundrel: the copied link opens at that moment');
			await p2.close();
		}
		const p0 = await open('/scoundrel/?replay=' + param);
		A(await waitFor(() => p0.evaluate(() => !!(window.__scoundrel && window.__scoundrel.ready)), 30000) && (await p0.evaluate(() => (window.__scoundrel.replayAt ? window.__scoundrel.replayAt() : 0))) === 0, 'Scoundrel: a link without t starts at the beginning');
		await page.close(); await p0.close();
	}

	// ---------- Pair of Pears ----------
	{
		const g = await open('/pairofpears/');
		await waitFor(() => g.evaluate(() => !!(window.__pears && window.__pears.ready)), 30000);
		await g.evaluate(async () => {
			const W = window.__pears, P = W.engine, wait = (ms) => new Promise((r) => setTimeout(r, ms));
			W.newRun({ seed: 'clipp1' });
			for (let k = 0, n = 0; k < 400 && n < 14; k++) {
				const ph = P.phase();
				if (ph === 'over' || ph === 'won') break;
				if (ph === 'clear') { W.act('continue'); continue; }
				if (ph === 'shop') { W.act('next'); continue; }
				if (W.view().busy) { await wait(120); continue; }
				const hid = P._cards().filter((c) => !c.faceUp && !c.matched);
				const first = P.run().first != null ? P._cards().find((c) => c.id === P.run().first) : null;
				if (first) { const mate = hid.find((c) => c.fruit === first.fruit); W.act('reveal', (mate || hid[0]).id); } else W.act('reveal', hid[0].id);
				n++;
				await wait(30);
			}
		});
		const recipe = await g.evaluate(() => window.__pears.recipe());
		A(recipe && recipe.actions && recipe.actions.length >= 6, 'a Pair of Pears run to replay', JSON.stringify(recipe || {}).slice(0, 60));
		await g.close();
		if (recipe) {
			const param = recipe.seed + '.' + recipe.actions;
			const page = await open('/pairofpears/?replay=' + param + '&t=3');
			const ok = await waitFor(() => page.evaluate(() => !!(window.__pears && window.__pears.ready && window.__pears.replayAt)), 30000);
			A(ok && (await page.evaluate(() => window.__pears.replayAt())) === 3, 'Pair of Pears: &t=3 opens the replay at move 3', ok ? await page.evaluate(() => window.__pears.replayAt()) : 'no viewer');
			const has = await page.evaluate(() => !!document.querySelector('.b-rp-clip'));
			A(has, 'Pair of Pears: the replay bar has a "Copy link to this moment" button');
			if (has) {
				await page.evaluate(() => document.querySelector('.b-rp-back').click());
				await sleep(200);
				// (a tap, as on a phone)
				const r = await page.evaluate(() => { const b = document.querySelector('.b-rp-clip').getBoundingClientRect(); return { x: b.left + b.width / 2, y: b.top + b.height / 2 }; });
				await page.mouse.click(r.x, r.y);
				await waitFor(async () => !!(await clipOf(page)), 3000);
				const link = await clipOf(page);
				A(tOf(link) === '2' && new URL(link).searchParams.get('replay') === param, 'Pair of Pears: after a step back a tap copies a link at move 2', link.slice(-14));
			}
			await page.close();
		}
	}

	// ---------- Pocket Enhanced (a match kept on the account) ----------
	if (pput && pput.id) {
		const page = await open('/pocketenhanced/?replay=' + pput.id + '&t=7');
		const ok = await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready && window.__pocket.mode === 'replay')), 30000);
		A(ok && (await page.evaluate(() => window.__pocket.state().actions)) === 7, 'Pocket: &t=7 opens the replay at action 7', ok ? await page.evaluate(() => window.__pocket.state().actions) : 'no replay');
		const has = await page.evaluate(() => !!document.querySelector('[data-k="rbclip"]'));
		A(has, 'Pocket: the replay bar has a "Copy link to this moment" button');
		if (has) {
			await page.evaluate(() => document.querySelector('[data-k="rb3"]').click());
			await sleep(200);
			await page.evaluate(() => document.querySelector('[data-k="rbclip"]').click());
			await waitFor(async () => !!(await clipOf(page)), 3000);
			const link = await clipOf(page);
			A(tOf(link) === '8' && new URL(link).searchParams.get('replay') === pput.id, 'Pocket: after a step the button copies a link at action 8', link);
		}
		await page.close();
	}
	// ---------- PokéChess (a tape kept with replay-put) ----------
	if (cput && cput.id) {
		const page = await open('/overworld/pokechess.html?replay=' + cput.id + '&t=6');
		const ok = await waitFor(() => page.evaluate(() => !!(window.__pokechess && window.__pokechess.mode === 'replay' && window.__pokechess.replay)), 30000);
		A(ok && (await page.evaluate(() => window.__pokechess.replay.i)) === 6 && !(await page.evaluate(() => window.__pokechess.replay.playing)), 'PokéChess: &t=6 opens the replay paused at step 6', ok ? JSON.stringify(await page.evaluate(() => ({ i: window.__pokechess.replay.i, p: window.__pokechess.replay.playing }))) : 'no replay');
		const btn = await page.evaluate(() => { const b = document.getElementById('pcCopy'); return b && !b.hidden ? b.textContent : null; });
		A(btn && /this moment/.test(btn), 'PokéChess: the link button on the bar copies a link to this moment', btn);
		if (btn) {
			await page.keyboard.press('ArrowRight');
			await page.click('#pcCopy');
			await waitFor(async () => !!(await clipOf(page)), 3000);
			const link = await clipOf(page);
			A(tOf(link) === '7' && new URL(link).searchParams.get('replay') === cput.id, 'PokéChess: after a step it copies a link at step 7', link);
		}
		await page.close();
	}
} finally {
	await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
