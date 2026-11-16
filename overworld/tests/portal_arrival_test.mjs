// portal_arrival_test.mjs — stepping through a PORTAL must never leave you unable to move.
// The owner, 2026-11-15: "we have to stop the player from getting stuck when they end up on the same tile as their
// following pokemon. the portals sometimes do that and it leaves me not able to move".
// (After any warp your follower stands on your tile until you take a step, so a frozen player always has it underfoot:
//  that is what a freeze looks like, not what causes it. This plays the trips that froze.)
//   * a portal trip into a town where your RIVAL is waiting: the rival's scene plays, the battle starts, and afterwards
//     you can walk
//   * a plain portal trip: the welcome line, then you can walk
//   * arriving never leaves a scene, a dialog or a menu holding the controls with nothing on screen to dismiss
//   node overworld/tests/portal_arrival_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9957;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '\n      ' + String(typeof extra === 'string' ? extra : JSON.stringify(extra)).slice(0, 900) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ogg': 'audio/ogg', '.ttf': 'font/ttf' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (s, name, sprite, num) => ({ speciesId: s, name, level: 60, gender: 'M', friend: 70, types: ['Normal'], ivs: { hp: 31, atk: 31, def: 31, spa: 31, spd: 31, spe: 31 }, stats: { hp: 400, atk: 400, def: 300, spa: 300, spd: 300, spe: 400 }, maxHP: 400, curHP: 400, exp: 216000, moves: [{ id: 'hyperbeam', name: 'Hyper Beam', pp: 5, maxPp: 5 }, { id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite, num });
const PARTY = [mon('rattata', 'LEAD', 's608.png', 19)];

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
	const page = await browser.newPage(), errors = [];
	page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument((st, party) => {
		localStorage.setItem('magepunk_mp_token_v1', 'smoke-token'); localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party)); localStorage.setItem('magepunk_region', 'JOHTO');
	}, STATE, PARTY);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=VioletCity`, { waitUntil: 'domcontentloaded' });
	A(await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.world && window.__ow.world.current && window.__ow.battle && window.__ow.battle.data && window.__ow.portals)), 60000), 'the overworld boots in Violet City');
	const M = (f, ...a) => page.evaluate(f, ...a);
	// what holds the controls right now, and can a step be taken?
	const gates = () => M(() => { const ow = window.__ow, g = ow.gateReport(); return { blockedBy: g.blockedBy, dialog: !!(ow.dialog && ow.dialog.isOpen && ow.dialog.isOpen()) || !!(ow.dialog && ow.dialog.active), cutscene: !!ow.cutscene.blocking, battle: !!ow.battle.blocking, map: ow.world.current.map.id, at: [ow.player.tx, ow.player.ty], follower: ow.follower ? [ow.follower.tx, ow.follower.ty] : null }; });
	// press Z until nothing is left to dismiss (a battle is fought with its first move), then try to walk
	const settle = async (ms) => { const t0 = Date.now(); let g = await gates(); while (Date.now() - t0 < ms && g.blockedBy) { await page.keyboard.press('KeyZ'); await sleep(140); g = await gates(); } return g; };
	const walks = async () => { const a = (await gates()).at; for (const k of ['ArrowDown', 'ArrowUp', 'ArrowLeft', 'ArrowRight']) { await page.keyboard.down(k); await sleep(450); await page.keyboard.up(k); await sleep(200); const b = (await gates()).at; if (b[0] !== a[0] || b[1] !== a[1]) return true; } return false; };

	// ---- 1. a plain trip (no rival due: the intro is not done on this save) ----
	await M(() => { const ow = window.__ow, p = ow.portals.list[0]; ow.travelPortal(p.dests[0]); });
	A(await waitFor(async () => (await gates()).map !== 'MAP_VIOLET_CITY', 30000), 'a portal takes you to another region\'s town');
	const g1 = await settle(20000), w1 = await walks();
	A(!g1.blockedBy && w1, 'a plain trip: after the welcome line you can walk', g1);

	// ---- 2. a trip into the town where the rival is waiting ----
	const due = await M(() => { const ow = window.__ow; ow.Story.setFlag('intro_done'); const p = ow.portals.list[0], d = p.dests[0]; return { dest: d.mapId, tier: ow.rivalDue(d.mapId), here: ow.world.current.map.id }; });
	A(due.tier === 0, 'the rival is due in the town the next portal goes to', due);
	const follow = await gates();
	A(follow.follower && follow.follower[0] !== undefined, 'you have a follower (it stands on your tile after every warp, until you step)', follow);
	await M(() => { const ow = window.__ow; ow.travelPortal(ow.portals.list[0].dests[0]); });
	A(await waitFor(async () => (await gates()).map === due.dest, 30000), 'the portal takes you there');
	const sawScene = await waitFor(async () => { const g = await gates(); return g.cutscene || g.battle; }, 8000);
	A(sawScene, 'the rival\'s scene starts on arrival');
	// THE BUG: the portal's welcome line replaced the scene's first line in the text box (dialog.open drops what is
	// there, callback and all). The scene keeps the box; the welcome goes to the status line.
	await sleep(400);
	const box = await M(() => ({ text: (window.__ow.dialog.pages || []).map((pg) => (Array.isArray(pg) ? pg.join(' ') : String(pg))).join(' | '), hud: document.getElementById('hud').textContent }));
	A(/is here!/.test(box.text) && !/PORTAL/.test(box.text), 'the text box shows the rival\'s first line, not the portal\'s welcome over it', box);
	A(/You step through the PORTAL/.test(box.hud) && /Welcome to/.test(box.hud), 'the welcome is on the status line instead', box.hud);
	const g2 = await settle(120000), done = await M(() => window.__ow.Story.getFlag('rival_tier0_done'));
	A(!g2.blockedBy, 'the scene and the battle run to their end: nothing is left holding the controls', g2);
	A(done, 'the rival was fought (the scene was not lost under the portal\'s welcome line)');
	A(await walks(), 'and you can walk away', await gates());
	A(errors.length === 0, 'the page raised no error', errors.slice(0, 3));
} finally {
	if (browser) await browser.close();
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
