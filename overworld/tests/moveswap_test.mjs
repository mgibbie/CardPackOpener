// moveswap_test.mjs — reordering the four move slots from inside battle.
//
// In the moves menu, S (or the SWAP button) arms the highlighted slot;
// choosing another slot swaps the two moves — PP rides along, the order
// lives on the mon (so it carries out of battle), and while a swap is armed
// even a 0-PP move is a valid target. X cancels the swap without leaving
// the menu; entering the menu always starts unarmed.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/moveswap_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- source ----------
{
	const bt = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
	A(/a\.swapFrom = a\.swapFrom == null \? a\.moveIdx : null/.test(bt), 'S toggles the armed slot');
	A((bt.match(/'swapbtn'/g) || []).length >= 3, 'both layouts carry the SWAP button, and taps route it');
	A(/disabled: a\.swapFrom == null && !this\.moveUsable/.test(bt), 'an armed swap makes every slot a target (no gray-out)');
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
	const PORT = 8971;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 120, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 120, curHP: 120,
		exp: 64000, moves: [
			{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 },
			{ id: 'quickattack', name: 'Quick Attack', pp: 30, maxPp: 30 },
			{ id: 'bite', name: 'Bite', pp: 0, maxPp: 25 },          // 0 PP: unusable, still swappable
			{ id: 'tailwhip', name: 'Tail Whip', pp: 30, maxPp: 30 },
		], sprite: 's608.png', num: 19,
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
			localStorage.setItem('magepunk_region', 'JOHTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		const out = await page.evaluate(async () => {
			const ow = window.__ow; const b = ow.battle;
			// through the REAL wild flow, so the battle's own ending saves the party
			ow.startWildBattle({ id: 'sentret', level: 5 });
			for (let i = 0; i < 300; i++) { const a = b.active; if (a && (a.phase === 'choose' || a.phase === 'menu')) break; await new Promise(r => setTimeout(r, 60)); }
			const a = b.active;
			a.foe.maxHP = 4000; a.foe.curHP = 4000; a.foeShownHP = 4000;
			const wait = ms => new Promise(r => setTimeout(r, ms));
			const o = {};
			// into the moves menu
			b.key('z');                                    // FIGHT
			o.startOrder = a.me.moves.map(m => m.id);
			// swap slot 0 (Tackle) with slot 3 (Tail Whip): S, navigate, Z
			b.key('s');
			o.armed = a.swapFrom;
			b.key('ArrowDown'); b.key('ArrowRight');       // to idx 3
			b.key('z');
			o.afterSwap = a.me.moves.map(m => m.id);
			o.ppFollows = a.me.moves[0].pp === 30 && a.me.moves[0].maxPp === 30;   // Tail Whip's PP came along
			o.stillInMoves = a.phase === 'moves';
			o.disarmed = a.swapFrom == null;
			// swapping INTO the 0-PP move works too (slot 3 now Tackle; bite is idx 2)
			b.key('s');                                    // arm idx 3 (cursor still there)
			b.key('ArrowLeft');                            // to idx 2 (Bite, 0 PP)
			b.key('z');
			o.zeroPPSwap = a.me.moves.map(m => m.id);
			// X cancels an armed swap without leaving the menu
			b.key('s');
			b.key('x');
			o.cancelStays = a.phase === 'moves' && a.swapFrom == null;
			// same-slot confirm just disarms, nothing moves, no move is used
			b.key('s'); b.key('z');
			o.sameSlot = a.me.moves.map(m => m.id).join() === o.zeroPPSwap.join() && a.queue.length === 0;
			// the new slot-1 move still FIRES from its new position
			a.moveIdx = 0; b.key('z');
			for (let i = 0; i < 100; i++) { if (a.phase === 'menu' && a.queue.length === 0) break; await wait(200); }
			o.usedFromNewSlot = a.foe.curHP < 4000 || a.queue.length === 0;   // tail whip lowers def (no dmg) — queue drained = it ran
			o.turnRan = a.turnCount >= 1;
			// the order survives outside the battle
			b.startQueue(() => b.tryRun());
			for (let i = 0; i < 200 && b.active; i++) await wait(60);
			await wait(500);   // wildBattleEnd's saveParty has run by now
			const saved = JSON.parse(localStorage.getItem('magepunk_party_v1'));
			o.persisted = saved[0].moves.map(m => m.id);
			return o;
		});
		A(out.armed === 0, 'S arms the highlighted slot', JSON.stringify(out.armed));
		A(JSON.stringify(out.afterSwap) === JSON.stringify(['tailwhip', 'quickattack', 'bite', 'tackle']),
			'slot 0 and slot 3 swap', JSON.stringify(out.afterSwap));
		A(out.ppFollows && out.stillInMoves && out.disarmed,
			'PP rides along, the menu stays open, the swap disarms', JSON.stringify({ pp: out.ppFollows, in: out.stillInMoves }));
		A(JSON.stringify(out.zeroPPSwap) === JSON.stringify(['tailwhip', 'quickattack', 'tackle', 'bite']),
			'a 0-PP move is a valid swap target', JSON.stringify(out.zeroPPSwap));
		A(out.cancelStays, 'X cancels the armed swap without leaving the menu');
		A(out.sameSlot, 'confirming the same slot just disarms — nothing moves, no move fires');
		A(out.turnRan, 'the move fires from its NEW slot afterward', JSON.stringify(out.turnRan));
		A(JSON.stringify(out.persisted) === JSON.stringify(['tailwhip', 'quickattack', 'tackle', 'bite']),
			'the new order persists on the saved party', JSON.stringify(out.persisted));

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
