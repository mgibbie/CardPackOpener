// poketactica_page_test.mjs — Poketactica's page (stage 4; the camp and touch rework 2026-11-21): it boots on MicaSurvivor 3D's renderer with the Balatro HUD,
// and the whole game plays by keyboard, by controller and by touch (the house rules: Plans/NEW_GAME_RULES.md). The arrow
// keys move the cursor the way they point ON SCREEN (Disgaea's diamond: up = up-right), also after the camera turns; the
// whole board fits a phone upright and on its side; no page errors.
// Needs headless Chrome/Edge + overworld/data + micasurvivor/assets (the PMD sheets).
//   node overworld/tests/poketactica_page_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import puppeteer from 'puppeteer-core';

const ROOT = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../..');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', 'C:/Program Files/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find((p) => fs.existsSync(p));
const PORT = 8933;
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null && extra !== '' ? '  ' + extra : '')); } };
const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.ttf': 'font/ttf', '.ogg': 'audio/ogg', '.wav': 'audio/wav' };
const BTN = { cancel: 0, confirm: 1, up: 12, down: 13, left: 14, right: 15 };

const server = http.createServer((req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { req.resume(); res.writeHead(200, { 'content-type': 'application/json' }); res.end('{"ok":false}'); return; }
	let f = path.join(ROOT, u); if (u.endsWith('/')) f = path.join(f, 'index.html');
	fs.readFile(f, (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise((r) => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox', '--enable-unsafe-swiftshader', '--use-angle=swiftshader'] });

// a saved collection: three level-10 figurines (so a run starts at the team screen, not the starter pick)
const FIGS3 = JSON.stringify({ v: 1, starters: true, figs: Object.fromEntries(['pikachu', 'machamp', 'charmander'].map((sp, i) => [sp + '-seed' + i, { v: 1, id: sp + '-seed' + i, species: sp, level: 10, exp: 0, ability: null, shiny: false, pool: [{ id: sp === 'pikachu' ? 'thundershock' : sp === 'machamp' ? 'karatechop' : 'ember', lv: 1, xp: 0 }], equipped: [sp === 'pikachu' ? 'thundershock' : sp === 'machamp' ? 'karatechop' : 'ember'] }])) });
async function open(vp, figs = null) {
	const ctx = await browser.createBrowserContext();
	const page = await ctx.newPage();
	await page.setViewport(vp);
	const errors = [];
	page.on('pageerror', (e) => errors.push(e.message));
	await page.evaluateOnNewDocument((figs) => {
		try { localStorage.setItem('micatro_sfx', '0'); if (figs && !sessionStorage.getItem('seeded')) { localStorage.setItem('magepunk_poketactica_figs_v1', figs); sessionStorage.setItem('seeded', '1'); } } catch { /* ignore */ }
		const pad = { id: 'Pro Controller (STANDARD GAMEPAD Vendor: 057e)', index: 0, connected: true, mapping: 'standard', timestamp: 0, axes: [0, 0, 0, 0], buttons: Array.from({ length: 17 }, () => ({ pressed: false, value: 0, touched: false })) };
		window.__owFakePads = [pad]; window.__pad = pad;
	}, figs);
	await page.goto(`http://localhost:${PORT}/poketactica/`, { waitUntil: 'domcontentloaded' });
	const t0 = Date.now();
	while (Date.now() - t0 < 45000 && !(await page.evaluate(() => !!(window.__poketactica && window.__poketactica.ready)).catch(() => false))) await sleep(200);
	await sleep(800);
	const t = { ctx, page, errors };
	t.key = async (k, ms = 140) => { await page.keyboard.press(k); await sleep(ms); };
	t.idle = () => page.evaluate(() => new Promise((r) => { const s = Date.now(); const k = () => (!window.__poketactica.P.busy || Date.now() - s > 20000 ? r() : setTimeout(k, 80)); k(); }));
	t.st = () => page.evaluate(() => { const P = window.__poketactica.P, S = P.S; return { base: { ...S.map.base }, phase: S.phase, turn: S.turn, mode: P.mode, cursor: { ...P.cursor }, units: S.units.map((u) => ({ uid: u.uid, side: u.side, x: u.x, y: u.y, hp: u.hp, moved: u.moved, acted: u.acted })), queue: S.queue.length, menu: P.menu ? P.menu.items.map((i) => i.label.replace(/<[^>]+>/g, '')) : null }; });
	t.tap = async (b) => { await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: true, value: 1, touched: true }; window.__pad.timestamp++; }, b); await sleep(160); await page.evaluate((b) => { window.__pad.buttons[b] = { pressed: false, value: 0, touched: false }; window.__pad.timestamp++; }, b); await sleep(200); };
	return t;
}

const hubScreen = (p) => p.evaluate(() => (window.__poketactica.P.screen === 'camp' || window.__poketactica.P.screen === 'help') && window.__poketactica.hub.H.screen);
const focusLabel = (p) => p.evaluate(() => window.__poketactica.hub.focusLabel());
const labels = (p) => p.evaluate(() => window.__poketactica.hub.labels());
const centre = (p, sel, i = 0) => p.evaluate((s, i) => { const el = document.querySelectorAll(s)[i]; if (!el) return null; const r = el.getBoundingClientRect(); return [r.x + r.width / 2, r.y + r.height / 2]; }, sel, i);

try {
	// ---------- keyboard: a new player's starters, the camp, then a battle: deploy, move, attack, execute, end turn
	{
		const t = await open({ width: 1280, height: 760 });
		const p = t.page;
		A(await p.evaluate(() => window.__poketactica.ready && !!document.querySelector('#c')), 'the page boots (renderer, data, the battle)');
		A(await p.evaluate(() => getComputedStyle(document.getElementById('boot')).display === 'none'), 'the loading screen goes away');
		// REGRESSION: the sprites' shader keeps its own fog (MicaSurvivor's 26-78 m); this camera is 60 m away, so left alone every
		// sprite came out 65% sky-blue. The page moves it off the board with render.js setFog.
		await p.evaluate(() => window.__poketactica.hub.close());   // (peek at the board the camp covers)
		const sprites = await p.evaluate(() => new Promise((r) => setTimeout(() => r((window.__poketactica.P.drawn || []).length), 1500)));
		A(sprites >= 4, 'the wild Pokémon are drawn as sprites', sprites);
		const fogNear = await p.evaluate(() => { for (const s of window.__poketactica.sheets.values()) if (s) return s.batch.material.uniforms.uFogNear.value; return null; });
		A(fogNear > 200, "the sprites are not fogged (their shader's fog starts beyond the board)", fogNear);
		await p.evaluate(() => window.__poketactica.hub.starters());
		// (stage 5; the camp, 2026-11-21) a new player first picks three starters: a grid of cards, the arrows move as they point
		A(await hubScreen(p) === 'starters' && await p.evaluate(() => !document.getElementById('hub').hidden && document.querySelectorAll('#hub .ph-card').length >= 9), 'a new player is shown the starters as a grid of cards, over the board');
		A(/Bulbasaur/.test(await focusLabel(p)), 'the focus starts on the first card', await focusLabel(p));
		await t.key('ArrowRight');
		A(/Charmander/.test(await focusLabel(p)), '→ moves to the card on its right', await focusLabel(p));
		const under = await p.evaluate(() => { const els = [...document.querySelectorAll('#hub .ph-card')]; const a = els[1].getBoundingClientRect(); return els.findIndex((e) => { const r = e.getBoundingClientRect(); return Math.abs(r.x - a.x) < 4 && r.y > a.y + 10; }); });
		await t.key('ArrowDown');
		A(await p.evaluate((i) => document.querySelectorAll('#hub .ph-card')[i].classList.contains('is-focus'), under), '↓ moves to the card under it', await focusLabel(p));
		await t.key('ArrowUp'); await t.key('ArrowLeft');
		await t.key('KeyZ'); await t.key('ArrowRight'); await t.key('KeyZ'); await t.key('ArrowRight'); await t.key('KeyZ');
		await t.key('ArrowRight'); await t.key('KeyZ');   // a fourth is refused while three are picked
		const picked = await p.evaluate(() => window.__poketactica.hub.H.pick.slice());
		A(picked.length === 3 && picked[0] === 'bulbasaur', 'three are picked (a fourth is refused)', picked);
		await t.key('ArrowUp');
		A(/Take these three/.test(await focusLabel(p)), '↑ from the top row reaches "Take these three"', await focusLabel(p));
		await t.key('KeyZ', 200);
		// REGRESSION: the kit's toast is drawn only with is-show; without it every toast stayed at opacity 0
		const toastSeen = await p.evaluate(() => { const el = document.getElementById('toast'); return !el.hidden && +getComputedStyle(el).opacity > 0.5 && /first figurines/.test(el.textContent); });
		A(toastSeen, 'a toast can be seen ("Your first figurines!")');
		await sleep(250);
		const col = await p.evaluate(() => Object.values(JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')).figs).map((f) => f.species + ':' + f.level));
		A(col.length === 3 && col.every((x) => x.endsWith(':5')), 'they join the collection at level 5, kept on the device', col);
		// the castle (Disgaea's hub): Continue, Story, Dungeon (shut), Training, Squad, How to play
		const home = await labels(p);
		A(await hubScreen(p) === 'home' && /Continue.*First Steps/.test(home[0]) && /Story/.test(home[1]) && /Dungeon/.test(home[2]) && /Training/.test(home[3]) && /Squad/.test(home[4]) && /How to play/.test(home[5]), 'then the camp: Continue (First Steps), Story, Dungeon, Training, Squad, How to play', home);
		A(await p.evaluate(() => document.querySelector('#hub [data-nav="2"]').getAttribute('aria-disabled') === 'true'), 'the Dungeon is shut until chapter 1 is cleared');
		A(await p.evaluate(() => /First Steps/.test(document.querySelector('#hub .ph-detail').textContent) && /Rattata Lv 3/.test(document.querySelector('#hub .ph-detail').textContent)), "the side panel shows the focused button's details (the map, its foes)");
		// Squad: a figurine's status; Z opens its moves
		await t.key('ArrowDown'); await t.key('ArrowDown'); await t.key('ArrowDown'); await t.key('ArrowDown');
		A(/Squad/.test(await focusLabel(p)), '↓ walks down the camp menu (over the shut Dungeon too)', await focusLabel(p));
		await t.key('KeyZ', 250);
		A(await hubScreen(p) === 'squad' && await p.evaluate(() => /HP/.test(document.querySelector('#hub .ph-detail').textContent) && /Ability/.test(document.querySelector('#hub .ph-detail').textContent)), "Squad: each figurine's status (stats, ability, moves)");
		// (to a figurine with two moves equipped: the cards are in the camp's order)
		const two = await p.evaluate(() => { const c = JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')); const names = [...document.querySelectorAll('#hub .ph-card-name')].map((e) => e.textContent.toLowerCase()); return names.findIndex((n) => Object.values(c.figs).some((f) => f.species === n && f.equipped.length >= 2)); });
		for (let i = 0; i < two; i++) await t.key('ArrowRight');
		await t.key('KeyZ', 250);
		A(two >= 0 && await hubScreen(p) === 'moves', 'Z on a figurine opens its moves', two);
		const eqn = () => p.evaluate(() => { const c = JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')); return Object.values(c.figs).reduce((a, f) => a + f.equipped.length, 0); });
		const eq0 = await eqn();
		await t.key('KeyZ', 250);
		const eq1 = await eqn();
		A(eq1 === eq0 - 1, 'Z unequips a move (kept in the saved collection)', [eq0, eq1]);
		await t.key('ArrowDown'); await t.key('KeyZ', 250);
		A(await eqn() === eq1, "the last equipped move can't be taken off");
		await t.key('ArrowUp'); await t.key('KeyZ', 250);
		A(await eqn() === eq0, 'Z equips it again');
		await t.key('KeyX', 250); await t.key('KeyX', 250);
		A(await hubScreen(p) === 'home', 'X goes back, screen by screen, to the camp');
		// Story: a chapter's maps
		await t.key('ArrowUp'); await t.key('ArrowUp'); await t.key('ArrowUp'); await t.key('KeyZ', 250);
		const story = await labels(p);
		A(await hubScreen(p) === 'stages' && story.some((l) => /1-1\s*First Steps\s*New/.test(l)) && story.some((l) => /1-2\s*\?\?\?/.test(l)), 'Story: the chapter\'s maps (the first new, the rest shut)', story);
		await t.key('KeyE', 200);
		A(await p.evaluate(() => window.__poketactica.hub.H.chapter) === 2, 'E changes chapter');
		await t.key('KeyQ', 200); await t.key('KeyX', 250);
		// Continue: the next map at once, with the team
		await t.key('ArrowUp'); await t.key('KeyZ', 700);
		let s = await t.st();
		A(s.units.filter((u) => u.side === 'p').length === 3, 'Continue: the three starters are the team', s.units.map((u) => u.uid));
		const base0 = await p.evaluate(() => ({ ...window.__poketactica.P.S.map.base, name: window.__poketactica.P.S.map.name }));
		A(base0.name === 'First Steps', 'a new player starts on the first campaign map', base0.name);
		A(await p.evaluate(() => document.getElementById('hub').hidden), 'the camp closes for the battle');
		A(s.cursor.x === base0.x && s.cursor.y === base0.y, 'the cursor starts on the base tile');
		const tip = await p.evaluate(() => { const el = document.getElementById('tip'); const r = el.getBoundingClientRect(); return { shown: !el.hidden, text: el.textContent, inView: r.left >= 0 && r.right <= innerWidth && r.top >= 0 }; });
		A(tip.shown && /First Steps/.test(tip.text) && /Execute/.test(tip.text) && tip.inView, 'the map tip shows as it starts, on screen', tip);
		// the arrows point the way they move on screen (Disgaea's diamond): up = up-right, right = down-right
		const scr = (x, y) => p.evaluate((x, y) => window.__poketactica.screenOf(x, y), x, y);
		const dirOK = async (k, wantDx, wantDy) => { const a = await t.st(); const s0 = await scr(a.cursor.x, a.cursor.y); await t.key(k); const b = await t.st(); const s1 = await scr(b.cursor.x, b.cursor.y); return Math.sign(s1[0] - s0[0]) === wantDx && Math.sign(s1[1] - s0[1]) === wantDy; };
		await t.key('ArrowLeft'); await t.key('ArrowDown');   // (off the board's edge first)
		A(await p.evaluate(() => document.getElementById('tip').hidden), 'a key closes the tip');
		A(await dirOK('ArrowUp', 1, -1) && await dirOK('ArrowRight', 1, 1) && await dirOK('ArrowDown', -1, 1) && await dirOK('ArrowLeft', -1, -1), 'the arrows move the cursor the way they point on screen');
		await t.key('KeyE', 300);
		A(await dirOK('ArrowUp', 1, -1) && await dirOK('ArrowRight', 1, 1), '... and still do after E turns the camera');
		await t.key('KeyQ', 300);
		A(/on your base/.test(await p.evaluate(() => document.getElementById('hint').textContent)), 'the hint line says how to deploy', await p.evaluate(() => document.getElementById('hint').textContent));
		await p.evaluate(() => { const P = window.__poketactica.P; P.cursor = { ...P.S.map.base }; });
		// the base panel (Disgaea's): Z on the empty base lists the reserve; Z deploys, and its commands open
		await t.key('KeyZ', 300);
		s = await t.st();
		A(s.mode === 'deploy' && s.menu && s.menu.length === 3 && await p.evaluate(() => /Base panel/.test(document.getElementById('menu-title').textContent)), 'Z on the empty base opens the base panel: the three in reserve', JSON.stringify(s.menu));
		await t.key('KeyZ', 400); await t.idle();
		s = await t.st();
		const p0 = s.units.find((u) => u.uid === 'p0');
		A(p0.x === base0.x && p0.y === base0.y, 'Z deploys the first');
		A(s.mode === 'unit' && s.menu && s.menu.includes('Move') && s.menu.includes('Attack') && s.menu.includes('Status'), "... and its commands open (Move, Attack, Status)", JSON.stringify(s.menu));
		await t.key('KeyZ');   // Move
		const goal = await p.evaluate(() => { const P = window.__poketactica.P; return P.hl.move.filter(([x, y]) => x !== P.S.map.base.x || y !== P.S.map.base.y)[0]; });
		await p.evaluate((g) => { window.__poketactica.P.cursor = { x: g[0], y: g[1] }; }, goal);
		await t.key('KeyZ', 300); await t.idle();
		s = await t.st();
		const moved = s.units.find((u) => u.uid === 'p0');
		A(moved.x === goal[0] && moved.y === goal[1] && moved.moved, 'Move, then Z on a highlighted tile moves it', JSON.stringify([goal, moved]));
		A(s.mode === 'unit' && s.menu.includes('Undo move') && !s.menu.includes('Move'), '... and its commands come back (Undo move; no second Move)', JSON.stringify(s.menu));
		await t.key('KeyX', 200);
		// End the turn by keyboard: Enter -> the field menu -> End turn
		await t.key('Enter');
		s = await t.st();
		A(s.mode === 'field' && s.menu && s.menu[0].startsWith('Execute') && s.menu.some((l) => /^End turn/.test(l)) && s.menu.includes('Give up'), 'Enter opens the field menu (Execute, End turn, …, Give up)', JSON.stringify(s.menu));
		A(await p.evaluate(() => window.__poketactica.P.menu.i) === 1, '... focused on End turn (nothing is queued to Execute)');
		await t.key('KeyZ', 400); await t.idle();
		s = await t.st();
		A(s.turn === 2 && s.phase === 'player', 'End turn plays the enemy phase; it is turn 2', JSON.stringify([s.turn, s.phase]));
		// the battle's results reach the collection: end it as won with EXP owed to the first figurine, open the results
		const before5 = await p.evaluate(() => { const P = window.__poketactica.P; const id = P.teamMap.p0; return JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')).figs[id].level; });
		await p.evaluate(() => { const S = window.__poketactica.P.S; S.over = 'won'; S.phase = 'won'; S.exp = { p0: 90000 }; });
		await t.key('KeyZ', 500);
		const after5 = await p.evaluate(() => { const P = window.__poketactica.P; const id = P.teamMap.p0; return { lv: JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')).figs[id].level, shown: !document.getElementById('result').hidden, text: document.getElementById('r-body').innerText, next: (document.querySelector('#result .pt-next') || {}).textContent }; });
		A(after5.shown && after5.lv > before5 && /Lv \d+ → \d+/.test(after5.text), "a finished battle's EXP grows the figurine in the saved collection, and the results say so", JSON.stringify([before5, after5.lv]));
		A(/First clear of First Steps/.test(after5.text), 'the first clear of a campaign map says so on the results', after5.text);
		A(/Next: Combo Field/.test(after5.next || ''), 'the results offer the next map', after5.next);
		const saved5 = await p.evaluate(() => JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')).cleared || []);
		A(saved5.includes('c1-1'), 'the cleared map is kept in the saved collection', saved5);
		await t.key('KeyX', 400);
		A(await hubScreen(p) === 'home', 'X on the results goes back to camp');
		A(/Continue.*Combo Field/.test((await labels(p))[0]), "camp's Continue now offers the next map", (await labels(p))[0]);
		await t.key('ArrowDown'); await t.key('KeyZ', 250);
		const ml = await labels(p);
		A(ml.some((l) => /1-1\s*First Steps\s*✓/.test(l)) && ml.some((l) => /1-2\s*Combo Field\s*New/.test(l)) && ml.some((l) => /1-3\s*\?\?\?/.test(l)), 'Story: the cleared map ticked, the next open and new, the one after shut', ml);
		await t.key('KeyX', 250);
		// Training: the team screen, then Sortie!
		await t.key('ArrowDown'); await t.key('ArrowDown'); await t.key('KeyZ', 250);
		A(await hubScreen(p) === 'team' && /Sortie/.test(await focusLabel(p)), 'Training opens the team screen, focused on Sortie!');
		await t.key('ArrowDown'); await t.key('KeyZ', 250);
		A(/Sortie! 2\/6/.test((await labels(p)).find((l) => /Sortie/.test(l))), 'Z on a card takes it out of the team (Sortie! 2/6)', await labels(p));
		await t.key('KeyZ', 250);
		await t.key('ArrowUp'); await t.key('KeyZ', 700);
		A(await p.evaluate(() => window.__poketactica.P.S.map.name === 'Training Grounds' && window.__poketactica.P.S.units.filter((u) => u.side === 'p').length === 3), 'Sortie! plays the Training Grounds with the team');
		// Give up (the field menu): back to camp, nothing counted
		await t.key('Enter'); await t.key('ArrowUp'); await t.key('ArrowUp'); await t.key('KeyZ', 250);
		s = await t.st();
		A(s.mode === 'giveup' && s.menu.includes('Keep playing'), 'Give up asks first');
		await t.key('ArrowUp'); await t.key('KeyZ', 400);
		A(await hubScreen(p) === 'home', '... and goes back to camp');
		A(t.errors.length === 0, 'no page errors (keyboard run)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
	// ---------- the dungeon (stage 7): a player past the campaign with a floor-10 checkpoint
	{
		const col = JSON.parse(FIGS3); col.cleared = ['c1-1', 'c1-2', 'c1-3', 'c1-4', 'c1-5', 'c2-1', 'c2-2', 'c2-3', 'c3-1', 'c3-2']; col.deep = 10;
		const t = await open({ width: 1280, height: 760 }, JSON.stringify(col));
		const p = t.page, first = async () => (await labels(p))[0];
		A(/Continue.*Dungeon · floor 11/.test(await first()), 'with the campaign cleared, Continue offers the Dungeon, from the floor after the checkpoint', await first());
		await t.key('ArrowDown'); await t.key('ArrowDown'); await t.key('KeyZ', 300);
		const dl = await labels(p);
		A(await hubScreen(p) === 'dungeon' && dl.some((l) => /New run from floor 1(?!\d)/.test(l)) && dl.some((l) => /New run from floor 11\s*Checkpoint/.test(l)), 'the Dungeon screen: a new run from floor 1 or the checkpoint', dl);
		await t.key('KeyX', 300); await t.key('ArrowUp'); await t.key('ArrowUp'); await t.key('KeyZ', 700);
		const b = await p.evaluate(() => { const S = window.__poketactica.P.S; return { name: S.map.name, foes: S.units.filter((u) => u.side === 'e').length, tip: document.getElementById('tip').textContent }; });
		A(b.name === 'Dungeon floor 11' && b.foes === 4 && /floor 20/.test(b.tip), 'Continue starts floor 11: its foes, a tip naming the next boss floor', b);
		await p.evaluate(() => { const S = window.__poketactica.P.S; S.over = 'won'; S.phase = 'won'; });
		await t.key('KeyZ', 500);
		const r = await p.evaluate(() => ({ text: document.getElementById('r-body').innerText, run: JSON.parse(localStorage.getItem('magepunk_poketactica_dungeon_v1') || 'null'), next: (document.querySelector('#result .pt-next') || {}).textContent }));
		A(/Floor 11 cleared! \+32 ★/.test(r.text) && /next: floor 12/.test(r.text) && r.run && r.run.floor === 12, 'a won floor pays its stars and the run goes one floor down (kept on the device)', r);
		A(/Next: floor 12/.test(r.next || ''), 'the results offer the next floor', r.next);
		await t.key('KeyZ', 700);
		A(await p.evaluate(() => window.__poketactica.P.S.map.name === 'Dungeon floor 12' && document.getElementById('result').hidden), 'Z on the results goes straight on to floor 12');
		// a boss floor: its figurine and a new checkpoint (synced with the collection)
		// (give floor 12 up: the run waits there; then pretend it reached floor 20)
		await t.key('Enter'); await t.key('ArrowUp'); await t.key('ArrowUp'); await t.key('KeyZ', 250); await t.key('ArrowUp'); await t.key('KeyZ', 400);
		A(await hubScreen(p) === 'home' && /Dungeon · floor 12/.test(await first()), 'Give up on a floor: back to camp, the run waits on that floor', await first());
		await p.evaluate(() => { const r = JSON.parse(localStorage.getItem('magepunk_poketactica_dungeon_v1')); localStorage.setItem('magepunk_poketactica_dungeon_v1', JSON.stringify({ seed: r.seed, floor: 20 })); window.__poketactica.hub.H.target = null; window.__poketactica.hub.home(); });
		await t.key('KeyZ', 700);
		A(await p.evaluate(() => window.__poketactica.P.S.map.name === 'Dungeon floor 20 · Boss'), 'floor 20 is a boss floor');
		await p.evaluate(() => { const S = window.__poketactica.P.S; S.over = 'won'; S.phase = 'won'; });
		await t.key('KeyZ', 500);
		const r2 = await p.evaluate(() => ({ text: document.getElementById('r-body').innerText, col: JSON.parse(localStorage.getItem('magepunk_poketactica_figs_v1')) }));
		A(/Floor 20 cleared!/.test(r2.text) && /figurine \(Lv \d+\)/.test(r2.text) && /checkpoint: new runs can start on floor 21/.test(r2.text), 'a boss floor pays its figurine and sets a checkpoint', r2.text);
		A(r2.col.deep === 20 && Object.values(r2.col.figs).some((f) => f.from === 'dungeon'), 'the checkpoint and the boss figurine are in the saved collection', { deep: r2.col.deep });
		await t.key('KeyZ', 700);
		// a lost floor ends the run; the next starts from the deepest checkpoint
		await p.evaluate(() => { const S = window.__poketactica.P.S; S.over = 'lost'; S.phase = 'lost'; });
		await t.key('KeyZ', 500);
		const r3 = await p.evaluate(() => ({ text: document.getElementById('r-body').innerText, run: localStorage.getItem('magepunk_poketactica_dungeon_v1'), next: !!document.querySelector('#result .pt-next') }));
		A(/The run ends on floor 21/.test(r3.text) && /floor 1, 11, 21/.test(r3.text) && r3.run === null && !r3.next, 'a lost floor ends the run (no "next" to offer)', r3);
		await t.key('KeyZ', 400);
		A(await hubScreen(p) === 'home' && /Dungeon · floor 21/.test(await first()), 'Z goes back to camp; Continue starts a new run on the floor after the deepest checkpoint', await first());
		A(t.errors.length === 0, 'no page errors (dungeon run)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
	// ---------- controller only
	{
		const t = await open({ width: 1280, height: 760 }, FIGS3);
		A(await hubScreen(t.page) === 'home', 'controller: a player with figurines starts at the camp');
		await t.tap(BTN.down); await t.tap(BTN.up);
		A(/Continue/.test(await focusLabel(t.page)), 'controller: the d-pad moves through the camp');
		await t.tap(BTN.confirm); await sleep(600);
		A((await t.st()).units.filter((u) => u.side === 'p').length === 3, 'controller: A on Continue starts the battle with the team');
		await t.tap(BTN.confirm);
		let s = await t.st();
		A(s.mode === 'deploy', 'controller: A on the base opens the base panel');
		await t.tap(BTN.confirm); await t.idle();
		s = await t.st();
		A(s.units.find((u) => u.uid === 'p0').x === s.base.x && s.mode === 'unit', 'controller: A deploys, and its commands open');
		await t.tap(BTN.down);
		A((await t.page.evaluate(() => window.__poketactica.P.menu.i)) === 1, 'controller: the d-pad moves through the menu');
		await t.tap(BTN.cancel);
		s = await t.st();
		A(s.mode === 'idle' && !s.menu, 'controller: B backs out');
		const c0 = s.cursor; await t.tap(BTN.up); s = await t.st();
		A(s.cursor.x !== c0.x || s.cursor.y !== c0.y, 'controller: the d-pad moves the cursor');
		A(t.errors.length === 0, 'no page errors (controller run)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
	// ---------- touch, both orientations (owner, 2026-11-21: "on a phone I couldn't move my characters")
	for (const [name, vp] of [['portrait', { width: 390, height: 844, isMobile: true, hasTouch: true }], ['landscape', { width: 844, height: 390, isMobile: true, hasTouch: true }]]) {
		const t = await open(vp, FIGS3);
		const p = t.page, tap = async (xy, ms = 450) => { await p.touchscreen.tap(xy[0], xy[1]); await sleep(ms); };
		const scr = (x, y) => p.evaluate((x, y) => window.__poketactica.screenOf(x, y), x, y);
		A(await p.evaluate(() => { const r = document.querySelector('#hub .ph-menu').getBoundingClientRect(); return r.width > 0 && r.right <= innerWidth && r.top >= 0; }), `${name}: the camp's menu is on screen`);
		await tap(await centre(p, '#hub [data-nav="0"]'), 800);
		A((await t.st()).units.filter((u) => u.side === 'p').length === 3, `${name}: tapping Continue starts the battle`);
		const fits = await p.evaluate(() => { const S = window.__poketactica.P.S; let ok = true; for (let y = 0; y < S.map.h; y++) for (let x = 0; x < S.map.w; x++) { if (S.map.height[y * S.map.w + x] == null) continue; const [sx, sy] = window.__poketactica.screenOf(x, y); if (sx < 0 || sy < 0 || sx > innerWidth || sy > innerHeight) ok = false; } return ok; });
		A(fits, `${name}: the whole board is on screen`);
		A(/^Tap your base/.test(await p.evaluate(() => document.getElementById('hint').textContent)), `${name}: on a touch screen the hint says "tap"`, await p.evaluate(() => document.getElementById('hint').textContent));
		await tap(await centre(p, '#tip'));
		const base = await p.evaluate(() => window.__poketactica.P.S.map.base);
		await tap(await scr(base.x, base.y));
		let s = await t.st();
		A(s.mode === 'deploy' && s.menu.length === 3, `${name}: one tap on the base opens the base panel`, JSON.stringify([s.mode, s.menu]));
		await tap(await centre(p, '#menu-items .bal-btn', 0)); await t.idle();
		s = await t.st();
		A(s.units.find((u) => u.uid === 'p0').x === base.x && s.mode === 'unit', `${name}: tapping a name deploys it, and its commands open`);
		const lay = await p.evaluate(() => { const m = document.getElementById('menu').getBoundingClientRect(), bar = document.getElementById('b-end').getBoundingClientRect(), u = document.getElementById('unit').getBoundingClientRect(); const over = (a, b) => a.left < b.right && b.left < a.right && a.top < b.bottom && b.top < a.bottom; return { inView: m.left >= 0 && m.right <= innerWidth && m.top >= 0 && m.bottom <= innerHeight, bar: !over(m, bar), unit: !over(m, u), barIn: bar.bottom <= innerHeight && bar.right <= innerWidth }; });
		A(lay.inView && lay.bar && lay.unit && lay.barIn, `${name}: the command window is on screen, clear of the unit panel and the bottom bar`, lay);
		// REGRESSION: a tap on the board while a command window was open pressed its focused command (the tap ran "Move"); now it closes the window
		const away = await p.evaluate(() => { const P = window.__poketactica.P, S = P.S; for (let y = 0; y < S.map.h; y++) for (let x = S.map.w - 1; x >= 0; x--) { if (S.map.height[y * S.map.w + x] == null || window.__poketactica.B.unitAt(S, x, y) || (P.hl.move || []).some(([a, b]) => a === x && b === y) || (x === S.map.base.x && y === S.map.base.y)) continue; const [sx, sy] = window.__poketactica.screenOf(x, y); if (document.elementFromPoint(sx, sy) !== document.getElementById('c')) continue; return [x, y]; } return null; });
		await tap(await scr(away[0], away[1]));
		s = await t.st();
		A(s.mode === 'idle' && !s.menu && !s.units.find((u) => u.uid === 'p0').moved, `${name}: a tap on the board outside the move range closes the commands (it doesn't press one)`, JSON.stringify([s.mode, s.menu, away]));
		// REGRESSION: a tap on a Pokémon's sprite (drawn above its tile) picked the tile behind it; now it picks the Pokémon
		const [fx, fy] = await scr(base.x, base.y);
		const head = await p.evaluate((uid) => { const o = window.__poketactica.P.drawn.find((d) => d.u.uid === uid); return o ? 1 : 0; }, 'p0');
		await tap([fx, fy - Math.round(vp.height > 500 ? 24 : 16)]);
		s = await t.st();
		A(head && s.mode === 'unit' && s.menu.includes('Move'), `${name}: tapping a Pokémon's sprite opens its commands`, JSON.stringify([s.mode, s.cursor]));
		// a tap on a blue tile moves it there at once (no need to press Move)
		const goal = await p.evaluate(() => { const P = window.__poketactica.P, b = P.S.map.base; return P.hl.move.filter(([x, y]) => { const [sx, sy] = window.__poketactica.screenOf(x, y); return Math.abs(x - b.x) + Math.abs(y - b.y) === 2 && document.elementFromPoint(sx, sy) === document.getElementById('c'); })[0]; });
		await tap(await scr(goal[0], goal[1])); await t.idle();
		s = await t.st();
		const m0 = s.units.find((u) => u.uid === 'p0');
		A(m0.x === goal[0] && m0.y === goal[1] && s.mode === 'unit', `${name}: tapping a blue tile moves it there`, JSON.stringify([goal, m0]));
		// Attack: tap the command, the move, then a red tile twice (the first shows the area; the second queues it)
		await tap(await centre(p, '#menu-items .bal-btn', 0)); await tap(await centre(p, '#menu-items .bal-btn', 0));
		const aim = await p.evaluate(() => window.__poketactica.P.hl.aim.find(([x, y]) => { const [sx, sy] = window.__poketactica.screenOf(x, y); return document.elementFromPoint(sx, sy) === document.getElementById('c'); }));
		await tap(await scr(aim[0], aim[1]));
		s = await t.st();
		A(s.mode === 'aim' && s.queue === 0, `${name}: the first tap on a red tile only aims`, JSON.stringify([s.mode, s.queue, aim, s.cursor, s.menu]));
		await tap(await scr(aim[0], aim[1]));
		s = await t.st();
		A(s.queue === 1 && s.mode === 'idle', `${name}: the second tap queues the attack`, JSON.stringify([s.mode, s.queue]));
		await tap(await centre(p, '#b-exec')); await t.idle();
		A((await t.st()).queue === 0, `${name}: the Execute button runs the queue`);
		// a drag looks around (the ground under the finger stays under it); a pinch zooms
		const mid = [Math.round(vp.width / 2), Math.round(vp.height / 2)];
		const tch = await p.touchscreen.touchStart(mid[0], mid[1]);
		for (let i = 1; i <= 6; i++) { await tch.move(mid[0] + i * 8, mid[1] + i * 5); await sleep(30); }
		await tch.end(); await sleep(250);
		const z = await p.evaluate(() => window.__poketactica.P.zoom);
		A(z > 1 && (await t.st()).mode === 'idle', `${name}: a drag pans (zooming in a little) and taps nothing`, z);
		const t1 = await p.touchscreen.touchStart(mid[0] - 30, mid[1]), t2 = await p.touchscreen.touchStart(mid[0] + 30, mid[1]);
		for (let i = 1; i <= 5; i++) { await t1.move(mid[0] - 30 - i * 12, mid[1]); await t2.move(mid[0] + 30 + i * 12, mid[1]); await sleep(30); }
		await t1.end(); await t2.end(); await sleep(250);
		A(await p.evaluate(() => window.__poketactica.P.zoom) > z + 0.3, `${name}: a pinch zooms in`, await p.evaluate(() => window.__poketactica.P.zoom));
		// the Menu button: the field menu; End turn
		await tap(await centre(p, '#b-end'));
		s = await t.st();
		A(s.mode === 'field', `${name}: the Menu button opens the field menu`);
		await tap(await centre(p, '#menu-items .bal-btn', 1), 600); await t.idle();
		A((await t.st()).turn === 2, `${name}: End turn`);
		A(t.errors.length === 0, `no page errors (${name})`, t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
	// ---------- the enemy phase as DRAWN (owner, 2026-11-21: "the enemies moved but then when they attacked they went back
	// to the square they were on before they moved"): the animation must start from the board as it stood. A copy taken
	// after the engine had played the phase out drew every foe on its last tile first, then sent it back to walk again.
	{
		const t = await open({ width: 1280, height: 760 }, FIGS3);
		const p = t.page;
		await t.key('KeyZ', 900);
		const trail = await p.evaluate(async () => {
			const T = window.__poketactica, P = T.P;
			const idle = () => new Promise((r) => { const k = () => (!P.busy ? r() : setTimeout(k, 30)); k(); });
			T.act({ t: 'deploy', uid: 'p0' }); await idle();
			const bad = [];
			let moves = 0, uses = 0;
			for (let turn = 0; turn < 4 && !P.S.over; turn++) {
				const was = Object.fromEntries(P.S.units.filter((u) => u.side === 'e' && u.x != null).map((u) => [u.uid, u.x + ',' + u.y]));
				const r = T.act({ t: 'end' });
				moves += r.events.filter((e) => e.t === 'move' && e.uid[0] === 'e').length; uses += r.events.filter((e) => e.t === 'use' && e.uid[0] === 'e').length;
				const seen = {};   // each foe's drawn tiles, in order (no repeats)
				await new Promise((res) => { const k = () => {
					for (const u of P.S.units) { const d = P.disp && P.disp.units[u.uid]; if (u.side !== 'e' || !d || !d.alive) continue; const [gx, gy] = d.wx || [d.x, d.y]; const at = Math.round(gx) + ',' + Math.round(gy); const a = (seen[u.uid] = seen[u.uid] || []); if (a[a.length - 1] !== at) a.push(at); }
					if (!P.busy) res(); else requestAnimationFrame(k);
				}; requestAnimationFrame(k); });
				for (const [uid, a] of Object.entries(seen)) {
					if (was[uid] && a[0] !== was[uid]) bad.push(turn + ':' + uid + ' first drawn ' + a[0] + ', stood on ' + was[uid]);
					if (new Set(a).size !== a.length) bad.push(turn + ':' + uid + ' went back: ' + a.join(' > '));
				}
			}
			return { bad, moves, uses };
		});
		A(trail.moves > 0 && trail.uses > 0, 'the enemy phase here has foes moving and attacking', JSON.stringify(trail));
		A(trail.bad.length === 0, 'enemy phase: each foe is drawn from where it stood, walks, then attacks there (never back to its old tile)', trail.bad.slice(0, 4).join(' | '));
		A(t.errors.length === 0, 'no page errors (enemy phase)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
	// ---------- the mouse: a click picks, the wheel zooms, a drag pans (the ground under the pointer stays under it)
	{
		const t = await open({ width: 1280, height: 760 }, FIGS3);
		const p = t.page;
		await t.key('KeyZ', 700); await t.key('KeyX');
		const scr = (x, y) => p.evaluate((x, y) => window.__poketactica.screenOf(x, y), x, y);
		await p.mouse.move(640, 380); await p.mouse.wheel({ deltaY: -300 }); await sleep(200);
		A(await p.evaluate(() => window.__poketactica.P.zoom) > 1, 'the wheel zooms in');
		const tl = await p.evaluate(() => { const S = window.__poketactica.P.S; return [Math.floor(S.map.w / 2), Math.floor(S.map.h / 2)]; });
		const a = await scr(tl[0], tl[1]);
		await p.mouse.move(a[0], a[1]); await p.mouse.down();
		for (let i = 1; i <= 8; i++) { await p.mouse.move(a[0] + i * 10, a[1] + i * 6); await sleep(20); }
		await p.mouse.up(); await sleep(200);
		const b2 = await scr(tl[0], tl[1]);
		A(Math.hypot(b2[0] - (a[0] + 80), b2[1] - (a[1] + 48)) < 6, 'a drag pans the board with the pointer', JSON.stringify([a, b2]));
		A(t.errors.length === 0, 'no page errors (mouse)', t.errors.slice(0, 3).join(' | '));
		await t.ctx.close();
	}
} catch (e) {
	A(false, 'harness crashed: ' + e.message);
} finally {
	await browser.close().catch(() => {});
	server.close();
}
console.log(`${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
