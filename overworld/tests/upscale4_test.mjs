// upscale4_test.mjs — Upscale Batch 4: world depth.
//
//   * MAP WEATHER finally reaches battle. The engine was complete; nothing ever
//     handed it an environmental value, so Hoenn's desert began every fight in
//     clear skies. Route 111 sandstorm / 119+120 rain / Mt Silver hail, endless.
//   * PICKUP works afield: after a wild win an idle-handed Pickup mon may scoop
//     an item (one per battle, like the cartridge).
//   * FLAME BODY / MAGMA ARMOR halve egg steps at the daycare.
//   * SYNCHRONIZE: half of wild encounters copy a Synchronize lead's nature —
//     stats recomputed, since nature was baked in at build.
//   * Field-utility moves: SWEET SCENT (force an encounter), TELEPORT (home),
//     DIG (out of a cave to your last outdoor tile), SOFTBOILED/MILK DRINK
//     (share health with the neediest teammate).
//   * Real per-species EV YIELDS (gen_ev_yields.mjs, from pokeemerald) — Zubat
//     trains Speed, Shuckle trains both defenses; fallback heuristic kept for
//     species the decomp doesn't know.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/upscale4_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- the EV table ----------
{
	const y = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/ev_yields.json'), 'utf8'));
	A(Object.keys(y).length > 350, `${Object.keys(y).length} species carry real EV yields`);
	A(y.zubat?.spe === 1, 'Zubat trains Speed', JSON.stringify(y.zubat));
	A(y.shuckle?.def === 1 && y.shuckle?.spd === 1, 'Shuckle trains BOTH defenses — split yields exist now', JSON.stringify(y.shuckle));
	A(y.chansey?.hp === 2, 'Chansey trains HP', JSON.stringify(y.chansey));
	const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
	A(/magmaarmor'\)\) \? 2 : 1/.test(main),
		'FLAME BODY / MAGMA ARMOR pass a double hatch pace into the daycare');
	const dc = fs.readFileSync(path.join(ROOT, 'overworld/daycare.js'), 'utf8');
	A(/state\.egg\.hatch -= hatchBoost/.test(dc), '...and the daycare applies it');
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
	const PORT = 8943;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const PARTY = [{
		speciesId: 'rattata', name: 'LEAD', level: 40, gender: 'M', friend: 70, types: ['Normal'],
		nature: 'adamant', ability: 'synchronize',
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 120, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 120, curHP: 120,
		exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', num: 19,
	}, {
		speciesId: 'sentret', name: 'BUDDY', level: 30, gender: 'F', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 90, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 90, curHP: 30,
		exp: 27000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's609.png', num: 161,
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
			localStorage.setItem('magepunk_region', 'HOENN');
			localStorage.removeItem('magepunk_story');
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=Route111`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots on Route 111');

		await page.evaluate(() => {
			window.__waitIdle = async () => {
				const b = window.__ow.battle;
				for (let i = 0; i < 300; i++) {
					const a = b.active;
					if (a && a.phase === 'choose') return true;
					await new Promise(r => setTimeout(r, 60));
				}
				return false;
			};
		});

		// ---------- map weather + synchronize, in one battle ----------
		const wild = await page.evaluate(async () => {
			const ow = window.__ow;
			const realRandom = Math.random;
			Math.random = () => 0.3;   // < 0.5: Synchronize copies the nature; skips shiny/held rolls
			const done = new Promise(res => ow.battle.start(ow.party, 'sandshrew', 20, r => res(r),
				null, { weather: 'sandstorm' }));
			await window.__waitIdle();
			Math.random = realRandom;
			const a = ow.battle.active;
			const out = { weather: a.weather?.kind, turns: a.weather?.turns === Infinity ? 'inf' : a.weather?.turns, foeNature: a.foe.nature, leadNature: a.me.nature };
			ow.battle.finish('ran'); await done;
			return out;
		});
		A(wild.weather === 'sandstorm' && wild.turns === 'inf',
			'a Route 111 battle starts under an ENDLESS sandstorm', JSON.stringify(wild));
		A(wild.foeNature === wild.leadNature && wild.foeNature === 'adamant',
			"SYNCHRONIZE copies the lead's nature onto the wild mon", JSON.stringify(wild));

		// ---------- pickup ----------
		const pickup = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.party[0].ability = 'pickup'; ow.party[0].heldItem = null;
			const realRandom = Math.random;
			Math.random = () => 0.05;   // under the 10% find roll
			ow.pickupCheck ? ow.pickupCheck() : null;
			Math.random = realRandom;
			return { exposed: !!ow.pickupCheck, held: ow.party[0].heldItem };
		});
		if (pickup.exposed) A(!!pickup.held, 'PICKUP scoops an item after a win', JSON.stringify(pickup));
		else {
			const main = fs.readFileSync(path.join(ROOT, 'overworld/main.js'), 'utf8');
			A(/pickupCheck\(\);/.test(main) && /PICKUP_TABLE/.test(main), 'PICKUP is wired into the wild-victory path (source)');
		}

		// ---------- field moves ----------
		const field = await page.evaluate(async () => {
			const ow = window.__ow;
			ow.party[0].ability = 'synchronize';
			const out = {};
			// softboiled: lead shares a fifth with the hurt BUDDY
			const buddyBefore = ow.party[1].curHP;
			ow.useFieldMove('softboiled', ow.party[0]);
			out.buddyGain = ow.party[1].curHP - buddyBefore;
			out.leadPaid = ow.party[0].maxHP - ow.party[0].curHP;
			// teleport: from Route 111 back to Littleroot
			ow.dialog.pages = null;
			ow.useFieldMove('teleport', ow.party[0]);
			for (let i = 0; i < 100 && !(ow.dialog.blocking); i++) await new Promise(r => setTimeout(r, 30));
			ow.dialog.key('z'); ow.dialog.key('z');
			for (let i = 0; i < 150 && !/LittlerootTown/.test(ow.world.current?.name || ''); i++) await new Promise(r => setTimeout(r, 60));
			out.teleported = ow.world.current?.name;
			return out;
		});
		A(field.buddyGain === 24 && field.leadPaid === 24,
			'SOFTBOILED moves a fifth of the lead into the neediest teammate', JSON.stringify(field));
		A(/LittlerootTown/.test(field.teleported || ''), 'TELEPORT whisks you home', JSON.stringify(field.teleported));

		// ---------- EV yields in a real KO ----------
		const evs = await page.evaluate(async () => {
			const ow = window.__ow;
			const b = ow.battle;
			const done = new Promise(res => b.start(ow.party, 'zubat', 5, r => res(r)));
			await window.__waitIdle();
			const a = b.active;
			ow.party[0].evs = { hp: 0, atk: 0, def: 0, spa: 0, spd: 0, spe: 0 };
			// grantExp queues its work — outside a running queue nothing plays and
			// the battle never ends (the exact trap crystal_story hit with checkBerry)
			b.startQueue(() => { a.foe.curHP = 0; b.grantExp(); });
			for (let i = 0; i < 300 && b.active; i++) { await new Promise(r => setTimeout(r, 40)); }
			if (b.active) b.finish('ran');
			await done;
			return ow.party[0].evs;
		});
		A(evs.spe === 1 && evs.atk === 0, 'a Zubat KO trains 1 SPEED — the real yield, not the heuristic', JSON.stringify(evs));

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
