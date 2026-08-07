// Tombs of Terror run data: the 16 passive treasures. Explorers, chapters,
// and run logic land in later phases. Card-shaped data (active treasures,
// Explorer hero powers) lives in cards.json under set TOMBS_OF_TERROR.
import * as E from './engine.js';

const emblem = (state, pi, id, name, text, extra) => {
	const em = E.instantiate({ id, name, type: 'emblem', cost: 0, rarity: 'basic', description: text, ...extra }, pi);
	em.zone = 'emblem';
	state.players[pi].emblems.push(em);
	E.recomputeAuras(state);
};

// Passive treasures: picked at run start, applied once per fight. Most set a
// player flag that engine hooks read (playCard / spell / draw / turn-end /
// damageHero / discover); a few boot straight into an emblem aura.
export const PASSIVES = {
	mummy_magic: {
		name: 'Mummy Magic', text: 'After you play your first Deathrattle creature each turn, give it Reborn.',
		apply: (state, pi) => { state.players[pi].mummyMagic = true; },
	},
	crook_and_flail: {
		name: 'Crook and Flail', text: 'After you cast a spell, put a creature from your deck onto the battlefield.',
		apply: (state, pi) => { state.players[pi].crookAndFlail = true; },
	},
	unlocked_potential: {
		name: 'Unlocked Potential', text: 'Your creatures have Attack equal to their Health.',
		apply: (state, pi) => { state.players[pi].deckInnerFire = true; },
	},
	vip_membership: {
		name: 'VIP Membership', text: 'Taverns you visit are upgraded!',
		apply: (state, pi) => { state.players[pi].vipMembership = true; },
	},
	disks_of_legend: {
		name: 'Disks of Legend', text: 'After you play a Legendary creature, summon a copy of it.',
		apply: (state, pi) => { state.players[pi].disksOfLegend = true; },
	},
	darklight_torch: {
		name: 'Darklight Torch', text: 'After you play an even-Cost card, refresh your Hero Power. It costs (0) this turn.',
		apply: (state, pi) => { state.players[pi].darklightTorch = true; },
	},
	primordial_bulwark: {
		name: 'Primordial Bulwark', text: 'Block lethal damage & deal 20 damage to target opponent. (once per game)',
		apply: (state, pi) => { state.players[pi].primordialBulwark = true; },
	},
	band_of_bees: {
		name: 'Band of Bees', text: 'Your creatures that cost (2) or less have Poisonous.',
		apply: (state, pi) => emblem(state, pi, 'tomb_band_of_bees', 'Band of Bees', 'Your cheap creatures have Poisonous.', { aura: { keywords: ['poisonous'], maxCost: 2 } }),
	},
	band_of_scarabs: {
		name: 'Band of Scarabs', text: 'Enemy creatures have -1 Attack.',
		apply: (state, pi) => emblem(state, pi, 'tomb_band_of_scarabs', 'Band of Scarabs', 'Enemy creatures have -1 Attack.', { aura: { global: true, scope: 'enemies', attack: -1 } }),
	},
	disks_of_swiftness: {
		name: 'Disks of Swiftness', text: 'Your opponent must pass their first 2 turns.',
		apply: (state, pi) => { for (const o of E.opponentsOf(state, pi)) state.players[o].skipTurns = (state.players[o].skipTurns || 0) + 2; },
	},
	alchemists_stone: {
		name: "Alchemist's Stone", text: 'After you play an odd-Cost card, reduce the Cost of cards in your hand by (1).',
		apply: (state, pi) => { state.players[pi].alchemistStone = true; },
	},
	ever_changing_elixir: {
		name: 'Ever-Changing Elixir', text: 'At the end of your turn, transform a friendly creature into one that costs (1) more.',
		apply: (state, pi) => { state.players[pi].everChangingElixir = true; },
	},
	scroll_of_nonsense: {
		name: 'Scroll of Nonsense', text: 'Spell Damage +10. At the end of your turn, this loses 1 Spell Damage.',
		apply: (state, pi) => emblem(state, pi, 'tomb_scroll_of_nonsense', 'Scroll of Nonsense', 'Spell Damage that decays each turn.', { static: { type: 'spell-damage', value: 10 }, scrollDecay: true }),
	},
	lucky_spade: {
		name: 'Lucky Spade', text: 'After you Discover a card, add 2 copies of it to your hand. They cost (2) less.',
		apply: (state, pi) => { state.players[pi].luckySpade = true; },
	},
	titanic_ring: {
		name: 'Titanic Ring', text: 'Your creatures have +1 Health and Taunt.',
		apply: (state, pi) => emblem(state, pi, 'tomb_titanic_ring', 'Titanic Ring', 'Your creatures have +1 Health and Taunt.', { aura: { health: 1, keywords: ['taunt'] } }),
	},
	robes_of_diminishing: {
		name: 'Robes of Diminishing', text: 'After you draw a spell, reduce its Cost to (0) this turn.',
		apply: (state, pi) => { state.players[pi].robesOfDiminishing = true; },
	},
};

export function applyPassive(state, pi, id) {
	const p = PASSIVES[id];
	if (!p) return false;
	p.apply(state, pi);
	E.emit(state, { type: 'tombsPassive', player: pi, id, name: p.name });
	return true;
}

// ---------- Explorers ----------
// The four League of Explorers, one per class (HS dual-class primary shown).
// Their hero-power options are the class default plus their 3 dala_-style
// alternates in cards.json (ulda_<power>).
export const EXPLORERS = [
	{ id: 'reno', name: 'Reno Jackson', heroClass: 'mage', flavor: 'A treasure hunter who never met a jam he could not escape.' },
	{ id: 'elise', name: 'Elise Starseeker', heroClass: 'druid', flavor: 'She reads the stars, and the stars say: loot.' },
	{ id: 'brann', name: 'Brann Bronzebeard', heroClass: 'hunter', flavor: 'The elder Bronzebeard, and the reckless one.' },
	{ id: 'finley', name: 'Sir Finley', heroClass: 'paladin', flavor: 'A murloc gentleman-explorer of impeccable manners.' },
];

// the alternate hero powers for an Explorer (from cards.json), by class
export const EXPLORER_POWERS = {
	mage: ['ulda_amateur_mage', 'ulda_relicologist', 'ulda_arcane_craftiness'],
	druid: ['ulda_elises_might', 'ulda_druidic_teaching', 'ulda_starseeker'],
	paladin: ['ulda_new_recruits', 'ulda_bubble_blower', 'ulda_power_up'],
	hunter: ['ulda_spread_shot', 'ulda_well_equipped', 'ulda_dino_tracking'],
};

// ---------- the four chapters, each ending in a Plague Lord ----------
export const CHAPTERS = [
	{ id: 'lost_city', name: 'The Lost City', final: 'vesh',
		pool: ['waste_wanderer_cardish', 'dark_ritualist_zafarr', 'vera_ridley', 'nash_the_greatworm', 'glack_the_scorpid', 'mister_chu', 'squeamlish', 'sinkhole'] },
	{ id: 'khartuts_tomb', name: "Khartut's Tomb", final: 'xatma',
		pool: ['demolisher_3v11', 'terraviss', 'robold', 'pyramad', 'snakeflinger_scalesnout', 'sword_dancer_sirinell', 'lt_herring', 'battrund'] },
	{ id: 'halls_of_origination', name: 'Halls of Origination', final: 'kzrath',
		pool: ['ichabod_the_cursed', 'twizzleflux', 'sothis', 'kham', 'illidara_sunsdawn', 'colossus_of_the_sun', 'skarik', 'suspicious_palm_tree'] },
	{ id: 'the_inner_sanctum', name: 'The Inner Sanctum', final: 'icarax',
		pool: ['beetle_herder_zenda', 'thudd_lockspring', 'ol_toomba', 'sazin', 'ozara', 'ermavar', 'pillager_drasar', 'edra'] },
];

// ---------- bosses ----------
// Regular bosses are 10-HP pushovers scaled up for the run; the four Plague
// Lords are the elite chapter finals. Powers translated onto existing engine
// effects (dungeon.js/heist.js policy). `theme` drives buildBossDeck.
export const BOSSES = {
	waste_wanderer_cardish: { name: 'Waste Wanderer Cardish', health: 20, hsId: 'ULDA_BOSS_01h', power: { name: 'Boom Bullets', cost: 2, text: 'Summon a 0/2 Goblin Bomb with Taunt.', effects: [{ type: 'summon', count: 1, attack: 0, health: 2, name: 'Goblin Bomb', tribe: 'Mech', keywords: ['taunt'] }] }, theme: { tribe: 'Mech' } },
	dark_ritualist_zafarr: { name: 'Dark Ritualist Zafarr', health: 20, hsId: 'ULDA_BOSS_02h', power: { name: 'Mummy Ritual', cost: 3, text: 'Resurrect a dead friendly creature with Reborn.', effects: [{ type: 'resurrect-highest-died', count: 1, grant: 'reborn' }] }, theme: { cardClass: 'warlock' } },
	vera_ridley: { name: 'Vera Ridley', health: 20, hsId: 'ULDA_BOSS_03h', power: { name: 'E.V.I.L. Promotion', cost: 2, text: 'Give a random friendly creature +1/+1.', effects: [{ type: 'buff-random-friendly', attack: 1, health: 1 }] }, theme: { cardClass: 'rogue' } },
	nash_the_greatworm: { name: 'Nash the Greatworm', health: 20, hsId: 'ULDA_BOSS_04h', power: { name: 'Belch', cost: 3, text: 'Summon a creature that died this game.', effects: [{ type: 'resurrect-highest-died', count: 1 }] }, theme: { tribe: 'Beast' } },
	glack_the_scorpid: { name: 'Glack the Scorpid', health: 20, hsId: 'ULDA_BOSS_05h', power: { name: 'Venomous Stinger', cost: 2, text: 'Deal 1 damage to a creature.', effects: [{ type: 'damage', value: 1, target: 'creature' }] }, theme: { tribe: 'Beast' } },
	mister_chu: { name: 'Mister Chu', health: 20, hsId: 'ULDA_BOSS_06h', power: { name: '"Confiscated" Goods', cost: 2, text: 'Give a random friendly creature +2/+1.', effects: [{ type: 'buff-random-friendly', attack: 2, health: 1 }] }, theme: { cardClass: 'warrior' } },
	squeamlish: { name: 'Squeamlish', health: 20, hsId: 'ULDA_BOSS_07h', power: { name: 'Druid of the Rat', cost: 2, text: 'Give your creatures +1/+1.', effects: [{ type: 'buff', attack: 1, health: 1, target: 'friendly-creatures' }] }, theme: { cardClass: 'druid' } },
	sinkhole: { name: 'Sinkhole', health: 20, hsId: 'ULDA_BOSS_08h', power: { name: 'Sand Surge', cost: 1, text: "Shuffle a Sand Trap into your opponent's deck.", effects: [{ type: 'shuffle-ids-into-deck', ids: ['ulda_sand_trap'], forEnemy: true }] }, theme: { tribe: 'Elemental' } },
	demolisher_3v11: { name: 'Demolisher 3V-11', health: 20, hsId: 'ULDA_BOSS_09h', power: { name: 'Armor Repairs', cost: 2, text: 'Gain 2 Armor.', effects: [{ type: 'armor', value: 2 }] }, theme: { tribe: 'Mech' } },
	terraviss: { name: 'Terraviss', health: 20, hsId: 'ULDA_BOSS_10h', power: { name: 'Well Equipped', cost: 2, text: 'Add a random spell to your hand.', effects: [{ type: 'conjure-random', cardType: 'sorcery', count: 1 }] }, theme: { cardClass: 'rogue' } },
	robold: { name: 'R.O.B.O.L.D.', health: 20, hsId: 'ULDA_BOSS_11h', power: { name: 'Unstable Weaponry', cost: 2, text: 'Deal 2 damage to a random enemy creature.', effects: [{ type: 'random-damage', value: 2, count: 1, pool: 'enemy-creatures' }] }, theme: { tribe: 'Mech' } },
	pyramad: { name: 'Pyramad', health: 20, hsId: 'ULDA_BOSS_12h', power: { name: 'Brick by Brick', cost: 3, text: 'Summon a random Elemental that costs (3).', effects: [{ type: 'summon-random', tribe: 'Elemental', cost: 3 }] }, theme: { tribe: 'Elemental' } },
	snakeflinger_scalesnout: { name: 'Snakeflinger Scalesnout', health: 20, hsId: 'ULDA_BOSS_13h', power: { name: 'Snakeshot', cost: 2, text: 'Summon a 1/1 Snake with Poisonous.', effects: [{ type: 'summon', count: 1, attack: 1, health: 1, name: 'Snake', tribe: 'Beast', keywords: ['poisonous'] }] }, theme: { tribe: 'Beast' } },
	sword_dancer_sirinell: { name: 'Sword Dancer Sirinell', health: 20, hsId: 'ULDA_BOSS_14h', power: { name: 'Sword Dance', cost: 2, text: 'Equip a random weapon.', effects: [{ type: 'equip-random' }] }, theme: { cardClass: 'warrior' } },
	lt_herring: { name: 'Lt. Herring', health: 20, hsId: 'ULDA_BOSS_15h', power: { name: 'Puffertrooper', cost: 2, text: 'Give your creatures Rush.', effects: [{ type: 'grant', keyword: 'rush', target: 'friendly-creatures' }] }, theme: { tribe: 'Murloc' } },
	battrund: { name: 'Battrund', health: 20, hsId: 'ULDA_BOSS_16h', power: { name: 'Under Wraps', cost: 2, text: 'Give a random friendly creature Reborn.', effects: [{ type: 'buff-random-friendly', attack: 0, health: 0, grant: 'reborn' }] }, theme: { cardClass: 'neutral' } },
	ichabod_the_cursed: { name: 'Ichabod the Cursed', health: 20, hsId: 'ULDA_BOSS_17h', power: { name: 'Spreading the Curse', cost: 2, text: 'Summon a 1/1 Leper Gnome with Rush.', effects: [{ type: 'summon', count: 1, attack: 1, health: 1, name: 'Leper Gnome', keywords: ['rush', 'deathrattle'], deathrattle: [{ type: 'damage', value: 2, target: 'enemy-hero' }] }] }, theme: { cardClass: 'warlock' } },
	twizzleflux: { name: 'Twizzleflux the Sanguine', health: 20, hsId: 'ULDA_BOSS_18h', power: { name: 'Plagued Horde', cost: 2, text: 'Give a random friendly creature +1/+1.', effects: [{ type: 'buff-random-friendly', attack: 1, health: 1 }] }, theme: { cardClass: 'mage' } },
	sothis: { name: 'Sothis', health: 20, hsId: 'ULDA_BOSS_19h', power: { name: 'Titan Ritual', cost: 2, text: 'Summon two 1/1 Mogu Cultists.', effects: [{ type: 'summon', count: 2, attack: 1, health: 1, name: 'Mogu Cultist' }] }, theme: { cardClass: 'neutral' } },
	kham: { name: 'Kham', health: 20, hsId: 'ULDA_BOSS_20h', power: { name: 'Spectral Swordsman', cost: 2, text: 'Give a random friendly creature Stealth.', effects: [{ type: 'buff-random-friendly', attack: 0, health: 0, grant: 'stealth' }] }, theme: { cardClass: 'rogue' } },
	illidara_sunsdawn: { name: 'Illidara Sunsdawn', health: 20, hsId: 'ULDA_BOSS_21h', power: { name: 'Staking A Claim', cost: 2, text: 'Add a random spell to your hand.', effects: [{ type: 'conjure-random', cardType: 'sorcery', count: 1 }] }, theme: { cardClass: 'demon_hunter' } },
	colossus_of_the_sun: { name: 'Colossus of the Sun', health: 30, hsId: 'ULDA_BOSS_22h', power: { name: 'Power of Wrath', cost: 2, text: 'Deal 1 damage to all enemy creatures.', effects: [{ type: 'damage', value: 1, target: 'enemy-creatures' }] }, theme: { tribe: 'Elemental' } },
	skarik: { name: 'Skarik', health: 20, hsId: 'ULDA_BOSS_23h', power: { name: 'Hatching Time', cost: 2, text: 'Summon a random Beast that costs (2).', effects: [{ type: 'summon-random', tribe: 'Beast', cost: 2 }] }, theme: { tribe: 'Beast' } },
	suspicious_palm_tree: { name: 'Suspicious Palm Tree', health: 20, hsId: 'ULDA_BOSS_24h', power: { name: 'Corrupted Oasis', cost: 2, text: 'Summon two 2/2 Treants.', effects: [{ type: 'summon', count: 2, attack: 2, health: 2, name: 'Treant' }] }, theme: { cardClass: 'druid' } },
	beetle_herder_zenda: { name: 'Beetle Herder Zenda', health: 20, hsId: 'ULDA_BOSS_25h', power: { name: 'Beetle Stampede', cost: 2, text: 'Summon a 3/3 Plated Beetle with Taunt.', effects: [{ type: 'summon', count: 1, attack: 3, health: 3, name: 'Plated Beetle', tribe: 'Beast', keywords: ['taunt'] }] }, theme: { tribe: 'Beast' } },
	thudd_lockspring: { name: 'Thudd Lockspring', health: 20, hsId: 'ULDA_BOSS_26h', power: { name: 'Gatling Wand', cost: 2, text: 'Deal 2 damage split among enemy creatures.', effects: [{ type: 'random-damage', value: 1, count: 2, pool: 'enemy-creatures' }] }, theme: { tribe: 'Mech' } },
	ol_toomba: { name: "Ol' Toomba", health: 20, hsId: 'ULDA_BOSS_27h', power: { name: '"Retired" Treasure', cost: 2, text: "Copy a random card in your opponent's hand.", effects: [{ type: 'copy-random-enemy-hand' }] }, theme: { cardClass: 'neutral' } },
	sazin: { name: 'Sazin the Timesplitter', health: 20, hsId: 'ULDA_BOSS_28h', power: { name: 'Mighty Windstorm', cost: 2, text: 'Summon a random creature that costs (3).', effects: [{ type: 'summon-random', cost: 3 }] }, theme: { cardClass: 'mage' } },
	ozara: { name: 'Ozara', health: 20, hsId: 'ULDA_BOSS_29h', power: { name: 'Mother of Sand', cost: 2, text: "Overload one of your opponent's Mana Crystals.", effects: [{ type: 'add-overload', value: 1, forEnemy: true }] }, theme: { cardClass: 'shaman' } },
	ermavar: { name: 'Ermavar', health: 20, hsId: 'ULDA_BOSS_30h', power: { name: 'Fireshaper', cost: 2, text: 'Deal 2 damage.', effects: [{ type: 'damage', value: 2, target: 'any' }] }, theme: { cardClass: 'shaman' } },
	pillager_drasar: { name: 'Pillager Drasar', health: 20, hsId: 'ULDA_BOSS_31h', power: { name: 'Pillaged Relics', cost: 2, text: 'Give a friendly creature +1/+1 & Divine Shield.', effects: [{ type: 'buff', attack: 1, health: 1, target: 'friendly-creature' }, { type: 'grant', keyword: 'divine_shield', target: 'friendly-creature' }] }, theme: { cardClass: 'paladin' } },
	edra: { name: 'Edra', health: 20, hsId: 'ULDA_BOSS_32h', power: { name: 'Whispering Sentinels', cost: 1, text: 'Summon a 1/1 Wisp with Lifesteal.', effects: [{ type: 'summon', count: 1, attack: 1, health: 1, name: 'Wisp', keywords: ['lifesteal'] }] }, theme: { cardClass: 'priest' } },
	// ---- the four Plague Lords (chapter finals) ----
	vesh: { name: 'Vesh, Plague Lord of Murlocs', health: 60, hsId: 'ULDA_BOSS_39h', power: { name: 'Plague of Murlocs', cost: 2, text: 'Summon three 1/1 Murlocs.', effects: [{ type: 'summon', count: 3, attack: 1, health: 1, name: 'Murloc', tribe: 'Murloc' }] }, theme: { tribe: 'Murloc' }, plagueLord: true },
	xatma: { name: 'Xatma, Plague Lord of Death', health: 60, hsId: 'ULDA_BOSS_37h', power: { name: 'Plague of Death', cost: 3, text: 'Destroy a random enemy creature.', effects: [{ type: 'destroy-random' }] }, theme: { cardClass: 'priest' }, plagueLord: true },
	kzrath: { name: "K'zrath, Plague Lord of Madness", health: 60, hsId: 'ULDA_BOSS_38h', power: { name: 'Plague of Madness', cost: 2, text: 'Take control of a random enemy creature.', effects: [{ type: 'mind-control' }] }, theme: { cardClass: 'warlock' }, plagueLord: true },
	icarax: { name: 'Icarax, Plague Lord of Wrath', health: 60, hsId: 'ULDA_BOSS_40h', power: { name: 'Plague of Wrath', cost: 2, text: 'Give your creatures +2 Attack.', effects: [{ type: 'buff', attack: 2, health: 0, target: 'friendly-creatures' }] }, theme: { tribe: 'Demon' }, plagueLord: true },
};

// deterministic themed boss deck (2x the 15 cheapest theme matches, neutral
// padding) — identical policy to heist.js buildBossDeck.
export function buildBossDeck(cardsById, theme = {}, size = 30) {
	const maxCost = theme.maxCost || 7;
	const base = d => !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length) && (d.cost || 0) <= maxCost;
	const classOk = d => !theme.cardClass || (d.cardClass || 'neutral') === theme.cardClass;
	const tribeOk = d => !theme.tribe || (d.tribe || '').includes(theme.tribe);
	const byCost = (a, b) => (a.cost || 0) - (b.cost || 0) || a.id.localeCompare(b.id);
	const isSpell = d => d.type === 'sorcery' || d.type === 'instant' || d.type === 'secret' || d.type === 'trap';
	const all = Object.values(cardsById);
	const creatures = all.filter(d => d.type === 'creature' && base(d) && classOk(d) && tribeOk(d)).sort(byCost);
	// class-themed bosses run real class spells too; tribe-only / neutral bosses stay
	// minion-heavy (a spell can't carry a creature tribe, neutral has few spells)
	const spells = (theme.cardClass && theme.cardClass !== 'neutral')
		? all.filter(d => isSpell(d) && base(d) && classOk(d)).sort(byCost) : [];
	const distinct = Math.ceil(size / 2); // deck = 2 copies of each distinct card
	const nSpell = Math.min(spells.length, Math.round(distinct / 3)); // ~1/3 spells for class decks
	let pool = [...creatures.slice(0, distinct - nSpell), ...spells.slice(0, nSpell)];
	if (pool.length < distinct) {
		const pad = all.filter(d => d.type === 'creature' && base(d) && (d.cardClass || 'neutral') === 'neutral' && (d.cost || 0) <= 4).sort(byCost);
		for (const d of pad) { if (pool.length >= distinct) break; if (!pool.includes(d)) pool.push(d); }
	}
	const deck = [];
	for (const d of pool) deck.push(d.id, d.id);
	return deck.slice(0, size);
}
