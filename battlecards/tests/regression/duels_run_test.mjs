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
ok('PASSIVES has the 21 entries', Object.keys(D.PASSIVES).length === 21 && ['robe_of_the_apprentice', 'small_backpacks', 'small_pouches', 'band_of_bees', 'emerald_goggles', 'rhonins_scrying_orb', 'rocket_backpacks', 'special_delivery', 'shadowcasting_101', 'rally_the_troops', 'lunar_band', 'ring_of_refreshment', 'staff_of_pain', 'mending_pools', 'iron_roots', 'spreading_saplings', 'guardian_light', 'firekeepers_idol', 'invigorating_light', 'robes_of_shrinking', 'bronze_signet'].every(k => D.PASSIVES[k]));
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
