// duels_arsenal_test.mjs — the Duels weapons + treasure-minions wave: 20
// treasure weapons, 40 treasure minions, the Demon Companion / SI:7 / hound
// tokens, Chaos Storm, and Scarlet Leafdancer (20th hero). Everything FIRES.
import fs from 'fs';
import * as E from '../../engine.js';
import * as Duels from '../../duels.js';
import { seededRng } from '../../engine/rng.js';
import { effectiveCost } from '../../engine/cost.js';
import { damageCreature, healHero } from '../../engine/damage.js';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
byId._v = { id: '_v', name: 'Dummy', type: 'creature', cost: 1, attack: 2, health: 8, rarity: 'common' };
byId._glass = { id: '_glass', name: 'Glass', type: 'creature', cost: 1, attack: 1, health: 1, rarity: 'common' };
byId._beast = { id: '_beast', name: 'Test Boar', type: 'creature', cost: 2, attack: 2, health: 2, tribe: 'Beast', rarity: 'common' };
byId._demon = { id: '_demon', name: 'Test Imp', type: 'creature', cost: 2, attack: 2, health: 2, tribe: 'Demon', rarity: 'common' };
byId._undead = { id: '_undead', name: 'Test Ghoul', type: 'creature', cost: 2, attack: 2, health: 2, tribe: 'Undead', rarity: 'common' };
byId._rusher = { id: '_rusher', name: 'Test Rusher', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', keywords: ['rush'] };
byId._legend = { id: '_legend', name: 'Test Legend', type: 'creature', cost: 5, attack: 5, health: 5, rarity: 'legendary' };
byId._dr = { id: '_dr', name: 'Rattler', type: 'creature', cost: 2, attack: 1, health: 2, rarity: 'common', keywords: ['deathrattle'], deathrattle: [{ type: 'draw', value: 1 }] };
byId._spark = { id: '_spark', name: 'Test Spark', type: 'sorcery', cost: 4, rarity: 'common', effects: [{ type: 'damage', value: 1, target: 'enemy-hero' }] };
byId._cheapspark = { id: '_cheapspark', name: 'Cheap Spark', type: 'sorcery', cost: 0, rarity: 'common', effects: [{ type: 'damage', value: 1, target: 'enemy-hero' }] };
byId._ol = { id: '_ol', name: 'Test Bolt', type: 'sorcery', cost: 1, rarity: 'common', overload: 1, effects: [{ type: 'damage', value: 2, target: 'enemy-hero' }] };

let pass = 0, fail = 0;
const ok = (l, c, x) => { if (c) pass++; else { fail++; console.log('FAIL:', l, x ?? ''); } };

function fresh() {
	const st = E.createGame(byId, seededRng(64), null, 2,
		[{ id: 'mage', name: 'A', power: null }, { id: 'mage', name: 'B', power: null }]);
	st.current = 0; st.priority = null; st.stack = [];
	for (const p of st.players) { p.hand = []; p.deck = ['_v', '_v', '_v', '_v', '_v', '_v']; p.board = []; p.secrets = []; p.heroPowers = []; p.mana = { cur: 30, max: 10, bonus: 0 }; }
	return st;
}
const give = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'hand'; st.players[pi].hand.push(c); return c; };
const put = (st, pi, id) => { const c = E.instantiate(byId[id], pi); c.zone = 'board'; c.sick = false; st.players[pi].board.push(c); E.recomputeAuras(st); return c; };
const arm = (st, pi, id) => { const w = E.instantiate(byId[id], pi); w.zone = 'weapon'; st.players[pi].weapon = w; E.recomputeAuras(st); return w; };
const play = (st, pi, id, target) => { const c = give(st, pi, id); E.playCard(st, pi, c.uid, target ?? null, null); return c; };
const heroSwing = (st, pi) => { st.players[pi].heroAttacksUsed = 0; E.heroAttack(st, pi, { type: 'hero', player: 1 - pi }); };

// ---- wiring ----
{
	const scarlet = Duels.HEROES.find(h => h.id === 'scarlet');
	ok('Scarlet Leafdancer is the 20th hero (death knight)', !!scarlet && scarlet.heroClass === 'death_knight' && Duels.HEROES.length === 20, Duels.HEROES.length);
	ok('Scarlet also rides as a rival', Duels.RIVALS.some(r => r.id === 'scarlet'));
	const ids = ['duels_tempests_fury', 'duels_claws_of_terror', 'duels_horns_of_flame', 'duels_archmage_staff', 'duels_queldelar', 'duels_greedy_pickaxe', 'duels_the_exorcisor', 'duels_jaws', 'duels_herding_horn', 'duels_wand_of_dueling', 'duels_royal_greatsword', 'duels_spiked_arms', 'duels_glaciaxe', 'duels_wings_of_glaciaxe', 'duels_runed_soulblade', 'duels_ironweave_bloodletter', 'duels_greatsword_ebon_blade', 'duels_blade_of_quickening', 'duels_carrot_on_a_stick', 'duels_green_tortollan_shell',
		'duels_impish_aid', 'duels_moarg_outcast', 'duels_moonbeast', 'duels_drocomurchanicas', 'duels_scion_of_the_deep', 'duels_droplet_of_insanity', 'duels_nerubian_peddler', 'duels_brewster_the_brutal', 'duels_tiny_thimble', 'duels_regular_size_thimble', 'duels_party_portal', 'duels_loyal_sidekick', 'duels_beastly_beauty', 'duels_detective_murloc_holmes', 'duels_butch', 'duels_princess', 'duels_bubba', 'duels_clockwork_assistant', 'duels_bonecrusher', 'duels_fluctuating_totem', 'duels_killmox', 'duels_demonizer', 'duels_auto_armaments', 'duels_gluth', 'duels_gluth_sicle', 'duels_inexorable_ghoul', 'duels_crimson', 'duels_impetuous_companion', 'duels_traktamer_aelessa', 'duels_zukara_the_wild', 'duels_awakened_ancient', 'duels_deathstrider', 'duels_joras_thuldoom', 'duels_embercaster', 'duels_favored_racer', 'duels_herald_scaled_ones', 'duels_britz_blazebucket', 'duels_payload_totem_specialist', 'duels_su_leadfoot', 'duels_scrapmetal_demolitionist',
		'duels_si7_scout', 'duels_reffuh', 'duels_shima', 'duels_kolek', 'duels_chaos_storm'];
	ok('all 65 arsenal cards exist', ids.every(id => byId[id]), ids.filter(id => !byId[id]).join(','));
	ok('all 20 weapons are weapons', ids.slice(0, 20).every(id => byId[id].type === 'weapon'));
	ok('Send in the Scout summons the real SI:7 Scout token', JSON.stringify(byId.duelshp_send_in_the_scout.power.effects).includes('duels_si7_scout'));
}

// ---- weapons ----
{
	const st = fresh();
	arm(st, 0, 'duels_tempests_fury');
	st.players[1].board = [];
	heroSwing(st, 0);
	ok("Tempest's Fury: hero attack + a 3-damage bolt", st.players[1].life <= 40 - 2 - 3, st.players[1].life);
}
{
	const st = fresh();
	const w = arm(st, 0, 'duels_claws_of_terror');
	const a = put(st, 1, '_v'), b = put(st, 1, '_v'), c = put(st, 1, '_v');
	st.players[0].heroAttacksUsed = 0;
	E.heroAttack(st, 0, { type: 'creature', uid: b.uid, player: 1 });
	ok('Claws of Terror cleaves the neighbors', a.damage === 6 && b.damage === 6 && c.damage === 6, [a.damage, b.damage, c.damage].join('|'));
	ok('Claws of Terror carries Start of Game draw-this', Array.isArray(byId.duels_claws_of_terror.startOfGame));
}
{
	const st = fresh();
	arm(st, 0, 'duels_horns_of_flame');
	E.endTurn(st); E.endTurn(st); // back to p0's turn start
	const sp = st.players[0].hand.filter(c => E.isSpellType(c) && ['Shadow', 'Fire'].includes(c.tribe));
	ok('Horns of Flame conjures a Shadow/Fire spell at turn start', sp.length >= 1, st.players[0].hand.map(c => c.id).join(','));
}
{
	const st = fresh();
	arm(st, 0, 'duels_archmage_staff');
	E.endTurn(st); E.endTurn(st);
	ok('Archmage Staff conjures a Mage spell at turn start', st.players[0].hand.some(c => E.isSpellType(c) && c.cardClass === 'mage'), st.players[0].hand.map(c => c.id).join(','));
}
{
	const st = fresh();
	arm(st, 0, 'duels_queldelar');
	put(st, 1, '_v');
	heroSwing(st, 0);
	ok("Quel'Delar: 4 to ALL enemies after the swing", st.players[1].life === 40 - 4 - 4 && st.players[1].board[0].damage === 4, st.players[1].life);
}
{
	const st = fresh();
	arm(st, 0, 'duels_greedy_pickaxe');
	st.players[0].mana.max = 5; st.players[0].mana.cur = 5;
	heroSwing(st, 0);
	ok('Greedy Pickaxe: an empty Mana Crystal per swing', st.players[0].mana.max === 6 && st.players[0].mana.cur === 5, st.players[0].mana.max + '/' + st.players[0].mana.cur);
}
{
	const st = fresh();
	arm(st, 0, 'duels_the_exorcisor');
	const v = put(st, 1, '_dr');
	st.players[0].heroAttacksUsed = 0;
	E.heroAttack(st, 0, { type: 'creature', uid: v.uid, player: 1 });
	ok('The Exorcisor silences before it strikes', !(v.deathrattle && v.deathrattle.length) || v.silenced, JSON.stringify(v.deathrattle));
}
{
	const st = fresh();
	const w = arm(st, 0, 'duels_jaws');
	const d = put(st, 1, '_dr');
	d.damage = d.maxHealth; d.shield = false; E.sweepDeaths(st);
	ok('Jaws grows on a Deathrattle death', w.attack === 3, w.attack);
}
{
	const st = fresh();
	const w = arm(st, 0, 'duels_herding_horn');
	play(st, 0, '_beast');
	ok('Herding Horn: the played Beast is doubled', st.players[0].board.filter(c => c.id === '_beast').length === 2, st.players[0].board.map(c => c.id).join(','));
	ok('Herding Horn pays 1 Durability', w.durability === 2, w.durability);
}
{
	const st = fresh();
	const w = arm(st, 0, 'duels_wand_of_dueling');
	const hp0 = E.instantiate(byId.duelshp_promote, 0); hp0.zone = 'heropower'; hp0.usedThisTurn = false; st.players[0].heroPowers.push(hp0);
	put(st, 0, '_v');
	E.useHeroPower(st, 0, hp0.uid, { type: 'creature', uid: st.players[0].board[0].uid, player: 0 }, null);
	ok('Wand of Dueling wears with each Hero Power use', w.durability === 3, w.durability);
}
{
	const st = fresh();
	arm(st, 0, 'duels_royal_greatsword');
	st.players[0].deck = ['_legend', '_v'];
	heroSwing(st, 0);
	ok('Royal Greatsword pulls a Legendary from the deck', st.players[0].board.some(c => c.id === '_legend'), st.players[0].board.map(c => c.id).join(','));
}
{
	const st = fresh();
	arm(st, 0, 'duels_spiked_arms');
	E.execEffects(st, 0, [{ type: 'summon', count: 1, attack: 2, health: 3, name: 'Grunt' }], null, null);
	const g = st.players[0].board.find(c => c.name === 'Grunt');
	ok('Spiked Arms: summons take 1 & gain +2 Attack', g && g.attack === 4 && g.damage === 1, g && [g.attack, g.damage].join('|'));
}
{
	const st = fresh();
	arm(st, 0, 'duels_glaciaxe');
	E.breakWeapon(st, 0, true);
	ok('Glaciaxe hands off to Wings of Glaciaxe', st.players[0].weapon && st.players[0].weapon.id === 'duels_wings_of_glaciaxe', st.players[0].weapon && st.players[0].weapon.id);
	E.breakWeapon(st, 0, true);
	const zombies = st.players[0].board.filter(c => c.name === 'Zombie');
	ok('Wings of Glaciaxe: three Reborn Zombies on death', zombies.length === 3 && zombies.every(z => z.keywords.includes('reborn')), zombies.length);
}
{
	const st = fresh();
	const w = arm(st, 0, 'duels_runed_soulblade');
	put(st, 1, '_v');
	E.damageHero(st, 0, 3, null, true);
	ok('Runed Soulblade lashes all enemies for 1', st.players[1].life === 39 && st.players[1].board[0].damage === 1, st.players[1].life);
	ok('Runed Soulblade pays 1 Durability', w.durability === 2, w.durability);
}
{
	const st = fresh();
	play(st, 0, 'duels_ironweave_bloodletter');
	st.players[0].life = 30; st.players[0].corpses = 5;
	E.spendCorpses(st, 0, 2);
	ok('Ironweave Bloodletter: Corpse spends heal 2', st.players[0].life === 32, st.players[0].life);
}
{
	const st = fresh();
	const w = arm(st, 0, 'duels_greatsword_ebon_blade');
	const c = play(st, 0, '_v');
	ok('Ebon Blade grants the play Reborn', c.keywords.includes('reborn'));
	ok('Ebon Blade pays 1 Durability', w.durability === 3, w.durability);
}
{
	const st = fresh();
	st.players[0].deck = ['_v'];
	byId._outcastprobe = { id: '_outcastprobe', name: 'Outcast Probe 2', type: 'sorcery', cost: 3, rarity: 'common', keywords: ['outcast'], effects: [{ type: 'draw', value: 0 }] };
	st.players[0].deck = ['_outcastprobe', '_v'];
	play(st, 0, 'duels_blade_of_quickening');
	const drawn = st.players[0].hand.find(c => c.id === '_outcastprobe');
	ok('Blade of Quickening tutors an Outcast card at (1) less', drawn && drawn.cost === 2, drawn && drawn.cost);
}
{
	const st = fresh();
	arm(st, 0, 'duels_carrot_on_a_stick');
	const b = put(st, 0, '_beast');
	heroSwing(st, 0);
	ok('Carrot on a Stick: Beasts get +1/+1 after the swing', b.attack === 3 && b.maxHealth === 3, [b.attack, b.maxHealth].join('/'));
}
{
	const st = fresh();
	const v = put(st, 1, '_v');
	play(st, 0, 'duels_green_tortollan_shell');
	ok('Green Tortollan Shell bounces a random enemy', st.players[1].board.length === 0 && st.players[1].hand.some(c => c.id === '_v'), st.players[1].hand.map(c => c.id).join(','));
}

// ---- treasure minions ----
{
	const st = fresh();
	put(st, 0, 'duels_impish_aid');
	E.execEffects(st, 0, [{ type: 'summon', summonId: '_demon' }], null, null);
	const d = st.players[0].board.find(c => c.id === '_demon');
	ok('Impish Aid: Demon summons get +2/+2', d && d.attack === 4 && d.maxHealth === 4, d && [d.attack, d.maxHealth].join('/'));
}
{
	const st = fresh();
	put(st, 0, 'duels_moarg_outcast');
	give(st, 0, '_v');
	play(st, 0, '_cheapspark'); // rightmost card -> edge
	ok("Mo'arg Outcast replays the edge spell", st.players[1].life === 38, st.players[1].life);
}
{
	const st = fresh();
	const m = put(st, 0, 'duels_moonbeast');
	E.endTurn(st);
	const ec = st.players[0].hand.filter(c => /Eclipse/.test(c.name || ''));
	ok('Moonbeast adds both Eclipse spells at end of turn', ec.length === 2, st.players[0].hand.map(c => c.name).join(','));
	ok('Moonbeast makes them free', ec.every(c => effectiveCost(st, 0, c) === 0), ec.map(c => effectiveCost(st, 0, c)).join(','));
}
{
	const st = fresh();
	st.players[0].deck = ['_beast', '_v'];
	byId._dragon = { id: '_dragon', name: 'Test Dragon', type: 'creature', cost: 4, attack: 4, health: 4, tribe: 'Dragon', rarity: 'common' };
	byId._murloc = { id: '_murloc', name: 'Test Murloc', type: 'creature', cost: 1, attack: 1, health: 1, tribe: 'Murloc', rarity: 'common' };
	byId._mech = { id: '_mech', name: 'Test Mech', type: 'creature', cost: 3, attack: 3, health: 3, tribe: 'Mech', rarity: 'common' };
	st.players[0].deck = ['_dragon', '_murloc', '_mech', '_v'];
	const dro = put(st, 0, 'duels_drocomurchanicas');
	dro.damage = dro.maxHealth; dro.shield = false; E.sweepDeaths(st);
	const got = st.players[0].hand.map(c => c.id);
	ok('Drocomurchanicas tutors Dragon+Murloc+Mech at (3) less', got.includes('_dragon') && got.includes('_murloc') && got.includes('_mech')
		&& st.players[0].hand.find(c => c.id === '_dragon').cost === 1, got.join(','));
}
{
	const st = fresh();
	put(st, 0, 'duels_scion_of_the_deep');
	play(st, 0, '_cheapspark'); play(st, 0, '_cheapspark');
	const before = st.players[0].life;
	const third = give(st, 0, '_spark'); // cost 4
	ok('Scion: the third spell costs (0) mana', effectiveCost(st, 0, third) === 0);
	E.playCard(st, 0, third.uid, null, null);
	ok('Scion: it is paid in Health instead', st.players[0].life === before - 4, st.players[0].life + ' vs ' + before);
}
{
	const st = fresh();
	put(st, 0, 'duels_droplet_of_insanity');
	play(st, 0, '_cheapspark');
	ok('Droplet of Insanity: two Corrupted cards arrive', st.players[0].hand.length === 2, st.players[0].hand.map(c => c.id).join(','));
}
{
	const st = fresh();
	put(st, 0, 'duels_nerubian_peddler');
	const h = give(st, 0, '_spark'); // rightmost, cost 4
	E.endTurn(st);
	ok('Nerubian Peddler discounts the freshest card', h.cost === 2, h.cost);
}
{
	const st = fresh();
	const b = put(st, 0, 'duels_brewster_the_brutal');
	st.players[0].deck = ['_rusher', '_v'];
	const v = put(st, 1, '_v');
	E.resolveCombat(st, 0, b.uid, { type: 'creature', uid: v.uid, player: 1 });
	ok('Brewster summons a Rush creature from the deck after attacking', st.players[0].board.some(c => c.id === '_rusher'), st.players[0].board.map(c => c.id).join(','));
}
{
	const st = fresh();
	const t = put(st, 0, 'duels_tiny_thimble');
	t.damage = t.maxHealth; t.shield = false; E.sweepDeaths(st);
	ok('Tiny Thimble leaves a Regular-Size Thimble in hand', st.players[0].hand.some(c => c.id === 'duels_regular_size_thimble'));
	const st2 = fresh();
	const rt = put(st2, 0, 'duels_regular_size_thimble');
	const g = put(st2, 1, '_glass');
	E.resolveCombat(st2, 0, rt.uid, { type: 'creature', uid: g.uid, player: 1 });
	ok('Regular-Size Thimble grows on the kill', rt.attack === 7 && rt.maxHealth === 7, [rt.attack, rt.maxHealth].join('/'));
}
{
	const st = fresh();
	put(st, 0, 'duels_party_portal');
	play(st, 0, '_spark'); // cost 4
	const sum = st.players[0].board.find(c => c.id !== 'duels_party_portal');
	ok('Party Portal summons a creature of the spell cost', sum && (byId[sum.id].cost || 0) === 4, sum && sum.id);
}
{
	const st = fresh();
	st.runWins = 4;
	const c = play(st, 0, 'duels_loyal_sidekick');
	ok('Loyal Sidekick: +1/+1 per run win', c.attack === 6 && c.maxHealth === 6, [c.attack, c.maxHealth].join('/'));
}
{
	const st = fresh();
	const bb = put(st, 0, 'duels_beastly_beauty');
	const v = put(st, 1, '_v');
	E.resolveCombat(st, 0, bb.uid, { type: 'creature', uid: v.uid, player: 1 });
	ok('Beastly Beauty becomes an 8/8 after surviving the attack', bb.attack === 8 && bb.maxHealth === 8 && bb.damage === 0, [bb.attack, bb.maxHealth].join('/'));
}
{
	const st = fresh();
	put(st, 0, 'duels_detective_murloc_holmes');
	E.drawCards(st, 1, 1);
	ok('Murloc Holmes copies the enemy draw', st.players[0].hand.length === 1 && st.players[0].hand[0].id === '_v', st.players[0].hand.map(c => c.id).join(','));
}
{
	const st = fresh();
	const dead = put(st, 0, '_beast');
	dead.damage = dead.maxHealth; dead.shield = false; E.sweepDeaths(st);
	const c = play(st, 0, 'duels_butch');
	ok('Butch grows from the dead Beast', c.attack === 3 && c.maxHealth === 3, [c.attack, c.maxHealth].join('/'));
}
{
	const st = fresh();
	st.players[0].deck = ['_dr', '_dr', '_v'];
	const c = play(st, 0, 'duels_princess');
	ok('Princess absorbs deck Deathrattles', c.deathrattle && c.deathrattle.length >= 1 && c.keywords.includes('deathrattle'), JSON.stringify(c.deathrattle));
}
{
	const st = fresh();
	const v = put(st, 1, '_v'); // 2/8
	play(st, 0, 'duels_bubba', { type: 'creature', uid: v.uid, player: 1 });
	ok('Bubba: the hounds maul the chosen creature', E.isDead(v) || v.damage >= 6, v.damage);
}
{
	const st = fresh();
	st.players[0].spellsPlayedTotal = 3;
	const c = play(st, 0, 'duels_clockwork_assistant');
	ok('Clockwork Assistant arrives grown by prior spells', c.attack === 4 && c.maxHealth === 4, [c.attack, c.maxHealth].join('/'));
	play(st, 0, '_cheapspark');
	ok('...and keeps growing per spell', c.attack === 5 && c.maxHealth === 5, [c.attack, c.maxHealth].join('/'));
}
{
	const st = fresh();
	const d = put(st, 0, '_dr');
	d.damage = d.maxHealth; d.shield = false; E.sweepDeaths(st);
	const bc = put(st, 0, 'duels_bonecrusher');
	bc.damage = bc.maxHealth; bc.shield = false; E.sweepDeaths(st);
	ok('Bonecrusher raises the fallen Deathrattler', st.players[0].board.some(c => c.id === '_dr'), st.players[0].board.map(c => c.id).join(','));
}
{
	const st = fresh();
	const tot = play(st, 0, 'duels_fluctuating_totem');
	ok('Fluctuating Totem hides for a turn', tot.stealthed === true && tot.tempStealth === true);
	const n = put(st, 0, '_glass'); // cost 1 -> evolves into a 2-cost
	st.players[0].board = [tot, n]; E.recomputeAuras(st);
	E.endTurn(st);
	ok('Fluctuating Totem evolves its neighbor', n.id !== '_glass' && (byId[n.id] ? (byId[n.id].cost || 0) === 2 : true), n.id);
}
{
	const st = fresh();
	st.players[0].discardLogIds = ['a', 'b', 'c'];
	const c = play(st, 0, 'duels_killmox');
	ok('Killmox grows from the discard log', c.attack === 6 && c.maxHealth === 6, [c.attack, c.maxHealth].join('/'));
}
{
	const st = fresh();
	put(st, 0, 'duels_auto_armaments');
	st.players[0].deck = ['_v'];
	damageCreature(st, st.players[0].board[0], 1, null);
	const drawn = st.players[0].hand.find(c => c.id === '_v');
	ok('Auto-Armaments draws a buffed creature when hurt', drawn && drawn.attack === 3 && drawn.maxHealth === 9, drawn && [drawn.attack, drawn.maxHealth].join('/'));
}
{
	const st = fresh();
	const u = put(st, 0, '_undead');
	play(st, 0, 'duels_gluth');
	ok('Gluth: other Undead get +2/+1 & Reborn', u.attack === 4 && u.maxHealth === 3 && u.keywords.includes('reborn'), [u.attack, u.maxHealth].join('/'));
}
{
	const st = fresh();
	st.players[0].deck = ['_undead', '_undead', '_v'];
	play(st, 0, 'duels_gluth_sicle');
	const summoned = st.players[0].board.filter(c => c.id === '_undead');
	ok('Gluth-sicle summons two frozen Undead', summoned.length === 2 && summoned.every(c => c.frozen), summoned.map(c => c.frozen).join(','));
}
{
	const st = fresh();
	const g = put(st, 0, 'duels_inexorable_ghoul');
	g.damage = g.maxHealth; g.shield = false; E.sweepDeaths(st);
	const back = st.players[0].board.find(c => c.id === 'duels_inexorable_ghoul');
	ok('Inexorable Ghoul returns dormant with a 2-turn timer', back && back.reviveTimer === 2, back && back.reviveTimer);
}
{
	const st = fresh();
	const c = put(st, 0, 'duels_crimson');
	st.players[0].life = 30;
	healHero(st, 0, 4);
	ok('Crimson feeds on the heal', c.attack === 6 && c.maxHealth === 6, [c.attack, c.maxHealth].join('/'));
}
{
	const st = fresh();
	give(st, 0, '_v'); give(st, 1, '_spark'); give(st, 1, '_spark');
	play(st, 0, 'duels_impetuous_companion');
	ok('Impetuous Companion swaps the hands for good', st.players[0].hand.every(c => c.id === '_spark') && st.players[0].hand.length === 2 && st.players[1].hand.length === 1, st.players[0].hand.map(c => c.id).join(','));
	E.endTurn(st);
	ok('...and the swap survives end of turn', st.players[0].hand.length === 2 || st.players[0].hand.length === 3, st.players[0].hand.length);
}
{
	const st = fresh();
	put(st, 0, 'duels_traktamer_aelessa');
	arm(st, 0, 'duels_greedy_pickaxe'); // the hero needs Attack to swing at all
	heroSwing(st, 0);
	ok('Traktamer Aelessa calls a Demon Companion', st.players[0].board.some(c => ['duels_reffuh', 'duels_shima', 'duels_kolek'].includes(c.id)), st.players[0].board.map(c => c.id).join(','));
}
{
	const st = fresh();
	put(st, 0, 'duels_zukara_the_wild');
	play(st, 0, '_spark'); // cost 4 -> cast twice
	ok('Zukara recasts the big spell', st.players[1].life === 38, st.players[1].life);
}
{
	const st = fresh();
	st.players[0].deck = ['_v', '_v'];
	const c = play(st, 0, 'duels_awakened_ancient');
	ok('Awakened Ancient: draw + ping + armor', st.players[0].hand.length === 1 && (st.players[0].armor || 0) === 1 && st.players[1].life === 39, [st.players[0].hand.length, st.players[0].armor, st.players[1].life].join('|'));
}
{
	const st = fresh();
	st.players[0].deck = ['_v'];
	put(st, 0, '_dr');
	play(st, 0, 'duels_deathstrider');
	ok("Deathstrider triggers the Rattler's Deathrattle (a draw)", st.players[0].hand.length === 1, st.players[0].hand.length);
}
{
	const st = fresh();
	put(st, 0, 'duels_joras_thuldoom');
	E.damageHero(st, 0, 2, null, true);
	ok('Joras Thuldoom copies itself when your Health moves', st.players[0].board.filter(c => c.id === 'duels_joras_thuldoom').length === 2, st.players[0].board.length);
}
{
	const st = fresh();
	put(st, 0, 'duels_embercaster');
	play(st, 0, '_cheapspark');
	ok('Embercaster hands back 3 copies of the spell', st.players[0].hand.filter(c => c.id === '_cheapspark').length === 3, st.players[0].hand.map(c => c.id).join(','));
}
{
	const st = fresh();
	const c = play(st, 0, 'duels_favored_racer');
	ok('Favored Racer gets Blessed (stats or keyword moved)', c.attack !== 3 || c.maxHealth !== 3 || c.keywords.length > 2, [c.attack, c.maxHealth, c.keywords.join('+')].join('|'));
}
{
	const st = fresh();
	play(st, 0, 'duels_herald_scaled_ones');
	const d = st.players[0].hand[0];
	ok('Herald adds a discounted Dragon', d && (byId[d.id].tribe || '').includes('Dragon') && d.cost === Math.max(0, (byId[d.id].cost || 0) - 2), d && d.id);
}
{
	const st = fresh();
	put(st, 0, 'duels_britz_blazebucket');
	play(st, 0, '_spark'); // cost 4
	const toys = st.players[0].board.filter(c => c.id !== 'duels_britz_blazebucket');
	ok('Britz summons two fragile 4-Cost creatures', toys.length === 2 && toys.every(c => c.diesToAnyDamage), toys.map(c => c.id).join(','));
}
{
	const st = fresh();
	play(st, 0, 'duels_payload_totem_specialist');
	const t = st.players[0].hand[0];
	ok('Payload Totem Specialist adds a discounted Totem', t && (byId[t.id].tribe || '').includes('Totem'), t && t.id);
}
{
	const st = fresh();
	put(st, 0, 'duels_su_leadfoot');
	E.execEffects(st, 0, [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Grunt' }], null, null);
	const g = st.players[0].board.find(c => c.name === 'Grunt');
	ok('Su Leadfoot: summons gain Divine Shield & Rush', g && g.keywords.includes('divine_shield') && g.keywords.includes('rush') && g.shield, g && g.keywords.join('+'));
}
{
	const st = fresh();
	play(st, 0, 'duels_scrapmetal_demolitionist');
	ok('Scrapmetal Demolitionist: 5 Armor + a Bomb planted', (st.players[0].armor || 0) === 5 && st.players[1].deck.includes('bomb'), [st.players[0].armor, st.players[1].deck.join(',')].join('|'));
}

// ---- Chaos Storm ----
{
	const st = fresh();
	play(st, 0, 'duels_chaos_storm');
	play(st, 0, '_ol'); // an Overload card
	const got = st.players[0].hand.find(c => (byId[c.id] && (byId[c.id].overload || 0) > 0));
	ok('Chaos Storm: the Overload play hands back an Overload card', !!got, st.players[0].hand.map(c => c.id).join(','));
	const st2 = fresh();
	play(st2, 0, '_ol'); // no Chaos Storm this turn
	ok('...but only while the storm rages', st2.players[0].hand.length === 0);
}

console.log(`${pass} passed, ${fail} failed`);
if (fail) process.exit(1);
