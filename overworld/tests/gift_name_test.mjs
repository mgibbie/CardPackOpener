// gift_name_test.mjs — a gift POKeMON's name is printed when you receive it.
//
// 2026-10-02, Instinct's bug report: taking HITMONLEE at the Saffron Dojo said
// "PLAYER received the  from the KARATE MASTER." The text is "received the
// {STR_VAR_1}", filled by `bufferspeciesname STR_VAR_1, VAR_TEMP_1` — a command
// the transpile dropped everywhere (bufferitemname, buffernumberstring… too), so
// all 924 {STR_VAR_n} placeholders printed as nothing. tools/gen_multichoice.mjs
// now restores them as `buffer` ops and normalizeText fills the placeholders.
//   1. data: both Dojo branches buffer the species before the message
//   2. room in the party: "received the HITMONLEE"
//   3. party full (it goes to the PC): "received the HITMONLEE" too
//
//   node overworld/tests/gift_name_test.mjs
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
const PORT = 9206;
const STATE = { username: 'giftname', friendCode: 'GIFT01', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const MON = n => ({
	speciesId: 'rattata', name: 'MON' + n, level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19,
});
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 1. data =====
{
	const d = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', 'multichoice_data.json'), 'utf8'));
	const p = (d.patches || {}).SaffronCity_Dojo || {};
	for (const lab of ['SaffronCity_Dojo_EventScript_ReceivedHitmonParty', 'SaffronCity_Dojo_EventScript_ReceivedHitmonPC']) {
		const ops = p[lab] || [];
		const b = ops.findIndex(o => o.op === 'buffer' && o.kind === 'species' && o.dst === 'STR_VAR_1' && o.src === 'VAR_TEMP_1');
		const m = ops.findIndex(o => o.op === 'msg' && o.text === 'SaffronCity_Dojo_Text_ReceivedMonFromKarateMaster');
		A(b >= 0 && m > b, `1. ${lab.replace('SaffronCity_Dojo_EventScript_', '')} buffers the species before "received the {STR_VAR_1}"`, JSON.stringify(ops.slice(0, 3)));
	}
}

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
async function takeHitmonlee(partySize) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument((st, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_region', 'KANTO');
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant' }));
	}, STATE, Array.from({ length: partySize }, (_, i) => MON(i + 1)));
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=SaffronCity_Dojo&x=5&y=4`, { waitUntil: 'domcontentloaded' });
	for (let i = 0; i < 300 && !(await page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.world.current?.name === 'SaffronCity_Dojo')).catch(() => false)); i++) await sleep(100);
	await sleep(900);
	await page.evaluate(() => { const P = window.__ow.player; P.tx = 5; P.ty = 4; P.x = 80; P.y = 64; P.facing = 'up'; });
	await page.keyboard.press('z');
	// page through with Z (YES to "You want…?") until the reception line shows
	const said = await page.evaluate(async () => {
		const O = window.__ow, seen = [];
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const t0 = Date.now();
		while (Date.now() - t0 < 15000) {
			const pages = JSON.stringify(O.dialog.pages || '');
			if (O.dialog.blocking && seen[seen.length - 1] !== pages) seen.push(pages);
			if (/received the/i.test(pages)) return seen;
			if (O.dialog.blocking) press('z');
			await new Promise(r => setTimeout(r, 60));
		}
		return seen;
	});
	await ctx.close();
	return { line: said.find(s => /received the/i.test(s)) || null, said, errors };
}

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const room = await takeHitmonlee(2);
	A(room.line && /received the HITMONLEE/.test(room.line), '2. room in the party: "received the HITMONLEE from the KARATE MASTER"', room.line || JSON.stringify(room.said.slice(-3)));
	A(room.errors.length === 0, '2. no page errors', JSON.stringify(room.errors.slice(0, 3)));
	const full = await takeHitmonlee(6);
	A(full.line && /received the HITMONLEE/.test(full.line), '3. party full (to the PC): "received the HITMONLEE" too', full.line || JSON.stringify(full.said.slice(-3)));
	A(full.errors.length === 0, '3. no page errors', JSON.stringify(full.errors.slice(0, 3)));
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 3).join(' <- '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
