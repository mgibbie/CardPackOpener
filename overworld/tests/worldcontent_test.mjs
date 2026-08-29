// worldcontent_test.mjs — batch E (content completion): the formerly-dead
// status moves act, the four missing competitive items work, the Ransei rift
// pool exists, and Pokédex milestones pay out (incl. the Shiny Charm's odds).
//   node overworld/tests/worldcontent_test.mjs
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
const PORT = 8873;

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
		const ready = await waitFor(() => page.evaluate(() => !!(window.__ow?.battle?.data)), 30000);
		A(ready, 'boot: battle data loaded');
		if (!ready) throw new Error('boot failed');

		const out = await page.evaluate(async () => {
			const B = await import('/overworld/battle.js');
			const Bag = await import('/overworld/bag.js');
			const Dex = await import('/overworld/pokedex.js');
			const ow = window.__ow, bt = ow.battle;
			const out = {};
			const mvs = ids => ids.map(id => ({ id, name: id, pp: 10, maxPp: 10 }));
			const mk = (sp, lv) => { const m = B.buildMon(sp, lv, bt.data); m.ability = null; return m; };
			const zeros = () => ({ atk: 0, def: 0, spa: 0, spd: 0, spe: 0, acc: 0, eva: 0 });
			const mkActive = (me, foe) => ({
				me, foe, foes: [foe], party: [me], queue: [],
				isTrainer: true, info: { displayName: 'T', defeatText: 'x', money: 1 },
				meBoosts: zeros(), foeBoosts: zeros(),
				meHazards: {}, foeHazards: {},
				meScreens: { reflect: 0, light: 0 }, foeScreens: { reflect: 0, light: 0 },
				meSide: {}, foeSide: {}, fieldFx: { trickRoom: 0 }, lastMove: {},
				turnCount: 0,
			});
			const drain = a => { let g = 0; while (a.queue.length && g++ < 300) { const e = a.queue.shift(); e.fn?.(); e.anim?.done?.(); } };
			const saved = bt.active;
			const cast = (id, user, uB, tgt, tB, isFoe = false) => {
				bt.useMove(user, uB, tgt, tB, { id, name: id, pp: 10, maxPp: 10 }, isFoe);
				drain(bt.active);
			};

			// ---- the formerly dead status moves ----
			{
				const me = mk('rattata', 30), foe = mk('onix', 30);
				const a = mkActive(me, foe);
				bt.active = a;
				cast('victorydance', me, a.meBoosts, foe, a.foeBoosts);
				out.victorydance = a.meBoosts.atk === 1 && a.meBoosts.def === 1 && a.meBoosts.spe === 1;
				cast('shelter', me, a.meBoosts, foe, a.foeBoosts);
				out.shelter = a.meBoosts.def === 3;
				cast('toxicthread', me, a.meBoosts, foe, a.foeBoosts);
				out.toxicthread = foe.status === 'psn' && a.foeBoosts.spe === -1;
				foe.heldItem = 'leftovers';
				cast('corrosivegas', me, a.meBoosts, foe, a.foeBoosts);
				out.corrosivegas = foe.heldItem === null;
				cast('chillyreception', me, a.meBoosts, foe, a.foeBoosts);
				out.chillyreception = a.weather?.kind === 'hail';
				const atk0 = me.stats.atk, def0 = me.stats.def;
				cast('powershift', me, a.meBoosts, foe, a.foeBoosts);
				out.powershift = me.stats.atk === def0 && me.stats.def === atk0;
			}

			// ---- the four missing items ----
			{
				const me = mk('chansey', 30), foe = mk('machop', 30);
				const a = mkActive(me, foe);
				bt.active = a;
				const spd0 = bt.statOf(me, a.meBoosts, 'spd');
				me.heldItem = 'assaultvest';
				out.vestSpd = bt.statOf(me, a.meBoosts, 'spd') === Math.floor(spd0 * 1.5);
				out.vestBlocks = !bt.moveUsable(me, mvs(['softboiled'])[0], 'me');
				out.vestAllows = bt.moveUsable(me, mvs(['tackle'])[0], 'me');
				me.heldItem = null;
				// eviolite: works on a not-fully-evolved species, dead on a final stage
				const machop = mk('machop', 30), machamp = mk('machamp', 30);
				const d0 = bt.statOf(machop, zeros(), 'def');
				machop.heldItem = 'eviolite';
				out.evioliteNfe = bt.statOf(machop, zeros(), 'def') === Math.floor(d0 * 1.5);
				const dm0 = bt.statOf(machamp, zeros(), 'def');
				machamp.heldItem = 'eviolite';
				out.evioliteFinal = bt.statOf(machamp, zeros(), 'def') === dm0;
				// boots: stealth rock on our side does nothing to the wearer
				a.meHazards.stealthrock = 1;
				me.heldItem = 'heavydutyboots';
				const hp0 = me.curHP;
				bt.applyHazards(me, 'me');
				drain(a);
				out.boots = me.curHP === hp0;
				me.heldItem = null;
				bt.applyHazards(me, 'me');
				drain(a);
				out.rocksStillBite = me.curHP < hp0;
				// weakness policy: a super-effective hit pops it for +2/+2
				const wp = mk('onix', 30); // rock/ground, weak to water
				wp.heldItem = 'weaknesspolicy';
				const b = mkActive(mk('squirtle', 40), wp);
				bt.active = b;
				b.foe = wp;
				cast('watergun', b.me, b.meBoosts, wp, b.foeBoosts);
				out.weakPolicy = b.foeBoosts.atk === 2 && b.foeBoosts.spa === 2 && wp.heldItem === null;
			}

			// ---- the Ransei rift has a real pool ----
			out.riftPool = Object.values(bt.data.species).filter(s => (s.num || 0) <= 0 && s.learnset?.length).length > 300;

			// ---- dex milestones + the Shiny Charm ----
			{
				localStorage.removeItem('magepunk_dexclaims_v1');
				// pokedex module state is live; mark 80 distinct catches
				const ids = Object.keys(bt.data.species).slice(0, 80);
				for (const id of ids) Dex.markCaught(id);
				const won = Dex.claimMilestones();
				out.milestones = won.some(w => w.t === 25) && won.some(w => w.t === 75) && !won.some(w => w.t === 150);
				out.milestonesOnce = Dex.claimMilestones().length === 0;
				// the charm triples wild shiny odds
				const R = Math.random;
				Math.random = () => 2.5 / 512;
				out.charmOff = B.buildMon('pidgey', 5, bt.data).shiny === false;
				Bag.addItem('shinycharm');
				out.charmOn = B.buildMon('pidgey', 5, bt.data).shiny === true;
				Bag.consume('shinycharm');
				Math.random = R;
			}

			bt.active = saved || null;
			return out;
		});

		A(out.victorydance, 'Victory Dance: +1 Atk/Def/Spe');
		A(out.shelter, 'Shelter: +2 Def');
		A(out.toxicthread, 'Toxic Thread: poison + Speed drop');
		A(out.corrosivegas, 'Corrosive Gas melts the held item');
		A(out.chillyreception, 'Chilly Reception summons snow');
		A(out.powershift, 'Power Shift swaps Atk/Def');
		A(out.vestSpd, 'Assault Vest: 1.5x Sp. Def');
		A(out.vestBlocks, 'Assault Vest blocks status moves');
		A(out.vestAllows, 'Assault Vest allows attacks');
		A(out.evioliteNfe, 'Eviolite boosts a not-fully-evolved holder');
		A(out.evioliteFinal, 'Eviolite is dead weight on a final stage');
		A(out.boots, 'Heavy-Duty Boots ignore entry hazards');
		A(out.rocksStillBite, '...and rocks still bite the bootless');
		A(out.weakPolicy, 'Weakness Policy pops for +2/+2 and is consumed');
		A(out.riftPool, 'the Ransei rift pool holds 300+ fakemon');
		A(out.milestones, 'dex milestones pay newly crossed tiers');
		A(out.milestonesOnce, 'milestones only pay once');
		A(out.charmOff, 'base odds miss a 2.5/512 roll');
		A(out.charmOn, 'the Shiny Charm catches it (3x odds)');
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
