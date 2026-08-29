// brains_test.mjs — batch A (battle brains): status-move scoring, boss
// move-choice discipline, matchup scoring, counter-switching, the boss potion,
// and best-matchup replacements. Boots the real game headless (depth_test
// pattern) and calls the Battle methods on a fabricated `active`.
//   node overworld/tests/brains_test.mjs
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
const PORT = 8876;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const seedMon = {
	speciesId: 'rattata', name: 'RATTATA', level: 5, gender: 'M', friend: 70,
	types: ['Normal'], ivs: { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 },
	stats: { hp: 20, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 }, maxHP: 20, curHP: 20,
	exp: 125, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
};

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
			for await (const _ of req) {}
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
		await page.evaluateOnNewDocument((st, mon) => {
			try {
				localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
				localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
				localStorage.setItem('magepunk_party_v1', JSON.stringify([mon]));
			} catch {}
		}, STATE, seedMon);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.trainers?.data)), 30000);
		A(ready, 'boot: battle data loaded');
		if (!ready) throw new Error('boot failed');

		const out = await page.evaluate(async () => {
			const B = await import('/overworld/battle.js');
			const ow = window.__ow, bt = ow.battle;
			const out = {};
			const mv = ids => ids.map(id => ({ id, name: id, pp: 10, maxPp: 10 }));
			const mk = (sp, lv, moves) => {
				const m = B.buildMon(sp, lv, bt.data);
				if (moves) m.moves = mv(moves);
				m.ability = null; // no ability surprises in scoring paths
				return m;
			};
			const zeros = () => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 });
			const mkActive = (me, foe, foes, extra = {}) => ({
				me, foe, foes: foes || [foe], party: [me], queue: [],
				isTrainer: true, info: { displayName: 'BOSS', defeatText: 'x', money: 1, boss: true },
				meBoosts: zeros(), foeBoosts: zeros(),
				meHazards: {}, foeHazards: {},
				meScreens: { reflect: 0, light: 0 }, foeScreens: { reflect: 0, light: 0 },
				meSide: {}, foeSide: {}, fieldFx: { trickRoom: 0 }, lastMove: {},
				turnCount: 0, ...extra,
			});
			const saved = bt.active;
			const attempt = (k, fn) => { try { fn(); } catch (e) { out['err_' + k] = String(e.stack || e).slice(0, 300); } };

			// ---- statusMoveValue heuristics ----
			attempt('statusMoveValue', () => {
				const me = mk('pikachu', 20), foe = mk('geodude', 20, ['stealthrock', 'thunderwave', 'recover', 'swordsdance']);
				bt.active = mkActive(me, foe);
				const val = id => bt.statusMoveValue({ id });
				out.hazardEarly = val('stealthrock') > 80;
				bt.active.meHazards.stealthrock = 1;
				out.hazardLaid = val('stealthrock') === 0;
				out.statusHealthy = val('thunderwave') > 60;
				me.status = 'par';
				out.statusTwice = val('thunderwave') === 0;
				me.status = null;
				out.healFull = val('recover') === 0;
				foe.curHP = Math.floor(foe.maxHP * 0.3);
				out.healLow = val('recover') > 80;
				foe.curHP = foe.maxHP;
				out.setupEarly = val('swordsdance') > 60;
				bt.active.foeBoosts.atk = 2;
				out.setupDone = val('swordsdance') === 0;
			})

			// ---- boss picks the scored status line; route trainers value it less ----
			attempt('boss', () => {
				// vs a healthy target: thunderwave (85) beats a weak neutral hit (60);
				// a route trainer's 0.6x scaling (51) prefers the damage
				const me = mk('rattata', 20), foe = mk('pikachu', 20, ['thunderwave', 'aurorabeam']);
				const R = Math.random; Math.random = () => 0.99; // no wobble for the route trainer
				bt.active = mkActive(me, foe);
				out.bossStatus = bt.chooseFoeMove().id === 'thunderwave';
				bt.active.info.boss = false;
				out.routeDamage = bt.chooseFoeMove().id === 'aurorabeam';
				Math.random = R;
			})

			// ---- matchup scoring + counter-switch ----
			attempt('matchup', () => {
				// charmander is hard-countered by squirtle; bulbasaur on the bench
				// resists water and hits back super-effectively
				const me = mk('squirtle', 20, ['watergun', 'tackle']);
				const foeFire = mk('charmander', 20, ['ember']); // fire-only: truly hard-countered
				const benchGrass = mk('bulbasaur', 20, ['vinewhip', 'tackle']);
				bt.active = mkActive(me, foeFire, [foeFire, benchGrass]);
				out.matchupOrders = bt.matchupScore(benchGrass, me) > bt.matchupScore(foeFire, me);
				out.switchPicksGrass = bt.shouldFoeSwitch() === 1;
				bt.active.foeSwitchCd = 2;
				out.switchCooldown = bt.shouldFoeSwitch() === -1;
				bt.active.foeSwitchCd = 0;
				bt.active.info.boss = false;
				out.switchBossOnly = bt.shouldFoeSwitch() === -1;
				bt.active.info.boss = true;
				benchGrass.curHP = 0;
				out.switchNeedsBench = bt.shouldFoeSwitch() === -1;
			})

			// ---- boss potion: fires once at low HP, in place of the move ----
			attempt('boss', () => {
				const me = mk('rattata', 10, ['tackle']);
				const foe = mk('onix', 12, ['tackle']);
				foe.curHP = Math.floor(foe.maxHP * 0.2);
				const a = mkActive(me, foe);
				bt.active = a;
				bt.resolveTurn(me.moves[0]);
				let guard = 0;
				while (a.queue.length && guard++ < 300) {
					const e = a.queue.shift();
					e.fn?.();
					e.anim?.done?.();
				}
				out.potionUsed = a.foePotionUsed === true;
				out.potionHealed = foe.curHP > Math.floor(foe.maxHP * 0.2);
				// second time around it never fires again
				foe.curHP = Math.floor(foe.maxHP * 0.2) || 1;
				bt.resolveTurn(me.moves[0]);
				out.potionOnce = a.foePotionUsed === true && foe.curHP <= Math.floor(foe.maxHP * 0.25);
			})

			bt.active = saved || null;
			return out;
		});

		for (const k of Object.keys(out)) if (k.startsWith('err_')) console.log('ERR', k, out[k]);
		A(out.hazardEarly, 'hazards score high early');
		A(out.hazardLaid, 'laid hazards are never re-laid');
		A(out.statusHealthy, 'status on a healthy target scores high');
		A(out.statusTwice, 'a statused target is never re-statused');
		A(out.healFull, 'healing at full HP scores zero');
		A(out.healLow, 'healing under half scores high');
		A(out.setupEarly, 'setup scores high early and healthy');
		A(out.setupDone, 'setup stops at +2');
		A(out.bossStatus, 'a boss picks the right status move on purpose');
		A(out.routeDamage, 'a route trainer prefers the damage line');
		A(out.matchupOrders, 'matchupScore ranks the counter above the countered');
		A(out.switchPicksGrass, 'a hard-countered boss switches to the answer');
		A(out.switchCooldown, 'the switch cooldown holds');
		A(out.switchBossOnly, 'route trainers never counter-switch');
		A(out.switchNeedsBench, 'no switch without a living better answer');
		A(out.potionUsed, 'the boss potion fires at low HP');
		A(out.potionHealed, 'the potion actually healed');
		A(out.potionOnce, 'the potion is once per battle');
		A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
	} catch (e) {
		A(false, 'harness crashed: ' + e.message);
	} finally {
		if (browser) await browser.close().catch(() => {});
		server.close();
	}
	console.log(`\n${pass} passed, ${fail} failed`);
	process.exit(fail ? 1 : 0);
})();
