// engine/dungeons.js — the Advance mechanic (MTG's "Venture into the Dungeon").
//
// A player advances through one dungeon at a time, one room per Advance. Entering a room fires
// its effect; branching rooms (two exits) offer a choice; the last room is a payoff and completes
// the dungeon (freeing you to advance into a new one). Room effects use the normal effect DSL, but
// because rooms AUTO-TRIGGER (no play-time targeting), targeted "target creature" effects are
// mapped to auto-resolving variants (bolster / broadcast / all-heroes). Data pulled from the three
// Adventures in the Forgotten Realms dungeons (Scryfall oracle text); a few rooms are faithfully
// adapted where the engine can't express the exact clause (noted per room).
// PURE DATA — no imports (the advance/enterRoom logic lives in core.js, which has execEffects/emit).

export const DUNGEONS = {
	lost_mine: {
		name: 'Lost Mine of Phandelver', start: 'cave_entrance',
		rooms: {
			cave_entrance:       { name: 'Cave Entrance',       text: 'Scry 1.',                                   effects: [{ type: 'scry', value: 1 }], next: ['goblin_lair', 'mine_tunnels'] },
			goblin_lair:         { name: 'Goblin Lair',         text: 'Create a 1/1 Goblin.',                      effects: [{ type: 'summon', count: 1, attack: 1, health: 1, name: 'Goblin', tribe: 'Goblin' }], next: ['storeroom', 'dark_pool'] },
			mine_tunnels:        { name: 'Mine Tunnels',        text: 'Create a Treasure (gain a Coin).',          effects: [{ type: 'gain-coin', value: 1 }], next: ['dark_pool', 'fungi_cavern'] },
			storeroom:           { name: 'Storeroom',           text: 'Bolster 1 (+1/+1 to your weakest).',        effects: [{ type: 'bolster', value: 1 }], next: ['temple_of_dumathoin'] },
			dark_pool:           { name: 'Dark Pool',           text: 'Each opponent loses 1 life; you gain 1.',   effects: [{ type: 'damage', value: 1, target: 'enemy-heroes' }, { type: 'heal', value: 1, target: 'self' }], next: ['temple_of_dumathoin'] },
			fungi_cavern:        { name: 'Fungi Cavern',        text: "Enemy creatures can't attack next turn.",   effects: [{ type: 'freeze', target: 'enemy-creatures' }], next: ['temple_of_dumathoin'] }, // adapts "-4/-0 target creature"
			temple_of_dumathoin: { name: 'Temple of Dumathoin', text: 'Draw a card.',                              effects: [{ type: 'draw', value: 1 }], next: [] },
		},
	},
	tomb: {
		name: 'Tomb of Annihilation', start: 'trapped_entry',
		rooms: {
			trapped_entry:           { name: 'Trapped Entry',           text: 'Each player loses 1 life.',       effects: [{ type: 'damage', value: 1, target: 'all-heroes' }], next: ['veils_of_fear', 'oubliette'] },
			veils_of_fear:           { name: 'Veils of Fear',           text: 'Each player discards a card.',    effects: [{ type: 'discard-random', count: 1 }, { type: 'enemy-discard', value: 1 }], next: ['sandfall_cell'] }, // adapts "lose 2 unless discard"
			sandfall_cell:           { name: 'Sandfall Cell',           text: 'Each player loses 2 life.',       effects: [{ type: 'damage', value: 2, target: 'all-heroes' }], next: ['cradle_of_the_death_god'] }, // adapts "lose 2 unless sacrifice"
			oubliette:               { name: 'Oubliette',               text: 'Discard two cards.',              effects: [{ type: 'discard-random', count: 2 }], next: ['sandfall_cell'] }, // both branches converge at Sandfall Cell -> one line into the final room
			cradle_of_the_death_god: { name: 'Cradle of the Death God', text: 'Create The Atropal, a 4/4 with Deathtouch.', effects: [{ type: 'summon', count: 1, attack: 4, health: 4, name: 'The Atropal', tribe: 'God Horror', keywords: ['deathtouch'] }], next: [] },
		},
	},
	amber_temple: {
		// Curse of Strahd's Amber Temple: a vault of imprisoned dark powers whose "vestiges" grant
		// dark gifts — potent boons, most exacting a price in life. A custom dungeon in the same shape
		// (start -> branch -> converge -> branch -> payoff) as the three AFR dungeons above.
		name: 'Amber Temple', start: 'temple_doors',
		rooms: {
			temple_doors:     { name: 'Temple Doors',     text: 'Scry 1.',                                              effects: [{ type: 'scry', value: 1 }], next: ['amber_sarcophagi'] },
			amber_sarcophagi: { name: 'Amber Sarcophagi', text: 'Bolster 1 (+1/+1 to your weakest).',                   effects: [{ type: 'bolster', value: 1 }], next: ['vault_of_vampyr', 'shrine_of_delban'] },
			vault_of_vampyr:  { name: 'Vault of Vampyr',  text: "Vampyr's gift: gain 2 Armor and 2 life.",              effects: [{ type: 'armor', value: 2 }, { type: 'heal', value: 2, target: 'self' }], next: ['hall_of_vestiges'] },
			shrine_of_delban: { name: 'Shrine of Delban', text: "Delban's star: deal 2 to a random enemy; lose 1 life.", effects: [{ type: 'random-damage', value: 2, pool: 'enemies', count: 1 }, { type: 'damage', value: 1, target: 'own-hero' }], next: ['hall_of_vestiges'] },
			hall_of_vestiges: { name: 'Hall of Vestiges', text: 'Forbidden lore: draw a card; lose 1 life.',            effects: [{ type: 'draw', value: 1 }, { type: 'damage', value: 1, target: 'own-hero' }], next: ['shrine_of_zhudun', 'shrine_of_savnok'] },
			shrine_of_zhudun: { name: 'Shrine of Zhudun', text: 'Create a 3/3 Amber Horror.',                           effects: [{ type: 'summon', count: 1, attack: 3, health: 3, name: 'Amber Horror', tribe: 'Horror' }], next: ['heart_of_amber'] },
			shrine_of_savnok: { name: 'Shrine of Savnok', text: 'The Imprisoner wards your host: give your creatures +1/+1.', effects: [{ type: 'buff', attack: 1, health: 1, target: 'friendly-creatures' }], next: ['heart_of_amber'] },
			heart_of_amber:   { name: 'Heart of Amber',   text: 'The dark bargain: draw two cards, deal 3 to each opponent, and lose 3 life.', effects: [{ type: 'draw', value: 2 }, { type: 'damage', value: 3, target: 'enemy-heroes' }, { type: 'damage', value: 3, target: 'own-hero' }], next: [] },
		},
	},
	mad_mage: {
		name: 'Dungeon of the Mad Mage', start: 'yawning_portal',
		rooms: {
			yawning_portal:    { name: 'Yawning Portal',    text: 'Gain 1 life.',                            effects: [{ type: 'heal', value: 1, target: 'self' }], next: ['dungeon_level'] },
			dungeon_level:     { name: 'Dungeon Level',     text: 'Scry 1.',                                 effects: [{ type: 'scry', value: 1 }], next: ['goblin_bazaar', 'twisted_caverns'] },
			goblin_bazaar:     { name: 'Goblin Bazaar',     text: 'Create a Treasure (gain a Coin).',        effects: [{ type: 'gain-coin', value: 1 }], next: ['lost_level'] },
			twisted_caverns:   { name: 'Twisted Caverns',   text: "Enemy creatures can't attack next turn.", effects: [{ type: 'freeze', target: 'enemy-creatures' }], next: ['lost_level'] },
			lost_level:        { name: 'Lost Level',        text: 'Scry 2.',                                 effects: [{ type: 'scry', value: 2 }], next: ['runestone_caverns', 'muirals_graveyard'] },
			runestone_caverns: { name: 'Runestone Caverns', text: 'Draw two cards.',                         effects: [{ type: 'draw', value: 2 }], next: ['deep_mines'] }, // adapts "exile top 2, play them"
			muirals_graveyard: { name: "Muiral's Graveyard", text: 'Create two 1/1 Skeletons.',              effects: [{ type: 'summon', count: 2, attack: 1, health: 1, name: 'Skeleton', tribe: 'Skeleton' }], next: ['deep_mines'] },
			deep_mines:        { name: 'Deep Mines',        text: 'Scry 3.',                                 effects: [{ type: 'scry', value: 3 }], next: ['mad_wizards_lair'] },
			mad_wizards_lair:  { name: "Mad Wizard's Lair", text: 'Draw three cards.',                       effects: [{ type: 'draw', value: 3 }], next: [] }, // adapts "draw 3, cast one free"
		},
	},
};
