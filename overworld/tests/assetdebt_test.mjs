// assetdebt_test.mjs — the asset-debt cluster (upscale plan item 28).
//
//   * DONOR CRIES: 391 species (Ransei/Uranium fakemon + a couple of forms)
//     shipped with no cry file — mute "appeared!" lines. gen_cry_donors.mjs
//     maps each to its nearest real relative (primary type + stat total);
//     sound.js consults the map on every cry.
//   * EXP CURVES: the audit's "19 exp curves" were 19 duplicated curve SITES —
//     already deduplicated into badges.js, whose single split curve is a
//     documented design decision (per-species curves would re-level every
//     save). This suite pins the dedup so it can't regress.
//   * STATUS MOVES: COACHING and DRAGON CHEER work (the doubles side-mechanics
//     unlocked them), EMBARGO and MAGIC ROOM silence items through the central
//     itemFx gate, WONDER ROOM swaps the defense the damage formula reads,
//     HAPPY HOUR doubles the payout, CELEBRATE/HOLD HANDS say their line.
//     What stays noop genuinely needs missing machinery (interception,
//     re-ordering, type rewrites) — the MOVE_FX comment now says exactly that.
//
// Standalone (needs headless Chrome/Edge):
//   node overworld/tests/assetdebt_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

// ---------- the donor-cry map ----------
{
	const donors = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/cry_donors.json'), 'utf8'));
	const species = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/species_battle.json'), 'utf8'));
	const have = new Set(fs.readdirSync(path.join(ROOT, 'overworld/data/sounds/cries'))
		.filter(f => f.endsWith('.ogg')).map(f => f.slice(0, -4)));
	const silent = Object.keys(species).filter(id => !have.has(id));
	A(silent.length > 0 && silent.every(id => donors[id]),
		`every silent species has a donor (${silent.length} mapped)`);
	A(Object.values(donors).every(d => have.has(d)), 'every donor actually has a cry file');
	const typeMatched = Object.entries(donors)
		.filter(([id, d]) => species[id].types?.[0] === species[d].types?.[0]).length;
	A(typeMatched / Object.keys(donors).length > 0.95,
		`donors share the primary type (${typeMatched}/${Object.keys(donors).length})`);
	const snd = fs.readFileSync(path.join(ROOT, 'overworld/sound.js'), 'utf8');
	A(/cryDonors\[speciesId\] \|\| speciesId/.test(snd), 'sound.js consults the donor map on every cry');
}

// ---------- the exp-curve dedup stays dead ----------
{
	for (const f of ['overworld/main.js', 'overworld/battle.js', 'overworld/daycare.js', 'overworld/trainers.js']) {
		const src = fs.readFileSync(path.join(ROOT, f), 'utf8');
		A(!/\*\* 3\b/.test(src), `${f} carries no private copy of the growth curve`);
	}
}

// ---------- the status-move ledger ----------
{
	const bt = fs.readFileSync(path.join(ROOT, 'overworld/battle.js'), 'utf8');
	A(/coaching: \{ allyBoost: \{ atk: 1, def: 1 \} \}/.test(bt), 'COACHING is modeled');
	A(/dragoncheer: \{ allyCrit: true \}/.test(bt), 'DRAGON CHEER is modeled');
	A(/embargo: \{ embargo: true \}/.test(bt) && !/embargo: \{ noop: true \}/.test(bt), 'EMBARGO stopped being a noop');
	A(/magicroom: \{ field: 'magicRoom' \}/.test(bt) && /wonderroom: \{ field: 'wonderRoom' \}/.test(bt),
		'the ROOMS are real field effects');
	A(/fx\.festMsg \|\| fx\.happyHour/.test(bt), 'the AI scores party tricks at zero');
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
	const PORT = 8948;
	const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const mon = (speciesId, name, num, extra = {}) => ({
		speciesId, name, num, level: 40, gender: 'M', friend: 70, types: ['Normal'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 120, atk: 90, def: 90, spa: 90, spd: 90, spe: 90 }, maxHP: 120, curHP: 120,
		exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's608.png', ...extra,
	});
	const PARTY = [mon('rattata', 'LEAD', 19), mon('sentret', 'BUDDY', 161)];
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
		}, STATE, PARTY);
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=NewBarkTown`, { waitUntil: 'domcontentloaded' });
		const t0 = Date.now();
		while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await new Promise(r => setTimeout(r, 200));
		A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the overworld boots');

		await page.evaluate(() => {
			window.__until = async (fn, ms = 8000) => {
				const t = Date.now();
				while (Date.now() - t < ms) { if (fn()) return true; await new Promise(r => setTimeout(r, 60)); }
				return fn();
			};
			window.__waitIdle = async () => {
				const b = window.__ow.battle;
				for (let i = 0; i < 300; i++) {
					const a = b.active;
					if (a && (a.phase === 'choose' || a.phase === 'menu')) return true;
					await new Promise(r => setTimeout(r, 60));
				}
				return false;
			};
		});

		// the donor map serves from the data dir the page already uses
		const donorLive = await page.evaluate(async () => {
			const r = await fetch('data/cry_donors.json');
			const d = r.ok ? await r.json() : {};
			return { ok: r.ok, shox: d.shox };
		});
		A(donorLive.ok && !!donorLive.shox, 'the page can fetch the donor map (shox has a voice)', JSON.stringify(donorLive));

		// ---------- one doubles battle exercises the whole ledger ----------
		const live = await page.evaluate(async () => {
			const ow = window.__ow; const b = ow.battle;
			const done = new Promise(res => b.start(ow.party, 'sentret', 5, r => res(r), { id: 'hoothoot', level: 5 }));
			await window.__waitIdle();
			const a = b.active;
			const out = { double: a.double };
			a.foe.maxHP = 5000; a.foe.curHP = 5000; a.foeShownHP = 5000;
			const drained = () => window.__until(() => a.queue.length === 0 && !a.fx);
			// COACHING: +1/+1 to the PARTNER, not the user
			b.startQueue(() => b.useMove(a.me, a.meBoosts, a.me, a.meBoosts, { id: 'coaching', name: 'Coaching', pp: 10 }, false, {}));
			await drained();
			out.allyBoost = { atk: a.meAllyBoosts.atk, def: a.meAllyBoosts.def, selfAtk: a.meBoosts.atk };
			// DRAGON CHEER rides the Focus Energy machinery
			b.startQueue(() => b.useMove(a.me, a.meBoosts, a.me, a.meBoosts, { id: 'dragoncheer', name: 'Dragon Cheer', pp: 15 }, false, {}));
			await drained();
			out.cheered = !!a.meAlly.focusEnergy;
			// EMBARGO: the one itemFx gate goes dark for the target
			a.me.heldItem = 'oranberry';
			out.itemBefore = !!b.itemFx(a.me);
			b.startQueue(() => b.useMove(a.foe, a.foeBoosts, a.me, a.meBoosts, { id: 'embargo', name: 'Embargo', pp: 15 }, true, {}));
			await drained();
			out.embargoTurns = a.me.embargoTurns;
			out.itemDuring = b.itemFx(a.me);
			b.startQueue(() => b.endOfTurn());
			await drained();
			out.embargoTicked = a.me.embargoTurns;
			a.me.embargoTurns = 0;
			out.itemAfter = !!b.itemFx(a.me);
			// MAGIC ROOM: the same gate, field-wide, and it toggles
			b.startQueue(() => b.useMove(a.foe, a.foeBoosts, a.foe, a.foeBoosts, { id: 'magicroom', name: 'Magic Room', pp: 10 }, true, {}));
			await drained();
			out.magicRoom = a.fieldFx.magicRoom;
			out.itemInRoom = b.itemFx(a.me);
			b.startQueue(() => b.useMove(a.foe, a.foeBoosts, a.foe, a.foeBoosts, { id: 'magicroom', name: 'Magic Room', pp: 10 }, true, {}));
			await drained();
			out.magicRoomOff = a.fieldFx.magicRoom;
			// WONDER ROOM: a physical hit measured against a 1000-point Sp. Def
			a.foe.stats.def = 1; a.foe.stats.spd = 1000;
			a.foe.curHP = 5000; a.foeShownHP = 5000;
			b.startQueue(() => b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, { id: 'tackle', name: 'Tackle', pp: 35 }, false, {}));
			await window.__until(() => a.foe.curHP < 5000);
			await drained();
			out.dmgNoRoom = 5000 - a.foe.curHP;
			a.fieldFx.wonderRoom = 5;
			a.foe.curHP = 5000; a.foeShownHP = 5000;
			b.startQueue(() => b.useMove(a.me, a.meBoosts, a.foe, a.foeBoosts, { id: 'tackle', name: 'Tackle', pp: 35 }, false, {}));
			await window.__until(() => a.foe.curHP < 5000);
			await drained();
			out.dmgWonder = 5000 - a.foe.curHP;
			a.fieldFx.wonderRoom = 0;
			// HAPPY HOUR doubles a payout
			b.startQueue(() => b.useMove(a.me, a.meBoosts, a.me, a.meBoosts, { id: 'happyhour', name: 'Happy Hour', pp: 30 }, false, {}));
			await drained();
			a.info = { money: 500 };
			out.payout = b.prizeMoney();
			// CELEBRATE says its line instead of "But it failed!"
			b.startQueue(() => b.useMove(a.me, a.meBoosts, a.me, a.meBoosts, { id: 'celebrate', name: 'Celebrate', pp: 40 }, false, {}));
			await window.__until(() => /Congratulations/.test(a.msg), 6000);
			out.celebrated = /Congratulations/.test(a.msg);
			await drained();
			b.finish('ran'); await done;
			return out;
		});
		A(live.double, 'the doubles battle stands up', JSON.stringify(live.double));
		A(live.allyBoost.atk === 1 && live.allyBoost.def === 1 && live.allyBoost.selfAtk === 0,
			'COACHING raises the PARTNER by +1/+1', JSON.stringify(live.allyBoost));
		A(live.cheered, 'DRAGON CHEER pumps the partner via Focus Energy', JSON.stringify(live.cheered));
		A(live.itemBefore && live.embargoTurns === 5 && live.itemDuring === null && live.embargoTicked === 4 && live.itemAfter,
			'EMBARGO silences the held item for 5 ticking turns', JSON.stringify({ t: live.embargoTurns, tick: live.embargoTicked }));
		A(live.magicRoom === 5 && live.itemInRoom === null && live.magicRoomOff === 0,
			'MAGIC ROOM silences items field-wide and toggles off', JSON.stringify({ on: live.magicRoom, off: live.magicRoomOff }));
		A(live.dmgWonder * 20 < live.dmgNoRoom,
			'WONDER ROOM makes a physical hit face the 1000-point Sp. Def', JSON.stringify({ no: live.dmgNoRoom, wr: live.dmgWonder }));
		A(live.payout === 1000, 'HAPPY HOUR doubles the payout', JSON.stringify(live.payout));
		A(live.celebrated, 'CELEBRATE congratulates instead of failing', JSON.stringify(live.celebrated));

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
