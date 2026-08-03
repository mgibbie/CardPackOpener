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
import { effectiveCost, heroPowerCost, discountIndex } from './cost.js';
import { targetSpec, legalTargets, equipTargets, attackTargets } from './targeting.js';
import { drawCards, toGraveyard, bouncePermanent } from './zones.js';
import { damageCreature, damageHero, gainArmor, healHero } from './damage.js';
import { isDead, sweepDeaths, runDeathrattle } from './death.js';
import { execEffects, runSecretEffects } from './effects/exec.js';
export { execEffects, runSecretEffects };
import { fireOngoing, fireCreatureTrigger, ongoingCondOk, fireSecrets, fireSecretsAll } from './triggers.js';
export { fireOngoing, fireSecrets };
import { recomputeAuras, staticValue } from './auras.js';
export { recomputeAuras, staticValue };


export { isDead, sweepDeaths };

export { damageHero };

export { drawCards };

export { targetSpec, legalTargets, equipTargets, attackTargets };

export { effectiveCost, heroPowerCost };

export const STARTING_LIFE = 40;
// capped zone sizes on the player board (the creature row is unlimited)
export const MAX_LANDS = 5;
export const MAX_TRAPS = 3;
export const MAX_QUESTS = 3;
export const MAX_HERO_POWERS = 3;
// caps nested "on summon → summon…" recursion (Umbra deathrattle chains,
// self-copying Pirates); real summon chains never nest anywhere near this deep
export const MAX_SUMMON_DEPTH = 40;
// hard ceiling on live creatures per board — the Creatures row is otherwise
// uncapped, but a runaway summon chain (Umbra + self-summoning deathrattles)
// can fan out exponentially and exhaust memory. Far above any real board
// (HS caps at 7; our fill-board cards top out around there).
export const MAX_BOARD = 40;
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
// Dark Gifts (Emerald Dream) / Bonus Effects (Lost City, Great Dark Beyond): a random
// bonus riding on a card. One shared curated pool; cost reduction only applies in hand.
export const DARK_GIFTS = [
	{ label: '+3/+3', attack: 3, health: 3 },
	{ label: 'Rush', kw: 'rush' },
	{ label: 'Taunt', kw: 'taunt' },
	{ label: 'Divine Shield', kw: 'divine_shield' },
	{ label: 'Lifesteal', kw: 'lifesteal' },
	{ label: 'Poisonous', kw: 'poisonous' },
	{ label: 'Windfury', kw: 'windfury' },
	{ label: 'Stealth', kw: 'stealth' },
	{ label: 'Costs (2) less', cost: -2, handOnly: true },
	{ label: 'Deathrattle: draw a card', dr: [{ type: 'draw', value: 1 }] },
];
// Lost City Kindred: active when you control ANOTHER minion sharing a minion type
// with this card (slash-joined dual tribes; 'All' matches anything with a type).
export function kindredActive(state, pi, source) {
	if (!source) return false;
	const mine = (source.tribe || '').split('/').filter(Boolean);
	if (!mine.length) return false;
	for (const c of state.players[pi].board) {
		if (c === source || isDead(c) || c.type === 'location') continue;
		const theirs = (c.tribe || '').split('/').filter(Boolean);
		if (!theirs.length) continue;
		if (mine.includes('All') || theirs.includes('All')) return true;
		if (mine.some(t => theirs.includes(t))) return true;
	}
	return false;
}

export function applyGift(state, card, gift, opts = {}) {
	// apply a Dark Gift / Bonus Effect to a hand card or board minion
	if (!gift) { const pool = DARK_GIFTS.filter(g => !(g.handOnly && opts.board)); gift = pool[Math.floor(state.rng() * pool.length)]; }
	if (gift.attack) card.attack = (card.attack || 0) + gift.attack;
	if (gift.health) card.maxHealth = (card.maxHealth || 0) + gift.health;
	if (gift.kw && !(card.keywords || []).includes(gift.kw)) {
		(card.keywords = card.keywords || []).push(gift.kw);
		if (gift.kw === 'divine_shield') card.shield = true;
		if (gift.kw === 'stealth' && opts.board) card.stealthed = true;
	}
	if (gift.cost && !opts.board) card.cost = Math.max(0, (card.cost || 0) + gift.cost);
	if (gift.dr) { card.deathrattle = [...(card.deathrattle || []), ...JSON.parse(JSON.stringify(gift.dr))]; if (!(card.keywords || []).includes('deathrattle')) (card.keywords = card.keywords || []).push('deathrattle'); }
	card._darkGift = gift.label;
	card.description = (card.description || '') + ' [Gift: ' + gift.label + ']';
	// Wallow, the Wretched: while in your hand/deck, gains a copy of every Dark
	// Gift given to your minions. Log it on the owner and mirror onto any held
	// Wallow now; decked copies replay the log when drawn (see zones.js).
	if (!opts.noLog) {
		let owner = -1;
		for (let i = 0; i < state.players.length; i++) { const pl = state.players[i]; if (pl.board.includes(card) || pl.hand.includes(card)) { owner = i; break; } }
		if (owner >= 0) {
			const pl = state.players[owner];
			(pl.darkGiftLog = pl.darkGiftLog || []).push(gift.label);
			for (const hc of pl.hand) if (hc !== card && hc.accrueDarkGifts) applyGift(state, hc, gift, { noLog: true });
		}
	}
	return gift;
}

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

// Cards whose mechanics aren't implemented yet — excluded from generated
// decks; creatures among them would still function as vanilla bodies if
// added manually.
export const UNPLAYABLE = new Set(['silencer']);

// legacy hand-scripted cards: their effects arrays are handled by the scripted
// switch below, so the generic executor must not double-run them
const LEGACY_SCRIPTED = new Set([
	'wandering_merchant', 'legion_commander', 'pack_wolf', 'contract_killer',
	'tumbleweed_tactician', 'natures_blessing', 'fortify', 'rallying_cry',
	'wild_growth', 'mark_target', 'regroup',
]);

let nextUid = 1;

// ---------- card instances ----------
export function instantiate(def, controller) {
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
		ongoing: def.ongoing ? JSON.parse(JSON.stringify(def.ongoing)) : null, // permanent trigger { on, effects }; CLONED so per-instance spent/trigCount (once/need/every) never leak to the shared def or across games
		static: def.static ? { ...def.static } : null,   // permanent passive (e.g. reduce-hero-damage)
		heroImmuneAura: def.heroImmuneAura || false,     // Mal'Ganis / Aegis of Death: your hero is Immune while this lives
		loseDurabilityEachTurn: !!def.loseDurabilityEachTurn, // Aegis of Death: a weapon that bleeds durability every turn
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
		heroPowerTwice: !!def.heroPowerTwice, // Sing-Along Buddy: your Hero Power triggers twice
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
		inHandSwap: !!def.inHandSwap, // "each turn this is in your hand, swap its Attack & Health"
		inHandCopyLastPlayed: def.inHandCopyLastPlayed || null, // Floop/Mirrex: a hand card that IS a copy of the last creature played
		accrueDarkGifts: def.accrueDarkGifts || false, // Wallow: copies every Dark Gift given to your minions while held/decked
		bonusEffectSwap: def.bonusEffectSwap ? JSON.parse(JSON.stringify(def.bonusEffectSwap)) : null, // Twisted Monstrosity: alternates between two Bonus Effects each turn in hand
		swapStatsEndOfTurn: def.swapStatsEndOfTurn || false, // Stalwart Avenger: swap Attack/Health at end of each turn
		immuneWhileAttacking: def.immuneWhileAttacking || false, // Stalwart Avenger: Immune during its own attacks
		echo: !!def.echo,             // leaves a ghost copy in hand until end of turn
		miniaturize: !!def.miniaturize, // playing it hands you a 1/1 Mini copy for 1
		echoGhost: false,
		dormantLeft: def.dormant || 0, // turns asleep: untouchable until it wakes
		awaken: def.awaken || null,    // effects fired when dormancy ends
		activated: def.activated ? JSON.parse(JSON.stringify(def.activated)) : null, // creature abilities: [{cost, sacrifice, effects, text}] — deep-cloned so Titan power-doubling can't leak across instances
		titan: def.titan || false, // Titan: can't attack until all 3 abilities used; abilities are its `activated` list (oncePerGame each, one/turn)
		titanPassive: def.titanPassive ? JSON.parse(JSON.stringify(def.titanPassive)) : null, // "After this uses an ability, ..."
		firstSpellDiscountAura: def.firstSpellDiscountAura || false, // Golganneth: your first spell each turn costs (3) less
		damageCapAura: def.damageCapAura || false, // Amitus: your minions can't take more than 2 damage at a time
		tapAbility: def.tapAbility || null, // artifact {T} ability: { effects, text, condition? }
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
		miracle: def.miracle || null, // Miracle (HS Quickdraw): { effects } fired with the battlecry if drawnThisTurn
		temporary: !!def.temporary,   // Temporary: discarded from hand at the end of your turn
		handTransform: def.handTransform || null, // Imposters/Shapeshifter: turn-start in-hand morph { cost?, grant?, spellDamage?, fromEnemyHand?, intoId?, ifHandParity? }
		handTransformOnSchool: def.handTransformOnSchool || null, // Lady Naz'jar: while held, transform after casting a spell of a listed school
		handTransformOnTwoSchools: def.handTransformOnTwoSchools || null, // Carress: while held, transform after casting two different spell schools
		startOfGame: def.startOfGame || null, // Start of Game: effects run from the deck when the game begins
		kindredCard: !!def.kindredCard, // Lost City: a card with a Kindred bonus (Torga tutors these)
		rewind: def.rewind || 0, // TIME_TRAVEL Rewind: when played, a copy returns to your deck until N charges are spent
		rewindDouble: !!def.rewindDouble, // Morchie: while on board, your Rewind battlecries fire twice
		starshipPiece: !!def.starshipPiece, // GDB: joins your Starship under construction when it dies
		spellSchoolDiscount: def.spellSchoolDiscount ? { ...def.spellSchoolDiscount } : null, // Azure Queen Sindragosa: Arcane spells cost less while she + another Dragon are out
		costZeroIfBoardId: def.costZeroIfBoardId || null,   // Medivh the Hallowed: free if you control Karazhan
		costZeroIfWeaponId: def.costZeroIfWeaponId || null, // Karazhan the Sanctum: free if wielding Atiesh
		costReducePerPlayedName: def.costReducePerPlayedName ? { ...def.costReducePerPlayedName } : null, // Giant Rafaam
		castTwice: !!def.castTwice, // Empowered Well of Eternity spells resolve twice
		prepare: !!def.prepare, // JAIL: spend leftover mana to discount this card for a later turn
		jailbirdReduce: !!def.jailbirdReduce, // Jailbird: cheaper whenever you Prepare while holding it
		tribeDamageBoost: def.tribeDamageBoost ? { ...def.tribeDamageBoost } : null, // Goldrinn / Bralma: friendly <tribe> deals more damage
		undamagedFoesDouble: !!def.undamagedFoesDouble, // Talgath: undamaged enemy minions take double damage
		heroImmuneOnDamage: !!def.heroImmuneOnDamage, // Lumia: a damaged hero becomes Immune for the turn
		cheapSpellDouble: !!def.cheapSpellDouble, // Sunsapper Lynessa: your (2)-or-less spells cast twice
		spellEcho: !!def.spellEcho, // Lei Flamepaw: while alive, your spells cast an extra time
		handDeckGrowAttack: !!def.handDeckGrowAttack, // Grazing Stegodon: grows at end of turn wherever it is
		skipStartDraw: !!def.skipStartDraw, // Chronochiller: no start-of-turn draw
		hpFreeHandMax: def.hpFreeHandMax ?? null, // Quel'dorei Fletcher: Hero Power free at small hands
		murmurAura: !!def.murmurAura, // Murmur: Battlecry minions cost (1) but die on arrival
		lastManaGrow: !!def.lastManaGrow, // Crystalspine Cub: grows when you spend your last Mana
		overhealReactive: !!def.overhealReactive, // Anchorite: overhealed minions keep the overflow
		cleave: !!def.cleave, // Gnomelia: combat strikes also hit the target's neighbors
		endTurnDouble: !!def.endTurnDouble, // Chrono-Lord Deios: end-of-turn effects fire twice
		ogreDorm: !!def.ogreDorm, // Petrified Ogre: grows while Dormant, 50% wake
		wakeOnHeroPower: !!def.wakeOnHeroPower, // Slumbering Sprite
		immuneToSchool: def.immuneToSchool || null, // Fyrakk: immune to Fire spells
		spellDamageRedirect: def.spellDamageRedirect ? JSON.parse(JSON.stringify(def.spellDamageRedirect)) : null, // Flux Revenant / Stormrook
		wakeOnFullBoard: !!def.wakeOnFullBoard, // Ash Worm
		dragonUpgrade: !!def.dragonUpgrade, // Ebonscale Scout: becomes an 8/8 Dragon in hand
		discardScale: !!def.discardScale, // Duke of Below
		killerTransform: !!def.killerTransform, // Faceless Replicator
		noFace: !!def.noFace, // Air Support: can't attack heroes
		megaWindfury: !!def.megaWindfury, // Air Support: four attacks
		shieldLossRecruits: !!def.shieldLossRecruits, // Resilient Savior
		transformPlusCost: def.transformPlusCost || 0, // Plucky Podling
		statGainBonus: !!def.statGainBonus, // Dalaran Champion
		cthunLink: !!def.cthunLink, // Eyestalk of C'Thun
		raincaller: !!def.raincaller, // Raincaller: +2 Attack at the first spell damage each turn
		blightsInstead: !!def.blightsInstead, // The Living Plague
		kindredCostReduce: def.kindredCostReduce || 0, // Pterrorwing Ravager / Windpeak Wyrm: costs less while Kindred is active
		handDeathGrowth: !!def.handDeathGrowth, // Blood Herald: +1/+1 whenever a friendly minion dies while in hand
		scaleOnEntry: def.scaleOnEntry ? { ...def.scaleOnEntry } : null, // Astral Automaton: +stats per prior copy entered this game
		infuse: def.infuse ? { ...def.infuse } : null, // Castle Nathria Infuse: {count, id} -> transform after N friendly deaths in hand
		infuseCounter: 0,
		heroPowerCostReduce: def.heroPowerCostReduce || 0, // Felfire Deadeye: your Hero Power costs this much less
		outcastCostReduce: def.outcastCostReduce || 0, // Line Hopper: your Outcast cards cost this much less
		quickdrawCostReduce: def.quickdrawCostReduce || 0, // Captain Eberhart: your Quickdraw cards cost this much less
		schemeGrow: !!def.schemeGrow, // Master Scheme: its N grows each turn held
		handGrow: def.handGrow || null, // Loyal Henchman: {attack, health} gained each turn held
		reaper: !!def.reaper, // Soulreaper's Scythe: logs kill ids on the weapon instance
		curseDamage: def.curseDamage || 0, // Cursed!: burns its holder at the start of their turn
		healBonusHealth: def.healBonusHealth || 0, // Lightsteed: your heals also give the minion +Health
		foreignCostReduce: def.foreignCostReduce || 0, // Arcane Luminary: cards that didn't start in your deck cost less
		schoolCostReduce: def.schoolCostReduce ? { ...def.schoolCostReduce } : null, // Lady Anacondra: {school, amount}
		copyOnDraw: !!def.copyOnDraw, // Encumbered Pack Mule: drawing this adds a copy to hand
		doubleBuffs: !!def.doubleBuffs, // Saidan the Scarlet: buffs to this are doubled
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

export const TOKENS = {
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
		nextChooseOneDiscount: 0, // Pride Seeker: your next Choose One card costs this much less
		nextSpellDiscount: 0, // Murkwater Scribe: your next spell costs this much less
		nextTribeDiscount: null, // Clownfish: {tribe, count, amount} for your next minions of a tribe
		nextTribePlayReward: null, // The Great Dark Beyond Draenei: {tribe, count, attack, health, keyword, immediateAttack} for your next minions of a tribe you PLAY
		nextWeaponDiscount: 0, // Space Pirate: your next weapon costs this much less
		lastDraeneiId: null, // Astral Vigilant: the last Draenei you played
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
		anomaly: null,  // Dalaran Heist anomaly id: a symmetric run-wide rule (engine/heist.js)
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
	// remember what each deck started with (Dreamwarden / Foreboding Flame / Archimonde)
	for (const pl of state.players) pl.startingDeckIds = [...pl.deck, ...pl.hand.map(c => c.id)];
	for (const p of state.players) p.openingHand = p.hand.map(c => c.id); // Hex Lord Malacrass
	// Start of Game: cards announce themselves from the deck (Chainbreaker Hogger, Ysera Emerald Aspect, ...)
	for (let sg = 0; sg < n; sg++) {
		const pl = state.players[sg];
		for (const id of [...new Set([...pl.deck, ...pl.hand.map(c => c.id)])]) {
			const def = state.cardsById[id];
			if (def?.startOfGame) { emit(state, { type: 'startOfGame', player: sg, cardId: id, name: def.name }); execEffects(state, sg, JSON.parse(JSON.stringify(def.startOfGame)), null, null); }
		}
	}
	emit(state, { type: 'turnStart', player: 0, turnNumber: 1 });
	drawCards(state, 0, 1); // start-of-turn draw (BattleEngine.startPhase draws on turn 1 too)
	return state;
}

export function emit(state, ev) {
	state.events.push(ev);
}

// ---------- zones ----------


// Ponder triggers on extra draws / scry / dredge / gaze. A re-entrancy lock
// stops a Ponder effect that itself draws or scries from re-triggering Ponder.
export function firePonder(state, pi, ctx = {}) {
	if (state.ponderLock) return;
	state.ponderLock = true;
	try { fireOngoing(state, pi, 'ponder', ctx); }
	finally { state.ponderLock = false; }
}

// Emerge: a card's effect that fires the moment it is drawn or added to a hand
// (from hand, not the board). The lock guards against an Emerge that draws more.
export function fireEmerge(state, pi, card) {
	if (!state.dealt || state.emergeLock || !(card && card.emerge && card.emerge.length)) return;
	state.emergeLock = true;
	try { execEffects(state, pi, card.emerge, null, card); }
	finally { state.emergeLock = false; }
}



// ---------- mana ----------
export function availableMana(p) {
	return p.mana.cur + p.mana.bonus;
}
export function spendMana(p, amount) {
	const fromBonus = Math.min(p.mana.bonus, Math.max(0, amount - p.mana.cur));
	p.mana.bonus -= fromBonus;
	p.mana.cur -= (amount - fromBonus);
	if (amount > 0) {
		for (const hc of p.hand) hc._manaWhileHeld = (hc._manaWhileHeld || 0) + amount; // Felwood Treant / Broodwatcher / Merithra
		if (p.mana.cur === 0 && p.mana.bonus === 0) for (const c of p.board) if (c.lastManaGrow && !isDead(c)) { c.attack += 1; c.maxHealth += 1; } // Crystalspine Cub
	}
}

// ---------- targeting ----------
// effect target values that require the player to choose something


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



export function findCreature(state, uid) {
	for (const p of state.players) {
		const c = p.board.find(c => c.uid === uid);
		if (c) return c;
	}
	return null;
}

// token permanents (Blood/Treasure/Food) materialize in the artifact row;
// they carry a `sac` activation and are clicked/AI-cashed from the field
export function gainTokenCard(state, pi, id) {
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
export function addCardToHand(state, pi, id) {
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
export const EXCAVATE_TIERS = ['fools_azerite', 'azerite_fragment', 'azerite_chunk', 'azerite_gem'];
export const EXCAVATE_LEGENDARIES = {
	barbarian: ['the_azerite_mammoth'], bard: ['the_azerite_dolphin'], bounty_hunter: ['the_azerite_horse'],
	centurion: ['the_azerite_beetle', 'the_azerite_goat'], death_knight: ['the_azerite_rat'],
	demon_hunter: ['the_azerite_pig'], druid: ['the_azerite_monkey'], hunter: ['the_azerite_lynx'],
	mage: ['the_azerite_hawk'], naturalist: ['the_azerite_tiger', 'the_azerite_wolf'],
	paladin: ['the_azerite_dragon', 'the_azerite_goat'], priest: ['the_azerite_rooster'],
	ranger: ['the_azerite_rabbit'], rogue: ['the_azerite_scorpion'],
	shaman: ['the_azerite_murloc', 'the_azerite_wolf'], sorcerer: ['the_azerite_hydra'],
	warlock: ['the_azerite_snake'], warrior: ['the_azerite_ox'], wizard: ['the_azerite_otter'],
};
export const ALL_AZERITE_LEGENDARIES = [...new Set(Object.values(EXCAVATE_LEGENDARIES).flat())];


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

// ---------- Prepare (Escape from Violet Hold) ----------
// spend your remaining Mana to reduce the card's Cost by that much +1 (capped
// at reaching 0); once per card, and it can't be played the turn you Prepare
export function canPrepare(state, pi, card) {
	if (state.over || state.current !== pi) return false;
	const p = state.players[pi];
	return !!card.prepare && !card._prepared && p.hand.includes(card) && (card.cost || 0) > 0;
}

export function prepareCard(state, pi, uid) {
	const p = state.players[pi];
	const card = p.hand.find(c => c.uid === uid);
	if (!card || !canPrepare(state, pi, card)) return false;
	const spend = Math.max(0, Math.min(availableMana(p), (card.cost || 0) - 1));
	spendMana(p, spend);
	const discount = spend + 1;
	card.cost = Math.max(0, (card.cost || 0) - discount);
	card._prepared = true;
	card.lockedUntilTurn = state.turnNumber + 1; // Preparing: can't be played this turn
	emit(state, { type: 'prepared', player: pi, uid: card.uid, name: card.name, discount });
	// Jailbird: reduce its Cost by the same amount every time you Prepare while holding it
	for (const c of p.hand) if (c.jailbirdReduce && c !== card && (c.cost || 0) > 0) {
		c.cost = Math.max(0, (c.cost || 0) - discount);
		emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost });
	}
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
	p.sacrificedThisTurn = p.sacrificedThisTurn || {};
	p.sacrificedThisTurn[card.id] = (p.sacrificedThisTurn[card.id] || 0) + 1; // enables "if you've sacrificed a Clue this turn"
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




export function freezeCreature(state, c) {
	if (isDead(c)) return;
	const wasFrozen = c.frozen;
	c.frozen = state.turnNumber;
	emit(state, { type: 'freeze', uid: c.uid });
	// let each player's triggers react ("After an enemy creature is Frozen...")
	if (!wasFrozen) for (let s = 0; s < state.players.length; s++) {
		fireOngoing(state, s, 'creature-frozen', { frozen: c, byEnemy: c.controller !== s });
		const sp = state.players[s];
		// Arctic Armor (Duels): the first enemy you Freeze each turn gives you 2 Armor
		if (sp.arcticArmor && c.controller !== s && sp._arcticTurn !== state.turnNumber) { sp._arcticTurn = state.turnNumber; gainArmor(state, s, 2); }
		// Ring of Black Ice (Duels): a Frozen creature adds a (2)-cheaper copy to your hand
		if (sp.ringOfBlackIce && state.cardsById[c.id] && sp.hand.length < MAX_HAND) {
			const cp = instantiate(state.cardsById[c.id], s); cp.zone = 'hand'; cp.cost = Math.max(0, (cp.cost || 0) - 2);
			sp.hand.push(cp); emit(state, { type: 'conjure', player: s, card: cp, color: null });
		}
	}
}

// silence: strips keywords, granted states, and death effects (stat buffs stay)
export function silenceCreature(state, c) {
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
export function destroyPermanent(state, ownerPi, card, toExile = false) {
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



// fallen players are eliminated (their slice clears); last one standing wins
export function checkGameOver(state) {
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
export function summon(state, pi, tokenDef) {
	const p = state.players[pi];
	if (p.eliminated) return null;
	// board ceiling: refuse once the row is saturated, so a runaway summon
	// chain can't fan out into an out-of-memory blowup (callers that loop on
	// summon() already break on null)
	if (p.board.filter(x => !isDead(x) && x.type !== 'location').length >= MAX_BOARD) return null;
	const c = instantiate(tokenDef, pi);
	c.zone = 'board';
	if (p.nextRecruitBuff && c.name === 'Silver Hand Recruit') { c.attack += p.nextRecruitBuff.attack || 0; c.maxHealth += p.nextRecruitBuff.health || 0; if (p.nextRecruitBuff.deathrattle) { c.deathrattle = (c.deathrattle || []).concat(JSON.parse(JSON.stringify(p.nextRecruitBuff.deathrattle))); if (!c.keywords.includes('deathrattle')) c.keywords.push('deathrattle'); } p.nextRecruitBuff = null; } // Stewart the Steward
	if (p.recruitAttackBonus && c.name === 'Silver Hand Recruit') c.attack += p.recruitAttackBonus; // Brash Battlemaster
	if (p.recruitHealthBonus && c.name === 'Silver Hand Recruit') c.maxHealth += p.recruitHealthBonus; // Resilient Savior
	if (p.leechBoost && c.name === 'Leech') c.attack += p.leechBoost; // Hideous Husk: Leeches steal more
	// Ash Worm: a full board wakes the sleepers
	if (p.board.filter(x => !isDead(x) && x.type !== 'location').length >= 6) {
		for (const w of p.board) if (w.wakeOnFullBoard && w.dormantLeft > 0) { w.dormantLeft = 0; w.sick = true; emit(state, { type: 'awaken', player: pi, uid: w.uid, name: w.name }); }
	}
	if (p.nextTribeSummonBuff && (c.tribe || '').includes(p.nextTribeSummonBuff.tribe)) { c.attack += p.nextTribeSummonBuff.attack || 0; c.maxHealth += p.nextTribeSummonBuff.health || 0; p.nextTribeSummonBuff = null; } // Thornmantle Musician
	if (p.tribeSummonBuff && state.turnNumber < p.tribeSummonBuff.untilTurn && (c.tribe || '').includes(p.tribeSummonBuff.tribe)) { for (const k of p.tribeSummonBuff.keywords) if (!c.keywords.includes(k)) { c.keywords.push(k); if (k === KW.DIVINE_SHIELD) c.shield = true; } } // Timewarden: Dragons gain Taunt + Divine Shield
	if (c.scaleOnEntry) { const n = p.enteredCountById?.[c.id] || 0; if (n > 0) { c.attack += (c.scaleOnEntry.attack || 0) * n; c.maxHealth += (c.scaleOnEntry.health || 0) * n; } } // Astral Automaton: +1/+1 per other summoned this game
	(p.enteredCountById = p.enteredCountById || {})[c.id] = (p.enteredCountById[c.id] || 0) + 1;
	if (state.anomaly && c.type !== 'location') { // Dalaran Heist anomalies, applied symmetrically to every summon
		if (state.anomaly === 'infused') { const ks = [KW.TAUNT, KW.DIVINE_SHIELD, KW.RUSH, KW.WINDFURY]; const k = ks[Math.floor(state.rng() * ks.length)]; if (!c.keywords.includes(k)) { c.keywords.push(k); if (k === KW.DIVINE_SHIELD) c.shield = true; } }
		else if (state.anomaly === 'explosive') { c.deathrattle = (c.deathrattle || []).concat([{ type: 'damage', value: 1, target: 'all-creatures' }]); if (!c.keywords.includes(KW.DEATHRATTLE)) c.keywords.push(KW.DEATHRATTLE); }
		else if (state.anomaly === 'nesting') { c.deathrattle = (c.deathrattle || []).concat([{ type: 'summon', count: 1, attack: 1, health: 1, name: c.name }]); if (!c.keywords.includes(KW.DEATHRATTLE)) c.keywords.push(KW.DEATHRATTLE); }
	}
	p.board.push(c);
	emit(state, { type: 'summon', player: pi, card: c });
	questTick(state, 'summon', pi, 1, c);
	// Runaway-summon guard: "when you summon a creature, summon…" triggers can
	// recurse without bound — e.g. Spiritsinger Umbra fires a summoned minion's
	// summon-deathrattle, or a self-copying Pirate (Shoplifter Goldbeard). Past
	// a sane nesting depth the minion still enters play, but its on-summon
	// triggers are skipped so the chain terminates instead of overflowing.
	if ((state.summonDepth || 0) < MAX_SUMMON_DEPTH) {
		state.summonDepth = (state.summonDepth || 0) + 1;
		try {
			summonColossalParts(state, pi, c);
			fireOngoing(state, pi, 'summoned', { minion: c });
			for (const o of opponentsOf(state, pi)) fireOngoing(state, o, 'enemy-summoned', { minion: c }); // Bayfin Bodybuilder
			growBlubberBaron(state, pi, c);
			recomputeAuras(state);
			// "When summoned" effects (Colossal appendages) fire after it lands
			if (c.onSummon) execEffects(state, pi, c.onSummon, null, c);
		} finally {
			state.summonDepth--;
		}
	} else {
		recomputeAuras(state);
	}
	return c;
}

// find any permanent by uid across all zones (board/artifacts/enchantments/planeswalkers)
export function findPermanent(state, uid) {
	for (const p of state.players)
		for (const zone of [p.board, p.artifacts, p.enchantments, p.planeswalkers]) {
			const c = zone.find(x => x.uid === uid);
			if (c) return c;
		}
	return null;
}
// return any permanent to its owner's hand (Cryptic Command's bounce mode, etc.)


// return a blinked creature as a fresh permanent and retrigger its Battlecry
// (guarded against runaway blink chains, e.g. two Felidar Guardians)
export function returnBlinked(state, controller, def) {
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
export function heraldMult(count) { return count < 2 ? 1 : count < 4 ? 2 : 4; }

// Blubber Baron: grows in hand whenever you summon a Battlecry creature
export function growBlubberBaron(state, pi, summoned) {
	if (!summoned?.keywords?.includes('battlecry')) return;
	for (const h of state.players[pi].hand) if (h.id === 'blubber_baron') {
		h.attack += 1; h.maxHealth += 1;
		emit(state, { type: 'buff', uid: h.uid, attack: h.attack, hp: hp(h) });
	}
}


// C'Thun: its buffs are tracked on the player and persist "wherever it is". Any
// C'Thun instance in hand or on board is kept in sync with the 6/6 base + tracker.
export const CTHUN_BASE = 6;
export function syncCthun(state, pi) {
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






// ---------- quests ----------
// goal kinds counted for the acting player only, except 'death' which every
// quest holder counts no matter whose creature fell
const ANY_ACTOR_GOALS = new Set(['death']);

export function questTick(state, kind, actorPi, amount = 1, ctxCard = null) {
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

// ---------- artifact tap abilities ----------
// def.tapAbility = { effects, text, condition? }: an activated {T} ability on a
// permanent artifact. It taps (untapping at the owner's next turn start) and runs
// its effects, optionally gated by a per-turn condition (e.g. sacrificed a Clue).
function tapArtifactCondOk(state, pi, cond) {
	if (!cond) return true;
	const p = state.players[pi];
	if (cond.sacrificedThisTurn) return ((p.sacrificedThisTurn || {})[cond.sacrificedThisTurn] || 0) > 0;
	return true;
}
export function tapArtifactSpec(state, pi, cardUid) {
	const card = state.players[pi].artifacts.find(a => a.uid === cardUid);
	if (!card || !card.tapAbility) return null;
	return targetSpec(state, pi, { id: card.id, type: 'sorcery', effects: card.tapAbility.effects });
}
export function canTapArtifact(state, pi, cardUid) {
	if (state.over || state.current !== pi) return false;
	const card = state.players[pi].artifacts.find(a => a.uid === cardUid);
	if (!card || !card.tapAbility || card.tapped) return false;
	if (!tapArtifactCondOk(state, pi, card.tapAbility.condition)) return false;
	const spec = tapArtifactSpec(state, pi, cardUid);
	if (spec && spec.required && legalTargets(state, pi, spec).length === 0) return false;
	return true;
}
export function tapArtifact(state, pi, cardUid, target = null) {
	if (!canTapArtifact(state, pi, cardUid)) return false;
	const card = state.players[pi].artifacts.find(a => a.uid === cardUid);
	card.tapped = true;
	emit(state, { type: 'artifactTapped', player: pi, card, text: card.tapAbility.text });
	execEffects(state, pi, JSON.parse(JSON.stringify(card.tapAbility.effects)), target, card);
	sweepDeaths(state);
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
	if (a.requireTribeInHand && !p.hand.some(c => (c.tribe || '').includes(a.requireTribeInHand))) return false; // Heir to Dragonfire: reveal a Dragon
	if (a.oncePerGame && (card._onceAbilities || []).includes(i)) return false; // "activate only once"
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
	if (a.oncePerGame) (card._onceAbilities = card._onceAbilities || []).push(i);
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
	if (card.titan) fireTitanPassive(state, pi, card, i); // Titan passives: "After this uses an ability, ..."
	return true;
}

// Titan "After this uses an ability, ..." passives. Fires once per ability use;
// the used ability index is already in card._onceAbilities by now.
function doubleAbilityPower(ab) {
	const walk = arr => { for (const e of arr || []) { if (typeof e.value === 'number') e.value *= 2; if (typeof e.attack === 'number') e.attack *= 2; if (typeof e.health === 'number') e.health *= 2; walk(e.then); walk(e.else); walk(e.effects); walk(e.ifDies); } };
	walk(ab.effects);
	ab.text = (ab.text || '') + ' (doubled)';
}
export function fireTitanPassive(state, pi, card, usedIndex) {
	const pas = card.titanPassive;
	if (!pas) return;
	if (pas.type === 'double-other-abilities') { // Norgannon
		const used = new Set(card._onceAbilities || []);
		(card.activated || []).forEach((ab, idx) => { if (!used.has(idx)) doubleAbilityPower(ab); });
		emit(state, { type: 'titanPassive', player: pi, card, text: 'Doubled the power of the other abilities' });
		return;
	}
	if (pas.type === 'repeat-on-random-friendly') { // V-07-TR-0N Prime
		const others = state.players[pi].board.filter(c => c !== card && !isDead(c) && c.type === 'creature');
		if (others.length) {
			const tgt = others[Math.floor(state.rng() * others.length)];
			emit(state, { type: 'titanPassive', player: pi, card, text: 'Repeats on ' + tgt.name });
			execEffects(state, pi, JSON.parse(JSON.stringify(card.activated[usedIndex].effects)), null, tgt);
			sweepDeaths(state);
		}
		return;
	}
	if (pas.type === 'after-ability-effects') { // Khaz'goroth / Aman'Thul / The Primus / Eonar / Yogg-Saron
		emit(state, { type: 'titanPassive', player: pi, card, text: pas.text || 'Titan passive' });
		execEffects(state, pi, JSON.parse(JSON.stringify(pas.effects)), null, card);
		sweepDeaths(state);
		return;
	}
}

// ---------- weapons ----------
export function spendCorpses(state, pi, n) {
	if (!(n > 0)) return;
	const p = state.players[pi];
	p.corpses = Math.max(0, (p.corpses || 0) - n);
	// Duels: "the first time you spend a Corpse in a turn"
	if (p._corpseSpentTurn !== state.turnNumber) {
		p._corpseSpentTurn = state.turnNumber;
		if (p.bloodShields) healHero(state, pi, 2); // Blood Shields
		if (p.ghoulsRushIn) summon(state, pi, { id: 'token_risen_ghoul', name: 'Risen Ghoul', type: 'creature', cost: 0, rarity: 'common', token: true, attack: 2, health: 2, keywords: ['rush'], description: 'A 2/2 Risen Ghoul with Rush.' }); // Ghouls Rush In
	}
}

export function breakWeapon(state, pi, destroyed) {
	const p = state.players[pi];
	if (!p.weapon) return;
	const w = p.weapon;
	p.weapon = null;
	toGraveyard(state, pi, w);
	emit(state, { type: 'weaponBreak', player: pi, name: w.name, destroyed: !!destroyed });
	if (w.deathrattle) execEffects(state, pi, w.deathrattle, null, w); // Quick Pick
	recomputeAuras(state); // Southsea Deckhand loses conditional Charge
	fireOngoing(state, pi, 'weapon-destroyed', {}); // Grave Shambler
	if (p.pillageFallen) { const wpool = Object.values(state.cardsById).filter(d => d.type === 'weapon' && (d.cost || 0) === (w.cost || 0) && !d.token && d.collectible !== false && !(d.colors && d.colors.length) && d.id !== w.id); if (wpool.length) { const nw = wpool[Math.floor(state.rng() * wpool.length)]; execEffects(state, pi, [{ type: 'equip', name: nw.name, attack: (nw.attack || 0) + 1, durability: nw.durability || 1 }], null, null); } } // Pillage the Fallen (Duels)
}

export function degradeWeapon(state, pi) {
	const w = state.players[pi].weapon;
	if (!w) return;
	w.durability -= 1;
	emit(state, { type: 'weaponDurability', player: pi, attack: w.attack, durability: w.durability });
	if (w.durability <= 0) breakWeapon(state, pi, false);
}





// ---------- scripted card mechanics (text the Lua engine didn't implement) ----------
export function runBattlecry(state, pi, card, target, choice) {
	const p = state.players[pi];
	// data-driven battlecries (imported sets); legacy ids stay hand-scripted below
	if ((card.effects || card.choices || card.combo || (card._kicked && card.kicker)) && !LEGACY_SCRIPTED.has(card.id)) {
		// Murmuring Elemental: this card's Battlecry fires twice (consumed here, but
		// never by the card that armed it — its own effect sets the flag AFTER this read)
		const flagDouble = p.nextBattlecryDouble;
		if (flagDouble) p.nextBattlecryDouble = false;
		execEffects(state, pi, liveEffectsOf(state, pi, card, choice), target, card);
		// Battle Totem (dungeon treasure / Jin'zo passive) or a live Brann
		// or Zee's Might (every fifth minion you play triggers its Battlecry twice)
		if (flagDouble || p.battlecriesTwice
			|| (p.zeeMight && card.type === 'creature' && (p.minionsPlayedGame || 0) % 5 === 0)
			|| p.board.some(c => c.battlecryDouble && !isDead(c) && c !== card)) {
			execEffects(state, pi, liveEffectsOf(state, pi, card, choice), target, card);
		}
	}
	// Miracle (HS Quickdraw): bonus effects when played the same turn it was drawn
	if (card.miracle && card.drawnThisTurn) execEffects(state, pi, JSON.parse(JSON.stringify(card.miracle.effects || [])), target, card);
	// Morchie: your Rewinds keep BOTH outcomes — Rewind battlecries fire twice
	if (card.rewind > 0 && card.effects && !LEGACY_SCRIPTED.has(card.id)
		&& p.board.some(c => c.rewindDouble && !isDead(c) && c !== card)) {
		execEffects(state, pi, liveEffectsOf(state, pi, card, choice), target, card);
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



// generic effect executor shared by spells, battlecries, and deathrattles.
// `target` is the player's chosen target (or null); AoE targets need no choice.
// `source` is the card whose effect is running (used by gain-weapon-attack).


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
	if (target && target.type === 'creature') fireOngoing(state, pi, 'spell-cast-on-creature', { played: card, targetCreature: findCreature(state, target.uid) }); // Sethekk Veilweaver / Stormwind Avenger
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

export function runSpell(state, pi, card, target, choice) {
	// Farseer Nobundo's Galaxy Lens: the next spell is absorbed — a copy returns to hand
	if (state.players[pi].galaxyLens && state.cardsById[card.id] && !card.token) {
		state.players[pi].galaxyLens = false;
		const p2 = state.players[pi];
		if (p2.hand.length < MAX_HAND) {
			const cp = instantiate(state.cardsById[card.id], pi); cp.zone = 'hand'; p2.hand.push(cp);
			emit(state, { type: 'conjure', player: pi, card: cp, color: null });
		}
	}
	execEffects(state, pi, liveEffectsOf(state, pi, card, choice), target, card);
	if (card.castTwice) execEffects(state, pi, liveEffectsOf(state, pi, card, choice), target, card); // Empowered Well of Eternity
	// Sunsapper Lynessa: your spells that cost (2) or less cast twice
	else if ((card.cost || 0) <= 2 && state.players[pi].board.some(c => c.cheapSpellDouble && !isDead(c))) {
		execEffects(state, pi, liveEffectsOf(state, pi, card, choice), target, card);
	}
	// Lei Flamepaw: while it's on your board, your spells cast an extra time
	else if (state.players[pi].board.some(c => c.spellEcho && !isDead(c))) {
		execEffects(state, pi, liveEffectsOf(state, pi, card, choice), target, card);
	}
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
export const isSpellType = card => card.type === 'sorcery' || card.type === 'instant' || card.type === 'secret' || card.type === 'trap';




// what the card actually costs after self-scaling printed costs (Giants),
// board cost auras (Sorcerer's Apprentice / Mana Wraith), one-shot riders
// (Preparation / Far Sight-style live on card.cost itself), and Millhouse
// the active arena plane's continuous static rule (or null)
export function activePlaneRule(state) {
	const pd = state.plane ? state.cardsById[state.plane] : null;
	return pd && pd.staticRule ? pd.staticRule : null;
}
// the active plane's continuous trigger fires effects for player `pi` on an
// event (turn-start, creature-died, spell-cast) — Oberaqua, Takenuma, etc.
export function firePlaneTrigger(state, when, pi) {
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



// ---------- public actions ----------
export function canPlay(state, pi, card) {
	if (state.over) return false;
	if (card.lockedUntilTurn && state.turnNumber < card.lockedUntilTurn) return false; // Coilfang Constrictor
	if (card.type === 'instant') { if (!hasPriority(state, pi)) return false; }
	else if (!(state.current === pi && state.priority == null && state.stack.length === 0)) return false;
	if (availableMana(state.players[pi]) < effectiveCost(state, pi, card) && !(card.altCost && canPayAlt(state, pi, card))) return false;
	if (state.players[pi].robesTwoCards && card.type !== 'instant' && (state.players[pi].cardsPlayedThisTurn || 0) >= 2) return false; // Robes of Gaudiness: only two cards a turn
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
	// Duels snapshots (Brittle Bones / Eerie Stone / Mantle of Ignition): the enemy board & the spell target's neighbors, before the spell resolves
	const _duelsSpell = isSpellType(card);
	const _duelsEnemyBefore = _duelsSpell ? state.players.flatMap((pl, _i) => (_i !== pi && !pl.eliminated) ? pl.board.filter(c => !isDead(c) && c.type === 'creature').map(c => ({ uid: c.uid, id: c.id })) : []) : null;
	const _mantleNeighbors = (_duelsSpell && p.mantleIgnition && target && target.type === 'creature') ? (() => { const tc = findCreature(state, target.uid); if (!tc) return []; const b = state.players[tc.controller].board; const ti = b.indexOf(tc); return [b[ti - 1], b[ti + 1]].filter(x => x && !isDead(x) && x.type === 'creature').map(x => ({ uid: x.uid, player: x.controller })); })() : [];
	// Corrupt compares the cost of the card being played (captured before its own
	// discounts are consumed) against each Corrupt card still in hand.
	const playedCost = effectiveCost(state, pi, card);
	card._paidCost = playedCost; // Void Ray / Verdant Dreamsaber: "if this costs (0)/(3) or less"
	card._handIndex = p.hand.findIndex(x => x.uid === cardUid); // Skittish Saucier: adjacency in hand
	card._handEdge = card._handIndex === 0 || card._handIndex === p.hand.length - 1; // Altruis: left/right-most plays
	if (card.temporary && p.nextTempDiscount > 0) p.nextTempDiscount = 0; // Spelunker: spent by the next Temporary card
	if (p.nextCardCorpses) { spendCorpses(state, pi, card.cost || 0); p.nextCardCorpses = false; emit(state, { type: 'corpses', player: pi, corpses: p.corpses }); } // Exarch Maladaar: paid in Corpses
	if (p.agamagganNext) { p.agamagganNext = false; for (const o of opponentsOf(state, pi)) { damageHero(state, o, Math.min(10, card.cost || 0), pi, true); break; } } // Agamaggan: the opponent's Health pays
	if (p.spellsCostHealth && isSpellType(card)) damageHero(state, pi, card.cost || 0, pi, true); // Elixir of Vile: spells cost Health
	if (p.warlocNext && (card.tribe || '').includes('Murloc') && (card.cost || 0) <= 3) { p.warlocNext = false; damageHero(state, pi, card.cost || 0, pi, true); } // Warloc: your Health pays
	if (card.combo && p.nextComboDiscount > 0) p.nextComboDiscount = 0; // Foxy Fraud discount is spent by the next Combo card
	if (card.choices && p.nextChooseOneDiscount > 0) p.nextChooseOneDiscount = 0; // Pride Seeker discount is spent by the next Choose One card
	if (isSpellType(card) && p.nextSpellDiscount > 0) p.nextSpellDiscount = 0; // Murkwater Scribe: spent by the next spell
	if (card.type === 'weapon' && p.nextWeaponDiscount > 0) p.nextWeaponDiscount = 0; // Space Pirate: spent by the next weapon
	if (card.id === 'gdb_launch_starship' && p.nextLaunchDiscount > 0) p.nextLaunchDiscount = 0; // SCV: spent by the launch
	if (p.nextNameDiscount && (card.name || '').includes(p.nextNameDiscount.substr)) p.nextNameDiscount = null; // Murloc Rafaam: spent
	if (isSpellType(card) && p.nextSchoolDiscount && schoolOf(card) === p.nextSchoolDiscount.school) p.nextSchoolDiscount = null; // Holy Cowboy: spent by the next matching spell
	if (card.type === 'creature' && p.nextTribeDiscount && p.nextTribeDiscount.count > 0 && (card.tribe || '').includes(p.nextTribeDiscount.tribe)) { if (p.nextTribeDiscount.overload) p.overloadPending = (p.overloadPending || 0) + p.nextTribeDiscount.overload; p.nextTribeDiscount.count -= 1; if (p.nextTribeDiscount.count <= 0) p.nextTribeDiscount = null; } // Clownfish / Planetary Navigator
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
	// Xortoth's Stars: removing this card may have brought the two Stars together
	{
		const si = p.hand.map((c, i) => c.id === 'xortoth_star' ? i : -1).filter(i => i >= 0);
		if (si.length >= 2 && si[1] - si[0] === 1) {
			p.hand = p.hand.filter(c => c.id !== 'xortoth_star');
			emit(state, { type: 'starCollision', player: pi });
			execEffects(state, pi, [{ type: 'damage', value: 5, target: 'enemies' }], null, null);
		}
	}
	if (ward) payWard(state, pi, target);
	card._kicked = false;
	// pay the price QUOTED at declare time (playedCost, captured before the
	// one-shot discount consumption above). Recomputing effectiveCost here
	// re-charged the undiscounted price after the discount flags were cleared —
	// overcharging every "next X costs less" play and driving mana negative
	// when the player had exact mana (fuzz finding, seed 420484).
	if (kicked && card.kicker && availableMana(p) >= playedCost + card.kicker.cost) {
		card._kicked = true; // paid the base cost + the kicker
		spendMana(p, playedCost + card.kicker.cost);
	} else if (card.altCost && canPayAlt(state, pi, card) && (useAlt || availableMana(p) < playedCost)) {
		payAlt(state, pi, card); // paid the alternative cost instead of mana (chosen, or forced when mana is short)
	} else if (card.xSpell) {
		// X-spells drink every remaining point; X = what's left after the base cost
		card.xValue = Math.max(0, availableMana(p) - playedCost);
		spendMana(p, availableMana(p));
	} else {
		spendMana(p, playedCost);
	}
	// a matching one-shot discount is spent by this play
	const usedDiscount = discountIndex(state, p, card);
	if (usedDiscount >= 0) p.costDiscounts.splice(usedDiscount, 1);
	if (card.overload) {
		if (p.overloadFreeTurn !== state.turnNumber) p.overloadPending += card.overload; // Pebbly Page: no lock this turn
		emit(state, { type: 'overload', player: pi, amount: card.overload });
		fireOngoing(state, pi, 'overloaded-self', { amount: card.overload }); // Tunnel Trogg
	}
	emit(state, { type: 'play', player: pi, card, mana: availableMana(p) });
	state.expanseEvents = (state.expanseEvents || 0) + 1; // The Ceaseless Expanse: a card was played
	// Inspector Murloc Holmes: opponents' investigations pay out on a name match
	for (const o of opponentsOf(state, pi)) {
		const op = state.players[o];
		if (op.investigate && state.turnNumber <= op.investigate.until && card.name === op.investigate.name) {
			op.investigate = null;
			for (let n = 0; n < 3 && op.hand.length < MAX_HAND && state.cardsById['coin']; n++) {
				const cn = instantiate(state.cardsById['coin'], o); cn.zone = 'hand'; op.hand.push(cn);
				emit(state, { type: 'conjure', player: o, card: cn, color: null });
			}
		}
	}
	// Mind Sweeper / Enthralled Shade: playing an enemy-copied card is remembered
	if (card._copiedFromEnemy) { for (const hc of p.hand) hc._enemyCopyWhileHeld = true; }
	// Ebonscale Scout: playing a Dragon upgrades held copies into 8/8 Dragons
	if ((card.tribe || '').includes('Dragon')) {
		for (const hc of p.hand) if (hc.dragonUpgrade && !(hc.tribe || '').includes('Dragon')) {
			hc.attack = 8; hc.maxHealth = 8; hc.tribe = 'Dragon';
			emit(state, { type: 'costChange', player: pi, uid: hc.uid, cost: hc.cost });
		}
	}
	// Timelord Nozdormu: dormant sleepers wake sooner as you play cards of their set
	{
		const playedSet = state.cardsById[card.id]?.set;
		if (playedSet) for (const m of p.board) {
			if (m.dormantLeft > 0 && state.cardsById[m.id]?.awakenOnSetPlay === playedSet) {
				m.dormantLeft--;
				emit(state, { type: 'dormant', player: pi, uid: m.uid, turns: m.dormantLeft });
			}
		}
	}
	// Rewind (TIME_TRAVEL): a copy returns to your deck until the charges run out
	// (charges tracked per card id — Mister Clocksworth's x3 = four total plays)
	if (card.rewind > 0 && !card.token && state.cardsById[card.id]) {
		const spent = (p.rewindSpent = p.rewindSpent || {});
		if ((spent[card.id] || 0) < card.rewind) {
			spent[card.id] = (spent[card.id] || 0) + 1;
			p.deck.push(card.id);
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'rewind', player: pi, cardId: card.id, name: card.name, remaining: card.rewind - spent[card.id] });
		}
	}
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
	if (card.secret) { p.nextSecretCost = null; p.secretsThisGame = (p.secretsThisGame || 0) + 1; fireOngoing(state, pi, 'secret-played', { secret: card }); } // Professor Putricide / Tomb Diver counts secrets
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
		p.minionsPlayedGame = (p.minionsPlayedGame || 0) + 1; // Zee's Might
		emit(state, { type: 'magnetized', player: pi, uid: t.uid, name: card.name,
			attack: t.attack, hp: hp(t) });
		recomputeAuras(state);
	} else if (card.type === 'creature') {
		card.zone = 'board';
		card.sick = true;
		if (card.scaleOnEntry) { const n = p.enteredCountById?.[card.id] || 0; if (n > 0) { card.attack += (card.scaleOnEntry.attack || 0) * n; card.maxHealth += (card.scaleOnEntry.health || 0) * n; } } // Astral Automaton (played from hand)
		if (p.nextMinionStats && p.nextMinionStats.count > 0) { card.attack = p.nextMinionStats.attack; card.maxHealth = p.nextMinionStats.health; card.damage = 0; p.nextMinionStats.count--; if (p.nextMinionStats.count <= 0) p.nextMinionStats = null; } // Hodir: set the next N minions to fixed stats
		// Ebyssian: your Dragons have Rush this game
		if (p.dragonsRush && (card.tribe || '').includes('Dragon') && !card.keywords.includes('rush')) card.keywords.push('rush');
		// "The next Draenei you play gains +X/+Y / a keyword / attacks immediately / summons a copy / etc." (Starlight Wanderer, Askara, Ingenious Artificer, Unyielding Vindicator, ...)
		let draeneiImmediateAttack = false, draeneiSummonCopy = false, draeneiRefreshMana = false, draeneiHeroAttack = false;
		if (p.nextTribePlayReward && p.nextTribePlayReward.count > 0 && (card.tribe || '').includes(p.nextTribePlayReward.tribe)) {
			const r = p.nextTribePlayReward;
			card.attack += r.attack || 0; card.maxHealth += r.health || 0;
			if (r.keyword && !card.keywords.includes(r.keyword)) { card.keywords.push(r.keyword); if (r.keyword === KW.DIVINE_SHIELD) card.shield = true; }
			if (r.giftLabels) for (const gl of r.giftLabels) { const g = DARK_GIFTS.find(x => x.label === gl); if (g) applyGift(state, card, g, { board: true }); } // Ace Wayfinder: same Bonus Effects
			if (r.immediateAttack) draeneiImmediateAttack = true;
			if (r.summonCopy) draeneiSummonCopy = true;
			if (r.refreshManaByAttack) draeneiRefreshMana = true;
			if (r.heroAttackByOwnAttack) draeneiHeroAttack = true;
			r.count -= 1; if (r.count <= 0) p.nextTribePlayReward = null;
		}
		(p.enteredCountById = p.enteredCountById || {})[card.id] = (p.enteredCountById[card.id] || 0) + 1;
		// position = insertion index (adjacency matters); default = right end
		if (position == null || position >= p.board.length) p.board.push(card);
		else p.board.splice(Math.max(0, position), 0, card);
		p.creaturesPlayedThisTurn++;
		p.minionsPlayedGame = (p.minionsPlayedGame || 0) + 1; // Zee's Might
		questTick(state, 'summon', pi, 1, card);
		// Flobbidinous Floop / Mirrex: hand cards that ARE a fixed-stat copy of the last creature you (or your opponent) played
		{ const cdef = state.cardsById[card.id] || card;
			for (let hi = 0; hi < state.players.length; hi++) { const wantFrom = hi === pi ? 'self' : 'enemy';
				for (const hc of [...state.players[hi].hand]) { const cfg = hc.inHandCopyLastPlayed; if (!cfg || cfg.from !== wantFrom) continue;
					const morph = instantiate(cdef, hi); morph.uid = hc.uid; morph.zone = 'hand'; morph.attack = cfg.attack; morph.maxHealth = cfg.health; morph.damage = 0; if (cfg.cost != null) morph.cost = cfg.cost; morph.inHandCopyLastPlayed = cfg;
					state.players[hi].hand[state.players[hi].hand.indexOf(hc)] = morph; emit(state, { type: 'conjure', player: hi, card: morph, color: null }); } } }
		if (card.dormantLeft > 0) {
			// Dormant creatures sleep through everything until they wake
			emit(state, { type: 'dormant', player: pi, uid: card.uid, turns: card.dormantLeft }); if (card.dormantBattlecry) runBattlecry(state, pi, card, target, choice); /* The Darkness fires its Battlecry while dormant */
		} else {
			summonColossalParts(state, pi, card); // appendages enter before the battlecry
			fireOngoing(state, pi, 'summoned', { minion: card });
			growBlubberBaron(state, pi, card);
			runBattlecry(state, pi, card, target, choice);
			if ((card.keywords || []).includes('battlecry') && card.effects) { if (!p.firstBattlecryThisTurn) p.firstBattlecryThisTurn = { effects: JSON.parse(JSON.stringify(card.effects)), target }; fireOngoing(state, pi, 'battlecry-minion-played', { minion: card }); p.lastBattlecryThisGame = { effects: JSON.parse(JSON.stringify(card.effects)), target }; } // Bolner Hammerbeak / Brilliant Macaw
			// Murmur: the cheap Battlecry minion dies immediately after being played
			if ((card.keywords || []).includes('battlecry') && p.board.includes(card) && !isDead(card)
				&& p.board.some(m => m.murmurAura && !isDead(m) && m !== card)) {
				card.damage = card.maxHealth; card.shield = false;
				emit(state, { type: 'destroy', uid: card.uid });
				sweepDeaths(state);
			}
				if (p.board.includes(card)) fireSecretsAll(state, pi, 'enemy-minion-played', { minion: card });
			// opponents' ongoing reactions to you playing a creature (Holomancer / Harbinger Celestia)
			if (p.board.includes(card) && !isDead(card)) for (const o of opponentsOf(state, pi)) fireOngoing(state, o, 'enemy-creature-played', { minion: card });
			if (p.board.includes(card) && !isDead(card)) fireOngoing(state, pi, 'creature-played', { minion: card });
				if ((card.tribe || '').includes('Draenei')) p.lastDraeneiId = card.id; // Astral Vigilant
				if (draeneiImmediateAttack && p.board.includes(card) && !isDead(card)) { // Expedition Sergeant: the buffed Draenei attacks a random enemy at once
					card.sick = false;
					const foes = []; for (const o of opponentsOf(state, pi)) { for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location' && !c.stealthed && c.dormantLeft <= 0) foes.push({ type: 'creature', uid: c.uid, player: o }); foes.push({ type: 'hero', player: o }); }
					if (foes.length && !isDead(card)) resolveCombat(state, pi, card.uid, foes[Math.floor(state.rng() * foes.length)]);
				}
					if (draeneiRefreshMana && p.mana) { p.mana.cur = Math.min(p.mana.max, (p.mana.cur || 0) + (card.attack || 0)); emit(state, { type: 'manaGained', player: pi, amount: card.attack || 0, mana: availableMana(p) }); } // Ingenious Artificer
					if (draeneiHeroAttack && (card.attack || 0) > 0) { p.heroTempAttack += card.attack; emit(state, { type: 'heroAttack', player: pi, attack: heroAttackValue(p) }); } // Unyielding Vindicator
					if (draeneiSummonCopy && state.cardsById[card.id]) summon(state, pi, state.cardsById[card.id]); // Askara
				if ((card.keywords || []).includes('battlecry') || card.combo) fireOngoing(state, pi, 'battlecry-or-combo-played', { played: card }); // Field Contact
				if (card._outcast || card._handEdge) fireOngoing(state, pi, 'edge-card-played', { played: card }); // Razorglaive Sentinel / Altruis
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
			// Scattered Caltrops (Duels): the opponent's first creature each turn takes 1
			for (const o of opponentsOf(state, pi)) { const op = state.players[o]; if (op.scatteredCaltrops && op._caltropsTurn !== state.turnNumber && p.board.includes(card) && !isDead(card)) { op._caltropsTurn = state.turnNumber; damageCreature(state, card, 1, null); } }
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
		p.questsPlayedGame = (p.questsPlayedGame || 0) + 1; // Questing Assistant
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
		if (state.anomaly === 'dragon_soul' && p.spellsPlayedThisTurn === 3) summon(state, pi, { id: 'token_soul_dragon', name: 'Dragon', type: 'creature', cost: 0, rarity: 'common', token: true, attack: 5, health: 5, tribe: 'Dragon', description: 'A 5/5 Dragon.' }); // Anomaly - Dragon Soul
		if (p.crookAndFlail) execEffects(state, pi, [{ type: 'summon-random-from-deck' }], null, null); // Crook and Flail: a spell pulls a creature from your deck
		if (p.vistahAt != null && state.cardsById[card.id] && !card.token) (p.vistahSpells = p.vistahSpells || []).push(card.id); // Mistah Vistah logs the window
		if (card._hataaruTurn === state.turnNumber) { card._hataaruTurn = null; execEffects(state, pi, [{ type: 'discover', cardType: 'spell', costMod: -1, hataaru: true }], null, null); } // Exarch Hataaru repeats
		if (card._tokiGroup != null) { // Timelooper Toki: play all 3 for another Toki
			(p.tokiCounts = p.tokiCounts || {})[card._tokiGroup] = (p.tokiCounts[card._tokiGroup] || 0) + 1;
			if (p.tokiCounts[card._tokiGroup] === 3 && state.cardsById['timelooper_toki'] && p.hand.length < MAX_HAND) {
				const tk = instantiate(state.cardsById['timelooper_toki'], pi); tk.zone = 'hand'; p.hand.push(tk);
				emit(state, { type: 'conjure', player: pi, card: tk, color: null });
			}
		}
		p.lastCardCost = card.cost; // Rolling Stone
		if ((card.keywords || []).includes('combo')) p.combosPlayedGame = (p.combosPlayedGame || 0) + 1; // Rhyme Spinner
		{ const sc = schoolOf(card); for (const hc of p.hand) { hc.spellsCastWhileHeld = (hc.spellsCastWhileHeld || 0) + 1; if (sc) (hc.schoolsWhileHeld = hc.schoolsWhileHeld || {})[sc] = true; (hc.spellsHeldIds = hc.spellsHeldIds || []).push(card.id); } } // Naga: Spellcoiler / Heralds / Commander Sivara
		{ const sch = schoolOf(card); if (sch) { (p.schoolsCastThisTurn = p.schoolsCastThisTurn || {})[sch] = true; (p.schoolsCastGame = p.schoolsCastGame || {})[sch] = true; if (sch === 'Fel') (p.felSpellsGame = p.felSpellsGame || []).push(card.id); if (sch === 'Frost') p.frostSpellsGame = (p.frostSpellsGame || 0) + 1; } } // Metamorfin / Multicaster / Jace / Bearon
		{ const sc2 = schoolOf(card); if (sc2) for (const hc of [...p.hand]) { const ht2 = hc.handTransformOnSchool; if (ht2 && ht2.schools.includes(sc2) && ht2.forms && ht2.forms.length) { const fdef = state.cardsById[ht2.forms[Math.floor(state.rng() * ht2.forms.length)]]; if (fdef) { const morph = instantiate(fdef, pi); morph.uid = hc.uid; morph.zone = 'hand'; p.hand[p.hand.indexOf(hc)] = morph; emit(state, { type: 'conjure', player: pi, card: morph, color: null }); } } } } // Lady Naz'jar: transform in hand after a Fire/Frost/Arcane spell
		{ for (const hc of [...p.hand]) { const ht4 = hc.handTransformOnTwoSchools; if (ht4 && ht4.forms && ht4.forms.length && Object.keys(hc.schoolsWhileHeld || {}).length >= 2) { const fdef = state.cardsById[ht4.forms[Math.floor(state.rng() * ht4.forms.length)]]; if (fdef) { const morph = instantiate(fdef, pi); morph.uid = hc.uid; morph.zone = 'hand'; p.hand[p.hand.indexOf(hc)] = morph; emit(state, { type: 'conjure', player: pi, card: morph, color: null }); } } } } // Carress: transform in hand after two different spell schools
		if ((card.cost || 0) >= 6) p.lastBigSpell = { id: card.id, target }; // Grey Sage Parrot
		p.lastSpellPlayed = { id: card.id, target }; // Asvedon: opponent's most recent spell (any cost)
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
	p.lastCardCost = card.cost; // Rolling Stone: cost of the most recently played card
	if (!card.token) p.lastCardPlayedId = card.id; // Fate Splitter: opponent's most recent card
	if (card.type === 'creature' && card.tribe) { p.tribesPlayedGame = p.tribesPlayedGame || {}; for (const tr of (card.tribe || '').split('/')) if (tr) p.tribesPlayedGame[tr] = true; } // Power Slider (plain object, NOT a Set — must survive snapshot JSON)
	if (card.type === 'creature' && (card.tribe || '').includes('Elemental')) p.elementalsPlayedThisTurn = (p.elementalsPlayedThisTurn || 0) + 1; // Unchained Gladiator
	if (card.type === 'creature' && (card.tribe || '').includes('Dragon')) p.dragonsPlayedGame = (p.dragonsPlayedGame || 0) + 1; // Timewinder Zarimi
	if (card.type === 'creature' && !card.token) (p.playedMinionLog = p.playedMinionLog || []).push(card.id); // Joymancer Jepetto
	if ((card.cost || 0) === 1) p.oneCostPlayedGame = (p.oneCostPlayedGame || 0) + 1; // Thirsty Drifter
	if (!card.token) (p.lastCardOfCost = p.lastCardOfCost || {})[card.cost || 0] = { id: card.id }; // Pet Parrot
	if ((card.keywords || []).includes('combo')) p.combosPlayedGame = (p.combosPlayedGame || 0) + 1; // Rhyme Spinner
	(p.playedCountById = p.playedCountById || {})[card.id] = (p.playedCountById[card.id] || 0) + 1; // Freebird
	if (p.vigorShuffle && card.type === 'creature' && state.cardsById[card.id] && !card.token) { // Elixir of Vigor: two (1)-cost copies join the deck
		for (let vk = 0; vk < 2; vk++) p.deck.push(card.id);
		(p.deckCostPersist = p.deckCostPersist || {})[card.id] = 1;
		for (let vi = p.deck.length - 1; vi > 0; vi--) { const vj = Math.floor(state.rng() * (vi + 1)); [p.deck[vi], p.deck[vj]] = [p.deck[vj], p.deck[vi]]; }
	}
	if (card.hauntSummon && state.cardsById[card.hauntSummon]) summon(state, pi, state.cardsById[card.hauntSummon]); // Haunting Nightmare: playing a haunted card summons a Soldier
	if (p.nextClassFree && card.type === 'creature' && (card.cardClass || '').split('__').includes(p.nextClassFree) && !p._classFreeGrantedThisPlay) p.nextClassFree = null; // Blood Crusader: one-shot free minion consumed (not by the granting card)
	p._classFreeGrantedThisPlay = false;
	if (p.freeMinionsCount > 0 && card.type === 'creature' && !p._freeMinionGrantedThisPlay) p.freeMinionsCount--; // Anub'Rekhan: consume a free-minion charge
	p._freeMinionGrantedThisPlay = false;
	if ((card.keywords || []).includes('outcast') && p.nextOutcastDiscount && !p._outcastDiscountGrantedThisPlay) p.nextOutcastDiscount = 0; // Fierce Outsider: one-shot discount consumed (not by the card that granted it)
	p._outcastDiscountGrantedThisPlay = false;
	// Sherazin, Corpse Flower: play 4 cards in a turn to revive the seed
	if (p.cardsPlayedThisTurn >= 4) {
		for (const seed of p.board.filter(c => c.id === 'sherazin_seed' && !isDead(c))) {
			const rev = instantiate(state.cardsById['sherazin'], pi);
			rev.zone = 'board'; p.board[p.board.indexOf(seed)] = rev; seed.zone = 'gone';
			emit(state, { type: 'transformed', uid: seed.uid, player: pi, from: 'Sherazin, Seed', card: rev });
		}
	}
	// Tombs of Terror passives that react to playing a card
	if (p.mummyMagic && card.type === 'creature' && (card.keywords || []).includes('deathrattle') && p._mummyTurn !== state.turnNumber && !isDead(card) && card.zone === 'board') {
		p._mummyTurn = state.turnNumber;
		if (!card.keywords.includes('reborn')) { card.keywords.push('reborn'); emit(state, { type: 'buff', uid: card.uid, attack: card.attack, hp: hp(card) }); }
	}
	if (p.disksOfLegend && card.type === 'creature' && card.rarity === 'legendary' && state.cardsById[card.id]) summon(state, pi, state.cardsById[card.id]); // Disks of Legend
	if (p.darklightTorch && (card.cost || 0) % 2 === 0) { for (const hpw of p.heroPowers) hpw.usedThisTurn = false; p.heroPowerDiscountNext = (p.heroPowerDiscountNext || 0) + 10; } // Darklight Torch: even-Cost refreshes the power at (0)
	if (p.alchemistStone && (card.cost || 0) % 2 === 1) for (const c of p.hand) { if ((c.cost || 0) > 0) { c.cost = Math.max(0, c.cost - 1); emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost }); } } // Alchemist's Stone: odd-Cost discounts your hand
	// Duels passives that react to the first creature you play each turn
	if (p.rocketBackpacks && card.type === 'creature' && p._rocketTurn !== state.turnNumber && !isDead(card) && card.zone === 'board') {
		p._rocketTurn = state.turnNumber; // Rocket Backpacks: your first creature each turn gains Rush
		if (!card.keywords.includes('rush')) { card.keywords.push('rush'); emit(state, { type: 'buff', uid: card.uid, attack: card.attack, hp: hp(card) }); }
	}
	if (p.specialDelivery && card.type === 'creature' && (card.keywords || []).includes('rush') && p._specialTurn !== state.turnNumber && state.cardsById[card.id]) {
		p._specialTurn = state.turnNumber; // Special Delivery: your first Rush creature summons a 1-Health copy
		const copy = JSON.parse(JSON.stringify(state.cardsById[card.id])); copy.health = 1;
		summon(state, pi, copy);
	}
	if (p.shadowcasting && card.type === 'creature' && p._shadowTurn !== state.turnNumber && state.cardsById[card.id] && p.hand.length < MAX_HAND) {
		p._shadowTurn = state.turnNumber; // Shadowcasting 101: add a 1/1 copy of your first creature to hand (costs 1)
		const cd = JSON.parse(JSON.stringify(state.cardsById[card.id])); cd.attack = 1; cd.health = 1; cd.cost = 1; cd.token = true;
		const copy = instantiate(cd, pi); copy.zone = 'hand'; copy.cost = 1;
		p.hand.push(copy);
		emit(state, { type: 'conjure', player: pi, card: copy, color: null });
		fireEmerge(state, pi, copy);
	}
	if (p.rallyTheTroops && (card.keywords || []).includes('battlecry') && p._rallyTurn !== state.turnNumber) {
		p._rallyTurn = state.turnNumber; // Rally the Troops: draw after your first Battlecry card each turn
		drawCards(state, pi, 1);
	}
	if (p.lunarBand && card.type === 'creature' && (card.keywords || []).includes('deathrattle') && p._lunarTurn !== state.turnNumber && !isDead(card) && card.zone === 'board') {
		p._lunarTurn = state.turnNumber; // Lunar Band: your first Deathrattle creature triggers its effect (and lives)
		runDeathrattle(state, pi, card);
	}
	// Duels passives that react to playing a creature
	if (p.ringPhaseshifting && card.type === 'creature' && card.rarity === 'legendary') execEffects(state, pi, [{ type: 'conjure-random', cardType: 'creature', rarity: 'legendary', count: 1 }], null, null); // Ring of Phaseshifting: a Legendary adds a random Legendary to hand
	if (p.inspiringPresence && card.type === 'creature' && card.rarity === 'legendary') { const pool = p.hand.filter(c => (c.cost || 0) > 0); if (pool.length) { const hc = pool[Math.floor(state.rng() * pool.length)]; hc.cost = Math.max(0, hc.cost - 2); emit(state, { type: 'costChange', player: pi, uid: hc.uid, cost: hc.cost }); } } // Inspiring Presence: a Legendary cheapens a random hand card by (2)
	if (p.sandySurprise && card.type === 'creature' && (card.cost || 0) <= 3 && !isDead(card) && card.zone === 'board' && !card.keywords.includes('stealth')) { card.keywords.push('stealth'); card.stealthed = true; emit(state, { type: 'buff', uid: card.uid, attack: card.attack, hp: hp(card) }); } // Sandy Surprise: a (3)-or-less creature gains Stealth
	if (p.floorIsLava && card.type === 'creature' && p._floorTurn !== state.turnNumber && !isDead(card) && card.zone === 'board') { p._floorTurn = state.turnNumber; card.attack += 2; emit(state, { type: 'buff', uid: card.uid, attack: card.attack, hp: hp(card) }); damageCreature(state, card, 1, null); } // The Floor is Lava: first creature -> +2 Attack & 1 damage
	if (p.righteousReserves && card.type === 'creature' && (card.keywords || []).includes('divine_shield') && p._righteousTurn !== state.turnNumber) { p._righteousTurn = state.turnNumber; execEffects(state, pi, [{ type: 'buff-random-friendly', attack: 0, health: 0, grant: 'divine_shield' }], null, null); } // Righteous Reserves: first Divine Shield creature -> a random friendly gains Divine Shield
	if (p.holdTheLine && card.type === 'creature' && (card.keywords || []).includes('taunt') && !isDead(card) && card.zone === 'board') card.offTurnAttack = Math.max(card.offTurnAttack || 0, 3); // Hold the Line: Taunt creatures +3 Attack on the opponent's turn
	if (p.stakingClaim && p._stakingTurn !== state.turnNumber && (() => { const d = state.cardsById[card.id]; return d && (d.effects || []).some(e => e.type === 'discover'); })()) { p._stakingTurn = state.turnNumber; execEffects(state, pi, [{ type: 'buff', attack: 1, health: 0, target: 'friendly-creatures' }], null, null); } // Staking A Claim (Duels): first Discover card -> friendly creatures +1 Attack
	if (p.coilCasting && card.type === 'creature' && (card.tribe || '').includes('Naga') && p._coilTurn !== state.turnNumber) { p._coilTurn = state.turnNumber; execEffects(state, pi, [{ type: 'conjure-random', cardType: 'spell', cost: 1 }], null, null); } // Coil Casting: first Naga each turn -> a random 1-Cost spell
	if (p.beckoningBicorn && card.type === 'creature' && (card.tribe || '').includes('Pirate') && p._bicornTurn !== state.turnNumber) { p._bicornTurn = state.turnNumber; execEffects(state, pi, [{ type: 'shuffle-ids-into-deck', ids: ['patches_the_pirate'] }], null, null); } // Beckoning Bicorn: first Pirate each turn -> Patches into your deck
	if (p.cookiesLadle && card.type === 'creature' && (card.tribe || '').includes('Murloc') && p._cookieTurn !== state.turnNumber) { p._cookieTurn = state.turnNumber; execEffects(state, pi, [{ type: 'conjure-random', cardType: 'creature', tribe: 'Murloc', count: 1 }], null, null); } // Cookie's Ladle: first Murloc each turn -> a Murloc
	if (p.optimizedPolarity && card.type === 'creature' && (card.tribe || '').includes('Mech') && p._polarityTurn !== state.turnNumber) { p._polarityTurn = state.turnNumber; execEffects(state, pi, [{ type: 'conjure-random', cardType: 'creature', tribe: 'Mech', cost: 1, count: 1 }], null, null); } // Optimized Polarity: first Mech each turn -> a random (1) Mech
	if (p.draconicDream && card.type === 'creature' && (card.tribe || '').includes('Dragon')) execEffects(state, pi, [{ type: 'shuffle-ids-into-deck', ids: ['dream_portal'] }], null, null); // Draconic Dream: a Dragon shuffles a Dream Portal into your deck
	if (p.dragonboneRitual && card.type === 'creature' && (card.tribe || '').includes('Dragon') && !isDead(card) && card.zone === 'board') { card.deathrattle = [...(card.deathrattle || []), { type: 'dragonbone-revive' }]; if (!card.keywords.includes('deathrattle')) card.keywords.push('deathrattle'); emit(state, { type: 'buff', uid: card.uid, attack: card.attack, hp: hp(card) }); } // Dragonbone Ritual: a Dragon gains a dormant-revive Deathrattle
	if (p.plaguebringer && isSpellType(card)) { p.overloadPending = (p.overloadPending || 0) + 1; emit(state, { type: 'overload', player: pi, amount: 1 }); } // Plaguebringer: your spells Overload (1)
	// Duels passives that react to casting a spell
	if (p.ringOfRefreshment && isSpellType(card)) { for (const hpw of p.heroPowers) hpw.usedThisTurn = false; } // Ring of Refreshment: a spell refreshes your Hero Power
	if (p.idolsOfElune && isSpellType(card)) { if (p._idolsTurn !== state.turnNumber) { p._idolsTurn = state.turnNumber; p._idolsSpells = []; } p._idolsSpells.push(card.id); } // Idols of Elune: remember spells cast this turn
	if (p.staffOfPain && isSpellType(card) && schoolOf(card) === 'Shadow') execEffects(state, pi, [{ type: 'damage', value: 2, target: 'all-heroes' }], null, null); // Staff of Pain: a Shadow spell hurts every hero
	if (p.mendingPools && isSpellType(card) && schoolOf(card) === 'Nature' && p._mendingTurn !== state.turnNumber) { p._mendingTurn = state.turnNumber; execEffects(state, pi, [{ type: 'heal', value: 2, target: 'friendly-characters' }], null, null); } // Mending Pools: your first Nature spell each turn heals your side
	if (p.ironRoots && isSpellType(card) && schoolOf(card) === 'Nature') execEffects(state, pi, [{ type: 'buff-random-friendly', attack: 1, health: 1, grant: 'taunt' }], null, null); // Iron Roots: a Nature spell buffs a random friendly +1/+1 & Taunt
	if (p.spreadingSaplings && isSpellType(card) && schoolOf(card) === 'Nature') execEffects(state, pi, [{ type: 'summon', count: 1, attack: 1, health: 1, name: 'Sapling' }], null, null); // Spreading Saplings: a Nature spell summons a 1/1 Sapling
	if (p.guardianLight && isSpellType(card) && schoolOf(card) === 'Holy' && (card.cost || 0) > 0) execEffects(state, pi, [{ type: 'summon', count: 1, attack: card.cost, health: card.cost, name: 'Ancient Guardian' }], null, null); // Guardian Light: a Holy spell summons a Cost/Cost Guardian
	if (p.invigoratingLight && isSpellType(card) && schoolOf(card) === 'Holy') execEffects(state, pi, [{ type: 'buff', attack: 0, health: 1, target: 'friendly-creatures' }], null, null); // Invigorating Light: a Holy spell gives your creatures +1 Health
	if (p.arcaneFlux && isSpellType(card) && schoolOf(card) === 'Arcane' && p._arcaneFluxTurn !== state.turnNumber) { p._arcaneFluxTurn = state.turnNumber; execEffects(state, pi, [{ type: 'discover', cardType: 'any', cardClasses: [p.heroClass] }], null, null); } // Arcane Flux: first Arcane spell -> Discover from your class
	if (p.divineIllumination && isSpellType(card) && schoolOf(card) === 'Holy' && p._divineIllumTurn !== state.turnNumber) { p._divineIllumTurn = state.turnNumber; execEffects(state, pi, [{ type: 'discover', cardType: 'any', cardClasses: [p.heroClass] }], null, null); } // Divine Illumination: first Holy spell -> Discover from your class
	if (p.flamesKirinTor && isSpellType(card) && schoolOf(card) === 'Fire' && p._flamesTurn !== state.turnNumber) { p._flamesTurn = state.turnNumber; execEffects(state, pi, [{ type: 'conjure-random', cardType: 'spell', school: 'Fire', cardClass: 'own', count: 1 }], null, null); } // Flames of the Kirin Tor: first Fire spell -> a Fire spell from your class
	if (p.corruptedFelstone && isSpellType(card) && schoolOf(card) === 'Fel') { const ends = [p.hand[0], p.hand[p.hand.length - 1]]; const seen = new Set(); for (const hc of ends) if (hc && hc.type === 'creature' && !seen.has(hc.uid)) { seen.add(hc.uid); hc.attack = (hc.attack || 0) + 2; hc.maxHealth = (hc.maxHealth || 0) + 1; emit(state, { type: 'buff', uid: hc.uid, attack: hc.attack, hp: hp(hc) }); } } // Corrupted Felstone: a Fel spell buffs the end creatures in hand +2/+1
	if (p.fireshaper && isSpellType(card)) execEffects(state, pi, [{ type: 'random-damage', pool: 'enemies', value: 1, count: 1 }], null, null); // Fireshaper: a spell deals 1 to a random enemy
	if (p.arcaniteCrystal && isSpellType(card) && schoolOf(card) === 'Arcane') { const hp2 = p.hand.filter(c => (c.cost || 0) > 0); if (hp2.length) { const hc = hp2[Math.floor(state.rng() * hp2.length)]; hc.cost = Math.max(0, hc.cost - 1); emit(state, { type: 'costChange', player: pi, uid: hc.uid, cost: hc.cost }); } } // Arcanite Crystal: an Arcane spell cheapens a random hand card by (1)
	if (p.witherWeak && isSpellType(card) && schoolOf(card) === 'Fel' && p._witherTurn !== state.turnNumber) { p._witherTurn = state.turnNumber; let low = null; for (const o of opponentsOf(state, pi)) for (const ec of state.players[o].board) if (!isDead(ec) && ec.type === 'creature' && (!low || hp(ec) < hp(low))) low = ec; if (low) damageCreature(state, low, 1, null); else execEffects(state, pi, [{ type: 'damage', value: 1, target: 'enemy-hero' }], null, null); } // Wither the Weak: first Fel spell hits the lowest-Health enemy
	if (p.unstableMagic && isSpellType(card) && schoolOf(card) === 'Arcane') { const pool = []; for (const o of opponentsOf(state, pi)) for (const ec of state.players[o].board) if (!isDead(ec) && ec.type === 'creature') pool.push(ec); if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)]; const tok = instantiate({ id: 'token_sheep', name: 'Sheep', type: 'creature', cost: 1, rarity: 'common', token: true, tribe: 'Beast', attack: 1, health: 1, description: 'A 1/1 Sheep.' }, t.controller); tok.zone = 'board'; tok.sick = t.sick; const board = state.players[t.controller].board; board[board.indexOf(t)] = tok; t.zone = 'gone'; emit(state, { type: 'transformed', uid: t.uid, player: t.controller, from: t.name, card: tok }); recomputeAuras(state); } } // Unstable Magic: an Arcane spell Sheeps a random enemy
	if (p.impTrousers && isSpellType(card) && schoolOf(card) === 'Fel' && p._impTrousersTurn !== state.turnNumber) { p._impTrousersTurn = state.turnNumber; execEffects(state, pi, [{ type: 'shuffle-ids-into-deck', ids: ['fel_rift', 'fel_rift'] }, { type: 'draw', value: 1 }], null, null); } // Imp-credible Trousers: first Fel spell -> 2 Fel Rifts + draw
	if ((p.brittleBones || p.eerieStone) && _duelsEnemyBefore && _duelsEnemyBefore.length) { const _alive = new Set(); for (const pl of state.players) for (const c of pl.board) if (!isDead(c)) _alive.add(c.uid); const _killed = _duelsEnemyBefore.filter(e => !_alive.has(e.uid)); if (_killed.length) { if (p.brittleBones) execEffects(state, pi, [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Volatile Skeleton' }], null, null); if (p.eerieStone && schoolOf(card) === 'Shadow' && p.hand.length < MAX_HAND) { const _k = _killed.filter(e => state.cardsById[e.id]); if (_k.length) execEffects(state, pi, [{ type: 'conjure-id', id: _k[Math.floor(state.rng() * _k.length)].id }], null, null); } } } // Brittle Bones / Eerie Stone: a spell that killed an enemy
	if (p.mantleIgnition && _mantleNeighbors.length && !state._mantleLock) { const _sp = state.cardsById[card.id]; if (_sp && _sp.effects) { state._mantleLock = true; try { for (const nb of _mantleNeighbors) { execEffects(state, pi, JSON.parse(JSON.stringify(_sp.effects)), { type: 'creature', uid: nb.uid, player: nb.player }, null); sweepDeaths(state); } } finally { state._mantleLock = false; } } } // Mantle of Ignition: re-cast the spell on the target's neighbors
	if (p.glacialDownpour && isSpellType(card) && schoolOf(card) === 'Frost') p._frostCastTurn = state.turnNumber; // track for Glacial Downpour (end of turn)
	if (p.flameWaves && isSpellType(card) && schoolOf(card) === 'Fire') { if (p._fireCastTurn !== state.turnNumber) { p._fireCastTurn = state.turnNumber; p._fireCastCount = 0; } p._fireCastCount++; } // track for Flame Waves (end of turn)
	if (p.firekeepersIdol && isSpellType(card) && schoolOf(card) === 'Fire') { // Firekeeper's Idol: a Fire spell summons a 1/2 Flame Elemental & hands you one
		execEffects(state, pi, [{ type: 'summon', count: 1, attack: 1, health: 2, name: 'Flame Elemental', tribe: 'Elemental' }], null, null);
		if (p.hand.length < MAX_HAND) {
			const fe = instantiate({ id: 'token_flame_elemental', name: 'Flame Elemental', type: 'creature', cost: 2, rarity: 'common', token: true, tribe: 'Elemental', attack: 1, health: 2, description: 'A 1/2 Flame Elemental.' }, pi);
			fe.zone = 'hand'; p.hand.push(fe); emit(state, { type: 'conjure', player: pi, card: fe, color: null }); fireEmerge(state, pi, fe);
		}
	}
	// Overpowered: replay a copy of each card played this turn (random targets)
	if (p.overpoweredTurn === state.turnNumber && !state._opLock && card.id !== 'dala_overpowered' && state.cardsById[card.id]) {
		state._opLock = true;
		try {
			const d = state.cardsById[card.id];
			if (d.type === 'creature') {
				const c2 = summon(state, pi, d);
				if (c2 && d.effects && (d.keywords || []).includes('battlecry')) execEffects(state, pi, JSON.parse(JSON.stringify(d.effects)), null, c2);
			} else if (isSpellType(d) && !d.choices && !d.xSpell && !d.counterSpell) {
				const spell = instantiate(d, pi);
				const spec = targetSpec(state, pi, spell, null);
				let tgt = null, fizzle = false;
				if (spec) { const legal = legalTargets(state, pi, spec); if (legal.length) tgt = legal[Math.floor(state.rng() * legal.length)]; else if (spec.required) fizzle = true; }
				if (!fizzle) { emit(state, { type: 'conjure', player: pi, card: spell, color: null }); runSpell(state, pi, spell, tgt, null); }
			}
		} finally { state._opLock = false; }
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
			if (state.players[pi].nextSpellDoubleCount > 0) { state.players[pi].nextSpellDoubleCount--; if (state.players[pi].nextSpellDoubleCount <= 0) state.players[pi].nextSpellDoubleCast = false; } // Tyrande: consume one of N charges
			else state.players[pi].nextSpellDoubleCast = false;
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
		if (card._outcast || card._handEdge) fireOngoing(state, pi, 'edge-card-played', { played: card }); // Razorglaive Sentinel / Altruis
		if (ctx.target && ctx.target.type === 'creature') fireOngoing(state, pi, 'spell-cast-on-creature', { played: card, targetCreature: findCreature(state, ctx.target.uid) }); // Sethekk Veilweaver / Stormwind Avenger
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
	// hand-lock restrictions apply at instant speed too — canPlay enforces them
	// at resolve time, so offering here without them made responseOptions lie
	// (fuzz finding: Thaddius-style parityBlock rejected an offered response)
	if (card.lockedUntilTurn && state.turnNumber < card.lockedUntilTurn) return false;
	{ const pb = p.parityBlock; if (pb && ((card.cost % 2 === 1 ? 'odd' : 'even') === pb)) return false; }
	if (card.addCost && !canPayAddCost(state, pi, card)) return false;
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
export function counterStackEntry(state, tgt, to) {
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
		if (state.players[pi].heroPowerUpgraded || state.players[pi].board.some(c => c.heroPowerTwice && !isDead(c))) execEffects(state, pi, entry.effects, entry.target, entry.card); // Justicar / Sing-Along Buddy: fires twice
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
	if (c.titan && (c._onceAbilities || []).length < (c.activated || []).length) return false; // Titan: can't attack until all 3 abilities are used
	if (c.cantAttackWhile != null && state.players.some(pl => pl.board.some(x => x.uid === c.cantAttackWhile && !isDead(x)))) return false; // Annoying Fan lock
	if (c.dormantLeft > 0) return false; // still asleep
	if (has(c, KW.PACIFIST) && c.attackAnywayTurn !== state.turnNumber) return false; // Argent Watchman: Inspire lets it attack this turn
	if (state.plane) {
		const pr = activePlaneRule(state); // Bloomburrow: Humans can't attack
		if (pr && pr.kind === 'cant-attack' && (c.tribe || '').includes(pr.tribe)) return false;
	}
	const maxAttacks = c.megaWindfury ? 4 : has(c, KW.WINDFURY) ? 2 : 1; // Air Support: Mega-Windfury
	if (c.attacksUsed >= maxAttacks) return false;
	if (c.sick && !has(c, KW.CHARGE) && !has(c, KW.RUSH)) return false;
	return true;
}

// legal attack targets, honoring taunt and stealth; rush = creatures only while
// sick. Free-for-all: any opponent is attackable; a player's taunts only
// protect their own slice.
// Ghostly Prison-style tax: what it costs pi to send a creature at defenderPi's hero
export function heroAttackTax(state, defenderPi) {
	const p = state.players[defenderPi];
	let tax = 0;
	for (const c of [...p.enchantments, ...p.artifacts, ...p.board]) {
		if (c.attackTax && !(c.zone === 'board' && isDead(c))) tax += c.attackTax.amount || 0;
	}
	return tax;
}



export function attack(state, pi, attackerUid, target) {
	const attacker = state.players[pi].board.find(c => c.uid === attackerUid);
	if (!attacker || !canAttackWith(state, pi, attacker)) return false;
	const legal = attackTargets(state, pi, attacker);
	if (!legal.some(t => t.type === target.type && t.uid === target.uid && t.player === target.player)) return false;

	if (target.type === 'hero' && (attacker.noFaceTurn === state.turnNumber || attacker.noFace)) return false; // P.M.M. Infinitizer / Air Support
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
	if (target.type === 'creature') { const def0 = findCreature(state, target.uid); if (def0) fireCreatureTrigger(state, def0, 'self-attacked', { attacker }); } // Saronite Tol'vir: react to being attacked
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
export function resolveCombat(state, pi, attackerUid, target) {
	const attacker = state.players[pi] && state.players[pi].board.find(c => c.uid === attackerUid);
	if (!attacker || isDead(attacker)) { sweepDeaths(state); return; }
	if (target.type === 'creature') { const d = findCreature(state, target.uid); if (!d || isDead(d)) { sweepDeaths(state); return; } }
	else if (target.type === 'walker') { if (!findWalker(state, target.uid)) { sweepDeaths(state); return; } }
	// Oxmorg: the active plane doubles all combat damage
	const cmult = (activePlaneRule(state)?.kind === 'double-damage') ? 2 : 1;
	// Stalwart Avenger: Immune while attacking — takes no retaliation this swing
	if (attacker.immuneWhileAttacking) attacker._attackingImmune = true;
	if (target.type === 'hero' && attacker.blightsInstead) {
		// The Living Plague: the strike shuffles Blights instead of dealing damage
		const tp2 = state.players[target.player];
		for (let n = 0; n < attacker.attack * cmult; n++) tp2.deck.push('blight');
		for (let i = tp2.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [tp2.deck[i], tp2.deck[j]] = [tp2.deck[j], tp2.deck[i]]; }
		emit(state, { type: 'blighted', player: target.player, count: attacker.attack * cmult });
	} else if (target.type === 'hero') {
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
			// Gnomelia: cleave — the strike also hits the minions beside the target
			if (src.cleave && src === attacker) {
				const db = state.players[dst.controller]?.board;
				if (db) { const di = db.indexOf(dst); for (const nb of [db[di - 1], db[di + 1]]) if (nb && !isDead(nb) && nb.type === 'creature') damageCreature(state, nb, src.attack * cmult, src); }
			}
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
		// Honorable Kill: an EXACT lethal blow (mark the victim so Korrak knows)
		if (isDead(defender) && defender.damage === defender.maxHealth) defender.honorablyKilled = true; // Korrak the Bloodrager
		if (attacker.honorableKill && isDead(defender) && defender.damage === defender.maxHealth
			&& !isDead(attacker)) {
			emit(state, { type: 'honorableKill', uid: attacker.uid, player: pi });
			runSecretEffects(state, pi, attacker.honorableKill, { self: attacker });
			// Wing Commander Mulverick: friendly minions with a granted Honorable Kill also fire
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
			for (const o of trigs) runSecretEffects(state, pi, o.effects, { self: attacker, victim: defender });
		}
		// Knuckles: "after this attacks a minion" (fires even if it dies? HS: it survives to hit)
		if (!isDead(attacker)) fireCreatureTrigger(state, attacker, 'self-attacks-creature', { victim: defender });
		// Wind-up Burglebot: "whenever this attacks a minion and survives"
		if (!isDead(attacker)) fireCreatureTrigger(state, attacker, 'self-attacks-survives', { targetType: target.type });
		// Alley Armorsmith: "whenever this deals damage" — either combatant that dealt any
		if (attacker.attack > 0) fireCreatureTrigger(state, attacker, 'self-deals-damage', { amount: attacker.attack, victim: defender });
		if (defBefore > 0 && !isDead(defender)) fireCreatureTrigger(state, defender, 'self-deals-damage', { amount: defBefore, victim: attacker });
		// Potion of Sparking (Duels): a friendly Rush creature attacking a creature zaps an adjacent enemy
		if (state.players[pi].potionSparking && (attacker.keywords || []).includes('rush') && target.type === 'creature') { const dp = state.players[defender.controller]; const di = dp.board.indexOf(defender); const nbrs = [dp.board[di - 1], dp.board[di + 1]].filter(x => x && !isDead(x) && x.type === 'creature'); if (nbrs.length) damageCreature(state, nbrs[Math.floor(state.rng() * nbrs.length)], 1, null); }
	}
	if (attacker && attacker._attackingImmune) attacker._attackingImmune = false; // Stalwart Avenger: immunity lapses once the swing resolves
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
	p.heroAttacksGame = (p.heroAttacksGame || 0) + 1; // Shockspitter
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
		if (w && has(w, KW.LIFESTEAL) && atk > 0) healHero(state, pi, atk); // Lifesteal weapons heal on face attacks too
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
			if (w && w.reaper && killed) (w._reaped = w._reaped || []).push(defender.id); // Soulreaper's Scythe remembers its kills
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
	if (hitCreature) fireOngoing(state, pi, 'hero-attacks-creature', { target: findCreature(state, target.uid), damaged: findCreature(state, target.uid) }); // Keeneye Spotter
	// a single fire (fireOngoing-only, so weapon ongoings don't double-fire) for
	// "hero attacks a minion and it survives" — Kodo Hide Whip
	if (hitCreature && !killed) { const surv = findCreature(state, target.uid); if (surv && !isDead(surv)) fireOngoing(state, pi, 'hero-attacks-survivor', { target: surv, damaged: surv }); }
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
export function applyRollEntry(state, t, entry) {
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
export function queueAdapt(state, pi, targets) {
	if (!targets.length) return;
	const options = [];
	let guard = 0;
	while (options.length < 3 && guard++ < 60) {
		const r = Math.floor(state.rng() * ADAPT_TABLE.length);
		if (!options.includes(r)) options.push(r);
	}
	while (options.length < 3) options.push((options[options.length - 1] + 1) % ADAPT_TABLE.length); // degenerate rng fallback: fill with distinct neighbors
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
	{ const dp = state.players[pend.player]; if (dp.edgeOfDredge && dp._dredgeTurn !== state.turnNumber) { dp._dredgeTurn = state.turnNumber; drawCards(state, pend.player, 1); } } // Edge of Dredge (Duels): first Dredge each turn -> draw
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
	// Faceless Enigma: the unpicked Secret casts for your opponent
	if (pend.enigmaFoe !== undefined) {
		installSecret(state, pend.player, chosen);
		const other = pend.ids.find(x => x !== chosen);
		if (other && pend.enigmaFoe != null) installSecret(state, pend.enigmaFoe, other);
		return true;
	}
	// Futuristic Forefather: a correct guess earns +4 Health
	if (pend.guessId != null) {
		if (chosen === pend.guessId && pend.guessUid != null) {
			const src = p.board.find(c => c.uid === pend.guessUid);
			if (src && !isDead(src)) { src.maxHealth += 4; emit(state, { type: 'buff', uid: src.uid, attack: src.attack, hp: hp(src) }); }
		}
		emit(state, { type: 'guessResult', player: pend.player, correct: chosen === pend.guessId });
		return true;
	}
	// Forest Lord Cenarius: each pick applies one of his two boons
	if (pend.cenarius) {
		if (chosen === 'cenarius_might') execEffects(state, pend.player, [{ type: 'buff', attack: 1, health: 3, target: 'all-others' }], null, null);
		else execEffects(state, pend.player, [{ type: 'summon', count: 1, attack: 5, health: 5, name: 'Ancient', grant: 'taunt' }], null, null);
		if (state.pickQueue.some(q => q.cenarius)) emit(state, { type: 'pickStart', player: pend.player, count: 2 });
		return true;
	}
	// Ancient Augur: remember the secretly chosen card
	if (pend.augurUid != null) {
		const src = p.board.find(c => c.uid === pend.augurUid);
		if (src) src._augurId = chosen;
		return true;
	}
	// Inspector Murloc Holmes: the investigation is on
	if (pend.holmes) {
		p.investigate = { name: (def && def.name) || chosen, until: state.turnNumber + state.players.length };
		emit(state, { type: 'investigating', player: pend.player });
		return true;
	}
	// Sightless Watcher: the pick moves to the top of YOUR deck
	if (pend.ownDeckTop) {
		const di = p.deck.indexOf(chosen);
		if (di >= 0) { p.deck.splice(di, 1); p.deck.push(chosen); }
		return true;
	}
	// hand-pick: act on one of your OWN hand cards
	if (pend.handPick) {
		const hpk = pend.handPick;
		const c = p.hand.find(x => x.id === chosen);
		const src = hpk.sourceUid != null ? p.board.find(x => x.uid === hpk.sourceUid) : null;
		if (c) switch (hpk.action) {
			case 'spell-damage': // Battlefield Blaster
				c.bonusSpellDamage = (c.bonusSpellDamage || 0) + (hpk.value || 1);
				break;
			case 'split': { // Conjuration Specialist: two random spells of the same Cost
				p.hand = p.hand.filter(x => x !== c);
				const pool = Object.values(state.cardsById).filter(d2 => isSpellType(d2) && (d2.cost || 0) === (c.cost || 0) && !d2.token && d2.collectible !== false && !(d2.colors && d2.colors.length));
				for (let i = 0; i < 2 && pool.length && p.hand.length < MAX_HAND; i++) {
					const nd = pool[Math.floor(state.rng() * pool.length)];
					const nc = instantiate(nd, pend.player); nc.zone = 'hand'; p.hand.push(nc);
					emit(state, { type: 'conjure', player: pend.player, card: nc, color: null });
				}
				break;
			}
			case 'absorb': // Crackling Cloudstrider swallows the spell
				p.hand = p.hand.filter(x => x !== c);
				if (src) src._absorbedId = c.id;
				break;
			case 'coin': { // Agent of the Old Ones
				const i = p.hand.indexOf(c);
				if (state.cardsById['coin']) { const nc = instantiate(state.cardsById['coin'], pend.player); nc.zone = 'hand'; p.hand[i] = nc; emit(state, { type: 'conjure', player: pend.player, card: nc, color: null }); }
				break;
			}
			case 'shuffle-draw': // Sheltered Survivor
				p.hand = p.hand.filter(x => x !== c);
				p.deck.push(c.id);
				for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
				drawCards(state, pend.player, 1);
				break;
			case 'transform-spell-plus5': { // Bootleg Alchemist
				const pool = Object.values(state.cardsById).filter(d2 => isSpellType(d2) && (d2.cost || 0) === (c.cost || 0) + 5 && !d2.token && d2.collectible !== false && !(d2.colors && d2.colors.length));
				if (pool.length) {
					const i = p.hand.indexOf(c);
					const nc = instantiate(pool[Math.floor(state.rng() * pool.length)], pend.player);
					nc.zone = 'hand'; p.hand[i] = nc;
					emit(state, { type: 'conjure', player: pend.player, card: nc, color: null });
				}
				break;
			}
			case 'phoenix-brand': // Destructive Phoenix: in 3 turns discard it, summon a Phoenix
				c._doomAtTurn = state.turnNumber + 2 * state.players.length;
				c._doomSummonId = 'destructive_phoenix';
				break;
			case 'attack-gift': // Vicious Bloodworm / Gruesome Nightmare: Attack equal to the source's
				c.attack = (c.attack || 0) + (hpk.value || 3);
				break;
			case 'discard': { // Ocular Occultist
				p.hand = p.hand.filter(x => x !== c);
				toGraveyard(state, pend.player, c);
				emit(state, { type: 'discard', player: pend.player, card: c });
				break;
			}
			case 'discard-remember': { // Gemstone Hoarder: the Deathrattle brings it back cheaper
				p.hand = p.hand.filter(x => x !== c);
				toGraveyard(state, pend.player, c);
				emit(state, { type: 'discard', player: pend.player, card: c });
				if (src) src._gemId = c.id;
				break;
			}
			case 'ticks-down': // Tol'vir Carver
				c._ticksDown = true;
				break;
			case 'copy': { // Malevolent Mutant: a copy of the chosen spell
				const def2 = state.cardsById[c.id];
				if (def2 && p.hand.length < MAX_HAND) {
					const nc = instantiate(def2, pend.player); nc.zone = 'hand'; p.hand.push(nc);
					emit(state, { type: 'conjure', player: pend.player, card: nc, color: null });
				}
				break;
			}
		}
		return true;
	}
	// Eyes in the Sky: the pick moves to the top of the ENEMY deck
	if (pend.enemyDeckTop != null) {
		const op = state.players[pend.enemyDeckTop];
		const di = op.deck.indexOf(chosen);
		if (di >= 0) { op.deck.splice(di, 1); op.deck.push(chosen); }
		emit(state, { type: 'enemyDeckTopSet', player: pend.player, name: def ? def.name : chosen });
		return true;
	}
	// Ritual of Life / Cactus Construct: ALSO summon an X/Y copy of the pick
	// (the pick itself continues to the hand via the default path below)
	if (pend.summonCopy && def && def.type === 'creature') {
		for (let n = 0; n < (pend.summonCopy.count || 1); n++) {
			const cd = JSON.parse(JSON.stringify(def));
			if (pend.summonCopy.attack != null) cd.attack = pend.summonCopy.attack;
			if (pend.summonCopy.health != null) cd.health = pend.summonCopy.health;
			summon(state, pend.player, cd);
		}
		if (pend.summonCopy.noHand) return true; // Dreamgrove Ring: only the copies materialize
	}
	// Kaldorei Cultivator: the pick goes to the BOTTOM of your deck carrying a buff
	if (pend.toDeckBottomBuff) {
		if (def) {
			p.deck.unshift(chosen);
			(p.deckIdBuffs = p.deckIdBuffs || []).push({ id: chosen, attack: pend.toDeckBottomBuff.attack || 0, health: pend.toDeckBottomBuff.health || 0 });
		}
		return true;
	}
	// Beast Speaker Taka: gain the picked Beast's stats now, remember it for the Deathrattle
	if (pend.gainStatsUid != null) {
		const src = p.board.find(c => c.uid === pend.gainStatsUid);
		if (src && def) {
			src.attack += def.attack || 0; src.maxHealth += def.health || 0;
			src._takaId = chosen;
			emit(state, { type: 'buff', uid: src.uid, attack: src.attack, hp: hp(src) });
		}
		return true;
	}
	// Merchant of Legend: the offered-but-unpicked cards go into your deck
	if (pend.shuffleOthers) {
		for (const oid of pend.ids) if (oid !== chosen && state.cardsById[oid]) p.deck.push(oid);
		for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
	}
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
		if (pend.summonTwice) summon(state, pend.player, def); // Zarog's Crown
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
		if (pend.hataaru) card._hataaruTurn = state.turnNumber; // Exarch Hataaru: playing it this turn repeats the Discover
		if (pend.grantCastTwice) card.castTwice = true; // Breakout Architect
		if (pend.damageAllByCost) { // Murozond, Thief of Time: the pick nukes all other minions
			const dmg = card.cost || 0;
			if (dmg > 0) {
				for (const pl of state.players) for (const bc of [...pl.board]) if (!isDead(bc) && bc.type === 'creature') damageCreature(state, bc, dmg, null);
				sweepDeaths(state);
			}
		}
		if (pend.qonzu) state.askQueue.push({ player: pend.player, question: 'Put it on top of the enemy deck instead?', then: [{ type: 'qonzu-give', uid: card.uid }], else: [] }); // Qonzu
		if (pend.healByCost) healHero(state, pend.player, card.cost || 0); // Ivory Knight: restore Health = its Cost
		if (pend.armorByCost) gainArmor(state, pend.player, card.cost || 0); // Ivory Rook: gain Armor = its Cost
		if (pend.damageSelfByCost) damageHero(state, pend.player, card.cost || 0, pend.player); // Chittering Tunneler
			if (pend.gainDeathrattleUid != null && def.deathrattle) { // Myra Rotspring: also gain its Deathrattle
				const src = findCreature(state, pend.gainDeathrattleUid);
				if (src && !isDead(src)) { src.deathrattle = [...(src.deathrattle || []), ...JSON.parse(JSON.stringify(def.deathrattle))]; if (!src.keywords.includes('deathrattle')) src.keywords.push('deathrattle'); }
			}
		let appliedGift = null;
		if (pend.darkGift) appliedGift = applyGift(state, card); // Emerald Dream: the discovered card carries a Dark Gift
		p.hand.push(card);
		emit(state, { type: 'conjure', player: pend.player, card, color: null });
		if (p.luckySpade && def) for (let _n = 0; _n < 2 && p.hand.length < MAX_HAND; _n++) { const lc = instantiate(def, pend.player); lc.zone = 'hand'; lc.cost = Math.max(0, (lc.cost || 0) - 2); p.hand.push(lc); emit(state, { type: 'conjure', player: pend.player, card: lc, color: null }); } // Lucky Spade
		if (p.openDoorways && def && p._doorwaysTurn !== state.turnNumber && p.hand.length < MAX_HAND) { p._doorwaysTurn = state.turnNumber; const dc = instantiate(def, pend.player); dc.zone = 'hand'; p.hand.push(dc); emit(state, { type: 'conjure', player: pend.player, card: dc, color: null }); } // Open the Doorways (Duels): first Discover each turn -> a copy
		if (p.orbRevelation && p._orbTurn !== state.turnNumber) { p._orbTurn = state.turnNumber; for (const oc of p.hand) if (isSpellType(oc) && (oc.cost || 0) > 0) { oc.cost = Math.max(0, oc.cost - 1); emit(state, { type: 'costChange', player: pend.player, uid: oc.uid, cost: oc.cost }); } } // Orb of Revelation (Duels): first Discover each turn -> spells (1) cheaper
		if (pend.duplicate && p.hand.length < MAX_HAND) { // Shadowflame Stalker: "Get a copy of it" (same gift)
			const copy = instantiate(def, pend.player); copy.zone = 'hand';
			if (pend.costMod) copy.cost = Math.max(0, (copy.cost || 0) + pend.costMod);
			if (appliedGift) applyGift(state, copy, appliedGift);
			p.hand.push(copy);
			emit(state, { type: 'conjure', player: pend.player, card: copy, color: null });
		}
		fireEmerge(state, pend.player, card);
		if (!pend.noDiscoverTrigger) fireOngoing(state, pend.player, 'card-discovered', { card }); // Rangari Scout
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
		// Godfrey the Betrayer: end-of-turn overflow discards are set aside instead,
		// cost (1) less, and return to hand when there's room
		if (pend.cleanup && p.godfreyReturn) {
			c.cost = Math.max(0, (c.cost || 0) - 1);
			(p.godfreyHeld = p.godfreyHeld || []).push(c);
			emit(state, { type: 'discard', player: pend.player, card: c });
			continue;
		}
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
export function disguiseCreature(state, c) {
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
	// Combo hero powers (Reno's Amateur Mage): the boosted line when a card
	// was already played this turn
	let effects = (card.power?.combo && comboActive(state, pi)) ? card.power.combo : powerEffectsOf(card, choice);
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


export function canUseHeroPower(state, pi, card, choice) {
	if (state.over || !(state.current === pi && state.priority == null && state.stack.length === 0)) return false;
	const p = state.players[pi];
	if (!p.heroPowers.includes(card) || (card.usedThisTurn && !(p.stargazing && (card._uses || 0) < 2))) return false; // Stargazing: twice a turn
	if (card.power && card.power.corpseCost != null) { if ((p.corpses || 0) < card.power.corpseCost) return false; } // Thalena's Blood Tap
	else if (availableMana(p) < heroPowerCost(state, pi, card)) return false;
	const spec = heroPowerSpec(state, pi, card, choice);
	if (spec && spec.required && legalTargets(state, pi, spec).length === 0) return false;
	return true;
}

export function useHeroPower(state, pi, cardUid, target, choice) {
	const p = state.players[pi];
	const card = p.heroPowers.find(c => c.uid === cardUid);
	if (!card || !canUseHeroPower(state, pi, card, choice)) return false;
	const cost = card.power && card.power.corpseCost != null ? 0 : heroPowerCost(state, pi, card);
	const ward = wardOf(state, pi, target);
	if (ward?.mana && availableMana(p) < cost + ward.mana) return false;
	if (ward) payWard(state, pi, target);
	if (card.power && card.power.corpseCost != null) { spendCorpses(state, pi, card.power.corpseCost); emit(state, { type: 'corpses', player: pi, corpses: p.corpses }); } // Blood Tap pays in Corpses
	spendMana(p, cost);
	p.heroPowerDiscountNext = 0; // Fencing Coach's discount is one-shot
	p.heroPowersUsedGame = (p.heroPowersUsedGame || 0) + 1; // Frost Giant
	for (const c of p.board) if (c.wakeOnHeroPower && c.dormantLeft > 0) { c.dormantLeft = 0; emit(state, { type: 'dormant', player: pi, uid: c.uid, turns: 0 }); } // Slumbering Sprite
	card.usedThisTurn = true;
	card._uses = (card._uses || 0) + 1;
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
	p.nextChooseOneDiscount = 0; // Pride Seeker only lasts until used
	for (const c of p.hand) c.drawnThisTurn = false; // Keli'dan: "drawn this turn" resets at end of your turn
	if (p.illuciaSwap) { p.hand = p.savedHand || []; p.savedHand = null; p.illuciaSwap = false; emit(state, { type: 'handSwap', player: pi }); } // Mindrender Illucia: hand reverts at end of turn
	p.heroPowerTaxNext = 0; // Saboteur's Hero Power tax only lasts this turn
	p.nextMurlocFree = false; p.nextSecretCost = null; // Seadevil Stinger / Kabal Lackey are "this turn"
	p.nextBattlecryDouble = false; // Murmuring Elemental only lasts this turn
	p.nextSpellDamageBonus = 0; p.nextSpellDoubleCast = false; p.nextSpellDoubleCount = 0; p.spellsLifestealThisTurn = false; // Boomsday next-spell riders are "this turn"
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
	if (state.anomaly === 'growing') for (const c of p.board) { if (!isDead(c) && c.type !== 'location') { c.attack += 1; c.maxHealth += 1; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); } } // Anomaly - Growing
	if (state.anomaly === 'reductive') for (const c of p.hand) { if ((c.cost || 0) > 0) { c.cost = Math.max(0, c.cost - 1); emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost }); } } // Anomaly - Reductive
	if (p.everChangingElixir && p.board.some(c => !isDead(c) && c.type !== 'location')) execEffects(state, pi, [{ type: 'transform', random: true, randomCost: true, costDelta: 1 }], null, null); // Ever-Changing Elixir
	if (p.duelsEverChanging && p.board.some(c => !isDead(c) && c.type !== 'location')) execEffects(state, pi, [{ type: 'transform', random: true, randomCost: true, costDelta: 2 }], null, null); // Ever-Changing Elixir (Duels): transform into one costing (2) more
	if (p.glacialDownpour && p._frostCastTurn === state.turnNumber) execEffects(state, pi, [{ type: 'summon', count: 1, attack: 2, health: 3, name: 'Water Elemental', tribe: 'Elemental' }], null, null); // Glacial Downpour: cast Frost this turn -> a 2/3 Water Elemental
	if (p.flameWaves && p._fireCastTurn === state.turnNumber && p._fireCastCount > 0) execEffects(state, pi, [{ type: 'damage', value: 2 * p._fireCastCount, target: 'enemy-creatures' }], null, null); // Flame Waves: 2 to all enemy creatures per Fire spell cast this turn
	if (p.coldFeetPact) { const cg = Math.floor((p.corpses || 0) / 2); if (cg > 0) execEffects(state, pi, [{ type: 'summon', count: 1, attack: cg, health: cg, name: 'Risen Groom' }], null, null); } // Cold Feet Pact (Duels): a Risen Groom with stats = half your Corpses
	if (p.cloakEmeraldDreams) { const dpool = ['dream', 'nightmare', 'laughing_sister', 'emerald_drake', 'ysera_awakens']; execEffects(state, pi, [{ type: 'conjure-id', id: dpool[Math.floor(state.rng() * dpool.length)] }], null, null); } // Cloak of Emerald Dreams: end of turn -> a Dream card
	if (p.runicHelm) { const lk = ['lk_death_coil', 'lk_frost_strike', 'lk_army_of_the_dead', 'lk_doom_pact', 'lk_soul_reaper', 'obliterate', 'anti_magic_shell']; execEffects(state, pi, [{ type: 'conjure-id', id: lk[Math.floor(state.rng() * lk.length)] }], null, null); } // Runic Helm: end of turn -> a Lich King card
	if (p.idolsOfElune && p._idolsTurn === state.turnNumber && p._idolsSpells && p._idolsSpells.length) execEffects(state, pi, [{ type: 'cast-random-spell', ids: p._idolsSpells, count: 1 }], null, null); // Idols of Elune: recast a spell you cast this turn
	for (const em of p.emblems) if (em.id === 'tomb_scroll_of_nonsense' && em.static && em.static.value > 0) { em.static.value--; } // Scroll of Nonsense decays each turn
	fireOngoing(state, pi, 'turn-end');
	if (p.board.some(c => c.endTurnDouble && !isDead(c))) fireOngoing(state, pi, 'turn-end'); // Chrono-Lord Deios
	// Poison: each Poisoned creature you control takes 2 damage at the end of
	// your turn (the condition persists until the creature is cleansed or dies).
	for (const c of [...p.board]) {
		if (c.poisoned && !isDead(c)) { emit(state, { type: 'poisonTick', uid: c.uid }); damageCreature(state, c, 2, null); }
	}
	// Gruul-style triggers tick at the end of EVERY player's turn
	for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'every-turn-end', {});
	// Stalwart Avenger: at the end of EACH turn, swap its Attack and current Health
	for (let s2 = 0; s2 < state.players.length; s2++) for (const c of state.players[s2].board) {
		if (!c.swapStatsEndOfTurn || isDead(c) || c.type !== 'creature') continue;
		const curHp = hp(c), curAtk = c.attack || 0;
		c.attack = curHp; c.maxHealth = curAtk; c.damage = 0;
		emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
	}
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
	// Temporary cards vanish from hand at the end of your turn (Hologram Operator / Frantic Forger / Tunnel Terror)
	const temps = p.hand.filter(c => c.temporary);
	if (temps.length) { p.hand = p.hand.filter(c => !c.temporary); for (const c of temps) emit(state, { type: 'discard', player: state.current, card: c }); }
	if (p.togwaggleDice) for (const c of p.hand) { c.cost = Math.floor(state.rng() * 11); emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost }); } // Togwaggle's Dice
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
		state.discardQueue.push({ player: pi, count: p.hand.length - MAX_HAND, cleanup: true });
	}
	// Doommaiden: the stolen card goes back to the enemy deck if unplayed
	{
		const back = p.hand.filter(c => c._returnToDeckOf != null);
		if (back.length) {
			p.hand = p.hand.filter(c => !back.includes(c));
			for (const c of back) { state.players[c._returnToDeckOf].deck.push(c.id); emit(state, { type: 'discard', player: pi, card: c }); }
		}
	}
	// Emberscarred Whelp: the borrowed Mana Crystal expires
	if (p.tempCrystalThis) { p.mana.max = Math.max(0, p.mana.max - p.tempCrystalThis); p.tempCrystalThis = 0; }
	p._minionLastTurn = (p.creaturesPlayedThisTurn || 0) > 0; // Wizened Wildspeaker
	// Ursol's Aura: the absorbed spell casts at each of your turn ends (3 turns)
	if (p.ursolAura && p.ursolAura.left > 0) {
		const def = state.cardsById[p.ursolAura.id];
		if (def && def.effects) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), null, null);
		p.ursolAura.left--;
		if (p.ursolAura.left <= 0) p.ursolAura = null;
	}
	// Sharp-Eyed Lookout: this-turn draw discounts lapse
	for (const hc of p.hand) if (hc._costRestoreEnd) { hc.cost = (hc.cost || 0) + hc._costRestoreEnd; hc._costRestoreEnd = null; }
	// Everburning Phoenix: end-of-turn conjures come due
	if (p.endTurnConjure && p.endTurnConjure.length) {
		for (const id of p.endTurnConjure) {
			if (state.cardsById[id] && p.hand.length < MAX_HAND + 5) { const cd = instantiate(state.cardsById[id], pi); cd.zone = 'hand'; p.hand.push(cd); emit(state, { type: 'conjure', player: pi, card: cd, color: null }); }
		}
		p.endTurnConjure = [];
	}
	// Keeper of Flame: doomed cards perish when their timer runs out
	{
		const doomedHand = p.hand.filter(c => c._doomAtTurn != null && state.turnNumber >= c._doomAtTurn);
		if (doomedHand.length) {
			p.hand = p.hand.filter(c => !doomedHand.includes(c));
			for (const c of doomedHand) {
				toGraveyard(state, pi, c);
				emit(state, { type: 'discard', player: pi, card: c });
				if (c._doomSummonId && state.cardsById[c._doomSummonId]) summon(state, pi, state.cardsById[c._doomSummonId]); // Destructive Phoenix
			}
		}
		for (const c of [...p.board]) if (c._doomAtTurn != null && state.turnNumber >= c._doomAtTurn && !isDead(c)) {
			c.damage = c.maxHealth; c.shield = false;
			emit(state, { type: 'destroy', uid: c.uid });
		}
		sweepDeaths(state);
	}
	// Grazing Stegodon: grows at the end of your turn in hand and deck as well
	for (const hc of p.hand) if (hc.handDeckGrowAttack) hc.attack += 1;
	{
		const seen = new Set();
		for (const id of p.deck) {
			const dd = state.cardsById[id];
			if (dd && dd.handDeckGrowAttack && !seen.has(id)) { seen.add(id); (p.defGrowth = p.defGrowth || {})[id] = (p.defGrowth[id] || 0) + 1; }
		}
	}
	// Gelbin's Auras (and any timed enchantment) tick down on their owner's end of turn
	for (const en of [...p.enchantments]) {
		if (en.turnsLeft == null) continue;
		en.turnsLeft--;
		if (en.turnsLeft <= 0) {
			p.enchantments = p.enchantments.filter(x => x !== en);
			emit(state, { type: 'enchantFade', player: pi, name: en.name });
		}
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
	{ let _g = state.players.length * 4; while ((state.players[next].skipTurns || 0) > 0 && _g-- > 0) { state.players[next].skipTurns--; const _s = next; do { next = (next + 1) % state.players.length; } while (state.players[next].eliminated && next !== _s); if (next === _s) break; } } // Disks of Swiftness
	state.current = next;
	state.turnNumber++;
	const np = state.players[state.current];
	np.diedThisTurn = 0;
	np.diedThisTurnIds = [];
	np.ownCharsDamagedThisTurn = 0; // Warptooth
	np.heroDamagedThisTurn = false; np.heroDamageTakenThisTurn = 0; np.heroHealthChangedThisTurn = false; np.healedThisTurn = false; np.healedAmountThisTurn = 0; np.stealerUsedThisTurn = false; np.damageToEnemyHeroThisTurn = 0; // "took damage this turn" resets each turn
	np.spellsPlayedLastTurnIds = np.spellsPlayedThisTurnIds || []; np.spellsPlayedThisTurnIds = []; // Krag'wa, the Frog
	np.cardsPlayedLastTurnIds = np.cardsPlayedThisTurnIds || []; np.cardsPlayedThisTurnIds = []; // Murozond the Infinite
	// Kil'jaeden: the endless portal grows
	if (np.kiljaeden) np.kiljaeden.bonus += 2;
	// Emberscarred Whelp: gain the promised Mana Crystal for this turn only
	if (np.tempCrystalNext) { np.tempCrystalThis = np.tempCrystalNext; np.tempCrystalNext = 0; np.mana.max += np.tempCrystalThis; np.mana.cur += np.tempCrystalThis; }
	// Irida: two cards return from the Void each turn
	if (np.voidPile && np.voidPile.length) {
		for (let k = 0; k < 2 && np.voidPile.length && np.hand.length < MAX_HAND; k++) {
			const i = Math.floor(state.rng() * np.voidPile.length);
			const [id] = np.voidPile.splice(i, 1);
			if (state.cardsById[id]) { const c = instantiate(state.cardsById[id], state.current); c.zone = 'hand'; np.hand.push(c); emit(state, { type: 'conjure', player: state.current, card: c, color: null }); }
		}
	}
	// Nythendra: reform from the surviving Beetles
	if (np.nythendraReformAt != null && state.turnNumber >= np.nythendraReformAt) {
		np.nythendraReformAt = null;
		const beetles = np.board.filter(c => c.id === 'nythendra_beetle' && !isDead(c));
		if (beetles.length && state.cardsById['nythendra']) {
			np.board = np.board.filter(c => !beetles.includes(c));
			const ny = summon(state, state.current, state.cardsById['nythendra']);
			if (ny) { ny.damage = Math.max(0, ny.maxHealth - beetles.length); emit(state, { type: 'buff', uid: ny.uid, attack: ny.attack, hp: hp(ny) }); }
		}
	}
	// Aviana: the Full Moon rises
	if (np.avianaAt != null && state.turnNumber >= np.avianaAt) {
		np.avianaAt = null; np.allCardsCostOne = true;
		emit(state, { type: 'fullMoon', player: state.current });
	}
	// Runi: minions return from the future with their +5/+5
	if (np.futureCards && np.futureCards.length) {
		const due = np.futureCards.filter(f => state.turnNumber >= f.at);
		np.futureCards = np.futureCards.filter(f => !due.includes(f));
		for (const f of due) {
			if (np.hand.length < MAX_HAND + 3) { f.card.zone = 'hand'; np.hand.push(f.card); emit(state, { type: 'conjure', player: state.current, card: f.card, color: null }); }
		}
	}
	// Cultivating Sprite's Bulb levels up each turn
	for (const hc of np.hand) if (hc.id === 'sprite_bulb') hc._bulbLevel = (hc._bulbLevel || 1) + 1;
	// Uluu the Everdrifter: gains two random Choose One choices each turn in hand
	for (const hc of np.hand) if (hc.id === 'uluu_the_everdrifter') {
		const POOL = [
			{ text: 'Give your other minions +1/+3.', effects: [{ type: 'buff', attack: 1, health: 3, target: 'all-others' }] },
			{ text: 'Summon a 5/5 Ancient with Taunt.', effects: [{ type: 'summon', count: 1, attack: 5, health: 5, name: 'Ancient', grant: 'taunt' }] },
			{ text: 'Draw 2 cards.', effects: [{ type: 'draw', count: 2 }] },
			{ text: 'Deal 4 damage.', effects: [{ type: 'damage', value: 4, target: 'any' }] },
			{ text: 'Restore 8 Health to your hero.', effects: [{ type: 'heal', value: 8, target: 'self' }] },
			{ text: 'Gain 6 Armor.', effects: [{ type: 'armor', value: 6 }] },
		];
		hc.choices = hc.choices || [];
		for (let k = 0; k < 2; k++) hc.choices.push(POOL[Math.floor(state.rng() * POOL.length)]);
	}
	// Petrified Ogre: grows while Dormant, 50% chance to wake each turn
	for (const c of np.board) if (c.ogreDorm && c.dormantLeft > 0) {
		c.attack += 2; c.maxHealth += 2;
		emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
		if (state.rng() < 0.5) { c.dormantLeft = 0; emit(state, { type: 'dormant', player: state.current, uid: c.uid, turns: 0 }); }
	}
	// Nightmare (and other timers): doomed board minions perish at turn starts too
	for (const c of [...np.board]) if (c._doomAtTurn != null && state.turnNumber >= c._doomAtTurn && !isDead(c)) {
		c.damage = c.maxHealth; c.shield = false;
		emit(state, { type: 'destroy', uid: c.uid });
	}
	sweepDeaths(state);
	// Scarlet Subjugator: the Attack debuff wears off at your victim's controller's turn
	for (const pl of state.players) for (const c of pl.board) {
		if (c._atkRestore && state.turnNumber >= c._atkRestore.turn) {
			c.attack += c._atkRestore.amount; c._atkRestore = null;
			emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
		}
	}
	// Chef Neth'rek: count down toward the turn-five surge (applied after the mana ramp below)
	if (np.manaSurgeIn != null) {
		np.manaSurgeIn--;
		if (np.manaSurgeIn <= 0) { np.manaSurgeIn = null; np.manaSurgeNow = true; }
	}
	// Chronikar: hero Attack granted across several of your turns
	if (np.heroAttackTurns && np.heroAttackTurns.left > 0) {
		np.heroTempAttack = (np.heroTempAttack || 0) + np.heroAttackTurns.value;
		np.heroAttackTurns.left--;
		if (np.heroAttackTurns.left <= 0) np.heroAttackTurns = null;
		emit(state, { type: 'heroAttack', player: state.current, attack: heroAttackValue(np) });
	}
	// Circadiamancer: conjured cards that tick down each of your turns
	for (const c of np.hand) if (c._ticksDown && (c.cost || 0) > 0) { c.cost--; emit(state, { type: 'costChange', player: state.current, uid: c.uid, cost: c.cost }); }
	for (const c of np.hand) if (c.handGrow) { c.attack += c.handGrow.attack || 0; c.maxHealth += c.handGrow.health || 0; } // Loyal Henchman grows while held
	for (const c of np.hand) if (c.schemeGrow) c._schemeLevel = (c._schemeLevel || 1) + 1; // Master Scheme upgrades each turn
	for (const c of [...np.hand]) if (c.curseDamage) damageHero(state, state.current, c.curseDamage, state.current); // Cursed! burns its holder
	// Mistah Vistah: the delayed spell replay comes due
	if (np.vistahAt != null && state.turnNumber >= np.vistahAt) {
		const ids = np.vistahSpells || [];
		np.vistahAt = null; np.vistahSpells = null;
		emit(state, { type: 'vistahReplay', player: state.current, count: ids.length });
		for (const id of ids) {
			const def = state.cardsById[id];
			if (def && def.effects) execEffects(state, state.current, JSON.parse(JSON.stringify(def.effects)), null, null);
			if (state.over) break;
		}
		sweepDeaths(state);
	}
	// Godfrey the Betrayer: overflow-discarded cards return (cheaper) while there's room
	if (np.godfreyHeld && np.godfreyHeld.length) {
		while (np.godfreyHeld.length && np.hand.length < MAX_HAND) {
			const c = np.godfreyHeld.shift();
			c.zone = 'hand'; np.hand.push(c);
			emit(state, { type: 'conjure', player: state.current, card: c, color: null });
		}
	}
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
	// generalized in-hand turn transforms (Imposters / Shapeshifter / Genn, Cursed King)
	for (const c of [...np.hand]) {
		const ht = c.handTransform;
		if (!ht) continue;
		let pickDef = null;
		if (ht.fromEnemyHand) { // Shapeshifter: a random minion in the opponent's hand
			const foe = opponentsOf(state, state.current).find(o => state.players[o].hand.some(x => x.type === 'creature'));
			if (foe == null) continue;
			const pool = state.players[foe].hand.filter(x => x.type === 'creature' && state.cardsById[x.id]);
			if (!pool.length) continue;
			pickDef = state.cardsById[pool[Math.floor(state.rng() * pool.length)].id];
		} else if (ht.fromEnemyDeck) { // Disguised K'thir: a random card in the opponent's deck
			const foe = opponentsOf(state, state.current).find(o => state.players[o].deck.length);
			if (foe == null) continue;
			const dk = state.players[foe].deck;
			pickDef = state.cardsById[dk[Math.floor(state.rng() * dk.length)]];
		} else if (ht.intoId) { // Genn: transform into the Worgen King when the REST of the hand is all even or all odd
			if (ht.ifHandParity) {
				const rest = np.hand.filter(x => x !== c).map(x => (x.cost || 0) % 2);
				if (!rest.length || !(rest.every(v => v === 0) || rest.every(v => v === 1))) continue;
			}
			pickDef = state.cardsById[ht.intoId];
		} else if (ht.intoRandom) { // The Box: a random treasure; Shifting Chameleon: a random 1-cost minion
			const r = ht.intoRandom;
			const pool = Object.values(state.cardsById).filter(d => r.treasure
				? (d.treasure && d.id !== c.id)
				: (d.type === (r.cardType || 'creature') && (r.cost == null || (d.cost || 0) === r.cost) && !d.token && d.collectible !== false && !(d.colors && d.colors.length)));
			if (!pool.length) continue;
			pickDef = pool[Math.floor(state.rng() * pool.length)];
		} else { // Imposters: a random minion of a fixed Cost, plus a bonus
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === (ht.cost || 0) && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (!pool.length) continue;
			pickDef = pool[Math.floor(state.rng() * pool.length)];
		}
		if (!pickDef) continue;
		const morph = instantiate(pickDef, state.current);
		morph.uid = c.uid; morph.zone = 'hand';
		if (ht.grant && !morph.keywords.includes(ht.grant)) { morph.keywords.push(ht.grant); if (ht.grant === KW.DIVINE_SHIELD) morph.shield = true; }
		if (ht.spellDamage) morph.static = { type: 'spell-damage', value: ht.spellDamage };
		if (!ht.intoId && !ht.once) morph.handTransform = ht; // keeps morphing each turn (Genn's is one-way)
		np.hand[np.hand.indexOf(c)] = morph;
		emit(state, { type: 'conjure', player: state.current, card: morph, color: null });
	}
	// Hagatha's Embrace: a random minion in hand gains +1/+1 each turn
	if (np.hagathaEmbrace) {
		const hpool = np.hand.filter(c => c.type === 'creature');
		if (hpool.length) { const hc = hpool[Math.floor(state.rng() * hpool.length)]; hc.attack += 1; hc.maxHealth += 1; }
	}
	// Wondrous Wisdomball: occasionally gives helpful advice
	if (np.wisdomball && state.rng() < 0.25) {
		const advice = [
			[{ type: 'conjure-random', count: 2 }],
			[{ type: 'conjure-random', cardType: 'creature', count: 3 }],
			[{ type: 'summon-random', cost: 4 }],
		];
		execEffects(state, state.current, advice[Math.floor(state.rng() * advice.length)], null, null);
	}
	// delayed turn-start effects (Big Boomba round two)
	if (np.turnStartEffects && np.turnStartEffects.length) {
		const q = np.turnStartEffects; np.turnStartEffects = [];
		for (const fx of q) { execEffects(state, state.current, fx, null, null); sweepDeaths(state); }
	}
	state.diedThisTurn = 0; // global "died this turn" (Volcanic Drake discounts)
	np.heroAttacksUsed = 0;
	np.landsPlayedThisTurn = 0;
	np.creaturesPlayedThisTurn = 0;
	np.cardsPlayedThisTurn = 0;
	np.drawsThisTurn = 0; // reset before the mandatory draw so it counts as the first
	np.spellsPlayedThisTurn = 0; np.schoolsCastThisTurn = {}; np.firstBattlecryThisTurn = null; // Metamorfin / Bolner Hammerbeak
	np.parityBlock = null; // Alara: a start-of-turn coin flip may block odd/even-cost plays
		np.freeMinionsCount = 0; // Anub'Rekhan free minions last the turn
		np.armorChangedThisTurn = false; // Stoneskin Armorer
		if (np.parityDiscount) np.parityDiscount.parity = np.parityDiscount.parity === 'odd' ? 'even' : 'odd'; // Thaddius polarity swap
	np.planarRollsThisTurn = 0;
	{ const r = activePlaneRule(state); if (r && r.kind === 'coin-parity') { np.parityBlock = state.rng() < 0.5 ? 'odd' : 'even'; emit(state, { type: 'coinParity', player: state.current, block: np.parityBlock }); } }
	firePlaneTrigger(state, 'turn-start', state.current); // Oberaqua: mill at each turn's start
	// stale this-turn cost riders lapse; Millhouse's gift comes due
	np.costDiscounts = (np.costDiscounts || []).filter(d => !d.thisTurn);
	np.freeSpellsThisTurn = !!np.freeSpellsNextTurn;
	np.freeSpellsNextTurn = false;
	if (state.turnNumber > 1 && np.mana.max < MAX_BASE_MANA) np.mana.max++;
	if (np.manaSurgeNow) { np.manaSurgeNow = false; if (np.mana.max < 10) { np.mana.max = 10; emit(state, { type: 'manaSurge', player: state.current }); } } // Chef Neth'rek
	np.mana.cur = np.mana.max;
	// overload: mana spent ahead of time stays locked this turn
	np.overloadLockedThisTurn = 0;
	if (np.overloadPending) {
		np.mana.cur = Math.max(0, np.mana.cur - np.overloadPending);
		emit(state, { type: 'overloaded', player: state.current, amount: np.overloadPending });
		np.overloadLockedThisTurn = np.overloadPending; // Eternal Sentinel can give these back
		np.overloadPending = 0;
	}
	// Duels start-of-turn passives
	if (np.conduitStorms && np.overloadLockedThisTurn > 0) { np.heroTempAttack += 2; emit(state, { type: 'heroAttack', player: state.current, attack: (np.heroAttack || 0) + np.heroTempAttack }); } // Conduit of the Storms: Overloaded -> +2 Attack this turn
	if (np.crystalGem) { np._cgUsed = np._cgUsed || 0; if (np._cgUsed < 2) { np._cgUsed++; np.mana.max = Math.min(MAX_BASE_MANA, np.mana.max + 1); np.mana.cur = Math.min(np.mana.max, np.mana.cur + 1); } } // Crystal Gem: +1 Mana Crystal on your first two turns
	if (np.partyReplacement) { const PKW = ['taunt', 'rush', 'divine_shield', 'lifesteal']; execEffects(state, state.current, [{ type: 'summon', count: 1, attack: 2, health: 2, name: 'Adventurer', keywords: [PKW[Math.floor(state.rng() * PKW.length)]] }], null, null); } // Party Replacement: a 2/2 Adventurer with a random bonus
	if (np.battleStance) { np.heroTempAttack += 2; emit(state, { type: 'heroAttack', player: state.current, attack: (np.heroAttack || 0) + np.heroTempAttack }); } // Battle Stance (Duels): +2 hero Attack on your turn
	for (const c of np.board) if (c.reviveTimer > 0) { c.reviveTimer--; if (c.reviveTimer <= 0) { c.reviveTimer = 0; c.dormantLeft = 0; c.sick = false; emit(state, { type: 'awaken', player: state.current, uid: c.uid, name: c.name }); } } // Dragonbone Ritual: dormant Dragons revive on schedule
	if (np.legendaryLoot && !np._legLootUsed) { np._legLootUsed = true; execEffects(state, state.current, [{ type: 'discover', cardType: 'weapon', rarity: 'legendary' }], null, null); } // Legendary Loot: on your first turn, Discover a Legendary weapon
	if (np.duelsHagatha) { for (let _hg = 0; _hg < 2; _hg++) { const hgp = np.hand.filter(c => c.type === 'creature'); if (hgp.length) { const hgc = hgp[Math.floor(state.rng() * hgp.length)]; hgc.attack += 1; hgc.maxHealth += 1; emit(state, { type: 'buff', uid: hgc.uid, attack: hgc.attack, hp: hp(hgc) }); } } } // Hagatha's Embrace (Duels): two random hand creatures +1/+1
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
		for (const a of np.artifacts) if (a.tapAbility) a.tapped = false; // {T}-ability artifacts untap each turn
	}
	np.sacrificedThisTurn = {}; // reset "sacrificed a Clue this turn"
	for (const c of np.board) if (c.immuneTurnsLeft > 0 && --c.immuneTurnsLeft <= 0) { c.keywords = c.keywords.filter(k => k !== KW.IMMUNE); emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); } // multi-turn Immune (Blacksmith's Skill) wears off
	for (const c of np.hand) if (c.inHandSwap) { const a = c.attack; c.attack = c.maxHealth; c.maxHealth = a; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); } // in-hand: swap Attack & Health each turn
	// Twisted Monstrosity: each turn in hand, alternate between two random Bonus Effects
	for (const c of np.hand) if (c.bonusEffectSwap) {
		if (!c._bonusPair) {
			const pool = DARK_GIFTS.filter(g => !g.handOnly && !g.dr); // pure stat/keyword Bonus Effects
			const i = Math.floor(state.rng() * pool.length); let j = Math.floor(state.rng() * (pool.length - 1)); if (j >= i) j++;
			c._bonusPair = [pool[i], pool[j]]; c._bonusActive = 0;
			c._twBase = { attack: c.attack, health: c.maxHealth, kw: [...(c.keywords || [])], desc: c.description || '' };
		} else c._bonusActive = c._bonusActive ? 0 : 1; // swap which effect is live
		c.attack = c._twBase.attack; c.maxHealth = c._twBase.health; c.keywords = [...c._twBase.kw]; c.description = c._twBase.desc; c.shield = c._twBase.kw.includes('divine_shield');
		applyGift(state, c, c._bonusPair[c._bonusActive], { noLog: true });
		emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
	}
	for (const hpw of np.heroPowers) { hpw.usedThisTurn = false; hpw._uses = 0; }
	for (const pw of np.planeswalkers) pw.usedThisTurn = false;
	// Aegis of Death: a weapon that bleeds a durability every turn (and blows up
	// on the owner when it finally breaks — its deathrattle)
	if (np.weapon && np.weapon.loseDurabilityEachTurn) degradeWeapon(state, state.current);
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
	if (state.anomaly === 'rejuvenating') healHero(state, state.current, 2); // Anomaly - Rejuvenating
	// Un'Goro Elemental synergy: carry "played an Elemental" into this turn
	{ const cp = state.players[state.current]; cp.elementalLastTurn = cp.elementalThisTurn; cp.elementalThisTurn = false; cp.elementalsPlayedLastTurn = cp.elementalsPlayedThisTurn || 0; cp.elementalsPlayedThisTurn = 0; }
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
	// Chronochiller: you no longer draw at the start of your turn
	// Commander Geddon: the draw becomes a discounted Discover from your deck
	{
		const cp = state.players[state.current];
		if (cp.geddonDraw && cp.deck.length) {
			execEffects(state, state.current, [{ type: 'discover', fromOwnDeck: true, cardType: 'any', drawPick: true, costMod: -3 }], null, null);
		} else if (!cp.board.some(c => c.skipStartDraw && !isDead(c))) {
			drawCards(state, state.current, 1);
		}
		if (cp.extraTurnDraw) drawCards(state, state.current, cp.extraTurnDraw); // Elixir of Vim
	}
}

// drain event queue (renderer calls this each frame/action)
export function takeEvents(state) {
	const evs = state.events;
	state.events = [];
	return evs;
}

// A process that ingests state minted elsewhere (duel guest, spectator, a
// restored snapshot) must lift the uid counter past the ingested uids before
// instantiating anything new, or fresh instances can collide with restored
// ones. Pair with serialize.js maxSnapshotUid().
export function allocUid() { return nextUid++; }
export function ensureUidsAbove(n) {
	if (n >= nextUid) nextUid = n + 1;
}

// Facade re-exports (docs/engine-hardening/05: engine.js will become a thin
// shim over engine/ modules; extractions surface here so callers keep their
// single `import * as E from './engine.js'` line).
export { SCHEMA_VERSION, toSnapshot, fromSnapshot, migrate, normalize, maxSnapshotUid } from './serialize.js';
