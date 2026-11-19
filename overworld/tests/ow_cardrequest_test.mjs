// ow_cardrequest_test.mjs — people in Pokémon Centers who collect Pocket Enhanced cards (owner's fourth improvement list,
// 2026-11-19: "Some NPCs ask for a certain card and give an item for it, which links the two games").
// overworld/ow_cardrequest.js CARD_REQUESTS / offerCardRequest / giveCard; ow_input.js interact.
//   1. the list: each person is in a Hoenn or Kanto Pokémon Center's data, wants a card that exists, and gives an item the
//      BAG knows
//   2. Oldale's Pokémon Center boy, with a Pikachu card in the collection: "Would you give me your PIKACHU card?",
//      GIVE PIKACHU / TALK with TALK highlighted; TALK talks as always and takes nothing
//   3. GIVE PIKACHU: one copy leaves the collection (the plain ◆ one, not the ★ promo), 3 SUPER POTIONS go in the bag,
//      and it is done for good: talked to again, he talks as always
//   4. Petalburg's youngster wants a ZIGZAGOON card, which this collection lacks: he says so, then talks as always;
//      nothing is taken or given
//   node overworld/tests/ow_cardrequest_test.mjs
import fs from 'fs';
import { makeAsserter, startServer, launch, openOverworld, sleep, waitFor } from './ow_controls_lib.mjs';
const R = makeAsserter(), A = R.A;
const C = await import('../../pocketenhanced/js/collection.js'), D = await import('../../pocketenhanced/js/data/cards.js');

const col0 = (() => { const c = C.newCollection(); for (const x of D.CARDS.filter(x => x.name === 'Pikachu' || x.name === 'Zigzagoon')) for (const p of x.printings) delete c.prints[p]; c.prints['A1-094'] = 1; c.prints['P-A-009'] = 1; return c; })();
const { server, port } = await startServer();
let browser;
try {
	browser = await launch();
	const setup = async (map, x, y) => {
		const t = await openOverworld(browser, port, { url: `/overworld/index.html?map=${map}&x=${x}&y=${y}` });
		await t.page.evaluate(c => localStorage.setItem('magepunk_pocket_collection_v1', JSON.stringify(c)), col0);
		return t;
	};
	const faceAndTalk = (page, script) => page.evaluate(s => {
		const W = window.__ow, n = W.npcs.list.find(x => x.ev && x.ev.script === s); if (!n) return null;
		W.player.tx = n.tx; W.player.ty = n.ty + 1; W.player.x = n.tx * 16; W.player.y = (n.ty + 1) * 16; W.player.facing = 'up'; W.player.moving = false;
		W.interact(); return { tx: n.tx, ty: n.ty };
	}, script);
	const asked = page => page.evaluate(async () => { const M = (await import('./choice.js')).choiceMenu, L = window.__owChoiceLog || [], last = L[L.length - 1]; return { open: M.open, idx: M.idx, prompt: M.prompt, list: last && last.list, options: last && last.options }; });
	const state = page => page.evaluate(async () => { const B = await import('./bag.js'), S = await import('./events.js'), c = JSON.parse(localStorage.getItem('magepunk_pocket_collection_v1')); return { plain: c.prints['A1-094'] || 0, promo: c.prints['P-A-009'] || 0, potions: B.count('superpotion'), done: !!S.getFlag('CARDREQ_OldaleTown_PokemonCenter_1F_EventScript_Boy'), dialog: window.__ow.dialog.blocking ? (window.__ow.dialog.pages || []).join(' ') : '' }; });
	const closeTalk = async page => { for (let i = 0; i < 30 && await page.evaluate(() => window.__ow.dialog.blocking || (window.__ow.cutscene && window.__ow.cutscene.active)); i++) { await page.keyboard.press('KeyX'); await sleep(100); } };
	// ===== 2 =====
	const t = await setup('OldaleTown_PokemonCenter_1F', 7, 6);
	// ===== 1 (in the page: the module needs one) =====
	{
		const got = await t.page.evaluate(async () => { const M = await import('./ow_cardrequest.js'), B = await import('./bag.js'); return { list: Object.entries(M.CARD_REQUESTS), items: Object.keys(B.ITEMS) }; });
		const scripts = new Set(); for (const f of fs.readdirSync(new URL('../data/maps/', import.meta.url))) if (/_PokemonCenter_1F_map\.json$/.test(f) && !/^Hoenn2_/.test(f)) { try { for (const e of JSON.parse(fs.readFileSync(new URL('../data/maps/' + f, import.meta.url))).object_events || []) scripts.add(e.script); } catch { /* */ } }
		const bad = got.list.filter(([sc, r]) => !scripts.has(sc) || !D.CARDS.some(c => c.name === r.card && c.printings.length) || !got.items.includes(r.item) || !(r.n >= 1));
		A(got.list.length >= 10 && !bad.length, `${got.list.length} people in Hoenn and Kanto Pokémon Centers, each wanting a real card for a real item`, bad.map(x => x[0]));
	}
	const s0 = await state(t.page);
	const at = await faceAndTalk(t.page, 'OldaleTown_PokemonCenter_1F_EventScript_Boy');
	await waitFor(async () => (await asked(t.page)).open, 8000);
	const q = await asked(t.page);
	A(!!at && q.open && q.list === 'card_request' && q.options.join() === 'GIVE PIKACHU,TALK' && q.idx === 1 && /give me your PIKACHU card\?.*3 SUPER POTIONS/.test(q.prompt), 'the boy: "Would you give me your PIKACHU card? I\'ll give you 3 SUPER POTIONS", GIVE PIKACHU / TALK, TALK highlighted', { at, q });
	await t.page.keyboard.press('KeyZ'); await sleep(400);
	const s1 = await state(t.page);
	A(s1.dialog && !/PIKACHU/.test(s1.dialog) && s1.plain === 1 && s1.promo === 1 && s1.potions === s0.potions && !s1.done, 'TALK: he talks as always; nothing taken or given', { s1 });
	await closeTalk(t.page);
	// ===== 3 =====
	await faceAndTalk(t.page, 'OldaleTown_PokemonCenter_1F_EventScript_Boy');
	await waitFor(async () => (await asked(t.page)).open, 8000);
	await t.page.keyboard.press('ArrowUp'); await sleep(120); await t.page.keyboard.press('KeyZ');
	await waitFor(async () => (await state(t.page)).done, 5000); await sleep(200);
	const s2 = await state(t.page);
	A(s2.plain === 0 && s2.promo === 1 && s2.potions === s0.potions + 3 && s2.done && /received 3 SUPER POTIONS/.test(s2.dialog), 'GIVE PIKACHU: the plain copy leaves the collection (the ★ promo stays), 3 SUPER POTIONS in the bag, done', { s0, s2 });
	const pocketReads = await t.page.evaluate(async () => { const C = await import('/pocketenhanced/js/collection.js'); const c = C.cleanCollection(JSON.parse(localStorage.getItem('magepunk_pocket_collection_v1'))); return !!c && !c.prints['A1-094'] && c.prints['P-A-009'] === 1; });
	A(pocketReads, 'Pocket Enhanced reads the collection as it now is (it carries the change to the account when opened)');
	await closeTalk(t.page);
	const n0 = (await t.page.evaluate(() => (window.__owChoiceLog || []).length));
	await faceAndTalk(t.page, 'OldaleTown_PokemonCenter_1F_EventScript_Boy'); await sleep(600);
	const s3 = await state(t.page);
	A(s3.dialog && (await t.page.evaluate(() => (window.__owChoiceLog || []).length)) === n0 && s3.potions === s2.potions, 'talked to again: he talks as always (no question, nothing more given)', s3);
	A(!t.errors.length, 'no page errors', t.errors.slice(0, 3));
	await t.ctx.close();
	// ===== 4 =====
	const y = await setup('PetalburgCity_PokemonCenter_1F', 7, 6);
	const b0 = await y.page.evaluate(async () => (await import('./bag.js')).count('ultraball'));
	await faceAndTalk(y.page, 'PetalburgCity_PokemonCenter_1F_EventScript_Youngster');
	await waitFor(() => y.page.evaluate(() => window.__ow.dialog.blocking), 8000);
	const said = await y.page.evaluate(() => (window.__ow.dialog.pages || []).join(' '));
	A(/ZIGZAGOON card/.test(said) && /3 ULTRA BALLS/.test(said) && (await asked(y.page)).list !== 'card_request', 'without the card: "If you ever find a ZIGZAGOON card, I\'d give you 3 ULTRA BALLS for it"', said);
	await y.page.keyboard.press('KeyX'); await sleep(300); await y.page.keyboard.press('KeyX'); await sleep(400);
	const then = await y.page.evaluate(async () => ({ dialog: window.__ow.dialog.blocking ? (window.__ow.dialog.pages || []).join(' ') : '', balls: (await import('./bag.js')).count('ultraball') }));
	A(then.dialog && !/ZIGZAGOON/.test(then.dialog) && then.balls === b0, 'then he talks as always; nothing given', then);
	await y.ctx.close();
} catch (e) {
	A(false, 'harness crashed: ' + (e && e.stack || e));
} finally {
	if (browser) await browser.close().catch(() => {});
	server.close();
}
console.log(`\n${R.pass} passed, ${R.fail} failed`);
process.exit(R.fail ? 1 : 0);
