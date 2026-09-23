// postbattle_test.mjs — a trainer's post-battle beat has to actually run.
//
// Reported: "Slowpoke Well can't be cleared. The last grunt's post-battle script
// never runs. The battle ends normally and nothing else happens: no fade, no
// Kurt, no warp, no heal. EVENT_CLEARED_SLOWPOKE_WELL stays unset." Johto blocked
// at Azalea — no Lure Ball, and the Rocket in front of the gym never leaves.
//
// CAUSE. Crystal keeps what happens after you win in a SEPARATE label,
// `<script>.Script`, and nothing in this port ever ran it. The plain battle path
// only marked the trainer defeated. For this grunt it is starker still: there is
// no `TrainerGruntM1` engage label at all, only `TrainerGruntM1.Script` — so the
// trainer falls through to the plain path and the beat is unreachable by design.
//
// Audit: 322 trainers carry a .Script; 35 do more than print text; 29 of those
// carry a story beat. Mostly the Johto phone-number registrations, plus the
// Slowpoke Well, Sage Koji and one item gift on Route 34.
//
// THREE THINGS HAD TO LAND TOGETHER, which is why this sat behind the object
// reference fix:
//   - run <script>.Script on a plain victory (and after a reload)
//   - `face PLAYER right` — 281 ops name the player as plain PLAYER, which
//     events.js _actor did not map, so every one was a no-op
//   - hideobj must SET the object's event flag, Crystal's `disappear` semantics.
//     This script never sets EVENT_SLOWPOKE_WELL_ROCKETS itself — hiding the four
//     grunts is what sets it, and that flag is what removes the Azalea gym Rocket.
//
//   node overworld/tests/postbattle_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const OW = path.join(ROOT, 'overworld');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- the audit that sizes this ----------
{
	const INERT = new Set(['lock', 'lockall', 'release', 'releaseall', 'faceplayer', 'msg', 'waitmsg', 'closemsg', 'end', 'return', 'waitbutton', 'nop']);
	let total = 0, meaty = 0, story = 0;
	for (const f of fs.readdirSync(path.join(OW, 'data/scripts'))) {
		let s;
		try { s = JSON.parse(fs.readFileSync(path.join(OW, 'data/scripts', f), 'utf8')); } catch (e) { continue; }
		for (const [k, v] of Object.entries(s)) {
			if (!k.endsWith('.Script') || !Array.isArray(v)) continue;
			total++;
			if (!v.some(o => o && o.op && !INERT.has(o.op))) continue;
			meaty++;
			if (v.some(o => o && ['setflag', 'warp', 'give', 'hideobj'].includes(o.op))) story++;
		}
	}
	console.log(`    (${total} trainer .Scripts; ${meaty} do more than print text; ${story} carry a story beat)`);
	A(total > 300, 'the audit covered the whole game', String(total));
	A(story >= 25 && story < 60, 'the set this lights up is bounded, not a sprawl', String(story));

	const mn = fs.readFileSync(path.join(OW, 'main.js'), 'utf8');
	A(/function runPostBattleScript/.test(mn), 'a plain victory runs the beat');
	A(/function catchUpPostBattleScripts/.test(mn), 'and a save that already won can still reach it');
	A(/scriptIsDisplayOnly\(ops\)\) return false/.test(mn),
		'a display-only .Script is skipped — defeatText already says it');
	A(/markPostBattle\(key\);\s*\/\/ marked on attempt/.test(mn),
		'the marker is written on ATTEMPT, so a beat can never loop');

	const ev = fs.readFileSync(path.join(OW, 'events.js'), 'utf8');
	A(/who === 'PLAYER'/.test(ev), 'plain PLAYER resolves to the player');
	A(/EVENT_/.test(mn) && /hideObj: who => \{/.test(mn), 'hideObj sets the object flag');
}

// ---------- live: win the fight, watch the beat ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8999;
	const STATE = { username: 'postb', friendCode: 'POSTB0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
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
		const errors = [];
		page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'postb-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'JOHTO');
			if (!localStorage.getItem('magepunk_story'))
				localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{
				speciesId: 'cyndaquil', name: 'CYNDAQUIL', level: 60, gender: 'M', friend: 70, types: ['Fire'],
				ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
				stats: { hp: 200, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 }, maxHP: 200, curHP: 200,
				exp: 200000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's155.png', num: 155,
			}]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=SlowpokeWellB1F`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
		await sleep(1500);
		A(await page.evaluate(() => window.__ow.world.current.name) === 'SlowpokeWellB1F', "we're in the well");

		const flags = () => page.evaluate(() => {
			const S = window.__ow.Story;
			return {
				cleared: !!S.getFlag('EVENT_CLEARED_SLOWPOKE_WELL'),
				rockets: !!S.getFlag('EVENT_SLOWPOKE_WELL_ROCKETS'),
				kurt1: !!S.getFlag('EVENT_KURTS_HOUSE_KURT_1'),
			};
		});
		A((await flags()).cleared === false, 'setup: the well is not cleared');

		// Win the last grunt's battle the way the game does, then let the beat play.
		const started = await page.evaluate(() => {
			const W = window.__ow;
			const t = (W.trainers.list || []).find(x => x.ev && x.ev.script === 'TrainerGruntM1');
			if (!t) return 'no M1';
			// mark the other three beaten, as the report's save has them
			for (const o of (W.trainers.list || [])) if (o !== t && o.ev && /TrainerGrunt/.test(o.ev.script || '')) W.trainers.markDefeated(o);
			W.trainers.onEngage(t);
			return 'engaged';
		});
		A(started === 'engaged', 'the last grunt engages', String(started));

		// spam confirm until the battle ends and the cutscene plays out
		let warped = null;
		for (let i = 0; i < 400 && !warped; i++) {
			await page.evaluate(() => {
				try { if (window.__ow.battle.blocking) window.__ow.battle.key('z'); else window.__ow.dialog.key('z'); } catch (e) {}
			});
			await sleep(60);
			const st = await page.evaluate(() => ({ m: window.__ow.world.current.name, f: !!window.__ow.Story.getFlag('EVENT_CLEARED_SLOWPOKE_WELL') }));
			if (st.f) warped = st;
		}
		const f = await flags();
		A(f.cleared, 'beating the last grunt sets EVENT_CLEARED_SLOWPOKE_WELL', JSON.stringify(f));
		A(f.rockets, 'hiding the grunts set EVENT_SLOWPOKE_WELL_ROCKETS — the Azalea gym Rocket leaves', JSON.stringify(f));
		A(f.kurt1 === false, "and Kurt's house flag was cleared so he is back home", JSON.stringify(f));
		A(errors.length === 0, 'no uncaught page error during the beat', JSON.stringify(errors.slice(0, 2)));
	} finally {
		if (browser) await browser.close();
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
