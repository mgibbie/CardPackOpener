// sfx_test.mjs — the little sounds (menu + field SFX layer).
//
// The game shipped with five battle SFX and nothing else. Now: menus tick,
// confirm and cancel; dialog advances blip; walls thud; ledges chirp; warps
// whoosh; the nurse chimes; the PC boots; the register rings; refusals buzz;
// item finds and prizes jingle; stat arrows chirp up or down; faints thump;
// escapes zip. All synthesized in the GB square-wave idiom by
// tools/gen_sfx.mjs (the originals ARE chip sequences), all riding the SFX
// volume slider through the existing play() path.
//
// The live half spies on the Audio constructor: play() builds one base
// element per URL, so every distinct sound's first firing hits the spy.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/sfx_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const ALL = ['ui_move', 'ui_select', 'ui_cancel', 'ui_denied', 'ui_open', 'text_tick',
	'bump', 'ledge', 'door', 'pc_on', 'notice', 'heal', 'money', 'item_get', 'levelup',
	'stat_up', 'stat_dn', 'faint', 'flee'];

// ---------- the rendered set ----------
{
	const dir = path.join(ROOT, 'overworld/data/sounds/sfx');
	for (const n of ALL) {
		const f = path.join(dir, n + '.ogg');
		A(fs.existsSync(f) && fs.statSync(f).size > 2000, `${n}.ogg is rendered`);
	}
}

// ---------- the quieter wirings, in source ----------
{
	const eng = fs.readFileSync(path.join(ROOT, 'overworld/engine.js'), 'utf8');
	A(/this\.onBump\?\.\(nx, ny\); return; \}   \/\/ walls thud too/.test(eng) && /this\.onHop\?\.\(\);/.test(eng),
		'the engine reports wall bumps and ledge hops');
	const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/player\.onHop = \(\) => sfx\('ledge'\)/.test(main) && /bumpCooldown = now \+ 350/.test(main),
		'main plays them (bump throttled against held keys)');
	A(/sfx\('heal'\); healParty\(party\)/.test(main) && /sfx\('pc_on'\)/.test(main) && /sfx\('notice'\)/.test(main),
		'nurse chime, PC boot and trainer-notice are wired');
	const bt = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
	A((bt.match(/sfx\('flee'\); this\.finish\('escaped'\)/g) || []).length >= 3,
		'every escape route zips out');
	A(/sfx\('levelup'\)/.test(bt) && /sfx\(d > 0 \? 'stat_up' : 'stat_dn'\)/.test(bt) && /sfx\('faint'\)/.test(bt),
		'level-ups, stat arrows and faints sound off');
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
	const PORT = 8956;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 120, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 120, curHP: 120,
		exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
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
			localStorage.setItem('magepunk_money', '1500');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			// spy on the Audio constructor: play() builds one base element per URL
			window.__sfxLog = [];
			const RealAudio = window.Audio;
			window.Audio = function (u) { if (u) window.__sfxLog.push(String(u)); return new RealAudio(u); };
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		const played = await page.evaluate(async () => {
			const ow = window.__ow;
			const key = k => dispatchEvent(new KeyboardEvent('keydown', { key: k }));
			const wait = ms => new Promise(r => setTimeout(r, ms));
			// menus: open, tick, cancel
			key('Enter'); await wait(60);
			key('ArrowDown'); await wait(60);
			key('x'); await wait(60);
			// dialog advance blips
			ow.dialog.open('One line of text.');
			key('z'); await wait(60); key('z'); await wait(60);
			if (ow.dialog.blocking) ow.dialog.key('x');
			// a warp whooshes
			await ow.warpTo('MAP_GOLDENROD_GAME_CORNER', 0);
			// a wall bump: the corner interior is enclosed — shoving left and up
			// from the doorway hits furniture or wall within a few tiles
			for (const d of ['left', 'up', 'left']) await ow.pumpPlayer(d, false, 600);
			// the register rings once, then the wallet runs dry ($1,500 seeded)
			ow.Bag.addItem('coincase');
			ow.gcMenu.open = true; ow.gcMenu.mode = 'coins'; ow.gcMenu.idx = 0;
			ow.gcKey('z'); ow.gcKey('z');
			// a prize jingles
			ow.Bag.addCoins(400);
			ow.gcMenu.mode = 'prizes'; ow.gcMenu.idx = 0;
			ow.gcKey('z');
			ow.gcMenu.open = false;
			// battle: menu beeps, a stat chirp, a faint thump
			const b = ow.battle;
			const done = new Promise(res => b.start(ow.party, 'sentret', 5, r => res(r)));
			for (let i = 0; i < 300; i++) { const a = b.active; if (a && (a.phase === 'choose' || a.phase === 'menu')) break; await wait(60); }
			const a = b.active;
			key('ArrowDown'); await wait(60);
			b.startQueue(() => b.useMove(a.me, a.meBoosts, a.me, a.meBoosts, { id: 'swordsdance', name: 'Swords Dance', pp: 20 }, false, {}));
			await new Promise(res => { const t = setInterval(() => { if (a.queue.length === 0 && !a.fx) { clearInterval(t); res(); } }, 80); });
			b.startQueue(() => { a.foe.curHP = 0; b.checkFaints(); });
			for (let i = 0; i < 300 && b.active; i++) await wait(60);
			await done.catch(() => {});
			return [...new Set(window.__sfxLog.filter(u => u.includes('/sfx/')).map(u => u.split('/').pop().replace('.ogg', '')))];
		});
		const has = n => played.includes(n);
		A(has('ui_open') && has('ui_move') && has('ui_cancel'), 'menus open, tick and cancel audibly', JSON.stringify(played));
		A(has('text_tick'), 'dialog advances blip', JSON.stringify(played));
		A(has('bump'), 'walking into a wall thuds', JSON.stringify(played));
		A(has('door'), 'a warp whooshes', JSON.stringify(played));
		A(has('money') && has('ui_denied'), 'the register rings and the empty wallet buzzes', JSON.stringify(played));
		A(has('item_get'), 'a prize jingles', JSON.stringify(played));
		A(has('ui_select') || has('ui_move'), 'battle menus beep', JSON.stringify(played));
		A(has('stat_up'), 'SWORDS DANCE chirps the arrows up', JSON.stringify(played));
		A(has('faint'), 'the faint thumps', JSON.stringify(played));

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
