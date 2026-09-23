// prizemoney_test.mjs — the prize you are shown is the prize you are paid.
//
// Reported: "regular trainer prizes still don't credit, but gym-leader payouts
// do — +1500 after Roxanne" and then, a session later, "her win screen said
// +$168, money never moved. Brock paid, Misty didn't. Route trainers still pay
// fine."
//
// Those two reports look contradictory, and that is the tell: the variable was
// never the KIND of trainer. main.js:262 sends any trainer whose decomp script
// body happens to be loaded down runScriptLabel() instead of startTrainerBattle()
// — and startTrainerBattle's own victory callback was the ONLY place in the game
// that credited info.money. So whether you got paid depended on which map's
// scripts had loaded, which looks exactly like randomness from the outside.
//
// Five builders hand a battle an info.money: startTrainerBattle (paid),
// scripted trainers (money: high*8 — Misty's L21 lead is the reported $168),
// villains (level*12), rival tiers ((tier+1)*40) and the rival intro (40).
// FOUR of the five announced a prize and credited nothing.
//
// FIX: announce and pay in ONE call. battle.awardPrize() computes the prize
// (including AMULET COIN / HAPPY HOUR, via the existing idempotent prizeMoney)
// and credits it, so the number on screen and the number in your wallet are the
// same value by construction. The two per-caller credits are gone, so nothing
// can pay twice. _paid rides in `info`, which is part of the battle snapshot, so
// a battle abandoned mid-message cannot be paid again when it resumes.
//
//   node overworld/tests/prizemoney_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- source: one credit point, and only one ----------
{
	const bt = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
	const mn = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');

	A(/awardPrize\(\)\s*\{/.test(bt), 'battle.js has a single award point');
	const announces = [...bt.matchAll(/You got \$\$\{this\.(\w+)\(\)\} for winning/g)].map(m => m[1]);
	A(announces.length === 2, 'both victory messages were found', JSON.stringify(announces));
	A(announces.every(f => f === 'awardPrize'),
		'every prize announcement is also the payment', JSON.stringify(announces));

	// the two callers that used to pay must not pay any more, or a plain trainer
	// would be credited twice
	A(!/magepunk_money', \(parseInt/.test(mn),
		'startTrainerBattle no longer credits by hand');
	A(!/Bag\.earn\(end\.money/.test(mn),
		'the resume handler no longer credits by hand');

	// Nothing may re-credit a BATTLE prize behind the engine's back. The badge-tier
	// ladder (Bag.earn(r.money) — $1500 after the first badge, etc.) is a DIFFERENT
	// system and stays: it is the "+1500 after Roxanne" the reporter saw credit
	// correctly while the win screen's own figure vanished, which is precisely why
	// gyms looked like they paid and route trainers did not.
	const strays = [...mn.matchAll(/Bag\.earn\(([^)]*)\)/g)].map(m => m[1])
		.filter(x => /\binfo\.money|\bend\.money/.test(x));
	A(strays.length === 0, 'no caller re-credits a battle prize', JSON.stringify(strays));
	A(/if \(r\.money\) Bag\.earn\(r\.money\)/.test(mn),
		'the separate badge-tier reward ladder is untouched');

	// _paid must be checked, or a resumed battle pays its prize a second time
	A(/_paid/.test(bt), 'the award is guarded against paying twice');
}

// ---------- live: win real battles and count the money ----------
{
	const puppeteer = (await import('puppeteer-core')).default;
	const http = await import('http');
	const CHROME = process.env.CHROME || [
		'C:/Program Files/Google/Chrome/Application/chrome.exe',
		'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
		'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
	].find(p => fs.existsSync(p));
	const PORT = 8981;
	const STATE = { username: 'prize', friendCode: 'PRIZE0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let raw = ''; for await (const c of req) raw += c;
			let body = {}; try { body = JSON.parse(raw); } catch (e) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			if (body.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
			if (body.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
			return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [], match: null, presence: null, gifts: [], messages: [] }));
		}
		const f = u === '/' ? '/index.html' : u;
		fs.readFile(path.join(ROOT, f), (e, d) => {
			if (e) { res.writeHead(404); res.end('nf'); return; }
			res.writeHead(200, { 'content-type': MIME[path.extname(f)] || 'application/octet-stream' });
			res.end(d);
		});
	});
	await new Promise(r => server.listen(PORT, r));
	const sleep = ms => new Promise(r => setTimeout(r, ms));

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		await page.setViewport({ width: 1100, height: 800 });
		await page.evaluateOnNewDocument(st => {
			localStorage.setItem('magepunk_mp_token_v1', 'prize-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			localStorage.setItem('magepunk_region', 'KANTO');
			localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
			localStorage.setItem('magepunk_party_v1', JSON.stringify([{
				speciesId: 'squirtle', name: 'SQUIRTLE', level: 20, gender: 'M', friend: 70, types: ['Water'],
				ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
				stats: { hp: 60, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 60, curHP: 60,
				exp: 8000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's7.png', num: 7,
			}]));
		}, STATE);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route1`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');
		await sleep(1200);

		// Win a trainer battle worth `money`, exactly the way the engine runs one.
		// The foe is a 1 HP copy of the lead, so any hit ends it; the lead is
		// maxed so nothing can go wrong on the way.
		const fight = (money, opts = {}) => page.evaluate(async (money, opts) => {
			const W = window.__ow;
			const me = W.party[0];
			me.level = 100; me.maxHP = 999; me.curHP = 999;
			for (const k of Object.keys(me.stats || {})) me.stats[k] = 999;
			me.heldItem = opts.coin ? 'amuletcoin' : null;
			const foe = JSON.parse(JSON.stringify(me));
			foe.level = 2; foe.maxHP = 1; foe.curHP = 1; foe.heldItem = null;
			for (const k of Object.keys(foe.stats || {})) foe.stats[k] = 1;
			const info = { displayName: 'TESTER', defeatText: '', money, boss: false };
			const before = W.Bag.getMoney();
			let outcome = null;
			W.battle.startTrainer(W.party, [foe], info, r => { outcome = r; });
			// spam confirm: advances every message and picks FIGHT -> first move
			for (let i = 0; i < 400 && outcome === null; i++) {
				try { W.battle.key('z'); } catch (e) {}
				await new Promise(r => setTimeout(r, 25));
			}
			return { outcome, before, after: W.Bag.getMoney(), announced: info.money, paidFlag: !!info._paid };
		}, money, opts);

		// ---------- the reported amount ----------
		{
			const r = await fight(168);
			A(r.outcome === 'victory', 'a trainer battle is won', JSON.stringify(r));
			A(r.after - r.before === 168, 'a $168 prize moves the money by exactly $168',
				`${r.before} -> ${r.after}`);
			A(r.announced === 168, 'and the announced figure is that same number', String(r.announced));
			A(r.paidFlag === true, 'the battle records that it paid');
		}

		// ---------- paid once, not twice ----------
		{
			const r = await fight(250);
			A(r.after - r.before === 250, 'the next prize credits exactly once, not twice',
				`${r.before} -> ${r.after} (expected +250)`);
		}

		// ---------- a zero-prize battle pays nothing ----------
		{
			const r = await fight(0);
			A(r.after - r.before === 0, 'a battle with no prize moves nothing', `${r.before} -> ${r.after}`);
		}

		// ---------- the AMULET COIN doubles the WALLET, not just the sentence ----------
		{
			const r = await fight(100, { coin: true });
			A(r.after - r.before === 200, 'an AMULET COIN doubles what is actually paid',
				`${r.before} -> ${r.after} (expected +200)`);
			A(r.announced === 200, 'and the doubled figure is what was announced', String(r.announced));
		}
	} finally {
		if (browser) await browser.close();
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
