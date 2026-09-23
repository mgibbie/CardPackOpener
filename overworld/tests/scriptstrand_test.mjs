// scriptstrand_test.mjs — an interrupted scripted walk must not freeze the screen.
//
// Reported twice. Second repro named the mechanism exactly: "a scripted NPC walk
// (applymovement) ending or getting interrupted leaves the NPC at moving=true,
// moveTo=null. Screen freezes on the old frame while position keeps updating.
// Reload fixes it, no progress lost."
//
// CAUSE. The cutscene `move` driver animates an actor's px/py from the SCENE's
// own from/to (`s.from`/`s.to`) and merely BORROWS actor.moving as a flag — it
// never fills in actor.moveFrom/moveTo. A step that runs to completion clears the
// flag itself, because `actor.moving = p < 1` is false at p === 1. An INTERRUPTED
// scene left moving=true with both arrays still null, and the actor's own
// update() dereferences them on the very next frame:
//
//     this.px = this.moveTo[0];            // TypeError, every frame, forever
//
// which killed the draw loop. tickStats.frames++ sits at the TOP of tick(), above
// the throw, which is exactly why position kept updating while the screen sat on
// its last painted frame. Nothing is persisted, so a reload clears it — matching
// "reload fixes it, no progress lost".
//
// cutscene.stop() has a dozen callers: every trigger's catch block, both
// battle-loss paths, and the ON_TRANSITION bail that fires on EVERY entry to a
// map whose transition script contains an applymovement.
//
// FIX, two layers:
//   1. root cause — the scene remembers whose flag it borrowed and hands it back
//      (_releaseActors on both stop() and _finish()).
//   2. hardening — both actor classes self-heal instead of throwing, so no future
//      producer of this state can take the renderer down with it.
//
//   node overworld/tests/scriptstrand_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- source ----------
{
	const ev = fs.readFileSync(path.join(ROOT, 'overworld/events.js'), 'utf8');
	const np = fs.readFileSync(path.join(ROOT, 'overworld/npcs.js'), 'utf8');
	const en = fs.readFileSync(path.join(ROOT, 'overworld/engine.js'), 'utf8');

	A(/_releaseActors\(\)\s*\{/.test(ev), 'the scene can hand its actors back');
	A(/stop\(\)\s*\{\s*this\._releaseActors\(\)/.test(ev), 'stop() releases them');
	A(/_finish\(\)\s*\{\s*this\._releaseActors\(\)/.test(ev), 'a normal finish releases them too');
	A(/movedActors/.test(ev), 'the driver records whose flag it borrowed');

	// Both actor classes must refuse to dereference a movement they were never
	// given. Stated as an ordering invariant rather than a proximity match: the
	// guard has to come BEFORE the first dereference, which is the only arrangement
	// that can actually prevent the throw.
	for (const [name, src] of [['npcs.js', np], ['engine.js', en]]) {
		const guard = src.indexOf('!this.moveTo || !this.moveFrom');
		const deref = src.indexOf('this.moveTo[0]');
		A(guard >= 0, `${name} has the guard at all`);
		A(deref >= 0, `${name} still has the movement it is guarding`);
		A(guard >= 0 && deref >= 0 && guard < deref,
			`${name} guards before it dereferences`, `guard@${guard} deref@${deref}`);
	}
}

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8985;
	const STATE = { username: 'strand', friendCode: 'STRND0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let raw = ''; for await (const c of req) raw += c;
			let b = {}; try { b = JSON.parse(raw); } catch (e) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
			if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
			return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [] }));
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));
	const sleep = ms => new Promise(r => setTimeout(r, ms));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const pageErrors = [];
		page.on('pageerror', e => pageErrors.push(String(e.message)));
		await page.setViewport({ width: 1100, height: 800 });
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'strand-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{
				speciesId: 'squirtle', name: 'SQUIRTLE', level: 20, gender: 'M', friend: 70, types: ['Water'],
				ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
				stats: { hp: 60, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 60, curHP: 60,
				exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's7.png', num: 7,
			}]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route25_SeaCottage`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');
		await sleep(1200);

		const health = () => page.evaluate(() => {
			const g = window.__ow.gateReport();
			return { frames: g.tick.frames, errors: g.tick.errors, lastError: g.tick.lastError };
		});
		const stranded = () => page.evaluate(() => {
			const bad = [];
			for (const n of (window.__ow.npcs?.list || [])) if (n.moving && (!n.moveTo || !n.moveFrom)) bad.push(n.ev.local_id || n.ev.graphics_id);
			const p = window.__ow.player;
			if (p.moving && (!p.moveTo || !p.moveFrom)) bad.push('PLAYER');
			return bad;
		});

		A((await health()).errors === 0, 'the world starts clean', JSON.stringify(await health()));

		// ===== 1. THE REPORTED TRIGGER: a real scripted walk, interrupted mid-step =====
		{
			// Bill's script walks him into the teleporter. Catch an actor mid-step and
			// stop the scene out from under it, exactly as the ON_TRANSITION bail and
			// every trigger catch-block do.
			await page.evaluate(() => window.__ow.runScriptLabel('Route25_SeaCottage_EventScript_Bill', null));
			let caught = false;
			for (let i = 0; i < 260 && !caught; i++) {
				caught = await page.evaluate(() => {
					const moving = (window.__ow.npcs?.list || []).some(n => n.moving);
					if (moving) { window.__ow.cutscene.stop(); return true; }
					try { window.__ow.dialog.key('z'); } catch (e) {}
					return false;
				});
				await sleep(45);
			}
			A(caught, 'a scripted walk was caught mid-step and interrupted');
			const bad = await stranded();
			A(bad.length === 0, 'the interrupted scene left nobody stranded', JSON.stringify(bad));

			const before = await health();
			await sleep(900);
			const after = await health();
			A(after.errors === 0, 'and nothing threw afterwards', JSON.stringify(after));
			A(after.frames > before.frames, 'the game keeps running', `${before.frames} -> ${after.frames}`);
			A(pageErrors.length === 0, 'no uncaught page error', JSON.stringify(pageErrors.slice(0, 2)));
		}

		// ===== 2. THE HARDENING: force the exact reported state by hand =====
		// This is the state the bug report names — moving=true, moveTo=null — reached
		// without the cutscene, so it also covers any FUTURE producer of it.
		{
			const set = await page.evaluate(() => {
				const n = (window.__ow.npcs?.list || [])[0];
				if (!n) return null;
				n.moving = true; n.moveTo = null; n.moveFrom = null; n.moveT = 0;
				return { who: n.ev.local_id || n.ev.graphics_id, tx: n.tx, ty: n.ty };
			});
			A(!!set, 'an NPC was forced into the reported state', JSON.stringify(set));
			const before = await health();
			await sleep(700);
			const after = await health();
			A(after.errors === before.errors, 'a stranded NPC does not throw', JSON.stringify(after));
			A(after.frames > before.frames, 'and the loop survives it', `${before.frames} -> ${after.frames}`);
			const healed = await page.evaluate(() => {
				const n = (window.__ow.npcs?.list || [])[0];
				return { moving: n.moving, onTile: n.px === n.tx * 16 && n.py === n.ty * 16 };
			});
			A(healed.moving === false, 'it healed itself back to standing', JSON.stringify(healed));
			A(healed.onTile === true, 'and snapped to its own tile', JSON.stringify(healed));
		}

		// ===== 3. the same for the PLAYER, whom scripts also move =====
		{
			const before = await health();
			await page.evaluate(() => {
				const p = window.__ow.player;
				p.moving = true; p.moveTo = null; p.moveFrom = null; p.moveT = 0;
			});
			await sleep(700);
			const after = await health();
			A(after.errors === before.errors, 'a stranded PLAYER does not throw either', JSON.stringify(after));
			const healed = await page.evaluate(() => ({ moving: window.__ow.player.moving }));
			A(healed.moving === false, 'the player heals back to standing', JSON.stringify(healed));
			A(pageErrors.length === 0, 'still no uncaught page error', JSON.stringify(pageErrors.slice(0, 2)));
		}
	} finally {
		if (browser) await browser.close();
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
