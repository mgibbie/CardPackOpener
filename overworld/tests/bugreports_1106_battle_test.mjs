// bugreports_1106_battle_test.mjs — the 2026-11-06 battle / heal reports.
//
//   bug:1793738199065 (Instinct): a PECHA BERRY cured new poison, then "is hurt by its
//     poison!" still took 1/8 — the end-of-turn chip was queued from the status before
//     the berry's queued cure ran. The chip line now re-checks the status when it lands.
//   bug:1793749681977 (Instinct): the S.S. Anne Room 6 rest said everyone was refreshed
//     and healed nobody: FireRed's `call EventScript_OutOfCenterPartyHeal` resolved
//     nowhere (tools/audit_missing_labels.mjs restores it now).
//   bug:1793937291387 (Remytest): a wild DOUBLE replayed from the start on the next boot
//     and paid its EXP again — once the lead foe fainted the battle snapshot froze at
//     the picture taken before the KO (its foe at full HP).
//
//   node overworld/tests/bugreports_1106_battle_test.mjs
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
	'/opt/chrome/chrome',
].find(p => fs.existsSync(p));
const PORT = 9733;
const sleep = ms => new Promise(r => setTimeout(r, ms));
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + extra : '')); } };

// ===== data: the FireRed heal resolves =====
{
	const ov = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/missing_labels_data.json'), 'utf8'));
	const body = ov.scripts?.EventScript_OutOfCenterPartyHeal || [];
	A(body.some(o => o.op === 'special' && o.name === 'HealPlayerParty'),
		'[1793749681977] EventScript_OutOfCenterPartyHeal is restored, and heals', JSON.stringify(body));
}

const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') {
		let raw = ''; for await (const c of req) raw += c;
		let b = {}; try { b = JSON.parse(raw || '{}'); } catch (e) {}
		res.writeHead(200, { 'content-type': 'application/json' });
		if (b.action === 'ow-load') return res.end(JSON.stringify({ ow: null }));
		return res.end(JSON.stringify({ ok: true, state: { username: 'bug1106b', friendCode: 'B1106B', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } }, friends: [], challenges: [] }));
	}
	fs.readFile(path.join(ROOT, u), (e, d) => {
		if (e) { res.writeHead(404); res.end('nf'); return; }
		const t = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png' }[path.extname(u)] || 'application/octet-stream';
		res.writeHead(200, { 'content-type': t }); res.end(d);
	});
});
await new Promise(r => server.listen(PORT, r));

let browser;
const mon = (speciesId, name, extra = {}) => ({
	speciesId, name, level: 40, gender: 'M', friend: 70, types: ['Fire'], ability: 'intimidate',
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 103, atk: 80, def: 80, spa: 80, spd: 80, spe: 200 }, maxHP: 103, curHP: 103,
	exp: 64000, moves: [{ id: 'growl', name: 'Growl', pp: 40, maxPp: 40 }], sprite: 's58.png', num: 58, ...extra,
});
async function open(map, x, y, { region = 'KANTO', party } = {}) {
	const page = await browser.newPage();
	page.on('pageerror', e => console.log('  (pageerror) ' + String(e.message).slice(0, 160)));
	await page.evaluateOnNewDocument((region, party) => {
		if (sessionStorage.getItem('seeded')) return;
		sessionStorage.setItem('seeded', '1');
		localStorage.clear();
		localStorage.setItem('magepunk_mp_token_v1', 't');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify({ username: 'bug1106b', friendCode: 'B1106B', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } }));
		localStorage.setItem('magepunk_region', region);
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
		localStorage.setItem('magepunk_settings', JSON.stringify({ textSpeed: 'instant', battleAnim: 'off' }));
		localStorage.setItem('magepunk_repel_v1', '99999');
	}, region, party);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=${map}&x=${x}&y=${y}`, { waitUntil: 'domcontentloaded' });
	await boot(page, map);
	return page;
}
const boot = async (page, map) => { for (let i = 0; i < 600 && !(await page.evaluate(m => !!(window.__ow?.battle?.data && window.__ow.world?.current?.name === m && window.__ow.player), map).catch(() => false)); i++) await sleep(100); await sleep(1200); };
const drive = (page, ms = 15000) => page.evaluate(async ms => {
	const O = window.__ow;
	const t0 = Date.now(); let calm = 0;
	while (Date.now() - t0 < ms) {
		if (O.battle.active) return 'battle';
		const d = O.dialog.blocking, c = O.cutscene.blocking;
		if (!d && !c && !O.battle.blocking) { if (++calm >= 12) return 'idle'; } else calm = 0;
		if (d) O.dialog.key('z');
		await new Promise(r => setTimeout(r, 40));
	}
	return 'timeout';
}, ms);

try {
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });

	// ===== bug:1793738199065: PECHA BERRY vs the same turn's poison chip =====
	{
		const page = await open('PalletTown', 8, 8, { party: [mon('growlithe', 'GROWLITHE', { heldItem: 'pechaberry' }), mon('growlithe', 'SPARE')] });
		// one turn: our Growl first (we're faster), then the foe's POISON POWDER (the
		// turn's second move, as in the report), then the end of the turn
		const turn = (held) => page.evaluate(async held => {
			const O = window.__ow, b = O.battle;
			const me = O.party[0];
			me.curHP = me.maxHP; me.status = null; delete me.badPsn; me.heldItem = held;
			b.start(O.party, 'tangela', 29, () => {});
			const t0 = Date.now(); while (!b.active && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 50));
			const a = b.active;
			if (!a) return { error: 'no battle' };
			a.foe.moves = [{ id: 'poisonpowder', name: 'Poison Powder', pp: 35, maxPp: 35 }];
			a.foe.stats.spe = 1;
			const lines = [];
			const rnd = Math.random; Math.random = () => 0.01;   // Poison Powder hits
			try {
				// let the intro drain to the menu
				for (let i = 0; i < 400 && a.phase !== 'menu'; i++) { a.meShownHP = a.me.curHP; a.foeShownHP = a.foe.curHP; a.msgT = 99; b.update(0.05); }
				a.phase = 'msg';
				b.resolveTurn(a.me.moves[0]);
				for (let i = 0; i < 600 && a.phase !== 'menu' && a.phase !== 'done'; i++) {
					a.meShownHP = a.me.curHP; a.foeShownHP = a.foe.curHP; a.msgT = 99;
					const before = a.msg; b.update(0.05); if (a.msg !== before && a.msg) lines.push(a.msg);
				}
			} finally { Math.random = rnd; }
			const out = { hp: a.me.curHP, max: a.me.maxHP, status: a.me.status || null, held: a.me.heldItem || null, lines };
			a.phase = 'done'; b.active = null;
			return out;
		}, held);
		const cured = await turn('pechaberry');
		A(!cured.error && cured.lines.some(l => /poisoned/i.test(l)) && cured.lines.some(l => /PECHA BERRY cured/i.test(l)),
			'[1793738199065] POISON POWDER poisons, and the held PECHA BERRY cures it the same turn', JSON.stringify(cured));
		A(cured.status === null && !cured.held, '[1793738199065] the berry is eaten and the status is gone', JSON.stringify(cured));
		A(!cured.lines.some(l => /hurt by its poison/i.test(l)) && cured.hp === cured.max,
			'[1793738199065] ...and no poison chip lands after the cure (HP stays full)', JSON.stringify(cured));
		const plain = await turn(null);
		A(plain.status === 'psn' && plain.lines.some(l => /hurt by its poison/i.test(l)) && plain.hp === plain.max - Math.floor(plain.max / 8),
			'without a berry the same turn still chips floor(maxHP/8)', JSON.stringify(plain));
		await page.close();
	}

	// ===== bug:1793749681977: the S.S. Anne Room 6 rest heals =====
	{
		const page = await open('SSAnne_1F_Room6', 3, 4, { party: [mon('scyther', 'SCYTHER', { maxHP: 94, curHP: 76, stats: { hp: 94, atk: 80, def: 80, spa: 80, spd: 80, spe: 90 } })] });
		const before = await page.evaluate(() => { const m = window.__ow.party[0]; m.curHP = 76; m.status = 'psn'; m.moves[0].pp = 3; return [m.curHP, m.maxHP]; });
		await page.evaluate(() => { window.__ow.player.facing = 'down'; window.__ow.interact(); });
		const r = await drive(page);   // Z answers the "take a short rest?" prompt YES
		const after = await page.evaluate(() => { const m = window.__ow.party[0]; return { hp: m.curHP, max: m.maxHP, status: m.status || null, pp: m.moves[0].pp, maxPp: m.moves[0].maxPp }; });
		A(r === 'idle' && after.hp === after.max && after.status === null && after.pp === after.maxPp,
			'[1793749681977] accepting the Room 6 rest really restores HP, status and PP', JSON.stringify({ r, before, after }));
		await page.close();
	}

	// ===== bug:1793937291387: a wild double's snapshot follows the KO =====
	{
		const party = [mon('venusaur', 'VENUSAUR'), mon('pidgeot', 'PIDGEOT')];
		const page = await open('PalletTown', 8, 8, { party });
		const r = await page.evaluate(async () => {
			const O = window.__ow, b = O.battle;
			// startWildBattle's own call (its partner comes from the map's encounter
			// table, which PalletTown hasn't got): a wild ending, two wild foes
			b.endSpec = { kind: 'wild' };
			b.start(O.party, 'zigzagoon', 30, () => {}, { id: 'poochyena', level: 30 });
			const t0 = Date.now(); while (!b.active?.double && Date.now() - t0 < 15000) await new Promise(r => setTimeout(r, 50));
			const a = b.active;
			if (!a?.double) return { error: 'no double formed' };
			await new Promise(r => setTimeout(r, 2000));   // the start snapshot is written
			const start = JSON.parse(localStorage.getItem('magepunk_battle_v1') || 'null');
			const exp0 = O.party.map(m => m.exp);
			a.foe.curHP = 0; b.checkFaintsD();
			for (let i = 0; i < 400 && a.queue.length; i++) { a.meShownHP = a.me.curHP; a.foeShownHP = a.foe.curHP; a.meAllyShownHP = a.meAlly?.curHP ?? 0; a.foeAllyShownHP = a.foeAlly?.curHP ?? 0; a.msgT = 99; b.update(0.05); }
			await new Promise(r => setTimeout(r, 2200));   // the next periodic snapshot
			const after = JSON.parse(localStorage.getItem('magepunk_battle_v1') || 'null');
			return { startFoeHP: start?.snap?.foe?.curHP ?? null, afterFoeHP: after?.snap?.foe?.curHP ?? null, afterAlly: after?.snap?.foeAlly?.curHP ?? null,
				counted: !!after?.snap?.foe?.faintCounted, expGained: O.party.map((m, i) => m.exp - exp0[i]), lead: a.foe.name };
		});
		A(!r.error && r.startFoeHP > 0, 'a wild double starts and its snapshot is written', JSON.stringify(r));
		A(r.afterFoeHP === 0 && r.counted && r.afterAlly > 0,
			'[1793937291387] after the lead foe faints the saved battle has it fainted (and its EXP paid), the partner still up', JSON.stringify(r));
		// leave and come back: the resumed battle must not bring the fainted foe back
		const exp1 = await page.evaluate(() => window.__ow.party.map(m => m.exp));
		await page.reload({ waitUntil: 'domcontentloaded' });
		await boot(page, 'PalletTown');
		const res = await page.evaluate(async () => {
			const b = window.__ow.battle;
			const t0 = Date.now(); while (!b.active && Date.now() - t0 < 10000) await new Promise(r => setTimeout(r, 50));
			const a = b.active;
			return a ? { double: !!a.double, foeHP: a.foe?.curHP, ally: a.foeAlly?.curHP ?? null, exp: window.__ow.party.map(m => m.exp) } : null;
		});
		A(res && res.double && res.foeHP === 0 && res.ally > 0 && JSON.stringify(res.exp) === JSON.stringify(exp1),
			'[1793937291387] the resumed double keeps the KO: lead foe down, partner fighting, no EXP paid twice', JSON.stringify({ res, exp1 }));
		// finish it: both foes down ends the battle and clears the save
		if (res) {
			await page.evaluate(async () => {
				const b = window.__ow.battle, a = b.active;
				(a.foeAlly || a.foe).curHP = 0; b.checkFaintsD();
				for (let i = 0; i < 800 && b.active && b.active.phase !== 'done'; i++) { const x = b.active; x.meShownHP = x.me?.curHP ?? 0; x.foeShownHP = x.foe?.curHP ?? 0; x.meAllyShownHP = x.meAlly?.curHP ?? 0; x.foeAllyShownHP = x.foeAlly?.curHP ?? 0; x.msgT = 99; b.update(0.05); }
				for (let i = 0; i < 60 && b.blocking; i++) { b.key('z'); b.update(0.5); await new Promise(r => setTimeout(r, 60)); }
				await new Promise(r => setTimeout(r, 300));
			});
			const left = await page.evaluate(() => ({ battle: !!window.__ow.battle.active, saved: localStorage.getItem('magepunk_battle_v1') }));
			A(!left.battle && left.saved === null, 'a finished double leaves nothing to resume', JSON.stringify(left).slice(0, 200));
		}
		await page.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
