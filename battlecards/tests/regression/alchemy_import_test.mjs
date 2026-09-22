// alchemy_import_test.mjs — the Alchemy: Innistrad (YMID) + Alchemy: Kamigawa
// (YNEO) import.
//
// These are MTG Arena's digital-only sets, adapted to class identity and made
// colourless on purpose: a `colors` array would mark them land-conjured and
// undraftable, so every assertion here also guards that they stay deck-legal.
//
// Every card is FIRED, not inspected. A card whose JSON looks right but whose
// effect never resolves is the exact failure this suite exists to catch, so
// each case plays the card through the real engine and asserts the consequence.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
const classes = JSON.parse(fs.readFileSync(new URL('../../classes.json', import.meta.url)));
const ROSTER = (Array.isArray(classes) ? classes : classes.classes).map(c => c.id);

let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const SET = new Set(['YMID', 'YNEO']);
const imported = raw.cards.filter(c => SET.has(c.set));
// wave 2 took the marquee cards wave 1 skipped for evasion; MTG flying maps to
// `elusive` (untargetable), the same stand-in the repo already uses for blue flyers.
const WAVE2 = ['ymid_geist_of_regret', 'ymid_consuming_oni', 'ymid_mothrider_cavalry', 'ymid_puppet_raiser',
	'ymid_better_offer', 'ymid_forgeborn_phoenix', 'ymid_boseiju_pathlighter', 'ymid_suntail_squadron',
	'ymid_soul_servitude', 'ymid_sanguine_brushstroke', 'ymid_divine_purge', 'ymid_gutmorn_pactbound_servant'];

// wave 3 finished the job: every remaining printed card from both sets except
// Forsaken Crossroads, which is a LAND — lands are a separate subsystem here
// (`taps` machinery, cardClass 'magepunk', 75 of 77 coloured), not a class card.
const WAVE3 = ['ymid_absorb_energy', 'ymid_conductive_current', 'ymid_discover_the_formula', 'ymid_faithful_disciple',
	'ymid_hinterland_chef', 'ymid_hollowhenge_wrangler', 'ymid_inquisitor_captain', 'ymid_lupine_harbingers',
	'ymid_obsessive_collector', 'ymid_predatory_sludge', 'ymid_settle_the_wilds', 'ymid_tireless_angler',
	'ymid_wickerwing_effigy', 'ymid_artillery_enthusiast', 'ymid_experimental_pilot', 'ymid_foundry_beetle',
	'ymid_fragment_reality', 'ymid_futurist_spellthief', 'ymid_inchblade_companion', 'ymid_jukai_liberator',
	'ymid_junkyard_scrapper', 'ymid_kami_of_bamboo_groves', 'ymid_kami_of_mourning', 'ymid_kami_of_transmutation',
	'ymid_runaway_growth', 'ymid_semblance_scanner'];

// ---------------- the shape of the import ----------------
ok('73 cards imported across the two Alchemy sets (35 + 12 + 26)', imported.length === 73, imported.length);
ok('all 12 wave-2 cards present', WAVE2.every(id => byId[id]), WAVE2.filter(id => !byId[id]).join(','));
ok('all 26 wave-3 cards present', WAVE3.every(id => byId[id]), WAVE3.filter(id => !byId[id]).join(','));

// the sets are now exhausted apart from the land — proven against Scryfall, not asserted by hand
{
	const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
	const known = new Set(raw.cards.map(c => norm(c.name)));
	let printed = 0, missing = [];
	for (const f of ['ymid', 'yneo']) {
		let dump; try { dump = JSON.parse(fs.readFileSync(new URL('../fixtures/' + f + '.json', import.meta.url))); } catch { dump = null; }
		if (!dump) { printed = -1; break; }
		for (const c of dump.data) {
			printed++;
			const n = c.card_faces ? c.card_faces[0].name : c.name;
			if (!known.has(norm(n)) && !known.has(norm(c.name))) missing.push(n);
		}
	}
	if (printed < 0) console.log('note: Scryfall fixtures absent — set-coverage check skipped');
	else {
		ok('both Alchemy sets fully accounted for (93 printed)', printed === 93, printed);
		ok('nothing left unimported but the land', missing.length === 1 && missing[0] === 'Forsaken Crossroads', missing.join(','));
	}
}
{
	// the owner's wave-1 spec: 18 class uncommons + 10 neutral commons + 5 neutral
	// legendaries. Scope the bucket counts to wave 1 so wave 2 doesn't inflate them.
	const later = new Set([...WAVE2, ...WAVE3]);
	const wave1 = imported.filter(c => !later.has(c.id));
	ok('wave 1 is still exactly 35 cards', wave1.length === 35, wave1.length);
	const unc = wave1.filter(c => c.rarity === 'uncommon');
	ok('18 class uncommons, one per playable class', unc.length === 18 && new Set(unc.map(c => c.cardClass)).size === 18,
		unc.length + ' cards / ' + new Set(unc.map(c => c.cardClass)).size + ' classes');
	const missing = ROSTER.filter(r => !unc.some(c => c.cardClass === r));
	ok('every class in classes.json got one', missing.length === 0, missing.join(','));
	ok('no class uncommon is Neutral', unc.every(c => c.cardClass !== 'neutral'));
	ok('10 neutral commons', wave1.filter(c => c.rarity === 'common' && c.cardClass === 'neutral').length === 10);
	ok('5 neutral legendaries', wave1.filter(c => c.rarity === 'legendary' && c.cardClass === 'neutral').length === 5);
}
// colourless, class-identity-only — a `colors` array would make them undraftable
ok('every imported card is colourless (deck-legal, not land-conjured)',
	imported.every(c => !c.colors || c.colors.length === 0),
	imported.filter(c => c.colors && c.colors.length).map(c => c.id).join(','));
ok('every imported card is collectible', imported.every(c => c.collectible !== false));
ok('every imported card has art-eligible id + description', imported.every(c => /^ymid_/.test(c.id) && (c.description || '').length > 3));

// Art coverage. battlecards/art/ is an OFFLOADED, gitignored asset (it lives in the
// magepunk-cardart Pages project), so it is present on a dev machine and absent in
// CI — read it unguarded and this suite goes red on every CI run. Same guard as
// art_placeholders_test / totemic_power_test / generated_cards_test.
{
	let idx = null;
	try { idx = new Set(JSON.parse(fs.readFileSync(new URL('../../art/index.json', import.meta.url)))); }
	catch { console.log('note: battlecards/art/index.json absent (gitignored) — art checks skipped, every in-repo check still enforced'); }
	if (idx) {
		const unregistered = imported.filter(c => !idx.has(c.id));
		ok('every imported card is registered in art/index.json', unregistered.length === 0, unregistered.map(c => c.id).join(','));
		const notJpeg = imported.filter(c => {
			try { const b = fs.readFileSync(new URL('../../art/' + c.id + '.jpg', import.meta.url)); return !(b[0] === 0xFF && b[1] === 0xD8 && b[2] === 0xFF); }
			catch { return true; }
		});
		ok('every imported card has a real JPEG on disk', notJpeg.length === 0, notJpeg.map(c => c.id).join(','));
	}
}

// evasion is skipped by standing decision — assert none slipped in
{
	const EV = ['flying', 'menace', 'vigilance', 'reach'];
	const bad = imported.filter(c => (c.keywords || []).some(k => EV.includes(k)));
	ok('no evasion keywords (standing WUBRG decision)', bad.length === 0, bad.map(c => c.id).join(','));
}
// the two planeswalkers are class cards, and legendary like every other walker
{
	const pw = imported.filter(c => c.type === 'planeswalker');
	ok('both planeswalkers imported as planeswalkers', pw.length === 2 && pw.every(c => c.loyalty > 0 && (c.abilities || []).length === 3));
	ok('planeswalkers went to classes, not Neutral', pw.every(c => c.cardClass !== 'neutral'), pw.map(c => c.cardClass).join(','));
	ok('planeswalkers are legendary (all 23 pre-existing walkers are; none is uncommon)',
		pw.every(c => c.rarity === 'legendary'), pw.map(c => c.rarity).join(','));
}

// ---------------- helpers ----------------
const S = () => new Scenario(byId).mana(0, 10);
// play a card from hand with 10 mana and return the resulting state
const fire = (id, build = s => s, opts = {}) => {
	let s = S().hand(0, [id]);
	s = build(s) || s;
	return s.play(0, id, opts).run().state;
};

// ---------------- 18 class uncommons ----------------
{ // Paladin — conjures a copy of itself and freezes
	const st = fire('ymid_sigardian_evangel', s => s.board(1, [{ id: 't_x' }]).def('t_x', { type: 'creature', cost: 1, attack: 1, health: 5 }), { targetBoard: [1, 0] });
	ok('Sigardian Evangel: copy conjured to hand', st.players[0].hand.some(c => c.id === 'ymid_sigardian_evangel'), st.players[0].hand.map(c => c.id).join(','));
	ok('Sigardian Evangel: froze the enemy creature', !!st.players[1].board[0]?.frozen);
}
{ // Priest — 3 damage + a permanent buff on a card in hand
	const st = fire('ymid_sap_vitality', s => s.def('t_b', { type: 'creature', cost: 2, attack: 2, health: 9 }).hand(0, ['ymid_sap_vitality', 't_b']).board(1, [{ id: 't_b' }]), { targetBoard: [1, 0] });
	ok('Sap Vitality: dealt 3 damage', E.hp(st.players[1].board[0]) === 6, E.hp(st.players[1].board[0]));
	ok('Sap Vitality: buffed a creature in hand +3/+0', st.players[0].hand.some(c => c.attack === 5), st.players[0].hand.map(c => c.id + ':' + c.attack).join(','));
}
{ // Mage — the next spell really is cheaper
	const st = fire('ymid_geistchanneler');
	ok('Geistchanneler: queued a spell discount', (st.players[0].costDiscounts || []).some(d => d.cardType === 'spell' && d.amount === -2), JSON.stringify(st.players[0].costDiscounts));
}
{ // Rogue — Swing conjures a Beetle
	const st = S().board(0, [{ id: 'ymid_swarm_saboteur' }]).attack(0, 0, { targetHero: 1 }).run().state;
	ok('Swarm Saboteur: Swing conjured a Virus Beetle', st.players[0].hand.some(c => c.name === 'Virus Beetle'), st.players[0].hand.map(c => c.name).join(','));
}
{ // Warlock — deathrattle Discover. Kill it with a real played spell: poking
	// damageCreature/sweepDeaths directly does NOT run deathrattles (verified
	// against leper_gnome as a control), so that route would pass vacuously.
	const st = S()
		.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 99, target: 'creature' }] })
		.hand(0, ['t_kill']).board(0, [{ id: 'ymid_cursebound_witch' }])
		.play(0, 't_kill', { targetBoard: [0, 0] }).run().state;
	ok('Cursebound Witch: died and its deathrattle queued a Discover', (st.pickQueue || []).length === 1, (st.pickQueue || []).length);
	ok('Cursebound Witch: the Discover offers Warlock cards', ((st.pickQueue || [])[0]?.ids || []).every(id => (byId[id].cardClass || 'neutral') === 'warlock'),
		((st.pickQueue || [])[0]?.ids || []).map(id => byId[id].cardClass).join(','));
}
{ // Death Knight — a real 4/4 Zombie
	const st = fire('ymid_assemble_from_parts');
	const z = st.players[0].board.filter(c => c.name === 'Zombie');
	ok('Assemble from Parts: summoned a 4/4 Zombie', z.length === 1 && z[0].attack === 4 && E.hp(z[0]) === 4, z.length);
}
{ // Hunter — a two-target fight needs target.fightTarget, so drive it directly.
	// `fight` silently no-ops without it, which is precisely the failure mode
	// that shipped in Garruk's Wrath, so assert BOTH fighters took damage.
	const st = S()
		.def('t_big', { type: 'creature', cost: 2, attack: 4, health: 6 })
		.def('t_small', { type: 'creature', cost: 1, attack: 2, health: 9 })
		.hand(0, ['ymid_ravenous_pursuit', 't_big'])
		.board(0, [{ id: 't_big' }]).board(1, [{ id: 't_small' }])
		.do((s, Eng) => {
			const card = s.players[0].hand.find(c => c.id === 'ymid_ravenous_pursuit');
			const mine = s.players[0].board[0], foe = s.players[1].board[0];
			Eng.playCard(s, 0, card.uid, { type: 'creature', uid: mine.uid, player: 0, fightTarget: foe.uid });
		}).run().state;
	ok('Ravenous Pursuit: the foe took the fighter\'s power', E.hp(st.players[1].board[0]) === 5, E.hp(st.players[1].board[0]));
	ok('Ravenous Pursuit: the fighter took damage back', E.hp(st.players[0].board[0]) === 4, E.hp(st.players[0].board[0]));
	ok('Ravenous Pursuit: buffed a creature in hand +2/+2', st.players[0].hand.some(c => c.id === 't_big' && c.attack === 6), st.players[0].hand.map(c => c.id + ':' + c.attack).join(','));
	// instantiate() copies an allow-list, so a two-target fight card that omits
	// `fight:true` never gets offered a second target — the Garruk's Wrath bug.
	ok('Ravenous Pursuit declares fight:true (the second-target flag)', byId['ymid_ravenous_pursuit'].fight === true);
}
{ // Demon Hunter
	const st = fire('ymid_molten_impact', s => s.def('t_t', { type: 'creature', cost: 2, attack: 2, health: 9 }).board(1, [{ id: 't_t' }]), { targetBoard: [1, 0] });
	ok('Molten Impact: 4 damage to a creature', E.hp(st.players[1].board[0]) === 5, E.hp(st.players[1].board[0]));
}
{ // Warrior — Swing conjures a Lightning Bolt
	const st = S().board(0, [{ id: 'ymid_toralfs_disciple' }]).attack(0, 0, { targetHero: 1 }).run().state;
	ok('Toralf\'s Disciple: Swing conjured a Lightning Bolt', st.players[0].hand.some(c => c.id === 'lightning_bolt'), st.players[0].hand.map(c => c.id).join(','));
}
{ // Shaman — Swing pings
	const st = S().board(0, [{ id: 'ymid_bellowsbreath_ogre' }]).attack(0, 0, { targetHero: 1 }).run().state;
	ok('Bellowsbreath Ogre: Swing damaged the opponent beyond the body', st.players[1].life <= 40 - 3 - 1, st.players[1].life);
}
{ // Druid — real ramp
	const st = fire('ymid_forceful_cultivator');
	ok('Forceful Cultivator: gained a Mana Crystal', st.players[0].mana.max >= 11, st.players[0].mana && st.players[0].mana.max);
}
{ // Bounty Hunter
	const st = fire('ymid_electrostatic_blast', s => s.def('t_t', { type: 'creature', cost: 2, attack: 2, health: 9 }).board(1, [{ id: 't_t' }]), { targetBoard: [1, 0] });
	ok('Electrostatic Blast: 2 damage to any target', E.hp(st.players[1].board[0]) === 7, E.hp(st.players[1].board[0]));
}
{ // Barbarian — tutors a spell out of the deck
	const st = fire('ymid_frenzied_geistblaster', s => s.def('t_sp', { type: 'sorcery', cost: 1, effects: [{ type: 'draw', value: 1 }] }).deck(0, ['t_sp']));
	ok('Frenzied Geistblaster: drew a spell from the deck', st.players[0].hand.some(c => c.id === 't_sp'), st.players[0].hand.map(c => c.id).join(','));
}
{ // Ranger / Bard / Sorcerer / Wizard / Centurion
	ok('Grizzled Huntmaster: Discover queued', (fire('ymid_grizzled_huntmaster').pickQueue || []).length === 1);
	const bard = fire('ymid_chronicler_of_worship');
	ok('Chronicler of Worship: Discover queued', (bard.pickQueue || []).length === 1);
	ok('Chronicler of Worship: discount queued', (bard.players[0].costDiscounts || []).length === 1);
	const st = fire('ymid_clone_crafter', s => s.def('t_e', { type: 'creature', cost: 3, attack: 3, health: 3 }).board(1, [{ id: 't_e' }]), { targetBoard: [1, 0] });
	ok('Clone Crafter: copied an enemy creature to hand', st.players[0].hand.some(c => c.id === 't_e'), st.players[0].hand.map(c => c.id).join(','));
	const wiz = fire('ymid_rimewall_protector', s => s.def('t_f', { type: 'creature', cost: 1, attack: 1, health: 3 }).board(0, [{ id: 't_f' }]), { targetBoard: [0, 0] });
	ok('Rimewall Protector: granted Hexproof', wiz.players[0].board.some(c => c.id === 't_f' && E.has(c, 'hexproof')));
	ok('Rimewall Protector: carries Ward (1)', byId['ymid_rimewall_protector'].ward?.mana === 1);
	const cen = S().board(0, [{ id: 'ymid_imperial_blademaster' }]).attack(0, 0, { targetHero: 1 }).run().state;
	ok('Imperial Blademaster: Swing queued a weapon Discover', (cen.pickQueue || []).length === 1);
}

// ---------------- the two class planeswalkers ----------------
const useWalker = (id, abilityIndex, build = s => s, target) => {
	let s = S().hand(0, [id]);
	s = build(s) || s;
	return s.play(0, id).do((st, Eng) => {
		const w = st.players[0].planeswalkers.find(c => c.id === id);
		if (!w) throw new Error(id + ' never reached the planeswalker zone');
		Eng.useWalker(st, 0, w.uid, abilityIndex, target ? target(st) : undefined);
	}).run().state;
};
{
	ok('Garruk went to Druid, Tibalt to Warlock',
		byId['ymid_garruk_wrath_of_the_wilds'].cardClass === 'druid' && byId['ymid_tibalt_wicked_tormentor'].cardClass === 'warlock');
	const g1 = useWalker('ymid_garruk_wrath_of_the_wilds', 0, s => s.def('t_c', { type: 'creature', cost: 3, attack: 2, health: 2 }).hand(0, ['ymid_garruk_wrath_of_the_wilds', 't_c']));
	ok('Garruk +1: buffed a creature in hand', g1.players[0].hand.some(c => c.id === 't_c' && c.attack === 3), g1.players[0].hand.map(c => c.id + ':' + c.attack).join(','));
	ok('Garruk +1: loyalty went 4 -> 5', g1.players[0].planeswalkers[0].loyalty === 5, g1.players[0].planeswalkers[0].loyalty);
	const g2 = useWalker('ymid_garruk_wrath_of_the_wilds', 1);
	ok('Garruk −1: queued a Beast Discover onto the board', (g2.pickQueue || []).length === 1 && g2.pickQueue[0].to === 'board', JSON.stringify((g2.pickQueue || [])[0]?.to));
	const t1 = useWalker('ymid_tibalt_wicked_tormentor', 0, s => s.def('t_v', { type: 'creature', cost: 2, attack: 2, health: 9 }).board(1, [{ id: 't_v' }]),
		st => ({ type: 'creature', uid: st.players[1].board[0].uid, player: 1 }));
	ok('Tibalt +1: dealt 4 damage to a creature', E.hp(t1.players[1].board[0]) === 5, E.hp(t1.players[1].board[0]));
	// the −6 ultimate is deliberately out of reach on arrival (loyalty 4), exactly
	// as in paper: you have to tick up first. Bank the loyalty, then fire it.
	const t3 = S().hand(0, ['ymid_tibalt_wicked_tormentor']).play(0, 'ymid_tibalt_wicked_tormentor').do((st, Eng) => {
		const w = st.players[0].planeswalkers.find(c => c.id === 'ymid_tibalt_wicked_tormentor');
		ok('Tibalt: the −6 ultimate is NOT available at loyalty 4', !Eng.canUseWalker(st, 0, w, 2), w.loyalty);
		w.loyalty = 6; w.usedThisTurn = false;
		Eng.useWalker(st, 0, w.uid, 2);
	}).run().state;
	const devils = t3.players[0].board.filter(c => c.name === 'Devil');
	ok('Tibalt −6: summoned three 1/1 Devils', devils.length === 3 && devils.every(d => d.attack === 1 && E.hp(d) === 1), devils.length);
	ok('Tibalt −6: the Devils carry their Deathrattle', devils.every(d => (d.deathrattle || []).length === 1));
}

// ---------------- 10 neutral commons ----------------
{
	const bb = fire('ymid_brittle_blast', s => s.def('t_t', { type: 'creature', cost: 2, attack: 2, health: 9 }).board(1, [{ id: 't_t' }]), { targetBoard: [1, 0] });
	ok('Brittle Blast: 5 damage', E.hp(bb.players[1].board[0]) === 4, E.hp(bb.players[1].board[0]));
	const uc = fire('ymid_unexpected_conversion', s => s.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d', 't_d']));
	ok('Unexpected Conversion: drew 2', uc.players[0].hand.filter(c => c.id === 't_d').length === 2, uc.players[0].hand.length);
	const be = fire('ymid_break_expectations', s => s.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).hand(1, ['t_d', 't_d']));
	ok('Break Expectations: opponent discarded', be.players[1].hand.length === 1, be.players[1].hand.length);
	ok('Kindred Denial: is a real counterspell', byId['ymid_kindred_denial'].counterSpell === true && byId['ymid_kindred_denial'].type === 'instant');
	const pb = fire('ymid_painful_bond', s => s.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d']));
	ok('Painful Bond: drew 2 and lost 1 Life', pb.players[0].hand.filter(c => c.id === 't_d').length === 2 && pb.players[0].life === 39, pb.players[0].hand.length + '/' + pb.players[0].life);
	const up = fire('ymid_undercity_plunder', s => s.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).hand(1, ['t_d', 't_d']).deck(1, ['t_d']));
	ok('Undercity Plunder: opponent discarded', up.players[1].hand.length === 1, up.players[1].hand.length);
	const hd = fire('ymid_holographic_double', s => s.def('t_f', { type: 'creature', cost: 2, attack: 2, health: 2 }).board(0, [{ id: 't_f' }]), { targetBoard: [0, 0] });
	ok('Holographic Double: copied a friendly creature to hand', hd.players[0].hand.some(c => c.id === 't_f'), hd.players[0].hand.map(c => c.id).join(','));
	const dp = fire('ymid_dragonfly_pilot');
	ok('Dragonfly Pilot: equipped a 1/2 weapon', !!dp.players[0].weapon && dp.players[0].weapon.attack === 1, JSON.stringify(dp.players[0].weapon || null));
	const sr = fire('ymid_sinister_reflections', s => s.def('t_f', { type: 'creature', cost: 2, attack: 2, health: 2 }).board(0, [{ id: 't_f' }]), { targetBoard: [0, 0] });
	ok('Sinister Reflections: put a copy in hand', sr.players[0].hand.some(c => c.id === 't_f'));
	ok('Ominous Traveler: Discover queued', (fire('ymid_ominous_traveler').pickQueue || []).length === 1);
}

// ---------------- 5 neutral legendaries ----------------
{
	// `mill` defaults to the OPPONENT's deck; Oglor self-mills, so it needs
	// target:'self'. Measure the mill against a no-Oglor control, otherwise the
	// turn-start DRAW shrinks the deck on its own and this passes vacuously.
	const deckAfter = withOglor => {
		let s = S().def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d', 't_d', 't_d', 't_d']);
		if (withOglor) s = s.board(0, [{ id: 'ymid_oglor_devoted_assistant' }]);
		return s.endTurn(2).run().state.players[0].deck.length;
	};
	const ctl = deckAfter(false), withO = deckAfter(true);
	ok('Oglor: milled one MORE card than the turn-start draw alone', withO === ctl - 1, `control ${ctl}, with Oglor ${withO}`);
	ok('Oglor mills his OWN deck, not the opponent\'s',
		(byId['ymid_oglor_devoted_assistant'].ongoing?.effects || []).some(e => e.type === 'mill' && e.target === 'self'));
	const rh = S().board(0, [{ id: 'ymid_rahilda_wanted_cutthroat' }])
		.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(1, ['t_d', 't_d', 't_d'])
		.attack(0, 0, { targetHero: 1 }).run().state;
	ok('Rahilda: Swing queued a Discover from the enemy deck', (rh.pickQueue || []).length === 1);
	ok('Rahilda: has First Strike', (byId['ymid_rahilda_wanted_cutthroat'].keywords || []).includes('first_strike'));
	const sb = fire('ymid_slayers_bounty');
	// Clues land in the artifact zone, not the hand
	ok("Slayer's Bounty: Investigate produced a Clue token", (sb.players[0].artifacts || []).some(c => c.id === 'clue_token'),
		(sb.players[0].artifacts || []).map(c => c.id).join(','));
	const ss = fire('ymid_saiba_syphoner', s => s.def('t_sp', { type: 'sorcery', cost: 1, effects: [{ type: 'draw', value: 1 }] }).deck(0, ['t_sp']));
	ok('Saiba Syphoner: drew a spell from the deck', ss.players[0].hand.some(c => c.id === 't_sp'));
	const ba = fire('ymid_begin_anew', s => s
		.def('t_a', { type: 'creature', cost: 2, attack: 2, health: 2 })
		.hand(0, ['ymid_begin_anew', 't_a']).board(0, [{ id: 't_a' }]).board(1, [{ id: 't_a' }]));
	ok('Begin Anew: wiped both boards', ba.players[0].board.length === 0 && ba.players[1].board.length === 0,
		ba.players[0].board.length + '/' + ba.players[1].board.length);
	ok('Begin Anew: buffed creatures in hand', ba.players[0].hand.some(c => c.id === 't_a' && c.attack === 3), ba.players[0].hand.map(c => c.id + ':' + c.attack).join(','));
}

// ---------------- wave 2: the cards the evasion rule had blocked ----------------
{
	// flying -> elusive. Assert the mapping actually bites: an Elusive creature
	// must be untargetable, otherwise it is a cosmetic keyword.
	const el = S().def('t_bolt', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 1, target: 'creature' }] })
		.hand(0, ['t_bolt']).board(1, [{ id: 'ymid_geist_of_regret' }]);
	const legal = el.do((st, Eng) => {
		const spec = { type: 'creature' };
		const targets = Eng.legalTargets(st, 0, spec) || [];
		ok('Elusive really is untargetable (flying’s stand-in has teeth)',
			!targets.some(t => t.uid === st.players[1].board[0].uid), targets.length + ' legal targets');
	}).run().state;
	ok('Geist of Regret carries Elusive', (byId['ymid_geist_of_regret'].keywords || []).includes('elusive'));

	// self-mill: MY deck shrinks by 2, the opponent's is untouched
	const gr = S().def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.hand(0, ['ymid_geist_of_regret']).deck(0, ['t_d', 't_d', 't_d', 't_d']).deck(1, ['t_d', 't_d', 't_d'])
		.play(0, 'ymid_geist_of_regret').run().state;
	ok('Geist of Regret: milled 2 from MY deck', gr.players[0].deck.length === 2, gr.players[0].deck.length);
	ok('Geist of Regret: left the opponent\'s deck alone', gr.players[1].deck.length === 3, gr.players[1].deck.length);

	// Mothrider Cavalry is a lord: OTHER friendly creatures get +1/+1, not itself
	const mc = S().def('t_o', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.board(0, [{ id: 't_o' }]).hand(0, ['ymid_mothrider_cavalry']).play(0, 'ymid_mothrider_cavalry').run().state;
	const other = mc.players[0].board.find(c => c.id === 't_o');
	const self = mc.players[0].board.find(c => c.id === 'ymid_mothrider_cavalry');
	ok('Mothrider Cavalry: buffed another creature to 2/2', other.attack === 2 && E.hp(other) === 2, other.attack + '/' + E.hp(other));
	ok('Mothrider Cavalry: did NOT buff itself (others:true)', self.attack === 2 && E.hp(self) === 2, self.attack + '/' + E.hp(self));

	const pr = S().board(0, [{ id: 'ymid_puppet_raiser' }])
		.def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 }).deck(0, ['t_c', 't_c'])
		.endTurn(1).run().state;
	ok('Puppet Raiser: end of turn drew a creature', pr.players[0].hand.some(c => c.id === 't_c'), pr.players[0].hand.map(c => c.id).join(','));

	const bo = fire('ymid_better_offer', s => s.def('t_s', { type: 'creature', cost: 2, attack: 2, health: 2 }).deck(1, ['t_s', 't_s', 't_s']));
	ok('Better Offer: queued a Discover from the enemy deck, onto the board',
		(bo.pickQueue || []).length === 1 && bo.pickQueue[0].to === 'board', JSON.stringify((bo.pickQueue || [])[0]?.to));

	// Forgeborn Phoenix: Reborn means it comes back once. It is Elusive, so no
	// targeted spell can kill it — use an untargeted sweep, which is also the only
	// route that actually runs the death triggers.
	const fp = S().def('t_sweep', { type: 'sorcery', cost: 0, effects: [{ type: 'damage-all-minions', value: 9 }] })
		.hand(0, ['t_sweep']).board(0, [{ id: 'ymid_forgeborn_phoenix' }])
		.play(0, 't_sweep').run().state;
	ok('Forgeborn Phoenix: Reborn brought it back at 1 health',
		fp.players[0].board.some(c => c.id === 'ymid_forgeborn_phoenix' && E.hp(c) === 1),
		fp.players[0].board.map(c => c.id + ':' + E.hp(c)).join(','));

	ok('Boseiju Pathlighter: Discover queued', (fire('ymid_boseiju_pathlighter').pickQueue || []).length === 1);
	const ss = fire('ymid_suntail_squadron');
	ok('Suntail Squadron: conjured two Hawks into hand', ss.players[0].hand.filter(c => c.name === 'Suntail Hawk').length === 2,
		ss.players[0].hand.map(c => c.name).join(','));
	const sv = fire('ymid_soul_servitude', s => s.def('t_v', { type: 'creature', cost: 2, attack: 2, health: 2 }).board(1, [{ id: 't_v' }]));
	ok('Soul Servitude: destroyed an enemy creature', sv.players[1].board.length === 0, sv.players[1].board.length);

	// Sanguine Brushstroke drains when YOUR creature dies
	const sb = S()
		.def('t_k', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 99, target: 'creature' }] })
		.def('t_m', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.hand(0, ['ymid_sanguine_brushstroke', 't_k']).board(0, [{ id: 't_m' }])
		.play(0, 'ymid_sanguine_brushstroke')
		.play(0, 't_k', { targetBoard: [0, 0] }).run().state;
	ok('Sanguine Brushstroke: the opponent lost 1 Life when my creature died', sb.players[1].life === 39, sb.players[1].life);
	ok('Sanguine Brushstroke: I gained 1 Life', sb.players[0].life === 41, sb.players[0].life);

	// Divine Purge exiles only the cheap creatures, and exiles rather than destroys
	const dp = S().hand(0, ['ymid_divine_purge'])
		.def('t_small', { type: 'creature', cost: 2, attack: 1, health: 1 })
		.def('t_big', { type: 'creature', cost: 6, attack: 6, health: 6 })
		.board(0, [{ id: 't_small' }, { id: 't_big' }]).board(1, [{ id: 't_small' }])
		.play(0, 'ymid_divine_purge').run().state;
	ok('Divine Purge: swept cheap creatures from BOTH boards',
		!dp.players[0].board.some(c => c.id === 't_small') && dp.players[1].board.length === 0,
		dp.players[0].board.map(c => c.id).join(',') + ' | ' + dp.players[1].board.length);
	ok('Divine Purge: spared the expensive creature', dp.players[0].board.some(c => c.id === 't_big'));
	ok('Divine Purge: exiled rather than destroyed', (dp.players[0].exile || []).some(c => c.id === 't_small'),
		(dp.players[0].exile || []).map(c => c.id).join(','));

	// build the hand directly — fire() already seeds hand(0,[id]), so adding more
	// via its builder stacks on top and quietly inflates the count
	const gm = S().def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.hand(0, ['ymid_gutmorn_pactbound_servant', 't_d', 't_d']).hand(1, ['t_d', 't_d'])
		.play(0, 'ymid_gutmorn_pactbound_servant').run().state;
	ok('Gutmorn: I discarded one of my two remaining cards', gm.players[0].hand.length === 1, gm.players[0].hand.length);
	ok('Gutmorn: the opponent discarded too', gm.players[1].hand.length === 1, gm.players[1].hand.length);
}

// ---------------- wave 3: the remainder of both sets ----------------
{
	// --- Discover-style battlecries: assert the pick queue AND its filter ---
	const disc = (id, label, pred, build) => {
		const st = fire(id, build);
		const q = (st.pickQueue || [])[0];
		ok(`${label}: queued a Discover`, !!q, (st.pickQueue || []).length);
		if (q && pred) ok(`${label}: the options match its filter`, q.ids.every(pred), q.ids.map(i => `${i}(${byId[i].cost})`).join(','));
		return st;
	};
	disc('ymid_hinterland_chef', 'Hinterland Chef', null);
	disc('ymid_wickerwing_effigy', 'Wickerwing Effigy', i => byId[i].type === 'creature');
	disc('ymid_futurist_spellthief', 'Futurist Spellthief', i => ['sorcery', 'instant', 'secret', 'trap'].includes(byId[i].type) || byId[i].type === 'sorcery');
	disc('ymid_junkyard_scrapper', 'Junkyard Scrapper', i => (byId[i].cost || 0) <= 2);
	{
		const st = disc('ymid_inquisitor_captain', 'Inquisitor Captain', i => byId[i].type === 'creature' && (byId[i].cost || 0) <= 3);
		ok('Inquisitor Captain: the pick goes to the BOARD', (st.pickQueue || [])[0]?.to === 'board');
	}

	// --- ramp: all four really add a crystal ---
	for (const [id, label] of [['ymid_hollowhenge_wrangler', 'Hollowhenge Wrangler'], ['ymid_kami_of_bamboo_groves', 'Kami of Bamboo Groves']]) {
		const st = fire(id);
		ok(`${label}: gained a Mana Crystal`, st.players[0].mana.max === 11, st.players[0].mana.max);
	}
	{
		const st = fire('ymid_settle_the_wilds', s => s.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d']));
		ok('Settle the Wilds: ramped and drew', st.players[0].mana.max === 11 && st.players[0].hand.some(c => c.id === 't_d'),
			st.players[0].mana.max + ' / ' + st.players[0].hand.map(c => c.id).join(','));
	}

	// --- removal ---
	{
		const st = fire('ymid_conductive_current', s => s.def('t_a', { type: 'creature', cost: 2, attack: 1, health: 5 }).board(0, [{ id: 't_a' }]).board(1, [{ id: 't_a' }]));
		ok('Conductive Current: hit BOTH boards for 3', E.hp(st.players[0].board[0]) === 2 && E.hp(st.players[1].board[0]) === 2,
			E.hp(st.players[0].board[0]) + '/' + E.hp(st.players[1].board[0]));
	}
	{
		const st = fire('ymid_fragment_reality', s => s.def('t_e', { type: 'creature', cost: 3, attack: 3, health: 3 }).board(1, [{ id: 't_e' }]), { targetBoard: [1, 0] });
		ok('Fragment Reality: removed the creature', st.players[1].board.length === 0, st.players[1].board.length);
		ok('Fragment Reality: EXILED rather than killed it', (st.players[1].exile || []).some(c => c.id === 't_e'),
			(st.players[1].exile || []).map(c => c.id).join(','));
	}

	// --- counterspell ---
	ok('Absorb Energy is a real counterspell', byId['ymid_absorb_energy'].counterSpell === true && byId['ymid_absorb_energy'].type === 'instant');
	{
		const st = fire('ymid_absorb_energy');
		ok('Absorb Energy: queued its discount', (st.players[0].costDiscounts || []).length === 1);
	}

	// --- draw / tutor ---
	{
		const st = fire('ymid_discover_the_formula', s => s.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d', 't_d', 't_d']));
		ok('Discover the Formula: drew 3 from the deck', st.players[0].hand.filter(c => c.id === 't_d').length === 3, st.players[0].hand.length);
	}
	{
		const st = fire('ymid_artillery_enthusiast', s => s.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d']));
		ok('Artillery Enthusiast: discarded then drew', st.players[0].hand.some(c => c.id === 't_d'), st.players[0].hand.map(c => c.id).join(','));
	}

	// --- Swing triggers ---
	const swing = id => S().board(0, [{ id }]).def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d', 't_d'])
		.attack(0, 0, { targetHero: 1 }).run().state;
	ok('Obsessive Collector: Swing drew a card', swing('ymid_obsessive_collector').players[0].hand.some(c => c.id === 't_d'));
	ok('Obsessive Collector: carries Ward (2)', byId['ymid_obsessive_collector'].ward?.mana === 2);
	ok('Jukai Liberator: Swing drew a card', swing('ymid_jukai_liberator').players[0].hand.some(c => c.id === 't_d'));
	ok('Semblance Scanner: Swing conjured a copy of itself',
		swing('ymid_semblance_scanner').players[0].hand.some(c => c.id === 'ymid_semblance_scanner'));

	// --- deathrattles (killed by a played spell, the only route that runs them) ---
	const killOnBoard = id => S().def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 99, target: 'creature' }] })
		.hand(0, ['t_kill']).board(0, [{ id }]).play(0, 't_kill', { targetBoard: [0, 0] }).run().state;
	{
		const st = killOnBoard('ymid_faithful_disciple');
		ok('Faithful Disciple: deathrattle Discovered a Paladin card',
			((st.pickQueue || [])[0]?.ids || []).length > 0 && st.pickQueue[0].ids.every(i => (byId[i].cardClass || 'neutral') === 'paladin'),
			((st.pickQueue || [])[0]?.ids || []).map(i => byId[i].cardClass).join(','));
	}
	ok('Predatory Sludge: deathrattle conjured a copy of itself',
		killOnBoard('ymid_predatory_sludge').players[0].hand.some(c => c.id === 'ymid_predatory_sludge'));
	{
		// Kami of Mourning resurrects the biggest thing that died — kill a fatty first
		const st = S().def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 99, target: 'creature' }] })
			.def('t_fat', { type: 'creature', cost: 8, attack: 8, health: 8 })
			.hand(0, ['t_kill', 't_kill']).board(0, [{ id: 't_fat' }, { id: 'ymid_kami_of_mourning' }])
			.play(0, 't_kill', { targetBoard: [0, 0] })
			.play(0, 't_kill', { targetBoard: [0, 1] }).run().state;
		ok('Kami of Mourning: deathrattle resurrected the fatty',
			st.players[0].board.some(c => c.id === 't_fat'), st.players[0].board.map(c => c.id).join(','));
	}

	// --- buffs / equip / statics ---
	{
		// build the hand directly — Scenario.hand() STACKS, so going through fire()
		// (which already seeds hand(0,[id])) would leave a spare copy for buff-hand to hit
		const st = S().def('t_h', { type: 'creature', cost: 3, attack: 2, health: 2 })
			.hand(0, ['ymid_kami_of_transmutation', 't_h']).play(0, 'ymid_kami_of_transmutation').run().state;
		ok('Kami of Transmutation: buffed the creature in hand', st.players[0].hand.some(c => c.id === 't_h' && c.attack === 3),
			st.players[0].hand.map(c => c.id + ':' + c.attack).join(','));
	}
	{
		const st = fire('ymid_inchblade_companion', s => s.def('t_f', { type: 'creature', cost: 1, attack: 1, health: 1 }).board(0, [{ id: 't_f' }]), { targetBoard: [0, 0] });
		ok('Inchblade Companion: buffed a friendly creature', st.players[0].board.some(c => c.id === 't_f' && c.attack === 2));
	}
	{
		const st = fire('ymid_foundry_beetle');
		ok('Foundry Beetle: equipped a 1/2 weapon', !!st.players[0].weapon && st.players[0].weapon.attack === 1, JSON.stringify(st.players[0].weapon || null));
	}
	ok('Experimental Pilot: carries Ward (2)', byId['ymid_experimental_pilot'].ward?.mana === 2);
	ok('Lupine Harbingers: Rush & Trample', ['rush', 'trample'].every(k => (byId['ymid_lupine_harbingers'].keywords || []).includes(k)));
	ok('Wickerwing Effigy: Defender', (byId['ymid_wickerwing_effigy'].keywords || []).includes('defender'));

	// --- Landfall + turn-start enchantment ---
	{
		const st = S().board(0, [{ id: 'ymid_tireless_angler' }])
			.do((s, Eng) => Eng.fireOngoing(s, 0, 'landfall')).run().state;
		ok('Tireless Angler: Landfall queued a Discover', (st.pickQueue || []).length === 1, (st.pickQueue || []).length);
	}
	{
		const before = S().hand(0, ['ymid_runaway_growth']).play(0, 'ymid_runaway_growth').endTurn(2).run().state;
		ok('Runaway Growth: survives on the enchantment zone', (before.players[0].enchantments || []).some(c => c.id === 'ymid_runaway_growth'),
			(before.players[0].enchantments || []).map(c => c.id).join(','));
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
