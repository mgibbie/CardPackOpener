// kenya_test.mjs — RANDY's KENYA (Route 35 Goldenrod gate -> Route 31), the
// mail-carrying SPEAROW quest of pokecrystal.
//
// The transpile dropped `givepoke SPEAROW, 10, NO_ITEM, GiftSpearowName,
// GiftSpearowOTName` + `givepokemail GiftSpearowMail` (a gift with a nickname, an
// OT and MAIL), so RANDY set EVENT_GOT_KENYA and handed over nothing — and it
// dropped the Route 31 man's `checkpokemail`, so he gave TM50 NIGHTMARE without
// ever seeing KENYA. Now:
//   1. RANDY gives KENYA: Lv10 SPEAROW, OT RANDY (ID 01001), holding FLOWER MAIL
//      "DARK CAVE leads / to another road"; a full party gets "can't carry".
//   2. The Route 31 man asks for a POKeMON (checkpokemail): KENYA is taken and
//      TM50 handed over; a mon with no MAIL, or KENYA as your last healthy mon,
//      is turned away with nothing given.
//   3. Back at the gate, RANDY's HP UP.
//
//   node overworld/tests/kenya_test.mjs
import fs from 'fs';
import path from 'path';
import http from 'http';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || [
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9271;
const STATE = { username: 'kenyatest', friendCode: 'KENYA1', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (id, name, extra = {}) => ({
	speciesId: id, name, level: 40, gender: 'M', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 120, atk: 60, def: 60, spa: 60, spd: 60, spe: 60 }, maxHP: 120, curHP: 120,
	exp: 64000, moves: [{ id: 'tackle', name: 'Tackle', pp: 35, maxPp: 35 }], sprite: 's1.png', num: 19, ...extra,
});
const MAIL = 'DARK CAVE leads\nto another road';
const KENYA = () => mon('spearow', 'SPEAROW', { level: 10, nickname: 'KENYA', otName: 'RANDY', otId: 1001, heldItem: 'flowermail', mail: MAIL });
const FIVE = ['A', 'B', 'C', 'D', 'E'].map(n => mon('rattata', n));
const BASE_FLAGS = { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true };
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== 0. data: the restored ops are in the overlay, and the verdict is mail.asm's =====
{
	const P = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld', 'crystal_scriptvar_data.json'), 'utf8')).patches;
	const give = (P.Route35GoldenrodGate?.RandyScript || []).find(o => o.op === 'givemon');
	A(give && give.species === 'SPECIES_SPEAROW' && give.level === 10 && give.nickname === 'KENYA' && give.otName === 'RANDY'
		&& give.otId === 1001 && give.item === 'ITEM_FLOWER_MAIL' && give.mail === MAIL, "0. RANDY's givepoke + givepokemail are back (KENYA, OT RANDY, FLOWER MAIL)", JSON.stringify(give));
	const chk = (P.Route31?.['Route31MailRecipientScript.TryGiveKenya'] || []);
	A(chk.some(o => o.op === 'special' && o.name === 'CheckPokeMail' && o.text === MAIL)
		&& chk.filter(o => o.op === 'branch' && o.cond?.var === 'VAR_RESULT').length >= 4, "0. the Route 31 man's checkpokemail + its four branches are back");
	// RANDY's sub-labels are written without a colon in the decomp; they must exist
	// or every branch to them dangles (a full party still got KENYA; no HP UP)
	const R = P.Route35GoldenrodGate || {};
	A(['partyfull', 'refused', 'questcomplete', 'gothpup', 'bagfull', 'alreadyhavekenya'].every(s => Array.isArray(R['RandyScript.' + s])),
		"0. RANDY's colon-less labels (.partyfull, .questcomplete, ...) exist", JSON.stringify(Object.keys(R)));
}

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		res.writeHead(200, { 'content-type': 'application/json' });
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		if (b.action === 'ow-save') return res.end(JSON.stringify({ ok: true }));
		return res.end(JSON.stringify({ ok: true, state: STATE, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
	await page.evaluateOnNewDocument(() => {
		const s = sessionStorage.getItem('stage');
		if (!s) return;
		sessionStorage.removeItem('stage');
		localStorage.clear();
		for (const [k, v] of Object.entries(JSON.parse(s))) localStorage.setItem(k, typeof v === 'string' ? v : JSON.stringify(v));
	});
	const W = (f, ...a) => page.evaluate(f, ...a);
	const boot = async map => {
		for (let i = 0; i < 300 && !(await W(m => !!(window.__ow && window.__ow.battle && window.__ow.battle.data && window.__ow.world.current && window.__ow.world.current.name === m), map).catch(() => false)); i++) await sleep(100);
		await sleep(900);
	};
	const scene = async (map, x, y, f, { flags = {}, bag = { pokeball: 5 }, party = FIVE } = {}) => {
		const stage = {
			magepunk_mp_token_v1: 't', magepunk_mp_state_v1: STATE, magepunk_region: 'JOHTO', magepunk_name: 'KRIS',
			magepunk_party_v1: party, magepunk_bag_v1: bag,
			magepunk_story: { flags: { ...BASE_FLAGS, ...flags }, vars: {} },
			magepunk_settings: { textSpeed: 'instant', battleAnim: 'off' },
		};
		await page.goto(`http://localhost:${PORT}/overworld/index.html`, { waitUntil: 'domcontentloaded' }).catch(() => {});
		await W(s => sessionStorage.setItem('stage', s), JSON.stringify(stage));
		await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
		await boot(map);
		await W((x, y, f) => { const P = window.__ow.player; P.tx = x; P.ty = y; P.x = x * 16; P.y = y * 16; P.px = x * 16; P.py = y * 16; P.facing = f; }, x, y, f);
	};
	// talk, answer every message / yes-no with Z; at the party pick, choose slot `pick`
	const talk = (pick = 0) => W(async pick => {
		const O = window.__ow, C = await import('./choice.js');
		const press = k => dispatchEvent(new KeyboardEvent('keydown', { key: k, bubbles: true }));
		const seen = []; let picked = false;
		O.interact();
		const t0 = Date.now(); let calm = 0;
		while (Date.now() - t0 < 15000) {
			const d = O.dialog.blocking, c = O.cutscene.blocking;
			if (d && O.dialog.pages) { const p = O.dialog.pages.flat().join(' '); if (seen[seen.length - 1] !== p) seen.push(p); }
			if (C.choiceMenu.open && C.choiceMenu.list === 'CHECK_POKEMAIL') { picked = true; C.choiceMenu.idx = pick; }
			if (C.choiceMenu.open || d) press('z');
			if (!d && !c && !C.choiceMenu.open) { if (++calm >= 15) break; } else calm = 0;
			await new Promise(r => setTimeout(r, 40));
		}
		return { seen, picked };
	}, pick);
	const story = () => W(() => JSON.parse(localStorage.getItem('magepunk_story') || '{}'));
	const party = () => W(() => JSON.parse(localStorage.getItem('magepunk_party_v1') || '[]'));
	const bag = () => W(() => JSON.parse(localStorage.getItem('magepunk_bag_v1') || '{}'));
	const hasTM = b => Object.keys(b).some(k => /nightmare|tm50/.test(k) && b[k] > 0);

	// ===== 1. RANDY gives KENYA =====
	await scene('Route35GoldenrodGate', 1, 4, 'left');
	// checkpokemail's verdict, mail.asm CheckPokeMail
	const v = await W(async (MAIL, k, r) => {
		const PM = await import('./pokemail.js').catch(() => null);
		if (!PM) return null;
		const { pokeMailVerdict: f, POKEMAIL: P } = PM;
		return [f([k, r], 0, MAIL) === P.CORRECT, f([k, r], 1, MAIL) === P.NO_MAIL,
			f([{ ...k, mail: 'HELLO' }, r], 0, MAIL) === P.WRONG_MAIL, f([k, { ...r, curHP: 0 }], 0, MAIL) === P.LAST_MON];
	}, MAIL, KENYA(), mon('rattata', 'R'));
	A(v && v[0], '0. KENYA with her MAIL: CORRECT', JSON.stringify(v));
	A(v && v[1], '0. a mon with no MAIL: NO_MAIL');
	A(v && v[2], '0. other words on the MAIL: WRONG_MAIL');
	A(v && v[3], '0. KENYA as the last healthy mon: LAST_MON');
	const t1 = await talk();
	const p1 = await party(), s1 = await story();
	const k1 = p1.find(m => m.speciesId === 'spearow');
	A(p1.length === 6 && k1 && k1.nickname === 'KENYA' && k1.level === 10, '1. RANDY: KENYA (Lv10 SPEAROW) joins the party', JSON.stringify([p1.map(m => m.speciesId), t1.seen.slice(-3)]));
	A(k1 && k1.otName === 'RANDY' && k1.otId === 1001, '1. ...OT RANDY, ID 01001', JSON.stringify(k1 && [k1.otName, k1.otId]));
	A(k1 && k1.heldItem === 'flowermail' && k1.mail === MAIL, '1. ...holding FLOWER MAIL: "DARK CAVE leads / to another road"', JSON.stringify(k1 && [k1.heldItem, k1.mail]));
	A(s1.flags.EVENT_GOT_KENYA === true, '1. ...and EVENT_GOT_KENYA is set');
	// a full party: "You can't carry another #MON..." and nothing changes
	await scene('Route35GoldenrodGate', 1, 4, 'left', { party: [...FIVE, mon('rattata', 'F')] });
	const t1b = await talk();
	A(t1b.seen.some(p => /can't carry/.test(p)) && !(await story()).flags.EVENT_GOT_KENYA && (await party()).length === 6, '1. a full party: "You can\'t carry another POKeMON..." and no KENYA', JSON.stringify(t1b.seen.slice(-2)));

	// ===== 2. the Route 31 man =====
	// a mon with no MAIL
	await scene('Route31', 17, 8, 'up', { flags: { EVENT_GOT_KENYA: true }, party: [mon('rattata', 'R'), KENYA()] });
	const t2a = await talk(0);
	A(t2a.picked, "2. he asks which POKeMON (checkpokemail's party pick)", JSON.stringify(t2a.seen.slice(-3)));
	A(t2a.seen.some(p => /so special/.test(p)) && !hasTM(await bag()) && (await party()).length === 2 && !(await story()).flags.EVENT_GAVE_KENYA,
		'2. no MAIL on it: "Why is this POKeMON so special?" - nothing given, nothing taken', JSON.stringify(t2a.seen.slice(-2)));
	// KENYA as the last healthy mon
	await scene('Route31', 17, 8, 'up', { flags: { EVENT_GOT_KENYA: true }, party: [KENYA(), mon('rattata', 'R', { curHP: 0 })] });
	const t2b = await talk(0);
	A(t2b.seen.some(p => /If I take that/.test(p)) && !hasTM(await bag()) && (await party()).length === 2, "2. KENYA is your last healthy mon: he won't take her", JSON.stringify(t2b.seen.slice(-2)));
	// KENYA herself
	await scene('Route31', 17, 8, 'up', { flags: { EVENT_GOT_KENYA: true }, party: [mon('rattata', 'R'), KENYA()] });
	await talk(1);
	const p2 = await party(), s2 = await story(), b2 = await bag();
	A(p2.length === 1 && !p2.some(m => m.nickname === 'KENYA'), '2. KENYA is handed over (she leaves the party)', JSON.stringify(p2.map(m => m.nickname || m.name)));
	A(hasTM(b2) && s2.flags.EVENT_GAVE_KENYA === true && s2.flags.EVENT_GOT_TM50_NIGHTMARE === true, '2. ...and TM50 NIGHTMARE is the reward', JSON.stringify([Object.keys(b2), s2.flags.EVENT_GAVE_KENYA]));

	// ===== 3. RANDY's thanks =====
	await scene('Route35GoldenrodGate', 1, 4, 'left', { flags: { EVENT_GOT_KENYA: true, EVENT_GAVE_KENYA: true } });
	await talk();
	const b3 = await bag(), s3 = await story();
	A((b3.hpup || 0) === 1 && s3.flags.EVENT_GOT_HP_UP_FROM_RANDY === true, '3. RANDY: "something for your trouble" - an HP UP', JSON.stringify([b3, s3.flags.EVENT_GOT_HP_UP_FROM_RANDY]));

	A(!errors.length, 'no page errors', errors.join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + (e.stack || e).toString().split('\n').slice(0, 2).join(' '));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
