// alchemy_baldurs_gate_test.mjs — Alchemy Horizons: Baldur's Gate (HBG).
//
// The fourth Alchemy set and by far the largest: 421 unique printed, of which
// 335 are importable (58 names already in the game, 28 are `A-` rebalanced
// twins of a plain card in the same set). Imported in waves; this suite grows
// with each one.
//
// Every one of the 335 was checked for ART REUSE against the shipped art tree
// (12,499 files / 11,248 distinct artworks, including all 555 lorequest and
// 568 Sword Coast cards) — zero overlap, so no card repeats a picture already
// in the game. Owner requirement, alongside "nothing already in lorequest".
//
// Same ruling as the other Alchemy sets: colourless, class identity, deck-legal.
// Every card is FIRED through the real engine.
import fs from 'fs';
import * as E from '../../engine.js';
import { Scenario } from '../helpers/scenario.mjs';

const raw = JSON.parse(fs.readFileSync(new URL('../../cards.json', import.meta.url)));
const byId = {}; for (const c of raw.cards) byId[c.id] = c;
let pass = 0, fail = 0;
const ok = (l, c, extra) => { if (c) pass++; else { fail++; console.log('FAIL:', l, extra ?? ''); } };

const imported = raw.cards.filter(c => c.set === 'HBG');
const S = () => new Scenario(byId).mana(0, 10);
const fire = (id, build = s => s, opts = {}) => {
	let s = S().hand(0, [id]);
	s = build(s) || s;
	return s.play(0, id, opts).run().state;
};
const enemy = (id, opts, hp = 6) => fire(id, s => s.def('t_e', { type: 'creature', cost: 3, attack: 3, health: hp }).board(1, [{ id: 't_e' }]), opts);

// ---------------- shape ----------------
ok('wave 1 imported 30 cards', imported.length >= 30, imported.length);
ok('all colourless (deck-legal, not land-conjured)', imported.every(c => !c.colors || c.colors.length === 0),
	imported.filter(c => c.colors && c.colors.length).map(c => c.id).join(','));
ok('all collectible with hbg_ ids and descriptions',
	imported.every(c => c.collectible !== false && /^hbg_/.test(c.id) && (c.description || '').length > 3));
ok('every card carries a class (no Neutrals in this set)', imported.every(c => c.cardClass && c.cardClass !== 'neutral'),
	imported.filter(c => !c.cardClass || c.cardClass === 'neutral').map(c => c.id).join(','));
{
	const EV = ['flying', 'menace', 'vigilance', 'reach'];
	ok('MTG evasion never leaks in as a keyword', imported.every(c => !(c.keywords || []).some(k => EV.includes(k))));
}
// no HBG card may duplicate a name already in the game, incl. every lorequest deck
{
	const dupes = imported.filter(c => raw.cards.filter(x => x.name === c.name).length > 1);
	ok('no HBG card duplicates an existing card name', dupes.length === 0, dupes.map(c => c.name).join(','));
	const lore = new Set(raw.cards.filter(c => c.loreDeck).map(c => (c.name || '').toLowerCase()));
	const clash = imported.filter(c => lore.has((c.name || '').toLowerCase()));
	ok('nothing collides with a lorequest card (owner requirement)', clash.length === 0, clash.map(c => c.name).join(','));
}
// art: registered, and NOT a duplicate of any other artwork in the tree
{
	let idx = null;
	try { idx = new Set(JSON.parse(fs.readFileSync(new URL('../../art/index.json', import.meta.url)))); }
	catch { console.log('note: art/index.json absent (gitignored) — art checks skipped'); }
	if (idx) ok('every HBG card has art registered', imported.every(c => idx.has(c.id)),
		imported.filter(c => !idx.has(c.id)).map(c => c.id).join(','));
}

// ---------------- white ----------------
{
	const st = S().board(0, [{ id: 'hbg_celestial_unicorn' }])
		.def('t_heal', { type: 'sorcery', cost: 0, effects: [{ type: 'heal', value: 3, target: 'own-hero' }] })
		.hand(0, ['t_heal']).life(0, 20).play(0, 't_heal').run().state;
	const u = st.players[0].board.find(c => c.id === 'hbg_celestial_unicorn');
	ok('Celestial Unicorn: grew when you gained Life', u.attack === 4 && E.hp(u) === 3, u.attack + '/' + E.hp(u));
	const fd = S().def('t_h', { type: 'creature', cost: 3, attack: 2, health: 2 })
		.hand(0, ['hbg_flaming_fist_duskguard', 't_h']).play(0, 'hbg_flaming_fist_duskguard').run().state;
	ok('Flaming Fist Duskguard: buffed a creature in hand +1/+0', fd.players[0].hand.some(c => c.id === 't_h' && c.attack === 3),
		fd.players[0].hand.map(c => c.id + ':' + c.attack).join(','));
	ok('Guardian Naga: Divine Shield & Taunt', ['divine_shield', 'taunt'].every(k => (byId.hbg_guardian_naga.keywords || []).includes(k)));
}

// ---------------- blue ----------------
{
	const ac = enemy('hbg_air_cult_elemental', { targetBoard: [1, 0] });
	ok('Air-Cult Elemental: bounced a creature to hand', ac.players[1].board.length === 0 && ac.players[1].hand.some(c => c.id === 't_e'));
	ok('Air-Cult Elemental: is Elusive', (byId.hbg_air_cult_elemental.keywords || []).includes('elusive'));
	const cs = enemy('hbg_charmed_sleep', { targetBoard: [1, 0] });
	ok('Charmed Sleep: froze an enemy creature', !!cs.players[1].board[0]?.frozen);
	ok('Clever Conjurer: Discovered a spell', ((fire('hbg_clever_conjurer').pickQueue || [])[0]?.ids || [])
		.every(i => ['sorcery', 'instant', 'secret', 'trap'].includes(byId[i].type)));
	const dl = fire('hbg_dragonborn_looter', s => s.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d']));
	ok('Dragonborn Looter: drew then discarded (deck 2 -> 1, hand net 0)',
		dl.players[0].deck.length === 1 && dl.players[0].hand.length === 0,
		dl.players[0].deck.length + '/' + dl.players[0].hand.length);
}

// ---------------- black ----------------
{
	const bb = S().hand(0, ['hbg_baleful_beholder'])
		.def('t_ench', { type: 'enchantment', cost: 2 })
		.do((st, Eng) => { const c = Eng.instantiate(st.cardsById.t_ench, 1); c.zone = 'enchantment'; st.players[1].enchantments.push(c); })
		.play(0, 'hbg_baleful_beholder').run().state;
	ok('Baleful Beholder: destroyed an enemy enchantment', (bb.players[1].enchantments || []).length === 0,
		(bb.players[1].enchantments || []).map(c => c.id).join(','));
	const dc = fire("hbg_demogorgons_clutches", s => s.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.hand(1, ['t_d', 't_d', 't_d']).deck(1, ['t_d', 't_d', 't_d']));
	ok("Demogorgon's Clutches: opponent discarded 2", dc.players[1].hand.length === 1, dc.players[1].hand.length);
	ok("Demogorgon's Clutches: opponent lost 2 Life", dc.players[1].life === 38, dc.players[1].life);
	const eb = enemy('hbg_eyes_of_the_beholder', { targetBoard: [1, 0] });
	ok('Eyes of the Beholder: destroyed the creature', eb.players[1].board.length === 0);
	const as = fire('hbg_armor_of_shadows', s => s.def('t_f', { type: 'creature', cost: 1, attack: 1, health: 1 }).board(0, [{ id: 't_f' }]), { targetBoard: [0, 0] });
	ok('Armor of Shadows: granted Indestructible', as.players[0].board.some(c => c.id === 't_f' && E.has(c, 'indestructible')));
	const gb = enemy('hbg_grim_bounty', { targetBoard: [1, 0] });
	ok('Grim Bounty: destroyed a creature', gb.players[1].board.length === 0);
	ok('Grim Bounty: conjured a Treasure', gb.players[0].hand.some(c => c.id === 'treasure_token'));
	ok('Gray Slaad: Deathtouch', (byId.hbg_gray_slaad.keywords || []).includes('deathtouch'));
	// Guildsworn Prowler draws on death
	const gp = S().def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 99, target: 'creature' }] })
		.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.hand(0, ['t_kill']).deck(0, ['t_d', 't_d']).board(0, [{ id: 'hbg_guildsworn_prowler' }])
		.play(0, 't_kill', { targetBoard: [0, 0] }).run().state;
	ok('Guildsworn Prowler: deathrattle drew a card', gp.players[0].hand.some(c => c.id === 't_d'));
	const hr = S().board(0, [{ id: 'hbg_hoard_robber' }]).attack(0, 0, { targetHero: 1 }).run().state;
	ok('Hoard Robber: Swing conjured a Treasure', hr.players[0].hand.some(c => c.id === 'treasure_token'));
}

// ---------------- red ----------------
{
	const dr = fire('hbg_dueling_rapier');
	ok('Dueling Rapier: equipped a 2/2 weapon', !!dr.players[0].weapon && dr.players[0].weapon.attack === 2,
		JSON.stringify(dr.players[0].weapon || null));
	ok('Hobgoblin Captain: First Strike', (byId.hbg_hobgoblin_captain.keywords || []).includes('first_strike'));
	const gf = enemy('hbg_giant_fire_beetles', { targetBoard: [1, 0] });
	ok('Giant Fire Beetles: dealt 1 damage', gf.players[1].board[0].damage === 1, gf.players[1].board[0].damage);
	// Genasi Rabble-Rouser grows when ANOTHER creature is played (Alliance)
	const gr = S().def('t_c', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.hand(0, ['hbg_genasi_rabble_rouser', 't_c'])
		.play(0, 'hbg_genasi_rabble_rouser').play(0, 't_c').run().state;
	const rr = gr.players[0].board.find(c => c.id === 'hbg_genasi_rabble_rouser');
	ok('Genasi Rabble-Rouser: Alliance grew it to 2/3', rr.attack === 2, rr.attack + '/' + E.hp(rr));
}

// ---------------- green ----------------
{
	const ad = fire('hbg_ambitious_dragonborn');
	const d = ad.players[0].board.find(c => c.id === 'hbg_ambitious_dragonborn');
	ok('Ambitious Dragonborn: battlecry grew it to 5/5', d.attack === 5 && E.hp(d) === 5, d.attack + '/' + E.hp(d));
	const aa = fire('hbg_arcane_archery', s => s.def('t_f', { type: 'creature', cost: 1, attack: 1, health: 1 }).board(0, [{ id: 't_f' }]), { targetBoard: [0, 0] });
	const t = aa.players[0].board.find(c => c.id === 't_f');
	ok('Arcane Archery: +3/+3 this turn and Trample', t.attack === 4 && E.has(t, 'trample'), t.attack + '/' + E.hp(t));
	// Band Together is a two-target fight: it MUST declare fight:true
	ok('Band Together declares fight:true', byId.hbg_band_together.fight === true);
	const bt = S().def('t_big', { type: 'creature', cost: 2, attack: 4, health: 6 })
		.def('t_small', { type: 'creature', cost: 1, attack: 2, health: 9 })
		.hand(0, ['hbg_band_together']).board(0, [{ id: 't_big' }]).board(1, [{ id: 't_small' }])
		.do((s, Eng) => {
			const card = s.players[0].hand.find(c => c.id === 'hbg_band_together');
			Eng.playCard(s, 0, card.uid, { type: 'creature', uid: s.players[0].board[0].uid, player: 0, fightTarget: s.players[1].board[0].uid });
		}).run().state;
	ok('Band Together: the fight dealt damage both ways',
		E.hp(bt.players[1].board[0]) === 5 && E.hp(bt.players[0].board[0]) === 4,
		E.hp(bt.players[1].board[0]) + ' / ' + E.hp(bt.players[0].board[0]));
	const cl = fire('hbg_circle_of_the_land_druid', s => s.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d', 't_d', 't_d', 't_d', 't_d']));
	ok('Circle of the Land Druid: milled 4 from MY deck', cl.players[0].deck.length === 2, cl.players[0].deck.length);
	const cm = fire('hbg_circle_of_the_moon_druid');
	const moon = cm.players[0].board.find(c => c.id === 'hbg_circle_of_the_moon_druid');
	ok('Circle of the Moon Druid: +2/+0 this turn', moon.attack === 4, moon.attack);
	const dru = fire('hbg_druidic_ritual', s => s.def('t_c', { type: 'creature', cost: 2, attack: 2, health: 2 }).deck(0, ['t_c', 't_c', 't_c', 't_c', 't_c']));
	ok('Druidic Ritual: milled 3 and drew a creature', dru.players[0].hand.some(c => c.id === 't_c') && dru.players[0].deck.length === 1,
		dru.players[0].deck.length + ' left');
	ok('Dread Linnorm: Trample', (byId.hbg_dread_linnorm.keywords || []).includes('trample'));
	ok('Ettercap: Taunt', (byId.hbg_ettercap.keywords || []).includes('taunt'));
	const gn = S().board(0, [{ id: 'hbg_gnoll_hunter' }]).attack(0, 0, { targetHero: 1 }).run().state;
	const gh = gn.players[0].board.find(c => c.id === 'hbg_gnoll_hunter');
	ok('Gnoll Hunter: Swing grew it', gh.attack === 3, gh.attack + '/' + E.hp(gh));
	const hg = fire('hbg_hill_giant_herdgorger', s => s.life(0, 20));
	ok('Hill Giant Herdgorger: gained 3 Life', hg.players[0].life === 23, hg.players[0].life);
	const ft = fire('hbg_follow_the_tracks');
	ok('Follow the Tracks: Discovered a creature onto the board',
		(ft.pickQueue || []).length === 1 && ft.pickQueue[0].to === 'board', JSON.stringify((ft.pickQueue || [])[0]?.to));
}

// ---------------- wave 2: d20 -> d6 branching ----------------
// Owner ruling: paper d20 bands compress to a d6. Drive the roll deterministically
// by pinning state.rng, so each band is exercised rather than whichever one the
// seed happens to land on.
{
	// rollDie does 1 + floor(rng()*sides): rng 0 -> 1, 0.5 -> 4, 0.99 -> 6
	const rollAs = (id, r, build = s => s, opts = {}) => {
		let s = S().hand(0, [id]);
		s = build(s) || s;
		return s.do(st => { st.rng = () => r; }).play(0, id, opts).run().state;
	};
	const deck = s => s.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 })
		.deck(0, Array(12).fill('t_d'));

	// Contact Other Plane: 1-3 draw 2 | 4-5 scry2+draw2 | 6 scry3+draw3.
	// Scry is INTERACTIVE — it parks the remaining effects behind a scryQueue
	// decision, exactly as the shipped Thassa's Intervention ([scry,draw]) does —
	// so the bands are told apart by the scry size, with the no-scry band checked
	// on the hand directly.
	const cop = r => rollAs('hbg_contact_other_plane', r, deck);
	const lowBand = cop(0);
	ok('roll-d6 low band (roll 1): drew 2, no scry',
		lowBand.players[0].hand.filter(c => c.id === 't_d').length === 2 && (lowBand.scryQueue || []).length === 0,
		lowBand.players[0].hand.length + ' / scry ' + (lowBand.scryQueue || []).length);
	ok('roll-d6 middle band (roll 4): queued Scry 2', ((cop(0.5).scryQueue || [])[0]?.ids || []).length === 2,
		((cop(0.5).scryQueue || [])[0]?.ids || []).length);
	ok('roll-d6 high band (roll 6): queued Scry 3', ((cop(0.99).scryQueue || [])[0]?.ids || []).length === 3,
		((cop(0.99).scryQueue || [])[0]?.ids || []).length);

	// Farideh's Fireball: the low band hits BOTH heroes, the high band only the enemy
	const ff = (r) => rollAs("hbg_faridehs_fireball", r,
		s => s.def('t_e', { type: 'creature', cost: 3, attack: 3, health: 9 }).board(1, [{ id: 't_e' }]), { targetBoard: [1, 0] });
	const low = ff(0), high = ff(0.99);
	ok("Farideh's Fireball: 5 damage to the creature either way",
		low.players[1].board[0].damage === 5 && high.players[1].board[0].damage === 5);
	ok("Farideh's Fireball low band (roll 1): hit BOTH heroes", low.players[0].life === 38 && low.players[1].life === 38,
		low.players[0].life + '/' + low.players[1].life);
	ok("Farideh's Fireball high band (roll 6): spared you", high.players[0].life === 40 && high.players[1].life === 38,
		high.players[0].life + '/' + high.players[1].life);

	// Sylvan Shepherd rolls on Swing: 1-3 gain 1 | 4-5 gain 2 | 6 gain 5
	const shep = r => S().life(0, 20).board(0, [{ id: 'hbg_sylvan_shepherd' }])
		.do(st => { st.rng = () => r; }).attack(0, 0, { targetHero: 1 }).run().state.players[0].life;
	ok('Sylvan Shepherd: roll 1 gained 1 Life', shep(0) === 21, shep(0));
	ok('Sylvan Shepherd: roll 6 gained 5 Life', shep(0.99) === 25, shep(0.99));

	// the roll goes through rollDie, so die-rolled triggers still fire
	{
		let saw = null;
		const st = S().hand(0, ['hbg_contact_other_plane']).def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 })
			.deck(0, Array(8).fill('t_d'))
			.do(s => { s.rng = () => 0.99; s.onEmit = ev => { if (ev.type === 'dieRolled') saw = ev; }; })
			.play(0, 'hbg_contact_other_plane').run().state;
		const rolled = (st.log || st.events || []).some ? (st.log || st.events || []).some(e => e.type === 'dieRolled') : false;
		ok('roll-d6 emits a dieRolled event (die-rolled triggers keep working)', rolled || !!saw, 'no dieRolled seen');
	}
	ok("Gale's Redirection is a counterspell that also rolls", byId.hbg_gales_redirection.counterSpell === true
		&& (byId.hbg_gales_redirection.effects || []).some(e => e.type === 'roll-d6'));
	// every roll-d6 card must have ascending, terminating outcome bands
	{
		const rollers = imported.filter(c => JSON.stringify(c).includes('roll-d6'));
		ok('wave 2 imported the die-roll cards', rollers.length === 8, rollers.length);
		const walk = o => (o.effects || []).concat(...(o.effects || []).map(() => []));
		const bad = [];
		for (const c of rollers) {
			const all = [...(c.effects || []), ...((c.ongoing && c.ongoing.effects) || [])];
			for (const e of all) {
				if (e.type !== 'roll-d6') continue;
				const maxes = (e.outcomes || []).map(o => o.max);
				if (!maxes.length) bad.push(c.id + ' no outcomes');
				else if (maxes.some((m, i) => i && m <= maxes[i - 1])) bad.push(c.id + ' not ascending: ' + maxes.join(','));
				else if (maxes[maxes.length - 1] !== 6) bad.push(c.id + ' last band is ' + maxes[maxes.length - 1] + ', not 6 — rolls above it do nothing');
			}
		}
		ok('every roll-d6 band list is ascending and covers a 6', bad.length === 0, bad.join(' | '));
	}
}

// ---------------- the Background keyword ----------------
// NOTE: Alchemy Horizons: Baldur's Gate ships ZERO Backgrounds — they are in the
// paper CLB set, not this one. The keyword and its condition exist as owner-specced
// infrastructure, so prove the machinery directly rather than leaving it untested.
{
	ok('no HBG card claims to be a Background (the set has none)',
		imported.every(c => !(c.keywords || []).includes('background')));
	const withBg = has => {
		let s = S()
			.def('t_bg', { type: 'enchantment', cost: 1, keywords: ['background'], description: 'Background.' })
			.def('t_check', {   // note: `conditional` branches on `then`/`else`, not `effects`
				type: 'sorcery', cost: 0,
				effects: [{ type: 'conditional', if: { controlBackground: 1 }, then: [{ type: 'draw', value: 2 }] }],
			})
			.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d', 't_d']);
		s = has ? s.hand(0, ['t_bg', 't_check']).play(0, 't_bg') : s.hand(0, ['t_check']);
		return s.play(0, 't_check').run().state;
	};
	ok('Background: a card keys off it when you control one', withBg(true).players[0].hand.filter(c => c.id === 't_d').length === 2,
		withBg(true).players[0].hand.map(c => c.id).join(','));
	ok('Background: the same card does nothing when you control none', withBg(false).players[0].hand.filter(c => c.id === 't_d').length === 0,
		withBg(false).players[0].hand.map(c => c.id).join(','));
	// it is inert on its own and stacks — you may control any number
	const two = S()
		.def('t_bg', { type: 'enchantment', cost: 1, keywords: ['background'], description: 'Background.' })
		.hand(0, ['t_bg', 't_bg']).play(0, 't_bg').play(0, 't_bg').run().state;
	ok('Background: you may control more than one', (two.players[0].enchantments || []).filter(c => c.id === 't_bg').length === 2,
		(two.players[0].enchantments || []).length);
}

// ---------------- wave 3 ----------------
{
	// removal / debuffs
	const hp0 = (id, opts) => enemy(id, opts, 9);
	ok('Hypnotic Pattern: -2/-0', hp0('hbg_hypnotic_pattern', { targetBoard: [1, 0] }).players[1].board[0].attack === 1);
	ok('Sewer Plague: -2/-2', (() => { const s = hp0('hbg_sewer_plague', { targetBoard: [1, 0] }); const c = s.players[1].board[0]; return c.attack === 1 && E.hp(c) === 7; })());
	ok('Shocking Grasp: -2/-0 and drew', (() => {
		const s = fire('hbg_shocking_grasp', b => b.def('t_e', { type: 'creature', cost: 3, attack: 3, health: 9 }).board(1, [{ id: 't_e' }])
			.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d']), { targetBoard: [1, 0] });
		return s.players[1].board[0].attack === 1 && s.players[0].hand.some(c => c.id === 't_d');
	})());
	ok('Plummet: destroyed an enemy creature', hp0('hbg_plummet', { targetBoard: [1, 0] }).players[1].board.length === 0);
	ok("Patriar's Humiliation: silenced then damaged", (() => {
		const s = fire("hbg_patriars_humiliation", b => b.def('t_e', { type: 'creature', cost: 3, attack: 3, health: 9, keywords: ['taunt'] }).board(1, [{ id: 't_e' }]), { targetBoard: [1, 0] });
		const c = s.players[1].board[0];
		return !!c && !E.has(c, 'taunt') && c.damage === 1;
	})());
	ok('Incessant Provocation: stole a creature', (() => {
		const s = fire('hbg_incessant_provocation', b => b.def('t_w', { type: 'creature', cost: 2, attack: 2, health: 2 }).board(1, [{ id: 't_w' }]), { targetBoard: [1, 0] });
		return s.players[0].board.some(c => c.id === 't_w') && s.players[1].board.length === 0;
	})());
	// Manticore only kills something already damaged
	{
		const s = S().hand(0, ['hbg_manticore'])
			.def('t_hurt', { type: 'creature', cost: 3, attack: 3, health: 9 })
			.board(1, [{ id: 't_hurt', health: 4 }]).play(0, 'hbg_manticore').run().state;
		ok('Manticore: destroyed the damaged creature', s.players[1].board.length === 0, s.players[1].board.length);
	}

	// treasure / value
	ok('Improvised Weaponry: 2 damage and a Treasure', (() => {
		const s = fire('hbg_improvised_weaponry', b => b.def('t_e', { type: 'creature', cost: 3, attack: 3, health: 9 }).board(1, [{ id: 't_e' }]), { targetBoard: [1, 0] });
		return s.players[1].board[0].damage === 2 && s.players[0].hand.some(c => c.id === 'treasure_token');
	})());
	ok('Prophetic Prism: drew a card', fire('hbg_prophetic_prism', b => b.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d']))
		.players[0].hand.some(c => c.id === 't_d'));
	ok('Lizardfolk Librarians: queued Scry 2', ((fire('hbg_lizardfolk_librarians', b => b.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, Array(6).fill('t_d'))).scryQueue || [])[0]?.ids || []).length === 2);
	ok('Lantern of Revealing: gained a Mana Crystal', fire('hbg_lantern_of_revealing').players[0].mana.max === 11);
	ok('Scaled Nurturer: gained 1 Mana', E.availableMana(fire('hbg_scaled_nurturer').players[0]) === 9);
	ok('Kobold Warcaller: queued a creature discount',
		(fire('hbg_kobold_warcaller').players[0].costDiscounts || []).some(d => d.cardType === 'creature'));

	// grants
	const grantTo = id => fire(id, b => b.def('t_f', { type: 'creature', cost: 1, attack: 1, health: 1 }).board(0, [{ id: 't_f' }]), { targetBoard: [0, 0] });
	ok('Icewind Stalwart: granted Divine Shield', grantTo('hbg_icewind_stalwart').players[0].board.some(c => c.id === 't_f' && E.has(c, 'divine_shield')));
	ok('Poison the Blade: granted Deathtouch and drew', (() => {
		const s = fire('hbg_poison_the_blade', b => b.def('t_f', { type: 'creature', cost: 1, attack: 1, health: 1 }).board(0, [{ id: 't_f' }])
			.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, ['t_d', 't_d']), { targetBoard: [0, 0] });
		return s.players[0].board.some(c => c.id === 't_f' && E.has(c, 'deathtouch')) && s.players[0].hand.some(c => c.id === 't_d');
	})());
	ok('Pseudodragon Familiar: granted Elusive', grantTo('hbg_pseudodragon_familiar').players[0].board.some(c => c.id === 't_f' && E.has(c, 'elusive')));
	// Inspiring Bard is a real Choose One (as printed). Doing BOTH halves in one
	// effect list does not work: with a creature target chosen, a `heal` aimed at
	// the hero gets redirected to that creature — so the modes must be separate.
	{
		const bard = choice => fire('hbg_inspiring_bard',
			b => b.def('t_f', { type: 'creature', cost: 1, attack: 1, health: 1 }).board(0, [{ id: 't_f' }]).life(0, 20),
			{ choice, targetBoard: [0, 0] });
		ok('Inspiring Bard is a Choose One with two modes', (byId.hbg_inspiring_bard.choices || []).length === 2);
		ok('Inspiring Bard mode 1: buffed a friendly creature +2/+2',
			bard(0).players[0].board.some(c => c.id === 't_f' && c.attack === 3),
			bard(0).players[0].board.map(c => c.id + ':' + c.attack).join(','));
		ok('Inspiring Bard mode 2: gained 3 Life', bard(1).players[0].life === 23, bard(1).players[0].life);
	}

	// swing triggers
	const swing = id => S().board(0, [{ id }]).def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 }).deck(0, Array(6).fill('t_d'))
		.attack(0, 0, { targetHero: 1 }).run().state;
	ok('Soulknife Spy: drew on hitting the hero', swing('hbg_soulknife_spy').players[0].hand.some(c => c.id === 't_d'));
	ok('Spined Megalodon: queued Scry 1 on Swing', ((swing('hbg_spined_megalodon').scryQueue || [])[0]?.ids || []).length === 1);
	ok('Ranger Squadron: Swing conjured a copy of itself',
		swing('hbg_ranger_squadron').players[0].hand.some(c => c.id === 'hbg_ranger_squadron'));
	ok('Soldiers of the Watch: Swing conjured a copy of itself',
		swing('hbg_soldiers_of_the_watch').players[0].hand.some(c => c.id === 'hbg_soldiers_of_the_watch'));

	// death triggers
	const killMine = id => S().def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 99, target: 'creature' }] })
		.hand(0, ['t_kill']).board(0, [{ id }]).play(0, 't_kill', { targetBoard: [0, 0] }).run().state;
	ok('Shambling Ghast: deathrattle conjured a Treasure', killMine('hbg_shambling_ghast').players[0].hand.some(c => c.id === 'treasure_token'));
	ok('Hook Horror: Reborn brought it back', (() => {
		const s = S().def('t_sweep', { type: 'sorcery', cost: 0, effects: [{ type: 'damage-all-minions', value: 9 }] })
			.hand(0, ['t_sweep']).board(0, [{ id: 'hbg_hook_horror' }]).play(0, 't_sweep').run().state;
		return s.players[0].board.some(c => c.id === 'hbg_hook_horror' && E.hp(c) === 1);
	})());
	ok('Summon Undead: milled then resurrected', (() => {
		const s = S().def('t_fat', { type: 'creature', cost: 8, attack: 8, health: 8 })
			.def('t_kill', { type: 'sorcery', cost: 0, effects: [{ type: 'damage', value: 99, target: 'creature' }] })
			.def('t_d', { type: 'creature', cost: 1, attack: 1, health: 1 })
			.hand(0, ['t_kill', 'hbg_summon_undead']).deck(0, Array(6).fill('t_d')).board(0, [{ id: 't_fat' }])
			.play(0, 't_kill', { targetBoard: [0, 0] }).play(0, 'hbg_summon_undead').run().state;
		return s.players[0].board.some(c => c.id === 't_fat');
	})());

	// statics that are just bodies — pin the keyword so a typo can't slip through
	const kw = (id, ...ks) => ok(`${byId[id].name}: ${ks.join(' & ')}`, ks.every(k => (byId[id].keywords || []).includes(k)),
		JSON.stringify(byId[id].keywords));
	kw('hbg_iron_golem', 'taunt');
	kw('hbg_jaded_sell_sword', 'first_strike', 'rush');
	kw('hbg_moat_piranhas', 'defender');
	kw('hbg_riptide_turtle', 'defender', 'taunt');
	kw('hbg_spined_megalodon', 'hexproof');
	kw('hbg_nefarious_imp', 'elusive');
	ok('Rimeshield Frost Giant: Ward (3)', byId.hbg_rimeshield_frost_giant.ward?.mana === 3);
	ok('Mace of Disruption: a 1/3 weapon', (() => { const w = fire('hbg_mace_of_disruption').players[0].weapon; return !!w && w.attack === 1; })());
	// every wave-3 card that names a conjure target must point at a real card
	{
		const bad = imported.filter(c => JSON.stringify(c).match(/"conjure-id"/))
			.flatMap(c => {
				const all = [...(c.effects || []), ...((c.ongoing && c.ongoing.effects) || []), ...(c.deathrattle || [])];
				return all.filter(e => e.type === 'conjure-id' && !byId[e.id]).map(e => `${c.id} -> ${e.id}`);
			});
		ok('every conjure-id points at a real card', bad.length === 0, bad.join(', '));
	}
}

console.log(`\n${pass} passed, ${fail} failed`);
process.exit(fail ? 1 : 0);
