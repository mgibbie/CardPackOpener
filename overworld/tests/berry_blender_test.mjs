// berry_blender_test.mjs — the Lilycove BERRY BLENDER makes a real POKeBLOCK.
//
// The blender corner was a native "feed a berry to a mon" counter; the decomp's
// machines (berry_blender.inc) never ran and there was no POKeBLOCK CASE. Now:
//   1. the machine runs its script: no CASE -> the decomp's refusal
//   2. the contest receptionist hands over the POKeBLOCK CASE (contest_hall.inc)
//   3. with a CHERI in the bag the machine starts the BERRY BLENDER
//      (special DoBerryBlending; 1 NPC, the old-timer, who brings an ASPEAR)
//   4. a blend, A pressed on the BEST mark every pass, fills the bar and ends;
//      the block is exactly CalculatePokeblock(CHERI, ASPEAR, max RPM), the
//      CHERI is spent, the block lands in the case, the RPM record is kept
//   5. the bag's POKeBLOCK CASE: USE -> a party POKeMON eats it -> COOL rises
//   6. "blend another?" NO returns to the overworld, which takes input again
//   7. a Safari Zone POKeBLOCK FEEDER: place a block, it stays, it pulls natures
//
//   node overworld/tests/berry_blender_test.mjs
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
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9241;
const STATE = { username: 'blender', friendCode: 'BLEND1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'zigzagoon', name: 'ZIGGY', level: 30, gender: 'M', friend: 70, types: ['Normal'], nature: 'adamant',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 90, atk: 50, def: 50, spa: 40, spd: 40, spe: 60 }, maxHP: 90, curHP: 90,
	exp: 27000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's263.png', num: 263,
}];
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
		if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
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
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_name', 'MAY');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_bag_v1', JSON.stringify({ pokeball: 5 }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, FLAG_HIDE_LILYCOVE_CONTEST_HALL_BLEND_MASTER: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
	}, STATE, PARTY);
	const W = (f, ...a) => page.evaluate(f, ...a);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await W(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const S = () => W(() => {
		const O = window.__ow, b = O.blender;
		return {
			dialog: O.dialog.pages ? O.dialog.pages.flat().join(' ') : null, cut: !!O.cutscene.blocking,
			open: !!(b && b.open), phase: b && b.phase, text: b && b.text,
			bag: JSON.parse(localStorage.getItem('magepunk_bag_v1') || '{}'),
			pbCase: JSON.parse(localStorage.getItem('magepunk_pokeblocks_v1') || '[]').filter(Boolean),
		};
	});
	const until = async (pred, ms = 8000) => { const t0 = Date.now(); let s; while (Date.now() - t0 < ms) { s = await S(); if (pred(s)) return s; await sleep(50); } return s; };
	const key = async k => { await page.keyboard.press(k); await sleep(90); };
	const place = (x, y, facing) => W((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f; }, x, y, facing);
	// press A through the script's messages until pred (or give up)
	const talkUntil = async (pred, n = 14) => { let s; for (let i = 0; i < n; i++) { s = await S(); if (pred(s)) return s; await key('z'); } return S(); };

	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LilycoveCity_ContestLobby&x=28&y=5`, { waitUntil: 'domcontentloaded' });
	await boot('LilycoveCity_ContestLobby');

	// ===== 1. the old-timer's machine (27,5): no CASE =====
	await place(28, 5, 'left');
	await key('z');
	let s = await until(s => s.dialog);
	A(/make some POKeBLOCKS[\s\S]*old-timer/.test(s.dialog || ''), '1. the machine speaks the decomp: "Did you want to make some POKeBLOCKS with this old-timer?"', s.dialog);
	s = await talkUntil(s => /POKeBLOCK CASE/.test(s.dialog || '') || (!s.dialog && !s.cut));
	A(/don't have a POKeBLOCK CASE/.test(s.dialog || ''), "1. YES without a CASE: \"...you don't have a POKeBLOCK CASE\"", s.dialog);
	await talkUntil(s => !s.dialog && !s.cut);

	// ===== 2. the receptionist's CASE =====
	await place(14, 4, 'up');
	await W(() => window.__ow.interact());
	s = await until(s => s.dialog);
	A(/don't have a POKeBLOCK CASE yet/.test(s.dialog || ''), '2. the contest receptionist: "...you don\'t have a POKeBLOCK CASE yet."', s.dialog);
	s = await talkUntil(s => !!s.bag.pokeblockcase && /received the POKeBLOCK CASE/.test(s.dialog || ''));
	A(s.bag.pokeblockcase === 1, '2. MAY received the POKeBLOCK CASE', JSON.stringify([s.bag, s.dialog]));
	// the receptionist carries on to ENTER / INFO / EXIT (contest_ui.js, as the
	// decomp's script does): read to the question, then B out of it
	for (let i = 0; i < 20; i++) {
		const ch = await W(async () => (await import('./choice.js')).choiceMenu.open);
		s = await S();
		if (ch) await key('x');
		else if (s.dialog || s.cut) await key('z');
		else break;
	}

	// ===== 3. the blender starts =====
	await W(() => { const b = JSON.parse(localStorage.getItem('magepunk_bag_v1')); b.cheriberry = 2; localStorage.setItem('magepunk_bag_v1', JSON.stringify(b)); });
	await W(async () => { const m = await import('./minigames/blender/blender.js'); m.blender.manual = true; let x = 777; m.blender.rng = () => { x = (Math.imul(x, 1103515245) + 12345) >>> 0; return (x >>> 8) & 0xffff; }; });
	await place(28, 5, 'left');
	await key('z');
	s = await until(s => s.dialog);
	s = await talkUntil(s => s.open);
	A(s.open && s.phase === 'intro' && /Starting up the BERRY BLENDER/.test(s.text || ''), '3. YES, YES -> special DoBerryBlending opens the BERRY BLENDER', JSON.stringify(s));

	// ===== 4. blend =====
	const run = await W(async () => {
		const m = await import('./minigames/blender/blender.js');
		const PB = await import('./pokeblock.js');
		const b = m.blender, T = m.blenderTest;
		const press = k => { m.blenderKey(k); T.step(1); };
		let guard = 0;
		while (b.phase === 'intro' && guard++ < 10) press('z');
		const list = b.list ? b.list.items.map(i => i.id) : null;
		press('z');                                     // CHERI
		const items = b.items.slice();
		guard = 0;
		while (b.phase !== 'play' && guard++ < 2000) T.step(1);
		const playFrom = b.phase;
		let presses = 0;
		guard = 0;
		while (b.phase === 'play' && guard++ < 40000) {
			const next = (b.arrowPos + b.speed) & 0xffff;
			if (T.arrowProximity(next, 0) === 2 && !b._pressedThisPass) { m.blenderKey('z'); presses++; b._pressedThisPass = true; }
			else if (T.arrowProximity(next, 0) === 0) b._pressedThisPass = false;
			T.step(1);
		}
		const scores = b.scores[0].slice(), maxRPM = b.maxRPM, frames = b.gameFrameTime;
		guard = 0;
		while (b.phase !== 'results' && guard++ < 3000) { T.step(1); if (b.showRanking) press('z'); }
		guard = 0;
		while (!b.text && guard++ < 200) { T.step(1); if (b.showResults) press('z'); }
		const made = b.text, block = b.pokeblock;
		const expect = PB.calculatePokeblock(items.map(i => PB.toBlenderBerry(i)), maxRPM);
		press('z');                                     // -> "Would you like to blend another BERRY?"
		const again = b.text, yesNo = !!b.yesNo;
		return { list, items, playFrom, presses, scores, maxRPM, frames, made, block, expect, again, yesNo,
			records: JSON.parse(localStorage.getItem('magepunk_blender_records_v1') || 'null') };
	});
	A(JSON.stringify(run.list) === '["cheriberry"]', '4. the bag offers its blendable BERRY', JSON.stringify(run.list));
	A(JSON.stringify(run.items) === '["cheriberry","aspearberry"]', '4. the old-timer (MISTER) answers a CHERI with an ASPEAR (SetOpponentsBerryData)', JSON.stringify(run.items));
	A(run.playFrom === 'play' && run.presses > 3 && run.scores[0] > 3, '4. after the drop-in + 3-2-1-START, BEST presses land', JSON.stringify({ p: run.presses, s: run.scores }));
	A(run.maxRPM > 0 && run.frames > 60, '4. the bar fills and the game ends with a max RPM', JSON.stringify({ rpm: run.maxRPM, f: run.frames }));
	A(run.block && run.block.color === run.expect.color && run.block.spicy === run.expect.spicy && run.block.feel === run.expect.feel && run.block.color === 1,
		'4. the block is CalculatePokeblock(CHERI, ASPEAR, max RPM): a RED POKeBLOCK', JSON.stringify([run.block, run.expect]));
	A(/^RED POKeBLOCK was made!\nThe level is \d+, and the feel is 23\.$/.test(run.made || ''), '4. "RED POKeBLOCK was made! The level is N, and the feel is 23."', run.made);
	A(run.again === 'Would you like to blend another BERRY?' && run.yesNo, '4. "Would you like to blend another BERRY?"');
	A(Array.isArray(run.records) && run.records[0] === run.maxRPM, '4. the 2-player max-speed record is kept', JSON.stringify(run.records));
	s = await S();
	A(s.bag.cheriberry === 1 && s.pbCase.length === 1 && s.pbCase[0].color === 1, '4. one CHERI spent; the block is in the CASE', JSON.stringify([s.bag, s.pbCase]));

	// ===== 6. NO -> back to the overworld =====
	await W(async () => { const m = await import('./minigames/blender/blender.js'); m.blenderKey('ArrowDown'); m.blenderTest.step(1); m.blenderKey('z'); m.blenderTest.step(1); });
	s = await until(s => !s.open && !s.cut && !s.dialog, 6000);
	A(!s.open && !s.cut, '6. NO closes the blender and the machine\'s script ends', JSON.stringify(s));

	// ===== 5. feed it from the bag's CASE =====
	const fed = await W(async () => {
		const O = window.__ow;
		const before = JSON.stringify(O.party[0].contest || null);
		O.openPokeblockCase('field');
		const k = c => O.pokeblockCaseKey(c);
		k('z');                 // the RED POKeBLOCK
		k('z');                 // USE
		k('z');                 // ZIGGY
		const ask = O.pbCase.yesNo && O.pbCase.yesNo.msg;
		k('z');                 // YES
		const msgs = O.pbCase.msgs.slice();
		while (O.pbCase.msgs.length) k('z');
		k('x');                 // close the case
		return { before, after: O.party[0].contest, ask, msgs, open: O.pbCase.open,
			pbCase: JSON.parse(localStorage.getItem('magepunk_pokeblocks_v1') || '[]').filter(Boolean),
			saved: JSON.parse(localStorage.getItem('magepunk_party_v1'))[0].contest };
	});
	const spicy = run.block?.spicy | 0, boosted = spicy + Math.trunc(spicy / 10) + (spicy % 10 >= 5 ? 1 : 0);
	A(fed.ask === 'ZIGGY gets a POKeBLOCK?', '5. USE -> "ZIGGY gets a POKeBLOCK?"', fed.ask);
	A(/ZIGGY happily ate the\nRED POKeBLOCK\./.test(fed.msgs[0] || '') && fed.msgs[1] === 'Coolness was enhanced!', '5. ADAMANT likes spicy: "happily ate", "Coolness was enhanced!"', JSON.stringify(fed.msgs));
	A(fed.after && fed.after.cool === boosted && fed.after.sheen === 23 && fed.saved && fed.saved.cool === boosted,
		`5. COOL rises by the block's spicy +10% (${spicy} -> ${boosted}), sheen by its feel; saved on the party`, JSON.stringify([fed.after, fed.saved]));
	A(fed.pbCase.length === 0 && !fed.open, '5. the block is used up; the case closes', JSON.stringify(fed.pbCase));

	await sleep(300);
	const before = await W(() => ({ x: window.__ow.player.tx, y: window.__ow.player.ty }));
	await page.keyboard.down('ArrowDown'); await sleep(260); await page.keyboard.up('ArrowDown'); await sleep(500);
	const after = await W(() => ({ x: window.__ow.player.tx, y: window.__ow.player.ty }));
	A(after.y !== before.y || after.x !== before.x, '6. the overworld takes input again', JSON.stringify({ before, after }));

	// ===== 7. a Safari Zone POKeBLOCK FEEDER =====
	await W(() => {
		localStorage.setItem('magepunk_pokeblocks_v1', JSON.stringify([{ color: 3, spicy: 0, dry: 0, sweet: 14, bitter: 0, sour: 0, feel: 20 }]));
		localStorage.setItem('magepunk_safari_v1', JSON.stringify({ on: true, zone: 'hoenn', balls: 30, steps: 600 }));
	});
	let feeder = null, fmap = null;
	for (const m of ['SafariZone_South', 'SafariZone_Southwest', 'SafariZone_North', 'SafariZone_Northwest', 'SafariZone_Southeast', 'SafariZone_Northeast']) {
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${m}&x=10&y=10`, { waitUntil: 'domcontentloaded' });
		await boot(m);
		feeder = await W(() => {
			const w = window.__ow.world, L = w.current.layout || w.current.map, Wd = (w.current.width || L.width || 80), Ht = (w.current.height || L.height || 80);
			for (let y = 0; y < Ht; y++) for (let x = 0; x < Wd; x++) if (w.behaviorAt(x, y) === 0x87) return { x, y };
			return null;
		});
		if (feeder) { fmap = m; break; }
	}
	A(!!feeder, '7. the Emerald Safari Zone has POKeBLOCK FEEDER tiles (MB_POKEBLOCK_FEEDER)', fmap);
	if (feeder) {
		await W(() => { window.__ow.dialog.close?.(); });
		await talkUntil(s => !s.dialog && !s.cut);
		await place(feeder.x, feeder.y + 1, 'up');
		await W(() => window.__ow.interact());
		s = await until(s => s.dialog);
		A(/place a POKeBLOCK on the POKeBLOCK FEEDER\?/.test(s.dialog || ''), '7. "Would you like to place a POKeBLOCK on the POKeBLOCK FEEDER?"', s.dialog);
		let o2 = null;
		for (let i = 0; i < 8; i++) {   // through the question to its YES
			o2 = await W(() => ({ open: window.__ow.pbCase.open, ctx: window.__ow.pbCase.context }));
			if (o2.open) break;
			await key('z');
		}
		A(o2.open && o2.ctx === 'feeder', '7. YES opens the case on the feeder (USE / CANCEL)', JSON.stringify(o2));
		await W(() => { window.__ow.pokeblockCaseKey('z'); window.__ow.pokeblockCaseKey('z'); });
		s = await until(s => s.dialog);
		A(/The PINK POKeBLOCK was placed on the POKeBLOCK FEEDER\./.test(s.dialog || '') && s.pbCase.length === 0, '7. "The PINK POKeBLOCK was placed on the POKeBLOCK FEEDER." (and leaves the case)', JSON.stringify([s.dialog, s.pbCase]));
		await talkUntil(s => !s.dialog && !s.cut);
		await W(() => window.__ow.interact());
		s = await until(s => s.dialog);
		A(/The PINK POKeBLOCK you left before is still here\./.test(s.dialog || ''), '7. reading it again: "The PINK POKeBLOCK you left before is still here."', s.dialog);
		await talkUntil(s => !s.dialog && !s.cut);
		const nat = await W(async () => { const PB = await import('./pokeblock.js'); const P = window.__ow.player; const b = PB.feederInRange(window.__ow.world.current.map.id, P.tx, P.ty); let n = 0; return b && PB.feederNature(b, () => (n++ ? 1 : 0)); });
		A(nat && ['timid', 'hasty', 'jolly', 'naive'].includes(nat), '7. wild natures nearby lean toward liking sweet', nat);
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
