// beaten_leader_talk_test.mjs — talking to a BEATEN trainer runs the script's own
// fall-through, not the roster's battle-end quote (bug:1793134540285, 2026-10-27).
//
// A beaten BRAWLY answered every talk with the roster line "Dude, you've got me
// beat. I never thought I'd lose here." His script (like every Hoenn leader's and
// the 151 Hoenn trainers with rematches) puts `specialvar ShouldTryRematchBattle`
// and a TM-flag test between `trainerbattle` and the post-battle `msg`; only a bare
// `msg` was followed, so the tester read a defeat line for a fight they did not
// remember and reported the gym as unchallengeable.
//   a) Brawly beaten, TM received: his post-battle line (BrawlyPostBattle)
//   b) Brawly beaten, TM NOT received: talking again hands over TM BULK UP, as the
//      cartridge's `goto_if_unset FLAG_RECEIVED_TM_BULK_UP` does
//   c) a plain trainer (Laura: trainerbattle -> msg) still says her post line
//   d) an UNBEATEN gym trainer still battles
//
//   node overworld/tests/beaten_leader_talk_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9817;
const STATE = { username: 'beatenldr', friendCode: 'BTLD01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'pidgey', name: 'PIDGEY', level: 30, types: ['Normal', 'Flying'], ivs: { hp: 1, atk: 1, def: 1, spa: 1, spd: 1, spe: 1 },
	stats: { hp: 90, atk: 45, def: 45, spa: 45, spd: 45, spe: 45 }, maxHP: 90, curHP: 90, exp: 27000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's16.png', num: 16 }];
const STRINGS = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/strings/DewfordTown_Gym.json'), 'utf8'));
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

const norm = t => String(t || '').replace(/\s+/g, ' ').trim();
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const errors = [];
	const boot = async ({ tmFlag, x, y, beaten }) => {
		const page = await browser.newPage();
		page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, party, flags, beaten) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'hoenn'); localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { HOENN: { stone: true, knuckle: true } }, champion: {} }));
			localStorage.setItem('magepunk_defeated_v1', JSON.stringify(beaten.map(s => 'MAP_DEWFORD_TOWN_GYM:DewfordTown_Gym_EventScript_' + s)));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true,
				FLAG_DEFEATED_DEWFORD_GYM: true, FLAG_BADGE02_GET: true, ...flags }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, STATE, PARTY, tmFlag ? { FLAG_RECEIVED_TM_BULK_UP: true } : {}, beaten);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=DewfordTown_Gym&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await page.evaluate(() => !!window.__ow?.battle?.data && window.__ow.world.current?.name === 'DewfordTown_Gym' && !window.__ow.gateReport().loading).catch(() => false)); i++) await sleep(100);
		await sleep(1000);
		for (let i = 0; i < 15 && await page.evaluate(() => window.__ow.dialog.blocking); i++) { await page.keyboard.press('z'); await sleep(250); }
		return page;
	};
	// face up and talk; collect every dialog page until the screen is free
	const talkUp = async page => {
		await page.evaluate(() => { window.__ow.player.facing = 'up'; window.__ow.interact(); });
		const seen = [];
		for (let i = 0; i < 60; i++) {
			const s = await page.evaluate(() => ({ dlg: window.__ow.dialog.blocking, cut: window.__ow.cutscene.blocking, battle: window.__ow.battle.blocking, eng: window.__ow.trainers.engaging,
				text: (window.__ow.dialog.pages || []).map(p => p.join(' ')).join(' ') }));
			if (s.battle || s.eng) { seen.push('<<BATTLE>>'); break; }
			if (s.dlg) { if (seen[seen.length - 1] !== s.text) seen.push(s.text); await page.keyboard.press('z'); }
			else if (!s.cut && i > 2) break;
			await sleep(150);
		}
		return seen.map(norm);
	};
	const post = norm(STRINGS.DewfordTown_Gym_Text_BrawlyPostBattle);

	// ===== a) Brawly beaten, TM already received =====
	{
		const page = await boot({ tmFlag: true, x: 4, y: 4, beaten: ['Brawly'] });
		const seen = await talkUp(page);
		A(seen.some(t => t.includes(post.slice(0, 40))), 'a) a beaten Brawly says his post-battle line', JSON.stringify(seen));
		A(!seen.some(t => /got me beat/.test(t)), "a) ...not the roster's \"you've got me beat\" battle-end quote", JSON.stringify(seen));
		await page.close();
	}
	// ===== b) Brawly beaten, TM not yet received =====
	{
		const page = await boot({ tmFlag: false, x: 4, y: 4, beaten: ['Brawly'] });
		const seen = await talkUp(page);
		const got = await page.evaluate(() => window.__ow.Story.getFlag('FLAG_RECEIVED_TM_BULK_UP'));
		A(got && !seen.includes('<<BATTLE>>'), 'b) a beaten Brawly who still owes TM BULK UP hands it over (no re-battle)', JSON.stringify({ got, seen }));
		await page.close();
	}
	// ===== c) Laura (trainerbattle -> msg) =====
	{
		const page = await boot({ tmFlag: true, x: 12, y: 26, beaten: ['Laura'] });
		const seen = await talkUp(page);
		A(seen.some(t => t.includes(norm(STRINGS.DewfordTown_Gym_Text_LauraPostBattle).slice(0, 30))), 'c) a beaten plain trainer still says her post-battle line', JSON.stringify(seen));
		await page.close();
	}
	// ===== d) an unbeaten trainer still battles =====
	{
		const page = await boot({ tmFlag: true, x: 12, y: 26, beaten: [] });
		const seen = await talkUp(page);
		A(seen.includes('<<BATTLE>>') || seen.some(t => t.includes(norm(STRINGS.DewfordTown_Gym_Text_LauraIntro).slice(0, 20))), 'd) an unbeaten Laura engages', JSON.stringify(seen));
		await page.close();
	}
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
