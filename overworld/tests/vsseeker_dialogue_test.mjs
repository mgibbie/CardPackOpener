// vsseeker_dialogue_test.mjs — a VS Seeker rematch has its tier whichever way it starts.
//
// 2026-10-08, Instinct's bug report (bug:1791502114459): Route 127's Triathlete
// Donny, re-armed by the VS SEEKER at tier 7, fought his first-battle team
// (Wingull Lv26, Staryu Lv34) when TALKED to. Walking into his sight runs
// trainers.buildBattle (+2 levels per tier, "(rematch)"); talking runs his
// script's trainerbattle -> startScriptedBattle, which never read the tier.
//   1. no rematch tier: talking to Donny fights his decomp team at its levels
//   2. tier 7: talking to him fights it 14 levels higher, named "(rematch)"
//
//   node overworld/tests/vsseeker_dialogue_test.mjs
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
const PORT = 9350;
const STATE = { username: 'vsseeker', friendCode: 'VSSEEK', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{
	speciesId: 'pidgeot', name: 'LEAD', level: 57, gender: 'M', friend: 70, types: ['Normal', 'Flying'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
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
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));


let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	// one fresh browser context per run: its own localStorage, seeded the same way
	const fight = async tier => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, party) => {
			if (sessionStorage.getItem('seeded')) return;
			sessionStorage.setItem('seeded', '1');
			localStorage.clear();
			localStorage.setItem('magepunk_mp_token_v1', 't');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'HOENN');
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route127&x=18&y=69`, { waitUntil: 'domcontentloaded' });
		for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === 'Route127' && window.__ow.trainers.list.length)).catch(() => false)); i++) await sleep(100);
		await sleep(900);
		const r = await page.evaluate(async tier => {
			const O = window.__ow, T = O.trainers;
			const donny = T.list.find(t => t.ev.script === 'Route127_EventScript_Donny');
			if (!donny) return { error: 'Donny not loaded' };
			if (tier) T.rematch[T.keyOf(donny)] = tier;      // what the VS SEEKER's re-arm leaves behind
			const P = O.player; P.tx = 18; P.ty = 69; P.x = 18 * 16; P.y = 69 * 16; P.facing = 'up';
			O.interact();
			for (let i = 0; i < 150 && !O.battle.active; i++) {
				if (O.dialog.blocking) O.dialog.key('z');
				await new Promise(r => setTimeout(r, 60));
			}
			const a = O.battle.active;
			if (!a) return { error: 'no battle started' };
			return { name: a.info?.displayName || a.displayName || null, foe: (a.foes || []).map(m => [m.speciesId, m.level]) };
		}, tier);
		await ctx.close();
		return { ...r, errors };
	};

	const base = await fight(0);
	A(JSON.stringify(base.foe) === JSON.stringify([['wingull', 26], ['staryu', 34]]) && !/rematch/.test(base.name || ''),
		'1. no rematch tier: talking to Donny fights Wingull Lv26 + Staryu Lv34', JSON.stringify(base));
	const re = await fight(7);
	A(JSON.stringify(re.foe) === JSON.stringify([['wingull', 40], ['staryu', 48]]),
		'2. tier 7: talking to him fights the team 14 levels higher (Lv40 / Lv48)', JSON.stringify(re));
	A(/\(rematch\)/.test(re.name || ''), '2. ...and the battle is named a rematch', JSON.stringify(re.name));
	A(!base.errors.length && !re.errors.length, 'no page errors', JSON.stringify([...base.errors, ...re.errors].slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
