// helditems_test.mjs — the last four held items that were pure decoration.
//
// AMULET COIN, SMOKE BALL, FOCUS BAND and SOOTHE BELL each shipped with a
// `held` payload in bag.js that NOTHING in the engine read: moneyBoost,
// fleeAlways, focusBand and friendBoost appeared exactly once each, in their
// own definition. You could buy them, hold them, and nothing happened.
//
// Each assertion below is paired: the item OFF then ON, through the real
// battle engine, so "it works" can't be an accident of the setup.
//
// Standalone (needs headless Chrome/Edge + local overworld/data assets):
//   node overworld/tests/helditems_test.mjs
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
const PORT = 8896;

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (speciesId, name, sprite, num) => ({
	speciesId, name, level: 10, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 40, atk: 25, def: 25, spa: 25, spd: 25, spe: 25 }, maxHP: 40, curHP: 40,
	exp: 1000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite, num,
});
const PARTY = [mon('rattata', 'LEAD', 's608.png', 19), mon('pidgey', 'BENCH', 's16.png', 16)];

async function waitFor(fn, ms) {
	const t0 = Date.now();
	while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch {} await new Promise(r => setTimeout(r, 150)); }
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
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
			localStorage.setItem('magepunk_region', 'KANTO');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=PalletTown`, { waitUntil: 'domcontentloaded' });
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data && window.__ow.party?.length >= 2)), 30000);
		A(ready, 'boot with a party');
		if (!ready) throw new Error('boot failed');

		// every payload the engine is now expected to read
		const payloads = await page.evaluate(() => {
			const I = window.__ow.Bag.ITEMS;
			return {
				coin: I.amuletcoin?.held?.moneyBoost,
				smoke: I.smokeball?.held?.fleeAlways,
				band: I.focusband?.held?.focusBand,
				bell: I.soothebell?.held?.friendBoost,
			};
		});
		A(payloads.coin === 2 && payloads.smoke === true && payloads.band === true && payloads.bell === 2,
			'all four items carry the payload the engine looks for', JSON.stringify(payloads));

		// A working effect on an item nobody can obtain is still inert. Three of
		// the four appeared NOWHERE outside their own bag.js definition — no mart,
		// no ground item, no reward. Only the SMOKE BALL was reachable, on a
		// traded DODRIO.
		const sold = await page.evaluate(() => {
			const S = window.__ow.Bag.SHOP_STOCK;
			return { band: S.includes('focusband'), bell: S.includes('soothebell'), smoke: S.includes('smokeball'),
				coin: S.includes('amuletcoin'), coinPrice: window.__ow.Bag.ITEMS.amuletcoin.price };
		});
		A(sold.band && sold.bell && sold.smoke,
			'FOCUS BAND, SOOTHE BELL and SMOKE BALL are stocked in marts', JSON.stringify(sold));
		A(!sold.coin && sold.coinPrice === 0,
			'the AMULET COIN stays out of shops — price 0 is this bag\'s "not for sale" marker',
			JSON.stringify(sold));

		// ...so its route in is the first cross-region tier reward. Granted early
		// on purpose: an item that doubles prize money is worth nothing late.
		const coinGrant = await page.evaluate(() => {
			const ow = window.__ow;
			ow.Story.clearFlag('tier_reward_1');   // setFlag only ever sets true
			const before = ow.Bag.getBag().amuletcoin || 0;
			const label = ow.grantTierReward(1);
			return { before, after: ow.Bag.getBag().amuletcoin || 0, label };
		});
		A(coinGrant.after === coinGrant.before + 1,
			'clearing the first tier hands you an AMULET COIN', JSON.stringify(coinGrant));
		A(/AMULET COIN/.test(coinGrant.label || ''),
			'and the reward text says so', String(coinGrant.label));

		// shared helpers: a wild battle, driven to a known state
		await page.evaluate(() => {
			const ow = window.__ow;
			window.__wild = async (heldItem, hp) => {
				const b = ow.battle, party = ow.party;
				party[0].heldItem = heldItem || null;
				party[1].heldItem = null;
				for (const m of party) { m.level = 10; m.exp = 1000; m.curHP = m.maxHP; m.friend = 70; }
				let result = null;
				b.start(party, 'pikachu', 5, r => { result = r; });
				const t0 = Date.now();
				while (!b.active && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));
				if (hp != null) b.active.me.curHP = hp;
				return () => result;
			};
			window.__pump = (n = 400) => {
				const b = ow.battle;
				for (let i = 0; i < n && b.active && b.active.phase !== 'done'; i++) {
					const x = b.active;
					x.foeShownHP = x.foe.curHP; x.meShownHP = x.me.curHP; x.msgT = 99;
					b.update(0.05);
				}
			};
			// force the engine's RNG to a fixed value for the whole call
			window.__withRandom = async (v, fn) => {
				const real = Math.random;
				Math.random = () => v;
				try { return await fn(); } finally { Math.random = real; }
			};
		});

		// ---------- FOCUS BAND: a 1-in-10 reprieve from a lethal hit ----------
		// The roll is forced both ways so this cannot pass on luck.
		// the foe is given a plain physical move and overwhelming Attack, so the
		// hit is certainly lethal and only the band's roll decides the outcome
		await page.evaluate(() => {
			window.__lethalHit = async (roll) => {
				await window.__wild('focusband', 4);
				const b = window.__ow.battle, a = b.active;
				a.foe.moves = [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }];
				a.foe.stats.atk = 999;
				return window.__withRandom(roll, () => {
					b.useMove(a.foe, a.foeBoosts, a.me, a.meBoosts, a.foe.moves[0], true);
					window.__pump();
					const out = { hp: a.me.curHP, stillHeld: a.me.heldItem };
					b.active = null;
					return out;
				});
			};
		});
		const bandOff = await page.evaluate(() => window.__lethalHit(0.9));   // 0.9 >= 0.1 -> no save
		A(bandOff.hp === 0, 'FOCUS BAND does nothing on a failed roll — the hit still KOs', JSON.stringify(bandOff));

		const bandOn = await page.evaluate(() => window.__lethalHit(0.05));   // 0.05 < 0.1 -> saved
		A(bandOn.hp === 1, 'on a winning roll the holder hangs on at 1 HP', JSON.stringify(bandOn));
		A(bandOn.stillHeld === 'focusband',
			'and the band is NOT consumed — that is what separates it from a Focus Sash',
			JSON.stringify(bandOn));

		// ---------- SMOKE BALL: always escape a wild battle ----------
		// The holder is deliberately slower than the foe, so speed alone never wins.
		const flee = await page.evaluate(async () => {
			const out = {};
			for (const [key, item] of [['without', null], ['with', 'smokeball']]) {
				await window.__wild(item, null);
				const b = window.__ow.battle, a = b.active;
				a.me.stats.spe = 1; a.foe.stats.spe = 255; a.runAttempts = 0;
				// RATTATA's own ability is Run Away, which grants the same
				// guaranteed escape — leaving it on made the control "escape"
				// too and hid whether the item did anything.
				a.me.ability = null;
				await window.__withRandom(0.99, () => { b.tryRun(); window.__pump(); });
				// finish() only records the outcome on the battle — onEnd fires
				// later, after the fade — so a.result is what says it got away
				out[key] = { escaped: a.result === 'escaped', held: !!b.itemFx(a.me)?.fleeAlways, spe: a.me.stats.spe };
				b.active = null;
			}
			return out;
		});
		A(flee.without.escaped === false,
			'a slow POKeMON fails to flee on a bad roll', JSON.stringify(flee.without));
		A(flee.with.escaped === true && flee.with.held,
			'SMOKE BALL escapes anyway — same speed, same roll', JSON.stringify(flee.with));

		// ---------- AMULET COIN: doubles the prize actually paid out ----------
		const coin = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const run = async (item) => {
				const party = ow.party.map(m => ({ ...m, heldItem: item || null, curHP: m.maxHP }));
				const foe = [{ ...ow.party[0], name: 'FOE', heldItem: null }];
				const info = { displayName: 'YOUNGSTER', defeatText: 'argh', money: 100 };
				b.startTrainer(party, foe, info, () => {});
				const t0 = Date.now();
				while (!b.active && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 100));
				const shown = b.prizeMoney();
				const twice = b.prizeMoney();   // both victory paths call it
				b.active = null;
				return { shown, twice, credited: info.money };
			};
			return { off: await run(null), on: await run('amuletcoin') };
		});
		A(coin.off.shown === 100, 'a trainer pays its listed prize without the coin', JSON.stringify(coin.off));
		A(coin.on.shown === 200, 'AMULET COIN doubles it', JSON.stringify(coin.on));
		A(coin.on.credited === 200,
			'and doubles the info object the overworld actually banks — not just the message',
			JSON.stringify(coin.on));
		A(coin.on.twice === 200,
			'asking twice does not pay four times (singles and doubles both ask)', String(coin.on.twice));

		// ---------- SOOTHE BELL: friendship gains multiply ----------
		const bell = await page.evaluate(async () => {
			const ow = window.__ow, b = ow.battle;
			const run = async (item) => {
				await window.__wild(item, null);
				const m = b.active.me;
				m.friend = 70;
				b.awardExp(m, 5);     // small, so no level-up rider
				window.__pump();
				const out = m.friend;
				b.active = null;
				return out;
			};
			return { off: await run(null), on: await run('soothebell') };
		});
		A(bell.off === 72, 'friendship normally grows by 2 for a win', String(bell.off));
		A(bell.on === 74, 'SOOTHE BELL doubles that gain', String(bell.on));

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
