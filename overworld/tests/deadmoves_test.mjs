// deadmoves_test.mjs — the 2026-08-26 audit found 23 damaging moves shipped
// with power:0 and no handler, so they all printed "But nothing happened!".
// This drives the real battle engine in headless Chrome (boot_smoke server
// pattern) and asserts every family now deals damage with the right shape:
// fixed-half, user-HP sacrifice, weight tiers, damage-memory retaliation
// (Counter/Mirror Coat/Metal Burst), Bide's charge+release, held-item moves,
// Present's gift branch — plus the doubles switch guard and the AI's new
// estimated-power pick for dynamic moves.
//
// Standalone (needs headless Chrome/Edge + local overworld/data assets);
// NOT in run-all.mjs:  node overworld/tests/deadmoves_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 8877;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) {
		try { if (await fn()) return true; } catch {}
		await new Promise(r => setTimeout(r, 150));
	}
	return false;
}

(async () => {
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			for await (const _ of req) { /* drain */ }
			res.writeHead(200, { 'content-type': 'application/json' });
			res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null }));
			return;
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push('pageerr: ' + e.message));
		// a minimal saved party so boot's loadParty() returns non-null; the real
		// test mons are built in-page with buildMon once battle data is loaded
		const seedMon = {
			speciesId: 'rattata', name: 'RATTATA', level: 5, gender: 'M', friend: 70,
			types: ['Normal'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
			stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, maxHP: 20, curHP: 20,
			exp: 125, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
		};
		await page.evaluateOnNewDocument((st, mon) => {
			try {
				localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				localStorage.setItem('magepunk_party_v1', JSON.stringify([mon]));
			} catch {}
		}, STATE, seedMon);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });

		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world?.current?.layout && window.__ow.party)), 30000);
		A(ready, 'overworld booted with battle data + party loaded');
		if (!ready) throw new Error('boot failed');

		// seed a known party and start a wild battle vs pikachu (6kg)
		await page.evaluate(async () => {
			const B = await import('/overworld/battle.js');
			const data = window.__ow.battle.data;
			const p = window.__ow.party;
			p.length = 0;
			p.push(B.buildMon('snorlax', 50, data), B.buildMon('machop', 40, data), B.buildMon('rattata', 20, data));
			window.__ow.startWildBattle({ id: 'pikachu', level: 20 });
		});
		await new Promise(r => setTimeout(r, 800));
		for (let i = 0; i < 40; i++) {
			if ((await page.evaluate(() => window.__ow.battle.active?.phase)) === 'menu') break;
			await page.keyboard.press('z');
			await new Promise(r => setTimeout(r, 200));
		}
		A((await page.evaluate(() => window.__ow.battle.active?.phase)) === 'menu', 'wild battle reached the menu');

		const out = await page.evaluate(() => {
			const b = window.__ow.battle, a = b.active;
			const drain = () => { let g = 800; while (a.queue.length && g--) { const q = a.queue.shift(); q.fn?.(); q.anim?.done?.(); } };
			const mk = id => ({ id, name: id, pp: 30, maxPp: 30 });
			const me = a.me, foe = a.foe;
			const use = (mid, byFoe) => { // returns the target's HP delta (damage > 0)
				const before = byFoe ? me.curHP : foe.curHP;
				if (byFoe) b.useMove(foe, a.foeBoosts, me, a.meBoosts, mk(mid), true);
				else b.useMove(me, a.meBoosts, foe, a.foeBoosts, mk(mid), false);
				drain();
				return before - (byFoe ? me.curHP : foe.curHP);
			};
			// abilities off: random ones (Lightning Rod, Static) would absorb hits
			// or paralyze mid-sequence and break determinism
			const heal = () => { foe.curHP = foe.maxHP = 100000; me.curHP = me.maxHP = 50000; me.status = null; foe.status = null; me.ability = null; foe.ability = null; delete me.lastTaken; delete foe.lastTaken; delete me.bideDmg; };
			const out = {};
			drain();
			const origRandom = Math.random;
			Math.random = () => 0; // always hit, deterministic rolls

			// fixed 'half' pair
			heal(); foe.curHP = 400;
			use('naturesmadness'); out.naturesMadness = foe.curHP === 200;
			use('ruination'); out.ruination = foe.curHP === 100;

			// target-HP scaling: full HP hits ~10x harder than 10% HP
			heal(); const wFull = use('wringout');
			foe.curHP = 10000; const wLow = use('wringout');
			out.wringout = wFull > 0 && wLow > 0 && wLow < wFull;
			heal(); out.crushgrip = use('crushgrip') > 0;
			heal(); out.hardpress = use('hardpress') > 0;

			// weights parsed into species data; fakemon default 50
			out.weights = b.weightOf({ speciesId: 'snorlax' }) === 460
				&& b.weightOf({ speciesId: 'gastly' }) === 0.1
				&& b.weightOf({ speciesId: 'not_a_mon' }) === 50;
			heal(); out.lowkick = use('lowkick') > 0;
			heal(); out.grassknot = use('grassknot') > 0;
			heal(); out.heavyslam = use('heavyslam') > 0;   // snorlax 460kg vs pikachu 6kg
			heal(); out.heatcrash = use('heatcrash') > 0;

			heal(); out.magnitude = use('magnitude') > 0;   // random=0 => Magnitude 4
			heal(); out.beatup = use('beatup') > 0;
			heal(); out.trumpcard = use('trumpcard') > 0;
			heal(); out.veeveevolley = use('veeveevolley') > 0;
			heal(); out.pikapapow = use('pikapapow') > 0;

			// Final Gambit: damage = user's HP, user faints
			heal(); me.curHP = 333;
			out.finalGambit = use('finalgambit') === 333 && me.curHP === 0;

			// Counter fails cold, then pays back exactly 2x the physical hit
			heal(); out.counterCold = use('counter') === 0;
			const d1 = use('tackle', true);
			out.counter = d1 > 0 && use('counter') === d1 * 2;
			// Mirror Coat ignores that physical memory, then doubles a special hit
			out.mirrorCold = use('mirrorcoat') === 0;
			const d2 = use('thundershock', true);
			me.status = null; // its 10% paralysis secondary always procs at random=0
			out.mirrorcoat = d2 > 0 && use('mirrorcoat') === d2 * 2;
			// Metal Burst: either category, 1.5x
			out.metalburst = use('metalburst') === Math.floor(d2 * 1.5);

			// Bide: charge turn deals nothing, release deals 2x what was taken
			heal();
			out.bideCharge = use('bide') === 0 && me.chargeMove === 'bide';
			const d3 = use('tackle', true);
			out.bide = d3 > 0 && use('bide') === d3 * 2 && me.bideDmg === undefined;

			// held-item moves: fail empty-handed, consume the item when thrown
			heal(); me.heldItem = null;
			out.flingEmpty = use('fling') === 0;
			me.heldItem = 'oranberry';
			out.fling = use('fling') > 0 && me.heldItem === null;
			me.heldItem = null;
			out.giftEmpty = use('naturalgift') === 0;
			me.heldItem = 'sitrusberry';
			out.naturalgift = use('naturalgift') > 0 && me.heldItem === null;

			// Present: random=0 lands the 20% gift branch (heals the target)
			heal(); foe.curHP = 1000;
			use('present');
			out.presentGift = foe.curHP === 1000 + Math.floor(foe.maxHP / 4);
			Math.random = () => 0.5;
			out.presentBomb = use('present') > 0;
			Math.random = () => 0;

			// switch guard: an on-field mon (lead or ally) can never be switched in
			heal();
			a.meAlly = a.party[1];
			b.switchTo(a.me); drain();
			b.switchTo(a.meAlly); drain();
			out.switchGuard = a.me === me && a.me !== a.meAlly;
			a.meAlly = null;

			// trainer AI now weighs dynamic-power moves (old code random-picked)
			a.isTrainer = true;
			foe.moves = [mk('lowkick'), mk('splash')];
			Math.random = () => 0.5; // skips the 15% random branch; old code => splash
			out.aiPick = b.chooseFoeMove().id === 'lowkick';
			a.isTrainer = false;

			Math.random = origRandom;
			return out;
		});

		A(out.naturesMadness, "Nature's Madness halves the target");
		A(out.ruination, 'Ruination halves the target');
		A(out.wringout, 'Wring Out scales with target HP', JSON.stringify(out));
		A(out.crushgrip, 'Crush Grip deals damage');
		A(out.hardpress, 'Hard Press deals damage');
		A(out.weights, 'weightkg parsed (snorlax 460 / gastly 0.1 / fakemon 50)');
		A(out.lowkick, 'Low Kick deals damage');
		A(out.grassknot, 'Grass Knot deals damage');
		A(out.heavyslam, 'Heavy Slam deals damage');
		A(out.heatcrash, 'Heat Crash deals damage');
		A(out.magnitude, 'Magnitude deals damage');
		A(out.beatup, 'Beat Up deals damage');
		A(out.trumpcard, 'Trump Card deals damage');
		A(out.veeveevolley, 'Veevee Volley deals damage');
		A(out.pikapapow, 'Pika Papow deals damage');
		A(out.finalGambit, 'Final Gambit deals user-HP damage and faints the user');
		A(out.counterCold, 'Counter fails with no hit taken');
		A(out.counter, 'Counter pays back 2x the physical hit');
		A(out.mirrorCold, 'Mirror Coat ignores physical memory');
		A(out.mirrorcoat, 'Mirror Coat pays back 2x the special hit');
		A(out.metalburst, 'Metal Burst pays back 1.5x');
		A(out.bideCharge, 'Bide charges without dealing damage');
		A(out.bide, 'Bide releases 2x the damage taken');
		A(out.flingEmpty, 'Fling fails empty-handed');
		A(out.fling, 'Fling deals damage and consumes the item');
		A(out.giftEmpty, 'Natural Gift fails without a berry');
		A(out.naturalgift, 'Natural Gift deals damage and eats the berry');
		A(out.presentGift, 'Present gift branch heals the target');
		A(out.presentBomb, 'Present bomb branch deals damage');
		A(out.switchGuard, 'switchTo refuses on-field mons (doubles ally guard)');
		A(out.aiPick, 'trainer AI picks a dynamic-power move via estimates');

		const fatal = errors.filter(e => !/Failed to load resource/i.test(e));
		A(fatal.length === 0, 'no uncaught client errors', fatal.slice(0, 4).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
		console.error(e);
	} finally {
		if (browser) await browser.close();
		server.close();
	}

	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
