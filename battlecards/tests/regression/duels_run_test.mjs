// duels_run_test.mjs — Hearthstone Duels run-mode data: hero-power cards
// (cards.json, type 'heropower') + duels.js passives/heroes. Batch 1.
import fs from 'fs';
import * as E from '../../engine.js';
import * as D from '../../duels.js';
import { getEffectHandler } from '../../engine/effects/registry.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

// ---------------- hero-power cards ----------------
const HP_IDS = ['duelshp_send_in_the_scout', 'duelshp_blood_parasite', 'duelshp_primal_power', 'duelshp_uber_primal_power', 'duelshp_survival_training', 'duelshp_modest_aspirations', 'duelshp_from_golden_light', 'duelshp_harvest_time', 'duelshp_shadow_mend', 'duelshp_call_of_madness'];
ok('all 10 hero-power cards present + well-formed', HP_IDS.every(id => {
	const c = byId[id];
	return c && c.type === 'heropower' && c.set === 'DUELS' && c.power && Array.isArray(c.power.effects) && c.power.effects.length && c.power.cost === c.cost;
}), HP_IDS.filter(id => !byId[id]));

// every id referenced by HERO_POWERS resolves to a real card (incl. the shared ulda_ one)
{
	const refs = Object.values(D.HERO_POWERS).flat();
	ok('HERO_POWERS references all resolve', refs.every(id => byId[id] && byId[id].type === 'heropower'), refs.filter(id => !byId[id]));
}

// helper: fire a hero power's effects as a 0-cost sorcery through the real engine
const firePower = (id, opts = {}) => {
	const s = new Scenario(byId);
	if (opts.setup) opts.setup(s);
	s.def('t_hp', { type: 'sorcery', cost: 0, effects: JSON.parse(JSON.stringify(byId[id].power.effects)) })
		.mana(0, 10).hand(0, ['t_hp']);
	return s.play(0, 't_hp', opts.play || {}).run().state;
};

// Send in the Scout: a 2/2
{
	const state = firePower('duelshp_send_in_the_scout');
	const sc = state.players[0].board.filter(c => c.name === 'SI:7 Scout');
	ok('Send in the Scout: 2/2 SI:7 Scout', sc.length === 1 && sc[0].attack === 2 && E.hp(sc[0]) === 2, sc.length);
}
// Blood Parasite: a 2/1 Lifesteal
{
	const state = firePower('duelshp_blood_parasite');
	const b = state.players[0].board.filter(c => c.name === 'Bloodworm');
	ok('Blood Parasite: 2/1 Bloodworm with Lifesteal', b.length === 1 && b[0].attack === 2 && E.hp(b[0]) === 1 && b[0].keywords.includes('lifesteal'), b.length);
}
// Primal Power: self takes 3, +3 hero Attack, +3 Armor
{
	const state = firePower('duelshp_primal_power');
	const p = state.players[0];
	ok('Primal Power: -3 Health, +3 Attack, +3 Armor', p.life === 37 && p.heroTempAttack === 3 && p.armor === 3, [p.life, p.heroTempAttack, p.armor]);
}
// Uber Primal Power: +3 Attack, +3 Armor, no self-damage
{
	const state = firePower('duelshp_uber_primal_power');
	const p = state.players[0];
	ok('Uber Primal Power: +3 Attack, +3 Armor, full Health', p.life === 40 && p.heroTempAttack === 3 && p.armor === 3, [p.life, p.heroTempAttack, p.armor]);
}
// Survival Training: 2 to enemy hero + a friendly creature gains +1 Attack
{
	const state = firePower('duelshp_survival_training', { setup: s => s.def('t_m', { type: 'creature', cost: 1, attack: 1, health: 3 }).board(0, ['t_m']) });
	ok('Survival Training: 2 to enemy face + friendly +1 Attack', state.players[1].life === 38 && state.players[0].board[0].attack === 2, [state.players[1].life, state.players[0].board[0].attack]);
}
// Modest Aspirations: set a creature to 3/3
{
	const state = firePower('duelshp_modest_aspirations', { setup: s => s.def('t_big', { type: 'creature', cost: 7, attack: 7, health: 7 }).board(0, ['t_big']), play: { targetBoard: [0, 0] } });
	const m = state.players[0].board[0];
	ok('Modest Aspirations: creature becomes 3/3', m.attack === 3 && E.hp(m) === 3, [m.attack, E.hp(m)]);
}
// Harvest Time!: destroy a creature, summon two 1/1 Saplings
{
	const state = firePower('duelshp_harvest_time', { setup: s => s.def('t_v', { type: 'creature', cost: 3, attack: 3, health: 3 }).board(1, ['t_v']), play: { targetBoard: [1, 0] } });
	const sap = state.players[0].board.filter(c => c.name === 'Sapling');
	ok('Harvest Time!: kills target, two 1/1 Saplings', state.players[1].board.filter(c => !E.isDead(c)).length === 0 && sap.length === 2 && sap.every(c => c.attack === 1 && E.hp(c) === 1), sap.length);
}
// Shadow Mend: restore 2 to a damaged character
{
	const state = firePower('duelshp_shadow_mend', { setup: s => s.def('t_hurt', { type: 'creature', cost: 3, attack: 2, health: 6 }).board(0, ['t_hurt']), play: { targetBoard: [0, 0] } });
	// (creature undamaged here; assert the effect runs without error and target unchanged)
	ok('Shadow Mend: heals a character (no-op on full)', state.players[0].board[0] && E.hp(state.players[0].board[0]) === 6);
}
// Call of Madness: a 0/2 Voidfiend
{
	const state = firePower('duelshp_call_of_madness');
	const vf = state.players[0].board.filter(c => c.name === 'Voidfiend');
	ok('Call of Madness: 0/2 Voidfiend', vf.length === 1 && vf[0].attack === 0 && E.hp(vf[0]) === 2, vf.length);
}
// --- hero powers batch 2 ---
const HP_IDS2 = ['duelshp_vile_concoction', 'duelshp_roguish_maneuvers', 'duelshp_illidari_strike', 'duelshp_infernal_strike'];
ok('all 4 batch-2 hero-power cards present + well-formed', HP_IDS2.every(id => {
	const c = byId[id];
	return c && c.type === 'heropower' && c.set === 'DUELS' && c.power && Array.isArray(c.power.effects) && c.power.effects.length && c.power.cost === c.cost;
}), HP_IDS2.filter(id => !byId[id]));
// Vile Concoction: grant Poisonous
{
	const state = firePower('duelshp_vile_concoction', { setup: s => s.def('t_m', { type: 'creature', cost: 2, attack: 2, health: 2 }).board(0, ['t_m']), play: { targetBoard: [0, 0] } });
	ok('Vile Concoction: creature gains Poisonous', state.players[0].board[0].keywords.includes('poisonous'));
}
// Roguish Maneuvers: equip a 1/2 Dagger
{
	const state = firePower('duelshp_roguish_maneuvers');
	const w = state.players[0].weapon;
	ok('Roguish Maneuvers: 1/2 Dagger equipped', w && w.name === 'Dagger' && w.attack === 1 && w.durability === 2, w && [w.attack, w.durability]);
}
// Illidari Strike: two 1/1 Illidari with Rush
{
	const state = firePower('duelshp_illidari_strike');
	const il = state.players[0].board.filter(c => c.name === 'Illidari');
	ok('Illidari Strike: two 1/1 Rush Illidari', il.length === 2 && il.every(c => c.attack === 1 && E.hp(c) === 1 && c.keywords.includes('rush')), il.length);
}
// Infernal Strike: +1 hero Attack
{
	const state = firePower('duelshp_infernal_strike');
	ok('Infernal Strike: hero +1 Attack this turn', state.players[0].heroTempAttack === 1, state.players[0].heroTempAttack);
}

// ---------------- passives (duels.js) ----------------
ok('PASSIVES has the 81 entries', Object.keys(D.PASSIVES).length === 81 && ['blood_shields', 'ghouls_rush_in', 'cold_feet_pact'].every(k => D.PASSIVES[k]));
ok('HEROES lists 11 signature heroes with class', D.HEROES.length === 11 && D.HEROES.every(h => h.id && h.name && h.heroClass), D.HEROES.length);
ok('applyPassive returns false for an unknown id', D.applyPassive({ players: [{}] }, 0, 'nope') === false);

// Robe of the Apprentice: Spell Damage +1 emblem
{
	const { state } = new Scenario(byId).run();
	D.applyPassive(state, 0, 'robe_of_the_apprentice');
	ok('Robe of the Apprentice: Spell Damage +1', state.players[0].emblems.some(e => e.id === 'duels_robe_apprentice') && E.staticValue(state.players[0], 'spell-damage') >= 1, E.staticValue(state.players[0], 'spell-damage'));
}
// Small Backpacks / Small Pouches: start-of-game draws
{
	const { state } = new Scenario(byId).def('t_c', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_c', 't_c', 't_c']).run();
	const before = state.players[0].hand.length;
	D.applyPassive(state, 0, 'small_backpacks');
	ok('Small Backpacks: draws 2', state.players[0].hand.length === before + 2, [before, state.players[0].hand.length]);
}
{
	const { state } = new Scenario(byId).def('t_c', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_c', 't_c']).run();
	const before = state.players[0].hand.length;
	D.applyPassive(state, 0, 'small_pouches');
	ok('Small Pouches: draws 1', state.players[0].hand.length === before + 1);
}
// Band of Bees: cheap creatures gain Poisonous via aura
{
	const { state } = new Scenario(byId).def('t_cheap', { type: 'creature', cost: 1, attack: 2, health: 2 }).def('t_big', { type: 'creature', cost: 5, attack: 5, health: 5 }).board(0, ['t_cheap', 't_big']).run();
	D.applyPassive(state, 0, 'band_of_bees');
	const cheap = state.players[0].board.find(c => c.id === 't_cheap');
	const big = state.players[0].board.find(c => c.id === 't_big');
	ok('Band of Bees: (2)-or-less get Poisonous, dear ones do not', cheap.keywords.includes('poisonous') && !big.keywords.includes('poisonous'), [cheap.keywords, big.keywords]);
}
// Emerald Goggles: leftmost discount flag
{
	const { state } = new Scenario(byId).run();
	D.applyPassive(state, 0, 'emerald_goggles');
	ok('Emerald Goggles: leftmostDiscount = 2', state.players[0].leftmostDiscount === 2, state.players[0].leftmostDiscount);
}
// Rhonin's Scrying Orb: first spell each turn costs (1) less
{
	const { state } = new Scenario(byId).def('t_spell', { type: 'sorcery', cost: 4, effects: [] }).hand(0, ['t_spell']).run();
	const before = E.effectiveCost(state, 0, state.players[0].hand[0]);
	D.applyPassive(state, 0, 'rhonins_scrying_orb');
	const after = E.effectiveCost(state, 0, state.players[0].hand[0]);
	ok("Rhonin's Scrying Orb: first spell costs (1) less", before === 4 && after === 3, [before, after]);
}
// Rocket Backpacks: the first creature played each turn gains Rush (the second does not)
{
	const { state } = new Scenario(byId).def('t_a', { type: 'creature', cost: 1, attack: 2, health: 2 }).def('t_b', { type: 'creature', cost: 1, attack: 2, health: 2 }).mana(0, 10).hand(0, ['t_a', 't_b']).run();
	D.applyPassive(state, 0, 'rocket_backpacks');
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_a').uid, null, null, 0);
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_b').uid, null, null, 0);
	const a = state.players[0].board.find(c => c.id === 't_a');
	const b = state.players[0].board.find(c => c.id === 't_b');
	ok('Rocket Backpacks: first creature has Rush, second does not', a.keywords.includes('rush') && !b.keywords.includes('rush'), [a.keywords, b.keywords]);
}
// Special Delivery: first Rush creature summons a 1-Health copy
{
	const { state } = new Scenario(byId).def('t_r', { type: 'creature', cost: 2, attack: 3, health: 4, keywords: ['rush'] }).mana(0, 10).hand(0, ['t_r']).run();
	D.applyPassive(state, 0, 'special_delivery');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const copies = state.players[0].board.filter(c => c.id === 't_r' && !E.isDead(c));
	ok('Special Delivery: a 1-Health copy joins the board', copies.length === 2 && copies.some(c => E.hp(c) === 1) && copies.some(c => E.hp(c) === 4), copies.map(c => c.attack + '/' + E.hp(c)));
}
// Shadowcasting 101: first creature adds a 1/1 copy (cost 1) to hand
{
	const { state } = new Scenario(byId).def('t_c', { type: 'creature', cost: 5, attack: 6, health: 6 }).mana(0, 10).hand(0, ['t_c']).run();
	D.applyPassive(state, 0, 'shadowcasting_101');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const copy = state.players[0].hand.find(c => c.id === 't_c');
	ok('Shadowcasting 101: a 1/1 cost-1 copy in hand', state.players[0].hand.length === 1 && copy && copy.attack === 1 && E.hp(copy) === 1 && copy.cost === 1, copy && [copy.attack, E.hp(copy), copy.cost]);
}
// Rally the Troops: first Battlecry card draws a card
{
	const { state } = new Scenario(byId).def('t_bc', { type: 'creature', cost: 2, attack: 2, health: 2, keywords: ['battlecry'] }).def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d']).mana(0, 10).hand(0, ['t_bc']).run();
	D.applyPassive(state, 0, 'rally_the_troops');
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_bc').uid, null, null, 0);
	ok('Rally the Troops: drew a card after the Battlecry', state.players[0].hand.length === 1 && state.players[0].hand[0].id === 't_d', [state.players[0].hand.length, state.players[0].deck.length]);
}
// Lunar Band: first Deathrattle creature triggers its effect (and survives)
{
	const { state } = new Scenario(byId).def('t_dr', { type: 'creature', cost: 3, attack: 2, health: 3, keywords: ['deathrattle'], deathrattle: [{ type: 'damage', value: 3, target: 'enemy-hero' }] }).mana(0, 10).hand(0, ['t_dr']).run();
	D.applyPassive(state, 0, 'lunar_band');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const dr = state.players[0].board.find(c => c.id === 't_dr');
	ok('Lunar Band: deathrattle fired & the creature lives', state.players[1].life === 37 && dr && !E.isDead(dr), [state.players[1].life, dr && E.hp(dr)]);
}
// Ring of Refreshment: casting a spell refreshes the Hero Power
{
	const { state } = new Scenario(byId).def('t_sp', { type: 'sorcery', cost: 0, effects: [] }).mana(0, 10).hand(0, ['t_sp']).run();
	state.players[0].heroPowers = [{ usedThisTurn: true }];
	D.applyPassive(state, 0, 'ring_of_refreshment');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	ok('Ring of Refreshment: Hero Power refreshed after a spell', state.players[0].heroPowers[0].usedThisTurn === false);
}
// Staff of Pain: a Shadow spell deals 2 to each hero
{
	const { state } = new Scenario(byId).def('t_shadow', { type: 'sorcery', cost: 0, tribe: 'Shadow', effects: [] }).def('t_plain', { type: 'sorcery', cost: 0, effects: [] }).mana(0, 10).hand(0, ['t_shadow', 't_plain']).run();
	D.applyPassive(state, 0, 'staff_of_pain');
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_plain').uid, null, null, 0); // non-Shadow: no effect
	const afterPlain = [state.players[0].life, state.players[1].life];
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_shadow').uid, null, null, 0);
	ok('Staff of Pain: only the Shadow spell hits both heroes for 2', afterPlain[0] === 40 && afterPlain[1] === 40 && state.players[0].life === 38 && state.players[1].life === 38, [afterPlain, state.players[0].life, state.players[1].life]);
}
// Mending Pools: first Nature spell each turn heals your side (first-only)
{
	const { state } = new Scenario(byId).def('t_nat', { type: 'sorcery', cost: 0, tribe: 'Nature', effects: [] }).mana(0, 10).life(0, 20).hand(0, ['t_nat', 't_nat']).run();
	D.applyPassive(state, 0, 'mending_pools');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const afterFirst = state.players[0].life;
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_nat').uid, null, null, 0);
	ok('Mending Pools: first Nature spell heals 2, second does not', afterFirst === 22 && state.players[0].life === 22, [afterFirst, state.players[0].life]);
}
// Iron Roots: a Nature spell buffs a random friendly +1/+1 & Taunt
{
	const { state } = new Scenario(byId).def('t_nat', { type: 'sorcery', cost: 0, tribe: 'Nature', effects: [] }).def('t_m', { type: 'creature', cost: 2, attack: 2, health: 2 }).board(0, ['t_m']).mana(0, 10).hand(0, ['t_nat']).run();
	D.applyPassive(state, 0, 'iron_roots');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const m = state.players[0].board.find(c => c.id === 't_m');
	ok('Iron Roots: friendly gains +1/+1 & Taunt', m.attack === 3 && E.hp(m) === 3 && m.keywords.includes('taunt'), [m.attack, E.hp(m), m.keywords]);
}
// Spreading Saplings: a Nature spell summons a 1/1 Sapling
{
	const { state } = new Scenario(byId).def('t_nat', { type: 'sorcery', cost: 0, tribe: 'Nature', effects: [] }).mana(0, 10).hand(0, ['t_nat']).run();
	D.applyPassive(state, 0, 'spreading_saplings');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const sap = state.players[0].board.filter(c => c.name === 'Sapling');
	ok('Spreading Saplings: a 1/1 Sapling appears', sap.length === 1 && sap[0].attack === 1 && E.hp(sap[0]) === 1, sap.length);
}
// Guardian Light: a Holy spell summons a Cost/Cost Ancient Guardian
{
	const { state } = new Scenario(byId).def('t_holy', { type: 'sorcery', cost: 4, tribe: 'Holy', effects: [] }).mana(0, 10).hand(0, ['t_holy']).run();
	D.applyPassive(state, 0, 'guardian_light');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const g = state.players[0].board.find(c => c.name === 'Ancient Guardian');
	ok('Guardian Light: a 4/4 Ancient Guardian (Cost 4)', g && g.attack === 4 && E.hp(g) === 4, g && [g.attack, E.hp(g)]);
}
// Firekeeper's Idol: a Fire spell summons a 1/2 & adds one to hand
{
	const { state } = new Scenario(byId).def('t_fire', { type: 'sorcery', cost: 0, tribe: 'Fire', effects: [] }).mana(0, 10).hand(0, ['t_fire']).run();
	D.applyPassive(state, 0, 'firekeepers_idol');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const onBoard = state.players[0].board.filter(c => c.name === 'Flame Elemental');
	const inHand = state.players[0].hand.filter(c => c.name === 'Flame Elemental');
	ok("Firekeeper's Idol: 1/2 on board + one in hand", onBoard.length === 1 && onBoard[0].attack === 1 && E.hp(onBoard[0]) === 2 && inHand.length === 1, [onBoard.length, inHand.length]);
}
// Invigorating Light: a Holy spell gives your creatures +1 Health
{
	const { state } = new Scenario(byId).def('t_holy', { type: 'sorcery', cost: 0, tribe: 'Holy', effects: [] }).def('t_m', { type: 'creature', cost: 2, attack: 2, health: 2 }).board(0, ['t_m']).mana(0, 10).hand(0, ['t_holy']).run();
	D.applyPassive(state, 0, 'invigorating_light');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const m = state.players[0].board.find(c => c.id === 't_m');
	ok('Invigorating Light: creature gains +1 Health', m.attack === 2 && E.hp(m) === 3, [m.attack, E.hp(m)]);
}
// Robes of Shrinking: a drawn spell costs (1) less
{
	const { state } = new Scenario(byId).def('t_sp', { type: 'sorcery', cost: 4, effects: [] }).deck(0, ['t_sp']).run();
	D.applyPassive(state, 0, 'robes_of_shrinking');
	E.execEffects(state, 0, [{ type: 'draw', value: 1 }], null, null);
	const drawn = state.players[0].hand.find(c => c.id === 't_sp');
	ok('Robes of Shrinking: drawn spell costs (1) less', drawn && drawn.cost === 3, drawn && drawn.cost);
}
// Bronze Signet: drawing a creature adds a copy to hand
{
	const { state } = new Scenario(byId).def('t_c', { type: 'creature', cost: 3, attack: 3, health: 3 }).deck(0, ['t_c']).run();
	D.applyPassive(state, 0, 'bronze_signet');
	E.execEffects(state, 0, [{ type: 'draw', value: 1 }], null, null);
	ok('Bronze Signet: a copy joins your hand', state.players[0].hand.filter(c => c.id === 't_c').length === 2, state.players[0].hand.filter(c => c.id === 't_c').length);
}
// Glacial Downpour: casting Frost this turn summons a 2/3 Water Elemental at end of turn
{
	const { state } = new Scenario(byId).def('t_frost', { type: 'sorcery', cost: 0, tribe: 'Frost', effects: [] }).mana(0, 10).hand(0, ['t_frost']).run();
	D.applyPassive(state, 0, 'glacial_downpour');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	E.endTurn(state);
	const we = state.players[0].board.filter(c => c.name === 'Water Elemental');
	ok('Glacial Downpour: a 2/3 Water Elemental at end of turn', we.length === 1 && we[0].attack === 2 && E.hp(we[0]) === 3, we.length);
}
// Glacial Downpour: no Frost spell -> no Water Elemental
{
	const { state } = new Scenario(byId).def('t_plain', { type: 'sorcery', cost: 0, effects: [] }).mana(0, 10).hand(0, ['t_plain']).run();
	D.applyPassive(state, 0, 'glacial_downpour');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	E.endTurn(state);
	ok('Glacial Downpour: no Frost cast -> nothing summoned', state.players[0].board.filter(c => c.name === 'Water Elemental').length === 0);
}
// Flame Waves: 2 damage to all enemy creatures per Fire spell cast this turn
{
	const { state } = new Scenario(byId).def('t_fire', { type: 'sorcery', cost: 0, tribe: 'Fire', effects: [] }).def('t_wall', { type: 'creature', cost: 5, attack: 0, health: 12 }).board(1, ['t_wall', 't_wall']).mana(0, 10).hand(0, ['t_fire', 't_fire']).run();
	D.applyPassive(state, 0, 'flame_waves');
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_fire').uid, null, null, 0);
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_fire').uid, null, null, 0);
	E.endTurn(state);
	ok('Flame Waves: 2x(2 Fire spells) = 4 to each enemy creature', state.players[1].board.filter(c => c.id === 't_wall').every(c => c.damage === 4), state.players[1].board.map(c => c.damage));
}
// Arctic Armor: the first enemy you Freeze each turn grants 2 Armor
{
	const { state } = new Scenario(byId).def('t_e', { type: 'creature', cost: 3, attack: 2, health: 3 }).board(1, ['t_e', 't_e']).run();
	D.applyPassive(state, 0, 'arctic_armor');
	E.freezeCreature(state, state.players[1].board[0]);
	const after1 = state.players[0].armor;
	E.freezeCreature(state, state.players[1].board[1]);
	ok('Arctic Armor: first freeze grants 2 Armor, second grants none', after1 === 2 && state.players[0].armor === 2, [after1, state.players[0].armor]);
}
// Ring of Black Ice: a Frozen creature adds a (2)-cheaper copy to your hand
{
	const { state } = new Scenario(byId).def('t_e', { type: 'creature', cost: 5, attack: 4, health: 4 }).board(1, ['t_e']).run();
	D.applyPassive(state, 0, 'ring_of_black_ice');
	E.freezeCreature(state, state.players[1].board[0]);
	const cp = state.players[0].hand.find(c => c.id === 't_e');
	ok('Ring of Black Ice: a (2)-cheaper copy joins your hand', cp && cp.cost === 3, cp && cp.cost);
}
const kill = (state, pi, uid) => { const c = state.players[pi].board.find(x => x.uid === uid); c.damage = c.maxHealth; c.shield = false; E.sweepDeaths(state); };
// Manastorm: start with 10 Mana Crystals
{
	const { state } = new Scenario(byId).mana(0, 3).run();
	D.applyPassive(state, 0, 'manastorm');
	ok('Manastorm: 10 Mana Crystals', state.players[0].mana.max === 10 && state.players[0].mana.cur === 10, [state.players[0].mana.max, state.players[0].mana.cur]);
}
// Recycling: a friendly death grants 1 Armor
{
	const { state } = new Scenario(byId).def('t_m', { type: 'creature', cost: 1, attack: 2, health: 1 }).board(0, ['t_m']).run();
	D.applyPassive(state, 0, 'recycling');
	kill(state, 0, state.players[0].board[0].uid);
	ok('Recycling: +1 Armor on friendly death', state.players[0].armor === 1, state.players[0].armor);
}
// Starving: first friendly Beast death each turn draws a card
{
	const { state } = new Scenario(byId).def('t_beast', { type: 'creature', cost: 1, attack: 2, health: 1, tribe: 'Beast' }).def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d']).board(0, ['t_beast']).run();
	D.applyPassive(state, 0, 'starving');
	kill(state, 0, state.players[0].board[0].uid);
	ok('Starving: drew a card on Beast death', state.players[0].hand.filter(c => c.id === 't_d').length === 1);
}
// Dragonblood: first friendly Dragon death each turn buffs hand creatures +1/+1
{
	const { state } = new Scenario(byId).def('t_drag', { type: 'creature', cost: 1, attack: 2, health: 1, tribe: 'Dragon' }).def('t_h', { type: 'creature', cost: 2, attack: 2, health: 2 }).board(0, ['t_drag']).hand(0, ['t_h']).run();
	D.applyPassive(state, 0, 'dragonblood');
	kill(state, 0, state.players[0].board.find(c => c.id === 't_drag').uid);
	const h = state.players[0].hand.find(c => c.id === 't_h');
	ok('Dragonblood: hand creature +1/+1', h.attack === 3 && E.hp(h) === 3, [h.attack, E.hp(h)]);
}
// From the Swamp: first enemy death each turn raises a 1/1 Bloated Zombie for you
{
	const { state } = new Scenario(byId).def('t_e', { type: 'creature', cost: 1, attack: 2, health: 1 }).board(1, ['t_e']).run();
	D.applyPassive(state, 0, 'from_the_swamp');
	kill(state, 1, state.players[1].board[0].uid);
	const z = state.players[0].board.filter(c => c.name === 'Bloated Zombie');
	ok('From the Swamp: a 1/1 Bloated Zombie on enemy death', z.length === 1 && z[0].attack === 1 && E.hp(z[0]) === 1, z.length);
}
// Cadaver Collector: first Corpse gained each turn banks an extra
{
	const { state } = new Scenario(byId).def('t_m', { type: 'creature', cost: 1, attack: 2, health: 1 }).board(0, ['t_m']).run();
	D.applyPassive(state, 0, 'cadaver_collector');
	const before = state.players[0].corpses || 0;
	kill(state, 0, state.players[0].board[0].uid);
	ok('Cadaver Collector: +2 Corpses (1 base + 1 extra) on first death', (state.players[0].corpses || 0) === before + 2, [before, state.players[0].corpses]);
}
// Party Replacement: a 2/2 Adventurer at the start of your turn
{
	const { state } = new Scenario(byId).run();
	D.applyPassive(state, 0, 'party_replacement');
	E.endTurn(state); E.endTurn(state); // back to player 0's turn start
	const adv = state.players[0].board.filter(c => c.name === 'Adventurer');
	ok('Party Replacement: a 2/2 Adventurer', adv.length === 1 && adv[0].attack === 2 && E.hp(adv[0]) === 2 && adv[0].keywords.length >= 1, adv.length);
}
// Conduit of the Storms: Overloaded at your turn start -> +2 Attack
{
	const { state } = new Scenario(byId).run();
	D.applyPassive(state, 0, 'conduit_of_the_storms');
	state.players[0].overloadPending = 2; // will lock at player 0's next turn start
	E.endTurn(state); E.endTurn(state);
	ok('Conduit of the Storms: +2 hero Attack while Overloaded', state.players[0].heroTempAttack === 2, state.players[0].heroTempAttack);
}
// Crystal Gem: an extra Mana Crystal on your first two turns
{
	const { state } = new Scenario(byId).run();
	D.applyPassive(state, 0, 'crystal_gem');
	E.endTurn(state); E.endTurn(state); // player 0's turn start #1 under the gem
	ok('Crystal Gem: banks an extra crystal (used counter advances)', state.players[0]._cgUsed === 1 && state.players[0].mana.max >= 2, [state.players[0]._cgUsed, state.players[0].mana.max]);
}
// Sandy Surprise: a (3)-or-less creature gains Stealth
{
	const { state } = new Scenario(byId).def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 }).def('t_big', { type: 'creature', cost: 6, attack: 6, health: 6 }).mana(0, 10).hand(0, ['t_c', 't_big']).run();
	D.applyPassive(state, 0, 'sandy_surprise');
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_c').uid, null, null, 0);
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_big').uid, null, null, 0);
	const small = state.players[0].board.find(c => c.id === 't_c');
	const big = state.players[0].board.find(c => c.id === 't_big');
	ok('Sandy Surprise: cheap creature Stealthed, big one not', small.keywords.includes('stealth') && !big.keywords.includes('stealth'), [small.keywords, big.keywords]);
}
// The Floor is Lava: first creature each turn gets +2 Attack & 1 damage
{
	const { state } = new Scenario(byId).def('t_c', { type: 'creature', cost: 2, attack: 2, health: 4 }).mana(0, 10).hand(0, ['t_c']).run();
	D.applyPassive(state, 0, 'the_floor_is_lava');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const m = state.players[0].board.find(c => c.id === 't_c');
	ok('The Floor is Lava: +2 Attack & took 1 damage', m.attack === 4 && m.damage === 1, [m.attack, m.damage]);
}
// Righteous Reserves: first Divine Shield creature gives a random friendly Divine Shield
{
	const { state } = new Scenario(byId).def('t_ds', { type: 'creature', cost: 2, attack: 2, health: 2, keywords: ['divine_shield'] }).def('t_plain', { type: 'creature', cost: 1, attack: 1, health: 3 }).board(0, ['t_plain']).mana(0, 10).hand(0, ['t_ds']).run();
	D.applyPassive(state, 0, 'righteous_reserves');
	state.rng = () => 0.99; // force the "random friendly" to the last board creature (t_plain)
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const plain = state.players[0].board.find(c => c.id === 't_plain');
	ok('Righteous Reserves: a friendly gains Divine Shield', plain.keywords.includes('divine_shield') || plain.shield === true, [plain.keywords, plain.shield]);
}
// Inspiring Presence: a Legendary cheapens a random hand card by (2)
{
	const { state } = new Scenario(byId).def('t_leg', { type: 'creature', cost: 5, attack: 5, health: 5, rarity: 'legendary' }).def('t_hand', { type: 'creature', cost: 6, attack: 6, health: 6 }).mana(0, 10).hand(0, ['t_leg', 't_hand']).run();
	D.applyPassive(state, 0, 'inspiring_presence');
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_leg').uid, null, null, 0);
	const hc = state.players[0].hand.find(c => c.id === 't_hand');
	ok('Inspiring Presence: hand card costs (2) less', hc && hc.cost === 4, hc && hc.cost);
}
// Fireshaper: a spell deals 1 to a random enemy creature
{
	const { state } = new Scenario(byId).def('t_sp', { type: 'sorcery', cost: 0, effects: [] }).def('t_wall', { type: 'creature', cost: 5, attack: 0, health: 10 }).board(1, ['t_wall']).mana(0, 10).hand(0, ['t_sp']).run();
	D.applyPassive(state, 0, 'fireshaper');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	ok('Fireshaper: 1 damage to the enemy', state.players[1].board[0].damage === 1 || state.players[1].life === 39, [state.players[1].board[0].damage, state.players[1].life]);
}
// Arcanite Crystal: an Arcane spell cheapens a random hand card by (1)
{
	const { state } = new Scenario(byId).def('t_arc', { type: 'sorcery', cost: 0, tribe: 'Arcane', effects: [] }).def('t_h', { type: 'creature', cost: 5, attack: 5, health: 5 }).mana(0, 10).hand(0, ['t_arc', 't_h']).run();
	D.applyPassive(state, 0, 'arcanite_crystal');
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_arc').uid, null, null, 0);
	const h = state.players[0].hand.find(c => c.id === 't_h');
	ok('Arcanite Crystal: hand card costs (1) less', h && h.cost === 4, h && h.cost);
}
// Wither the Weak: first Fel spell hits the lowest-Health enemy creature
{
	const { state } = new Scenario(byId).def('t_fel', { type: 'sorcery', cost: 0, tribe: 'Fel', effects: [] }).def('t_big', { type: 'creature', cost: 5, attack: 2, health: 8 }).def('t_small', { type: 'creature', cost: 1, attack: 1, health: 2 }).board(1, ['t_big', 't_small']).mana(0, 10).hand(0, ['t_fel']).run();
	D.applyPassive(state, 0, 'wither_the_weak');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const small = state.players[1].board.find(c => c.id === 't_small');
	const big = state.players[1].board.find(c => c.id === 't_big');
	ok('Wither the Weak: the lowest-Health enemy takes 1', small.damage === 1 && big.damage === 0, [small.damage, big.damage]);
}
// Unstable Magic: an Arcane spell Sheeps a random enemy creature
{
	const { state } = new Scenario(byId).def('t_arc', { type: 'sorcery', cost: 0, tribe: 'Arcane', effects: [] }).def('t_e', { type: 'creature', cost: 6, attack: 6, health: 6 }).board(1, ['t_e']).mana(0, 10).hand(0, ['t_arc']).run();
	D.applyPassive(state, 0, 'unstable_magic');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const sheep = state.players[1].board.filter(c => c.name === 'Sheep' && !E.isDead(c));
	ok('Unstable Magic: enemy becomes a 1/1 Sheep', sheep.length === 1 && sheep[0].attack === 1 && E.hp(sheep[0]) === 1 && !state.players[1].board.some(c => c.id === 't_e' && !E.isDead(c)), sheep.length);
}
// Endurance Training: Taunt creatures cost (2) less
{
	const { state } = new Scenario(byId).def('t_t', { type: 'creature', cost: 4, attack: 3, health: 5, keywords: ['taunt'] }).def('t_n', { type: 'creature', cost: 4, attack: 4, health: 4 }).hand(0, ['t_t', 't_n']).run();
	D.applyPassive(state, 0, 'endurance_training');
	ok('Endurance Training: Taunt -2, non-Taunt unchanged', E.effectiveCost(state, 0, state.players[0].hand.find(c => c.id === 't_t')) === 2 && E.effectiveCost(state, 0, state.players[0].hand.find(c => c.id === 't_n')) === 4);
}
// All Together Now: Battlecry cards cost (1) less, floor (2)
{
	const { state } = new Scenario(byId).def('t_bc', { type: 'creature', cost: 4, attack: 2, health: 2, keywords: ['battlecry'] }).def('t_low', { type: 'creature', cost: 2, attack: 2, health: 2, keywords: ['battlecry'] }).hand(0, ['t_bc', 't_low']).run();
	D.applyPassive(state, 0, 'all_together_now');
	ok('All Together Now: -1 but floored at (2)', E.effectiveCost(state, 0, state.players[0].hand.find(c => c.id === 't_bc')) === 3 && E.effectiveCost(state, 0, state.players[0].hand.find(c => c.id === 't_low')) === 2);
}
// Dragon Affinity: the first Dragon each turn costs (1) less
{
	const { state } = new Scenario(byId).def('t_drag', { type: 'creature', cost: 5, attack: 5, health: 5, tribe: 'Dragon' }).hand(0, ['t_drag']).run();
	D.applyPassive(state, 0, 'dragon_affinity');
	const before = E.effectiveCost(state, 0, state.players[0].hand[0]);
	state.players[0].creaturesPlayedThisTurn = 1; // no longer the first
	const after = E.effectiveCost(state, 0, state.players[0].hand[0]);
	ok('Dragon Affinity: first Dragon (4), later full (5)', before === 4 && after === 5, [before, after]);
}
// Greedy Gains: +2/+2 on board, +2 cost in hand
{
	const { state } = new Scenario(byId).def('t_m', { type: 'creature', cost: 3, attack: 2, health: 2 }).board(0, ['t_m']).hand(0, ['t_m']).run();
	D.applyPassive(state, 0, 'greedy_gains');
	const b = state.players[0].board.find(c => c.id === 't_m');
	ok('Greedy Gains: board +2/+2', b.attack === 4 && E.hp(b) === 4, [b.attack, E.hp(b)]);
	ok('Greedy Gains: hand +2 Cost', E.effectiveCost(state, 0, state.players[0].hand[0]) === 5);
}
// Meek Mastery: Neutral creatures +1/+1 & (1) cheaper; other classes untouched
{
	const { state } = new Scenario(byId).def('t_neu', { type: 'creature', cost: 4, attack: 2, health: 2, cardClass: 'neutral' }).def('t_mage', { type: 'creature', cost: 4, attack: 2, health: 2, cardClass: 'mage' }).board(0, ['t_neu', 't_mage']).hand(0, ['t_neu']).run();
	D.applyPassive(state, 0, 'meek_mastery');
	const neu = state.players[0].board.find(c => c.id === 't_neu');
	const mage = state.players[0].board.find(c => c.id === 't_mage');
	ok('Meek Mastery: Neutral +1/+1, non-Neutral unchanged', neu.attack === 3 && E.hp(neu) === 3 && mage.attack === 2 && E.hp(mage) === 2, [neu.attack, mage.attack]);
	ok('Meek Mastery: Neutral hand card (1) cheaper', E.effectiveCost(state, 0, state.players[0].hand[0]) === 3);
}
// Sticky Fingers: cards not from your starting deck cost (1) less
{
	const { state } = new Scenario(byId).def('t_x', { type: 'creature', cost: 4, attack: 3, health: 3 }).hand(0, ['t_x']).run();
	state.players[0].startingDeckIds = ['something_else'];
	D.applyPassive(state, 0, 'sticky_fingers');
	ok('Sticky Fingers: non-deck card (1) cheaper', E.effectiveCost(state, 0, state.players[0].hand[0]) === 3);
}
// Hold the Line: Taunt creatures gain +3 Attack on the opponent's turn
{
	const { state } = new Scenario(byId).def('t_t', { type: 'creature', cost: 3, attack: 2, health: 4, keywords: ['taunt'] }).mana(0, 10).hand(0, ['t_t']).run();
	D.applyPassive(state, 0, 'hold_the_line');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const m = state.players[0].board.find(c => c.id === 't_t');
	state.current = 0; E.recomputeAuras(state);
	const onYourTurn = m.attack;
	state.current = 1; E.recomputeAuras(state);
	ok('Hold the Line: +3 Attack on opponent turn only', onYourTurn === 2 && m.attack === 5, [onYourTurn, m.attack]);
}
// Scattered Caltrops: the opponent's first creature each turn takes 1
{
	const { state } = new Scenario(byId).def('t_c', { type: 'creature', cost: 1, attack: 2, health: 3 }).mana(1, 10).hand(1, ['t_c', 't_c']).run();
	D.applyPassive(state, 0, 'scattered_caltrops');
	state.current = 1;
	E.playCard(state, 1, state.players[1].hand.find(c => c.id === 't_c').uid, null, null, 1);
	const first = state.players[1].board.find(c => c.id === 't_c');
	E.playCard(state, 1, state.players[1].hand.find(c => c.id === 't_c').uid, null, null, 1);
	ok('Scattered Caltrops: first enemy creature took 1', first.damage === 1 && state.players[1].board.filter(c => c.damage === 1).length === 1, state.players[1].board.map(c => c.damage));
}
// Oops, All Spells!: deck loses creatures & spells cost (1) less
{
	const { state } = new Scenario(byId).def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 }).def('t_sp', { type: 'sorcery', cost: 3, effects: [] }).deck(0, ['t_c', 't_c', 't_sp']).hand(0, ['t_sp']).run();
	D.applyPassive(state, 0, 'oops_all_spells');
	ok('Oops, All Spells!: no creatures in deck, spell (1) cheaper', !state.players[0].deck.some(id => id === 't_c') && state.players[0].deck.includes('t_sp') && E.effectiveCost(state, 0, state.players[0].hand[0]) === 2, state.players[0].deck);
}
// Heavy Armor: Health set to 10, damage capped at 1
{
	const { state } = new Scenario(byId).mana(0, 10).run();
	D.applyPassive(state, 0, 'heavy_armor');
	const life0 = state.players[0].life;
	E.execEffects(state, 0, [{ type: 'damage', value: 5, target: 'own-hero' }], null, null);
	ok('Heavy Armor: 10 Health, big hit reduced to 1', life0 === 10 && state.players[0].life === 9, [life0, state.players[0].life]);
}
// Sunstrider's Crown: the third spell each turn costs (1)
{
	const { state } = new Scenario(byId).def('t_sp', { type: 'sorcery', cost: 5, effects: [] }).hand(0, ['t_sp']).run();
	D.applyPassive(state, 0, 'sunstriders_crown');
	state.players[0].spellsPlayedThisTurn = 0;
	const first = E.effectiveCost(state, 0, state.players[0].hand[0]);
	state.players[0].spellsPlayedThisTurn = 2; // next is the 3rd
	const third = E.effectiveCost(state, 0, state.players[0].hand[0]);
	ok("Sunstrider's Crown: 1st full (5), 3rd costs (1)", first === 5 && third === 1, [first, third]);
}
// Ring of Haste: the third creature each turn costs (1)
{
	const { state } = new Scenario(byId).def('t_c', { type: 'creature', cost: 5, attack: 5, health: 5 }).hand(0, ['t_c']).run();
	D.applyPassive(state, 0, 'ring_of_haste');
	state.players[0].creaturesPlayedThisTurn = 2; // next is the 3rd
	ok('Ring of Haste: third creature costs (1)', E.effectiveCost(state, 0, state.players[0].hand[0]) === 1);
}
// Grommash's Armguards: draw a weapon; weapons cost (1) less
{
	const { state } = new Scenario(byId).def('t_w', { type: 'weapon', cost: 3, attack: 3, durability: 2 }).deck(0, ['t_w']).run();
	D.applyPassive(state, 0, 'grommashs_armguards');
	const w = state.players[0].hand.find(c => c.id === 't_w');
	ok("Grommash's Armguards: weapon drawn & (1) cheaper", w && E.effectiveCost(state, 0, w) === 2, w && E.effectiveCost(state, 0, w));
}
// Open the Doorways: first Discover each turn -> a second copy of the pick
{
	const { state } = new Scenario(byId).run();
	D.applyPassive(state, 0, 'open_the_doorways');
	E.execEffects(state, 0, [{ type: 'discover', cardType: 'creature' }], null, null);
	const ids = state.pickQueue[0].ids;
	E.resolvePick(state, ids[0]);
	ok('Open the Doorways: two copies of the discovered card', state.players[0].hand.filter(c => c.id === ids[0]).length === 2, state.players[0].hand.map(c => c.id));
}
// Orb of Revelation: first Discover each turn -> hand spells (1) cheaper
{
	const { state } = new Scenario(byId).def('t_sp', { type: 'sorcery', cost: 4, effects: [] }).hand(0, ['t_sp']).run();
	D.applyPassive(state, 0, 'orb_of_revelation');
	E.execEffects(state, 0, [{ type: 'discover', cardType: 'creature' }], null, null);
	E.resolvePick(state, state.pickQueue[0].ids[0]);
	ok('Orb of Revelation: the hand spell now costs (3)', state.players[0].hand.find(c => c.id === 't_sp').cost === 3, state.players[0].hand.find(c => c.id === 't_sp').cost);
}
// Arcane Flux: first Arcane spell queues a Discover
{
	const { state } = new Scenario(byId).def('t_arc', { type: 'sorcery', cost: 0, tribe: 'Arcane', effects: [] }).mana(0, 10).hand(0, ['t_arc']).run();
	state.players[0].heroClass = 'mage';
	D.applyPassive(state, 0, 'arcane_flux');
	const before = state.pickQueue.length;
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	ok('Arcane Flux: an Arcane spell queues a Discover', state.pickQueue.length === before + 1, [before, state.pickQueue.length]);
}
// Divine Illumination: first Holy spell queues a Discover
{
	const { state } = new Scenario(byId).def('t_holy', { type: 'sorcery', cost: 0, tribe: 'Holy', effects: [] }).mana(0, 10).hand(0, ['t_holy']).run();
	state.players[0].heroClass = 'priest';
	D.applyPassive(state, 0, 'divine_illumination');
	const before = state.pickQueue.length;
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	ok('Divine Illumination: a Holy spell queues a Discover', state.pickQueue.length === before + 1, [before, state.pickQueue.length]);
}
// Mulch Madness: a Neutral death on your turn grants 1 temporary Mana
{
	const { state } = new Scenario(byId).def('t_n', { type: 'creature', cost: 2, attack: 2, health: 1, cardClass: 'neutral' }).board(0, ['t_n']).mana(0, 5).run();
	D.applyPassive(state, 0, 'mulch_madness');
	kill(state, 0, state.players[0].board[0].uid);
	ok('Mulch Madness: +1 Mana this turn', state.players[0].mana.cur === 6, state.players[0].mana.cur);
}
// Staking A Claim: first Discover card played buffs friendly creatures +1 Attack
{
	const { state } = new Scenario(byId).def('t_disc', { type: 'sorcery', cost: 0, effects: [{ type: 'discover', cardType: 'creature' }] }).def('t_m', { type: 'creature', cost: 2, attack: 2, health: 2 }).board(0, ['t_m']).mana(0, 10).hand(0, ['t_disc']).run();
	D.applyPassive(state, 0, 'staking_a_claim');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	ok('Staking A Claim: friendly +1 Attack', state.players[0].board.find(c => c.id === 't_m').attack === 3, state.players[0].board.find(c => c.id === 't_m').attack);
}
// Potion of Sparking: a friendly Rush attack zaps an adjacent enemy
{
	const { state } = new Scenario(byId).def('t_r', { type: 'creature', cost: 3, attack: 3, health: 3, keywords: ['rush'] }).def('t_d', { type: 'creature', cost: 3, attack: 2, health: 6 }).def('t_a', { type: 'creature', cost: 3, attack: 2, health: 6 }).board(0, ['t_r']).board(1, ['t_d', 't_a']).run();
	D.applyPassive(state, 0, 'potion_of_sparking');
	const atk = state.players[0].board[0]; atk.sick = false; atk.attacksUsed = 0;
	E.resolveCombat(state, 0, atk.uid, { type: 'creature', uid: state.players[1].board.find(c => c.id === 't_d').uid, player: 1 });
	const adj = state.players[1].board.find(c => c.id === 't_a');
	ok('Potion of Sparking: the adjacent enemy took 1', adj.damage === 1, adj.damage);
}
// Pillage the Fallen: a destroyed weapon is replaced by a same-Cost weapon (+1 Attack)
{
	const { state } = new Scenario(byId).run();
	D.applyPassive(state, 0, 'pillage_the_fallen');
	state.players[0].weapon = { id: 'tmp_weapon', name: 'Scrap Blade', type: 'weapon', cost: 3, attack: 2, durability: 2, zone: 'weapon', keywords: [], damage: 0 };
	E.breakWeapon(state, 0, true);
	ok('Pillage the Fallen: a replacement weapon is equipped', state.players[0].weapon != null && state.players[0].weapon.id !== 'tmp_weapon', state.players[0].weapon && state.players[0].weapon.name);
}
// Kindling Flame: Fire Spell Damage +1 (only Fire)
{
	const { state } = new Scenario(byId).def('t_fire', { type: 'sorcery', cost: 0, tribe: 'Fire', effects: [{ type: 'damage', value: 3, target: 'enemy-hero' }] }).def('t_frost', { type: 'sorcery', cost: 0, tribe: 'Frost', effects: [{ type: 'damage', value: 3, target: 'enemy-hero' }] }).mana(0, 10).hand(0, ['t_frost', 't_fire']).run();
	D.applyPassive(state, 0, 'kindling_flame');
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_frost').uid, null, null, 0); // no bonus
	const afterFrost = state.players[1].life;
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_fire').uid, null, null, 0); // +1
	ok('Kindling Flame: Fire +1, Frost unaffected', afterFrost === 37 && state.players[1].life === 33, [afterFrost, state.players[1].life]);
}
// Bitter Cold: Frost Spell Damage +1
{
	const { state } = new Scenario(byId).def('t_frost', { type: 'sorcery', cost: 0, tribe: 'Frost', effects: [{ type: 'damage', value: 2, target: 'enemy-hero' }] }).mana(0, 10).hand(0, ['t_frost']).run();
	D.applyPassive(state, 0, 'bitter_cold');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	ok('Bitter Cold: Frost spell deals +1', state.players[1].life === 37, state.players[1].life);
}
// Natural Force: Nature Spell Damage +1
{
	const { state } = new Scenario(byId).def('t_nat', { type: 'sorcery', cost: 0, tribe: 'Nature', effects: [{ type: 'damage', value: 2, target: 'enemy-hero' }] }).mana(0, 10).hand(0, ['t_nat']).run();
	D.applyPassive(state, 0, 'natural_force');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	ok('Natural Force: Nature spell deals +1', state.players[1].life === 37, state.players[1].life);
}
// Battle Stance: +2 hero Attack on your turn
{
	const { state } = new Scenario(byId).run();
	D.applyPassive(state, 0, 'battle_stance');
	E.endTurn(state); E.endTurn(state);
	ok('Battle Stance: +2 hero Attack at your turn start', state.players[0].heroTempAttack === 2, state.players[0].heroTempAttack);
}
// Hagatha's Embrace (Duels): two random hand creatures +1/+1
{
	const { state } = new Scenario(byId).def('t_h', { type: 'creature', cost: 2, attack: 2, health: 2 }).hand(0, ['t_h']).run();
	D.applyPassive(state, 0, 'hagathas_embrace');
	E.endTurn(state); E.endTurn(state);
	const h = state.players[0].hand.find(c => c.id === 't_h');
	ok("Hagatha's Embrace: the lone hand creature got both +1/+1s", h.attack === 4 && h.maxHealth === 4, [h.attack, h.maxHealth]);
}
// Ever-Changing Elixir (Duels): end of turn transforms a friendly into a pricier one
{
	const { state } = new Scenario(byId).def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 }).board(0, ['t_c']).run();
	D.applyPassive(state, 0, 'ever_changing_elixir');
	E.endTurn(state);
	const b = state.players[0].board.filter(c => !E.isDead(c));
	ok('Ever-Changing Elixir: the creature was transformed', b.length === 1 && b[0].id !== 't_c' && b[0].token === true, b.map(c => c.id));
}
// Corrupted Felstone: a Fel spell buffs the end creatures in hand +2/+1
{
	const { state } = new Scenario(byId).def('t_fel', { type: 'sorcery', cost: 0, tribe: 'Fel', effects: [] }).def('t_l', { type: 'creature', cost: 2, attack: 2, health: 2 }).def('t_r', { type: 'creature', cost: 2, attack: 3, health: 3 }).def('t_mid', { type: 'creature', cost: 2, attack: 1, health: 1 }).mana(0, 10).hand(0, ['t_l', 't_mid', 't_r', 't_fel']).run();
	D.applyPassive(state, 0, 'corrupted_felstone');
	E.playCard(state, 0, state.players[0].hand.find(c => c.id === 't_fel').uid, null, null, 0);
	const l = state.players[0].hand.find(c => c.id === 't_l'); const r = state.players[0].hand.find(c => c.id === 't_r'); const mid = state.players[0].hand.find(c => c.id === 't_mid');
	ok('Corrupted Felstone: ends +2/+1, middle unchanged', l.attack === 4 && l.maxHealth === 3 && r.attack === 5 && r.maxHealth === 4 && mid.attack === 1, [l.attack, r.attack, mid.attack]);
}
// Coil Casting: first Naga each turn adds a random 1-Cost spell
{
	const { state } = new Scenario(byId).def('t_naga', { type: 'creature', cost: 2, attack: 2, health: 2, tribe: 'Naga' }).mana(0, 10).hand(0, ['t_naga']).run();
	D.applyPassive(state, 0, 'coil_casting');
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	const spells = state.players[0].hand.filter(c => E.isSpellType ? E.isSpellType(c) : (c.type === 'sorcery' || c.type === 'instant'));
	ok('Coil Casting: a 1-Cost spell was added', spells.length === 1 && (byId[spells[0].id]?.cost === 1), spells.map(c => c.id));
}
// Plaguebringer: spells cost (2) less & Overload (1)
{
	const { state } = new Scenario(byId).def('t_sp', { type: 'sorcery', cost: 5, effects: [] }).mana(0, 10).hand(0, ['t_sp']).run();
	D.applyPassive(state, 0, 'plaguebringer');
	const cost = E.effectiveCost(state, 0, state.players[0].hand[0]);
	E.playCard(state, 0, state.players[0].hand[0].uid, null, null, 0);
	ok('Plaguebringer: spell costs (3) & queues Overload (1)', cost === 3 && state.players[0].overloadPending === 1, [cost, state.players[0].overloadPending]);
}
// Legendary Loot: first turn queues a weapon Discover
{
	const { state } = new Scenario(byId).run();
	D.applyPassive(state, 0, 'legendary_loot');
	const before = state.pickQueue.length;
	E.endTurn(state); E.endTurn(state); // player 0's turn start
	ok('Legendary Loot: a Discover is queued on your turn', state.pickQueue.length === before + 1 && state.players[0]._legLootUsed === true, [before, state.pickQueue.length]);
}
// Mysterious Tome: 2 Secrets installed at the start
{
	const { state } = new Scenario(byId).run();
	const before = state.players[0].secrets.length;
	D.applyPassive(state, 0, 'mysterious_tome');
	ok('Mysterious Tome: two Secrets in play', state.players[0].secrets.length === before + 2, [before, state.players[0].secrets.length]);
}
// Blood Shields: the first Corpse spend each turn heals 2
{
	const { state } = new Scenario(byId).run();
	state.players[0].corpses = 5; state.players[0].life = 20;
	D.applyPassive(state, 0, 'blood_shields');
	E.spendCorpses(state, 0, 1);
	const afterFirst = state.players[0].life;
	E.spendCorpses(state, 0, 1); // second spend same turn -> no heal
	ok('Blood Shields: +2 Health on first spend only', afterFirst === 22 && state.players[0].life === 22 && state.players[0].corpses === 3, [afterFirst, state.players[0].life, state.players[0].corpses]);
}
// Ghouls Rush In: the first Corpse spend each turn summons a 2/2 Rush Ghoul
{
	const { state } = new Scenario(byId).run();
	state.players[0].corpses = 5;
	D.applyPassive(state, 0, 'ghouls_rush_in');
	E.spendCorpses(state, 0, 2);
	const g = state.players[0].board.filter(c => c.name === 'Risen Ghoul');
	ok('Ghouls Rush In: a 2/2 Rush Ghoul', g.length === 1 && g[0].attack === 2 && E.hp(g[0]) === 2 && g[0].keywords.includes('rush') && state.players[0].corpses === 3, [g.length, state.players[0].corpses]);
}
// Cold Feet Pact: end of turn summons a Risen Groom = half Corpses
{
	const { state } = new Scenario(byId).run();
	state.players[0].corpses = 6;
	D.applyPassive(state, 0, 'cold_feet_pact');
	E.endTurn(state);
	const gr = state.players[0].board.filter(c => c.name === 'Risen Groom');
	ok('Cold Feet Pact: a 3/3 Risen Groom (half of 6 Corpses)', gr.length === 1 && gr[0].attack === 3 && E.hp(gr[0]) === 3, gr.length);
}

// ---------------- boss ladder ----------------
{
	const keys = Object.keys(D.BOSSES);
	ok('BOSSES: 13 rivals + a final', keys.length === 14 && D.BOSSES.uber_diablo && D.BOSSES.uber_diablo.final === true, keys.length);
	// every boss is well-formed and its power resolves through the registry
	const badPower = keys.filter(k => {
		const b = D.BOSSES[k];
		return !(b.name && b.health > 0 && b.hsId && b.power && Array.isArray(b.power.effects) && b.power.effects.length
			&& b.power.effects.every(e => getEffectHandler(e.type) || e.type === 'damage'));
	});
	ok('every boss power uses registered effects', badPower.length === 0, badPower);
	// ROUNDS reference only real bosses; finals are marked/exist
	const refs = D.ROUNDS.flatMap(r => [...r.pool, r.final]);
	ok('ROUNDS reference only real bosses', refs.every(id => D.BOSSES[id]), refs.filter(id => !D.BOSSES[id]));
	ok('every boss appears in exactly one round path', new Set(refs).size === keys.length, [new Set(refs).size, keys.length]);
}
// fire a couple of boss powers (as player 0, through the real engine)
{
	// Diablo: 2 to all enemy creatures
	const s = new Scenario(byId).def('t_v', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.def('t_pw', { type: 'sorcery', cost: 0, effects: JSON.parse(JSON.stringify(D.BOSSES.diablo.power.effects)) })
		.board(1, ['t_v', 't_v']).mana(0, 10).hand(0, ['t_pw']).play(0, 't_pw').run();
	ok('Diablo Fire Stomp: enemy creatures take 2', s.state.players[1].board.every(c => c.damage === 2), s.state.players[1].board.map(c => c.damage));
}
{
	// Uber Diablo: 3 to enemy creatures + a 6/6 Terror on your side
	const s = new Scenario(byId).def('t_pw', { type: 'sorcery', cost: 0, effects: JSON.parse(JSON.stringify(D.BOSSES.uber_diablo.power.effects)) })
		.mana(0, 10).hand(0, ['t_pw']).play(0, 't_pw').run();
	const terror = s.state.players[0].board.filter(c => c.name === 'Terror of Sanctuary');
	ok('Uber Diablo Realm of Terror: a 6/6 Terror', terror.length === 1 && terror[0].attack === 6 && E.hp(terror[0]) === 6, terror.length);
}
// buildBossDeck: deterministic, right size, valid ids
{
	const deck = D.buildBossDeck(byId, D.BOSSES.diablo.theme, 30);
	const deck2 = D.buildBossDeck(byId, D.BOSSES.diablo.theme, 30);
	ok('buildBossDeck: 30 valid card ids, deterministic', deck.length === 30 && deck.every(id => byId[id] && byId[id].type === 'creature') && JSON.stringify(deck) === JSON.stringify(deck2), deck.length);
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
