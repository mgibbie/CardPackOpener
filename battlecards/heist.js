// Dalaran Heist run data: the 16 passive treasures (phase 2). Heroes, boss
// wings, and run logic land in later phases. Card-shaped data (active
// treasures, alt hero powers) lives in cards.json under set DALARAN_HEIST.
import * as E from './engine.js';

// Passive treasures: picked at the start of a run, applied once per game.
// `apply(state, pi)` mutates the live game state; display fields feed the
// picker UI and the wiki.
export const PASSIVES = {
	recycling: {
		name: 'Recycling', text: 'After a friendly minion dies, gain 2 Armor.',
		apply: (state, pi) => { const p = state.players[pi]; p.armorPerFriendlyDeath = (p.armorPerFriendlyDeath || 0) + 2; },
	},
	rocket_backpacks: {
		name: 'Rocket Backpacks', text: 'Your minions have Rush.',
		apply: (state, pi) => {
			const em = E.instantiate({ id: 'heist_rocket_backpacks', name: 'Rocket Backpacks', type: 'emblem', cost: 0, rarity: 'basic', description: 'Your minions have Rush.', aura: { keywords: ['rush'] } }, pi);
			em.zone = 'emblem';
			state.players[pi].emblems.push(em);
			E.recomputeAuras(state);
		},
	},
	emerald_goggles: {
		name: 'Emerald Goggles', text: 'The left-most card in your hand costs (2) less.',
		apply: (state, pi) => { state.players[pi].leftmostDiscount = 2; },
	},
	robes_of_gaudiness: {
		name: 'Robes of Gaudiness', text: 'Your cards cost half, but you can only play two cards each turn.',
		apply: (state, pi) => { const p = state.players[pi]; p.robesHalf = true; p.robesTwoCards = true; },
	},
	stargazing: {
		name: 'Stargazing', text: 'You can use your Hero Power twice each turn. It costs (1) less.',
		apply: (state, pi) => { state.players[pi].stargazing = true; },
	},
	resourcefulness: {
		name: 'Resourcefulness', text: 'At the start of the game, equip a random weapon and give it +1/+1.',
		apply: (state, pi) => { E.execEffects(state, pi, [{ type: 'equip-random', selfBuff: { attack: 1, durability: 1 } }], null, null); },
	},
	a_princes_ring: {
		name: "A Prince's Ring", text: 'Replace your starting Hero Power with a random one.',
		apply: (state, pi) => {
			const pool = Object.values(state.cardsById).filter(d => d.type === 'heropower' && d.id.startsWith('dala_') && d.power);
			if (!pool.length) return;
			const power = E.instantiate(pool[Math.floor(state.rng() * pool.length)], pi);
			power.zone = 'heropower'; power.usedThisTurn = false;
			state.players[pi].heroPowers = [power];
		},
	},
	book_of_wonders: {
		name: 'Book of Wonders', text: "At the start of the game, shuffle 10 Scrolls of Wonder into your deck.",
		apply: (state, pi) => {
			const p = state.players[pi];
			for (let i = 0; i < 10; i++) p.deck.push('dala_scroll_of_wonder');
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
		},
	},
	wondrous_wisdomball: {
		name: 'Wondrous Wisdomball', text: 'Occasionally gives helpful advice.',
		apply: (state, pi) => { state.players[pi].wisdomball = true; },
	},
	togwaggles_dice: {
		name: "Togwaggle's Dice", text: 'At the end of your turn, randomize the Cost of all cards in your hand.',
		apply: (state, pi) => { state.players[pi].togwaggleDice = true; },
	},
	dr_booms_remote: {
		name: "Dr. Boom's Remote", text: 'At the start of the game, summon three 1/1 Boom Bots.',
		apply: (state, pi) => { for (let i = 0; i < 3; i++) if (state.cardsById['boom_bot']) E.summon(state, pi, state.cardsById['boom_bot']); },
	},
	hagathas_embrace: {
		name: "Hagatha's Embrace", text: 'At the start of your turn, give a random minion in your hand +1/+1.',
		apply: (state, pi) => { state.players[pi].hagathaEmbrace = true; },
	},
	the_hand_of_rafaam: {
		name: 'The Hand of Rafaam', text: "At the start of the game, give your opponent two Cursed! cards.",
		apply: (state, pi) => {
			for (const o of E.opponentsOf(state, pi)) {
				for (let i = 0; i < 2; i++) {
					const c = E.instantiate(state.cardsById['dala_cursed'], o);
					c.zone = 'hand';
					state.players[o].hand.push(c);
				}
				break;
			}
		},
	},
	elixir_of_vigor: {
		name: 'Elixir of Vigor', text: 'After you play a minion, shuffle two copies of it into your deck. They cost (1).',
		apply: (state, pi) => { state.players[pi].vigorShuffle = true; },
	},
	elixir_of_vim: {
		name: 'Elixir of Vim', text: 'You draw an additional two cards each turn. You are Immune to Fatigue.',
		apply: (state, pi) => { const p = state.players[pi]; p.extraTurnDraw = 2; p.noFatigue = true; },
	},
	elixir_of_vile: {
		name: 'Elixir of Vile', text: 'Your spells cost Health instead of Mana.',
		apply: (state, pi) => { state.players[pi].spellsCostHealth = true; },
	},
};

export function applyPassive(state, pi, id) {
	const p = PASSIVES[id];
	if (!p) return false;
	p.apply(state, pi);
	E.emit(state, { type: 'heistPassive', player: pi, id, name: p.name });
	return true;
}

// ---------- heroes ----------
// The nine Heist heroes, one per class. Their hero-power options are the
// class power plus the two dala_ alternates of their class (cards.json).
export const HEROES = [
	{ id: 'rakanishu', name: 'Rakanishu', heroClass: 'mage', flavor: 'A flame elemental with delusions of grandeur.' },
	{ id: 'vessina', name: 'Vessina', heroClass: 'shaman', flavor: "Sethrak, and this city's about to know it." },
	{ id: 'kriziki', name: 'Kriziki', heroClass: 'priest', flavor: 'An arakkoa who worships whatever is winning.' },
	{ id: 'mr_chu', name: 'Mr. Chu', heroClass: 'warrior', flavor: 'A very large bodyguard with very small patience.' },
	{ id: 'ol_barkeye', name: "Ol' Barkeye", heroClass: 'hunter', flavor: 'A blind marksman. His pets aim for him.' },
	{ id: 'squeamlish', name: 'Squeamlish', heroClass: 'druid', flavor: 'A kobold who found a druid staff and never looked back.' },
	{ id: 'tekahn', name: 'Tekahn', heroClass: 'warlock', flavor: 'The E.V.I.L. lackey with the biggest plans.' },
	{ id: 'george_the_fallen', name: 'George the Fallen', heroClass: 'paladin', flavor: 'Still a paladin. Mostly.' },
	{ id: 'captain_eudora', name: 'Captain Eudora', heroClass: 'rogue', flavor: 'Plunder first, questions never.' },
];

// ---------- the boss ladder: five wings ----------
// Each wing is an 8-fight climb: fights roll bosses from the wing pool in
// listed (difficulty) order buckets; the final fight is fixed.
export const WINGS = [
	{ id: 'bank', name: 'The Dalaran Bank', final: 'banker_biggs',
		pool: ['chomper', 'the_great_akazamzarak', 'linzi_redgrin', 'awilo', 'kaye_toogie', 'the_amazing_bonepaw', 'dazzik_hellscream', 'flight_master_belnaara', 'applebough', 'archivist_oshi', 'mo_eniwhiskers', 'noz_timbertail', 'cravitz_lorent', 'albin_eastoft', 'tierra_blythe'] },
	{ id: 'violet_hold', name: 'The Violet Hold', final: 'cyanigosa',
		pool: ['magistrix_norroa', 'erekem', 'moragg', 'ichoron', 'lavanthor', 'zuramat', 'nozari', 'millificent_manastorm', 'lieutenant_sinclari', 'dancin_deryl', 'locksmith_zibb', 'captain_hannigan'] },
	{ id: 'streets', name: 'Streets of Dalaran', final: 'trade_prince_gallywix',
		pool: ['kizi_copperclip', 'moon_priestess_nici', 'alchemist_wendy', 'tala_stonerage', 'disidra_stormglory', 'vas_no', 'whirt_the_all_knowing', 'bookmaster_bae_chao', 'sharky_mcfin', 'ranger_ar_ha', 'jepetto_joybuzz', 'dalaran_fountain_golem', 'rasil_fireborne', 'xur_ios'] },
	{ id: 'underbelly', name: 'The Underbelly', final: 'madam_goya',
		pool: ['the_rat_king', 'marei_loom', 'mama_diggs', 'gold_elemental', 'carousel_gryphon', 'soothsayer_zoie', 'draemus', 'ol_toomba', 'tipsi_wobblerune', 'aki_the_brilliant', 'oxana_demonslay', 'ungan_oddkind', 'p_o_g_o', 'timothy_jones'] },
	{ id: 'citadel', name: 'Kirin Tor Citadel', final: 'archmage_khadgar',
		pool: ['queen_wagtoggle', 'boommaster_flark', 'sael_orn', 'haro_setting_sun', 'dagg_cruelmight', 'valdera_highborne', 'archmage_vargoth', 'lilayell_suntear', 'archmage_kalec', 'sky_captain_smiggs', 'anarii_duskgrove', 'kazamon_steelskin', 'hesutu_stonewind', 'kara_stamper', 'commander_bolan'] },
];

// ---------- bosses ----------
// health from the HS data (10 = early pushover, 40+ = elite); powers
// translated onto existing engine effects (passives become actives where
// needed, dungeon.js-style); `theme` drives buildBossDeck.
export const BOSSES = {
	chomper: { name: 'Chomper', health: 10, hsId: 'DALA_BOSS_01h', power: { name: 'Chomp', cost: 2, text: 'Deal 1 damage to a minion. Lifesteal.', effects: [{ type: 'damage', value: 1, target: 'creature', lifesteal: true }] }, theme: { tribe: 'Beast', maxCost: 4 } },
	awilo: { name: 'Awilo, Cooking Trainer', health: 30, hsId: 'DALA_BOSS_02h', power: { name: 'The Feast', cost: 1, text: 'Restore 3 Health to your hero.', effects: [{ type: 'heal', value: 3, target: 'self' }] }, theme: { cardClass: 'priest' } },
	the_great_akazamzarak: { name: 'The Great Akazamzarak', health: 10, hsId: 'DALA_BOSS_03h', power: { name: 'Prestidigitation', cost: 1, text: 'Add a random spell to your hand.', effects: [{ type: 'conjure-random', cardType: 'sorcery', count: 1 }] }, theme: { cardClass: 'mage', maxCost: 4 } },
	kaye_toogie: { name: 'Kaye Toogie', health: 30, hsId: 'DALA_BOSS_04h', power: { name: 'Open Wormhole', cost: 2, text: 'Summon a minion from your deck.', effects: [{ type: 'summon-random-from-deck' }] }, theme: { cardClass: 'warlock' } },
	the_amazing_bonepaw: { name: 'The Amazing "Bonepaw"', health: 30, hsId: 'DALA_BOSS_05h', power: { name: 'Mana Echoes', cost: 2, text: 'Cast a random spell (targets chosen randomly).', effects: [{ type: 'cast-random-spell', count: 1 }] }, theme: { cardClass: 'mage' } },
	dazzik_hellscream: { name: 'Dazzik "Hellscream"', health: 30, hsId: 'DALA_BOSS_06h', power: { name: 'Armor Up', cost: 2, text: 'Gain 2 Armor.', effects: [{ type: 'armor', value: 2 }] }, theme: { cardClass: 'warrior' } },
	flight_master_belnaara: { name: 'Flight Master Belnaara', health: 30, hsId: 'DALA_BOSS_07h', power: { name: 'Take Flight!', cost: 2, text: 'Gain 3 Armor.', effects: [{ type: 'armor', value: 3 }] }, theme: { cardClass: 'hunter' } },
	applebough: { name: 'Applebough', health: 30, hsId: 'DALA_BOSS_08h', power: { name: 'Apple Toss', cost: 2, text: 'Deal 2 damage to a random enemy minion.', effects: [{ type: 'random-damage', value: 2, count: 1, pool: 'enemy-creatures' }] }, theme: { cardClass: 'druid' } },
	archivist_oshi: { name: 'Archivist Oshi', health: 30, hsId: 'DALA_BOSS_09h', power: { name: 'Repeat History', cost: 2, text: 'Resurrect your strongest dead minion.', effects: [{ type: 'resurrect-highest-died' }] }, theme: { cardClass: 'priest' } },
	mo_eniwhiskers: { name: 'Mo Eniwhiskers', health: 30, hsId: 'DALA_BOSS_10h', power: { name: 'Street Smarts', cost: 0, text: 'Get a Coin.', effects: [{ type: 'gain-coin' }] }, theme: { cardClass: 'rogue' } },
	noz_timbertail: { name: 'Noz Timbertail', health: 30, hsId: 'DALA_BOSS_11h', power: { name: 'Backstabber', cost: 2, text: 'Give a random friendly minion +1/+1 and Stealth.', effects: [{ type: 'buff-random-friendly', attack: 1, health: 1, grant: 'stealth' }] }, theme: { cardClass: 'rogue' } },
	cravitz_lorent: { name: 'Cravitz Lorent', health: 30, hsId: 'DALA_BOSS_12h', power: { name: 'Forbidden Love', cost: 3, text: 'Destroy a random enemy minion.', effects: [{ type: 'destroy-random' }] }, theme: { cardClass: 'warlock' } },
	albin_eastoft: { name: 'Albin Eastoft', health: 30, hsId: 'DALA_BOSS_13h', power: { name: 'Slice and Dice', cost: 2, text: 'Deal 1 damage to three random enemy minions.', effects: [{ type: 'random-damage', value: 1, count: 3, pool: 'enemy-creatures' }] }, theme: { cardClass: 'rogue' } },
	tierra_blythe: { name: 'Tierra Blythe', health: 30, hsId: 'DALA_BOSS_14h', power: { name: 'Order Up!', cost: 2, text: 'Summon a 2/2 Kind Waitress.', effects: [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Kind Waitress' }] }, theme: { cardClass: 'neutral', maxCost: 5 } },
	moon_priestess_nici: { name: 'Moon Priestess Nici', health: 30, hsId: 'DALA_BOSS_15h', power: { name: 'Blessing of Elune', cost: 1, text: 'Restore 4 Health to your hero.', effects: [{ type: 'heal', value: 4, target: 'self' }] }, theme: { cardClass: 'priest' } },
	alchemist_wendy: { name: 'Alchemist Wendy', health: 30, hsId: 'DALA_BOSS_16h', power: { name: 'Equivalent Exchange', cost: 1, text: "Copy a random card in your opponent's hand.", effects: [{ type: 'copy-random-enemy-hand' }] }, theme: { cardClass: 'mage' } },
	tala_stonerage: { name: 'Tala Stonerage', health: 30, hsId: 'DALA_BOSS_17h', power: { name: 'Twin Paths', cost: 2, text: 'Give your minions +1/+1.', effects: [{ type: 'buff', attack: 1, health: 1, target: 'friendly-creatures' }] }, theme: { cardClass: 'druid' } },
	disidra_stormglory: { name: 'Disidra Stormglory', health: 30, hsId: 'DALA_BOSS_18h', power: { name: 'Totemic Summons', cost: 2, text: 'Summon a random Totem.', effects: [{ type: 'summon-random', tribe: 'Totem' }] }, theme: { cardClass: 'shaman' } },
	linzi_redgrin: { name: 'Linzi Redgrin', health: 10, hsId: 'DALA_BOSS_19h', power: { name: 'Lil Eviscerate', cost: 2, text: 'Deal 2 damage.', effects: [{ type: 'damage', value: 2, target: 'any' }] }, theme: { cardClass: 'rogue', maxCost: 4 } },
	vas_no: { name: "Vas'no", health: 30, hsId: 'DALA_BOSS_20h', power: { name: 'Stormswell', cost: 2, text: 'Cast a random spell (targets chosen randomly).', effects: [{ type: 'cast-random-spell', count: 1 }] }, theme: { cardClass: 'shaman' } },
	whirt_the_all_knowing: { name: 'Whirt the All-Knowing', health: 30, hsId: 'DALA_BOSS_21h', power: { name: 'Prediction', cost: 1, text: 'Put a random Secret into the battlefield.', effects: [{ type: 'install-random-secrets', count: 1 }] }, theme: { cardClass: 'mage' } },
	bookmaster_bae_chao: { name: 'Bookmaster Bae Chao', health: 30, hsId: 'DALA_BOSS_22h', power: { name: 'Shhh!', cost: 3, text: 'Silence all enemy minions.', effects: [{ type: 'silence', target: 'enemy-creatures' }] }, theme: { cardClass: 'priest' } },
	sharky_mcfin: { name: 'Sharky McFin', health: 30, hsId: 'DALA_BOSS_23h', power: { name: 'Sharkbite', cost: 3, text: 'Destroy a random enemy minion.', effects: [{ type: 'destroy-random' }] }, theme: { tribe: 'Murloc' } },
	ranger_ar_ha: { name: "Ranger Ar'ha", health: 30, hsId: 'DALA_BOSS_24h', power: { name: "Ar'ha's Call", cost: 2, text: 'Give a random friendly minion +2/+2.', effects: [{ type: 'buff-random-friendly', attack: 2, health: 2 }] }, theme: { cardClass: 'hunter' } },
	jepetto_joybuzz: { name: 'Jepetto Joybuzz', health: 30, hsId: 'DALA_BOSS_25h', power: { name: 'Assembly', cost: 2, text: 'Summon a 1/1 copy of a random minion in your hand.', effects: [{ type: 'summon-hand-copy', attack: 1, health: 1 }] }, theme: { cardClass: 'neutral' } },
	dalaran_fountain_golem: { name: 'Dalaran Fountain Golem', health: 30, hsId: 'DALA_BOSS_26h', power: { name: 'Cold Water', cost: 1, text: 'Freeze an enemy minion.', effects: [{ type: 'freeze', target: 'enemy-creature' }] }, theme: { tribe: 'Elemental' } },
	rasil_fireborne: { name: 'Rasil Fireborne', health: 30, hsId: 'DALA_BOSS_27h', power: { name: 'Masterpiece!', cost: 3, text: 'Summon a random minion that costs (5).', effects: [{ type: 'summon-random', cost: 5 }] }, theme: { tribe: 'Elemental' } },
	xur_ios: { name: "Xur'ios", health: 30, hsId: 'DALA_BOSS_28h', power: { name: 'Scroll Savvy', cost: 1, text: 'Draw a card. A random card in your hand costs (2) less.', effects: [{ type: 'draw', value: 1 }, { type: 'reduce-random-hand-cost', value: 2 }] }, theme: { cardClass: 'mage' } },
	mama_diggs: { name: 'Mama Diggs', health: 40, hsId: 'DALA_BOSS_29h', power: { name: 'Excavate', cost: 1, text: 'Excavate a treasure.', effects: [{ type: 'excavate' }] }, theme: { tribe: 'Elemental' } },
	the_rat_king: { name: 'The Rat King', health: 10, hsId: 'DALA_BOSS_30h', power: { name: 'A Tale of Kings', cost: 3, text: 'Summon a 2/2 Underbelly Rat.', effects: [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Underbelly Rat', tribe: 'Beast' }] }, theme: { tribe: 'Beast', maxCost: 4 } },
	timothy_jones: { name: 'Timothy Jones', health: 30, hsId: 'DALA_BOSS_31h', power: { name: 'Bling it On!', cost: 2, text: 'Give a random friendly minion +2/+2.', effects: [{ type: 'buff-random-friendly', attack: 2, health: 2 }] }, theme: { cardClass: 'paladin' } },
	kizi_copperclip: { name: 'Kizi Copperclip', health: 10, hsId: 'DALA_BOSS_32h', power: { name: 'Makeover', cost: 1, text: 'Give a random friendly minion +1/+1.', effects: [{ type: 'buff-random-friendly', attack: 1, health: 1 }] }, theme: { cardClass: 'neutral', maxCost: 3 } },
	gold_elemental: { name: 'Gold Elemental', health: 40, hsId: 'DALA_BOSS_33h', power: { name: 'Made of Coins', cost: 0, text: 'Get a Coin.', effects: [{ type: 'gain-coin' }] }, theme: { tribe: 'Elemental' } },
	carousel_gryphon: { name: 'Carousel Gryphon', health: 30, hsId: 'DALA_BOSS_34h', power: { name: 'Merry Go Round', cost: 2, text: 'Give your minions +1/+1.', effects: [{ type: 'buff', attack: 1, health: 1, target: 'friendly-creatures' }] }, theme: { tribe: 'Mech' } },
	soothsayer_zoie: { name: 'Soothsayer Zoie', health: 30, hsId: 'DALA_BOSS_35h', power: { name: 'Healing Hands', cost: 1, text: 'Restore 3 Health to your hero.', effects: [{ type: 'heal', value: 3, target: 'self' }] }, theme: { cardClass: 'priest' } },
	draemus: { name: 'Draemus', health: 30, hsId: 'DALA_BOSS_36h', power: { name: 'Import Pet', cost: 2, text: 'Summon a random Beast that costs (3).', effects: [{ type: 'summon-random', tribe: 'Beast', cost: 3 }] }, theme: { tribe: 'Beast' } },
	ol_toomba: { name: "Ol' Toomba", health: 30, hsId: 'DALA_BOSS_37h', power: { name: 'Tales of Fortune', cost: 2, text: 'Shuffle a random treasure into your deck.', effects: [{ type: 'shuffle-random-treasures', count: 1 }] }, theme: { cardClass: 'neutral' } },
	tipsi_wobblerune: { name: 'Tipsi Wobblerune', health: 30, hsId: 'DALA_BOSS_38h', power: { name: 'Portal Party', cost: 2, text: 'Add a random spell to your hand.', effects: [{ type: 'conjure-random', cardType: 'sorcery', count: 1 }] }, theme: { cardClass: 'mage' } },
	aki_the_brilliant: { name: 'Aki the Brilliant', health: 30, hsId: 'DALA_BOSS_39h', power: { name: 'For The Light!', cost: 2, text: 'Give all minions in your hand +1/+1.', effects: [{ type: 'buff-hand', all: true, attack: 1, health: 1 }] }, theme: { cardClass: 'paladin' } },
	oxana_demonslay: { name: 'Oxana Demonslay', health: 30, hsId: 'DALA_BOSS_40h', power: { name: 'Immolation Aura', cost: 2, text: 'Deal 2 damage to a random enemy minion.', effects: [{ type: 'random-damage', value: 2, count: 1, pool: 'enemy-creatures' }] }, theme: { cardClass: 'demon_hunter' } },
	ungan_oddkind: { name: 'Ungan Oddkind', health: 30, hsId: 'DALA_BOSS_41h', power: { name: 'Summon Companion', cost: 4, text: 'Summon a random Animal Companion.', effects: [{ type: 'summon', count: 1, options: [{ summonId: 'huffer' }, { summonId: 'leokk' }, { summonId: 'misha' }] }] }, theme: { cardClass: 'hunter' } },
	p_o_g_o: { name: 'P.O.G.O.', health: 30, hsId: 'DALA_BOSS_42h', power: { name: 'Pogoshuffle', cost: 2, text: 'Shuffle 3 copies of a friendly minion into your deck.', effects: [{ type: 'shuffle-copies-of-target', count: 3, target: 'friendly-creature' }] }, theme: { tribe: 'Mech' } },
	magistrix_norroa: { name: 'Magistrix Norroa', health: 30, hsId: 'DALA_BOSS_43h', power: { name: 'Kaironomaly', cost: 0, text: 'Gain 1 Mana this turn only.', effects: [{ type: 'gain-mana', value: 1 }] }, theme: { cardClass: 'mage' } },
	erekem: { name: 'Erekem', health: 30, hsId: 'DALA_BOSS_44h', power: { name: 'Dark Tidings', cost: 1, text: 'Draw a minion.', effects: [{ type: 'tutor', cardType: 'creature', count: 1 }] }, theme: { cardClass: 'shaman' } },
	moragg: { name: 'Moragg', health: 30, hsId: 'DALA_BOSS_45h', power: { name: 'Ray of Suffering', cost: 2, text: 'Deal 2 damage to the enemy hero.', effects: [{ type: 'damage', value: 2, target: 'enemy-hero' }] }, theme: { tribe: 'Demon' } },
	ichoron: { name: 'Ichoron', health: 30, hsId: 'DALA_BOSS_46h', power: { name: 'Protective Bubble', cost: 1, text: 'Give a random friendly minion Divine Shield.', effects: [{ type: 'buff-random-friendly', attack: 0, health: 0, grant: 'divine_shield' }] }, theme: { tribe: 'Elemental' } },
	lavanthor: { name: 'Lavanthor', health: 30, hsId: 'DALA_BOSS_47h', power: { name: 'Lava Belch', cost: 1, text: 'Summon a 0/3 Molten Rock with Taunt.', effects: [{ type: 'summon', count: 1, attack: 0, health: 3, name: 'Molten Rock', tribe: 'Elemental', keywords: ['taunt'] }] }, theme: { tribe: 'Elemental' } },
	zuramat: { name: 'Zuramat the Obliterator', health: 30, hsId: 'DALA_BOSS_48h', power: { name: 'To The Void', cost: 2, text: 'Banish an enemy minion.', effects: [{ type: 'exile', target: 'enemy-creature' }] }, theme: { tribe: 'Demon' } },
	cyanigosa: { name: 'Cyanigosa', health: 40, hsId: 'DALA_BOSS_49h', power: { name: 'Uncontrollable Energy', cost: 2, text: 'Deal 2 damage to all enemy minions.', effects: [{ type: 'damage', value: 2, target: 'enemy-creatures' }] }, theme: { tribe: 'Dragon' } },
	nozari: { name: 'Nozari', health: 30, hsId: 'DALA_BOSS_50h', power: { name: 'Sand Breath', cost: 2, text: 'Deal 2 damage to a random enemy.', effects: [{ type: 'random-damage', value: 2, count: 1, pool: 'enemies' }] }, theme: { tribe: 'Dragon' } },
	millificent_manastorm: { name: 'Millificent Manastorm', health: 30, hsId: 'DALA_BOSS_51h', power: { name: 'Tinker', cost: 2, text: 'Summon a 0/4 Squirrel Bomb with Taunt.', effects: [{ type: 'summon', count: 1, attack: 0, health: 4, name: 'Squirrel Bomb', tribe: 'Mech', keywords: ['taunt'] }] }, theme: { tribe: 'Mech' } },
	lieutenant_sinclari: { name: 'Lieutenant Sinclari', health: 30, hsId: 'DALA_BOSS_52h', power: { name: 'Hold the Gates!', cost: 2, text: 'Give a minion +2 Health and Taunt.', effects: [{ type: 'buff', attack: 0, health: 2, target: 'friendly-creature' }, { type: 'grant', keyword: 'taunt', target: 'friendly-creature' }] }, theme: { cardClass: 'paladin' } },
	dancin_deryl: { name: "Dancin' Deryl", health: 30, hsId: 'DALA_BOSS_53h', power: { name: 'Boogie Woogie', cost: 2, text: 'Give a random friendly minion +2/+2.', effects: [{ type: 'buff-random-friendly', attack: 2, health: 2 }] }, theme: { cardClass: 'neutral' } },
	locksmith_zibb: { name: 'Locksmith Zibb', health: 30, hsId: 'DALA_BOSS_54h', power: { name: 'Spell Lock', cost: 2, text: "Overload one of your opponent's Mana Crystals.", effects: [{ type: 'add-overload', value: 1, forEnemy: true }] }, theme: { cardClass: 'shaman' } },
	captain_hannigan: { name: 'Captain Hannigan', health: 30, hsId: 'DALA_BOSS_55h', power: { name: 'Raise the Alarm', cost: 2, text: 'Summon a 1/4 Kirin Tor Guard with Taunt.', effects: [{ type: 'summon', count: 1, attack: 1, health: 4, name: 'Kirin Tor Guard', keywords: ['taunt'] }] }, theme: { cardClass: 'paladin' } },
	queen_wagtoggle: { name: 'Queen Wagtoggle', health: 30, hsId: 'DALA_BOSS_56h', power: { name: 'Bribery', cost: 3, text: "Steal a random card from your opponent's hand.", effects: [{ type: 'steal-random-hand-card' }] }, theme: { cardClass: 'neutral' } },
	trade_prince_gallywix: { name: 'Trade Prince Gallywix', health: 40, hsId: 'DALA_BOSS_57h', power: { name: 'Greed is Good', cost: 1, text: "Copy a random card in your opponent's hand and get a Coin.", effects: [{ type: 'copy-random-enemy-hand' }, { type: 'gain-coin' }] }, theme: { cardClass: 'rogue' } },
	boommaster_flark: { name: 'Boommaster Flark', health: 30, hsId: 'DALA_BOSS_58h', power: { name: 'Blast Powder', cost: 2, text: 'Deal 2 damage to a random enemy minion.', effects: [{ type: 'random-damage', value: 2, count: 1, pool: 'enemy-creatures' }] }, theme: { tribe: 'Mech' } },
	madam_goya: { name: 'Madam Goya', health: 40, hsId: 'DALA_BOSS_59h', power: { name: 'Blackmail', cost: 2, text: "Lock a random card in your opponent's hand.", effects: [{ type: 'lock-enemy-hand-card' }] }, theme: { cardClass: 'rogue' } },
	archmage_khadgar: { name: 'Archmage Khadgar', health: 40, hsId: 'DALA_BOSS_60h', power: { name: 'Summon Elemental', cost: 2, text: 'Summon a 2/3 Elemental.', effects: [{ type: 'summon', count: 1, attack: 2, health: 3, name: 'Servant of Khadgar', tribe: 'Elemental' }] }, theme: { cardClass: 'mage' } },
	sael_orn: { name: "Sael'orn", health: 30, hsId: 'DALA_BOSS_61h', power: { name: 'Web Grab', cost: 2, text: "Steal a random card from your opponent's hand.", effects: [{ type: 'steal-random-hand-card' }] }, theme: { tribe: 'Beast' } },
	haro_setting_sun: { name: 'Haro Setting-Sun', health: 30, hsId: 'DALA_BOSS_62h', power: { name: 'Darken', cost: 2, text: 'Give an enemy minion -2 Attack until your next turn.', effects: [{ type: 'debuff-until-your-next', value: 2, target: 'enemy-creature' }] }, theme: { cardClass: 'priest' } },
	dagg_cruelmight: { name: 'Dagg Cruelmight', health: 30, hsId: 'DALA_BOSS_63h', power: { name: 'Bully', cost: 2, text: 'Deal 2 damage to a damaged minion.', effects: [{ type: 'damage', value: 2, target: 'creature', requireDamaged: true }] }, theme: { cardClass: 'warrior' } },
	banker_biggs: { name: 'Banker Biggs', health: 40, hsId: 'DALA_BOSS_64h', power: { name: 'Invest!', cost: 2, text: 'Give a friendly minion +4/+4.', effects: [{ type: 'buff', attack: 4, health: 4, target: 'friendly-creature' }] }, theme: { cardClass: 'neutral' } },
	valdera_highborne: { name: 'Valdera Highborne', health: 30, hsId: 'DALA_BOSS_65h', power: { name: 'Impervious', cost: 2, text: 'Gain 3 Armor.', effects: [{ type: 'armor', value: 3 }] }, theme: { cardClass: 'mage' } },
	marei_loom: { name: 'Marei Loom', health: 10, hsId: 'DALA_BOSS_66h', power: { name: 'Next...', cost: 1, text: "Copy a random card in your opponent's hand.", effects: [{ type: 'copy-random-enemy-hand' }] }, theme: { cardClass: 'neutral', maxCost: 4 } },
	archmage_vargoth: { name: 'Archmage Vargoth', health: 30, hsId: 'DALA_BOSS_67h', power: { name: 'Arcane Runes', cost: 1, text: 'Add a random spell to your hand.', effects: [{ type: 'conjure-random', cardType: 'sorcery', count: 1 }] }, theme: { cardClass: 'mage' } },
	lilayell_suntear: { name: 'Lilayell Suntear', health: 30, hsId: 'DALA_BOSS_68h', power: { name: 'Mini Portal', cost: 1, text: 'Summon a random 1-Cost minion.', effects: [{ type: 'summon-random', cost: 1 }] }, theme: { cardClass: 'mage' } },
	archmage_kalec: { name: 'Archmage Kalec', health: 30, hsId: 'DALA_BOSS_69h', power: { name: 'Dragonwrath', cost: 2, text: 'Deal 2 damage.', effects: [{ type: 'damage', value: 2, target: 'any' }] }, theme: { tribe: 'Dragon' } },
	sky_captain_smiggs: { name: 'Sky Captain Smiggs', health: 30, hsId: 'DALA_BOSS_70h', power: { name: 'Bombardment', cost: 3, text: 'Deal 2 damage to all enemy minions.', effects: [{ type: 'damage', value: 2, target: 'enemy-creatures' }] }, theme: { tribe: 'Pirate' } },
	anarii_duskgrove: { name: 'Anarii Duskgrove', health: 30, hsId: 'DALA_BOSS_71h', power: { name: 'Summon Protectors', cost: 2, text: 'Summon a 2/2 Treant with Taunt.', effects: [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Treant', keywords: ['taunt'] }] }, theme: { cardClass: 'druid' } },
	kazamon_steelskin: { name: 'Kazamon Steelskin', health: 30, hsId: 'DALA_BOSS_72h', power: { name: 'Steelskin', cost: 2, text: 'Gain 4 Armor.', effects: [{ type: 'armor', value: 4 }] }, theme: { cardClass: 'warrior' } },
	hesutu_stonewind: { name: 'Hesutu Stonewind', health: 30, hsId: 'DALA_BOSS_73h', power: { name: "Earthmother's Rage", cost: 2, text: 'Give a friendly minion Windfury.', effects: [{ type: 'grant', keyword: 'windfury', target: 'friendly-creature' }] }, theme: { cardClass: 'shaman' } },
	kara_stamper: { name: 'Kara Stamper', health: 30, hsId: 'DALA_BOSS_74h', power: { name: 'Soul Weave', cost: 3, text: 'Discard a card. Summon a random minion that costs (3).', effects: [{ type: 'discard-random', count: 1 }, { type: 'summon-random', cost: 3 }] }, theme: { cardClass: 'warlock' } },
	commander_bolan: { name: 'Commander Bolan', health: 30, hsId: 'DALA_BOSS_75h', power: { name: 'For the Kirin Tor!', cost: 2, text: 'Summon a 1/4 Kirin Tor Guard with Taunt.', effects: [{ type: 'summon', count: 1, attack: 1, health: 4, name: 'Kirin Tor Guard', keywords: ['taunt'] }] }, theme: { cardClass: 'paladin' } },
};

// deterministic themed boss deck: 2 copies each of the 15 cheapest theme
// matches (falls back to cheap neutrals when a theme runs thin)
export function buildBossDeck(cardsById, theme = {}, size = 30) {
	const ok = d => d.type === 'creature' && !d.token && d.collectible !== false
		&& !d.companion && !d.commander && !(d.colors && d.colors.length)
		&& (d.cost || 0) <= (theme.maxCost || 7)
		&& (!theme.tribe || (d.tribe || '').includes(theme.tribe))
		&& (!theme.cardClass || (d.cardClass || 'neutral') === theme.cardClass);
	let pool = Object.values(cardsById).filter(ok);
	pool.sort((a, b) => (a.cost || 0) - (b.cost || 0) || a.id.localeCompare(b.id));
	pool = pool.slice(0, Math.ceil(size / 2));
	if (pool.length < size / 2) {
		const pad = Object.values(cardsById)
			.filter(d => d.type === 'creature' && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length) && (d.cost || 0) <= 4 && (d.cardClass || 'neutral') === 'neutral')
			.sort((a, b) => (a.cost || 0) - (b.cost || 0) || a.id.localeCompare(b.id));
		for (const d of pad) { if (pool.length >= size / 2) break; if (!pool.includes(d)) pool.push(d); }
	}
	const deck = [];
	for (const d of pool) deck.push(d.id, d.id);
	return deck.slice(0, size);
}
