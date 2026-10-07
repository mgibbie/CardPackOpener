// contest_hall_test.mjs — the Lilycove CONTEST played through the game (headless).
//
// Talk to the reception counter and walk pokeemerald's script with the keys:
// the receptionist's lines, ENTER -> NORMAL RANK -> COOLNESS CONTEST -> the
// entrant -> "Entry No. 4"; the MC's introduction; five appeals picked on the
// move-select screen; the results board; then the hall's prize scripts — the
// COOL NORMAL RIBBON on the winner (saved with the party), the quest log's rank,
// the journal. A second POKeMON without that ribbon is turned away from the
// SUPER rank ("not qualified").
//
//   node overworld/tests/contest_hall_test.mjs
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra ? '  ' + extra : '')); } };

const D = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/contest_emerald.json'), 'utf8'));
// four distinct COOL HIGHLY_APPEALING moves the build knows
const BATTLE = JSON.parse(fs.readFileSync(path.join(ROOT, 'overworld/data/moves_battle.json'), 'utf8'));
const COOL = Object.keys(D.moves).filter(id => D.moves[id].cat === 0 && D.moves[id].fx === 0 && (BATTLE[id] || BATTLE.moves?.[id])).slice(0, 4);

const puppeteer = (await import('puppeteer-core')).default;
const http = await import('http');
const CHROME = process.env.CHROME || [
	'/opt/chrome/chrome',
	'C:/Program Files/Google/Chrome/Application/chrome.exe',
	'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe',
	'C:/Program Files/Microsoft/Edge/Application/msedge.exe',
].find(p => fs.existsSync(p));
const PORT = 9240;
const STATE = { username: 'smoke', friendCode: 'SMOKEE', decks: [], collection: {}, packs: 0, packInbox: 0, stats: { runs: 0, wins: 0 } };
const mon = (name, speciesId, num, sprite) => ({
	speciesId, name, level: 30, gender: 'F', friend: 70, types: ['Normal'],
	ivs: { hp: 15, atk: 15, def: 15, spa: 15, spd: 15, spe: 15 },
	stats: { hp: 80, atk: 40, def: 40, spa: 40, spd: 40, spe: 40 }, maxHP: 80, curHP: 80, hp: 80,
	exp: 27000, moves: COOL.map(id => ({ id, name: id, pp: 10, maxPp: 10 })), sprite, num,
	contest: { cool: 255, beauty: 255, cute: 0, smart: 0, tough: 255, sheen: 255 },
});
const PARTY = [mon('STARLET', 'rattata', 19, 's608.png'), mon('ROOKIE', 'rattata', 19, 's608.png')];
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
const wait = ms => new Promise(r => setTimeout(r, ms));
try {
	A(COOL.length === 4, 'four COOL HIGHLY_APPEALING moves to enter with', COOL.join(','));
	browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader'] });
	const page = await browser.newPage();
	const errors = [];
	page.on('pageerror', e => errors.push(e.message));
	await page.evaluateOnNewDocument((st, party) => {
		localStorage.setItem('magepunk_mp_token_v1', 'smoke-token');
		localStorage.setItem('magepunk_mp_state_v1', JSON.stringify(st));
		localStorage.setItem('magepunk_party_v1', JSON.stringify(party));
		localStorage.setItem('magepunk_region', 'HOENN');
		localStorage.setItem('magepunk_name', 'MAY');
		localStorage.setItem('magepunk_story', JSON.stringify({ flags: { intro_done: true, story_seeded: true, intro_started: true, intro_greeted: true }, vars: {} }));
	}, STATE, PARTY);
	await page.goto(`http://localhost:${PORT}/overworld/index.html?map=LilycoveCity_ContestLobby&x=14&y=5`, { waitUntil: 'domcontentloaded' });
	const t0 = Date.now();
	while (Date.now() - t0 < 40000 && !(await page.evaluate(() => !!window.__ow?.battle?.data).catch(() => false))) await wait(200);
	A(await page.evaluate(() => !!window.__ow?.battle?.data), 'the lobby boots');

	const state = () => page.evaluate(async () => {
		const ow = window.__ow;
		const { choiceMenu } = await import('/overworld/choice.js');
		const { contestView, contestMenu } = await import('/overworld/contest_ui.js');
		const v = contestView();
		return {
			dialog: ow.dialog.blocking ? ow.dialog.pages.map(p => p.join ? p.join(' ') : String(p)).join(' / ') : null,
			choice: choiceMenu.open ? { prompt: choiceMenu.prompt, options: choiceMenu.options.slice() } : null,
			stage: contestMenu.open, phase: v.phase, text: v.text, waiting: v.waiting,
		};
	});
	const pick = async i => {
		await page.evaluate(async i => { const { choiceMenu } = await import('/overworld/choice.js'); choiceMenu.idx = i; }, i);
		await page.keyboard.press('z');
		await wait(120);
	};
	const seen = [];
	// advance dialogs until a choice opens (or the stage, or nothing)
	const toChoice = async () => {
		for (let i = 0; i < 40; i++) {
			const s = await state();
			if (s.choice || s.stage) return s;
			if (s.dialog) { seen.push(s.dialog); await page.keyboard.press('z'); await wait(80); continue; }
			await wait(120);
		}
		return state();
	};

	// --- the reception counter ---
	await page.evaluate(async () => {
		const { contestMenu } = await import('/overworld/contest_ui.js');
		contestMenu.seed = 7; contestMenu.fast = true;
		const p = window.__ow.player;
		p.tx = 14; p.ty = 3; p.px = 14 * 16; p.py = 3 * 16; p.facing = 'up';
		window.__ow.interact();
	});
	await wait(300);
	let s = await toChoice();
	A(seen.some(t => /reception counter for/.test(t) && /CONTESTS/.test(t)), "the receptionist's greeting is the decomp's", seen.join(' | '));
	A(s.choice && /enter your/.test(s.choice.prompt) && s.choice.options.join() === 'ENTER,INFO,EXIT', 'MULTI_ENTERINFO: ENTER / INFO / EXIT', JSON.stringify(s.choice));
	await pick(1); // INFO
	s = await toChoice();
	A(s.choice && /Which topic/.test(s.choice.prompt), 'INFO opens the topics (MULTI_CONTEST_INFO)', JSON.stringify(s.choice));
	await pick(3); // CANCEL -> back to the question
	s = await toChoice();
	await pick(0); // ENTER
	s = await toChoice();
	A(s.choice && /Which Rank/.test(s.choice.prompt) && s.choice.options[3] === 'MASTER RANK', 'the rank comes first (MULTI_CONTEST_RANK)', JSON.stringify(s.choice));
	await pick(0); // NORMAL
	s = await toChoice();
	A(s.choice && /Which CONTEST/.test(s.choice.prompt) && s.choice.options[0] === 'COOLNESS CONTEST', 'then the category (MULTI_CONTEST_TYPE)', JSON.stringify(s.choice));
	await pick(0); // COOL
	s = await toChoice();
	A(s.choice && /Which POK.MON/.test(s.choice.prompt) && /STARLET/.test(s.choice.options[0]), 'then the entrant', JSON.stringify(s.choice));
	seen.length = 0;
	await pick(0);
	s = await toChoice();
	A(seen.some(t => /Entry No\. 4/.test(t)), '"Your POKeMON is Entry No. 4."', seen.join(' | '));
	A(s.stage, 'the contest screen opens');

	// --- the contest: play every text and every move select ---
	const stageTexts = [];
	let selects = 0, shot = false;
	for (let i = 0; i < 600; i++) {
		s = await state();
		if (!s.stage) break;
		if (s.text && stageTexts[stageTexts.length - 1] !== s.text) stageTexts.push(s.text.replace(/\n/g, ' '));
		if (s.phase === 'select' && s.waiting) {
			if (!shot) { await page.screenshot({ path: path.join(HERE, 'contest_select_shot.png') }); }
			selects++;
			for (let k = 0; k < selects % 4; k++) { await page.keyboard.press('ArrowDown'); await wait(40); }
			await page.keyboard.press('z');
			await wait(80);
			continue;
		}
		if (s.phase === 'stage' && !shot && /appealed with/.test(s.text || '')) { await page.screenshot({ path: path.join(HERE, 'contest_stage_shot.png') }); shot = true; }
		if (s.phase === 'results' && /won!/.test(s.text || '')) await page.screenshot({ path: path.join(HERE, 'contest_results_shot.png') });
		if (s.waiting) { await page.keyboard.press('z'); await wait(60); } else await wait(60);
	}
	A(stageTexts.some(t => /getting started/.test(t) && /NORMAL/.test(t)), "the MC opens the NORMAL rank (ContestHall_Text_GettingStarted…)", stageTexts.slice(0, 3).join(' | '));
	A(stageTexts.some(t => /Entry No\. 4!.*MAY's STARLET/.test(t)), 'the MC presents entry 4, MAY\'s STARLET', stageTexts.slice(0, 8).join(' | '));
	A(selects === 5, 'five appeals, each chosen on the move-select screen', String(selects));
	A(stageTexts.some(t => /^Appeal no\. 5!/.test(t)), '"Appeal no. 5! Which move will be played?"', '');
	A(stageTexts.filter(t => /STARLET appealed with/.test(t)).length === 5, 'STARLET appeals five times', '');
	A(stageTexts.some(t => /all out of Appeal Time/.test(t)), '"We\'re all out of Appeal Time!"', '');
	A(stageTexts.some(t => /Announcing the results/.test(t)) && stageTexts.some(t => /MAY's STARLET won!/.test(t)), 'the results board names the winner', stageTexts.slice(-4).join(' | '));

	// --- the prizes ---
	seen.length = 0;
	for (let i = 0; i < 40; i++) {
		s = await state();
		if (s.dialog) { seen.push(s.dialog); await page.keyboard.press('z'); await wait(80); continue; }
		if (s.choice) break;
		if (i > 6) break;
		await wait(120);
	}
	A(seen.some(t => /declare the winner/.test(t)) && seen.some(t => /RIBBON as your prize/.test(t)) && seen.some(t => /MAY put the RIBBON on/.test(t)),
		'the hall confers the RIBBON (GiveMonContestRibbon)', seen.join(' | '));
	const after = await page.evaluate(() => {
		const ow = window.__ow;
		return {
			ribbons: ow.party[0].ribbons || [],
			saved: JSON.parse(localStorage.getItem('magepunk_party_v1'))[0].ribbons || [],
			rank: ow.contestProgress().ranks.cool,
			journal: ow.Journal.list()[0]?.text || '',
			open: ow.contestMenu.open,
		};
	});
	A(after.ribbons.join() === 'cool-normal' && after.saved.join() === 'cool-normal', 'the COOL NORMAL RIBBON is on STARLET and saved', JSON.stringify(after));
	A(after.rank === 1 && /Contest/.test(after.journal), 'the quest log and journal remember the win', JSON.stringify(after));
	A(!after.open, 'the contest screen is closed');

	// --- a ribbonless POKeMON can't jump to SUPER ---
	seen.length = 0;
	await page.evaluate(() => window.__ow.interact());
	await wait(200);
	s = await toChoice(); await pick(0);         // ENTER
	s = await toChoice(); await pick(1);         // SUPER RANK
	s = await toChoice(); await pick(0);         // COOL
	s = await toChoice(); seen.length = 0; await pick(1); // ROOKIE
	s = await toChoice();
	A(seen.some(t => /not qualified to compete at this/.test(t)), 'ROOKIE is not qualified for SUPER (GetContestEntryEligibility)', seen.join(' | '));
	A(s.choice && /Which POK.MON/.test(s.choice.prompt), 'and the receptionist asks for another entrant', JSON.stringify(s.choice));
	await pick(2); // CANCEL
	await toChoice();
	for (let i = 0; i < 10 && (await state()).dialog; i++) { await page.keyboard.press('z'); await wait(80); }

	A(errors.length === 0, 'no uncaught page errors', errors.slice(0, 3).join(' | '));
} catch (e) {
	A(false, 'harness crashed: ' + e.message);
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
