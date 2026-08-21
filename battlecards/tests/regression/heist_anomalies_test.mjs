// heist_anomalies_test.mjs — Dalaran Heist phase 7: anomalies (symmetric
// run-wide rules). Boot-applied ones via applyAnomaly; the rest via the
// engine hooks reading state.anomaly (summon / spell / turn-start/-end).
import fs from 'fs';
import * as E from '../../engine.js';
import * as H from '../../heist.js';
import { seededRng } from '../../engine/rng.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const cardsById = {}; for (const c of raw.cards) cardsById[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const boot = (anomaly) => {
	const state = E.createGame(cardsById, seededRng(9), null, 2,
		[{ id: 'mage', name: 'Mage', power: { name: 'x', cost: 2, effects: [], text: '' } },
		 { id: 'b', name: 'Boss', power: { name: 'y', cost: 2, effects: [], text: '' } }]);
	if (anomaly) H.applyAnomaly(state, anomaly);
	return state;
};
const SPELL = { id: 't_spell', name: 'T Spell', type: 'sorcery', cost: 4, rarity: 'common', effects: [{ type: 'armor', value: 1 }] };
const CREA = { id: 't_crea', name: 'T Crea', type: 'creature', cost: 3, attack: 3, health: 3, rarity: 'common', keywords: [] };
const giveHand = (state, pi, def) => { const c = E.instantiate(def, pi); c.zone = 'hand'; state.players[pi].hand.push(c); return c; };

ok('11 anomalies defined', Object.keys(H.ANOMALIES).length === 11, Object.keys(H.ANOMALIES).length);
ok('every anomaly has name + text', Object.values(H.ANOMALIES).every(a => a.name && a.text));

// Arcane: spells cost 2 less for BOTH players
{
	const state = boot('arcane');
	state.cardsById.t_spell = SPELL;
	const c = giveHand(state, 0, SPELL);
	ok('Arcane: 4-cost spell now costs 2', E.effectiveCost(state, 0, c) === 2, E.effectiveCost(state, 0, c));
	const c2 = giveHand(state, 1, SPELL);
	ok('Arcane: applies to the opponent too', E.effectiveCost(state, 1, c2) === 2);
}
// Crying / Rattling: both players get the double-trigger hero mods
{
	const state = boot('crying');
	ok('Crying: both players battlecriesTwice', state.players[0].battlecriesTwice && state.players[1].battlecriesTwice);
}
{
	const state = boot('rattling');
	ok('Rattling: both players deathrattlesTwice', state.players[0].deathrattlesTwice && state.players[1].deathrattlesTwice);
}
// Gorged: +2 cards and +2 mana crystals for both
{
	const base = boot(null);
	const h0 = base.players[0].hand.length, m0 = base.players[0].mana.max;
	const state = boot('gorged');
	ok('Gorged: +2 cards', state.players[0].hand.length === h0 + 2, state.players[0].hand.length - h0);
	ok('Gorged: +2 mana crystals', state.players[0].mana.max === m0 + 2, state.players[0].mana.max - m0);
	ok('Gorged: opponent too', state.players[1].hand.length === base.players[1].hand.length + 2);
}
// Infused: a summoned minion gains one of the four keywords
{
	const state = boot('infused');
	state.cardsById.t_crea = CREA;
	const m = E.summon(state, 0, CREA);
	ok('Infused: summon gained a keyword', ['taunt', 'divine_shield', 'rush', 'windfury'].some(k => m.keywords.includes(k)), m.keywords.join());
}
// Explosive: summoned minion gains a board-nuke deathrattle
{
	const state = boot('explosive');
	state.cardsById.t_crea = CREA;
	const m = E.summon(state, 0, CREA);
	ok('Explosive: gained a deathrattle', m.keywords.includes('deathrattle') && (m.deathrattle || []).some(e => e.type === 'damage' && e.target === 'all-creatures'));
}
// Nesting: summoned minion gains a self-copy deathrattle
{
	const state = boot('nesting');
	state.cardsById.t_crea = CREA;
	const m = E.summon(state, 0, CREA);
	ok('Nesting: gained a summon deathrattle', m.keywords.includes('deathrattle') && (m.deathrattle || []).some(e => e.type === 'summon'));
}
// Growing: minions +1/+1 at the end of the owner's turn
{
	const state = boot('growing');
	state.cardsById.t_crea = CREA;
	state.current = 0;
	const m = E.summon(state, 0, CREA);
	const a0 = m.attack, h0 = E.hp(m);
	E.endTurn(state);
	ok('Growing: minion grew +1/+1 at turn end', m.attack === a0 + 1 && E.hp(m) === h0 + 1, `${m.attack}/${E.hp(m)}`);
}
// Reductive: hand costs -1 at the end of the owner's turn
{
	const state = boot('reductive');
	state.cardsById.t_spell = SPELL;
	state.current = 0;
	const c = giveHand(state, 0, SPELL);
	const before = c.cost;
	E.endTurn(state);
	ok('Reductive: hand card is 1 cheaper', c.cost === before - 1, c.cost);
}
// Rejuvenating: 2 Health at the start of the turn
{
	const state = boot('rejuvenating');
	state.players[0].life = 20; state.players[0].maxLife = 40;
	state.current = 1; // so ending it starts player 0's turn
	E.endTurn(state);
	ok('Rejuvenating: healed 2 at turn start', state.players[0].life === 22, state.players[0].life);
}
// Dragon Soul: the 3rd spell in a turn summons a 5/5 Dragon
{
	const state = boot('dragon_soul');
	const FREE = { id: 't_free', name: 'T Free', type: 'sorcery', cost: 0, rarity: 'common', effects: [{ type: 'armor', value: 1 }] };
	state.cardsById.t_free = FREE;
	state.current = 0;
	state.players[1].hand = []; // opponent can't respond -> the spells auto-resolve (robust to the boot's random hand)
	for (let i = 0; i < 3; i++) { const c = giveHand(state, 0, FREE); E.playCard(state, 0, c.uid, null); }
	ok('Dragon Soul: spells counted to 3', state.players[0].spellsPlayedThisTurn === 3, state.players[0].spellsPlayedThisTurn);
	const drag = state.players[0].board.find(m => m.name === 'Dragon' && m.attack === 5);
	ok('Dragon Soul: a 5/5 Dragon after 3 spells', !!drag && E.hp(drag) === 5);
}
// no anomaly = a clean game boot (control)
{
	const state = boot(null);
	ok('No anomaly: state.anomaly stays null', state.anomaly == null);
}
console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
