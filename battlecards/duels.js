// Hearthstone Duels run data: passive treasures + the playable heroes. Active
// treasures (set DUELS) and hero powers (type 'heropower', id duelshp_*) live
// in cards.json. Boss ladder + run logic land in later phases. Mirrors the
// tombs.js / heist.js structure.
import * as E from './engine.js';

const emblem = (state, pi, id, name, text, extra) => {
	const em = E.instantiate({ id, name, type: 'emblem', cost: 0, rarity: 'basic', description: text, ...extra }, pi);
	em.zone = 'emblem';
	state.players[pi].emblems.push(em);
	E.recomputeAuras(state);
};

// Passive treasures: picked at run start, applied once per fight. Most set a
// player flag the engine already reads (shared with Tombs/Heist) or boot an
// emblem aura. Batch 1 is the reuse-only set; school-specific and new-hook
// passives arrive in later batches.
export const PASSIVES = {
	robe_of_the_apprentice: {
		name: 'Robe of the Apprentice', text: 'Spell Damage +1.',
		apply: (state, pi) => emblem(state, pi, 'duels_robe_apprentice', 'Robe of the Apprentice', 'Spell Damage +1.', { static: { type: 'spell-damage', value: 1 } }),
	},
	small_backpacks: {
		name: 'Small Backpacks', text: 'At the start of the game, draw 2 cards.',
		apply: (state, pi) => E.execEffects(state, pi, [{ type: 'draw', value: 2 }], null, null),
	},
	small_pouches: {
		name: 'Small Pouches', text: 'At the start of the game, draw a card.',
		apply: (state, pi) => E.execEffects(state, pi, [{ type: 'draw', value: 1 }], null, null),
	},
	band_of_bees: {
		name: 'Band of Bees', text: 'Your creatures that cost (2) or less have Poisonous.',
		apply: (state, pi) => emblem(state, pi, 'duels_band_of_bees', 'Band of Bees', 'Your cheap creatures have Poisonous.', { aura: { keywords: ['poisonous'], maxCost: 2 } }),
	},
	emerald_goggles: {
		name: 'Emerald Goggles', text: 'The left-most card in your hand costs (2) less.',
		apply: (state, pi) => { state.players[pi].leftmostDiscount = 2; },
	},
	rhonins_scrying_orb: {
		name: "Rhonin's Scrying Orb", text: 'The first spell you cast each turn costs (1) less.',
		apply: (state, pi) => emblem(state, pi, 'duels_rhonins_scrying_orb', "Rhonin's Scrying Orb", 'Your first spell each turn costs (1) less.', { static: { type: 'first-spell-discount', value: 1 } }),
	},
	rocket_backpacks: {
		name: 'Rocket Backpacks', text: 'The first creature you play each turn has Rush.',
		apply: (state, pi) => { state.players[pi].rocketBackpacks = true; },
	},
	special_delivery: {
		name: 'Special Delivery', text: 'After you play your first Rush creature in a turn, summon a copy of it with 1 Health.',
		apply: (state, pi) => { state.players[pi].specialDelivery = true; },
	},
	shadowcasting_101: {
		name: 'Shadowcasting 101', text: 'After you play your first creature each turn, add a 1/1 copy of it to your hand. It costs (1).',
		apply: (state, pi) => { state.players[pi].shadowcasting = true; },
	},
	rally_the_troops: {
		name: 'Rally the Troops', text: 'After you play your first Battlecry card in a turn, draw a card.',
		apply: (state, pi) => { state.players[pi].rallyTheTroops = true; },
	},
	lunar_band: {
		name: 'Lunar Band', text: 'The first Deathrattle creature you play each turn triggers its effect.',
		apply: (state, pi) => { state.players[pi].lunarBand = true; },
	},
	ring_of_refreshment: {
		name: 'Ring of Refreshment', text: 'After you cast a spell, refresh your Hero Power.',
		apply: (state, pi) => { state.players[pi].ringOfRefreshment = true; },
	},
	staff_of_pain: {
		name: 'Staff of Pain', text: 'After you cast a Shadow spell, deal 2 damage to each hero.',
		apply: (state, pi) => { state.players[pi].staffOfPain = true; },
	},
	mending_pools: {
		name: 'Mending Pools', text: 'After you cast your first Nature spell in a turn, restore 2 Health to all friendly characters.',
		apply: (state, pi) => { state.players[pi].mendingPools = true; },
	},
	iron_roots: {
		name: 'Iron Roots', text: 'After you cast a Nature spell, give a random friendly creature +1/+1 & Taunt.',
		apply: (state, pi) => { state.players[pi].ironRoots = true; },
	},
	spreading_saplings: {
		name: 'Spreading Saplings', text: 'After you cast a Nature spell, summon a 1/1 Sapling.',
		apply: (state, pi) => { state.players[pi].spreadingSaplings = true; },
	},
	guardian_light: {
		name: 'Guardian Light', text: 'After you cast a Holy spell, summon an Ancient Guardian with stats equal to its Cost.',
		apply: (state, pi) => { state.players[pi].guardianLight = true; },
	},
	firekeepers_idol: {
		name: "Firekeeper's Idol", text: 'After you cast a Fire spell, summon a 1/2 Flame Elemental & add one to your hand.',
		apply: (state, pi) => { state.players[pi].firekeepersIdol = true; },
	},
	invigorating_light: {
		name: 'Invigorating Light', text: 'Whenever you cast a Holy spell, give your creatures +1 Health.',
		apply: (state, pi) => { state.players[pi].invigoratingLight = true; },
	},
	robes_of_shrinking: {
		name: 'Robes of Shrinking', text: 'After you draw a spell, reduce its Cost by (1).',
		apply: (state, pi) => { state.players[pi].robesOfShrinking = true; },
	},
	bronze_signet: {
		name: 'Bronze Signet', text: 'Whenever you draw a creature, add a copy of it to your hand.',
		apply: (state, pi) => { state.players[pi].bronzeSignet = true; },
	},
	glacial_downpour: {
		name: 'Glacial Downpour', text: "At the end of your turn, summon a 2/3 Water Elemental if you've cast a Frost spell this turn.",
		apply: (state, pi) => { state.players[pi].glacialDownpour = true; },
	},
	flame_waves: {
		name: 'Flame Waves', text: "At the end of your turn, deal 2 damage to all enemy creatures for each Fire spell you've cast this turn.",
		apply: (state, pi) => { state.players[pi].flameWaves = true; },
	},
	arctic_armor: {
		name: 'Arctic Armor', text: 'After the first time you Freeze an enemy each turn, gain 2 Armor.',
		apply: (state, pi) => { state.players[pi].arcticArmor = true; },
	},
	ring_of_black_ice: {
		name: 'Ring of Black Ice', text: 'Whenever a creature is Frozen, add a copy of it to your hand. It costs (2) less.',
		apply: (state, pi) => { state.players[pi].ringOfBlackIce = true; },
	},
	// --- reuse of shared Heist/Tombs engine flags ---
	recycling: {
		name: 'Recycling', text: 'After a friendly creature dies, gain 1 Armor.',
		apply: (state, pi) => { state.players[pi].armorPerFriendlyDeath = (state.players[pi].armorPerFriendlyDeath || 0) + 1; },
	},
	disks_of_legend: {
		name: 'Disks of Legend', text: 'After you play a Legendary creature, summon a copy of it.',
		apply: (state, pi) => { state.players[pi].disksOfLegend = true; },
	},
	elixir_of_vigor: {
		name: 'Elixir of Vigor', text: 'After you play a creature, shuffle two copies of it into your deck. They cost (1).',
		apply: (state, pi) => { state.players[pi].vigorShuffle = true; },
	},
	manastorm: {
		name: 'Manastorm', text: 'Start with 10 Mana Crystals.',
		apply: (state, pi) => { const m = state.players[pi].mana; if (m) { m.max = 10; m.cur = 10; } },
	},
	// --- death / corpse triggers ---
	starving: {
		name: 'Starving', text: 'After the first time a friendly Beast dies in your turn, draw a card.',
		apply: (state, pi) => { state.players[pi].starving = true; },
	},
	dragonblood: {
		name: 'Dragonblood', text: 'After the first time a friendly Dragon dies each turn, give creatures in your hand +1/+1.',
		apply: (state, pi) => { state.players[pi].dragonblood = true; },
	},
	from_the_swamp: {
		name: 'From the Swamp', text: 'After the first enemy dies each turn, raise a 1/1 Bloated Zombie.',
		apply: (state, pi) => { state.players[pi].fromTheSwamp = true; },
	},
	cadaver_collector: {
		name: 'Cadaver Collector', text: 'After the first time you gain a Corpse in a turn, gain 1 additional Corpse.',
		apply: (state, pi) => { state.players[pi].cadaverCollector = true; },
	},
	// --- start of turn ---
	conduit_of_the_storms: {
		name: 'Conduit of the Storms', text: 'At the start of your turn, if you are Overloaded, gain +2 Attack this turn.',
		apply: (state, pi) => { state.players[pi].conduitStorms = true; },
	},
	crystal_gem: {
		name: 'Crystal Gem', text: 'On your first two turns, you have 1 extra Mana Crystal.',
		apply: (state, pi) => { state.players[pi].crystalGem = true; },
	},
	party_replacement: {
		name: 'Party Replacement', text: 'At the start of your turn, summon a 2/2 Adventurer with a random bonus keyword.',
		apply: (state, pi) => { state.players[pi].partyReplacement = true; },
	},
	// --- play-a-creature triggers ---
	ring_of_phaseshifting: {
		name: 'Ring of Phaseshifting', text: 'After you play a Legendary creature, add a random Legendary creature to your hand.',
		apply: (state, pi) => { state.players[pi].ringPhaseshifting = true; },
	},
	inspiring_presence: {
		name: 'Inspiring Presence', text: 'After you play a Legendary creature, reduce the Cost of a random card in your hand by (2).',
		apply: (state, pi) => { state.players[pi].inspiringPresence = true; },
	},
	sandy_surprise: {
		name: 'Sandy Surprise', text: 'After you play a creature that costs (3) or less, give it Stealth.',
		apply: (state, pi) => { state.players[pi].sandySurprise = true; },
	},
	the_floor_is_lava: {
		name: 'The Floor is Lava', text: 'After you play your first creature each turn, deal 1 damage to it & give it +2 Attack.',
		apply: (state, pi) => { state.players[pi].floorIsLava = true; },
	},
	righteous_reserves: {
		name: 'Righteous Reserves', text: 'After you play your first Divine Shield creature each turn, give a random friendly creature Divine Shield.',
		apply: (state, pi) => { state.players[pi].righteousReserves = true; },
	},
	// --- more spell-cast reactions ---
	fireshaper: {
		name: 'Fireshaper', text: 'After you cast a spell, deal 1 damage to a random enemy.',
		apply: (state, pi) => { state.players[pi].fireshaper = true; },
	},
	arcanite_crystal: {
		name: 'Arcanite Crystal', text: 'After you cast an Arcane spell, reduce the Cost of a card in your hand by (1).',
		apply: (state, pi) => { state.players[pi].arcaniteCrystal = true; },
	},
	wither_the_weak: {
		name: 'Wither the Weak', text: 'After you cast your first Fel spell in a turn, deal 1 damage to the lowest-Health enemy.',
		apply: (state, pi) => { state.players[pi].witherWeak = true; },
	},
	unstable_magic: {
		name: 'Unstable Magic', text: 'After you cast an Arcane spell, transform a random enemy creature into a 1/1 Sheep.',
		apply: (state, pi) => { state.players[pi].unstableMagic = true; },
	},
	// --- cost auras ---
	endurance_training: {
		name: 'Endurance Training', text: 'Your Taunt creatures cost (2) less, but not less than (1).',
		apply: (state, pi) => { state.players[pi].enduranceTraining = true; },
	},
	all_together_now: {
		name: 'All Together Now', text: 'Your Battlecry cards cost (1) less, but not less than (2).',
		apply: (state, pi) => { state.players[pi].allTogetherNow = true; },
	},
	dragon_affinity: {
		name: 'Dragon Affinity', text: 'The first Dragon you play each turn costs (1) less.',
		apply: (state, pi) => { state.players[pi].dragonAffinity = true; },
	},
	greedy_gains: {
		name: 'Greedy Gains', text: 'Your creatures have +2/+2 but cost (2) more, up to (10).',
		apply: (state, pi) => { state.players[pi].greedyGains = true; emblem(state, pi, 'duels_greedy_gains', 'Greedy Gains', 'Your creatures have +2/+2.', { aura: { attack: 2, health: 2 } }); },
	},
	meek_mastery: {
		name: 'Meek Mastery', text: 'Your Neutral creatures have +1/+1 and cost (1) less, but not less than (2).',
		apply: (state, pi) => { state.players[pi].meekMastery = true; emblem(state, pi, 'duels_meek_mastery', 'Meek Mastery', 'Your Neutral creatures have +1/+1.', { aura: { attack: 1, health: 1, cardClass: 'neutral' } }); },
	},
	sticky_fingers: {
		name: 'Sticky Fingers', text: "Cards that didn't start in your deck cost (1) less, but not less than (1).",
		apply: (state, pi) => { state.players[pi].stickyFingers = true; },
	},
	hold_the_line: {
		name: 'Hold the Line', text: "Your Taunt creatures have +3 Attack during your opponent's turn.",
		apply: (state, pi) => { state.players[pi].holdTheLine = true; for (const c of state.players[pi].board) if ((c.keywords || []).includes('taunt')) c.offTurnAttack = Math.max(c.offTurnAttack || 0, 3); },
	},
	scattered_caltrops: {
		name: 'Scattered Caltrops', text: 'After your opponent plays their first creature each turn, deal 1 damage to it.',
		apply: (state, pi) => { state.players[pi].scatteredCaltrops = true; },
	},
	// --- start of game / more cost ---
	oops_all_spells: {
		name: 'Oops, All Spells!', text: 'At the start of the game, destroy all creatures in your deck. Your spells cost (1) less.',
		apply: (state, pi) => { const p = state.players[pi]; p.oopsAllSpells = true; p.deck = p.deck.filter(id => { const d = state.cardsById[id]; return d && d.type !== 'creature'; }); },
	},
	heavy_armor: {
		name: 'Heavy Armor', text: 'At the start of the game, set your Health to 10. You can only take 1 damage at a time.',
		apply: (state, pi) => { const p = state.players[pi]; p.heavyArmor = true; p.life = Math.min(p.life, 10); },
	},
	sunstriders_crown: {
		name: "Sunstrider's Crown", text: 'Every third spell you cast each turn costs (1).',
		apply: (state, pi) => { state.players[pi].sunstridersCrown = true; },
	},
	ring_of_haste: {
		name: 'Ring of Haste', text: 'Every third creature you play each turn costs (1).',
		apply: (state, pi) => { state.players[pi].ringOfHaste = true; },
	},
	grommashs_armguards: {
		name: "Grommash's Armguards", text: 'At the start of the game, draw a weapon. Your weapons cost (1) less.',
		apply: (state, pi) => { const p = state.players[pi]; p.grommash = true; const wi = p.deck.findIndex(id => state.cardsById[id] && state.cardsById[id].type === 'weapon'); if (wi >= 0) { const [wid] = p.deck.splice(wi, 1); E.execEffects(state, pi, [{ type: 'conjure-id', id: wid }], null, null); } },
	},
	// --- discover ---
	open_the_doorways: {
		name: 'Open the Doorways', text: 'After your first Discover in a turn, get another copy of that card.',
		apply: (state, pi) => { state.players[pi].openDoorways = true; },
	},
	orb_of_revelation: {
		name: 'Orb of Revelation', text: 'After your first Discover in a turn, reduce the Cost of spells in your hand by (1).',
		apply: (state, pi) => { state.players[pi].orbRevelation = true; },
	},
	arcane_flux: {
		name: 'Arcane Flux', text: 'After you cast your first Arcane spell in a turn, Discover a card from your class.',
		apply: (state, pi) => { state.players[pi].arcaneFlux = true; },
	},
	divine_illumination: {
		name: 'Divine Illumination', text: 'After you cast your first Holy spell in a turn, Discover a card from your class.',
		apply: (state, pi) => { state.players[pi].divineIllumination = true; },
	},
	// --- attack / weapon / death / play-discover ---
	potion_of_sparking: {
		name: 'Potion of Sparking', text: 'After a friendly Rush creature attacks an enemy creature, deal 1 damage to a random adjacent enemy creature.',
		apply: (state, pi) => { state.players[pi].potionSparking = true; },
	},
	pillage_the_fallen: {
		name: 'Pillage the Fallen', text: 'Whenever your weapon is destroyed, equip a random weapon of the same Cost. Give it +1 Attack.',
		apply: (state, pi) => { state.players[pi].pillageFallen = true; },
	},
	mulch_madness: {
		name: 'Mulch Madness', text: 'Whenever a Neutral creature dies on your turn, gain 1 Mana Crystal for that turn only.',
		apply: (state, pi) => { state.players[pi].mulchMadness = true; },
	},
	staking_a_claim: {
		name: 'Staking A Claim', text: 'After you play your first Discover card in a turn, all friendly creatures gain +1 Attack.',
		apply: (state, pi) => { state.players[pi].stakingClaim = true; },
	},
	// --- per-school Spell Damage + misc turn hooks ---
	kindling_flame: {
		name: 'Kindling Flame', text: 'Fire Spell Damage +1.',
		apply: (state, pi) => { const p = state.players[pi]; p.schoolSpellDmg = p.schoolSpellDmg || {}; p.schoolSpellDmg.Fire = (p.schoolSpellDmg.Fire || 0) + 1; },
	},
	bitter_cold: {
		name: 'Bitter Cold', text: 'Frost Spell Damage +1.',
		apply: (state, pi) => { const p = state.players[pi]; p.schoolSpellDmg = p.schoolSpellDmg || {}; p.schoolSpellDmg.Frost = (p.schoolSpellDmg.Frost || 0) + 1; },
	},
	natural_force: {
		name: 'Natural Force', text: 'Nature Spell Damage +1.',
		apply: (state, pi) => { const p = state.players[pi]; p.schoolSpellDmg = p.schoolSpellDmg || {}; p.schoolSpellDmg.Nature = (p.schoolSpellDmg.Nature || 0) + 1; },
	},
	battle_stance: {
		name: 'Battle Stance', text: 'Your hero has +2 Attack on your turn.',
		apply: (state, pi) => { state.players[pi].battleStance = true; },
	},
	hagathas_embrace: {
		name: "Hagatha's Embrace", text: 'At the start of your turn, give two random creatures in your hand +1/+1.',
		apply: (state, pi) => { state.players[pi].duelsHagatha = true; },
	},
	ever_changing_elixir: {
		name: 'Ever-Changing Elixir', text: 'At the end of your turn, transform a friendly creature into one that costs (2) more.',
		apply: (state, pi) => { state.players[pi].duelsEverChanging = true; },
	},
	// --- final reachable batch ---
	flames_of_the_kirin_tor: {
		name: 'Flames of the Kirin Tor', text: 'After you cast your first Fire spell in a turn, add a random Fire spell from your class to your hand.',
		apply: (state, pi) => { state.players[pi].flamesKirinTor = true; },
	},
	corrupted_felstone: {
		name: 'Corrupted Felstone', text: 'After you cast a Fel spell, give the left- and right-most creatures in your hand +2/+1.',
		apply: (state, pi) => { state.players[pi].corruptedFelstone = true; },
	},
	coil_casting: {
		name: 'Coil Casting', text: 'After you play your first Naga each turn, add a random 1-Cost spell to your hand.',
		apply: (state, pi) => { state.players[pi].coilCasting = true; },
	},
	plaguebringer: {
		name: 'Plaguebringer', text: 'Your spells Overload (1) and cost (2) less, but not less than (1).',
		apply: (state, pi) => { state.players[pi].plaguebringer = true; },
	},
	legendary_loot: {
		name: 'Legendary Loot', text: 'On your first turn, Discover a Legendary weapon.',
		apply: (state, pi) => { state.players[pi].legendaryLoot = true; },
	},
	mysterious_tome: {
		name: 'Mysterious Tome', text: 'At the start of the game, play 2 random Secrets.',
		apply: (state, pi) => { const pool = Object.values(state.cardsById).filter(d => d.type === 'secret' && d.secret); for (let i = 0; i < 2 && pool.length; i++) { const idx = Math.floor(state.rng() * pool.length); const sec = pool.splice(idx, 1)[0]; E.installSecret(state, pi, sec.id); } },
	},
	// --- Corpse economy (spend chokepoint = engine spendCorpses) ---
	blood_shields: {
		name: 'Blood Shields', text: 'After the first time you spend a Corpse in a turn, gain 2 Health.',
		apply: (state, pi) => { state.players[pi].bloodShields = true; },
	},
	ghouls_rush_in: {
		name: 'Ghouls Rush In', text: 'After the first time you spend a Corpse in a turn, summon a 2/2 Risen Ghoul with Rush.',
		apply: (state, pi) => { state.players[pi].ghoulsRushIn = true; },
	},
	cold_feet_pact: {
		name: 'Cold Feet Pact', text: 'At the end of your turn, summon a Risen Groom with stats equal to half your Corpse total.',
		apply: (state, pi) => { state.players[pi].coldFeetPact = true; },
	},
	// --- reuse of existing pools (colossal / locations / Patches / tribes) ---
	forgotten_depths: {
		name: 'Forgotten Depths', text: 'At the start of the game, put 2 Colossal creatures on the bottom of your deck. They cost (3) less.',
		apply: (state, pi) => { const p = state.players[pi]; const col = Object.values(state.cardsById).filter(d => d.colossal && d.type === 'creature' && !d.token); for (let i = 0; i < 2 && col.length; i++) { const c = col[Math.floor(state.rng() * col.length)]; p.deck.unshift(c.id); (p.deckCostPersist = p.deckCostPersist || {})[c.id] = Math.max(0, (c.cost || 0) - 3); } },
	},
	location_location_location: {
		name: 'Location, Location, Location!', text: 'Start the game with a location from your class in play.',
		apply: (state, pi) => { const p = state.players[pi]; const cls = p.heroClass || 'neutral'; const locs = Object.values(state.cardsById).filter(d => d.type === 'location' && (d.cardClass || 'neutral') === cls); const pool = locs.length ? locs : Object.values(state.cardsById).filter(d => d.type === 'location'); if (pool.length) { const loc = pool[Math.floor(state.rng() * pool.length)]; const inst = E.instantiate(loc, pi); inst.zone = 'board'; p.board.push(inst); E.recomputeAuras(state); } },
	},
	beckoning_bicorn: {
		name: 'Beckoning Bicorn', text: 'After you play your first Pirate each turn, add a Patches the Pirate to your deck.',
		apply: (state, pi) => { state.players[pi].beckoningBicorn = true; },
	},
	cookies_ladle: {
		name: "Cookie's Ladle", text: 'After you play your first Murloc each turn, draw a Murloc.',
		apply: (state, pi) => { state.players[pi].cookiesLadle = true; },
	},
	optimized_polarity: {
		name: 'Optimized Polarity', text: 'After you play your first Mech each turn, add a random (1) Mana Mech to your hand.',
		apply: (state, pi) => { state.players[pi].optimizedPolarity = true; },
	},
	// --- authored token cards (Fel Rift / Dream / Lich King / Invitation) ---
	imp_credible_trousers: {
		name: 'Imp-credible Trousers', text: 'After you cast your first Fel spell in a turn, shuffle 2 Fel Rifts into your deck. Draw a card.',
		apply: (state, pi) => { state.players[pi].impTrousers = true; },
	},
	draconic_dream: {
		name: 'Draconic Dream', text: 'After you play a Dragon, shuffle a Dream Portal into your deck that summons a Dragon when drawn.',
		apply: (state, pi) => { state.players[pi].draconicDream = true; },
	},
	cloak_of_emerald_dreams: {
		name: 'Cloak of Emerald Dreams', text: 'At the end of your turn, add a Dream Card to your hand.',
		apply: (state, pi) => { state.players[pi].cloakEmeraldDreams = true; },
	},
	runic_helm: {
		name: 'Runic Helm', text: 'At the end of your turn, add a random Lich King card to your hand.',
		apply: (state, pi) => { state.players[pi].runicHelm = true; },
	},
	unholy_gift: {
		name: 'Unholy Gift', text: 'At the start of the game, shuffle 8 Lich King cards into your deck.',
		apply: (state, pi) => { const lk = ['lk_death_coil', 'lk_frost_strike', 'lk_army_of_the_dead', 'lk_doom_pact', 'lk_soul_reaper', 'obliterate', 'anti_magic_shell'].filter(id => state.cardsById[id]); if (!lk.length) return; const ids = Array.from({ length: 8 }, () => lk[Math.floor(state.rng() * lk.length)]); E.execEffects(state, pi, [{ type: 'shuffle-ids-into-deck', ids }], null, null); },
	},
	be_our_guest: {
		name: 'Be Our Guest', text: 'At the start of the game, shuffle 3 Legendary Invitations into your deck.',
		apply: (state, pi) => { E.execEffects(state, pi, [{ type: 'shuffle-ids-into-deck', ids: ['legendary_invitation', 'legendary_invitation', 'legendary_invitation'] }], null, null); },
	},
	// --- complex one-offs ---
	deathly_death: {
		name: 'Deathly Death!', text: 'After a friendly Deathrattle creature dies, trigger the Deathrattle of a friendly creature.',
		apply: (state, pi) => { state.players[pi].deathlyDeath = true; },
	},
	cannibalism: {
		name: 'Cannibalism', text: 'Whenever a friendly creature dies, give adjacent creatures +1 Attack.',
		apply: (state, pi) => { state.players[pi].cannibalism = true; },
	},
	all_shall_serve: {
		name: 'All Shall Serve', text: 'After the first time a friendly Demon dies in a turn, draw a creature from your deck & give it +1 Attack.',
		apply: (state, pi) => { state.players[pi].allShallServe = true; },
	},
	freeze_solid: {
		name: 'Freeze Solid', text: 'Whenever damage is dealt to a Frozen enemy, deal 2 more.',
		apply: (state, pi) => { state.players[pi].freezeSolid = true; },
	},
	avenging_armaments: {
		name: 'Avenging Armaments', text: 'After a friendly creature loses its Divine Shield, give it +2/+1.',
		apply: (state, pi) => { state.players[pi].avengingArmaments = true; },
	},
	idols_of_elune: {
		name: 'Idols of Elune', text: "At the end of your turn, cast a spell you've cast this turn (targets are random).",
		apply: (state, pi) => { state.players[pi].idolsOfElune = true; },
	},
	expedited_burial: {
		name: 'Expedited Burial', text: 'At the start of the game, change each Deathrattle creature in your hand & deck into a 1/1 that costs (1).',
		apply: (state, pi) => { const p = state.players[pi]; p.expeditedBurial = true; for (const c of p.hand) if (c.type === 'creature' && (c.keywords || []).includes('deathrattle')) { c.attack = 1; c.maxHealth = 1; c.damage = 0; c.tempHealth = 0; c.cost = 1; } },
	},
	brittle_bones: {
		name: 'Brittle Bones', text: 'After you cast a spell that kills an enemy, summon a 2/2 Volatile Skeleton.',
		apply: (state, pi) => { state.players[pi].brittleBones = true; },
	},
	eerie_stone: {
		name: 'Eerie Stone', text: 'After you destroy an enemy creature with a Shadow spell, add a copy of that creature to your hand.',
		apply: (state, pi) => { state.players[pi].eerieStone = true; },
	},
	mantle_of_ignition: {
		name: 'Mantle of Ignition', text: 'Whenever you target a creature with a spell, cast it again on its neighbors.',
		apply: (state, pi) => { state.players[pi].mantleIgnition = true; },
	},
	edge_of_dredge: {
		name: 'Edge of Dredge', text: 'After the first time you Dredge each turn, draw a card.',
		apply: (state, pi) => { state.players[pi].edgeOfDredge = true; },
	},
	dragonbone_ritual: {
		name: 'Dragonbone Ritual', text: 'After you play a Dragon, give it "Deathrattle: Go dormant. Revive in two turns."',
		apply: (state, pi) => { state.players[pi].dragonboneRitual = true; },
	},
};

export function applyPassive(state, pi, id) {
	const p = PASSIVES[id];
	if (!p) return false;
	p.apply(state, pi);
	E.emit(state, { type: 'duelsPassive', player: pi, id, name: p.name });
	return true;
}

// ---------- heroes ----------
// The signature Duels heroes, one per class. Their hero-power options are the
// class powers imported into cards.json (duelshp_*); HERO_POWERS lists what is
// wired so far (expanded as more powers are imported).
export const HEROES = [
	{ id: 'mozaki', name: 'Mozaki, Master Duelist', heroClass: 'mage', hsId: 'PVPDR_Hero_Mozaki', flavor: 'Every spell she casts sharpens the next.' },
	{ id: 'slate', name: 'Professor Slate', heroClass: 'hunter', hsId: 'PVPDR_Hero_Slate', flavor: 'A chemist who solves every problem with the right toxin.' },
	{ id: 'turalyon', name: 'Turalyon, the Tenured', heroClass: 'paladin', hsId: 'PVPDR_Hero_Turalyon', flavor: 'The Lightbringer, now grading on a curve.' },
	{ id: 'omu', name: 'Forest Warden Omu', heroClass: 'druid', hsId: 'PVPDR_Hero_Omu', flavor: 'Mana comes and goes; the forest endures.' },
	{ id: 'lilian', name: 'Infiltrator Lilian', heroClass: 'rogue', hsId: 'PVPDR_Hero_Lilian', flavor: 'She was never here, and she already left with your deck.' },
	{ id: 'illucia', name: 'Mindrender Illucia', heroClass: 'priest', hsId: 'PVPDR_Hero_Illucia', flavor: 'She will play your hand better than you would.' },
	{ id: 'willow', name: 'Archwitch Willow', heroClass: 'warlock', hsId: 'PVPDR_Hero_Willow', flavor: 'Imps for every occasion, and every occasion is now.' },
	{ id: 'fireheart', name: 'Instructor Fireheart', heroClass: 'shaman', hsId: 'PVPDR_Hero_Fireheart', flavor: 'Invoke, invoke, invoke — the elements are listening.' },
	{ id: 'rattlegore', name: 'Rattlegore', heroClass: 'warrior', hsId: 'PVPDR_Hero_Rattlegore', flavor: 'Bone by bone, he simply reassembles.' },
	{ id: 'stelina', name: 'Star Student Stelina', heroClass: 'demon_hunter', hsId: 'PVPDR_Hero_Stelina', flavor: 'Top of her class in disappearing acts.' },
	{ id: 'sai', name: 'Sai Shadestorm', heroClass: 'death_knight', hsId: 'PVPDR_Hero_Sai', flavor: 'The corpses keep the ledger; she keeps the corpses.' },
];

// class -> imported hero-power ids (cards.json, type 'heropower'). Grows batch
// by batch; a hero's picker rolls from its class list plus the neutral powers.
// Duels shares its League-of-Explorers powers with Tombs, so several class
// lists reference the existing ulda_* hero-power cards rather than re-importing.
export const HERO_POWERS = {
	neutral: ['duelshp_send_in_the_scout', 'ulda_uldum_treasure_cache'],
	warrior: ['duelshp_primal_power', 'duelshp_uber_primal_power'],
	hunter: ['duelshp_survival_training', 'ulda_spread_shot', 'ulda_dino_tracking', 'ulda_well_equipped'],
	paladin: ['duelshp_modest_aspirations', 'duelshp_from_golden_light', 'ulda_new_recruits', 'ulda_bubble_blower', 'ulda_power_up'],
	druid: ['duelshp_harvest_time', 'ulda_elises_might', 'ulda_druidic_teaching', 'ulda_starseeker'],
	priest: ['duelshp_shadow_mend', 'duelshp_call_of_madness'],
	death_knight: ['duelshp_blood_parasite'],
	rogue: ['duelshp_vile_concoction', 'duelshp_roguish_maneuvers'],
	demon_hunter: ['duelshp_illidari_strike', 'duelshp_infernal_strike'],
	mage: ['ulda_relicologist', 'ulda_arcane_craftiness', 'ulda_amateur_mage'],
	shaman: ['duelshp_totemic_power'],
	warlock: ['duelshp_demon_blood'],
};

// ---------- the boss ladder ----------
// Duels pits you against the rest of the hero roster. Two rounds of rivals,
// each ending in a fixed final (Diablo, then Uber Diablo). Boss powers are
// translated onto existing engine effects (dungeon/heist/tombs policy); the
// player heroes above are excluded so you never duel a mirror of yourself.
// `hsId` is the PVPDR hero id (for portraits); `theme` drives buildBossDeck.
export const BOSSES = {
	cafeteria_bob: { name: 'Cafeteria Bob', health: 20, hsId: 'PVPDR_Hero_Bob', power: { name: 'Lunch Rush', cost: 2, text: 'Summon a 2/2 Cafeteria Regular.', effects: [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Cafeteria Regular' }] }, theme: { cardClass: 'paladin' } },
	brann_bronzebeard: { name: 'Brann Bronzebeard', health: 20, hsId: 'PVPDR_Hero_Brann', power: { name: 'Double Time', cost: 2, text: 'Give a random friendly creature +1/+1.', effects: [{ type: 'buff-random-friendly', attack: 1, health: 1 }] }, theme: { tribe: 'Beast' } },
	darius_crowley: { name: 'Darius Crowley', health: 25, hsId: 'PVPDR_Hero_Darius', power: { name: 'Reload', cost: 2, text: 'Gain 2 Armor.', effects: [{ type: 'armor', value: 2 }] }, theme: { cardClass: 'warrior' } },
	drekthar: { name: "Drek'Thar", health: 20, hsId: 'PVPDR_Hero_DrekTharv3', power: { name: 'Command the Elements', cost: 2, text: 'Summon a random creature that costs (1).', effects: [{ type: 'summon-random', cost: 1 }] }, theme: { cardClass: 'shaman' } },
	elise_starseeker: { name: 'Elise Starseeker', health: 20, hsId: 'PVPDR_Hero_Elise', power: { name: 'Pack Leader', cost: 2, text: 'Give your creatures +1/+1.', effects: [{ type: 'buff', attack: 1, health: 1, target: 'friendly-creatures' }] }, theme: { cardClass: 'druid' } },
	sir_finley: { name: 'Sir Finley', health: 20, hsId: 'PVPDR_Hero_Finley', power: { name: 'Tidecaller', cost: 2, text: 'Summon a 1/1 Murloc.', effects: [{ type: 'summon', count: 1, attack: 1, health: 1, name: 'Murloc', tribe: 'Murloc' }] }, theme: { tribe: 'Murloc' } },
	headless_horseman: { name: 'Headless Horseman', health: 20, hsId: 'PVPDR_Hero_HeadlessHorseman', power: { name: 'Pumpkin Peal', cost: 2, text: 'Deal 1 damage to all enemy creatures.', effects: [{ type: 'damage', value: 1, target: 'enemy-creatures' }] }, theme: { cardClass: 'neutral' } },
	diablo: { name: 'Diablo', health: 40, hsId: 'PVPDR_Hero_Diablo', power: { name: 'Fire Stomp', cost: 3, text: 'Deal 2 damage to all enemy creatures.', effects: [{ type: 'damage', value: 2, target: 'enemy-creatures' }] }, theme: { tribe: 'Demon' } },
	// ---- round 2 ----
	headmaster_kelthuzad: { name: "Headmaster Kel'Thuzad", health: 25, hsId: 'PVPDR_Hero_KelThuzad', power: { name: 'Roll Call', cost: 3, text: 'Summon a creature that died this game.', effects: [{ type: 'resurrect-highest-died', count: 1 }] }, theme: { cardClass: 'neutral' } },
	kulzon: { name: 'Kulzon, Castmaster', health: 25, hsId: 'PVPDR_Hero_Kulzon', power: { name: 'Overblast', cost: 2, text: 'Deal 2 damage to target opponent.', effects: [{ type: 'damage', value: 2, target: 'enemy-hero' }] }, theme: { cardClass: 'mage' } },
	reno_jackson: { name: 'Reno Jackson', health: 30, hsId: 'PVPDR_Hero_Reno', power: { name: 'Sound the Bells!', cost: 2, text: 'Restore 3 Health to your hero.', effects: [{ type: 'heal', value: 3, target: 'self' }] }, theme: { cardClass: 'mage' } },
	scarlet_leafdancer: { name: 'Scarlet Leafdancer', health: 25, hsId: 'PVPDR_Hero_Scarlet', power: { name: 'Raise Dead', cost: 2, text: 'Summon a 2/1 Ghoul with Lifesteal.', effects: [{ type: 'summon', count: 1, attack: 2, health: 1, name: 'Ghoul', keywords: ['lifesteal'] }] }, theme: { cardClass: 'death_knight' } },
	vanndar_stormpike: { name: 'Vanndar Stormpike', health: 25, hsId: 'PVPDR_Hero_Vanndar', power: { name: 'Charge!', cost: 2, text: 'Give your creatures Rush.', effects: [{ type: 'grant', keyword: 'rush', target: 'friendly-creatures' }] }, theme: { cardClass: 'neutral' } },
	uber_diablo: { name: 'Uber Diablo', health: 60, hsId: 'PVPDR_GUEST_Diablot6h1', power: { name: 'Realm of Terror', cost: 3, text: 'Deal 3 damage to all enemy creatures & summon a 6/6 Terror.', effects: [{ type: 'damage', value: 3, target: 'enemy-creatures' }, { type: 'summon', count: 1, attack: 6, health: 6, name: 'Terror of Sanctuary', tribe: 'Demon' }] }, theme: { tribe: 'Demon' }, final: true },
};

// two rounds of rivals; each `pool` rolls in order, capped by the fixed `final`.
export const ROUNDS = [
	{ id: 'contenders', name: 'The Contenders', final: 'diablo',
		pool: ['cafeteria_bob', 'brann_bronzebeard', 'darius_crowley', 'drekthar', 'elise_starseeker', 'sir_finley', 'headless_horseman'] },
	{ id: 'championship', name: 'The Championship', final: 'uber_diablo',
		pool: ['headmaster_kelthuzad', 'kulzon', 'reno_jackson', 'scarlet_leafdancer', 'vanndar_stormpike'] },
];

// deterministic themed boss deck — identical policy to heist.js/tombs.js:
// 2x the cheapest theme matches, neutral padding, sliced to `size`.
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

// ---------- HS Duels: arena draft, loot buckets, generated enemies ----------
// Faithful-ish Duels loot: a 10-card arena-style draft (pick 1 of 3, rarity-
// weighted), tribe/archetype buckets, and dynamically generated opponents kept
// at exact power parity with the player.

const DRAFT_TYPES = new Set(['creature', 'weapon', 'sorcery', 'instant']);
const RARITY_WEIGHT = { basic: 100, common: 100, rare: 34, epic: 14, legendary: 6 };
const cardWeight = d => RARITY_WEIGHT[d.rarity] || 40;

// a card is draftable for a class if it's a real, collectible, non-token card of
// that class or Neutral (no MTG-colored cards, no locations/hero powers/emblems)
function draftable(d, cls) {
	if (!d || d.token || d.collectible === false || d.companion || d.commander) return false;
	if (d.colors && d.colors.length) return false;
	if (!DRAFT_TYPES.has(d.type)) return false;
	const dc = d.cardClass || 'neutral';
	return dc === cls || dc === 'neutral';
}

export function draftPool(cardsById, heroClass) {
	return Object.values(cardsById).filter(d => draftable(d, heroClass));
}

// pick N distinct cards from a pool, rarity-weighted (arena feel)
export function draftOptions(pool, rng, n = 3) {
	const out = [], seen = new Set();
	let guard = 400;
	const total0 = pool.reduce((s, d) => s + cardWeight(d), 0);
	while (out.length < n && guard-- > 0 && seen.size < pool.length) {
		let r = rng() * total0, pick = null;
		for (const d of pool) { r -= cardWeight(d); if (r <= 0) { pick = d; break; } }
		if (!pick) pick = pool[pool.length - 1];
		if (pick && !seen.has(pick.id)) { seen.add(pick.id); out.push(pick); }
	}
	return out;
}

// a full auto-drafted deck (for generated enemies / previews): `size` picks,
// the AI takes a rarity-weighted random of each trio
export function autoDraftDeck(cardsById, heroClass, rng, size = 10) {
	const pool = draftPool(cardsById, heroClass);
	const deck = [];
	for (let i = 0; i < size && pool.length; i++) {
		const opts = draftOptions(pool, rng, 3);
		if (!opts.length) break;
		deck.push(opts[Math.floor(rng() * opts.length)].id);
	}
	return deck;
}

// HS Duels loot buckets: each is a theme filter that rolls 3 matching cards
export const DUELS_BUCKETS = [
	{ id: 'beasts', name: 'Beasts', match: d => d.type === 'creature' && (d.tribe || '').includes('Beast') },
	{ id: 'dragons', name: 'Dragons', match: d => d.type === 'creature' && (d.tribe || '').includes('Dragon') },
	{ id: 'mechs', name: 'Mechs', match: d => d.type === 'creature' && (d.tribe || '').includes('Mech') },
	{ id: 'murlocs', name: 'Murlocs', match: d => d.type === 'creature' && (d.tribe || '').includes('Murloc') },
	{ id: 'elementals', name: 'Elementals', match: d => d.type === 'creature' && (d.tribe || '').includes('Elemental') },
	{ id: 'pirates', name: 'Pirates', match: d => d.type === 'creature' && (d.tribe || '').includes('Pirate') },
	{ id: 'naga', name: 'Naga', match: d => d.type === 'creature' && (d.tribe || '').includes('Naga') },
	{ id: 'demons', name: 'Demons', match: d => d.type === 'creature' && (d.tribe || '').includes('Demon') },
	{ id: 'undead', name: 'Undead', match: d => d.type === 'creature' && (d.tribe || '').includes('Undead') },
	{ id: 'menagerie', name: 'Menagerie', match: d => d.type === 'creature' && (d.tribe || '').length > 0 },
	{ id: 'big_bruisers', name: 'Big Bruisers', match: d => d.type === 'creature' && (d.cost || 0) >= 6 },
	{ id: 'lowbies', name: 'Lowbies', match: d => d.type === 'creature' && (d.cost || 0) <= 2 },
	{ id: 'big_spells', name: 'Big Spells', match: d => (d.type === 'sorcery' || d.type === 'instant') && (d.cost || 0) >= 5 },
	{ id: 'spellcraft', name: 'Spellcraft', match: d => d.type === 'sorcery' || d.type === 'instant' },
	{ id: 'deathrattle', name: 'Deathrattles', match: d => (d.keywords || []).includes('deathrattle') },
	{ id: 'taunt', name: 'Taunt Up', match: d => (d.keywords || []).includes('taunt') },
	{ id: 'divine_shield', name: 'Shields Up', match: d => (d.keywords || []).includes('divine_shield') },
];

// roll 3 cards for a bucket from the hero's pool (rarity-weighted)
export function rollBucket(cardsById, heroClass, bucket, rng, n = 3) {
	const pool = draftPool(cardsById, heroClass).filter(d => bucket.match(d));
	return draftOptions(pool, rng, n).map(c => c.id);
}

// offer `count` distinct buckets that actually have >= 3 matches for this class
export function offerBuckets(cardsById, heroClass, rng, count = 3) {
	const pool = draftPool(cardsById, heroClass);
	const usable = DUELS_BUCKETS.filter(b => pool.filter(d => b.match(d)).length >= 3);
	const out = [], avail = [...usable];
	while (out.length < count && avail.length) out.push(avail.splice(Math.floor(rng() * avail.length), 1)[0]);
	return out;
}

// the loot cadence (shared by player + enemy so parity is exact): 1 bucket per
// game, a passive after games 1/5/9, a treasure after games 3/7/11
export const PASSIVE_GAMES = [1, 5, 9];
export const TREASURE_GAMES = [3, 7, 11];
export const WINS_TO_CLEAR = 12;
export const LOSSES_TO_END = 3;

// what an enemy at `games` completed games should carry to match the player
export function enemyLoot(games) {
	const g = Math.max(0, games);
	return {
		buckets: g,
		passives: PASSIVE_GAMES.filter(x => x <= g).length,
		treasures: TREASURE_GAMES.filter(x => x <= g).length,
	};
}

// build a full generated enemy at exact parity: a 10-card draft + `games` buckets
// + the matching passive/treasure counts, all scaled to how deep the run is
export function generateEnemy(cardsById, heroClass, games, rng) {
	const deck = autoDraftDeck(cardsById, heroClass, rng, 10);
	const loot = enemyLoot(games);
	for (let b = 0; b < loot.buckets; b++) {
		const bk = offerBuckets(cardsById, heroClass, rng, 1)[0];
		if (bk) deck.push(...rollBucket(cardsById, heroClass, bk, rng, 3));
	}
	const treasurePool = Object.values(cardsById).filter(d => d.treasure && d.set === 'DUELS');
	for (let t = 0; t < loot.treasures && treasurePool.length; t++) deck.push(treasurePool[Math.floor(rng() * treasurePool.length)].id);
	const passiveKeys = Object.keys(PASSIVES);
	const passives = [];
	for (let pk = 0; pk < loot.passives && passiveKeys.length; pk++) passives.push(passiveKeys[Math.floor(rng() * passiveKeys.length)]);
	return { heroClass, deck, passives, loot };
}
// the enemy identities a run rolls (rival heroes, for name/portrait/class flavor)
export const RIVALS = [
	{ id: 'cafeteria_bob', name: 'Cafeteria Bob', heroClass: 'paladin', hsId: 'PVPDR_Hero_Bob' },
	{ id: 'brann', name: 'Brann Bronzebeard', heroClass: 'hunter', hsId: 'PVPDR_Hero_Brann' },
	{ id: 'darius', name: 'Darius Crowley', heroClass: 'warrior', hsId: 'PVPDR_Hero_Darius' },
	{ id: 'drekthar', name: "Drek'Thar", heroClass: 'shaman', hsId: 'PVPDR_Hero_DrekTharv3' },
	{ id: 'elise', name: 'Elise Starseeker', heroClass: 'druid', hsId: 'PVPDR_Hero_Elise' },
	{ id: 'finley', name: 'Sir Finley', heroClass: 'paladin', hsId: 'PVPDR_Hero_Finley' },
	{ id: 'kelthuzad', name: "Headmaster Kel'Thuzad", heroClass: 'mage', hsId: 'PVPDR_Hero_KelThuzad' },
	{ id: 'kulzon', name: 'Kulzon, Castmaster', heroClass: 'mage', hsId: 'PVPDR_Hero_Kulzon' },
	{ id: 'reno', name: 'Reno Jackson', heroClass: 'mage', hsId: 'PVPDR_Hero_Reno' },
	{ id: 'scarlet', name: 'Scarlet Leafdancer', heroClass: 'death_knight', hsId: 'PVPDR_Hero_Scarlet' },
	{ id: 'diablo', name: 'Diablo', heroClass: 'warrior', hsId: 'PVPDR_Hero_Diablo' },
];
