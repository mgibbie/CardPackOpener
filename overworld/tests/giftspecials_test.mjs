// giftspecials_test.mjs — the specials behind four story gifts/battles, driven
// through interact() on the real maps:
//   * Mossdeep Space Center: Steven's multi battle actually starts (a double vs
//     Maxie + Tabitha) and a win runs the "defeated" branch (was: no battle, the
//     script fell to SetCB2WhiteOut — and ChooseHalfParty looped the prompt)
//   * Dragon Shrine: the elder's DRATINI arrives, with EXTREMESPEED
//   * Day-Care Man: the ODD EGG lands in the Day Care with a Dizzy Punch preset
//   * Mania: SHUCKIE is lent once, not every visit, and can be returned next day
//
//   node overworld/tests/giftspecials_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');

let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ---------- the Mania script repair landed ----------
{
	const S = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/scripts/ManiasHouse.json'), 'utf8'));
	const dangling = Object.values(S).flat().filter(o => o && o.label && /^ManiaScript\./.test(o.label) && !S[o.label]).map(o => o.label);
	A(!dangling.length, 'ManiasHouse: every ManiaScript.* jump has a label (run tools/fix_johto_gifts.mjs --write)', dangling.join(','));
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
	const PORT = 9107;
	const STATE = { username: 'gifts', friendCode: 'GIFTS0', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
	const MIME = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.jpg': 'image/jpeg', '.ttf': 'font/ttf', '.wav': 'audio/wav', '.mp3': 'audio/mpeg', '.ogg': 'audio/ogg' };
	const server = http.createServer(async (req, res) => {
		const u = decodeURIComponent(req.url.split('?')[0]);
		if (u === '/api/mp') {
			let raw = ''; for await (const c of req) raw += c;
			let b = {}; try { b = JSON.parse(raw); } catch (e) {}
			res.writeHead(200, { 'content-type': 'application/json' });
			if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
			if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
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
	const mon = (speciesId, num) => ({
		speciesId, name: speciesId.toUpperCase(), level: 60, gender: 'M', friend: 70, types: ['Water'],
		ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
		stats: { hp: 200, atk: 200, def: 200, spa: 200, spd: 200, spe: 200 }, maxHP: 200, curHP: 200,
		exp: 200000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: `s${num}.png`, num,
	});

	let browser;
	try {
		browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
		const page = await browser.newPage();
		const errors = [];
		page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument((st, party) => {
			localStorage.setItem('magepunk_mp_token_v1', 'gift-token');
			localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
			if (!localStorage.getItem('magepunk_region')) localStorage.setItem('magepunk_region', 'HOENN');
			if (!localStorage.getItem('magepunk_story'))
				localStorage.setItem('magepunk_story', JSON.stringify({
					flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true, FLAG_INTERACTED_WITH_STEVEN_SPACE_CENTER: true },
					vars: { VAR_SCENE_DragonShrine: 1 } }));
			if (!localStorage.getItem('magepunk_party_v1')) localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		}, STATE, [mon('mudkip', 258), mon('lotad', 270)]);

		const boot = async (map, x, y) => {
			await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
			const t0 = Date.now();
			while (Date.now() - t0 < 60000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await sleep(200);
			await sleep(1500);
			await page.evaluate(() => document.activeElement?.blur?.());
		};
		// answer every box with Z (= yes) until the script is done or a battle opens
		const settle = async (ms = 15000) => {
			const t = Date.now();
			while (Date.now() - t < ms) {
				const st = await page.evaluate(() => ({ d: !!window.__ow.dialog.blocking, c: !!window.__ow.cutscene.blocking, b: !!window.__ow.battle.active || !!window.__ow.halfParty?.open }));
				if (st.b || (!st.d && !st.c)) return st;
				await page.evaluate(() => { try { window.__ow.dialog.revealed = 1e9; window.__ow.dialog.key('z'); } catch (e) {} });
				await sleep(80);
			}
			return null;
		};
		const talk = async (x, y, facing) => {
			await page.evaluate((x, y, f) => { const W = window.__ow, p = W.player; p.tx = x; p.ty = y; p.px = x * 16; p.py = y * 16; p.facing = f; p.moving = false; W.interact(); }, x, y, facing);
			await sleep(300);
			return settle();
		};
		const partyNow = () => page.evaluate(() => window.__ow.party.map(m => ({ s: m.speciesId, nick: m.nickname || null, item: m.heldItem || null, ot: m.otName || null, moves: (m.moves || []).map(v => v.id) })));

		// ===== Mossdeep Space Center: Steven's multi battle =====
		await boot('MossdeepCity_SpaceCenter_2F', 2, 8);
		let st = await talk(2, 8, 'left');
		// the pick screen (two mons in this party: pick both, then BATTLE)
		if (await page.evaluate(() => !!window.__ow.halfParty?.open)) {
			const key = k => page.evaluate(k => window.dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true, cancelable: true })), k);
			await key('z'); await key('ArrowDown'); await key('z'); await key('z');
			await sleep(500); st = await settle();
		}
		const fight = await page.evaluate(() => {
			const a = window.__ow.battle.active;
			return a ? { double: !!a.double, foes: [a.foe?.speciesId, a.foeAlly?.speciesId], n: a.foeParty?.length } : null;
		});
		A(st?.b && fight, 'talking to Steven starts the Space Center battle', JSON.stringify({ st, fight }));
		A(fight?.double && fight.foes[0] === 'mightyena' && fight.foes[1] === 'camerupt',
			"it is a double vs Maxie's and Tabitha's leads", JSON.stringify(fight));
		await page.evaluate(() => { if (window.__ow.battle.active) window.__ow.battle.finish('victory'); });
		await sleep(1500); await settle(20000);
		const after = await page.evaluate(() => ({ sc: window.__ow.Story.getVar('VAR_MOSSDEEP_SPACE_CENTER_STATE'), city: window.__ow.Story.getVar('VAR_MOSSDEEP_CITY_STATE'), map: window.__ow.world.current.name }));
		A(after.sc === 3 && after.city === 3, 'winning runs the "defeated Maxie + Tabitha" branch (not the whiteout)', JSON.stringify(after));

		// ===== Johto gifts =====
		await page.evaluate(() => localStorage.setItem('magepunk_region', 'JOHTO'));
		// Dragon Shrine elder (5,1): the DRATINI, EXTREMESPEED for a flawless quiz
		await boot('DragonShrine', 5, 2);
		const n0 = (await partyNow()).length;
		await talk(5, 2, 'up');
		let p = await partyNow();
		const drat = p.find(m => m.s === 'dratini');
		A(drat, 'the Dragon Shrine elder hands over a DRATINI', JSON.stringify(p));
		A(drat?.moves.includes('extremespeed'), 'with the EXTREMESPEED moveset', JSON.stringify(drat));
		await talk(5, 2, 'up');
		A((await partyNow()).filter(m => m.s === 'dratini').length === 1, 'and only once');

		// Day-Care Man (2,3): the ODD EGG
		await boot('DayCare', 2, 4);
		await page.evaluate(() => { const d = JSON.parse(localStorage.getItem('magepunk_daycare') || '{}'); d.egg = null; localStorage.setItem('magepunk_daycare', JSON.stringify(d)); });
		await boot('DayCare', 2, 4);
		await talk(2, 4, 'up');
		const egg = await page.evaluate(() => JSON.parse(localStorage.getItem('magepunk_daycare') || '{}').egg);
		A(egg && ['pichu', 'cleffa', 'igglybuff', 'smoochum', 'magby', 'elekid', 'tyrogue'].includes(egg.speciesId), 'the Day-Care Man gives an ODD EGG', JSON.stringify(egg));
		A(egg?.preset?.moves?.includes('dizzypunch'), 'which will hatch knowing DIZZY PUNCH', JSON.stringify(egg?.preset));
		A(await page.evaluate(() => !!window.__ow.Story.getFlag('EVENT_GOT_ODD_EGG')), 'EVENT_GOT_ODD_EGG is set');

		// Mania (2,4): SHUCKIE lent once, returned the next day
		await page.evaluate(() => { const pt = JSON.parse(localStorage.getItem('magepunk_party_v1')); localStorage.setItem('magepunk_party_v1', JSON.stringify(pt.slice(0, 2))); });
		await boot('ManiasHouse', 2, 5);
		await talk(2, 5, 'up');
		p = await partyNow();
		const shu = p.filter(m => m.s === 'shuckle');
		A(shu.length === 1 && shu[0].nick === 'SHUCKIE' && shu[0].item === 'berry' && shu[0].ot === 'MANIA',
			'Mania lends SHUCKIE (nicknamed, holding a BERRY, OT MANIA)', JSON.stringify(shu));
		await talk(2, 5, 'up');
		A((await partyNow()).filter(m => m.s === 'shuckle').length === 1, 'talking again the same day does not lend a second one');
		// a day later the daily flag lapses and Mania asks for him back
		await page.evaluate(() => window.__ow.Story.setVar('VAR_MP_SHUCKIE_DAY', 1));
		await boot('ManiasHouse', 2, 5);
		A(!(await page.evaluate(() => window.__ow.Story.getFlag('ENGINE_GOT_SHUCKIE_TODAY'))), 'ENGINE_GOT_SHUCKIE_TODAY lapses the next day');
		await talk(2, 5, 'up');
		const back = await page.evaluate(() => ({ took: !!window.__ow.Story.getFlag('EVENT_MANIA_TOOK_SHUCKIE_OR_LET_YOU_KEEP_HIM'), shu: window.__ow.party.filter(m => m.speciesId === 'shuckle').length }));
		A(back.took && back.shu === 0, 'saying yes returns SHUCKIE to Mania', JSON.stringify(back));

		A(errors.length === 0, 'no uncaught page error', JSON.stringify(errors.slice(0, 2)));
	} finally {
		if (browser) await browser.close();
		server.close();
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
