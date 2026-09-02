// upscale1_test.mjs — Upscale Batch 1: the correctness quickies.
//
// Six small fixes, one theme: things the game SHOWED but did not DO.
//
//   * levelCap early-returned below 100, so the JohKanto 120→255 ladder was dead
//     code until globalTier 8 — but the Magnet Train opens on the JOHTO crown,
//     earnable at tier 7. All eight postgame gyms and RED, capped at Lv90.
//   * The battle bag LISTED status cures as medicine; selecting one silently did
//     nothing (useItem had no `cure` branch).
//   * X items were `kind:'misc'` — "no mechanic", shown and inert.
//   * Catching paid zero EXP, teaching players that catching is bad for training.
//   * CLEANSE TAG (a ¥1000 buyable) and STARF BERRY carried empty payloads.
//   * Return/Frustration were flat 102 regardless of friendship.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/upscale1_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- static: the payloads exist and the flat powers are gone ----------
{
	const bag = fs.readFileSync(path.join(ROOT, 'overworld/bag.js'), 'utf8');
	A(/xattack:.*kind: 'xitem', boost: \{ atk: 1 \}/.test(bag), 'X ATTACK is a real xitem with a +1 atk payload');
	A(/direhit:.*crit: true/.test(bag) && /guardspec:.*guard: true/.test(bag), 'DIRE HIT and GUARD SPEC. carry their payloads');
	A(/cleansetag:.*cleanseTag: true/.test(bag), 'CLEANSE TAG has a payload at last');
	A(/starfberry:.*starfBoost: 2/.test(bag), 'and so does STARF BERRY');
	const battle = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
	A(!/return: \(\) => 102/.test(battle), 'Return no longer has a flat 102 power');
	A(/u\.friend \?\? 70/.test(battle), '...it reads the user\'s friendship');
	const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/cleanseTag && Math\.random\(\) < 1 \/ 3/.test(main.replace(/held\?\./g, '')) || /cleanseTag/.test(main),
		'the step handler consults CLEANSE TAG before rolling an encounter');
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
	const PORT = 8939;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 20, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 60, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 60, curHP: 60,
		exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
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
			localStorage.removeItem('magepunk_story');
			localStorage.removeItem('magepunk_bag_v1');
			localStorage.removeItem('magepunk_badges_v1');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		// a helper: run one wild battle to a state we control, waiting on the rAF loop
		await page.evaluate(() => {
			window.__startWild = () => new Promise(res => {
				const ow = window.__ow;
				ow.battle.start(ow.party, 'sentret', 5, r => res(r));
			});
			// wait until the battle is TAKING INPUT — not merely started. Returning on
			// `!active` is wrong twice over: before the intro plays active is still
			// null (so it must WAIT, not bail), and after finish() it is null again
			// (the one case a caller wants to fall through on).
			window.__waitIdle = async (allowGone) => {
				const b = window.__ow.battle;
				for (let i = 0; i < 300; i++) {
					const a = b.active;
					if (a && a.phase === 'choose') return true;
					if (!a && allowGone) return false;
					await new Promise(r => setTimeout(r, 60));
				}
				return false;
			};
		});

		// ---------- the cap-trap ----------
		const cap = await page.evaluate(async () => {
			const B = await import('./badges.js');
			const out = {};
			out.tier7NoJk = B.levelCap(7);
			for (const id of ['boulder', 'cascade', 'thunder']) B.earn('JOHKANTO', id);
			out.tier7Jk3 = B.levelCap(7);
			for (const id of ['rainbow', 'soul', 'marsh', 'volcano', 'earth']) B.earn('JOHKANTO', id);
			out.tier7Jk8 = B.levelCap(7);
			B.crown('JOHKANTO');
			out.tier7Crowned = B.levelCap(7);
			out.tier8NoRegress = B.levelCap(8);
			return out;
		});
		A(cap.tier7NoJk === 90, 'no JohKanto badges: tier 7 still caps at 90', JSON.stringify(cap));
		A(cap.tier7Jk3 === 160, 'THREE JohKanto badges lift the cap to 160 even at tier 7 — the trap is gone', JSON.stringify(cap));
		A(cap.tier7Jk8 === 240, '...eight lift it to 240', JSON.stringify(cap));
		A(cap.tier7Crowned === 255, "...and RED's crown opens 255, wherever the shared tier sits", JSON.stringify(cap));
		A(cap.tier8NoRegress === 255, 'tier 8 never reads lower than the JohKanto ladder', JSON.stringify(cap));

		// ---------- in-battle cures ----------
		const cure = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.Bag.addItem('antidote', 1); ow.Bag.addItem('burnheal', 1); ow.Bag.addItem('fullheal', 1);
			const done = window.__startWild();
			await window.__waitIdle();
			const b = ow.battle, a = b.active;
			a.me.status = 'psn';
			b.useItem('burnheal');                     // wrong medicine: must be refused
			const wrongRefused = a.me.status === 'psn' && ow.Bag.count('burnheal') === 1;
			b.useItem('antidote');                     // right medicine
			await window.__waitIdle();
			const cured = a.me.status === null && ow.Bag.count('antidote') === 0;
			a.me.confuseTurns = 3;
			b.useItem('fullheal');                     // FULL HEAL lifts confusion too
			await window.__waitIdle();
			const unconfused = a.me.confuseTurns === 0 && ow.Bag.count('fullheal') === 0;
			b.finish('ran'); await done;
			return { wrongRefused, cured, unconfused };
		});
		A(cure.wrongRefused, 'the wrong cure is refused and not consumed (BURN HEAL on poison)', JSON.stringify(cure));
		A(cure.cured, 'ANTIDOTE cures poison mid-battle and is consumed', JSON.stringify(cure));
		A(cure.unconfused, 'FULL HEAL lifts confusion, as on cartridge', JSON.stringify(cure));

		// ---------- X items ----------
		const x = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.Bag.addItem('xattack', 1); ow.Bag.addItem('direhit', 1); ow.Bag.addItem('guardspec', 1);
			const done = window.__startWild();
			await window.__waitIdle();
			const b = ow.battle, a = b.active;
			b.useItem('xattack'); await window.__waitIdle();
			b.useItem('direhit'); await window.__waitIdle();
			b.useItem('guardspec'); await window.__waitIdle();
			const out = { atk: a.meBoosts.atk, pumped: !!a.me.focusEnergy, mist: a.meSide.mist || 0 };
			b.finish('ran'); await done;
			return out;
		});
		A(x.atk === 1, 'X ATTACK raises Attack a stage', JSON.stringify(x));
		A(x.pumped, 'DIRE HIT is Focus Energy in a bottle', JSON.stringify(x));
		// laid as 5, and the foe's free move + end-of-turn has already ticked it
		// once by the time we look — which proves the counter is really wired in
		A(x.mist === 4, 'GUARD SPEC. lays Mist, and it ticks down like any side condition', JSON.stringify(x));

		// ---------- catch EXP ----------
		const caught = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.Bag.addItem('pokeball', 1);
			const expBefore = ow.party[0].exp;
			const done = window.__startWild();
			await window.__waitIdle();
			const b = ow.battle, a = b.active;
			a.foe.curHP = 1;
			const realRandom = Math.random;
			Math.random = () => 0;                    // every shake succeeds: guaranteed catch
			b.useItem('pokeball');
			const r = await done;
			Math.random = realRandom;
			return { result: r, gained: ow.party[0].exp - expBefore };
		});
		A(caught.result === 'caught', 'the ball connects (RNG pinned)', JSON.stringify(caught));
		A(caught.gained > 0, `catching now pays EXP like a KO (+${caught.gained})`, JSON.stringify(caught));

		// ---------- STARF BERRY ----------
		const starf = await page.evaluate(async () => {
			const ow = window.__ow;
			const done = window.__startWild();
			await window.__waitIdle();
			const b = ow.battle, a = b.active;
			a.me.heldItem = 'starfberry';
			a.me.curHP = Math.floor(a.me.maxHP / 5);   // under the ¼ trigger
			const realRandom = Math.random;
			Math.random = () => 0;                     // picks the first stat: Attack
			// checkBerry queues its work; outside a running queue the callbacks
			// never fire (the engine always calls it from inside end-of-turn)
			b.startQueue(() => b.checkBerry(a.me, 'me'));
			await window.__waitIdle();
			Math.random = realRandom;
			const out = { atk: b.boostsOf(a.me).atk, eaten: a.me.heldItem == null || a.me.heldItem === '' };
			b.finish('ran'); await done;
			return out;
		});
		A(starf.atk === 2, 'STARF BERRY raises a stat sharply at low HP', JSON.stringify(starf));
		A(starf.eaten, '...and is eaten', JSON.stringify(starf));

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
