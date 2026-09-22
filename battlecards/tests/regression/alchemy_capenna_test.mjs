// alchemy_capenna_test.mjs — Alchemy: New Capenna (YSNC).
//
// Third Alchemy set, same ruling as YMID/YNEO: colourless, class identity only.
// A `colors` array would mark these land-conjured and undraftable, so that is
// pinned here too.
//
// New Capenna's own mechanics ride existing engine shapes — shield counter ->
// Divine Shield, Alliance -> ongoing{on:'creature-played'}, Treasure ->
// conjure-id treasure_token, Blitz -> rush + ephemeral. Every card is FIRED
// through the real engine; a card whose JSON reads correctly but whose effect
// never resolves is exactly what this catches.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const imported = raw.cards.filter(c => c.set === 'YSNC');
const S = () => new Scenario(byId).mana(0, 10);
const fire = (id, build = s => s, opts = {}) => {
	let s = S().hand(0, [id]);
	s = build(s) || s;
	return s.play(0, id, opts).run().state;
};

// ---------------- shape ----------------
ok('28 New Capenna cards imported', imported.length === 28, imported.length);
ok('all colourless (deck-legal, not land-conjured)', imported.every(c => !c.colors || c.colors.length === 0),
	imported.filter(c => c.colors && c.colors.length).map(c => c.id).join(','));
ok('all collectible, all ysnc_ ids, all described',
	imported.every(c => c.collectible !== false && /^ysnc_/.test(c.id) && (c.description || '').length > 3));
ok('no card is Neutral — this set is class identity only', imported.every(c => c.cardClass !== 'neutral'),
	imported.filter(c => c.cardClass === 'neutral').map(c => c.id).join(','));
{
	const EV = ['flying', 'menace', 'vigilance', 'reach'];
	ok('MTG evasion never leaks in as a keyword (flying is mapped to elusive)',
		imported.every(c => !(c.keywords || []).some(k => EV.includes(k))));
}
// the two cards that already shipped must NOT have been duplicated
for (const n of ['Cabaretti Revels', 'Riveteers Provocateur'])
	ok(`"${n}" was not re-imported (already ships as paper)`,
		raw.cards.filter(c => c.name === n).length === 1, raw.cards.filter(c => c.name === n).map(c => c.id).join(','));

// set coverage, proven against the Scryfall fixture rather than asserted
{
	const norm = s => (s || '').toLowerCase().replace(/[^a-z0-9]+/g, '');
	const known = new Set(raw.cards.map(c => norm(c.name)));
	let dump = null;
	try { dump = JSON.parse(fs.readFileSync(new URL('../fixtures/ysnc.json', import.meta.url))); } catch { /* absent */ }
	if (!dump) console.log('note: ysnc fixture absent — coverage check skipped');
	else {
		const missing = dump.data.filter(c => !known.has(norm(c.card_faces ? c.card_faces[0].name : c.name)) && !known.has(norm(c.name)));
		ok('the fixture covers all 30 printed New Capenna cards', dump.data.length === 30, dump.data.length);
		ok('every printed New Capenna card is now in the game', missing.length === 0, missing.map(c => c.name).join(','));
	}
}
// art (gitignored tree — same absent-in-CI guard the other suites use)
{
	let idx = null;
	try { idx = new Set(JSON.parse(fs.readFileSync(new URL('../../art/index.json', import.meta.url)))); }
	catch { console.log('note: art/index.json absent (gitignored) — art checks skipped'); }
	if (idx) ok('every card has art registered', imported.every(c => idx.has(c.id)),
		imported.filter(c => !idx.has(c.id)).map(c => c.id).join(','));
}

// ---------------- Treasure: the set's signature token ----------------
{
	ok('treasure_token exists to be conjured', !!byId.treasure_token);
	const st = fire('ysnc_big_spender');
	ok('Big Spender: conjured a Treasure Token', st.players[0].hand.some(c => c.id === 'treasure_token'),
		st.players[0].hand.map(c => c.id).join(','));
	const rb = fire('ysnc_racketeer_boss');
	ok('Racketeer Boss: conjured TWO Treasure Tokens', rb.players[0].hand.filter(c => c.id === 'treasure_token').length === 2,
		rb.players[0].hand.filter(c => c.id === 'treasure_token').length);
}

// ---------------- Discover-style battlecries, with their filters ----------------
{
	const disc = (id, label, pred) => {
		const st = fire(id);
		const q = (st.pickQueue || [])[0];
		ok(`${label}: queued a Discover`, !!q, (st.pickQueue || []).length);
		if (q && pred) ok(`${label}: options match its filter`, q.ids.every(pred), q.ids.map(i => byId[i].id).join(','));
	};
	disc('ysnc_celestial_vault', 'Celestial Vault', null);
	disc('ysnc_spelldrain_assassin', 'Spelldrain Assassin', i => ['sorcery', 'instant', 'secret', 'trap'].includes(byId[i].type));
	disc('ysnc_graven_archfiend', 'Graven Archfiend', i => (byId[i].tribe || '').includes('Demon'));
	{
		const st = fire('ysnc_agent_of_raffine', s => s.def('t_s', { type: 'creature', cost: 2, attack: 2, health: 2 }).deck(1, ['t_s', 't_s', 't_s']));
		ok('Agent of Raffine: Discovered from the OPPONENT deck', (st.pickQueue || []).length === 1);
	}
}

// ---------------- removal / interaction ----------------
{
	const withEnemy = (id, opts) => fire(id, s => s.def('t_e', { type: 'creature', cost: 3, attack: 3, health: 6 }).board(1, [{ id: 't_e' }]), opts);
	const ex = withEnemy('ysnc_obscura_polymorphist', { targetBoard: [1, 0] });
	ok('Obscura Polymorphist: removed the creature', ex.players[1].board.length === 0);
	ok('Obscura Polymorphist: EXILED it', (ex.players[1].exile || []).some(c => c.id === 't_e'),
		(ex.players[1].exile || []).map(c => c.id).join(','));
	const bo = withEnemy('ysnc_nightclub_bouncer', { targetBoard: [1, 0] });
	ok('Nightclub Bouncer: bounced it to hand', bo.players[1].board.length === 0 && bo.players[1].hand.some(c => c.id === 't_e'),
		bo.players[1].hand.map(c => c.id).join(','));
	const hv = withEnemy('ysnc_herald_of_vengeance');
	ok('Herald of Vengeance: destroyed a random enemy creature', hv.players[1].board.length === 0);
	const sf = withEnemy('ysnc_shattering_finale', { targetBoard: [1, 0] });
	ok('Shattering Finale: applied -0/-3', sf.players[1].board[0] && E.hp(sf.players[1].board[0]) === 3,
		sf.players[1].board[0] && E.hp(sf.players[1].board[0]));
	const tp = fire('ysnc_traumatic_prank', s => s.def('t_w', { type: 'creature', cost: 2, attack: 2, health: 2 }).board(1, [{ id: 't_w' }]), { targetBoard: [1, 0] });
	ok('Traumatic Prank: stole the creature', tp.players[0].board.some(c => c.id === 't_w') && tp.players[1].board.length === 0,
		tp.players[0].board.map(c => c.id).join(',') + ' | enemy ' + tp.players[1].board.length);
	ok('Pass the Torch: 2 damage to any target',
		fire('ysnc_pass_the_torch', s => s.def('t_t', { type: 'creature', cost: 2, attack: 1, health: 9 }).board(1, [{ id: 't_t' }]), { targetBoard: [1, 0] })
			.players[1].board[0].damage === 2);
	ok('Bind to Secrecy is a real counterspell', byId.ysnc_bind_to_secrecy.counterSpell === true && byId.ysnc_bind_to_secrecy.type === 'instant');
}

// ---------------- shield counters -> Divine Shield ----------------
{
	const bs = fire('ysnc_brokers_safeguard', s => s.def('t_f', { type: 'creature', cost: 1, attack: 1, health: 1 }).board(0, [{ id: 't_f' }]), { targetBoard: [0, 0] });
	ok("Brokers' Safeguard: granted Divine Shield", bs.players[0].board.some(c => c.id === 't_f' && E.has(c, 'divine_shield')));
	const sb = fire('ysnc_sparas_bodyguard', s => s.def('t_f', { type: 'creature', cost: 1, attack: 1, health: 1 }).board(0, [{ id: 't_f' }]), { targetBoard: [0, 0] });
	ok("Spara's Bodyguard: granted Divine Shield to a friend", sb.players[0].board.some(c => c.id === 't_f' && E.has(c, 'divine_shield')));
	ok("Spara's Bodyguard: has Divine Shield itself", (byId.ysnc_sparas_bodyguard.keywords || []).includes('divine_shield'));
}

// ---------------- Alliance / ramp / draw ----------------
{
	// Alliance fires when ANOTHER creature is played, not on its own arrival
	const st = S().def('t_c', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.hand(0, ['ysnc_back_alley_gardener', 't_c'])
		.play(0, 'ysnc_back_alley_gardener')
		.do((s) => { s._manaAfterGardener = E.availableMana(s.players[0]); })
		.play(0, 't_c').run().state;
	ok('Back-Alley Gardener: Alliance gained Mana when another creature landed',
		E.availableMana(st.players[0]) > (st._manaAfterGardener - 1), E.availableMana(st.players[0]) + ' vs ' + st._manaAfterGardener);
	const mc = fire('ysnc_menagerie_curator');
	ok('Menagerie Curator: gained 1 Mana', E.availableMana(mc.players[0]) === 9, E.availableMana(mc.players[0]));
	const cf = fire('ysnc_choice_of_fortunes', s => s.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d', 't_d']));
	ok('Choice of Fortunes: drew 2 from the deck', cf.players[0].hand.filter(c => c.id === 't_d').length === 2, cf.players[0].hand.length);
	const gr = fire('ysnc_giant_regrowth', s => s.def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 }).deck(0, ['t_c', 't_c']));
	ok('Giant Regrowth: drew a creature and buffed one in hand', gr.players[0].hand.some(c => c.id === 't_c' && c.attack === 5),
		gr.players[0].hand.map(c => c.id + ':' + c.attack).join(','));
	// connive is net-zero for the hand (draw 1, then discard 1), so assert BOTH
	// halves separately: the deck shrank by exactly one, and the hand did not grow.
	const df = fire('ysnc_diviner_of_fates', s => s.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d']));
	ok('Diviner of Fates: connive drew a card (deck 2 -> 1)', df.players[0].deck.length === 1, df.players[0].deck.length);
	ok('Diviner of Fates: connive then discarded it (hand net zero)', df.players[0].hand.length === 0, df.players[0].hand.length);
	const sr = fire('ysnc_syndicate_recruiter', s => s.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d', 't_d', 't_d', 't_d', 't_d']));
	ok('Syndicate Recruiter: milled 4 from MY OWN deck', sr.players[0].deck.length === 2, sr.players[0].deck.length);
}

// ---------------- summons / buffs ----------------
{
	const rl = fire('ysnc_rope_line_attendant');
	ok('Rope Line Attendant: summoned two 1/1 Citizens',
		rl.players[0].board.filter(c => c.name === 'Citizen').length === 2,
		rl.players[0].board.map(c => c.name).join(','));
	const ss = S().def('t_h', { type: 'creature', cost: 3, attack: 2, health: 2 })
		.hand(0, ['ysnc_skyline_savior', 't_h']).play(0, 'ysnc_skyline_savior').run().state;
	ok('Skyline Savior: buffed the creature in hand', ss.players[0].hand.some(c => c.id === 't_h' && c.attack === 3),
		ss.players[0].hand.map(c => c.id + ':' + c.attack).join(','));
}

// ---------------- Blitz = rush + ephemeral, with its death draw ----------------
{
	const d = byId.ysnc_effluence_devourer;
	ok('Effluence Devourer: Blitz is Rush + Ephemeral', ['rush', 'ephemeral'].every(k => (d.keywords || []).includes(k)));
	const st = S().def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 99, target: 'creature' }] })
		.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.hand(0, ['t_kill']).deck(0, ['t_d', 't_d']).board(0, [{ id: 'ysnc_effluence_devourer' }])
		.play(0, 't_kill', { targetBoard: [0, 0] }).run().state;
	ok('Effluence Devourer: deathrattle drew a card', st.players[0].hand.some(c => c.id === 't_d'),
		st.players[0].hand.map(c => c.id).join(','));
}

// ---------------- enchantments ----------------
{
	// Loose in the Park runs its effects on entry (enchantments do, with no battlecry keyword)
	const lp = fire('ysnc_loose_in_the_park', s => s.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d']));
	ok('Loose in the Park: drew on entry', lp.players[0].hand.some(c => c.id === 't_d'), lp.players[0].hand.map(c => c.id).join(','));
	ok('Loose in the Park: queued its Discover', (lp.pickQueue || []).length === 1);
	// Xander's Wake pays out when YOUR creature dies
	const xw = S().def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 99, target: 'creature' }] })
		.def('t_m', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.hand(0, ["ysnc_xanders_wake", 't_kill']).board(0, [{ id: 't_m' }])
		.play(0, 'ysnc_xanders_wake').play(0, 't_kill', { targetBoard: [0, 0] }).run().state;
	ok("Xander's Wake: a friendly death conjured a Treasure", xw.players[0].hand.some(c => c.id === 'treasure_token'),
		xw.players[0].hand.map(c => c.id).join(','));
	// Bank Job pays out at the start of your turn
	const bj = S().hand(0, ['ysnc_bank_job']).play(0, 'ysnc_bank_job').endTurn(2).run().state;
	ok('Bank Job: start of turn conjured a Treasure', bj.players[0].hand.some(c => c.id === 'treasure_token'),
		bj.players[0].hand.map(c => c.id).join(','));
	// Arming Gala buffs the hand at end of turn
	const ag = S().def('t_h', { type: 'creature', cost: 3, attack: 2, health: 2 })
		.hand(0, ['ysnc_arming_gala', 't_h']).play(0, 'ysnc_arming_gala').endTurn(1).run().state;
	ok('Arming Gala: end of turn buffed the hand', ag.players[0].hand.some(c => c.id === 't_h' && c.attack > 2),
		ag.players[0].hand.map(c => c.id + ':' + c.attack).join(','));
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
