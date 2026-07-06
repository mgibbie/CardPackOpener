// Dungeon Run data: class starting decks, the level 1-8 boss ladder
// (health/powers from the game data, decks from community records),
// and the run treasures. Run logic lives in game.js.

export const STARTER_DECKS = {
	druid: ["enchanted_raven", "power_of_the_wild", "tortollan_forager", "mounted_raptor", "mulch", "shade_of_naxxramas", "keeper_of_the_grove", "savage_combatant", "swipe", "druid_of_the_claw"],
	hunter: ["hunter_s_mark", "stonetusk_boar", "dire_wolf_alpha", "explosive_trap", "animal_companion", "deadly_shot", "eaglehorn_bow", "jungle_panther", "unleash_the_hounds", "oasis_snapjaw"],
	mage: ["arcane_missiles", "mana_wyrm", "doomsayer", "frostbolt", "sorcerer_s_apprentice", "earthen_ring_farseer", "ice_barrier", "chillwind_yeti", "fireball", "blizzard"],
	paladin: ["blessing_of_might", "goldshire_footman", "noble_sacrifice", "argent_protector", "equality", "holy_light", "earthen_ring_farseer", "consecration", "stormwind_knight", "truesilver_champion"],
	priest: ["holy_smite", "northshire_cleric", "potion_of_madness", "faerie_dragon", "mind_blast", "shadow_word_pain", "dark_cultist", "auchenai_soulpriest", "lightspawn", "holy_nova"],
	rogue: ["backstab", "deadly_poison", "pit_snake", "sinister_strike", "gilblin_stalker", "undercity_huckster", "si_7_agent", "unearthed_raptor", "assassinate", "vanish"],
	shaman: ["air_elemental", "lightning_bolt", "flametongue_totem", "murloc_tidehunter", "stormforged_axe", "lightning_storm", "unbound_elemental", "defender_of_argus", "hex", "fire_elemental"],
	warlock: ["corruption", "mortal_coil", "voidwalker", "knife_juggler", "sunfury_protector", "drain_life", "imp_master", "dark_iron_dwarf", "hellfire", "doomguard"],
	warrior: ["warbot", "amani_berserker", "cruel_taskmaster", "heroic_strike", "bash", "fiery_war_axe", "hired_gun", "raging_worgen", "dread_corsair", "brawl"],
};

export const BOSSES = {
	bink_the_burglar: {
		name: "Bink the Burglar", level: 1, health: 10,
		flavor: "This low-down thief preys on starting adventurers.",
		power: {"name": "Coin", "cost": 0, "text": "Gain 1 Mana this turn only.", "effects": [{"type": "gain-mana", "value": 1}]},
		deck: ["burgly_bully", "cutpurse", "one_eyed_cheat", "undercity_huckster", "southsea_deckhand", "swashburglar", "tomb_pillager", "undercity_valiant", "burgle", "fan_of_knives"],
	},
	giant_rat: {
		name: "Giant Rat", level: 1, health: 10,
		flavor: "The bane of every young adventurer.",
		power: {"name": "Rat Race", "cost": 2, "text": "Summon two 1/1 Rats.", "effects": [{"type": "summon", "count": 2, "attack": 1, "health": 1, "name": "Rat", "tribe": "Beast"}]},
		deck: ["core_hound", "pint_sized_summoner", "young_dragonhawk", "ironbeak_owl", "river_crocolisk", "starving_buzzard", "stonetusk_boar", "timber_wolf", "bestial_wrath", "explosive_shot"],
	},
	wee_whelp: {
		name: "Wee Whelp", level: 1, health: 10,
		flavor: "It's just a baby dragon. But it's still a dragon.",
		power: {"name": "Baby Breath", "cost": 2, "text": "Deal 2 damage.", "effects": [{"type": "damage", "value": 2, "target": "any"}]},
		deck: ["dragon_s_breath", "dragon_egg", "stonetusk_boar", "bloodfen_raptor", "faerie_dragon", "raid_leader", "chillwind_yeti", "twilight_drake", "azure_drake", "volcanic_drake"],
	},
	frostfur: {
		name: "Frostfur", level: 2, health: 20,
		flavor: "His icy heart has two settings: cold and colder.",
		power: {"name": "Freeze", "cost": 2, "text": "Freeze an enemy creature.", "effects": [{"type": "freeze", "target": "enemy-creature"}]},
		deck: ["raid_leader", "raid_leader", "river_crocolisk", "river_crocolisk", "sen_jin_shieldmasta", "sen_jin_shieldmasta", "bloodfen_raptor", "bloodfen_raptor", "murloc_raider", "murloc_raider", "nightblade", "nightblade", "novice_engineer", "novice_engineer", "oasis_snapjaw", "oasis_snapjaw", "ogre_magi", "ogre_magi", "wolfrider", "wolfrider", "arcane_intellect", "arcane_intellect", "fireball", "fireball", "arcane_explosion", "arcane_explosion", "arcane_missiles", "arcane_missiles", "polymorph", "polymorph"],
	},
	candlebeard: {
		name: "Candlebeard", level: 2, health: 20,
		flavor: "His crew would follow that wick anywhere.",
		power: {"name": "Charge!", "cost": 1, "text": "Give a friendly creature Charge.", "effects": [{"type": "grant", "keyword": "charge", "target": "friendly-creature"}]},
		deck: ["piloted_sky_golem", "piloted_sky_golem", "sea_giant", "sea_giant", "cutpurse", "cutpurse", "piloted_shredder", "piloted_shredder", "pit_snake", "pit_snake", "stoneskin_basilisk", "stoneskin_basilisk", "swashburglar", "swashburglar", "magma_rager", "magma_rager", "vanish", "piloted_sky_golem", "sea_giant", "cutpurse", "piloted_shredder", "pit_snake", "stoneskin_basilisk", "swashburglar", "magma_rager"],
	},
	graves_the_cleric: {
		name: "Graves the Cleric", level: 2, health: 20,
		flavor: "He tends the catacombs, and everything sleeping in them.",
		power: {"name": "Light's Will", "cost": 0, "text": "Restore 2 Health to all creatures.", "effects": [{"type": "heal", "value": 2, "target": "all-creatures"}]},
		deck: ["faceless_manipulator", "faceless_manipulator", "abomination", "abomination", "acidic_swamp_ooze", "acidic_swamp_ooze", "injured_blademaster", "injured_blademaster", "leper_gnome", "leper_gnome", "acolyte_of_pain", "acolyte_of_pain", "lightspawn", "lightspawn", "loot_hoarder", "loot_hoarder", "northshire_cleric", "northshire_cleric", "temple_enforcer", "temple_enforcer", "shadow_madness", "shadow_madness", "silence", "silence", "holy_nova", "power_word_shield", "power_word_shield", "mind_control", "shadow_word_pain", "shadow_word_pain"],
	},
	pathmaker_hamm: {
		name: "Pathmaker Hamm", level: 3, health: 20,
		flavor: "He makes paths the fast way: with bombs.",
		power: {"name": "Unstable Explosion", "cost": 1, "text": "Deal 1 damage to two random enemies.", "effects": [{"type": "random-damage", "value": 1, "pool": "enemies", "count": 2}]},
		deck: ["bomb_lobber", "bomb_lobber", "bomb_squad", "bomb_squad", "bomb_squad", "bomb_squad", "frothing_berserker", "frothing_berserker", "frothing_berserker", "frothing_berserker", "madder_bomber", "madder_bomber", "madder_bomber", "madder_bomber", "madder_bomber", "axe_flinger", "axe_flinger", "axe_flinger", "axe_flinger", "mad_bomber", "mad_bomber", "mad_bomber", "mad_bomber", "mad_bomber", "mad_bomber", "mad_bomber", "mad_bomber", "brawl", "brawl", "bomb_lobber"],
	},
	elder_brandlemar: {
		name: "Elder Brandlemar", level: 3, health: 20,
		flavor: "Old kobold magic runs deep beneath the mountain.",
		power: {"name": "Dampen Magic", "cost": 2, "text": "Put a Counterspell into the battlefield.", "effects": [{"type": "install-secret", "id": "counterspell"}]},
		deck: ["boulderfist_ogre", "boulderfist_ogre", "chillwind_yeti", "chillwind_yeti", "raid_leader", "raid_leader", "sen_jin_shieldmasta", "sen_jin_shieldmasta", "booty_bay_bodyguard", "booty_bay_bodyguard", "frostwolf_grunt", "frostwolf_grunt", "frostwolf_warlord", "frostwolf_warlord", "reckless_rocketeer", "reckless_rocketeer", "stonetusk_boar", "stonetusk_boar", "wolfrider", "wolfrider", "hex", "hex", "rockbiter_weapon", "rockbiter_weapon", "windfury", "windfury", "ancestral_healing", "ancestral_healing", "frost_shock", "frost_shock"],
	},
	elder_jari: {
		name: "Elder Jari", level: 4, health: 30,
		flavor: "Nature answers when Jari calls. Loudly.",
		power: {"name": "Mystic Barrier", "cost": 1, "text": "Gain 3 Armor.", "effects": [{"type": "armor", "value": 3}]},
		deck: ["tyrantus", "ancient_of_war", "ancient_of_war", "greedy_sprite", "greedy_sprite", "druid_of_the_claw", "druid_of_the_claw", "ultimate_infestation", "ultimate_infestation", "innervate", "innervate", "nourish", "nourish", "swipe", "swipe", "wild_growth", "wild_growth", "wrath", "wrath", "tyrantus", "ancient_of_war", "greedy_sprite", "druid_of_the_claw", "ultimate_infestation", "innervate", "nourish", "swipe", "wild_growth", "wrath", "tyrantus"],
	},
	fungalmancer_flurgl: {
		name: "Fungalmancer Flurgl", level: 4, health: 30,
		flavor: "Mrglmrgl! MRGLMRGL!",
		power: {"name": "Fungal Infection", "cost": 2, "text": "Give your creatures +1/+1.", "effects": [{"type": "buff", "attack": 1, "health": 1, "target": "friendly-creatures"}]},
		deck: ["murloc_warleader", "murloc_warleader", "mana_tide_totem", "murloc_tidecaller", "murloc_tidecaller", "primalfin_totem", "primalfin_totem", "vitality_totem", "bilefin_tidehunter", "bilefin_tidehunter", "flametongue_totem", "flametongue_totem", "kobold_hermit", "kobold_hermit", "murloc_tidehunter", "murloc_tidehunter", "murloc_tinyfin", "murloc_tinyfin", "totem_golem", "totem_golem", "tuskarr_totemic", "tuskarr_totemic", "call_in_the_finishers", "call_in_the_finishers", "ice_fishing", "ice_fishing", "totemic_might", "murloc_warleader", "mana_tide_totem", "murloc_tidecaller"],
	},
	kraxx: {
		name: "Kraxx", level: 4, health: 30,
		flavor: "The walking wall of the catacombs.",
		power: {"name": "Giant Stomp", "cost": 2, "text": "Deal 1 damage to all enemy creatures.", "effects": [{"type": "damage", "value": 1, "target": "enemy-creatures"}]},
		deck: ["armorsmith", "armorsmith", "shield_slam", "shield_slam", "sleep_with_the_fishes", "sleep_with_the_fishes", "bash", "bash", "execute", "execute", "shield_block", "shield_block", "fiery_war_axe", "fiery_war_axe", "arcanite_reaper", "arcanite_reaper", "armorsmith", "shield_slam", "sleep_with_the_fishes", "bash", "execute", "shield_block", "fiery_war_axe", "arcanite_reaper", "armorsmith", "shield_slam", "sleep_with_the_fishes", "bash", "execute", "shield_block"],
	},
	lyris_the_wild_mage: {
		name: "Lyris the Wild Mage", level: 5, health: 40,
		flavor: "Magic misses are just magic hits somewhere else.",
		power: {"name": "Arcane Infusion", "cost": 1, "text": "Add Arcane Missiles to your hand.", "effects": [{"type": "add-card", "id": "arcane_missiles"}]},
		deck: ["archmage_antonidas", "arcane_giant", "arcane_giant", "arcane_giant", "arcane_giant", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "flamewaker", "arcane_intellect", "arcane_intellect", "arcane_intellect", "arcane_intellect", "arcane_intellect"],
	},
	battlecrier_jinzo: {
		name: "Battlecrier Jin'zo", level: 5, health: 40,
		flavor: "Every shout echoes twice down here.",
		passive: "battlecries-twice",
		deck: ["coldlight_oracle", "coldlight_oracle", "mind_control_tech", "mind_control_tech", "cruel_taskmaster", "cruel_taskmaster", "grimestreet_smuggler", "grimestreet_smuggler", "public_defender", "public_defender", "ravaging_ghoul", "ravaging_ghoul", "refreshment_vendor", "refreshment_vendor", "novice_engineer", "novice_engineer", "brawl", "brawl", "battle_rage", "battle_rage", "shield_block", "shield_block", "coldlight_oracle", "mind_control_tech", "cruel_taskmaster", "grimestreet_smuggler", "public_defender", "ravaging_ghoul", "refreshment_vendor", "novice_engineer"],
	},
	spiritspeaker_azun: {
		name: "Spiritspeaker Azun", level: 5, health: 40,
		flavor: "The dead speak to Azun. Twice.",
		passive: "deathrattles-twice",
		deck: ["barnes", "obsidian_statue", "obsidian_statue", "bone_drake", "loot_hoarder", "loot_hoarder", "mistress_of_mixtures", "mistress_of_mixtures", "tortollan_shellraiser", "tortollan_shellraiser", "shadow_essence", "shadow_essence", "holy_nova", "shadow_word_death", "shadow_word_death", "shadow_word_pain", "shadow_word_pain", "barnes", "obsidian_statue", "bone_drake", "loot_hoarder", "mistress_of_mixtures", "tortollan_shellraiser", "shadow_essence", "holy_nova", "shadow_word_death", "shadow_word_pain", "barnes", "obsidian_statue", "bone_drake"],
	},
	gnosh_the_greatworm: {
		name: "Gnosh the Greatworm", level: 6, health: 40,
		flavor: "It swallowed a knight once. Armor and all.",
		power: {"name": "Swallow Whole", "cost": 2, "text": "Destroy the creature with the highest Attack.", "effects": [{"type": "destroy-strongest"}]},
		deck: ["devilsaur_egg", "devilsaur_egg", "frothing_berserker", "frothing_berserker", "master_swordsmith", "master_swordsmith", "anubisath_sentinel", "anubisath_sentinel", "burly_rockjaw_trogg", "burly_rockjaw_trogg", "cobalt_scalebane", "cobalt_scalebane", "haunted_creeper", "haunted_creeper", "stonesplinter_trogg", "stonesplinter_trogg", "violet_wurm", "violet_wurm", "zealous_initiate", "zealous_initiate", "gurubashi_berserker", "gurubashi_berserker", "battle_rage", "battle_rage", "devilsaur_egg", "frothing_berserker", "master_swordsmith", "anubisath_sentinel", "burly_rockjaw_trogg", "cobalt_scalebane"],
	},
	george_and_karl: {
		name: "George and Karl", level: 6, health: 30,
		flavor: "Two paladins, one cause, zero indoor voices.",
		power: {"name": "Divinity", "cost": 2, "text": "Give all your creatures Divine Shield.", "effects": [{"type": "grant", "keyword": "divine_shield", "target": "friendly-creatures"}]},
		deck: ["blood_knight", "aldor_peacekeeper", "aldor_peacekeeper", "grimestreet_enforcer", "grimestreet_enforcer", "divine_favor", "equality", "equality", "consecration", "consecration", "blood_knight", "aldor_peacekeeper", "grimestreet_enforcer", "divine_favor", "equality", "consecration", "blood_knight", "aldor_peacekeeper", "grimestreet_enforcer", "divine_favor", "equality", "consecration", "blood_knight", "aldor_peacekeeper", "grimestreet_enforcer", "divine_favor", "equality", "consecration", "blood_knight", "aldor_peacekeeper"],
	},
	the_mothergloop: {
		name: "The Mothergloop", level: 6, health: 50,
		flavor: "All oozes come from somewhere.",
		power: {"name": "Gloop", "cost": 2, "text": "Give creatures in your hand +1/+1.", "effects": [{"type": "buff-hand", "all": true, "attack": 1, "health": 1}]},
		deck: ["hogger_doom_of_elwynn", "doppelgangster", "doppelgangster", "saronite_chain_gang", "saronite_chain_gang", "green_jelly", "green_jelly", "acidic_swamp_ooze", "acidic_swamp_ooze", "solemn_vigil", "solemn_vigil", "hogger_doom_of_elwynn", "doppelgangster", "saronite_chain_gang", "green_jelly", "acidic_swamp_ooze", "solemn_vigil", "hogger_doom_of_elwynn", "doppelgangster", "saronite_chain_gang", "green_jelly", "acidic_swamp_ooze", "solemn_vigil", "hogger_doom_of_elwynn", "doppelgangster", "saronite_chain_gang", "green_jelly", "acidic_swamp_ooze", "solemn_vigil", "hogger_doom_of_elwynn"],
	},
	bristlesnarl: {
		name: "Bristlesnarl", level: 7, health: 50,
		flavor: "The catacombs' apex predator keeps trophies.",
		power: {"name": "Hunter's Call", "cost": 3, "text": "Reduce the cost of cards in your hand by (1).", "effects": [{"type": "discount-hand", "value": 1}]},
		deck: ["king_krush", "bittertide_hydra", "bittertide_hydra", "corpse_widow", "savannah_highmane", "savannah_highmane", "giant_mastodon", "starving_buzzard", "starving_buzzard", "tundra_rhino", "tundra_rhino", "deadly_shot", "deadly_shot", "kill_command", "kill_command", "gladiator_s_longbow", "gladiator_s_longbow", "king_krush", "bittertide_hydra", "corpse_widow", "savannah_highmane", "giant_mastodon", "starving_buzzard", "tundra_rhino", "deadly_shot", "kill_command", "gladiator_s_longbow", "king_krush", "bittertide_hydra", "corpse_widow"],
	},
	voodoomaster_vex: {
		name: "Voodoomaster Vex", level: 7, health: 50,
		flavor: "Everything he touches happens twice.",
		passive: "both-twice",
		deck: ["sylvanas_windrunner", "abomination", "abomination", "bomb_squad", "bomb_squad", "ticking_abomination", "ticking_abomination", "unearthed_raptor", "unearthed_raptor", "explosive_sheep", "explosive_sheep", "mistress_of_mixtures", "mistress_of_mixtures", "sylvanas_windrunner", "abomination", "bomb_squad", "ticking_abomination", "unearthed_raptor", "explosive_sheep", "mistress_of_mixtures", "sylvanas_windrunner", "abomination", "bomb_squad", "ticking_abomination", "unearthed_raptor", "explosive_sheep", "mistress_of_mixtures", "sylvanas_windrunner"],
	},
	azari_the_devourer: {
		name: "Azari, the Devourer", level: 8, health: 70,
		flavor: "He devours hope first. Then decks.",
		power: {"name": "Devour", "cost": 0, "text": "Remove the top 2 cards of your opponent's deck.", "effects": [{"type": "mill", "value": 2}]},
		deck: ["kabal_trafficker", "kabal_trafficker", "pit_lord", "pit_lord", "voidlord", "voidlord", "despicable_dreadlord", "despicable_dreadlord", "doomguard", "doomguard", "abyssal_enforcer", "abyssal_enforcer", "dread_infernal", "dread_infernal", "fearsome_doomguard", "flame_imp", "flame_imp", "voidcaller", "voidcaller", "bane_of_doom", "bane_of_doom", "kabal_trafficker", "pit_lord", "voidlord", "despicable_dreadlord", "doomguard", "abyssal_enforcer", "dread_infernal", "fearsome_doomguard", "flame_imp"],
	},
	the_darkness: {
		name: "The Darkness", level: 8, health: 70,
		flavor: "It was here before the candles. It will be here after.",
		power: {"name": "Encroaching Darkness", "cost": 2, "text": "Summon a 5/5 Darkspawn.", "effects": [{"type": "summon", "count": 1, "attack": 5, "health": 5, "name": "Darkspawn"}]},
		deck: ["cabal_shadow_priest", "cabal_shadow_priest", "twisting_nether", "twisting_nether", "potion_of_madness", "potion_of_madness", "mind_control", "mind_control", "shadow_bolt", "shadow_bolt", "shadow_word_death", "shadow_word_death", "shadow_word_pain", "shadow_word_pain", "cabal_shadow_priest", "twisting_nether", "potion_of_madness", "mind_control", "shadow_bolt", "shadow_word_death", "shadow_word_pain", "cabal_shadow_priest", "twisting_nether", "potion_of_madness", "mind_control", "shadow_bolt", "shadow_word_death", "shadow_word_pain", "cabal_shadow_priest", "twisting_nether"],
	},
	king_togwaggle: {
		name: "King Togwaggle", level: 8, health: 70,
		flavor: "The king of the kobolds wants HIS candle back.",
		power: {"name": "Magic Candle", "cost": 3, "text": "Find a Treasure token!", "effects": [{"type": "enrich"}]},
		deck: ["evolved_kobold", "evolved_kobold", "kobold_apprentice", "kobold_apprentice", "kobold_hermit", "kobold_hermit", "tomb_pillager", "tomb_pillager", "kobold_geomancer", "kobold_geomancer", "betrayal", "betrayal", "eviscerate", "eviscerate", "vanish", "vanish", "backstab", "backstab", "evolved_kobold", "kobold_apprentice", "kobold_hermit", "tomb_pillager", "kobold_geomancer", "betrayal", "eviscerate", "vanish", "backstab", "evolved_kobold", "kobold_apprentice", "kobold_hermit"],
	},
};

// run passives offered between fights (implemented in game.js applyTreasures)
export const TREASURES = {
	potion_of_vitality: { name: "Potion of Vitality", text: "Double your starting Health." },
	crystal_gem: { name: "Crystal Gem", text: "Start with an extra Mana Crystal." },
	small_backpacks: { name: "Small Backpacks", text: "Start with 2 extra cards drawn." },
	captured_flag: { name: "Captured Flag", text: "Your creatures have +1/+1." },
	khadgars_scrying_orb: { name: "Khadgar's Scrying Orb", text: "Your spells cost (1) less." },
	grommashs_armguards: { name: "Grommash's Armguards", text: "Your weapons cost (1)." },
	scepter_of_summoning: { name: "Scepter of Summoning", text: "Your creatures that cost (5) or more cost (5)." },
	robe_of_the_magi: { name: "Robe of the Magi", text: "Spell Damage +3." },
	glyph_of_warding: { name: "Glyph of Warding", text: "Enemy creatures cost (1) more." },
	cloak_of_invisibility: { name: "Cloak of Invisibility", text: "Your creatures have permanent Stealth." },
	mysterious_tome: { name: "Mysterious Tome", text: "Start with 3 random Secrets in play." },
	totem_of_the_dead: { name: "Totem of the Dead", text: "Your Deathrattles trigger twice." },
	battle_totem: { name: "Battle Totem", text: "Your Battlecries trigger twice." },
	justicars_ring: { name: "Justicar's Ring", text: "Your Hero Power costs (1)." },
};

export function randomBoss(level = 1, rng = Math.random) {
	const pool = Object.keys(BOSSES).filter(id => BOSSES[id].level === level);
	return pool[Math.floor(rng() * pool.length)];
}
