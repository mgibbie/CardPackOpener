// pocketenhanced_cards_test.mjs — how a card is drawn (pocketenhanced/js/main.js face(), css/pocket.css, data/looks.js):
//   1. the tables: every star, shiny and crown printing has a kind that agrees with its rarity; the Pokédex facts
//   2. the standard frame carries Pocket's parts: stage tab, the pre-evolution's portrait and "Evolves from", the strip
//      (number, species, height, weight: only on a card named as its species), an attack's Combat Type under its name,
//      the Pokémon's Combat Types and Retreat Cost in the bottom line, the ex rule with the card's points, rarity + number
//   3. a Trainer card: the TRAINER tab, its kind, Pocket's reminder
//   4. a full-art, rainbow, immersive, gold or shiny-full printing fills the card and leaves the rules text out;
//      a shiny keeps the frame; each is drawn as its kind
//   5. in the game: the Collection shows a card as the best printing owned; the card font is loaded; no name runs past
//      its line and no card's text runs past the card (all 2485)
//   6. the hover panel: the mouse over a card shows the whole card with its text beside it, inside the screen, and
//      names the printing; it goes when the mouse leaves; a touch does not open it (a tap opens the inspect view,
//      which names the printing too)
//   node overworld/tests/pocketenhanced_cards_test.mjs
import http from 'http';
import fs from 'fs';
import path from 'path';
import { fileURLToPath, pathToFileURL } from 'url';
import puppeteer from 'puppeteer-core';

const HERE = path.dirname(fileURLToPath(import.meta.url));
const ROOT = path.resolve(HERE, '../../');
const CHROME = process.env.CHROME || ['C:/Program Files/Google/Chrome/Application/chrome.exe', 'C:/Program Files (x86)/Microsoft/Edge/Application/msedge.exe', '/opt/chrome/chrome'].find(p => fs.existsSync(p));
const PORT = 9583, SHOTS = process.env.POCKET_SHOTS || '';
let pass = 0, fail = 0;
const A = (c, m, extra) => { if (c) { pass++; console.log('ok  - ' + m); } else { fail++; console.log('FAIL: ' + m + (extra != null ? '  ' + (typeof extra === 'string' ? extra : JSON.stringify(extra)) : '')); } };
const sleep = ms => new Promise(r => setTimeout(r, ms));
async function waitFor(fn, ms) { const t0 = Date.now(); while (Date.now() - t0 < ms) { try { if (await fn()) return true; } catch { } await sleep(100); } return false; }
const imp = f => import(pathToFileURL(path.join(ROOT, f)).href);
const { LOOKS, DEX } = await imp('pocketenhanced/js/data/looks.js'), { PRINTS } = await imp('pocketenhanced/js/data/packs.js'), C = await imp('pocketenhanced/js/collection.js'), { card } = await imp('pocketenhanced/js/data/cards.js');

// ===== 1. the tables =====
{
	const WANT = { art: '1S', full: '2S', rainbow: '2S', immersive: '3S', gold: 'CR', shiny: '1H', shinyfull: '2H' }, rar = new Map(PRINTS.map(p => [p[0], p[2]]));
	const bad = Object.entries(LOOKS).filter(([id, k]) => !WANT[k] || rar.get(id) !== WANT[k]);
	A(Object.keys(LOOKS).length > 1200 && !bad.length, `every printing with a kind (${Object.keys(LOOKS).length}) has the rarity that kind has`, bad.slice(0, 5));
	const n = k => Object.values(LOOKS).filter(x => x === k).length;
	A(Object.keys(WANT).every(k => n(k) > 30), 'all seven kinds are there: illustration, full art, rainbow, immersive, gold, shiny, shiny full art', Object.keys(WANT).map(k => k + ' ' + n(k)).join(', '));
	const none = PRINTS.filter(p => !/D$|F$|^N$/.test(p[2]) && !LOOKS[p[0]]).map(p => p[0]);
	A(none.join() === 'SP1-028,SP1-029,SP1-030', 'the only star printings without a kind are the three the open dataset does not list (they keep the standard frame)', none.join());
	A(LOOKS['A1-253'] === 'full' && LOOKS['A1-280'] === 'immersive' && LOOKS['A1-284'] === 'gold' && LOOKS['A1-274'] === 'rainbow' && LOOKS['A1-227'] === 'art' && !LOOKS['A1-036'], "Charizard ex's printings: the standard card, a full art, the immersive one and the gold one");
	A(JSON.stringify(DEX[6]) === JSON.stringify(['Charizard', 'Flame Pokémon', 17, 905]) && JSON.stringify(DEX[25]) === JSON.stringify(['Pikachu', 'Mouse Pokémon', 4, 60]) && Object.keys(DEX).length >= 1000, 'the Pokédex facts: Charizard is the Flame Pokémon, 1.7 m, 90.5 kg');
}

const TYPES = { '.html': 'text/html', '.js': 'text/javascript', '.mjs': 'text/javascript', '.json': 'application/json', '.css': 'text/css', '.png': 'image/png', '.woff2': 'font/woff2' };
const server = http.createServer(async (req, res) => {
	const u = decodeURIComponent(req.url.split('?')[0]);
	if (u === '/api/mp') { for await (const _ of req); res.writeHead(200, { 'content-type': 'application/json' }); return res.end('{}'); }
	const f = u.endsWith('/') ? u + 'index.html' : u;
	fs.readFile(path.join(ROOT, f), (e, d) => { if (e) { res.writeHead(404); res.end('nf'); return; } res.writeHead(200, { 'content-type': TYPES[path.extname(f)] || 'application/octet-stream' }); res.end(d); });
});
await new Promise(r => server.listen(PORT, r));
const browser = await puppeteer.launch({ executablePath: CHROME, headless: 'new', protocolTimeout: 240000, args: ['--no-sandbox'] });
try {
	// a player who owns Charizard ex's gold printing, Moltres ex's rainbow one and a shiny Squirtle
	const mine = C.newCollection(); Object.assign(mine.prints, { 'A1-284': 1, 'A1-274': 1, 'A3-215': 1 });
	const open = async (vp, touch) => {
		const page = await browser.newPage(); await page.setViewport(vp);
		const errors = []; page.on('pageerror', e => errors.push(String(e.message)));
		await page.evaluateOnNewDocument(col => { localStorage.setItem('magepunk_pocket_collection_v1', JSON.stringify(col)); localStorage.setItem('magepunk_pocket_prefs_v1', JSON.stringify({ tutored: true })); }, mine);
		await page.goto(`http://localhost:${PORT}/pocketenhanced/?seed=cards`, { waitUntil: 'domcontentloaded' });
		await waitFor(() => page.evaluate(() => !!(window.__pocket && window.__pocket.ready)), 30000);
		return { page, errors, touch };
	};
	const { page, errors } = await open({ width: 1600, height: 900, deviceScaleFactor: 1 });
	// a card's face as the game draws it, read back as its parts
	const read = (id, print) => page.evaluate((id, print) => {
		const d = document.createElement('div'); d.innerHTML = window.__pocket.face(id, print); const f = d.firstElementChild, t = s => [...f.querySelectorAll(s)].map(e => e.textContent.trim());
		return { cls: f.className, tag: t('.hd .tag')[0], trn: t('.trn')[0], evo: f.querySelector('.evo img')?.getAttribute('src') || null, from: t('.from')[0] || null, name: t('.hd .n')[0] || t('.n')[0], hp: t('.hpn')[0], strip: [...f.querySelectorAll('.strip span')].map(e => e.textContent),
			atks: [...f.querySelectorAll('.atk:not(.ab)')].map(a => ({ cost: a.querySelectorAll('.co .en').length, name: a.querySelector('.an').textContent, type: a.querySelector('.tyl .ty')?.textContent, dmg: a.querySelector('.d').textContent })),
			ability: t('.atk.ab .an')[0] || null, fx: t('.fx'), types: t('.ft .ct .ty'), retreat: f.querySelectorAll('.ft .rt .en').length, exr: t('.exr')[0] || null, no: t('.no span'), full: !!f.querySelector('.full'), art: !!f.querySelector('.art'), tx: t('.tx')[0] || null, rule: t('.rule')[0] || null };
	}, id, print || null);

	// ===== 2. the standard frame =====
	const z = await read('A1-036');
	A(z.tag === 'Stage 2' && z.evo === '/overworld/data/pokemon/s160.png' && z.from === 'Evolves from Charmeleon' && z.name === 'Charizardex' && z.hp === '180', 'Charizard ex: a Stage 2 tab, Charmeleon in the portrait, "Evolves from Charmeleon", the name and 180 HP', z);
	A(z.strip.join(' | ') === `NO. 006 | Flame Pokémon | HT: 5'7" | WT: 199.5 lbs.`, "the strip under the art, as Pocket prints it: NO. 006, Flame Pokémon, HT: 5'7\", WT: 199.5 lbs.", z.strip);
	A(z.atks.length === 2 && z.atks[0].name === 'Slash' && z.atks[0].type === 'Normal' && z.atks[0].dmg === '60' && z.atks[0].cost === 3 && z.atks[1].name === 'Crimson Storm' && z.atks[1].type === 'Fire' && z.atks[1].dmg === '200' && z.fx.length === 1 && /Discard 2/.test(z.fx[0]), "each attack: its cost, name, damage, and its Combat Type under the name (Slash is Normal, Crimson Storm is Fire); the rules text below", z.atks);
	A(z.types.join() === 'Fire,Flying' && z.retreat === 2, 'the bottom line: its Combat Types (Fire, Flying) where Pocket prints Weakness, and a Retreat Cost of two', [z.types, z.retreat]);
	A(/^ex rule\s*When your Pokémon ex is Knocked Out, your opponent gets 2 points\.$/.test(z.exr) && z.no.join(' ') === '◆◆◆◆ A1 036', "Pocket's ex rule, and the rarity and number (◆◆◆◆ A1 036)", [z.exr, z.no]);
	const pk = await read('A1-094');
	A(pk.tag === 'Basic' && pk.evo === null && pk.from === null && pk.strip.join(' | ') === `NO. 025 | Mouse Pokémon | HT: 1'4" | WT: 13.2 lbs.` && pk.exr === null && pk.fx.length === 0, "Pikachu: Basic, no portrait, NO. 025 Mouse Pokémon 1'4\" 13.2 lbs., no ex rule, and no empty text line under an attack that has none", pk);
	const mega = await read('B1-102');
	A(mega.name === 'Mega Altariaex' && mega.strip.join(' | ') === 'NO. 334' && /gets 3 points/.test(mega.exr), "a Mega: only its number in the strip (the species' height and weight are the ordinary form's), and its rule says 3 points", [mega.strip, mega.exr]);
	const gren = await read('A1-089');
	A(gren.ability === 'Water Shuriken' && gren.fx.length === 1 && gren.types.join() === 'Water,Dark' && gren.exr === null, 'Greninja: the Ability under its tab with its text, Water and Dark', gren);

	// ===== 3. a Trainer card =====
	const gio = await read('A1-223'), cape = await read('A2-147');
	A(gio.trn === 'TRAINER' && gio.tag === 'Supporter' && gio.name === 'Giovanni' && /\+10 damage/.test(gio.tx) && gio.rule === 'You may play only 1 Supporter card during your turn.' && gio.no.join(' ') === '◆◆ A1 223', 'Giovanni: the TRAINER tab, Supporter, his text, "You may play only 1 Supporter card during your turn."', gio);
	A(cape.tag === 'Pokémon Tool' && cape.rule === null, 'a Pokémon Tool: its kind, and no reminder line (none is made up for it)', cape);

	// ===== 4. the printings that are not the standard card =====
	const im = await read('A1-036', 'A1-280'), gold = await read('A1-036', 'A1-284'), rb = await read('A1-047', 'A1-274'), fa = await read('A1-004', 'A1-251'), il = await read('A1-001', 'A1-227'), sh = await read('A1-053', 'A3-215'), sf = await read('A1-004', 'A3-230'), tfa = await read('A1-219', 'A1-266');
	A(/lk-immersive/.test(im.cls) && /bleed/.test(im.cls) && im.full && !im.art && im.fx.length === 0 && im.strip.length === 0 && im.exr === null, 'the immersive Charizard ex: its art fills the card; no rules text, strip or rule box on it', im.cls);
	A(im.name === 'Charizardex' && im.hp === '180' && im.atks.map(a => a.name + ' ' + a.dmg + ' ' + a.type).join() === 'Slash 60 Normal,Crimson Storm 200 Fire' && im.types.join() === 'Fire,Flying' && im.retreat === 2 && im.no.join(' ') === '★★★ A1 280', '...but it still says what it is: name, HP, both attacks with damage and type, its types, Retreat Cost, ★★★ A1 280', im);
	A(/lk-gold/.test(gold.cls) && gold.no.join(' ') === '♛ A1 284' && /lk-rainbow/.test(rb.cls) && rb.no[0] === '★★' && /lk-full/.test(fa.cls) && fa.no[0] === '★★' && /lk-art/.test(il.cls) && il.no[0] === '★' && /lk-shinyfull/.test(sf.cls) && [gold, rb, fa, il, sf].every(x => x.full && !x.fx.length), 'gold, rainbow, full art, illustration and shiny full art are each drawn as their kind, with their own rarity and number', [gold.cls, gold.no, rb.no, fa.no, il.no]);
	A(/lk-shiny\b/.test(sh.cls) && !/bleed/.test(sh.cls) && sh.art && !sh.full && sh.strip.length === 4, 'a shiny keeps the standard frame (and all its text): only the Pokémon and its sparkles differ', sh.cls);
	A(/lk-full/.test(tfa.cls) && tfa.full && /Heal 50 damage/.test(tfa.tx) && tfa.rule === null, "a full-art Supporter: the figure fills the card and her text stays on it (a Trainer's text is all there is to it)", tfa);
	A(await page.evaluate(() => window.__pocket.look('A1-036') === null && window.__pocket.look('nope') === null && window.__pocket.look(null) === null), 'a standard printing, an unknown one and none at all are the standard frame');

	// ===== 5. in the game =====
	await page.evaluate(() => window.__pocket.menu());
	await page.click('.modal:last-child [data-k="collection"]');
	A(await waitFor(() => page.evaluate(() => document.querySelectorAll('.pe-col .pe-card').length === 2485), 20000), 'the Collection opens with all 2485 cards');
	await page.evaluate(() => document.fonts.ready); await sleep(600);
	A(await page.evaluate(() => document.fonts.check('700 16px Cabin') && /Cabin/.test(getComputedStyle(document.querySelector('.pe-col .pe-card')).fontFamily)), 'the card font (Cabin) is loaded and used');
	const shown = await page.evaluate(() => { const g = k => { const e = document.querySelector(`.pe-col [data-k="c${k}"]`); return e ? { cls: e.className, look: e.dataset.look || null, face: e.querySelector('.f').className, tip: e.dataset.tip } : null; }; return { zard: g('A1-036'), molt: g('A1-047'), sq: g('A1-053'), pika: g('A1-094') }; });
	A(/look-gold/.test(shown.zard.cls) && /lk-gold/.test(shown.zard.face) && shown.zard.look === 'gold' && /lk-rainbow/.test(shown.molt.face) && /lk-shiny/.test(shown.sq.face) && shown.pika.look === null && !/lk/.test(shown.pika.face) && shown.zard.tip === 'A1-036', 'a card is shown as the best printing owned: the gold Charizard ex, the rainbow Moltres ex, the shiny Squirtle; Pikachu as the standard card', shown);
	const fit = await page.evaluate(() => {
		let names = 0, texts = 0, worst = '';
		for (const f of document.querySelectorAll('.pe-col .f.pk')) {
			const n = f.querySelector('.hd .n'), box = n.parentNode.getBoundingClientRect(), r = n.getBoundingClientRect();
			if (r.right > box.right + 1) { names++; worst = worst || n.textContent; }
			if (f.scrollHeight > f.clientHeight + 1) texts++;
		}
		return { names, texts, worst, n: document.querySelectorAll('.pe-col .f.pk').length };
	});
	A(fit.n > 2000 && fit.names === 0, `no Pokémon's name runs past its line (${fit.n} cards; long names are narrowed)`, fit);
	A(fit.texts === 0, "no card's text runs past the card", fit);
	if (SHOTS) { fs.mkdirSync(SHOTS, { recursive: true }); await page.screenshot({ path: path.join(SHOTS, 'cards_collection.png') }); }

	// ===== 6. the hover panel =====
	const centre = sel => page.evaluate(sel => { const e = document.querySelector(sel); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel);
	const tip = () => page.evaluate(() => window.__pocket.tip());
	await page.mouse.move(3, 3); await sleep(600);
	A(await tip() === null, 'no panel while the mouse is on no card');
	let at = await centre('.pe-col [data-k="cA1-036"]'); await page.mouse.move(at[0], at[1]); await page.mouse.move(at[0] + 2, at[1] + 2);
	A(await waitFor(async () => { const t = await tip(); return !!t && t.for === 'A1-036'; }, 3000), 'the mouse over the gold Charizard ex opens the panel for it');
	const t1 = await tip(), box = await page.evaluate(() => { const e = document.querySelector('.pe-tip'), r = e.getBoundingClientRect(), f = e.querySelector('.f'); return { l: r.left, t: r.top, r: r.right, b: r.bottom, w: innerWidth, h: innerHeight, face: f.className, fx: e.querySelectorAll('.fx').length, strip: !!e.querySelector('.strip'), px: parseFloat(getComputedStyle(e.querySelector('.pf')).fontSize) }; });
	A(/Discard 2/.test(t1.text) && /Flame Pokémon/.test(t1.text) && /ex rule/.test(t1.text) && /Gold printing/.test(t1.text) && !/lk/.test(box.face) && box.fx === 1 && box.strip, 'the panel is the whole card in the standard frame: the rules text the gold card leaves out, the strip, the ex rule; and it names the printing', t1.text.slice(0, 200));
	A(box.l >= 0 && box.t >= 0 && box.r <= box.w && box.b <= box.h && box.px >= 24, 'it is on the screen, at a size that reads', box);
	if (SHOTS) await page.screenshot({ path: path.join(SHOTS, 'cards_tip.png') });
	at = await centre('.pe-col [data-k="cA1-094"]'); await page.mouse.move(at[0], at[1]); await page.mouse.move(at[0] + 2, at[1] + 2);
	A(await waitFor(async () => { const t = await tip(); return !!t && t.for === 'A1-094' && !/printing/.test(t.text); }, 3000), 'moving to Pikachu shows Pikachu (a standard card: no printing named)');
	await page.mouse.move(5, 5);
	A(await waitFor(async () => await tip() === null, 3000), 'the panel goes when the mouse leaves the card');
	at = await centre('.pe-col [data-k="cA1-036"]'); await page.mouse.move(at[0], at[1]); await page.mouse.move(at[0] + 2, at[1] + 2); await waitFor(async () => !!(await tip()), 3000);
	await page.mouse.down(); await page.mouse.up();
	A(await waitFor(() => page.evaluate(() => !!document.querySelector('.pe-insp .big .f.lk-gold') && /Gold/.test(document.querySelector('.pe-insp .info').textContent) && /A1-284/.test(document.querySelector('.pe-insp .info').textContent) && /Discard 2/.test(document.querySelector('.pe-insp .info').textContent)), 5000) && await tip() === null, 'pressing the card closes the panel and opens the inspect view: the gold card large, "Gold" and its number, and the full text beside it');
	A(!errors.length, 'no page errors', errors.slice(0, 4).join(' | '));
	await page.close();

	// a touch: no panel; a tap opens the inspect view
	const ph = await open({ width: 412, height: 892, deviceScaleFactor: 2, isMobile: true, hasTouch: true });
	await ph.page.evaluate(() => window.__pocket.menu()); await sleep(600);
	const tapSel = async sel => { const p = await ph.page.evaluate(sel => { const e = document.querySelector(sel); e.scrollIntoView({ block: 'center' }); const r = e.getBoundingClientRect(); return [r.left + r.width / 2, r.top + r.height / 2]; }, sel); await ph.page.touchscreen.tap(p[0], p[1]); };
	await tapSel('.modal:last-child [data-k="collection"]');
	await waitFor(() => ph.page.evaluate(() => document.querySelectorAll('.pe-col .pe-card').length === 2485), 20000);
	await sleep(800);
	for (let i = 0; i < 3 && !(await ph.page.evaluate(() => !!document.querySelector('.pe-insp'))); i++) { await tapSel('.pe-col [data-k="cA1-036"]'); await waitFor(() => ph.page.evaluate(() => !!document.querySelector('.pe-insp')), 2500); }
	A(await ph.page.evaluate(() => window.__pocket.tip() === null && !!document.querySelector('.pe-insp .big .f.lk-gold')), 'by touch there is no hover panel: a tap opens the inspect view, with the gold card and its full text');
	A(await ph.page.evaluate(() => document.documentElement.scrollWidth <= innerWidth + 1) && !ph.errors.length, 'on a phone nothing overflows sideways, and no page errors', ph.errors.slice(0, 3).join(' | '));
} catch (e) {
	fail++; console.log('FAIL: harness crashed: ' + (e && e.stack || e));
} finally {
	await browser.close(); server.close();
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
