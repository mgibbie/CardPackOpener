// engine/effects/handlers-hero.js — hero, armor, healing, weapon and equipment effects (housekeeping split, PR 40).
// Handler bodies are the verbatim registry migrations (PRs 13–39); this file
// only re-homes them. Imported for its registration side effects by index.js.
import { register, registerTrigger, ABORT } from './registry.js';
// engine/effects/registry.js — the effect-handler registry (docs/06, PR 13).
//
// Dispatch-order rule (behavior-preserving migration): inside execEffects'
// existing loop, the registry is checked FIRST; a miss falls through to the
// legacy 900-branch chain unchanged. The trigger-side switch needs no check
// of its own — its `default:` already delegates per-effect to execEffects,
// so retiring a switch case routes that type through the registry too (one
// handler serves both dispatchers, killing the twin-drift class).
//
// Handler signature: (ctx, e) where ctx = { state, pi, target, source,
// enemies, scaled }. `scaled` is execEffects' per-call value scaler (X-spells
// and valuePer live counts); handlers that don't need it ignore it.
//
// PILOT BATCH (docs/06 Phase 7): armor, draw, conjure-id, hero-shield,
// hero-immune-until-next, shuffle-ids-into-deck — moved from the chain
// verbatim, chain branches (and the switch's simpler `armor` twin, which
// silently lacked the all-heroes variant) deleted.
import {
	emit, instantiate, MAX_HAND, endTurn, gainTokenCard, execEffects, summon,
	installSecret, addCoin, damageHero, hp, availableMana, isDead,
	opponentsOf, freezeCreature, STARTING_LIFE, KW, MAX_BASE_MANA, CTHUN_BASE, MAX_HERO_POWERS, BOOST_TABLES,
	applyGift, schoolOf, recomputeAuras, sweepDeaths, counterStackEntry,
	findCreature, silenceCreature, isSpellType, heroAttackValue, fireOngoing,
	checkGameOver, questTick, disguiseCreature,
	spendMana, breakWeapon, resolveCombat, addCardToHand, syncCthun, degradeWeapon,
	runBattlecry, kindredActive, firePonder,
	applyRollEntry, targetSpec, legalTargets, runSpell,
	fireEmerge, staticValue, growBlubberBaron, queueAdapt, returnBlinked, has, MAX_SECRETS, destroyPermanent, findPermanent,
	EXCAVATE_TIERS, EXCAVATE_LEGENDARIES, ALL_AZERITE_LEGENDARIES,
} from '../../engine.js';
import { damageCreature, healHero } from '../damage.js';
import { gainArmor } from '../damage.js';
import { drawCards, toGraveyard, bouncePermanent } from '../zones.js';
import { runDeathrattle } from '../death.js';

register('armor', ({ state, pi }, e) => {
	if (e.target === 'all-heroes') { for (let s2 = 0; s2 < state.players.length; s2++) if (!state.players[s2].eliminated) gainArmor(state, s2, e.value); } // Armor Vendor
	else gainArmor(state, pi, e.value);
});


register('hero-shield', ({ state, pi }) => {
	state.players[pi].heroShield = true; // Curious Cumulus / Hardlight Protector
	emit(state, { type: 'heroShield', player: pi });
});


register('hero-immune-until-next', ({ state, pi }) => {
	state.players[pi].heroImmuneUntilTurn = state.turnNumber + state.players.length; // Doomsday Prepper
});


register('hero-immune', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].heroImmuneTurn = state.turnNumber;
});


register('set-spells-lifesteal', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].spellsLifestealThisTurn = true; // Omega Mind
});


register('upgrade-hero-power', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Justicar Trueheart: your Hero Power resolves twice from now on
			state.players[pi].heroPowerUpgraded = true;
});


register('set-heal-harm', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Auchenai Phantasm: this turn, your healing deals damage instead
			state.players[pi].healHarmThisTurn = true;
});


register('attack-own-hero', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Malefic Rook: this minion attacks your own hero
			if (source) damageHero(state, pi, source.attack || 0, pi);
});


register('cant-attack-heroes-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Charged Devilsaur: this creature can't attack heroes this turn
			if (source) source.noHeroAttackTurn = state.turnNumber;
});


register('heal-full', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = e.target === 'self' ? source : chosenCreature(); // Stoneskin Gargoyle: restore self
			if (t && t.damage > 0) healCreature(t, t.damage);
});


register('gain-armor-by-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Scrap Golem: gain Armor equal to this minion's Attack
			const amt = source ? (source.attack || 0) : 0;
			if (amt > 0) gainArmor(state, pi, amt);
});


register('gain-heal-bonus', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Cleansing Cleric: your healing effects restore N more Health this game
			state.players[pi].healBonusGame = (state.players[pi].healBonusGame || 0) + (e.value || 2);
});


register('attack-equals-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = chosenCreature();
			if (t) {
				t.attack = hp(t);
				t.tempAttack = 0;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
});


register('heal-lock-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Crater Gator: the enemy hero can't be healed until your next turn
			for (const o of enemies) state.players[o].healLockUntilTurn = state.turnNumber + state.players.length;
});


register('heal-hero-full', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Reno Jackson: restore your hero to full
			const p = state.players[pi];
			const full = p.maxLife ?? STARTING_LIFE;
			if (p.life < full) healHero(state, pi, full - p.life);
});


register('gain-weapon-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const w = state.players[pi].weapon;
			if (w && source) {
				source.attack += w.attack;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
});


register('double-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = e.target === 'self' ? source : chosenCreature(); // Faceless Lurker: this minion
			if (t) { t.maxHealth += hp(t); emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
});


register('double-self-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Soldier of the Bronze: double this minion's Health
			if (source && !isDead(source)) { source.maxHealth = (source.maxHealth || 0) * 2; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
});


register('heal-self-full', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Relentless Worg: restore the source to full Health
			if (source && !isDead(source)) { source.damage = 0; source.tempHealth = 0; emit(state, { type: 'heal', targetType: 'creature', uid: source.uid, amount: 0, hp: hp(source) }); }
});


register('heal-by-self-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Amber Priestess: restore Health equal to this minion's Health
			const v = source ? Math.max(0, source.maxHealth - source.damage) : (e.value || 4);
			execEffects(state, pi, [{ type: 'heal', value: v, target: 'any' }], target, source);
});


register('heal-per-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Cult Apothecary: restore N to your hero for each enemy creature
			const n = enemies.reduce((s, o) => s + state.players[o].board.filter(c => !isDead(c) && c.type !== 'location').length, 0);
			if (n > 0) healHero(state, pi, (e.value || 0) * n);
});


register('equip-self-as-weapon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Remornia (approx): after attacking, equip a weapon with this minion's Attack
			if (source) execEffects(state, pi, [{ type: 'equip', name: e.name || 'Remornia', attack: source.attack || e.attack || 5, durability: e.durability || 1 }], null, source);
});


register('armor-per-wisp', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Merry Moonkin: armor improved by Wisps you control
			const p = state.players[pi];
			const wisps = p.board.filter(c => (c.name || '') === 'Wisp' && !isDead(c)).length;
			execEffects(state, pi, [{ type: 'armor', value: (e.value || 1) + wisps }], null, source);
});


register('gain-armor-per', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Drywhisker Armorer: gain Armor scaled by a count
			let n = 0;
			if (e.per === 'enemy-creatures') for (const o of enemies) n += state.players[o].board.filter(c => !isDead(c) && c.type !== 'location').length;
			if (n > 0) gainArmor(state, pi, (e.value || 1) * n);
});


register('set-life-to-armor', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// High Priest Thekal: convert all but 1 Health into Armor
			const p = state.players[pi];
			const conv = Math.max(0, p.life - 1);
			p.life -= conv; gainArmor(state, pi, conv);
			emit(state, { type: 'damage', targetType: 'hero', player: pi, amount: 0, life: p.life });
});


register('hero-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// give your hero +N Attack this turn (Soulshard Lapidary).
			// valueFromDeaths: +1 per creature that died this turn (Gift of the Legion).
			const v = e.valueFromDeaths ? (state.diedThisTurn || 0) : (e.value || 0);
			state.players[pi].heroTempAttack += v;
			emit(state, { type: 'heroAttack', player: pi, attack: heroAttackValue(state.players[pi]) });
			if (v > 0) fireOngoing(state, pi, 'hero-gained-attack', {}); // Wickerclaw
});


register('gain-armor-no-trigger', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Razorfen Rockstar payoff: add armor WITHOUT re-firing armor-gained (avoids self-loop)
			const p = state.players[pi];
			p.armor += e.value || 2;
			p.armorGainedGame = (p.armorGainedGame || 0) + (e.value || 2);
			emit(state, { type: 'armor', player: pi, amount: e.value || 2, armor: p.armor });
});


register('set-hero-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const who = e.target === 'self' ? pi : (target?.type === 'hero' ? target.player : enemyHero()); // Majordomo: your own hero
			if (who != null) {
				state.players[who].life = e.value;
				emit(state, { type: 'heal', targetType: 'hero', player: who, amount: 0, life: e.value });
				checkGameOver(state);
			}
});


register('set-hero-power', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Vilefin Inquisitor: replace your Hero Power with a specific one
			const def = state.cardsById[e.powerId];
			if (def) { const power = instantiate(def, pi); power.zone = 'heropower'; power.usedThisTurn = false; state.players[pi].heroPowers = [power]; emit(state, { type: 'heroPowerGained', player: pi, card: power }); }
});


register('hero-attack-multi-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Chronikar: +N hero Attack this turn and the next `turns - 1` of your turns
			const p = state.players[pi];
			p.heroTempAttack = (p.heroTempAttack || 0) + (e.value || 3);
			p.heroAttackTurns = { value: e.value || 3, left: (e.turns || 3) - 1 };
			emit(state, { type: 'heroAttack', player: pi, attack: heroAttackValue(p) });
});


register('thalena-power', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Blood Doctor Thalena: a second, Corpse-costed Hero Power
			const p = state.players[pi];
			const def = state.cardsById['hp_blood_tap'];
			if (def) {
				const power = instantiate(def, pi); power.zone = 'heropower'; power.usedThisTurn = false;
				p.heroPowers.push(power);
				emit(state, { type: 'heroPowerGained', player: pi, card: power });
			}
} });


register('equip-per-cards-played', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Necrolord Draka: equip a weapon whose Attack grows with other cards played this turn
			const p = state.players[pi];
			const bonus = Math.min(e.cap ?? 10, Math.max(0, (p.cardsPlayedThisTurn || 1) - 1));
			execEffects(state, pi, [{ type: 'equip', name: e.name || 'Dagger', attack: (e.attack || 1) + bonus, durability: e.durability || 3 }], null, source);
} });


register('heal-adjacent-full', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Neferset Ritualist: restore the creatures flanking this one to full Health
			const board = state.players[pi].board;
			const idx = board.indexOf(source);
			for (const nb of [board[idx - 1], board[idx + 1]]) if (nb && !isDead(nb) && nb.damage > 0) { nb.damage = 0; emit(state, { type: 'heal', targetType: 'creature', uid: nb.uid, amount: 0, hp: hp(nb) }); }
} });


register('steal-enemy-weapon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Kobold Stickyfinger: take the opponent's weapon
			const o = enemies[0];
			if (o != null && state.players[o].weapon) {
				const w = state.players[o].weapon; state.players[o].weapon = null;
				if (state.players[pi].weapon) breakWeapon(state, pi, true);
				w.controller = pi; state.players[pi].weapon = w;
				emit(state, { type: 'weaponEquipped', player: pi, card: w });
			}
} });


register('heal-random-friendly', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lightwell: mend a random damaged friendly character
			const p = state.players[pi];
			const pool = p.board.filter(c => !isDead(c) && c.damage > 0).map(c => ({ c }));
			if (p.life < STARTING_LIFE) pool.push({ hero: true });
			if (pool.length) {
				const pick = pool[Math.floor(state.rng() * pool.length)];
				if (pick.hero) healHero(state, pi, e.value);
				else healCreature(pick.c, e.value);
			}
} });


register('equip-id', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// equip a specific weapon def by id (High King's Hammer, Atiesh...)
			const p = state.players[pi];
			const def = state.cardsById[e.id];
			if (def) {
				if (p.weapon) breakWeapon(state, pi, true);
				const w = instantiate(def, pi);
				if (e.id === 'high_kings_hammer' && p.hammerBonus) w.attack += p.hammerBonus;
				w.zone = 'weapon'; p.weapon = w;
				emit(state, { type: 'weaponEquip', player: pi, card: w });
				recomputeAuras(state);
			}
} });


register('heal-or-harm-target', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Alexstrasza the Life-Binder: choose a character — restore N to a friendly, deal N to an enemy
			const v = e.value || 8;
			const t = chosenCreature();
			if (t) { if (t.controller === pi) healCreature(t, v); else damageCreature(state, t, v, source); sweepDeaths(state); }
			else if (target?.type === 'hero') { if (target.player === pi) healHero(state, pi, v); else damageHero(state, target.player, v, pi); }
} });


register('upgrade-weapon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Upgrade!: buff an equipped weapon, or forge one from nothing
			const p = state.players[pi];
			if (p.weapon) {
				p.weapon.attack += e.attack || 1;
				p.weapon.durability += e.durability || 1;
				emit(state, { type: 'weaponDurability', player: pi, attack: p.weapon.attack, durability: p.weapon.durability });
			} else {
				execEffects(state, pi, [{ type: 'equip', ...e.elseEquip }], target, source);
			}
} });


register('degrade-enemy-weapon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('equip', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			const p = state.players[pi];
			if (p.eliminated) return;
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
} });


register('steal-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Herald of Shadows: steal Health from a minion (it loses Health, this gains it)
			let t = chosenCreature();
			if (e.random) { const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location')); t = pool.length ? pool[Math.floor(state.rng() * pool.length)] : null; } // K'ara, the Dark Star
			if (t && source && !isDead(source)) { const amt = Math.min(e.value || 2, hp(t) - 1 >= 0 ? (e.value || 2) : 0); t.maxHealth = Math.max(1, t.maxHealth - (e.value || 2)); t.damage = Math.min(t.damage, t.maxHealth); buffCreature(source, 0, e.value || 2); emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
} });


register('deploy-equip', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('equip-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Blingtron 3000: equip a random weapon (self, or each player)
			const pool = Object.values(state.cardsById).filter(d => d.type === 'weapon'
				&& !d.token && d.collectible !== false && !(d.colors && d.colors.length) && d.attack && d.durability);
			const who = e.eachPlayer ? state.players.map((_, i) => i).filter(i => !state.players[i].eliminated) : [pi];
			for (const tp of who) {
				if (!pool.length) break;
				const wd = pool[Math.floor(state.rng() * pool.length)];
				const bA = (tp === pi && e.selfBuff) ? (e.selfBuff.attack || 0) : 0; // Stadium Announcer: yours gets +1/+1
				const bD = (tp === pi && e.selfBuff) ? (e.selfBuff.durability || 0) : 0;
				execEffects(state, tp, [{ type: 'equip', name: wd.name, attack: wd.attack + bA, durability: e.setDurability != null ? e.setDurability : wd.durability + bD }], null, null);
			}
} });


register('heal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			let v = e.value === "X" ? (source?.xValue || 0) : e.valueFromHandSize ? state.players[pi].hand.length : boost(e.value); // Spice Bread Baker
			if (v > 0) v += state.players[pi].healBonusGame || 0; // Cleansing Cleric: your heals restore 2 more this game
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
			else if (e.target === 'friendly-characters') { mendHero(pi); for (const c of [...state.players[pi].board]) mend(c); } // Sunfury Clergy: hero + all friendly minions
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
} });


register('consume-shields', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
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
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('heal-all-full', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Nozari: restore both heroes to full Health
			for (let s2 = 0; s2 < state.players.length; s2++) { const pl = state.players[s2]; if (pl.eliminated) continue; if (pl.life < STARTING_LIFE) healHero(state, s2, STARTING_LIFE - pl.life); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('double-health-others', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Glitter Moth: double the Health of your OTHER creatures
			for (const c of state.players[pi].board) {
				if (c === source || isDead(c) || c.type === 'location') continue;
				c.maxHealth += hp(c); emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('equip-both-mics', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// MC Blingtron: both players equip a 1/2 Microphone (damage-amp on the opponent's approximated/omitted)
			execEffects(state, pi, [{ type: 'equip', name: e.name || 'Microphone', attack: e.attack || 1, durability: e.durability || 2 }], null, source);
			for (const o of enemies) { const op = state.players[o]; if (op.eliminated) continue; if (op.weapon) breakWeapon(state, o, true); const w = instantiate({ id: 'token_microphone', name: e.name || 'Microphone', type: 'weapon', cost: 0, rarity: 'common', description: `A ${e.attack || 1}/${e.durability || 2} weapon.`, attack: e.attack || 1, durability: e.durability || 2 }, o); w.zone = 'weapon'; op.weapon = w; emit(state, { type: 'weaponEquip', player: o, card: w }); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('bless-divine-shield', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Nozdormu, Bronze Aspect: give your minions Divine Shield; any that already had one gain +3/+3 instead
			for (const c of state.players[pi].board) {
				if (c === source || isDead(c) || c.type === 'location') continue;
				if (c.keywords.includes(KW.DIVINE_SHIELD) && c.shield) buffCreature(c, e.attack ?? 3, e.health ?? 3);
				else { if (!c.keywords.includes(KW.DIVINE_SHIELD)) c.keywords.push(KW.DIVINE_SHIELD); c.shield = true; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('proliferate', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// each creature you've strengthened grows +1/+1; each of your planeswalkers gains 1 loyalty
			const pp = state.players[pi];
			for (const c of [...pp.board]) {
				if (c.type === 'location' || isDead(c)) continue;
				if ((c.counters || 0) > 0) buffCreature(c, 1, 1);
			}
			for (const w of pp.planeswalkers) { w.loyalty = (w.loyalty || 0) + 1; emit(state, { type: 'walkerLoyalty', uid: w.uid, loyalty: w.loyalty }); }
			emit(state, { type: 'proliferate', player: pi });
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

