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
