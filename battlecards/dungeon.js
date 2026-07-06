// Dungeon Run data: class starting decks + the level-1 boss pool.
// Bosses are 10-health AI opponents with a fixed 10-card deck and a
// bespoke hero power (installed via the classPicks machinery).

export const STARTER_DECKS = {
	druid: ['enchanted_raven', 'power_of_the_wild', 'tortollan_forager', 'mounted_raptor', 'mulch',
		'shade_of_naxxramas', 'keeper_of_the_grove', 'savage_combatant', 'swipe', 'druid_of_the_claw'],
	hunter: ['hunter_s_mark', 'stonetusk_boar', 'dire_wolf_alpha', 'explosive_trap', 'animal_companion',
		'deadly_shot', 'eaglehorn_bow', 'jungle_panther', 'unleash_the_hounds', 'oasis_snapjaw'],
	mage: ['arcane_missiles', 'mana_wyrm', 'doomsayer', 'frostbolt', 'sorcerer_s_apprentice',
		'earthen_ring_farseer', 'ice_barrier', 'chillwind_yeti', 'fireball', 'blizzard'],
	paladin: ['blessing_of_might', 'goldshire_footman', 'noble_sacrifice', 'argent_protector', 'equality',
		'holy_light', 'earthen_ring_farseer', 'consecration', 'stormwind_knight', 'truesilver_champion'],
	priest: ['holy_smite', 'northshire_cleric', 'potion_of_madness', 'faerie_dragon', 'mind_blast',
		'shadow_word_pain', 'dark_cultist', 'auchenai_soulpriest', 'lightspawn', 'holy_nova'],
	rogue: ['backstab', 'deadly_poison', 'pit_snake', 'sinister_strike', 'gilblin_stalker',
		'undercity_huckster', 'si_7_agent', 'unearthed_raptor', 'assassinate', 'vanish'],
	shaman: ['air_elemental', 'lightning_bolt', 'flametongue_totem', 'murloc_tidehunter', 'stormforged_axe',
		'lightning_storm', 'unbound_elemental', 'defender_of_argus', 'hex', 'fire_elemental'],
	warlock: ['corruption', 'mortal_coil', 'voidwalker', 'knife_juggler', 'sunfury_protector',
		'drain_life', 'imp_master', 'dark_iron_dwarf', 'hellfire', 'doomguard'],
	warrior: ['warbot', 'amani_berserker', 'cruel_taskmaster', 'heroic_strike', 'bash',
		'fiery_war_axe', 'hired_gun', 'raging_worgen', 'dread_corsair', 'brawl'],
};

// level-1 encounter pool (exclusive to the run's first fight)
export const BOSSES = {
	bink_the_burglar: {
		name: 'Bink the Burglar',
		flavor: 'This low-down thief preys on starting adventurers.',
		health: 10,
		level: 1,
		power: {
			name: 'Coin', cost: 0, text: 'Gain 1 Mana this turn only.',
			effects: [{ type: 'gain-mana', value: 1 }],
		},
		deck: ['burgly_bully', 'cutpurse', 'one_eyed_cheat', 'undercity_huckster', 'southsea_deckhand',
			'swashburglar', 'tomb_pillager', 'undercity_valiant', 'burgle', 'fan_of_knives'],
	},
	giant_rat: {
		name: 'Giant Rat',
		flavor: 'The bane of every young adventurer.',
		health: 10,
		level: 1,
		power: {
			name: 'Rat Race', cost: 2, text: 'Summon two 1/1 Rats.',
			effects: [{ type: 'summon', count: 2, attack: 1, health: 1, name: 'Rat', tribe: 'Beast' }],
		},
		deck: ['core_hound', 'pint_sized_summoner', 'young_dragonhawk', 'ironbeak_owl', 'river_crocolisk',
			'starving_buzzard', 'stonetusk_boar', 'timber_wolf', 'bestial_wrath', 'explosive_shot'],
	},
	wee_whelp: {
		name: 'Wee Whelp',
		flavor: "It's just a baby dragon. But it's still a dragon.",
		health: 10,
		level: 1,
		power: {
			name: 'Baby Breath', cost: 2, text: 'Deal 2 damage.',
			effects: [{ type: 'damage', value: 2, target: 'any' }],
		},
		deck: ['dragon_s_breath', 'dragon_egg', 'stonetusk_boar', 'bloodfen_raptor', 'faerie_dragon',
			'raid_leader', 'chillwind_yeti', 'twilight_drake', 'azure_drake', 'volcanic_drake'],
	},
};

export function randomBoss(level = 1, rng = Math.random) {
	const pool = Object.keys(BOSSES).filter(id => BOSSES[id].level === level);
	return pool[Math.floor(rng() * pool.length)];
}
