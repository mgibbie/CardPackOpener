// Sixty-seventh batch from the wiki's owner inbox (owner_todo), 2026-09-11.
//   Duplicant (wastes_duplicant) -> "Transform" now bolds on the face (keyword glossary)
//   Void Gear Morningstar (wastes_vulshok_morningstar) -> add "Deathrattle: Give a random creature you control Deathtouch."
//   Mind's Eye (wastes_minds_eye) -> "{T}: Draw a card, if it is an artifact or enchantment gain 4 Life."
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';
import { richHtml } from '../../keywords.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
cardsById._v = { id: '_v', name: 'V', type: 'creature', cost: 1, attack: 2, health: 3, rarity: 'common' };
cardsById._art = { id: '_art', name: 'Test Relic', type: 'artifact', cost: 1, rarity: 'common', description: 'A relic.' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(cardsById, seededRng(67), null, 2,
		[{ id: 'paladin', name: 'A', power: null }, { id: 'paladin', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const put = (st, pi, id) => { const c = E.instantiate(cardsById[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };

// ---- 1) "Transform" bolds ----
{
	const html = richHtml('Battlecry: Exile target creature you don\'t control & then transform into it.');
	ok('the card face bolds "transform"', /<b[^>]*>transform<\/b>/i.test(html) || /<(b|strong)[^>]*>[^<]*transform/i.test(html), html);
}

// ---- 2) Void Gear Morningstar: Deathrattle grants a random friendly Deathtouch ----
{
	const w = cardsById.wastes_vulshok_morningstar;
	ok('description adds the Deathrattle line', /Deathrattle: Give a random creature you control Deathtouch\./.test(w.description), w.description);
	ok('has a grant-deathtouch Deathrattle', Array.isArray(w.deathrattle) && w.deathrattle[0].type === 'grant' && w.deathrattle[0].keyword === 'deathtouch', JSON.stringify(w.deathrattle));
	const st = fresh();
	const c = put(st, 0, '_v');
	const wp = E.instantiate(w, 0); wp.zone = 'weapon'; wp.durability = 1; st.players[0].weapon = wp;
	E.breakWeapon(st, 0, true);
	ok('breaking the weapon gives a friendly creature Deathtouch', (c.keywords || []).includes('deathtouch') || (c.auraKeywords || []).includes('deathtouch'), JSON.stringify([c.keywords, c.auraKeywords]));
	// the Swing heal-buff is untouched
	const st2 = fresh();
	const c2 = put(st2, 0, '_v');
	const wp2 = E.instantiate(w, 0); wp2.zone = 'weapon'; st2.players[0].weapon = wp2; st2.players[0].heroAttacksUsed = 0;
	E.heroAttack(st2, 0, { type: 'hero', player: 1 });
	ok('the Swing still buffs creatures +1 Attack', c2.attack === 3, c2.attack);
}

// ---- 3) Mind's Eye: tap to draw + conditional 4 Life ----
{
	const m = cardsById.wastes_minds_eye;
	ok('reworded "{T}: Draw a card, if it is an artifact or enchantment gain 4 Life."', m.description === '{T}: Draw a card, if it is an artifact or enchantment gain 4 Life.', m.description);
	ok('the tap ability is draw-heal-if-type (artifact/enchantment, 4)', m.tapAbility.effects[0].type === 'draw-heal-if-type' && m.tapAbility.effects[0].value === 4 && m.tapAbility.effects[0].types.includes('artifact') && m.tapAbility.effects[0].types.includes('enchantment'), JSON.stringify(m.tapAbility));
	// draw a CREATURE: no life gain
	{
		const st = fresh();
		st.players[0].deck = ['_v'];
		st.players[0].life = 20;
		const art = E.instantiate(m, 0); art.zone = 'artifact'; st.players[0].artifacts.push(art); E.recomputeAuras(st);
		E.tapArtifact(st, 0, art.uid, null);
		ok('drawing a creature draws but gains no Life', st.players[0].hand.some(c => c.id === '_v') && st.players[0].life === 20, [st.players[0].hand.length, st.players[0].life].join('/'));
	}
	// draw an ARTIFACT: gain 4 Life
	{
		const st = fresh();
		st.players[0].deck = ['_art'];
		st.players[0].life = 20;
		const art = E.instantiate(m, 0); art.zone = 'artifact'; st.players[0].artifacts.push(art); E.recomputeAuras(st);
		E.tapArtifact(st, 0, art.uid, null);
		ok('drawing an artifact draws AND gains 4 Life (20 -> 24)', st.players[0].hand.some(c => c.id === '_art') && st.players[0].life === 24, [st.players[0].hand.length, st.players[0].life].join('/'));
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
