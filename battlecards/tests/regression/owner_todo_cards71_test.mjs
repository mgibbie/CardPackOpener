// Owner inbox batch, 2026-09-21.
//   Alpine Tyrant    -> legendary, renamed "Ghost, Direwolf Pup"
//   Chandra's Phoenix-> + "Deathrattle: Add two Coins to your hand."
//   Chandra (sig)    -> cost 5 / 5 loyalty, abilities up to 3 / 5 / 4
//   Chandra's Fury   -> Twinspell, 5 damage to ANY target (Finale 7)
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'V', type: 'creature', cost: 1, attack: 2, health: 8, rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(71), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };

// ---- 1) Ghost, Direwolf Pup ----
{
	const c = byId.alpine_tyrant;
	ok('renamed to "Ghost, Direwolf Pup"', c.name === 'Ghost, Direwolf Pup', c.name);
	ok('is legendary', c.rarity === 'legendary', c.rarity);
	ok('keeps its Beast/Frigid Battlecry (batch 70)', c.effects[0].type === 'discover' && c.effects[0].grant === 'frigid' && c.effects[0].tribe === 'Beast', JSON.stringify(c.effects));
	ok('the id is unchanged, so its art/links still resolve', !!byId.alpine_tyrant && c.id === 'alpine_tyrant');
}

// ---- 2) Chandra's Phoenix: Deathrattle -> two Coins ----
{
	const c = byId.chandra_phoenix;
	ok('description adds the Deathrattle line', c.description === 'Reborn, Rush & Windfury.\nDeathrattle: Add two Coins to your hand.', c.description);
	ok('has the deathrattle keyword', (c.keywords || []).includes('deathrattle'), JSON.stringify(c.keywords));
	ok('keeps Reborn, Rush & Windfury', ['reborn', 'rush', 'windfury'].every(k => c.keywords.includes(k)), JSON.stringify(c.keywords));
	ok('deathrattle adds 2 coins', Array.isArray(c.deathrattle) && c.deathrattle[0].type === 'add-card' && c.deathrattle[0].id === 'coin' && c.deathrattle[0].count === 2, JSON.stringify(c.deathrattle));
	// FIRE it: killing the Phoenix puts two Coins in hand
	const st = fresh();
	const ph = put(st, 0, c);
	const before = st.players[0].hand.filter(x => x.id === 'coin').length;
	ph.damage = ph.maxHealth; E.sweepDeaths(st);
	const after = st.players[0].hand.filter(x => x.id === 'coin').length;
	ok('dying banks two Coins in your hand', after === before + 2, `${before} -> ${after}`);
}

// ---- 3) Chandra: cheaper, tougher, hits harder ----
{
	const c = byId.chandra_sig;
	ok('costs 5', c.cost === 5, c.cost);
	ok('starts on 5 loyalty', c.loyalty === 5, c.loyalty);
	ok('+1 deals 3 to each opponent', c.abilities[0].cost === 1 && c.abilities[0].effects[0].value === 3 && c.abilities[0].effects[0].target === 'enemy-heroes', JSON.stringify(c.abilities[0]));
	ok('−2 deals 5 to any target', c.abilities[1].cost === -2 && c.abilities[1].effects[0].value === 5 && c.abilities[1].effects[0].target === 'any', JSON.stringify(c.abilities[1]));
	ok('−6 emblem deals 4', c.abilities[2].cost === -6 && c.abilities[2].effects[0].ongoing.effects[0].value === 4, JSON.stringify(c.abilities[2].effects[0].ongoing));
	ok('the rules text matches the abilities', c.description.includes('Deal 3 damage to each opponent') && c.description.includes('Deal 5 damage to any target') && c.description.includes('deal 4 damage to a random enemy'), c.description);
	ok('the emblem blurb matches too', c.abilities[2].effects[0].description === 'At the end of your turn, deal 4 damage to a random enemy.', c.abilities[2].effects[0].description);
	// FIRE the +1: both opponents' heroes take 3
	const st = fresh();
	const life0 = st.players[1].life;
	E.execEffects(st, 0, c.abilities[0].effects, null, null);
	ok('the +1 really deals 3 to the enemy hero', st.players[1].life === life0 - 3, `${life0} -> ${st.players[1].life}`);
}

// ---- 4) Chandra's Fury: Twinspell, any target ----
{
	const c = byId.chandra_fury, ii = byId.chandra_fury_ii;
	ok('reads as a Twinspell hitting any target', c.description === 'Twinspell.\nDeal 5 damage to any target. Finale: deal 7 instead.', c.description);
	ok('conjures its second cast', c.effects.some(e => e.type === 'conjure-id' && e.id === 'chandra_fury_ii'), JSON.stringify(c.effects));
	ok('the second cast exists and shares the name', !!ii && ii.name === c.name, ii && ii.name);
	ok('the copy has no Twinspell rider of its own (no infinite chain)', ii && !ii.effects.some(e => e.type === 'conjure-id'), JSON.stringify(ii && ii.effects));
	ok('the copy is uncollectible', ii && ii.collectible === false);
	ok('the copy inherits the parent art', ii && ii.artFrom === 'chandra_fury', ii && ii.artFrom);
	// Lorequest builds Chandra's deck from loreDeck && !token — the copy must stay out
	ok('the copy is NOT tagged into the Lorequest deck', ii && !ii.loreDeck, ii && ii.loreDeck);
	ok("Chandra's lore deck is still exactly 15 cards", raw.cards.filter(d => d.loreDeck === 'Chandra' && !d.token).length === 15,
		raw.cards.filter(d => d.loreDeck === 'Chandra' && !d.token).length);
	// both halves hit ANY target, not just the face
	for (const [label, def] of [['the spell', c], ['its second cast', ii]]) {
		const st = fresh();
		const foe = put(st, 1, byId._v);
		E.execEffects(st, 0, def.effects, { type: 'creature', uid: foe.uid }, null);
		ok(`${label} can hit a creature for 5`, foe.damage === 5, foe.damage);
	}
	// Finale = you spent ALL your remaining mana on it (engine: availableMana === 0)
	{
		const st = fresh();
		st.players[0].mana = { cur: c.cost, max: c.cost, bonus: 0 }; // exactly enough, so casting empties the pool
		const foe = put(st, 1, byId._v);
		const card = E.instantiate(c, 0); card.zone = 'hand'; st.players[0].hand.push(card);
		E.playCard(st, 0, card.uid, { type: 'creature', uid: foe.uid }, null, 0);
		ok('spending your last mana triggers Finale for 7', foe.damage === 7, foe.damage);
		ok('and the second cast lands in hand', st.players[0].hand.some(x => x.id === 'chandra_fury_ii'), st.players[0].hand.map(x => x.id).join(','));
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
