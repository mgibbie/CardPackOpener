// engine.js — Magepunk Battlecards rules engine (pure logic, no rendering).
// Ported from Magepunk66 Core/Modules/battlecards (Battlecards.lua, BattleEngine.lua,
// Combat.lua, Mana.lua, Hand.lua, Keyword.lua, CardEffect.lua) with the card-text
// mechanics those Lua files hadn't implemented yet scripted per card id.

export const KW = {
	TAUNT: 'taunt', CHARGE: 'charge', RUSH: 'rush', TRAMPLE: 'trample',
	FIRST_STRIKE: 'first_strike', WINDFURY: 'windfury', DEFENDER: 'defender',
	BATTLECRY: 'battlecry', DEATHRATTLE: 'deathrattle', LIFESTEAL: 'lifesteal',
	DIVINE_SHIELD: 'divine_shield', STEALTH: 'stealth', DEATHTOUCH: 'deathtouch',
	POISONOUS: 'poisonous',
};

export const MAX_BASE_MANA = 12;
export const MAX_HAND = 15;
export const MAX_BOARD = 7;
export const STARTING_LIFE = 40;

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
	return {
		uid: nextUid++,
		id: def.id,
		name: def.name,
		type: def.type,
		cost: def.cost || 0,
		rarity: def.rarity,
		description: def.description || '',
		attack: def.attack || 0,
		maxHealth: def.health || 0,
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
	};
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

// ---------- game setup ----------
export function createGame(cardsById, rng = Math.random, playerDeckIds = null) {
	const playable = Object.values(cardsById).filter(d => !UNPLAYABLE.has(d.id));
	const shuffle = ids => {
		for (let i = ids.length - 1; i > 0; i--) {
			const j = Math.floor(rng() * (i + 1));
			[ids[i], ids[j]] = [ids[j], ids[i]];
		}
		return ids;
	};
	const buildDeck = () => {
		const ids = [];
		for (const d of playable) { ids.push(d.id, d.id); } // 2 copies of each
		return shuffle(ids).slice(0, 60);
	};
	const playerDeck = playerDeckIds?.length ? shuffle([...playerDeckIds]) : null;

	const mkPlayer = () => ({
		life: STARTING_LIFE,
		armor: 0,
		deck: buildDeck(),
		hand: [],
		board: [],
		graveyard: [],
		mana: { cur: 1, max: 1, bonus: 0 },
		coins: 0,
		diedThisTurn: 0,
	});

	const p0 = mkPlayer();
	if (playerDeck) p0.deck = playerDeck;
	const state = {
		cardsById,
		rng,
		players: [p0, mkPlayer()],
		current: 0,     // 0 = human, 1 = AI; human goes first
		turnNumber: 1,
		over: false,
		winner: null,
		events: [],
	};

	// starting hands: 1st player 3 cards, 2nd player 4 cards + 1 coin
	drawCards(state, 0, 3);
	drawCards(state, 1, 4);
	state.players[1].coins = 1;
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
			// reshuffle graveyard ids into deck (per BattleEngine.startPhase)
			p.deck = p.graveyard.map(c => c.id);
			p.graveyard = [];
			for (let k = p.deck.length - 1; k > 0; k--) {
				const j = Math.floor(state.rng() * (k + 1));
				[p.deck[k], p.deck[j]] = [p.deck[j], p.deck[k]];
			}
			emit(state, { type: 'reshuffle', player: pi });
		}
		const id = p.deck.pop();
		if (!id) break;
		if (p.hand.length >= MAX_HAND) { emit(state, { type: 'burn', player: pi, cardId: id }); continue; }
		const card = instantiate(state.cardsById[id], pi);
		card.zone = 'hand';
		p.hand.push(card);
		emit(state, { type: 'draw', player: pi, card });
	}
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
	heal: { any: 'any' },
	buff: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	grant: { creature: 'creature', 'friendly-creature': 'friendly-creature' },
	destroy: { creature: 'creature', 'enemy-creature': 'enemy-creature' },
};

// Returns null (no target needed) or { targets, filter(card)?, required, why }
export function targetSpec(state, pi, card) {
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
	// generic: derive from the first effect that needs a chosen target
	for (const e of card.effects || []) {
		const kind = CHOSEN[e.type]?.[e.target];
		if (!kind) continue;
		let filter = null, why = {
			any: 'any target', creature: 'a creature',
			'enemy-creature': 'an enemy creature', 'friendly-creature': 'a friendly creature',
		}[kind];
		if (e.target === 'undamaged-creature') { filter = c => c.damage === 0; why = 'an undamaged creature'; }
		if (e.maxAttack != null) { filter = c => c.attack <= e.maxAttack; why = `a creature with ${e.maxAttack} or less Attack`; }
		return { targets: kind, filter, required: card.type !== 'creature', why };
	}
	return null;
}

export function legalTargets(state, pi, spec) {
	const out = [];
	const opp = 1 - pi;
	const pushCreatures = (side) => {
		for (const c of state.players[side].board) {
			if (side !== pi && c.stealthed) continue; // stealth: untargetable by opponent
			if (!spec.filter || spec.filter(c)) out.push({ type: 'creature', uid: c.uid, player: side });
		}
	};
	if (spec.targets === 'any') { pushCreatures(pi); pushCreatures(opp); out.push({ type: 'hero', player: pi }, { type: 'hero', player: opp }); }
	if (spec.targets === 'creature') { pushCreatures(pi); pushCreatures(opp); }
	if (spec.targets === 'enemy-creature') { pushCreatures(opp); }
	if (spec.targets === 'friendly-creature') { pushCreatures(pi); }
	return out;
}

function findCreature(state, uid) {
	for (const pi of [0, 1]) {
		const c = state.players[pi].board.find(c => c.uid === uid);
		if (c) return c;
	}
	return null;
}

// ---------- damage / healing ----------
function damageCreature(state, target, amount, source) {
	if (amount <= 0) return 0;
	if (target.shield) {
		target.shield = false;
		emit(state, { type: 'shieldPop', uid: target.uid });
		return 0;
	}
	target.damage += amount;
	if (source && (has(source, KW.DEATHTOUCH) || has(source, KW.POISONOUS))) target.poisoned = true;
	emit(state, { type: 'damage', targetType: 'creature', uid: target.uid, amount, hp: hp(target) });
	return amount;
}

function damageHero(state, pi, amount) {
	if (amount <= 0) return 0;
	const p = state.players[pi];
	const absorbed = Math.min(p.armor, amount);
	p.armor -= absorbed;
	const toLife = amount - absorbed;
	p.life = Math.max(0, p.life - toLife);
	emit(state, { type: 'damage', targetType: 'hero', player: pi, amount, life: p.life });
	return toLife;
}

function healHero(state, pi, amount) {
	const p = state.players[pi];
	p.life = Math.min(STARTING_LIFE, p.life + amount);
	emit(state, { type: 'heal', targetType: 'hero', player: pi, amount, life: p.life });
}

function isDead(c) {
	return c.poisoned || c.damage >= c.maxHealth;
}

function sweepDeaths(state) {
	for (const pi of [0, 1]) {
		const p = state.players[pi];
		const dead = p.board.filter(isDead);
		if (!dead.length) continue;
		p.board = p.board.filter(c => !isDead(c));
		for (const c of dead) {
			p.diedThisTurn++;
			emit(state, { type: 'death', uid: c.uid, player: pi, name: c.name });
			if (c.marked) drawCards(state, c.markedBy, 2);
			runDeathrattle(state, pi, c);
			toGraveyard(state, pi, c);
		}
	}
	// deathrattles can kill more
	if ([0, 1].some(pi => state.players[pi].board.some(isDead))) sweepDeaths(state);
	checkGameOver(state);
}

function checkGameOver(state) {
	if (state.over) return;
	const [a, b] = state.players.map(p => p.life <= 0);
	if (a || b) {
		state.over = true;
		state.winner = a && b ? null : (a ? 1 : 0);
		emit(state, { type: 'gameOver', winner: state.winner });
	}
}

// ---------- summoning ----------
function summon(state, pi, tokenDef) {
	const p = state.players[pi];
	if (p.board.length >= MAX_BOARD) return null;
	const c = instantiate(tokenDef, pi);
	c.zone = 'board';
	p.board.push(c);
	emit(state, { type: 'summon', player: pi, card: c });
	return c;
}

// ---------- scripted card mechanics (text the Lua engine didn't implement) ----------
function runBattlecry(state, pi, card, target) {
	const p = state.players[pi];
	// data-driven battlecries (imported sets); legacy ids stay hand-scripted below
	if (card.effects && !LEGACY_SCRIPTED.has(card.id)) {
		execEffects(state, pi, card.effects, target);
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
	if (card.deathrattle) execEffects(state, pi, card.deathrattle, null);
	switch (card.id) {
		case 'forest_sprite': summon(state, pi, TOKENS.seedling); break;
		case 'acidspitter': {
			const opp = 1 - pi;
			const targets = [...state.players[opp].board.filter(c => !isDead(c)), 'hero'];
			const pick = targets[Math.floor(state.rng() * targets.length)];
			if (pick === 'hero') damageHero(state, opp, 1);
			else damageCreature(state, pick, 1, null);
			break;
		}
		case 'running_gunner': {
			const opp = 1 - pi;
			for (const c of state.players[opp].board) damageCreature(state, c, 1, null);
			damageHero(state, opp, 1);
			break;
		}
	}
}

// generic effect executor shared by spells, battlecries, and deathrattles.
// `target` is the player's chosen target (or null); AoE targets need no choice.
function execEffects(state, pi, effects, target) {
	const opp = 1 - pi;
	const chosenCreature = () => target?.type === 'creature' ? findCreature(state, target.uid) : null;
	const healCreature = (c, v) => {
		c.damage = Math.max(0, c.damage - v);
		emit(state, { type: 'heal', targetType: 'creature', uid: c.uid, amount: v, hp: hp(c) });
	};
	const buffCreature = (c, atk, hpv) => {
		c.attack += atk;
		c.maxHealth += hpv;
		emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
	};
	for (const e of effects || []) {
		if (e.type === 'damage') {
			const v = e.value;
			switch (e.target) {
				case 'enemy-hero': damageHero(state, opp, v); break;
				case 'own-hero': damageHero(state, pi, v); break;
				case 'enemy-creatures': for (const c of [...state.players[opp].board]) damageCreature(state, c, v, null); break;
				case 'all-creatures': for (const s of [0, 1]) for (const c of [...state.players[s].board]) damageCreature(state, c, v, null); break;
				case 'enemies':
					for (const c of [...state.players[opp].board]) damageCreature(state, c, v, null);
					damageHero(state, opp, v);
					break;
				case 'everyone':
					for (const s of [0, 1]) {
						for (const c of [...state.players[s].board]) damageCreature(state, c, v, null);
						damageHero(state, s, v);
					}
					break;
				default: { // chosen target
					const t = chosenCreature();
					if (t) damageCreature(state, t, v, null);
					else if (target?.type === 'hero') damageHero(state, target.player, v);
					else if (e.target === 'any') damageHero(state, opp, v); // fallback: face
				}
			}
		} else if (e.type === 'heal') {
			const v = e.value;
			if (e.target === 'self') healHero(state, pi, v);
			else if (e.target === 'all-creatures') { for (const s of [0, 1]) for (const c of state.players[s].board) healCreature(c, v); }
			else if (e.target === 'friendly-all') { healHero(state, pi, v); for (const c of state.players[pi].board) healCreature(c, v); }
			else {
				const t = chosenCreature();
				if (t) healCreature(t, v);
				else if (target?.type === 'hero') healHero(state, target.player, v);
				else healHero(state, pi, v);
			}
		} else if (e.type === 'draw') {
			drawCards(state, pi, e.value);
		} else if (e.type === 'buff') {
			if (e.target === 'friendly-creatures') for (const c of state.players[pi].board) buffCreature(c, e.attack, e.health);
			else { const t = chosenCreature(); if (t) buffCreature(t, e.attack, e.health); }
		} else if (e.type === 'grant') {
			const grantTo = e.target === 'friendly-creatures' ? state.players[pi].board
				: [chosenCreature()].filter(Boolean);
			for (const c of grantTo) {
				if (!c.keywords.includes(e.keyword)) c.keywords.push(e.keyword);
				if (e.keyword === KW.DIVINE_SHIELD) c.shield = true;
				if (e.keyword === KW.STEALTH) c.stealthed = true;
			}
		} else if (e.type === 'destroy') {
			const t = chosenCreature();
			if (t && (e.maxAttack == null || t.attack <= e.maxAttack)) {
				t.damage = t.maxHealth;
				t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
			}
		} else if (e.type === 'summon') {
			for (let i = 0; i < (e.count || 1); i++) {
				summon(state, pi, {
					id: 'token_' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: e.name, type: 'creature', cost: 0, rarity: 'common',
					description: `A ${e.attack}/${e.health} token.`,
					attack: e.attack, health: e.health,
					keywords: e.keywords || [],
				});
			}
		}
	}
}

function runSpell(state, pi, card, target) {
	execEffects(state, pi, card.effects, target);
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

// ---------- public actions ----------
export function canPlay(state, pi, card) {
	if (state.over || state.current !== pi) return false;
	if (availableMana(state.players[pi]) < card.cost) return false;
	if (card.type === 'creature' && state.players[pi].board.length >= MAX_BOARD) return false;
	const spec = targetSpec(state, pi, card);
	if (spec && spec.required && legalTargets(state, pi, spec).length === 0) return false;
	return true;
}

export function playCard(state, pi, cardUid, target) {
	const p = state.players[pi];
	const idx = p.hand.findIndex(c => c.uid === cardUid);
	if (idx < 0) return false;
	const card = p.hand[idx];
	if (!canPlay(state, pi, card)) return false;

	p.hand.splice(idx, 1);
	spendMana(p, card.cost);
	emit(state, { type: 'play', player: pi, card, mana: availableMana(p) });

	if (card.type === 'creature') {
		card.zone = 'board';
		card.sick = true;
		p.board.push(card);
		runBattlecry(state, pi, card, target);
	} else {
		runSpell(state, pi, card, target);
		toGraveyard(state, pi, card);
	}
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
	if (has(c, KW.DEFENDER)) return false;
	const maxAttacks = has(c, KW.WINDFURY) ? 2 : 1;
	if (c.attacksUsed >= maxAttacks) return false;
	if (c.sick && !has(c, KW.CHARGE) && !has(c, KW.RUSH)) return false;
	return true;
}

// legal attack targets, honoring taunt and stealth; rush = creatures only while sick
export function attackTargets(state, pi, attacker) {
	const opp = 1 - pi;
	const board = state.players[opp].board.filter(c => !c.stealthed);
	const taunts = board.filter(c => has(c, KW.TAUNT));
	const rushOnly = attacker.sick && has(attacker, KW.RUSH) && !has(attacker, KW.CHARGE);
	const creatures = (taunts.length ? taunts : board).map(c => ({ type: 'creature', uid: c.uid, player: opp }));
	if (taunts.length || rushOnly) return creatures;
	return [...creatures, { type: 'hero', player: opp }];
}

export function attack(state, pi, attackerUid, target) {
	const attacker = state.players[pi].board.find(c => c.uid === attackerUid);
	if (!attacker || !canAttackWith(state, pi, attacker)) return false;
	const legal = attackTargets(state, pi, attacker);
	if (!legal.some(t => t.type === target.type && t.uid === target.uid && t.player === target.player)) return false;

	attacker.attacksUsed++;
	attacker.stealthed = false;
	emit(state, { type: 'attack', attackerUid, target });

	if (target.type === 'hero') {
		const dealt = damageHero(state, target.player, attacker.attack);
		if (has(attacker, KW.LIFESTEAL) && dealt > 0) healHero(state, pi, dealt);
	} else {
		const defender = findCreature(state, target.uid);
		if (!defender) return false;
		const defHpBefore = hp(defender);
		const aFirst = has(attacker, KW.FIRST_STRIKE) && !has(defender, KW.FIRST_STRIKE);
		const dFirst = has(defender, KW.FIRST_STRIKE) && !has(attacker, KW.FIRST_STRIKE);
		const strike = (src, dst) => {
			const dealt = damageCreature(state, dst, src.attack, src);
			if (has(src, KW.LIFESTEAL) && dealt > 0) healHero(state, src.controller, dealt);
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
		// trample: excess damage (attack beyond the defender's remaining health) hits the hero
		if (has(attacker, KW.TRAMPLE) && isDead(defender)) {
			const excess = attacker.attack - defHpBefore;
			if (excess > 0) damageHero(state, target.player, excess);
		}
	}
	sweepDeaths(state);
	return true;
}

// end-of-turn triggers, discard to max, pass turn, start next
export function endTurn(state) {
	if (state.over) return;
	const pi = state.current;
	const p = state.players[pi];

	// end-of-turn triggers
	for (const c of [...p.board]) {
		if (c.id === 'ancient_treant') healHero(state, pi, 2);
		if (c.id === 'acidspitter_nest') {
			summon(state, pi, { ...state.cardsById['acidspitter'] });
			summon(state, pi, { ...state.cardsById['acidspitter'] });
		}
	}
	// discard down to max
	while (p.hand.length > MAX_HAND) {
		const c = p.hand.pop();
		toGraveyard(state, pi, c);
		emit(state, { type: 'discard', player: pi, card: c });
	}
	p.mana.bonus = 0;
	sweepDeaths(state);
	if (state.over) return;

	// switch
	state.current = 1 - state.current;
	state.turnNumber++;
	const np = state.players[state.current];
	np.diedThisTurn = 0;
	if (state.turnNumber > 1 && np.mana.max < MAX_BASE_MANA) np.mana.max++;
	np.mana.cur = np.mana.max;
	for (const c of np.board) { c.sick = false; c.attacksUsed = 0; }
	emit(state, { type: 'turnStart', player: state.current, turnNumber: state.turnNumber });
	drawCards(state, state.current, 1);
}

// drain event queue (renderer calls this each frame/action)
export function takeEvents(state) {
	const evs = state.events;
	state.events = [];
	return evs;
}
