// sinnoh_ferry_test.mjs — SINNOH, stage 3: the way in. Sinnoh opens to the trainer who has beaten JohKanto's Champion
// (the owner, 2026-11-15: "1 yes and 2 yes"), and the ferry is how you get there and back
// (ow_menukeys.js FERRY_DESTS / sinnohOpen, services.js SINNOH_FERRY, ow_postgame.js).
//   * before JohKanto's crown no ferry lists Sinnoh; with it, every ferry does
//   * sailing there lands you in Sandgem Town, free to walk, with the welcome line; your home region is unchanged
//   * the sailor on Sandgem's east side is solid, and talking to him opens the ferry (not listing Sandgem itself);
//     sailing from there takes you back to another region
//   * the game points a new JohKanto Champion at Sinnoh, and counts its gyms once the starter is taken
//   node overworld/tests/sinnoh_ferry_test.mjs        (SHOTS=<dir> for screenshots)
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9969, SHOTS = process.env.SHOTS ? path.resolve(process.env.SHOTS) : null;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(120); } return false; }

const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const PARTY = [{ speciesId: 'rattata', name: 'LEAD', level: 90, gender: 'M', friend: 70, types: ['Normal'], ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 300, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 }, maxHP: 300, curHP: 300, exp: 729000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19 }];
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req) { } res.writeHead(200, { 'content-type': 'application/json' }); res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null })); return; }
	const f = u === '/' ? '/index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--mute-audio'] });
	const open = async (map, champions) => {
		const page = await (await browser.createBrowserContext()).newPage(); page.errors = [];
		await page.setViewport({ width: 960, height: 640 });
		page.on('pageerror', e => page.errors.push(e.message));
		await page.evaluateOnNewDocument((st, party, champions) => {
			if (localStorage.getItem('magepunk_mp_token_v1')) return;
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party)); localStorage.setItem('magepunk_region', 'hoenn');
			localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: {}, champion: Object.fromEntries(champions.map(r => [r, true])) }));
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_started: true, intro_greeted: true, intro_done: true, story_seeded: true, newgame_flags_seeded: true, rival_tier0_done: true, beat_red: champions.includes('JOHKANTO') }, vars: {} }));
		}, STATE, PARTY, champions);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}`, { waitUntil: 'domcontentloaded' });
		const ok = await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.world && window.__ow.world.current && window.__ow.battle && window.__ow.battle.data)), 60000);
		await sleep(2500);
		for (let i = 0; i < 8 && await page.evaluate(() => !!window.__ow.gateReport().blockedBy); i++) { await page.keyboard.press('KeyZ'); await sleep(200); }
		return ok ? page : null;
	};
	const dests = page => page.evaluate(async () => (await import('/overworld/ow_menukeys.js')).ferryDests().map(d => d.label));
	const here = page => page.evaluate(() => ({ map: window.__ow.world.current.name, at: [window.__ow.player.tx, window.__ow.player.ty], by: window.__ow.gateReport().blockedBy, region: localStorage.getItem('magepunk_region') }));

	// --- not yet a JohKanto Champion ---
	{
		const page = await open('SlateportCity_Harbor', ['KANTO', 'JOHTO', 'HOENN']);
		A(!!page, 'the game boots at Slateport Harbor');
		const d = await dests(page);
		A(d.length >= 2 && !d.some(l => /Sinnoh/i.test(l)), "the three Leagues' Champion is not offered Sinnoh: RED still stands", d);
		await page.close();
	}

	// --- JohKanto's Champion ---
	{
		const page = await open('SlateportCity_Harbor', ['KANTO', 'JOHTO', 'HOENN', 'JOHKANTO']);
		const d = await dests(page), i = d.findIndex(l => /Sandgem Town \(Sinnoh\)/.test(l));
		A(i >= 0, "with JohKanto's crown the ferry lists Sandgem Town (Sinnoh)", d);
		const goal = await page.evaluate(async () => (await import('/overworld/ow_postgame.js')).postgameObjective());
		A(/SINNOH/.test(goal || '') && /FERRY/.test(goal || '') && /ROWAN/.test(goal || ''), 'and the game points there: the ferry, Sandgem Town, PROF. ROWAN', goal);
		await page.evaluate(async (i) => { const m = await import('/overworld/ow_menukeys.js'); m.ferryMenu.list = null; m.ferryMenu.open = true; m.ferryMenu.idx = i; }, i);
		await sleep(300);
		if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'sinnoh-ferry-menu.png') }); }
		await page.keyboard.press('KeyZ');
		A(await waitFor(async () => (await here(page)).map === 'SinnohSandgemTown', 20000), 'choosing it sails to Sandgem Town', await here(page));
		// (the line is the text box's, or the status line's when a scene of the town's own already has the box)
		const line = () => page.evaluate(() => { const d = window.__ow.dialog; return (d && d.pages ? d.pages.flat().join(' ') : '') + ' | ' + (document.getElementById('hud') || {}).textContent; });
		A(await waitFor(async () => /Welcome to Sandgem Town \(Sinnoh\)/.test(await line()), 8000), 'with the welcome line', await line());
		for (let i = 0; i < 8 && (await here(page)).by; i++) { await page.keyboard.press('KeyZ'); await sleep(250); }
		const h0 = await here(page);
		A(JSON.stringify(h0.at) === '[12,11]' && !h0.by && h0.region === 'hoenn', 'you stand by the lab, free to walk, and your home region is still your own', h0);
		await page.keyboard.down('ArrowDown'); await sleep(500); await page.keyboard.up('ArrowDown'); await sleep(300);
		const h1 = await here(page);
		A(h1.at[1] > 11, 'and you can walk', h1);
		if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'sinnoh-sandgem.png') });

		// the sailor
		const svc = await page.evaluate(async () => { const C = await import('/overworld/ow_core.js'); return { kind: C.services.kindAt(28, 11), solid: C.services.blocks(28, 11), other: C.services.kindAt(12, 11), img: !!C.services.imgs.sailor }; });
		A(svc.kind === 'ferry' && svc.solid && svc.other === null && svc.img, 'a sailor stands on the east side of town: he is solid, he is the ferry, and the rest of the town is not', svc);
		await page.evaluate(() => window.__ow.player.setTile(27, 11)); await sleep(150);
		await page.keyboard.down('ArrowRight'); await sleep(260); await page.keyboard.up('ArrowRight'); await sleep(250);
		A(JSON.stringify((await here(page)).at) === '[27,11]', 'you cannot walk through him', (await here(page)).at);
		await page.keyboard.press('KeyZ'); await sleep(400);
		const menu = await page.evaluate(async () => { const m = await import('/overworld/ow_menukeys.js'); return { open: m.ferryMenu.open, dests: m.ferryDests().map(d => d.label) }; });
		A(menu.open && menu.dests.some(l => /Slateport/.test(l)) && !menu.dests.some(l => /Sinnoh/.test(l)), 'talking to him opens the ferry: the other regions, not Sandgem itself', menu);
		const j = menu.dests.findIndex(l => /Slateport/.test(l));
		await page.evaluate(async (j) => { (await import('/overworld/ow_menukeys.js')).ferryMenu.idx = j; }, j);
		await page.keyboard.press('KeyZ');
		A(await waitFor(async () => (await here(page)).map === 'SlateportCity_Harbor', 20000), 'and he sails you back to Slateport', await here(page));

		// once the starter is taken, the pointer counts Sinnoh's gyms
		const goal2 = await page.evaluate(async () => { window.__ow.Story.setFlag('sinnoh_starter_given'); return (await import('/overworld/ow_postgame.js')).postgameObjective(); });
		A(/SINNOH awaits: 8 of its GYMS remain/.test(goal2 || ''), 'after the starter the pointer counts its gyms', goal2);
		A(page.errors.length === 0, 'no page error', page.errors.slice(0, 3));
		await page.close();
	}
} finally { if (browser) await browser.close(); server.close(); }
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
