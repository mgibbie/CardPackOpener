// engine/effects/handlers-buffs.js — buffs, grants, stat-setting and keyword effects (housekeeping split, PR 40).
// Handler bodies are the verbatim registry migrations (PRs 13–39); this file
// only re-homes them. Imported for its registration side effects by index.js.
import { register, registerTrigger, ABORT } from './registry.js';
import { spendCorpses } from '../../engine.js';
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

register('grant-battlecries-twice', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Deepminer Brann: your Battlecries trigger twice for the rest of the game
			state.players[pi].battlecriesTwice = true;
});


register('grant-hero-elusive', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Spellward Jeweler: your hero can't be targeted until your next turn
			state.players[pi].heroElusiveUntil = state.turnNumber + 2;
});


register('double-deck-minion-stats', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Lor'themar Theron: double the stats of all minions in your deck (applied as they're drawn)
			state.players[pi].deckDoubleStats = true;
});


register('grant-first-card-free', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Bonelord Frostwhisper: for the rest of the game, your first card each turn costs (0)
			state.players[pi].firstCardFreeEachTurn = true;
});


register('grant-static', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = chosenCreature();
			if (t) t.static = { ...e.static };
});


register('temp-immune', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = chosenCreature();
			if (t) t.immuneTurn = state.turnNumber;
});


register('grant-medic', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = chosenCreature();
			if (t) t.medic = (t.medic || 0) + e.value;
});


register('grant-ongoing', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = chosenCreature();
			if (t) t.ongoing = JSON.parse(JSON.stringify(e.ongoing));
});


register('leyline-boost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].leylineBoost = (state.players[pi].leylineBoost || 0) + (e.value || 1); // Mystic Runesaber
});


register('asteroid-boost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].asteroidBoost = (state.players[pi].asteroidBoost || 0) + (e.value || 1); // Bolide Behemoth
});


register('next-temp-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].nextTempDiscount = (state.players[pi].nextTempDiscount || 0) + (e.value || 2); // Spelunker
});


register('temp-crystal-next-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].tempCrystalNext = (state.players[pi].tempCrystalNext || 0) + (e.value || 1); // Emberscarred Whelp
});


register('temp-mana', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const pp = state.players[pi];
			pp.mana.bonus += e.value || 1;
			emit(state, { type: 'coin', player: pi, mana: availableMana(pp) });
});


register('grant-next-school-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Holy Cowboy: your next spell of a school costs less
			state.players[pi].nextSchoolDiscount = { school: e.school, amount: e.value || 2 };
});


register('grant-double-turns', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Temporus: your opponent takes two turns, then you take two turns
			const o = enemies[0];
			if (o != null) state.forcedTurns = [o, o, pi, pi];
});


register('hero-temp-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const hta = e.heraldScaled ? hm() : e.value;
			state.players[pi].heroTempAttack += hta;
			emit(state, { type: 'heroBuffed', player: pi, amount: hta });
});


register('set-next-minion-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Hodir: set the stats of your next N minions
			state.players[pi].nextMinionStats = { count: e.count || 3, attack: e.attack || 8, health: e.health || 8 };
});


register('grant-parity-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Thaddius: your odd/even-Cost cards cost less (swaps polarity each turn)
			state.players[pi].parityDiscount = { parity: e.parity || 'odd', amount: e.value || 2 };
});


register('grant-overload-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Inzah: for the rest of the game, your Overload cards cost less
			state.players[pi].overloadDiscount = (state.players[pi].overloadDiscount || 0) + (e.value || 1);
});


register('buff-self-if-armor', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Mawsworn Bailiff: if you have N+ Armor, gain +X/+X
			if (source && (state.players[pi].armor || 0) >= (e.armor || 4)) buffCreature(source, e.attack || 0, e.health || 0);
});


register('buff-self-per-died-this-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Snakebite: gain +X/+X for each minion that died this turn
			const n = state.diedThisTurn || 0;
			if (source && n) buffCreature(source, (e.attack || 1) * n, (e.health || 1) * n);
});


register('buff-hand-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Alliance Bannerman: give minions in your hand +X/+X (Crystalline Greatmace: tribe filter)
			for (const c of state.players[pi].hand) if (c.type === 'creature' && (!e.tribe || (c.tribe || '').includes(e.tribe))) { c.attack += e.attack || 0; c.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
});


register('buff-hand-double', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Emeriss: double Attack and Health of all creatures in your hand
			for (const c of state.players[pi].hand) if (c.type === 'creature') { c.attack += c.attack; c.maxHealth += c.maxHealth; }
});


register('buff-target-by-source-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Outfit Tailor: give a friendly minion +Attack/+Health equal to this minion's stats
			const t = chosenCreature();
			if (t && source) buffCreature(t, source.attack || 0, hp(source) || 0);
});


register('buff-self-per-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Lawful Longarm: gain +N Attack for each card in your hand
			if (source) buffCreature(source, (e.attack || 1) * state.players[pi].hand.length, (e.health || 0) * state.players[pi].hand.length);
});


register('grant-attack-while-alive', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Rowdy Fan: chosen minion has +N Attack while the source is alive
			const t = chosenCreature();
			if (t && source) { source.aura = { targetUid: t.uid, attack: e.attack || 4 }; recomputeAuras(state); }
});


register('grant-stealth-while-alive', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Obsessive Fan: chosen minion has Stealth while the source is alive
			const t = chosenCreature();
			if (t && source) { source.aura = { targetUid: t.uid, keywords: [KW.STEALTH] }; recomputeAuras(state); }
});


register('buff-self-per-combo-played', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Rhyme Spinner: +X/+X for each other Combo card you've played this game
			const n = state.players[pi].combosPlayedGame || 0;
			if (source && n) buffCreature(source, (e.attack || 1) * n, (e.health || 1) * n);
});


register('buff-next-drawn-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Beanstalk Brute (approx "top N minions in deck"): buff the next N minions you draw
			const p = state.players[pi];
			p.drawBuffMinions = { count: e.count || 3, attack: e.attack || 0, health: e.health || 0 };
});


register('boost-parts-power', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Xhilag: raise the damage of all its Stalks
			if (source) for (const c of state.players[pi].board) {
				if (!isDead(c) && c.colossalOf === source.name) c.partPower = (c.partPower || 2) + (e.amount || 1);
			}
});


register('gain-weapon-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	// LIVE semantics kept (board+alive guard); the dead twin was identical
	// minus the guard.
			// Phantom Freebooter: gain +Attack/+Health equal to your weapon's stats
			if (source && source.zone === 'board' && !isDead(source)) {
				const w = state.players[pi].weapon;
				if (w) buffCreature(source, w.attack || 0, w.durability || 0);
			}
});


register('buff-weapon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const w = state.players[pi].weapon;
			if (w) {
				w.attack += e.attack || 0;
				w.durability += e.durability || 0;
				emit(state, { type: 'weaponDurability', player: pi, attack: w.attack, durability: w.durability });
			}
});


register('buff-friendly-attack-filter', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Busy-Bot: give your minions with N Attack +X/+X
			for (const c of state.players[pi].board) if (c !== source && !isDead(c) && c.type !== 'location' && (c.attack || 0) === (e.attackEquals ?? 1)) buffCreature(c, e.attack || 1, e.health || 1);
});


register('swap-hand-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Reflecto Engineer: swap Attack and Health of all minions in both hands
			for (const pl of state.players) for (const c of pl.hand) if (c.type === 'creature') { const a = c.attack || 0, h2 = c.maxHealth || 0; c.attack = h2; c.maxHealth = a; }
});


register('reduce-deck-keyword-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Rotten Rodent: cards with a keyword drawn from your deck cost less
			const p = state.players[pi];
			p.deckKeywordDiscount = p.deckKeywordDiscount || {};
			p.deckKeywordDiscount[e.keyword] = (p.deckKeywordDiscount[e.keyword] || 0) + (e.value || 1);
});


register('buff-self-per-tribe-played', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Power Slider: +X/+X for each distinct minion type you've played this game
			const n = state.players[pi].tribesPlayedGame ? Object.keys(state.players[pi].tribesPlayedGame).length : 0;
			if (source && n) buffCreature(source, (e.attack || 1) * n, (e.health || 1) * n);
});


register('fatigue-self-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Baritone Imp: take Fatigue damage, gain that much Attack and Health
			const p = state.players[pi];
			const amt = (p.fatigue || 0) + 1;
			p.fatigue = amt;
			damageHero(state, pi, amt, pi);
			if (source && !isDead(source)) buffCreature(source, amt, amt);
});


register('buff-self-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Fireguard Destroyer: gain a random amount of Attack in [min,max]
			if (source && source.zone === 'board' && !isDead(source)) {
				const [lo, hi] = e.range || [1, 1];
				buffCreature(source, lo + Math.floor(state.rng() * (hi - lo + 1)), e.health || 0);
			}
});


register('grant-next-class-free', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Blood Crusader: your next minion of a class this turn costs Health instead of Mana (approximated as free)
			state.players[pi].nextClassFree = e.cardClass;
			state.players[pi]._classFreeGrantedThisPlay = true; // don't let the granting card consume its own grant
});


register('buff-hand-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Voidgill: give all minions of a tribe in your hand +X/+X
			for (const c of state.players[pi].hand) if (c.type === 'creature' && (c.tribe || '').includes(e.tribe)) { c.attack = (c.attack || 0) + (e.attack || 0); c.maxHealth = (c.maxHealth || 0) + (e.health || 0); }
});


register('leech-boost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			p.leechBoost = (p.leechBoost || 0) + (e.value || 1); // Hideous Husk
			for (const c of p.board) if (c.name === 'Leech' && !isDead(c)) { c.attack += e.value || 1; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
});


register('set-lackey-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Dark Pharaoh Tekahn: for the rest of the game, your Lackeys are N/N
			state.players[pi].lackeyBuff = e.value || 4;
			for (const c of state.players[pi].hand) if (typeof c.id === 'string' && c.id.startsWith('lackey_')) { c.attack = e.value || 4; c.maxHealth = e.value || 4; }
});


register('grant-next-outcast-discount', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Fierce Outsider (Outcast): your next Outcast card costs less
			state.players[pi].nextOutcastDiscount = (state.players[pi].nextOutcastDiscount || 0) + (e.value || 1);
			state.players[pi]._outcastDiscountGrantedThisPlay = true; // don't let the granting card consume its own discount
});


register('nightmare-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Nightmare: +5/+5 now, destroyed at the start of your next turn
			const t = chosenCreature();
			if (t) {
				t.attack += 5; t.maxHealth += 5;
				t._doomAtTurn = state.turnNumber + state.players.length;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
});


register('set-target-stats-from-source', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Toy Captain Tarim: set a minion's Attack and Health to this minion's
			const t = chosenCreature();
			if (t && source) { t.attack = source.attack || 0; t.maxHealth = hp(source) || 1; t.damage = 0; t.tempHealth = 0; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
});


register('set-weapon-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Swarthy Swordshiner: set your weapon's Attack and Durability
			const w = state.players[pi].weapon;
			if (w) { w.attack = e.attack ?? w.attack; w.durability = e.durability ?? w.durability; emit(state, { type: 'weaponDurability', player: pi, attack: w.attack, durability: w.durability }); }
});


register('double-self-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Immortal: double this minion's Attack and Health (the 4-Mana cost is not modeled)
			if (source && !isDead(source)) { source.attack = (source.attack || 0) * 2; source.maxHealth = (source.maxHealth || 0) * 2; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
});


register('copy-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Faceless Shambler: copy a friendly creature's Attack and Health
			const t = chosenCreature();
			if (t && source && !isDead(source)) {
				source.attack = t.attack;
				source.maxHealth = t.maxHealth;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
});


register('buff-hand-tribe-keyword', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Snapdragon: give all minions with a keyword in your hand +X/+X (deck approximated as hand)
			for (const c of state.players[pi].hand) if (c.type === 'creature' && (c.keywords || []).includes(e.keyword)) { c.attack = (c.attack || 0) + (e.attack || 0); c.maxHealth = (c.maxHealth || 0) + (e.health || 0); }
});


register('grant-free-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Anub'Rekhan: your next N minions this turn cost Armor instead of Mana (approximated as free)
			state.players[pi].freeMinionsCount = (state.players[pi].freeMinionsCount || 0) + (e.count || 3);
			state.players[pi]._freeMinionGrantedThisPlay = true; // don't let the granting minion consume its own charge
});


register('swap-self-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Sentient Hourglass: swap this minion's Attack and Health
			if (source && !isDead(source)) { const a = source.attack || 0, h = hp(source); source.attack = h; source.maxHealth = a; source.damage = 0; source.tempHealth = 0; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
});


register('swap-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
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
});


register('buff-deck-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Shan'do Wildclaw: give a tribe in your deck +X/+X (applied as they're drawn)
			const p = state.players[pi];
			p.drawBuffTribe = p.drawBuffTribe || {};
			p.drawBuffTribe[e.tribe] = { attack: (p.drawBuffTribe[e.tribe]?.attack || 0) + (e.attack || 0), health: (p.drawBuffTribe[e.tribe]?.health || 0) + (e.health || 0) };
});


register('trigger-imbued-power', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Wisprider: "...then trigger it" — fire your imbued Blessing's effect immediately
			const p = state.players[pi];
			const hp0 = p.heroPowers.find(x => (x.id || '').startsWith('hp_blessing_'));
			if (hp0 && hp0.power && hp0.power.effects) execEffects(state, pi, JSON.parse(JSON.stringify(hp0.power.effects)), null, source);
});


register('debuff-until-your-next', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Scarlet Subjugator: -N Attack until your next turn
			const t = chosenCreature();
			if (t) {
				t.attack = Math.max(0, t.attack - (e.value || 2));
				t._atkRestore = { turn: state.turnNumber + state.players.length, amount: e.value || 2 };
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
});


register('dagger-or-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Wicked Blightspawn: equip a 1/2 Dagger, or +2 Attack to your weapon
			const p = state.players[pi];
			if (p.weapon) { p.weapon.attack += 2; emit(state, { type: 'weaponBuff', player: pi, attack: p.weapon.attack }); }
			else execEffects(state, pi, [{ type: 'equip', name: 'Dagger', attack: 1, durability: 2 }], null, source);
});


register('spend-mana-double-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Immortal: spend N Mana to double this minion's stats
			const p = state.players[pi];
			if (source && !isDead(source) && availableMana(p) >= (e.value || 4)) {
				spendMana(p, e.value || 4);
				source.attack *= 2; source.maxHealth *= 2;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
});


register('temp-buff-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			if (source && source.zone === 'board' && !isDead(source)) {
				source.attack += e.attack || 0;
				source.tempAttack += e.attack || 0;
				source.maxHealth += e.health || 0;
				source.tempHealth = (source.tempHealth || 0) + (e.health || 0);
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
});


register('buff-self-per-played-id', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Freebird: +X/+X for each other copy of this card you've played this game
			// (playedCountById is incremented AFTER the battlecry, so it already counts only prior plays)
			const n = source ? (state.players[pi].playedCountById?.[source.id] || 0) : 0;
			if (source && n > 0) buffCreature(source, (e.attack || 1) * n, (e.health || 1) * n);
});


register('buff-hand-keyword', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Unlucky Powderman: give minions in your hand with a keyword +X/+X (deck buff approximated to hand)
			for (const c of state.players[pi].hand) if (c.type === 'creature' && (c.keywords || []).includes(e.keyword)) { c.attack += e.attack || 0; c.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
});


register('bolster', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// +N/+N to your creature with the least health (MTG-style default)
			const pool = state.players[pi].board.filter(c => !isDead(c));
			if (pool.length) {
				const t = pool.reduce((a, b) => hp(b) < hp(a) ? b : a);
				t.attack += e.value;
				t.maxHealth += e.value;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
} });


register('random-buff-others', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mad Hatter: toss N +1/+1 hats onto random OTHER creatures (may stack)
			for (let i = 0; i < (e.count || 1); i++) {
				const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location');
				if (!pool.length) break;
				buffCreature(pool[Math.floor(state.rng() * pool.length)], e.attack || 1, e.health || 1);
			}
} });


register('temp-stealth-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Coppertail Imposter: gain Stealth until your next turn
			if (source && source.zone === 'board' && !isDead(source)) {
				source.tempStealth = true; source.stealthed = true;
				if (!source.keywords.includes(KW.STEALTH)) source.keywords.push(KW.STEALTH);
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
} });


register('grant-keyword-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Audio Medic (Finale): the source minion gains a keyword
			if (source && !isDead(source) && !source.keywords.includes(e.keyword)) { source.keywords.push(e.keyword); if (e.keyword === KW.DIVINE_SHIELD) source.shield = true; if (e.keyword === KW.STEALTH) source.stealthed = true; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
} });


register('spend-all-mana-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Forbidden Ancient: spend all your Mana, gain +1/+1 per Mana spent
			const p = state.players[pi];
			const n = availableMana(p);
			if (n > 0) { spendMana(p, n); if (source && !isDead(source)) { source.attack += (e.attack || 1) * n; source.maxHealth += (e.health || 1) * n; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); } }
} });


register('buff-self-per-other-friendly', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ultra-Capacitor: gain +X/+Y for each other friendly minion
			if (source) {
				const n = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location').length;
				if (n > 0) { source.attack += (e.attack || 1) * n; source.maxHealth += (e.health || 1) * n; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
			}
} });


register('draw-beast-gain-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Banjosaur: draw a Beast and gain its stats
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'creature', tribe: 'Beast', count: 1 }], null, source);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn && source && !isDead(source)) buffCreature(source, drawn.attack || 0, drawn.maxHealth || 0);
} });


register('steal-stats-all-enemies', ({ state, pi, source, enemies }, e) => {
	// Ancient Void Hound: steal 1 Attack & Health from all enemy minions
	const da = e.attack || 1, dh = e.health || 1;
	let stolen = 0;
	for (const o of enemies) for (const c of [...state.players[o].board]) {
		if (isDead(c) || c.type === 'location') continue;
		c.attack = Math.max(0, (c.attack || 0) - da);
		c.maxHealth = Math.max(0, (c.maxHealth || 0) - dh);
		emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
		stolen++;
	}
	if (source && !isDead(source) && stolen) { source.attack += da * stolen; source.maxHealth += dh * stolen; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
	sweepDeaths(state);
});

register('grant-immune-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ashtongue Slayer: give a minion Immune until end of turn (target 'self' = source, Kurtrus Outcast)
			// Staff of Ammunae: target 'friendly-creatures' grants your whole board Immune this turn
			const ts = e.target === 'friendly-creatures' ? state.players[pi].board.filter(c => !isDead(c) && c.type !== 'location')
				: e.target === 'self' ? (source && source.zone === 'board' && !isDead(source) ? [source] : [])
				: [chosenCreature()].filter(Boolean);
			for (const t of ts) { if (!t.keywords.includes(KW.IMMUNE)) t.keywords.push(KW.IMMUNE); if (e.turns) t.immuneTurnsLeft = e.turns; else t.immuneTurnClear = true; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); } // `turns`: Immune for N of the controller's turns (Blacksmith's Skill); else just this turn
} });

register('grant-weapon-ability', ({ state, pi }, e) => {
			// Aggramar: give your weapon +Attack, "Immune while attacking", and/or an
			// "After your hero attacks, ..." trigger (accumulated across abilities).
			const w = state.players[pi].weapon;
			if (!w) return;
			if (e.attack) w.attack = (w.attack || 0) + e.attack;
			if (e.immuneAttacking) w.static = { type: 'immune-attacking' };
			if (e.afterHeroAttack) (w.afterHeroAttack = w.afterHeroAttack || []).push(e.afterHeroAttack);
			if (e.keywordTurn && !w.keywords.includes(e.keywordTurn)) { w.keywords.push(e.keywordTurn); (w._turnKeywords = w._turnKeywords || []).push(e.keywordTurn); } // Barbed Thorn: Poisonous this turn
			if (e.deathrattle) { w.deathrattle = (w.deathrattle || []).concat(JSON.parse(JSON.stringify(e.deathrattle))); if (!w.keywords.includes('deathrattle')) w.keywords.push('deathrattle'); } // Barbed Thorn: gain a Deathrattle
			emit(state, { type: 'weaponDurability', player: pi, attack: w.attack, durability: w.durability });
});

register('buff-future-demons', ({ state, pi }) => {
			// Sargeras (Legion Invasion): future Demons you summon get +2 Health and Taunt (see summon)
			state.players[pi].legionInvasion = true;
});


register('buff-random-hand-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Helboar: give a random matching minion in your hand +attack/+health
			const pool = state.players[pi].hand.filter(c => c.type === 'creature' && (c.tribe || '').includes(e.tribe));
			if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)]; t.attack = (t.attack || 0) + (e.attack || 0); t.maxHealth = (t.maxHealth || 0) + (e.health || 0); t.health = (t.health || 0) + (e.health || 0); }
} });


register('buff-random-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Vicious Bloodworm (battlecry path — the ongoing path lives in runSecretEffects): buff a random creature in your hand
			const pool2 = state.players[pi].hand.filter(c => c.type === 'creature');
			if (pool2.length) { const c = pool2[Math.floor(state.rng() * pool2.length)]; c.attack += e.attack || 0; c.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
} });


register('timed-aura', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// "Your minions have ... Lasts N turns": a friendly team aura enchantment that
			// ticks down at each of your turn-ends (existing p.enchantments turnsLeft loop)
			const ench = instantiate({ id: 'token_timed_aura', name: e.name || 'Aura', type: 'enchantment', cost: 0, token: true, description: e.description || null }, pi);
			ench.zone = 'enchantment';
			ench.aura = e.aura;
			ench.turnsLeft = e.turns || 3;
			state.players[pi].enchantments.push(ench);
			recomputeAuras(state);
			emit(state, { type: 'enchant', player: pi, card: ench });
} });


register('embolden-recruits', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Emboldening Blade: give your Silver Hand Recruits +X/+Y this game — buff the
			// ones on board now and raise the persistent bonus for future Recruits
			const p = state.players[pi];
			p.recruitAttackBonus = (p.recruitAttackBonus || 0) + (e.attack || 1);
			p.recruitHealthBonus = (p.recruitHealthBonus || 0) + (e.health || 1);
			for (const c of p.board) if (!isDead(c) && c.name === 'Silver Hand Recruit') buffCreature(c, e.attack || 1, e.health || 1);
} });


register('buff-self-in-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Blacksmithing Hammer: after you Trade this, the copy going back to your
			// deck carries a buff (applied when it's next drawn)
			if (source && source.id) (state.players[pi].deckIdBuffs = state.players[pi].deckIdBuffs || []).push({ id: source.id, attack: e.attack || 0, health: e.health || 0, durability: e.durability || 0 });
} });


register('buff-deck-top-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Beanstalk Brute: +4/+4 to the top N minions of your deck (top = draw end)
			const p = state.players[pi];
			let found = 0;
			for (let i = p.deck.length - 1; i >= 0 && found < (e.count || 3); i--) {
				const dd = state.cardsById[p.deck[i]];
				if (dd && dd.type === 'creature') { (p.deckIdBuffs = p.deckIdBuffs || []).push({ id: p.deck[i], attack: e.attack || 0, health: e.health || 0 }); found++; }
			}
} });


register('debuff-random-hand-each', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Twisted Treant: give a random minion in each player's hand -N Attack
			for (let s2 = 0; s2 < state.players.length; s2++) {
				const pool = state.players[s2].hand.filter(c => c.type === 'creature');
				if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.attack = Math.max(0, (c.attack || 0) + (e.attack || -2)); emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
			}
} });


register('spend-corpses-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Volcoross: spend N Corpses to gain +N/+N
			const p = state.players[pi];
			if (source && !isDead(source) && (p.corpses || 0) >= (e.amount || 0)) {
				spendCorpses(state, pi, e.amount || 0);
				emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
				source.attack += e.amount || 0; source.maxHealth += e.amount || 0;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
} });


register('set-target-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Class Action Lawyer: set a minion's Attack and Health (gated on deckNoNeutral)
			if (e.requireDeckNoNeutral && state.players[pi].deck.some(id => (state.cardsById[id]?.cardClass || 'neutral') === 'neutral')) return;
			const t = chosenCreature();
			if (t) { t.attack = e.attack ?? 1; t.maxHealth = e.health ?? 1; t.damage = 0; t.tempHealth = 0; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
} });


register('set-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Humble Blessings: set every friendly creature's Attack & Health to a
			// fixed value. (The "for the rest of the game" clause — future creatures —
			// is not modeled; this sets the board as it stands.)
			const board = e.target === 'friendly-creatures' ? state.players[pi].board
				: e.target === 'enemy-creatures' ? enemies.flatMap(o => state.players[o].board) // Amitus (Pacified): all enemy minions
				: e.target === 'all-creatures' ? state.players.flatMap(pl => pl.board)
				: [];
			for (const c of board) {
				if (isDead(c) || c.type === 'location') continue;
				if (e.attack != null) c.attack = e.attack;
				if (e.health != null) { c.maxHealth = e.health; c.damage = 0; c.tempHealth = 0; }
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
} });


register('draw-minion-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Claw Machine: draw a minion and give it +X/+X
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'creature', count: 1 }], target, source);
			for (const c of p.hand) if (!before.has(c.uid) && c.type === 'creature') { c.attack += e.attack || 0; c.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
} });


register('buff-random-of-tribes', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Zoobot / Menagerie Magician: buff a random friendly of each listed tribe
			for (const tribe of e.tribes || []) {
				const pool = state.players[pi].board.filter(c => !isDead(c) && c !== source && (c.tribe || '').includes(tribe));
				if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)]; t.attack += e.attack || 0; t.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
			}
} });


register('grant-adjacent-keyword', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Candleraiser (Finale): give adjacent minions a keyword
			if (source) { const board = state.players[pi].board; const i = board.indexOf(source); for (const j of [i - 1, i + 1]) { const nb = board[j]; if (nb && !isDead(nb) && nb.type !== 'location' && !nb.keywords.includes(e.keyword)) { nb.keywords.push(e.keyword); if (e.keyword === KW.DIVINE_SHIELD) nb.shield = true; emit(state, { type: 'buff', uid: nb.uid, attack: nb.attack, hp: hp(nb) }); } } }
} });


register('buff-cthun', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// buff your C'Thun wherever it is (hand/deck/board persist via the tracker)
			const p = state.players[pi];
			p.cthunAtk += e.value || 0; p.cthunHp += e.value || 0;
			for (const ey of p.board) if (ey.cthunLink && !isDead(ey)) { ey.attack += e.value || 0; ey.maxHealth += e.value || 0; emit(state, { type: 'buff', uid: ey.uid, attack: ey.attack, hp: hp(ey) }); } // Eyestalk of C'Thun
			if (e.keyword === 'taunt') p.cthunTaunt = true;
			syncCthun(state, pi);
} });


register('buff-weapons', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lady Ashvane: buff weapons in hand and equipped (+ deck via a draw aura)
			const p = state.players[pi];
			if (p.weapon) { p.weapon.attack += e.attack || 0; p.weapon.durability += e.health || 0; emit(state, { type: 'weaponDurability', player: pi, attack: p.weapon.attack, durability: p.weapon.durability }); }
			for (const c of p.hand) if (c.type === 'weapon') { c.attack = (c.attack || 0) + (e.attack || 0); c.durability = (c.durability || 0) + (e.health || 0); }
} });


register('grant-random-keywords-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Fossilized Kaleidosaur: gain N random keywords
			const kws = e.keywords || ['taunt', 'divine_shield', 'rush', 'lifesteal', 'windfury', 'poisonous'];
			for (let i = 0; i < (e.count || 1) && source; i++) { const k = kws[Math.floor(state.rng() * kws.length)]; if (!source.keywords.includes(k)) { source.keywords.push(k); if (k === KW.DIVINE_SHIELD) source.shield = true; } }
			if (source) emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
} });


register('buff-battlecry-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Turbulus: give all OTHER Battlecry minions in hand and on board +X/+X
			const p = state.players[pi];
			for (const c of p.board) if (c !== source && !isDead(c) && c.type !== 'location' && (c.keywords || []).includes('battlecry')) buffCreature(c, e.attack || 1, e.health || 1);
			for (const c of p.hand) if (c.type === 'creature' && (c.keywords || []).includes('battlecry')) { c.attack += e.attack || 1; c.maxHealth += e.health || 1; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
} });


register('discard-weapons-gain-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('gain-random-keyword-per-enemy-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Torghast Custodian: for each enemy minion, randomly gain a keyword
			const kws = e.keywords || ['rush', 'divine_shield', 'windfury'];
			let n = 0; for (const o of enemies) n += state.players[o].board.filter(c => !isDead(c) && c.type !== 'location').length;
			for (let i = 0; i < n && source; i++) { const k = kws[Math.floor(state.rng() * kws.length)]; if (!source.keywords.includes(k)) { source.keywords.push(k); if (k === KW.DIVINE_SHIELD) source.shield = true; } }
			if (source) emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
} });


register('swap-stats-with', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Darkspeaker: swap this creature's Attack & Health with a chosen one
			const t = chosenCreature();
			if (t && source && source.zone === 'board' && !isDead(source) && t !== source) {
				const sa = source.attack, sh = source.maxHealth, sd = source.damage;
				source.attack = t.attack; source.maxHealth = t.maxHealth; source.damage = t.damage;
				t.attack = sa; t.maxHealth = sh; t.damage = sd;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
} });


register('boost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('bounce-and-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('gain-random-keyword-per-class-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Elitist Snob: for each card of a class in your hand, gain a random keyword
			const kws = e.keywords || ['divine_shield', 'lifesteal', 'rush', 'taunt'];
			const n = state.players[pi].hand.filter(c => c !== source && (c.cardClass || '').split('__').includes(e.cardClass)).length;
			for (let i = 0; i < n && source; i++) { const k = kws[Math.floor(state.rng() * kws.length)]; if (!source.keywords.includes(k)) { source.keywords.push(k); if (k === KW.DIVINE_SHIELD) source.shield = true; } }
			if (source) emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
} });


register('gain-random-keywords-per-tribe-played', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// The One-Amalgam Band: gain a random keyword for each distinct minion type played this game
			const kws = e.keywords || ['taunt', 'divine_shield', 'rush', 'lifesteal', 'windfury', 'poisonous'];
			const n = state.players[pi].tribesPlayedGame ? Object.keys(state.players[pi].tribesPlayedGame).length : 0;
			for (let i = 0; i < n && source; i++) { const k = kws[Math.floor(state.rng() * kws.length)]; if (!source.keywords.includes(k)) { source.keywords.push(k); if (k === KW.DIVINE_SHIELD) source.shield = true; } }
			if (source) emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
} });


register('attach-equip', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('adjacent-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('buff-weapon-or-draw-weapon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Weapons Expert: if you have a weapon, give it +1/+1; otherwise draw a weapon
			const p = state.players[pi];
			if (p.weapon) { p.weapon.attack += e.attack || 1; p.weapon.durability += e.durability || 1; emit(state, { type: 'weaponDurability', player: pi, attack: p.weapon.attack, durability: p.weapon.durability }); }
			else { const idx = p.deck.findIndex(id => state.cardsById[id]?.type === 'weapon'); if (idx >= 0 && p.hand.length < MAX_HAND) { const [id] = p.deck.splice(idx, 1); const wc = instantiate(state.cardsById[id], pi); wc.zone = 'hand'; p.hand.push(wc); emit(state, { type: 'draw', player: pi, card: wc }); } }
} });


register('buff-all-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Grand Totem Eys'or: +X/+X to a tribe in hand, deck and battlefield
			const p = state.players[pi];
			for (const c of p.board) if (c !== source && !isDead(c) && c.type !== 'location' && (c.tribe || '').includes(e.tribe)) buffCreature(c, e.attack || 0, e.health || 0);
			for (const c of p.hand) if (c.type === 'creature' && (c.tribe || '').includes(e.tribe)) { c.attack += e.attack || 0; c.maxHealth += e.health || 0; }
			p.drawBuffTribe = p.drawBuffTribe || {};
			p.drawBuffTribe[e.tribe] = { attack: (p.drawBuffTribe[e.tribe]?.attack || 0) + (e.attack || 0), health: (p.drawBuffTribe[e.tribe]?.health || 0) + (e.health || 0) };
} });


register('swap-stats-two', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Chillin' Vol'jin (approx): swap the stats of the chosen minion with a random OTHER minion
			const t = chosenCreature();
			if (t) { const pool = []; for (const pl of state.players) for (const c of pl.board) if (c !== t && !isDead(c) && c.type !== 'location') pool.push(c); if (pool.length) { const t2 = pool[Math.floor(state.rng() * pool.length)]; const a = t.attack, h2 = hp(t); t.attack = t2.attack; t.maxHealth = hp(t2); t.damage = 0; t2.attack = a; t2.maxHealth = h2; t2.damage = 0; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); emit(state, { type: 'buff', uid: t2.uid, attack: t2.attack, hp: hp(t2) }); } }
} });


register('buff-self-attack-random-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mish-Mash Mosher / Barricade Basher: gain +N Attack (and Health) and attack a random enemy minion (guarded chain)
			if (source && !isDead(source)) {
				buffCreature(source, e.attack || 1, e.health || 0);
				state._mmDepth = (state._mmDepth || 0) + 1;
				if (state._mmDepth < 12) {
					const pool = [];
					for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location' && !c.stealthed && c.dormantLeft <= 0) pool.push({ type: 'creature', uid: c.uid, player: o });
					if (pool.length) resolveCombat(state, pi, source.uid, pool[Math.floor(state.rng() * pool.length)]);
				}
				state._mmDepth--;
			}
} });


register('temp-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('adapt', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// paper rule: roll a d10 three times (reroll dupes); the controller
			// picks ONE of the three, applied to the adapting creature(s)
			let targets;
			if (e.name) targets = state.players[pi].board.filter(c => !isDead(c) && c.name === e.name); // Lightfused Stegodon: Silver Hand Recruits
			else if (e.target === 'friendly-creatures') targets = state.players[pi].board.filter(c => !isDead(c));
			else if (e.tribe) targets = state.players[pi].board.filter(c => !isDead(c) && (c.tribe || '').includes(e.tribe));
			else { const t = chosenCreature() || (source && source.zone === 'board' && !isDead(source) ? source : null); targets = t ? [t] : []; }
			targets = targets.filter(c => c.type !== 'location');
			for (let n = 0; n < (e.times || 1); n++) queueAdapt(state, pi, targets); // Ravenous Pterrordax: Adapt twice
} });


register('buff-zones', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// buff creatures in hand + on the battlefield now, and creatures still in
			// the deck as they are drawn (deck cards have no live identity until drawn)
			const p = state.players[pi];
			const match = c => !e.nameIncludes || (c.name || '').includes(e.nameIncludes); // Green Rafaam: only Rafaams
			if (!e.skipBoard && !e.deckOnly) for (const c of p.board) if (c.type === 'creature' && !isDead(c) && c !== source && match(c)) buffCreature(c, e.attack || 0, e.health || 0); // Mistcaller: hand+deck only
			if (!e.deckOnly) for (const c of p.hand) if (c.type === 'creature' && match(c)) { c.attack += e.attack || 0; c.maxHealth += e.health || 0; } // Prince Keleseth: deck only
			if (!e.nameIncludes) {
				p.drawBuff = p.drawBuff || { attack: 0, health: 0 };
				p.drawBuff.attack += e.attack || 0; p.drawBuff.health += e.health || 0;
			}
} });


register('imbue', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Emerald Dream Imbue: upgrade your Hero Power to the class Blessing; each Imbue makes it stronger
			const p = state.players[pi];
			p.imbueCount = (p.imbueCount || 0) + 1;
			const IMBUED = { druid: 'hp_blessing_golem', hunter: 'hp_blessing_wolf', mage: 'hp_blessing_wisp', priest: 'hp_blessing_moon', shaman: 'hp_blessing_wind', paladin: 'hp_blessing_dragon' };
			const pid = IMBUED[p.heroClass];
			const def = pid && state.cardsById[pid];
			if (def) {
				if (!p.heroPowers.some(hp0 => hp0.id === pid)) { const power = instantiate(def, pi); power.zone = 'heropower'; power.usedThisTurn = false; p.heroPowers = [power]; emit(state, { type: 'heroPowerGained', player: pi, card: power }); }
			} else p.heroPowerUpgraded = true; // classless/off-class heroes keep the double-fire fallback
			emit(state, { type: 'imbue', player: pi, count: p.imbueCount });
} });


register('buff-self-per', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Clockwork Rager (turns taken) / Heir of Hereafter (damaged minions) / Duke of Below (discards)
			if (source && !isDead(source)) {
				let n = 0;
				if (e.per === 'turns-taken') n = Math.max(1, Math.ceil((state.turnNumber || 1) / 2));
				else if (e.per === 'damaged-minions') { for (const pl of state.players) for (const c of pl.board) if (!isDead(c) && c.type !== 'location' && c.damage > 0) n++; }
				else if (e.per === 'discards-game') n = (state.players[pi].discardLogIds || []).length;
				else if (e.per === 'cards-played') n = state.players[pi].cardsPlayedThisTurn || 0; // Defias Wannabe: each OTHER card played this turn (counter increments after the battlecry, so it already excludes this card)
				if (n > 0) { source.attack += (e.attack || 0) * n; source.maxHealth += (e.health || 0) * n; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
			}
} });


register('grant-bonus-effect', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Bonus Effects: apply N random gifts to self (Mutating Lifeform / Ace Wayfinder) or a random friendly (Stranglevine)
			const applied = [];
			for (let n = 0; n < (e.count || 1); n++) {
				let t = null;
				if (e.target === 'random-friendly') { const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location'); t = pool.length ? pool[Math.floor(state.rng() * pool.length)] : null; }
				else t = (source && source.zone === 'board' && !isDead(source)) ? source : null;
				if (!t) break;
				applied.push(applyGift(state, t, null, { board: true }));
				if (e.propagateDeathrattle && source && source.deathrattle && t !== source) { t.deathrattle = [...(t.deathrattle || []), ...JSON.parse(JSON.stringify(source.deathrattle))]; if (!t.keywords.includes('deathrattle')) t.keywords.push('deathrattle'); } // Stranglevine chains
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
			if (e.rewardNextTribe && applied.length) state.players[pi].nextTribePlayReward = { tribe: e.rewardNextTribe, count: 1, attack: 0, health: 0, keyword: null, giftLabels: applied.map(g => g.label) }; // Ace Wayfinder: the next Draenei gains them too
} });


register('buff-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			if (e.target === 'friendly-creatures') {
				for (const c of state.players[pi].board) {
					if (e.tribe && !(c.tribe || '').includes(e.tribe)) continue;
					if (e.excludeSelf && c === source) continue; // Felfin Navigator: your OTHER Murlocs
						if (e.name && c.name !== e.name) continue; // Quartermaster's Recruits
					if (e.requireKeyword && !c.keywords.includes(e.requireKeyword)) continue;
					if (e.requireDamaged && !(c.damage > 0)) continue; // Ball and Chain
					buffCreature(c, e.attack, e.health);
					if (e.grant && !c.keywords.includes(e.grant)) { c.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) c.shield = true; } // Serrated Tooth: give your minions Rush
				}
			} else if (e.target === 'all-creatures') {
				for (const pl of state.players) for (const c of pl.board) {
					if (e.exceptTribe && (c.tribe || '').includes(e.exceptTribe)) continue;
					if (e.tribe && !(c.tribe || '').includes(e.tribe)) continue; // optional include filter (e.g. Demon / Spirit)
					buffCreature(c, e.attack, e.health);
				}
			} else if (e.target === 'friendly-others') {
				for (const c of state.players[pi].board) if (c !== source) buffCreature(c, e.attack, e.health);
			} else if (e.target === 'self') {
				if (source && !isDead(source)) buffCreature(source, e.attack, e.health); // Rolling Stone
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
					if (e.grant && !t.keywords.includes(e.grant)) { t.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) t.shield = true; } // Future Gnomeregan: +2/+1 and Divine Shield
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('grant', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			const grantTo = e.target === 'friendly-creatures' ? state.players[pi].board
				: e.target === 'all-creatures' ? state.players.flatMap(pl => pl.board) // both boards (Windswept Heresy)
				: e.target === 'friendly-others' ? state.players[pi].board.filter(c => c !== source) // Camouflaged Dirigible
				: e.target === 'self' ? (source && source.zone === 'board' && !isDead(source) ? [source] : [])
				: [chosenCreature()].filter(Boolean);
			// tribe-restricted grants never fall back to a random creature
			if (!grantTo.length && e.target !== 'friendly-creatures' && e.target !== 'friendly-others' && e.target !== 'self' && e.target !== 'all-creatures' && !e.tribe) {
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
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('buff-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// battlecry/choice self-pump; `per` scales by a count
			if (source && source.zone === 'board' && !isDead(source)) {
				let n = 1;
				if (e.per === 'other-friendly') n = state.players[pi].board.filter(c => c !== source && !isDead(c)).length;
				else if (e.per === 'si7-others') n = Math.max(0, (state.players[pi].si7PlayedGame || 0) - 1); // SI:7 Informant
				else if (e.per === 'spells-this-turn') n = state.players[pi].spellsPlayedThisTurn || 0; // Queensguard
				else if (e.per === 'hand-cards') n = state.players[pi].hand.length;
				else if (e.per === 'hand-spells') n = state.players[pi].hand.filter(c => isSpellType(c)).length; // Brainstormer
				else if (e.per === 'hand-school') n = state.players[pi].hand.filter(c => isSpellType(c) && schoolOf(c) === e.school).length; // Ymirjar Frostbreaker: Frost spells in hand
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
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('set-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
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
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('set-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			const list = e.target === 'all-creatures'
				? state.players.flatMap(pl => pl.board.filter(c => !isDead(c)))
				: e.target === 'all-others'
				? state.players.flatMap(pl => pl.board.filter(c => !isDead(c) && c !== source))
				: e.target === 'enemy-creatures'
				? enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c))) // Eadric the Pure
				: e.target === 'self'
				? [source].filter(c => c && !isDead(c)) // Toothy Chest / Validated Doomsayer
				: [chosenCreature()].filter(Boolean);
			for (const t of list) {
				t.attack = e.value + (t.auraAttack || 0);
				t.tempAttack = 0;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('temp-stealth-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Conceal: stealth until the owner's next turn
			for (const c of state.players[pi].board) {
				if (isDead(c) || c.stealthed) continue;
				c.stealthed = true;
				c.tempStealth = true;
				if (!c.keywords.includes(KW.STEALTH)) c.keywords.push(KW.STEALTH);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('swap-stats-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Void Ripper: swap Attack and Health of all OTHER creatures
			for (const pl of state.players) for (const c of [...pl.board]) {
				if (c === source || isDead(c) || c.type !== 'creature') continue;
				const a = c.attack, h2 = hp(c);
				c.attack = h2; c.maxHealth = a; c.damage = 0; c.tempAttack = 0; c.tempHealth = 0;
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('debuff-enemies-attack-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Quicksand Elemental: all enemy creatures lose Attack until your turn ends
			for (const o of enemies) for (const c of state.players[o].board) {
				if (isDead(c) || c.type === 'location' || c.attack <= 0) continue;
				const d = Math.min(c.attack, e.value || 2);
				c.attack -= d; c.turnAtkDebuff = (c.turnAtkDebuff || 0) + d;
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('buff-friendly-others-filtered', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Hatchery Helper: buff your OTHER minions matching an Attack filter, optionally grant a keyword
			for (const c of state.players[pi].board) {
				if (c === source || isDead(c) || c.type === 'location') continue;
				if (e.maxAttack != null && (c.attack || 0) > e.maxAttack) continue;
				buffCreature(c, e.attack || 0, e.health || 0);
				if (e.grant && !c.keywords.includes(e.grant)) { c.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) c.shield = true; }
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('buff-distinct-tribes', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Tortollan Storyteller: +1/+1 to one friendly minion of each different type
			const p = state.players[pi];
			const seen = new Set();
			for (const c of p.board) {
				if (isDead(c) || c.type !== 'creature' || c === source) continue;
				const t = (c.tribe || '').split('/')[0];
				if (!t || seen.has(t)) continue;
				seen.add(t);
				buffCreature(c, e.attack || 1, e.health || 1);
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('steal-bonus-keywords', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Violet Punisher: strip a chosen enemy minion's bonus keywords, gain them + +1/+1 per stolen
			const t = chosenCreature();
			if (t && source && !isDead(source)) {
				const stealable = ['rush', 'taunt', 'divine_shield', 'lifesteal', 'poisonous', 'windfury', 'stealth'];
				let n = 0;
				for (const kw of stealable) {
					if (!t.keywords.includes(kw)) continue;
					t.keywords = t.keywords.filter(k => k !== kw);
					if (kw === 'divine_shield') t.shield = false;
					if (kw === 'stealth') t.stealthed = false;
					if (!source.keywords.includes(kw)) { source.keywords.push(kw); if (kw === 'divine_shield') source.shield = true; if (kw === 'stealth') source.stealthed = true; }
					n++;
				}
				if (n > 0) { buffCreature(source, n, n); emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('buff-random-friendly', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Dragonmaw Overseer: buff a random OTHER friendly minion (Invincible:
			// tribe filter + keyword grant; Stonecarver: only damaged; Menagerie
			// Mug/Jug + Eager Underling: `count` picks that many DISTINCT minions).
			// (Merged: this branch shadowed the count-carrying duplicate.)
			const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location' && (!e.tribe || (c.tribe || '').includes(e.tribe)) && (!e.requireDamaged || c.damage > 0));
			for (let n = 0; n < (e.count || 1) && pool.length; n++) {
				const m = pool.splice(Math.floor(state.rng() * pool.length), 1)[0];
				buffCreature(m, e.attack || 0, e.health || 0);
				if (e.grant) for (const g of (Array.isArray(e.grant) ? e.grant : [e.grant])) { if (!m.keywords.includes(g)) { m.keywords.push(g); if (g === KW.DIVINE_SHIELD) m.shield = true; } } // Coghammer: Divine Shield AND Taunt
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('set-stats-to-highest', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Argent Braggart: set this minion's Attack and Health to the highest on the board
			if (source) {
				let hiA = 0, hiH = 0;
				for (const pl of state.players) for (const c of pl.board) { if (isDead(c) || c.type === 'location') continue; hiA = Math.max(hiA, c.attack || 0); hiH = Math.max(hiH, hp(c) || 0); }
				source.attack = Math.max(source.attack || 0, hiA);
				source.maxHealth = Math.max(hp(source), hiH); source.damage = 0;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('buff-friendly-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Shadehound: buff your other minions of a tribe
			for (const c of state.players[pi].board) { if (isDead(c) || c.type === 'location') continue; if (e.exceptSelf && c === source) continue; if (e.tribe && !(c.tribe || '').includes(e.tribe)) continue; buffCreature(c, e.attack || 0, e.health || 0); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('buff-friendly-name', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Imp King Rafaam (Infused): buff your minions whose name contains a substring
			for (const c of state.players[pi].board) { if (isDead(c) || c.type === 'location') continue; if (e.nameIncludes && !(c.name || '').includes(e.nameIncludes)) continue; buffCreature(c, e.attack || 0, e.health || 0); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('buff-friendly-didnt-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// A. F. Kay: at end of turn, buff friendly minions that didn't attack this turn
			for (const c of state.players[pi].board) {
				if (c === source || isDead(c) || c.type === 'location' || c.dormantLeft > 0) continue;
				if ((c.attacksUsed || 0) !== 0) continue;
				c.attack += (e.attack || 0); c.maxHealth += (e.health || 0);
				emit(state, { type: 'buff', uid: c.uid, attack: e.attack || 0, health: e.health || 0 });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('grant-random-keyword-friendly-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Painted Canvasaur: give each OTHER friendly minion of a tribe a random keyword
			const kws = e.keywords || ['taunt', 'divine_shield', 'rush', 'lifesteal', 'windfury', 'poisonous'];
			for (const c of state.players[pi].board) { if (c === source || isDead(c) || c.type === 'location') continue; if (e.tribe && !(c.tribe || '').includes(e.tribe)) continue; const k = kws[Math.floor(state.rng() * kws.length)]; if (!c.keywords.includes(k)) { c.keywords.push(k); if (k === KW.DIVINE_SHIELD) c.shield = true; } emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('heal-friendlies-buff-per-overheal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Dreamboat: restore N to all OTHER friendly minions; gain +1/+1 for each that Overhealed
			const p = state.players[pi];
			let over = 0;
			for (const c of p.board) { if (c === source || isDead(c) || c.type === 'location') continue; if (c.damage < (e.value || 3)) over++; healCreature(c, e.value || 3); }
			if (source && over) buffCreature(source, over, over);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('grant-random-others', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
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
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('grant-recent', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// bless the most recently summoned friendly creatures (token riders)
			const recent = state.players[pi].board.slice(-(e.count || 1));
			for (const c of recent) {
				if (isDead(c) || c.keywords.includes(e.keyword)) continue;
				c.keywords.push(e.keyword);
				if (e.keyword === KW.DIVINE_SHIELD) c.shield = true;
				if (e.keyword === KW.STEALTH) c.stealthed = true;
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


const _h_attach = ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
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
	} while (false); // top-level `continue` = skip this effect (chain semantics)
};
register('attach', _h_attach);
register('attach-curse', _h_attach); // shared or-branch handler

