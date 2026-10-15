// johkanto_postgame_test.mjs — JohKanto's two postgame blockers (playtest 2026-10-14).
//
//   1. OAK opens MT SILVER. Crystal's `readvar VAR_BADGES` counts Johto + Kanto
//      (CountBadges over both badge bytes); the port set it to Johto's 8, and
//      NUM_BADGES (16 in Crystal, 8 in FRLG/Emerald) was unresolved — so Oak said
//      "come back with the KANTO badges" forever. 16 badges -> EVENT_OPENED_MT_SILVER;
//      15 -> not.
//   2. VERMILION's SNORLAX wakes to the POKé FLUTE channel. `special SnorlaxAwake`
//      was unported (and the transpile dropped its `iftrue .Awake`): with the EXPN
//      CARD the carried RADIO (start menu) offers the POKé FLUTE station in Kanto;
//      beside the 2x2 SNORLAX with it playing, talking starts the Lv50 battle; a
//      win sets EVENT_FOUGHT_SNORLAX and removes him. Without it: "snoring".
//
//   node overworld/tests/johkanto_postgame_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const DATA = path.join(ROOT, 'overworld', 'data');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9490;
const STATE = { username: 'jkpost', friendCode: 'JKPOST', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'rattata', name: 'LEAD', level: 70, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 220, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 220, curHP: 220,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
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
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg' }[path.extname(u)] || 'application/octet-stream';
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
		localStorage.setItem('magepunk_region', 'JOHTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { JOHTO: { zephyr: true, hive: true, plain: true, fog: true, storm: true, mineral: true, glacier: true, rising: true }, KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true, marsh: true, volcano: true, earth: true }, HOENN: { stone: true, knuckle: true, dynamo: true, heat: true, balance: true, feather: true, mind: true, rain: true }, JOHKANTO: { boulder: true, cascade: true, thunder: true, rainbow: true, soul: true, marsh: true, volcano: true, earth: true } }, champion: { KANTO: true, JOHTO: true, HOENN: true } }));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, grand_champion: true, EVENT_TALKED_TO_OAK_IN_KANTO: true, ENGINE_RADIO_CARD: true, ENGINE_EXPN_CARD: true, EVENT_RETURNED_MACHINE_PART: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, PARTY);
	const W = (f, ...a) => page.evaluate(f, ...a);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await page.evaluate(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const state = () => W(() => ({ d: !!window.__ow.dialog.blocking, c: !!window.__ow.cutscene.blocking, b: !!window.__ow.battle.active, text: window.__ow.dialog.pages ? window.__ow.dialog.pages.flat().join(' ') : '' }));
	// talk, then read every page until the scene ends; returns the text seen
	const talk = async (x, y, facing, max = 60) => {
		await W((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f; }, x, y, facing);
		await W(() => window.__ow.interact());
		let seen = '', battle = false;
		for (let i = 0; i < max; i++) {
			const s = await state();
			if (s.text) seen += ' | ' + s.text;
			if (s.b) { battle = true; break; }
			if (!s.d && !s.c) { await sleep(250); const t = await state(); if (!t.d && !t.c && !t.b) break; continue; }
			if (s.d) await page.keyboard.press('z');
			await sleep(120);
		}
		return { seen, battle };
	};
	const story = () => W(async () => { const S = await import('./events.js'); return { opened: S.getFlag('EVENT_OPENED_MT_SILVER'), fought: S.getFlag('EVENT_FOUGHT_SNORLAX'), badges: S.getVar('VAR_BADGES') }; });

	// ===== 1. OAK opens MT SILVER =====
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=JohKantoOaksLab&x=4&y=3`, { waitUntil: 'domcontentloaded' });
	await boot('JohKantoOaksLab');
	A((await story()).badges === 16, '1. VAR_BADGES counts Johto + Kanto: 16', JSON.stringify(await story()));
	// 15 badges first: one JohKanto badge short
	await W(() => { const k = 'magepunk_badges_v1'; const b = JSON.parse(localStorage.getItem(k)); delete b.badges.JOHKANTO.earth; localStorage.setItem(k, JSON.stringify(b)); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await boot('JohKantoOaksLab');
	const fifteen = await talk(4, 3, 'up');
	A(!(await story()).opened, '1. with 15 badges Oak does NOT open MT SILVER', fifteen.seen.slice(0, 200));
	await W(() => { const k = 'magepunk_badges_v1'; const b = JSON.parse(localStorage.getItem(k)); b.badges.JOHKANTO.earth = true; localStorage.setItem(k, JSON.stringify(b)); });
	await page.reload({ waitUntil: 'domcontentloaded' }); await boot('JohKantoOaksLab');
	const sixteen = await talk(4, 3, 'up');
	A((await story()).opened, '1. with all 16 badges Oak opens MT SILVER (EVENT_OPENED_MT_SILVER)', sixteen.seen.slice(0, 300));
	A(/SILVER/i.test(sixteen.seen), '1. ...and says so (OakOpenMtSilverText)', sixteen.seen.slice(0, 300));

	// ===== 2. VERMILION SNORLAX =====
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=JohKantoVermilionCity&x=34&y=10`, { waitUntil: 'domcontentloaded' });
	await boot('JohKantoVermilionCity');
	const blocks = await W(() => window.__ow.npcs.npcBlocks(35, 9, 3));
	A(blocks, '2. SNORLAX is a 2x2 body ((35,9) is part of him)', String(blocks));
	const asleep = await talk(34, 10, 'up');
	A(!asleep.battle && /snor/i.test(asleep.seen) && !(await story()).fought, '2. without the POKé FLUTE channel he keeps snoring', asleep.seen.slice(0, 200));
	const radio = await W(async () => {
		const F = await import('./ow_features.js');
		const items = (await import('./ow_screens.js')).startItems();
		F.openRadio();
		const ch = F.radioChannels();
		F.radioMenu.idx = ch.indexOf(F.POKE_FLUTE_CHANNEL);
		F.radioKey('z');
		return { inMenu: items.includes('RADIO'), channels: ch };
	});
	A(radio.inMenu, '2. the RADIO CARD puts a RADIO in the start menu', JSON.stringify(radio));
	A(radio.channels.includes('POKé FLUTE'), '2. in Kanto with the EXPN CARD the radio offers the POKé FLUTE station', JSON.stringify(radio.channels));
	// the station plays Crystal's own song (MUSIC_POKE_FLUTE_CHANNEL), not a stand-in,
	// served from the tracked bgm_extra/ folder (no owdata redeploy needed)
	const tune = await W(async () => {
		const Snd = await import('./sound.js');
		const key = (await import('./ow_state.js')).S?.radioTune ?? null;
		const url = Snd.bgmUrl ? Snd.bgmUrl('crystal_MUSIC_POKE_FLUTE_CHANNEL') : `data/sounds/bgm/crystal_MUSIC_POKE_FLUTE_CHANNEL.ogg`;
		const r = await fetch(url);
		const len = r.ok ? (await r.arrayBuffer()).byteLength : 0;
		return { key, now: Snd.bgmNow(), url, status: r.status, type: r.headers.get('content-type'), len };
	});
	A(tune.key === 'crystal_MUSIC_POKE_FLUTE_CHANNEL' && tune.now === 'crystal_MUSIC_POKE_FLUTE_CHANNEL', '2. the POKé FLUTE station plays Crystal\'s MUSIC_POKE_FLUTE_CHANNEL (no stand-in)', JSON.stringify(tune));
	A(tune.status === 200 && /audio\/ogg/.test(tune.type || '') && tune.len > 100000 && /^bgm_extra\//.test(tune.url), '2. ...and that track loads from bgm_extra/ (real audio)', JSON.stringify(tune));
	for (let i = 0; i < 10; i++) { const s = await state(); if (!s.d) break; await page.keyboard.press('z'); await sleep(120); }
	await W(async () => { (await import('./ow_features.js')).radioMenu.open = false; });
	const awake = await talk(34, 10, 'up');
	A(awake.battle, '2. tuned to the POKé FLUTE beside him, talking starts the SNORLAX battle', awake.seen.slice(0, 200));
	const foe = await W(() => ({ sp: window.__ow.battle.active?.foe?.speciesId, lv: window.__ow.battle.active?.foe?.level }));
	A(foe.sp === 'snorlax' && foe.lv === 50, '2. ...a Lv50 SNORLAX', JSON.stringify(foe));
	await W(() => window.__ow.battle.finish('victory'));
	for (let i = 0; i < 60; i++) { const s = await state(); if (!s.d && !s.c && !s.b) break; if (s.d) await page.keyboard.press('z'); await sleep(150); }
	await sleep(500);
	const after = await W(async () => ({ fought: (await import('./events.js')).getFlag('EVENT_FOUGHT_SNORLAX'), present: window.__ow.npcs.list.some(n => /BIG_SNORLAX/.test(n.ev?.graphics_id || '') && !n.hidden) }));
	A(after.fought && !after.present, '2. the win sets EVENT_FOUGHT_SNORLAX and SNORLAX is gone', JSON.stringify(after));
	A(errors.length === 0, 'no page errors', JSON.stringify(errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
