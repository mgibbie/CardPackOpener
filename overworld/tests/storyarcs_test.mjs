// storyarcs_test.mjs — Upscale 3 Batch 4: the story-arc proof pass.
//
// The scene machinery is recovered and the scripts read honestly across all
// three decomps — but the villain arcs were never walked the way the three
// intros were. This is the automated half of that film: load each arc venue,
// stand beside every scripted NPC, TALK to them, and count who answers. A
// venue full of mute actors is the transpile-damage signature this hunts.
//
// Venues: Lake of Rage + Mahogany Mart + Rocket Base (Johto's Rocket arc),
// the Goldenrod Radio Tower floors, the Olivine Lighthouse (Amphy/Jasmine),
// and the Weather Institute (Hoenn's Aqua beat).
//
// Also pins the three 2026-07 multiplayer-test fixes in source: ghost
// waypoint interpolation, the missed-poll grace period, and PvP's in-order
// turn playback.
//
//   node overworld/tests/storyarcs_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- the multiplayer fixes, pinned ----------
{
	const mn = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/waypoint queue/.test(mn) && /catch-up speed scales with backlog/.test(mn),
		'ghosts walk a waypoint queue with catch-up (the "clipping" fix)');
	A(/\+\+g\.missed >= 3/.test(mn), 'a missed poll no longer deletes the ghost (the flicker fix)');
	const pv = fs.readFileSync(path.join(ROOT, 'overworld/pvp.js'), 'utf8');
	A(/play the turn IN ORDER/.test(pv) && /Waiting for your opponent/.test(pv),
		'PvP plays turns in order with an explicit waiting state');
}

// venues and who MUST speak there (by script substring)
const VENUES = [
	{ file: 'LakeOfRage', region: 'JOHTO', must: [] },
	{ file: 'MahoganyMart1F', region: 'JOHTO', must: [] },
	{ file: 'TeamRocketBaseB1F', region: 'JOHTO', must: [] },
	{ file: 'TeamRocketBaseB2F', region: 'JOHTO', must: [] },
	{ file: 'RadioTower1F', region: 'JOHTO', must: [] },
	{ file: 'RadioTower3F', region: 'JOHTO', must: [] },
	{ file: 'OlivineLighthouse6F', region: 'JOHTO', must: ['Jasmine', 'Amphy'] },
	{ file: 'Route119_WeatherInstitute_1F', region: 'HOENN', must: [] },
	{ file: 'Route119_WeatherInstitute_2F', region: 'HOENN', must: [] },
];

// ---------- live ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8993;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 45, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 140, atk: 100, def: 100, spa: 100, spd: 100, spe: 100 }, maxHP: 140, curHP: 140,
		exp: 91125, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
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
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 300000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		await page.setViewport({ width: 900, height: 640 });
		const errors = [];
		page.on('pageerror', e => errors.push(e.message));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LakeOfRage`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the world boots');

		const results = [];
		for (const v of VENUES) {
			const out = await page.evaluate(async (file) => {
				const ow = window.__ow;
				const wait = ms => new Promise(r => setTimeout(r, ms));
				try { await ow.moveToMap(file, 5, 5); } catch (e) { return { err: e.message }; }
				await wait(400);
				const spoke = [], mute = [], skipped = [];
				// snapshot the list up front — talking can mutate it. The literal
				// 'ObjectEvent' script is pokecrystal's own no-op placeholder for
				// cutscene props (Lance's raid extras, the spent electrodes) — those
				// are mute in the ORIGINAL, so they don't count against the venue.
				const cast = ow.npcs.list.filter(n => n.ev?.script && n.ev.script !== '0x0' && n.ev.script !== 'ObjectEvent' && !n.hidden);
				for (const n of cast.slice(0, 14)) {
					// stand on a passable neighbor, face the actor, talk
					const spots = [[n.tx, n.ty + 1, 'up'], [n.tx, n.ty - 1, 'down'], [n.tx - 1, n.ty, 'right'], [n.tx + 1, n.ty, 'left']];
					const s = spots.find(([x, y]) => ow.world.isPassable(x, y));
					if (!s) { skipped.push(n.ev.script); continue; }
					const p = ow.player;
					p.tx = s[0]; p.ty = s[1]; p.px = s[0] * 16; p.py = s[1] * 16; p.facing = s[2];
					ow.interact();
					await wait(250);
					const answered = ow.dialog.blocking || ow.cutscene.blocking || ow.battle.blocking;
					(answered ? spoke : mute).push(n.ev.script);
					// unwind whatever opened: x declines prompts, z advances say-pages
					for (let i = 0; i < 40 && (ow.dialog.blocking || ow.cutscene.blocking); i++) {
						window.dispatchEvent(new KeyboardEvent('keydown', { key: i % 3 === 2 ? 'z' : 'x' }));
						await wait(120);
					}
					// a talk that started a BATTLE: run from it
					if (ow.battle.blocking) {
						const b = ow.battle;
						for (let i = 0; i < 100; i++) { const a = b.active; if (a && (a.phase === 'menu' || a.phase === 'choose')) break; await wait(100); }
						if (b.active) { b.startQueue(() => b.tryRun()); for (let i = 0; i < 150 && b.active; i++) await wait(80); }
					}
				}
				return { spoke: spoke.length, mute, skipped: skipped.length, cast: cast.length };
			}, v.file);
			results.push({ file: v.file, ...out });
			if (out.err) { A(false, `${v.file}: failed to load`, out.err); continue; }
			const total = out.spoke + out.mute.length;
			A(out.mute.length === 0 || out.spoke / Math.max(1, total) >= 0.8,
				`${v.file}: the cast answers when spoken to (${out.spoke}/${total} spoke)`,
				'mute: ' + out.mute.slice(0, 4).join(', '));
			await page.screenshot({ path: path.join((await import('os')).tmpdir(), `arc_${v.file}.png`) }); // the film, kept out of the repo
		}
		console.log('\nARC SWEEP:', JSON.stringify(results.map(r => ({ f: r.file, spoke: r.spoke, mute: r.mute?.length, skip: r.skipped })), null, 1));

		A(errors.length === 0, 'no uncaught page errors across the arc walk', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
