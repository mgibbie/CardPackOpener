// gymstory_test.mjs — headless test that the story is "on" for Gym Leaders:
// engaging a Leader now plays their authentic ported EventScript (leader speech →
// battle → badge/TM ceremony) instead of a bare battle, the dialogue renders
// clean (no leaked {control codes}, POKeMON not POKéMON), and the badge is still
// recorded (silently, since the speech announces it).
//
// Standalone (needs headless Chrome + puppeteer-core + local overworld/ data);
// NOT in run-all.mjs.   node overworld/tests/gymstory_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = 'C:/Program Files/Google/Chrome/Application/chrome.exe';
const PORT = 8875;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.gif': 'image/gif', '.woff': 'font/woff', '.woff2': 'font/woff2', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'gym', friendCode: 'GYMMMM', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const BROCK = 'PewterCity_Gym_EventScript_Brock';
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); } return false; }

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) { /* drain */ }
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		page.on('console', m => { if (m.type() === 'error') errors.push('console: ' + m.text().slice(0, 160)); });
		await page.evaluateOnNewDocument((st) => {
			try {
				localStorage.setItem('magepunk_mp_token_v1', 'gym-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				localStorage.setItem('magepunk_region', 'KANTO');
				localStorage.setItem('magepunk_name', 'RED');
				localStorage.removeItem('magepunk_badges_v1');
				localStorage.setItem('magepunk_party_v1', JSON.stringify([{
					speciesId: 'squirtle', name: 'SQUIRTLE', nickname: null, level: 14, gender: 'M',
					ability: 'Torrent', types: ['Water'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
					stats: { hp: 40, atk: 20, def: 22, spa: 20, spd: 22, spe: 18 }, maxHP: 40, curHP: 40, exp: 2744,
					moves: [{ id: 'watergun', name: 'Water Gun', pp: 25, maxPp: 25 }], num: 7, sprite: 'squirtle.png',
				}]));
			} catch {}
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PewterCity_Gym`, { waitUntil: 'domcontentloaded' });

		const booted = await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.runScriptLabel && window.__ow.world?.current?.name)), 30000);
		A(booted, 'booted into a map with the script helpers exposed');
		const map = await page.evaluate(() => window.__ow.world.current.name);
		A(/PewterCity_Gym/.test(map || ''), 'loaded Pewter Gym', map);

		await page.evaluate(() => {
			window._dtext = () => { const p = window.__ow?.dialog?.pages; return p ? p.flat().join(' ') : null; };
			window._close = () => { const d = window.__ow.dialog; let n = 0; while (d.blocking && n++ < 40) d.key('x'); };
		});

		// 1) Brock's authentic script body is loaded for this map
		A(await page.evaluate((k) => Array.isArray(window.__ow.mapScripts[k]), BROCK), 'Brock’s ported EventScript is loaded', BROCK);

		// 1b) an ORDINARY trainer (Liam, the gym's junior) also plays his script, but
		//     awards NO badge (only Gym Leaders do) — regression guard on the broadened routing
		const liam = await page.evaluate(() => {
			const k = 'PewterCity_Gym_EventScript_Liam';
			const isLoaded = Array.isArray(window.__ow.mapScripts[k]);
			const role = window.__ow.Badges.scriptInfo(k); // null = ordinary trainer
			const started = isLoaded ? window.__ow.runScriptLabel(k, { ev: { script: k } }) : false;
			const text = window._dtext();
			window.__ow.cutscene.stop && window.__ow.cutscene.stop(); // abort before it battles
			window._close();
			return { isLoaded, role, started, text };
		});
		A(liam.isLoaded && liam.started === true, 'an ordinary trainer (Liam) also routes to his ported script');
		A(liam.role === null, 'an ordinary trainer awards no badge (scriptInfo null)');
		A(liam.text && !/[{}]/.test(liam.text), 'the ordinary trainer’s line renders clean', JSON.stringify(liam.text));

		// 2) engaging Brock routes through the script (leader speech), NOT a bare battle
		const intro = await page.evaluate((k) => {
			// prefer the real Trainer object; fall back to a minimal talker
			const brock = (window.__ow.trainers.list || []).find(t => t.ev && t.ev.script === k) || { ev: { script: k } };
			const started = window.__ow.runScriptLabel(k, brock);
			return { started, text: window._dtext() };
		}, BROCK);
		A(intro.started === true, 'runScriptLabel started Brock’s cutscene');
		A(/BROCK/.test(intro.text || '') && /GYM LEADER/i.test(intro.text || ''), 'the authentic leader speech opened (“I’m BROCK ... GYM LEADER”)', JSON.stringify(intro.text));

		// 3) the dialogue renders clean: no leaked {control codes}, POKeMON not POKéMON
		A(!/[{}]/.test(intro.text || ''), 'no leaked {control codes} in the speech');
		A(!/é/.test(intro.text || ''), 'accented é normalized (POKeMON)', JSON.stringify((intro.text || '').match(/POK.MON/)));

		// 4) after the speech closes, the trainerbattle op begins a real battle
		const battled = await waitFor(() => page.evaluate(() => {
			const d = window.__ow.dialog;
			if (d.blocking) { d.key('x'); return false; }   // advance the speech
			return window.__ow.battle && window.__ow.battle.blocking;
		}), 8000);
		A(battled, 'closing the speech starts the Leader battle (trainerbattle op fired)');

		// 5) the silent badge-record path: a scripted win records the badge WITHOUT a
		//    synthetic toast (the speech already announced it)
		const silent = await page.evaluate((k) => {
			window.__ow.Badges._reset && window.__ow.Badges._reset();
			localStorage.removeItem('magepunk_badges_v1');
			window._close();
			const before = window.__ow.Badges.count('KANTO');
			window.__ow.onTrainerDefeated(k, { silent: true });
			return { before, after: window.__ow.Badges.count('KANTO'), dialogOpen: window.__ow.dialog.blocking };
		}, BROCK);
		A(silent.after === silent.before + 1, 'a scripted win records the Boulder Badge');
		A(silent.dialogOpen === false, 'no synthetic badge toast on the scripted path (silent)');

		// 6) the plain (fallback) path DOES toast — regression guard on onTrainerDefeated
		const loud = await page.evaluate(() => {
			window._close();
			window.__ow.onTrainerDefeated('CeruleanCity_Gym_EventScript_Misty'); // not silent
			const t = window._dtext(); window._close(); return t;
		});
		A(/Cascade Badge/.test(loud || ''), 'the non-scripted path still shows the badge toast', JSON.stringify(loud));

		const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
		A(fatal.length === 0, 'no uncaught client errors during the run', fatal.slice(0, 4).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
		console.error(e);
	} finally {
		if (browser) await browser.close();
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
