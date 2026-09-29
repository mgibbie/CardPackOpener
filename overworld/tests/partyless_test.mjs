// partyless_test.mjs — a save without a POKeMON can always get one.
//
// Remy (automated playtesting, 2026-09-29): a new game ended PERMANENTLY
// partyless: no magepunk_party_v1, the party screen threw, no battles, and the
// starter was never offered again. Reproduced here: with the browser store
// nearly full, the starter pick's party write failed in SILENCE while the small
// story write (intro_done) still landed. The lab trigger gated on intro_done, so
// after the reload nothing ever offered a starter again. (A partyless copy
// coming back from the server would strand a save the same way.)
//
// Now: the lab offers a starter to any PARTYLESS player (a recovery pick skips
// the rival replay); the objective line points a partyless save at the lab; the
// party screen shows a hint instead of throwing; the party write frees the
// expendable Battlecards replay tapes and retries, and a pick that still cannot
// be saved says so. The seed no longer sets FLAG_GOT_FIRST_POKEMON (nothing
// reads it; the pick sets it).
//
//   node overworld/tests/partyless_test.mjs
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
const PORT = 9173;
const STATE = { username: 'remy', friendCode: 'REMY00', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		for await (const _ of req) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		// no server copy: this suite is about the local save
		return res.end(JSON.stringify({ ok: true, state: STATE, ow: null, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	// each scenario: its own browser context (own localStorage), seeded ONCE
	const open = async (seed) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, seed) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			for (const [k, v] of Object.entries(seed || {})) localStorage.setItem(k, v);
		}, STATE, seed);
		const boot = async () => { for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current)).catch(() => false)); i++) await sleep(100); await sleep(700); };
		await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' });
		await boot();
		const key = k => page.evaluate(k => dispatchEvent(new KeyboardEvent('keydown', { key: k })), k);
		const st = () => page.evaluate(() => {
			const ow = window.__ow, f = (JSON.parse(localStorage.getItem('magepunk_story') || '{}').flags) || {};
			return { map: ow.world.current && ow.world.current.name, partyKey: !!localStorage.getItem('magepunk_party_v1'), party: (ow.party || []).length,
				got: !!f.FLAG_GOT_FIRST_POKEMON, introDone: !!f.intro_done, pick: ow.starterMenu.open && ow.starterMenu.phase,
				dialog: ow.dialog.blocking ? JSON.stringify(ow.dialog.pages || '').slice(0, 300) : null, hud: (document.getElementById('hud') || {}).textContent || '',
				objective: (document.getElementById('objective') || {}).textContent || '' };
		});
		// press Z until the pick is open (greeting / nothing)
		const toPick = async () => { for (let i = 0; i < 40 && !(await st()).pick; i++) { await key('z'); await sleep(200); } };
		// pick the first starter and ride everything out; true if a battle happened
		const pickAndFinish = async (seen) => {
			let battled = false;
			await key('z'); await sleep(400);
			for (let i = 0; i < 200; i++) {
				const s = await page.evaluate(() => { const ow = window.__ow; if (ow.battle.active && ow.battle.active.phase === 'menu') ow.battle.finish('victory');
					return { b: ow.battle.blocking, d: ow.dialog.blocking ? JSON.stringify(ow.dialog.pages || '') : '', done: !!ow.party && !ow.dialog.blocking && !ow.cutscene.blocking && !ow.battle.blocking }; });
				if (s.b) battled = true;
				if (s.d && seen) seen.push(s.d);
				if (s.done) break;
				await key('z'); await sleep(200);
			}
			return battled;
		};
		return { ctx, page, errors, boot, key, st, toPick, pickAndFinish };
	};
	const labOf = { KANTO: 'PalletTown_ProfessorOaksLab' };

	// ===== 1. a fresh game: the seed does NOT claim a POKeMON; the pick does =====
	{
		const P = await open(null);
		await P.key('z'); await sleep(2500);   // KANTO, the first region card
		for (let i = 0; i < 30 && await P.page.evaluate(() => window.__ow.dialog.blocking || window.__ow.cutscene.blocking); i++) { await P.key('z'); await sleep(200); }
		const s0 = await P.st();
		A(!s0.got && !s0.partyKey, 'after the region pick, FLAG_GOT_FIRST_POKEMON is NOT set (nothing has been obtained yet)', JSON.stringify(s0));
		A(/NEXT: Get your first POKeMON from PROF\. OAK/.test(s0.objective), 'the objective points a partyless new game at the lab', s0.objective);
		await P.page.evaluate(l => window.__ow.moveToMap(l), labOf.KANTO); await sleep(1200);
		await P.toPick();
		const battled = await P.pickAndFinish();
		const s1 = await P.st();
		A(s1.partyKey && s1.got && s1.introDone && battled, 'the normal pick: party saved, the flag set, the rival fought', JSON.stringify({ ...s1, battled }));
		A(P.errors.length === 0, 'no page error (fresh game)', JSON.stringify(P.errors.slice(0, 2)));
		await P.ctx.close();
	}

	// ===== 2. a STRANDED save (intro done, no party): it can get a POKeMON again =====
	{
		const P = await open({
			magepunk_region: 'KANTO',
			magepunk_story: JSON.stringify({ flags: { story_seeded: true, intro_started: true, intro_greeted: true, intro_done: true, FLAG_GOT_FIRST_POKEMON: true, FLAG_HIDE_OAK_IN_PALLET_TOWN: true }, vars: {} }),
			magepunk_pos_v1: JSON.stringify({ map: 'PalletTown', x: 10, y: 10 }),
		});
		const s0 = await P.st();
		A(s0.party === 0 && !s0.pick, 'setup: a partyless save with intro_done boots in town', JSON.stringify(s0));
		A(/NEXT: Get your first POKeMON/.test(s0.objective), 'the objective tells it where to go', s0.objective);
		// the party screen: a hint, not a crash
		await P.key('p'); await sleep(400);
		const sp = await P.page.evaluate(() => ({ open: window.__ow.partyMenu.open, hud: document.getElementById('hud').textContent }));
		A(!sp.open && /no POKeMON yet/.test(sp.hud), 'the party screen does not open on no party; the HUD says to visit the lab', JSON.stringify(sp));
		await P.page.evaluate(l => window.__ow.moveToMap(l), labOf.KANTO); await sleep(1200);
		await P.toPick();
		A((await P.st()).pick === 'pick', 'in the lab, the starter pick opens again (it used to be gated on intro_done: stuck forever)');
		const battled = await P.pickAndFinish();
		const s1 = await P.st();
		A(s1.partyKey && s1.party === 1 && !battled, 'the recovery pick hands the POKeMON over, with no rival replay', JSON.stringify({ ...s1, battled }));
		await P.page.reload({ waitUntil: 'domcontentloaded' }); await P.boot();
		const s2 = await P.st();
		A(s2.party === 1 && !s2.pick && /^NEXT: (?!Get your first)/.test(s2.objective), 'after a reload the POKeMON is still there, and the objective moved on', JSON.stringify(s2));
		A(P.errors.length === 0, 'no page error (stranded save)', JSON.stringify(P.errors.slice(0, 2)));
		await P.ctx.close();
	}

	// ===== 3. the store is FULL at the pick =====
	// fill localStorage to within ~800 bytes; `replays` also puts a replay tape in
	const fill = (page, replays) => page.evaluate(withTape => {
		if (withTape) localStorage.setItem('magepunk_replays_v1', 'r'.repeat(200000));
		let chunk = 'x'.repeat(100000), n = 0;
		for (;;) { try { localStorage.setItem('junk_' + n++, chunk); } catch (e) { if (chunk.length <= 800) break; chunk = chunk.slice(0, chunk.length >> 1); } }
	}, replays);
	for (const withTape of [true, false]) {
		const P = await open({
			magepunk_region: 'KANTO',
			magepunk_story: JSON.stringify({ flags: { story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }),
			magepunk_pos_v1: JSON.stringify({ map: 'PalletTown_ProfessorOaksLab', x: 6, y: 5 }),
		});
		await P.toPick();
		await fill(P.page, withTape);
		const seen = [];
		await P.pickAndFinish(seen);
		const s = await P.st();
		if (withTape) {
			A(s.partyKey && !(await P.page.evaluate(() => localStorage.getItem('magepunk_replays_v1'))), 'store full WITH a replay tape: the tape is dropped and the party saves', JSON.stringify({ partyKey: s.partyKey }));
			A(!seen.some(d => /storage is FULL/.test(d)), '...with no warning (it worked)');
		} else {
			A(!s.partyKey, 'setup: store full with nothing expendable: the party write fails');
			A(seen.some(d => /storage is FULL/.test(d)) || /Storage full/.test(s.hud), 'a starter that could not be saved SAYS so (it used to fail in silence)', JSON.stringify({ hud: s.hud, dialogs: seen.slice(0, 2).map(d => d.slice(0, 120)) }));
			// and the save it leaves is recoverable: space freed, a reload, the lab offers again
			await P.page.evaluate(() => { for (const k of Object.keys(localStorage)) if (k.startsWith('junk_')) localStorage.removeItem(k); });
			await P.page.reload({ waitUntil: 'domcontentloaded' }); await P.boot();
			await P.toPick();
			A((await P.st()).pick === 'pick', 'after space is freed and a reload, the lab offers the starter again');
			await P.pickAndFinish();
			A((await P.st()).partyKey, '...and this time it saves');
		}
		A(P.errors.length === 0, `no page error (store full, ${withTape ? 'with' : 'no'} tape)`, JSON.stringify(P.errors.slice(0, 2)));
		await P.ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
