// engine.js — Magepunk Battlecards rules engine (pure logic, no rendering).
// Ported from Magepunk66 Core/Modules/battlecards (Battlecards.lua, BattleEngine.lua,
// Combat.lua, Mana.lua, Hand.lua, Keyword.lua, CardEffect.lua) with the card-text
// mechanics those Lua files hadn't implemented yet scripted per card id.

export const KW = {
	TAUNT: 'taunt', CHARGE: 'charge', RUSH: 'rush', TRAMPLE: 'trample',
	FIRST_STRIKE: 'first_strike', WINDFURY: 'windfury', DEFENDER: 'defender',
	BATTLECRY: 'battlecry', DEATHRATTLE: 'deathrattle', LIFESTEAL: 'lifesteal',
	DIVINE_SHIELD: 'divine_shield', STEALTH: 'stealth', DEATHTOUCH: 'deathtouch',
	POISONOUS: 'poisonous', VENOMOUS: 'venomous', FREEZER: 'freezer',
	IMMUNE: 'immune', // can't take damage; "destroy" effects don't kill it either (only sacrifice)
	ELUSIVE: 'elusive', PIERCING: 'piercing',
	PACIFIST: 'pacifist',   // can't attack (Ragnaros, Ancient Watcher)
	CLEAVE: 'cleave',       // combat damage splashes to the defender's neighbors
	REBORN: 'reborn',       // first death returns it at 1 health
	SANGUINE: 'sanguine',   // attacking or being attacked banks a Blood Token
	IMPULSIVE: 'impulsive', // must attack: swings on its own before the turn ends
	CHROMATIC: 'chromatic', // color boosts roll twice and keep both
	FIREBREATHING: 'firebreathing', // pay 1 mana any number of times: +1 Attack this turn
	STATIC: 'static', // 50% chance to Paralyze any creature that survives combat with it
};

// a Paralyzed creature's attacks fail 50% of the time (coin flip after targeting)
function maybeParalyze(state, c) {
	if (!c || c.paralyzed || isDead(c) || state.rng() >= 0.5) return;
	c.paralyzed = true;
	emit(state, { type: 'paralyzed', uid: c.uid, name: c.name });
}

// Firebreathing grants a repeatable activated ability (spend 1 mana → +1 Attack
// until end of turn). Injected onto any creature that carries the keyword.
const FIREBREATHING_ABILITY = {
	cost: 1, repeatable: true,
	effects: [{ type: 'temp-buff-self', attack: 1 }],
	text: '+1 Attack this turn (repeatable)',
};
// KW.DEFENDER now means the PAPER keyword: a coin-flip chance to redirect
// attacks against your other permanents onto this creature.

export const MAX_BASE_MANA = 12;
export const MAX_HAND = 15;
export const MAX_SECRETS = 5;
export const MAX_PLAYERS = 8;
export const STARTING_LIFE = 40;
// capped zone sizes on the player board (the creature row is unlimited)
export const MAX_LANDS = 5;
export const MAX_TRAPS = 3;
export const MAX_QUESTS = 3;
export const MAX_HERO_POWERS = 3;
// paper rules: develop a land by paying 3 mana and giving each opponent a coin
export const LAND_COST = 3;

// per-color Boost d6 tables, straight from the design chart (2026-07-05).
// Entries whose systems don't exist yet fall back to +1/+1 with a note.
const PENDING = label => ({ label: `${label} (pending) → +1/+1`, attack: 1, health: 1 });
export const BOOST_TABLES = {
	W: [
		{ label: '+1/+1', attack: 1, health: 1 },
		{ label: 'Defender', keyword: 'defender' },
		{ label: 'Inspire: Bolster 1', ongoing: { on: 'hero-power-used', effects: [{ type: 'bolster', value: 1 }] } },
		{ label: 'Taunt', keyword: 'taunt' },
		{ label: 'Swift', keyword: 'first_strike' },
		{ label: 'Lifesteal', keyword: 'lifesteal' },
	],
	U: [
		{ label: 'Swing: Scry 1', ongoing: { on: 'self-attacks', effects: [{ type: 'scry', value: 1 }] } },
		{ label: '+3 Health', attack: 0, health: 3 },
		{ label: 'Spell Damage +1', static: { type: 'spell-damage', value: 1 } },
		{ label: 'Prowess', ongoing: { on: 'spell-played', effects: [{ type: 'temp-buff-self', attack: 1, health: 1 }] } },
		PENDING('Connect: Excavate'),
		{ label: 'Hexproof', keyword: 'elusive' },
	],
	B: [
		{ label: 'Venomous', keyword: 'venomous' },
		{ label: 'Ward: 2 Life', ward: { life: 2 } },
		PENDING('Swing: Advance'),
		{ label: 'Avenge 1: Gain 1 Life', ongoing: { on: 'friendly-creature-died', every: 1, effects: [{ type: 'heal', value: 1, target: 'self' }] } },
		{ label: 'Reborn', keyword: 'reborn' },
		{ label: 'Deathtouch', keyword: 'deathtouch' },
	],
	R: [
		PENDING('Inspire: Dredge'),
		PENDING('Deathrattle: Planeshift'),
		{ label: '+3 Attack', attack: 3, health: 0 },
		{ label: 'Cleave', keyword: 'cleave' },
		{ label: 'Sanguine', keyword: 'sanguine' },
		{ label: 'Impulsive', keyword: 'impulsive' },
	],
	G: [
		{ label: 'Connect: Adapt', ongoing: { on: 'self-hit-player', effects: [{ type: 'adapt' }] } },
		{ label: '+2/+2', attack: 2, health: 2 },
		{ label: 'Frenzy: Bolster 1', ongoing: { on: 'self-damaged', once: true, survives: true, effects: [{ type: 'bolster', value: 1 }] } },
		{ label: 'Inspire: Gain +1/+1', ongoing: { on: 'hero-power-used', effects: [{ type: 'buff-self', attack: 1, health: 1 }] } },
		{ label: 'Windfury', keyword: 'windfury' },
		{ label: 'Trample', keyword: 'trample' },
	],
};

// Adapt d10 (paper glossary; Stealth is permanent here rather than one-turn)
export const ADAPT_TABLE = [
	{ label: 'Divine Shield', keyword: 'divine_shield' },
	{ label: '+3 Attack', attack: 3, health: 0 },
	{ label: 'Deathrattle: two 1/1 Plants', deathrattle: [{ type: 'summon', count: 2, attack: 1, health: 1, name: 'Plant' }] },
	{ label: 'Windfury', keyword: 'windfury' },
	{ label: 'Elusive', keyword: 'elusive' },
	{ label: 'Taunt', keyword: 'taunt' },
	{ label: '+1/+1', attack: 1, health: 1 },
	{ label: '+3 Health', attack: 0, health: 3 },
	{ label: 'Stealth', keyword: 'stealth' },
	{ label: 'Poisonous', keyword: 'poisonous' },
];

// Cards whose mechanics aren't implemented yet (quests, quickdraw, inspire,
// weapon enchants) — excluded from generated decks; creatures among them would
// still function as vanilla bodies if added manually.
export const UNPLAYABLE = new Set(['silencer', 'westward_prosperity']);

// legacy hand-scripted cards: their effects arrays are handled by the scripted
// switch below, so the generic executor must not double-run them
const LEGACY_SCRIPTED = new Set([
	'wandering_merchant', 'legion_commander', 'pack_wolf', 'contract_killer',
	'tumbleweed_tactician', 'natures_blessing', 'fortify', 'rallying_cry',
	'wild_growth', 'mark_target', 'regroup',
]);

let nextUid = 1;

// ---------- card instances ----------
function instantiate(def, controller) {
	const card = {
		uid: nextUid++,
		id: def.id,
		name: def.name,
		type: def.type,
		cardClass: def.cardClass || 'neutral',
		cost: def.cost || 0,
		rarity: def.rarity,
		description: def.description || '',
		attack: def.attack || 0,
		maxHealth: def.health || 0,
		durability: def.durability || 0,
		secret: def.secret || null,
		trap: def.trap || null,
		mana: def.mana || 0,        // legacy lands: synthesized into a tap ability
		colors: def.colors || [],   // W/U/B/R/G identity ([] = colorless/class card)
		taps: def.taps || null,     // land tap abilities: [{ text, effects }]
		tapped: false,
		choices: def.choices || null, // Choose One branches: [{ text, effects }]
		chooseCount: def.chooseCount || null, // Choose Two: exactly N modes
		chooseMin: def.chooseMin || null,     // Choose one or more: at least N
		chooseMax: def.chooseMax || null,     // Choose one or more: at most N
		tempAttack: 0,               // "this turn" attack, expires at owner's turn end
		tempHealth: 0,               // "this turn" health (Prowess)
		power: def.power || null,   // hero power: { cost, effects }
		armor: def.armor || 0,      // Armor granted when a hero card is played
		quest: def.quest || null,   // quest: { goal: { type, count }, reward }
		ongoing: def.ongoing || null, // permanent trigger: { on, effects }
		static: def.static ? { ...def.static } : null,   // permanent passive (e.g. reduce-hero-damage)
		heroImmuneAura: def.heroImmuneAura || false,     // Mal'Ganis: your hero is Immune while this lives
		heroPowerCostSet: def.heroPowerCostSet ?? null,  // Maiden of the Lake: your Hero Power costs this
		redirectHeroDamage: def.redirectHeroDamage || false, // Bolf Ramshield: takes your hero's damage
		costReducePerTurn: def.costReducePerTurn || false,   // Nerubian Prophet: -1 cost each turn in hand
		transformInHand: def.transformInHand || false,       // Shifter Zerus: transforms each turn in hand
		summonOnDiscard: def.summonOnDiscard || false,       // Silverware Golem: summon it when discarded
		returnBuffedOnDiscard: def.returnBuffedOnDiscard || false, // Clutchmother Zavas: +2/+2 and return
		heroPowerHitsMinions: def.heroPowerHitsMinions || false, // Steamwheedle Sniper: Hero Power can target minions
		attackTax: def.attackTax ? { ...def.attackTax } : null, // Ghostly Prison: cost to attack this controller's hero
		addCost: def.addCost ? { ...def.addCost } : null, // additional casting cost: { discard: N } or { sacrifice: 'creature'|'land'|'artifact'|'artifact-or-creature' }
		altCost: def.altCost ? { ...def.altCost } : null, // optional cost paid INSTEAD of mana: { label, require?, life?, sacrificeLand?, exileFromHand?, opponentGain? }
		kicker: def.kicker ? JSON.parse(JSON.stringify(def.kicker)) : null, // optional ADDITIONAL cost for a bonus: { cost, effects }
		costMod: def.costMod || null, // board cost aura: { cardType, amount, scope, floor?, firstEachTurn? }
		heroPowerFreezes: !!def.heroPowerFreezes, // Ice Walker: your Hero Power also Freezes its target
		cheaperOnDeath: !!def.cheaperOnDeath, // Corridor Creeper: costs (1) less per creature that dies while in hand
		cheaperOnTribeDeath: def.cheaperOnTribeDeath || null, // Jumbo Imp: cheaper per friendly Demon that dies
		dormantBattlecry: !!def.dormantBattlecry, // The Darkness: fire the Battlecry even though it enters Dormant
		heroPowerDouble: !!def.heroPowerDouble, // Clockwork Automaton: double your Hero Power's damage and healing
		deathrattleDiscount: def.deathrattleDiscount || 0, // Reckless Experimenter: your Deathrattle creatures cost this much less
		overkill: def.overkill ? JSON.parse(JSON.stringify(def.overkill)) : null, // Rastakhan: excess-damage-on-attack trigger
		heroPowerAdjacent: !!def.heroPowerAdjacent, // Spirit of the Dragonhawk
		copiesOnDiscard: def.copiesOnDiscard || 0, // High Priestess Jekliik: add copies when discarded
		chameleosTransform: !!def.chameleosTransform, // Chameleos: morph into an enemy hand card each turn
		bandersmoshTransform: !!def.bandersmoshTransform, // Bandersmosh: morph into a 5/5 Legendary each turn
		selfCost: def.selfCost || null, // self-scaling printed cost: { per, amount }
		enrage: def.enrage || null,   // while damaged: { attack?, health?, keywords?, weaponAttack? }
		combo: def.combo || null,     // effects used instead when a card was played earlier this turn
		tradeable: !!def.tradeable,   // pay 1: shuffle back into the deck, draw a card
		battlecryDouble: !!def.battlecryDouble, // Brann: friendly battlecries fire twice
		rattleDouble: !!def.rattleDouble,       // Rivendare: friendly deathrattles fire twice
		counters: 0,                  // +1/+1 counters banked on this creature
		condAttack: def.condAttack || null, // "+N Attack while you have a weapon"
		attackAgainOnKill: !!def.attackAgainOnKill, // Rush hunters: kills refund the attack
		ward: def.ward ? { ...def.ward } : null, // cost to target: {mana?, life?, discard?}
		magnetic: !!def.magnetic,     // may merge onto a friendly Mech instead of playing
		echo: !!def.echo,             // leaves a ghost copy in hand until end of turn
		miniaturize: !!def.miniaturize, // playing it hands you a 1/1 Mini copy for 1
		echoGhost: false,
		dormantLeft: def.dormant || 0, // turns asleep: untouchable until it wakes
		awaken: def.awaken || null,    // effects fired when dormancy ends
		activated: def.activated || null, // creature abilities: [{cost, sacrifice, effects, text}]
		abilityUsedThisTurn: false,   // creatures never tap: abilities are once/turn
		xSpell: !!def.xSpell,         // spends all remaining mana; X = the excess
		attachments: [],              // names of auras enchanting this creature
		tapStone: false,              // double-tap: stone off next turn, untap after
		offTurnAttack: def.offTurnAttack || 0, // "+N Attack during your opponent's turn"
		statRule: def.statRule || null,   // 'attack-equals-health' (Lightspawn)
		selfScale: def.selfScale || null, // { attack, tribe }: +N per other <tribe> in play
		condKeyword: def.condKeyword || null, // { keyword, while: 'weapon' } (Southsea Deckhand)
		honorableKill: def.honorableKill || null, // effects on an EXACT lethal blow
		emerge: def.emerge || null,   // fires from hand when drawn/discovered (not opening hand)
		counterSpell: !!def.counterSpell, // instant that counters a spell on the stack
		counter: def.counter ? { ...def.counter } : null, // conditional counter: { type?, notType?, manaValue?, unlessPay?, to? }
		adventure: def.adventure ? JSON.parse(JSON.stringify(def.adventure)) : null, // {name,cost,type,effects}
		adventureSpent: false,        // the Adventure half has been cast; only the creature remains
		ongoings: def.ongoings ? JSON.parse(JSON.stringify(def.ongoings)) : null, // combined triggers
		medic: def.medic || 0,        // heals adjacent creatures N at end of turn
		overheal: def.overheal || null, // fires when a heal overflows past full Health (Overheal)
		corrupt: def.corrupt || null, // id of the corrupted (upgraded) form for Corrupt
		corruptGrow: def.corruptGrow ? { ...def.corruptGrow } : null, // endless Corrupt: +stats in place
		token: def.token || false,    // tokens are exiled on death — never hit the graveyard
		equip: def.equip || null,     // Equipment: { cost, attack?, health?, keywords? } — attach to a creature
		attachedTo: null,             // uid of the creature this Equipment rides (null = unattached)
		freeEquipMetalcraft: def.freeEquipMetalcraft || false, // Puresteel Paladin: equip {0} at 3+ artifacts
		sac: def.sac || null,         // field-token activation: { cost, discard?, effects }
		colossal: def.colossal || null, // appendage token ids summoned when this enters play
		colossalOf: def.colossalOf || null, // this token is an appendage of the named Colossal
		immuneWhile: def.immuneWhile || null, // immune while controlling a token of this name
		partPower: def.partPower || 0, // escalating appendage damage (Xhilag's Stalks)
		onSummon: def.onSummon || null, // "When summoned" effects for Colossal appendages
		heroWindfury: !!def.heroWindfury, // Azshara: your hero can attack twice
		healToMaxHealth: !!def.healToMaxHealth, // Arisen Onyxia: hero Health loss becomes max Health
		castOtherClassTwice: !!def.castOtherClassTwice, // Sinestra: off-class spells cast twice
		armsHitEnemyDeck: !!def.armsHitEnemyDeck, // Cho'gall: Arms/Soldiers destroy in the enemy deck
		aura: def.aura || null,       // { attack, health, tribe?, others?, adjacent?, position?, keywords? }
		auraAttack: 0,                // currently applied aura bonuses (recomputed)
		auraHealth: 0,
		auraKeywords: [],             // keywords this creature holds via auras
		loyalty: def.loyalty || 0,    // planeswalker loyalty counter
		abilities: def.abilities || null, // planeswalker: [{ cost, text, effects }]
		overload: def.overload || 0,  // mana locked next turn when played
		progress: 0,                // quest goal counter
		usedThisTurn: false,        // hero power activation gate
		damage: 0,
		keywords: [...(def.keywords || [])],
		effects: def.effects || null,
		outcast: def.outcast || null, // Ashes of Outland: extra battlecry/spell effect from hand's edge
		handDeathGrowth: !!def.handDeathGrowth, // Blood Herald: +1/+1 whenever a friendly minion dies while in hand
		heroPowerCostReduce: def.heroPowerCostReduce || 0, // Felfire Deadeye: your Hero Power costs this much less
		outcastCostReduce: def.outcastCostReduce || 0, // Line Hopper: your Outcast cards cost this much less
		healBonusHealth: def.healBonusHealth || 0, // Lightsteed: your heals also give the minion +Health
		foreignCostReduce: def.foreignCostReduce || 0, // Arcane Luminary: cards that didn't start in your deck cost less
		schoolCostReduce: def.schoolCostReduce ? { ...def.schoolCostReduce } : null, // Lady Anacondra: {school, amount}
		copyOnDraw: !!def.copyOnDraw, // Encumbered Pack Mule: drawing this adds a copy to hand
		deathrattle: def.deathrattle || null,
		tribe: def.tribe || null,
		controller,
		sick: true,
		attacksUsed: 0,
		stealthed: (def.keywords || []).includes(KW.STEALTH),
		shield: (def.keywords || []).includes(KW.DIVINE_SHIELD),
		marked: false, // mark_target
		paralyzed: false, // attacks fail 50% of the time (from a Static creature)
	};
	// Firebreathing creatures gain the repeatable "pay 1: +1 Attack" ability
	if (card.keywords.includes(KW.FIREBREATHING)) {
		card.activated = [...(card.activated || []), { ...FIREBREATHING_ABILITY }];
	}
	return card;
}

const TOKENS = {
	seedling:   { id: 'seedling',   name: 'Seedling',   type: 'creature', cost: 0, rarity: 'common', description: 'A humble sprout.', attack: 1, health: 1, tribe: 'Plant' },
	animal:     { id: 'animal',     name: 'Animal',     type: 'creature', cost: 0, rarity: 'common', description: 'A wild friend.', attack: 1, health: 1, tribe: 'Beast' },
	tumbleweed: { id: 'tumbleweed', name: 'Tumbleweed', type: 'creature', cost: 0, rarity: 'common', description: 'Rush.', attack: 2, health: 1, tribe: 'Plant', keywords: ['rush'] },
};

export function has(card, kw) {
	return card.keywords.includes(kw);
}
export function hp(card) {
	return card.maxHealth - card.damage;
}

// ---------- players ----------
export function opponentsOf(state, pi) {
	const out = [];
	for (let i = 0; i < state.players.length; i++) {
		if (i !== pi && !state.players[i].eliminated) out.push(i);
	}
	return out;
}

// ---------- game setup ----------
// `classPicks` (optional): one class object per player from classes.json —
// { id, name, power: { name, cost, effects|choices, text } | null, passive? }
export function createGame(cardsById, rng = Math.random, playerDeckIds = null, playerCount = 2, classPicks = null, loadouts = null) {
	// never in decks: companions/commanders (own zones), lands (bought from the
	// slot menu), and colored cards (conjured by lands during play)
	const playable = Object.values(cardsById).filter(d =>
		!UNPLAYABLE.has(d.id) && !d.companion && !d.commander && !d.token && d.collectible !== false
		&& d.type !== 'land' && !(d.colors && d.colors.length));
	const shuffle = ids => {
		for (let i = ids.length - 1; i > 0; i--) {
			const j = Math.floor(rng() * (i + 1));
			[ids[i], ids[j]] = [ids[j], ids[i]];
		}
		return ids;
	};
	// paper rules: your deck draws from your class pool (dual classes count)
	// plus neutrals; with no class picked, the whole playable pool is fair game
	const buildDeck = (classId) => {
		let pool = playable;
		if (classId) {
			pool = playable.filter(d => {
				const cc = d.cardClass || 'neutral';
				return cc === 'neutral' || cc === classId || cc.split('__').includes(classId);
			});
			if (pool.length < 30) pool = playable;
		}
		const ids = [];
		for (const d of pool) { ids.push(d.id, d.id); } // 2 copies of each
		return shuffle(ids).slice(0, 60);
	};
	const playerDeck = playerDeckIds?.length ? shuffle([...playerDeckIds]) : null;

	const mkPlayer = (classId) => ({
		life: STARTING_LIFE,
		armor: 0,
		heroClass: classId || null,
		deck: buildDeck(classId),
		hand: [],
		board: [],          // the Creatures row (no size limit)
		enchantments: [],   // unlimited rows (empty until those card types land)
		artifacts: [],
		planeswalkers: [],
		lands: [],          // capped zones, see MAX_* above
		traps: [],
		quests: [],
		heroPowers: [],
		sparked: false,          // Spark unlocks the planar die (Planeswalk)
		planarRollsThisTurn: 0,  // planar die: 1st roll free, each further roll +1 mana
		emblems: [],
		companion: null,
		command: [],
		exile: [],
		graveyard: [],
		weapon: null,
		secrets: [],
		heroAttacksUsed: 0,
		landsPlayedThisTurn: 0,
		fatigue: 0, // escalates each time a draw finds deck AND graveyard empty
		overloadPending: 0, // mana locked at the start of the next turn
		corpses: 0,         // Death Knight resource
		excavateCount: 0,   // Excavate: total digs this game (drives the looping tier)
		jadeCount: 0,       // Jade Golem size counter (per-player; each golem +1/+1, cap 30)
		heraldCount: 0,     // Herald: total this game (drives the Soldier's x1/x2/x4 scale)
		galakrondInvokes: 0, // Invoke Galakrond count (0-1 base, 2-3 upgraded, 4+ maxed)
		cthunAtk: 0, cthunHp: 0, cthunTaunt: false, // C'Thun buffs, persist across zones
		heroTempAttack: 0,  // "your hero has +N Attack this turn"
		costDiscounts: [],  // one-shot "next X costs (N) less" riders
		creaturesPlayedThisTurn: 0, // Pint-Sized-style first-creature discounts
		cardsPlayedThisTurn: 0,     // Combo activation (counts cards already resolved)
		drawsThisTurn: 0,           // Ponder: fires on every draw after the first this turn
		spellsPlayedThisTurn: 0,    // Kalecgos-style first-spell discounts
		freeSpellsNextTurn: false,  // Millhouse: spells free on your next turn
		freeSpellsThisTurn: false,
		spellsCostOneThisTurn: false, // Ysiel Windsinger: your spells cost (1) this turn
		nextComboDiscount: 0, // Foxy Fraud: your next Combo card this turn costs less
		corruptedPlayedIds: [], // Y'Shaarj: Corrupted cards you've played this game
		nextCardsDiscount: null, // Scabbs Cutterbutter: {count, amount} for your next cards this turn
		mana: { cur: 1, max: 1, bonus: 0 },
		coins: 0,
		diedThisTurn: 0,
		diedThisTurnIds: [], // Kel'Thuzad: non-token creatures that died this turn
		deathLogIds: [],     // Feugen/Stalagg: everything that died this game
		discardLogIds: [],   // Cho'gall: everything you discarded this game
		spellTaxNext: 0,     // Loatheb: extra cost on this player's spells next turn
		battlecryTaxNext: 0, // Boompistol Bully: extra cost on this player's Battlecry cards next turn
		libramDiscount: 0,   // Aldor Attendant/Truthseeker: your Librams cost this much less (game-long)
		heroPowerTaxNext: 0,      // Saboteur: your Hero Power costs more next turn
		heroPowerDiscountNext: 0, // Fencing Coach: your next Hero Power costs less
		heroPowersUsedGame: 0,    // Frost Giant: total Hero Powers used this game
		heroPowerFreeGame: false, // Raza the Chained: your Hero Power costs (0) this game
		nextMurlocFree: false,    // Seadevil Stinger: the next Murloc this turn is free
		nextSecretCost: null,     // Kabal Lackey: the next Secret this turn costs this much
		nextBattlecryDouble: false, // Murmuring Elemental: your next Battlecry this turn fires twice
		heroDamagedThisTurn: false, // Duskbat / Deathweb Spider: did your hero take damage this turn
		bigSpellsGame: 0,         // Dragoncaller Alanna: spells costing 5+ cast this game
		spellsOnFriendly: [],     // Lynessa Sunsorrow: spell ids you cast on your own creatures
		otherClassPlayedGame: [], // Tess Greymane: other-class card ids played this game
		battlecriesPlayedGame: [],// Shudderwock: Battlecry card ids played this game
		deckInnerFire: false,     // Lady in White: drawn creatures get Attack = Health
		pogoCount: 0,             // Pogo-Hopper: how many you've played this game
		invokeCount: 0,           // Descent of Dragons: times you've Invoked Galakrond
		nextSpellDamageBonus: 0,  // Celestial Emissary: your next spell has +N Spell Damage
		nextSpellDoubleCast: false, // Electra Stormsurge: your next spell casts twice
		spellsLifestealThisTurn: false, // Omega Mind: your spells have Lifesteal this turn
		elementalThisTurn: false, // played an Elemental this turn
		elementalLastTurn: false, // played an Elemental on your previous turn (Un'Goro)
		elementalsPlayedGame: 0,  // Ozruk: total Elementals played this game
		eliminated: false,
	});

	const n = Math.max(2, Math.min(MAX_PLAYERS, playerCount));
	const state = {
		cardsById,
		rng,
		players: Array.from({ length: n }, (_, i) => mkPlayer(classPicks?.[i]?.id)),
		current: 0,     // 0 = human; human goes first
		turnNumber: 1,
		over: false,
		winner: null,
		events: [],
		scryQueue: [],  // pending scry/gaze decisions: { chooser, deckOwner, ids }
		discardQueue: [], // pending Loot discards: { player, count }
		pickQueue: [],  // pending Discover/Draft picks: { player, ids, grant }
		askQueue: [],   // pending optional "you may …" yes/no prompts: { player, prompt, yes, no, then, else }
		sacQueue: [],   // pending sacrifice-as-cost picks: { player, kind, uids, addCostSpell }
		pendingReturns: [], // delayed blink: creatures to return at the next end step
		dredgeQueue: [], // pending Dredge decisions: { player, ids } (bottom-of-deck)
		stack: [],       // spells awaiting resolution (LIFO)
		priority: null,  // player who currently holds priority to respond (or null)
		passers: [],     // players who have passed priority since the last stack change
		priorityNext: 0, // where the next priority scan begins
		plane: null,    // the active MTG plane (shared arena state; null until first Planeshift)
	};
	if (playerDeck) state.players[0].deck = playerDeck;

	// class starting hero powers occupy one of the three power slots
	if (classPicks) {
		state.players.forEach((p, i) => {
			const pick = classPicks[i];
			if (!pick?.power) return;
			const card = instantiate({
				id: pick.id + '_power', name: pick.power.name, type: 'heropower',
				cost: 0, rarity: 'basic',
				power: { cost: pick.power.cost, effects: pick.power.effects || null, choices: pick.power.choices || null },
				description: `Hero Power (${pick.power.cost}): ${pick.power.text}`,
				cardClass: pick.id,
			}, i);
			card.zone = 'heropower';
			p.heroPowers.push(card);
		});
	}

	// commander + companion: when a per-deck loadout is supplied use the chosen
	// cards (both optional — a deck may bring one, both, or neither); otherwise
	// (single-player / dungeon) deal a random one of each, as before.
	const companions = Object.values(cardsById).filter(d => d.companion);
	const commanders = Object.values(cardsById).filter(d => d.commander);
	state.players.forEach((p, i) => {
		const lo = loadouts ? (loadouts[i] || {}) : null;
		const compId = lo ? lo.companion : (companions.length ? companions[Math.floor(rng() * companions.length)].id : null);
		const cmdId = lo ? lo.commander : (commanders.length ? commanders[Math.floor(rng() * commanders.length)].id : null);
		if (compId && cardsById[compId]?.companion) {
			p.companion = instantiate(cardsById[compId], i);
			p.companion.zone = 'companion';
		}
		if (cmdId && cardsById[cmdId]?.commander) {
			const c = instantiate(cardsById[cmdId], i);
			c.zone = 'command';
			c.commander = true;
			p.command = [c];
		}
	});

	// starting hands: 1st player 3 cards, everyone after 4 cards + The Coin
	drawCards(state, 0, 3);
	for (let i = 1; i < n; i++) {
		drawCards(state, i, 4);
		addCoin(state, i);
	}
	state.dealt = true; // opening hands are dealt; Emerge fires on draws/adds from here
	for (const p of state.players) p.openingHand = p.hand.map(c => c.id); // Hex Lord Malacrass
	emit(state, { type: 'turnStart', player: 0, turnNumber: 1 });
	drawCards(state, 0, 1); // start-of-turn draw (BattleEngine.startPhase draws on turn 1 too)
	return state;
}

function emit(state, ev) {
	state.events.push(ev);
}

// ---------- zones ----------
export function drawCards(state, pi, count) {
	const p = state.players[pi];
	let drawn = 0; // cards that actually reached hand (not fatigue/burn/bomb) — for "if you do"
	for (let i = 0; i < count; i++) {
		if (p.deck.length === 0 && p.graveyard.length > 0) {
			// reshuffle graveyard ids into deck (per BattleEngine.startPhase);
			// summoned tokens have no card def and can't be redrawn; token
			// CARDS (Bananas, Blood Tokens) cease to exist like MTG tokens
			p.deck = p.graveyard.map(c => c.id).filter(id => state.cardsById[id] && !state.cardsById[id].token);
			p.graveyard = [];
			for (let k = p.deck.length - 1; k > 0; k--) {
				const j = Math.floor(state.rng() * (k + 1));
				[p.deck[k], p.deck[j]] = [p.deck[j], p.deck[k]];
			}
			if (p.deck.length) emit(state, { type: 'reshuffle', player: pi });
		}
		const id = p.deck.pop();
		if (!id) {
			// nothing to reshuffle either: truly out of cards — fatigue
			p.fatigue++;
			emit(state, { type: 'fatigue', player: pi, amount: p.fatigue });
			damageHero(state, pi, p.fatigue, pi);
			checkGameOver(state);
			if (p.eliminated || state.over) break;
			continue;
		}
		// Bomb / Mine: an enemy shuffled it in — it explodes on draw
		if (id === 'bomb' || id === 'mine') {
			emit(state, { type: 'bombDetonated', player: pi });
			damageHero(state, pi, id === 'mine' ? 10 : 5, pi); // Iron Juggernaut's Mine hits for 10
			checkGameOver(state);
			if (p.eliminated || state.over) break;
			continue;
		}
		// draw-trigger tokens (Fal'dorei Ambush, The Darkness's Candle): fire an
		// effect on draw and are consumed instead of entering the hand
		const trigDef = state.cardsById[id];
		if (trigDef && trigDef.drawTrigger) {
			emit(state, { type: 'drawTrigger', player: pi, cardId: id, name: trigDef.name });
			execEffects(state, pi, trigDef.onDraw || [], null, null);
			checkGameOver(state);
			if (p.eliminated || state.over) break;
			continue;
		}
		// No burn on overdraw: hand may exceed MAX_HAND during your turn and is
		// trimmed back down at end of turn (MTG-style cleanup discard).
		const card = instantiate(state.cardsById[id], pi);
		card.fromDeck = true; // drawn from your deck — Leyline Manipulator ignores these
		card.drawnThisTurn = true; // Keli'dan the Breaker: "If drawn this turn"
		if (p.deckInnerFire && card.type === 'creature') card.attack = card.maxHealth; // Lady in White
		if (card.type === 'creature' && p.drawBuff) { card.attack += p.drawBuff.attack || 0; card.maxHealth += p.drawBuff.health || 0; }
		if (card.type === 'creature' && p.drawBuffTribe) { for (const tr in p.drawBuffTribe) if ((card.tribe || '').includes(tr)) { card.attack += p.drawBuffTribe[tr].attack || 0; card.maxHealth += p.drawBuffTribe[tr].health || 0; } } // Shan'do Wildclaw
		if (p.corruptDeckDiscount && (card.corrupt || card.corruptGrow)) card.cost = Math.max(0, (card.cost || 0) - p.corruptDeckDiscount); // Dark Inquisitor Xanesh
		if (card.type === 'creature' && p.deckTribeDiscount) { for (const tr in p.deckTribeDiscount) if ((card.tribe || '').includes(tr)) card.cost = Math.max(0, (card.cost || 0) - p.deckTribeDiscount[tr]); } // Frizz Kindleroost
		// C'Thun enters hand carrying every buff it collected while in your deck
		if (card.id === 'c_thun') { card.attack = CTHUN_BASE + p.cthunAtk; card.maxHealth = CTHUN_BASE + p.cthunHp; if (p.cthunTaunt && !card.keywords.includes(KW.TAUNT)) card.keywords.push(KW.TAUNT); }
		card.zone = 'hand';
		if (state.hpResolver === pi && staticValue(p, 'hero-power-draw-zero') > 0) card.cost = 0; // Wilfred Fizzlebang
		if (!p.stealerUsedThisTurn && p.board.some(x => x.id === 'stealer_of_souls' && !isDead(x))) { card.cost = 0; p.stealerUsedThisTurn = true; } // Stealer of Souls (Health-cost approximated as free)
		if (p.nextDrawDiscount > 0) { card.cost = Math.max(0, (card.cost || 0) - p.nextDrawDiscount); p.nextDrawDiscount = 0; } // SI:7 Skulker
		if (p.castWhenDrawn > 0 && isSpellType(card) && !card.counterSpell && !card.xSpell) { // Sheldras Moontree
			p.castWhenDrawn -= 1;
			const spec = targetSpec(state, pi, card, null); let tgt = null;
			if (spec) { const legal = legalTargets(state, pi, spec); tgt = legal.length ? legal[Math.floor(state.rng() * legal.length)] : null; if (spec.required && !tgt) { p.hand.push(card); drawn++; continue; } }
			emit(state, { type: 'conjure', player: pi, card, color: null });
			runSpell(state, pi, card, tgt, card.choices ? 0 : null); sweepDeaths(state);
			drawn++; continue;
		}
		p.hand.push(card);
		if (card.copyOnDraw && state.cardsById[card.id] && p.hand.length < MAX_HAND) { const cp = instantiate(state.cardsById[card.id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } // Encumbered Pack Mule
		drawn++;
		emit(state, { type: 'draw', player: pi, card });
		questTick(state, 'draw', pi, 1, card);
		// Ponder: fires on every card drawn after your first draw of the turn
		p.drawsThisTurn = (p.drawsThisTurn || 0) + 1;
		if (p.drawsThisTurn > 1) firePonder(state, pi, { drawn: card });
		fireEmerge(state, pi, card);
		// Chromaggus: "whenever you draw a card…" (guard against re-entrant copies)
		if (state.dealt && !state.drawTrigLock) {
			state.drawTrigLock = true;
			try { fireOngoing(state, pi, 'card-drawn', { card }); }
			finally { state.drawTrigLock = false; }
		}
		// opponents may react to your draw (Smothering Tithe: pay {2} or I get a Treasure)
		if (state.dealt && !state.enemyDrawLock) {
			state.enemyDrawLock = true;
			try { for (let s2 = 0; s2 < state.players.length; s2++) if (s2 !== pi && !state.players[s2].eliminated) fireOngoing(state, s2, 'enemy-draws', { drawer: pi, card }); }
			finally { state.enemyDrawLock = false; }
		}
	}
	return drawn;
}

// Ponder triggers on extra draws / scry / dredge / gaze. A re-entrancy lock
// stops a Ponder effect that itself draws or scries from re-triggering Ponder.
function firePonder(state, pi, ctx = {}) {
	if (state.ponderLock) return;
	state.ponderLock = true;
	try { fireOngoing(state, pi, 'ponder', ctx); }
	finally { state.ponderLock = false; }
}

// Emerge: a card's effect that fires the moment it is drawn or added to a hand
// (from hand, not the board). The lock guards against an Emerge that draws more.
function fireEmerge(state, pi, card) {
	if (!state.dealt || state.emergeLock || !(card && card.emerge && card.emerge.length)) return;
	state.emergeLock = true;
	try { execEffects(state, pi, card.emerge, null, card); }
	finally { state.emergeLock = false; }
}

function toGraveyard(state, pi, card) {
	// Tokens (summoned creatures, Blood/Clue/Food/Treasure, etc.) are exiled
	// instead of hitting the graveyard — MTG-style, they leave no corpse and
	// can't be referenced, reanimated, or reshuffled from the grave. Coins are
	// NOT tokens, so they fall through to the graveyard and can reshuffle.
	if (card.token || (card.tribe || '').split(/\s+/).includes('Token')) {
		card.zone = 'exile';
		state.players[pi].exile.push(card);
		return;
	}
	state.players[pi].graveyard.push(card);
}

// ---------- mana ----------
export function availableMana(p) {
	return p.mana.cur + p.mana.bonus;
}
function spendMana(p, amount) {
	const fromBonus = Math.min(p.mana.bonus, Math.max(0, amount - p.mana.cur));
	p.mana.bonus -= fromBonus;
	p.mana.cur -= (amount - fromBonus);
}

// ---------- targeting ----------
// effect target values that require the player to choose something
const CHOSEN = {
	damage: { any: 'any', creature: 'creature', 'enemy-creature': 'enemy-creature', 'undamaged-creature': 'creature', 'enemy-any': 'enemy-any' },
	heal: { any: 'any', creature: 'creature' },
	buff: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'grant-ongoing': { 'friendly-creature': 'friendly-creature' },
	'grant-static': { 'friendly-creature': 'friendly-creature' },
	grant: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'grant-spell-damage': { 'friendly-creature': 'friendly-creature', creature: 'creature' },
	'damage-per-cards-played': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'damage-target-by-attack': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'grant-immune-turn': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'damage-stealth-on-kill': { creature: 'creature', 'enemy-creature': 'enemy-creature', any: 'any', 'enemy-any': 'enemy-any' },
	'make-dormant': { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	'damage-target-and-same-tribe': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'damage-chain-neighbors': { 'enemy-creature': 'enemy-creature', creature: 'creature' },
	kelidan: { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'become-copy-of-target': { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	'steal-until-bigger': { 'enemy-creature': 'enemy-creature', creature: 'creature' },
	'swap-with-hand': { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	'shuffle-copies-of-target': { 'friendly-creature': 'friendly-creature', creature: 'creature' },
	'destroy-fragment-then-damage': { any: 'any', 'enemy-any': 'enemy-any', creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'transform-into-token': { 'friendly-creature': 'friendly-creature', creature: 'creature' },
	'mark-doomed': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'devour-target': { 'friendly-creature': 'friendly-creature' },
	fireworks: { 'friendly-creature': 'friendly-creature' },
	'bounce-and-buff': { 'friendly-creature': 'friendly-creature' },
	'copy-health': { 'friendly-creature': 'friendly-creature' },
	'transform-target-into-source': { 'friendly-creature': 'friendly-creature' },
	'mark-summon-copy': { 'enemy-creature': 'enemy-creature' },
	'destroy-all-copies': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'copy-to-all-zones': { 'friendly-creature': 'friendly-creature' },
	destroy: { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	'copy-to-hand': { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	'copy-summon': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'summon-with-stats': { 'friendly-creature': 'friendly-creature' },
	exile: { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'exile-until-return': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	blink: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	fight: { 'friendly-creature': 'friendly-creature', creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'attach-equip': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	disguise: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	freeze: { any: 'any', creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'trigger-one-deathrattle': { 'friendly-creature': 'friendly-creature' },
	silence: { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'temp-buff': { creature: 'creature', 'friendly-creature': 'friendly-creature', 'friendly-any': 'friendly-any' },
	'heal-full': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'set-health': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'set-attack': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'attack-equals-health': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'double-health': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'double-attack': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	bounce: { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature', permanent: 'permanent' },
	'mind-control': { 'enemy-creature': 'enemy-creature' },
	transform: { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	'transform-copy': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'swap-health-with': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'swap-stats-with': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'copy-stats': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'copy-to-hand-cheap': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'destroy-and-remember': { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	'copy-to-deck': { 'friendly-creature': 'friendly-creature', creature: 'creature' },
	'summon-copies-from-deck': { 'friendly-creature': 'friendly-creature', creature: 'creature' },
	'blade-of-cthun': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	conditional: { any: 'any', creature: 'creature' },
	'damage-then': { any: 'any', creature: 'creature' },
	'draw-damage': { any: 'any' },
	'grant-deathrattle': { creature: 'creature' },
	'copy-deathrattle': { 'friendly-creature': 'friendly-creature' },
	attach: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'attach-curse': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'add-counters': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'temp-immune': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'swap-stats': { creature: 'creature' },
	shadowflame: { 'friendly-creature': 'friendly-creature' },
	swipe: { 'enemy-any': 'enemy-any' },
	'damage-adjacent': { creature: 'creature' },
	betrayal: { 'enemy-creature': 'enemy-creature' },
	doom: { 'friendly-creature': 'friendly-creature' },
	corrupt: { 'enemy-creature': 'enemy-creature' },
	'mind-control-temp': { 'enemy-creature': 'enemy-creature' },
	'set-hero-health': { 'any-hero': 'any-hero' },
};

// Choose One cards resolve to one branch's effects at play time
export function effectsOf(card, choice) {
	if (card.choices) {
		// choose-two / choose-one-or-more pass an array of chosen mode indices
		if (Array.isArray(choice)) return choice.flatMap(i => card.choices[i]?.effects || []);
		return card.choices[choice ?? 0]?.effects || [];
	}
	return card.effects;
}

// Combo cards act on their combo line instead when another card was already
// played this turn (cardsPlayedThisTurn counts only fully-resolved cards)
export function comboActive(state, pi) {
	return state.players[pi].cardsPlayedThisTurn >= 1;
}
export function liveEffectsOf(state, pi, card, choice) {
	if (card.combo && comboActive(state, pi)) return card.combo;
	const base = effectsOf(card, choice) || [];
	// Kicker: when kicked, the bonus effects run in addition to the base ones
	if (card._kicked && card.kicker && card.kicker.effects) return [...base, ...card.kicker.effects];
	return base;
}
export function canKick(state, pi, card) {
	return !!(card.kicker && availableMana(state.players[pi]) >= effectiveCost(state, pi, card) + card.kicker.cost);
}

// Returns null (no target needed) or { targets, filter(card)?, required, why }
// `choice` selects a Choose One branch before deriving the target.
export function targetSpec(state, pi, card, choice) {
	// hand-scripted legacy cards keep their bespoke specs
	if (card.type === 'creature') {
		switch (card.id) {
			case 'contract_killer':
				return { targets: 'creature', filter: c => hp(c) <= 3, required: false, why: 'a creature with 3 or less Health' };
			case 'tumbleweed_tactician':
				return { targets: 'enemy-creature', required: false, why: 'an enemy creature' };
		}
	}
	switch (card.id) {
		case 'backstab':
			return { targets: 'creature', filter: c => c.damage === 0, required: true, why: 'an undamaged creature' };
		case 'fortify':
			return { targets: 'creature', required: true, why: 'a creature' };
		case 'mark_target':
			return { targets: 'enemy-creature', required: true, why: 'an enemy creature' };
	}
	// choose-one cards with no branch picked yet: the branch menu comes first
	if (card.choices && choice == null) return null;
	// generic: derive from the first effect that needs a chosen target
	// (combo-aware: an active combo line replaces the base effects)
	for (const e of liveEffectsOf(state, pi, card, choice) || []) {
		let kind = CHOSEN[e.type]?.[e.target];
		// "the enemy hero" is unambiguous in 1v1 but a choice with 3+ players;
		// Joust likewise lets you pick which opponent to Joust against
		if (!kind && e.target === 'enemy-hero' && (e.type === 'damage' || e.type === 'joust') && opponentsOf(state, pi).length > 1) {
			kind = 'enemy-hero';
		}
		if (!kind) continue;
		let filter = null, why = {
			any: 'any target', creature: 'a creature',
			'enemy-creature': 'an enemy creature', 'friendly-creature': 'a friendly creature',
			'friendly-any': 'a friendly character', 'enemy-hero': 'an enemy hero',
			'enemy-any': 'an enemy', 'any-hero': 'a hero', permanent: 'any permanent',
		}[kind];
		if (e.target === 'undamaged-creature') { filter = c => c.damage === 0; why = 'an undamaged creature'; }
		if (e.maxAttack != null) { filter = c => c.attack <= e.maxAttack; why = `a creature with ${e.maxAttack} or less Attack`; }
		if (e.maxCost != null) { filter = c => (c.cost || 0) <= e.maxCost; why = `a creature that costs ${e.maxCost} or less`; }
		if (e.minAttack != null) { filter = c => c.attack >= e.minAttack; why = `a creature with ${e.minAttack} or more Attack`; }
		if (e.requireKeyword != null) { filter = c => c.keywords.includes(e.requireKeyword); why = `a creature with ${e.requireKeyword.replace(/_/g, ' ')}`; }
		if (e.requireDamaged) { filter = c => c.damage > 0; why = 'a damaged creature'; }
		if (e.excludeSelf) { const prev = filter; filter = c => c !== card && (!prev || prev(c)); why = (why || 'a creature') + ' other than this'; }
		if (e.tribe) {
			const tribes = e.tribe.split('|');
			filter = c => tribes.some(t => (c.tribe || '').includes(t));
			why = `a friendly ${e.tribe.replace(/\|/g, '/')}`;
		}
		// spells need their target; creature/weapon battlecries fizzle without one.
		// picking which opponent (enemy-hero, e.g. Joust/multi-target burn) is required.
		const required = kind === 'enemy-hero' || (card.type !== 'creature' && card.type !== 'weapon');
		return { targets: kind, filter, required, why };
	}
	return null;
}

export function legalTargets(state, pi, spec) {
	const out = [];
	const opps = opponentsOf(state, pi);
	// Spellward Jeweler: an Elusive enemy hero can't be targeted this window
	const pushHero = (side) => { if (side !== pi && (state.players[side].heroElusiveUntil || 0) >= state.turnNumber) return; out.push({ type: 'hero', player: side }); };
	const pushCreatures = (side) => {
		for (const c of state.players[side].board) {
			if (c.type === 'location') continue; // locations aren't creatures
			if (c.dormantLeft > 0) continue;     // dormant: untouchable
			if (side !== pi && c.stealthed) continue; // stealth: untargetable by opponent
			if (side !== pi && has(c, KW.ELUSIVE)) continue; // elusive: no enemy spells/powers
			if (!spec.filter || spec.filter(c)) out.push({ type: 'creature', uid: c.uid, player: side });
		}
	};
	if (spec.targets === 'any') {
		pushCreatures(pi);
		for (const o of opps) pushCreatures(o);
		out.push({ type: 'hero', player: pi });
		for (const o of opps) pushHero(o);
	}
	if (spec.targets === 'creature') { pushCreatures(pi); for (const o of opps) pushCreatures(o); }
	if (spec.targets === 'enemy-creature') { for (const o of opps) pushCreatures(o); }
	if (spec.targets === 'friendly-creature') { pushCreatures(pi); }
	if (spec.targets === 'friendly-any') { pushCreatures(pi); out.push({ type: 'hero', player: pi }); }
	if (spec.targets === 'enemy-hero') { for (const o of opps) pushHero(o); }
	if (spec.targets === 'enemy-any') {
		for (const o of opps) { pushCreatures(o); pushHero(o); }
	}
	if (spec.targets === 'any-hero') {
		out.push({ type: 'hero', player: pi });
		for (const o of opps) pushHero(o);
	}
	if (spec.targets === 'permanent') {
		const pushPermanents = (side) => {
			const P = state.players[side];
			for (const c of P.board) {
				if (c.dormantLeft > 0) continue;
				if (side !== pi && (c.stealthed || has(c, KW.ELUSIVE))) continue;
				if (!spec.filter || spec.filter(c)) out.push({ type: c.type === 'location' ? 'location' : 'creature', uid: c.uid, player: side });
			}
			for (const c of P.artifacts) if (!spec.filter || spec.filter(c)) out.push({ type: 'artifact', uid: c.uid, player: side });
			for (const c of P.enchantments) if (!spec.filter || spec.filter(c)) out.push({ type: 'enchantment', uid: c.uid, player: side });
			for (const c of P.planeswalkers) if (!spec.filter || spec.filter(c)) out.push({ type: 'walker', uid: c.uid, player: side });
		};
		pushPermanents(pi);
		for (const o of opps) pushPermanents(o);
	}
	return out;
}

function findCreature(state, uid) {
	for (const p of state.players) {
		const c = p.board.find(c => c.uid === uid);
		if (c) return c;
	}
	return null;
}

// token permanents (Blood/Treasure/Food) materialize in the artifact row;
// they carry a `sac` activation and are clicked/AI-cashed from the field
function gainTokenCard(state, pi, id) {
	const p = state.players[pi];
	const def = state.cardsById[id];
	if (!def || p.eliminated) return;
	const card = instantiate(def, pi);
	card.zone = 'artifact';
	p.artifacts.push(card);
	emit(state, { type: 'tokenGained', player: pi, card });
}
const gainBloodToken = (state, pi) => gainTokenCard(state, pi, 'blood_token');
// add a specific card (by id) to a player's hand — used by Excavate treasures
function addCardToHand(state, pi, id) {
	const p = state.players[pi];
	const def = state.cardsById[id];
	if (!def || p.eliminated) return null;
	const card = instantiate(def, pi);
	card.zone = 'hand';
	p.hand.push(card);
	emit(state, { type: 'conjure', player: pi, card, color: null });
	fireEmerge(state, pi, card);
	return card;
}

// Excavate: dig up a treasure, then the next dig is one tier higher; after the
// Legendary tier it loops back to Common. Tiers 1-4 are fixed; the Legendary
// tier hands you one of your class's Azerite treasures.
const EXCAVATE_TIERS = ['fools_azerite', 'azerite_fragment', 'azerite_chunk', 'azerite_gem'];
const EXCAVATE_LEGENDARIES = {
	barbarian: ['the_azerite_mammoth'], bard: ['the_azerite_dolphin'], bounty_hunter: ['the_azerite_horse'],
	centurion: ['the_azerite_beetle', 'the_azerite_goat'], death_knight: ['the_azerite_rat'],
	demon_hunter: ['the_azerite_pig'], druid: ['the_azerite_monkey'], hunter: ['the_azerite_lynx'],
	mage: ['the_azerite_hawk'], naturalist: ['the_azerite_tiger', 'the_azerite_wolf'],
	paladin: ['the_azerite_dragon', 'the_azerite_goat'], priest: ['the_azerite_rooster'],
	ranger: ['the_azerite_rabbit'], rogue: ['the_azerite_scorpion'],
	shaman: ['the_azerite_murloc', 'the_azerite_wolf'], sorcerer: ['the_azerite_hydra'],
	warlock: ['the_azerite_snake'], warrior: ['the_azerite_ox'], wizard: ['the_azerite_otter'],
};
const ALL_AZERITE_LEGENDARIES = [...new Set(Object.values(EXCAVATE_LEGENDARIES).flat())];


// The Coin: an opponent developing a land (or a "gain a coin" effect) puts a
// coin CARD into your hand instead of a hidden counter — play it any time for
// +1 mana this turn, Hearthstone-style.
export function addCoin(state, pi) {
	const p = state.players[pi];
	if (p.eliminated) return;
	const def = state.cardsById['coin'];
	if (!def) { p.coins = (p.coins || 0) + 1; return; } // fallback if the card is missing
	const card = instantiate(def, pi);
	card.zone = 'hand';
	p.hand.push(card);
	emit(state, { type: 'coinGiven', player: pi, card });
}

// Tradeable: instead of playing the card, pay 1 mana to shuffle it back
// into your deck and draw a card (user ruling)
export function canTrade(state, pi, card) {
	if (state.over || state.current !== pi) return false;
	const p = state.players[pi];
	return !!card.tradeable && p.hand.includes(card) && availableMana(p) >= 1;
}

export function tradeCard(state, pi, uid) {
	const p = state.players[pi];
	const card = p.hand.find(c => c.uid === uid);
	if (!card || !canTrade(state, pi, card)) return false;
	spendMana(p, 1);
	p.hand = p.hand.filter(c => c !== card);
	p.deck.push(card.id);
	for (let k = p.deck.length - 1; k > 0; k--) {
		const j = Math.floor(state.rng() * (k + 1));
		[p.deck[k], p.deck[j]] = [p.deck[j], p.deck[k]];
	}
	emit(state, { type: 'traded', player: pi, card });
	fireOngoing(state, pi, 'traded', {});
	drawCards(state, pi, 1);
	return true;
}

export function canSacrifice(state, pi, card) {
	if (state.over || state.current !== pi) return false;
	const p = state.players[pi];
	if (!card.sac || !p.artifacts.includes(card)) return false;
	if (availableMana(p) < (card.sac.cost || 0)) return false;
	if (card.sac.discard && p.hand.length < card.sac.discard) return false;
	return true;
}

export function sacrificeToken(state, pi, uid) {
	const p = state.players[pi];
	const card = p.artifacts.find(c => c.uid === uid);
	if (!card || !canSacrifice(state, pi, card)) return false;
	spendMana(p, card.sac.cost || 0);
	p.artifacts = p.artifacts.filter(c => c !== card);
	emit(state, { type: 'tokenSacrificed', player: pi, card });
	fireOngoing(state, pi, 'token-sacrificed', { played: card }); // "whenever you sacrifice a Food"
	if (card.sac.discard) {
		// the discard is the player's choice; rewards resolve after it
		state.discardQueue.push({ player: pi, count: Math.min(card.sac.discard, p.hand.length), then: card.sac.effects });
		emit(state, { type: 'lootStart', player: pi, count: card.sac.discard });
	} else {
		execEffects(state, pi, card.sac.effects, null, card);
	}
	sweepDeaths(state);
	return true;
}

// ---------- damage / healing ----------
function damageCreature(state, target, amount, source) {
	if (target.type === 'location') return 0; // locations only wear out by tapping
	if (target.dormantLeft > 0) return 0;     // dormant: immune while asleep
	if (amount <= 0) return 0;
	// Snapjaw Shellfighter: an adjacent friendly Snapjaw soaks damage meant for its neighbors
	if (!target._snapjawGuard) {
		const ob = state.players[target.controller]?.board;
		if (ob) { const oi = ob.indexOf(target);
			const guard = [ob[oi - 1], ob[oi + 1]].find(n => n && n.id === 'snapjaw_shellfighter' && !isDead(n) && n !== source);
			if (guard) { guard._snapjawGuard = true; const d = damageCreature(state, guard, amount, source); guard._snapjawGuard = false; return d; }
		}
	}
	if (state.hpResolver != null && state.players[state.hpResolver]) state.players[state.hpResolver].hpDamageGame = (state.players[state.hpResolver].hpDamageGame || 0) + amount; // Jan'alai
	if (has(target, KW.IMMUNE)) return 0; // Immune: prevents all damage
	if (target.immuneTurn === state.turnNumber) return 0; // temporary Immune (Bestial Wrath / Stablemaster)
	// Colaque: immune while it controls its Shell appendage
	if (target.immuneWhile && state.players[target.controller].board.some(c =>
		!isDead(c) && c.name === target.immuneWhile)) return 0;
	if (target.shield) {
		target.shield = false;
		emit(state, { type: 'shieldPop', uid: target.uid });
		fireOngoing(state, target.controller, 'friendly-divine-shield-lost', {}); // Bolvar, Fireblood
		return 0;
	}
	target.damage += amount;
	if (target.damage === target.maxHealth) state.exactKills = (state.exactKills || 0) + 1;
	if (source) {
		// Deathtouch: any damage it deals destroys the creature (persistent).
		if (has(source, KW.DEATHTOUCH)) target.doomed = true;
		// Venomous: like Deathtouch but one-shot — it's spent after the first kill.
		if (has(source, KW.VENOMOUS)) {
			target.doomed = true;
			source.keywords = source.keywords.filter(k => k !== KW.VENOMOUS);
			emit(state, { type: 'venomSpent', uid: source.uid });
		}
		// Poisonous: doesn't kill outright — it inflicts the Poisoned condition
		// (2 damage at the end of its controller's turn).
		if (has(source, KW.POISONOUS)) target.poisoned = true;
	}
	// Commanding Shout: friendly creatures can't drop below 1 health this turn
	const owner = state.players[target.controller];
	if (owner?.minionsSurviveTurn === state.turnNumber && target.damage >= target.maxHealth) {
		target.damage = target.maxHealth - 1;
		target.doomed = false;
	}
	emit(state, { type: 'damage', targetType: 'creature', uid: target.uid, amount, hp: hp(target) });
	if (amount > 0 && target.diesOnDamage && !isDead(target)) target.damage = target.maxHealth; // Jandice Barov's cursed copy
	if (target.enrage || target.statRule) recomputeAuras(state); // enrage/Lightspawn track damage
	// whenever-a-minion-takes-damage triggers (fires even if the hit is lethal);
	// Frenzy variants fire once and only on surviving the hit. Boosts can stack
	// extra self-damaged triggers into `ongoings`, so check both slots.
	const selfDmgTrigs = [];
	if (target.ongoing?.on === 'self-damaged') selfDmgTrigs.push(target.ongoing);
	if (target.ongoings) for (const o of target.ongoings) if (o.on === 'self-damaged') selfDmgTrigs.push(o);
	for (const o of selfDmgTrigs) {
		if (o.spent) continue;
		if (!o.survives || !isDead(target)) {
			if (o.once) { o.spent = true; if (o === target.ongoing) target.ongoing = null; }
			runSecretEffects(state, target.controller, o.effects, { self: target, damaged: target, amount });
		}
	}
	for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'creature-damaged', { damaged: target });
	fireOngoing(state, target.controller, 'friendly-creature-damaged', { damaged: target });
	return amount;
}

// `src` is the player index responsible for the damage (for reflect secrets);
// `pierce` skips armor entirely (paper Piercing keyword)
function damageHero(state, pi, amount, src = null, pierce = false) {
	if (amount <= 0) return 0;
	const p = state.players[pi];
	// Arisen Onyxia: on your turn, Health you would lose becomes max Health instead
	if (state.current === pi && p.board.some(c => c.healToMaxHealth && !isDead(c))) {
		p.maxLife = (p.maxLife ?? STARTING_LIFE) + amount;
		p.life += amount;
		emit(state, { type: 'heal', targetType: 'hero', player: pi, amount, life: p.life });
		return 0;
	}
	if (p.heroImmuneTurn === state.turnNumber) return 0; // "can't take damage this turn"
	if (p.board.some(c => c.heroImmuneAura && !isDead(c))) return 0; // Mal'Ganis: your hero is Immune
	// Bolf Ramshield: the hero's damage is taken by this creature instead
	const bolf = p.board.find(c => c.redirectHeroDamage && !isDead(c));
	if (bolf) { damageCreature(state, bolf, amount, null); return 0; }
	// static hero-damage reduction (Lucky Horseshoe)
	amount = Math.max(0, amount - staticValue(p, 'reduce-hero-damage'));
	if (amount <= 0) return 0;
	if (pierce) {
		// bypass armor: fatal check + damage go straight to life
		if (amount >= p.life) {
			const ctx = { fatal: true, prevented: false, src };
			fireSecrets(state, pi, 'hero-takes-damage', ctx);
			if (ctx.prevented) return 0;
		}
		p.life = Math.max(0, p.life - amount);
		p.heroDamagedThisTurn = true; p.heroHealthChangedThisTurn = true; p.heroDamageTakenThisTurn = (p.heroDamageTakenThisTurn || 0) + amount; // Duskbat / Nethersoul Buster / Brittlebone Destroyer
		emit(state, { type: 'damage', targetType: 'hero', player: pi, amount, life: p.life });
		fireSecrets(state, pi, 'hero-takes-damage', { fatal: false, amount, src });
		questTick(state, 'damage-taken', pi, amount);
		if (state.current === pi) fireOngoing(state, pi, 'own-hero-damaged', {});
		return amount;
	}
	// fatal-damage secrets (Ice Block) fire before the damage lands
	if (amount - Math.min(p.armor, amount) >= p.life) {
		const ctx = { fatal: true, prevented: false, src };
		fireSecrets(state, pi, 'hero-takes-damage', ctx);
		if (ctx.prevented) return 0;
	}
	const absorbed = Math.min(p.armor, amount);
	p.armor -= absorbed;
	const toLife = amount - absorbed;
	p.life = Math.max(0, p.life - toLife);
	if (toLife > 0) { p.heroDamagedThisTurn = true; p.heroHealthChangedThisTurn = true; p.heroDamageTakenThisTurn = (p.heroDamageTakenThisTurn || 0) + toLife; } // Duskbat / Nethersoul Buster / Brittlebone Destroyer
	emit(state, { type: 'damage', targetType: 'hero', player: pi, amount, life: p.life });
	if (toLife > 0) fireSecrets(state, pi, 'hero-takes-damage', { fatal: false, amount: toLife, src });
	if (toLife > 0) questTick(state, 'damage-taken', pi, toLife);
	if (toLife > 0 && state.current === pi) fireOngoing(state, pi, 'own-hero-damaged', {});
	return toLife;
}

function gainArmor(state, pi, amount) {
	state.players[pi].armor += amount;
	emit(state, { type: 'armor', player: pi, amount, armor: state.players[pi].armor });
	fireOngoing(state, pi, 'armor-gained', {}); // Siege Engine
}

function healHero(state, pi, amount) {
	const p = state.players[pi];
	const before = p.life;
	// MTG-style: starting life is not a ceiling — a hero can be healed above it.
	p.life += amount;
	emit(state, { type: 'heal', targetType: 'hero', player: pi, amount, life: p.life });
	// Lightwarden-style triggers fire only when healing actually landed
	if (p.life > before) {
		p.heroHealthChangedThisTurn = true; // Brittlebone Destroyer
		p.healedThisTurn = true; // Cleric of An'she
		p.healedAmountThisTurn = (p.healedAmountThisTurn || 0) + (p.life - before); // Xyrella
		p.healedGame = (p.healedGame || 0) + (p.life - before); // Zandalari Templar
		for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'healed', { healedHero: pi, amount: p.life - before });
	}
}

function isDead(c) {
	if (c.type === 'location') return c.doomed || c.durability <= 0;
	// Immune: lethal damage and "destroy" effects don't kill it — only
	// a sacrifice does (which sets c.sacrificed).
	if (has(c, KW.IMMUNE) && !c.sacrificed) return false;
	return c.doomed || c.damage >= c.maxHealth;
}

function freezeCreature(state, c) {
	if (isDead(c)) return;
	const wasFrozen = c.frozen;
	c.frozen = state.turnNumber;
	emit(state, { type: 'freeze', uid: c.uid });
	// let each player's triggers react ("After an enemy creature is Frozen...")
	if (!wasFrozen) for (let s = 0; s < state.players.length; s++) {
		fireOngoing(state, s, 'creature-frozen', { frozen: c, byEnemy: c.controller !== s });
	}
}

// silence: strips keywords, granted states, and death effects (stat buffs stay)
function silenceCreature(state, c) {
	c.keywords = [];
	c.deathrattle = null;
	c.effects = null;
	c.ongoing = null;
	c.static = null;
	c.aura = null;
	c.costMod = null;
	c.enrage = null;
	c.combo = null;
	c.statRule = null;
	c.selfScale = null;
	c.condKeyword = null;
	c.condAttack = null;
	c.attackAgainOnKill = false;
	c.ward = null;
	c.honorableKill = null;
	c.medic = 0;
	c.offTurnAttack = 0;
	c.battlecryDouble = false;
	c.rattleDouble = false;
	c.activated = null;
	c.auraKeywords = [];
	c.shield = false;
	c.stealthed = false;
	c.frozen = null;
	c.marked = false;
	emit(state, { type: 'silenced', uid: c.uid });
	recomputeAuras(state);
}

// Destroy (or exile) an artifact/enchantment permanent — they don't go through
// the creature death sweep. Pull it from its zone, fire its deathrattle (on
// destroy), return any Oblivion-Ring-exiled creature (leaves play either way),
// then send it to the graveyard (or exile).
function destroyPermanent(state, ownerPi, card, toExile = false) {
	const p = state.players[ownerPi];
	const zoneKey = card.type === 'enchantment' ? 'enchantments' : 'artifacts';
	if (!p[zoneKey].includes(card)) return;
	p[zoneKey] = p[zoneKey].filter(c => c !== card);
	emit(state, { type: toExile ? 'exiled' : 'destroy', uid: card.uid, player: ownerPi, name: card.name });
	if (!toExile && card.deathrattle) runDeathrattle(state, ownerPi, card);
	if (card.oringExiled) {
		const oe = card.oringExiled; card.oringExiled = null;
		const ow = state.players[oe.owner];
		const i = ow.exile.findIndex(x => x.uid === oe.uid);
		if (i >= 0) {
			const [ex] = ow.exile.splice(i, 1);
			const back = summon(state, oe.owner, state.cardsById[ex.id] || ex);
			if (back) emit(state, { type: 'returnFromExile', uid: back.uid, player: oe.owner, name: back.name });
		}
	}
	if (toExile) { card.zone = 'exile'; p.exile.push(card); } else toGraveyard(state, ownerPi, card);
	recomputeAuras(state);
}

// ---------- Equipment: attach an Equipment artifact to one of your creatures.
// The Equipment stays in play when the creature dies (detaches) and can be moved
// by equipping again. Its bonuses are applied in recomputeAuras. ----------
export function equipTargets(state, pi, equipUid) {
	const p = state.players[pi];
	const eq = p.artifacts.find(a => a.uid === equipUid);
	if (!eq || !eq.equip) return [];
	return p.board.filter(c => c.type !== 'location' && c.dormantLeft <= 0 && !isDead(c))
		.map(c => ({ type: 'creature', uid: c.uid, player: pi }));
}
// Puresteel Paladin: Metalcraft — your Equipment cost {0} to equip while you
// control three or more artifacts.
function equipCostFor(state, pi, eq) {
	const p = state.players[pi];
	const metalcraft = p.artifacts.length >= 3
		&& p.board.some(c => c.freeEquipMetalcraft && !isDead(c));
	return metalcraft ? 0 : (eq.equip.cost || 0);
}
export function canEquip(state, pi, equipUid) {
	if (state.over || state.current !== pi || state.stack.length || state.priority != null) return false;
	const p = state.players[pi];
	const eq = p.artifacts.find(a => a.uid === equipUid);
	if (!eq || !eq.equip) return false;
	if (availableMana(p) < equipCostFor(state, pi, eq)) return false;
	return equipTargets(state, pi, equipUid).length > 0;
}
export function equip(state, pi, equipUid, creatureUid) {
	if (!canEquip(state, pi, equipUid)) return false;
	const p = state.players[pi];
	const eq = p.artifacts.find(a => a.uid === equipUid);
	const target = p.board.find(c => c.uid === creatureUid && !isDead(c));
	if (!target) return false;
	spendMana(p, equipCostFor(state, pi, eq));
	eq.attachedTo = creatureUid;
	emit(state, { type: 'equipAttached', player: pi, equipUid, creatureUid, name: eq.name });
	recomputeAuras(state);
	return true;
}

function sweepDeaths(state) {
	for (let pi = 0; pi < state.players.length; pi++) {
		const p = state.players[pi];
		const dead = p.board.filter(isDead);
		if (!dead.length) continue;
		p.board = p.board.filter(c => !isDead(c));
		for (const c of dead) {
			if (c.type === 'location') {
				// a spent location just crumbles — no corpse, no death counters,
				// but its Deathrattle (Ultralisk Cavern) still fires
				emit(state, { type: 'death', uid: c.uid, player: pi, name: c.name });
				runDeathrattle(state, pi, c);
				toGraveyard(state, pi, c);
				continue;
			}
			p.diedThisTurn++;
			state.diedThisTurn = (state.diedThisTurn || 0) + 1;
			if (state.cardsById[c.id] && !c.token) {
				p.diedThisTurnIds.push(c.id);
				if (!p.deathLogIds.includes(c.id)) p.deathLogIds.push(c.id);
					(p.diedCountById = p.diedCountById || {})[c.id] = (p.diedCountById[c.id] || 0) + 1; // Elwynn Boar
					if ((c.keywords || []).includes('deathrattle')) p.lastDeathrattleDied = c.id; // Monstrous Parrot
			}
			// Bolvar Fordragon: grows in hand as your creatures die
			for (const hc of p.hand) if (hc.id === 'bolvar_fordragon') { hc.attack += 1; emit(state, { type: 'buff', uid: hc.uid, attack: hc.attack, hp: hp(hc) }); }
			emit(state, { type: 'death', uid: c.uid, player: pi, name: c.name });
			// Corridor Creeper: cheaper in every hand for each creature that dies
			for (const pl of state.players) for (const hc of pl.hand) if (hc.cheaperOnDeath && (hc.cost || 0) > 0) hc.cost = Math.max(0, hc.cost - 1);
			// Jumbo Imp: cheaper in the owner's hand when a friendly creature of its tribe dies
			for (const hc of p.hand) if (hc.cheaperOnTribeDeath && (hc.cost || 0) > 0 && (c.tribe || '').includes(hc.cheaperOnTribeDeath)) hc.cost = Math.max(0, hc.cost - 1);
			// Equipment on this creature detaches and stays in play (can be re-equipped)
			for (const pl of state.players) for (const eq of pl.artifacts) if (eq.equip && eq.attachedTo === c.uid) eq.attachedTo = null;
			// every friendly death banks a Corpse for its owner (all classes;
			// only Death Knights get a UI indicator — others track it hidden)
			if (!p.eliminated) {
				p.corpses++;
				emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
			}
			// reborn: the first death returns it at 1 health, reborn spent
			if (has(c, KW.REBORN) && !p.eliminated) {
				c.keywords = c.keywords.filter(k => k !== KW.REBORN);
				c.damage = c.maxHealth - 1;
				c.doomed = false;
				c.frozen = null;
				c.sick = true;
				c.attacksUsed = 0;
				c.auraAttack = 0;
				c.auraHealth = 0;
				c.auraKeywords = [];
				p.board.push(c);
				emit(state, { type: 'reborn', uid: c.uid, player: pi, name: c.name });
				continue; // no graveyard, no deathrattle
			}
			if (c.marked) drawCards(state, c.markedBy, 2);
			runDeathrattle(state, pi, c);
			// Oblivion Ring leaves play: the creature it exiled returns (fresh)
			if (c.oringExiled) {
				const oe = c.oringExiled; c.oringExiled = null;
				const ow = state.players[oe.owner];
				const i = ow.exile.findIndex(x => x.uid === oe.uid);
				if (i >= 0) {
					const [ex] = ow.exile.splice(i, 1);
					const back = summon(state, oe.owner, state.cardsById[ex.id] || ex);
					if (back) emit(state, { type: 'returnFromExile', uid: back.uid, player: oe.owner, name: back.name });
				}
			}
			firePlaneTrigger(state, 'creature-died', pi); // Takenuma: the owner draws
			if (c.commander && !p.eliminated) {
				// commanders retreat to the command zone; the tax goes up
				const fresh = instantiate(state.cardsById[c.id], pi);
				fresh.zone = 'command';
				fresh.commander = true;
				fresh.cost = c.cost + 2;
				p.command.push(fresh);
				emit(state, { type: 'commanderReturned', player: pi, card: fresh });
			} else {
				toGraveyard(state, pi, c);
			}
			questTick(state, 'death', pi);
			for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'creature-died', { dead: c });
			fireOngoing(state, pi, 'friendly-creature-died', { dead: c });
				for (const hc of state.players[pi].hand) if (hc.handDeathGrowth) { hc.attack += 1; hc.maxHealth += 1; } // Blood Herald: grows while in hand
			fireSecrets(state, pi, 'friendly-minion-died', { minion: c }); // Redemption
		}
	}
	// deathrattles can kill more
	if (state.players.some(p => p.board.some(isDead))) sweepDeaths(state);
	recomputeAuras(state);
	checkGameOver(state);
}

// fallen players are eliminated (their slice clears); last one standing wins
function checkGameOver(state) {
	if (state.over) return;
	state.players.forEach((p, i) => {
		if (p.eliminated || p.life > 0) return;
		p.eliminated = true;
		for (const c of p.board) emit(state, { type: 'death', uid: c.uid, player: i, name: c.name });
		p.board = [];
		p.secrets = [];
		p.traps = [];
		p.lands = [];
		p.heroPowers = [];
		p.quests = [];
		p.enchantments = [];
		p.artifacts = [];
		p.planeswalkers = [];
		p.emblems = [];
		p.companion = null;
		p.command = [];
		p.weapon = null;
		p.hand = [];
		emit(state, { type: 'eliminated', player: i });
	});
	const alive = [];
	state.players.forEach((p, i) => { if (!p.eliminated) alive.push(i); });
	if (alive.length <= 1) {
		state.over = true;
		state.winner = alive.length ? alive[0] : null;
		emit(state, { type: 'gameOver', winner: state.winner });
	}
}

// ---------- summoning ----------
// the Creatures row has no size cap; only eliminated players can't summon
function summon(state, pi, tokenDef) {
	const p = state.players[pi];
	if (p.eliminated) return null;
	const c = instantiate(tokenDef, pi);
	c.zone = 'board';
	p.board.push(c);
	emit(state, { type: 'summon', player: pi, card: c });
	questTick(state, 'summon', pi, 1, c);
	summonColossalParts(state, pi, c);
	fireOngoing(state, pi, 'summoned', { minion: c });
	growBlubberBaron(state, pi, c);
	recomputeAuras(state);
	// "When summoned" effects (Colossal appendages) fire after it lands
	if (c.onSummon) execEffects(state, pi, c.onSummon, null, c);
	return c;
}

// find any permanent by uid across all zones (board/artifacts/enchantments/planeswalkers)
function findPermanent(state, uid) {
	for (const p of state.players)
		for (const zone of [p.board, p.artifacts, p.enchantments, p.planeswalkers]) {
			const c = zone.find(x => x.uid === uid);
			if (c) return c;
		}
	return null;
}
// return any permanent to its owner's hand (Cryptic Command's bounce mode, etc.)
function bouncePermanent(state, ownerPi, card, costMod = 0) {
	const owner = state.players[ownerPi];
	owner.board = owner.board.filter(c => c !== card);
	owner.artifacts = owner.artifacts.filter(c => c !== card);
	owner.enchantments = owner.enchantments.filter(c => c !== card);
	owner.planeswalkers = owner.planeswalkers.filter(c => c !== card);
	for (const pl of state.players) for (const eq of pl.artifacts) if (eq.equip && eq.attachedTo === card.uid) eq.attachedTo = null;
	if (!card.token) { // tokens cease to exist when they leave play
		const def = state.cardsById[card.id];
		if (def && owner.hand.length < MAX_HAND) {
			const c = instantiate(def, ownerPi);
			c.zone = 'hand';
			c.cost = Math.max(0, (def.cost || 0) + costMod);
			owner.hand.push(c);
		}
	}
	emit(state, { type: 'bounce', uid: card.uid, player: ownerPi, name: card.name });
	recomputeAuras(state);
}

// return a blinked creature as a fresh permanent and retrigger its Battlecry
// (guarded against runaway blink chains, e.g. two Felidar Guardians)
function returnBlinked(state, controller, def) {
	const fresh = summon(state, controller, def);
	if (!fresh) return null;
	fresh.sick = true; // it just entered
	emit(state, { type: 'blinkIn', uid: fresh.uid, player: controller, name: fresh.name });
	state.blinkDepth = (state.blinkDepth || 0) + 1;
	if (state.blinkDepth < 20) runBattlecry(state, controller, fresh, null);
	state.blinkDepth--;
	return fresh;
}

// Colossal: a big minion summons its appendage tokens the moment it enters play,
// before any of its own effects — played, summoned, or transformed in.
function summonColossalParts(state, pi, card) {
	if (!card.colossal?.length) return;
	for (const id of card.colossal) {
		const def = state.cardsById[id];
		if (def) summon(state, pi, def);
	}
}

// Herald scale: x1 for your 1st-2nd Herald, x2 for the 3rd-4th, x4 from the 5th on.
// Herald-scaled appendages read this live, so more Heralds grow them.
function heraldMult(count) { return count < 2 ? 1 : count < 4 ? 2 : 4; }

// C'Thun: its buffs are tracked on the player and persist "wherever it is". Any
// C'Thun instance in hand or on board is kept in sync with the 6/6 base + tracker.
const CTHUN_BASE = 6;
function syncCthun(state, pi) {
	const p = state.players[pi];
	for (const c of [...p.hand, ...p.board]) {
		if (c.id !== 'c_thun') continue;
		c.attack = CTHUN_BASE + p.cthunAtk;
		c.maxHealth = CTHUN_BASE + p.cthunHp;
		if (p.cthunTaunt && !c.keywords.includes(KW.TAUNT)) c.keywords.push(KW.TAUNT);
		emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
	}
}

// ---------- static auras ----------
// "Your (other) <tribe> have +X/+Y" — bonuses are recomputed whenever the
// board changes and applied as deltas so base stats and buffs are untouched.
// Losing an aura clamps damage so it can never kill the creature.
function recomputeAuras(state) {
	// global auras ("ALL other Murlocs...") radiate across every board
	const globalSources = [];
	for (const gp of state.players) {
		for (const src of gp.board) {
			if (src.aura?.global && !isDead(src)) globalSources.push(src);
		}
	}
	for (const p of state.players) {
		const sources = [...p.board, ...p.enchantments, ...p.emblems, ...p.artifacts]
			.filter(c => c.aura && !c.aura.global && !(c.zone === 'board' && isDead(c)));
		p.board.forEach((c, idx) => {
			if (c.type === 'location') return; // auras don't touch locations
			if (c.dormantLeft > 0) return;     // nor dormant sleepers
			let aBonus = 0, hBonus = 0;
			const granted = new Set();
			for (const src of [...sources, ...globalSources]) {
				const a = src.aura;
				if (a.others && src === c) continue;
				if (a.adjacent) {
					const si = p.board.indexOf(src);
					if (si < 0 || Math.abs(si - idx) !== 1) continue;
				}
				if (a.position === 'ends' && idx !== 0 && idx !== p.board.length - 1) continue;
				if (a.tribe && !a.tribe.split('|').some(t => (c.tribe || '').includes(t))) continue;
				if (a.name && c.name !== a.name) continue; // Warhorse Trainer's Recruits
				// Herald-scaled aura (Charged Hand of Al'Akir): +Attack grows with Heralds
				aBonus += a.heraldScaled ? heraldMult(state.players[src.controller].heraldCount || 0) : (a.attack || 0);
				hBonus += a.health || 0;
				for (const k of a.keywords || []) granted.add(k);
			}
			// Equipment attached to this creature contributes its bonuses. It's its
			// own permanent — it survives the creature (detaches) and can be moved,
			// so its buff is applied here (recomputed), never baked into base stats.
			for (const eq of p.artifacts) {
				if (eq.equip && eq.attachedTo === c.uid) {
					aBonus += eq.equip.attack || 0;
					hBonus += eq.equip.health || 0;
					for (const k of eq.equip.keywords || []) granted.add(k);
				}
			}
			// Enrage: a self-aura that only applies while the creature is damaged
			if (c.enrage && c.damage > 0 && !isDead(c)) {
				aBonus += c.enrage.attack || 0;
				hBonus += c.enrage.health || 0;
				for (const k of c.enrage.keywords || []) granted.add(k);
			}
			// "+N Attack during your opponent's turn"
			if (c.offTurnAttack && state.current !== c.controller) {
				aBonus += c.offTurnAttack;
			}
			// Old Murk-Eye: +N Attack per other <tribe> anywhere in play
			if (c.selfScale) {
				let n = 0;
				for (const gp of state.players) {
					n += gp.board.filter(x => x !== c && !isDead(x)
						&& (x.tribe || '').includes(c.selfScale.tribe)).length;
				}
				aBonus += (c.selfScale.attack || 0) * n;
			}
			// Southsea Deckhand: keyword held only while a condition stands
			if (c.condKeyword && (c.condKeyword.while !== 'weapon' || p.weapon)) {
				granted.add(c.condKeyword.keyword);
			}
			// "+N Attack while you have a weapon equipped"
			if (c.condAttack && (c.condAttack.while !== 'weapon' || p.weapon)) {
				aBonus += c.condAttack.attack || 0;
			}
			// active plane's continuous creature aura (Krosa +2/+2, Hippogyia -5/-0,
			// Sokenzan +1/+1 & Rush): applies to every creature in play
			const planeAura = activePlaneRule(state);
			if (planeAura && planeAura.kind === 'aura') {
				aBonus += planeAura.attack || 0;
				hBonus += planeAura.health || 0;
				for (const k of planeAura.keywords || []) granted.add(k);
			}
			const dA = aBonus - c.auraAttack, dH = hBonus - c.auraHealth;
			if (dA || dH) {
				c.attack = Math.max(0, c.attack + dA);
				c.maxHealth += dH;
				c.auraAttack = aBonus;
				c.auraHealth = hBonus;
				if (dH < 0 && c.damage >= c.maxHealth) c.damage = Math.max(0, c.maxHealth - 1);
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
			// keyword grants: retract tracked grants that lapsed, add new ones
			// (never touching keywords the creature owns natively)
			for (const k of [...c.auraKeywords]) {
				if (!granted.has(k)) {
					c.auraKeywords = c.auraKeywords.filter(x => x !== k);
					c.keywords = c.keywords.filter(x => x !== k);
				}
			}
			for (const k of granted) {
				if (c.keywords.includes(k)) continue;
				c.keywords.push(k);
				c.auraKeywords.push(k);
				// Cloak of Invisibility: aura-granted stealth also hides the body
				if (k === KW.STEALTH) c.stealthed = true;
			}
			// Lightspawn: attack tracks current health after everything else
			if (c.statRule === 'attack-equals-health' && c.attack !== hp(c)) {
				c.attack = hp(c);
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
		});
	}
}

// Blubber Baron: grows in hand whenever you summon a Battlecry creature
function growBlubberBaron(state, pi, summoned) {
	if (!summoned?.keywords?.includes('battlecry')) return;
	for (const h of state.players[pi].hand) if (h.id === 'blubber_baron') {
		h.attack += 1; h.maxHealth += 1;
		emit(state, { type: 'buff', uid: h.uid, attack: h.attack, hp: hp(h) });
	}
}

// fire a single creature's own ongoing triggers by name (combat reactions:
// self-attacks-survives, self-deals-damage, …); ctx.self is the creature
function fireCreatureTrigger(state, c, when, extra = {}) {
	if (!c || isDead(c)) return;
	const trigs = [];
	if (c.ongoing?.on === when) trigs.push(c.ongoing);
	if (c.ongoings) for (const o of c.ongoings) if (o.on === when) trigs.push(o);
	for (const o of trigs) runSecretEffects(state, c.controller, o.effects, { self: c, ...extra });
}

// condition on an ongoing trigger, judged against the event's subject card
// (the summoned/played/dead/damaged creature) or the owner's own state
function ongoingCondOk(state, pi, cond, ctx) {
	const subj = ctx.minion || ctx.played || ctx.dead || ctx.damaged || ctx.frozen || null;
	if (cond.maxAttack != null && !(subj && subj.attack <= cond.maxAttack)) return false;
	if (cond.tribe && !(subj && (subj.tribe || '').includes(cond.tribe))) return false;
	if (cond.overload && !(subj && subj.overload > 0)) return false;
	if (cond.cardType && !(subj && subj.type === cond.cardType)) return false;
	if (cond.keyword && !(subj && (subj.keywords || []).includes(cond.keyword))) return false; // Undertaker: a Deathrattle minion
	if (cond.maxHealthSubj != null && !(subj && hp(subj) <= cond.maxHealthSubj)) return false; // Steward of Darkshire: a 1-Health minion
	if (cond.spellCost != null && !(subj && (subj.cost || 0) === cond.spellCost)) return false; // Gazlowe: a 1-Cost spell
	if (cond.maxCost != null && !(subj && (subj.cost || 0) <= cond.maxCost)) return false; // Oracle of Elune: a minion that costs (2) or less
	if (cond.controlSecret && !state.players[pi].secrets.length) return false;
	if (cond.creature && !ctx.healedCreature) return false; // "whenever a MINION is healed"
	if (cond.nontoken && (!subj || (subj.id || '').startsWith('token_'))) return false;
	if (cond.cardId && !(subj && subj.id === cond.cardId)) return false; // Food sacrifices
	if (cond.self && ctx.damaged !== ctx.self) return false; // "whenever THIS takes damage"
	if (cond.enemy && !(subj && subj.controller !== pi)) return false; // "an ENEMY creature ..."
	if (cond.school && !(subj && schoolOf(subj) === cond.school)) return false; // "cast an Arcane spell"
	if (cond.controlArtEnch && !(state.players[pi].artifacts.length || state.players[pi].enchantments.length)) return false; // "if you control an artifact or an enchantment"
	return true;
}

// ---------- ongoing permanents (enchantments, artifacts, emblems, creatures) ----------
// persistent triggers: fire every time, card stays in play. Board creatures
// with an `ongoing` field participate too (whenever-/at- style minions);
// each firing card sees itself as ctx.self so effects can target it.
function fireOngoing(state, pi, when, ctx = {}) {
	const p = state.players[pi];
	if (state.over || p.eliminated) return;
	const hasTrig = c => c && (c.ongoing || (c.ongoings && c.ongoings.length));
	const sources = [...p.enchantments, ...p.artifacts, ...p.emblems, ...p.board.filter(hasTrig),
		...(hasTrig(p.weapon) ? [p.weapon] : [])]; // Eaglehorn/Sword of Justice
	for (const card of sources) {
		if (state.over) break;
		if (card === ctx.minion) continue; // a card doesn't trigger on its own arrival
		if (card.zone === 'board' && isDead(card)) continue;
		// a card may carry one `ongoing` plus any number of combined `ongoings`
		const trigs = [];
		if (card.ongoing) trigs.push(card.ongoing);
		if (card.ongoings) for (const t of card.ongoings) trigs.push(t);
		for (const trig of trigs) {
			if (!trig || trig.spent || trig.on !== when) continue;
			// conditional triggers ("Whenever you summon a Beast...") gate before counters
			if (trig.if && !ongoingCondOk(state, pi, trig.if, { ...ctx, self: card })) continue;
			// Avenge-style triggers need N occurrences (once); Morbid-style `every`
			// triggers fire on every Nth occurrence, repeating
			if (trig.need || trig.every) {
				trig.trigCount = (trig.trigCount || 0) + 1;
				if (trig.trigCount < (trig.need || trig.every)) continue;
				if (trig.every) trig.trigCount = 0;
			}
			emit(state, { type: 'ongoingTriggered', player: pi, card });
			const fx = trig.effects;
			if (trig.once) { if (trig === card.ongoing) card.ongoing = null; else trig.spent = true; } // one-shots
			runSecretEffects(state, pi, fx, { ...ctx, self: card });
		}
	}
}

// sum of a static passive across a player's permanent rows
function staticValue(p, type) {
	let v = 0;
	for (const card of [...p.enchantments, ...p.artifacts, ...p.emblems, ...p.board]) {
		if (card.static?.type === type) v += card.static.value || 1;
	}
	return v;
}

// ---------- quests ----------
// goal kinds counted for the acting player only, except 'death' which every
// quest holder counts no matter whose creature fell
const ANY_ACTOR_GOALS = new Set(['death']);

function questTick(state, kind, actorPi, amount = 1, ctxCard = null) {
	for (let pi = 0; pi < state.players.length; pi++) {
		const p = state.players[pi];
		if (p.eliminated || !p.quests.length) continue;
		if (!ANY_ACTOR_GOALS.has(kind) && pi !== actorPi) continue;
		for (const q of [...p.quests]) {
			if (q.quest.goal.type !== kind) continue;
			if (q.quest.goal.tribe && !(ctxCard?.tribe || '').includes(q.quest.goal.tribe)) continue;
			if (q.quest.goal.cost != null && ctxCard?.cost !== q.quest.goal.cost) continue;
			q.progress += amount;
			emit(state, { type: 'questProgress', player: pi, card: q, progress: q.progress, goal: q.quest.goal.count });
			if (q.progress >= q.quest.goal.count) {
				p.quests = p.quests.filter(x => x !== q);
				toGraveyard(state, pi, q);
				emit(state, { type: 'questComplete', player: pi, card: q });
				execEffects(state, pi, q.quest.reward, null, q);
			}
		}
	}
}

// ---------- lands: bought from the slot menu, tapped for abilities ----------
// every land def offers tap abilities; legacy bonus-mana lands synthesize one
export function landTaps(card) {
	if (card.taps?.length) return card.taps;
	const out = [];
	if (card.mana) out.push({ text: `Gain ${card.mana} mana.`, effects: [{ type: 'gain-mana', value: card.mana }] });
	return out;
}

export function landPool(state) {
	return Object.values(state.cardsById).filter(d => d.type === 'land');
}

// the five basics establish your color identity; advanced lands unlock once
// every color they need is already among your basics (Wastes comes later)
const BASIC_LANDS = ['plains', 'island', 'swamp', 'mountain', 'forest'];

export function colorIdentity(state, pi) {
	const id = new Set();
	for (const l of state.players[pi].lands) {
		if (BASIC_LANDS.includes(l.id)) for (const c of l.colors || []) id.add(c);
	}
	return id;
}

export function availableLands(state, pi) {
	const identity = colorIdentity(state, pi);
	return landPool(state).filter(d => {
		if (BASIC_LANDS.includes(d.id)) return true;
		if (!d.colors || !d.colors.length) return false; // wastes/colorless: later
		return d.colors.every(c => identity.has(c));
	});
}

// every land can be sacrificed to draw a card
export function sacrificeLand(state, pi, cardUid) {
	if (state.over || state.current !== pi) return false;
	const p = state.players[pi];
	const card = p.lands.find(c => c.uid === cardUid);
	if (!card) return false;
	p.lands = p.lands.filter(c => c !== card);
	toGraveyard(state, pi, card);
	emit(state, { type: 'landSacrificed', player: pi, card });
	drawCards(state, pi, 1);
	return true;
}

export function canBuyLand(state, pi) {
	if (state.over || state.current !== pi) return false;
	const p = state.players[pi];
	return p.lands.length < MAX_LANDS && availableMana(p) >= LAND_COST;
}

export function buyLand(state, pi, landId) {
	if (!canBuyLand(state, pi)) return false;
	const def = state.cardsById[landId];
	if (!def || def.type !== 'land') return false;
	const p = state.players[pi];
	spendMana(p, LAND_COST);
	// paper rules: developing a land puts The Coin into each opponent's hand
	for (const o of opponentsOf(state, pi)) addCoin(state, o);
	const card = instantiate(def, pi);
	card.zone = 'land';
	p.lands.push(card);
	emit(state, { type: 'landPlayed', player: pi, card, mana: availableMana(p) });
	runBattlecry(state, pi, card, null); // on-play land effects still fire
	fireOngoing(state, pi, 'landfall', { land: card }); // Landfall: "whenever a land you control enters"
	questTick(state, 'land', pi);
	sweepDeaths(state);
	return true;
}

export function canTapLand(state, pi, card, tapIndex) {
	if (state.over || !hasPriority(state, pi)) return false;
	const p = state.players[pi];
	const inPlay = p.lands.includes(card)
		|| (card.type === 'location' && p.board.includes(card) && !isDead(card));
	if (!inPlay || card.tapped) return false;
	const taps = landTaps(card);
	if (tapIndex == null) return taps.length > 0;
	const t = taps[tapIndex];
	if (!t) return false;
	const spec = tapSpec(state, pi, card, tapIndex);
	if (spec && spec.required && legalTargets(state, pi, spec).length === 0) return false;
	return true;
}

export function tapSpec(state, pi, card, tapIndex) {
	const t = landTaps(card)[tapIndex];
	if (!t) return null;
	// boost abilities aim at a friendly creature; other targeted effects use
	// the standard derivation (e.g. Wastes' tap-for-damage)
	if (t.effects.some(e => e.type === 'boost')) {
		return { targets: 'friendly-creature', required: true, why: 'a friendly creature to boost' };
	}
	return targetSpec(state, pi, { id: card.id, type: 'sorcery', effects: t.effects });
}

export function tapLand(state, pi, cardUid, tapIndex, target) {
	const p = state.players[pi];
	const card = p.lands.find(c => c.uid === cardUid)
		|| p.board.find(c => c.uid === cardUid && c.type === 'location');
	if (!card || !canTapLand(state, pi, card, tapIndex)) return false;
	// lands and locations DOUBLE-tap: the tap stone comes off next turn but the
	// card stays tapped, and only the turn after that does it actually untap
	card.tapped = true;
	card.tapStone = true;
	const t = landTaps(card)[tapIndex];
	emit(state, { type: 'landTapped', player: pi, card, text: t.text });
	// locations wear out: durability counts their remaining taps
	if (card.type === 'location') {
		card.durability -= 1;
		emit(state, { type: 'locationDurability', player: pi, uid: card.uid, durability: card.durability });
		if (card.durability <= 0) {
			card.doomed = true; // routes through the normal death sweep
		}
	}
	stackAction(state, pi, { kind: 'landtap', card, effects: t.effects, target });
	return true;
}

// ---------- activated creature abilities ----------
// def.activated = [{cost, sacrifice?, discardRandom?, payLife?, effects, text}]
// creatures never tap (user ruling): abilities are once per turn instead,
// independent of attacking; sacrifice abilities kill the creature as the cost.
export function canActivate(state, pi, card, i) {
	if (state.over) return false;
	const p = state.players[pi];
	if (!p.board.includes(card) || isDead(card) || !card.activated) return false;
	if (card.frozen || card.dormantLeft > 0) return false;
	const a = card.activated[i];
	if (!a) return false;
	if (a.sorcerySpeed ? !(state.current === pi && state.priority == null && state.stack.length === 0) : !hasPriority(state, pi)) return false;
	if (card.abilityUsedThisTurn && !a.repeatable) return false; // repeatable abilities (Firebreathing) ignore the once/turn gate
	if ((a.cost || 0) > availableMana(p)) return false;
	if (a.discardRandom && p.hand.length === 0) return false;
	if (a.payLife && p.life <= a.payLife) return false;
	if (a.sacCost && !p.board.some(c => c.type === 'creature' && !isDead(c) && (!a.sacCost.tribe || (c.tribe || '').includes(a.sacCost.tribe)))) return false;
	const spec = abilitySpec(state, pi, card, i);
	if (spec && spec.required && legalTargets(state, pi, spec).length === 0) return false;
	return true;
}

export function abilitySpec(state, pi, card, i) {
	const a = card.activated?.[i];
	if (!a) return null;
	return targetSpec(state, pi, { id: card.id, type: 'sorcery', effects: a.effects });
}

export function activateAbility(state, pi, cardUid, i, target) {
	const p = state.players[pi];
	const card = p.board.find(c => c.uid === cardUid);
	if (!card || !canActivate(state, pi, card, i)) return false;
	const a = card.activated[i];
	const ward = wardOf(state, pi, target);
	if (ward?.mana && availableMana(p) < (a.cost || 0) + ward.mana) return false;
	if (ward) payWard(state, pi, target);
	spendMana(p, a.cost || 0);
	if (!a.repeatable) card.abilityUsedThisTurn = true;
	if (a.payLife) { p.life -= a.payLife; emit(state, { type: 'damage', targetType: 'hero', player: pi, amount: a.payLife, life: p.life }); }
	if (a.discardRandom && p.hand.length) {
		const c = p.hand[Math.floor(state.rng() * p.hand.length)];
		p.hand = p.hand.filter(x => x !== c);
		toGraveyard(state, pi, c);
		emit(state, { type: 'discard', player: pi, card: c });
	}
	emit(state, { type: 'abilityUsed', player: pi, card, text: a.text });
	if (a.sacrifice) { card.damage = card.maxHealth + 99; card.doomed = true; card.sacrificed = true; }
	// cost "Sacrifice a <creature>": pick which one, then the effects resolve
	if (a.sacCost) {
		const pool = p.board.filter(c => c.type === 'creature' && !isDead(c) && (!a.sacCost.tribe || (c.tribe || '').includes(a.sacCost.tribe)));
		if (pool.length > 1) {
			state.sacQueue.push({ player: pi, kind: 'creature', uids: pool.map(c => c.uid), sacAbility: { pi, effects: a.effects, target } });
			emit(state, { type: 'sacStart', player: pi, kind: 'creature' });
			return true;
		}
		if (pool.length === 1) sacrificeAsCost(state, pi, pool[0]);
		execEffects(state, pi, a.effects, target, null);
		sweepDeaths(state);
		return true;
	}
	stackAction(state, pi, { kind: 'ability', card, effects: a.effects, target });
	return true;
}

// ---------- weapons ----------
function breakWeapon(state, pi, destroyed) {
	const p = state.players[pi];
	if (!p.weapon) return;
	const w = p.weapon;
	p.weapon = null;
	toGraveyard(state, pi, w);
	emit(state, { type: 'weaponBreak', player: pi, name: w.name, destroyed: !!destroyed });
	if (w.deathrattle) execEffects(state, pi, w.deathrattle, null, w); // Quick Pick
	recomputeAuras(state); // Southsea Deckhand loses conditional Charge
	fireOngoing(state, pi, 'weapon-destroyed', {}); // Grave Shambler
}

function degradeWeapon(state, pi) {
	const w = state.players[pi].weapon;
	if (!w) return;
	w.durability -= 1;
	emit(state, { type: 'weaponDurability', player: pi, attack: w.attack, durability: w.durability });
	if (w.durability <= 0) breakWeapon(state, pi, false);
}

// ---------- secrets ----------
// A secret card carries { trigger, condition?, effects } in def.secret.
// Triggers: 'enemy-attack' (ctx: attackerType/attacker/attackerPlayer/target/cancelled),
// 'enemy-minion-played' (ctx: minion), 'enemy-spell-cast' (ctx: spell/countered),
// 'hero-takes-damage' (ctx: amount/fatal/prevented). Secrets never fire on their
// owner's own turn, and each fires once then leaves play.
function secretMatches(sec, ctx) {
	const c = sec.condition || {};
	if (!!c.fatal !== !!ctx.fatal) return false;
	if (c.targetHero && ctx.target?.type !== 'hero') return false;
	if (c.targetCreature && ctx.target?.type !== 'creature') return false;
	if (c.attackerCreature && ctx.attackerType !== 'creature') return false;
	return true;
}

// fire the matching secrets of every player except the actor
function fireSecretsAll(state, actorPi, trigger, ctx) {
	for (let i = 0; i < state.players.length; i++) {
		if (i !== actorPi) fireSecrets(state, i, trigger, ctx);
	}
}

// secrets and traps share the trigger system; traps sit face-down on the
// table (public count, hidden identity) while secrets are fully hidden
function fireSecrets(state, pi, trigger, ctx) {
	const p = state.players[pi];
	if (state.over || state.current === pi || p.eliminated) return;
	for (const card of [...p.secrets, ...p.traps]) {
		if (state.over) break;
		const sec = card.secret || card.trap;
		if (!sec || sec.trigger !== trigger || !secretMatches(sec, ctx)) continue;
		if (card.type === 'trap') {
			p.traps = p.traps.filter(t => t !== card);
			toGraveyard(state, pi, card);
			emit(state, { type: 'trapSprung', player: pi, card });
			// paper Eaglehorn counts traps too
			for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'secret-revealed', {});
		} else {
			p.secrets = p.secrets.filter(s => s !== card);
			toGraveyard(state, pi, card);
			emit(state, { type: 'secretRevealed', player: pi, card });
			// Eaglehorn Bow-style triggers watch every reveal
			for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'secret-revealed', {});
		}
		runSecretEffects(state, pi, sec.effects, ctx);
	}
}

function runSecretEffects(state, pi, effects, ctx) {
	const triggering = () => {
		const m = ctx.minion || (ctx.attackerType === 'creature' ? ctx.attacker : null);
		return m && !isDead(m) ? m : null;
	};
	for (const e of effects || []) {
		switch (e.type) {
			case 'counter': ctx.countered = true; break;
			case 'copy-spell': {
				// Mana Bind: add a copy of the countered spell to your hand at cost 0
				const sp = ctx.spell, pp = state.players[pi];
				if (sp && state.cardsById[sp.id]) {
					const cp = instantiate(state.cardsById[sp.id], pi);
					cp.zone = 'hand'; cp.cost = 0;
					pp.hand.push(cp);
					emit(state, { type: 'conjure', player: pi, card: cp, color: null });
				}
				break;
			}
			case 'return-played-spell': {
				// Diligent Notetaker (Spellburst): return the just-cast spell to hand
				const sp = ctx.played, pp = state.players[pi], def = sp && state.cardsById[sp.id];
				if (def) {
					const cp = instantiate(def, pi); cp.zone = 'hand';
					pp.hand.push(cp);
					emit(state, { type: 'conjure', player: pi, card: cp, color: null });
				}
				break;
			}
			case 'prevent': ctx.prevented = true; break;
			case 'armor': gainArmor(state, pi, e.value); break;
			case 'grant-played-if-cost': {
					// Toxmonger: give the creature you just played a keyword if it costs N;
					// Magic Carpet also pumps it (+Attack) and grants Rush
					const m = ctx.minion;
					if (m && m !== ctx.self && (m.cost || 0) === (e.cost ?? 1)) {
						if (e.keyword && !m.keywords.includes(e.keyword)) { m.keywords.push(e.keyword); if (e.keyword === KW.DIVINE_SHIELD) m.shield = true; }
						if (e.attack || e.health) { m.attack += e.attack || 0; m.maxHealth += e.health || 0; }
						emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
					}
					break;
				}
				case 'summon-on-friendly-heal': {
					// Nightscale Matriarch: a friendly creature was healed -> summon a token
					if (ctx.healedCreature && ctx.healedCreature.controller === pi) {
						summon(state, pi, { id: 'token_' + (e.name || 'whelp').toLowerCase(), name: e.name || 'Whelp', type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: e.attack || 3, health: e.health || 3, description: `A ${e.attack || 3}/${e.health || 3} token.` });
					}
					break;
				}
				case 'grant-self-shield-on-heal': {
					// The Glass Knight: whenever you restore Health, regain Divine Shield
					const healedYours = ctx.healedHero === pi || (ctx.healedCreature && ctx.healedCreature.controller === pi);
					if (healedYours && ctx.self && !ctx.self.shield && !isDead(ctx.self)) {
						ctx.self.shield = true;
						if (!ctx.self.keywords.includes(KW.DIVINE_SHIELD)) ctx.self.keywords.push(KW.DIVINE_SHIELD);
						emit(state, { type: 'buff', uid: ctx.self.uid, attack: ctx.self.attack, hp: hp(ctx.self) });
					}
					break;
				}
				case 'awaken-on-heal': {
					// Lucentbark's dormant seed: restore 5 Health (total) to wake it up
					const self = ctx.self;
					if (self && ctx.healedHero === pi) {
						self._healBank = (self._healBank || 0) + (ctx.amount || 0);
						if (self._healBank >= (e.threshold || 5) && state.cardsById[e.into]) {
							const tok = instantiate(state.cardsById[e.into], self.controller);
							tok.zone = 'board'; tok.sick = false;
							const board = state.players[self.controller].board;
							board[board.indexOf(self)] = tok; self.zone = 'gone';
							emit(state, { type: 'transformed', uid: self.uid, player: self.controller, from: self.name, card: tok });
							recomputeAuras(state);
						}
					}
					break;
				}
				case 'add-shuffled-copy': {
					// Tak Nozwhisker: when you shuffle a card in, add a copy to your hand
					const def = ctx.cardId && state.cardsById[ctx.cardId];
					if (def && !def.token && state.players[pi].hand.length < MAX_HAND) {
						const c = instantiate(def, pi); c.zone = 'hand'; state.players[pi].hand.push(c);
						emit(state, { type: 'conjure', player: pi, card: c, color: null });
					}
					break;
				}
				case 'add-choose-copies': {
					// Keeper Stalladris: after a Choose One spell, add copies of both choices
					// (approximated: two copies of the spell you cast)
					const sp = ctx.played;
					if (sp && state.cardsById[sp.id]) for (let i = 0; i < 2; i++) {
						if (state.players[pi].hand.length >= MAX_HAND) break;
						const c = instantiate(state.cardsById[sp.id], pi); c.zone = 'hand'; state.players[pi].hand.push(c);
						emit(state, { type: 'conjure', player: pi, card: c, color: null });
					}
					break;
				}
				case 'summon-drawn-rush-doom': {
					// Fel Lord Betrug: drew a creature -> summon a Rush copy that dies at end of turn
					const c = ctx.card;
					if (c && c.type === 'creature' && state.cardsById[c.id]) {
						const cp = instantiate(state.cardsById[c.id], pi);
						cp.zone = 'board'; cp.sick = true;
						if (!cp.keywords.includes('rush')) cp.keywords.push('rush');
						cp.doomTurn = state.turnNumber;
						state.players[pi].board.push(cp);
						emit(state, { type: 'summon', player: pi, card: cp }); fireOngoing(state, pi, 'summoned', { minion: cp }); recomputeAuras(state);
					}
					break;
				}
				case 'if-played-then': {
					// generic "after you play a creature matching X, do Y" (Underbelly Angler, Arcane Fletcher)
					const m = ctx.minion;
					if (m && m !== ctx.self && (e.cost == null || (m.cost || 0) === e.cost) && (!e.tribe || (m.tribe || '').includes(e.tribe))) {
						execEffects(state, pi, JSON.parse(JSON.stringify(e.then || [])), null, ctx.self);
					}
					break;
				}
				case 'tutor-spell-cost-plus': {
					// Spirit of the Frog: draw a spell costing (cast spell's cost + N)
					const sp = ctx.spell || ctx.played;
					if (sp) execEffects(state, pi, [{ type: 'tutor', cardType: 'spell', cost: (sp.cost || 0) + (e.value || 1) }], null, ctx.self);
					break;
				}
				case 'grant-keyword-to-played': {
					// Mortuary Machine: give a keyword to the creature just played
					const m = ctx.minion;
					if (m && m !== ctx.self && e.keyword && !m.keywords.includes(e.keyword)) {
						m.keywords.push(e.keyword);
						if (e.keyword === KW.DIVINE_SHIELD) m.shield = true;
						emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
					}
					break;
				}
				case 'set-summoned-health-to-attack': {
					// High Priest Amet: a creature you summoned gets Health equal to its Attack
					const m = ctx.minion;
					if (m && m !== ctx.self) { m.maxHealth = m.attack; m.damage = 0; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
					break;
				}
				case 'if-nth-spell-then': {
					// Chenvaala: after every 3rd spell this turn, run an effect
					if (((state.players[pi].spellsPlayedThisTurn || 0) % (e.every || 3)) === 0 && (state.players[pi].spellsPlayedThisTurn || 0) > 0) execEffects(state, pi, JSON.parse(JSON.stringify(e.then || [])), null, ctx.self);
					break;
				}
				case 'if-summoned-tribe-then': {
					// Skybarge: after you summon a creature of a tribe, run an effect
					const m = ctx.minion;
					if (m && m !== ctx.self && (!e.tribe || (m.tribe || '').includes(e.tribe))) execEffects(state, pi, JSON.parse(JSON.stringify(e.then || [])), null, ctx.self);
					break;
				}
				case 'buff-summoned-if-tribe': {
					// Spirit of the Lynx: you summoned a creature of a tribe -> buff it.
					// Also gates on requireKeyword (Parade Leader: Rush) and maxHealth
					// (Carnival Barker: a 1-Health minion).
					const m = ctx.minion;
					if (m && m !== ctx.self && (!e.tribe || (m.tribe || '').includes(e.tribe))
						&& (!e.requireKeyword || (m.keywords || []).includes(e.requireKeyword))
						&& (!e.ifName || m.name === e.ifName)
						&& (e.maxHealth == null || hp(m) <= e.maxHealth)) {
						if (e.grant && !m.keywords.includes(e.grant)) { m.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) m.shield = true; } // Lothraxion
						m.attack += e.attack || 0; m.maxHealth += e.health || 0;
						emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
					}
					break;
				}
				case 'buff-random-hand-on-death':
				case 'buff-random-hand': {
					// Spirit of the Bat / History Buff: buff a random creature in your hand
					const pool = state.players[pi].hand.filter(c => c.type === 'creature');
					if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.attack += e.attack || 0; c.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
					break;
				}
				case 'shuffle-cheap-copy-of-dead': {
					// Spirit of the Dead: shuffle a cost-set copy of the fallen friendly into your deck
					const m = ctx.dead;
					if (m && state.cardsById[m.id] && !state.cardsById[m.id].token) {
						state.players[pi].deck.push(m.id); // (cost override is cosmetic once shuffled; keep it simple)
						const dk = state.players[pi].deck;
						for (let i = dk.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [dk[i], dk[j]] = [dk[j], dk[i]]; }
					}
					break;
				}
				case 'summon-of-spell-cost': {
					// Spirit of the Tiger: after you cast a spell, summon a token with stats = its Cost
					const sp = ctx.spell || ctx.played;
					if (sp) { const n = sp.cost || 0; summon(state, pi, { id: 'token_' + (e.name || 'tiger').toLowerCase(), name: e.name || 'Tiger', type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: n, health: n, description: `A ${n}/${n} token.` }); }
					break;
				}
				case 'buff-drawn-if-tribe': {
					// Untamed Beastmaster: you drew a creature of a tribe -> buff it in hand
					const c = ctx.card;
					if (c && c.type === 'creature' && (!e.tribe || (c.tribe || '').includes(e.tribe))) {
						c.attack += e.attack || 0; c.maxHealth += e.health || 0;
						emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
					}
					break;
				}
				case 'draw-on-big-heal': {
					// Soup Vendor: restore N+ to your hero -> draw a card
					if (ctx.healedHero === pi && (ctx.amount || 0) >= (e.min || 3)) drawCards(state, pi, e.value || 1);
					break;
				}
				case 'hatch-self-into': {
					// Nithogg's Egg: at your turn start, become a fixed-stat token
					const self = ctx.self;
					if (self && self.zone === 'board' && !isDead(self)) {
						const tok = instantiate({ id: 'token_' + (e.name || 'drake').toLowerCase(), name: e.name || 'Drake', type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: e.attack || 4, health: e.health || 4, keywords: e.keywords || [], description: `A ${e.attack || 4}/${e.health || 4} token.` }, self.controller);
						tok.zone = 'board'; tok.sick = false;
						const board = state.players[self.controller].board;
						board[board.indexOf(self)] = tok; self.zone = 'gone';
						emit(state, { type: 'transformed', uid: self.uid, player: self.controller, from: self.name, card: tok });
						recomputeAuras(state);
					}
					break;
				}
				case 'transform-drawn-legendary': {
					// Transmogrifier: replace a drawn card with a random Legendary creature
					const c = ctx.card;
					if (c) {
						const legs = Object.values(state.cardsById).filter(d => d.type === 'creature' && d.rarity === 'legendary' && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
						if (legs.length) { const pick = legs[Math.floor(state.rng() * legs.length)]; const p2 = state.players[pi]; const idx = p2.hand.indexOf(c); if (idx >= 0) { const nc = instantiate(pick, pi); nc.zone = 'hand'; p2.hand[idx] = nc; emit(state, { type: 'conjure', player: pi, card: nc, color: null }); } }
					}
					break;
				}
				case 'add-drawn-copy': {
					// Archmage Arugal: you drew a creature -> add a copy to your hand
					const c = ctx.card;
					if (c && c.type === 'creature' && state.cardsById[c.id] && state.players[pi].hand.length < MAX_HAND) {
						const cp = instantiate(state.cardsById[c.id], pi); cp.zone = 'hand'; state.players[pi].hand.push(cp);
						emit(state, { type: 'conjure', player: pi, card: cp, color: null });
					}
					break;
				}
				case 'summon-drawn-copy': {
					// Dollmaster Dorian: you drew a creature -> summon a 1/1 copy of it
					const c = ctx.card;
					if (c && c.type === 'creature' && state.cardsById[c.id]) {
						const cp = instantiate(state.cardsById[c.id], pi);
						cp.attack = e.attack ?? 1; cp.maxHealth = e.health ?? 1;
						cp.zone = 'board'; cp.sick = true; state.players[pi].board.push(cp);
						emit(state, { type: 'summon', player: pi, card: cp }); fireOngoing(state, pi, 'summoned', { minion: cp }); recomputeAuras(state);
					}
					break;
				}
				case 'become-copy-of-played': {
					// Harbinger Celestia: transform into a full copy of the creature an opponent just played
					const m = ctx.minion;
					if (m && ctx.self && ctx.self.zone === 'board' && !isDead(ctx.self) && state.cardsById[m.id]) {
						const owner = ctx.self.controller;
						const tok = instantiate(state.cardsById[m.id], owner);
						tok.zone = 'board'; tok.sick = ctx.self.sick;
						const board = state.players[owner].board;
						board[board.indexOf(ctx.self)] = tok; ctx.self.zone = 'gone';
						emit(state, { type: 'transformed', uid: ctx.self.uid, player: owner, from: ctx.self.name, card: tok });
						recomputeAuras(state);
					}
					break;
				}
				case 'doom-played-deathrattle': {
					// Reckless Experimenter: a Deathrattle creature you played dies at end of turn
					const m = ctx.minion;
					if (m && m !== ctx.self && (m.keywords || []).includes('deathrattle')) m.doomTurn = state.turnNumber;
					break;
				}
				case 'summon-enemy-minion-copy': {
					// Holomancer: summon a stat-fixed copy of the creature an opponent just played
					const m = ctx.minion;
					if (m && state.cardsById[m.id]) {
						const cp = instantiate(state.cardsById[m.id], pi);
						cp.attack = e.attack ?? 1; cp.maxHealth = e.health ?? 1;
						cp.zone = 'board'; cp.sick = true; state.players[pi].board.push(cp);
						emit(state, { type: 'summon', player: pi, card: cp }); fireOngoing(state, pi, 'summoned', { minion: cp }); recomputeAuras(state);
					}
					break;
				}
				case 'summon-copy-of-played': {
					// Ixlid, Fungal Lord: summon a copy of the creature you just played
					const m = ctx.minion;
					if (m && m !== ctx.self) { const def = state.cardsById[m.id]; if (def) summon(state, pi, def); }
					break;
				}
				case 'add-copy-of-dead': {
					// Sonya Shadowdancer: add a 1/1 copy of the fallen friendly to your hand
					const m = ctx.dead;
					const pp = state.players[pi];
					if (m && pp.hand.length < MAX_HAND) {
						const def = state.cardsById[m.id] || { id: m.id, name: m.name, type: 'creature', rarity: m.rarity, description: m.description, attack: m.attack, health: m.maxHealth, keywords: [...(m.keywords || [])], tribe: m.tribe };
						const card = instantiate(def, pi);
						card.zone = 'hand'; card.attack = e.attack ?? 1; card.maxHealth = e.health ?? 1; card.cost = e.cost ?? 1;
						pp.hand.push(card); emit(state, { type: 'conjure', player: pi, card, color: null });
					}
					break;
				}
				case 'add-frozen-copy': {
					// Moorabi: whenever ANOTHER creature is Frozen, add a copy of it to your hand
					const fz = ctx.frozen;
					if (fz && fz !== ctx.self) {
						const fdef = state.cardsById[fz.id];
						if (fdef && state.players[pi].hand.length < MAX_HAND) {
							const cp = instantiate(fdef, pi);
							cp.zone = 'hand';
							state.players[pi].hand.push(cp);
							emit(state, { type: 'conjure', player: pi, card: cp, color: null });
						}
					}
					break;
				}
				case 'damage-random-enemy-heal': {
					// Blackguard: when YOUR hero is healed, deal that much to a random enemy minion
					if (ctx.healedHero === pi && (ctx.amount || 0) > 0) {
						const bpool = opponentsOf(state, pi).flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location'));
						if (bpool.length) damageCreature(state, bpool[Math.floor(state.rng() * bpool.length)], ctx.amount, null);
					}
					break;
				}
				case 'reflect-damage': {
				// hit whoever dealt the damage; fall back to a random enemy
				const opps = opponentsOf(state, pi);
				const src = ctx.src != null && ctx.src !== pi && !state.players[ctx.src]?.eliminated ? ctx.src : null;
				const t = src ?? (opps.length ? opps[Math.floor(state.rng() * opps.length)] : null);
				if (t != null) damageHero(state, t, ctx.amount || 0, pi);
				break;
			}
			case 'destroy-attacker': {
				const m = triggering();
				if (m) { m.damage = m.maxHealth; m.shield = false; emit(state, { type: 'destroy', uid: m.uid }); }
				break;
			}
			case 'damage-minion': {
				const m = triggering();
				if (m) damageCreature(state, m, e.value, null);
				break;
			}
			case 'freeze-attacker': {
				const m = triggering();
				if (m) freezeCreature(state, m);
				break;
			}
			case 'set-attack': {
				const m = triggering();
				if (m) { m.attack = e.value; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
			case 'buff-minion': {
				const m = triggering();
				if (m) {
					m.attack += e.attack || 0;
					m.maxHealth += e.health || 0;
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
			case 'revive-minion': {
				// Redemption: the fallen friendly minion returns at 1 health
				const m = ctx.minion;
				if (m) {
					const def = state.cardsById[m.id];
					const back = summon(state, pi, def || {
						id: m.id, name: m.name, type: 'creature', cost: 0,
						rarity: m.rarity || 'common', description: m.description || '',
						attack: m.attack, health: m.maxHealth,
					});
					if (back) back.damage = Math.max(0, back.maxHealth - (e.health || 1));
				}
				break;
			}
			case 'spellbender-redirect': {
				// summon a decoy and make it the spell's new target
				if (ctx.target?.type === 'creature') {
					const tok = summon(state, pi, {
						id: 'token_spellbender', name: 'Spellbender', type: 'creature',
						cost: 0, rarity: 'common', description: 'A conjured decoy.',
						attack: e.attack || 1, health: e.health || 3,
					});
					if (tok) {
						ctx.target.uid = tok.uid;
						ctx.target.player = pi;
					}
				}
				break;
			}
			case 'lose-durability': {
				// Sword of Justice pays for its blessing
				const m = ctx.self;
				if (m && m.type === 'weapon' && state.players[pi].weapon === m) {
					degradeWeapon(state, pi);
				}
				break;
			}
			case 'cho-copy': {
				// Lorewalker Cho: the cast spell is copied to "the other player" —
				// the owner if someone else cast it, else a random opponent
				const def = state.cardsById[ctx.spell?.id];
				if (def) {
					let to = pi;
					if (ctx.caster === pi) {
						const opps = opponentsOf(state, pi);
						to = opps.length ? opps[Math.floor(state.rng() * opps.length)] : -1;
					}
					const rp = to >= 0 ? state.players[to] : null;
					if (rp) {
						const copy = instantiate(def, to);
						copy.zone = 'hand';
						rp.hand.push(copy);
						emit(state, { type: 'conjure', player: to, card: copy, color: null });
					}
				}
				break;
			}
			case 'swap-with-hand': {
				// Alarm-o-Bot trades places with a random creature in hand
				const bot = ctx.self;
				const p2 = state.players[pi];
				const picks = p2.hand.filter(c => c.type === 'creature');
				const bidx = p2.board.indexOf(bot);
				if (bot && bidx >= 0 && picks.length) {
					const pick = picks[Math.floor(state.rng() * picks.length)];
					p2.hand = p2.hand.filter(c => c !== pick);
					pick.zone = 'board';
					pick.sick = true;
					p2.board[bidx] = pick;
					bot.zone = 'hand';
					bot.damage = 0;
					p2.hand.push(bot);
					emit(state, { type: 'summon', player: pi, card: pick });
					recomputeAuras(state);
				}
				break;
			}
			case 'grant-minion': {
				// bless the triggering minion (Warsong Commander's Charge)
				const m = triggering();
				if (m && !m.keywords.includes(e.keyword)) {
					m.keywords.push(e.keyword);
					if (e.keyword === KW.DIVINE_SHIELD) m.shield = true;
					if (e.keyword === KW.STEALTH) m.stealthed = true;
				}
				break;
			}
			case 'buff-random-friendly': {
				const pool = state.players[pi].board.filter(c => !isDead(c)
					&& (!e.excludeSelf || c !== ctx.self)
					&& (!e.tribe || (c.tribe || '').includes(e.tribe)));
				if (pool.length) {
					const m = pool[Math.floor(state.rng() * pool.length)];
					m.attack += e.attack || 0;
					m.maxHealth += e.health || 0;
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
			case 'counter-self': {
				// Champion of the Parish: bank a +1/+1 counter on the firing creature
				const m = ctx.self;
				if (m && !isDead(m)) {
					const n = e.value || 1;
					m.counters += n;
					m.attack += n;
					m.maxHealth += n;
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
			case 'grant-self': {
				// One-eyed Cheat: the firing permanent gains a keyword
				const m = ctx.self;
				if (m && !isDead(m) && !m.keywords.includes(e.keyword)) {
					m.keywords.push(e.keyword);
					if (e.keyword === KW.STEALTH) m.stealthed = true;
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
			case 'buff-self': {
				const m = ctx.self;
				if (m && !isDead(m)) {
					m.attack += e.attack || 0;
					m.maxHealth += e.health || 0;
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
			case 'reduce-drawn-cost': {
				// Shadowfiend: the just-drawn card costs (N) less
				if (ctx.card) ctx.card.cost = Math.max(0, (ctx.card.cost || 0) - (e.value || 1));
				break;
			}
			case 'mirror-damage-to-own-hero': {
				// Wrathguard: when this takes damage, deal that much to your own hero
				if (ctx.amount > 0) damageHero(state, pi, ctx.amount, pi);
				break;
			}
			case 'maybe-draw-drawer': {
				// Nat, the Darkfisher: at the opponent's turn start, they may draw
				if (state.rng() < (e.chance || 0.5)) drawCards(state, ctx.drawer ?? state.current, 1);
				break;
			}
			case 'gain-armor-by-amount': {
				// Alley Armorsmith: gain Armor equal to the damage just dealt
				if (ctx.amount > 0) gainArmor(state, pi, ctx.amount);
				break;
			}
			case 'gain-armor-spell-cost': {
					// Arcane Artificer: gain Armor equal to the cast spell's Cost
					const sp = ctx.spell || ctx.played;
					if (sp) gainArmor(state, pi, sp.cost || 0);
					break;
				}
				case 'trigger-summoned-deathrattle': {
				// Spiritsinger Umbra: fire the just-summoned creature's Deathrattle now
				const m = ctx.minion;
				if (m && m !== ctx.self && m.deathrattle) runDeathrattle(state, m.controller, m);
				break;
			}
			case 'remember-spell': {
				// Primalfin Champion: record spells cast on this creature
				if (ctx.self && ctx.spell) { (ctx.self.rememberedSpells = ctx.self.rememberedSpells || []).push(ctx.spell.id); }
				break;
			}
			case 'copy-enemy-spell': {
				// Trade Prince Gallywix: copy the cast spell, give its caster a Coin
				const spell = ctx.spell;
				const pp = state.players[pi];
				if (spell && state.cardsById[spell.id] && pp.hand.length < MAX_HAND) {
					const c = instantiate(state.cardsById[spell.id], pi); c.zone = 'hand';
					pp.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null });
				}
				if (ctx.caster != null) addCoin(state, ctx.caster);
				break;
			}
			case 'destroy-damaged': {
				// Acidmaw: destroy the creature that was just damaged
				const t = ctx.damaged;
				if (t && !isDead(t)) { t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); }
				break;
			}
			case 'buff-self-by-amount': {
				// Tunnel Trogg: +1 Attack per locked crystal (the Overload amount)
				const m = ctx.self;
				if (m && !isDead(m) && ctx.amount > 0) {
					m.attack += (e.attack || 1) * ctx.amount;
					m.maxHealth += (e.health || 0) * ctx.amount;
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
			case 'summon-of-spell-cost': {
				// Summoning Stone: summon a random creature of the cast spell's Cost
				const cost = ctx.played ? (ctx.played.cost || 0) : 0;
				execEffects(state, pi, [{ type: 'summon-random', cost }], null, ctx.self);
				break;
			}
			case 'copy-drawn': {
				// Chromaggus: put another copy of the just-drawn card into your hand
				const drawn = ctx.card;
				const p = state.players[pi];
				const def = drawn && state.cardsById[drawn.id];
				if (def && p.hand.length < MAX_HAND) {
					const copy = instantiate(def, pi);
					copy.zone = 'hand';
					p.hand.push(copy);
					emit(state, { type: 'conjure', player: pi, card: copy, color: null });
				}
				break;
			}
			case 'damage-self': {
				const m = ctx.self;
				if (m && !isDead(m)) damageCreature(state, m, e.value, null);
				break;
			}
			case 'set-health': {
				const m = triggering();
				if (m) { m.maxHealth = e.value; m.damage = 0; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
			case 'copy-minion': {
				// of:'target' copies the attacked creature (Pack Tactics);
				// attack/health override forces token stats
				const m = e.of === 'target' && ctx.target?.type === 'creature'
					? findCreature(state, ctx.target.uid) : triggering();
				if (m) {
					const def = state.cardsById[m.id] || {
						id: m.id, name: m.name, type: 'creature', cost: m.cost, rarity: m.rarity,
						description: m.description, attack: m.attack, health: m.maxHealth, keywords: [...m.keywords],
					};
					const c = summon(state, pi, def);
					if (c && e.attack != null) {
						c.attack = e.attack + c.auraAttack;
						c.maxHealth = e.health + c.auraHealth;
						c.damage = 0;
					}
				}
				break;
			}
			case 'bounce-attacker': {
				const m = triggering();
				if (m) {
					const owner = state.players[m.controller];
					owner.board = owner.board.filter(c => c !== m);
					const def = state.cardsById[m.id];
					if (def) {
						const nc = instantiate(def, m.controller);
						nc.cost += e.costMod || 0;
						nc.zone = 'hand';
						owner.hand.push(nc);
					}
					emit(state, { type: 'bounce', player: m.controller, name: m.name });
					ctx.cancelled = true;
				}
				break;
			}
			case 'summon-redirect': {
				const t = summon(state, pi, {
					id: 'token_' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: e.name, type: 'creature', cost: 0, rarity: 'common',
					description: `A ${e.attack}/${e.health} token.`,
					attack: e.attack, health: e.health, keywords: e.keywords || [],
				});
				if (t) ctx.target = { type: 'creature', uid: t.uid, player: pi };
				break;
			}
			case 'redirect-random': {
				const pool = [];
				for (let side = 0; side < state.players.length; side++) {
					if (state.players[side].eliminated) continue;
					for (const c of state.players[side].board) {
						if (c === ctx.attacker || isDead(c)) continue;
						if (ctx.target?.type === 'creature' && ctx.target.uid === c.uid) continue;
						pool.push({ type: 'creature', uid: c.uid, player: side });
					}
					const isOriginalTarget = ctx.target?.type === 'hero' && ctx.target.player === side;
					const isAttackingHero = ctx.attackerType === 'hero' && ctx.attackerPlayer === side;
					if (!isOriginalTarget && !isAttackingHero) pool.push({ type: 'hero', player: side });
				}
				if (pool.length) ctx.target = pool[Math.floor(state.rng() * pool.length)];
				break;
			}
			case 'gain-dead-stats': {
				// Glugg: gain the ORIGINAL (printed) stats of the friendly creature that died
				const dead = ctx.dead, def = dead && state.cardsById[dead.id], self = ctx.self;
				if (self && def && !isDead(self)) {
					self.attack += def.attack || 0;
					self.maxHealth += def.health || 0;
					emit(state, { type: 'buff', uid: self.uid, attack: self.attack, hp: hp(self) });
				}
				break;
			}
			case 'destroy-triggering': {
				// Frost Queen Sindragosa: destroy the enemy creature that was just Frozen
				const t = ctx.frozen || ctx.minion;
				if (t && !isDead(t) && t.controller !== pi) {
					t.damage = t.maxHealth; t.shield = false;
					emit(state, { type: 'destroy', uid: t.uid });
				}
				break;
			}
			case 'opponent-may-pay': {
				// Rhystic Study / Smothering Tithe: the opponent tied to this trigger
				// (the caster / the drawer) may pay `amount`; if they don't, the
				// enchantment's controller (pi) gets `else`. `pi` and benefit are captured now.
				const opp = ctx.caster != null ? ctx.caster : (ctx.drawer != null ? ctx.drawer : null);
				if (opp != null && opp !== pi && !state.players[opp].eliminated) {
					const benefit = e.else || [];
					if (availableMana(state.players[opp]) >= e.amount) {
						state.askQueue.push({ player: opp,
							prompt: e.prompt || `Pay ${e.amount}?`, yes: `Pay ${e.amount}`, no: e.no || 'Decline',
							payOr: { amount: e.amount, benefitPi: pi, benefit } });
						emit(state, { type: 'askStart', player: opp, prompt: e.prompt || `Pay ${e.amount}?` });
					} else {
						execEffects(state, pi, benefit, null, ctx.self || null); // can't pay: controller gets it now
					}
				}
				break;
			}
			case 'mirror-to-hero':
				// Soulbound Ashtongue: also deal the damage taken to your hero
				if (ctx.amount) damageHero(state, pi, ctx.amount, pi);
				break;
			case 'conjure-same-cost-spell': {
				// Cheesemonger: when the opponent casts a spell, add a random spell of the same Cost
				const sp = ctx.spell; const p = state.players[pi];
				if (sp && p.hand.length < MAX_HAND) {
					const pool = Object.values(state.cardsById).filter(d => isSpellType(d) && !d.token && d.collectible !== false && !(d.colors && d.colors.length) && (d.cost || 0) === (sp.cost || 0));
					if (pool.length) { const nc = instantiate(pool[Math.floor(state.rng() * pool.length)], pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); }
				}
				break;
			}
			case 'add-copy-of-played-free': {
				// Tamsin Roame: when you cast a qualifying spell, add a (0)-cost copy to hand
				const sp = ctx.played; const p = state.players[pi];
				if (sp && (sp.cost || 0) >= (e.minCost || 0) && state.cardsById[sp.id] && p.hand.length < MAX_HAND) {
					const nc = instantiate(state.cardsById[sp.id], pi); nc.zone = 'hand'; nc.cost = 0; p.hand.push(nc);
					emit(state, { type: 'conjure', player: pi, card: nc, color: null });
				}
				break;
			}
			case 'summon-dead-copy-no-keyword': {
				// Plaguemaw the Rotting: resummon the fallen minion without a keyword
				const dead = ctx.dead; const base = dead && state.cardsById[dead.id];
				if (base) { const def = JSON.parse(JSON.stringify(base)); def.keywords = (def.keywords || []).filter(k => k !== e.keyword); const c = summon(state, pi, def); }
				break;
			}
			case 'gain-armor-by-amount': {
				// Gold Road Grunt (Frenzy): gain Armor equal to the damage just taken
				if (ctx.amount) gainArmor(state, pi, ctx.amount);
				break;
			}
			case 'bump-drawn-cost': {
				// Far Watch Post: after the opponent draws, that card costs more (capped)
				const drawn = ctx.card;
				if (drawn) drawn.cost = Math.min(e.cap || 10, (drawn.cost || 0) + (e.value || 1));
				break;
			}
			case 'add-copy-cost': {
				// Keymaster Alabaster: when the opponent draws, copy that card to your hand at a set Cost
				const drawn = ctx.card;
				const p = state.players[pi];
				if (drawn && state.cardsById[drawn.id] && p.hand.length < MAX_HAND) {
					const copy = instantiate(state.cardsById[drawn.id], pi);
					copy.zone = 'hand'; copy.cost = e.value != null ? e.value : (copy.cost || 0);
					p.hand.push(copy);
					emit(state, { type: 'conjure', player: pi, card: copy, color: null });
				}
				break;
			}
			case 'set-victim-stats': {
				// Turalyon, the Tenured: set the attacked minion's Attack and Health to N
				const v = ctx.victim;
				if (v && !isDead(v)) { v.attack = e.value || 3; v.maxHealth = e.value || 3; v.damage = 0; v.tempHealth = 0; emit(state, { type: 'buff', uid: v.uid, attack: v.attack, hp: hp(v) }); }
				break;
			}
			case 'buff-self-by-spell-cost': {
				// Speaker Gidra (Spellburst): gain Attack and Health equal to the spell's Cost
				const cost = ctx.played ? (ctx.played.cost || 0) : 0;
				if (ctx.self && !isDead(ctx.self) && cost > 0) execEffects(state, pi, [{ type: 'buff-self', attack: cost, health: cost }], null, ctx.self);
				break;
			}
			case 'gandling': {
				// Disciplinarian Gandling: destroy the just-played minion, summon a 4/4 Failed Student
				const m = ctx.minion;
				if (m && !isDead(m) && m !== ctx.self) {
					m.damage = m.maxHealth; m.shield = false; emit(state, { type: 'destroy', uid: m.uid }); sweepDeaths(state);
					summon(state, pi, { id: 'sch_failed_student', name: 'Failed Student', type: 'creature', cost: 4, token: true, rarity: 'common', attack: 4, health: 4, description: 'A 4/4 token.' });
				}
				break;
			}
			case 'cast-random-same-cost': {
				// Enchanted Cauldron (Spellburst): cast a random spell of the just-cast spell's Cost
				const cost = ctx.played ? (ctx.played.cost || 0) : 0;
				execEffects(state, pi, [{ type: 'cast-random-spell', count: 1, cost }], null, ctx.self || null);
				break;
			}
			case 'silence-victim': {
				// Magehunter: Silence the minion this just attacked
				if (ctx.victim && !isDead(ctx.victim)) silenceCreature(state, ctx.victim);
				break;
			}
			case 'summon-copy-of-played': {
				// Playmaker: summon a copy of the just-played minion with N Health remaining
				const m = ctx.minion; const base = m && state.cardsById[m.id];
				if (base) { const c = summon(state, pi, JSON.parse(JSON.stringify(base))); if (c && e.health != null) { c.damage = Math.max(0, (c.maxHealth || 1) - e.health); emit(state, { type: 'damage', targetType: 'creature', uid: c.uid, amount: 0, hp: hp(c) }); } }
				break;
			}
			case 'transform-victim-into': {
				// Infectious Sporeling: turn the minion this just damaged into a copy of `id`
				const v = ctx.victim; const base = state.cardsById[e.id];
				if (v && !isDead(v) && base) {
					const tok = instantiate(JSON.parse(JSON.stringify(base)), v.controller);
					tok.zone = 'board'; tok.sick = v.sick;
					const board = state.players[v.controller].board;
					const bi = board.indexOf(v);
					if (bi >= 0) { board[bi] = tok; v.zone = 'gone'; emit(state, { type: 'transformed', uid: v.uid, player: v.controller, from: v.name, card: tok }); recomputeAuras(state); }
				}
				break;
			}
			default:
				// pass the firing permanent through as `source` so self-scoped
				// effects (temp-buff-self, gain-weapon-attack) still work
				execEffects(state, pi, [e], null, ctx.self || null);
		}
	}
}

// ---------- scripted card mechanics (text the Lua engine didn't implement) ----------
function runBattlecry(state, pi, card, target, choice) {
	const p = state.players[pi];
	// data-driven battlecries (imported sets); legacy ids stay hand-scripted below
	if ((card.effects || card.choices || card.combo || (card._kicked && card.kicker)) && !LEGACY_SCRIPTED.has(card.id)) {
		// Murmuring Elemental: this card's Battlecry fires twice (consumed here, but
		// never by the card that armed it — its own effect sets the flag AFTER this read)
		const flagDouble = p.nextBattlecryDouble;
		if (flagDouble) p.nextBattlecryDouble = false;
		execEffects(state, pi, liveEffectsOf(state, pi, card, choice), target, card);
		// Battle Totem (dungeon treasure / Jin'zo passive) or a live Brann
		if (flagDouble || p.battlecriesTwice
			|| p.board.some(c => c.battlecryDouble && !isDead(c) && c !== card)) {
			execEffects(state, pi, liveEffectsOf(state, pi, card, choice), target, card);
		}
	}
	// Outcast: an extra battlecry when played from the edge of hand
	if (card.outcast && card._outcast) { execEffects(state, pi, card.outcast.effects, target, card); fireOngoing(state, pi, 'outcast-played', { played: card }); } // Redeemed Pariah reacts
	switch (card.id) {
		case 'wandering_merchant': drawCards(state, pi, 1); break;
		case 'legion_commander': {
			const i = p.board.indexOf(card);
			for (const adj of [p.board[i - 1], p.board[i + 1]]) {
				if (adj) { adj.attack += 1; adj.maxHealth += 1; emit(state, { type: 'buff', uid: adj.uid, attack: adj.attack, hp: hp(adj) }); }
			}
			break;
		}
		case 'pack_wolf':
			if (p.board.some(c => c !== card && c.tribe && c.tribe.includes('Beast'))) {
				card.attack += 2; card.maxHealth += 2;
				emit(state, { type: 'buff', uid: card.uid, attack: card.attack, hp: hp(card) });
			}
			break;
		case 'contract_killer':
			if (target && target.type === 'creature') {
				const t = findCreature(state, target.uid);
				if (t && hp(t) <= 3) { t.damage = t.maxHealth; emit(state, { type: 'destroy', uid: t.uid }); }
			}
			break;
		case 'tumbleweed_tactician':
			if (target && target.type === 'creature') {
				const t = findCreature(state, target.uid);
				if (t) {
					damageCreature(state, t, 3, null);
					if (isDead(t)) summon(state, pi, TOKENS.tumbleweed);
				}
			}
			break;
	}
}

function runDeathrattle(state, pi, card) {
	if (card.deathrattle) {
		execEffects(state, pi, card.deathrattle, null, card);
		// Totem of the Dead (dungeon treasure / Azun passive) or a live Rivendare
		if (state.players[pi].deathrattlesTwice
			|| state.players[pi].board.some(c => c.rattleDouble && !isDead(c))) {
			execEffects(state, pi, card.deathrattle, null, card);
		}
	}
	switch (card.id) {
		case 'forest_sprite': summon(state, pi, TOKENS.seedling); break;
		case 'acidspitter': {
			const opps = opponentsOf(state, pi);
			if (!opps.length) break;
			const opp = opps[Math.floor(state.rng() * opps.length)];
			const targets = [...state.players[opp].board.filter(c => !isDead(c)), 'hero'];
			const pick = targets[Math.floor(state.rng() * targets.length)];
			if (pick === 'hero') damageHero(state, opp, 1, pi);
			else damageCreature(state, pick, 1, null);
			break;
		}
		case 'running_gunner': {
			for (const opp of opponentsOf(state, pi)) {
				for (const c of state.players[opp].board) damageCreature(state, c, 1, null);
				damageHero(state, opp, 1, pi);
			}
			break;
		}
	}
}

// generic effect executor shared by spells, battlecries, and deathrattles.
// `target` is the player's chosen target (or null); AoE targets need no choice.
// `source` is the card whose effect is running (used by gain-weapon-attack).
function execEffects(state, pi, effects, target, source) {
	const enemies = opponentsOf(state, pi);
	// current Herald multiplier for `heraldScaled` effects (Colossal appendages)
	const hm = () => heraldMult(state.players[pi].heraldCount || 0);
	const pickEnemy = () => enemies.length ? enemies[Math.floor(state.rng() * enemies.length)] : null;
	// "the enemy hero": the chosen one, the only one, or (untargeted fallback) a random one
	const enemyHero = () => {
		if (target?.type === 'hero' && target.player !== pi) return target.player;
		return enemies.length === 1 ? enemies[0] : pickEnemy();
	};
	const chosenCreature = () => target?.type === 'creature' ? findCreature(state, target.uid) : null;
	const healCreature = (c, v) => {
		const healed = c.damage > 0 && v > 0;
		const landed = Math.min(v, c.damage); // Xyrella: healing that actually restored Health
		// Overheal: the healing that overflows past full Health (wasted, but a bonus)
		const overflow = v - c.damage;
		c.damage = Math.max(0, c.damage - v);
		emit(state, { type: 'heal', targetType: 'creature', uid: c.uid, amount: v, hp: hp(c) });
		if (v > 0 && !isDead(c)) { const hb = state.players[pi].board.filter(x => x.healBonusHealth && !isDead(x)).reduce((s, x) => s + x.healBonusHealth, 0); if (hb) { c.maxHealth += hb; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); } } // Lightsteed
		if (healed) {
			state.players[pi].healedThisTurn = true; // Cleric of An'she
			state.players[pi].healedAmountThisTurn = (state.players[pi].healedAmountThisTurn || 0) + landed; // Xyrella
			for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'healed', { healedCreature: c });
		}
		if (c.overheal && overflow > 0 && !isDead(c)) {
			execEffects(state, c.controller, c.overheal, null, c);
		}
	};
	const buffCreature = (c, atk, hpv) => {
		c.attack += atk;
		c.maxHealth += hpv;
		// any permanent +1/+1 banks a "counter" so Proliferate can find it later
		if (atk > 0 && hpv > 0) c.counters = (c.counters || 0) + Math.min(atk, hpv);
		emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
	};
	// Shield Slam-style scaling: the effect's value multiplies by a live count
	const scaled = e => {
		if (e.value === 'X') return source?.xValue || 0; // X-spells: excess mana
		if (!e.valuePer) return e.value;
		const p = state.players[pi];
		if (e.valuePer === 'armor') return (e.value || 1) * p.armor;
		if (e.valuePer === 'cards-played') return (e.value || 1) * (p.cardsPlayedThisTurn || 0); // Shadow Sculptor
		if (e.valuePer === 'hero-attack') return heroAttackValue(p);
		if (e.valuePer === 'damaged-friendly') {
			let n = p.board.filter(c => !isDead(c) && c.damage > 0).length;
			if (p.life < STARTING_LIFE) n++;
			return (e.value || 1) * n;
		}
		return e.value;
	};
	// Prophet Velen doubles spell and hero-power damage/healing
	const velen = source && (source.type === 'sorcery' || source.type === 'instant' || source.type === 'heropower')
		? staticValue(state.players[pi], 'double-spell') : 0;
	const boost = v0 => v0 * (2 ** velen);
	for (const e of effects || []) {
		// Lifesteal spells: heal your hero for the damage actually dealt. Measured
		// as the total hurt delta so shields absorbing damage heal nothing.
		const totalHurt = () => state.players.reduce((s, pl) =>
			s + pl.board.reduce((b, c) => b + c.damage, 0) - pl.life - pl.armor, 0);
		const spellLS = source && (source.type === 'sorcery' || source.type === 'instant') && state.players[pi].spellsLifestealThisTurn; // Omega Mind
			const lsBefore = (e.type === 'damage' || e.type === 'random-damage') && (e.lifesteal || spellLS) ? totalHurt() : null;
		if (e.type === 'damage') {
			if (e.requireElementalLastTurn && !state.players[pi].elementalLastTurn) continue; // Gyreworm
				if (e.requireControlOtherTribe && !state.players[pi].board.some(c => c !== source && !isDead(c) && (c.tribe || '').includes(e.requireControlOtherTribe))) continue; // South Coast Chieftain
				if (e.requireDeckAtMost != null && state.players[pi].deck.length > e.requireDeckAtMost) continue; // Blood Shard Bristleback
				if (e.requireHoldingSchool && !state.players[pi].hand.some(c => schoolOf(c) === e.requireHoldingSchool)) continue; // Defias Leper
				if (e.requireHeroDamagedThisTurn && !state.players[pi].heroDamagedThisTurn) continue; // Shadowblade Slinger
			// friendly Spell Damage boosts direct spell damage
			let v = e.value === 'source-attack' ? (source?.attack || 0) : scaled(e); // Sergeant Sally
			if (e.valueFromHeroDamage) v = state.players[pi].heroDamageTakenThisTurn || 0; // Shadowblade Slinger
				if (e.altValueIfDrawn != null && source && source.drawnThisTurn) v = e.altValueIfDrawn; // Oil Rig Ambusher
			if (source && (source.type === 'sorcery' || source.type === 'instant')) {
				v += staticValue(state.players[pi], 'spell-damage') + (state.players[pi].nextSpellDamageBonus || 0);
			}
			if (state.hpDamageBonus) v += state.hpDamageBonus; // Fallen Hero: your Hero Power deals extra
			if (state.hpDoubling) v *= 2; // Clockwork Automaton: double Hero Power damage
			v = boost(v);
			// Lightning Storm rolls its damage per target
			const rollv = () => e.range
				? boost(e.range[0] + Math.floor(state.rng() * (e.range[1] - e.range[0] + 1)))
				: v;
			switch (e.target) {
				case 'enemy-hero': { const t = enemyHero(); if (t != null) damageHero(state, t, v, pi); break; }
				case 'own-hero': damageHero(state, pi, v, pi); break;
				case 'enemy-creatures': for (const o of enemies) for (const c of [...state.players[o].board]) { if (e.exceptTribe && (c.tribe || '').includes(e.exceptTribe)) continue; damageCreature(state, c, rollv(), null); } break;
				case 'frozen-enemy-creatures': for (const o of enemies) for (const c of [...state.players[o].board]) { if (c.frozen) damageCreature(state, c, v, null); } break;
				case 'all-creatures': for (const pl of state.players) for (const c of [...pl.board]) { if (e.exceptTribe && (c.tribe || '').includes(e.exceptTribe)) continue; if (e.requireKeyword && !c.keywords.includes(e.requireKeyword)) continue; if (e.exceptSelf && c === source) continue; damageCreature(state, c, v, null); } break;
				case 'enemies':
					for (const o of enemies) {
						for (const c of [...state.players[o].board]) damageCreature(state, c, v, null);
						damageHero(state, o, v, pi);
					}
					break;
				case 'enemy-heroes': // every opponent's face, creatures untouched
					for (const o of enemies) damageHero(state, o, v, pi);
					break;
				case 'all-heroes': // each hero including your own
					for (let s2 = 0; s2 < state.players.length; s2++) {
						if (!state.players[s2].eliminated) damageHero(state, s2, v, pi);
					}
					break;
				case 'undamaged-enemy-creatures': // Dark Iron Skulker
					for (const o of enemies) {
						for (const c of [...state.players[o].board]) {
							if (c.damage === 0) damageCreature(state, c, v, null);
						}
					}
					break;
				case 'everyone':
					for (let s = 0; s < state.players.length; s++) {
						if (state.players[s].eliminated) continue;
						for (const c of [...state.players[s].board]) damageCreature(state, c, v, null);
						damageHero(state, s, v, pi);
					}
					break;
				case 'other-characters': // everything except the source creature
					for (let s = 0; s < state.players.length; s++) {
						if (state.players[s].eliminated) continue;
						for (const c of [...state.players[s].board]) if (c !== source) damageCreature(state, c, v, null);
						damageHero(state, s, v, pi);
					}
					break;
				case 'other-creatures': // every creature except the source
					for (const pl of state.players) {
						for (const c of [...pl.board]) if (c !== source) damageCreature(state, c, v, null);
					}
					break;
				case 'damaged-creatures': // Sleep with the Fishes
					for (const pl of state.players) {
						for (const c of [...pl.board]) if (c.damage > 0) damageCreature(state, c, v, null);
					}
					break;
				case 'own-creatures': // Ticking Abomination
					for (const c of [...state.players[pi].board]) damageCreature(state, c, v, null);
					break;
				default: { // chosen target
					const t = chosenCreature();
					if (t) damageCreature(state, t, v, null);
					else if (target?.type === 'hero') damageHero(state, target.player, v, pi);
					else if (e.target === 'any') { const f = enemyHero(); if (f != null) damageHero(state, f, v, pi); } // fallback: face
				}
			}
			if (lsBefore != null) healHero(state, pi, Math.max(0, totalHurt() - lsBefore));
		} else if (e.type === 'heal') {
			let v = e.value === "X" ? (source?.xValue || 0) : e.valueFromHandSize ? state.players[pi].hand.length : boost(e.value); // Spice Bread Baker
			if (state.hpDoubling) v *= 2; // Clockwork Automaton: double Hero Power healing
			// Auchenai Soulpriest: your healing deals damage instead
			const harm = staticValue(state.players[pi], 'heal-becomes-damage') > 0 || state.players[pi].healHarmThisTurn; // Auchenai Phantasm
			const mendHero = who => harm ? damageHero(state, who, v, pi) : healHero(state, who, v);
			const mend = c => harm ? damageCreature(state, c, v, null) : healCreature(c, v);
			if (e.target === 'self') mendHero(pi);
			else if (e.target === 'enemy-hero') { const t = enemyHero(); if (t != null) mendHero(t); }
			else if (e.target === 'enemy-heroes') { for (const o of opponentsOf(state, pi)) mendHero(o); }
			else if (e.target === 'all-heroes') { for (let s = 0; s < state.players.length; s++) if (!state.players[s].eliminated) mendHero(s); }
			else if (e.target === 'all-creatures') { for (const pl of state.players) for (const c of [...pl.board]) mend(c); }
			else if (e.target === 'friendly-creatures') { for (const c of [...state.players[pi].board]) mend(c); }
			else if (e.target === 'friendly-all') { mendHero(pi); for (const c of [...state.players[pi].board]) mend(c); }
			else if (e.target === 'random-damaged-friendly') {
				// Black Blood's Body: restore a random damaged friendly character
				const pool = [...state.players[pi].board.filter(c => !isDead(c) && c.damage > 0)];
				if (state.players[pi].life < STARTING_LIFE) pool.push('hero');
				if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)];
					if (t === 'hero') mendHero(pi); else mend(t); }
			}
			else {
				const t = chosenCreature();
				if (t) mend(t);
				else if (target?.type === 'hero') mendHero(target.player);
				else mendHero(pi);
			}
		} else if (e.type === 'draw') {
			if (e.target === 'all') { for (let s2 = 0; s2 < state.players.length; s2++) if (!state.players[s2].eliminated) drawCards(state, s2, scaled(e)); }
			else drawCards(state, pi, scaled(e));
		} else if (e.type === 'draw-then') {
			// draw N; run `then` only if a card was actually drawn ("if you do")
			const n = drawCards(state, pi, scaled(e));
			if (n > 0 && e.then) execEffects(state, pi, e.then, target, source);
		} else if (e.type === 'draw-check') {
			// draw N, then run `then` only if every newly-drawn card matches e.allType
			const dp = state.players[pi];
			const before = new Set(dp.hand.map(c => c.uid));
			drawCards(state, pi, e.value || 1);
			const drawn = dp.hand.filter(c => !before.has(c.uid));
			if (drawn.length >= (e.value || 1) && (!e.allType || drawn.every(c => c.type === e.allType)) && e.then)
				execEffects(state, pi, e.then, target, source);
		} else if (e.type === 'may') {
			// optional "you may …": defer a yes/no to the controller. The UI (or AI)
			// resolves it via resolveAsk, running `then` on yes / `else` on no.
			state.askQueue.push({ player: pi, prompt: e.prompt || '', yes: e.yes || 'Yes', no: e.no || 'No',
				then: e.then || [], else: e.else || [] });
			emit(state, { type: 'askStart', player: pi, prompt: e.prompt || '' });
		} else if (e.type === 'buff') {
			if (e.target === 'friendly-creatures') {
				for (const c of state.players[pi].board) {
					if (e.tribe && !(c.tribe || '').includes(e.tribe)) continue;
					if (e.excludeSelf && c === source) continue; // Felfin Navigator: your OTHER Murlocs
						if (e.name && c.name !== e.name) continue; // Quartermaster's Recruits
					if (e.requireKeyword && !c.keywords.includes(e.requireKeyword)) continue;
					if (e.requireDamaged && !(c.damage > 0)) continue; // Ball and Chain
					buffCreature(c, e.attack, e.health);
				}
			} else if (e.target === 'all-creatures') {
				for (const pl of state.players) for (const c of pl.board) {
					if (e.exceptTribe && (c.tribe || '').includes(e.exceptTribe)) continue;
					buffCreature(c, e.attack, e.health);
				}
			} else if (e.target === 'friendly-others') {
				for (const c of state.players[pi].board) if (c !== source) buffCreature(c, e.attack, e.health);
			} else if (e.target === 'all-others') {
				// every player's board except the source itself (tribal blessings)
				for (const pl of state.players) for (const c of pl.board) {
					if (c === source) continue;
					if (e.tribe && !(c.tribe || '').includes(e.tribe)) continue;
					buffCreature(c, e.attack, e.health);
				}
			} else {
				const t = chosenCreature();
				if (t && !(e.requireDamaged && t.damage === 0)) {
					// Vile Library: "+1/+1. Repeat for each Imp you control."
					let times = 1;
					if (e.repeatPerFriendly) {
						times += state.players[pi].board.filter(c => !isDead(c)
							&& c.type !== 'location'
							&& ((c.tribe || '').includes(e.repeatPerFriendly)
								|| c.name.includes(e.repeatPerFriendly))).length;
					}
					for (let i = 0; i < times; i++) buffCreature(t, e.attack, e.health);
				}
			}
		} else if (e.type === 'grant') {
			const grantTo = e.target === 'friendly-creatures' ? state.players[pi].board
				: e.target === 'friendly-others' ? state.players[pi].board.filter(c => c !== source) // Camouflaged Dirigible
				: e.target === 'self' ? (source && source.zone === 'board' && !isDead(source) ? [source] : [])
				: [chosenCreature()].filter(Boolean);
			// tribe-restricted grants never fall back to a random creature
			if (!grantTo.length && e.target !== 'friendly-creatures' && e.target !== 'friendly-others' && e.target !== 'self' && !e.tribe) {
				// triggered grants without a chosen target bless a random friendly
				const pool = state.players[pi].board.filter(c => !isDead(c));
				if (pool.length) grantTo.push(pool[Math.floor(state.rng() * pool.length)]);
			}
			for (const c of grantTo) {
				// Castle Kennels: some grants only take on a matching tribe
				if (e.ifTribe && !(c.tribe || '').includes(e.ifTribe)) continue;
				if (e.ifName && c.name !== e.ifName) continue; // Balloon Merchant: Silver Hand Recruits
				if (!c.keywords.includes(e.keyword)) c.keywords.push(e.keyword);
				if (e.keyword === KW.DIVINE_SHIELD) c.shield = true;
				if (e.keyword === KW.STEALTH) c.stealthed = true;
			}
		} else if (e.type === 'destroy') {
			const t = chosenCreature();
			if (t && (e.requireHeroHealthChanged == null || state.players[pi].heroHealthChangedThisTurn)
					&& (e.maxAttack == null || t.attack <= e.maxAttack)
				&& (e.maxCost == null || (t.cost || 0) <= e.maxCost)
				&& (e.minAttack == null || t.attack >= e.minAttack)
				&& (e.requireKeyword == null || t.keywords.includes(e.requireKeyword))
				&& (e.requireRarity == null || t.rarity === e.requireRarity)
				&& (e.tribe == null || (t.tribe || '').includes(e.tribe))
				&& !(e.requireDamaged && t.damage === 0)) {
				t.damage = t.maxHealth;
				t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
				// riders that only apply when something was actually destroyed
				if (e.then) execEffects(state, pi, e.then, target, source);
			}
		} else if (e.type === 'destroy-random') {
			for (let n = 0; n < (e.count || 1); n++) {
				const pool = [];
				for (const o of enemies) for (const c of state.players[o].board) {
					if (!isDead(c) && (e.maxAttack == null || c.attack <= e.maxAttack)) pool.push(c);
				}
				if (!pool.length) break;
				const t = pool[Math.floor(state.rng() * pool.length)];
				t.damage = t.maxHealth;
				t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
			}
		} else if (e.type === 'destroy-all') {
			// board wipe; `others` spares the source, `spareRandom` spares one survivor
			const all = [];
			const wipeBoards = e.side === 'enemy' ? enemies.map(o => state.players[o]) : state.players;
			for (const pl of wipeBoards) for (const c of pl.board) if (!isDead(c)) all.push(c);
			let spare = null;
			if (e.others && source) spare = source;
			if (e.spareRandom && all.length) spare = all[Math.floor(state.rng() * all.length)];
			for (const c of all) {
				if (c === spare) continue;
				if (e.tribe && !(c.tribe || '').includes(e.tribe)) continue;
				// "Destroy all non-Paladin creatures": spare a class's cards
				if (e.exceptClass && (c.cardClass || '').split('__').includes(e.exceptClass)) continue;
				if (e.exceptTribe && (c.tribe || '').includes(e.exceptTribe)) continue;
				if (e.maxCost != null && (c.cost || 0) > e.maxCost) continue; // Austere Command: MV 3 or less
				if (e.minCost != null && (c.cost || 0) < e.minCost) continue; // Austere Command: MV 4 or greater
				if (e.requireDamaged && !(c.damage > 0)) continue; // King Mosh: only damaged creatures
				if (e.maxAttack != null && (c.attack || 0) > e.maxAttack) continue; // Mossy Horror: 2 or less Attack
				if (e.exile) {
					const owner = state.players[c.controller];
					owner.board = owner.board.filter(x => x !== c);
					c.zone = 'exile'; owner.exile.push(c);
					emit(state, { type: 'exiled', uid: c.uid, player: c.controller, name: c.name });
				} else {
					c.damage = c.maxHealth;
					c.shield = false;
					emit(state, { type: 'destroy', uid: c.uid });
				}
			}
		} else if (e.type === 'clear-graveyards') {
			// Farewell: exile every card in every graveyard
			for (const pl of state.players) { for (const c of pl.graveyard) { c.zone = 'exile'; pl.exile.push(c); } pl.graveyard = []; }
			emit(state, { type: 'graveyardsCleared', player: pi });
		} else if (e.type === 'blink') {
			// Flicker: exile a creature, then immediately return it as a fresh
			// permanent (resets damage/auras/buffs) and retrigger its Battlecry.
			const t = chosenCreature();
			if (t && t.zone === 'board' && !isDead(t) && t !== source) {
				const owner = t.controller;
				state.players[owner].board = state.players[owner].board.filter(c => c !== t);
				for (const pl of state.players) for (const eq of pl.artifacts) if (eq.equip && eq.attachedTo === t.uid) eq.attachedTo = null;
				emit(state, { type: 'blinkOut', uid: t.uid, player: owner, name: t.name });
				recomputeAuras(state);
				if (!t.token) { // tokens cease to exist when they leave play
					const def = state.cardsById[t.id] || { id: t.id, name: t.name, type: 'creature', cost: t.cost,
						attack: t.attack, health: t.maxHealth, rarity: t.rarity, description: t.description, tribe: t.tribe };
					if (e.delayed) {
						// "return at the beginning of the next end step" — it's gone this turn (dodges wipes)
						(state.pendingReturns = state.pendingReturns || []).push({ controller: pi, def });
					} else {
						returnBlinked(state, owner, def); // immediate flicker
					}
				}
			}
		} else if (e.type === 'counter-stack') {
			// Cryptic Command's counter mode: counter the topmost spell now on the stack
			const top = [...state.stack].reverse().find(en => en.kind === 'spell' && !en.countered);
			if (top) counterStackEntry(state, top, 'graveyard');
		} else if (e.type === 'fight') {
			// two-target fight: the chosen fighter (target.uid) and its foe
			// (target.fightTarget) each deal damage equal to their power to the other
			const aC = e.selfFights ? source : chosenCreature();
			const bC = e.selfFights ? chosenCreature() : (target && target.fightTarget != null ? findCreature(state, target.fightTarget) : null);
			if (aC && bC && aC !== bC && !isDead(aC) && !isDead(bC)) {
				const pa = aC.attack, pb = bC.attack;
				emit(state, { type: 'fight', a: aC.uid, b: bC.uid });
				damageCreature(state, bC, pa, aC);
				damageCreature(state, aC, pb, bC);
			}
		} else if (e.type === 'exile') {
			// removed from the game: no death, no deathrattle, never reshuffled
			const t = chosenCreature();
			if (t && (e.minAttack == null || t.attack >= e.minAttack)) {
				const owner = state.players[t.controller];
				owner.board = owner.board.filter(c => c !== t);
				t.zone = 'exile';
				owner.exile.push(t);
				emit(state, { type: 'exiled', uid: t.uid, player: t.controller, name: t.name });
			}
		} else if (e.type === 'exile-until-return') {
			// Oblivion Ring / Fiend Hunter: exile a creature; it comes back (as a
			// fresh permanent) when THIS card leaves play (see sweepDeaths).
			const t = chosenCreature();
			if (t && source) {
				const owner = state.players[t.controller];
				owner.board = owner.board.filter(c => c !== t);
				t.zone = 'exile';
				owner.exile.push(t);
				source.oringExiled = { uid: t.uid, id: t.id, owner: t.controller };
				emit(state, { type: 'exiled', uid: t.uid, player: t.controller, name: t.name });
			}
		} else if (e.type === 'destroy-art-ench') {
			// non-targeted artifact/enchantment removal (there's no board-permanent
			// targeting UI). scope 'enemy' (default) or 'all'; count N (default 1) or
			// 'all'; exile:true exiles instead of destroying.
			const scope = e.scope === 'all' ? state.players.map((_, i) => i) : enemies;
			const pool = [];
			for (const s2 of scope) for (const c of [...state.players[s2].artifacts, ...state.players[s2].enchantments]) {
				if (e.only && c.type !== e.only) continue; // only:'artifact' or 'enchantment'
				pool.push([s2, c]);
			}
			const n = e.count === 'all' ? pool.length : (e.count || 1);
			for (let k = 0; k < n && pool.length; k++) {
				const j = Math.floor(state.rng() * pool.length);
				const [own, c] = pool.splice(j, 1)[0];
				destroyPermanent(state, own, c, !!e.exile);
			}
		} else if (e.type === 'deploy-equip') {
			// Stoneforge Mystic: put an Equipment from your hand into play (unattached)
			const pp = state.players[pi];
			const pool = pp.hand.filter(c => c.equip);
			const drop = (card) => {
				pp.hand = pp.hand.filter(x => x !== card);
				card.zone = 'artifact'; card.attachedTo = null;
				pp.artifacts.push(card);
				if (card.effects) execEffects(state, pi, card.effects, null, card);
				recomputeAuras(state);
				emit(state, { type: 'deployedEquip', player: pi, uid: card.uid, name: card.name });
				fireOngoing(state, pi, 'equipment-entered', { equip: card });
			};
			if (pool.length === 1) drop(pool[0]);
			else if (pool.length > 1) state.pickQueue.push({ player: pi, ids: [...new Set(pool.map(c => c.id))].slice(0, 8), mode: 'deploy-equip', title: 'Put an Equipment into play' });
		} else if (e.type === 'attach-equip') {
			// Kor Outfitter: attach an Equipment you control to a friendly creature
			// (free). No board-permanent targeting UI, so pick an unattached one you
			// control (else any) and put it on the chosen creature.
			const t = chosenCreature();
			const pp = state.players[pi];
			if (t && !isDead(t)) {
				const eqs = pp.artifacts.filter(a => a.equip);
				const eq = eqs.find(a => a.attachedTo === null) || eqs[0];
				if (eq) {
					eq.attachedTo = t.uid;
					emit(state, { type: 'equipAttached', player: pi, equipUid: eq.uid, creatureUid: t.uid, name: eq.name });
					recomputeAuras(state);
				}
			}
		} else if (e.type === 'emblem') {
			const p = state.players[pi];
			if (!p.eliminated) {
				const em = instantiate({
					id: 'emblem_' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: e.name, type: 'emblem', cost: 0, rarity: 'special',
					description: e.description || '', ongoing: e.ongoing || null,
					static: e.static || null, aura: e.aura || null,
				}, pi);
				em.zone = 'emblem';
				p.emblems.push(em);
				emit(state, { type: 'emblemGained', player: pi, card: em });
			}
		} else if (e.type === 'freeze') {
			if (e.target === 'enemy-creatures') { for (const o of enemies) for (const c of state.players[o].board) freezeCreature(state, c); }
			else if (e.target === 'random-enemy') { // Demented Frostcaller
				const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c) && !c.frozen && c.type !== 'location'));
				if (pool.length) freezeCreature(state, pool[Math.floor(state.rng() * pool.length)]);
			}
			else if (e.target === 'self') { if (source && !isDead(source)) freezeCreature(state, source); } // Frozen Crusher
			else if (e.target === 'friendly-others') { for (const c of state.players[pi].board) if (c !== source && !isDead(c)) freezeCreature(state, c); } // Hyldnir Frostrider
			else { const t = chosenCreature(); if (t) freezeCreature(state, t); /* hero freeze: no-op (heroes can't attack) */ }
		} else if (e.type === 'silence') {
			if (e.target === 'enemy-creatures') { for (const o of enemies) for (const c of state.players[o].board) silenceCreature(state, c); }
			else if (e.target === 'friendly-others') { for (const c of [...state.players[pi].board]) if (c !== source && !isDead(c)) silenceCreature(state, c); } // Wailing Soul
			else { const t = chosenCreature(); if (t) silenceCreature(state, t); }
		} else if (e.type === 'random-damage') {
			// count independent hits of `value` at random members of the pool;
			// Jungle Gym: extra hits for each friendly of a tribe
			let hits = e.count || 1;
			if (e.countByAttack && source) hits = source.attack || 0; // Augmented Porcupine: split its Attack
			if (e.perFriendlyTribe) {
				hits += state.players[pi].board.filter(c => !isDead(c)
					&& (c.tribe || '').includes(e.perFriendlyTribe)).length;
			}
			if (e.perHandCard) hits = state.players[pi].hand.length; // Meteorologist
			if (e.perHandSpell) hits = state.players[pi].hand.filter(c => isSpellType(c)).length; // Void Flayer
			for (let i = 0; i < hits; i++) {
				const pool = [];
				const pushBoard = side => { for (const c of state.players[side].board) if (!isDead(c) && c.type !== 'location' && !(e.exceptTribe && (c.tribe || '').includes(e.exceptTribe)) && !(e.exceptSource && c === source)) pool.push({ c }); };
				if (e.pool === 'friendly-others') { for (const c of state.players[pi].board) if (!isDead(c) && c !== source && c.type !== 'location') pool.push({ c }); } // Loose Specimen
				else if (e.pool === 'enemy-creatures') { for (const o of enemies) pushBoard(o); }
				else if (e.pool === 'all-creatures') { for (let s = 0; s < state.players.length; s++) pushBoard(s); }
				else if (e.pool === 'enemies') { for (const o of enemies) { pushBoard(o); pool.push({ hero: o }); } }
				else if (e.pool === 'characters') {
					for (let s = 0; s < state.players.length; s++) {
						if (state.players[s].eliminated) continue;
						pushBoard(s);
						pool.push({ hero: s });
					}
				}
				if (!pool.length) break;
				const pick = pool[Math.floor(state.rng() * pool.length)];
				const rdv = e.heraldScaled ? hm() : e.value;
				if (pick.hero != null) damageHero(state, pick.hero, rdv, pi);
				else damageCreature(state, pick.c, rdv, null);
			}
			if (lsBefore != null) healHero(state, pi, Math.max(0, totalHurt() - lsBefore));
		} else if (e.type === 'summon') {
			// perEnemy: one token per enemy creature ("Unleash the Hounds");
			// options: pick a random companion (Animal Companion);
			// forEnemy: tokens go to a random opponent (Leeroy's Whelps);
			// eachPlayer: every player summons the token(s) (Sokenzan's Arrival)
			let n = e.count === 'X' ? (source?.xValue || 0) : e.count === 'source-attack' ? (source?.attack || 0) : (e.count || 1); // Rat Pack
			if (e.perEnemy) {
				n = 0;
				for (const o of enemies) n += state.players[o].board.filter(c => !isDead(c)).length;
			}
			if (!e.eachPlayer && !e.forEnemy && state.players[pi].board.some(c => c.id === 'khadgar' && !isDead(c))) n *= 2; // Khadgar: summon twice as many
			const summonOne = (ownerIdx) => {
				const opt = e.options ? e.options[Math.floor(state.rng() * e.options.length)] : e;
				// summonId: instantiate a real card def so it keeps its own ongoing —
				// e.g. Gibberling's Spellburst summons another Gibberling that snowballs
				if (opt.summonId && state.cardsById[opt.summonId]) { summon(state, ownerIdx, state.cardsById[opt.summonId]); return; }
				// randomKeywords: each token rolls its own bonus (Bucket of Soldiers)
				const kws = [...(opt.keywords || [])];
				if (e.randomKeywords?.length) kws.push(e.randomKeywords[Math.floor(state.rng() * e.randomKeywords.length)]);
				summon(state, ownerIdx, {
					id: 'token_' + opt.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: opt.name, type: 'creature', cost: 0, rarity: 'common', token: true,
					description: opt.description || `A ${opt.attack}/${opt.health} token.`,
					attack: opt.attack, health: opt.health,
					keywords: kws,
					tribe: opt.tribe || null,
					aura: opt.aura || null,
					static: opt.static || e.static || null,
					deathrattle: opt.deathrattle || null, // Underbelly Network's Rat
				});
			};
			const owners = e.eachPlayer
				? state.players.map((_, idx) => idx)
				: [e.forEnemy && enemies.length ? enemies[Math.floor(state.rng() * enemies.length)] : pi];
			for (const ownerIdx of owners) for (let i = 0; i < n; i++) summonOne(ownerIdx);
		} else if (e.type === 'summon-jade') {
			// Jade Golem: per-player counter, each golem +1/+1 over the last (cap 30/30).
			// The counter advances even if the board is full and the summon fails.
			const p = state.players[pi];
			const n = Math.min(30, (p.jadeCount || 0) + 1);
			p.jadeCount = n;
			const c = summon(state, pi, {
				id: 'token_jade_golem', name: 'Jade Golem', type: 'creature',
				cost: Math.min(10, n), rarity: 'common', token: true,
				description: `A ${n}/${n} Jade Golem.`, attack: n, health: n,
			});
			if (c && e.grant && !c.keywords.includes(e.grant)) c.keywords.push(e.grant);
		} else if (e.type === 'herald') {
			// Herald: summon your class's Soldier; its stats + effect value scale
			// x1 for your 1st-2nd Herald, x2 for the 3rd-4th, x4 for the 5th on.
			const p = state.players[pi];
			const prev = p.heraldCount || 0;
			const m = prev < 2 ? 1 : prev < 4 ? 2 : 4;
			p.heraldCount = prev + 1;
			const SOL = {
				shaman: { id: 'token_soldier_of_alakir', atk: 1, hp: 2 },
				demon_hunter: { id: 'token_soldier_of_azshara', atk: 2, hp: 1 },
				warlock: { id: 'token_soldier_of_chogall', atk: 1, hp: 1 },
				death_knight: { id: 'token_soldier_of_onyxia', atk: 1, hp: 1 },
				warrior: { id: 'token_soldier_of_ragnaros', atk: 2, hp: 1 },
				rogue: { id: 'token_soldier_of_sinestra', atk: 1, hp: 1 },
			};
			const cls = SOL[p.heroClass] ? p.heroClass
				: (source && (source.cardClass || '').split('__').find(c => SOL[c])) || 'warrior';
			const spec = SOL[cls], def = state.cardsById[spec.id];
			const soldier = def && summon(state, pi, def);
			if (soldier) {
				soldier.attack = spec.atk * m; soldier.maxHealth = spec.hp * m;
				if (e.grant && !soldier.keywords.includes(e.grant)) soldier.keywords.push(e.grant);
				if (cls === 'shaman') { soldier.aura = { attack: m, adjacent: true }; recomputeAuras(state); }
				else if (cls === 'warrior') { soldier.deathrattle = [{ type: 'random-damage', value: m, count: 1, pool: 'enemies' }]; if (!soldier.keywords.includes('deathrattle')) soldier.keywords.push('deathrattle'); }
				else if (cls === 'warlock') soldier.ongoing = { on: 'turn-end', effects: [{ type: 'destroy-right-gain', amount: m }] };
				else if (cls === 'demon_hunter') execEffects(state, pi, [{ type: 'hero-temp-attack', value: m }], null, soldier);
				else if (cls === 'death_knight') execEffects(state, pi, [{ type: 'conjure-cost', cost: m }], null, soldier);
				else if (cls === 'rogue') execEffects(state, pi, [{ type: 'conjure-named', match: '', cardType: 'spell', costMod: -m, count: 1 }], null, soldier);
				emit(state, { type: 'buff', uid: soldier.uid, attack: soldier.attack, hp: hp(soldier) });
			}
		} else if (e.type === 'conjure-by-attack') {
			// Al'Akir: get e.count creatures whose Cost equals this creature's Attack
			const pcost = source ? source.attack : 0;
			const pp = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature'
				&& (d.cost || 0) === pcost && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			for (let n = 0; n < (e.count || 1) && pool.length; n++) {
				const def = pool[Math.floor(state.rng() * pool.length)];
				const card = instantiate(def, pi); card.zone = 'hand';
				if (e.costTo != null) card.cost = e.costTo;
				pp.hand.push(card); emit(state, { type: 'conjure', player: pi, card, color: null });
			}
		} else if (e.type === 'destroy-right-gain') {
			// Cho'gall's Arms / Soldier of Cho'gall: destroy the creature to its right
			// and grow. With Cho'gall in play the kill lands in a random enemy DECK
			// instead, but the growth still happens.
			if (source) {
				const drg = e.heraldScaled ? hm() : (e.amount || 1);
				const deckMode = state.players[pi].board.some(c => c.armsHitEnemyDeck && !isDead(c));
				let killed = false;
				if (deckMode) {
					const foes = enemies.filter(o => state.players[o].deck.some(id =>
						state.cardsById[id]?.type === 'creature'));
					if (foes.length) {
						const o = foes[Math.floor(state.rng() * foes.length)];
						const dk = state.players[o].deck;
						const spots = dk.map((id, k) => state.cardsById[id]?.type === 'creature' ? k : -1).filter(k => k >= 0);
						dk.splice(spots[Math.floor(state.rng() * spots.length)], 1);
						killed = true;
					}
				} else {
					const b = state.players[pi].board, r = b[b.indexOf(source) + 1];
					if (r && !isDead(r)) { r.damage = r.maxHealth; r.shield = false; emit(state, { type: 'destroy', uid: r.uid }); killed = true; }
				}
				if (killed) {
					source.attack += drg; source.maxHealth += drg;
					emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
				}
			}
		} else if (e.type === 'buff-colossal') {
			// an appendage that also grows its parent Colossal (Wickerfang's Legs)
			if (source?.colossalOf) {
				const parent = state.players[pi].board.find(c => !isDead(c) && c.name === source.colossalOf);
				if (parent) {
					parent.attack += e.attack || 0;
					parent.maxHealth += e.health || 0;
					emit(state, { type: 'buff', uid: parent.uid, attack: parent.attack, hp: hp(parent) });
				}
			}
		} else if (e.type === 'remove-colossal-keyword') {
			// Chromatus' Heads: each head's death strips a keyword from the parent
			if (source?.colossalOf) {
				const parent = state.players[pi].board.find(c => c.name === source.colossalOf);
				if (parent) {
					parent.keywords = parent.keywords.filter(k => k !== e.keyword);
					if (e.keyword === KW.DIVINE_SHIELD) parent.shield = false;
					recomputeAuras(state);
				}
			}
		} else if (e.type === 'grant-colossal-parts') {
			// Hydralodon: give your appendages of this Colossal a keyword
			for (const c of state.players[pi].board) {
				if (c.colossalOf === source?.name && !c.keywords.includes(e.keyword)) c.keywords.push(e.keyword);
			}
		} else if (e.type === 'destroy-random-per-part') {
			// Ozumat: destroy a random enemy creature for each living appendage
			const parts = source ? state.players[pi].board.filter(c =>
				!isDead(c) && c.colossalOf === source.name).length : 0;
			for (let n = 0; n < parts; n++) {
				const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c)));
				if (!pool.length) break;
				const t = pool[Math.floor(state.rng() * pool.length)];
				t.damage = t.maxHealth; t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
			}
		} else if (e.type === 'attack-random-enemy') {
			// The Black Blood: swing at a random enemy creature
			if (source && !isDead(source)) {
				const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c)));
				if (pool.length) {
					const t = pool[Math.floor(state.rng() * pool.length)];
					resolveCombat(state, pi, source.uid, { type: 'creature', uid: t.uid, player: t.controller });
				}
			}
		} else if (e.type === 'trigger-deathrattles') {
			// Ragnaros: fire your creatures' Deathrattles without them dying
			for (const c of [...state.players[pi].board]) {
				if (!isDead(c) && c.deathrattle) execEffects(state, pi, c.deathrattle, null, c);
			}
		} else if (e.type === 'stalk-strike') {
			// Xhilag's Stalk: deal its escalating power to a random enemy creature
			const dmg = (source && source.partPower) || 2;
			const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c)));
			if (pool.length) damageCreature(state, pool[Math.floor(state.rng() * pool.length)], dmg, source || null);
		} else if (e.type === 'boost-parts-power') {
			// Xhilag: raise the damage of all its Stalks
			if (source) for (const c of state.players[pi].board) {
				if (!isDead(c) && c.colossalOf === source.name) c.partPower = (c.partPower || 2) + (e.amount || 1);
			}
		} else if (e.type === 'trigger-one-deathrattle') {
			// fire a chosen friendly creature's Deathrattle without it dying
			const c = chosenCreature();
			if (c && !isDead(c) && c.deathrattle) execEffects(state, pi, c.deathrattle, null, c);
		} else if (e.type === 'buff-cthun') {
			// buff your C'Thun wherever it is (hand/deck/board persist via the tracker)
			const p = state.players[pi];
			p.cthunAtk += e.value || 0; p.cthunHp += e.value || 0;
			if (e.keyword === 'taunt') p.cthunTaunt = true;
			syncCthun(state, pi);
		} else if (e.type === 'cthun-blast') {
			// C'Thun's Battlecry: damage equal to its Attack, split among all enemies
			let hits = source ? source.attack : (CTHUN_BASE + state.players[pi].cthunAtk);
			for (; hits > 0; hits--) {
				const pool = [];
				for (const o of enemies) { for (const c of state.players[o].board) if (!isDead(c)) pool.push({ c }); pool.push({ hero: o }); }
				if (!pool.length) break;
				const pick = pool[Math.floor(state.rng() * pool.length)];
				if (pick.hero != null) damageHero(state, pick.hero, 1, pi); else damageCreature(state, pick.c, 1, source || null);
			}
		} else if (e.type === 'shuffle-bomb') {
			// shuffle Bomb(s) into a random enemy's deck; they explode on draw
			for (let n = 0; n < (e.count || 1); n++) {
				const foes = enemies.filter(o => !state.players[o].eliminated);
				if (!foes.length) break;
				const od = state.players[foes[Math.floor(state.rng() * foes.length)]].deck;
				od.splice(Math.floor(state.rng() * (od.length + 1)), 0, e.id || 'bomb'); // Iron Juggernaut: id:'mine'
			}
			emit(state, { type: 'bombShuffled', player: pi, count: e.count || 1 });
		} else if (e.type === 'summon-per-enemy-bomb') {
			// Blastmaster Boom: summon `per` Boom Bots for each Bomb in enemy decks
			let bombs = 0;
			for (const o of enemies) bombs += state.players[o].deck.filter(id => id === 'bomb').length;
			const def = state.cardsById['boom_bot'];
			if (def) for (let n = 0; n < bombs * (e.per || 1); n++) summon(state, pi, def);
		} else if (e.type === 'double-attack-self') {
			if (source) { source.attack *= 2; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
		} else if (e.type === 'refresh-mana') {
			const mp = state.players[pi].mana; mp.cur = mp.max;
			emit(state, { type: 'mana', player: pi, cur: mp.cur, max: mp.max });
		} else if (e.type === 'invoke-galakrond') {
			// Invoke Galakrond: power up your Galakrond (base -> upgraded at 2 -> maxed at 4)
			state.players[pi].galakrondInvokes = (state.players[pi].galakrondInvokes || 0) + 1;
			emit(state, { type: 'invokeGalakrond', player: pi, count: state.players[pi].galakrondInvokes });
		} else if (e.type === 'galakrond') {
			// Galakrond's Battlecry scales with your Invokes (0-1 base, 2-3 upgraded, 4+ maxed),
			// installs the class Galakrond hero power, and equips a 5/2 Claw when maxed.
			const p = state.players[pi];
			const inv = p.galakrondInvokes || 0, tier = inv < 2 ? 0 : inv < 4 ? 1 : 2;
			const scale = [1, 2, 4][tier];
			const before = p.hand.length;
			if (e.gclass === 'warlock') { for (let i = 0; i < scale; i++) execEffects(state, pi, [{ type: 'summon-random', tribe: 'Demon' }], null, source); }
			else if (e.gclass === 'rogue') { drawCards(state, pi, scale); for (const c of p.hand.slice(before)) c.cost = 0; }
			else if (e.gclass === 'shaman') { const s = [2, 4, 8][tier]; execEffects(state, pi, [{ type: 'summon', count: 2, attack: s, health: s, name: 'Storm', keywords: ['rush'] }], null, source); }
			else if (e.gclass === 'warrior') { execEffects(state, pi, [{ type: 'tutor', cardType: 'creature', count: scale }], null, source); for (const c of p.hand.slice(before)) { c.attack += 4; c.maxHealth = (c.maxHealth || 0) + 4; } }
			else if (e.gclass === 'priest') execEffects(state, pi, [{ type: 'destroy-random', count: scale }], null, source);
			if (e.power && p.heroPowers.length < MAX_HERO_POWERS && !p.heroPowers.some(h => h.id === 'galakrond_' + e.gclass + '_power')) {
				const hp = instantiate({ id: 'galakrond_' + e.gclass + '_power', name: e.power.name, type: 'heropower', cost: 0, rarity: 'basic', power: { cost: e.power.cost, effects: e.power.effects }, description: e.power.text, cardClass: e.gclass }, pi);
				hp.zone = 'heropower'; p.heroPowers.push(hp);
			}
			if (tier === 2) execEffects(state, pi, [{ type: 'equip', name: 'Galakrond Claw', attack: 5, durability: 2 }], null, source);
		} else if (e.type === 'summon-if-control') {
			// Hydralodon Head deathrattle: only summons more if the parent survives
			const held = state.players[pi].board.some(c => !isDead(c) && c.name === e.ifControl);
			if (held) {
				const def = state.cardsById[e.id];
				if (def) for (let i = 0; i < (e.count || 1); i++) summon(state, pi, def);
			}
		} else if (e.type === 'force-attack') {
			// Behemoth's Lure: force a random enemy to attack the Behemoth (parent)
			const magnet = source && source.colossalOf ? (state.players[pi].board.find(c => !isDead(c) && c.name === source.colossalOf) || source) : source;
			if (magnet && !isDead(magnet)) {
				const pool = enemies.flatMap(o => state.players[o].board.filter(c =>
					!isDead(c) && !c.frozen && c.attack > 0));
				if (pool.length) {
					const a = pool[Math.floor(state.rng() * pool.length)];
					resolveCombat(state, a.controller, a.uid, { type: 'creature', uid: magnet.uid, player: magnet.controller });
				}
			}
		} else if (e.type === 'summon-self-copy') {
			// Saronite Chain Gang / Doppelgangster: fresh copies of the played minion
			const def = source && state.cardsById[source.id];
			if (def) for (let i = 0; i < (e.count || 1); i++) summon(state, pi, def);
		} else if (e.type === 'summon-from-hand') {
			// Voidcaller: a random qualifying creature jumps from hand to board.
			// count>1 pulls that many (Beastmaster Leoroxx: 3 Beasts from hand)
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 1); n++) {
				const pool = p.hand.filter(c => c.type === 'creature'
					&& (!e.tribe || (c.tribe || '').includes(e.tribe))
					&& (e.maxCost == null || (c.cost || 0) <= e.maxCost) // Razorboar
					&& (!e.requireKeyword || (c.keywords || []).includes(e.requireKeyword)));
				if (!pool.length) break;
				const c = pool[Math.floor(state.rng() * pool.length)];
				p.hand = p.hand.filter(x => x !== c);
				c.zone = 'board';
				c.sick = true;
				p.board.push(c);
				emit(state, { type: 'summon', player: pi, card: c });
				fireOngoing(state, pi, 'summoned', { minion: c });
				recomputeAuras(state);
			}
		} else if (e.type === 'summon-deck-copy') {
			// Barnes: summon a copy of a random creature in YOUR deck
			// (original stays); attack/health override forces token stats
			const p = state.players[pi];
			const ids = p.deck.filter(id => state.cardsById[id]?.type === 'creature');
			if (ids.length) {
				const def = state.cardsById[ids[Math.floor(state.rng() * ids.length)]];
				const c = summon(state, pi, def);
				if (c && e.attack != null) {
					c.attack = e.attack + c.auraAttack;
					c.maxHealth = e.health + c.auraHealth;
					c.damage = 0;
				}
			}
		} else if (e.type === 'random-effects') {
			// d4-roll hero powers: run one random option
			const opt = e.options[Math.floor(state.rng() * e.options.length)];
			execEffects(state, pi, opt, target, source);
		} else if (e.type === 'luck') {
			// coin flip: heads runs the effects, tails fizzles
			if (state.rng() < 0.5) execEffects(state, pi, e.effects, target, source);
			else emit(state, { type: 'luckFail', player: pi });
		} else if (e.type === 'add-card') {
			const def = state.cardsById[e.id];
			const targets = e.eachPlayer ? state.players.map((_, idx) => idx).filter(idx => !state.players[idx].eliminated)
					: e.toEnemy ? opponentsOf(state, pi) : [pi]; // Mailbox Dancer gives the opponent a Coin
			for (const tp of targets) {
				const tpp = state.players[tp];
				for (let n = 0; n < (e.count || 1); n++) {
					if (def && tpp.hand.length < MAX_HAND) {
						const card = instantiate(def, tp);
						card.zone = 'hand';
						tpp.hand.push(card);
						emit(state, { type: 'conjure', player: tp, card, color: null });
					} else if (!def) {
						drawCards(state, tp, 1); // named card not in the pool yet
					}
				}
			}
		} else if (e.type === 'grant-ongoing') {
			const t = chosenCreature();
			if (t) t.ongoing = JSON.parse(JSON.stringify(e.ongoing));
		} else if (e.type === 'grant-static') {
			const t = chosenCreature();
			if (t) t.static = { ...e.static };
		} else if (e.type === 'armor') {
			if (e.target === 'all-heroes') { for (let s2 = 0; s2 < state.players.length; s2++) if (!state.players[s2].eliminated) gainArmor(state, s2, e.value); } // Armor Vendor
			else gainArmor(state, pi, e.value);
		} else if (e.type === 'install-secret') {
			installSecret(state, pi, e.id);
		} else if (e.type === 'discount-hand') {
			// Hunter's Call: cards in hand permanently cost (N) less
			for (const c of state.players[pi].hand) c.cost = Math.max(0, c.cost - (e.value || 1));
		} else if (e.type === 'mill') {
			// Devour: burn the top N cards of an opponent's deck (target 'all' = everyone,
			// 'self' = your own deck — Tickatus)
			if (e.target === 'all') { for (let s2 = 0; s2 < state.players.length; s2++) for (let i = 0; i < (e.value || 1); i++) state.players[s2].deck.pop(); }
			else if (e.target === 'self') { for (let i = 0; i < (e.value || 1); i++) state.players[pi].deck.pop(); }
			else { const victim = enemyHero(); if (victim != null) { for (let i = 0; i < (e.value || 1); i++) state.players[victim].deck.pop(); } }
		} else if (e.type === 'discard-random') {
			const p = state.players[pi];
			for (let i = 0; i < (e.count || 1) && p.hand.length; i++) {
				const j = Math.floor(state.rng() * p.hand.length);
				const [c] = p.hand.splice(j, 1);
				toGraveyard(state, pi, c);
				emit(state, { type: 'discard', player: pi, card: c });
				if (!c.token) state.players[pi].discardLogIds.push(c.id); if (c.summonOnDiscard && state.cardsById[c.id]) summon(state, pi, state.cardsById[c.id]); if (c.returnBuffedOnDiscard && state.players[pi].hand.length < MAX_HAND) { c.attack += 2; c.maxHealth += 2; c.zone='hand'; state.players[pi].hand.push(c); const gi = state.players[pi].graveyard.indexOf(c); if (gi>=0) state.players[pi].graveyard.splice(gi,1); emit(state,{type:'conjure',player:pi,card:c,color:null}); } if (c.copiesOnDiscard && state.cardsById[c.id]) { for (let n = 0; n < c.copiesOnDiscard && state.players[pi].hand.length < MAX_HAND; n++) { const cp = instantiate(state.cardsById[c.id], pi); cp.zone = 'hand'; state.players[pi].hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } } fireOngoing(state, pi, 'card-discarded', { card: c }); /* High Priestess Jekliik */ // Tiny Knight of Evil
			}
		} else if (e.type === 'discard-lowest') {
			// Lakkari Felhound: discard your N lowest-Cost cards
			const p = state.players[pi];
			for (let k = 0; k < (e.count || 1) && p.hand.length; k++) {
				let li = 0;
				for (let j = 1; j < p.hand.length; j++) if (e.highest ? (p.hand[j].cost || 0) > (p.hand[li].cost || 0) : (p.hand[j].cost || 0) < (p.hand[li].cost || 0)) li = j; // Expired Merchant: highest
				const [c] = p.hand.splice(li, 1);
				if (e.remember && source) source.discardedId = c.id; // Expired Merchant deathrattle
				toGraveyard(state, pi, c);
				emit(state, { type: 'discard', player: pi, card: c });
				if (!c.token) state.players[pi].discardLogIds.push(c.id); if (c.summonOnDiscard && state.cardsById[c.id]) summon(state, pi, state.cardsById[c.id]); if (c.returnBuffedOnDiscard && state.players[pi].hand.length < MAX_HAND) { c.attack += 2; c.maxHealth += 2; c.zone='hand'; state.players[pi].hand.push(c); const gi = state.players[pi].graveyard.indexOf(c); if (gi>=0) state.players[pi].graveyard.splice(gi,1); emit(state,{type:'conjure',player:pi,card:c,color:null}); } if (c.copiesOnDiscard && state.cardsById[c.id]) { for (let n = 0; n < c.copiesOnDiscard && state.players[pi].hand.length < MAX_HAND; n++) { const cp = instantiate(state.cardsById[c.id], pi); cp.zone = 'hand'; state.players[pi].hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } } fireOngoing(state, pi, 'card-discarded', { card: c }); /* High Priestess Jekliik */
			}
		} else if (e.type === 'draw-set-cost') {
			// Bright-Eyed Scout: draw a card and change its Cost
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			drawCards(state, pi, e.value || 1);
			for (const c of p.hand) if (!before.has(c.uid)) c.cost = e.cost;
		} else if (e.type === 'draw-creatures-to-board') {
			// Varian Wrynn: draw N; any creatures drawn go straight into play (no battlecry)
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			drawCards(state, pi, e.value || 1);
			for (const c of p.hand.filter(x => !before.has(x.uid))) {
				if (c.type === 'creature' && !p.eliminated) {
					p.hand = p.hand.filter(x => x !== c);
					c.zone = 'board'; p.board.push(c);
					emit(state, { type: 'summon', player: pi, card: c });
					fireOngoing(state, pi, 'summoned', { minion: c });
				}
			}
			recomputeAuras(state);
		} else if (e.type === 'upgrade-hero-power') {
			// Justicar Trueheart: your Hero Power resolves twice from now on
			state.players[pi].heroPowerUpgraded = true;
		} else if (e.type === 'draw-all') {
			for (let s2 = 0; s2 < state.players.length; s2++) {
				if (!state.players[s2].eliminated) drawCards(state, s2, e.value);
			}
		} else if (e.type === 'temp-buff') {
			// "+N Attack this turn": a chosen creature, all your creatures, or
			// (when a hero was chosen) that hero
			const bump = t => {
				t.attack += e.attack || 0;
				t.tempAttack += e.attack || 0;
				if (e.health) { t.maxHealth += e.health; t.tempHealth = (t.tempHealth || 0) + e.health; } // Giant Growth: +N/+N this turn
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			};
			if (e.target === 'friendly-creatures') {
				for (const c of state.players[pi].board) bump(c);
			} else {
				const t = chosenCreature();
				if (t) bump(t);
				else if (target?.type === 'hero') {
					state.players[target.player].heroTempAttack += e.attack || 0;
					emit(state, { type: 'heroBuffed', player: target.player, amount: e.attack || 0 });
				}
			}
		} else if (e.type === 'temp-buff-self') {
			if (source && source.zone === 'board' && !isDead(source)) {
				source.attack += e.attack || 0;
				source.tempAttack += e.attack || 0;
				source.maxHealth += e.health || 0;
				source.tempHealth = (source.tempHealth || 0) + (e.health || 0);
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
		} else if (e.type === 'bolster') {
			// +N/+N to your creature with the least health (MTG-style default)
			const pool = state.players[pi].board.filter(c => !isDead(c));
			if (pool.length) {
				const t = pool.reduce((a, b) => hp(b) < hp(a) ? b : a);
				t.attack += e.value;
				t.maxHealth += e.value;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
		} else if (e.type === 'adapt') {
			// paper rule: roll a d10 three times (reroll dupes); the controller
			// picks ONE of the three, applied to the adapting creature(s)
			let targets;
			if (e.name) targets = state.players[pi].board.filter(c => !isDead(c) && c.name === e.name); // Lightfused Stegodon: Silver Hand Recruits
			else if (e.target === 'friendly-creatures') targets = state.players[pi].board.filter(c => !isDead(c));
			else if (e.tribe) targets = state.players[pi].board.filter(c => !isDead(c) && (c.tribe || '').includes(e.tribe));
			else { const t = chosenCreature() || (source && source.zone === 'board' && !isDead(source) ? source : null); targets = t ? [t] : []; }
			targets = targets.filter(c => c.type !== 'location');
			for (let n = 0; n < (e.times || 1); n++) queueAdapt(state, pi, targets); // Ravenous Pterrordax: Adapt twice
		} else if (e.type === 'buff-self') {
			// battlecry/choice self-pump; `per` scales by a count
			if (source && source.zone === 'board' && !isDead(source)) {
				let n = 1;
				if (e.per === 'other-friendly') n = state.players[pi].board.filter(c => c !== source && !isDead(c)).length;
				else if (e.per === 'si7-others') n = Math.max(0, (state.players[pi].si7PlayedGame || 0) - 1); // SI:7 Informant
				else if (e.per === 'hand-cards') n = state.players[pi].hand.length;
				else if (e.per === 'hand-spells') n = state.players[pi].hand.filter(c => isSpellType(c)).length; // Brainstormer
				else if (e.per === 'pogos-played') n = state.players[pi].pogoCount || 0; // Pogo-Hopper
				else if (e.per === 'hero-damage-taken') n = state.players[pi].heroDamageTakenThisTurn || 0; // Nethersoul Buster
				else if (e.per === 'enemy-hand') n = opponentsOf(state, pi).reduce((s, o) => s + state.players[o].hand.length, 0); // Fire Hawk
				else if (e.per === 'cards-played') n = state.players[pi].cardsPlayedThisTurn;
				else if (e.per === 'enemy-deathrattle') n = state.players.reduce((s, pl, idx) =>
					idx === pi ? s : s + pl.board.filter(c => !isDead(c) && c.keywords.includes('deathrattle')).length, 0);
				else if (e.per === 'friendly-tribe') n = state.players[pi].board.filter(c => c !== source && !isDead(c) && (c.tribe || '').includes(e.tribe)).length; // Draenei Totemcarver
				else if (e.per === 'enemy-creatures') n = state.players.reduce((s, pl, idx) => idx === pi ? s : s + pl.board.filter(c => !isDead(c) && c.type !== 'location').length, 0); // Cyclopian Horror
				else if (e.per === 'elementals-game') n = state.players[pi].elementalsPlayedGame || 0; // Ozruk
					else if (e.per === 'died-this-turn') n = state.diedThisTurn || 0; // Wicked Skeleton
					else if (e.per === 'damaged-creatures') n = state.players.reduce((s, pl) => s + pl.board.filter(c => !isDead(c) && c.type !== 'location' && c.damage > 0).length, 0); // Death Revenant
				if (n > 0) buffCreature(source, (e.attack || 0) * n, (e.health || 0) * n);
			}
		} else if (e.type === 'buff-self-random') {
			// Fireguard Destroyer: gain a random amount of Attack in [min,max]
			if (source && source.zone === 'board' && !isDead(source)) {
				const [lo, hi] = e.range || [1, 1];
				buffCreature(source, lo + Math.floor(state.rng() * (hi - lo + 1)), e.health || 0);
			}
		} else if (e.type === 'enable-attack-self') {
			// Argent Watchman: may attack this turn despite Can't Attack
			if (source) source.attackAnywayTurn = state.turnNumber;
		} else if (e.type === 'buff-spell-damage-self') {
			// Dalaran Aspirant: raise this creature's Spell Damage static
			if (source && !isDead(source)) {
				if (!source.static || source.static.type !== 'spell-damage') source.static = { type: 'spell-damage', value: 0 };
				source.static.value = (source.static.value || 0) + (e.value || 1);
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
		} else if (e.type === 'grant-spell-damage') {
			// Tuskarr Fisherman: give a chosen friendly creature Spell Damage +N
			// (target 'self' = the source, for Mozaki's growing Spell Damage)
			const t = e.target === 'self' ? (source && source.zone === 'board' && !isDead(source) ? source : null) : chosenCreature();
			if (t) {
				if (!t.static || t.static.type !== 'spell-damage') t.static = { type: 'spell-damage', value: 0 };
				t.static.value = (t.static.value || 0) + (e.value || 1);
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
		} else if (e.type === 'gain-weapon-stats') {
			// Phantom Freebooter: gain +Attack/+Health equal to your weapon's stats
			if (source && source.zone === 'board' && !isDead(source)) {
				const w = state.players[pi].weapon;
				if (w) buffCreature(source, w.attack || 0, w.durability || 0);
			}
		} else if (e.type === 'destroy-random-each') {
			// Void Crusher: destroy a random creature on each player's board
			for (const pl of state.players) {
				const pool = pl.board.filter(c => !isDead(c) && c.type !== 'location');
				if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)]; t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); }
			}
		} else if (e.type === 'copy-enemy-hero-power') {
			// Sideshow Spelleater: copy a random opponent's Hero Power
			const p = state.players[pi];
			for (const o of enemies) {
				const src = state.players[o].heroPowers[0];
				if (src && p.heroPowers.length < MAX_HERO_POWERS && !p.heroPowers.some(h => h.id === src.id)) {
					const copy = instantiate(state.cardsById[src.id] || { id: src.id, name: src.name, type: 'heropower', power: src.power }, pi);
					copy.zone = 'heropower'; copy.usedThisTurn = false;
					p.heroPowers.push(copy);
					emit(state, { type: 'heroPowerGained', player: pi, card: copy });
				}
				break;
			}
		} else if (e.type === 'damage-self') {
			if (source && source.zone === 'board' && !isDead(source)) damageCreature(state, source, e.value, null);
		} else if (e.type === 'destroy-self') {
			// Anima Golem: destroy the source (optionally only if it's your only creature)
			if (source && source.zone === 'board' && !isDead(source)) {
				const alone = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location').length === 0;
				if (!e.ifAlone || alone) {
					source.damage = source.maxHealth;
					source.shield = false;
					emit(state, { type: 'destroy', uid: source.uid });
				}
			}
		} else if (e.type === 'pay-or-sacrifice') {
			// "sacrifice this unless you pay N": pay from leftover mana if able, else destroy the source
			const pp = state.players[pi];
			if (source && source.zone === 'board' && !isDead(source)) {
				if (availableMana(pp) >= (e.value || 0)) {
					spendMana(pp, e.value || 0);
					emit(state, { type: 'paidUpkeep', player: pi, amount: e.value || 0, uid: source.uid });
				} else {
					source.damage = source.maxHealth;
					source.shield = false;
					emit(state, { type: 'destroy', uid: source.uid });
				}
			}
		} else if (e.type === 'heal-full') {
			const t = e.target === 'self' ? source : chosenCreature(); // Stoneskin Gargoyle: restore self
			if (t && t.damage > 0) healCreature(t, t.damage);
		} else if (e.type === 'summon-self-copy') {
			// Echoing Ooze: a copy carrying this creature's CURRENT stats/keywords
			if (source) summon(state, pi, { id: source.id, name: source.name, type: 'creature',
				cost: source.cost || 0, rarity: source.rarity || 'common', token: true, tribe: source.tribe || '',
				attack: source.attack, health: source.maxHealth, keywords: [...(source.keywords || [])],
				description: source.description || '' });
		} else if (e.type === 'deploy-secret-from-deck') {
			// Mad Scientist: one Secret. Mysterious Challenger (all): one of each.
			const p = state.players[pi];
			if (e.all) {
				const seen = new Set();
				for (const id of [...p.deck]) {
					const def = state.cardsById[id];
					if (def?.secret && !seen.has(id)) { seen.add(id); const i = p.deck.indexOf(id); if (i >= 0) { p.deck.splice(i, 1); installSecret(state, pi, id); } }
				}
			} else {
				const si = p.deck.findIndex(id => state.cardsById[id]?.secret);
				if (si >= 0) { const [id] = p.deck.splice(si, 1); installSecret(state, pi, id); }
			}
		} else if (e.type === 'enemy-summon-from-deck') {
			// Deathlord: each opponent puts a creature from their deck into play
			for (const o of enemies) {
				const op = state.players[o];
				const ci = op.deck.findIndex(id => state.cardsById[id]?.type === 'creature' && !state.cardsById[id].token);
				if (ci >= 0) { const [id] = op.deck.splice(ci, 1); summon(state, o, state.cardsById[id]); }
			}
		} else if (e.type === 'summon-from-deck-each') {
			// Desert Camel: every player puts a creature of Cost N from their deck into play
			for (let s3 = 0; s3 < state.players.length; s3++) {
				const pl = state.players[s3];
				if (pl.eliminated) continue;
				const ci = pl.deck.findIndex(id => { const def = state.cardsById[id]; return def?.type === 'creature' && !def.token && (e.cost == null || (def.cost || 0) === e.cost); });
				if (ci >= 0) { const [id] = pl.deck.splice(ci, 1); summon(state, s3, state.cardsById[id]); }
			}
		} else if (e.type === 'heal-hero-full') {
			// Reno Jackson: restore your hero to full
			const p = state.players[pi];
			const full = p.maxLife ?? STARTING_LIFE;
			if (p.life < full) healHero(state, pi, full - p.life);
		} else if (e.type === 'tax-enemy-spells') {
			// Loatheb: each opponent's spells cost more on their next turn
			for (const o of enemies) state.players[o].spellTaxNext = (state.players[o].spellTaxNext || 0) + (e.value || 0);
		} else if (e.type === 'tax-enemy-hero-power') {
			// Saboteur: each opponent's Hero Power costs more next turn
			for (const o of enemies) state.players[o].heroPowerTaxNext = (state.players[o].heroPowerTaxNext || 0) + (e.value || 0);
		} else if (e.type === 'hero-power-discount') {
			// Fencing Coach: your next Hero Power this turn costs less
			state.players[pi].heroPowerDiscountNext = (state.players[pi].heroPowerDiscountNext || 0) + (e.value || 0);
		} else if (e.type === 'resurrect-died-this-turn') {
			// Kel'Thuzad: summon all your creatures that died this turn
			const p = state.players[pi];
			const ids = p.diedThisTurnIds.slice();
			p.diedThisTurnIds = [];
			for (const id of ids) { const def = state.cardsById[id]; if (def) summon(state, pi, def); }
		} else if (e.type === 'set-health') {
			// "Change a creature's Health to N" — keeps aura bonuses on top
			const list = e.target === 'all-creatures'
				? state.players.flatMap(pl => pl.board.filter(c => !isDead(c)))
				: e.target === 'all-others'
				? state.players.flatMap(pl => pl.board.filter(c => !isDead(c) && c !== source))
				: e.target === 'enemy-creatures'
				? enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location')) // Veranus
				: [chosenCreature()].filter(Boolean);
			for (const t of list) {
				t.maxHealth = e.value + (t.auraHealth || 0);
				t.damage = 0;
				t.tempHealth = 0;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
		} else if (e.type === 'set-attack') {
			const list = e.target === 'all-creatures'
				? state.players.flatMap(pl => pl.board.filter(c => !isDead(c)))
				: e.target === 'all-others'
				? state.players.flatMap(pl => pl.board.filter(c => !isDead(c) && c !== source))
				: e.target === 'enemy-creatures'
				? enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c))) // Eadric the Pure
				: [chosenCreature()].filter(Boolean);
			for (const t of list) {
				t.attack = e.value + (t.auraAttack || 0);
				t.tempAttack = 0;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
		} else if (e.type === 'attack-equals-health') {
			const t = chosenCreature();
			if (t) {
				t.attack = hp(t);
				t.tempAttack = 0;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
		} else if (e.type === 'double-health') {
			const t = e.target === 'self' ? source : chosenCreature(); // Faceless Lurker: this minion
			if (t) { t.maxHealth += hp(t); emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
		} else if (e.type === 'double-attack') {
			const t = chosenCreature();
			if (t) { t.attack += t.attack; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
		} else if (e.type === 'adjacent-buff') {
			// battlecry blessing on the creatures flanking the source
			const board = state.players[pi].board;
			const idx = board.indexOf(source);
			if (idx >= 0) {
				for (const t of [board[idx - 1], board[idx + 1]].filter(Boolean)) {
					if (e.attack || e.health) buffCreature(t, e.attack || 0, e.health || 0);
					if (e.keyword && !t.keywords.includes(e.keyword)) {
						t.keywords.push(e.keyword);
						if (e.keyword === KW.DIVINE_SHIELD) t.shield = true;
						if (e.keyword === KW.STEALTH) t.stealthed = true;
					}
					if (e.static) t.static = { ...e.static }; // Ancient Mage's Spell Damage
				}
			}
		} else if (e.type === 'discard-all') {
			const p = state.players[pi];
			while (p.hand.length) {
				const c = p.hand.pop();
				toGraveyard(state, pi, c);
				emit(state, { type: 'discard', player: pi, card: c });
				if (!c.token) state.players[pi].discardLogIds.push(c.id); if (c.summonOnDiscard && state.cardsById[c.id]) summon(state, pi, state.cardsById[c.id]); if (c.returnBuffedOnDiscard && state.players[pi].hand.length < MAX_HAND) { c.attack += 2; c.maxHealth += 2; c.zone='hand'; state.players[pi].hand.push(c); const gi = state.players[pi].graveyard.indexOf(c); if (gi>=0) state.players[pi].graveyard.splice(gi,1); emit(state,{type:'conjure',player:pi,card:c,color:null}); } if (c.copiesOnDiscard && state.cardsById[c.id]) { for (let n = 0; n < c.copiesOnDiscard && state.players[pi].hand.length < MAX_HAND; n++) { const cp = instantiate(state.cardsById[c.id], pi); cp.zone = 'hand'; state.players[pi].hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } } fireOngoing(state, pi, 'card-discarded', { card: c }); /* High Priestess Jekliik */
			}
		} else if (e.type === 'bounce') {
			if (e.requireControlSecret && !state.players[pi].secrets.length) continue; // Blackjack Stunner
			if (e.target === 'permanent') {
				// single chosen permanent of any type (creature/artifact/enchantment/walker/location)
				if (target && target.uid != null) {
					const t = findPermanent(state, target.uid);
					if (t) bouncePermanent(state, target.player, t, e.costMod || 0);
				}
				continue;
			}
			// return creature(s) to the owner's hand as fresh copies
			const list = e.target === 'all-creatures'
				? state.players.flatMap(pl => pl.board.filter(c => !isDead(c)))
				: e.target === 'enemy-creatures'
					? enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c)))
					: e.target === 'friendly-others'
						? state.players[pi].board.filter(c => !isDead(c) && c !== source && c.type !== 'location') // Grumble, Worldshaker
					: e.target === 'random-friendly'
						? (() => { const pool = state.players[pi].board.filter(c => !isDead(c));
							return pool.length ? [pool[Math.floor(state.rng() * pool.length)]] : []; })()
					: e.target === 'random-enemy'
						? (() => { const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location'));
							return pool.length ? [pool[Math.floor(state.rng() * pool.length)]] : []; })() // Sahket Sapper
						: [chosenCreature()].filter(Boolean);
			for (const t of list) {
				const owner = state.players[t.controller];
				owner.board = owner.board.filter(c => c !== t);
				const def = state.cardsById[t.id];
				if (def && owner.hand.length < MAX_HAND) {
					const card = instantiate(def, t.controller);
					card.zone = 'hand';
					card.cost = e.setCost != null ? e.setCost : Math.max(0, (def.cost || 0) + (e.costMod || 0));
					owner.hand.push(card);
				}
				emit(state, { type: 'bounce', uid: t.uid, player: t.controller, name: t.name });
			}
			if (list.length) recomputeAuras(state);
		} else if (e.type === 'copy-enemy') {
			// copy random card(s) from an opponent's hand or deck (originals stay)
			const victim = enemyHero();
			if (victim != null) {
				const p = state.players[pi], op = state.players[victim];
				for (let i = 0; i < (e.count || 1); i++) {
					let def = null;
					if (e.from === 'hand') {
						const pool = op.hand.filter(c => state.cardsById[c.id]);
						if (pool.length) def = state.cardsById[pool[Math.floor(state.rng() * pool.length)].id];
					} else {
						let ids = op.deck.filter(id => state.cardsById[id]);
						if (e.filter === 'creature') ids = ids.filter(id => state.cardsById[id].type === 'creature');
						if (ids.length) def = state.cardsById[ids[Math.floor(state.rng() * ids.length)]];
					}
					if (!def) break;
					if (e.summon) {
						summon(state, pi, def);
					} else if (p.hand.length < MAX_HAND) {
						const card = instantiate(def, pi);
						card.zone = 'hand';
						p.hand.push(card);
						emit(state, { type: 'conjure', player: pi, card, color: null });
					}
				}
			}
		} else if (e.type === 'mind-control' || e.type === 'mind-control-random') {
			// steal an enemy creature (chosen, or random from a qualifying enemy)
			let t = null;
			if (e.type === 'mind-control') {
				const c = chosenCreature();
				if (c && c.controller !== pi && (e.maxAttack == null || c.attack <= e.maxAttack)) t = c;
			} else {
				const pool = [];
				for (const o of enemies) {
					const live = state.players[o].board.filter(c => !isDead(c));
					if (e.requireBoard && live.length < e.requireBoard) continue;
					pool.push(...live);
				}
				if (pool.length) t = pool[Math.floor(state.rng() * pool.length)];
			}
			if (t && !state.players[pi].eliminated) {
				state.players[t.controller].board = state.players[t.controller].board.filter(c => c !== t);
				t.controller = pi;
				t.sick = true;
				state.players[pi].board.push(t);
				emit(state, { type: 'mindControl', uid: t.uid, player: pi, name: t.name });
				recomputeAuras(state);
			}
		} else if (e.type === 'draw-enemy') {
			const t = enemyHero();
			if (t != null) drawCards(state, t, e.value || 1);
		} else if (e.type === 'tutor') {
			// pull matching cards out of your deck into your hand
			const p = state.players[pi];
			const drawnIds = new Set();
			for (let i = 0; i < (e.count || 1); i++) {
				if (p.hand.length >= MAX_HAND) break;
				const idxs = [];
				for (let j = 0; j < p.deck.length; j++) {
					const def = state.cardsById[p.deck[j]];
					if (!def) continue;
					if (e.tribe && !(def.tribe || '').includes(e.tribe)) continue;
					if (e.cardType === 'spell' ? !isSpellType(def)
						: (e.cardType && def.type !== e.cardType)) continue;
					if (e.school && schoolOf(def) !== e.school) continue; // Twilight Deceptor
					if (e.maxCost != null && (def.cost || 0) > e.maxCost) continue;
					if (e.minCost != null && (def.cost || 0) < e.minCost) continue; if (e.cardType === 'secret' && !def.secret) continue; if (e.distinct && drawnIds.has(p.deck[j])) continue; if (e.health != null && (def.health || 0) !== e.health) continue; if (e.cost != null && (def.cost || 0) !== e.cost) continue; // Tol'vir Warden/Storm Chaser/Subject 9/Salhet's Pride
					if (e.requireKeyword && !(def.keywords || []).includes(e.requireKeyword)) continue;
					idxs.push(j);
				}
				if (!idxs.length) break;
				// Witchwood Piper: draw the LOWEST-Cost match; else a random match
				const j = e.lowest ? idxs.reduce((best, k) => (state.cardsById[p.deck[k]].cost || 0) < (state.cardsById[p.deck[best]].cost || 0) ? k : best, idxs[0]) : idxs[Math.floor(state.rng() * idxs.length)];
				const [id] = p.deck.splice(j, 1);
				drawnIds.add(id);
				const card = instantiate(state.cardsById[id], pi);
				card.zone = 'hand';
				if (e.buff) { card.attack += e.buff.attack || 0; card.maxHealth += e.buff.health || 0; } // Akali, the Rhino
				if (e.setAttack != null) card.attack = e.setAttack; // Jepetto Joybuzz: set to 1/1, cost 1
				if (e.setHealth != null) card.maxHealth = e.setHealth;
				if (e.setCost != null) card.cost = e.setCost;
				if (e.costMod) card.cost = Math.max(0, (card.cost || 0) + e.costMod); // Vashj Prime: reduce drawn spells' Cost
				if (e.gainDeathrattle && source && card.deathrattle && card.deathrattle.length) { source.deathrattle = [...(source.deathrattle || []), ...JSON.parse(JSON.stringify(card.deathrattle))]; if (!source.keywords.includes('deathrattle')) source.keywords.push('deathrattle'); } // Necrium Apothecary
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			}
		} else if (e.type === 'grant-deathrattle') {
			const targets = e.target === 'creature' ? [chosenCreature()].filter(Boolean)
				: e.target === 'self' ? (source && source.zone === 'board' && !isDead(source) ? [source] : []) // Fatespinner
				: e.target === 'friendly-others' ? state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location') // Rustsworn Cultist
				: state.players[pi].board.filter(c => !isDead(c));
			for (const c of targets) {
				c.deathrattle = (c.deathrattle || []).concat(JSON.parse(JSON.stringify(e.effects)));
				if (!c.keywords.includes('deathrattle')) c.keywords.push('deathrattle');
			}
		} else if (e.type === 'conditional') {
			// "If you control a Beast / have 12 or less Health / it's Frozen, ... instead"
			const t = chosenCreature();
			const p = state.players[pi];
			let ok = true;
			if (e.if.controlTribe) ok = p.board.some(c => !isDead(c) && (c.tribe || '').includes(e.if.controlTribe));
			else if (e.if.minOtherCreatures != null) ok = p.board.filter(c => !isDead(c) && c !== source && c.type !== 'location').length >= e.if.minOtherCreatures; // Nesting Roc
			else if (e.if.diedThisGame) ok = p.deathLogIds.includes(e.if.diedThisGame); // Feugen/Stalagg
			else if (e.if.enemyMaxHealth != null) ok = opponentsOf(state, pi).some(o => state.players[o].life <= e.if.enemyMaxHealth); // Drakonid Crusher
			else if (e.if.noDuplicates) ok = new Set(p.deck).size === p.deck.length; // Reno Jackson
			else if (e.if.controlOtherTribe) ok = p.board.some(c => c !== source && !isDead(c) && (c.tribe || '').includes(e.if.controlOtherTribe)); // Gorillabot / Fossilized Devilsaur
			else if (e.if.controlSecret) ok = p.secrets.length > 0; // Avian Watcher
			else if (e.if.enemyFrozen) ok = opponentsOf(state, pi).some(o => state.players[o].board.some(c => c.frozen && !isDead(c))); // Cryomancer
			else if (e.if.enemyHasTaunt) ok = opponentsOf(state, pi).some(o => state.players[o].board.some(c => !isDead(c) && has(c, KW.TAUNT))); // Spiked Hogrider
			else if (e.if.enemyHandEmpty) ok = opponentsOf(state, pi).some(o => state.players[o].hand.length === 0); // Tanaris Hogchopper
			else if (e.if.weaponAttack != null) ok = !!(p.weapon && p.weapon.attack >= e.if.weaponAttack); // Luckydo Buccaneer
			else if (e.if.weaponEquipped) ok = !!p.weapon; // Hobart Grapplehammer
			else if (e.if.enemyHandSize != null) ok = opponentsOf(state, pi).some(o => state.players[o].hand.length >= e.if.enemyHandSize); // Leatherclad Hogleader
			else if (e.if.controlHealth != null) ok = p.board.some(c => !isDead(c) && hp(c) >= e.if.controlHealth); // Fight Promoter
			else if (e.if.selfAttack != null) ok = !!(source && source.attack >= e.if.selfAttack); // Meanstreet Marshal
			else if (e.if.elementalLastTurn) ok = !!p.elementalLastTurn; // Thunder Lizard, Blazecaller, …
			else if (e.if.holdingMinAttack != null) ok = p.hand.some(c => c.type === 'creature' && c.attack >= e.if.holdingMinAttack); // Elder Longneck
			else if (e.if.controlStatic) ok = p.board.some(c => !isDead(c) && c.static?.type === e.if.controlStatic); // Master of Ceremonies: a Spell Damage minion
			else if (e.if.maxHealthSelf != null) ok = p.life <= e.if.maxHealthSelf;
			else if (e.if.targetFrozen) ok = !!(t && t.frozen);
			else if (e.if.targetFriendlyTribe) ok = !!(t && t.controller === pi && (t.tribe || '').includes(e.if.targetFriendlyTribe));
			else if (e.if.heroAttacked) ok = p.heroAttacksUsed > 0;
			else if (e.if.controlMinAttack != null) ok = p.board.some(c => !isDead(c) && c !== source && c.attack >= e.if.controlMinAttack);
			else if (e.if.cthunMinAttack != null) ok = (CTHUN_BASE + p.cthunAtk) >= e.if.cthunMinAttack;
			else if (e.if.holdingTribe) ok = p.hand.some(c => (c.tribe || '').includes(e.if.holdingTribe));
			else if (e.if.handEmpty) ok = p.hand.length === 0;
			else if (e.if.excavatedTwice) ok = (p.excavateCount || 0) >= 2;
			else if (e.if.manathirst != null) ok = (p.mana.max || 0) >= e.if.manathirst; // mana crystals this turn, regardless of spend
			else if (e.if.finale) ok = availableMana(p) === 0; // you spent all your mana playing this card
			else if (e.if.noFriendlyDeaths) ok = (p.diedThisTurn || 0) === 0;
			else if (e.if.friendlyDied) ok = (p.diedThisTurn || 0) > 0;       // Bone Flurry
			else if (e.if.deckAtLeast != null) ok = p.deck.length >= e.if.deckAtLeast; // Crowd Control
			else if (e.if.deckAtMost != null) ok = p.deck.length <= e.if.deckAtMost; // Blood Shard Bristleback
			else if (e.if.heroPowerUsed) ok = (p.heroPowers || []).some(h => h.usedThisTurn); // Manafeeder Panthara
			else if (e.if.holdingSpellMinCost != null) ok = p.hand.some(c => (c.type === 'sorcery' || c.type === 'instant' || c.type === 'secret' || c.type === 'trap') && (c.cost || 0) >= e.if.holdingSpellMinCost); // Groundskeeper
			else if (e.if.enemyTurn) ok = state.current !== pi; // Skelemancer / Vryghoul / Mountainfire Armor (died on opponent's turn)
			else if (e.if.deckNoCost != null) ok = !p.deck.some(id => (state.cardsById[id]?.cost || 0) === e.if.deckNoCost); // Prince Keleseth / Valanar
			else if (e.if.deckHasKeyword) ok = p.deck.some(id => { const def = state.cardsById[id]; return def?.type === 'creature' && (def.keywords || []).includes(e.if.deckHasKeyword); }); // Corpsetaker
			else if (e.if.noOtherCreatures) ok = !p.board.some(c => c !== source && !isDead(c) && c.type !== 'location'); // Lone Champion
			else if (e.if.controlTribeCount) ok = p.board.filter(c => !isDead(c) && (c.tribe || '').includes(e.if.controlTribeCount.tribe)).length >= e.if.controlTribeCount.count; // Windshear Stormcaller
			else if (e.if.heroTookDamage) ok = !!p.heroDamagedThisTurn; // Duskbat / Deathweb Spider
			else if (e.if.onlyCreature) ok = !state.players.some(pl => pl.board.some(c => c !== source && !isDead(c) && c.type !== 'location')); // Night Prowler
			else if (e.if.deckAllEven) ok = p.deck.length > 0 && p.deck.every(id => ((state.cardsById[id]?.cost || 0) % 2) === 0); // Murkspark Eel
			else if (e.if.deckAllOdd) ok = p.deck.length > 0 && p.deck.every(id => ((state.cardsById[id]?.cost || 0) % 2) === 1); // Gloom Stag / Glitter Moth
			else if (e.if.anyDiedThisTurn) ok = (state.diedThisTurn || 0) > 0; // Carrion Drake
			else if (e.if.controlCountHealth) ok = p.board.filter(c => !isDead(c) && c.type !== 'location' && hp(c) >= e.if.controlCountHealth.health).length >= e.if.controlCountHealth.count; // Star Aligner
			else if (e.if.emptyEverything) ok = p.deck.length === 0 && p.hand.length === 0 && !p.board.some(c => c !== source && !isDead(c) && c.type !== 'location'); // Mecha'thun
			else if (e.if.hasRememberedSpells) ok = !!(source && source.rememberedSpells && source.rememberedSpells.length); // Zerek, Master Cloner
			else if (e.if.enemyCreatureCount != null) ok = opponentsOf(state, pi).reduce((s, o) => s + state.players[o].board.filter(c => !isDead(c) && c.type !== 'location').length, 0) >= e.if.enemyCreatureCount; // Belligerent Gnome
			else if (e.if.spellsThisTurn != null) ok = (p.spellsPlayedThisTurn || 0) >= e.if.spellsThisTurn; // Wartbringer
			else if (e.if.controlFrozen) ok = p.board.some(c => !isDead(c) && c.frozen); // Ice Cream Peddler
			else if (e.if.healedGame != null) ok = (p.healedGame || 0) >= e.if.healedGame; // Zandalari Templar
			else if (e.if.playedQuestGame) ok = !!p.questsPlayedGame; // Sky Gen'ral Kragg
			else if (e.if.anyDamaged) ok = state.players.some(pl => pl.board.some(c => !isDead(c) && c.type !== 'location' && c.damage > 0)); // Bonechewer Raider
			else if (e.if.controlStealthed) ok = p.board.some(c => !isDead(c) && c.stealthed); // Greyheart Sage
			else if (e.if.castSpellLastTurn) ok = !!p.castSpellLastTurn; // Marshspawn / Shattered Rumbler
			else if (e.if.heroHealthChanged) ok = !!p.heroHealthChangedThisTurn; // Brittlebone Destroyer
			else if (e.if.hasSpellDamage) ok = staticValue(p, 'spell-damage') > 0; // Sorcerous Substitute
			else if (e.if.hasArmor) ok = (p.armor || 0) > 0; // Ironclad
			else if (e.if.holdingSecret) ok = p.hand.some(c => c.secret); // Sparkjoy Cheat
			else if (e.if.spellsGame != null) ok = (p.spellsPlayedTotal || 0) >= e.if.spellsGame; // Yogg-Saron, Master of Fate
			else if (e.if.healedThisTurn) ok = !!p.healedThisTurn; // Cleric of An'she
			else if (e.if.holdingSchool) ok = p.hand.some(c => schoolOf(c) === e.if.holdingSchool); // Toad of the Wilds
			else if (e.if.castSchoolThisTurn) ok = !!(p.schoolsCastThisTurn && p.schoolsCastThisTurn[e.if.castSchoolThisTurn]); // Metamorfin
			else if (e.if.diedCountGame) ok = (p.diedCountById?.[e.if.diedCountGame.id] || 0) >= e.if.diedCountGame.count; // Elwynn Boar
			else if (e.if.anyHeroDamagedThisTurn) ok = state.players.some(pl => pl.heroDamagedThisTurn); // Twilight Deceptor
			else if (e.if.hpDamageGame != null) ok = (p.hpDamageGame || 0) >= e.if.hpDamageGame; // Jan'alai, the Dragonhawk
			else if (e.if.deckEmpty) ok = p.deck.length === 0; // Chef Nomi
			else if (e.if.holdingOtherClass) ok = p.hand.some(c => c !== source && c.cardClass && c.cardClass !== 'neutral' && c.cardClass !== p.heroClass); // Underbelly Fence
			else if (e.if.controlLackey) ok = p.board.some(c => !isDead(c) && typeof c.id === 'string' && c.id.startsWith('lackey_')); // Heistbaron Togwaggle
			else if (e.if.unspentMana) ok = availableMana(p) > 0; // Crystal Merchant
			else if (e.if.controlCountId) ok = p.board.filter(c => !isDead(c) && c.id === e.if.controlCountId.id).length >= e.if.controlCountId.count; // Desert Obelisk
			else if (e.if.boardFullOfId) ok = p.board.filter(c => !isDead(c) && c.type !== 'location').length >= 7 && p.board.every(c => isDead(c) || c.type === 'location' || c.id === e.if.boardFullOfId); // Mogu Cultist
			else if (e.if.enemyControlTribe) ok = opponentsOf(state, pi).some(o => state.players[o].board.some(c => !isDead(c) && (c.tribe || '').includes(e.if.enemyControlTribe))); // Dragonmaw Poacher
			else if (e.if.invokedTwice) ok = (p.invokeCount || 0) >= 2; // Descent of Dragons "Invoked twice"
			else if (e.if.deckNoNeutral) ok = p.deck.length > 0 && p.deck.every(id => (state.cardsById[id]?.cardClass || 'neutral') !== 'neutral'); // Lightforged Zealot/Crusader
			else if (e.if.overloaded) ok = (p.overloadPending || 0) > 0 || (p.overloadLockedThisTurn || 0) > 0; // Cumulo-Maximus
			execEffects(state, pi, ok ? e.then : (e.else || []), target, source);
		} else if (e.type === 'damage-then') {
			// deal damage, then branch on whether the creature survived
			let v = e.value;
			if (source && (source.type === 'sorcery' || source.type === 'instant')) {
				v += staticValue(state.players[pi], 'spell-damage') + (state.players[pi].nextSpellDamageBonus || 0);
			}
			const t = chosenCreature();
			if (t) {
				damageCreature(state, t, v, null);
				const branch = isDead(t) ? e.ifDies : e.ifSurvives;
				if (branch) execEffects(state, pi, branch, target, source);
			} else if (target?.type === 'hero') {
				damageHero(state, target.player, v, pi);
				if (e.ifSurvives) execEffects(state, pi, e.ifSurvives, target, source); // heroes survive
			}
		} else if (e.type === 'draw-to-match') {
			// Divine Favor: draw until your hand matches an opponent's
			const victim = enemyHero();
			if (victim != null) {
				const diff = state.players[victim].hand.length - state.players[pi].hand.length;
				if (diff > 0) drawCards(state, pi, diff);
			}
		} else if (e.type === 'draw-damage') {
			// Holy Wrath: draw a card, deal its cost as damage
			const p = state.players[pi];
			const before = p.hand.length;
			drawCards(state, pi, 1);
			const drawn = p.hand.length > before ? p.hand.at(-1) : null;
			const v = drawn ? (drawn.cost || 0) : 0;
			if (v > 0) {
				const t = chosenCreature();
				if (t) damageCreature(state, t, v, null);
				else if (target?.type === 'hero') damageHero(state, target.player, v, pi);
				else { const f = enemyHero(); if (f != null) damageHero(state, f, v, pi); }
			}
		} else if (e.type === 'consume-shields') {
			// Blood Knight: pop every Divine Shield in play, grow per shield
			let n = 0;
			for (const pl of state.players) for (const c of pl.board) {
				if (isDead(c) || !c.shield) continue;
				c.shield = false;
				c.keywords = c.keywords.filter(k => k !== KW.DIVINE_SHIELD);
				emit(state, { type: 'shieldPop', uid: c.uid });
				n++;
			}
			if (n > 0 && source && source.zone === 'board' && !isDead(source)) {
				buffCreature(source, (e.attack || 0) * n, (e.health || 0) * n);
			}
		} else if (e.type === 'resummon-source') {
			// Ancestral Spirit's granted deathrattle: the fallen returns
			if (source) {
				const def = state.cardsById[source.id];
				summon(state, pi, def || {
					id: source.id, name: source.name, type: 'creature', cost: 0,
					rarity: source.rarity || 'common', description: source.description || '',
					attack: source.attack, health: source.maxHealth,
				});
			}
		} else if (e.type === 'heal-random-friendly') {
			// Lightwell: mend a random damaged friendly character
			const p = state.players[pi];
			const pool = p.board.filter(c => !isDead(c) && c.damage > 0).map(c => ({ c }));
			if (p.life < STARTING_LIFE) pool.push({ hero: true });
			if (pool.length) {
				const pick = pool[Math.floor(state.rng() * pool.length)];
				if (pick.hero) healHero(state, pi, e.value);
				else healCreature(pick.c, e.value);
			}
		} else if (e.type === 'temp-immune') {
			const t = chosenCreature();
			if (t) t.immuneTurn = state.turnNumber;
		} else if (e.type === 'temp-stealth-all') {
			// Conceal: stealth until the owner's next turn
			for (const c of state.players[pi].board) {
				if (isDead(c) || c.stealthed) continue;
				c.stealthed = true;
				c.tempStealth = true;
				if (!c.keywords.includes(KW.STEALTH)) c.keywords.push(KW.STEALTH);
			}
		} else if (e.type === 'unstealth-all') {
			for (const pl of state.players) for (const c of pl.board) {
				c.stealthed = false;
				c.tempStealth = false;
			}
		} else if (e.type === 'destroy-enemy-secrets') {
			let n = 0;
			for (const o of enemies) {
				const op = state.players[o];
				for (const sc of [...op.secrets]) {
					n++;
					op.secrets = op.secrets.filter(x => x !== sc);
					toGraveyard(state, o, sc);
					emit(state, { type: 'secretRevealed', player: o, card: sc });
				}
			}
			// Eater of Secrets: gain +1/+1 for each Secret destroyed
			if (e.buffSelf && n > 0 && source && !isDead(source)) {
				source.attack += n; source.maxHealth += n;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
		} else if (e.type === 'degrade-enemy-weapon') {
			// chip the chosen (or any armed) enemy's weapon
			const armed = enemies.filter(o => state.players[o].weapon);
			const chosen = target?.type === 'hero' && target.player !== pi ? target.player : null;
			const victim = (chosen != null && state.players[chosen].weapon) ? chosen
				: armed.length ? armed[Math.floor(state.rng() * armed.length)] : null;
			if (victim != null) {
				for (let i = 0; i < (e.value || 1); i++) {
					if (state.players[victim].weapon) degradeWeapon(state, victim);
				}
			}
		} else if (e.type === 'upgrade-weapon') {
			// Upgrade!: buff an equipped weapon, or forge one from nothing
			const p = state.players[pi];
			if (p.weapon) {
				p.weapon.attack += e.attack || 1;
				p.weapon.durability += e.durability || 1;
				emit(state, { type: 'weaponDurability', player: pi, attack: p.weapon.attack, durability: p.weapon.durability });
			} else {
				execEffects(state, pi, [{ type: 'equip', ...e.elseEquip }], target, source);
			}
		} else if (e.type === 'gain-max-mana') {
			const targets = e.target === 'all' ? state.players.map((_, i) => i).filter(i => !state.players[i].eliminated)
				: e.target === 'enemy' ? [enemyHero()].filter(x => x != null) : [pi];
			for (const who of targets) {
				const wp = state.players[who];
				wp.mana.max = Math.min(MAX_BASE_MANA, wp.mana.max + (e.value || 1));
				emit(state, { type: 'manaGained', player: who, amount: 0, mana: availableMana(wp) });
			}
		} else if (e.type === 'lose-max-mana') {
			// Revenant Rascal: target 'all' destroys a Mana Crystal for each player
			const victims = e.target === 'all' ? state.players.map((_, i) => i).filter(i => !state.players[i].eliminated) : [pi];
			for (const vi of victims) { const vp = state.players[vi]; vp.mana.max = Math.max(0, vp.mana.max - (e.value || 1)); vp.mana.cur = Math.min(vp.mana.cur, vp.mana.max); }
		} else if (e.type === 'set-hero-health') {
			const who = e.target === 'self' ? pi : (target?.type === 'hero' ? target.player : enemyHero()); // Majordomo: your own hero
			if (who != null) {
				state.players[who].life = e.value;
				emit(state, { type: 'heal', targetType: 'hero', player: who, amount: 0, life: e.value });
				checkGameOver(state);
			}
		} else if (e.type === 'swap-stats') {
			// Crazed Alchemist: attack <-> current health
			const t = chosenCreature();
			if (t) {
				const a = t.attack, h2 = hp(t);
				t.attack = h2;
				t.maxHealth = a;
				t.damage = 0;
				t.tempAttack = 0;
				t.tempHealth = 0;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
		} else if (e.type === 'recruit') {
			// Kobolds Recruit: summon a random matching creature straight from your deck
			const p = state.players[pi];
			for (let i = 0; i < (e.count || 1); i++) {
				const idxs = [];
				for (let j = 0; j < p.deck.length; j++) {
					const def = state.cardsById[p.deck[j]];
					if (!def || def.type !== 'creature' || def.token) continue;
					if (e.tribe && !(def.tribe || '').includes(e.tribe)) continue;
					if (e.maxCost != null && (def.cost || 0) > e.maxCost) continue;
					if (e.minCost != null && (def.cost || 0) < e.minCost) continue;
					if (e.cost != null && (def.cost || 0) !== e.cost) continue;
					if (e.attack != null && (def.attack || 0) !== e.attack) continue;
					if (e.requireKeyword && !(def.keywords || []).includes(e.requireKeyword)) continue; // Death Speaker Blackthorn
					if (e.cardId && p.deck[j] !== e.cardId) continue; // Persistent Peddler: a copy of itself
					idxs.push(j);
				}
				if (!idxs.length) break;
				const j = idxs[Math.floor(state.rng() * idxs.length)];
				const [id] = p.deck.splice(j, 1);
				const c = summon(state, pi, state.cardsById[id]);
				if (c && e.grant && !c.keywords.includes(e.grant)) c.keywords.push(e.grant); // Captain Hooktusk: give them Rush
			}
		} else if (e.type === 'swap-stats-all') {
			// Void Ripper: swap Attack and Health of all OTHER creatures
			for (const pl of state.players) for (const c of [...pl.board]) {
				if (c === source || isDead(c) || c.type !== 'creature') continue;
				const a = c.attack, h2 = hp(c);
				c.attack = h2; c.maxHealth = a; c.damage = 0; c.tempAttack = 0; c.tempHealth = 0;
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
		} else if (e.type === 'transform-into-token') {
			// Furbolg Mossbinder: turn a chosen creature into a fixed-stat token
			if (e.requireElementalLastTurn && !state.players[pi].elementalLastTurn) continue; // Lilypad Lurker
			const t = chosenCreature();
			if (t && t.controller != null && !isDead(t)) {
				const owner = t.controller;
				const tok = instantiate({ id: 'token_' + (e.name || 'token').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: e.name || 'Elemental', type: 'creature', cost: 0, rarity: 'common', token: true,
					tribe: e.tribe || null, attack: e.attack, health: e.health, keywords: e.keywords || [],
					description: e.description || `A ${e.attack}/${e.health} token.` }, owner);
				tok.zone = 'board'; tok.sick = t.sick;
				const board = state.players[owner].board;
				board[board.indexOf(t)] = tok; t.zone = 'gone';
				emit(state, { type: 'transformed', uid: t.uid, player: owner, from: t.name, card: tok });
				recomputeAuras(state);
			}
		} else if (e.type === 'add-self-copy') {
			// Feral Gibberer: add a copy of this creature to your hand
			if (source && state.cardsById[source.id] && state.players[pi].hand.length < MAX_HAND) {
				const c = instantiate(state.cardsById[source.id], pi);
				c.zone = 'hand'; state.players[pi].hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
		} else if (e.type === 'cast-enemy-random-spell') {
			// Unseen Saboteur: an opponent casts a random spell from their hand at random targets
			const o = enemies[0];
			if (o != null) {
				const op = state.players[o];
				const spells = op.hand.filter(c => isSpellType(c));
				if (spells.length) {
					const sp = spells[Math.floor(state.rng() * spells.length)];
					op.hand = op.hand.filter(c => c !== sp);
					const spec = targetSpec(state, o, sp, null);
					let tgt = null;
					if (spec) { const legal = legalTargets(state, o, spec); if (legal.length) tgt = legal[Math.floor(state.rng() * legal.length)]; }
					if (!spec || tgt || !spec.required) { runSpell(state, o, sp, tgt, null); sweepDeaths(state); }
				}
			}
		} else if (e.type === 'replace-with-legendaries') {
			// Arch-Villain Rafaam: replace your hand and deck with random Legendary creatures
			const p = state.players[pi];
			const legends = Object.values(state.cardsById).filter(d => d.type === 'creature' && d.rarity === 'legendary' && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (legends.length) {
				const handN = p.hand.filter(c => c !== source).length;
				p.hand = p.hand.filter(c => c === source);
				for (let i = 0; i < handN && p.hand.length < MAX_HAND; i++) { const c = instantiate(legends[Math.floor(state.rng() * legends.length)], pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); }
				p.deck = p.deck.map(() => legends[Math.floor(state.rng() * legends.length)].id);
			}
		} else if (e.type === 'rebuild-deck-random') {
			// Archivist Elysiana: replace your deck with 2 copies each of some random cards
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.type !== 'land' && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			const deck = [];
			for (let i = 0; i < (e.count || 5) && pool.length; i++) { const d = pool[Math.floor(state.rng() * pool.length)]; deck.push(d.id, d.id); }
			p.deck = deck;
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
		} else if (e.type === 'add-hagatha-horror') {
			// Swampqueen Hagatha: add a 5/5 Horror with two random Shaman spells baked in
			const p = state.players[pi];
			if (p.hand.length < MAX_HAND) {
				const spells = Object.values(state.cardsById).filter(d => isSpellType(d) && d.cardClass === 'shaman' && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
				const chosen = [];
				for (let i = 0; i < 2 && spells.length; i++) chosen.push(spells[Math.floor(state.rng() * spells.length)]);
				const bc = chosen.flatMap(sp => JSON.parse(JSON.stringify(sp.effects || [])));
				const horror = instantiate({ id: 'dal_drustvar_horror', name: 'Drustvar Horror', type: 'creature', cost: 5, token: true, rarity: 'epic', set: 'DALARAN', attack: 5, health: 5, keywords: bc.length ? ['battlecry'] : [], description: '5/5. ' + chosen.map(s => s.name).join(', '), effects: bc }, pi);
				horror.zone = 'hand'; p.hand.push(horror); emit(state, { type: 'conjure', player: pi, card: horror, color: null });
			}
		} else if (e.type === 'transform-deck-neutral') {
			// Wyrmrest Purifier: turn every Neutral card in your deck into a random class card
			const p = state.players[pi], cls = p.heroClass;
			const pool = Object.values(state.cardsById).filter(d => d.cardClass === cls && !d.token && d.collectible !== false && !(d.colors && d.colors.length) && d.type !== 'land');
			if (cls && pool.length) p.deck = p.deck.map(id => (state.cardsById[id]?.cardClass || 'neutral') === 'neutral' ? pool[Math.floor(state.rng() * pool.length)].id : id);
		} else if (e.type === 'swap-hero-powers') {
			// Grizzled Wizard: swap Hero Powers with an opponent
			const o = enemies[0];
			if (o != null) { const tmp = state.players[pi].heroPowers; state.players[pi].heroPowers = state.players[o].heroPowers; state.players[o].heroPowers = tmp; emit(state, { type: 'heroPowerGained', player: pi, card: state.players[pi].heroPowers[0] }); }
		} else if (e.type === 'draw-both-swap-cost') {
			// Tentacled Menace: each player draws a card, then swap the two drawn cards' Costs
			const o = enemies[0];
			const before0 = state.players[pi].hand.length; drawCards(state, pi, 1);
			const my = state.players[pi].hand.length > before0 ? state.players[pi].hand[state.players[pi].hand.length - 1] : null;
			let their = null;
			if (o != null) { const b = state.players[o].hand.length; drawCards(state, o, 1); their = state.players[o].hand.length > b ? state.players[o].hand[state.players[o].hand.length - 1] : null; }
			if (my && their) { const t = my.cost; my.cost = their.cost; their.cost = t; }
		} else if (e.type === 'chromatic-egg') {
			// Chromatic Egg: remember a random Dragon; Deathrattle hatches it
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.tribe || '').includes('Dragon') && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
			if (pool.length && source) source.hatchId = pool[Math.floor(state.rng() * pool.length)].id;
		} else if (e.type === 'hatch-egg') {
			if (source?.hatchId && state.cardsById[source.hatchId]) summon(state, pi, state.cardsById[source.hatchId]);
		} else if (e.type === 'destroy-all-copies') {
			// Flik Skyshiv: destroy a chosen creature and every copy of it, everywhere
			const t = chosenCreature();
			if (t) {
				const id = t.id;
				for (const pl of state.players) {
					for (const c of [...pl.board]) if (c.id === id && !isDead(c)) { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
					pl.hand = pl.hand.filter(c => c.id !== id);
					pl.deck = pl.deck.filter(cid => cid !== id);
				}
			}
		} else if (e.type === 'devastation') {
			// Kronx Dragonhoof: approximate Galakrond's Devastation (deal 5 to all enemies)
			execEffects(state, pi, [{ type: 'damage', value: 5, target: 'enemy-creatures' }, { type: 'damage', value: 5, target: 'enemy-heroes' }], target, source);
		} else if (e.type === 'replay-opponent-last-turn') {
			// Murozond the Infinite: play all cards your opponent played last turn (random targets)
			const o = enemies[0];
			if (o != null) {
				const randTarget = () => { const pool = []; for (let s2 = 0; s2 < state.players.length; s2++) { for (const c of state.players[s2].board) if (!isDead(c) && c.type !== 'location') pool.push({ type: 'creature', uid: c.uid, player: s2 }); pool.push({ type: 'hero', player: s2 }); } return pool.length ? pool[Math.floor(state.rng() * pool.length)] : null; };
				for (const id of (state.players[o].cardsPlayedLastTurnIds || [])) {
					const def = state.cardsById[id];
					if (!def) continue;
					if (def.type === 'creature') { if (state.players[pi].board.filter(c => !isDead(c)).length < 7) summon(state, pi, def); }
					else if (isSpellType(def) && def.effects) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), randTarget(), source);
				}
			}
		} else if (e.type === 'copy-to-all-zones') {
			// Sathrovarr: add a copy of a chosen friendly creature to hand, deck, and board
			const t = chosenCreature();
			const p = state.players[pi];
			if (t && state.cardsById[t.id]) {
				if (p.hand.length < MAX_HAND) { const c = instantiate(state.cardsById[t.id], pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); }
				p.deck.push(t.id); for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
				if (p.board.filter(c => !isDead(c)).length < 7) summon(state, pi, state.cardsById[t.id]);
			}
		} else if (e.type === 'equip-destroyed-weapon') {
			// Hoard Pillager: re-equip a weapon from your graveyard
			const p = state.players[pi];
			const weps = p.graveyard.filter(c => c.type === 'weapon');
			if (weps.length) {
				const w = weps[Math.floor(state.rng() * weps.length)];
				const gi = p.graveyard.indexOf(w); if (gi >= 0) p.graveyard.splice(gi, 1);
				const def = state.cardsById[w.id] || w;
				execEffects(state, pi, [{ type: 'equip-id', id: def.id }], null, source);
			}
		} else if (e.type === 'transform-target-into-source') {
			// Faceless Corruptor: turn a chosen friendly creature into a copy of this one
			const t = chosenCreature();
			if (t && source && state.cardsById[source.id]) {
				const owner = t.controller;
				const clone = instantiate(state.cardsById[source.id], owner);
				clone.zone = 'board'; clone.sick = t.sick;
				const board = state.players[owner].board; board[board.indexOf(t)] = clone; t.zone = 'gone';
				emit(state, { type: 'transformed', uid: t.uid, player: owner, from: t.name, card: clone });
				recomputeAuras(state);
			}
		} else if (e.type === 'attack-all-minions') {
			// Deathwing, Mad Aspect: attack every other creature
			if (source && source.zone === 'board' && !isDead(source)) {
				for (const pl of state.players) for (const c of [...pl.board]) {
					if (c === source || isDead(c) || c.type === 'location') continue;
					if (isDead(source)) break;
					resolveCombat(state, source.controller, source.uid, { type: 'creature', uid: c.uid, player: c.controller });
				}
			}
		} else if (e.type === 'mark-summon-copy') {
			// Mindflayer Kaahrj: remember a chosen creature; Deathrattle summons a copy
			const t = chosenCreature();
			if (t && source) source.copyVictimId = t.id;
		} else if (e.type === 'summon-marked-copy') {
			if (source?.copyVictimId && state.cardsById[source.copyVictimId]) summon(state, pi, state.cardsById[source.copyVictimId]);
		} else if (e.type === 'draw-and-summon-if-tribe') {
			// Utgarde Grapplesnipe: both players draw; a drawn creature of a tribe is summoned
			for (let s2 = 0; s2 < state.players.length; s2++) {
				const pl = state.players[s2]; if (pl.eliminated) continue;
				const before = pl.hand.length;
				drawCards(state, s2, 1);
				const drawn = pl.hand.length > before ? pl.hand[pl.hand.length - 1] : null;
				if (drawn && drawn.type === 'creature' && (drawn.tribe || '').includes(e.tribe) && pl.board.filter(c => !isDead(c)).length < 7) {
					pl.hand = pl.hand.filter(c => c !== drawn); drawn.zone = 'board'; drawn.sick = true; pl.board.push(drawn);
					emit(state, { type: 'summon', player: s2, card: drawn }); fireOngoing(state, s2, 'summoned', { minion: drawn });
				}
			}
			recomputeAuras(state);
		} else if (e.type === 'set-max-hand-draw') {
			// Valdris Felgorge: draw cards (our hand cap is already generous)
			drawCards(state, pi, e.draw || 4);
		} else if (e.type === 'steal-enemy-weapon') {
			// Kobold Stickyfinger: take the opponent's weapon
			const o = enemies[0];
			if (o != null && state.players[o].weapon) {
				const w = state.players[o].weapon; state.players[o].weapon = null;
				if (state.players[pi].weapon) breakWeapon(state, pi, true);
				w.controller = pi; state.players[pi].weapon = w;
				emit(state, { type: 'weaponEquipped', player: pi, card: w });
			}
		} else if (e.type === 'summon-hand-size-stats') {
			// Abyssal Summoner: summon a token with stats equal to your hand size
			const n = state.players[pi].hand.length;
			summon(state, pi, { id: 'token_' + (e.name || 'imp').toLowerCase(), name: e.name || 'Abyssal Enforcer', type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: n, health: n, keywords: e.keywords || [], description: `A ${n}/${n} token.` });
		} else if (e.type === 'reduce-deck-tribe-cost') {
			// Frizz Kindleroost: Dragons drawn from your deck cost less
			// (alsoHand -> Granite Forgeborn reduces Elementals already in hand too)
			state.players[pi].deckTribeDiscount = state.players[pi].deckTribeDiscount || {};
			state.players[pi].deckTribeDiscount[e.tribe] = (state.players[pi].deckTribeDiscount[e.tribe] || 0) + (e.value || 2);
			if (e.alsoHand) for (const c of state.players[pi].hand) if (c.type === 'creature' && (c.tribe || '').includes(e.tribe)) c.cost = Math.max(0, (c.cost || 0) - (e.value || 2));
		} else if (e.type === 'destroy-enemy-armor') {
			// Platebreaker: destroy the opponent's Armor (and deal that much, if asked)
			for (const o of enemies) {
				const amt = state.players[o].armor;
				state.players[o].armor = 0;
				if (amt > 0) { emit(state, { type: 'armor', player: o, amount: -amt, armor: 0 }); if (e.thenDamage) damageHero(state, o, amt, pi); }
			}
		} else if (e.type === 'invoke') {
			// Descent of Dragons: Invoke Galakrond (tracked as a counter; grants a small bonus)
			const p = state.players[pi];
			p.invokeCount = (p.invokeCount || 0) + (e.times || 1);
			if (source && source.zone === 'board' && !isDead(source) && (e.attack || e.health)) buffCreature(source, e.attack || 0, e.health || 0);
		} else if (e.type === 'duplicate-hand') {
			// Elise the Enlightened: add a copy of each other card in your hand
			const pp = state.players[pi];
			for (const c of [...pp.hand]) {
				if (c === source || pp.hand.length >= MAX_HAND) continue;
				const def = state.cardsById[c.id]; if (!def) continue;
				const cp = instantiate(def, pi); cp.zone = 'hand'; pp.hand.push(cp);
				emit(state, { type: 'conjure', player: pi, card: cp, color: null });
			}
		} else if (e.type === 'summon-per-hand-spell') {
			// King Phaoris: for each spell in your hand, summon a random creature of its Cost
			const pp = state.players[pi];
			for (const c of pp.hand.filter(x => isSpellType(x))) {
				if (pp.board.filter(x => !isDead(x)).length >= 7) break;
				execEffects(state, pi, [{ type: 'summon-random', cost: c.cost || 0 }], target, source);
			}
		} else if (e.type === 'add-remembered-discard') {
			// Expired Merchant's Deathrattle: add copies of the discarded card
			if (source?.discardedId && state.cardsById[source.discardedId]) execEffects(state, pi, [{ type: 'add-card', id: source.discardedId, count: e.count || 2 }], target, source);
		} else if (e.type === 'sacrifice-selves-summon') {
			// Mogu Cultist: destroy all copies of this creature, summon a token
			const pp = state.players[pi];
			for (const c of [...pp.board]) if (c.id === source.id && !isDead(c)) { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
			if (e.summonId && state.cardsById[e.summonId]) summon(state, pi, state.cardsById[e.summonId]);
		} else if (e.type === 'debuff-enemies-attack-turn') {
			// Quicksand Elemental: all enemy creatures lose Attack until your turn ends
			for (const o of enemies) for (const c of state.players[o].board) {
				if (isDead(c) || c.type === 'location' || c.attack <= 0) continue;
				const d = Math.min(c.attack, e.value || 2);
				c.attack -= d; c.turnAtkDebuff = (c.turnAtkDebuff || 0) + d;
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
		} else if (e.type === 'swap-deck-tops') {
			// Mischief Maker: swap the top card of your deck with your opponent's
			const o = enemies[0], mp = state.players[pi];
			if (o != null && mp.deck.length && state.players[o].deck.length) {
				const a = mp.deck.pop(), b = state.players[o].deck.pop();
				mp.deck.push(b); state.players[o].deck.push(a);
			}
		} else if (e.type === 'set-hand-spell-cost') {
			// Naga Sand Witch: set the Cost of spells in your hand
			for (const c of state.players[pi].hand) if (isSpellType(c)) c.cost = e.value ?? 5;
		} else if (e.type === 'summon-cheapest-from-hand-each') {
			// Blatant Decoy: each player summons the lowest-Cost creature from their hand
			for (let s2 = 0; s2 < state.players.length; s2++) {
				const pl = state.players[s2];
				if (pl.eliminated || pl.board.filter(c => !isDead(c)).length >= 7) continue;
				const pool = pl.hand.filter(c => c.type === 'creature');
				if (!pool.length) continue;
				const cheap = pool.reduce((a, b) => (b.cost || 0) < (a.cost || 0) ? b : a);
				pl.hand = pl.hand.filter(c => c !== cheap);
				cheap.zone = 'board'; cheap.sick = true; pl.board.push(cheap);
				emit(state, { type: 'summon', player: s2, card: cheap }); fireOngoing(state, s2, 'summoned', { minion: cheap });
			}
			recomputeAuras(state);
		} else if (e.type === 'summon-random-died-game') {
			// Psychopomp: summon a random friendly creature that died this game, optionally granting a keyword
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature');
			if (pool.length) { const c = summon(state, pi, pool[Math.floor(state.rng() * pool.length)]); if (c && e.grant && !c.keywords.includes(e.grant)) c.keywords.push(e.grant); }
		} else if (e.type === 'destroy-and-selfdamage-by-health') {
			// Riftcleaver: destroy a creature; your hero takes damage equal to its Health
			const t = chosenCreature();
			if (t) { const h = hp(t); t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); damageHero(state, pi, h, pi); }
		} else if (e.type === 'enemy-summon-from-hand-and-damage') {
			// Wild Bloodstinger: pull a creature from the opponent's hand into play, then hit it
			const o = enemies[0];
			if (o != null) {
				const op = state.players[o];
				const pool = op.hand.filter(c => c.type === 'creature');
				if (pool.length && op.board.filter(c => !isDead(c)).length < 7) {
					const c = pool[Math.floor(state.rng() * pool.length)];
					op.hand = op.hand.filter(x => x !== c);
					c.zone = 'board'; c.sick = true; op.board.push(c);
					emit(state, { type: 'summon', player: o, card: c }); fireOngoing(state, o, 'summoned', { minion: c }); recomputeAuras(state);
					damageCreature(state, c, e.value || 5, source);
				}
			}
		} else if (e.type === 'heal-adjacent-full') {
			// Neferset Ritualist: restore the creatures flanking this one to full Health
			const board = state.players[pi].board;
			const idx = board.indexOf(source);
			for (const nb of [board[idx - 1], board[idx + 1]]) if (nb && !isDead(nb) && nb.damage > 0) { nb.damage = 0; emit(state, { type: 'heal', targetType: 'creature', uid: nb.uid, amount: 0, hp: hp(nb) }); }
		} else if (e.type === 'copy-hand-random-tribe') {
			// Ramkahen Wildtamer: copy a random creature of a tribe in your hand
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature' && (!e.tribe || (c.tribe || '').includes(e.tribe)));
			if (pool.length && p.hand.length < MAX_HAND) {
				const src = pool[Math.floor(state.rng() * pool.length)];
				const def = state.cardsById[src.id] || src;
				const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
		} else if (e.type === 'set-lackey-buff') {
			// Dark Pharaoh Tekahn: for the rest of the game, your Lackeys are N/N
			state.players[pi].lackeyBuff = e.value || 4;
			for (const c of state.players[pi].hand) if (typeof c.id === 'string' && c.id.startsWith('lackey_')) { c.attack = e.value || 4; c.maxHealth = e.value || 4; }
		} else if (e.type === 'grant-hero-elusive') {
			// Spellward Jeweler: your hero can't be targeted until your next turn
			state.players[pi].heroElusiveUntil = state.turnNumber + 2;
		} else if (e.type === 'transform-copy-from-deck') {
			// Muckmorpher: become a stat-set copy of a random creature in your deck
			const p = state.players[pi];
			const pool = [...new Set(p.deck)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && !d.token && d.id !== (source && source.id));
			if (pool.length && source && source.zone === 'board' && !isDead(source)) {
				const def = pool[Math.floor(state.rng() * pool.length)];
				const clone = instantiate(def, source.controller);
				clone.zone = 'board'; clone.sick = source.sick;
				if (e.setAttack != null) clone.attack = e.setAttack;
				if (e.setHealth != null) { clone.maxHealth = e.setHealth; clone.damage = 0; }
				const board = p.board; board[board.indexOf(source)] = clone; source.zone = 'gone';
				emit(state, { type: 'transformed', uid: source.uid, player: source.controller, from: source.name, card: clone });
				recomputeAuras(state);
			}
		} else if (e.type === 'fill-board-each') {
			// Mad Summoner: fill every player's board with tokens
			for (let s2 = 0; s2 < state.players.length; s2++) {
				if (state.players[s2].eliminated) continue;
				while (state.players[s2].board.filter(c => !isDead(c)).length < 7) {
					const c = summon(state, s2, { id: 'token_' + (e.name || 'imp').toLowerCase(), name: e.name || 'Imp', type: 'creature', cost: 1, token: true, tribe: e.tribe || null, rarity: 'common', attack: e.attack || 1, health: e.health || 1, description: `A ${e.attack || 1}/${e.health || 1} token.` });
					if (!c) break;
				}
			}
		} else if (e.type === 'heal-all-full') {
			// Nozari: restore both heroes to full Health
			for (let s2 = 0; s2 < state.players.length; s2++) { const pl = state.players[s2]; if (pl.eliminated) continue; if (pl.life < STARTING_LIFE) healHero(state, s2, STARTING_LIFE - pl.life); }
		} else if (e.type === 'copy-board-battlecries') {
			// Barista Lynchen: add a copy of each of your other Battlecry creatures to hand
			const p = state.players[pi];
			for (const c of p.board) {
				if (c === source || isDead(c) || c.type !== 'creature' || !(c.keywords || []).includes('battlecry')) continue;
				if (p.hand.length >= MAX_HAND) break;
				const def = state.cardsById[c.id]; if (!def) continue;
				const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null });
			}
		} else if (e.type === 'summon-deck-copy') {
			// The Boom Reaver: summon a copy of a random creature in your deck (kept in deck), grant a keyword
			const p = state.players[pi];
			const pool = [...new Set(p.deck)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && !d.token);
			if (pool.length) { const c = summon(state, pi, pool[Math.floor(state.rng() * pool.length)]); if (c && e.grant && !c.keywords.includes(e.grant)) c.keywords.push(e.grant); }
		} else if (e.type === 'add-lackey') {
			// Rise of Shadows: add a random Lackey to your hand
			const lackeys = ['lackey_ethereal', 'lackey_faceless', 'lackey_goblin', 'lackey_kobold', 'lackey_witchy'];
			for (let i = 0; i < (e.count || 1); i++) {
				const p2 = state.players[pi];
				if (p2.hand.length >= MAX_HAND) break;
				execEffects(state, pi, [{ type: 'add-card', id: lackeys[Math.floor(state.rng() * lackeys.length)] }], target, source);
				if (p2.lackeyBuff) { const added = p2.hand[p2.hand.length - 1]; if (added && added.id.startsWith('lackey_')) { added.attack = p2.lackeyBuff; added.maxHealth = p2.lackeyBuff; } } // Dark Pharaoh Tekahn
			}
		} else if (e.type === 'silence-adjacent') {
			// Dalaran Librarian: silence the creatures flanking this one
			const board = state.players[pi].board;
			const idx = board.indexOf(source);
			for (const nb of [board[idx - 1], board[idx + 1]]) if (nb && !isDead(nb)) silenceCreature(state, nb);
		} else if (e.type === 'copy-health') {
			// Faceless Rager: set this creature's Health equal to a chosen friendly's
			const t = chosenCreature();
			if (t && source && source.zone === 'board' && !isDead(source)) {
				source.maxHealth = hp(t); source.damage = 0;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
		} else if (e.type === 'copy-opening-hand') {
			// Hex Lord Malacrass: add a copy of your opening hand (minus this card)
			const p = state.players[pi];
			for (const id of (p.openingHand || [])) { if (p.hand.length >= MAX_HAND) break; if (source && id === source.id) { source._openingSkipped = source._openingSkipped || false; if (!source._openingSkipped) { source._openingSkipped = true; continue; } } const def = state.cardsById[id]; if (def) { const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); } }
		} else if (e.type === 'return-last-turn-spells') {
			// Krag'wa, the Frog: return all spells you played last turn to your hand
			const p = state.players[pi];
			for (const id of (p.spellsPlayedLastTurnIds || [])) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[id]; if (def) { const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); } }
		} else if (e.type === 'drakkari-swap') {
			// Drakkari Trickster: each player gets a copy of a random card from their opponent's deck
			const o = enemies[0];
			if (o != null) {
				const p = state.players[pi], op = state.players[o];
				if (op.deck.length && p.hand.length < MAX_HAND) { const id = op.deck[Math.floor(state.rng() * op.deck.length)]; const def = state.cardsById[id]; if (def) { const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); } }
				if (p.deck.length && op.hand.length < MAX_HAND) { const id = p.deck[Math.floor(state.rng() * p.deck.length)]; const def = state.cardsById[id]; if (def) { const c = instantiate(def, o); c.zone = 'hand'; op.hand.push(c); emit(state, { type: 'conjure', player: o, card: c, color: null }); } }
			}
		} else if (e.type === 'transform-treants') {
			// Treespeaker: turn your Treants into 5/5 Ancients
			const p = state.players[pi];
			for (const c of [...p.board]) {
				if (isDead(c) || !(c.name === 'Treant' || (c.tribe || '').includes('Treant'))) continue;
				const tok = instantiate({ id: 'token_ancient', name: 'Ancient', type: 'creature', cost: 0, token: true, rarity: 'common', attack: 5, health: 5, description: 'A 5/5 Ancient.' }, pi);
				tok.zone = 'board'; tok.sick = c.sick; p.board[p.board.indexOf(c)] = tok; c.zone = 'gone';
				emit(state, { type: 'transformed', uid: c.uid, player: pi, from: c.name, card: tok });
			}
			recomputeAuras(state);
		} else if (e.type === 'set-next-hero-power-damage') {
			// Daring Fire-Eater: your next Hero Power this turn deals more
			state.players[pi].heroPowerDamageNext = (state.players[pi].heroPowerDamageNext || 0) + (e.value || 2);
		} else if (e.type === 'copy-hand-tribe') {
			// War Master Voone: copy all creatures of a tribe in your hand
			const p = state.players[pi];
			const copies = p.hand.filter(c => c.type === 'creature' && (!e.tribe || (c.tribe || '').includes(e.tribe)));
			for (const c of copies) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[c.id] || c; const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
		} else if (e.type === 'fill-hand-token') {
			// Halazzi, the Lynx: fill your hand with a token
			const p = state.players[pi];
			const def = state.cardsById[e.id];
			while (def && p.hand.length < MAX_HAND) { const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
		} else if (e.type === 'set-mana-all') {
			// Mojomaster Zihi: set each player to N Mana Crystals
			for (const pl of state.players) { if (pl.eliminated) continue; pl.mana.max = e.value || 5; pl.mana.cur = Math.min(pl.mana.cur, pl.mana.max); }
			emit(state, { type: 'manaGained', player: pi, amount: 0, mana: availableMana(state.players[pi]) });
		} else if (e.type === 'fill-board-self') {
			// Hir'eek, the Bat: fill your board with copies of this creature
			const p = state.players[pi];
			const def = source && (state.cardsById[source.id] || source);
			if (def) while (p.board.filter(c => !isDead(c)).length < 7) { const c = summon(state, pi, def); if (!c) break; }
		} else if (e.type === 'summon-foreign-from-hand') {
			// Princess Talanji: summon every creature in hand that didn't start in your deck
			const p = state.players[pi];
			for (const c of [...p.hand]) {
				if (c.type !== 'creature' || c.fromDeck) continue;
				if (p.board.filter(x => !isDead(x)).length >= 7) break;
				p.hand = p.hand.filter(x => x !== c);
				c.zone = 'board'; c.sick = true; p.board.push(c);
				emit(state, { type: 'summon', player: pi, card: c }); fireOngoing(state, pi, 'summoned', { minion: c });
			}
			recomputeAuras(state);
		} else if (e.type === 'set-life-to-armor') {
			// High Priest Thekal: convert all but 1 Health into Armor
			const p = state.players[pi];
			const conv = Math.max(0, p.life - 1);
			p.life -= conv; gainArmor(state, pi, conv);
			emit(state, { type: 'damage', targetType: 'hero', player: pi, amount: 0, life: p.life });
		} else if (e.type === 'gain-deathrattles-from-died') {
			// Da Undatakah: gain the Deathrattles of N friendly creatures that died this game
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && d.deathrattle && d.deathrattle.length);
			for (let i = 0; i < (e.count || 3) && pool.length && source; i++) {
				const def = pool.splice(Math.floor(state.rng() * pool.length), 1)[0];
				source.deathrattle = [...(source.deathrattle || []), ...JSON.parse(JSON.stringify(def.deathrattle))];
			}
			if (source && source.deathrattle && source.deathrattle.length && !source.keywords.includes('deathrattle')) source.keywords.push('deathrattle');
		} else if (e.type === 'eat-from-deck') {
			// Gral, the Shark: eat a random creature in your deck, gain its stats
			const p = state.players[pi];
			const idxs = p.deck.map((id, j) => ({ id, j })).filter(x => state.cardsById[x.id]?.type === 'creature' && !state.cardsById[x.id].token);
			if (idxs.length && source && source.zone === 'board' && !isDead(source)) {
				const pick = idxs[Math.floor(state.rng() * idxs.length)];
				const def = state.cardsById[pick.id];
				p.deck.splice(pick.j, 1);
				buffCreature(source, def.attack || 0, def.health || 0);
			}
		} else if (e.type === 'destroy-self-gain-armor') {
			// Gurubashi Offering: at the start of your turn, destroy this and gain Armor
			if (source && source.zone === 'board' && !isDead(source)) { source.damage = source.maxHealth; source.shield = false; emit(state, { type: 'destroy', uid: source.uid }); }
			gainArmor(state, pi, e.value || 8);
		} else if (e.type === 'set-heal-harm') {
			// Auchenai Phantasm: this turn, your healing deals damage instead
			state.players[pi].healHarmThisTurn = true;
		} else if (e.type === 'bounce-and-buff') {
			// Bog Slosher: return a friendly creature to hand and give it +2/+2
			const t = chosenCreature();
			if (t) {
				const owner = state.players[t.controller];
				owner.board = owner.board.filter(c => c !== t);
				const def = state.cardsById[t.id];
				if (def && owner.hand.length < MAX_HAND) {
					const card = instantiate(def, t.controller);
					card.zone = 'hand'; card.attack += e.attack || 0; card.maxHealth += e.health || 0;
					owner.hand.push(card); emit(state, { type: 'bounce', uid: t.uid, player: t.controller, name: t.name });
				}
				recomputeAuras(state);
			}
		} else if (e.type === 'heal-self-creature') {
			// Regeneratin' Thug: restore Health to this creature at the start of your turn
			if (source && source.zone === 'board' && !isDead(source) && source.damage > 0) {
				source.damage = Math.max(0, source.damage - (e.value || 2));
				emit(state, { type: 'heal', targetType: 'creature', uid: source.uid, amount: e.value || 2, hp: hp(source) });
			}
		} else if (e.type === 'set-next-spell-damage') {
			state.players[pi].nextSpellDamageBonus = (state.players[pi].nextSpellDamageBonus || 0) + (e.value || 2); // Celestial Emissary
		} else if (e.type === 'set-next-spell-double') {
			state.players[pi].nextSpellDoubleCast = true; // Electra Stormsurge
		} else if (e.type === 'set-spells-lifesteal') {
			state.players[pi].spellsLifestealThisTurn = true; // Omega Mind
		} else if (e.type === 'fireworks') {
			// Fireworks Tech: give a chosen friendly Mech +1/+1; if it has a Deathrattle, trigger it
			const t = chosenCreature();
			if (t) {
				buffCreature(t, e.attack || 1, e.health || 1);
				if (t.deathrattle && t.deathrattle.length) runDeathrattle(state, t.controller, t);
			}
		} else if (e.type === 'copy-adjacent') {
			// Gloop Sprayer: summon a copy of each creature flanking this one
			const board = state.players[pi].board;
			const idx = board.indexOf(source);
			for (const adj of [board[idx - 1], board[idx + 1]]) {
				if (adj && !isDead(adj) && adj.type !== 'location') { const def = state.cardsById[adj.id]; if (def) summon(state, pi, def); }
			}
		} else if (e.type === 'summon-random-hand-size') {
			// Astromancer: summon a random creature costing exactly your hand size
			execEffects(state, pi, [{ type: 'summon-random', cost: state.players[pi].hand.length }], target, source);
		} else if (e.type === 'reduce-random-hand-minion-cost') {
			// Dreampetal Florist: cheapen a random creature in your hand
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature' && (c.cost || 0) > 0);
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.cost = Math.max(0, (c.cost || 0) - (e.value || 1)); }
		} else if (e.type === 'shuffle-remembered-into-deck') {
			// Test Subject: shuffle every spell cast on this creature into your deck
			const p = state.players[pi];
			for (const id of (source?.rememberedSpells || [])) { if (state.cardsById[id]) p.deck.push(id); }
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
		} else if (e.type === 'inc-pogo') {
			// Pogo-Hopper: track how many you've played so the next gains more
			state.players[pi].pogoCount = (state.players[pi].pogoCount || 0) + 1;
		} else if (e.type === 'temp-stealth-self') {
			// Coppertail Imposter: gain Stealth until your next turn
			if (source && source.zone === 'board' && !isDead(source)) {
				source.tempStealth = true; source.stealthed = true;
				if (!source.keywords.includes(KW.STEALTH)) source.keywords.push(KW.STEALTH);
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
		} else if (e.type === 'set-self-hp-cost') {
			// Genn Greymane: your Hero Power costs (1) (a board aura via heroPowerCostSet)
			if (source) source.heroPowerCostSet = e.value ?? 1;
		} else if (e.type === 'set-deck-inner-fire') {
			// Lady in White: creatures drawn from your deck get Attack equal to Health
			state.players[pi].deckInnerFire = true;
		} else if (e.type === 'copy-enemy-hand') {
			// Azalina Soulthief: replace your hand with a copy of an opponent's
			const o = enemies[0];
			if (o != null) {
				const p = state.players[pi];
				p.hand = [];
				for (const ec of state.players[o].hand) {
					if (p.hand.length >= MAX_HAND) break;
					const def = state.cardsById[ec.id] || ec;
					const card = instantiate(def, pi); card.zone = 'hand'; p.hand.push(card);
					emit(state, { type: 'conjure', player: pi, card, color: null });
				}
			}
		} else if (e.type === 'repeat-battlecries' || e.type === 'replay-other-class') {
			// Shudderwock / Tess Greymane: re-run remembered effects with random targets
			const list = e.type === 'repeat-battlecries' ? state.players[pi].battlecriesPlayedGame : state.players[pi].otherClassPlayedGame;
			const randTarget = () => {
				const pool = [];
				for (let s2 = 0; s2 < state.players.length; s2++) { if (state.players[s2].eliminated) continue; for (const c of state.players[s2].board) if (!isDead(c) && c.type !== 'location') pool.push({ type: 'creature', uid: c.uid, player: s2 }); pool.push({ type: 'hero', player: s2 }); }
				return pool.length ? pool[Math.floor(state.rng() * pool.length)] : null;
			};
			for (const id of [...list]) {
				const def = state.cardsById[id];
				if (def && def.effects) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), randTarget(), source);
			}
		} else if (e.type === 'double-health-others') {
			// Glitter Moth: double the Health of your OTHER creatures
			for (const c of state.players[pi].board) {
				if (c === source || isDead(c) || c.type === 'location') continue;
				c.maxHealth += hp(c); emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
		} else if (e.type === 'damage-self-per-enemy-hand') {
			// Witchwood Grizzly: lose 1 Health for each card in your opponent's hand
			const n = enemies.reduce((s, o) => s + state.players[o].hand.length, 0);
			if (n > 0) damageHero(state, pi, n, pi);
		} else if (e.type === 'buff-hand-double') {
			// Emeriss: double Attack and Health of all creatures in your hand
			for (const c of state.players[pi].hand) if (c.type === 'creature') { c.attack += c.attack; c.maxHealth += c.maxHealth; }
		} else if (e.type === 'godfrey-loop') {
			// Lord Godfrey: deal N to all other creatures; if any die, repeat
			let again = true, guard = 24;
			while (again && guard-- > 0 && !state.over) {
				const hit = [];
				for (const pl of state.players) for (const c of pl.board) if (c !== source && !isDead(c) && c.type !== 'location') hit.push(c);
				if (!hit.length) break;
				for (const c of hit) damageCreature(state, c, e.value || 2, source);
				again = hit.some(c => isDead(c));
				sweepDeaths(state);
			}
		} else if (e.type === 'transform-deck-cost') {
			// Prince Liam: transform every N-Cost card in your deck into a random Legendary creature
			const p = state.players[pi];
			const legends = Object.values(state.cardsById).filter(d => d.type === 'creature' && d.rarity === 'legendary' && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (legends.length) p.deck = p.deck.map(id => ((state.cardsById[id]?.cost || 0) === (e.cost ?? 1)) ? legends[Math.floor(state.rng() * legends.length)].id : id);
		} else if (e.type === 'mark-doomed') {
			// Voodoo Doll: remember a chosen creature; destroy it when this dies
			const t = chosenCreature();
			if (t && source) source.doomedUid = t.uid;
		} else if (e.type === 'destroy-marked') {
			// Voodoo Doll's Deathrattle
			if (source?.doomedUid != null) { const t = findCreature(state, source.doomedUid); if (t && !isDead(t)) { t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); } }
		} else if (e.type === 'devour-target') {
			// Ratcatcher: destroy a chosen friendly creature, gain its Attack and Health
			const t = chosenCreature();
			if (t && source && source.zone === 'board' && !isDead(source) && t !== source) {
				const a = t.attack, h2 = hp(t);
				t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid });
				buffCreature(source, a, h2);
			}
		} else if (e.type === 'random-buff-others') {
			// Mad Hatter: toss N +1/+1 hats onto random OTHER creatures (may stack)
			for (let i = 0; i < (e.count || 1); i++) {
				const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location');
				if (!pool.length) break;
				buffCreature(pool[Math.floor(state.rng() * pool.length)], e.attack || 1, e.health || 1);
			}
		} else if (e.type === 'destroy-own-totems-buff') {
			// Totem Cruncher: destroy your Totems, gain +2/+2 for each
			const p = state.players[pi];
			const totems = p.board.filter(c => c !== source && !isDead(c) && (c.tribe || '').includes('Totem'));
			for (const t of totems) { t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); }
			if (totems.length && source && source.zone === 'board' && !isDead(source)) buffCreature(source, (e.attack || 2) * totems.length, (e.health || 2) * totems.length);
		} else if (e.type === 'damage-all-others-damaged') {
			// Worgen Abomination: at end of turn, hit every OTHER already-damaged creature
			for (const pl of state.players) for (const c of [...pl.board]) {
				if (c === source || isDead(c) || c.type === 'location' || c.damage <= 0) continue;
				damageCreature(state, c, e.value || 2, null);
			}
		} else if (e.type === 'awaken-darkness') {
			// The Darkness's Candle: wake any dormant Darkness on the board
			for (const pl of state.players) for (const c of pl.board) {
				if (c.name === 'The Darkness' && c.dormantLeft > 0) { c.dormantLeft = 0; emit(state, { type: 'awaken', uid: c.uid, player: c.controller }); }
			}
		} else if (e.type === 'grant-double-turns') {
			// Temporus: your opponent takes two turns, then you take two turns
			const o = enemies[0];
			if (o != null) state.forcedTurns = [o, o, pi, pi];
		} else if (e.type === 'swap-decks') {
			// King Togwaggle: swap decks with an opponent (and hand them a Ransom to swap back)
			const o = enemies[0];
			if (o != null) {
				const tmp = state.players[pi].deck; state.players[pi].deck = state.players[o].deck; state.players[o].deck = tmp;
				emit(state, { type: 'decksSwapped', player: pi, other: o });
				if (!e.back) execEffects(state, pi, [{ type: 'give-enemy-card', id: 'kings_ransom' }], null, source);
			}
		} else if (e.type === 'destroy-enemy-deck') {
			// Azari, the Devourer: destroy your opponent's deck
			for (const o of enemies) state.players[o].deck = [];
			emit(state, { type: 'deckDestroyed' });
		} else if (e.type === 'cast-remembered-on-self') {
			// Lynessa Sunsorrow: recast every spell you cast on your creatures this game onto this one
			const p = state.players[pi];
			if (source && p.spellsOnFriendly) for (const id of [...p.spellsOnFriendly]) {
				const def = state.cardsById[id];
				if (def && def.effects && source.zone === 'board' && !isDead(source)) {
					execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), { type: 'creature', uid: source.uid, player: pi }, source);
				}
			}
		} else if (e.type === 'spell-joust-draw') {
			// Raven Familiar: reveal a random spell from each deck; if yours costs more, draw it
			const p = state.players[pi];
			const mine = p.deck.map(id => state.cardsById[id]).filter(d => d && isSpellType(d));
			const foe = enemies[0] != null ? state.players[enemies[0]].deck.map(id => state.cardsById[id]).filter(d => d && isSpellType(d)) : [];
			if (mine.length) {
				const my = mine[Math.floor(state.rng() * mine.length)];
				const their = foe.length ? foe[Math.floor(state.rng() * foe.length)] : null;
				emit(state, { type: 'joust', player: pi, myName: my.name, myCost: my.cost, enemyName: their?.name || null, enemyCost: their?.cost ?? null, win: (my.cost || 0) > (their?.cost ?? -1) });
				if ((my.cost || 0) > (their?.cost ?? -1) && p.hand.length < MAX_HAND) {
					const j = p.deck.indexOf(my.id);
					if (j >= 0) { p.deck.splice(j, 1); const card = instantiate(my, pi); card.zone = 'hand'; p.hand.push(card); emit(state, { type: 'conjure', player: pi, card, color: null }); }
				}
			}
		} else if (e.type === 'reveal-spell-summon') {
			// Spiteful Summoner: reveal a random spell in your deck, summon a random minion of its Cost
			const p = state.players[pi];
			const spells = p.deck.map(id => state.cardsById[id]).filter(d => d && isSpellType(d));
			if (spells.length) {
				const sp = spells[Math.floor(state.rng() * spells.length)];
				emit(state, { type: 'joust', player: pi, myName: sp.name, myCost: sp.cost, enemyName: null, enemyCost: null, win: true });
				execEffects(state, pi, [{ type: 'summon-random', cost: sp.cost || 0 }], target, source);
			}
		} else if (e.type === 'summon-dragons-per-big-spell') {
			// Dragoncaller Alanna: a 5/5 Dragon for each 5+ Cost spell cast this game
			const n = state.players[pi].bigSpellsGame || 0;
			for (let i = 0; i < n; i++) summon(state, pi, { id: 'token_dragon_5_5', name: 'Dragon', type: 'creature', cost: 5, token: true, tribe: 'Dragon', rarity: 'common', attack: 5, health: 5, description: 'A 5/5 Dragon.' });
		} else if (e.type === 'discount-foreign-hand') {
			// Leyline Manipulator: cheaper for cards that didn't start in your deck
			const p = state.players[pi];
			for (const c of p.hand) if (!c.fromDeck && c !== source) c.cost = Math.max(0, (c.cost || 0) - (e.value || 2));
		} else if (e.type === 'set-next-battlecry-double') {
			// Murmuring Elemental: arm the next Battlecry this turn to fire twice
			state.players[pi].nextBattlecryDouble = true;
		} else if (e.type === 'gain-deathrattle-from-deck') {
			// Seeping Oozeling: copy the Deathrattle of a random creature in your deck
			const p = state.players[pi];
			const pool = [...new Set(p.deck)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && d.deathrattle && d.deathrattle.length);
			if (pool.length && source) {
				const pick = pool[Math.floor(state.rng() * pool.length)];
				source.deathrattle = [...(source.deathrattle || []), ...JSON.parse(JSON.stringify(pick.deathrattle))];
				if (!source.keywords.includes('deathrattle')) source.keywords.push('deathrattle');
			}
		} else if (e.type === 'return-destroyed-weapon') {
			// Rummaging Kobold: return a destroyed weapon from your graveyard to your hand
			const p = state.players[pi];
			const weps = p.graveyard.filter(c => c.type === 'weapon');
			if (weps.length && p.hand.length < MAX_HAND) {
				const w = weps[Math.floor(state.rng() * weps.length)];
				const def = state.cardsById[w.id] || w;
				const card = instantiate(def, pi); card.zone = 'hand'; p.hand.push(card);
				const gi = p.graveyard.indexOf(w); if (gi >= 0) p.graveyard.splice(gi, 1);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			}
		} else if (e.type === 'give-enemy-card') {
			// Hoarding Dragon: add copies of a card to each opponent's hand
			const def = state.cardsById[e.id];
			if (def) for (const o of enemies) {
				for (let i = 0; i < (e.count || 1); i++) {
					if (state.players[o].hand.length >= MAX_HAND) break;
					const card = instantiate(def, o); card.zone = 'hand'; state.players[o].hand.push(card);
					emit(state, { type: 'conjure', player: o, card, color: null });
				}
			}
		} else if (e.type === 'summon-random-armor-cost') {
			// Geosculptor Yip: summon a random creature costing exactly your Armor (cap 10)
			const cost = Math.min(e.max ?? 10, state.players[pi].armor || 0);
			execEffects(state, pi, [{ type: 'summon-random', cost }], target, source);
		} else if (e.type === 'gain-armor-per') {
			// Drywhisker Armorer: gain Armor scaled by a count
			let n = 0;
			if (e.per === 'enemy-creatures') for (const o of enemies) n += state.players[o].board.filter(c => !isDead(c) && c.type !== 'location').length;
			if (n > 0) gainArmor(state, pi, (e.value || 1) * n);
		} else if (e.type === 'equip-id') {
			// Medivh: equip a specific weapon card (keeps its ongoing, e.g. Atiesh)
			const p = state.players[pi];
			const def = state.cardsById[e.id];
			if (def && !p.eliminated) {
				if (p.weapon) breakWeapon(state, pi, true);
				const w = instantiate(def, pi); w.zone = 'weapon'; p.weapon = w;
				emit(state, { type: 'weaponEquip', player: pi, card: w });
				fireOngoing(state, pi, 'weapon-equipped');
			}
		} else if (e.type === 'discount-other-class-hand') {
			// Ethereal Peddler: cards in hand from another class cost less
			const p = state.players[pi];
			const mine = p.heroClass;
			for (const c of p.hand) {
				const cc = c.cardClass || 'neutral';
				if (cc !== 'neutral' && cc !== mine && !cc.split('__').includes(mine)) c.cost = Math.max(0, (c.cost || 0) - (e.amount || 2));
			}
		} else if (e.type === 'shuffle-random-legendaries') {
			// Prince Malchezaar: shuffle N random Legendary creatures into your deck
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && d.rarity === 'legendary'
				&& !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			for (let n = 0; n < (e.count || 1) && pool.length; n++) {
				p.deck.push(pool[Math.floor(state.rng() * pool.length)].id);
			}
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'shuffledIntoDeck', player: pi, count: e.count || 1 });
		} else if (e.type === 'draw-transform-to-chicken') {
			// Gnomish Experimenter: draw a card; if it's a creature, make it a 1/1 Chicken
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			drawCards(state, pi, 1);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn && drawn.type === 'creature') {
				drawn.id = 'token_chicken'; drawn.name = 'Chicken'; drawn.attack = 1; drawn.maxHealth = 1;
				drawn.cost = 0; drawn.keywords = []; drawn.tribe = 'Beast'; drawn.effects = null; drawn.ongoing = null; drawn.deathrattle = null;
				emit(state, { type: 'transformed', uid: drawn.uid, player: pi, from: 'card', card: drawn });
			}
		} else if (e.type === 'mimiron-assemble') {
			// Mimiron's Head: if you have 3+ Mechs, destroy them and form V-07-TR-0N
			const p = state.players[pi];
			const mechs = p.board.filter(c => !isDead(c) && (c.tribe || '').includes('Mech'));
			if (mechs.length >= 3) {
				for (const m of mechs) { m.damage = m.maxHealth; m.shield = false; emit(state, { type: 'destroy', uid: m.uid }); }
				sweepDeaths(state);
				summon(state, pi, { id: 'token_v07tr0n', name: 'V-07-TR-0N', type: 'creature', cost: 0, rarity: 'legendary',
					token: true, tribe: 'Mech', attack: 7, health: 8, keywords: ['charge', 'windfury'], description: 'A 7/8 Mech with Charge and Windfury.' });
			}
		} else if (e.type === 'hero-power-free-game') {
			// Raza the Chained
			state.players[pi].heroPowerFreeGame = true;
		} else if (e.type === 'next-murloc-free') {
			state.players[pi].nextMurlocFree = true; // Seadevil Stinger
		} else if (e.type === 'next-secret-cost') {
			state.players[pi].nextSecretCost = e.value != null ? e.value : 1; // Kabal Lackey
		} else if (e.type === 'create-kazakus-potion') {
			// Kazakus: a random custom-style potion into your hand
			const potions = ['kazakus_potion_a', 'kazakus_potion_b', 'kazakus_potion_c'];
			const id = potions[Math.floor(state.rng() * potions.length)];
			const p = state.players[pi];
			if (state.cardsById[id] && p.hand.length < MAX_HAND) { const c = instantiate(state.cardsById[id], pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); }
		} else if (e.type === 'transform-self-random-cost') {
			// Lotus Illusionist: become a random creature of a given Cost
			if (source && source.zone === 'board' && !isDead(source)) {
				const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === e.cost
					&& !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length) && d.id !== source.id);
				if (pool.length) {
					const rd = pool[Math.floor(state.rng() * pool.length)];
					const tok = instantiate({ id: 'token_' + rd.id, name: rd.name, type: 'creature', cost: 0, rarity: 'common', token: true,
						tribe: rd.tribe, description: rd.description, attack: rd.attack, health: rd.health, keywords: rd.keywords || [] }, source.controller);
					tok.zone = 'board'; tok.sick = source.sick;
					const board = state.players[source.controller].board;
					board[board.indexOf(source)] = tok; source.zone = 'gone';
					emit(state, { type: 'transformed', uid: source.uid, player: source.controller, from: source.name, card: tok });
					recomputeAuras(state);
				}
			}
		} else if (e.type === 'free-next-spell') {
			// Inkmaster Solia: the next spell this turn costs (0)
			state.players[pi].freeSpellsThisTurn = true;
		} else if (e.type === 'refresh-mana') {
			// Kun the Forgotten King: refill your Mana Crystals
			const p = state.players[pi];
			p.mana.cur = p.mana.max;
			emit(state, { type: 'manaGained', player: pi });
		} else if (e.type === 'draw-until') {
			// Wrathion: keep drawing until you draw a card that isn't the given tribe
			const p = state.players[pi];
			let guard = 0;
			while (guard++ < 40 && p.hand.length < MAX_HAND) {
				const before = p.hand.length;
				drawCards(state, pi, 1);
				if (p.hand.length === before) break; // fatigue / empty
				const drawn = p.hand[p.hand.length - 1];
				if (!(drawn.type === 'creature' && (drawn.tribe || '').includes(e.exceptTribe))) break;
			}
		} else if (e.type === 'copy-to-deck') {
			// Manic Soulcaster: shuffle a copy of a chosen friendly creature into your deck
			const t = chosenCreature();
			const p = state.players[pi];
			if (t && state.cardsById[t.id]) {
				const elekk = p.board.filter(c => c.id === 'augmented_elekk' && !isDead(c)).length; // Augmented Elekk: an extra copy per shuffle
				const total = (e.count || 1) * (1 + elekk);
				for (let n = 0; n < total; n++) p.deck.push(t.id);
				for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
				emit(state, { type: 'shuffledIntoDeck', player: pi, cardId: t.id }); fireOngoing(state, pi, 'card-shuffled', { cardId: t.id });
			}
		} else if (e.type === 'summon-copies-from-deck') {
			// Madam Goya: summon every copy of a chosen friendly creature from your deck
			const t = chosenCreature();
			const p = state.players[pi];
			if (t) {
				const rest = [];
				for (const id of p.deck) { if (id === t.id) summon(state, pi, state.cardsById[id]); else rest.push(id); }
				p.deck = rest;
			}
		} else if (e.type === 'enemy-summon-from-hand') {
			// Dirty Rat: each opponent puts a random creature from their hand into play
			for (const o of enemies) {
				const op = state.players[o];
				const pool = op.hand.filter(c => c.type === 'creature');
				if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; op.hand = op.hand.filter(x => x !== c); c.zone = 'board'; op.board.push(c); emit(state, { type: 'summon', player: o, card: c }); fireOngoing(state, o, 'summoned', { minion: c }); }
			}
			recomputeAuras(state);
		} else if (e.type === 'draw-both-to') {
			// Genzo, the Shark: every player draws until they have N cards
			for (let s3 = 0; s3 < state.players.length; s3++) {
				const pl = state.players[s3];
				let guard = 0;
				while (pl.hand.length < (e.value || 3) && guard++ < 20) { const before = pl.hand.length; drawCards(state, s3, 1); if (pl.hand.length === before) break; }
			}
		} else if (e.type === 'summon-from-deck-tribe') {
			// Finja: summon N creatures of a tribe from your deck onto the battlefield
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 1); n++) {
				const idx = p.deck.findIndex(id => { const def = state.cardsById[id]; return def?.type === 'creature' && !def.token && (!e.tribe || (def.tribe || '').includes(e.tribe)); });
				if (idx < 0) break;
				const [id] = p.deck.splice(idx, 1);
				summon(state, pi, state.cardsById[id]);
			}
		} else if (e.type === 'summon-from-deck-weaker') {
			// Meat Wagon: summon a creature from your deck with less Attack than this one
			const p = state.players[pi];
			const cap = source ? source.attack : (e.maxAttack ?? 0);
			for (let n = 0; n < (e.count || 1); n++) {
				const idx = p.deck.findIndex(id => { const def = state.cardsById[id]; return def?.type === 'creature' && !def.token && (def.attack || 0) < cap; });
				if (idx < 0) break;
				const [id] = p.deck.splice(idx, 1);
				summon(state, pi, state.cardsById[id]);
			}
		} else if (e.type === 'summon-died-this-game') {
			// Hadronox (Taunt) / Abominable Bowman (Beast, random): resummon fallen friendlies
			const p = state.players[pi];
			let ids = p.deathLogIds.filter(id => {
				const def = state.cardsById[id];
				if (!def || def.type !== 'creature') return false;
				if (e.keyword && !(def.keywords || []).includes(e.keyword)) return false;
				if (e.tribe && !(def.tribe || '').includes(e.tribe)) return false;
				return true;
			});
			if (e.random) { if (ids.length) ids = [ids[Math.floor(state.rng() * ids.length)]]; else ids = []; }
			for (const id of ids) summon(state, pi, state.cardsById[id]);
		} else if (e.type === 'add-random-died') {
			// Tomb Lurker: add a random creature (optionally with a keyword) that died this game to your hand
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].filter(id => {
				const def = state.cardsById[id];
				return def?.type === 'creature' && (!e.keyword || (def.keywords || []).includes(e.keyword));
			});
			if (pool.length && p.hand.length < MAX_HAND) {
				const def = state.cardsById[pool[Math.floor(state.rng() * pool.length)]];
				const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
		} else if (e.type === 'install-random-secret') {
			// Professor Putricide: install a random secret (optionally of a class)
			const installed = new Set(state.players[pi].secrets.map(s => s.id));
			const pool = Object.values(state.cardsById).filter(d => d.secret && !d.token
				&& d.collectible !== false && !(d.colors && d.colors.length)
				&& (!e.cardClass || (d.cardClass || 'neutral') === e.cardClass)
				&& !installed.has(d.id));
			if (pool.length) installSecret(state, pi, pool[Math.floor(state.rng() * pool.length)].id);
		} else if (e.type === 'destroy-cost-spells') {
			// Skulking Geist: destroy all spells of a given cost in every hand and deck
			for (const pl of state.players) {
				pl.hand = pl.hand.filter(c => !(isSpellType(c) && (c.cost || 0) === e.value));
				pl.deck = pl.deck.filter(id => { const def = state.cardsById[id]; return !(def && isSpellType(def) && (def.cost || 0) === e.value); });
			}
			emit(state, { type: 'skulk', value: e.value });
		} else if (e.type === 'copy-enemy-deck') {
			// Archbishop Benedictus: shuffle a copy of your opponent's deck into your deck
			const foe = enemies[0];
			if (foe != null) {
				const p = state.players[pi];
				for (const id of state.players[foe].deck) p.deck.push(id);
				for (let k = p.deck.length - 1; k > 0; k--) { const j = Math.floor(state.rng() * (k + 1)); [p.deck[k], p.deck[j]] = [p.deck[j], p.deck[k]]; }
			}
		} else if (e.type === 'add-random-lich-king') {
			// The Lich King: add a random Lich King card to your hand
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.lichKingCard);
			if (pool.length && p.hand.length < MAX_HAND) {
				const c = instantiate(pool[Math.floor(state.rng() * pool.length)], pi);
				c.zone = 'hand'; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
		} else if (e.type === 'damage-per-cards-played') {
			// Spectral Pillager: deal `value` to a chosen creature for each OTHER card played this turn
			const t = chosenCreature();
			const n = state.players[pi].cardsPlayedThisTurn || 0;
			if (t && n > 0) damageCreature(state, t, (e.value || 1) * n, source);
		} else if (e.type === 'give-attack-to-random-friendly') {
			// Fiendish Servant: hand this minion's Attack to a random friendly minion
			const atk = source ? (source.attack || 0) : 0;
			const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location');
			if (atk > 0 && pool.length) buffCreature(pool[Math.floor(state.rng() * pool.length)], atk, 0);
		} else if (e.type === 'damage-all-minions') {
			// Risky Skipper: deal `value` to every minion on both sides
			// (exceptSource omits the caster — Shattered Rumbler: "all OTHER minions";
			//  exceptTribe skips a tribe — Fire Breather: "except Demons")
			const dv = e.valueFromHandSize ? state.players[pi].hand.length : (e.value || 1); // Entitled Customer
			for (const pl of state.players) for (const c of [...pl.board]) if (!isDead(c) && c.type !== 'location' && !(e.exceptSource && c === source) && !(e.exceptTribe && (c.tribe || '').includes(e.exceptTribe))) damageCreature(state, c, dv, source);
			sweepDeaths(state);
		} else if (e.type === 'damage-target-by-attack') {
			// Aeon Reaver: deal damage to a minion equal to its own Attack
			const t = chosenCreature();
			if (t) damageCreature(state, t, t.attack || 0, source);
		} else if (e.type === 'tax-enemy-battlecry') {
			// Boompistol Bully: enemy Battlecry cards cost more next turn
			for (const o of enemies) state.players[o].battlecryTaxNext = (state.players[o].battlecryTaxNext || 0) + (e.value || 5);
		} else if (e.type === 'summon-copy-self') {
			// Animated Avalanche: summon a copy of this minion (count copies — Zixor Prime)
			if (source) { const base = state.cardsById[source.id]; if (base) for (let n = 0; n < (e.count || 1); n++) summon(state, pi, JSON.parse(JSON.stringify(base))); }
		} else if (e.type === 'reduce-libram-cost') {
			// Aldor Attendant / Aldor Truthseeker: your Librams cost less this game
			state.players[pi].libramDiscount = (state.players[pi].libramDiscount || 0) + (e.value || 1);
		} else if (e.type === 'buff-random-hand-tribe') {
			// Helboar: give a random matching minion in your hand +attack/+health
			const pool = state.players[pi].hand.filter(c => c.type === 'creature' && (c.tribe || '').includes(e.tribe));
			if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)]; t.attack = (t.attack || 0) + (e.attack || 0); t.maxHealth = (t.maxHealth || 0) + (e.health || 0); t.health = (t.health || 0) + (e.health || 0); }
		} else if (e.type === 'attack-random-enemy') {
			// Imprisoned Felmaw: on awaken, attack a random enemy character
			if (source && !isDead(source)) {
				const foes = [];
				for (const o of enemies) { for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location' && !c.stealthed && c.dormantLeft <= 0) foes.push({ type: 'creature', uid: c.uid, player: o }); foes.push({ type: 'hero', player: o }); }
				if (foes.length) resolveCombat(state, pi, source.uid, foes[Math.floor(state.rng() * foes.length)]);
			}
		} else if (e.type === 'grant-immune-turn') {
			// Ashtongue Slayer: give a minion Immune until end of turn (target 'self' = source, Kurtrus Outcast)
			const t = e.target === 'self' ? (source && source.zone === 'board' && !isDead(source) ? source : null) : chosenCreature();
			if (t) { if (!t.keywords.includes(KW.IMMUNE)) t.keywords.push(KW.IMMUNE); t.immuneTurnClear = true; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
		} else if (e.type === 'summon-died-tribe') {
			// Kanrethad Prime: resummon friendly minions of a tribe that died this game
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && (d.tribe || '').includes(e.tribe));
			for (let i = 0; i < (e.count || 1) && pool.length; i++) summon(state, pi, pool[Math.floor(state.rng() * pool.length)]);
		} else if (e.type === 'summon-with-source-stats') {
			// Blistering Rot: summon a token with stats equal to the source minion
			if (source) { const a = source.attack || 0, h = hp(source) || 1; const tok = summon(state, pi, { id: e.id || 'token_rot', name: e.name || 'Rot', type: 'creature', cost: 0, token: true, rarity: 'common', attack: a, health: h, description: `A ${a}/${h} token.` }); }
		} else if (e.type === 'buff-random-friendly') {
			// Dragonmaw Overseer: buff a random OTHER friendly minion
			const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location');
			if (pool.length) buffCreature(pool[Math.floor(state.rng() * pool.length)], e.attack || 0, e.health || 0);
		} else if (e.type === 'reduce-random-hand-cost') {
			// Imprisoned Satyr: reduce the Cost of a random minion in your hand
			// (tribe filter -> Fangbound Druid reduces a Beast; school -> Florist reduces a Nature spell)
			const pool = e.school
				? state.players[pi].hand.filter(c => schoolOf(c) === e.school)
				: e.anyCard
				? state.players[pi].hand.filter(c => c !== source) // Two-Faced Investor
				: state.players[pi].hand.filter(c => c.type === 'creature' && (!e.tribe || (c.tribe || '').includes(e.tribe)));
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.cost = Math.max(0, (c.cost || 0) - (e.value || 1)); }
		} else if (e.type === 'add-spells-on-friendly-to-hand') {
			// Lady Liadrin: add a copy of each spell you cast on friendly characters this game
			const p = state.players[pi];
			for (const id of p.spellsOnFriendly || []) {
				const def = state.cardsById[id];
				if (!def || p.hand.length >= MAX_HAND) continue;
				const card = instantiate(def, pi); card.zone = 'hand'; p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			}
		} else if (e.type === 'spells-cost-one') {
			// Ysiel Windsinger: your spells cost (1) this turn
			state.players[pi].spellsCostOneThisTurn = true;
		} else if (e.type === 'damage-chain-neighbors') {
			// The Lurker Below: deal damage to an enemy minion; if it dies, hit a neighbor, repeat
			let t = chosenCreature();
			let guard = 12;
			while (t && !isDead(t) && guard-- > 0) {
				const owner = state.players[t.controller];
				const idx = owner.board.indexOf(t);
				damageCreature(state, t, e.value || 3, source);
				if (!isDead(t)) break;
				// pick a living neighbor of the one that just died
				const neighbors = [owner.board[idx - 1], owner.board[idx + 1]].filter(c => c && !isDead(c) && c.type !== 'location');
				t = neighbors.length ? neighbors[Math.floor(state.rng() * neighbors.length)] : null;
			}
			sweepDeaths(state);
		} else if (e.type === 'kelidan') {
			// Keli'dan the Breaker: destroy a minion; if drawn this turn, destroy all others instead
			if (source && source.drawnThisTurn) {
				for (const pl of state.players) for (const c of [...pl.board]) if (c !== source && !isDead(c) && c.type !== 'location') { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
				sweepDeaths(state);
			} else {
				const t = chosenCreature();
				if (t) { t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state); }
			}
		} else if (e.type === 'set-stats-to-highest') {
			// Argent Braggart: set this minion's Attack and Health to the highest on the board
			if (source) {
				let hiA = 0, hiH = 0;
				for (const pl of state.players) for (const c of pl.board) { if (isDead(c) || c.type === 'location') continue; hiA = Math.max(hiA, c.attack || 0); hiH = Math.max(hiH, hp(c) || 0); }
				source.attack = Math.max(source.attack || 0, hiA);
				source.maxHealth = Math.max(hp(source), hiH); source.damage = 0;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
		} else if (e.type === 'shuffle-soul-fragments') {
			// Spirit Jailer / etc: shuffle N Soul Fragments into your deck
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 2); n++) p.deck.push('sch_soul_fragment');
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'shuffle', player: pi });
		} else if (e.type === 'destroy-fragment-then-damage') {
			// Shadowlight Scholar: destroy a Soul Fragment in your deck to deal damage
			const p = state.players[pi];
			const fi = p.deck.indexOf('sch_soul_fragment');
			if (fi >= 0) {
				p.deck.splice(fi, 1);
				healHero(state, pi, 2); // destroying a Soul Fragment restores 2 Health
				const t = chosenCreature() || (target && target.type === 'hero' ? target : null);
				if (target && target.type === 'hero') damageHero(state, target.player, e.value || 3, pi);
				else if (t) damageCreature(state, t, e.value || 3, source);
				sweepDeaths(state);
			}
		} else if (e.type === 'swap-hand-with-enemy') {
			// Mindrender Illucia: replace your hand with a copy of your opponent's until end of turn
			const foe = enemies[0];
			if (foe != null && !source?._illuciaDone) {
				const p = state.players[pi];
				p.savedHand = p.hand;
				p.hand = state.players[foe].hand.map(c => { const def = state.cardsById[c.id]; const nc = def ? instantiate(def, pi) : JSON.parse(JSON.stringify(c)); nc.zone = 'hand'; return nc; });
				p.illuciaSwap = true;
				emit(state, { type: 'handSwap', player: pi });
			}
		} else if (e.type === 'set-combo-discount') {
			// Foxy Fraud: your next Combo card this turn costs less
			state.players[pi].nextComboDiscount = (state.players[pi].nextComboDiscount || 0) + (e.value || 2);
		} else if (e.type === 'set-next-cards-discount') {
			// Scabbs Cutterbutter: your next N cards this turn cost less
			state.players[pi].nextCardsDiscount = { count: e.count || 2, amount: e.value || 2 };
		} else if (e.type === 'silence-all') {
			// Showstopper: Silence every minion on the board
			for (const pl of state.players) for (const c of pl.board) if (!isDead(c) && c.type !== 'location') silenceCreature(state, c);
		} else if (e.type === 'shuffle-lowest-hand-into-deck') {
			// Safety Inspector: shuffle the lowest-Cost card from your hand into your deck
			const p = state.players[pi];
			const pool = p.hand.filter(c => c !== source);
			if (pool.length) {
				let lo = pool[0];
				for (const c of pool) if ((c.cost || 0) < (lo.cost || 0)) lo = c;
				p.hand = p.hand.filter(c => c !== lo);
				if (!lo.token && state.cardsById[lo.id]) { p.deck.push(lo.id); for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; } }
				emit(state, { type: 'shuffle', player: pi });
			}
		} else if (e.type === 'hero-attack') {
			// give your hero +N Attack this turn (Soulshard Lapidary)
			state.players[pi].heroTempAttack += e.value || 0;
			emit(state, { type: 'heroAttack', player: pi, attack: heroAttackValue(state.players[pi]) });
			if ((e.value || 0) > 0) fireOngoing(state, pi, 'hero-gained-attack', {}); // Wickerclaw
		} else if (e.type === 'destroy-soul-fragment') {
			// generic: destroy a Soul Fragment in your deck (heals 2), then run `then`
			const p = state.players[pi];
			const fi = p.deck.indexOf('sch_soul_fragment');
			if (fi >= 0) { p.deck.splice(fi, 1); healHero(state, pi, 2); if (e.then) execEffects(state, pi, e.then, target, source); }
		} else if (e.type === 'jandice-barov') {
			// Jandice Barov: summon two random 5-Cost minions; one secretly dies when damaged
			const before = state.players[pi].board.length;
			execEffects(state, pi, [{ type: 'summon-random', cost: 5, count: 2 }], null, source);
			const fresh = state.players[pi].board.slice(before).filter(c => !isDead(c));
			if (fresh.length) fresh[Math.floor(state.rng() * fresh.length)].diesOnDamage = true;
		} else if (e.type === 'vectus') {
			// Vectus: summon two 1/1 Whelps, each gains a Deathrattle from a minion that died this game
			const drPool = [...new Set(state.players[pi].deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.deathrattle && d.deathrattle.length);
			for (let n = 0; n < 2; n++) {
				const c = summon(state, pi, { id: 'sch_whelp', name: 'Whelp', type: 'creature', cost: 1, token: true, rarity: 'common', tribe: 'Dragon', attack: 1, health: 1, description: 'A 1/1 Whelp.' });
				if (c && drPool.length) { const d = drPool[Math.floor(state.rng() * drPool.length)]; c.deathrattle = JSON.parse(JSON.stringify(d.deathrattle)); if (!c.keywords.includes('deathrattle')) c.keywords.push('deathrattle'); }
			}
		} else if (e.type === 'summon-per-fragment') {
			// Soulciologist Malicia: for each Soul Fragment in your deck, summon a token
			const p = state.players[pi];
			const n = p.deck.filter(id => id === 'sch_soul_fragment').length;
			for (let i = 0; i < n; i++) summon(state, pi, { id: e.summonId || 'sch_soul', name: e.name || 'Soul', type: 'creature', cost: 3, token: true, rarity: 'common', attack: 3, health: 3, keywords: ['rush'], description: 'Rush.' });
		} else if (e.type === 'resummon-self-diminished') {
			// Rattlegore: resummon this minion with -1/-1 (recurses down to 1/1)
			if (source) {
				const na = (source.attack || 0) - 1, nh = (source.maxHealth || 0) - 1;
				if (na > 0 && nh > 0) {
					const base = state.cardsById[source.id] || {};
					const def = { id: 'token_' + source.id, name: source.name, type: 'creature', cost: source.cost || 0, token: true, rarity: base.rarity || 'legendary', tribe: source.tribe || null, attack: na, health: nh, keywords: [...(base.keywords || [])].filter(k => k !== 'deathrattle'), description: source.name, deathrattle: [{ type: 'resummon-self-diminished' }] };
					if (!def.keywords.includes('deathrattle')) def.keywords.push('deathrattle');
					summon(state, pi, def);
				}
			}
		} else if (e.type === 'draw-stilt-reward') {
			// Stiltstepper: draw a card; if you play it this turn, give your hero +N Attack
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			drawCards(state, pi, 1);
			for (const c of p.hand) if (!before.has(c.uid)) c.stiltReward = e.value || 4;
		} else if (e.type === 'draw-edwin-reward') {
			// Edwin, Defias Kingpin: draw a card; if you play it this turn, buff this +N/+N
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			drawCards(state, pi, 1);
			for (const c of p.hand) if (!before.has(c.uid)) { c.edwinReward = e.value || 2; c.edwinUid = source ? source.uid : null; }
		} else if (e.type === 'transform-deck-tribe') {
			// Lady Prestor: transform minions in your deck into random `tribe` (keep Cost)
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.tribe || '').includes(e.tribe) && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (pool.length) p.deck = p.deck.map(id => { const d = state.cardsById[id]; if (!d || d.type !== 'creature') return id; const cands = pool.filter(x => (x.cost || 0) === (d.cost || 0)); return cands.length ? cands[Math.floor(state.rng() * cands.length)].id : pool[Math.floor(state.rng() * pool.length)].id; });
		} else if (e.type === 'cast-all-fel') {
			// Jace Darkweaver: cast all Fel spells you've played this game
			for (const id of [...(state.players[pi].felSpellsGame || [])]) {
				const def = state.cardsById[id]; if (!def) continue;
				const spell = instantiate(def, pi);
				const spec = targetSpec(state, pi, spell, null);
				let tgt = null; if (spec) { const legal = legalTargets(state, pi, spec); const enemyT = legal.find(t => t.player !== pi); tgt = enemyT || (legal.length ? legal[Math.floor(state.rng() * legal.length)] : null); }
				emit(state, { type: 'conjure', player: pi, card: spell, color: null });
				runSpell(state, pi, spell, tgt, null); sweepDeaths(state);
			}
		} else if (e.type === 'repeat-big-spell') {
			// Grey Sage Parrot: repeat the last spell you cast that costs (6) or more
			const lb = state.players[pi].lastBigSpell;
			const def = lb && state.cardsById[lb.id];
			if (def) { const spell = instantiate(def, pi); const spec = targetSpec(state, pi, spell, null); let tgt = lb.target; if (spec && (!tgt || !legalTargets(state, pi, spec).some(t => t.uid === tgt.uid))) { const legal = legalTargets(state, pi, spec); tgt = legal.length ? legal[Math.floor(state.rng() * legal.length)] : null; } emit(state, { type: 'conjure', player: pi, card: spell, color: null }); runSpell(state, pi, spell, tgt, null); sweepDeaths(state); }
		} else if (e.type === 'cast-highest-hand-spell') {
			// Clumsy Courier: cast the highest-Cost spell from your hand (random target)
			const p = state.players[pi];
			let best = null; for (const c of p.hand) if (isSpellType(c) && (!best || (c.cost || 0) > (best.cost || 0))) best = c;
			if (best) { p.hand = p.hand.filter(c => c !== best); const spec = targetSpec(state, pi, best, null); let tgt = null; if (spec) { const legal = legalTargets(state, pi, spec); tgt = legal.length ? legal[Math.floor(state.rng() * legal.length)] : null; } emit(state, { type: 'conjure', player: pi, card: best, color: null }); runSpell(state, pi, best, tgt, null); sweepDeaths(state); }
		} else if (e.type === 'lothar') {
			// Lothar: attack a random enemy minion; if it dies, gain +3/+3
			if (source && !isDead(source)) {
				const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location' && !c.stealthed && c.dormantLeft <= 0).map(c => ({ o, c })));
				if (pool.length) { const { o, c } = pool[Math.floor(state.rng() * pool.length)]; resolveCombat(state, pi, source.uid, { type: 'creature', uid: c.uid, player: o }); if (isDead(c) && !isDead(source)) buffCreature(source, e.attack || 3, e.health || 3); }
			}
		} else if (e.type === 'varian') {
			// Varian: draw a Rush minion to gain Rush; repeat for Taunt and Divine Shield
			const p = state.players[pi];
			for (const kw of ['rush', 'taunt', 'divine_shield']) {
				const before = new Set(p.hand.map(c => c.uid));
				execEffects(state, pi, [{ type: 'tutor', cardType: 'creature', requireKeyword: kw, count: 1 }], null, source);
				const drawn = p.hand.find(c => !before.has(c.uid));
				if (drawn && source && !isDead(source) && !source.keywords.includes(kw)) { source.keywords.push(kw); if (kw === 'divine_shield') source.shield = true; }
			}
		} else if (e.type === 'swap-attack-extremes') {
			// Wealth Redistributor: swap the Attack of the highest- and lowest-Attack minions
			const all = state.players.flatMap(pl => pl.board.filter(c => !isDead(c) && c.type !== 'location'));
			if (all.length >= 2) {
				let hi = all[0], lo = all[0];
				for (const c of all) { if (c.attack > hi.attack) hi = c; if (c.attack < lo.attack) lo = c; }
				if (hi !== lo) { const t = hi.attack; hi.attack = lo.attack; lo.attack = t; emit(state, { type: 'buff', uid: hi.uid, attack: hi.attack, hp: hp(hi) }); emit(state, { type: 'buff', uid: lo.uid, attack: lo.attack, hp: hp(lo) }); }
			}
		} else if (e.type === 'cast-last-onfriendly-on-self') {
			// Sunwing Squawker: recast the last spell you cast on a friendly minion, on this
			const p = state.players[pi];
			const ids = p.spellsOnFriendly || [];
			const id = ids[ids.length - 1];
			const def = id && state.cardsById[id];
			if (def && def.effects && source && source.zone === 'board' && !isDead(source)) {
				execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), { type: 'creature', uid: source.uid, player: pi }, source);
			}
		} else if (e.type === 'draw-spell-armor') {
			// Deepwater Evoker: draw a spell, gain Armor equal to its Cost
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'spell', count: 1 }], target, source);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn) gainArmor(state, pi, drawn.cost || 0);
		} else if (e.type === 'draw-spell-selfdamage') {
			// Hullbreaker: draw a spell, your hero takes damage equal to its Cost
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'spell', count: 1 }], target, source);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn && (drawn.cost || 0) > 0) damageHero(state, pi, drawn.cost || 0, pi);
		} else if (e.type === 'draw-per-schools') {
			// Multicaster: draw a card for each different spell school cast this game
			const n = Object.keys(state.players[pi].schoolsCastGame || {}).length;
			if (n > 0) drawCards(state, pi, n);
		} else if (e.type === 'copy-last-deathrattle-died') {
			// Monstrous Parrot: add a copy of the last friendly Deathrattle minion that died
			const p = state.players[pi];
			const id = p.lastDeathrattleDied;
			if (id && state.cardsById[id] && p.hand.length < MAX_HAND) { const nc = instantiate(state.cardsById[id], pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); }
		} else if (e.type === 'buff-hand-minions') {
			// Alliance Bannerman: give minions in your hand +X/+X
			for (const c of state.players[pi].hand) if (c.type === 'creature') { c.attack += e.attack || 0; c.maxHealth += e.health || 0; }
		} else if (e.type === 'set-next-draw-discount') {
			// SI:7 Skulker: the next card you draw costs less
			state.players[pi].nextDrawDiscount = (state.players[pi].nextDrawDiscount || 0) + (e.value || 1);
		} else if (e.type === 'set-cast-when-drawn') {
			// Sheldras Moontree: the next N spells you draw are Cast When Drawn
			state.players[pi].castWhenDrawn = (state.players[pi].castWhenDrawn || 0) + (e.value || 3);
		} else if (e.type === 'damage-flanks') {
			// Crow's Nest Lookout: deal damage to the left- and right-most enemy minions
			for (const o of enemies) { const board = state.players[o].board.filter(c => !isDead(c) && c.type !== 'location'); const targets = [...new Set([board[0], board[board.length - 1]])].filter(Boolean); for (const t of targets) damageCreature(state, t, e.value || 2, source); }
			sweepDeaths(state);
		} else if (e.type === 'copy-random-hand-card') {
			// Nobleman: create a copy of a random card in your hand
			const p = state.players[pi];
			const pool = p.hand.filter(c => c !== source && state.cardsById[c.id]);
			if (pool.length && p.hand.length < MAX_HAND) { const src = pool[Math.floor(state.rng() * pool.length)]; const nc = instantiate(state.cardsById[src.id], pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); }
		} else if (e.type === 'shuffle-copies-of-target') {
			// Northshire Farmer: shuffle N stat-set copies of a chosen friendly into your deck
			const t = chosenCreature();
			if (t) { const p = state.players[pi]; for (let i = 0; i < (e.count || 3); i++) p.deck.push(t.id); for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; } emit(state, { type: 'shuffle', player: pi }); }
		} else if (e.type === 'store-deck-card') {
			// Enthusiastic Banker: move a card from your deck onto this minion's stash
			if (source && state.players[pi].deck.length) { const id = state.players[pi].deck.pop(); (source.storedCards = source.storedCards || []).push(id); }
		} else if (e.type === 'add-stored-cards') {
			// Enthusiastic Banker deathrattle: add the stashed cards to your hand
			const p = state.players[pi];
			for (const id of (source && source.storedCards) || []) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[id]; if (!def) continue; const nc = instantiate(def, pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); }
		} else if (e.type === 'arm-copycat') {
			// Copycat: arm to copy the next card the opponent plays
			for (const o of enemies) state.players[o].copycatFor = pi;
		} else if (e.type === 'repeat-last-battlecry') {
			// Brilliant Macaw: replay the last Battlecry you played
			const lb = state.players[pi].lastBattlecryThisGame;
			if (lb && lb.effects) execEffects(state, pi, JSON.parse(JSON.stringify(lb.effects)), lb.target || null, source);
		} else if (e.type === 'repeat-first-battlecry') {
			// Bolner Hammerbeak: replay the first Battlecry played this turn
			const fb = state.players[pi].firstBattlecryThisTurn;
			if (fb && fb.effects) execEffects(state, pi, JSON.parse(JSON.stringify(fb.effects)), fb.target || null, source);
		} else if (e.type === 'transform-self-into-token') {
			// Druid of the Plains (Frenzy): transform this minion into a fixed-stat token
			if (source && source.zone === 'board' && !isDead(source)) {
				const tok = instantiate({ id: 'token_' + (e.name || 'token').toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: e.name || 'Token', type: 'creature', cost: e.cost || 0, rarity: 'common', token: true, tribe: e.tribe || source.tribe || null, attack: e.attack, health: e.health, keywords: e.keywords || [], description: e.description || `A ${e.attack}/${e.health} token.` }, pi);
				tok.zone = 'board'; tok.sick = source.sick;
				const board = state.players[pi].board; board[board.indexOf(source)] = tok; source.zone = 'gone';
				emit(state, { type: 'transformed', uid: source.uid, player: pi, from: source.name, card: tok }); recomputeAuras(state);
			}
		} else if (e.type === 'swap-with-hand') {
			// Shadow Hunter Vol'jin: swap a chosen minion with a random one in its owner's hand
			const t = chosenCreature();
			if (t) {
				const owner = state.players[t.controller];
				const handMinions = owner.hand.filter(c => c.type === 'creature');
				if (handMinions.length) {
					const hm = handMinions[Math.floor(state.rng() * handMinions.length)];
					// board minion -> hand (as a fresh card), hand minion -> board
					const bi = owner.board.indexOf(t);
					const hi = owner.hand.indexOf(hm);
					owner.hand.splice(hi, 1);
					hm.zone = 'board'; hm.sick = true; owner.board[bi] = hm;
					const def = state.cardsById[t.id];
					if (def && owner.hand.length < MAX_HAND) { const nc = instantiate(def, t.controller); nc.zone = 'hand'; owner.hand.push(nc); }
					t.zone = 'gone';
					emit(state, { type: 'summon', player: t.controller, card: hm }); recomputeAuras(state);
				}
			}
		} else if (e.type === 'eat-enemy-hand-minion') {
			// Mutanus the Devourer: eat a random minion in the opponent's hand, gain its stats
			const foe = enemies[0];
			if (foe != null && source) {
				const pool = state.players[foe].hand.filter(c => c.type === 'creature');
				if (pool.length) { const m = pool[Math.floor(state.rng() * pool.length)]; state.players[foe].hand = state.players[foe].hand.filter(c => c !== m); buffCreature(source, m.attack || 0, hp(m) || 0); }
			}
		} else if (e.type === 'resurrect-frenzy') {
			// Overlord Saurfang: resurrect friendly minions that had Frenzy
			const p = state.players[pi];
			const isFrenzy = def => { const o = def.ongoing; const list = o ? [o] : []; if (def.ongoings) list.push(...def.ongoings); return list.some(t => t && t.on === 'self-damaged' && t.survives); };
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && isFrenzy(d));
			for (let i = 0; i < (e.count || 2) && pool.length; i++) summon(state, pi, pool[Math.floor(state.rng() * pool.length)]);
		} else if (e.type === 'equip-weapon-from-deck') {
			// Selfless Sidekick: equip a random weapon from your deck
			const p = state.players[pi];
			const idxs = p.deck.map((id, i) => [id, i]).filter(([id]) => state.cardsById[id]?.type === 'weapon');
			if (idxs.length) { const [id, di] = idxs[Math.floor(state.rng() * idxs.length)]; p.deck.splice(di, 1); if (p.weapon) breakWeapon(state, pi, true); const w = instantiate(state.cardsById[id], pi); w.zone = 'weapon'; p.weapon = w; emit(state, { type: 'weaponEquip', player: pi, card: w }); recomputeAuras(state); runBattlecry(state, pi, w, null); }
		} else if (e.type === 'primordial-protector') {
			// Primordial Protector: draw your highest-Cost spell, summon a random minion of that Cost
			const p = state.players[pi];
			let bestI = -1, bestC = -1;
			for (let i = 0; i < p.deck.length; i++) { const d = state.cardsById[p.deck[i]]; if (d && isSpellType(d) && (d.cost || 0) > bestC) { bestC = d.cost || 0; bestI = i; } }
			if (bestI >= 0) { const [id] = p.deck.splice(bestI, 1); const nc = instantiate(state.cardsById[id], pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); execEffects(state, pi, [{ type: 'summon-random', cost: bestC }], null, source); }
		} else if (e.type === 'varden') {
			// Varden Dawngrasp: freeze all enemy minions; already-frozen ones take damage instead
			for (const o of enemies) for (const c of [...state.players[o].board]) { if (isDead(c) || c.type === 'location') continue; if (c.frozen) damageCreature(state, c, e.value || 4, source); else freezeCreature(state, c); }
			sweepDeaths(state);
		} else if (e.type === 'damage-enemies-by-heal') {
			// Xyrella: deal damage to all enemy minions equal to Health restored this turn
			const amt = state.players[pi].healedAmountThisTurn || 0;
			if (amt > 0) { for (const o of enemies) for (const c of [...state.players[o].board]) if (!isDead(c) && c.type !== 'location') damageCreature(state, c, amt, source); sweepDeaths(state); }
		} else if (e.type === 'secrets-to-soldiers') {
			// Cannonmaster Smythe: transform your Secrets into 3/3 Soldiers
			const p = state.players[pi];
			const n = p.secrets.length; p.secrets = [];
			for (let i = 0; i < n; i++) summon(state, pi, { id: e.summonId || 'bar_soldier', name: e.name || 'Soldier', type: 'creature', cost: 3, token: true, rarity: 'common', attack: 3, health: 3, description: 'A 3/3 Soldier.' });
		} else if (e.type === 'enemy-draw') {
			// Southsea Scoundrel: the opponent also draws
			for (const o of enemies) drawCards(state, o, e.value || 1);
		} else if (e.type === 'damage-enemies-by-attack') {
			// Blademaster Samuro (Frenzy): deal damage = this minion's Attack to all enemy minions
			const amt = source ? (source.attack || 0) : 0;
			if (amt > 0) { for (const o of enemies) for (const c of [...state.players[o].board]) if (!isDead(c) && c.type !== 'location') damageCreature(state, c, amt, source); sweepDeaths(state); }
		} else if (e.type === 'reduce-hand-school-cost') {
			// Cariel Roame: reduce the Cost of a spell school in your hand
			for (const c of state.players[pi].hand) if (schoolOf(c) === e.school) c.cost = Math.max(0, (c.cost || 0) - (e.value || 1));
		} else if (e.type === 'attack-flanks') {
			// Kurtrus Ashfallen: attack the left- and right-most enemy minions
			if (source && !isDead(source)) {
				for (const o of enemies) {
					const board = state.players[o].board.filter(c => !isDead(c) && c.type !== 'location' && c.dormantLeft <= 0);
					const targets = [...new Set([board[0], board[board.length - 1]])].filter(Boolean);
					for (const t of targets) { if (!isDead(source) && !isDead(t)) resolveCombat(state, pi, source.uid, { type: 'creature', uid: t.uid, player: o }); }
				}
			}
		} else if (e.type === 'copy-enemy-secrets') {
			// Horde Operative: copy the opponent's Secrets and put them into play
			for (const o of enemies) for (const sec of [...state.players[o].secrets]) { if (state.players[pi].secrets.length < 5 && state.cardsById[sec.id]) installSecret(state, pi, sec.id); }
		} else if (e.type === 'draw-spell-school-then') {
			// Devout / Frostweave Dungeoneer: draw a spell; if it's a `school` spell, run `then` (bonus)
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'spell', count: 1 }], target, source);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn && schoolOf(drawn) === e.school) {
				if (e.discount) drawn.cost = Math.max(0, (drawn.cost || 0) - e.discount);
				if (e.then) execEffects(state, pi, e.then, target, source);
			}
		} else if (e.type === 'steal-until-bigger') {
			// Serena Bloodfeather: move 1/1 from the target to this until this is bigger
			const t = chosenCreature();
			if (t && source && !isDead(source)) {
				let guard = 40;
				while (guard-- > 0 && (source.attack <= t.attack || hp(source) <= hp(t)) && t.attack > 1 && hp(t) > 1) {
					t.attack -= 1; t.maxHealth -= 1;
					source.attack += 1; source.maxHealth += 1;
				}
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
		} else if (e.type === 'copy-hand-edges') {
			// Zai, the Incredible: add copies of the leftmost and rightmost cards in hand
			const p = state.players[pi];
			const others = p.hand.filter(c => c !== source);
			const picks = others.length ? [...new Set([others[0], others[others.length - 1]])] : [];
			for (const c of picks) { if (p.hand.length >= MAX_HAND) break; const inst = instantiate(state.cardsById[c.id] || c, pi); inst.zone = 'hand'; p.hand.push(inst); emit(state, { type: 'conjure', player: pi, card: inst, color: null }); }
		} else if (e.type === 'draw-minion-buff') {
			// Claw Machine: draw a minion and give it +X/+X
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'creature', count: 1 }], target, source);
			for (const c of p.hand) if (!before.has(c.uid) && c.type === 'creature') { c.attack += e.attack || 0; c.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
		} else if (e.type === 'draw-all-copies-random') {
			// Grand Empress Shek'zara: pick a random card in your deck, draw all copies of it
			const p = state.players[pi];
			if (p.deck.length) {
				const pickId = p.deck[Math.floor(state.rng() * p.deck.length)];
				let guard = 30;
				while (p.deck.includes(pickId) && p.hand.length < MAX_HAND && guard-- > 0) {
					const i = p.deck.indexOf(pickId); p.deck.splice(i, 1);
					const nc = instantiate(state.cardsById[pickId], pi); nc.zone = 'hand'; p.hand.push(nc);
					emit(state, { type: 'conjure', player: pi, card: nc, color: null });
				}
			}
		} else if (e.type === 'summon-from-deck-suicide') {
			// Maxima Blastenheimer: summon a minion from your deck; it attacks the enemy hero, then dies
			const p = state.players[pi];
			const idxs = p.deck.map((id, i) => [id, i]).filter(([id]) => state.cardsById[id]?.type === 'creature');
			if (idxs.length) {
				const [id, di] = idxs[Math.floor(state.rng() * idxs.length)];
				p.deck.splice(di, 1);
				const c = summon(state, pi, state.cardsById[id]);
				if (c) { const foe = enemies[0]; if (foe != null) resolveCombat(state, pi, c.uid, { type: 'hero', player: foe }); if (!isDead(c)) { c.damage = c.maxHealth; emit(state, { type: 'destroy', uid: c.uid }); sweepDeaths(state); } }
			}
		} else if (e.type === 'resurrect-per-tribe') {
			// N'Zoth, God of the Deep: resurrect one friendly dead minion of each tribe
			const p = state.players[pi];
			const seen = new Set();
			for (const id of p.deathLogIds) {
				const def = state.cardsById[id];
				if (!def || def.type !== 'creature') continue;
				const tribe = def.tribe || 'none';
				if (seen.has(tribe)) continue;
				seen.add(tribe);
				summon(state, pi, def);
			}
		} else if (e.type === 'readd-corrupted-free') {
			// Y'Shaarj, the Defiler: add a copy of each Corrupted card played this game, cost 0 this turn
			const p = state.players[pi];
			for (const id of p.corruptedPlayedIds || []) {
				if (p.hand.length >= MAX_HAND) break;
				const def = state.cardsById[id]; if (!def) continue;
				const nc = instantiate(def, pi); nc.zone = 'hand'; nc.cost = 0; nc.freeThisTurn = true; p.hand.push(nc);
				emit(state, { type: 'conjure', player: pi, card: nc, color: null });
			}
		} else if (e.type === 'cast-secret-from-hand') {
			// Sparkjoy Cheat: cast a Secret from your hand (install it), then run `then`
			const p = state.players[pi];
			const si = p.hand.findIndex(c => c.secret);
			if (si >= 0) { const [c] = p.hand.splice(si, 1); installSecret(state, pi, c.id); if (e.then) execEffects(state, pi, e.then, target, source); }
		} else if (e.type === 'become-copy-of-target') {
			// The Nameless One: become a set-stat copy of a chosen minion, then Silence it
			const t = chosenCreature();
			if (t && source && source.zone === 'board' && !isDead(source)) {
				const base = state.cardsById[t.id];
				if (base) {
					const def = JSON.parse(JSON.stringify(base));
					def.attack = e.stats ?? 4; def.health = e.stats ?? 4; def.token = true; def.id = 'token_' + base.id;
					const tok = instantiate(def, pi); tok.zone = 'board'; tok.sick = source.sick;
					const board = state.players[pi].board; board[board.indexOf(source)] = tok; source.zone = 'gone';
					emit(state, { type: 'transformed', uid: source.uid, player: pi, from: source.name, card: tok });
					silenceCreature(state, t);
					recomputeAuras(state);
				}
			}
		} else if (e.type === 'reduce-corrupt-cost') {
			// Dark Inquisitor Xanesh: your Corrupt/Corrupted cards cost less (hand now, deck on draw)
			const p = state.players[pi];
			for (const c of p.hand) if (c.corrupt || c.corruptGrow) c.cost = Math.max(0, (c.cost || 0) - (e.value || 2));
			p.corruptDeckDiscount = (p.corruptDeckDiscount || 0) + (e.value || 2);
		} else if (e.type === 'shuffle-random-primes') {
			// Envoy Rustwix: shuffle N random Prime Legendary minions into your deck
			const primes = Object.values(state.cardsById).filter(d => typeof d.id === 'string' && d.id.endsWith('_prime') && d.type === 'creature');
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 3) && primes.length; n++) p.deck.push(primes[Math.floor(state.rng() * primes.length)].id);
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'shuffle', player: pi });
		} else if (e.type === 'grant-deathrattle-random') {
			// Greybough: give a random friendly minion a Deathrattle
			const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location');
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.deathrattle = (c.deathrattle || []).concat(JSON.parse(JSON.stringify(e.effects))); if (!c.keywords.includes('deathrattle')) c.keywords.push('deathrattle'); }
		} else if (e.type === 'buff-all-tribe') {
			// Grand Totem Eys'or: +X/+X to a tribe in hand, deck and battlefield
			const p = state.players[pi];
			for (const c of p.board) if (c !== source && !isDead(c) && c.type !== 'location' && (c.tribe || '').includes(e.tribe)) buffCreature(c, e.attack || 0, e.health || 0);
			for (const c of p.hand) if (c.type === 'creature' && (c.tribe || '').includes(e.tribe)) { c.attack += e.attack || 0; c.maxHealth += e.health || 0; }
			p.drawBuffTribe = p.drawBuffTribe || {};
			p.drawBuffTribe[e.tribe] = { attack: (p.drawBuffTribe[e.tribe]?.attack || 0) + (e.attack || 0), health: (p.drawBuffTribe[e.tribe]?.health || 0) + (e.health || 0) };
		} else if (e.type === 'buff-deck-tribe') {
			// Shan'do Wildclaw: give a tribe in your deck +X/+X (applied as they're drawn)
			const p = state.players[pi];
			p.drawBuffTribe = p.drawBuffTribe || {};
			p.drawBuffTribe[e.tribe] = { attack: (p.drawBuffTribe[e.tribe]?.attack || 0) + (e.attack || 0), health: (p.drawBuffTribe[e.tribe]?.health || 0) + (e.health || 0) };
		} else if (e.type === 'become-friendly-tribe-copy') {
			// Shan'do Wildclaw: transform into a copy of a random friendly minion of a tribe
			if (source) {
				const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && (c.tribe || '').includes(e.tribe));
				if (pool.length) {
					const base = state.cardsById[pool[Math.floor(state.rng() * pool.length)].id];
					if (base) { const tok = instantiate(JSON.parse(JSON.stringify(base)), pi); tok.zone = 'board'; tok.sick = source.sick; const board = state.players[pi].board; board[board.indexOf(source)] = tok; source.zone = 'gone'; emit(state, { type: 'transformed', uid: source.uid, player: pi, from: source.name, card: tok }); recomputeAuras(state); }
				}
			}
		} else if (e.type === 'destroy-fragment-then-aoe') {
			// Shardshatter Mystic: destroy a Soul Fragment in your deck to deal damage to all other minions
			const p = state.players[pi];
			const fi = p.deck.indexOf('sch_soul_fragment');
			if (fi >= 0) {
				p.deck.splice(fi, 1);
				healHero(state, pi, 2);
				for (const pl of state.players) for (const c of [...pl.board]) if (!isDead(c) && c.type !== 'location' && c !== source) damageCreature(state, c, e.value || 3, source);
				sweepDeaths(state);
			}
		} else if (e.type === 'cast-spell-from-deck') {
			// High Abbess Alura (Spellburst): cast a random spell from your deck (targets source if possible)
			const p = state.players[pi];
			const idxs = p.deck.map((id, i) => [id, i]).filter(([id]) => { const d = state.cardsById[id]; return d && isSpellType(d); });
			if (idxs.length) {
				const [id, di] = idxs[Math.floor(state.rng() * idxs.length)];
				p.deck.splice(di, 1);
				const spell = instantiate(state.cardsById[id], pi);
				const spec = targetSpec(state, pi, spell, null);
				let tgt = null;
				if (spec) { const legal = legalTargets(state, pi, spec); const selfT = source && legal.find(t => t.uid === source.uid); tgt = selfT || (legal.length ? legal[Math.floor(state.rng() * legal.length)] : null); }
				emit(state, { type: 'conjure', player: pi, card: spell, color: null });
				runSpell(state, pi, spell, tgt, null);
				sweepDeaths(state);
			}
		} else if (e.type === 'reorder-deck') {
			// Lorekeeper Polkelt: order your deck highest Cost -> lowest (draws pop the top/end)
			const p = state.players[pi];
			p.deck.sort((a, b) => (state.cardsById[a]?.cost || 0) - (state.cardsById[b]?.cost || 0)); // ascending: pop() draws the highest first
		} else if (e.type === 'shuffle-enemy-hand-card') {
			// Star Student Stelina (Outcast): shuffle a random card from opponent's hand into their deck
			const foe = enemies[0];
			if (foe != null) { const fp = state.players[foe]; if (fp.hand.length) { const i = Math.floor(state.rng() * fp.hand.length); const [c] = fp.hand.splice(i, 1); fp.deck.push(c.id); for (let k = fp.deck.length - 1; k > 0; k--) { const j = Math.floor(state.rng() * (k + 1)); [fp.deck[k], fp.deck[j]] = [fp.deck[j], fp.deck[k]]; } emit(state, { type: 'shuffle', player: foe }); } }
		} else if (e.type === 'summon-all-died-this-turn') {
			// Headmaster Kel'Thuzad (Spellburst): summon the minions destroyed this turn to your side
			const gathered = [];
			for (let s2 = 0; s2 < state.players.length; s2++) { gathered.push(...state.players[s2].diedThisTurnIds); state.players[s2].diedThisTurnIds = []; }
			for (const id of gathered) { const def = state.cardsById[id]; if (def) summon(state, pi, def); }
		} else if (e.type === 'transform-adjacent-costplus') {
			// Bogstrok Clacker: transform each neighbor into a random minion costing (1) more
			if (source) {
				const board = state.players[pi].board;
				const i = board.indexOf(source);
				for (const j of [i - 1, i + 1]) {
					const nb = board[j];
					if (!nb || isDead(nb) || nb.type === 'location') continue;
					const want = (nb.cost || 0) + (e.value || 1);
					const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === want && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
					if (!pool.length) continue;
					const def = JSON.parse(JSON.stringify(pool[Math.floor(state.rng() * pool.length)]));
					const tok = instantiate(def, nb.controller); tok.zone = 'board'; tok.sick = nb.sick;
					board[board.indexOf(nb)] = tok; nb.zone = 'gone';
					emit(state, { type: 'transformed', uid: nb.uid, player: nb.controller, from: nb.name, card: tok });
				}
				recomputeAuras(state);
			}
		} else if (e.type === 'sacrifice-others-remember') {
			// Teron Gorefiend: destroy all other friendly minions, remembering them
			const others = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location');
			if (source) source.rememberedMinions = others.map(c => ({ id: c.id, name: c.name, tribe: c.tribe || null, attack: c.attack || 0, health: hp(c) }));
			for (const c of others) { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
			sweepDeaths(state);
		} else if (e.type === 'resummon-remembered-buffed') {
			// Teron Gorefiend deathrattle: resummon the remembered minions with +1/+1
			for (const m of (source && source.rememberedMinions) || []) {
				const base = state.cardsById[m.id];
				const def = base ? JSON.parse(JSON.stringify(base)) : { id: 'token_' + (m.name || 'minion').toLowerCase().replace(/\W+/g, '_'), name: m.name, type: 'creature', cost: 0, token: true, rarity: 'common', tribe: m.tribe };
				def.attack = (m.attack || 0) + 1; def.health = (m.health || 0) + 1;
				summon(state, pi, def);
			}
		} else if (e.type === 'damage-stealth-on-kill') {
			// Burrowing Scorpid: deal damage; if it kills, gain Stealth
			const t = chosenCreature();
			if (t) { const before = isDead(t); damageCreature(state, t, e.value || 2, source); if (!before && isDead(t) && source && !isDead(source) && !source.keywords.includes(KW.STEALTH)) { source.keywords.push(KW.STEALTH); source.stealthed = true; } }
			sweepDeaths(state);
		} else if (e.type === 'make-dormant') {
			// Maiev Shadowsong: send a chosen minion Dormant
			const t = chosenCreature();
			if (t) { t.dormantLeft = e.value || 2; emit(state, { type: 'dormant', player: t.controller, uid: t.uid, turns: t.dormantLeft }); }
		} else if (e.type === 'transform-neighbor-into-copy-self') {
			// Replicat-o-tron: at end of turn, turn a neighbor into a copy of this
			if (source) {
				const board = state.players[pi].board;
				const i = board.indexOf(source);
				const nbs = [board[i - 1], board[i + 1]].filter(c => c && !isDead(c) && c.type !== 'location' && c.id !== source.id);
				if (nbs.length) {
					const nb = nbs[Math.floor(state.rng() * nbs.length)];
					const base = state.cardsById[source.id];
					if (base) { const tok = instantiate(JSON.parse(JSON.stringify(base)), nb.controller); tok.zone = 'board'; tok.sick = nb.sick; board[board.indexOf(nb)] = tok; nb.zone = 'gone'; emit(state, { type: 'transformed', uid: nb.uid, player: nb.controller, from: nb.name, card: tok }); recomputeAuras(state); }
				}
			}
		} else if (e.type === 'gain-armor-by-attack') {
			// Scrap Golem: gain Armor equal to this minion's Attack
			const amt = source ? (source.attack || 0) : 0;
			if (amt > 0) gainArmor(state, pi, amt);
		} else if (e.type === 'damage-target-and-same-tribe') {
			// Waste Warden: deal damage to a minion and all others of the same type
			const t = chosenCreature();
			if (t) {
				const tribe = t.tribe || '';
				damageCreature(state, t, e.value || 3, source);
				if (tribe) for (const pl of state.players) for (const c of [...pl.board]) if (c !== t && !isDead(c) && c.type !== 'location' && (c.tribe || '') && tribe.split('/').some(tr => (c.tribe || '').includes(tr))) damageCreature(state, c, e.value || 3, source);
				sweepDeaths(state);
			}
		} else if (e.type === 'magtheridon-warder-death') {
			// Magtheridon's Warders: when the last one dies, wipe the board and awaken him
			const anyWarder = state.players.some(pl => pl.board.some(c => c.id === 'bt_magtheridon_warder' && !isDead(c)));
			if (!anyWarder) {
				let mag = null, magOwner = -1;
				for (let s2 = 0; s2 < state.players.length; s2++) for (const c of state.players[s2].board) if (c.id === 'magtheridon' && c.dormantLeft > 0) { mag = c; magOwner = s2; }
				if (mag) {
					mag.dormantLeft = 0; mag.sick = true; emit(state, { type: 'awaken', player: magOwner, uid: mag.uid, name: mag.name });
					for (const pl of state.players) for (const c of [...pl.board]) if (c !== mag && !isDead(c) && c.type !== 'location') { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
					sweepDeaths(state);
				}
			}
		} else if (e.type === 'curse-enemy-card') {
			// Chaos Gazer: curse a card in the opponent's hand; if unplayed by the
			// end of their next turn, they take damage (resolved in endTurn)
			const foe = enemies[0];
			if (foe != null) { const h = state.players[foe].hand.filter(c => !c.cursed); if (h.length) { const cc = h[Math.floor(state.rng() * h.length)]; cc.cursed = true; cc.curseDamage = e.value || 3; emit(state, { type: 'cursed', player: foe, uid: cc.uid }); } }
		} else if (e.type === 'become-copy-of-hand') {
			// Prince Taldaram: transform into a stat-fixed copy of a random creature in hand
			if (source && source.zone === 'board' && !isDead(source)) {
				const p = state.players[pi];
				const pool = p.hand.filter(c => c.type === 'creature');
				if (pool.length) {
					const pick = pool[Math.floor(state.rng() * pool.length)];
					const base = state.cardsById[pick.id] || pick;
					const def = JSON.parse(JSON.stringify(base));
					const st = e.setStats ?? 3;
					def.attack = st; def.health = st; def.cost = st; def.token = true; def.id = 'token_' + base.id;
					const tok = instantiate(def, source.controller);
					tok.zone = 'board'; tok.sick = source.sick;
					const board = p.board;
					board[board.indexOf(source)] = tok; source.zone = 'gone';
					emit(state, { type: 'transformed', uid: source.uid, player: source.controller, from: source.name, card: tok });
					recomputeAuras(state);
				}
			}
		} else if (e.type === 'replace-spells-random') {
			// Lilian Voss: replace every spell in your hand with a random spell
			const p = state.players[pi];
			const n = p.hand.filter(c => isSpellType(c)).length;
			p.hand = p.hand.filter(c => !isSpellType(c));
			const pool = Object.values(state.cardsById).filter(d => isSpellType(d) && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
			for (let i = 0; i < n && p.hand.length < MAX_HAND && pool.length; i++) {
				const rd = pool[Math.floor(state.rng() * pool.length)];
				const c = instantiate(rd, pi); c.zone = 'hand'; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
		} else if (e.type === 'discard-weapons-gain-stats') {
			// Furnacefire Colossus: discard all weapons in hand, gain their Attack+Durability
			const p = state.players[pi];
			let atk = 0, hlth = 0;
			for (const c of [...p.hand]) {
				if (c.type === 'weapon') {
					atk += c.attack || 0; hlth += c.durability || 0;
					p.hand = p.hand.filter(x => x !== c);
					toGraveyard(state, pi, c);
					emit(state, { type: 'discard', player: pi, card: c });
					if (!c.token) p.discardLogIds.push(c.id);
				}
			}
			if (source && source.zone === 'board' && !isDead(source) && (atk || hlth)) buffCreature(source, atk, hlth);
		} else if (e.type === 'mill-self') {
			// Fel Reaver: burn the top N cards of your own deck
			const p = state.players[pi];
			for (let i = 0; i < (e.value || 1); i++) {
				const id = p.deck.pop();
				if (!id) break;
				const def = state.cardsById[id];
				if (def && !def.token) { const c = instantiate(def, pi); c.zone = 'graveyard'; p.graveyard.push(c); }
				emit(state, { type: 'mill', player: pi });
			}
		} else if (e.type === 'refresh-hero-power') {
			// Auctionmaster Beardo: your Hero Power can be used again this turn
			for (const hp of state.players[pi].heroPowers) hp.usedThisTurn = false;
		} else if (e.type === 'remove-enemy-stealth') {
			// Streetwise Investigator: enemy creatures lose Stealth
			for (const o of enemies) for (const c of state.players[o].board) {
				if (c.stealthed || c.keywords.includes(KW.STEALTH)) { c.stealthed = false; c.keywords = c.keywords.filter(k => k !== KW.STEALTH); emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
			}
		} else if (e.type === 'return-remembered-spells') {
			// Primalfin Champion: return the spells cast on it to your hand
			const p = state.players[pi];
			for (const id of (source?.rememberedSpells || [])) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[id]; if (def) { const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); } }
		} else if (e.type === 'random-invocation') {
			// Kalimos, Primal Lord: cast a random Elemental Invocation
			const inv = Math.floor(state.rng() * 4);
			if (inv === 0) execEffects(state, pi, [{ type: 'damage', value: 6, target: 'enemy-heroes' }], target, source);
			else if (inv === 1) execEffects(state, pi, [{ type: 'damage', value: 3, target: 'enemy-creatures' }], target, source);
			else if (inv === 2) execEffects(state, pi, [{ type: 'heal', value: 12, target: 'self' }], target, source);
			else execEffects(state, pi, [{ type: 'summon', count: 2, attack: 6, health: 6, name: 'Elemental', tribe: 'Elemental' }], target, source);
		} else if (e.type === 'cant-attack-heroes-turn') {
			// Charged Devilsaur: this creature can't attack heroes this turn
			if (source) source.noHeroAttackTurn = state.turnNumber;
		} else if (e.type === 'discount-hand-tribe') {
			// Fire Plume Harbinger: reduce the Cost of a tribe's cards in your hand
			for (const c of state.players[pi].hand) if ((c.tribe || '').includes(e.tribe)) c.cost = Math.max(0, (c.cost || 0) - (e.value || 1));
		} else if (e.type === 'summon-from-hand-min-attack') {
			// Giant Anaconda: put a creature from your hand with N+ Attack into play
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature' && c.attack >= (e.minAttack || 0) && (e.maxCost == null || (c.cost || 0) <= e.maxCost) && (!e.requireKeyword || c.keywords.includes(e.requireKeyword)) && (!e.tribe || (c.tribe || '').includes(e.tribe))); // Coffin Crasher / Piloted Reaper / Oondasta
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; p.hand = p.hand.filter(x => x !== c); c.zone = 'board'; p.board.push(c); emit(state, { type: 'summon', player: pi, card: c }); fireOngoing(state, pi, 'summoned', { minion: c }); growBlubberBaron(state, pi, c); recomputeAuras(state); }
		} else if (e.type === 'destroy-deck-max-cost') {
			// Hemet, Jungle Hunter: destroy all cards in your deck costing N or less
			const p = state.players[pi];
			p.deck = p.deck.filter(id => (state.cardsById[id]?.cost || 0) > (e.maxCost || 0));
			emit(state, { type: 'shuffledIntoDeck', player: pi, count: 0 });
		} else if (e.type === 'summon-random-discarded') {
			// Cruel Dinomancer: summon a random creature you discarded this game
			const p = state.players[pi];
			const ids = p.discardLogIds.filter(id => state.cardsById[id]?.type === 'creature');
			if (ids.length) summon(state, pi, state.cardsById[ids[Math.floor(state.rng() * ids.length)]]);
		} else if (e.type === 'summon-random-died-this-turn') {
			// Onyx Bishop: resurrect a random friendly creature that died this turn
			const p = state.players[pi];
			const ids = p.diedThisTurnIds.filter(id => state.cardsById[id]?.type === 'creature');
			if (ids.length) summon(state, pi, state.cardsById[ids[Math.floor(state.rng() * ids.length)]]);
		} else if (e.type === 'buff-random-of-tribes') {
			// Zoobot / Menagerie Magician: buff a random friendly of each listed tribe
			for (const tribe of e.tribes || []) {
				const pool = state.players[pi].board.filter(c => !isDead(c) && c !== source && (c.tribe || '').includes(tribe));
				if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)]; t.attack += e.attack || 0; t.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
			}
		} else if (e.type === 'destroy-and-remember') {
			// Moat Lurker: destroy a creature; its Deathrattle brings it back
			const t = chosenCreature();
			if (t && source) { source.moatVictim = t.id; t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); }
		} else if (e.type === 'resummon-remembered') {
			// Moat Lurker's Deathrattle (count>1: Carnivorous Cube summons 2 copies)
			if (source?.moatVictim && state.cardsById[source.moatVictim]) {
				for (let i = 0; i < (e.count || 1); i++) summon(state, pi, state.cardsById[source.moatVictim]);
			}
		} else if (e.type === 'set-hero-power') {
			// Vilefin Inquisitor: replace your Hero Power with a specific one
			const def = state.cardsById[e.powerId];
			if (def) { const power = instantiate(def, pi); power.zone = 'heropower'; power.usedThisTurn = false; state.players[pi].heroPowers = [power]; emit(state, { type: 'heroPowerGained', player: pi, card: power }); }
		} else if (e.type === 'spend-all-mana-buff') {
			// Forbidden Ancient: spend all your Mana, gain +1/+1 per Mana spent
			const p = state.players[pi];
			const n = availableMana(p);
			if (n > 0) { spendMana(p, n); if (source && !isDead(source)) { source.attack += (e.attack || 1) * n; source.maxHealth += (e.health || 1) * n; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); } }
		} else if (e.type === 'copy-from-enemy-deck') {
			// Shifting Shade: copy a random card from an opponent's deck into your hand
			const p = state.players[pi];
			for (const o of enemies) {
				const od = state.players[o].deck;
				if (od.length && p.hand.length < MAX_HAND) { const id = od[Math.floor(state.rng() * od.length)]; if (state.cardsById[id]) { const card = instantiate(state.cardsById[id], pi); card.zone = 'hand'; p.hand.push(card); emit(state, { type: 'conjure', player: pi, card, color: null }); } }
				break;
			}
		} else if (e.type === 'copy-to-hand-cheap') {
			// Shadowcaster: a 1/1 copy of a friendly creature that costs (1)
			const t = chosenCreature();
			const p = state.players[pi];
			if (t && p.hand.length < MAX_HAND) {
				const def = state.cardsById[t.id] || { id: t.id, name: t.name, type: 'creature', rarity: t.rarity, description: t.description };
				const card = instantiate(def, pi);
				card.zone = 'hand'; card.attack = e.attack || 1; card.maxHealth = e.health || 1; card.cost = e.cost != null ? e.cost : 1;
				p.hand.push(card); emit(state, { type: 'conjure', player: pi, card, color: null });
			}
		} else if (e.type === 'return-discarded') {
			// Cho'gall: return everything you discarded this game; Soulwarden: N random
			const p = state.players[pi];
			let ids = p.discardLogIds;
			if (e.random) { const pool = [...p.discardLogIds]; ids = []; for (let i = 0; i < (e.count || 1) && pool.length; i++) ids.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0]); }
			for (const id of ids) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[id]; if (def) { const card = instantiate(def, pi); card.zone = 'hand'; if (e.freeCost) card.cost = 0; p.hand.push(card); emit(state, { type: 'conjure', player: pi, card, color: null }); } }
		} else if (e.type === 'cast-random-spell') {
			// Servant of Yogg-Saron / Yogg-Saron: cast random spells with random targets
			const times = e.perSpellsCast ? (state.players[pi].spellsPlayedTotal || 0) : (e.count || 1);
			for (let n = 0; n < times && !state.over; n++) {
				const pool = Object.values(state.cardsById).filter(d => isSpellType(d) && !d.token && d.collectible !== false
					&& !(d.colors && d.colors.length) && !d.choices && !d.xSpell && !d.counterSpell
					&& (e.cardClass == null || (d.cardClass || 'neutral') === e.cardClass) // Solarian Prime: Mage spells
					&& (e.cost == null || (d.cost || 0) === e.cost) // Enchanted Cauldron: same Cost
					&& (e.minCost == null || (d.cost || 0) >= e.minCost));
				if (!pool.length) break;
				const spell = instantiate(pool[Math.floor(state.rng() * pool.length)], pi);
				const spec = targetSpec(state, pi, spell, null);
				let tgt = null;
				if (spec) { const legal = legalTargets(state, pi, spec); if (legal.length) tgt = legal[Math.floor(state.rng() * legal.length)]; else if (spec.required) continue; }
				emit(state, { type: 'conjure', player: pi, card: spell, color: null });
				runSpell(state, pi, spell, tgt, null);
				sweepDeaths(state);
			}
		} else if (e.type === 'unlock-overload') {
			// Eternal Sentinel: give back the Mana Crystals locked this turn, and
			// cancel next turn's pending lock
			const p = state.players[pi];
			if (p.overloadLockedThisTurn) { p.mana.cur += p.overloadLockedThisTurn; p.overloadLockedThisTurn = 0; }
			p.overloadPending = 0;
			emit(state, { type: 'manaGained', player: pi });
		} else if (e.type === 'copy-stats') {
			// Faceless Shambler: copy a friendly creature's Attack and Health
			const t = chosenCreature();
			if (t && source && !isDead(source)) {
				source.attack = t.attack;
				source.maxHealth = t.maxHealth;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
		} else if (e.type === 'heal-per-enemy') {
			// Cult Apothecary: restore N to your hero for each enemy creature
			const n = enemies.reduce((s, o) => s + state.players[o].board.filter(c => !isDead(c) && c.type !== 'location').length, 0);
			if (n > 0) healHero(state, pi, (e.value || 0) * n);
		} else if (e.type === 'swap-stats-with') {
			// Darkspeaker: swap this creature's Attack & Health with a chosen one
			const t = chosenCreature();
			if (t && source && source.zone === 'board' && !isDead(source) && t !== source) {
				const sa = source.attack, sh = source.maxHealth, sd = source.damage;
				source.attack = t.attack; source.maxHealth = t.maxHealth; source.damage = t.damage;
				t.attack = sa; t.maxHealth = sh; t.damage = sd;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
		} else if (e.type === 'blade-of-cthun') {
			// Blade of C'Thun: destroy a creature, add its Attack/Health to C'Thun
			const t = chosenCreature();
			if (t) {
				const a = t.attack, h2 = t.maxHealth;
				t.damage = t.maxHealth; t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
				const p = state.players[pi];
				p.cthunAtk += a; p.cthunHp += h2;
				syncCthun(state, pi);
			}
		} else if (e.type === 'summon-deathrattle-died') {
			// N'Zoth: summon your Deathrattle creatures that died this game
			const p = state.players[pi];
			for (const id of p.deathLogIds) {
				const def = state.cardsById[id];
				if (def?.type === 'creature' && (def.keywords || []).includes('deathrattle')) summon(state, pi, def);
			}
		} else if (e.type === 'summon-dragons-from-hand') {
			// Deathwing (Dragons) / Krul the Unshackled (tribe: Demon)
			const p = state.players[pi];
			const tribe = e.tribe || 'Dragon';
			for (const c of [...p.hand]) {
				if (c.type === 'creature' && (c.tribe || '').includes(tribe)) {
					p.hand = p.hand.filter(x => x !== c);
					c.zone = 'board'; p.board.push(c);
					emit(state, { type: 'summon', player: pi, card: c });
					fireOngoing(state, pi, 'summoned', { minion: c });
				}
			}
			recomputeAuras(state);
		} else if (e.type === 'swap-health-with') {
			// Vol'jin: swap this creature's Health with a chosen creature's
			const t = chosenCreature();
			if (t && source && source.zone === 'board' && !isDead(source) && t !== source) {
				const sh = source.maxHealth, sd = source.damage;
				source.maxHealth = t.maxHealth; source.damage = t.damage;
				t.maxHealth = sh; t.damage = sd;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
		} else if (e.type === 'double-attack-self') {
			// Gahz'rilla: double this creature's Attack
			if (source && source.zone === 'board' && !isDead(source)) buffCreature(source, source.attack, 0);
		} else if (e.type === 'grant-random-others') {
			// Enhance-o Mechano: each other friendly creature gains a random keyword
			const kws = e.keywords || ['windfury', 'taunt', 'divine_shield'];
			for (const c of state.players[pi].board) {
				if (c === source || isDead(c) || c.type === 'location') continue;
				const k = kws[Math.floor(state.rng() * kws.length)];
				if (!c.keywords.includes(k)) {
					c.keywords.push(k);
					if (k === 'divine_shield') c.shield = true;
					emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
				}
			}
		} else if (e.type === 'equip-random') {
			// Blingtron 3000: equip a random weapon (self, or each player)
			const pool = Object.values(state.cardsById).filter(d => d.type === 'weapon'
				&& !d.token && d.collectible !== false && !(d.colors && d.colors.length) && d.attack && d.durability);
			const who = e.eachPlayer ? state.players.map((_, i) => i).filter(i => !state.players[i].eliminated) : [pi];
			for (const tp of who) {
				if (!pool.length) break;
				const wd = pool[Math.floor(state.rng() * pool.length)];
				execEffects(state, tp, [{ type: 'equip', name: wd.name, attack: wd.attack, durability: wd.durability }], null, null);
			}
		} else if (e.type === 'steal-secret') {
			// Kezan Mystic: take control of a random enemy Secret
			for (const o of enemies) {
				const p2 = state.players[o];
				if (!p2.secrets.length) continue;
				const idx = Math.floor(state.rng() * p2.secrets.length);
				const sec = p2.secrets[idx];
				if (state.players[pi].secrets.length >= MAX_SECRETS
					|| state.players[pi].secrets.some(s => s.id === sec.id)) break;
				p2.secrets.splice(idx, 1);
				sec.controller = pi; sec.zone = 'secret';
				state.players[pi].secrets.push(sec);
				emit(state, { type: 'secretPlayed', player: pi, card: sec });
				break; // one secret
			}
		} else if (e.type === 'shadowflame') {
			// sacrifice a friendly creature, its attack burns every enemy creature
			const t = chosenCreature();
			if (t && t.controller === pi) {
				const dmg = t.attack;
				t.damage = t.maxHealth;
				t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
				for (const o of enemies) for (const c of [...state.players[o].board]) damageCreature(state, c, dmg, null);
			}
		} else if (e.type === 'swipe') {
			// big hit on the chosen enemy, splash on all their allies
			const t = chosenCreature();
			const mainHero = !t && target?.type === 'hero' ? target.player : null;
			if (t || mainHero != null) {
				if (t) damageCreature(state, t, boost(e.value), null);
				else damageHero(state, mainHero, boost(e.value), pi);
				for (const o of enemies) {
					for (const c of [...state.players[o].board]) if (c !== t) damageCreature(state, c, boost(e.splash), null);
					if (o !== mainHero) damageHero(state, o, boost(e.splash), pi);
				}
			}
		} else if (e.type === 'damage-adjacent') {
			// Explosive Shot / Cone of Cold: chosen creature + its board neighbors
			const t = chosenCreature();
			if (t) {
				const board = state.players[t.controller].board;
				const idx = board.indexOf(t);
				const neighbors = [board[idx - 1], board[idx + 1]].filter(Boolean);
				damageCreature(state, t, boost(e.value), null);
				if (e.freeze) freezeCreature(state, t);
				for (const nb of neighbors) {
					damageCreature(state, nb, boost(e.splash), null);
					if (e.freeze) freezeCreature(state, nb);
				}
			}
		} else if (e.type === 'betrayal') {
			// the chosen enemy stabs its own neighbors
			const t = chosenCreature();
			if (t) {
				const board = state.players[t.controller].board;
				const idx = board.indexOf(t);
				for (const nb of [board[idx - 1], board[idx + 1]].filter(Boolean)) {
					damageCreature(state, nb, t.attack, t);
				}
			}
		} else if (e.type === 'blade-flurry') {
			// destroy your weapon; its attack hits every enemy
			const p = state.players[pi];
			if (p.weapon) {
				const dmg = p.weapon.attack;
				breakWeapon(state, pi, true);
				for (const o of enemies) {
					for (const c of [...state.players[o].board]) damageCreature(state, c, dmg, null);
					damageHero(state, o, dmg, pi);
				}
			}
		} else if (e.type === 'devour-adjacent') {
			// Void Terror eats its neighbors and grows by their stats
			if (source && source.zone === 'board' && !isDead(source)) {
				const board = state.players[pi].board;
				const idx = board.indexOf(source);
				let a = 0, h2 = 0;
				for (const nb of [board[idx - 1], board[idx + 1]].filter(Boolean)) {
					a += nb.attack;
					h2 += hp(nb);
					nb.damage = nb.maxHealth;
					nb.shield = false;
					emit(state, { type: 'destroy', uid: nb.uid });
				}
				if (a || h2) buffCreature(source, a, h2);
			}
		} else if (e.type === 'commanding-shout') {
			state.players[pi].minionsSurviveTurn = state.turnNumber;
		} else if (e.type === 'doom') {
			// dies at the end of this turn (Power Overwhelming)
			const t = chosenCreature();
			if (t) t.doomTurn = state.turnNumber;
		} else if (e.type === 'corrupt') {
			// dies at the start of the caster's next turn (Corruption)
			const t = chosenCreature();
			if (t) t.corruptedBy = pi;
		} else if (e.type === 'mind-control-temp') {
			// Shadow Madness: borrow an enemy creature until end of turn
			const t = chosenCreature();
			if (t && t.controller !== pi && (e.maxAttack == null || t.attack <= e.maxAttack)
				&& !state.players[pi].eliminated) {
				const from = t.controller;
				state.players[from].board = state.players[from].board.filter(c => c !== t);
				t.tempControl = from;
				t.controller = pi;
				t.sick = false;
				t.attacksUsed = 0;
				state.players[pi].board.push(t);
				emit(state, { type: 'mindControl', uid: t.uid, player: pi, name: t.name });
				recomputeAuras(state);
			}
		} else if (e.type === 'joust') {
			// Reveal a random creature from each deck; you win if yours costs more.
			// An empty deck reveals nothing: no creature = can't win / auto-loses.
			const p = state.players[pi];
			const creaturePicks = deck => {
				const idxs = [];
				for (let i = 0; i < deck.length; i++) { const def = state.cardsById[deck[i]]; if (def?.type === 'creature' && !def.token) idxs.push(i); }
				return idxs;
			};
			const myPool = creaturePicks(p.deck);
			const myPick = myPool.length ? myPool[Math.floor(state.rng() * myPool.length)] : -1;
			const myCost = myPick >= 0 ? (state.cardsById[p.deck[myPick]].cost || 0) : null;
			const myName = myPick >= 0 ? state.cardsById[p.deck[myPick]].name : null;
			let enemyCost = null, enemyName = null;
			// joust the chosen player; with no target (2p / deathrattle) a random opponent
			const foe = (target?.type === 'hero' && target.player !== pi) ? target.player
				: (enemies.length ? enemies[Math.floor(state.rng() * enemies.length)] : null);
			if (foe != null) {
				const ed = state.players[foe].deck;
				const ePool = creaturePicks(ed);
				if (ePool.length) { const ei = ePool[Math.floor(state.rng() * ePool.length)]; enemyCost = state.cardsById[ed[ei]].cost || 0; enemyName = state.cardsById[ed[ei]].name; }
			}
			const win = myCost != null && (enemyCost == null || myCost > enemyCost);
			emit(state, { type: 'joust', player: pi, opponent: foe, myName, myCost, enemyName, enemyCost, win });
			if (win) {
				if (e.drawWinner && myPick >= 0 && p.hand.length < MAX_HAND) {
					const [id] = p.deck.splice(myPick, 1);
					const card = instantiate(state.cardsById[id], pi);
					card.zone = 'hand'; p.hand.push(card);
					emit(state, { type: 'draw', player: pi, card });
				}
				if (e.then) execEffects(state, pi, e.then, target, source);
			}
		} else if (e.type === 'return-self-to-hand') {
			// "Deathrattle: Return this to your hand" — a fresh copy comes back
			const p = state.players[pi];
			const def = source && state.cardsById[source.id];
			if (def && !p.eliminated && p.hand.length < MAX_HAND) {
				const card = instantiate(def, pi);
				card.zone = 'hand';
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			}
		} else if (e.type === 'shuffle-into-deck') {
			// Raptor/Direhorn Hatchling: shuffle a token into your deck; Weasel
			// Tunneler (enemy:true) shuffles itself into an opponent's deck
			const owners = e.enemy ? enemies.filter(o => !state.players[o].eliminated) : [pi];
			const elekkS = state.players[pi].board.filter(c => c.id === 'augmented_elekk' && !isDead(c)).length; // Augmented Elekk
			const shufOwners = e.eachPlayer ? state.players.map((_, i) => i).filter(i => !state.players[i].eliminated) : owners; // Hakkar: each player
			for (const own of shufOwners) {
				const dk = state.players[own].deck;
				if (!e.id || !state.cardsById[e.id]) break;
				for (let n = 0; n < (e.count || 1) * (own === pi ? (1 + elekkS) : 1); n++) dk.push(e.id);
				for (let i = dk.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [dk[i], dk[j]] = [dk[j], dk[i]]; }
				emit(state, { type: 'shuffledIntoDeck', player: own, cardId: e.id }); if (own === pi) fireOngoing(state, pi, 'card-shuffled', { cardId: e.id });
			}
		} else if (e.type === 'shuffle-self-into-deck') {
			// "Shuffle this card back into your deck" — Astral Tiger recursion
			const p = state.players[pi];
			if (source && state.cardsById[source.id] && !p.eliminated) {
				p.deck.push(source.id);
				for (let i = p.deck.length - 1; i > 0; i--) {
					const j = Math.floor(state.rng() * (i + 1));
					[p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]];
				}
				emit(state, { type: 'shuffledIntoDeck', player: pi, cardId: source.id }); fireOngoing(state, pi, 'card-shuffled', { cardId: source.id });
			}
		} else if (e.type === 'shuffle-hand') {
			// shuffle your hand into your deck (tokens evaporate)
			const p = state.players[pi];
			for (const c of p.hand) if (state.cardsById[c.id]) p.deck.push(c.id);
			p.hand = [];
			for (let k = p.deck.length - 1; k > 0; k--) {
				const j = Math.floor(state.rng() * (k + 1));
				[p.deck[k], p.deck[j]] = [p.deck[j], p.deck[k]];
			}
		} else if (e.type === 'destroy-strongest') {
			// destroy the highest-Attack enemy creature
			let best = null;
			for (const o of enemies) for (const c of state.players[o].board) {
				if (!isDead(c) && (!best || c.attack > best.attack)) best = c;
			}
			if (best) {
				best.damage = best.maxHealth;
				best.shield = false;
				emit(state, { type: 'destroy', uid: best.uid });
			}
		} else if (e.type === 'sacrifice-each-enemy') {
			// every opponent loses a random creature
			for (const o of enemies) {
				const pool = state.players[o].board.filter(c => !isDead(c));
				if (!pool.length) continue;
				const t = pool[Math.floor(state.rng() * pool.length)];
				t.damage = t.maxHealth;
				t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
			}
		} else if (e.type === 'hero-immune') {
			state.players[pi].heroImmuneTurn = state.turnNumber;
		} else if (e.type === 'attach' || e.type === 'attach-curse') {
			// enchant-creature aura: permanent stats/keywords riding the target
			// ('attach' = boon for AI targeting, 'attach-curse' = Pacifism-style)
			const t = chosenCreature();
			if (t) {
				if (e.attack || e.health) buffCreature(t, e.attack || 0, e.health || 0);
				for (const k of e.keywords || []) {
					if (!t.keywords.includes(k)) t.keywords.push(k);
					if (k === KW.DIVINE_SHIELD) t.shield = true;
					if (k === KW.STEALTH) t.stealthed = true;
				}
				if (source) t.attachments.push(source.name);
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
		} else if (e.type === 'add-counters') {
			// +1/+1 counters (a permanent buff that other cards can count)
			const t = e.target === 'self' ? source : chosenCreature();
			if (t && t.zone === 'board' && !isDead(t)) {
				const n = e.value === 'X' ? (source?.xValue || 0) : (e.value || 1);
				buffCreature(t, n, n); // buffCreature banks the counters
			}
		} else if (e.type === 'proliferate') {
			// each creature you've strengthened grows +1/+1; each of your planeswalkers gains 1 loyalty
			const pp = state.players[pi];
			for (const c of [...pp.board]) {
				if (c.type === 'location' || isDead(c)) continue;
				if ((c.counters || 0) > 0) buffCreature(c, 1, 1);
			}
			for (const w of pp.planeswalkers) { w.loyalty = (w.loyalty || 0) + 1; emit(state, { type: 'walkerLoyalty', uid: w.uid, loyalty: w.loyalty }); }
			emit(state, { type: 'proliferate', player: pi });
		} else if (e.type === 'reanimate') {
			// summon the highest-Cost creature from your graveyard, with riders
			const p = state.players[pi];
			const cands = p.graveyard.filter(c => { const d = state.cardsById[c.id]; return d && d.type === 'creature' && !d.token && d.collectible !== false; });
			if (cands.length) {
				let best = cands[0];
				for (const c of cands) if ((state.cardsById[c.id].cost || 0) > (state.cardsById[best.id].cost || 0)) best = c;
				p.graveyard = p.graveyard.filter(c => c !== best);
				const c = summon(state, pi, state.cardsById[best.id]);
				if (c) {
					if (e.attack || e.health) buffCreature(c, e.attack || 0, e.health || 0);
					for (const kw of e.keywords || []) { if (!c.keywords.includes(kw)) c.keywords.push(kw); if (kw === KW.DIVINE_SHIELD) c.shield = true; }
				}
			}
		} else if (e.type === 'buff-zones') {
			// buff creatures in hand + on the battlefield now, and creatures still in
			// the deck as they are drawn (deck cards have no live identity until drawn)
			const p = state.players[pi];
			if (!e.skipBoard && !e.deckOnly) for (const c of p.board) if (c.type === 'creature' && !isDead(c)) buffCreature(c, e.attack || 0, e.health || 0); // Mistcaller: hand+deck only
			if (!e.deckOnly) for (const c of p.hand) if (c.type === 'creature') { c.attack += e.attack || 0; c.maxHealth += e.health || 0; } // Prince Keleseth: deck only
			p.drawBuff = p.drawBuff || { attack: 0, health: 0 };
			p.drawBuff.attack += e.attack || 0; p.drawBuff.health += e.health || 0;
		} else if (e.type === 'transform-cost') {
			// transform every creature you own (hand, deck, battlefield) into a random
			// creature that naturally costs `delta` more
			const p = state.players[pi];
			const delta = e.delta || 3;
			const rc = cost => { const pool = Object.values(state.cardsById).filter(d => d.type === 'creature'
				&& (d.cost || 0) === cost && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
				return pool.length ? pool[Math.floor(state.rng() * pool.length)] : null; };
			for (const c of [...p.board]) {
				if (c.type !== 'creature' || isDead(c)) continue;
				const def = rc((state.cardsById[c.id]?.cost || 0) + delta); if (!def) continue;
				const tok = instantiate(def, pi); tok.zone = 'board'; tok.sick = c.sick;
				p.board[p.board.indexOf(c)] = tok; c.zone = 'gone';
				emit(state, { type: 'transformed', uid: c.uid, player: pi, from: c.name, card: tok });
			}
			for (let i = 0; i < p.hand.length; i++) {
				const c = p.hand[i]; if (c.type !== 'creature') continue;
				const def = rc((state.cardsById[c.id]?.cost || 0) + delta); if (!def) continue;
				const tok = instantiate(def, pi); tok.zone = 'hand'; p.hand[i] = tok;
			}
			for (let i = 0; i < p.deck.length; i++) {
				const d = state.cardsById[p.deck[i]]; if (!d || d.type !== 'creature') continue;
				const def = rc((d.cost || 0) + delta); if (def) p.deck[i] = def.id;
			}
			recomputeAuras(state);
		} else if (e.type === 'gy-return') {
			// graveyard recursion: pick a fallen card back to hand or battlefield
			const p = state.players[pi];
			const pool = p.graveyard.filter(c => {
				const d = state.cardsById[c.id];
				return d && !d.token && d.collectible !== false && (!e.cardType || d.type === e.cardType)
					&& (e.maxCost == null || (d.cost || 0) <= e.maxCost)
					&& (!e.tribe || (d.tribe || '').includes(e.tribe));
			});
			const ids = [...new Set(pool.map(c => c.id))];
			if (ids.length) {
				state.pickQueue.push({ player: pi, ids: ids.slice(0, 8), mode: 'gy',
					to: e.to || 'hand', title: 'Return from the graveyard' });
				emit(state, { type: 'pickStart', player: pi });
			}
		} else if (e.type === 'search') {
			// library search: pick a matching card out of your deck (then shuffle)
			const p = state.players[pi];
			let ids = [...new Set(p.deck.filter(id => {
				const d = state.cardsById[id];
				return d && (e.cardType === 'spell' ? (d.type === 'sorcery' || d.type === 'instant')
					: !e.cardType || d.type === e.cardType)
					&& (e.maxCost == null || (d.cost || 0) <= e.maxCost)
					&& (e.maxAttack == null || (d.attack || 0) <= e.maxAttack)
					&& (!e.tribe || (d.tribe || '').includes(e.tribe))
					&& (!e.equipment || !!d.equip); // Steelshaper's Gift / Stoneforge: Equipment only
			}))];
			// pick: Discover-from-deck flavor — offer N randomly-sampled matches
			if (e.pick) {
				for (let k = ids.length - 1; k > 0; k--) {
					const j = Math.floor(state.rng() * (k + 1));
					[ids[k], ids[j]] = [ids[j], ids[k]];
				}
				ids = ids.slice(0, e.pick);
			}
			if (ids.length) {
				state.pickQueue.push({ player: pi, ids: ids.slice(0, 8), mode: 'search',
					to: e.to || 'hand', title: 'Search your deck' });
				emit(state, { type: 'pickStart', player: pi });
			}
		} else if (e.type === 'copy-deathrattle') {
			// Unearthed Raptor: gain a copy of a chosen friendly minion's Deathrattle
			const c = chosenCreature();
			if (c && c.deathrattle && source) {
				source.deathrattle = [...(source.deathrattle || []),
					...JSON.parse(JSON.stringify(c.deathrattle))];
			}
		} else if (e.type === 'copy-to-hand') {
			// Puppet Theatre: a copy of the chosen creature lands in your hand,
			// optionally with overridden stats/cost (1/1 copy that costs 1)
			const t = chosenCreature();
			const p = state.players[pi];
			if (t && p.hand.length < MAX_HAND && !p.eliminated) {
				const def = state.cardsById[t.id];
				const copy = def ? instantiate(def, pi) : instantiate({
					id: t.id, name: t.name, type: 'creature', cost: t.cost, rarity: t.rarity,
					description: t.description, attack: t.attack, health: t.maxHealth,
					keywords: [...t.keywords], tribe: t.tribe,
				}, pi);
				copy.zone = 'hand';
				if (e.setAttack != null) copy.attack = e.setAttack;
				if (e.setHealth != null) copy.maxHealth = e.setHealth;
				if (e.setCost != null) copy.cost = e.setCost;
				p.hand.push(copy);
				emit(state, { type: 'conjure', player: pi, card: copy, color: null });
			}
		} else if (e.type === 'copy-summon') {
			// Crimson Expanse: summon a copy of the chosen creature at its
			// CURRENT stats, optionally entering Dormant
			const t = chosenCreature();
			if (t) {
				const copy = summon(state, pi, {
					id: t.id, name: t.name, type: 'creature', cost: t.cost, rarity: t.rarity,
					description: t.description, attack: t.attack, health: hp(t),
					keywords: t.keywords.filter(k => !t.auraKeywords.includes(k)),
					tribe: t.tribe, deathrattle: t.deathrattle,
				});
				if (copy && e.dormant) {
					copy.dormantLeft = e.dormant;
					emit(state, { type: 'dormant', player: pi, uid: copy.uid, turns: e.dormant });
				}
			}
		} else if (e.type === 'summon-with-stats') {
			// Forge of Wills: a named token wearing the chosen creature's stats
			const t = chosenCreature();
			if (t) {
				summon(state, pi, {
					id: 'token_' + (e.name || 'construct').toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: e.name || 'Construct', type: 'creature', cost: 0, rarity: 'common',
					description: `A ${t.attack}/${hp(t)} ${e.name || 'token'}.`,
					attack: t.attack, health: hp(t),
					keywords: [...(e.keywords || [])], tribe: e.tribe || null,
				});
			}
		} else if (e.type === 'conjure-random') {
			// random collectible card(s) matching filters, added to your hand;
			// cardClass 'enemy' = an opponent's class pool, 'other' = any class but yours
			const p = state.players[pi];
			let pool = Object.values(state.cardsById).filter(d =>
				d.type !== 'land' && !d.token && d.collectible !== false && !d.companion && !d.commander
				&& !(d.colors && d.colors.length));
			if (e.cardType === 'creature') pool = pool.filter(d => d.type === 'creature');
			else if (e.cardType === 'spell') pool = pool.filter(d => isSpellType(d));
			else if (e.cardType === 'weapon') pool = pool.filter(d => d.type === 'weapon');
			if (e.minAttack != null) pool = pool.filter(d => (d.attack || 0) >= e.minAttack);
			if (e.requireKeyword) pool = pool.filter(d => (d.keywords || []).includes(e.requireKeyword)); // Whirlkick Master: a Combo card
			if (e.cost != null) pool = pool.filter(d => (d.cost || 0) === e.cost); // Ravencaller / Tanglefur Mystic
			if (e.tribe) pool = pool.filter(d => (d.tribe || '').includes(e.tribe));
			if (e.rarity) pool = pool.filter(d => d.rarity === e.rarity); // Golden Monkey: Legendaries
			if (e.cardClass === 'enemy') {
				const victim = enemyHero();
				const cls = victim != null && state.players[victim].heroClass;
				pool = cls ? pool.filter(d => d.cardClass === cls) : [];
			} else if (e.cardClass === 'other') {
				pool = pool.filter(d => d.cardClass && d.cardClass !== 'neutral'
					&& d.cardClass !== p.heroClass);
			} else if (e.cardClass) {
				pool = e.cardClass === 'own' ? (p.heroClass ? pool.filter(d => (d.cardClass || 'neutral') === p.heroClass) : pool) : pool.filter(d => d.cardClass === e.cardClass); // Wandmaker: your class / Lyra: a specific class
			}
			// `copies`: pick ONE match and add that same card N times; else N distinct rolls
			const cnt = e.countPer === 'spells-this-turn' ? (p.spellsPlayedThisTurn || 0) : (e.count || 1); // Mana Cyclone
			const addTo = (own) => {
				const op = state.players[own];
				const picks = e.copies ? Array(e.copies).fill(pool.length ? pool[Math.floor(state.rng() * pool.length)] : null)
					: Array.from({ length: cnt }, () => pool.length ? pool[Math.floor(state.rng() * pool.length)] : null);
				for (const def of picks) {
					if (!def || op.hand.length >= MAX_HAND) break;
					const card = instantiate(def, own);
					card.zone = 'hand';
					if (e.setCost != null) card.cost = e.setCost;
					op.hand.push(card);
					emit(state, { type: 'conjure', player: own, card, color: null });
					fireEmerge(state, own, card);
				}
			};
			// Spellslinger: eachPlayer gives every player their own random card
			if (e.eachPlayer) { for (let i = 0; i < state.players.length; i++) if (!state.players[i].eliminated) addTo(i); }
			else if (e.toEnemy) { for (const o of enemies) addTo(o); } // K'thir Ritualist
			else addTo(pi);
		} else if (e.type === 'give-enemy-random') {
			// Mulch: a random creature lands in an opponent's hand
			const victim = enemyHero();
			if (victim != null) {
				let pool = Object.values(state.cardsById).filter(d =>
					d.type !== 'land' && !d.token && d.collectible !== false && !d.companion && !d.commander
					&& !(d.colors && d.colors.length));
				if (e.cardType === 'creature') pool = pool.filter(d => d.type === 'creature');
				const vp = state.players[victim];
				if (pool.length && vp.hand.length < MAX_HAND) {
					const card = instantiate(pool[Math.floor(state.rng() * pool.length)], victim);
					card.zone = 'hand';
					vp.hand.push(card);
					emit(state, { type: 'conjure', player: victim, card, color: null });
				}
			}
		} else if (e.type === 'buff-random-friendly') {
			// deathrattle path (Dark Cultist) — the secret executor has its own copy;
			// count picks that many DISTINCT friendlies
			const pool = state.players[pi].board.filter(c =>
				!isDead(c) && c !== source && c.type !== 'location');
			for (let i = 0; i < (e.count || 1) && pool.length; i++) {
				const m = pool.splice(Math.floor(state.rng() * pool.length), 1)[0];
				m.attack += e.attack || 0;
				m.maxHealth += e.health || 0;
				emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
			}
		} else if (e.type === 'conjure-cost') {
			// Discover-a-cost approximation: a random card of that cost
			const p = state.players[pi];
			const ccCost = e.heraldScaled ? hm() : e.cost;
			const pool = Object.values(state.cardsById).filter(d =>
				(d.cost || 0) === ccCost && d.type !== 'land' && !d.token && d.collectible !== false
				&& !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (pool.length && p.hand.length < MAX_HAND) {
				const card = instantiate(pool[Math.floor(state.rng() * pool.length)], pi);
				card.zone = 'hand';
				if (e.setCost != null) card.cost = e.setCost;
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
				fireEmerge(state, pi, card);
			}
		} else if (e.type === 'gain-coin') {
			for (let n = 0; n < (e.value || 1); n++) addCoin(state, pi);
		} else if (e.type === 'temp-mana') {
			const pp = state.players[pi];
			pp.mana.bonus += e.value || 1;
			emit(state, { type: 'coin', player: pi, mana: availableMana(pp) });
		} else if (e.type === 'draw-to') {
			// draw until you hold N cards
			const p = state.players[pi];
			let guard = 20;
			while (p.hand.length < e.value && guard-- > 0) {
				const before = p.hand.length;
				drawCards(state, pi, 1);
				if (p.hand.length === before) break; // nothing left to draw
			}
		} else if (e.type === 'buff-hand') {
			// hand-buffs: pump creatures (or a weapon) still waiting in your hand
			const p = state.players[pi];
			let pool;
			if (e.cardType === 'weapon') pool = p.hand.filter(c => c.type === 'weapon'); // Grimestreet Pawnbroker
			else {
				pool = p.hand.filter(c => c.type === 'creature');
				if (e.tribe) pool = pool.filter(c => (c.tribe || '').includes(e.tribe)); // Grimscale Chum / Trogg Beastrager
				if (e.requireKeyword) pool = pool.filter(c => c.keywords.includes(e.requireKeyword)); // Forlorn Stalker
			}
			const targets = e.random ? (pool.length ? [pool[Math.floor(state.rng() * pool.length)]] : []) // Deathaxe Punisher: one random match
				: e.all || e.requireKeyword ? pool
				: pool.length ? [pool[Math.floor(state.rng() * pool.length)]] : [];
			for (const c of targets) {
				c.attack += e.attack || 0;
				if (c.type === 'weapon') c.durability += e.health || 0; else c.maxHealth += e.health || 0;
				if (e.cost) c.cost = Math.max(0, (c.cost || 0) - e.cost); // Ebon Dragonsmith: cheaper weapon
				if (e.setAttack != null) c.attack = e.setAttack; // Anka, the Buried: a 1/1 that costs 1
				if (e.setHealth != null) c.maxHealth = e.setHealth;
				if (e.setCost != null) c.cost = e.setCost;
			}
		} else if (e.type === 'enrich') {
			gainTokenCard(state, pi, 'treasure_token');
		} else if (e.type === 'cook') {
			gainTokenCard(state, pi, 'food_token');
		} else if (e.type === 'investigate') {
			// Investigate: make a Clue token (Sacrifice, pay 2: draw a card)
			gainTokenCard(state, pi, 'clue_token');
		} else if (e.type === 'end-turn') {
			// Time Stop: end the current turn immediately
			endTurn(state);
		} else if (e.type === 'spark') {
			// target 'all' = every player sparks (always beneficial, so auto-taken)
			const seats = e.target === 'all' ? state.players.map((_, s2) => s2) : [pi];
			for (const s2 of seats) { state.players[s2].sparked = true; emit(state, { type: 'sparked', player: s2 }); }
		} else if (e.type === 'sacrifice-each') {
			for (let s2 = 0; s2 < state.players.length; s2++) {
				const pool = state.players[s2].board.filter(c => !isDead(c));
				if (!pool.length) continue;
				const t = pool[Math.floor(state.rng() * pool.length)];
				t.damage = t.maxHealth; t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
			}
		} else if (e.type === 'planeshift') {
			// shift the arena to a random different plane: old plane departs, new arrives
			const pool = Object.values(state.cardsById).filter(d => d.type === 'plane' && d.id !== state.plane);
			if (pool.length) {
				const old = state.plane, oldDef = old ? state.cardsById[old] : null;
				if (oldDef && oldDef.departure) execEffects(state, pi, oldDef.departure, null, null);
				const next = pool[Math.floor(state.rng() * pool.length)];
				state.plane = next.id;
				emit(state, { type: 'planeshifted', player: pi, from: old, to: next.id, name: next.name });
				if (next.arrival) execEffects(state, pi, next.arrival, null, null);
			}
		} else if (e.type === 'excavate') {
			const pl = state.players[pi];
			if (!pl.eliminated) {
				const tier = (pl.excavateCount || 0) % 5; // 0-3 fixed, 4 = class legendary
				let id;
				if (tier < 4) id = EXCAVATE_TIERS[tier];
				else {
					const pool = EXCAVATE_LEGENDARIES[pl.heroClass] || ALL_AZERITE_LEGENDARIES;
					id = pool[Math.floor(state.rng() * pool.length)];
				}
				pl.excavateCount = (pl.excavateCount || 0) + 1;
				emit(state, { type: 'excavated', player: pi, tier, id });
				addCardToHand(state, pi, id);
			}
		} else if (e.type === 'grant-medic') {
			const t = chosenCreature();
			if (t) t.medic = (t.medic || 0) + e.value;
		} else if (e.type === 'discover' && e.heroPower) {
			// Sir Finley: Discover a new Hero Power (replaces yours on pick)
			const pool = Object.values(state.cardsById).filter(d => d.type === 'heropower' && d.power);
			const ids = [];
			for (let i = 0; i < 3 && pool.length; i++) ids.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0].id);
			if (ids.length && !state.players[pi].eliminated) {
				state.pickQueue.push({ player: pi, ids, heroPower: true });
				emit(state, { type: 'pickStart', player: pi, count: ids.length });
			}
		} else if (e.type === 'discover') {
			// Discover: pick 1 of 3 random matches; Draft: pick 1 of 5. Curious
			// Glimmerroot (fromEnemyDeck) samples the opponent's deck.
			const enemyDeckDefs = () => {
				const foe = enemies[0];
				if (foe == null) return [];
				return [...new Set(state.players[foe].deck)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && !d.token);
			};
			const ownDeckDefs = () => [...new Set(state.players[pi].deck)].map(id => state.cardsById[id]).filter(d => d && !d.token && (e.cardType === 'spell' ? isSpellType(d) : d.type === 'creature')); // Stitched Tracker / Tortollan Pilgrim
			const enemyHandDefs = () => { const foe = enemies[0]; return foe == null ? [] : state.players[foe].hand.map(c => state.cardsById[c.id] || c).filter(d => d && !d.token); }; // Madame Lazul
			const diedDefs = () => [...new Set(state.players[pi].deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature'); // Body Wrapper
			const discoverPool = () => (e.fromEnemyDeck ? enemyDeckDefs() : e.fromEnemyHand ? enemyHandDefs() : e.fromDied ? diedDefs() : e.fromOwnDeck ? ownDeckDefs() : Object.values(state.cardsById)).filter(d => {
				if (d.type === 'land' || d.token || d.collectible === false || d.companion || d.commander) return false;
				if (d.colors && d.colors.length) return false;
				if (e.cardType === 'spell' ? !isSpellType(d) : (e.cardType && d.type !== e.cardType)) return false;
				if (e.tribe && !(d.tribe || '').includes(e.tribe)) return false;
				if (e.cost != null && (d.cost || 0) !== e.cost) return false;
				if (e.maxCost != null && (d.cost || 0) > e.maxCost) return false;
				if (e.minCost != null && (d.cost || 0) < e.minCost) return false;
				if (e.hasStatic && d.static?.type !== e.hasStatic) return false;
				if (e.requireKeyword && !(d.keywords || []).includes(e.requireKeyword)) return false;
				if (e.cardClasses && !e.cardClasses.includes(d.cardClass || 'neutral')) return false; // Grimestreet Informant / Kabal Courier / Lotus Agents
				return true;
			});
			// `count` queues that many separate Discovers; `to:'board'` summons the pick
			for (let n = 0; n < (e.count || 1); n++) {
				if (state.players[pi].eliminated) break;
				const pool = discoverPool();
				const ids = [];
				for (let i = 0; i < (e.pick || 3) && pool.length; i++) {
					ids.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0].id);
				}
				if (!ids.length) break;
				state.pickQueue.push({ player: pi, ids, grant: e.grant || null, buff: e.buff || null, to: e.to || null, costMod: e.costMod || null, healByCost: e.healByCost || false, installSecret: e.installSecret || false, castRandom: e.castRandom || false, damageSelfByCost: e.damageSelfByCost || false, gainDeathrattleUid: e.gainDeathrattle && source ? source.uid : null, setAttack: e.setAttack ?? null, setHealth: e.setHealth ?? null, setCost: e.setCost ?? null });
				emit(state, { type: 'pickStart', player: pi, count: ids.length });
			}
		} else if (e.type === 'loot') {
			// Loot: draw a card, then discard a card of your choice
			// (the discard resolves asynchronously via resolveDiscard)
			const p = state.players[pi];
			for (let i = 0; i < (e.value || 1); i++) drawCards(state, pi, 1);
			if (p.hand.length && !p.eliminated) {
				const count = Math.min(e.value || 1, p.hand.length);
				state.discardQueue.push({ player: pi, count });
				emit(state, { type: 'lootStart', player: pi, count });
			}
		} else if (e.type === 'enemy-discard') {
			// each opponent discards at random
			const dn = e.count === 'X' ? (source?.xValue || 0) : (e.count || 1);
			for (const o of enemies) {
				const op = state.players[o];
				for (let i = 0; i < dn && op.hand.length; i++) {
					const j = Math.floor(state.rng() * op.hand.length);
					const [c] = op.hand.splice(j, 1);
					toGraveyard(state, o, c);
					emit(state, { type: 'discard', player: o, card: c });
				}
			}
		} else if (e.type === 'give-enemy-card') {
			// King Mukla's Bananas land in an opponent's hand
			const victim = enemyHero();
			const def = state.cardsById[e.id];
			if (victim != null && def) {
				const vp = state.players[victim];
				for (let i = 0; i < (e.count || 1) && vp.hand.length < MAX_HAND; i++) {
					const card = instantiate(def, victim);
					card.zone = 'hand';
					vp.hand.push(card);
					emit(state, { type: 'conjure', player: victim, card, color: null });
				}
			}
		} else if (e.type === 'transform') {
			// replace a creature in place with a fresh token (no death, no deathrattle)
			let t = null;
			if (e.random) {
				const pool = [];
				for (const pl of state.players) for (const c of pl.board) {
					if (!isDead(c) && !(e.others && c === source)) pool.push(c);
				}
				if (pool.length) t = pool[Math.floor(state.rng() * pool.length)];
			} else t = chosenCreature();
			if (t) {
				let opt = e.options ? e.options[Math.floor(state.rng() * e.options.length)] : e;
				if (e.randomCost) {
					// Recombobulator: same Cost. Master of Evolution: costDelta +1
					const want = (t.cost || 0) + (e.costDelta || 0);
					const pool = Object.values(state.cardsById).filter(d => d.type === 'creature'
						&& (d.cost || 0) === want && !d.token && d.collectible !== false
						&& !d.companion && !d.commander && !(d.colors && d.colors.length) && d.id !== t.id);
					if (pool.length) {
						const rd = pool[Math.floor(state.rng() * pool.length)];
						opt = { name: rd.name, attack: rd.attack, health: rd.health, keywords: rd.keywords || [] };
					}
				}
				const tok = instantiate({
					id: 'token_' + opt.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: opt.name, type: 'creature', cost: 0, rarity: 'common', token: true,
					description: `A ${opt.attack}/${opt.health} ${opt.name}.`,
					attack: opt.attack, health: opt.health,
					keywords: opt.keywords || [],
				}, t.controller);
				tok.zone = 'board';
				tok.sick = t.sick;
				const board = state.players[t.controller].board;
				board[board.indexOf(t)] = tok;
				t.zone = 'gone';
				emit(state, { type: 'transformed', uid: t.uid, player: t.controller, from: t.name, card: tok });
				recomputeAuras(state);
			}
		} else if (e.type === 'transform-copy') {
			// Faceless-style: the source becomes a copy of the chosen creature
			const t = chosenCreature();
			if (t && source && source.zone === 'board' && !isDead(source) && t !== source) {
				const def = state.cardsById[t.id];
				const clone = instantiate(def || {
					id: t.id, name: t.name, type: 'creature', cost: t.cost,
					rarity: t.rarity, description: t.description,
				}, source.controller);
				// live state minus aura contributions (auras re-apply on recompute)
				clone.zone = 'board';
				clone.name = t.name;
				clone.attack = t.attack - t.auraAttack - t.tempAttack;
				clone.maxHealth = t.maxHealth - (t.auraHealth || 0) - (t.tempHealth || 0);
				clone.damage = t.damage;
				clone.keywords = t.keywords.filter(k => !t.auraKeywords.includes(k));
				clone.tribe = t.tribe;
				clone.effects = t.effects;
				clone.deathrattle = t.deathrattle ? JSON.parse(JSON.stringify(t.deathrattle)) : null;
				clone.ongoing = t.ongoing ? JSON.parse(JSON.stringify(t.ongoing)) : null;
				clone.static = t.static ? { ...t.static } : null;
				clone.aura = t.aura ? JSON.parse(JSON.stringify(t.aura)) : null;
				clone.costMod = t.costMod ? { ...t.costMod } : null;
				clone.selfCost = t.selfCost ? { ...t.selfCost } : null;
				clone.enrage = t.enrage ? JSON.parse(JSON.stringify(t.enrage)) : null;
				clone.combo = t.combo ? JSON.parse(JSON.stringify(t.combo)) : null;
				clone.statRule = t.statRule;
				clone.selfScale = t.selfScale ? { ...t.selfScale } : null;
				clone.condKeyword = t.condKeyword ? { ...t.condKeyword } : null;
				clone.offTurnAttack = t.offTurnAttack;
				clone.medic = t.medic;
				clone.shield = t.shield;
				clone.stealthed = t.stealthed;
				clone.sick = source.sick;
				if (e.setAttack != null) clone.attack = e.setAttack; // Shadowy Figure: a 2/2 copy
				if (e.setHealth != null) { clone.maxHealth = e.setHealth; clone.damage = 0; }
				const board = state.players[source.controller].board;
				board[board.indexOf(source)] = clone;
				source.zone = 'gone';
				emit(state, { type: 'transformed', uid: source.uid, player: source.controller, from: source.name, card: clone });
				recomputeAuras(state);
			}
		} else if (e.type === 'discount') {
			// one-shot rider: "the next X you play (this turn) costs (N) less / (0)"
			const p = state.players[pi];
			p.costDiscounts = p.costDiscounts || [];
			p.costDiscounts.push({
				cardType: e.cardType || 'all', amount: e.amount || 0, tribe: e.tribe || null,
				setZero: !!e.setZero, thisTurn: !!e.thisTurn, turn: state.turnNumber,
			});
		} else if (e.type === 'free-enemy-spells') {
			for (const o of enemies) state.players[o].freeSpellsNextTurn = true;
			emit(state, { type: 'freeSpells', player: pi });
		} else if (e.type === 'draw-discount') {
			// draw card(s) that arrive costing less
			const p = state.players[pi];
			for (let i = 0; i < (e.count || 1); i++) {
				const before = p.hand.length;
				drawCards(state, pi, 1);
				if (p.hand.length > before) {
					const card = p.hand.at(-1);
					card.cost = Math.max(0, card.cost - e.amount);
				}
			}
		} else if (e.type === 'hero-temp-attack') {
			const hta = e.heraldScaled ? hm() : e.value;
			state.players[pi].heroTempAttack += hta;
			emit(state, { type: 'heroBuffed', player: pi, amount: hta });
		} else if (e.type === 'gain-corpses') {
			state.players[pi].corpses += e.value;
			emit(state, { type: 'corpses', player: pi, corpses: state.players[pi].corpses });
		} else if (e.type === 'spend-corpses') {
			const p = state.players[pi];
			if (p.corpses >= e.value) {
				p.corpses -= e.value;
				emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
				execEffects(state, pi, e.effects, target, source);
			}
		} else if (e.type === 'spend-corpses-up-to') {
			// "Spend up to N Corpses / all of your Corpses, X for each spent"
			const p = state.players[pi];
			const n = Math.min(e.max ?? Infinity, p.corpses);
			if (n > 0) {
				p.corpses -= n;
				emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
				for (let i = 0; i < n; i++) execEffects(state, pi, e.effects, target, source);
			}
		} else if (e.type === 'spend-corpses-while') {
			// Corpse Explosion: pay 1 and repeat while any creature survives
			const p = state.players[pi];
			let guard = 100;
			const anyAlive = () => state.players.some(pl => pl.board.some(c => !isDead(c)));
			while (p.corpses >= (e.value || 1) && anyAlive() && guard-- > 0) {
				p.corpses -= e.value || 1;
				emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
				execEffects(state, pi, e.effects, target, source);
				sweepDeaths(state);
			}
		} else if (e.type === 'freeze-random') {
			// freeze a random unfrozen enemy creature
			const pool = [];
			for (const o of enemies) for (const c of state.players[o].board) {
				if (!isDead(c) && !c.frozen) pool.push(c);
			}
			if (pool.length) freezeCreature(state, pool[Math.floor(state.rng() * pool.length)]);
		} else if (e.type === 'grant-recent') {
			// bless the most recently summoned friendly creatures (token riders)
			const recent = state.players[pi].board.slice(-(e.count || 1));
			for (const c of recent) {
				if (isDead(c) || c.keywords.includes(e.keyword)) continue;
				c.keywords.push(e.keyword);
				if (e.keyword === KW.DIVINE_SHIELD) c.shield = true;
				if (e.keyword === KW.STEALTH) c.stealthed = true;
			}
		} else if (e.type === 'scry' || e.type === 'gaze') {
			// Scry = your own deck; Gaze = an opponent's (paper ruling).
			// The chooser's decision resolves asynchronously via resolveScry.
			const deckOwner = e.type === 'scry' ? pi : enemyHero();
			if (deckOwner != null) {
				const od = state.players[deckOwner].deck;
				const ids = [];
				for (let i = 0; i < e.value && od.length; i++) ids.push(od.pop());
				if (ids.length) {
					state.scryQueue.push({ chooser: pi, deckOwner, ids });
					emit(state, { type: 'scryStart', chooser: pi, deckOwner, count: ids.length });
					firePonder(state, pi, { scry: true });
				}
			}
		} else if (e.type === 'dredge') {
			// Dredge: look at the bottom N (default 3) of your deck and put one
			// on top — you don't draw it. The choice resolves via resolveDredge.
			const p = state.players[pi];
			if (!p.eliminated) {
				// bottom of the deck is the front of the array (draws pop the end)
				const ids = p.deck.splice(0, Math.min(e.value || 3, p.deck.length));
				if (ids.length) {
					state.dredgeQueue.push({ player: pi, ids });
					emit(state, { type: 'dredgeStart', player: pi, count: ids.length });
					firePonder(state, pi, { dredge: true });
				}
			}
		} else if (e.type === 'disguise') {
			const t = chosenCreature() || (() => {
				// triggered disguises without a chosen target hide a random friendly
				const pool = state.players[pi].board.filter(c => !isDead(c) && !c.disguised);
				return pool.length ? pool[Math.floor(state.rng() * pool.length)] : null;
			})();
			if (t) disguiseCreature(state, t);
		} else if (e.type === 'summon-random') {
			// "Summon a random creature with Mana Value 2 or less" / "a random
			// Demon" / "a random 4-Cost minion" (exact cost) / Past Conflux's
			// "a random Dragon that costs 5 or more".
			// Steeldancer: costFromWeapon fixes the Cost to your weapon's Attack.
			const exactCost = e.costFromWeapon ? (state.players[pi].weapon ? (state.players[pi].weapon.attack || 0) : 0) : e.cost;
			const pool = Object.values(state.cardsById).filter(d =>
				d.type === 'creature' && (e.maxCost == null || (d.cost || 0) <= e.maxCost)
				&& (e.minCost == null || (d.cost || 0) >= e.minCost)
				&& (exactCost == null || (d.cost || 0) === exactCost)
				&& (e.tribe == null || (d.tribe || '').includes(e.tribe))
				&& (e.rarity == null || d.rarity === e.rarity)
				&& !d.companion && !d.commander && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
			for (let i = 0; i < (e.count || 1) && pool.length; i++) {
				const def = pool[Math.floor(state.rng() * pool.length)];
				const owner = e.forEnemy && enemies.length
					? enemies[Math.floor(state.rng() * enemies.length)] : pi;
				const c = summon(state, owner, def);
				if (c && e.disguise) disguiseCreature(state, c);
				// "...and give it Taunt": grant a keyword to the summoned creature
				if (c && e.grant && !c.keywords.includes(e.grant)) { c.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) c.shield = true; if (e.grant === KW.STEALTH) c.stealthed = true; }
			}
		} else if (e.type === 'add-token') {
			// Fire Fly: a fresh token creature lands in your hand
			const p = state.players[pi];
			if (p.hand.length < MAX_HAND) {
				const card = instantiate({
					id: 'token_' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: e.name, type: 'creature', cost: e.cost || 1, rarity: 'common',
					description: `A ${e.attack}/${e.health} token.`,
					attack: e.attack, health: e.health, tribe: e.tribe || null, token: true,
				}, pi);
				card.zone = 'hand';
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			}
		} else if (e.type === 'plunder') {
			// steal the top card(s) of an opponent's deck into your hand
			const victim = enemyHero();
			if (victim != null) {
				const p = state.players[pi], vd = state.players[victim].deck;
				for (let i = 0; i < (e.value || 1) && vd.length; i++) {
					if (p.hand.length >= MAX_HAND) break;
					const id = vd.pop();
					const card = instantiate(state.cardsById[id], pi);
					card.zone = 'hand';
					p.hand.push(card);
					emit(state, { type: 'plunder', player: pi, victim, card });
				}
			}
		} else if (e.type === 'quickdraw') {
			// Quickdrawn cards return to the deck at end of turn if unplayed
			const p = state.players[pi];
			const before = p.hand.length;
			drawCards(state, pi, e.value);
			for (let i = before; i < p.hand.length; i++) p.hand[i].quickdrawn = true;
			questTick(state, 'quickdraw', pi, Math.max(0, p.hand.length - before));
		} else if (e.type === 'mill') {
			// top of the chosen enemy's deck goes to their graveyard
			const t = enemyHero();
			if (t != null) {
				const op = state.players[t];
				for (let i = 0; i < (e.value || 1); i++) {
					const id = op.deck.pop();
					if (!id) break;
					const milled = instantiate(state.cardsById[id], t);
					milled.zone = 'graveyard';
					op.graveyard.push(milled);
					emit(state, { type: 'mill', player: t, card: milled });
				}
			}
		} else if (e.type === 'gain-mana') {
			state.players[pi].mana.bonus += e.value;
			emit(state, { type: 'manaGained', player: pi, amount: e.value, mana: availableMana(state.players[pi]) });
		} else if (e.type === 'conjure' || e.type === 'conjure-named') {
			// create a random card from outside the game: by color, or by a
			// named theme pool (falling back to any colored card, then anything)
			const p = state.players[pi];
			const defs = Object.values(state.cardsById).filter(d => d.type !== 'land');
			let pool;
			if (e.type === 'conjure') {
				pool = defs.filter(d => d.colors?.includes(e.color));
				if (!pool.length) pool = defs.filter(d => d.colors?.length);
			} else {
				const m = (e.match || '').toLowerCase();
				pool = m ? defs.filter(d => d.name.toLowerCase().includes(m)) : defs.slice();
				// optional narrowing: "a random Frost SPELL" / "a random DRUID card"
				if (e.cardType === 'spell') pool = pool.filter(d => d.type === 'sorcery' || d.type === 'instant');
				else if (e.cardType) pool = pool.filter(d => d.type === e.cardType);
				if (e.cardClass) pool = pool.filter(d =>
					(d.cardClass || 'neutral').split('__').includes(e.cardClass));
				if (e.tribe) pool = pool.filter(d => (d.tribe || '').includes(e.tribe));
				pool = pool.filter(d => !d.token && d.collectible !== false);
				if (!pool.length) pool = defs.filter(d => d.colors?.length);
			}
			if (!pool.length) pool = defs;
			for (let i = 0; i < (e.count || 1) && pool.length; i++) {
				if (p.hand.length >= MAX_HAND) break;
				const def = pool[Math.floor(state.rng() * pool.length)];
				const card = instantiate(def, pi);
				card.zone = 'hand';
				const cmod = e.heraldScaled ? -hm() : (e.costMod || 0);
				if (cmod) card.cost = Math.max(0, (card.cost || 0) + cmod);
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: e.color || null });
				fireEmerge(state, pi, card);
			}
		} else if (e.type === 'boost') {
			// color boost: roll the color's d6 table onto a chosen friendly
			// creature; Chromatic creatures roll twice and keep both
			const t = chosenCreature();
			const table = BOOST_TABLES[e.color] || [];
			if (t && table.length) {
				const rolls = has(t, KW.CHROMATIC) ? 2 : 1;
				for (let i = 0; i < rolls && !isDead(t); i++) {
					const roll = Math.floor(state.rng() * table.length);
					applyRollEntry(state, t, table[roll]);
					emit(state, { type: 'boosted', uid: t.uid, color: e.color, roll: roll + 1, label: table[roll].label, attack: t.attack, hp: hp(t) });
				}
			}
		} else if (e.type === 'destroy-weapon') {
			// hit the chosen enemy's weapon if they have one, else any armed enemy
			const armed = enemies.filter(o => state.players[o].weapon);
			const chosen = target?.type === 'hero' && target.player !== pi ? target.player : null;
			const victim = (chosen != null && state.players[chosen].weapon) ? chosen
				: armed.length ? armed[Math.floor(state.rng() * armed.length)] : null;
			if (victim != null) {
				if (e.gainArmorEqAttack) gainArmor(state, pi, state.players[victim].weapon.attack || 0); // Gluttonous Ooze
				if (e.drawDurability) drawCards(state, pi, state.players[victim].weapon.durability);
				breakWeapon(state, victim, true);
			}
		} else if (e.type === 'buff-weapon') {
			const w = state.players[pi].weapon;
			if (w) {
				w.attack += e.attack || 0;
				w.durability += e.durability || 0;
				emit(state, { type: 'weaponDurability', player: pi, attack: w.attack, durability: w.durability });
			}
		} else if (e.type === 'gain-weapon-attack') {
			const w = state.players[pi].weapon;
			if (w && source) {
				source.attack += w.attack;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
		} else if (e.type === 'equip') {
			const p = state.players[pi];
			if (p.eliminated) continue;
			if (p.weapon) breakWeapon(state, pi, true);
			const w = instantiate({
				id: 'token_' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
				name: e.name, type: 'weapon', cost: 0, rarity: 'common',
				description: `A ${e.attack}/${e.durability} weapon.`,
				attack: e.attack, durability: e.durability,
			}, pi);
			w.zone = 'weapon';
			p.weapon = w;
			emit(state, { type: 'weaponEquip', player: pi, card: w });
			fireOngoing(state, pi, 'weapon-equipped');
		}
	}
	// heals/set-health may have cleared damage: enrage bonuses retract here
	recomputeAuras(state);
}

// ---------- alternative casting costs (pay something INSTEAD of mana) ----------
const landsOfColor = (p, color) => p.lands.filter(l => (l.colors || []).includes(color));
export function canPayMana(state, pi, card) { return availableMana(state.players[pi]) >= effectiveCost(state, pi, card); }
export function canPayAlt(state, pi, card) {
	const a = card.altCost; if (!a) return false;
	const p = state.players[pi];
	if (a.require) {
		if (a.require.land && !p.lands.some(l => (l.colors || []).includes(a.require.land))) return false;
		if (a.require.notYourTurn && state.current === pi) return false;
	}
	if (a.life && p.life <= a.life) return false; // won't pay life you can't survive
	if (a.sacrificeLand && landsOfColor(p, a.sacrificeLand.color).length < a.sacrificeLand.count) return false;
	if (a.exileFromHand && p.hand.filter(c => c !== card && (c.colors || []).includes(a.exileFromHand.color)).length < a.exileFromHand.count) return false;
	return true;
}
function payAlt(state, pi, card) {
	const a = card.altCost, p = state.players[pi];
	if (a.life) { p.life -= a.life; emit(state, { type: 'lifePaid', player: pi, amount: a.life, life: p.life }); }
	if (a.sacrificeLand) for (let k = 0; k < a.sacrificeLand.count; k++) {
		const idx = p.lands.findIndex(l => (l.colors || []).includes(a.sacrificeLand.color));
		if (idx >= 0) { const [land] = p.lands.splice(idx, 1); emit(state, { type: 'landSacrificed', player: pi, card: land }); }
	}
	if (a.exileFromHand) for (let k = 0; k < a.exileFromHand.count; k++) {
		const idx = p.hand.findIndex(c => c !== card && (c.colors || []).includes(a.exileFromHand.color));
		if (idx >= 0) { const [c] = p.hand.splice(idx, 1); c.zone = 'exile'; p.exile.push(c); emit(state, { type: 'exileCard', player: pi, card: c }); }
	}
	if (a.opponentGain) for (const o of opponentsOf(state, pi)) healHero(state, o, a.opponentGain);
}

// ---------- additional casting costs (sacrifice / discard as a cost) ----------
// the permanents pi could sacrifice to satisfy an additional cost of `kind`
function sacPool(state, pi, kind) {
	const p = state.players[pi];
	const creatures = p.board.filter(c => c.type === 'creature' && !isDead(c));
	if (kind === 'creature') return creatures;
	if (kind === 'artifact') return [...p.artifacts];
	if (kind === 'artifact-or-creature') return [...creatures, ...p.artifacts];
	return [];
}
function canPayAddCost(state, pi, card) {
	const ac = card.addCost, p = state.players[pi];
	if (ac.discard) return p.hand.filter(c => c !== card).length >= ac.discard;
	if (ac.sacrifice === 'land') return p.lands.length >= 1;
	if (ac.sacrifice) return sacPool(state, pi, ac.sacrifice).length >= 1;
	return true;
}
// sacrifice one chosen permanent as a cost (bypasses indestructible; fires deathrattles via sweep)
function sacrificeAsCost(state, pi, card) {
	const p = state.players[pi];
	if (p.board.includes(card)) {
		card.sacrificed = true; card.damage = card.maxHealth; card.shield = false;
		emit(state, { type: 'destroy', uid: card.uid });
		sweepDeaths(state);
	} else if (p.artifacts.includes(card)) {
		p.artifacts = p.artifacts.filter(c => c !== card);
		emit(state, { type: 'tokenSacrificed', player: pi, card });
		recomputeAuras(state);
	}
}
// resolve an additional-cost spell off the stack once its cost is paid (mirrors resolveStackedSpell's tail)
function resolveAddCostSpell(state, pi, card, target, choice) {
	state.exactKills = 0;
	runSpell(state, pi, card, target, choice);
	if (card.honorableKill && state.exactKills > 0) execEffects(state, pi, card.honorableKill, target, card);
	fireOngoing(state, pi, 'spell-played', { played: card });
	if (target && target.type === 'creature') fireOngoing(state, pi, 'spell-cast-on-creature', { played: card }); // Sethekk Veilweaver
	firePlaneTrigger(state, 'spell-cast', pi);
	for (let s2 = 0; s2 < state.players.length; s2++) {
		fireOngoing(state, s2, 'any-spell-played', { spell: card, caster: pi });
		if (s2 !== pi) fireOngoing(state, s2, 'enemy-spell-played', { spell: card, caster: pi });
	}
	toGraveyard(state, pi, card);
	sweepDeaths(state);
	checkGameOver(state);
}
// pay a spell's additional cost, then resolve it (synchronously, or via a pick queue)
function payAddCost(state, pi, card, target, choice) {
	const p = state.players[pi], ac = card.addCost, cont = { card, target, choice };
	if (ac.discard) {
		const n = Math.min(ac.discard, p.hand.length);
		if (n > 0) { state.discardQueue.push({ player: pi, count: n, addCostSpell: cont }); emit(state, { type: 'lootStart', player: pi, count: n }); return; }
	} else if (ac.sacrifice === 'land') {
		if (p.lands.length) { const [land] = p.lands.splice(p.lands.length - 1, 1); emit(state, { type: 'landSacrificed', player: pi, card: land }); }
	} else if (ac.sacrifice) {
		const pool = sacPool(state, pi, ac.sacrifice);
		if (pool.length > 1) { state.sacQueue.push({ player: pi, kind: ac.sacrifice, uids: pool.map(c => c.uid), addCostSpell: cont }); emit(state, { type: 'sacStart', player: pi, kind: ac.sacrifice }); return; }
		if (pool.length === 1) sacrificeAsCost(state, pi, pool[0]);
	}
	resolveAddCostSpell(state, pi, card, target, choice);
}
// resolve the oldest pending sacrifice-as-cost with the chosen permanent
export function resolveSac(state, uid) {
	const pend = state.sacQueue.shift();
	if (!pend) return false;
	const pool = sacPool(state, pend.player, pend.kind);
	const card = pool.find(c => c.uid === uid) || pool[0];
	if (card) sacrificeAsCost(state, pend.player, card);
	if (pend.addCostSpell) { const { card: spell, target, choice } = pend.addCostSpell; resolveAddCostSpell(state, pend.player, spell, target, choice); }
	// activated ability whose cost was "sacrifice a <creature>": now run its effects
	if (pend.sacAbility) { const s = pend.sacAbility; execEffects(state, s.pi, s.effects, s.target, null); sweepDeaths(state); checkGameOver(state); }
	return true;
}

function runSpell(state, pi, card, target, choice) {
	execEffects(state, pi, liveEffectsOf(state, pi, card, choice), target, card);
	// Outcast: extra spell effects when cast from the edge of hand
	if (card.outcast && card._outcast) { execEffects(state, pi, card.outcast.effects, target, card); fireOngoing(state, pi, 'outcast-played', { played: card }); } // Redeemed Pariah reacts
	// scripted text
	switch (card.id) {
		case 'natures_blessing': drawCards(state, pi, 1); break;
		case 'fortify': {
			const t = target && findCreature(state, target.uid);
			if (t) {
				t.maxHealth += 3;
				if (!has(t, KW.TAUNT)) t.keywords.push(KW.TAUNT);
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
			break;
		}
		case 'rallying_cry':
			for (const c of state.players[pi].board) {
				c.attack += 1; c.maxHealth += 1;
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
			break;
		case 'wild_growth': summon(state, pi, TOKENS.animal); summon(state, pi, TOKENS.animal); break;
		case 'mark_target': {
			const t = target && findCreature(state, target.uid);
			if (t) { t.marked = true; t.markedBy = pi; emit(state, { type: 'marked', uid: t.uid }); }
			break;
		}
		case 'regroup': drawCards(state, pi, state.players[pi].diedThisTurn); break;
	}
}

// ---------- spell schools ----------
// every spell belongs to a school; it is stored in the card's `tribe` field
// (e.g. a "Sorcery — Frost" imports with tribe 'Frost'). Triggers that care
// about a school ("after you cast a Frost spell") match via the tribe condition.
export const SPELL_SCHOOLS = ['Arcane', 'Fel', 'Fire', 'Frost', 'Holy', 'Nature', 'Shadow', 'Song'];
export function schoolOf(card) {
	return isSpellType(card) && SPELL_SCHOOLS.includes(card.tribe) ? card.tribe : null;
}

// ---------- cost modifiers ----------
const isSpellType = card => card.type === 'sorcery' || card.type === 'instant' || card.type === 'secret' || card.type === 'trap';
const costTypeMatches = (card, t) => t === 'all'
	|| (t === 'spell' ? isSpellType(card)
		: t === 'noncreature' ? (card.type !== 'creature' && card.type !== 'land') // Thalia
		: card.type === t);

// a live one-shot discount usable on this card right now, or -1
function discountIndex(state, p, card) {
	return (p.costDiscounts || []).findIndex(d =>
		(!d.thisTurn || d.turn === state.turnNumber)
		&& costTypeMatches(card, d.cardType)
		&& (!d.tribe || (card.tribe || '').includes(d.tribe)));
}

// what the card actually costs after self-scaling printed costs (Giants),
// board cost auras (Sorcerer's Apprentice / Mana Wraith), one-shot riders
// (Preparation / Far Sight-style live on card.cost itself), and Millhouse
// the active arena plane's continuous static rule (or null)
function activePlaneRule(state) {
	const pd = state.plane ? state.cardsById[state.plane] : null;
	return pd && pd.staticRule ? pd.staticRule : null;
}
// the active plane's continuous trigger fires effects for player `pi` on an
// event (turn-start, creature-died, spell-cast) — Oberaqua, Takenuma, etc.
function firePlaneTrigger(state, when, pi) {
	const r = activePlaneRule(state);
	if (r && r.kind === 'trigger' && r.on === when && r.effects && pi != null
		&& state.players[pi] && !state.players[pi].eliminated && !state.over) {
		execEffects(state, pi, r.effects, null, null);
	}
}

// Primordia: when you play a creature you may sacrifice an artifact for +2/+2.
// Auto-resolves by spending a spare token artifact (never a hand-made one).
function applyPlaneOnCreaturePlayed(state, pi, card) {
	const r = activePlaneRule(state);
	if (!r || r.kind !== 'sac-artifact-buff' || !card || card.zone !== 'board' || isDead(card)) return;
	const p = state.players[pi];
	const tok = p.artifacts.find(a => a.token && a.sac);
	if (!tok) return;
	p.artifacts = p.artifacts.filter(a => a !== tok);
	toGraveyard(state, pi, tok);
	emit(state, { type: 'tokenSacrificed', player: pi, card: tok });
	card.attack += r.attack || 0;
	card.maxHealth += r.health || 0;
	emit(state, { type: 'buff', uid: card.uid, attack: card.attack, hp: hp(card) });
}

export function effectiveCost(state, pi, card) {
	const p = state.players[pi];
	let c = card.cost;
	if (card.selfCost) {
		let n = 0;
		if (card.selfCost.per === 'other-creatures') {
			for (const pl of state.players) n += pl.board.filter(x => !isDead(x) && x !== card).length;
		} else if (card.selfCost.per === 'hand-others') {
			n = Math.max(0, p.hand.length - (p.hand.includes(card) ? 1 : 0));
		} else if (card.selfCost.per === 'own-damage') {
			n = Math.max(0, STARTING_LIFE - p.life);
		} else if (card.selfCost.per === 'weapon-attack') {
			n = p.weapon ? p.weapon.attack : 0;
		} else if (card.selfCost.per === 'deaths-this-turn') {
			n = state.diedThisTurn || 0;
		} else if (card.selfCost.per === 'spells-this-game') {
			n = p.spellsPlayedTotal || 0;
		} else if (card.selfCost.per === 'si7-played') {
			n = p.si7PlayedGame || 0; // SI:7 Assassin
		} else if (card.selfCost.per === 'board-power') {
			n = p.board.reduce((s, x) => isDead(x) ? s : s + (x.attack || 0), 0); // Ghalta
		} else if (card.selfCost.per === 'hero-powers-game') {
			n = p.heroPowersUsedGame || 0; // Frost Giant
		} else if (card.selfCost.per === 'artifacts') {
			n = p.artifacts.length; // Affinity for artifacts (Treasures/Clues/Food count)
		}
		c += card.selfCost.amount * n;
	}
	for (const pl of state.players) {
		for (const src of [...pl.board, ...pl.enchantments, ...pl.artifacts, ...pl.emblems]) {
			const m = src.costMod;
			if (!m || (src.zone === 'board' && isDead(src))) continue;
			if (m.scope === 'enemies' ? pl === p : (m.scope !== 'all' && pl !== p)) continue;
			if (!costTypeMatches(card, m.cardType)) continue;
			if (m.tribe && !(card.tribe || '').includes(m.tribe)) continue;
			if (m.minCost != null && card.cost < m.minCost) continue;
			if (m.firstEachTurn && (m.cardType === 'spell'
				? p.spellsPlayedThisTurn : p.creaturesPlayedThisTurn) > 0) continue;
			if (m.setCost != null) { c = m.setCost; continue; } // Naga Sea Witch: your cards cost N
			const before = c;
			c += m.amount;
			// "but not less than (1)": the reduction stops at the floor
			if (m.floor != null) c = Math.max(Math.min(before, m.floor), c);
		}
	}
	const di = discountIndex(state, p, card);
	if (di >= 0) {
		const d = p.costDiscounts[di];
		c = d.setZero ? 0 : c + d.amount;
	}
	// arena plane cost rule: Zendikar (enchant -1), Alkabah (4-cost spells -> 0)
	const planeR = activePlaneRule(state);
	if (planeR && planeR.kind === 'cost' && costTypeMatches(card, planeR.cardType)
		&& (planeR.cost == null || card.cost === planeR.cost)) {
		c = planeR.setZero ? 0 : c + (planeR.amount || 0);
	}
	if (p.freeSpellsThisTurn && isSpellType(card)) c = 0;
	if (p.spellsCostOneThisTurn && isSpellType(card)) c = Math.min(c, 1); // Ysiel Windsinger
	if (p.nextMurlocFree && card.type === 'creature' && (card.tribe || '').includes('Murloc')) c = 0; // Seadevil Stinger (Health-cost approximated as free)
	if (p.nextSecretCost != null && card.secret) c = Math.min(c, p.nextSecretCost); // Kabal Lackey
	// Reckless Experimenter: your Deathrattle creatures cost less
	if (card.type === 'creature' && (card.keywords || []).includes('deathrattle')) {
		const disc = p.board.reduce((s, x) => (!isDead(x) && x.deathrattleDiscount) ? s + x.deathrattleDiscount : s, 0);
		if (disc) c = Math.max(0, c - disc);
	}
	if (p.spellTaxNext > 0 && isSpellType(card)) c += p.spellTaxNext; // Loatheb
	if (p.nextComboDiscount > 0 && card.combo) c = Math.max(0, c - p.nextComboDiscount); // Foxy Fraud
	if (p.nextCardsDiscount && p.nextCardsDiscount.count > 0) c = Math.max(0, c - p.nextCardsDiscount.amount); // Scabbs Cutterbutter
	if ((card.keywords || []).includes('outcast')) { const r = p.board.filter(x => x.outcastCostReduce && !isDead(x)).reduce((s, x) => s + x.outcastCostReduce, 0); if (r) c = Math.max(0, c - r); } // Line Hopper
	if (!card.fromDeck) { const r = p.board.filter(x => x.foreignCostReduce && !isDead(x)).reduce((s, x) => s + x.foreignCostReduce, 0); if (r) c = Math.max(1, c - r); } // Arcane Luminary: not below 1
	{ const sch = schoolOf(card); if (sch) { const r = p.board.filter(x => x.schoolCostReduce && x.schoolCostReduce.school === sch && !isDead(x)).reduce((s, x) => s + x.schoolCostReduce.amount, 0); if (r) c = Math.max(0, c - r); } } // Lady Anacondra: Nature spells
	if (p.battlecryTaxNext > 0 && (card.keywords || []).includes('battlecry')) c += p.battlecryTaxNext; // Boompistol Bully
	if (p.libramDiscount > 0 && /Libram/.test(card.name || '')) c = Math.max(0, c - p.libramDiscount); // Aldor Attendant/Truthseeker
	return Math.max(0, c);
}

// ---------- public actions ----------
export function canPlay(state, pi, card) {
	if (state.over) return false;
	if (card.type === 'instant') { if (!hasPriority(state, pi)) return false; }
	else if (!(state.current === pi && state.priority == null && state.stack.length === 0)) return false;
	if (availableMana(state.players[pi]) < effectiveCost(state, pi, card) && !(card.altCost && canPayAlt(state, pi, card))) return false;
	{ const pb = state.players[pi].parityBlock; if (pb && ((card.cost % 2 === 1 ? 'odd' : 'even') === pb)) return false; }
	if (card.type === 'secret') {
		const p = state.players[pi];
		if (p.secrets.length >= MAX_SECRETS) return false;
		if (p.secrets.some(s => s.id === card.id)) return false; // no duplicate secrets
	}
	if (card.type === 'trap' && state.players[pi].traps.length >= MAX_TRAPS) return false;
	// lands are never hand-played anymore: they come from the slot shop
	if (card.type === 'land') return false;
	if (card.type === 'heropower' && state.players[pi].heroPowers.length >= MAX_HERO_POWERS) return false;
	if (card.type === 'quest') {
		const p = state.players[pi];
		if (p.quests.length >= MAX_QUESTS) return false;
		if (p.quests.some(q => q.id === card.id)) return false; // no duplicate quests
	}
	const spec = targetSpec(state, pi, card);
	if (spec && spec.required && legalTargets(state, pi, spec).length === 0) return false;
	if (card.addCost && !canPayAddCost(state, pi, card)) return false; // must be able to pay the extra cost
	return true;
}

// Corrupt: a card in hand upgrades when you play a card that costs MORE than it.
// One-shot cards swap to their corrupted form (`corrupt` def); endless ones
// (`corruptGrow`) gain +stats in place and stay corruptible. All eligible Corrupt
// cards in hand corrupt from a single costlier play.
function corruptHandCards(state, pi, playedCost) {
	const p = state.players[pi];
	for (let i = 0; i < p.hand.length; i++) {
		const c = p.hand[i];
		if (!c.corrupt && !c.corruptGrow) continue;
		if (playedCost <= effectiveCost(state, pi, c)) continue;
		if (c.corruptGrow) {
			c.attack = Math.max(0, c.attack + (c.corruptGrow.attack || 0));
			c.maxHealth += c.corruptGrow.health || 0;
			emit(state, { type: 'corrupted', player: pi, uid: c.uid, endless: true, name: c.name });
		} else {
			const def = state.cardsById[c.corrupt];
			if (!def) continue;
			const ni = instantiate(def, pi);
			ni.zone = 'hand';
			p.hand[i] = ni;
			emit(state, { type: 'corrupted', player: pi, fromUid: c.uid, uid: ni.uid, name: ni.name });
		}
	}
}

export function playCard(state, pi, cardUid, target, choice, position, useAlt, kicked) {
	const p = state.players[pi];
	// cards play from hand, the companion zone, or the command zone
	let card = null, take = null;
	const idx = p.hand.findIndex(c => c.uid === cardUid);
	// Outcast: a bonus if this was the left- or right-most card in hand when played
	const outcastActive = idx >= 0 && (idx === 0 || idx === p.hand.length - 1);
	const wasRightmost = idx >= 0 && idx === p.hand.length - 1; // Stargazer Luna
	if (idx >= 0) { card = p.hand[idx]; take = () => p.hand.splice(idx, 1); card._outcast = outcastActive; }
	else if (p.companion?.uid === cardUid) { card = p.companion; take = () => { p.companion = null; }; }
	else {
		const ci = p.command.findIndex(c => c.uid === cardUid);
		if (ci >= 0) { card = p.command[ci]; take = () => p.command.splice(ci, 1); }
	}
	if (!card) return false;
	if (!canPlay(state, pi, card)) return false;
	// Corrupt compares the cost of the card being played (captured before its own
	// discounts are consumed) against each Corrupt card still in hand.
	const playedCost = effectiveCost(state, pi, card);
	if (card.combo && p.nextComboDiscount > 0) p.nextComboDiscount = 0; // Foxy Fraud discount is spent by the next Combo card
	if (p.nextCardsDiscount && p.nextCardsDiscount.count > 0) { p.nextCardsDiscount.count -= 1; if (p.nextCardsDiscount.count <= 0) p.nextCardsDiscount = null; } // Scabbs: consumed per card
	if (card.stiltReward) { p.heroTempAttack += card.stiltReward; emit(state, { type: 'heroAttack', player: pi, attack: heroAttackValue(p) }); card.stiltReward = 0; } // Stiltstepper
	if (card.edwinReward) { const ed = p.board.find(x => x.uid === card.edwinUid && !isDead(x)); if (ed) { ed.attack += card.edwinReward; ed.maxHealth += card.edwinReward; emit(state, { type: 'buff', uid: ed.uid, attack: ed.attack, hp: hp(ed) }); } card.edwinReward = 0; } // Edwin, Defias Kingpin
	if (typeof card.id === 'string' && card.id.endsWith('_corrupted')) (p.corruptedPlayedIds = p.corruptedPlayedIds || []).push(card.id); // Y'Shaarj tracks Corrupted cards played
	if (/^SI:7/.test(card.name || '')) p.si7PlayedGame = (p.si7PlayedGame || 0) + 1; // SI:7 Informant
	if (card.overload) fireOngoing(state, pi, 'overload-card-played', { played: card }); // Spirit Alpha
	if (p.copycatFor != null && state.cardsById[card.id]) { const cc = state.players[p.copycatFor]; if (cc && cc.hand.length < MAX_HAND) { const nc = instantiate(state.cardsById[card.id], p.copycatFor); nc.zone = 'hand'; cc.hand.push(nc); emit(state, { type: 'conjure', player: p.copycatFor, card: nc, color: null }); } p.copycatFor = null; } // Copycat
	// Ward: targeting an enemy warded creature costs extra — unaffordable = illegal
	const ward = wardOf(state, pi, target);
	if (ward?.mana && availableMana(p) < effectiveCost(state, pi, card) + ward.mana) return false;

	take();
	if (ward) payWard(state, pi, target);
	card._kicked = false;
	if (kicked && card.kicker && availableMana(p) >= effectiveCost(state, pi, card) + card.kicker.cost) {
		card._kicked = true; // paid the base cost + the kicker
		spendMana(p, effectiveCost(state, pi, card) + card.kicker.cost);
	} else if (card.altCost && canPayAlt(state, pi, card) && (useAlt || availableMana(p) < effectiveCost(state, pi, card))) {
		payAlt(state, pi, card); // paid the alternative cost instead of mana (chosen, or forced when mana is short)
	} else if (card.xSpell) {
		// X-spells drink every remaining point; X = what's left after the base cost
		card.xValue = Math.max(0, availableMana(p) - effectiveCost(state, pi, card));
		spendMana(p, availableMana(p));
	} else {
		spendMana(p, effectiveCost(state, pi, card));
	}
	// a matching one-shot discount is spent by this play
	const usedDiscount = discountIndex(state, p, card);
	if (usedDiscount >= 0) p.costDiscounts.splice(usedDiscount, 1);
	if (card.overload) {
		p.overloadPending += card.overload;
		emit(state, { type: 'overload', player: pi, amount: card.overload });
		fireOngoing(state, pi, 'overloaded-self', { amount: card.overload }); // Tunnel Trogg
	}
	emit(state, { type: 'play', player: pi, card, mana: availableMana(p) });
	// history for Tess Greymane (other-class cards) and Shudderwock (Battlecries)
	if (card.cardClass && card.cardClass !== 'neutral' && card.cardClass !== p.heroClass && card.id !== 'tess_greymane') p.otherClassPlayedGame.push(card.id);
	if ((card.keywords || []).includes('battlecry') && card.effects && card.id !== 'shudderwock') p.battlecriesPlayedGame.push(card.id);
	fireOngoing(state, pi, 'card-played', { played: card });
	if (wasRightmost) fireOngoing(state, pi, 'rightmost-card-played', { played: card }); // Stargazer Luna
	if (card.combo) fireOngoing(state, pi, 'combo-card-played', { played: card }); // Whirlkick Master
	if (!card.token) (p.cardsPlayedThisTurnIds = p.cardsPlayedThisTurnIds || []).push(card.id); // Murozond the Infinite
	for (const o of opponentsOf(state, pi)) fireOngoing(state, o, 'enemy-card-played', { played: card, caster: pi }); // Fel Reaver
	corruptHandCards(state, pi, playedCost);
	// Patches the Pirate: playing a Pirate pulls Patches out of your deck
	if (card.type === 'creature' && (card.tribe || '').includes('Pirate') && card.id !== 'patches_the_pirate') {
		const idx = p.deck.indexOf('patches_the_pirate');
		if (idx >= 0) { p.deck.splice(idx, 1); summon(state, pi, state.cardsById['patches_the_pirate']); }
		// Parachute Brigand: playing a Pirate summons Parachute Brigand out of your hand
		if (card.id !== 'parachute_brigand') { const pb = p.hand.find(c => c.id === 'parachute_brigand'); if (pb && p.board.filter(c => !isDead(c)).length < 7) { p.hand = p.hand.filter(c => c !== pb); pb.zone = 'board'; pb.sick = true; p.board.push(pb); emit(state, { type: 'summon', player: pi, card: pb }); fireOngoing(state, pi, 'summoned', { minion: pb }); recomputeAuras(state); } }
	}
	// one-shot "next X" discounts are spent when the matching card is played
	if (card.type === 'creature' && (card.tribe || '').includes('Murloc')) p.nextMurlocFree = false;
	if (card.secret) { p.nextSecretCost = null; fireOngoing(state, pi, 'secret-played', { secret: card }); } // Professor Putricide
	// Un'Goro Elemental synergy: track that you played an Elemental this turn
	if (card.type === 'creature' && (card.tribe || '').includes('Elemental')) { p.elementalThisTurn = true; p.elementalsPlayedGame = (p.elementalsPlayedGame || 0) + 1; }

	if (card.type === 'creature' && card.magnetic && target?.type === 'creature'
		&& (() => { const t = findCreature(state, target.uid);
			return t && t.controller === pi && !isDead(t) && (t.tribe || '').includes('Mech'); })()) {
		// Magnetic: merge onto the chosen friendly Mech instead of entering play
		const t = findCreature(state, target.uid);
		t.attack += card.attack;
		t.maxHealth += card.maxHealth;
		for (const k of card.keywords) {
			if (k === 'battlecry' || t.keywords.includes(k)) continue;
			t.keywords.push(k);
			if (k === KW.DIVINE_SHIELD) t.shield = true;
			if (k === KW.STEALTH) t.stealthed = true;
		}
		if (card.deathrattle) {
			t.deathrattle = [...(t.deathrattle || []), ...card.deathrattle];
			if (!t.keywords.includes('deathrattle')) t.keywords.push('deathrattle');
		}
		if (card.ongoing && !t.ongoing) t.ongoing = JSON.parse(JSON.stringify(card.ongoing));
		p.creaturesPlayedThisTurn++;
		emit(state, { type: 'magnetized', player: pi, uid: t.uid, name: card.name,
			attack: t.attack, hp: hp(t) });
		recomputeAuras(state);
	} else if (card.type === 'creature') {
		card.zone = 'board';
		card.sick = true;
		// position = insertion index (adjacency matters); default = right end
		if (position == null || position >= p.board.length) p.board.push(card);
		else p.board.splice(Math.max(0, position), 0, card);
		p.creaturesPlayedThisTurn++;
		questTick(state, 'summon', pi, 1, card);
		if (card.dormantLeft > 0) {
			// Dormant creatures sleep through everything until they wake
			emit(state, { type: 'dormant', player: pi, uid: card.uid, turns: card.dormantLeft }); if (card.dormantBattlecry) runBattlecry(state, pi, card, target, choice); /* The Darkness fires its Battlecry while dormant */
		} else {
			summonColossalParts(state, pi, card); // appendages enter before the battlecry
			fireOngoing(state, pi, 'summoned', { minion: card });
			growBlubberBaron(state, pi, card);
			runBattlecry(state, pi, card, target, choice);
			if ((card.keywords || []).includes('battlecry') && card.effects) { if (!p.firstBattlecryThisTurn) p.firstBattlecryThisTurn = { effects: JSON.parse(JSON.stringify(card.effects)), target }; fireOngoing(state, pi, 'battlecry-minion-played', { minion: card }); p.lastBattlecryThisGame = { effects: JSON.parse(JSON.stringify(card.effects)), target }; } // Bolner Hammerbeak / Brilliant Macaw
				if (p.board.includes(card)) fireSecretsAll(state, pi, 'enemy-minion-played', { minion: card });
			// opponents' ongoing reactions to you playing a creature (Holomancer / Harbinger Celestia)
			if (p.board.includes(card) && !isDead(card)) for (const o of opponentsOf(state, pi)) fireOngoing(state, o, 'enemy-creature-played', { minion: card });
			if (p.board.includes(card) && !isDead(card)) fireOngoing(state, pi, 'creature-played', { minion: card });
				if ((card.keywords || []).includes('battlecry') || card.combo) fireOngoing(state, pi, 'battlecry-or-combo-played', { played: card }); // Field Contact
			// Grand Lackey Erkh: after you play a Lackey
			if (p.board.includes(card) && !isDead(card) && typeof card.id === 'string' && card.id.startsWith('lackey_')) fireOngoing(state, pi, 'lackey-played', { minion: card });
			// Swamp King Dred: after an opponent plays a creature, Dred attacks it
			if (p.board.includes(card) && !isDead(card)) {
				for (const o of opponentsOf(state, pi)) {
					for (const dred of state.players[o].board.filter(c => c.id === 'swamp_king_dred' && !isDead(c))) {
						if (p.board.includes(card) && !isDead(card) && !isDead(dred)) resolveCombat(state, o, dred.uid, { type: 'creature', uid: card.uid, player: pi });
					}
				}
			}
			applyPlaneOnCreaturePlayed(state, pi, card);
		}
	} else if (card.type === 'location') {
		// locations sit in the creature row (adjacency counts them as neighbors)
		// but tap like lands and wear out after `durability` uses
		card.zone = 'board';
		if (position == null || position >= p.board.length) p.board.push(card);
		else p.board.splice(Math.max(0, position), 0, card);
		emit(state, { type: 'locationPlayed', player: pi, card });
		runBattlecry(state, pi, card, target, choice);
	} else if (card.type === 'weapon') {
		if (p.weapon) breakWeapon(state, pi, true); // replaced
		card.zone = 'weapon';
		p.weapon = card;
		emit(state, { type: 'weaponEquip', player: pi, card });
		recomputeAuras(state); // Southsea Deckhand gains conditional Charge
		fireOngoing(state, pi, 'weapon-equipped');
		runBattlecry(state, pi, card, target);
	} else if (card.type === 'secret') {
		card.zone = 'secret';
		p.secrets.push(card);
		emit(state, { type: 'secretPlayed', player: pi, card });
	} else if (card.type === 'trap') {
		card.zone = 'trap';
		p.traps.push(card);
		emit(state, { type: 'trapSet', player: pi, card });
	} else if (card.type === 'land') {
		card.zone = 'land';
		p.lands.push(card);
		p.landsPlayedThisTurn++;
		emit(state, { type: 'landPlayed', player: pi, card });
		runBattlecry(state, pi, card, target); // on-play land effects
		questTick(state, 'land', pi);
	} else if (card.type === 'heropower') {
		card.zone = 'heropower';
		p.heroPowers.push(card);
		emit(state, { type: 'heroPowerInstalled', player: pi, card });
	} else if (card.type === 'hero') {
		// Hero cards: gain Armor, run the Battlecry, and ADD their Hero Power to a
		// free slot (this game keeps your original Hero Power — it isn't replaced).
		if (card.armor) gainArmor(state, pi, card.armor);
		emit(state, { type: 'heroPlayed', player: pi, card });
		if (card.effects) execEffects(state, pi, card.effects, target, card);
		if (card.power && p.heroPowers.length < MAX_HERO_POWERS) {
			const hpCard = instantiate({
				id: card.id + '_power', name: card.power.name, type: 'heropower', cost: 0, rarity: 'basic',
				power: { cost: card.power.cost, effects: card.power.effects || null, choices: card.power.choices || null },
				description: `Hero Power (${card.power.cost}): ${card.power.text || ''}`, cardClass: card.cardClass,
			}, pi);
			hpCard.zone = 'heropower';
			p.heroPowers.push(hpCard);
			emit(state, { type: 'heroPowerInstalled', player: pi, card: hpCard });
		}
		toGraveyard(state, pi, card); // the hero card itself is spent
	} else if (card.type === 'quest') {
		card.zone = 'quest';
		p.quests.push(card);
		emit(state, { type: 'questStarted', player: pi, card });
	} else if (card.type === 'enchantment' || card.type === 'artifact') {
		card.zone = card.type;
		(card.type === 'enchantment' ? p.enchantments : p.artifacts).push(card);
		recomputeAuras(state);
		if (card.effects) execEffects(state, pi, card.effects, target, card); // permanent battlecries
		if (card.type === 'enchantment') fireOngoing(state, pi, 'enchantment-played', { played: card });
		if (card.equip) fireOngoing(state, pi, 'equipment-entered', { equip: card }); // Puresteel Paladin
	} else if (card.type === 'planeswalker') {
		card.zone = 'planeswalker';
		p.planeswalkers.push(card);
		emit(state, { type: 'walkerArrived', player: pi, card });
	} else {
		questTick(state, 'spell', pi);
		p.spellsPlayedThisTurn++;
		{ const sch = schoolOf(card); if (sch) { (p.schoolsCastThisTurn = p.schoolsCastThisTurn || {})[sch] = true; (p.schoolsCastGame = p.schoolsCastGame || {})[sch] = true; if (sch === 'Fel') (p.felSpellsGame = p.felSpellsGame || []).push(card.id); } } // Metamorfin / Multicaster / Jace Darkweaver
		if ((card.cost || 0) >= 6) p.lastBigSpell = { id: card.id, target }; // Grey Sage Parrot
		p.spellsPlayedTotal = (p.spellsPlayedTotal || 0) + 1; // Arcane Giant
		if ((card.cost || 0) >= 5) p.bigSpellsGame = (p.bigSpellsGame || 0) + 1; // Dragoncaller Alanna
		(p.spellsPlayedThisTurnIds = p.spellsPlayedThisTurnIds || []).push(card.id); // Krag'wa, the Frog
		// Lynessa Sunsorrow: remember spells you cast on your own creatures
		if (target && target.type === 'creature') { const tc = findCreature(state, target.uid); if (tc && tc.controller === pi) (p.spellsOnFriendly = p.spellsOnFriendly || []).push(card.id); }
		// additional-cost spells pay the extra cost first (off-stack), then resolve
		if (card.addCost) payAddCost(state, pi, card, target, choice);
		// The Stack: opponents get priority to respond (an instant/Counter) before this
		// resolves. If none can respond it resolves at once (the common path).
		else stackSpell(state, pi, card, target, choice);
	}
	// Echo cards trigger Mistwraith-style payoffs each time they're played
	if (card.echo) fireOngoing(state, pi, 'echo-played', { played: card });
	// Echo: a ghost copy slips into hand, playable until the turn ends
	if (card.echo && !p.eliminated && p.hand.length < MAX_HAND && !state.over) {
		const def = state.cardsById[card.id];
		if (def) {
			const ghost = instantiate(def, pi);
			ghost.zone = 'hand';
			ghost.echoGhost = true;
			p.hand.push(ghost);
			emit(state, { type: 'conjure', player: pi, card: ghost, color: null });
		}
	}
	// Miniaturize (user ruling): a 1/1 copy costing 1, with the Mini keyword
	if (card.miniaturize && !p.eliminated && p.hand.length < MAX_HAND && !state.over) {
		const def = state.cardsById[card.id];
		if (def) {
			const mini = instantiate(def, pi);
			mini.zone = 'hand';
			mini.attack = 1;
			mini.maxHealth = 1;
			mini.cost = 1;
			mini.miniaturize = false; // minis don't spawn more minis
			if (!mini.keywords.includes('mini')) mini.keywords.push('mini');
			p.hand.push(mini);
			emit(state, { type: 'conjure', player: pi, card: mini, color: null });
		}
	}
	questTick(state, 'play', pi, 1, card); // "Play N cards" quests
	// counted AFTER resolution so Combo sees only cards played EARLIER this turn
	p.cardsPlayedThisTurn++;
	// Sherazin, Corpse Flower: play 4 cards in a turn to revive the seed
	if (p.cardsPlayedThisTurn >= 4) {
		for (const seed of p.board.filter(c => c.id === 'sherazin_seed' && !isDead(c))) {
			const rev = instantiate(state.cardsById['sherazin'], pi);
			rev.zone = 'board'; p.board[p.board.indexOf(seed)] = rev; seed.zone = 'gone';
			emit(state, { type: 'transformed', uid: seed.uid, player: pi, from: 'Sherazin, Seed', card: rev });
		}
	}
	sweepDeaths(state);
	return true;
}

// resolve a spell (non-counter) that was on the stack: secrets, effects, triggers
function resolveStackedSpell(state, entry) {
	const { card, caster: pi, target, choice } = entry;
	const ctx = { spell: card, countered: false, target };
	fireSecretsAll(state, pi, 'enemy-spell-cast', ctx); // Counterspell/Spellbender secrets
	if (ctx.countered) emit(state, { type: 'countered', player: pi, name: card.name });
	else {
		state.exactKills = 0;
		runSpell(state, pi, card, ctx.target, choice);
		// Dragonkin Sorcerer: "whenever you target this creature with a spell"
		if (ctx.target?.type === 'creature') {
			const tc = findCreature(state, ctx.target.uid);
			if (tc && tc.controller === pi && !isDead(tc)) {
				const spellTrigs = [];
				if (tc.ongoing?.on === 'spell-targeted-self') spellTrigs.push(tc.ongoing);
				if (tc.ongoings) for (const o of tc.ongoings) if (o.on === 'spell-targeted-self') spellTrigs.push(o);
				for (const o of spellTrigs) runSecretEffects(state, pi, o.effects, { self: tc, spell: card });
				// Djinni of Zephyrs: a spell on ANOTHER friendly creature is copied onto each Djinni
				if (!state.djinniEcho) {
					const djinnis = state.players[pi].board.filter(c => c.id === 'djinni_of_zephyrs' && !isDead(c) && c !== tc);
					for (const dj of djinnis) {
						state.djinniEcho = true;
						runSpell(state, pi, card, { type: 'creature', uid: dj.uid, player: pi }, choice);
						state.djinniEcho = false;
					}
				}
			}
		}
		// Sinestra: your spells from another class cast twice (not your own class /
		// neutral cards; guard `recasting` so the second cast never chains again)
		const myClass = state.players[pi].heroClass;
		const otherClass = card.cardClass && card.cardClass !== 'neutral'
			&& !(card.cardClass.split('__').includes(myClass));
		if (otherClass && !state.recasting
			&& state.players[pi].board.some(c => c.castOtherClassTwice && !isDead(c))) {
			state.recasting = true;
			runSpell(state, pi, card, ctx.target, choice);
			state.recasting = false;
		}
		// Electra Stormsurge: your next spell this turn casts twice
		if (state.players[pi].nextSpellDoubleCast && !state.recasting) {
			state.players[pi].nextSpellDoubleCast = false;
			state.recasting = true;
			runSpell(state, pi, card, ctx.target, choice);
			state.recasting = false;
		}
		// Zentimo: a spell that targets a minion also casts on its neighbors
		if (ctx.target?.type === 'creature' && !state.recasting && state.players[pi].board.some(c => c.id === 'zentimo' && !isDead(c))) {
			const t = findCreature(state, ctx.target.uid);
			if (t) {
				const board = state.players[t.controller].board;
				const idx = board.indexOf(t);
				state.recasting = true;
				for (const nb of [board[idx - 1], board[idx + 1]]) if (nb && !isDead(nb)) runSpell(state, pi, card, { type: 'creature', uid: nb.uid, player: nb.controller }, choice);
				state.recasting = false;
			}
		}
		state.players[pi].nextSpellDamageBonus = 0; // Celestial Emissary bonus is spent by this spell
		if (card.honorableKill && state.exactKills > 0) {
			emit(state, { type: 'honorableKill', player: pi });
			execEffects(state, pi, card.honorableKill, ctx.target, card);
		}
		fireOngoing(state, pi, 'spell-played', { played: card });
		if (card.combo) fireOngoing(state, pi, 'battlecry-or-combo-played', { played: card }); // Field Contact
		if (ctx.target && ctx.target.type === 'creature') fireOngoing(state, pi, 'spell-cast-on-creature', { played: card }); // Sethekk Veilweaver
		if (card.choices) fireOngoing(state, pi, 'choose-spell-played', { played: card }); // Keeper Stalladris
		firePlaneTrigger(state, 'spell-cast', pi); // Minamo / Elysaria
		for (let s2 = 0; s2 < state.players.length; s2++) {
			fireOngoing(state, s2, 'any-spell-played', { spell: card, caster: pi });
			if (s2 !== pi) fireOngoing(state, s2, 'enemy-spell-played', { spell: card, caster: pi });
		}
	}
	toGraveyard(state, pi, card);
}

function nextActiveAfter(state, pi) {
	const n = state.players.length;
	for (let k = 1; k <= n; k++) { const j = (pi + k) % n; if (!state.players[j].eliminated) return j; }
	return pi;
}

// you may act at instant speed if you currently hold priority, or it's your turn
// with nothing waiting on the stack
export function hasPriority(state, pi) {
	if (state.over) return false;
	if (state.priority != null) return state.priority === pi;
	return state.current === pi;
}

// can pi cast this instant in response (mana + a legal target / a spell to Counter)
function canCastInResponse(state, pi, card) {
	if (card.type !== 'instant') return false;
	const p = state.players[pi];
	if (availableMana(p) < effectiveCost(state, pi, card) && !(card.altCost && canPayAlt(state, pi, card))) return false;
	if (card.counterSpell) return !!topMatchingSpell(state, card); // a legal spell to counter (respects type/MV restriction)
	const spec = targetSpec(state, pi, card);
	if (spec && spec.required && legalTargets(state, pi, spec).length === 0) return false;
	return true;
}

// does pi hold any instant-speed action they could take right now (ignores the
// priority gate — used to decide whether a window is worth opening)
function hasInstantResponse(state, pi) {
	const p = state.players[pi];
	if (p.hand.some(c => canCastInResponse(state, pi, c))) return true;
	for (const c of p.board) { // creature activated abilities are instant speed by default
		if (!c.activated || isDead(c) || c.frozen || c.dormantLeft > 0) continue;
		for (let i = 0; i < c.activated.length; i++) {
			const a = c.activated[i];
			if (a.sorcerySpeed || (c.abilityUsedThisTurn && !a.repeatable)) continue;
			if ((a.cost || 0) <= availableMana(p)) return true;
		}
	}
	for (const l of [...p.lands, ...p.board.filter(x => x.type === 'location')]) { // land abilities beyond plain mana
		if (l.tapped) continue;
		if (landTaps(l).some(t => t.effects.some(e => e.type !== 'gain-mana'))) return true;
	}
	return false;
}

// pi may respond to the current top of the stack (someone else's action)
function canRespond(state, pi) {
	const top = state.stack[state.stack.length - 1];
	if (!top || top.caster === pi || state.players[pi].eliminated) return false;
	return hasInstantResponse(state, pi);
}

// the instants in pi's hand they could play right now in response
export function responseOptions(state, pi) {
	if (state.priority !== pi) return [];
	return state.players[pi].hand.filter(c => canCastInResponse(state, pi, c));
}

// just the Counters pi could play (the AI responds with these)
export function counterOptions(state, pi) {
	return responseOptions(state, pi).filter(c => c.counterSpell);
}

// the action pi is being asked to respond to (top of stack)
export function pendingSpellFor(state, pi) {
	return state.priority === pi ? state.stack[state.stack.length - 1] || null : null;
}

// advance priority: skip players who can't respond, resolve the top when all pass
function offerPriority(state) {
	while (state.stack.length) {
		// a soft-counter payment decision is pending: halt the stack until it's answered
		if (state.askQueue.some(a => a.counterPay)) { state.priority = null; return; }
		const n = state.players.length;
		let decider = null, pi = state.priorityNext, checked = 0;
		while (checked < n) {
			if (!state.players[pi].eliminated && !state.passers.includes(pi)) {
				if (canRespond(state, pi)) { decider = pi; break; }
				state.passers.push(pi);
			}
			pi = (pi + 1) % n; checked++;
		}
		if (decider != null) { state.priority = decider; return; }
		resolveTop(state);
		state.passers = [];
		state.priorityNext = state.current;
	}
	state.priority = null;
	state.passers = [];
}

// does this counter's restriction admit `entry` (a stack spell) as a legal target?
// `unlessPay` is NOT a targeting restriction (a soft counter is always castable).
function counterMatches(card, entry) {
	const cfg = card.counter;
	if (!cfg) return true; // unconditional Counterspell
	const sc = entry.card;
	if (cfg.type && sc.type !== cfg.type) return false;         // Dispel: instant only
	if (cfg.notType && sc.type === cfg.notType) return false;   // Negate: noncreature
	if (cfg.manaValue != null && (sc.cost || 0) !== cfg.manaValue) return false; // Spell Snare: MV 2
	return true;
}

// the topmost uncountered spell on the stack this counter may legally target
function topMatchingSpell(state, card) {
	for (let i = state.stack.length - 1; i >= 0; i--) {
		const e = state.stack[i];
		if (e.kind === 'spell' && !e.countered && counterMatches(card, e)) return e;
	}
	return null;
}

// remove a countered spell from the stack and send it to its destination:
// 'graveyard' (default), 'hand' (Remand), or 'top' of the owner's library (Memory Lapse)
function counterStackEntry(state, tgt, to) {
	if (!tgt || tgt.countered) return;
	tgt.countered = true;
	state.stack = state.stack.filter(e => e !== tgt);
	emit(state, { type: 'countered', player: tgt.caster, name: tgt.card.name });
	const owner = tgt.caster, card = tgt.card;
	if (to === 'hand') {
		if (state.players[owner].hand.length < MAX_HAND) { card.zone = 'hand'; state.players[owner].hand.push(card); }
		else toGraveyard(state, owner, card);
	} else if (to === 'top') {
		card.zone = 'deck';
		state.players[owner].deck.push(card.id); // deck top = end of the array
	} else if (to === 'exile') {
		card.zone = 'exile';
		state.players[owner].exile.push(card); // Force of Negation
	} else {
		toGraveyard(state, owner, card);
	}
}

// resolve one entry (dispatch by kind). A Counter removes the entry it targets.
function resolveEntry(state, entry) {
	const pi = entry.caster;
	if (entry.counters != null) {
		const tgt = state.stack.find(e => e.uid === entry.counters);
		if (tgt && !tgt.countered && counterMatches(entry.card, tgt)) {
			const cfg = entry.card.counter || {};
			const controller = tgt.caster;
			if (cfg.unlessPay && availableMana(state.players[controller]) >= cfg.unlessPay) {
				// soft counter: the spell's controller may pay to save it (interactive)
				state.askQueue.push({ player: controller,
					prompt: `Pay ${cfg.unlessPay} or ${tgt.card.name} is countered?`,
					yes: `Pay ${cfg.unlessPay}`, no: 'Let it be countered',
					counterPay: { targetUid: tgt.uid, amount: cfg.unlessPay, to: cfg.to || 'graveyard' } });
				emit(state, { type: 'askStart', player: controller, prompt: `Pay ${cfg.unlessPay} to save ${tgt.card.name}?` });
			} else {
				counterStackEntry(state, tgt, cfg.to || 'graveyard');
			}
		}
		if (entry.card.effects) execEffects(state, pi, entry.card.effects, entry.target, entry.card);
		fireOngoing(state, pi, 'spell-played', { played: entry.card });
		firePlaneTrigger(state, 'spell-cast', pi); // Minamo / Elysaria
		for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'any-spell-played', { spell: entry.card, caster: pi });
		toGraveyard(state, pi, entry.card);
		return;
	}
	if (entry.kind === 'spell') { resolveStackedSpell(state, entry); return; }
	if (entry.kind === 'attack') { resolveCombat(state, pi, entry.attackerUid, entry.target); return; }
	if (entry.kind === 'adventure') {
		execEffects(state, pi, entry.effects, entry.target, entry.card);
		const p = state.players[pi]; // the card returns to hand; only the creature half remains
		if (!p.eliminated && p.hand.length < MAX_HAND) {
			entry.card.adventureSpent = true;
			entry.card.zone = 'hand';
			p.hand.push(entry.card);
			emit(state, { type: 'conjure', player: pi, card: entry.card, color: null });
		}
		return;
	}
	if (entry.kind === 'heropower') {
		state.hpDamageBonus = staticValue(state.players[pi], 'hero-power-damage') + (state.players[pi].heroPowerDamageNext || 0); // Fallen Hero / Daring Fire-Eater
		state.players[pi].heroPowerDamageNext = 0;
		state.hpDoubling = state.players[pi].board.some(c => c.heroPowerDouble && !isDead(c)); // Clockwork Automaton
		state.hpResolver = pi; // Wilfred: cards drawn during a Hero Power cost 0
			const enemyBefore = opponentsOf(state, pi).flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location')); // Pyromaniac: detect Hero-Power kills
		execEffects(state, pi, entry.effects, entry.target, entry.card);
		if (state.players[pi].heroPowerUpgraded) execEffects(state, pi, entry.effects, entry.target, entry.card); // Justicar: fires twice
		state.hpResolver = null;
		state.hpDamageBonus = 0;
		state.hpDoubling = false;
		// Ice Walker: your Hero Power also Freezes its target
		if (entry.target?.type === 'creature' && state.players[pi].board.some(c => c.heroPowerFreezes && !isDead(c))) {
			const it = findCreature(state, entry.target.uid);
			if (it) freezeCreature(state, it);
		}
		if (entry.target?.type === 'creature' && state.players[pi].board.some(c => c.heroPowerAdjacent && !isDead(c))) { const t = findCreature(state, entry.target.uid); if (t) { const b2 = state.players[t.controller].board, i2 = b2.indexOf(t); for (const nb of [b2[i2 - 1], b2[i2 + 1]]) if (nb && !isDead(nb)) execEffects(state, pi, entry.effects, { type: 'creature', uid: nb.uid, player: nb.controller }, entry.card); } } // Spirit of the Dragonhawk
			for (let k = 0; k < enemyBefore.filter(c => isDead(c)).length; k++) fireOngoing(state, pi, 'hero-power-kills-minion', {}); // Pyromaniac
			fireOngoing(state, pi, 'hero-power-used', {}); // Inspire
		return;
	}
	// ability / landtap: their costs + side effects already happened at declare time
	execEffects(state, pi, entry.effects, entry.target, entry.card);
}

function resolveTop(state) {
	const entry = state.stack.pop();
	if (!entry) return;
	resolveEntry(state, entry);
	sweepDeaths(state);
	checkGameOver(state);
}

// put an action on the stack; open priority if an opponent can respond, else resolve.
// entry: { kind, card, effects?, target?, choice? }. `caster` and `uid` are set here.
function stackAction(state, caster, entry) {
	entry.uid = nextUid++;
	entry.caster = caster;
	entry.countered = false;
	if (entry.kind === 'spell' && entry.card.counterSpell) {
		const tm = topMatchingSpell(state, entry.card); // the legal spell this counter locks onto
		if (tm) entry.counters = tm.uid;
	}
	state.stack.push(entry);
	// only announce a stack pause when someone can actually respond
	if (opponentsOf(state, caster).some(o => canRespond(state, o))) {
		emit(state, { type: 'stackPush', player: caster, uid: entry.uid, kind: entry.kind, card: entry.card || null });
	}
	state.passers = [];
	state.priorityNext = nextActiveAfter(state, caster);
	offerPriority(state); // opens a window, or resolves the top(s) when no one responds
}

// backwards-compatible helper for the spell path
function stackSpell(state, pi, card, target, choice) {
	stackAction(state, pi, { kind: 'spell', card, target, choice });
}

// a player with priority resolves it. action null = pass; otherwise an instant-speed
// action: { kind:'spell'|'ability'|'landtap', uid, index?, target?, choice? }
export function resolveResponse(state, pi, action, target, choice) {
	if (state.priority !== pi) return false;
	// legacy 2-arg form: resolveResponse(pi, cardUid) cast an instant spell
	if (action == null) {
		state.passers.push(pi);
		state.priorityNext = nextActiveAfter(state, pi);
		state.priority = null;
		offerPriority(state);
		return true;
	}
	if (typeof action !== 'object') action = { kind: 'spell', uid: action, target, choice };
	if (action.kind === 'ability') return activateAbility(state, pi, action.uid, action.index, action.target);
	if (action.kind === 'landtap') return tapLand(state, pi, action.uid, action.index, action.target);
	return playCard(state, pi, action.uid, action.target, action.choice, undefined, action.useAlt, action.kicked); // spell
}

// ---------- Adventures: a creature card with a spell "adventure" half ----------
export function adventureSpec(state, pi, card) {
	if (!card.adventure) return null;
	return targetSpec(state, pi, { id: card.id, type: card.adventure.type || 'sorcery', effects: card.adventure.effects });
}

export function canPlayAdventure(state, pi, card) {
	if (state.over || !card || !card.adventure || card.adventureSpent) return false;
	const p = state.players[pi];
	if (!p.hand.includes(card)) return false;
	if (availableMana(p) < (card.adventure.cost || 0)) return false;
	// an Instant adventure is instant speed; a Sorcery adventure is sorcery speed
	if (card.adventure.type === 'instant') { if (!hasPriority(state, pi)) return false; }
	else if (!(state.current === pi && state.priority == null && state.stack.length === 0)) return false;
	const spec = adventureSpec(state, pi, card);
	if (spec && spec.required && legalTargets(state, pi, spec).length === 0) return false;
	return true;
}

export function playAdventure(state, pi, cardUid, target, choice) {
	const p = state.players[pi];
	const idx = p.hand.findIndex(c => c.uid === cardUid);
	if (idx < 0 || !canPlayAdventure(state, pi, p.hand[idx])) return false;
	const card = p.hand[idx];
	p.hand.splice(idx, 1);
	spendMana(p, card.adventure.cost || 0);
	emit(state, { type: 'adventureCast', player: pi, card, name: card.adventure.name });
	stackAction(state, pi, { kind: 'adventure', card, effects: card.adventure.effects, target, choice });
	return true;
}

export function useCoin(state, pi) {
	const p = state.players[pi];
	if (state.over || state.current !== pi || p.coins <= 0) return false;
	p.coins--;
	p.mana.bonus += 1;
	emit(state, { type: 'coin', player: pi, mana: availableMana(p) });
	return true;
}

export function attackersFor(state, pi) {
	return state.players[pi].board.filter(c => canAttackWith(state, pi, c));
}

export function canAttackWith(state, pi, c) {
	if (state.over || state.current !== pi || state.priority != null || state.stack.length || c.attack <= 0) return false;
	if (c.frozen) return false;
	if (c.dormantLeft > 0) return false; // still asleep
	if (has(c, KW.PACIFIST) && c.attackAnywayTurn !== state.turnNumber) return false; // Argent Watchman: Inspire lets it attack this turn
	if (state.plane) {
		const pr = activePlaneRule(state); // Bloomburrow: Humans can't attack
		if (pr && pr.kind === 'cant-attack' && (c.tribe || '').includes(pr.tribe)) return false;
	}
	const maxAttacks = has(c, KW.WINDFURY) ? 2 : 1;
	if (c.attacksUsed >= maxAttacks) return false;
	if (c.sick && !has(c, KW.CHARGE) && !has(c, KW.RUSH)) return false;
	return true;
}

// legal attack targets, honoring taunt and stealth; rush = creatures only while
// sick. Free-for-all: any opponent is attackable; a player's taunts only
// protect their own slice.
// Ghostly Prison-style tax: what it costs pi to send a creature at defenderPi's hero
function heroAttackTax(state, defenderPi) {
	const p = state.players[defenderPi];
	let tax = 0;
	for (const c of [...p.enchantments, ...p.artifacts, ...p.board]) {
		if (c.attackTax && !(c.zone === 'board' && isDead(c))) tax += c.attackTax.amount || 0;
	}
	return tax;
}

export function attackTargets(state, pi, attacker) {
	const out = [];
	const rushOnly = attacker.sick && has(attacker, KW.RUSH) && !has(attacker, KW.CHARGE);
	for (const opp of opponentsOf(state, pi)) {
		const board = state.players[opp].board.filter(c => !c.stealthed && c.type !== 'location' && c.dormantLeft <= 0);
		// piercing ignores taunt walls
		const taunts = has(attacker, KW.PIERCING) ? [] : board.filter(c => has(c, KW.TAUNT));
		out.push(...(taunts.length ? taunts : board).map(c => ({ type: 'creature', uid: c.uid, player: opp })));
		if (!taunts.length) {
			for (const w of state.players[opp].planeswalkers) out.push({ type: 'walker', uid: w.uid, player: opp });
			// the hero is only a legal target if pi can afford the attack tax (Ghostly Prison)
			const tax = heroAttackTax(state, opp);
			const noHero = attacker.noHeroAttackTurn === state.turnNumber; // Charged Devilsaur
			if (!rushOnly && !noHero && (tax === 0 || availableMana(state.players[pi]) >= tax)) out.push({ type: 'hero', player: opp });
		}
	}
	return out;
}

export function attack(state, pi, attackerUid, target) {
	const attacker = state.players[pi].board.find(c => c.uid === attackerUid);
	if (!attacker || !canAttackWith(state, pi, attacker)) return false;
	const legal = attackTargets(state, pi, attacker);
	if (!legal.some(t => t.type === target.type && t.uid === target.uid && t.player === target.player)) return false;

	// Ghostly Prison: pay the attack tax as an additional cost of declaring at the hero
	if (target.type === 'hero') {
		const tax = heroAttackTax(state, target.player);
		if (tax > 0) {
			if (availableMana(state.players[pi]) < tax) return false; // can't afford: declaration is illegal
			spendMana(state.players[pi], tax);
			emit(state, { type: 'attackTaxPaid', player: pi, defender: target.player, amount: tax });
		}
	}

	attacker.attacksUsed++;
	attacker.stealthed = false;
	emit(state, { type: 'attack', attackerUid, target });
	// Paralyzed: the target is chosen, but the swing fails on a coin flip
	if (attacker.paralyzed && state.rng() < 0.5) {
		emit(state, { type: 'attackFizzled', attackerUid, name: attacker.name });
		sweepDeaths(state);
		return true;
	}
	// Sanguine: attacking (or being attacked, below) banks a Blood Token
	if (has(attacker, KW.SANGUINE)) gainBloodToken(state, pi);
	if (target.type === 'creature') {
		const d0 = findCreature(state, target.uid);
		if (d0 && has(d0, KW.SANGUINE)) gainBloodToken(state, d0.controller);
	}
	// Swing: when this creature attacks
	if (attacker.ongoing?.on === 'self-attacks') {
		runSecretEffects(state, pi, attacker.ongoing.effects, { self: attacker });
		if (attacker.ongoing?.once) attacker.ongoing = null;
	}
	fireOngoing(state, pi, 'friendly-attacks', { minion: attacker }); // Gaia-style reactions
	if (!isDead(attacker)) fireOngoing(state, pi, 'friendly-attacks-survives', { minion: attacker }); // Rokara
	// Cutpurse: when this creature attacks a hero
	if (attacker.ongoing?.on === 'self-attacks-hero' && target.type === 'hero') {
		runSecretEffects(state, pi, attacker.ongoing.effects, { self: attacker });
	}

	// defender's secrets see the declared attack (may kill, bounce, or redirect)
	const ctx = { attackerType: 'creature', attacker, attackerPlayer: pi, target, cancelled: false };
	fireSecrets(state, target.player, 'enemy-attack', ctx);
	if (ctx.cancelled || isDead(attacker) || !state.players[pi].board.includes(attacker)) {
		sweepDeaths(state);
		return true;
	}
	tryDefenderRedirect(state, ctx);
	target = ctx.target;
	if (target.type === 'creature') {
		const redirected = findCreature(state, target.uid);
		if (!redirected || isDead(redirected)) { sweepDeaths(state); return true; }
	}

	stackAction(state, pi, { kind: 'attack', attackerUid: attacker.uid, target });
	return true;
}

// combat damage, resolved off the stack so instants can respond to an attack.
// The attacker or target may have died in the window, so re-validate first.
function resolveCombat(state, pi, attackerUid, target) {
	const attacker = state.players[pi] && state.players[pi].board.find(c => c.uid === attackerUid);
	if (!attacker || isDead(attacker)) { sweepDeaths(state); return; }
	if (target.type === 'creature') { const d = findCreature(state, target.uid); if (!d || isDead(d)) { sweepDeaths(state); return; } }
	else if (target.type === 'walker') { if (!findWalker(state, target.uid)) { sweepDeaths(state); return; } }
	// Oxmorg: the active plane doubles all combat damage
	const cmult = (activePlaneRule(state)?.kind === 'double-damage') ? 2 : 1;
	if (target.type === 'hero') {
		const dealt = damageHero(state, target.player, attacker.attack * cmult, pi, has(attacker, KW.PIERCING));
		if (has(attacker, KW.LIFESTEAL) && dealt > 0) healHero(state, pi, dealt);
		// Connect: combat damage to a player
		if (dealt > 0 && attacker.ongoing?.on === 'self-hit-player') {
			runSecretEffects(state, pi, attacker.ongoing.effects, { self: attacker });
		}
	} else if (target.type === 'walker') {
		// planeswalkers soak the hit with loyalty and never strike back
		const w = findWalker(state, target.uid);
		if (w) {
			damageWalker(state, w, attacker.attack * cmult);
			if (has(attacker, KW.LIFESTEAL)) healHero(state, pi, attacker.attack * cmult);
		}
	} else {
		const defender = findCreature(state, target.uid);
		if (!defender) return false;
		const defHpBefore = hp(defender);
		const defBefore = defender.attack; // for Alley Armorsmith's retaliation damage
		const aFirst = has(attacker, KW.FIRST_STRIKE) && !has(defender, KW.FIRST_STRIKE);
		const dFirst = has(defender, KW.FIRST_STRIKE) && !has(attacker, KW.FIRST_STRIKE);
		const strike = (src, dst) => {
			const dealt = damageCreature(state, dst, src.attack * cmult, src);
			if (has(src, KW.LIFESTEAL) && dealt > 0) healHero(state, src.controller, dealt);
			if (has(src, KW.FREEZER) && !isDead(dst)) freezeCreature(state, dst);
		};
		if (aFirst) {
			strike(attacker, defender);
			if (!isDead(defender)) strike(defender, attacker);
		} else if (dFirst) {
			strike(defender, attacker);
			if (!isDead(attacker)) strike(attacker, defender);
		} else {
			strike(attacker, defender);
			strike(defender, attacker);
		}
		// Static: 50% chance to Paralyze whichever combatant survives against it
		if (has(attacker, KW.STATIC)) maybeParalyze(state, defender);
		if (has(defender, KW.STATIC)) maybeParalyze(state, attacker);
		// cleave: the hit splashes onto the defender's board neighbors
		if (has(attacker, KW.CLEAVE)) {
			const db = state.players[target.player].board;
			const di = db.indexOf(defender);
			for (const n of [db[di - 1], db[di + 1]]) {
				if (n && !isDead(n)) damageCreature(state, n, attacker.attack, attacker);
			}
		}
		// trample: excess damage (attack beyond the defender's remaining health) hits the hero
		if (has(attacker, KW.TRAMPLE) && isDead(defender)) {
			const excess = attacker.attack - defHpBefore;
			if (excess > 0) damageHero(state, target.player, excess, pi);
			}
			// Overkill: dealing MORE than lethal to a minion on your turn triggers a bonus
			if (attacker.overkill && isDead(defender) && state.current === pi && (attacker.attack * cmult) > defHpBefore) {
				emit(state, { type: 'overkill', uid: attacker.uid, player: pi });
				execEffects(state, pi, JSON.parse(JSON.stringify(attacker.overkill)), null, attacker);
		}
		// Honorable Kill: this creature scored an EXACT lethal blow
		if (attacker.honorableKill && isDead(defender) && defender.damage === defender.maxHealth
			&& !isDead(attacker)) {
			emit(state, { type: 'honorableKill', uid: attacker.uid, player: pi });
			runSecretEffects(state, pi, attacker.honorableKill, { self: attacker });
		}
		// "After this attacks and kills a minion, it may attack again."
		if (attacker.attackAgainOnKill && isDead(defender) && !isDead(attacker)) {
			attacker.attacksUsed = Math.max(0, attacker.attacksUsed - 1);
		}
		// The Boogeymonster: "whenever this attacks and kills a minion"
		if (isDead(defender) && !isDead(attacker)) {
			const trigs = [];
			if (attacker.ongoing?.on === 'self-kills-creature') trigs.push(attacker.ongoing);
			if (attacker.ongoings) for (const o of attacker.ongoings) if (o.on === 'self-kills-creature') trigs.push(o);
			for (const o of trigs) runSecretEffects(state, pi, o.effects, { self: attacker });
		}
		// Knuckles: "after this attacks a minion" (fires even if it dies? HS: it survives to hit)
		if (!isDead(attacker)) fireCreatureTrigger(state, attacker, 'self-attacks-creature', { victim: defender });
		// Wind-up Burglebot: "whenever this attacks a minion and survives"
		if (!isDead(attacker)) fireCreatureTrigger(state, attacker, 'self-attacks-survives');
		// Alley Armorsmith: "whenever this deals damage" — either combatant that dealt any
		if (attacker.attack > 0) fireCreatureTrigger(state, attacker, 'self-deals-damage', { amount: attacker.attack, victim: defender });
		if (defBefore > 0 && !isDead(defender)) fireCreatureTrigger(state, defender, 'self-deals-damage', { amount: defBefore, victim: attacker });
	}
	sweepDeaths(state);
}

// ---------- hero (weapon) attacks ----------
export function heroAttackValue(p) {
	let w = 0;
	if (p.weapon) {
		w = p.weapon.attack;
		// Spiteful Smith-style enrage: damaged creatures sharpen the weapon
		for (const c of p.board) {
			if (c.enrage?.weaponAttack && c.damage > 0 && !isDead(c)) w += c.enrage.weaponAttack;
		}
	}
	return w + p.heroTempAttack;
}

export function canHeroAttack(state, pi) {
	if (state.over || state.current !== pi) return false;
	const p = state.players[pi];
	if (heroAttackValue(p) <= 0) return false; // temp attack lets weaponless heroes swing
	const windfury = p.weapon?.keywords.includes(KW.WINDFURY) || p.board.some(c => c.heroWindfury && !isDead(c)); // Azshara
	return p.heroAttacksUsed < (windfury ? 2 : 1);
}

// same taunt/stealth rules as creature attacks; heroes have no rush restriction
export function heroAttackTargets(state, pi) {
	const out = [];
	for (const opp of opponentsOf(state, pi)) {
		const board = state.players[opp].board.filter(c => !c.stealthed && c.type !== 'location' && c.dormantLeft <= 0);
		const taunts = board.filter(c => has(c, KW.TAUNT));
		out.push(...(taunts.length ? taunts : board).map(c => ({ type: 'creature', uid: c.uid, player: opp })));
		if (!taunts.length) {
			for (const w of state.players[opp].planeswalkers) out.push({ type: 'walker', uid: w.uid, player: opp });
			out.push({ type: 'hero', player: opp });
		}
	}
	return out;
}

export function heroAttack(state, pi, target) {
	if (!canHeroAttack(state, pi)) return false;
	const legal = heroAttackTargets(state, pi);
	if (!legal.some(t => t.type === target.type && t.uid === target.uid && t.player === target.player)) return false;
	const p = state.players[pi];
	p.heroAttacksUsed++;
	emit(state, { type: 'heroAttack', player: pi, target });
	questTick(state, 'hero-attack', pi);

	const ctx = { attackerType: 'hero', attackerPlayer: pi, target, cancelled: false };
	fireSecrets(state, target.player, 'enemy-attack', ctx);
	if (ctx.cancelled || heroAttackValue(p) <= 0 || state.over) { sweepDeaths(state); return true; }
	tryDefenderRedirect(state, ctx);
	target = ctx.target;

	const w = p.weapon; // may be null when swinging on temp attack alone
	const atk = heroAttackValue(p);
	let hitCreature = false, killed = false;
	if (target.type === 'hero') {
		damageHero(state, target.player, atk, pi);
	} else if (target.type === 'walker') {
		const pw = findWalker(state, target.uid);
		if (pw) damageWalker(state, pw, atk);
	} else {
		const defender = findCreature(state, target.uid);
		if (defender && !isDead(defender)) {
			hitCreature = true;
			if (has(defender, KW.SANGUINE)) gainBloodToken(state, defender.controller);
			const dealt = damageCreature(state, defender, atk, w);
			if (w && has(w, KW.LIFESTEAL) && dealt > 0) healHero(state, pi, dealt);
			if (w && has(w, KW.FREEZER) && !isDead(defender)) freezeCreature(state, defender);
			// cleaving weapons splash the defender's board neighbors
			if (w && has(w, KW.CLEAVE)) {
				const db = state.players[target.player].board;
				const di = db.indexOf(defender);
				for (const n of [db[di - 1], db[di + 1]]) {
					if (n && !isDead(n)) damageCreature(state, n, atk, w);
				}
			}
			// the defending creature strikes back at the hero
			// (Gladiator's Longbow: the hero is immune while attacking)
			if (!(w && w.static?.type === 'immune-attacking')) {
				const counter = damageHero(state, pi, defender.attack, defender.controller);
				if (has(defender, KW.LIFESTEAL) && counter > 0) healHero(state, defender.controller, counter);
			}
			killed = isDead(defender);
			// Honorable Kill on weapons: an EXACT lethal swing
			if (w && w.honorableKill && killed && defender.damage === defender.maxHealth) {
				emit(state, { type: 'honorableKill', player: pi });
				execEffects(state, pi, w.honorableKill, null, w);
			}
		}
	}
	// triggered hero weapons fire while still equipped
	if (w && w.ongoing) {
		const on = w.ongoing.on;
		if (on === 'hero-attacks'
			|| (on === 'hero-attacks-creature' && hitCreature)
			|| (on === 'hero-kills-creature' && killed)) {
			emit(state, { type: 'ongoingTriggered', player: pi, card: w });
			runSecretEffects(state, pi, w.ongoing.effects, { self: w });
		}
	}
	fireOngoing(state, pi, 'hero-attacks', {}); // Hench-Clan Thug: minion reacts to your hero attacking
	if (killed) {
		fireOngoing(state, pi, 'hero-kills-minion', {}); // Spirit of the Raptor
		if (p.heroAttacksUsed > 0 && p.board.some(c => c.id === 'gonk_the_raptor' && !isDead(c))) p.heroAttacksUsed--; // Gonk: may attack again
	}
	// Gorehowl: hitting a creature spends Attack instead of Durability
	if (w && hitCreature && w.static?.type === 'attack-costs-attack') {
		w.attack -= 1;
		emit(state, { type: 'weaponDurability', player: pi, attack: w.attack, durability: w.durability });
		if (w.attack <= 0) breakWeapon(state, pi, true);
	} else if (w) {
		degradeWeapon(state, pi);
	}
	fireOngoing(state, pi, 'hero-attacked', {}); // Battlefiend-style creatures
	sweepDeaths(state);
	return true;
}

// ---------- planeswalkers ----------
function findWalker(state, uid) {
	for (const p of state.players) {
		const w = p.planeswalkers.find(c => c.uid === uid);
		if (w) return w;
	}
	return null;
}

function damageWalker(state, walker, amount) {
	if (amount <= 0) return;
	walker.loyalty -= amount;
	emit(state, { type: 'walkerDamage', uid: walker.uid, amount, loyalty: walker.loyalty });
	if (walker.loyalty <= 0) destroyWalker(state, walker);
}

function destroyWalker(state, walker) {
	const p = state.players[walker.controller];
	p.planeswalkers = p.planeswalkers.filter(c => c !== walker);
	toGraveyard(state, walker.controller, walker);
	emit(state, { type: 'walkerDestroyed', uid: walker.uid, player: walker.controller, name: walker.name });
}

export function walkerSpec(state, pi, card, abilityIndex) {
	const ability = card.abilities?.[abilityIndex];
	if (!ability) return null;
	return targetSpec(state, pi, { id: card.id, type: 'sorcery', effects: ability.effects });
}

// abilityIndex omitted: is ANY ability usable this turn?
export function canUseWalker(state, pi, card, abilityIndex) {
	if (state.over || state.current !== pi || state.priority != null || state.stack.length) return false;
	const p = state.players[pi];
	if (!p.planeswalkers.includes(card) || card.usedThisTurn) return false;
	const check = i => {
		const a = card.abilities?.[i];
		if (!a) return false;
		if (card.loyalty + a.cost < 0) return false; // can't overspend loyalty
		const spec = walkerSpec(state, pi, card, i);
		if (spec && spec.required && legalTargets(state, pi, spec).length === 0) return false;
		return true;
	};
	if (abilityIndex == null) return card.abilities?.some((_, i) => check(i)) || false;
	return check(abilityIndex);
}

export function useWalker(state, pi, cardUid, abilityIndex, target) {
	const p = state.players[pi];
	const card = p.planeswalkers.find(c => c.uid === cardUid);
	if (!card || !canUseWalker(state, pi, card, abilityIndex)) return false;
	const ability = card.abilities[abilityIndex];
	card.loyalty += ability.cost;
	card.usedThisTurn = true;
	emit(state, { type: 'walkerAbility', player: pi, card, text: ability.text, loyalty: card.loyalty });
	execEffects(state, pi, ability.effects, target, card);
	if (card.loyalty <= 0) destroyWalker(state, card); // burned out all loyalty
	sweepDeaths(state);
	return true;
}

// apply one Boost/Adapt table entry to a creature
function applyRollEntry(state, t, entry) {
	if (entry.keyword && !t.keywords.includes(entry.keyword)) {
		t.keywords.push(entry.keyword);
		if (entry.keyword === KW.DIVINE_SHIELD) t.shield = true;
		if (entry.keyword === KW.STEALTH) t.stealthed = true;
	}
	t.attack += entry.attack || 0;
	t.maxHealth += entry.health || 0;
	if (entry.static && !t.static) t.static = { ...entry.static };
	if (entry.ongoing) {
		// a boosted creature keeps its own ability: the first trigger fills the
		// singular slot, any further boosts (Bolster/Inspire/…) stack into ongoings
		const clone = JSON.parse(JSON.stringify(entry.ongoing));
		if (!t.ongoing) t.ongoing = clone;
		else (t.ongoings = t.ongoings || []).push(clone);
	}
	if (entry.deathrattle) t.deathrattle = [...(t.deathrattle || []), ...entry.deathrattle];
	if (entry.ward && !t.ward) t.ward = { ...entry.ward };
}

function applyAdapt(state, t) {
	const roll = Math.floor(state.rng() * ADAPT_TABLE.length);
	applyRollEntry(state, t, ADAPT_TABLE[roll]);
	emit(state, { type: 'boosted', uid: t.uid, color: 'adapt', roll: roll + 1, label: ADAPT_TABLE[roll].label, attack: t.attack, hp: hp(t) });
}

// paper Adapt: roll a d10 three times, rerolling repeats, then queue a pick so
// the controller chooses one of the three to apply to every adapting creature
function queueAdapt(state, pi, targets) {
	if (!targets.length) return;
	const options = [];
	while (options.length < 3) {
		const r = Math.floor(state.rng() * ADAPT_TABLE.length);
		if (!options.includes(r)) options.push(r);
	}
	state.pickQueue.push({ player: pi, mode: 'adapt', ids: options.map(String),
		adaptUids: targets.map(c => c.uid), title: 'Adapt' });
	emit(state, { type: 'adaptOffer', player: pi, options, uids: targets.map(c => c.uid) });
}

// ---------- paper Defender: coin-flip attack redirection ----------
// When an attack targets a defending player's permanent or hero, each of
// their OTHER creatures with Defender gets one 50% flip to become the new
// target (auto-attempted; first success wins).
function tryDefenderRedirect(state, ctx) {
	const target = ctx.target;
	if (!target || target.player == null) return;
	const defside = state.players[target.player];
	if (!defside || defside.eliminated) return;
	for (const d of defside.board) {
		if (!has(d, KW.DEFENDER) || isDead(d)) continue;
		if (target.type === 'creature' && target.uid === d.uid) continue; // already the target
		if (state.rng() < 0.5) {
			ctx.target = { type: 'creature', uid: d.uid, player: target.player };
			emit(state, { type: 'defenderRedirect', uid: d.uid, player: target.player });
			return;
		}
		emit(state, { type: 'defenderMiss', uid: d.uid, player: target.player });
	}
}

// ---------- scry / gaze resolution ----------
// picks: [{ id, bottom }] matching the pending entry's ids. Tops go back so
// the first listed is drawn first; bottoms go under the deck.
export function resolveScry(state, picks) {
	const pending = state.scryQueue.shift();
	if (!pending) return false;
	const deck = state.players[pending.deckOwner].deck;
	const byId = [...pending.ids];
	const tops = [], bottoms = [];
	for (const p of picks || []) {
		const i = byId.indexOf(p.id);
		if (i < 0) continue;
		byId.splice(i, 1);
		(p.bottom ? bottoms : tops).push(p.id);
	}
	tops.push(...byId); // anything unmentioned stays on top
	for (const id of bottoms) deck.unshift(id);
	for (const id of [...tops].reverse()) deck.push(id); // first pick drawn first
	emit(state, { type: 'scryDone', chooser: pending.chooser, deckOwner: pending.deckOwner, bottomed: bottoms.length });
	return true;
}

// resolve a pending Dredge: chosen card goes on top (drawn next), the rest
// return to the bottom in their original order. Nothing is drawn.
export function resolveDredge(state, id) {
	const pend = state.dredgeQueue.shift();
	if (!pend) return false;
	const deck = state.players[pend.player].deck;
	const chosen = pend.ids.includes(id) ? id : pend.ids[0];
	const rest = pend.ids.filter(x => x !== chosen);
	// rest[] were the bottom cards in bottom-up order; keep that order at the bottom
	for (const x of [...rest].reverse()) deck.unshift(x);
	deck.push(chosen); // top of deck = end of array
	emit(state, { type: 'dredgeDone', player: pend.player, id: chosen });
	return true;
}

// resolve the oldest pending Discover/Draft with the chosen card id
export function resolvePick(state, id) {
	const pend = state.pickQueue.shift();
	if (!pend) return false;
	if (pend.mode === 'adapt') {
		// apply the chosen adaptation to every still-living adapting creature
		const idx = pend.ids.includes(String(id)) ? Number(id) : Number(pend.ids[0]);
		const entry = ADAPT_TABLE[idx];
		const p = state.players[pend.player];
		for (const uid of pend.adaptUids) {
			const t = p.board.find(c => c.uid === uid);
			if (t && !isDead(t)) {
				applyRollEntry(state, t, entry);
				emit(state, { type: 'boosted', uid: t.uid, color: 'adapt', roll: idx + 1, label: entry.label, attack: t.attack, hp: hp(t) });
			}
		}
		recomputeAuras(state);
		return true;
	}
	if (pend.heroPower) {
		// Sir Finley: replace your Hero Power with the discovered one
		const pp = state.players[pend.player];
		const def = state.cardsById[pend.ids.includes(id) ? id : pend.ids[0]];
		if (def && !pp.eliminated) {
			const power = instantiate(def, pend.player);
			power.zone = 'heropower'; power.usedThisTurn = false;
			pp.heroPowers = [power];
			emit(state, { type: 'heroPowerGained', player: pend.player, card: power });
		}
		return true;
	}
	const chosen = pend.ids.includes(id) ? id : pend.ids[0];
	const p = state.players[pend.player];
	const def = state.cardsById[chosen];
	if (pend.mode === 'gy') {
		// pull the fallen card back (fresh copy — buffs don't survive the grave)
		const gi = p.graveyard.findIndex(c => c.id === chosen);
		if (gi >= 0 && def && !p.eliminated) {
			p.graveyard.splice(gi, 1);
			if (pend.to === 'board') {
				summon(state, pend.player, def);
			} else if (p.hand.length < MAX_HAND) {
				const card = instantiate(def, pend.player);
				card.zone = 'hand';
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pend.player, card, color: null });
			}
		}
		return true;
	}
	if (pend.mode === 'search') {
		const di = p.deck.indexOf(chosen);
		if (di >= 0 && def && !p.eliminated) {
			p.deck.splice(di, 1);
			if (pend.to === 'board') {
				summon(state, pend.player, def);
			} else if (p.hand.length < MAX_HAND) {
				const card = instantiate(def, pend.player);
				card.zone = 'hand';
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pend.player, card, color: null });
			}
			// searching reshuffles the library
			for (let i = p.deck.length - 1; i > 0; i--) {
				const j = Math.floor(state.rng() * (i + 1));
				[p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]];
			}
		}
		return true;
	}
	if (pend.mode === 'deploy-equip') {
		const idx = p.hand.findIndex(c => c.id === chosen && c.equip);
		if (idx >= 0 && !p.eliminated) {
			const [card] = p.hand.splice(idx, 1);
			card.zone = 'artifact'; card.attachedTo = null;
			p.artifacts.push(card);
			if (card.effects) execEffects(state, pend.player, card.effects, null, card);
			recomputeAuras(state);
			emit(state, { type: 'deployedEquip', player: pend.player, uid: card.uid, name: card.name });
			fireOngoing(state, pend.player, 'equipment-entered', { equip: card });
		}
		return true;
	}
	if (def && !p.eliminated && pend.to === 'board') {
		summon(state, pend.player, def);
		return true;
	}
	if (def && pend.installSecret && def.secret && !p.eliminated) {
		installSecret(state, pend.player, def.id); // Hydrologist
		return true;
	}
	if (def && pend.castRandom && !p.eliminated) {
		// Tortollan Primalist: cast the discovered spell with a random target
		const spell = instantiate(def, pend.player);
		const spec = targetSpec(state, pend.player, spell, null);
		let tgt = null;
		if (spec) { const legal = legalTargets(state, pend.player, spec); if (legal.length) tgt = legal[Math.floor(state.rng() * legal.length)]; }
		if (!spec || tgt || !spec.required) { emit(state, { type: 'conjure', player: pend.player, card: spell, color: null }); runSpell(state, pend.player, spell, tgt, null); sweepDeaths(state); }
		return true;
	}
	if (def && !p.eliminated && p.hand.length < MAX_HAND) {
		const card = instantiate(def, pend.player);
		card.zone = 'hand';
		if (pend.grant && !card.keywords.includes(pend.grant)) card.keywords.push(pend.grant);
		if (pend.buff) { // "Discover a Taunt minion. Give it +1/+1."
			card.attack += pend.buff.attack || 0;
			card.maxHealth += pend.buff.health || 0;
		}
		if (pend.setAttack != null) card.attack = pend.setAttack; // Gurubashi Hypemon: a 1/1 copy
			if (pend.setHealth != null) card.maxHealth = pend.setHealth;
			if (pend.setCost != null) card.cost = pend.setCost;
			if (pend.costMod) card.cost = Math.max(0, (card.cost || 0) + pend.costMod); // Museum Curator: costs (1) less
		if (pend.healByCost) healHero(state, pend.player, card.cost || 0); // Ivory Knight: restore Health = its Cost
		if (pend.damageSelfByCost) damageHero(state, pend.player, card.cost || 0, pend.player); // Chittering Tunneler
			if (pend.gainDeathrattleUid != null && def.deathrattle) { // Myra Rotspring: also gain its Deathrattle
				const src = findCreature(state, pend.gainDeathrattleUid);
				if (src && !isDead(src)) { src.deathrattle = [...(src.deathrattle || []), ...JSON.parse(JSON.stringify(def.deathrattle))]; if (!src.keywords.includes('deathrattle')) src.keywords.push('deathrattle'); }
			}
		p.hand.push(card);
		emit(state, { type: 'conjure', player: pend.player, card, color: null });
		fireEmerge(state, pend.player, card);
	}
	return true;
}

// resolve the oldest pending optional "you may …" prompt (yes runs `then`)
export function resolveAsk(state, yes) {
	const pend = state.askQueue.shift();
	if (!pend) return false;
	if (pend.counterPay) {
		// soft-counter payment: yes = pay N (spell survives), no/can't-pay = counter it
		const cp = pend.counterPay;
		const tgt = state.stack.find(e => e.uid === cp.targetUid);
		if (tgt && !tgt.countered) {
			if (yes && availableMana(state.players[pend.player]) >= cp.amount) {
				spendMana(state.players[pend.player], cp.amount);
				emit(state, { type: 'counterPaid', player: pend.player, name: tgt.card.name, amount: cp.amount });
			} else {
				counterStackEntry(state, tgt, cp.to);
			}
		}
		offerPriority(state); // resume draining the stack now that the decision is made
		return true;
	}
	if (pend.payOr) {
		// Rhystic Study-style tax: pay `amount` to deny the benefit, else the controller gets it
		const po = pend.payOr;
		if (yes && availableMana(state.players[pend.player]) >= po.amount) {
			spendMana(state.players[pend.player], po.amount);
			emit(state, { type: 'taxPaid', player: pend.player, amount: po.amount });
		} else {
			execEffects(state, po.benefitPi, po.benefit || [], null, null);
		}
		return true;
	}
	execEffects(state, pend.player, yes ? pend.then : (pend.else || []), null, null);
	return true;
}

// resolve the oldest pending Loot discard with the chosen hand card uids
export function resolveDiscard(state, uids) {
	const pend = state.discardQueue.shift();
	if (!pend) return false;
	const p = state.players[pend.player];
	for (const uid of (uids || []).slice(0, pend.count)) {
		const idx = p.hand.findIndex(c => c.uid === uid);
		if (idx < 0) continue;
		const [c] = p.hand.splice(idx, 1);
		toGraveyard(state, pend.player, c);
		emit(state, { type: 'discard', player: pend.player, card: c });
	}
	// discard-then rewards (Blood Token's draw comes after the discard)
	if (pend.then) execEffects(state, pend.player, pend.then, null, null);
	// additional-cost spell: the discard was the cost — now resolve the spell
	if (pend.addCostSpell) { const { card, target, choice } = pend.addCostSpell; resolveAddCostSpell(state, pend.player, card, target, choice); }
	return true;
}

// ---------- disguise (face-down 2/2, MTG-style) ----------
function disguiseCreature(state, c) {
	if (c.disguised || isDead(c)) return;
	// save the identity WITHOUT live aura contributions (they re-apply on both
	// the face-down 2/2 and the unmasked original via recompute)
	c.disguised = {
		name: c.name, attack: c.attack - c.auraAttack, maxHealth: c.maxHealth - c.auraHealth,
		tribe: c.tribe, keywords: c.keywords.filter(k => !c.auraKeywords.includes(k)),
		effects: c.effects, deathrattle: c.deathrattle,
		ongoing: c.ongoing, static: c.static, aura: c.aura,
	};
	c.name = 'Disguised Creature';
	c.attack = 2;
	c.maxHealth = 2;
	c.auraAttack = 0;
	c.auraHealth = 0;
	c.damage = Math.min(c.damage, 1); // hiding can't be instantly lethal
	c.tribe = null;
	c.keywords = [];
	c.auraKeywords = [];
	c.effects = null;
	c.deathrattle = null;
	c.ongoing = null;
	c.static = null;
	c.aura = null;
	emit(state, { type: 'disguised', uid: c.uid, player: c.controller });
	recomputeAuras(state);
}

export function canUnmask(state, pi, c) {
	if (state.over || state.current !== pi) return false;
	if (!state.players[pi].board.includes(c) || !c.disguised) return false;
	return availableMana(state.players[pi]) >= c.cost;
}

export function unmask(state, pi, cardUid) {
	const p = state.players[pi];
	const c = p.board.find(x => x.uid === cardUid);
	if (!c || !canUnmask(state, pi, c)) return false;
	spendMana(p, c.cost);
	const d = c.disguised;
	c.disguised = null;
	c.name = d.name;
	c.attack = d.attack;
	c.maxHealth = d.maxHealth;
	c.tribe = d.tribe;
	c.keywords = d.keywords;
	c.effects = d.effects;
	c.deathrattle = d.deathrattle;
	c.ongoing = d.ongoing;
	c.static = d.static;
	c.aura = d.aura;
	c.auraAttack = 0;
	c.auraHealth = 0;
	emit(state, { type: 'unmasked', uid: c.uid, player: pi, name: c.name });
	recomputeAuras(state);
	sweepDeaths(state);
	return true;
}

// ---------- hero powers ----------
export function powerEffectsOf(card, choice) {
	if (card.power?.choices) return card.power.choices[choice ?? 0]?.effects || [];
	return card.power?.effects || [];
}

// derive the activation's target choice from the power's effects
// Steamwheedle Sniper: your Hero Power can also target minions — broaden any
// enemy-hero damage in the power's effects to "any" target
function heroPowerEffects(state, pi, card, choice) {
	let effects = powerEffectsOf(card, choice);
	if (state.players[pi].board.some(c => c.heroPowerHitsMinions && !isDead(c))) {
		effects = effects.map(e => e.type === 'damage' && (e.target === 'enemy-hero' || e.target == null) ? { ...e, target: 'any' } : e);
	}
	return effects;
}

export function heroPowerSpec(state, pi, card, choice) {
	if (!card.power) return null;
	if (card.power.choices && choice == null) return null; // branch menu comes first
	return targetSpec(state, pi, { id: card.id, type: 'sorcery', effects: heroPowerEffects(state, pi, card, choice) });
}

// a Hero Power's live cost after board/one-shot modifiers (Maiden of the Lake
// sets it to 1, Saboteur taxes it, Fencing Coach discounts the next use)
export function heroPowerCost(state, pi, card) {
	const p = state.players[pi];
	if (p.heroPowerFreeGame) return 0; // Raza the Chained
	let c = card.power.cost;
	const set = p.board.filter(x => x.heroPowerCostSet != null && !isDead(x)).map(x => x.heroPowerCostSet);
	if (set.length) c = Math.min(c, ...set); // Maiden of the Lake
	c += (p.heroPowerTaxNext || 0) - (p.heroPowerDiscountNext || 0);
	c -= p.board.filter(x => x.heroPowerCostReduce && !isDead(x)).reduce((s, x) => s + x.heroPowerCostReduce, 0); // Felfire Deadeye
	return Math.max(0, c);
}

export function canUseHeroPower(state, pi, card, choice) {
	if (state.over || !(state.current === pi && state.priority == null && state.stack.length === 0)) return false;
	const p = state.players[pi];
	if (!p.heroPowers.includes(card) || card.usedThisTurn) return false;
	if (availableMana(p) < heroPowerCost(state, pi, card)) return false;
	const spec = heroPowerSpec(state, pi, card, choice);
	if (spec && spec.required && legalTargets(state, pi, spec).length === 0) return false;
	return true;
}

export function useHeroPower(state, pi, cardUid, target, choice) {
	const p = state.players[pi];
	const card = p.heroPowers.find(c => c.uid === cardUid);
	if (!card || !canUseHeroPower(state, pi, card, choice)) return false;
	const cost = heroPowerCost(state, pi, card);
	const ward = wardOf(state, pi, target);
	if (ward?.mana && availableMana(p) < cost + ward.mana) return false;
	if (ward) payWard(state, pi, target);
	spendMana(p, cost);
	p.heroPowerDiscountNext = 0; // Fencing Coach's discount is one-shot
	p.heroPowersUsedGame = (p.heroPowersUsedGame || 0) + 1; // Frost Giant
	card.usedThisTurn = true;
	emit(state, { type: 'heroPowerUsed', player: pi, card, mana: availableMana(p) });
	stackAction(state, pi, { kind: 'heropower', card, effects: heroPowerEffects(state, pi, card, choice), target });
	return true;
}

// ---------- Planeswalk: roll the planar die (a bonus 'hero power') ----------
// Allowed only if you control a planeswalker or have used Spark. First roll each
// turn is free; each further roll costs 1 more generic mana. Never counts toward
// the 3 hero-power limit. d6: 5 = Chaos (current plane's ability), 6 = Planeshift.
export function canPlaneswalk(state, pi) {
	if (state.over || state.current !== pi) return false;
	const p = state.players[pi];
	if (!(p.sparked || p.planeswalkers.length > 0)) return false;
	return availableMana(p) >= (p.planarRollsThisTurn || 0);
}

export function planarRollCost(state, pi) { return state.players[pi].planarRollsThisTurn || 0; }

export function planeswalk(state, pi) {
	if (!canPlaneswalk(state, pi)) return false;
	const p = state.players[pi];
	const cost = p.planarRollsThisTurn || 0;
	spendMana(p, cost);
	p.planarRollsThisTurn = cost + 1;
	const roll = 1 + Math.floor(state.rng() * 6);
	emit(state, { type: 'planarRoll', player: pi, roll, cost });
	if (roll === 5) { const pd = state.plane ? state.cardsById[state.plane] : null; if (pd && pd.chaos) execEffects(state, pi, pd.chaos, null, null); }
	else if (roll === 6) { execEffects(state, pi, [{ type: 'planeshift' }], null, null); }
	sweepDeaths(state);
	checkGameOver(state);
	return true;
}

// ---------- Ward: an extra cost the enemy pays to target this creature ----------
function wardOf(state, pi, target) {
	if (!target || target.type !== 'creature') return null;
	const c = findCreature(state, target.uid);
	return (c && c.ward && c.controller !== pi && c.dormantLeft <= 0) ? c.ward : null;
}

function payWard(state, pi, target) {
	const w = wardOf(state, pi, target);
	if (!w) return;
	const p = state.players[pi];
	if (w.mana) spendMana(p, w.mana);
	if (w.life) {
		p.life -= w.life;
		emit(state, { type: 'damage', targetType: 'hero', player: pi, amount: w.life, life: p.life });
	}
	if (w.discard && p.hand.length) {
		const c = p.hand[Math.floor(state.rng() * p.hand.length)];
		p.hand = p.hand.filter(x => x !== c);
		toGraveyard(state, pi, c);
		emit(state, { type: 'discard', player: pi, card: c });
	}
	emit(state, { type: 'wardPaid', player: pi, uid: target.uid });
}

// Dampen Magic / Mysterious Tome: put a named Secret straight into play
export function installSecret(state, pi, id) {
	const p = state.players[pi];
	const def = state.cardsById[id];
	if (!def?.secret || p.secrets.length >= MAX_SECRETS || p.secrets.some(c => c.id === id)) return false;
	const c = instantiate(def, pi);
	c.zone = 'secret';
	p.secrets.push(c);
	emit(state, { type: 'secretPlayed', player: pi, card: c });
	return true;
}

// end-of-turn triggers, discard to max, pass turn, start next
export function endTurn(state) {
	if (state.over) return;
	const pi = state.current;
	const p = state.players[pi];
	p.spellTaxNext = 0; // Loatheb's tax only lasts this player's turn
	p.battlecryTaxNext = 0; // Boompistol Bully's tax only lasts through this player's turn
	{ const cursed = p.hand.filter(c => c.cursed); if (cursed.length) { let dmg = 0; for (const c of cursed) { dmg += c.curseDamage || 3; c.cursed = false; } damageHero(state, pi, dmg, pi); } } // Chaos Gazer: unplayed cursed cards bite
	for (const c of p.board) if (c.immuneTurnClear) { c.keywords = c.keywords.filter(k => k !== KW.IMMUNE); c.immuneTurnClear = false; } // Ashtongue Slayer: "Immune this turn" wears off
	p.castSpellLastTurn = (p.spellsPlayedThisTurn || 0) > 0; // Marshspawn / Shattered Rumbler: remember spellcasting across turns
	p.spellsCostOneThisTurn = false; // Ysiel Windsinger only lasts this turn
	p.nextComboDiscount = 0; // Foxy Fraud only lasts this turn
	p.nextCardsDiscount = null; // Scabbs Cutterbutter only lasts this turn
	for (const c of p.hand) c.drawnThisTurn = false; // Keli'dan: "drawn this turn" resets at end of your turn
	if (p.illuciaSwap) { p.hand = p.savedHand || []; p.savedHand = null; p.illuciaSwap = false; emit(state, { type: 'handSwap', player: pi }); } // Mindrender Illucia: hand reverts at end of turn
	p.heroPowerTaxNext = 0; // Saboteur's Hero Power tax only lasts this turn
	p.nextMurlocFree = false; p.nextSecretCost = null; // Seadevil Stinger / Kabal Lackey are "this turn"
	p.nextBattlecryDouble = false; // Murmuring Elemental only lasts this turn
	p.nextSpellDamageBonus = 0; p.nextSpellDoubleCast = false; p.spellsLifestealThisTurn = false; // Boomsday next-spell riders are "this turn"
	p.healHarmThisTurn = false; // Auchenai Phantasm only lasts this turn
	p.heroPowerDamageNext = 0; // Daring Fire-Eater only lasts this turn
	for (const pl of state.players) for (const c of pl.board) if (c.turnAtkDebuff) { c.attack += c.turnAtkDebuff; c.turnAtkDebuff = 0; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); } // Quicksand Elemental restores

	// Impulsive creatures refuse to end the turn without swinging
	for (const c of [...p.board]) {
		if (!has(c, KW.IMPULSIVE)) continue;
		let guard = 4;
		while (guard-- > 0 && !state.over && p.board.includes(c) && !isDead(c) && canAttackWith(state, pi, c)) {
			const targets = attackTargets(state, pi, c);
			if (!targets.length) break;
			if (!attack(state, pi, c.uid, targets[Math.floor(state.rng() * targets.length)])) break;
		}
	}
	if (state.over) return;

	// Delayed blink: creatures exiled "until the next end step" return now (fresh, retriggering their Battlecry)
	if (state.pendingReturns && state.pendingReturns.length) {
		const due = state.pendingReturns; state.pendingReturns = [];
		for (const r of due) returnBlinked(state, r.controller, r.def);
		sweepDeaths(state);
	}

	// end-of-turn triggers
	for (const c of [...p.board]) {
		if (c.id === 'ancient_treant') healHero(state, pi, 2);
		if (c.id === 'acidspitter_nest') {
			summon(state, pi, { ...state.cardsById['acidspitter'] });
			summon(state, pi, { ...state.cardsById['acidspitter'] });
		}
	}
	fireOngoing(state, pi, 'turn-end');
	// Poison: each Poisoned creature you control takes 2 damage at the end of
	// your turn (the condition persists until the creature is cleansed or dies).
	for (const c of [...p.board]) {
		if (c.poisoned && !isDead(c)) { emit(state, { type: 'poisonTick', uid: c.uid }); damageCreature(state, c, 2, null); }
	}
	// Gruul-style triggers tick at the end of EVERY player's turn
	for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'every-turn-end', {});
	// Medic N: patch up the board neighbors at end of turn
	for (const c of p.board) {
		if (!c.medic || isDead(c)) continue;
		const idx = p.board.indexOf(c);
		for (const nb of [p.board[idx - 1], p.board[idx + 1]]) {
			if (!nb || isDead(nb) || nb.damage <= 0) continue;
			const healed = Math.min(c.medic, nb.damage);
			nb.damage -= healed;
			emit(state, { type: 'heal', targetType: 'creature', uid: nb.uid, amount: healed, hp: hp(nb) });
		}
	}
	recomputeAuras(state); // medic heals may retract enrage/Lightspawn states
	// "this turn" bonuses expire
	for (const c of p.board) {
		if (c.tempAttack || c.tempHealth) {
			c.attack = Math.max(0, c.attack - c.tempAttack);
			c.tempAttack = 0;
			if (c.tempHealth) {
				c.maxHealth -= c.tempHealth;
				c.tempHealth = 0;
				if (c.damage >= c.maxHealth) c.damage = Math.max(0, c.maxHealth - 1);
			}
			emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
		}
	}
	p.heroTempAttack = 0;
	// Power Overwhelming: doomed creatures die as the turn ends
	for (const pl of state.players) {
		for (const c of pl.board) {
			if (c.doomTurn === state.turnNumber) {
				c.damage = c.maxHealth;
				c.shield = false;
				emit(state, { type: 'destroy', uid: c.uid });
			}
		}
	}
	// Shadow Madness: borrowed creatures go home
	for (const c of [...p.board]) {
		if (c.tempControl == null) continue;
		const home = state.players[c.tempControl];
		p.board = p.board.filter(x => x !== c);
		if (home.eliminated) {
			c.damage = c.maxHealth; // nowhere to return to
			toGraveyard(state, c.tempControl, c);
		} else {
			c.controller = c.tempControl;
			home.board.push(c);
			emit(state, { type: 'mindControl', uid: c.uid, player: c.tempControl, name: c.name });
		}
		c.tempControl = null;
		recomputeAuras(state);
	}
	// unplayed Quickdrawn cards slip back into the deck
	const qd = p.hand.filter(c => c.quickdrawn);
	if (qd.length) {
		p.hand = p.hand.filter(c => !c.quickdrawn);
		for (const c of qd) p.deck.push(c.id);
		for (let k = p.deck.length - 1; k > 0; k--) {
			const j = Math.floor(state.rng() * (k + 1));
			[p.deck[k], p.deck[j]] = [p.deck[j], p.deck[k]];
		}
		emit(state, { type: 'quickdrawReturn', player: pi, count: qd.length });
	}
	// Echo ghosts evaporate when their turn ends
	for (const c of p.hand.filter(c => c.echoGhost)) {
		emit(state, { type: 'echoFade', player: pi, name: c.name });
	}
	p.hand = p.hand.filter(c => !c.echoGhost);
	// MTG cleanup: discard down to the maximum hand size. The player chooses
	// which cards (human via the discard modal, AI dumps its priciest) — this is
	// why overdraw never burns: the cap is enforced here at end of turn, not on
	// draw. The queue resolves before the next player meaningfully acts.
	if (p.hand.length > MAX_HAND) {
		state.discardQueue.push({ player: pi, count: p.hand.length - MAX_HAND });
	}
	p.mana.bonus = 0;
	p.freeSpellsThisTurn = false;
	sweepDeaths(state);
	if (state.over) return;

	// thaw: this player's creatures frozen before this turn have now missed it
	for (const c of p.board) {
		if (c.frozen && c.frozen < state.turnNumber) {
			c.frozen = null;
			emit(state, { type: 'thaw', uid: c.uid });
		}
	}

	// switch: next alive player clockwise — unless Temporus queued forced turns
	let next = state.current;
	if (state.forcedTurns && state.forcedTurns.length) {
		do { next = state.forcedTurns.shift(); } while (next != null && state.players[next]?.eliminated && state.forcedTurns.length);
		if (next == null || state.players[next]?.eliminated) { next = state.current; do { next = (next + 1) % state.players.length; } while (state.players[next].eliminated && next !== state.current); }
	} else {
		do { next = (next + 1) % state.players.length; }
		while (state.players[next].eliminated && next !== state.current);
	}
	state.current = next;
	state.turnNumber++;
	const np = state.players[state.current];
	np.diedThisTurn = 0;
	np.diedThisTurnIds = [];
	np.heroDamagedThisTurn = false; np.heroDamageTakenThisTurn = 0; np.heroHealthChangedThisTurn = false; np.healedThisTurn = false; np.healedAmountThisTurn = 0; np.stealerUsedThisTurn = false; // "took damage this turn" resets each turn
	np.spellsPlayedLastTurnIds = np.spellsPlayedThisTurnIds || []; np.spellsPlayedThisTurnIds = []; // Krag'wa, the Frog
	np.cardsPlayedLastTurnIds = np.cardsPlayedThisTurnIds || []; np.cardsPlayedThisTurnIds = []; // Murozond the Infinite
	// Bandersmosh: at your turn start, hand copies morph into a 5/5 Legendary
	for (const c of np.hand) {
		if (!c.bandersmoshTransform) continue;
		const legs = Object.values(state.cardsById).filter(d => d.type === 'creature' && d.rarity === 'legendary' && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
		if (!legs.length) continue;
		const pick = legs[Math.floor(state.rng() * legs.length)];
		const morph = instantiate(pick, state.current);
		morph.uid = c.uid; morph.zone = 'hand'; morph.bandersmoshTransform = true; morph.attack = 5; morph.maxHealth = 5; morph.cost = c.cost;
		np.hand[np.hand.indexOf(c)] = morph;
		emit(state, { type: 'conjure', player: state.current, card: morph, color: null });
	}
	// Chameleos: each of your turns it morphs into a random card an opponent holds
	for (const c of np.hand) {
		if (!c.chameleosTransform) continue;
		const foe = opponentsOf(state, state.current).find(o => state.players[o].hand.length);
		if (foe == null) continue;
		const eh = state.players[foe].hand;
		const pick = state.cardsById[eh[Math.floor(state.rng() * eh.length)].id];
		if (!pick) continue;
		const morph = instantiate(pick, state.current);
		morph.uid = c.uid; morph.zone = 'hand'; morph.chameleosTransform = true;
		np.hand[np.hand.indexOf(c)] = morph;
		emit(state, { type: 'conjure', player: state.current, card: morph, color: null });
	}
	state.diedThisTurn = 0; // global "died this turn" (Volcanic Drake discounts)
	np.heroAttacksUsed = 0;
	np.landsPlayedThisTurn = 0;
	np.creaturesPlayedThisTurn = 0;
	np.cardsPlayedThisTurn = 0;
	np.drawsThisTurn = 0; // reset before the mandatory draw so it counts as the first
	np.spellsPlayedThisTurn = 0; np.schoolsCastThisTurn = {}; np.firstBattlecryThisTurn = null; // Metamorfin / Bolner Hammerbeak
	np.parityBlock = null; // Alara: a start-of-turn coin flip may block odd/even-cost plays
	np.planarRollsThisTurn = 0;
	{ const r = activePlaneRule(state); if (r && r.kind === 'coin-parity') { np.parityBlock = state.rng() < 0.5 ? 'odd' : 'even'; emit(state, { type: 'coinParity', player: state.current, block: np.parityBlock }); } }
	firePlaneTrigger(state, 'turn-start', state.current); // Oberaqua: mill at each turn's start
	// stale this-turn cost riders lapse; Millhouse's gift comes due
	np.costDiscounts = (np.costDiscounts || []).filter(d => !d.thisTurn);
	np.freeSpellsThisTurn = !!np.freeSpellsNextTurn;
	np.freeSpellsNextTurn = false;
	if (state.turnNumber > 1 && np.mana.max < MAX_BASE_MANA) np.mana.max++;
	np.mana.cur = np.mana.max;
	// overload: mana spent ahead of time stays locked this turn
	np.overloadLockedThisTurn = 0;
	if (np.overloadPending) {
		np.mana.cur = Math.max(0, np.mana.cur - np.overloadPending);
		emit(state, { type: 'overloaded', player: state.current, amount: np.overloadPending });
		np.overloadLockedThisTurn = np.overloadPending; // Eternal Sentinel can give these back
		np.overloadPending = 0;
	}
	// Conceal's stealth wears off at the owner's next turn
	for (const c of np.board) {
		if (c.tempStealth) {
			c.tempStealth = false;
			c.stealthed = false;
			c.keywords = c.keywords.filter(k => k !== KW.STEALTH || c.auraKeywords.includes(k));
		}
	}
	// Corruption: marks planted by this player come due at their turn start
	for (const pl of state.players) {
		for (const c of pl.board) {
			if (c.corruptedBy === state.current) {
				c.damage = c.maxHealth;
				c.shield = false;
				emit(state, { type: 'destroy', uid: c.uid });
			}
		}
	}
	// lands untap at the start of each turn (they now TAP for their abilities)
	// double-tap untap cycle: first turn the stone comes off (still tapped),
	// the next turn the land/location actually untaps
	if (!(activePlaneRule(state) && activePlaneRule(state).kind === 'no-untap')) { // Belenon: things don't untap
		for (const l of [...np.lands, ...np.board.filter(c => c.type === 'location')]) {
			if (l.tapStone) l.tapStone = false;
			else l.tapped = false;
		}
	}
	for (const hpw of np.heroPowers) hpw.usedThisTurn = false;
	for (const pw of np.planeswalkers) pw.usedThisTurn = false;
	for (const c of np.board) {
		if (c.dormantLeft > 0) {
			// sleepers tick down at their owner's turn start; waking leaves them
			// drowsy (summoning-sick) for the turn
			c.dormantLeft--;
			if (c.dormantLeft === 0) {
				c.sick = true;
				emit(state, { type: 'awaken', player: state.current, uid: c.uid, name: c.name });
				if (c.awaken) execEffects(state, state.current, c.awaken, null, c);
			}
			continue;
		}
		c.sick = false;
		c.attacksUsed = 0;
		c.abilityUsedThisTurn = false;
	}
	emit(state, { type: 'turnStart', player: state.current, turnNumber: state.turnNumber });
	// Un'Goro Elemental synergy: carry "played an Elemental" into this turn
	{ const cp = state.players[state.current]; cp.elementalLastTurn = cp.elementalThisTurn; cp.elementalThisTurn = false; }
	// in-hand "each turn" effects (Nerubian Prophet: cost -1; Shifter Zerus: transform)
	const cur = state.players[state.current];
	for (const c of cur.hand) {
		if (c.costReducePerTurn) c.cost = Math.max(0, (c.cost || 0) - 1);
		if (c.transformInHand) {
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature'
				&& !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (pool.length) { const rd = pool[Math.floor(state.rng() * pool.length)];
				c.id = rd.id; c.name = rd.name; c.attack = rd.attack || 0; c.maxHealth = rd.health || 0;
				c.cost = rd.cost || 0; c.keywords = [...(rd.keywords || [])]; c.tribe = rd.tribe;
				c.effects = rd.effects || null; c.ongoing = rd.ongoing || null; c.deathrattle = rd.deathrattle || null;
				c.transformInHand = true; // stays a Shifter
				emit(state, { type: 'conjure', player: state.current, card: c, color: null }); }
		}
	}
	// Nat, the Darkfisher: an opponent's turn began — their controllers' triggers fire
	for (const o of opponentsOf(state, state.current)) fireOngoing(state, o, 'enemy-turn-start', { drawer: state.current });
	fireOngoing(state, state.current, 'turn-start');
	sweepDeaths(state);
	if (state.over) return;
	drawCards(state, state.current, 1);
}

// drain event queue (renderer calls this each frame/action)
export function takeEvents(state) {
	const evs = state.events;
	state.events = [];
	return evs;
}
