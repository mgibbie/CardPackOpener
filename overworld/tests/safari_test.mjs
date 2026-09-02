// safari_test.mjs — the SAFARI GAME (upscale plan item 25).
//
// The Safari Zones shipped as plain routes: normal battles, no fee, no balls,
// no step meter. Now: the PA offers the game at the zone doorstep ($500, 30
// SAFARI BALLS, 600 steps), encounters run catch-only (BALL/BAIT/ROCK/RUN,
// the foe never attacks and may bolt any turn), the step that empties the
// meter — or the last ball — ends the game and warps you back to the gate,
// and walking out ends it quietly. Sessions persist across reloads.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/safari_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- static ----------
{
	const bt = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
	for (const fn of ['safariBall()', 'safariBait()', 'safariRock()', 'safariFoeTurn()']) {
		A(bt.includes(fn), `battle.js grows ${fn}`);
	}
	A((bt.match(/'BALL', 'BAIT', 'ROCK', 'RUN'/g) || []).length === 2,
		'both battle bars (desktop + portrait) swap to BALL/BAIT/ROCK/RUN in safari mode');
	const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/MAP_KANTO_SAFARI_ZONE_NORTH: 'fr'/.test(main) && /MAP_SAFARI_ZONE_NORTHEAST: 'hoenn'/.test(main),
		'both regions\' play areas are mapped to their gates');
	A(/const second = !inSafari &&/.test(main), 'hordes never spawn inside a safari game');
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
	const PORT = 8946;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 120, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 120, curHP: 120,
		exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
	}];
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));
	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.setItem('magepunk_money', '20000');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.removeItem('magepunk_safari_v1');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=SafariZone_Center`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots inside the Safari Zone');

		await page.evaluate(() => {
			window.__until = async (fn, ms = 8000) => {
				const t = Date.now();
				while (Date.now() - t < ms) { if (fn()) return true; await new Promise(r => setTimeout(r, 60)); }
				return fn();
			};
			window.__waitIdle = async () => {
				const b = window.__ow.battle;
				for (let i = 0; i < 300; i++) {
					const a = b.active;
					if (a && a.phase === 'menu') return true;
					await new Promise(r => setTimeout(r, 60));
				}
				return false;
			};
		});

		// ---------- the PA offers the game at the doorstep ----------
		const entry = await page.evaluate(async () => {
			const ow = window.__ow;
			const out = { prompted: ow.dialog.blocking };
			for (let i = 0; i < 12 && ow.dialog.blocking; i++) { ow.dialog.key('z'); await new Promise(r => setTimeout(r, 120)); }
			out.on = ow.safariState.on; out.balls = ow.safariState.balls; out.steps = ow.safariState.steps;
			return out;
		});
		A(entry.prompted, 'entering a play area without a session opens the PA prompt', JSON.stringify(entry));
		A(entry.on && entry.balls === 30 && entry.steps === 600,
			'Z pays the fee and starts the game: 30 balls, 600 steps', JSON.stringify(entry));

		// ---------- steps burn the meter ----------
		const stepped = await page.evaluate(async () => {
			const ow = window.__ow;
			const realRandom = Math.random;
			Math.random = () => 0.99;               // no wild rolls while pacing
			await ow.pumpPlayer('left', false, 700);
			await ow.pumpPlayer('right', false, 700);
			Math.random = realRandom;
			return { on: ow.safariState.on, steps: ow.safariState.steps };
		});
		A(stepped.on && stepped.steps < 600 && stepped.steps > 500,
			`walking burns the meter (${stepped.steps}/600 after a stroll)`, JSON.stringify(stepped));

		// ---------- a catch-only battle ----------
		const fight = await page.evaluate(async () => {
			const ow = window.__ow; const b = ow.battle;
			const realRandom = Math.random;
			ow.startWildBattle({ id: 'doduo', level: 25 });
			await window.__waitIdle();
			const a = b.active;
			const out = { safariMode: !!a.safari, prompt: a.msg };
			const drained = () => window.__until(() => a.queue.length === 0 && !a.fx);
			Math.random = () => 0.99;               // fail the catch roll, never flee
			b.startQueue(() => b.safariBait());
			await drained();
			out.mood = a.safariMood?.kind;
			b.startQueue(() => b.safariRock());
			await drained();
			out.mood2 = a.safariMood?.kind;
			b.startQueue(() => b.safariBall());     // breaks free at random=0.99
			await drained();
			out.ballsAfterMiss = ow.safariState.balls;
			out.stillIn = !!b.active;
			Math.random = () => 0.0001;             // guaranteed catch
			b.startQueue(() => b.safariBall());
			await window.__until(() => !b.active, 15000);
			Math.random = realRandom;
			out.caught = b.lastCaught?.speciesId;
			out.ballsAfterCatch = ow.safariState.balls;
			// decline the nickname offer so the dialog is clear for later sections
			for (let i = 0; i < 8 && ow.dialog.blocking; i++) { ow.dialog.key('x'); await new Promise(r => setTimeout(r, 120)); }
			return out;
		});
		A(fight.safariMode && /SAFARI BALLS: \d+/.test(fight.prompt), 'the battle runs in safari mode with the ball meter as prompt', JSON.stringify(fight));
		A(fight.mood === 'eating' && fight.mood2 === 'angry', 'BAIT and ROCK set the mood', JSON.stringify(fight));
		A(fight.ballsAfterMiss === 29 && fight.stillIn, 'a missed throw burns a ball and the mon stays', JSON.stringify(fight));
		A(fight.caught === 'doduo' && fight.ballsAfterCatch === 28, 'a SAFARI BALL catch lands like any catch', JSON.stringify(fight));

		// ---------- the last ball ends the game at the gate ----------
		const ballsOut = await page.evaluate(async () => {
			const ow = window.__ow; const b = ow.battle;
			ow.safariState.balls = 1;
			const realRandom = Math.random;
			Math.random = () => 0.99;               // miss the catch, no flee
			ow.startWildBattle({ id: 'doduo', level: 25 });
			await window.__waitIdle();
			b.startQueue(() => b.safariBall());
			await window.__until(() => !b.active, 15000);
			Math.random = realRandom;
			// the game-over PA line, then the warp back to the entrance
			for (let i = 0; i < 12 && ow.dialog.blocking; i++) { ow.dialog.key('z'); await new Promise(r => setTimeout(r, 150)); }
			await window.__until(() => /SafariZone_Entrance/.test(ow.world.current?.name || ''), 15000);
			return { map: ow.world.current?.name, on: ow.safariState.on };
		});
		A(/FuchsiaCity_SafariZone_Entrance/.test(ballsOut.map) && !ballsOut.on,
			'the last ball ends the game and the PA walks you out', JSON.stringify(ballsOut));

		// ---------- walking out ends a session quietly ----------
		const walkOut = await page.evaluate(async () => {
			const ow = window.__ow;
			Object.assign(ow.safariState, { on: true, zone: 'fr', balls: 5, steps: 100 });
			await ow.moveToMap('FuchsiaCity');
			return { on: ow.safariState.on };
		});
		A(!walkOut.on, 'leaving the zone ends the session with no ceremony', JSON.stringify(walkOut));

		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
