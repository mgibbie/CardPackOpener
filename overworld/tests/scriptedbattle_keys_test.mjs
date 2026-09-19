// scriptedbattle_keys_test.mjs — keyboard (and touch A/B, which share pressKey)
// must reach a SCRIPT-DRIVEN battle.
//
// A scripted battle (gym leader / rival / villain / any trainer engaged via
// their EventScript) runs UNDER its paused cutscene: the trainerbattle op holds
// the cutscene's `cur` — so `cutscene.blocking` stays true — until the fight
// resolves. pressKey used to gate on `cutscene.blocking` BEFORE `battle.blocking`,
// which swallowed every key in every scripted fight (arrows, z/x, and the touch
// A/B buttons — all route through pressKey); only direct taps on the battle's
// canvas buttons worked, because the pointer handlers check battle first. The
// battle gate now sits above the cutscene gate; this suite pins the order and
// drives both battle kinds with REAL KeyboardEvents through the window listener.
//
// Standalone (headless Chrome + local overworld/data):
//   node overworld/tests/scriptedbattle_keys_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe'].find(p => fs.existsSync(p));
const PORT = 8892;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'sk', friendCode: 'SKSKSK', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await new Promise(r => setTimeout(r, 150)); } return false; }

// ---------- source: the gate ORDER is the whole bug ----------
{
	const mj = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	const battleGate = mj.indexOf("if (battle.blocking) { battle.key(k); return; }");
	const cutsceneGate = mj.indexOf('if (cutscene.blocking) return;');
	A(battleGate > 0 && cutsceneGate > 0, 'both pressKey gates exist');
	A(battleGate < cutsceneGate, 'the battle key gate sits ABOVE the cutscene swallow', `${battleGate} vs ${cutsceneGate}`);
}

(async () => {
	const server = http.createServer((req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') { res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
	});
	await new Promise(r => server.listen(PORT, r));
	const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', args: ['--no-sandbox', '--use-gl=angle', '--use-angle=swiftshader', '--enable-webgl', '--ignore-gpu-blocklist'] });
	const errors = [];
	try {
		const page = await browser.newPage();
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'sk');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'kanto');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, intro_started: true, story_seeded: true, FLAG_ADVENTURE_STARTED: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_SYS_POKEDEX_GET: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([
				{ speciesId: 'pikachu', name: 'PIKACHU', level: 60, gender: 'M', ability: 'static', types: ['Electric'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 160, atk: 120, def: 100, spa: 120, spd: 110, spe: 140 }, maxHP: 160, curHP: 160, exp: 216000, num: 25, sprite: 's800.png', moves: [{ id: 'thundershock', name: 'ThunderShock', pp: 30, maxPp: 30 }, { id: 'growl', name: 'Growl', pp: 40, maxPp: 40 }] },
			]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route1`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.startWildBattle && window.__ow.runScriptLabel)), 30000);
		A(ready, 'overworld ready');
		if (!ready) throw new Error('no overworld');

		// --- WILD battle takes real keydown events (the control: this always worked)
		const wild = await page.evaluate(async () => {
			const ow = window.__ow;
			const sleep = ms => new Promise(r => setTimeout(r, ms));
			const key = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
			document.activeElement?.blur?.(); // headless parks focus in the chat input
			ow.startWildBattle({ id: 'pidgey', level: 4 });
			const t0 = Date.now();
			while (Date.now() - t0 < 8000 && !(ow.battle.active && ow.battle.active.phase === 'menu')) await sleep(100);
			const a = ow.battle.active, res = { phase0: a?.phase };
			key('z'); await sleep(150); res.afterZ = a?.phase;
			key('ArrowRight'); await sleep(150); res.idx = a?.moveIdx;
			key('x'); await sleep(150); res.afterX = a?.phase;
			ow.battle.finish('fled');
			await sleep(1800);
			return res;
		});
		A(wild.phase0 === 'menu' && wild.afterZ === 'moves' && wild.idx === 1 && wild.afterX === 'menu',
			'wild battle: z opens moves, arrow moves the cursor, x backs out', JSON.stringify(wild));

		// --- SCRIPTED battle (Brock via his EventScript) under the paused cutscene
		const scripted = await page.evaluate(async () => {
			const ow = window.__ow;
			const sleep = ms => new Promise(r => setTimeout(r, ms));
			const key = k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true }));
			await ow.moveToMap('PewterCity_Gym', 4, 6);
			await sleep(1000);
			document.activeElement?.blur?.();
			ow.runScriptLabel('PewterCity_Gym_EventScript_Brock');
			const t0 = Date.now();
			while (Date.now() - t0 < 15000 && !(ow.battle.active && ow.battle.active.phase === 'menu' && ow.battle.blocking)) {
				if (ow.dialog.blocking) { ow.dialog.revealed = 1e9; key('z'); }
				await sleep(120);
			}
			const a = ow.battle.active, res = { phase0: a?.phase, cutsceneBlocking: !!ow.cutscene?.blocking };
			key('z'); await sleep(150); res.afterZ = a?.phase;
			key('ArrowRight'); await sleep(150); res.idx = a?.moveIdx;
			key('x'); await sleep(150); res.afterX = a?.phase;
			// finish the fight through the real path and confirm the paused cutscene
			// RESUMES (the post-battle speech opens) — the reorder must not orphan it
			ow.battle.finish('victory');
			const t1 = Date.now();
			let resumed = false;
			while (Date.now() - t1 < 10000) {
				if (ow.dialog.blocking) { resumed = true; break; }
				await sleep(150);
			}
			res.resumed = resumed;
			return res;
		});
		A(scripted.phase0 === 'menu', 'the scripted battle reached its menu', scripted.phase0);
		A(scripted.cutsceneBlocking === true, 'the cutscene stays paused-blocking under the fight (the bug condition)');
		A(scripted.afterZ === 'moves' && scripted.idx === 1 && scripted.afterX === 'menu',
			'scripted battle: z/arrow/x all reach the battle through pressKey', JSON.stringify(scripted));
		A(scripted.resumed, 'the paused cutscene resumes after the fight (post-battle speech opens)');

		A(errors.length === 0, 'no uncaught client errors', errors[0]);
		await page.close();
	} catch (e) { A(false, 'harness crashed: ' + e.message); console.error(e); }
	finally { await browser.close(); server.close(); }
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
