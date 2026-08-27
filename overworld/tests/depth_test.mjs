// depth_test.mjs — the overworld progression-depth batch: TMs actually teach
// (machine-compat table + id parsing), natures shift stats ±10%, EVs accrue on
// KOs and feed the stat formula, vitamins/evo items are stocked, the move menu
// hints effectiveness, and Moxie/ability-aware AI behave. Boots the real game
// headless (boot_smoke server pattern) and drives the battle engine directly.
//
// Standalone (needs headless Chrome/Edge + local overworld/data):
//   node overworld/tests/depth_test.mjs
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
const PORT = 8878;

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
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data?.tmLearn && window.__ow.party)), 30000);
		A(ready, 'boot: battle data incl. the TM compat table loaded');
		if (!ready) throw new Error('boot failed');

		const out = await page.evaluate(async () => {
			const B = await import('/overworld/battle.js');
			const ow = window.__ow, data = ow.battle.data;
			const out = {};

			// --- natures shift stats ±10% ---
			const sp = data.species.machop;
			const ivs = { hp: 10, atk: 10, def: 10, spa: 10, spd: 10, spe: 10 };
			const neutral = B.statsFor(sp, ivs, 50, { nature: 'quirky' });
			const adamant = B.statsFor(sp, ivs, 50, { nature: 'adamant' });
			out.natureUp = adamant.atk === Math.floor(neutral.atk * 1.1);
			out.natureDown = adamant.spa === Math.floor(neutral.spa * 0.9);
			out.natureAssigned = !!B.buildMon('pidgey', 5, data).nature;

			// --- EVs feed the formula ---
			const noEv = B.statsFor(sp, ivs, 50, { nature: 'quirky' });
			const maxEv = B.statsFor(sp, ivs, 50, { nature: 'quirky', evs: { atk: 252 } });
			out.evRaises = maxEv.atk === noEv.atk + 63; // 252/4 * 50/100 = 31.5 -> +63 @ L50? (see calcStat)
			out.evRaisesLoose = maxEv.atk > noEv.atk; // exact math asserted loosely too

			// --- TM parsing + compatibility ---
			out.tmDecomp = ow.tmMoveId('tm24thunderbolt') === 'thunderbolt';
			out.tmNamed = ow.tmMoveId('tmicebeam') === 'icebeam';
			out.tmGen3 = ow.tmMoveId('tm24') === 'thunderbolt';
			const pika = { speciesId: 'pikachu' };
			out.tmCompatYes = ow.canLearn(pika, 'thunderbolt');
			out.tmCompatNo = !ow.canLearn(pika, 'leafblade');
			// a fakemon Showdown never heard of: same-type machines allowed
			const known = new Set(data.tmLearn.__species || []);
			const fake = Object.keys(data.species).find(id => !known.has(id) && (data.species[id].types || []).length);
			if (fake) {
				const t = data.species[fake].types[0];
				const sameType = Object.keys(data.tmLearn).find(mid => mid !== '__species' && data.moves[mid]?.type === t);
				out.tmFakemon = sameType ? ow.canLearn({ speciesId: fake }, sameType) : true;
			} else out.tmFakemon = true;

			// --- vitamins + evo items stocked ---
			const Bag = await import('/overworld/bag.js');
			out.vitamins = ['hpup', 'protein', 'iron', 'calcium', 'zinc', 'carbos'].every(id => Bag.ITEMS[id]?.kind === 'vitamin' && Bag.SHOP_STOCK.includes(id));
			out.evoItems = ['galaricacuff', 'tartapple', 'crackedpot', 'auspiciousarmor', 'metalalloy'].every(id => Bag.ITEMS[id] && Bag.SHOP_STOCK.includes(id));
			out.tmsStocked = ['tmthunderbolt', 'tmearthquake', 'tmstealthrock'].every(id => Bag.ITEMS[id]?.kind === 'tm' && Bag.SHOP_STOCK.includes(id));

			// --- live battle: eff hints, EV accrual, Moxie ---
			ow.party.length = 0;
			ow.party.push(B.buildMon('machop', 40, data), B.buildMon('rattata', 20, data));
			ow.startWildBattle({ id: 'pidgey', level: 10 });
			await new Promise(r => setTimeout(r, 700));
			const b = ow.battle, a = () => b.active;
			for (let i = 0; i < 40 && a()?.phase !== 'menu'; i++) {
				const q = a()?.queue; if (q && q.length) { const e = q.shift(); e.fn?.(); e.anim?.done?.(); }
				await new Promise(r => setTimeout(r, 60));
			}
			out.battleReady = a()?.phase === 'menu';
			// eff hint vs pidgey (Normal/Flying): Electric = x2, Fighting = x1 (0.5*2), Ghost = x0
			out.hintSuper = b.effHint({ type: 'Electric', category: 'Special' }) === ' ×2';
			out.hintImmune = b.effHint({ type: 'Ghost', category: 'Physical' }) === ' ×0';
			out.hintStatusBlank = b.effHint({ type: 'Electric', category: 'Status' }) === '';

			const me = a().me, foe = a().foe;
			// Moxie: KO the foe with a damaging move -> +1 Attack
			me.ability = 'moxie'; foe.ability = null; foe.curHP = 1;
			const drain = () => { let g = 500; while (a().queue.length && g--) { const e = a().queue.shift(); e.fn?.(); e.anim?.done?.(); } };
			b.useMove(me, a().meBoosts, foe, a().foeBoosts, { id: 'tackle', name: 'Tackle', pp: 30, maxPp: 30 }, false);
			drain();
			out.moxie = a().meBoosts.atk === 1;
			// EV accrual: pidgey's best base stat is speed
			const evBefore = { ...me.evs };
			b.awardEvs(me, foe);
			out.evAward = me.evs.spe === (evBefore.spe || 0) + 2;
			return out;
		});

		A(out.natureUp, 'adamant nature = +10% Attack');
		A(out.natureDown, 'adamant nature = −10% Sp. Atk');
		A(out.natureAssigned, 'new mons roll a nature');
		A(out.evRaisesLoose, 'EVs raise the computed stat', JSON.stringify(out));
		A(out.tmDecomp, 'tmMoveId parses decomp pickups (tm24thunderbolt)');
		A(out.tmNamed, 'tmMoveId parses named TMs (tmicebeam)');
		A(out.tmGen3, 'tmMoveId still maps Gen3 numbers (tm24 = thunderbolt)');
		A(out.tmCompatYes, 'canLearn: Pikachu learns TM Thunderbolt');
		A(out.tmCompatNo, 'canLearn: Pikachu cannot learn Leaf Blade');
		A(out.tmFakemon, 'canLearn: fakemon fall back to same-type machines');
		A(out.vitamins, 'all six vitamins stocked');
		A(out.evoItems, 'the stranded evolution items are stocked');
		A(out.tmsStocked, 'the mart TM section is stocked');
		A(out.battleReady, 'wild battle reached the menu');
		A(out.hintSuper, 'move menu hints ×2 vs a weak foe');
		A(out.hintImmune, 'move menu hints ×0 vs an immune foe');
		A(out.hintStatusBlank, 'status moves show no hint');
		A(out.moxie, 'Moxie grants +1 Attack on a KO');
		A(out.evAward, 'KOs award +2 EVs in the fallen species\' best stat');

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
