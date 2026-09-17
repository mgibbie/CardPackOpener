// Owner inbox batch, 2026-09-17.
//   Preordain     -> "Scry 2, then draw a spell." (draw filtered to a spell via tutor)
//   Coral Merfolk -> aura reworded "+1/+0" -> "+1 Attack" (mechanic unchanged)
//   Sage Owl      -> add "Deathrattle: Investigate."
import fs from 'fs';
import * as E from '../../engine.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._spell = { id: '_spell', name: 'Test Spell', type: 'instant', cost: 1, rarity: 'common', effects: [{ type: 'draw', value: 1 }] };
byId._creat = { id: '_creat', name: 'Test Creature', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
byId._merf = { id: '_merf', name: 'Test Merfolk', type: 'creature', cost: 1, attack: 2, health: 2, tribe: 'Merfolk', rarity: 'common' };
byId._beast = { id: '_beast', name: 'Test Beast', type: 'creature', cost: 1, attack: 2, health: 2, tribe: 'Beast', rarity: 'common' };
let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) { pass++; } else { fail++; console.log('FAIL', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(918), null, 2,
		[{ id: 'paladin', name: 'A', power: null }, { id: 'paladin', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = []; p.board = []; p.artifacts = []; p.mana = { cur: 30, max: 30, bonus: 0 }; }
	return st;
}
const put = (st, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };

// ---- 1) Preordain: Scry 2, then draw a SPELL ----
{
	const c = byId.preordain;
	ok('description "Scry 2, then draw a spell."', c.description === 'Scry 2, then draw a spell.', c.description);
	ok('effects = scry 2, then tutor a spell', c.effects[0].type === 'scry' && c.effects[0].value === 2 && c.effects[1].type === 'tutor' && c.effects[1].cardType === 'spell' && (c.effects[1].count || 1) === 1, JSON.stringify(c.effects));
	// FIRE the draw-a-spell half: a spell is pulled from the deck, a creature is NOT
	const st = fresh();
	st.players[0].deck = ['_creat', '_spell'];
	E.execEffects(st, 0, [{ type: 'tutor', cardType: 'spell', count: 1 }], null, null);
	ok('draws the spell to hand', st.players[0].hand.some(x => x.id === '_spell'), st.players[0].hand.map(x => x.id).join(','));
	ok('the creature stays in the deck (spell-only)', st.players[0].deck.includes('_creat') && !st.players[0].hand.some(x => x.id === '_creat'), [st.players[0].deck.join(','), st.players[0].hand.map(x => x.id).join(',')].join(' | '));
}

// ---- 2) Coral Merfolk: aura reworded, mechanic intact ----
{
	const c = byId.coral_merfolk;
	ok('description "Rush.\\nYour other Merfolk have +1 Attack."', c.description === 'Rush.\nYour other Merfolk have +1 Attack.', c.description);
	ok('aura unchanged (Merfolk +1 Attack, others, no Health)', c.aura && c.aura.tribe === 'Merfolk' && c.aura.attack === 1 && c.aura.others === true && !c.aura.health, JSON.stringify(c.aura));
	const st = fresh();
	const coral = put(st, 0, c);
	const merf = put(st, 0, byId._merf);
	const beast = put(st, 0, byId._beast);
	E.recomputeAuras(st);
	ok('another Merfolk gets +1 Attack (2->3)', merf.attack === 3, merf.attack);
	ok('a non-Merfolk is unaffected (2)', beast.attack === 2, beast.attack);
	ok('Coral Merfolk does not buff itself (others:true)', coral.attack === 2, coral.attack);
}

// ---- 3) Sage Owl: Battlecry Scry 3 + new Deathrattle: Investigate ----
{
	const c = byId.sage_owl;
	ok('description adds the Deathrattle line', c.description === 'Battlecry: Scry 3.\nDeathrattle: Investigate.', c.description);
	ok('keeps Battlecry Scry 3', c.effects[0].type === 'scry' && c.effects[0].value === 3, JSON.stringify(c.effects));
	ok('deathrattle investigates', Array.isArray(c.deathrattle) && c.deathrattle[0].type === 'investigate', JSON.stringify(c.deathrattle));
	ok('has both Battlecry & Deathrattle keywords', (c.keywords || []).includes('battlecry') && (c.keywords || []).includes('deathrattle'), JSON.stringify(c.keywords));
	// FIRE: kill it -> a Clue token lands in artifacts
	const st = fresh();
	const owl = put(st, 0, c);
	ok('no Clue before death', !st.players[0].artifacts.some(x => x.id === 'clue_token'));
	owl.damage = owl.maxHealth; E.sweepDeaths(st);
	ok('Deathrattle created a Clue token (in artifacts)', st.players[0].artifacts.some(x => x.id === 'clue_token'), st.players[0].artifacts.map(x => x.id).join(','));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
