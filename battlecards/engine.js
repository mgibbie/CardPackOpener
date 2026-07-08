// engine.js — Magepunk Battlecards rules engine (pure logic, no rendering).
// Ported from Magepunk66 Core/Modules/battlecards (Battlecards.lua, BattleEngine.lua,
// Combat.lua, Mana.lua, Hand.lua, Keyword.lua, CardEffect.lua) with the card-text
// mechanics those Lua files hadn't implemented yet scripted per card id.

export const KW = {
	TAUNT: 'taunt', CHARGE: 'charge', RUSH: 'rush', TRAMPLE: 'trample',
	FIRST_STRIKE: 'first_strike', WINDFURY: 'windfury', DEFENDER: 'defender',
	BATTLECRY: 'battlecry', DEATHRATTLE: 'deathrattle', LIFESTEAL: 'lifesteal',
	DIVINE_SHIELD: 'divine_shield', STEALTH: 'stealth', DEATHTOUCH: 'deathtouch',
	POISONOUS: 'poisonous', FREEZER: 'freezer',
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
		{ label: 'Venomous', keyword: 'deathtouch' },
		{ label: 'Ward: 2 Life', ward: { life: 2 } },
		PENDING('Swing: Advance'),
		{ label: 'Avenge 1: Gain 1 Life', ongoing: { on: 'friendly-creature-died', need: 1, once: true, effects: [{ type: 'heal', value: 1, target: 'self' }] } },
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

// Adapt d10 (paper glossary; Poisonous approximated as deathtouch, stealth
// permanent rather than one-turn)
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
	{ label: 'Poisonous', keyword: 'deathtouch' },
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
		tempAttack: 0,               // "this turn" attack, expires at owner's turn end
		tempHealth: 0,               // "this turn" health (Prowess)
		power: def.power || null,   // hero power: { cost, effects }
		quest: def.quest || null,   // quest: { goal: { type, count }, reward }
		ongoing: def.ongoing || null, // permanent trigger: { on, effects }
		static: def.static || null,   // permanent passive (e.g. reduce-hero-damage)
		costMod: def.costMod || null, // board cost aura: { cardType, amount, scope, floor?, firstEachTurn? }
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
		medic: def.medic || 0,        // heals adjacent creatures N at end of turn
		sac: def.sac || null,         // field-token activation: { cost, discard?, effects }
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
export function createGame(cardsById, rng = Math.random, playerDeckIds = null, playerCount = 2, classPicks = null) {
	// never in decks: companions/commanders (own zones), lands (bought from the
	// slot menu), and colored cards (conjured by lands during play)
	const playable = Object.values(cardsById).filter(d =>
		!UNPLAYABLE.has(d.id) && !d.companion && !d.commander && !d.token
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
		heroTempAttack: 0,  // "your hero has +N Attack this turn"
		costDiscounts: [],  // one-shot "next X costs (N) less" riders
		creaturesPlayedThisTurn: 0, // Pint-Sized-style first-creature discounts
		cardsPlayedThisTurn: 0,     // Combo activation (counts cards already resolved)
		drawsThisTurn: 0,           // Ponder: fires on every draw after the first this turn
		spellsPlayedThisTurn: 0,    // Kalecgos-style first-spell discounts
		freeSpellsNextTurn: false,  // Millhouse: spells free on your next turn
		freeSpellsThisTurn: false,
		mana: { cur: 1, max: 1, bonus: 0 },
		coins: 0,
		diedThisTurn: 0,
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
		dredgeQueue: [], // pending Dredge decisions: { player, ids } (bottom-of-deck)
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

	// deal each player a random companion and commander into their zones
	const companions = Object.values(cardsById).filter(d => d.companion);
	const commanders = Object.values(cardsById).filter(d => d.commander);
	state.players.forEach((p, i) => {
		if (companions.length) {
			p.companion = instantiate(companions[Math.floor(rng() * companions.length)], i);
			p.companion.zone = 'companion';
		}
		if (commanders.length) {
			const c = instantiate(commanders[Math.floor(rng() * commanders.length)], i);
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
		if (p.hand.length >= MAX_HAND) { emit(state, { type: 'burn', player: pi, cardId: id }); continue; }
		const card = instantiate(state.cardsById[id], pi);
		card.zone = 'hand';
		p.hand.push(card);
		emit(state, { type: 'draw', player: pi, card });
		questTick(state, 'draw', pi, 1, card);
		// Ponder: fires on every card drawn after your first draw of the turn
		p.drawsThisTurn = (p.drawsThisTurn || 0) + 1;
		if (p.drawsThisTurn > 1) firePonder(state, pi, { drawn: card });
	}
}

// Ponder triggers on extra draws / scry / dredge / gaze. A re-entrancy lock
// stops a Ponder effect that itself draws or scries from re-triggering Ponder.
function firePonder(state, pi, ctx = {}) {
	if (state.ponderLock) return;
	state.ponderLock = true;
	try { fireOngoing(state, pi, 'ponder', ctx); }
	finally { state.ponderLock = false; }
}

function toGraveyard(state, pi, card) {
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
	damage: { any: 'any', creature: 'creature', 'enemy-creature': 'enemy-creature', 'undamaged-creature': 'creature' },
	heal: { any: 'any', creature: 'creature' },
	buff: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'grant-ongoing': { 'friendly-creature': 'friendly-creature' },
	'grant-static': { 'friendly-creature': 'friendly-creature' },
	grant: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	destroy: { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	'copy-to-hand': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'copy-summon': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'summon-with-stats': { 'friendly-creature': 'friendly-creature' },
	exile: { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	disguise: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	freeze: { any: 'any', creature: 'creature', 'enemy-creature': 'enemy-creature' },
	silence: { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'temp-buff': { creature: 'creature', 'friendly-creature': 'friendly-creature', 'friendly-any': 'friendly-any' },
	'heal-full': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'set-health': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'set-attack': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'attack-equals-health': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'double-health': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'double-attack': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	bounce: { creature: 'creature', 'enemy-creature': 'enemy-creature', 'friendly-creature': 'friendly-creature' },
	'mind-control': { 'enemy-creature': 'enemy-creature' },
	transform: { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'transform-copy': { creature: 'creature' },
	conditional: { any: 'any', creature: 'creature' },
	'damage-then': { any: 'any', creature: 'creature' },
	'draw-damage': { any: 'any' },
	'grant-deathrattle': { creature: 'creature' },
	'copy-deathrattle': { 'friendly-creature': 'friendly-creature' },
	attach: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'attach-curse': { creature: 'creature', 'enemy-creature': 'enemy-creature' },
	'add-counters': { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	'temp-immune': { creature: 'creature' },
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
	if (card.choices) return card.choices[choice ?? 0]?.effects || [];
	return card.effects;
}

// Combo cards act on their combo line instead when another card was already
// played this turn (cardsPlayedThisTurn counts only fully-resolved cards)
export function comboActive(state, pi) {
	return state.players[pi].cardsPlayedThisTurn >= 1;
}
export function liveEffectsOf(state, pi, card, choice) {
	if (card.combo && comboActive(state, pi)) return card.combo;
	return effectsOf(card, choice);
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
		// "the enemy hero" is unambiguous in 1v1 but a choice with 3+ players
		if (!kind && e.target === 'enemy-hero' && e.type === 'damage' && opponentsOf(state, pi).length > 1) {
			kind = 'enemy-hero';
		}
		if (!kind) continue;
		let filter = null, why = {
			any: 'any target', creature: 'a creature',
			'enemy-creature': 'an enemy creature', 'friendly-creature': 'a friendly creature',
			'friendly-any': 'a friendly character', 'enemy-hero': 'an enemy hero',
			'enemy-any': 'an enemy', 'any-hero': 'a hero',
		}[kind];
		if (e.target === 'undamaged-creature') { filter = c => c.damage === 0; why = 'an undamaged creature'; }
		if (e.maxAttack != null) { filter = c => c.attack <= e.maxAttack; why = `a creature with ${e.maxAttack} or less Attack`; }
		if (e.maxCost != null) { filter = c => (c.cost || 0) <= e.maxCost; why = `a creature that costs ${e.maxCost} or less`; }
		if (e.minAttack != null) { filter = c => c.attack >= e.minAttack; why = `a creature with ${e.minAttack} or more Attack`; }
		if (e.requireKeyword != null) { filter = c => c.keywords.includes(e.requireKeyword); why = `a creature with ${e.requireKeyword.replace(/_/g, ' ')}`; }
		if (e.requireDamaged) { filter = c => c.damage > 0; why = 'a damaged creature'; }
		if (e.tribe) {
			const tribes = e.tribe.split('|');
			filter = c => tribes.some(t => (c.tribe || '').includes(t));
			why = `a friendly ${e.tribe.replace(/\|/g, '/')}`;
		}
		// spells need their target; creature/weapon battlecries fizzle without one
		const required = card.type !== 'creature' && card.type !== 'weapon';
		return { targets: kind, filter, required, why };
	}
	return null;
}

export function legalTargets(state, pi, spec) {
	const out = [];
	const opps = opponentsOf(state, pi);
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
		for (const o of opps) out.push({ type: 'hero', player: o });
	}
	if (spec.targets === 'creature') { pushCreatures(pi); for (const o of opps) pushCreatures(o); }
	if (spec.targets === 'enemy-creature') { for (const o of opps) pushCreatures(o); }
	if (spec.targets === 'friendly-creature') { pushCreatures(pi); }
	if (spec.targets === 'friendly-any') { pushCreatures(pi); out.push({ type: 'hero', player: pi }); }
	if (spec.targets === 'enemy-hero') { for (const o of opps) out.push({ type: 'hero', player: o }); }
	if (spec.targets === 'enemy-any') {
		for (const o of opps) { pushCreatures(o); out.push({ type: 'hero', player: o }); }
	}
	if (spec.targets === 'any-hero') {
		out.push({ type: 'hero', player: pi });
		for (const o of opps) out.push({ type: 'hero', player: o });
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
	if (p.hand.length >= MAX_HAND) { emit(state, { type: 'burn', player: pi, cardId: id }); return null; }
	const card = instantiate(def, pi);
	card.zone = 'hand';
	p.hand.push(card);
	emit(state, { type: 'conjure', player: pi, card, color: null });
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
// +1 mana this turn, Hearthstone-style. Overflows are burned like any draw.
function addCoin(state, pi) {
	const p = state.players[pi];
	if (p.eliminated) return;
	const def = state.cardsById['coin'];
	if (!def) { p.coins = (p.coins || 0) + 1; return; } // fallback if the card is missing
	if (p.hand.length >= MAX_HAND) { emit(state, { type: 'burn', player: pi, cardId: 'coin' }); return; }
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
	if (target.immuneTurn === state.turnNumber) return 0; // Bestial Wrath's Immune
	if (target.shield) {
		target.shield = false;
		emit(state, { type: 'shieldPop', uid: target.uid });
		return 0;
	}
	target.damage += amount;
	if (target.damage === target.maxHealth) state.exactKills = (state.exactKills || 0) + 1;
	if (source && (has(source, KW.DEATHTOUCH) || has(source, KW.POISONOUS))) target.poisoned = true;
	// Commanding Shout: friendly creatures can't drop below 1 health this turn
	const owner = state.players[target.controller];
	if (owner?.minionsSurviveTurn === state.turnNumber && target.damage >= target.maxHealth) {
		target.damage = target.maxHealth - 1;
		target.poisoned = false;
	}
	emit(state, { type: 'damage', targetType: 'creature', uid: target.uid, amount, hp: hp(target) });
	if (target.enrage || target.statRule) recomputeAuras(state); // enrage/Lightspawn track damage
	// whenever-a-minion-takes-damage triggers (fires even if the hit is lethal);
	// Frenzy variants fire once and only on surviving the hit
	if (target.ongoing?.on === 'self-damaged') {
		const o = target.ongoing;
		if (!o.survives || !isDead(target)) {
			if (o.once) target.ongoing = null;
			runSecretEffects(state, target.controller, o.effects, { self: target, damaged: target });
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
	if (p.heroImmuneTurn === state.turnNumber) return 0; // "can't take damage this turn"
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
		emit(state, { type: 'damage', targetType: 'hero', player: pi, amount, life: p.life });
		fireSecrets(state, pi, 'hero-takes-damage', { fatal: false, amount, src });
		questTick(state, 'damage-taken', pi, amount);
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
	emit(state, { type: 'damage', targetType: 'hero', player: pi, amount, life: p.life });
	if (toLife > 0) fireSecrets(state, pi, 'hero-takes-damage', { fatal: false, amount: toLife, src });
	if (toLife > 0) questTick(state, 'damage-taken', pi, toLife);
	return toLife;
}

function gainArmor(state, pi, amount) {
	state.players[pi].armor += amount;
	emit(state, { type: 'armor', player: pi, amount, armor: state.players[pi].armor });
}

function healHero(state, pi, amount) {
	const p = state.players[pi];
	const before = p.life;
	// heroes never heal above their starting total (a dungeon run sets a
	// lower maxLife per level so 15-HP heroes can't top up to 30)
	p.life = Math.min(p.maxLife ?? STARTING_LIFE, p.life + amount);
	emit(state, { type: 'heal', targetType: 'hero', player: pi, amount, life: p.life });
	// Lightwarden-style triggers fire only when healing actually landed
	if (p.life > before) {
		for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'healed', { healedHero: pi });
	}
}

function isDead(c) {
	if (c.type === 'location') return c.poisoned || c.durability <= 0;
	return c.poisoned || c.damage >= c.maxHealth;
}

function freezeCreature(state, c) {
	if (isDead(c)) return;
	c.frozen = state.turnNumber;
	emit(state, { type: 'freeze', uid: c.uid });
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
			emit(state, { type: 'death', uid: c.uid, player: pi, name: c.name });
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
				c.poisoned = false;
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
	fireOngoing(state, pi, 'summoned', { minion: c });
	recomputeAuras(state);
	return c;
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
				aBonus += a.attack || 0;
				hBonus += a.health || 0;
				for (const k of a.keywords || []) granted.add(k);
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

// condition on an ongoing trigger, judged against the event's subject card
// (the summoned/played/dead/damaged creature) or the owner's own state
function ongoingCondOk(state, pi, cond, ctx) {
	const subj = ctx.minion || ctx.played || ctx.dead || ctx.damaged || null;
	if (cond.maxAttack != null && !(subj && subj.attack <= cond.maxAttack)) return false;
	if (cond.tribe && !(subj && (subj.tribe || '').includes(cond.tribe))) return false;
	if (cond.overload && !(subj && subj.overload > 0)) return false;
	if (cond.cardType && !(subj && subj.type === cond.cardType)) return false;
	if (cond.controlSecret && !state.players[pi].secrets.length) return false;
	if (cond.creature && !ctx.healedCreature) return false; // "whenever a MINION is healed"
	if (cond.nontoken && (!subj || (subj.id || '').startsWith('token_'))) return false;
	if (cond.cardId && !(subj && subj.id === cond.cardId)) return false; // Food sacrifices
	return true;
}

// ---------- ongoing permanents (enchantments, artifacts, emblems, creatures) ----------
// persistent triggers: fire every time, card stays in play. Board creatures
// with an `ongoing` field participate too (whenever-/at- style minions);
// each firing card sees itself as ctx.self so effects can target it.
function fireOngoing(state, pi, when, ctx = {}) {
	const p = state.players[pi];
	if (state.over || p.eliminated) return;
	const sources = [...p.enchantments, ...p.artifacts, ...p.emblems, ...p.board.filter(c => c.ongoing),
		...(p.weapon?.ongoing ? [p.weapon] : [])]; // Eaglehorn/Sword of Justice
	for (const card of sources) {
		if (state.over) break;
		if (!card.ongoing || card.ongoing.on !== when) continue;
		if (card === ctx.minion) continue; // a minion doesn't trigger on its own arrival
		if (card.zone === 'board' && isDead(card)) continue;
		// conditional triggers ("Whenever you summon a Beast...") gate before counters
		if (card.ongoing.if && !ongoingCondOk(state, pi, card.ongoing.if, ctx)) continue;
		// Avenge-style triggers need N occurrences before they pop (once);
		// Morbid-style `every` triggers fire on every Nth occurrence, repeating
		if (card.ongoing.need || card.ongoing.every) {
			card.trigCount = (card.trigCount || 0) + 1;
			if (card.trigCount < (card.ongoing.need || card.ongoing.every)) continue;
			if (card.ongoing.every) card.trigCount = 0;
		}
		emit(state, { type: 'ongoingTriggered', player: pi, card });
		const fx = card.ongoing.effects;
		if (card.ongoing.once) card.ongoing = null; // Spellburst-style one-shots
		runSecretEffects(state, pi, fx, { ...ctx, self: card });
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
	questTick(state, 'land', pi);
	sweepDeaths(state);
	return true;
}

export function canTapLand(state, pi, card, tapIndex) {
	if (state.over || state.current !== pi) return false;
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
	execEffects(state, pi, t.effects, target, card);
	// locations wear out: durability counts their remaining taps
	if (card.type === 'location') {
		card.durability -= 1;
		emit(state, { type: 'locationDurability', player: pi, uid: card.uid, durability: card.durability });
		if (card.durability <= 0) {
			card.poisoned = true; // routes through the normal death sweep
		}
	}
	sweepDeaths(state);
	return true;
}

// ---------- activated creature abilities ----------
// def.activated = [{cost, sacrifice?, discardRandom?, payLife?, effects, text}]
// creatures never tap (user ruling): abilities are once per turn instead,
// independent of attacking; sacrifice abilities kill the creature as the cost.
export function canActivate(state, pi, card, i) {
	if (state.over || state.current !== pi) return false;
	const p = state.players[pi];
	if (!p.board.includes(card) || isDead(card) || !card.activated) return false;
	if (card.frozen || card.dormantLeft > 0) return false;
	const a = card.activated[i];
	if (!a) return false;
	if (card.abilityUsedThisTurn && !a.repeatable) return false; // repeatable abilities (Firebreathing) ignore the once/turn gate
	if ((a.cost || 0) > availableMana(p)) return false;
	if (a.discardRandom && p.hand.length === 0) return false;
	if (a.payLife && p.life <= a.payLife) return false;
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
	if (a.sacrifice) { card.damage = card.maxHealth + 99; card.poisoned = true; }
	execEffects(state, pi, a.effects, target, card);
	sweepDeaths(state);
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
			case 'prevent': ctx.prevented = true; break;
			case 'armor': gainArmor(state, pi, e.value); break;
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
					if (rp && rp.hand.length < MAX_HAND) {
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
				const pool = state.players[pi].board.filter(c => !isDead(c) && (!e.excludeSelf || c !== ctx.self));
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
					if (def && owner.hand.length < MAX_HAND) {
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
	if ((card.effects || card.choices || card.combo) && !LEGACY_SCRIPTED.has(card.id)) {
		execEffects(state, pi, liveEffectsOf(state, pi, card, choice), target, card);
		// Battle Totem (dungeon treasure / Jin'zo passive) or a live Brann
		if (p.battlecriesTwice
			|| p.board.some(c => c.battlecryDouble && !isDead(c) && c !== card)) {
			execEffects(state, pi, liveEffectsOf(state, pi, card, choice), target, card);
		}
	}
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
	const pickEnemy = () => enemies.length ? enemies[Math.floor(state.rng() * enemies.length)] : null;
	// "the enemy hero": the chosen one, the only one, or (untargeted fallback) a random one
	const enemyHero = () => {
		if (target?.type === 'hero' && target.player !== pi) return target.player;
		return enemies.length === 1 ? enemies[0] : pickEnemy();
	};
	const chosenCreature = () => target?.type === 'creature' ? findCreature(state, target.uid) : null;
	const healCreature = (c, v) => {
		const healed = c.damage > 0 && v > 0;
		c.damage = Math.max(0, c.damage - v);
		emit(state, { type: 'heal', targetType: 'creature', uid: c.uid, amount: v, hp: hp(c) });
		if (healed) {
			for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'healed', { healedCreature: c });
		}
	};
	const buffCreature = (c, atk, hpv) => {
		c.attack += atk;
		c.maxHealth += hpv;
		emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
	};
	// Shield Slam-style scaling: the effect's value multiplies by a live count
	const scaled = e => {
		if (e.value === 'X') return source?.xValue || 0; // X-spells: excess mana
		if (!e.valuePer) return e.value;
		const p = state.players[pi];
		if (e.valuePer === 'armor') return (e.value || 1) * p.armor;
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
		if (e.type === 'damage') {
			// friendly Spell Damage boosts direct spell damage
			let v = scaled(e);
			if (source && (source.type === 'sorcery' || source.type === 'instant')) {
				v += staticValue(state.players[pi], 'spell-damage');
			}
			v = boost(v);
			// Lightning Storm rolls its damage per target
			const rollv = () => e.range
				? boost(e.range[0] + Math.floor(state.rng() * (e.range[1] - e.range[0] + 1)))
				: v;
			switch (e.target) {
				case 'enemy-hero': { const t = enemyHero(); if (t != null) damageHero(state, t, v, pi); break; }
				case 'own-hero': damageHero(state, pi, v, pi); break;
				case 'enemy-creatures': for (const o of enemies) for (const c of [...state.players[o].board]) damageCreature(state, c, rollv(), null); break;
				case 'all-creatures': for (const pl of state.players) for (const c of [...pl.board]) damageCreature(state, c, v, null); break;
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
		} else if (e.type === 'heal') {
			const v = boost(e.value);
			// Auchenai Soulpriest: your healing deals damage instead
			const harm = staticValue(state.players[pi], 'heal-becomes-damage') > 0;
			const mendHero = who => harm ? damageHero(state, who, v, pi) : healHero(state, who, v);
			const mend = c => harm ? damageCreature(state, c, v, null) : healCreature(c, v);
			if (e.target === 'self') mendHero(pi);
			else if (e.target === 'enemy-hero') { const t = enemyHero(); if (t != null) mendHero(t); }
			else if (e.target === 'all-heroes') { for (let s = 0; s < state.players.length; s++) if (!state.players[s].eliminated) mendHero(s); }
			else if (e.target === 'all-creatures') { for (const pl of state.players) for (const c of [...pl.board]) mend(c); }
			else if (e.target === 'friendly-creatures') { for (const c of [...state.players[pi].board]) mend(c); }
			else if (e.target === 'friendly-all') { mendHero(pi); for (const c of [...state.players[pi].board]) mend(c); }
			else {
				const t = chosenCreature();
				if (t) mend(t);
				else if (target?.type === 'hero') mendHero(target.player);
				else mendHero(pi);
			}
		} else if (e.type === 'draw') {
			drawCards(state, pi, scaled(e));
		} else if (e.type === 'buff') {
			if (e.target === 'friendly-creatures') {
				for (const c of state.players[pi].board) {
					if (e.tribe && !(c.tribe || '').includes(e.tribe)) continue;
					if (e.name && c.name !== e.name) continue; // Quartermaster's Recruits
					if (e.requireKeyword && !c.keywords.includes(e.requireKeyword)) continue;
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
				: e.target === 'self' ? (source && source.zone === 'board' && !isDead(source) ? [source] : [])
				: [chosenCreature()].filter(Boolean);
			// tribe-restricted grants never fall back to a random creature
			if (!grantTo.length && e.target !== 'friendly-creatures' && e.target !== 'self' && !e.tribe) {
				// triggered grants without a chosen target bless a random friendly
				const pool = state.players[pi].board.filter(c => !isDead(c));
				if (pool.length) grantTo.push(pool[Math.floor(state.rng() * pool.length)]);
			}
			for (const c of grantTo) {
				// Castle Kennels: some grants only take on a matching tribe
				if (e.ifTribe && !(c.tribe || '').includes(e.ifTribe)) continue;
				if (!c.keywords.includes(e.keyword)) c.keywords.push(e.keyword);
				if (e.keyword === KW.DIVINE_SHIELD) c.shield = true;
				if (e.keyword === KW.STEALTH) c.stealthed = true;
			}
		} else if (e.type === 'destroy') {
			const t = chosenCreature();
			if (t && (e.maxAttack == null || t.attack <= e.maxAttack)
				&& (e.maxCost == null || (t.cost || 0) <= e.maxCost)
				&& (e.minAttack == null || t.attack >= e.minAttack)
				&& (e.requireKeyword == null || t.keywords.includes(e.requireKeyword))
				&& (e.tribe == null || (t.tribe || '').includes(e.tribe))
				&& !(e.requireDamaged && t.damage === 0)) {
				t.damage = t.maxHealth;
				t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
				// riders that only apply when something was actually destroyed
				if (e.then) execEffects(state, pi, e.then, target, source);
			}
		} else if (e.type === 'destroy-random') {
			const pool = [];
			for (const o of enemies) for (const c of state.players[o].board) {
				if (!isDead(c) && (e.maxAttack == null || c.attack <= e.maxAttack)) pool.push(c);
			}
			if (pool.length) {
				const t = pool[Math.floor(state.rng() * pool.length)];
				t.damage = t.maxHealth;
				t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
			}
		} else if (e.type === 'destroy-all') {
			// board wipe; `others` spares the source, `spareRandom` spares one survivor
			const all = [];
			for (const pl of state.players) for (const c of pl.board) if (!isDead(c)) all.push(c);
			let spare = null;
			if (e.others && source) spare = source;
			if (e.spareRandom && all.length) spare = all[Math.floor(state.rng() * all.length)];
			for (const c of all) {
				if (c === spare) continue;
				c.damage = c.maxHealth;
				c.shield = false;
				emit(state, { type: 'destroy', uid: c.uid });
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
			else { const t = chosenCreature(); if (t) freezeCreature(state, t); /* hero freeze: no-op (heroes can't attack) */ }
		} else if (e.type === 'silence') {
			if (e.target === 'enemy-creatures') { for (const o of enemies) for (const c of state.players[o].board) silenceCreature(state, c); }
			else { const t = chosenCreature(); if (t) silenceCreature(state, t); }
		} else if (e.type === 'random-damage') {
			// count independent hits of `value` at random members of the pool;
			// Jungle Gym: extra hits for each friendly of a tribe
			let hits = e.count || 1;
			if (e.perFriendlyTribe) {
				hits += state.players[pi].board.filter(c => !isDead(c)
					&& (c.tribe || '').includes(e.perFriendlyTribe)).length;
			}
			for (let i = 0; i < hits; i++) {
				const pool = [];
				const pushBoard = side => { for (const c of state.players[side].board) if (!isDead(c)) pool.push({ c }); };
				if (e.pool === 'enemy-creatures') { for (const o of enemies) pushBoard(o); }
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
				if (pick.hero != null) damageHero(state, pick.hero, e.value, pi);
				else damageCreature(state, pick.c, e.value, null);
			}
		} else if (e.type === 'summon') {
			// perEnemy: one token per enemy creature ("Unleash the Hounds");
			// options: pick a random companion (Animal Companion);
			// forEnemy: tokens go to a random opponent (Leeroy's Whelps)
			let n = e.count === 'X' ? (source?.xValue || 0) : (e.count || 1);
			if (e.perEnemy) {
				n = 0;
				for (const o of enemies) n += state.players[o].board.filter(c => !isDead(c)).length;
			}
			const owner = e.forEnemy && enemies.length
				? enemies[Math.floor(state.rng() * enemies.length)] : pi;
			for (let i = 0; i < n; i++) {
				const opt = e.options ? e.options[Math.floor(state.rng() * e.options.length)] : e;
				// randomKeywords: each token rolls its own bonus (Bucket of Soldiers)
				const kws = [...(opt.keywords || [])];
				if (e.randomKeywords?.length) {
					kws.push(e.randomKeywords[Math.floor(state.rng() * e.randomKeywords.length)]);
				}
				summon(state, owner, {
					id: 'token_' + opt.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: opt.name, type: 'creature', cost: 0, rarity: 'common',
					description: opt.description || `A ${opt.attack}/${opt.health} token.`,
					attack: opt.attack, health: opt.health,
					keywords: kws,
					tribe: opt.tribe || null,
					aura: opt.aura || null,
					static: opt.static || e.static || null,
					deathrattle: opt.deathrattle || null, // Underbelly Network's Rat
				});
			}
		} else if (e.type === 'summon-self-copy') {
			// Saronite Chain Gang / Doppelgangster: fresh copies of the played minion
			const def = source && state.cardsById[source.id];
			if (def) for (let i = 0; i < (e.count || 1); i++) summon(state, pi, def);
		} else if (e.type === 'summon-from-hand') {
			// Voidcaller: a random qualifying creature jumps from hand to board
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature'
				&& (!e.tribe || (c.tribe || '').includes(e.tribe)));
			if (pool.length) {
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
			const p = state.players[pi];
			const def = state.cardsById[e.id];
			if (def && p.hand.length < MAX_HAND) {
				const card = instantiate(def, pi);
				card.zone = 'hand';
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			} else if (!def) {
				drawCards(state, pi, 1); // named card not in the pool yet
			}
		} else if (e.type === 'grant-ongoing') {
			const t = chosenCreature();
			if (t) t.ongoing = JSON.parse(JSON.stringify(e.ongoing));
		} else if (e.type === 'grant-static') {
			const t = chosenCreature();
			if (t) t.static = { ...e.static };
		} else if (e.type === 'armor') {
			gainArmor(state, pi, e.value);
		} else if (e.type === 'install-secret') {
			installSecret(state, pi, e.id);
		} else if (e.type === 'discount-hand') {
			// Hunter's Call: cards in hand permanently cost (N) less
			for (const c of state.players[pi].hand) c.cost = Math.max(0, c.cost - (e.value || 1));
		} else if (e.type === 'mill') {
			// Devour: burn the top N cards of an opponent's deck
			const victim = enemyHero();
			if (victim != null) {
				for (let i = 0; i < (e.value || 1); i++) state.players[victim].deck.pop();
			}
		} else if (e.type === 'discard-random') {
			const p = state.players[pi];
			for (let i = 0; i < (e.count || 1) && p.hand.length; i++) {
				const j = Math.floor(state.rng() * p.hand.length);
				const [c] = p.hand.splice(j, 1);
				toGraveyard(state, pi, c);
				emit(state, { type: 'discard', player: pi, card: c });
			}
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
			// paper glossary d10 (implementable subset; 10 entries kept)
			if (e.target === 'friendly-creatures') {
				for (const c of [...state.players[pi].board]) if (!isDead(c)) applyAdapt(state, c);
			} else {
				const t = chosenCreature() || (source && source.zone === 'board' && !isDead(source) ? source : null);
				if (t) applyAdapt(state, t);
			}
		} else if (e.type === 'buff-self') {
			// battlecry/choice self-pump; `per` scales by a count
			if (source && source.zone === 'board' && !isDead(source)) {
				let n = 1;
				if (e.per === 'other-friendly') n = state.players[pi].board.filter(c => c !== source && !isDead(c)).length;
				else if (e.per === 'hand-cards') n = state.players[pi].hand.length;
				else if (e.per === 'cards-played') n = state.players[pi].cardsPlayedThisTurn;
				if (n > 0) buffCreature(source, (e.attack || 0) * n, (e.health || 0) * n);
			}
		} else if (e.type === 'damage-self') {
			if (source && source.zone === 'board' && !isDead(source)) damageCreature(state, source, e.value, null);
		} else if (e.type === 'heal-full') {
			const t = chosenCreature();
			if (t && t.damage > 0) healCreature(t, t.damage);
		} else if (e.type === 'set-health') {
			// "Change a creature's Health to N" — keeps aura bonuses on top
			const list = e.target === 'all-creatures'
				? state.players.flatMap(pl => pl.board.filter(c => !isDead(c)))
				: [chosenCreature()].filter(Boolean);
			for (const t of list) {
				t.maxHealth = e.value + (t.auraHealth || 0);
				t.damage = 0;
				t.tempHealth = 0;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
		} else if (e.type === 'set-attack') {
			const t = chosenCreature();
			if (t) {
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
			const t = chosenCreature();
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
			}
		} else if (e.type === 'bounce') {
			// return creature(s) to the owner's hand as fresh copies
			const list = e.target === 'all-creatures'
				? state.players.flatMap(pl => pl.board.filter(c => !isDead(c)))
				: [chosenCreature()].filter(Boolean);
			for (const t of list) {
				const owner = state.players[t.controller];
				owner.board = owner.board.filter(c => c !== t);
				const def = state.cardsById[t.id];
				if (def && owner.hand.length < MAX_HAND) {
					const card = instantiate(def, t.controller);
					card.zone = 'hand';
					card.cost = Math.max(0, (def.cost || 0) + (e.costMod || 0));
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
			for (let i = 0; i < (e.count || 1); i++) {
				if (p.hand.length >= MAX_HAND) break;
				const idxs = [];
				for (let j = 0; j < p.deck.length; j++) {
					const def = state.cardsById[p.deck[j]];
					if (!def) continue;
					if (e.tribe && !(def.tribe || '').includes(e.tribe)) continue;
					if (e.cardType === 'spell' ? !isSpellType(def)
						: (e.cardType && def.type !== e.cardType)) continue;
					if (e.maxCost != null && (def.cost || 0) > e.maxCost) continue;
					idxs.push(j);
				}
				if (!idxs.length) break;
				const j = idxs[Math.floor(state.rng() * idxs.length)];
				const [id] = p.deck.splice(j, 1);
				const card = instantiate(state.cardsById[id], pi);
				card.zone = 'hand';
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			}
		} else if (e.type === 'grant-deathrattle') {
			const targets = e.target === 'creature' ? [chosenCreature()].filter(Boolean)
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
			else if (e.if.maxHealthSelf != null) ok = p.life <= e.if.maxHealthSelf;
			else if (e.if.targetFrozen) ok = !!(t && t.frozen);
			else if (e.if.targetFriendlyTribe) ok = !!(t && t.controller === pi && (t.tribe || '').includes(e.if.targetFriendlyTribe));
			else if (e.if.heroAttacked) ok = p.heroAttacksUsed > 0;
			else if (e.if.controlMinAttack != null) ok = p.board.some(c => !isDead(c) && c !== source && c.attack >= e.if.controlMinAttack);
			else if (e.if.holdingTribe) ok = p.hand.some(c => (c.tribe || '').includes(e.if.holdingTribe));
			else if (e.if.handEmpty) ok = p.hand.length === 0;
			else if (e.if.excavatedTwice) ok = (p.excavateCount || 0) >= 2;
			execEffects(state, pi, ok ? e.then : (e.else || []), target, source);
		} else if (e.type === 'damage-then') {
			// deal damage, then branch on whether the creature survived
			let v = e.value;
			if (source && (source.type === 'sorcery' || source.type === 'instant')) {
				v += staticValue(state.players[pi], 'spell-damage');
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
			for (const o of enemies) {
				const op = state.players[o];
				for (const sc of [...op.secrets]) {
					op.secrets = op.secrets.filter(x => x !== sc);
					toGraveyard(state, o, sc);
					emit(state, { type: 'secretRevealed', player: o, card: sc });
				}
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
			const p = state.players[pi];
			p.mana.max = Math.max(0, p.mana.max - (e.value || 1));
			p.mana.cur = Math.min(p.mana.cur, p.mana.max);
		} else if (e.type === 'set-hero-health') {
			const who = target?.type === 'hero' ? target.player : enemyHero();
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
				t.counters += n;
				buffCreature(t, n, n);
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
		} else if (e.type === 'gy-return') {
			// graveyard recursion: pick a fallen card back to hand or battlefield
			const p = state.players[pi];
			const pool = p.graveyard.filter(c => {
				const d = state.cardsById[c.id];
				return d && !d.token && (!e.cardType || d.type === e.cardType)
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
			const ids = [...new Set(p.deck.filter(id => {
				const d = state.cardsById[id];
				return d && (!e.cardType || d.type === e.cardType)
					&& (e.maxCost == null || (d.cost || 0) <= e.maxCost)
					&& (e.maxAttack == null || (d.attack || 0) <= e.maxAttack)
					&& (!e.tribe || (d.tribe || '').includes(e.tribe));
			}))];
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
				d.type !== 'land' && !d.token && !d.companion && !d.commander
				&& !(d.colors && d.colors.length));
			if (e.cardType === 'creature') pool = pool.filter(d => d.type === 'creature');
			else if (e.cardType === 'spell') pool = pool.filter(d => isSpellType(d));
			if (e.minAttack != null) pool = pool.filter(d => (d.attack || 0) >= e.minAttack);
			if (e.tribe) pool = pool.filter(d => (d.tribe || '').includes(e.tribe));
			if (e.cardClass === 'enemy') {
				const victim = enemyHero();
				const cls = victim != null && state.players[victim].heroClass;
				pool = cls ? pool.filter(d => d.cardClass === cls) : [];
			} else if (e.cardClass === 'other') {
				pool = pool.filter(d => d.cardClass && d.cardClass !== 'neutral'
					&& d.cardClass !== p.heroClass);
			}
			for (let i = 0; i < (e.count || 1); i++) {
				if (!pool.length || p.hand.length >= MAX_HAND) break;
				const card = instantiate(pool[Math.floor(state.rng() * pool.length)], pi);
				card.zone = 'hand';
				if (e.setCost != null) card.cost = e.setCost;
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			}
		} else if (e.type === 'give-enemy-random') {
			// Mulch: a random creature lands in an opponent's hand
			const victim = enemyHero();
			if (victim != null) {
				let pool = Object.values(state.cardsById).filter(d =>
					d.type !== 'land' && !d.token && !d.companion && !d.commander
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
			const pool = Object.values(state.cardsById).filter(d =>
				(d.cost || 0) === e.cost && d.type !== 'land' && !d.token
				&& !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (pool.length && p.hand.length < MAX_HAND) {
				const card = instantiate(pool[Math.floor(state.rng() * pool.length)], pi);
				card.zone = 'hand';
				if (e.setCost != null) card.cost = e.setCost;
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
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
			// hand-buffs: pump creatures still waiting in your hand
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature');
			const targets = e.all ? pool
				: pool.length ? [pool[Math.floor(state.rng() * pool.length)]] : [];
			for (const c of targets) {
				c.attack += e.attack || 0;
				c.maxHealth += e.health || 0;
			}
		} else if (e.type === 'enrich') {
			gainTokenCard(state, pi, 'treasure_token');
		} else if (e.type === 'cook') {
			gainTokenCard(state, pi, 'food_token');
		} else if (e.type === 'investigate') {
			// Investigate: make a Clue token (Sacrifice, pay 2: draw a card)
			gainTokenCard(state, pi, 'clue_token');
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
		} else if (e.type === 'discover') {
			// Discover: pick 1 of 3 random matches; Draft: pick 1 of 5
			const pool = Object.values(state.cardsById).filter(d => {
				if (d.type === 'land' || d.token || d.companion || d.commander) return false;
				if (d.colors && d.colors.length) return false;
				if (e.cardType === 'spell' ? !isSpellType(d) : (e.cardType && d.type !== e.cardType)) return false;
				if (e.tribe && !(d.tribe || '').includes(e.tribe)) return false;
				if (e.cost != null && (d.cost || 0) !== e.cost) return false;
				if (e.maxCost != null && (d.cost || 0) > e.maxCost) return false;
				if (e.minCost != null && (d.cost || 0) < e.minCost) return false;
				if (e.hasStatic && d.static?.type !== e.hasStatic) return false;
				if (e.requireKeyword && !(d.keywords || []).includes(e.requireKeyword)) return false;
				return true;
			});
			const ids = [];
			for (let i = 0; i < (e.pick || 3) && pool.length; i++) {
				ids.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0].id);
			}
			if (ids.length && !state.players[pi].eliminated) {
				state.pickQueue.push({ player: pi, ids, grant: e.grant || null, buff: e.buff || null });
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
			for (const o of enemies) {
				const op = state.players[o];
				for (let i = 0; i < (e.count || 1) && op.hand.length; i++) {
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
				const opt = e.options ? e.options[Math.floor(state.rng() * e.options.length)] : e;
				const tok = instantiate({
					id: 'token_' + opt.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: opt.name, type: 'creature', cost: 0, rarity: 'common',
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
			state.players[pi].heroTempAttack += e.value;
			emit(state, { type: 'heroBuffed', player: pi, amount: e.value });
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
			// "a random Dragon that costs 5 or more"
			const pool = Object.values(state.cardsById).filter(d =>
				d.type === 'creature' && (e.maxCost == null || (d.cost || 0) <= e.maxCost)
				&& (e.minCost == null || (d.cost || 0) >= e.minCost)
				&& (e.cost == null || (d.cost || 0) === e.cost)
				&& (e.tribe == null || (d.tribe || '').includes(e.tribe))
				&& !d.companion && !d.commander && !d.token && !(d.colors && d.colors.length));
			for (let i = 0; i < (e.count || 1) && pool.length; i++) {
				const def = pool[Math.floor(state.rng() * pool.length)];
				const owner = e.forEnemy && enemies.length
					? enemies[Math.floor(state.rng() * enemies.length)] : pi;
				const c = summon(state, owner, def);
				if (c && e.disguise) disguiseCreature(state, c);
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
				const m = e.match.toLowerCase();
				pool = defs.filter(d => d.name.toLowerCase().includes(m));
				if (!pool.length) pool = defs.filter(d => d.colors?.length);
			}
			if (!pool.length) pool = defs;
			for (let i = 0; i < (e.count || 1) && pool.length; i++) {
				if (p.hand.length >= MAX_HAND) break;
				const def = pool[Math.floor(state.rng() * pool.length)];
				const card = instantiate(def, pi);
				card.zone = 'hand';
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: e.color || null });
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

function runSpell(state, pi, card, target, choice) {
	execEffects(state, pi, liveEffectsOf(state, pi, card, choice), target, card);
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
const costTypeMatches = (card, t) => t === 'all' || (t === 'spell' ? isSpellType(card) : card.type === t);

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
	if (p.freeSpellsThisTurn && isSpellType(card)) c = 0;
	return Math.max(0, c);
}

// ---------- public actions ----------
export function canPlay(state, pi, card) {
	if (state.over || state.current !== pi) return false;
	if (availableMana(state.players[pi]) < effectiveCost(state, pi, card)) return false;
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
	return true;
}

export function playCard(state, pi, cardUid, target, choice, position) {
	const p = state.players[pi];
	// cards play from hand, the companion zone, or the command zone
	let card = null, take = null;
	const idx = p.hand.findIndex(c => c.uid === cardUid);
	if (idx >= 0) { card = p.hand[idx]; take = () => p.hand.splice(idx, 1); }
	else if (p.companion?.uid === cardUid) { card = p.companion; take = () => { p.companion = null; }; }
	else {
		const ci = p.command.findIndex(c => c.uid === cardUid);
		if (ci >= 0) { card = p.command[ci]; take = () => p.command.splice(ci, 1); }
	}
	if (!card) return false;
	if (!canPlay(state, pi, card)) return false;
	// Ward: targeting an enemy warded creature costs extra — unaffordable = illegal
	const ward = wardOf(state, pi, target);
	if (ward?.mana && availableMana(p) < effectiveCost(state, pi, card) + ward.mana) return false;

	take();
	if (ward) payWard(state, pi, target);
	if (card.xSpell) {
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
	}
	emit(state, { type: 'play', player: pi, card, mana: availableMana(p) });
	fireOngoing(state, pi, 'card-played', { played: card });

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
			emit(state, { type: 'dormant', player: pi, uid: card.uid, turns: card.dormantLeft });
		} else {
			fireOngoing(state, pi, 'summoned', { minion: card });
			runBattlecry(state, pi, card, target, choice);
			if (p.board.includes(card)) fireSecretsAll(state, pi, 'enemy-minion-played', { minion: card });
			if (p.board.includes(card) && !isDead(card)) fireOngoing(state, pi, 'creature-played', { minion: card });
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
	} else if (card.type === 'planeswalker') {
		card.zone = 'planeswalker';
		p.planeswalkers.push(card);
		emit(state, { type: 'walkerArrived', player: pi, card });
	} else {
		questTick(state, 'spell', pi);
		p.spellsPlayedThisTurn++;
		p.spellsPlayedTotal = (p.spellsPlayedTotal || 0) + 1; // Arcane Giant
		// Spellbender may retarget mid-cast by mutating ctx.target
		const ctx = { spell: card, countered: false, target };
		fireSecretsAll(state, pi, 'enemy-spell-cast', ctx);
		if (ctx.countered) emit(state, { type: 'countered', player: pi, name: card.name });
		else {
			state.exactKills = 0;
			runSpell(state, pi, card, ctx.target, choice);
			// Honorable Kill on spells: the spell's damage scored an exact lethal
			if (card.honorableKill && state.exactKills > 0) {
				emit(state, { type: 'honorableKill', player: pi });
				execEffects(state, pi, card.honorableKill, ctx.target, card);
			}
			// carry the spell so school-filtered triggers ("after you cast a
			// Frost spell") can match via the ongoing `if: { tribe: 'Frost' }` cond
			fireOngoing(state, pi, 'spell-played', { played: card });
			for (let s2 = 0; s2 < state.players.length; s2++) {
				fireOngoing(state, s2, 'any-spell-played', { spell: card, caster: pi }); // Lorewalker Cho
				if (s2 !== pi) fireOngoing(state, s2, 'enemy-spell-played', { spell: card, caster: pi }); // Burgly Bully
			}
		}
		toGraveyard(state, pi, card);
	}
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
	sweepDeaths(state);
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
	if (state.over || state.current !== pi || c.attack <= 0) return false;
	if (c.frozen) return false;
	if (c.dormantLeft > 0) return false; // still asleep
	if (has(c, KW.PACIFIST)) return false;
	const maxAttacks = has(c, KW.WINDFURY) ? 2 : 1;
	if (c.attacksUsed >= maxAttacks) return false;
	if (c.sick && !has(c, KW.CHARGE) && !has(c, KW.RUSH)) return false;
	return true;
}

// legal attack targets, honoring taunt and stealth; rush = creatures only while
// sick. Free-for-all: any opponent is attackable; a player's taunts only
// protect their own slice.
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
			if (!rushOnly) out.push({ type: 'hero', player: opp });
		}
	}
	return out;
}

export function attack(state, pi, attackerUid, target) {
	const attacker = state.players[pi].board.find(c => c.uid === attackerUid);
	if (!attacker || !canAttackWith(state, pi, attacker)) return false;
	const legal = attackTargets(state, pi, attacker);
	if (!legal.some(t => t.type === target.type && t.uid === target.uid && t.player === target.player)) return false;

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

	if (target.type === 'hero') {
		const dealt = damageHero(state, target.player, attacker.attack, pi, has(attacker, KW.PIERCING));
		if (has(attacker, KW.LIFESTEAL) && dealt > 0) healHero(state, pi, dealt);
		// Connect: combat damage to a player
		if (dealt > 0 && attacker.ongoing?.on === 'self-hit-player') {
			runSecretEffects(state, pi, attacker.ongoing.effects, { self: attacker });
		}
	} else if (target.type === 'walker') {
		// planeswalkers soak the hit with loyalty and never strike back
		const w = findWalker(state, target.uid);
		if (w) {
			damageWalker(state, w, attacker.attack);
			if (has(attacker, KW.LIFESTEAL)) healHero(state, pi, attacker.attack);
		}
	} else {
		const defender = findCreature(state, target.uid);
		if (!defender) return false;
		const defHpBefore = hp(defender);
		const aFirst = has(attacker, KW.FIRST_STRIKE) && !has(defender, KW.FIRST_STRIKE);
		const dFirst = has(defender, KW.FIRST_STRIKE) && !has(attacker, KW.FIRST_STRIKE);
		const strike = (src, dst) => {
			const dealt = damageCreature(state, dst, src.attack, src);
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
	}
	sweepDeaths(state);
	return true;
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
	const maxAttacks = p.weapon?.keywords.includes(KW.WINDFURY) ? 2 : 1;
	return p.heroAttacksUsed < maxAttacks;
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
	if (state.over || state.current !== pi) return false;
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
	if (entry.ongoing && !t.ongoing) t.ongoing = JSON.parse(JSON.stringify(entry.ongoing));
	if (entry.deathrattle) t.deathrattle = [...(t.deathrattle || []), ...entry.deathrattle];
	if (entry.ward && !t.ward) t.ward = { ...entry.ward };
}

function applyAdapt(state, t) {
	const roll = Math.floor(state.rng() * ADAPT_TABLE.length);
	applyRollEntry(state, t, ADAPT_TABLE[roll]);
	emit(state, { type: 'boosted', uid: t.uid, color: 'adapt', roll: roll + 1, label: ADAPT_TABLE[roll].label, attack: t.attack, hp: hp(t) });
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
	if (def && !p.eliminated && p.hand.length < MAX_HAND) {
		const card = instantiate(def, pend.player);
		card.zone = 'hand';
		if (pend.grant && !card.keywords.includes(pend.grant)) card.keywords.push(pend.grant);
		if (pend.buff) { // "Discover a Taunt minion. Give it +1/+1."
			card.attack += pend.buff.attack || 0;
			card.maxHealth += pend.buff.health || 0;
		}
		p.hand.push(card);
		emit(state, { type: 'conjure', player: pend.player, card, color: null });
	}
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
export function heroPowerSpec(state, pi, card, choice) {
	if (!card.power) return null;
	if (card.power.choices && choice == null) return null; // branch menu comes first
	return targetSpec(state, pi, { id: card.id, type: 'sorcery', effects: powerEffectsOf(card, choice) });
}

export function canUseHeroPower(state, pi, card, choice) {
	if (state.over || state.current !== pi) return false;
	const p = state.players[pi];
	if (!p.heroPowers.includes(card) || card.usedThisTurn) return false;
	if (availableMana(p) < card.power.cost) return false;
	const spec = heroPowerSpec(state, pi, card, choice);
	if (spec && spec.required && legalTargets(state, pi, spec).length === 0) return false;
	return true;
}

export function useHeroPower(state, pi, cardUid, target, choice) {
	const p = state.players[pi];
	const card = p.heroPowers.find(c => c.uid === cardUid);
	if (!card || !canUseHeroPower(state, pi, card, choice)) return false;
	const ward = wardOf(state, pi, target);
	if (ward?.mana && availableMana(p) < card.power.cost + ward.mana) return false;
	if (ward) payWard(state, pi, target);
	spendMana(p, card.power.cost);
	card.usedThisTurn = true;
	emit(state, { type: 'heroPowerUsed', player: pi, card, mana: availableMana(p) });
	execEffects(state, pi, powerEffectsOf(card, choice), target, card);
	fireOngoing(state, pi, 'hero-power-used', {}); // Inspire
	sweepDeaths(state);
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

	// end-of-turn triggers
	for (const c of [...p.board]) {
		if (c.id === 'ancient_treant') healHero(state, pi, 2);
		if (c.id === 'acidspitter_nest') {
			summon(state, pi, { ...state.cardsById['acidspitter'] });
			summon(state, pi, { ...state.cardsById['acidspitter'] });
		}
	}
	fireOngoing(state, pi, 'turn-end');
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
	// discard down to max
	while (p.hand.length > MAX_HAND) {
		const c = p.hand.pop();
		toGraveyard(state, pi, c);
		emit(state, { type: 'discard', player: pi, card: c });
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

	// switch: next alive player clockwise
	let next = state.current;
	do { next = (next + 1) % state.players.length; }
	while (state.players[next].eliminated && next !== state.current);
	state.current = next;
	state.turnNumber++;
	const np = state.players[state.current];
	np.diedThisTurn = 0;
	state.diedThisTurn = 0; // global "died this turn" (Volcanic Drake discounts)
	np.heroAttacksUsed = 0;
	np.landsPlayedThisTurn = 0;
	np.creaturesPlayedThisTurn = 0;
	np.cardsPlayedThisTurn = 0;
	np.drawsThisTurn = 0; // reset before the mandatory draw so it counts as the first
	np.spellsPlayedThisTurn = 0;
	// stale this-turn cost riders lapse; Millhouse's gift comes due
	np.costDiscounts = (np.costDiscounts || []).filter(d => !d.thisTurn);
	np.freeSpellsThisTurn = !!np.freeSpellsNextTurn;
	np.freeSpellsNextTurn = false;
	if (state.turnNumber > 1 && np.mana.max < MAX_BASE_MANA) np.mana.max++;
	np.mana.cur = np.mana.max;
	// overload: mana spent ahead of time stays locked this turn
	if (np.overloadPending) {
		np.mana.cur = Math.max(0, np.mana.cur - np.overloadPending);
		emit(state, { type: 'overloaded', player: state.current, amount: np.overloadPending });
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
	for (const l of [...np.lands, ...np.board.filter(c => c.type === 'location')]) {
		if (l.tapStone) l.tapStone = false;
		else l.tapped = false;
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
