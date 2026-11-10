// legend_failed_ball_test.mjs — bug:1794281768146 (remytest): "SUICUNE never returns to
// Tin Tower 1F after a failed capture attempt + flee".
//
// What happened on that save: legend_caught_suicune + EVENT_TIN_TOWER_1F_SUICUNE set,
// SUICUNE seen but not caught, EVENT_FOUGHT_SUICUNE / VAR_SCENE_TinTower1F untouched.
// That is exactly the state a KO leaves: the lead VENUSAUR knows LEECH SEED, and the
// ball that broke free spent the turn (foe move, then the end-of-turn pass), so the
// seed sapped SUICUNE's last HP: "The wild SUICUNE fainted!". A placed legendary that
// faints is gone for the save (as Crystal's Tin Tower SUICUNE is after its one battle).
// Running away never removed it. Pinned here on the real map with real battles:
//   1. ball breaks free, then RUN: leave through the door and come back, SUICUNE's
//      sprite and its (9,11) trigger are both back, and the battle starts again;
//   2. ball breaks free, LEECH SEED takes the last HP: SUICUNE is gone, and the game
//      now SAYS so ("...will not be seen here again"), where it used to say nothing;
//   3. a caught SUICUNE joins you and is gone too.
//   node overworld/tests/legend_failed_ball_test.mjs
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
const PORT = 9741;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };
const ACCOUNT = { username: 'lfb', friendCode: 'LFB', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		return res.end(JSON.stringify({ ok: true, state: ACCOUNT, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u === '/' ? '/index.html' : u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
// every badge of the three regions: ECRUTEAK's tier gate (badges come in thirds) must let you out of the door
const ALL8 = ids => Object.fromEntries(ids.map(i => [i, true]));
const BADGES = { badges: {
	KANTO: ALL8(['boulder', 'cascade', 'thunder', 'rainbow', 'soul', 'marsh', 'volcano', 'earth']),
	JOHTO: ALL8(['zephyr', 'hive', 'plain', 'fog', 'storm', 'mineral', 'glacier', 'rising']),
	HOENN: ALL8(['stone', 'knuckle', 'dynamo', 'heat', 'balance', 'feather', 'mind', 'rain']),
}, champion: {} };
let browser;
async function open(lead) {
	const page = await browser.newPage();
	page.on('pageerror', e => console.log('  (pageerror) ' + String(e.message).slice(0, 160)));
	await page.evaluateOnNewDocument((acct, badges) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(acct));
		localStorage.setItem('magepunk_region', 'JOHTO');
		localStorage.setItem('magepunk_bag_v1', JSON.stringify({ pokeball: 20 }));
		localStorage.setItem('magepunk_badges_v1', JSON.stringify(badges));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, EVENT_RELEASED_THE_BEASTS: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
		localStorage.setItem('magepunk_repel_v1', '99999');   // no wild battle may eat a step
	}, ACCOUNT, BADGES);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=TinTower1F&x=9&y=12`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.world?.current?.name === 'TinTower1F')).catch(() => false)); i++) await sleep(100);
	await sleep(1200);
	await page.evaluate(async lead => {
		const B = await import('./battle.js'), S = (await import('./ow_state.js')).S;
		S.party = [B.buildMon(lead, 50, window.__ow.battle.data)];
		// every battle line as it is queued (a Z press can skip past one before it is drawn)
		const Bt = window.__ow.battle, push = Bt.pushMsg.bind(Bt);
		window.__msgs = [];
		// every line the HUD shows (boot notices can follow the battle's own)
		window.__hud = [];
		const hud = document.getElementById('hud');
		if (hud) new MutationObserver(() => window.__hud.push(hud.textContent)).observe(hud, { childList: true, characterData: true, subtree: true });
		Bt.pushMsg = (text, ...rest) => { if (text) window.__msgs.push(String(text)); return push(text, ...rest); };
	}, lead);
	return page;
}
const KEY = { up: 'ArrowUp', down: 'ArrowDown', left: 'ArrowLeft', right: 'ArrowRight' };
// one real step: hold the key until the tile or the map changes
async function step(page, dir) {
	const at = await page.evaluate(() => [window.__ow.world.current.name, window.__ow.player.tx, window.__ow.player.ty]);
	await page.keyboard.down(KEY[dir]);
	for (let i = 0; i < 40; i++) {
		await sleep(25);
		const s = await page.evaluate(() => [window.__ow.world.current.name, window.__ow.player.tx, window.__ow.player.ty]);
		if (s[0] !== at[0] || s[1] !== at[1] || s[2] !== at[2]) break;
	}
	await page.keyboard.up(KEY[dir]);
	for (let i = 0; i < 40 && await page.evaluate(() => window.__ow.player.moving); i++) await sleep(25);
	await sleep(250);
}
// press Z through dialogs / fades until the field is calm or a battle is up
const drive = (page, ms = 10000) => page.evaluate(async ms => {
	const O = window.__ow;
	const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < ms) {
		if (O.battle.active) return 'battle';
		const d = O.dialog.blocking, c = O.cutscene.blocking, f = O.fade || { alpha: 0, target: 0 };
		if (!d && !c && !O.battle.blocking && f.alpha < 0.001 && f.target < 0.001) { if (++calm >= 12) return 'idle'; } else calm = 0;
		if (d) press('z');
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
}, ms);
// in battle: advance the messages (logging them) until the command menu, or the end
const toMenu = (page, ms = 20000) => page.evaluate(async ms => {
	const O = window.__ow, t0 = Date.now();
	while (Date.now() - t0 < ms) {
		const a = O.battle.active;
		if (!a) return 'over';
		if (a.phase === 'menu') return 'menu';
		if (a.phase === 'msg') O.battle.key('z');
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout:' + O.battle.active?.phase;
}, ms);
const settle = async page => { for (let i = 0; i < 100 && await page.evaluate(() => window.__ow.battle.blocking); i++) await sleep(50); await drive(page, 4000); };
// step from (9,12) onto SUICUNE's square and get to the command menu
async function engage(page) {
	await page.evaluate(() => { const p = window.__ow.player; p.setTile(9, 12); p.facing = 'up'; });
	await step(page, 'up');
	const r = await drive(page, 8000);
	const foe = await page.evaluate(() => window.__ow.battle.endSpec?.kind === 'legendary' ? window.__ow.battle.endSpec.species : null);
	return { r, foe, menu: r === 'battle' ? await toMenu(page) : null };
}
// weaken it, then a POKe BALL that breaks free (every shake roll fails), through the bag's own call
async function failedBall(page, { seeded = false } = {}) {
	await page.evaluate(seeded => {
		const a = window.__ow.battle.active;
		a.foe.curHP = seeded ? 3 : Math.max(1, Math.floor(a.foe.maxHP / 10));
		if (seeded) a.foe.seeded = true;   // LEECH SEED on it, as remytest's VENUSAUR had
		window.__rnd = Math.random; Math.random = () => 0.999;
		window.__msgs = [];
		window.__ow.battle.useItem('pokeball');
	}, seeded);
	const r = await toMenu(page);
	await page.evaluate(() => { Math.random = window.__rnd; });
	return r;
}
const state = page => page.evaluate(() => {
	const O = window.__ow, fl = JSON.parse(localStorage.getItem('magepunk_story') || '{}').flags || {};
	return {
		map: O.world.current.name,
		caughtFlag: !!fl.legend_caught_suicune, hideFlag: !!fl.EVENT_TIN_TOWER_1F_SUICUNE,
		here: O.legendariesHere().map(e => e.species),
		// a SUICUNE on screen: the native encounter's (drawn on its square) or the map's
		// own object — while it is catchable the encounter is its one body
		// (skypillar_phases_test), so the object is left out then
		sprite: O.legendariesHere().some(e => e.species === 'suicune') || O.npcs.list.some(n => !n.hidden && /SUICUNE/.test(n.ev?.graphics_id || '')),
		hud: (window.__hud || []).join(' | '),
		party: (JSON.parse(localStorage.getItem('magepunk_party_v1') || '[]') || []).map(m => m.speciesId),
		msgs: window.__msgs || [],
	};
});
// out through the door at (9,15) into ECRUTEAK CITY, then back in
async function leaveAndReturn(page) {
	await page.evaluate(() => { const p = window.__ow.player; p.setTile(9, 14); p.facing = 'down'; });
	await step(page, 'down');   // onto the mat at (9,15)...
	await step(page, 'down');   // ...and out
	await drive(page, 6000);
	const out = await page.evaluate(() => [window.__ow.world.current.name, window.__ow.player.tx, window.__ow.player.ty]);
	// ECRUTEAK CITY puts you on the tower's door (37,7): off it, and back in through it
	await step(page, 'down');
	await drive(page, 3000);
	await step(page, 'up');
	await drive(page, 6000);
	return { out, back: await page.evaluate(() => [window.__ow.world.current.name, window.__ow.player.tx, window.__ow.player.ty]) };
}

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ---- 1. the ball breaks free, then RUN: it is all still there on the way back ----
	{
		const page = await open('mewtwo');   // faster than SUICUNE: the RUN always works
		const before = await state(page);
		A(before.sprite && before.here.includes('suicune'), 'SUICUNE stands on Tin Tower 1F once the beasts are released', JSON.stringify(before));
		const e = await engage(page);
		A(e.r === 'battle' && e.foe === 'suicune' && e.menu === 'menu', 'stepping onto (9,11) starts the SUICUNE battle', JSON.stringify(e));
		const b = await failedBall(page);
		const mid = await state(page);
		A(b === 'menu' && mid.msgs.some(m => /broke free/.test(m)), 'the POKe BALL breaks free and the battle goes on', JSON.stringify({ b, msgs: mid.msgs }));
		await page.evaluate(() => { const B = window.__ow.battle; B.active.menuIdx = 3; B.key('z'); });   // RUN
		await toMenu(page);
		await settle(page);
		const ran = await state(page);
		A(ran.msgs.some(m => /Got away safely/.test(m)) && !ran.caughtFlag && !ran.hideFlag, 'RUN gets away and leaves no caught / hide flag', JSON.stringify(ran));
		const trip = await leaveAndReturn(page);
		const back = await state(page);
		A(trip.out[0] === 'EcruteakCity' && back.map === 'TinTower1F', 'out through the door to ECRUTEAK CITY and back in through (37,7)', JSON.stringify(trip));
		A(back.sprite && back.here.includes('suicune'), '...and SUICUNE\'s sprite is back', JSON.stringify(back));
		const again = await engage(page);
		A(again.r === 'battle' && again.foe === 'suicune', '...and (9,11) starts the SUICUNE battle again', JSON.stringify(again));
		await page.close();
	}

	// ---- 2. the ball breaks free and LEECH SEED takes its last HP: a KO, gone, and said so ----
	{
		const page = await open('venusaur');
		const e = await engage(page);
		A(e.foe === 'suicune' && e.menu === 'menu', 'the SUICUNE battle starts (VENUSAUR lead)', JSON.stringify(e));
		const b = await failedBall(page, { seeded: true });
		await settle(page);
		const ko = await state(page);
		A(b === 'over' && ko.msgs.some(m => /broke free/.test(m)) && ko.msgs.some(m => /sapped by Leech Seed/.test(m)) && ko.msgs.some(m => /SUICUNE fainted/.test(m)),
			'the ball breaks free, LEECH SEED saps the last HP, and SUICUNE faints (remytest\'s save)', JSON.stringify({ b, msgs: ko.msgs }));
		A(ko.caughtFlag && ko.hideFlag && !ko.here.includes('suicune') && !ko.sprite, 'a fainted SUICUNE is gone for the save, as in Crystal', JSON.stringify(ko));
		A(/SUICUNE fainted\.\.\. it will not be seen here again/.test(ko.hud), 'and the game says so when the battle ends', JSON.stringify(ko.hud));
		await leaveAndReturn(page);
		const back = await state(page);
		A(back.map === 'TinTower1F' && !back.sprite && !back.here.includes('suicune'), '...and it is still gone on the way back', JSON.stringify(back));
		await page.close();
	}

	// ---- 3. caught: in the party, and gone from the tower ----
	{
		const page = await open('mewtwo');
		await engage(page);
		await page.evaluate(() => { window.__rnd = Math.random; Math.random = () => 0; window.__msgs = []; window.__ow.battle.useItem('pokeball'); });
		await toMenu(page);
		await page.evaluate(() => { Math.random = window.__rnd; });
		await settle(page);
		const c = await state(page);
		A(c.msgs.some(m => /Gotcha! SUICUNE was caught/.test(m)) && c.party.includes('suicune') && c.caughtFlag && !c.sprite && !c.here.includes('suicune'),
			'a caught SUICUNE joins the party and leaves the tower', JSON.stringify(c));
		A(!/will not be seen here again/.test(c.hud), '...with no fainted notice', JSON.stringify(c.hud));
		await page.close();
	}
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
