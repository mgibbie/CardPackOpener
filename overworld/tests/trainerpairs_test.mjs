// trainerpairs_test.mjs — a double-battle couple is ONE trainer.
//
// Playtest 2026-09-26: Route 12's Young Couple GIA & JES were beaten from Gia,
// then Jes started the same fight again and paid a second $192. Both scripts
// battle TRAINER_YOUNG_COUPLE_GIA_JES and the GBA flags defeat by that id; the
// port keyed defeat per event script. trainers.js now treats every event of one
// decomp trainer (overworld/trainer_pairs.js, 37 pairs) as one: a win marks all,
// any member's key reads the group beaten, and the VS Seeker re-arms them together.
//
//   node overworld/tests/trainerpairs_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

const puppeteer = (await import('puppeteer-core')).default;
const http = await import('http');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9135;
const STATE = { username: 'pairs', friendCode: 'PAIRS0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		for await (const _ of req) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [], rows: [], ow: null }));
	}
	fs.readFile(path.join(ROOT, u === '/' ? '/index.html' : u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		res.writeHead(200, { 'content-type': MIME[path.extname(u)] || 'application/octet-stream' });
		res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));
const sleep = ms => new Promise(r => setTimeout(r, ms));
const LEAD = { speciesId: 'lapras', name: 'LAPRAS', level: 100, gender: 'M', friend: 70, types: ['Water', 'Ice'], ability: 'waterabsorb',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 }, stats: { hp: 400, atk: 400, def: 400, spa: 400, spd: 400, spe: 400 },
	maxHP: 400, curHP: 400, exp: 1250000, moves: [{ id: 'surf', name: 'Surf', pp: 99, maxPp: 99 }], sprite: 's131.png', num: 131 };
const B = ids => Object.fromEntries(ids.map(i => [i, true]));

const GIA = 'Route12_EventScript_Gia', JES = 'Route12_EventScript_Jes', ELLIOT = 'Route12_EventScript_Elliot';

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const run = async (defeated, fn) => {
		const ctx = await browser.createBrowserContext();
		const page = await ctx.newPage();
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, lead, defeated) => {
			if (sessionStorage.getItem('seeded')) return; sessionStorage.setItem('seeded', '1');
			localStorage.setItem('magepunk_mp_token_v1', 'pairs-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([lead]));
			localStorage.setItem('magepunk_badges_v1', JSON.stringify({ badges: { KANTO: { boulder: true, cascade: true, thunder: true, rainbow: true } }, champion: {} }));
			localStorage.setItem('magepunk_money', '1000');
			localStorage.setItem('magepunk_defeated_v1', JSON.stringify(defeated));
			localStorage.setItem('magepunk_repel_v1', '99999');
		}, STATE, LEAD, defeated);
		const boot = async () => {
			await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route12&x=21&y=64`, { waitUntil: 'domcontentloaded' });
			for (let i = 0; i < 200 && !(await page.evaluate(() => !!(window.__ow?.world?.current?.layout && window.__ow.battle?.data && window.__ow.trainers.list.length)).catch(() => false)); i++) await sleep(200);
			await sleep(1500);
		};
		// walk-up talk through interact(): stand on the open side of the NPC, face it,
		// press A, then play out whatever follows (battle, dialog) to the end
		const talk = script => page.evaluate(async script => {
			const W = window.__ow, p = W.player, w = W.world;
			const t = W.trainers.list.find(o => o.ev.script === script);
			if (!t) return { error: 'no ' + script };
			const sides = [[1, 0, 'left'], [-1, 0, 'right'], [0, 1, 'up'], [0, -1, 'down']];
			const side = sides.find(([dx, dy]) => w.isPassable(t.tx + dx, t.ty + dy) && !W.trainers.list.some(o => o.tx === t.tx + dx && o.ty === t.ty + dy));
			[p.tx, p.ty] = [t.tx + side[0], t.ty + side[1]]; p.facing = side[2]; p.px = p.tx * 16; p.py = p.ty * 16; p.moving = false;
			const money0 = W.Bag.getMoney();
			W.interact();
			let battled = false;
			for (let i = 0; i < 600; i++) {
				await new Promise(r => setTimeout(r, 50));
				if (W.battle.blocking) { battled = true; W.battle.key('z'); continue; }
				if (W.dialog.blocking) { W.dialog.revealed = 1e9; W.dialog.key('z'); continue; }
				if (W.cutscene.blocking || W.trainers.engagement) continue;
				if (i > 20) break;
			}
			return { battled, paid: W.Bag.getMoney() - money0 };
		}, script);
		const state = () => page.evaluate(() => {
			const T = window.__ow.trainers, by = s => T.list.find(o => o.ev.script === s);
			return { gia: T.isDefeated(by('Route12_EventScript_Gia')), jes: T.isDefeated(by('Route12_EventScript_Jes')),
				elliot: T.isDefeated(by('Route12_EventScript_Elliot')), saved: JSON.parse(localStorage.getItem('magepunk_defeated_v1') || '[]').filter(k => /Gia|Jes/.test(k)).sort() };
		});
		try { await boot(); await fn({ page, boot, talk, state, errors }); } finally { await ctx.close(); }
	};

	// 1 + 2: win from either partner — the other is beaten too, no second fight or payout
	for (const [first, other, who] of [[GIA, JES, 'GIA'], [JES, GIA, 'JES']]) {
		await run([], async t => {
			const s0 = await t.state();
			A(!s0.gia && !s0.jes, `[from ${who}] setup: the couple is unbeaten`);
			const win = await t.talk(first);
			A(win.battled && win.paid > 0, `[from ${who}] talking to ${who} starts the couple's battle, and winning pays`, JSON.stringify(win));
			const s1 = await t.state();
			A(s1.gia && s1.jes, `[from ${who}] the one win marks BOTH partners beaten`, JSON.stringify(s1));
			A(!s1.elliot, `[from ${who}] an unrelated Route 12 trainer is untouched`, JSON.stringify(s1));
			const again = await t.talk(other);
			A(!again.battled && again.paid === 0, `[from ${who}] the partner does not start the same fight or pay again`, JSON.stringify(again));
			await t.boot();
			const s2 = await t.state();
			A(s2.gia && s2.jes, `[from ${who}] the pair stays beaten after a reload`, JSON.stringify(s2));
			A(t.errors.length === 0, `[from ${who}] no uncaught page error`, JSON.stringify(t.errors.slice(0, 2)));
		});
	}

	// existing saves: only the partner it was fought from is recorded (the reporter's
	// state before the duplicate) — the other must read beaten, with no save edit
	await run(['MAP_ROUTE12:' + GIA], async t => {
		const s = await t.state();
		A(s.gia && s.jes, 'a save holding only GIA\'s key reads the pair as beaten', JSON.stringify(s));
		const r = await t.talk(JES);
		A(!r.battled && r.paid === 0, '...so JES starts no unearned duplicate fight', JSON.stringify(r));
		// VS Seeker: the couple re-arms as ONE encounter, and the rematch pays once
		const n = await t.page.evaluate(() => window.__ow.trainers.rearmMap(3));
		const s1 = await t.state();
		A(n >= 1 && !s1.gia && !s1.jes, 'a VS Seeker re-arm clears the pair together', JSON.stringify({ n, s1 }));
		const re = await t.talk(JES);
		A(re.battled && re.paid > 0, 'the rematch fights and pays', JSON.stringify(re));
		const s2 = await t.state();
		A(s2.gia && s2.jes, '...and beats both partners again', JSON.stringify(s2));
		const dup = await t.talk(GIA);
		A(!dup.battled && dup.paid === 0, '...with no second payout from the other partner', JSON.stringify(dup));
	});
} catch (e) {
	A(false, 'harness crashed: ' + e.message, String(e.stack).split('\n').slice(1, 4).join(' <- '));
} finally {
	if (browser) await browser.close();
	server.close();
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
