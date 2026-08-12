// engine/damage.js -- the damage module (docs/engine-hardening/05, PR 11).
//
// damageCreature / damageHero / gainArmor / healHero (+ their private
// warptoothCheck helper) moved VERBATIM from engine.js. This move is rated
// HIGH risk in docs/09: the four functions carry ~20 rider families, and
// damageHero has TWO parallel paths (pierce and armor) that must stay in
// lockstep -- every rider is pinned by tests/characterization/
// damage_riders_test.mjs, written and green BEFORE the move.
//
// Rider hooks are direct calls back into engine.js (the established
// call-time-safe cycle). No behavior changes in this PR.
import {
	emit, hp, has, isDead, isSpellType, schoolOf, staticValue, recomputeAuras,
	fireOngoing, fireSecrets, runSecretEffects, questTick, summon, opponentsOf,
	heroAttackValue, KW, STARTING_LIFE, spendCorpses, breakWeapon, execEffects,
} from '../engine.js';

export function damageCreature(state, target, amount, source) {
	if (target.type === 'location') return 0; // locations only wear out by tapping
	if (target.dormantLeft > 0) return 0;     // dormant: immune while asleep
	if (amount <= 0) return 0;
	// Goldrinn / Bralma Searstone: friendly minions of a tribe hit harder
	if (source && source.type === 'creature' && source.controller != null && state.players[source.controller]) {
		for (const b of state.players[source.controller].board) {
			const tb = b.tribeDamageBoost;
			if (tb && !isDead(b) && (source.tribe || '').includes(tb.tribe)) amount = tb.double ? amount * 2 : amount + (tb.amount || 0);
		}
	}
	// Talgath: undamaged enemy minions take double damage
	if (target.damage === 0 && target.controller != null) {
		for (let ti = 0; ti < state.players.length; ti++) {
			if (ti === target.controller) continue;
			if (state.players[ti].board.some(b => b.undamagedFoesDouble && !isDead(b))) { amount *= 2; break; }
		}
	}
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
	if (target._attackingImmune) return 0; // Stalwart Avenger: Immune while attacking (only during its own swing)
	if (target.immuneTurn === state.turnNumber) return 0; // temporary Immune (Bestial Wrath / Stablemaster)
	if (target.immuneToSchool && source && isSpellType(source) && schoolOf(source) === target.immuneToSchool) return 0; // Fyrakk: immune to Fire spells
	if (target.illusion) { target.illusion = false; target.shield = false; target.damage = target.maxHealth; emit(state, { type: 'illusionShattered', uid: target.uid }); return 0; } // Bloodthistle Illusionist
	// Colaque: immune while it controls its Shell appendage
	if (target.immuneWhile && state.players[target.controller].board.some(c =>
		!isDead(c) && c.name === target.immuneWhile)) return 0;
	if (target.shield) {
		target.shield = false;
		if (target.shieldLossRecruits) { const sp2 = state.players[target.controller]; sp2.recruitHealthBonus = (sp2.recruitHealthBonus || 0) + 1; for (const rc of sp2.board) if (rc.name === 'Silver Hand Recruit' && !isDead(rc)) { rc.maxHealth += 1; } } // Resilient Savior
		emit(state, { type: 'shieldPop', uid: target.uid });
		fireOngoing(state, target.controller, 'friendly-divine-shield-lost', {}); // Bolvar, Fireblood
		if (state.players[target.controller].avengingArmaments && !isDead(target)) { target.attack += 2; target.maxHealth += 1; emit(state, { type: 'buff', uid: target.uid, attack: target.attack, hp: hp(target) }); } // Avenging Armaments (Duels): losing Divine Shield -> +2/+1
		return 0;
	}
	if (target.frozen && amount > 0) { for (let fsi = 0; fsi < state.players.length; fsi++) if (fsi !== target.controller && state.players[fsi].freezeSolid) { amount += 2; break; } } // Freeze Solid (Duels): +2 damage to Frozen enemies
	if (amount > 2 && state.players[target.controller].board.some(c => c.damageCapAura && !isDead(c))) amount = 2; // Amitus, the Peacekeeper: your minions can't take more than 2 damage at a time
	const _hpBefore = hp(target);
	target.damage += amount;
	if (target.diesToAnyDamage && amount > 0) target.damage = target.maxHealth; // Reverberations: any damage is lethal to the copy
	// spell Overkill (Baited Arrow / Totemic Smash / Blast Wave): a killing hit
	// with excess damage on your turn fires the spell's overkill block once.
	// Attack-combat overkill is handled at the attack sites — spells only here.
	if (source && source.overkill && isSpellType(source) && state.current === source.controller
		&& amount > _hpBefore && isDead(target)) {
		const fx = source.overkill;
		source.overkill = null; // once per cast, even on AoE
		execEffects(state, source.controller, JSON.parse(JSON.stringify(fx)), null, source);
	}
	if (source && source.type === 'creature') target._lastDamagerUid = source.uid; // Faceless Replicator (uid, not ref — refs duplicate on snapshot round-trip)
	warptoothCheck(state, target.controller);
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
	// Urchin Spines: your spells this turn are Poisonous (flag scoped to the
	// resolving spell in runSpell — damage branches don't all thread source)
	if (state._spellPoisonActive && amount > 0) target.poisoned = true;
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
	for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'creature-damaged', { damaged: target, amount });
	fireOngoing(state, target.controller, 'friendly-creature-damaged', { damaged: target, amount });
	return amount;
}

// `src` is the player index responsible for the damage (for reflect secrets);
// `pierce` skips armor entirely (paper Piercing keyword)
export function damageHero(state, pi, amount, src = null, pierce = false) {
	if (amount <= 0) return 0;
	const p = state.players[pi];
	if (p.weapon?.doubleHeroDamage) amount *= 2; // Cursed Blade: double all damage dealt to your hero
	if (p.heroDamageCapUntilTurn != null && state.turnNumber < p.heroDamageCapUntilTurn && amount > (p.heroDamageCap || 1)) amount = p.heroDamageCap || 1; // Solid Alibi: only 1 damage at a time until your next turn
	if (p.weapon?.absorbHeroDamageToWeapon && amount > 0) { // Bulwark of Azzinoth: the weapon loses 1 Durability instead
		p.weapon.durability -= 1;
		emit(state, { type: 'weaponDurability', player: pi, attack: p.weapon.attack, durability: p.weapon.durability });
		if (p.weapon.durability <= 0) breakWeapon(state, pi, false);
		return 0;
	}
	// Arisen Onyxia: on your turn, Health you would lose becomes max Health instead
	if (state.current === pi && p.board.some(c => c.healToMaxHealth && !isDead(c))) {
		p.maxLife = (p.maxLife ?? STARTING_LIFE) + amount;
		p.life += amount;
		emit(state, { type: 'heal', targetType: 'hero', player: pi, amount, life: p.life });
		return 0;
	}
	if (p.heroImmuneTurn === state.turnNumber) return 0; // "can't take damage this turn"
	if (p.heroImmuneUntilTurn != null && state.turnNumber < p.heroImmuneUntilTurn) return 0; // Doomsday Prepper: Immune until your next turn
	if ((p.weapon && p.weapon.heroImmuneAura) || p.board.some(c => c.heroImmuneAura && !isDead(c))) return 0; // Mal'Ganis / Aegis of Death: your hero is Immune
	if (p.heroShield) { p.heroShield = false; emit(state, { type: 'heroShieldPop', player: pi }); return 0; } // Curious Cumulus: hero Divine Shield
	if (p.primordialBulwark && amount >= (p.life + (p.armor || 0))) { // Primordial Bulwark: block lethal once, blast target opponent
		p.primordialBulwark = false;
		emit(state, { type: 'heroShieldPop', player: pi });
		for (const o of opponentsOf(state, pi)) { damageHero(state, o, 20, pi); break; }
		return 0;
	}
	// Bolf Ramshield: the hero's damage is taken by this creature instead
	const bolf = p.board.find(c => c.redirectHeroDamage && !isDead(c));
	if (bolf) { damageCreature(state, bolf, amount, null); return 0; }
	// static hero-damage reduction (Lucky Horseshoe)
	amount = Math.max(0, amount - staticValue(p, 'reduce-hero-damage'));
	if (p.heavyArmor && amount > 1) amount = 1; // Heavy Armor (Duels): you can only take 1 damage at a time
	if (amount <= 0) return 0;
	// Felstring Harp: on your turn, damage your hero would take becomes healing instead (weapon loses 1 Durability)
	if (state.current === pi && p.weapon?.healInsteadOnOwnTurn) {
		p.weapon.durability -= 1;
		emit(state, { type: 'weaponDurability', player: pi, attack: p.weapon.attack, durability: p.weapon.durability });
		if (p.weapon.durability <= 0) breakWeapon(state, pi, false);
		healHero(state, pi, p.weapon.healInsteadOnOwnTurn);
		return 0;
	}
	if (pierce) {
		// bypass armor: fatal check + damage go straight to life
		if (amount >= p.life) {
			const ctx = { fatal: true, prevented: false, src };
			fireSecrets(state, pi, 'hero-takes-damage', ctx);
			if (ctx.prevented) return 0;
		}
		p.life = Math.max(0, p.life - amount);
		p.heroDamagedThisTurn = true; p.heroHealthChangedThisTurn = true; p.heroDamageTakenThisTurn = (p.heroDamageTakenThisTurn || 0) + amount; // Duskbat / Nethersoul Buster / Brittlebone Destroyer
		if (state.current === pi) p.ownTurnsDamage = (p.ownTurnsDamage || 0) + amount; // Party Planner Vona
		if (state.current === pi) p.heroDmgInstancesOwnTurn = (p.heroDmgInstancesOwnTurn || 0) + 1; // Sauna Regular: times your hero took damage on your turn
		for (const o of opponentsOf(state, pi)) state.players[o].oppLifeLossInstancesThisTurn = (state.players[o].oppLifeLossInstancesThisTurn || 0) + 1; // Devious Coyote: times an opponent lost life this turn
		if (p.life <= 0 && p.heroDeathrattleCorpses && (p.corpses || 0) > 0) { const spend = Math.min(20, p.corpses); spendCorpses(state, pi, spend); p.life = spend; p.heroDeathrattleCorpses = false; emit(state, { type: 'heroDeathrattle', player: pi, life: p.life }); } // Husk, Eternal Reaper
		emit(state, { type: 'damage', targetType: 'hero', player: pi, amount, life: p.life });
		fireSecrets(state, pi, 'hero-takes-damage', { fatal: false, amount, src });
		questTick(state, 'damage-taken', pi, amount);
		if (state.current === pi) fireOngoing(state, pi, 'own-hero-damaged', {});
		// Lumia: any hero that takes damage becomes Immune for the rest of the turn
		if (state.players.some(pl => pl.board.some(c => c.heroImmuneOnDamage && !isDead(c)))) p.heroImmuneTurn = state.turnNumber;
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
	if (toLife > 0 && state.current === pi) p.ownTurnsDamage = (p.ownTurnsDamage || 0) + toLife; // Party Planner Vona
	if (toLife > 0 && state.current === pi) p.heroDmgInstancesOwnTurn = (p.heroDmgInstancesOwnTurn || 0) + 1; // Sauna Regular
	if (toLife > 0) for (const o of opponentsOf(state, pi)) state.players[o].oppLifeLossInstancesThisTurn = (state.players[o].oppLifeLossInstancesThisTurn || 0) + 1; // Devious Coyote
	if (toLife > 0) warptoothCheck(state, pi);
	if (p.life <= 0 && p.heroDeathrattleCorpses && (p.corpses || 0) > 0) { const spend = Math.min(20, p.corpses); spendCorpses(state, pi, spend); p.life = spend; p.heroDeathrattleCorpses = false; emit(state, { type: 'heroDeathrattle', player: pi, life: p.life }); } // Husk, Eternal Reaper
	if (toLife > 0) { p.heroDamagedThisTurn = true; p.heroHealthChangedThisTurn = true; p.heroDamageTakenThisTurn = (p.heroDamageTakenThisTurn || 0) + toLife; } // Duskbat / Nethersoul Buster / Brittlebone Destroyer
	if (toLife > 0 && src != null && src !== pi && state.players[src]) state.players[src].damageToEnemyHeroThisTurn = (state.players[src].damageToEnemyHeroThisTurn || 0) + toLife; // Crooked Cook
	emit(state, { type: 'damage', targetType: 'hero', player: pi, amount, life: p.life });
	if (toLife > 0) fireSecrets(state, pi, 'hero-takes-damage', { fatal: false, amount: toLife, src });
	if (toLife > 0) questTick(state, 'damage-taken', pi, toLife);
	if (toLife > 0 && state.current === pi) fireOngoing(state, pi, 'own-hero-damaged', {});
	// Lumia: any hero that takes damage becomes Immune for the rest of the turn
	if (toLife > 0 && state.players.some(pl => pl.board.some(c => c.heroImmuneOnDamage && !isDead(c)))) p.heroImmuneTurn = state.turnNumber;
	return toLife;
}

export function gainArmor(state, pi, amount) {
	state.players[pi].armor += amount;
	if (amount !== 0) state.players[pi].armorChangedThisTurn = true; // Stoneskin Armorer
	if (amount > 0 && state.players[pi].odynActive) { state.players[pi].heroTempAttack += amount; emit(state, { type: 'heroAttack', player: pi, attack: heroAttackValue(state, state.players[pi]) }); } // Odyn: armor also grants Attack this turn
	if (amount > 0) state.players[pi].armorGainedGame = (state.players[pi].armorGainedGame || 0) + amount; // Captain Galvangar
	emit(state, { type: 'armor', player: pi, amount, armor: state.players[pi].armor });
	fireOngoing(state, pi, 'armor-gained', {}); // Siege Engine
}

// Warptooth: three friendly characters damaged on your turn summons him from hand or deck
function warptoothCheck(state, pi) {
	const p = state.players[pi];
	if (state.current !== pi || p.eliminated) return;
	p.ownCharsDamagedThisTurn = (p.ownCharsDamagedThisTurn || 0) + 1;
	if (p.ownCharsDamagedThisTurn !== 3) return;
	const hi = p.hand.findIndex(c => c.id === 'warptooth');
	if (hi >= 0) {
		const [c] = p.hand.splice(hi, 1);
		c.zone = 'board'; p.board.push(c);
		emit(state, { type: 'summon', player: pi, card: c });
		recomputeAuras(state);
	} else {
		const di = p.deck.indexOf('warptooth');
		if (di >= 0) { p.deck.splice(di, 1); summon(state, pi, state.cardsById['warptooth']); }
	}
}

export function healHero(state, pi, amount) {
	const p = state.players[pi];
	if (p.healLockUntilTurn != null && state.turnNumber < p.healLockUntilTurn) return; // Crater Gator: can't be healed
	const before = p.life;
	// MTG-style: starting life is not a ceiling — a hero can be healed above it.
	p.life += amount;
	emit(state, { type: 'heal', targetType: 'hero', player: pi, amount, life: p.life });
	// Alexstrasza, Guardian of Life: reaching full Health unleashes 15 damage
	if (p.alexPayoff && p.life >= (p.maxLife ?? STARTING_LIFE)) {
		p.alexPayoff = false;
		for (const o of opponentsOf(state, pi)) { damageHero(state, o, 15, pi); break; }
	}
	// Lightwarden-style triggers fire only when healing actually landed
	if (p.life > before) {
		p.heroHealthChangedThisTurn = true; // Brittlebone Destroyer
		p.healedThisTurn = true; // Cleric of An'she
		p.healedAmountThisTurn = (p.healedAmountThisTurn || 0) + (p.life - before); // Xyrella
		p.healedGame = (p.healedGame || 0) + (p.life - before); // Zandalari Templar
		for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'healed', { healedHero: pi, amount: p.life - before });
	}
}
