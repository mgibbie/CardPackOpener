// Owner inbox batch, 2026-09-21.
//   Garruk's Packleader -> "Trample & Poisonous.\nInspire: Discover a Green Card."
//   Garruk's Harbinger  -> "Taunt & Trample.\nSwing: Draw a card & Advance."
//   Garruk's Uprising   -> keeps its anthem, gains "Pay 3 Life: Create a 2/2 Beast."
//
// The Uprising is the FIRST enchantment in the set with an activated ability —
// canActivate/activateAbility only ever looked at p.board, so an enchantment's
// ability could never be used. Both now accept the enchantment zone.
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._beast = { id: '_beast', name: 'Wolf', type: 'creature', cost: 2, attack: 2, health: 3, tribe: 'Beast', rarity: 'common' };
byId._imp = { id: '_imp', name: 'Imp', type: 'creature', cost: 2, attack: 2, health: 3, tribe: 'Demon', rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(73), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['_beast', '_beast', '_beast']; p.board = []; p.enchantments = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const enchant = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'enchantment'; st.players[pi].enchantments.push(c); E.recomputeAuras(st); return c; };

// ---- 1) Packleader: Trample & Poisonous, Inspire -> Discover a Green Card ----
{
	const c = byId.garruk_packleader;
	// keyword lists are alphabetised by tools/normalize-cards.mjs, so the filing's
	// "Trample & Poisonous" lands as "Poisonous & Trample"
	ok('reads "Poisonous & Trample.\\nInspire: Discover a Green Card."', c.description === 'Poisonous & Trample.\nInspire: Discover a Green Card.', c.description);
	ok('carries Trample & Poisonous', c.keywords.includes('trample') && c.keywords.includes('poisonous'), JSON.stringify(c.keywords));
	ok('the Beast anthem is gone', !c.aura, JSON.stringify(c.aura));
	ok('Inspire = a hero-power trigger', c.ongoing.on === 'hero-power-used', JSON.stringify(c.ongoing));
	ok('it Discovers from the GREEN pool (Forest land set, as Elvish Warrior does)', c.ongoing.effects[0].type === 'discover' && c.ongoing.effects[0].landSet === 'Forest', JSON.stringify(c.ongoing.effects));
	// FIRE: using your hero power offers a Discover
	const st = fresh();
	put(st, 0, c);
	E.fireOngoing(st, 0, 'hero-power-used', {});
	const pend = st.pickQueue[0];
	ok('using the hero power queues a Discover for you', pend && pend.player === 0 && pend.ids.length > 0, JSON.stringify(pend && { p: pend.player, n: pend.ids.length }));
	ok('every option is a green (Forest) card', pend && pend.ids.every(id => byId[id].landSet === 'Forest'), pend && pend.ids.map(i => byId[i].landSet).join('|'));
}

// ---- 2) Harbinger: Taunt & Trample, Swing -> draw + Advance ----
{
	const c = byId.garruk_harbinger;
	ok('reads "Taunt & Trample.\\nSwing: Draw a card & Advance."', c.description === 'Taunt & Trample.\nSwing: Draw a card & Advance.', c.description);
	ok('carries Taunt & Trample', c.keywords.includes('taunt') && c.keywords.includes('trample'), JSON.stringify(c.keywords));
	ok('Swing = a self-attacks trigger doing both halves', c.ongoing.on === 'self-attacks' && c.ongoing.effects.some(e => e.type === 'draw') && c.ongoing.effects.some(e => e.type === 'advance'), JSON.stringify(c.ongoing));
	// FIRE: attacking draws AND advances
	const st = fresh();
	const h = put(st, 0, c);
	const hand0 = st.players[0].hand.length, picks0 = (st.pickQueue || []).length;
	E.attack(st, 0, h.uid, { type: 'hero', player: 1 });
	ok('attacking drew a card', st.players[0].hand.length === hand0 + 1, `${hand0} -> ${st.players[0].hand.length}`);
	ok('attacking queued an Advance', (st.pickQueue || []).slice(picks0).some(q => q.mode === 'advance'), JSON.stringify((st.pickQueue || []).map(q => q.mode)));
}

// ---- 3) Garruk's Uprising: the first enchantment with an activated ability ----
{
	const c = byId.garruk_uprising;
	ok('keeps the Beast anthem', c.aura && c.aura.attack === 1 && c.aura.health === 1 && c.aura.keywords.includes('trample'), JSON.stringify(c.aura));
	ok('gains "Pay 3 Life: Create a 2/2 Beast."', c.description.endsWith('Pay 3 Life: Create a 2/2 Beast.'), c.description);
	ok('the ability costs 3 Life and summons a 2/2 Beast', c.activated[0].payLife === 3 && c.activated[0].effects[0].type === 'summon' && c.activated[0].effects[0].attack === 2 && c.activated[0].effects[0].tribe === 'Beast', JSON.stringify(c.activated));

	const st = fresh();
	const up = enchant(st, 0, c);
	ok('an enchantment ability is now activatable at all', E.canActivate(st, 0, up, 0) === true);
	const life0 = st.players[0].life, board0 = st.players[0].board.length;
	const used = E.activateAbility(st, 0, up.uid, 0, null);
	ok('activating it works from the enchantment zone', used === true, used);
	ok('it cost 3 Life', st.players[0].life === life0 - 3, `${life0} -> ${st.players[0].life}`);
	const beast = st.players[0].board[st.players[0].board.length - 1];
	// its PRINTED body is 2/2 — the anthem below has already grown the live stats
	ok('a 2/2 Beast arrived', st.players[0].board.length === board0 + 1 && beast.tribe === 'Beast' && beast.printedAttack === 2 && beast.printedHealth === 2,
		[st.players[0].board.length, beast && beast.tribe, beast && beast.printedAttack + '/' + beast.printedHealth].join(' '));
	ok('...and the anthem immediately buffs it to 3/3 with Trample', beast.attack === 3 && E.hp(beast) === 3 && (beast.keywords || []).includes('trample'), [beast.attack, E.hp(beast), JSON.stringify(beast.keywords)].join(' '));
	ok('it is once per turn', E.canActivate(st, 0, up, 0) === false);
	// and it must not be usable when it would kill you
	{
		const st2 = fresh();
		const up2 = enchant(st2, 0, c);
		st2.players[0].life = 3;
		ok('cannot pay 3 Life at exactly 3 Life (never self-kill)', E.canActivate(st2, 0, up2, 0) === false);
		st2.players[0].life = 4;
		ok('but can at 4', E.canActivate(st2, 0, up2, 0) === true);
	}
	// a non-Beast stays unbuffed
	{
		const st3 = fresh();
		enchant(st3, 0, c);
		const imp = put(st3, 0, byId._imp);
		E.recomputeAuras(st3);
		ok('the anthem still only touches Beasts', imp.attack === 2 && !(imp.keywords || []).includes('trample'), [imp.attack, JSON.stringify(imp.keywords)].join(' '));
	}
}

// ---- 4) the new capability is opt-in ----
{
	const ench = raw.cards.filter(c => c.type === 'enchantment' && c.activated).map(c => c.id);
	ok('exactly one enchantment uses an activated ability so far', ench.join(',') === 'garruk_uprising', ench.join(','));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
