// engine/effects/handlers-misc.js — everything without a clearer home (housekeeping split, PR 40).
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

register('cook', ({ state, pi, target, source, enemies, scaled }, e) => {
			gainTokenCard(state, pi, 'food_token');
});


register('enrich', ({ state, pi, target, source, enemies, scaled }, e) => {
			gainTokenCard(state, pi, 'treasure_token');
});


register('leyline-double', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].leylineDouble = true; // Surge Needle
});


register('galaxy-lens', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].galaxyLens = true; // Farseer Nobundo
});


register('commanding-shout', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].minionsSurviveTurn = state.turnNumber;
});


register('companion-upgrade', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].companionUpgrade = true; // Migrating Elekk
});


register('end-turn', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Time Stop: end the current turn immediately
			endTurn(state);
});


register('set-next-kindred-twice', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Primalfin Challenger
			state.players[pi].nextKindredTwice = true;
});


register('companion-extra', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].companionExtra = (state.players[pi].companionExtra || 0) + 1; // Talya Earthstrider
});


register('warloc-next', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Warloc: your next (3)-or-less Murloc costs Health instead of Mana
			state.players[pi].warlocNext = true;
});


register('investigate', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Investigate: make a Clue token (Sacrifice, pay 2: draw a card)
			gainTokenCard(state, pi, 'clue_token');
});


register('enable-odyn', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Odyn: for the rest of the game, gaining Armor also grants Attack this turn
			state.players[pi].odynActive = true;
});


register('unstealth-all', ({ state, pi, target, source, enemies, scaled }, e) => {
			for (const pl of state.players) for (const c of pl.board) {
				c.stealthed = false;
				c.tempStealth = false;
			}
});


register('agamaggan-next', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Agamaggan: the next card you play costs the OPPONENT'S Health (up to 10)
			state.players[pi].agamagganNext = true;
});


register('set-next-battlecry-double', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Murmuring Elemental: arm the next Battlecry this turn to fire twice
			state.players[pi].nextBattlecryDouble = true;
});


register('aegwynn-pass', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Aegwynn: the next minion you draw inherits Spell Damage +2 and this Deathrattle
			state.players[pi].aegwynnPending = true;
});


register('inc-pogo', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Pogo-Hopper: track how many you've played so the next gains more
			state.players[pi].pogoCount = (state.players[pi].pogoCount || 0) + 1;
});


register('sorry', ({ state, pi, target, source, enemies, scaled }, e) => {
			state.players[pi].canSaySorry = true; // Gullible Guard: it's an emote, but it's YOURS
			emit(state, { type: 'sorryUnlocked', player: pi });
});


register('extra-turn', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Timewinder Zarimi: take an extra turn after this one
			state.forcedTurns = (state.forcedTurns && state.forcedTurns.length) ? [pi, ...state.forcedTurns] : [pi];
});


register('aviana-cycle', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Aviana: three of your turns from now, the Full Moon rises
			state.players[pi].avianaAt = state.turnNumber + 3 * state.players.length;
			emit(state, { type: 'lunarCycle', player: pi });
});


register('asteroid-blast', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Asteroid: 2 damage to a random enemy, plus any Bolide boosts
			execEffects(state, pi, [{ type: 'random-damage', value: 2 + (state.players[pi].asteroidBoost || 0), count: 1, pool: 'enemies' }], null, source);
});


register('clear-graveyards', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Farewell: exile every card in every graveyard
			for (const pl of state.players) { for (const c of pl.graveyard) { c.zone = 'exile'; pl.exile.push(c); } pl.graveyard = []; }
			emit(state, { type: 'graveyardsCleared', player: pi });
});


register('devastation', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Kronx Dragonhoof: approximate Galakrond's Devastation (deal 5 to all enemies)
			execEffects(state, pi, [{ type: 'damage', value: 5, target: 'enemy-creatures' }, { type: 'damage', value: 5, target: 'enemy-heroes' }], target, source);
});


register('lotus-shots', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Lotus Troublemaker: one shot, plus one per 2 Mana spent while held
			const shots = 1 + Math.floor(((source && source._manaWhileHeld) || 0) / 2);
			execEffects(state, pi, [{ type: 'random-damage', value: 2, count: shots, pool: 'enemies' }], null, source);
});


register('hedra', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Hedra the Heretic: for each spell cast while holding this, summon a minion of that Cost
			for (const id of (source && source.spellsHeldIds) || []) {
				const cost = state.cardsById[id]?.cost || 0;
				execEffects(state, pi, [{ type: 'summon-random', cost }], null, source);
			}
});


register('install-secret', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			installSecret(state, pi, e.id);
});


register('eruption-upgrade', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			p.eruptionBonus = (p.eruptionBonus || 0) + 1; // Incindius
});


register('jar-release', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			if (source && source._heldId && state.cardsById[source._heldId]) summon(state, pi, state.cardsById[source._heldId]);
});


register('godfrey-start', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Godfrey the Betrayer: end-of-turn overflow discards come back cheaper
			state.players[pi].godfreyReturn = true;
});


register('enable-attack-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Argent Watchman: may attack this turn despite Can't Attack
			if (source) source.attackAnywayTurn = state.turnNumber;
});


register('corrupt', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// dies at the start of the caster's next turn (Corruption)
			const t = chosenCreature();
			if (t) t.corruptedBy = pi;
});


register('double-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const t = chosenCreature();
			if (t) { t.attack += t.attack; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
});


register('load-bullets', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Gattlesnake: load N bullets onto this minion (fired by its Deathrattle)
			if (source) source.bullets = (source.bullets || 0) + (e.count || 2);
});


register('random-effects', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// d4-roll hero powers: run one random option
			const opt = e.options[Math.floor(state.rng() * e.options.length)];
			execEffects(state, pi, opt, target, source);
});


register('saruun', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Saruun: Elementals in your deck gain Spell Damage +1 when drawn
			const p = state.players[pi];
			p.deckElementalSpellDamage = (p.deckElementalSpellDamage || 0) + 1;
});


register('luck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// coin flip: heads runs the effects, tails fizzles
			if (state.rng() < 0.5) execEffects(state, pi, e.effects, target, source);
			else emit(state, { type: 'luckFail', player: pi });
});


register('skip-own-next-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Endtime Murozond: the opponent takes your next turn
			const foes = opponentsOf(state, pi);
			if (foes.length) state.forcedTurns = [...(state.forcedTurns || []), foes[0], foes[0]];
});


register('dragons-rush', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].dragonsRush = true; // Ebyssian
			for (const c of state.players[pi].board) if ((c.tribe || '').includes('Dragon') && !c.keywords.includes('rush')) c.keywords.push('rush');
});


register('ship-random-gifts', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Raven (Lift Off piece), when launched: the ship gains random Bonus Effects
			if (source) for (let gi = 0; gi < (e.count || 1); gi++) applyGift(state, source, undefined, { board: true });
});


register('irida-void', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Irida: the deck departs to the Void
			const p = state.players[pi];
			p.voidPile = [...p.deck];
			p.deck = [];
			emit(state, { type: 'voidOpened', player: pi, count: p.voidPile.length });
});


register('kiljaeden', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Kil'jaeden: your deck becomes an endless portal of ever-growing Demons
			const p = state.players[pi];
			p.kiljaeden = { bonus: 0 };
			p.deck = [];
			emit(state, { type: 'kiljaeden', player: pi });
});


register('set-next-spell-double', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			state.players[pi].nextSpellDoubleCast = true; // Electra Stormsurge
			if (e.count) state.players[pi].nextSpellDoubleCount = (state.players[pi].nextSpellDoubleCount || 0) + e.count; // Tyrande: next 3 spells
});


register('make-dormant', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Maiev Shadowsong: send a chosen minion Dormant. Sunstruck Henchman:
			// target 'self' with a `chance` (50% to fall asleep each turn).
			if (e.chance != null && state.rng() >= e.chance) return;
			const t = e.target === 'self' ? source : chosenCreature();
			if (t && !isDead(t)) { t.dormantLeft = e.value || 2; emit(state, { type: 'dormant', player: t.controller, uid: t.uid, turns: t.dormantLeft }); }
});

register('lose-random-stat', ({ state, pi, source }, e) => {
			// Static Waveform: lose 1 Attack or Health (chosen randomly)
			if (!source || isDead(source)) return;
			if (state.rng() < 0.5) source.attack = Math.max(0, (source.attack || 0) - (e.value || 1));
			else source.maxHealth = Math.max(1, (source.maxHealth || 0) - (e.value || 1));
			emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
});


register('eruption-blast', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Eruption: 4 damage randomly split, +1 per upgrade
			const p = state.players[pi];
			execEffects(state, pi, [{ type: 'random-damage', value: 1, count: 4 + (p.eruptionBonus || 0), pool: 'enemies' }], null, source);
});


register('vistah-arm', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Mistah Vistah: replay every spell cast between now and 3 of your turns from now
			const p = state.players[pi];
			p.vistahAt = state.turnNumber + 3 * state.players.length;
			p.vistahSpells = p.vistahSpells || [];
});


register('nethrek-check', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Chef Neth'rek, Start of Game: an all-(3)-or-less deck surges to 10 Mana on turn five
			const p = state.players[pi];
			if (p.deck.length && p.deck.every(id => (state.cardsById[id]?.cost || 0) <= 3)) p.manaSurgeIn = 5;
});


register('alex-guardian', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Alexstrasza, Guardian of Life: Health to 15; full Health unleashes 15
			const p = state.players[pi];
			p.life = Math.min(p.life, 15);
			p.alexPayoff = true;
			emit(state, { type: 'life', player: pi, life: p.life });
});


register('double-attack-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	// LIVE first-wins semantics kept: plain double, any zone (works from hand).
	// Retired dead twin: a guarded buffCreature rewrite (doubleBuffs/statGain
	// riders would have applied) that never executed.
			if (source) { source.attack *= 2; emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) }); }
});


register('lock-minion-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Annoying Fan: chosen minion can't attack while the source is alive
			const t = chosenCreature();
			if (t && source) { t.cantAttackWhile = source.uid; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
});


register('fire-bullets', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Gattlesnake Deathrattle: fire each loaded bullet at a random enemy
			const n = (source && source.bullets) || 0;
			if (n > 0) execEffects(state, pi, [{ type: 'random-damage', value: e.value || 1, count: n, pool: 'enemies' }], null, source);
});


register('spark', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// target 'all' = every player sparks (always beneficial, so auto-taken)
			const seats = e.target === 'all' ? state.players.map((_, s2) => s2) : [pi];
			for (const s2 of seats) { state.players[s2].sparked = true; emit(state, { type: 'sparked', player: s2 }); }
});


register('awaken-imprisoned', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			if (source && source._imprisonedUid != null) {
				const t = findCreature(state, source._imprisonedUid);
				if (t && t.dormantLeft > 9000) { t.dormantLeft = 0; t.sick = true; emit(state, { type: 'awaken', player: t.controller, uid: t.uid, name: t.name }); }
			}
});


register('imprison', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Timeway Warden: the chosen enemy sleeps until this dies
			const t = chosenCreature();
			if (t && source) {
				t.dormantLeft = 9999;
				source._imprisonedUid = t.uid;
				emit(state, { type: 'dormant', player: t.controller, uid: t.uid, turns: 9999 });
			}
});


register('nethrandamus', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Nethrandamus: X grows with every friendly death this game
			const p = state.players[pi];
			const x = Math.min(10, Math.max(1, Math.floor((p.friendlyDeaths || 0) / 2) + 1));
			execEffects(state, pi, [{ type: 'summon-random', cost: x, count: 2 }], null, source);
});


register('cast-absorbed', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Crackling Cloudstrider's Deathrattle: cast the spell it swallowed
			if (source && source._absorbedId) {
				const def = state.cardsById[source._absorbedId];
				if (def && def.effects) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), null, null);
			}
});


register('cenarius-thrice', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Forest Lord Cenarius: three sequential picks between his two boons
			for (let n = 0; n < 3; n++) {
				state.pickQueue.push({ player: pi, ids: ['cenarius_might', 'cenarius_ancient'], cenarius: true });
			}
			emit(state, { type: 'pickStart', player: pi, count: 2 });
});


register('fireworks', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Fireworks Tech: give a chosen friendly Mech +1/+1; if it has a Deathrattle, trigger it
			const t = chosenCreature();
			if (t) {
				buffCreature(t, e.attack || 1, e.health || 1);
				if (t.deathrattle && t.deathrattle.length) runDeathrattle(state, t.controller, t);
			}
});


register('awaken-darkness', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// The Darkness's Candle: wake any dormant Darkness on the board
			for (const pl of state.players) for (const c of pl.board) {
				if (c.name === 'The Darkness' && c.dormantLeft > 0) { c.dormantLeft = 0; emit(state, { type: 'awaken', uid: c.uid, player: c.controller }); }
			}
});


register('tocha-42', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Mystified Tocha: if combined hero Health is exactly 42, set yours to 42
			const p = state.players[pi];
			const total = state.players.reduce((s, pl) => s + (pl.eliminated ? 0 : pl.life), 0);
			if (total === 42) { p.life = 42; emit(state, { type: 'life', player: pi, life: 42 }); }
});


register('reduce-highest-hand-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Shivering Sorceress: reduce the Cost of the highest-Cost spell in your hand
			let best = null; for (const c of state.players[pi].hand) if (isSpellType(c) && (!best || (c.cost || 0) > (best.cost || 0))) best = c;
			if (best) best.cost = Math.max(0, (best.cost || 0) - (e.value || 1));
});


register('haunt-hand-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Haunting Nightmare: mark a random card in your hand; playing it summons a token
			const p = state.players[pi];
			const pool = p.hand.filter(c => c !== source && !c.hauntSummon);
			if (pool.length) pool[Math.floor(state.rng() * pool.length)].hauntSummon = e.summonId || 'rlk_soldier';
});


register('air-support', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Air Support: Mega-Windfury, but never at heroes
			const t = chosenCreature();
			if (t) {
				t.megaWindfury = true; t.noFace = true;
				if (!t.keywords.includes('windfury')) t.keywords.push('windfury');
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
});


register('infinitize', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// P.M.M. Infinitizer: set a friendly minion to 8/8; it can't hit heroes this turn
			const t = chosenCreature();
			if (t) {
				t.attack = 8; t.maxHealth = 8; t.damage = 0;
				t.noFaceTurn = state.turnNumber;
				emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) });
			}
});


register('cast-secret-from-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Sparkjoy Cheat: cast a Secret from your hand (install it), then run `then`
			const p = state.players[pi];
			const si = p.hand.findIndex(c => c.secret);
			if (si >= 0) { const [c] = p.hand.splice(si, 1); installSecret(state, pi, c.id); if (e.then) execEffects(state, pi, e.then, target, source); }
});


register('crewmate-adjoin', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Crewmates: summon every Crewmate adjoining this one (a run at the top of your deck)
			const p = state.players[pi];
			while (p.deck.length && ((state.cardsById[p.deck[p.deck.length - 1]]?.name) || '').includes('Crewmate')) {
				const id = p.deck.pop();
				summon(state, pi, state.cardsById[id]);
			}
});


register('nythendra-split', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Nythendra: split into Beetles; she reforms from the survivors next turn
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 4); n++) if (state.cardsById['nythendra_beetle']) summon(state, pi, state.cardsById['nythendra_beetle']);
			p.nythendraReformAt = state.turnNumber + state.players.length;
});


register('stalk-strike', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Xhilag's Stalk: deal its escalating power to a random enemy creature
			const dmg = (source && source.partPower) || 2;
			const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c)));
			if (pool.length) damageCreature(state, pool[Math.floor(state.rng() * pool.length)], dmg, source || null);
});


register('hematurge', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Hematurge: spend a Corpse to Discover a Death Knight card
			const p = state.players[pi];
			if ((p.corpses || 0) >= 1) {
				spendCorpses(state, pi, 1);
				emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
				execEffects(state, pi, [{ type: 'discover', cardClasses: ['deathknight'] }], null, source);
			}
});


register('ancient-regurgitate', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			const p = state.players[pi];
			if (source && source._eaten) for (const id of source._eaten) {
				if (p.hand.length >= MAX_HAND || !state.cardsById[id]) break;
				const c = instantiate(state.cardsById[id], pi); c.zone = 'hand'; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
});


register('cast-enemy-last-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Asvedon: cast a copy of the last spell your opponent played
			const foe = enemies[0];
			const last = foe != null ? state.players[foe].lastSpellPlayed : null;
			if (last && state.cardsById[last.id]) execEffects(state, pi, JSON.parse(JSON.stringify(state.cardsById[last.id].effects || [])), last.target || null, source);
});


register('set-hand-minions-to-higher-stat', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Divine Augur: set the Attack and Health of every minion in your hand to the higher of the two
			for (const c of state.players[pi].hand) if (c.type === 'creature') { const hi = Math.max(c.attack || 0, c.maxHealth || 0); c.attack = hi; c.maxHealth = hi; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
});


register('give-attack-to-random-friendly', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Fiendish Servant: hand this minion's Attack to a random friendly minion
			const atk = source ? (source.attack || 0) : 0;
			const pool = state.players[pi].board.filter(c => c !== source && !isDead(c) && c.type !== 'location');
			if (atk > 0 && pool.length) buffCreature(pool[Math.floor(state.rng() * pool.length)], atk, 0);
});


register('hammer-grow-return', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// High King's Hammer breaks: shuffle it back with +2 Attack permanently
			const p = state.players[pi];
			p.hammerBonus = (p.hammerBonus || 0) + 2;
			p.deck.push('high_kings_hammer');
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
});


register('bulb-give', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Cultivating Sprite: an upgrading Bulb
			const p = state.players[pi];
			if (state.cardsById['sprite_bulb'] && p.hand.length < MAX_HAND) {
				const c = instantiate(state.cardsById['sprite_bulb'], pi); c.zone = 'hand'; c._bulbLevel = 1;
				p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
});


register('remove-enemy-stealth', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Streetwise Investigator: enemy creatures lose Stealth
			for (const o of enemies) for (const c of state.players[o].board) {
				if (c.stealthed || c.keywords.includes(KW.STEALTH)) { c.stealthed = false; c.keywords = c.keywords.filter(k => k !== KW.STEALTH); emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
			}
});


register('blade-flurry', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
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
});


register('qonzu-give', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Qonzu: hand the discovered spell to the opponent's deck top
			const p = state.players[pi];
			const hi = p.hand.findIndex(c => c.uid === e.uid);
			if (hi >= 0) {
				const [c] = p.hand.splice(hi, 1);
				for (const o of enemies) { state.players[o].deck.push(c.id); break; }
				emit(state, { type: 'discard', player: pi, card: c });
			}
});


register('chromatic-egg', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Chromatic Egg: remember a random Dragon; Deathrattle hatches it
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.tribe || '').includes('Dragon') && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
			if (pool.length && source) source.hatchId = pool[Math.floor(state.rng() * pool.length)].id;
} });


register('replay-last-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Conniving Conman: replay the last card you played (approx: your most recent card)
			const id = state.players[pi].lastCardPlayedId;
			const def = id && state.cardsById[id];
			if (def) { if (isSpellType(def)) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects || [])), null, source); else if (def.type === 'creature') summon(state, pi, def); }
} });


register('murozond-thief', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Murozond, Thief of Time: no-duplicates deck -> Discover a Dragon that nukes
			const p = state.players[pi];
			const ids = p.deck.filter(id => state.cardsById[id]);
			if (new Set(ids).size === ids.length && ids.length > 0) {
				execEffects(state, pi, [{ type: 'discover', cardType: 'creature', tribe: 'Dragon', damageAllByCost: true }], null, source);
			}
} });


register('sylvanas-volley', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ranger-General Sylvanas: 2 damage to all enemies, repeated per Windrunner played
			const p = state.players[pi];
			const extra = ['alleria_windrunner', 'vereesa_windrunner'].reduce((s, id) => s + (p.playedCountById?.[id] || 0), 0);
			for (let n = 0; n < 1 + extra; n++) execEffects(state, pi, [{ type: 'damage', value: 2, target: 'enemies' }], null, source);
} });


register('may', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// optional "you may …": defer a yes/no to the controller. The UI (or AI)
			// resolves it via resolveAsk, running `then` on yes / `else` on no.
			state.askQueue.push({ player: pi, prompt: e.prompt || '', yes: e.yes || 'Yes', no: e.no || 'No',
				then: e.then || [], else: e.else || [] });
			emit(state, { type: 'askStart', player: pi, prompt: e.prompt || '' });
} });


register('secrets-to-soldiers', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Cannonmaster Smythe: transform your Secrets into 3/3 Soldiers
			const p = state.players[pi];
			const n = p.secrets.length; p.secrets = [];
			for (let i = 0; i < n; i++) summon(state, pi, { id: e.summonId || 'bar_soldier', name: e.name || 'Soldier', type: 'creature', cost: 3, token: true, rarity: 'common', attack: 3, health: 3, description: 'A 3/3 Soldier.' });
} });


register('return-remembered-spells', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Primalfin Champion: return the spells cast on it to your hand
			const p = state.players[pi];
			for (const id of (source?.rememberedSpells || [])) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[id]; if (def) { const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); } }
} });


register('argus-start', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Broxigar, Start of Game: he disappears; the First Portal takes his deck slot
			const p = state.players[pi];
			const bi = p.deck.indexOf('broxigar');
			if (bi >= 0) { p.deck.splice(bi, 1); p.deck.push('first_portal_to_argus'); for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; } }
} });


register('return-self-to-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// "Deathrattle: Return this to your hand" — a fresh copy comes back
			const p = state.players[pi];
			const def = source && state.cardsById[source.id];
			if (def && !p.eliminated && p.hand.length < MAX_HAND) {
				const card = instantiate(def, pi);
				card.zone = 'hand';
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			}
} });


register('excavate', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// REVIVED: the second branch was the REAL tiered Excavate (Badlands
	// progression + class Azerite legendaries), written for the faithful-flags
	// upgrade but shadowed by the earlier random-Treasure approximation — all
	// 27 data uses silently got the approx. The tiered path is now primary;
	// e.id keeps the old conjure-a-specific-treasure escape hatch (no card
	// data uses it today).
	if (e.id) {
				// Excavate (approx): add a random Treasure spell to your hand
				const p = state.players[pi];
				if (p.hand.length < MAX_HAND && state.cardsById[e.id || 'ww_treasure']) { const cp = instantiate(state.cardsById[e.id || 'ww_treasure'], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); p.excavateCount = (p.excavateCount || 0) + 1; }
		return;
	}
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
} });


register('short-turns', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Nozdormu the Eternal: both decks hold him -> 15-second turns (client honors)
			if (opponentsOf(state, pi).some(o => state.players[o].deck.includes('nozdormu_the_eternal'))
				|| state.players.some((pl, i) => i !== pi && pl.hand.some(c => c.id === 'nozdormu_the_eternal'))) {
				if (!state.shortTurns) { state.shortTurns = true; emit(state, { type: 'shortTurns' }); }
			}
} });


register('install-random-secrets', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Observer of Mysteries: install N random Secrets
			const pool = Object.values(state.cardsById).filter(d => d.secret && !d.token && d.collectible !== false && !state.players[pi].secrets.some(s => s.id === d.id));
			for (let n = 0; n < (e.count || 2) && pool.length; n++) { const [def] = pool.splice(Math.floor(state.rng() * pool.length), 1); installSecret(state, pi, def.id); }
} });


register('return-last-turn-spells', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Krag'wa, the Frog: return all spells you played last turn to your hand
			const p = state.players[pi];
			for (const id of (p.spellsPlayedLastTurnIds || [])) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[id]; if (def) { const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); } }
} });


register('holmes-investigate', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Inspector Murloc Holmes: name a card; if they play it next turn, 3 Coins
			const foe = enemies[0];
			if (foe != null && state.players[foe].hand.length) {
				const ids = [...new Set(state.players[foe].hand.map(c => c.id))].slice(0, 3);
				state.pickQueue.push({ player: pi, ids, holmes: true });
				emit(state, { type: 'pickStart', player: pi, count: ids.length });
			}
} });


register('shadowflame', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// sacrifice a friendly creature, its attack burns every enemy creature
			const t = chosenCreature();
			if (t && t.controller === pi) {
				const dmg = t.attack;
				t.damage = t.maxHealth;
				t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
				for (const o of enemies) for (const c of [...state.players[o].board]) damageCreature(state, c, dmg, null);
			}
} });


register('jandice-barov', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Jandice Barov: summon two random 5-Cost minions; one secretly dies when damaged
			const before = state.players[pi].board.length;
			execEffects(state, pi, [{ type: 'summon-random', cost: 5, count: 2 }], null, source);
			const fresh = state.players[pi].board.slice(before).filter(c => !isDead(c));
			if (fresh.length) fresh[Math.floor(state.rng() * fresh.length)].diesOnDamage = true;
} });


register('jailer-return', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			if (source && source._jailedId != null && state.cardsById[source._jailedId]) {
				const op = state.players[source._jailedOwner];
				if (op && op.hand.length < MAX_HAND) {
					const c = instantiate(state.cardsById[source._jailedId], source._jailedOwner);
					c.zone = 'hand'; op.hand.push(c);
					emit(state, { type: 'conjure', player: source._jailedOwner, card: c, color: null });
				}
			}
} });


register('force-all-enemies-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Festival Security (Finale): force all enemy minions to attack this
			if (source && !isDead(source)) { for (const o of enemies) { for (const c of [...state.players[o].board]) { if (isDead(source)) break; if (!isDead(c) && !c.frozen && c.attack > 0 && c.type !== 'location' && c.dormantLeft <= 0) resolveCombat(state, o, c.uid, { type: 'creature', uid: source.uid, player: source.controller }); } } }
} });


register('argus-final', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// the last Fleeing Demon fell: Broxigar reappears in his owner's hand
			for (const o of enemies) {
				const op = state.players[o];
				if (state.cardsById['broxigar'] && op.hand.length < MAX_HAND) {
					const bx = instantiate(state.cardsById['broxigar'], o);
					bx.zone = 'hand'; op.hand.push(bx);
					emit(state, { type: 'conjure', player: o, card: bx, color: null });
				}
				break;
			}
} });


register('augur-peek', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ancient Augur: secretly mark one of 3 enemy hand cards for the Deathrattle
			const foe = enemies[0];
			if (foe != null && state.players[foe].hand.length) {
				const ids = [...new Set(state.players[foe].hand.map(c => c.id))].slice(0, 3);
				state.pickQueue.push({ player: pi, ids, augurUid: source ? source.uid : null });
				emit(state, { type: 'pickStart', player: pi, count: ids.length });
			}
} });


register('add-random-lich-king', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// The Lich King: add a random Lich King card to your hand
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.lichKingCard);
			if (pool.length && p.hand.length < MAX_HAND) {
				const c = instantiate(pool[Math.floor(state.rng() * pool.length)], pi);
				c.zone = 'hand'; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
} });


register('switch-sides', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Disguised trio: this minion joins the OPPONENT'S board
			const p = state.players[pi];
			if (source && p.board.includes(source)) {
				for (const o of enemies) {
					p.board = p.board.filter(c => c !== source);
					source.controller = o;
					state.players[o].board.push(source);
					emit(state, { type: 'defected', uid: source.uid, player: o });
					recomputeAuras(state);
					break;
				}
			}
} });


register('reduce-highest-school-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Shadowborn: reduce the Cost of the highest-Cost spell of a school in your hand
			const p = state.players[pi];
			let best = null;
			for (const c of p.hand) { if (isSpellType(c) && (!e.school || schoolOf(c) === e.school)) { if (!best || (c.cost || 0) > (best.cost || 0)) best = c; } }
			if (best) { best.cost = Math.max(0, (best.cost || 0) - (e.value || 3)); emit(state, { type: 'costChanged', uid: best.uid }); }
} });


register('rafaam-wincon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Timethief Rafaam: if you played all 9 other Rafaams, destroy the enemy hero
			const p = state.players[pi];
			const nine = ['tiny_rafaam', 'green_rafaam', 'explorer_rafaam', 'warchief_rafaam', 'mindflayer_rfaam', 'calamitous_rafaam', 'giant_rafaam', 'murloc_rafaam', 'archmage_rafaam'];
			if (nine.every(id => (p.playedCountById?.[id] || 0) >= 1)) {
				for (const o of enemies) damageHero(state, o, 9999, pi);
			}
} });


register('give-enemy-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Hoarding Dragon: add copies of a card to each opponent's hand
			const def = state.cardsById[e.id];
			if (def) for (const o of enemies) {
				for (let i = 0; i < (e.count || 1); i++) {
					if (state.players[o].hand.length >= MAX_HAND) break;
					const card = instantiate(def, o); card.zone = 'hand'; state.players[o].hand.push(card);
					emit(state, { type: 'conjure', player: o, card, color: null });
				}
			}
} });


register('gem-return', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Gemstone Hoarder's Deathrattle: the stashed card returns at (1) less
			const p = state.players[pi];
			if (source && source._gemId && state.cardsById[source._gemId] && p.hand.length < MAX_HAND) {
				const c = instantiate(state.cardsById[source._gemId], pi);
				c.zone = 'hand'; c.cost = Math.max(0, (c.cost || 0) - 1);
				p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
} });


register('curse-enemy-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Chaos Gazer: curse a card in the opponent's hand; if unplayed by the
			// end of their next turn, they take damage (resolved in endTurn)
			const foe = enemies[0];
			if (foe != null) { const h = state.players[foe].hand.filter(c => !c.cursed); if (h.length) { const cc = h[Math.floor(state.rng() * h.length)]; cc.cursed = true; cc.curseDamage = e.value || 3; emit(state, { type: 'cursed', player: foe, uid: cc.uid }); } }
} });


register('add-random-junk', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Dust Bunny: add a random piece of junk to your hand
			const junk = e.ids || ['coin', 'wwb_rock', 'banana', 'wwb_knife'];
			const p = state.players[pi];
			if (p.hand.length < MAX_HAND) { const id = junk[Math.floor(state.rng() * junk.length)]; if (state.cardsById[id]) { const cp = instantiate(state.cardsById[id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } }
} });


register('attack-lowest-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lady S'theno: attack the lowest-Health enemy minion
			if (source && !isDead(source)) {
				let best = null, bo = -1;
				for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location' && !c.stealthed && c.dormantLeft <= 0) { if (!best || hp(c) < hp(best)) { best = c; bo = o; } }
				if (best) resolveCombat(state, pi, source.uid, { type: 'creature', uid: best.uid, player: bo });
			}
} });


register('xortoth-stars', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Xortoth: a Star at each end of your hand; they collide when adjacent
			const p = state.players[pi];
			if (state.cardsById['xortoth_star']) {
				const s1 = instantiate(state.cardsById['xortoth_star'], pi); s1.zone = 'hand';
				const s2 = instantiate(state.cardsById['xortoth_star'], pi); s2.zone = 'hand';
				p.hand.unshift(s1); p.hand.push(s2);
				emit(state, { type: 'conjure', player: pi, card: s2, color: null });
			}
} });


register('argus-next', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// a Fleeing Demon died (pi = its controller): Broxigar's owner (the enemy)
			// draws a card and gets the next Portal shuffled into their deck
			for (const o of enemies) {
				drawCards(state, o, 1);
				const op = state.players[o];
				op.deck.push(e.portal);
				for (let i = op.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [op.deck[i], op.deck[j]] = [op.deck[j], op.deck[i]]; }
				break;
			}
} });


register('relic-mine', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Relic Miner: destroy your top card, Discover one of the same Rarity
			const p = state.players[pi];
			if (p.deck.length) {
				const id = p.deck.pop();
				const def = state.cardsById[id];
				if (def) {
					toGraveyard(state, pi, instantiate(def, pi));
					emit(state, { type: 'milled', player: pi, name: def.name });
					execEffects(state, pi, [{ type: 'discover', rarity: def.rarity || 'common' }], null, source);
				}
			}
} });


register('leyline-give', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ley Walker's Deathrattle: get a random Leyline
			const p = state.players[pi];
			const LEYS = ['leyline_of_flame', 'leyline_of_frost', 'leyline_of_arcana'];
			const id = LEYS[Math.floor(state.rng() * LEYS.length)];
			if (state.cardsById[id] && p.hand.length < MAX_HAND) {
				const c = instantiate(state.cardsById[id], pi); c.zone = 'hand'; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
} });


register('ursol', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ursol: your highest-Cost hand spell becomes a 3-turn Aura (casts at your turn ends)
			const p = state.players[pi];
			const spells = p.hand.filter(c => isSpellType(c));
			if (spells.length) {
				const top = spells.reduce((b, c) => ((c.cost || 0) > (b.cost || 0) ? c : b));
				p.hand = p.hand.filter(c => c !== top);
				p.ursolAura = { id: top.id, left: 3 };
				emit(state, { type: 'ursolAura', player: pi, name: top.name });
			}
} });


register('set-next-tribe-play-reward', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// The Great Dark Beyond Draenei: your next N minions of a tribe gain stats/keyword/immediate-attack when PLAYED
			state.players[pi].nextTribePlayReward = { tribe: e.tribe || 'Draenei', count: e.count || 1, attack: e.attack || 0, health: e.health || 0, keyword: e.keyword || null, immediateAttack: !!e.immediateAttack, summonCopy: !!e.summonCopy, refreshManaByAttack: !!e.refreshManaByAttack, heroAttackByOwnAttack: !!e.heroAttackByOwnAttack };
} });


register('cast-last-onfriendly-on-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Sunwing Squawker: recast the last spell you cast on a friendly minion, on this
			const p = state.players[pi];
			const ids = p.spellsOnFriendly || [];
			const id = ids[ids.length - 1];
			const def = id && state.cardsById[id];
			if (def && def.effects && source && source.zone === 'board' && !isDead(source)) {
				execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), { type: 'creature', uid: source.uid, player: pi }, source);
			}
} });


register('garona-llane', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Garona: if your opponent is holding King Llane, destroy him and halve their Health
			for (const o of enemies) {
				const op = state.players[o];
				const li = op.hand.findIndex(c => c.id === 'king_llane');
				if (li >= 0) {
					const [llane] = op.hand.splice(li, 1);
					emit(state, { type: 'discard', player: o, card: llane });
					op.life = Math.ceil(op.life / 2);
					emit(state, { type: 'life', player: o, life: op.life });
				}
			}
} });


register('underbelly-stock', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// King of the Underbelly: three contraband Beasts are chosen at game start
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(dd => dd.type === 'creature' && (dd.tribe || '').includes('Beast') && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length));
			p.contraband = [];
			for (let n = 0; n < 3 && pool.length; n++) p.contraband.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0].id);
} });


register('shaffar', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Nexus-Prince Shaffar: +3/+3 to a hand minion, which inherits this Spellburst
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature');
			if (pool.length) {
				const c = pool[Math.floor(state.rng() * pool.length)];
				c.attack += 3; c.maxHealth += 3;
				c.ongoing = { on: 'spell-played', once: true, effects: [{ type: 'shaffar' }] };
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
} });


register('cast-remembered-on-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lynessa Sunsorrow: recast every spell you cast on your creatures this game onto this one
			const p = state.players[pi];
			if (source && p.spellsOnFriendly) for (const id of [...p.spellsOnFriendly]) {
				const def = state.cardsById[id];
				if (def && def.effects && source.zone === 'board' && !isDead(source)) {
					execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), { type: 'creature', uid: source.uid, player: pi }, source);
				}
			}
} });


register('emblem', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('godfrey-loop', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('add-from-opening-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Starlight Whelp: add a random card from your starting hand to your hand
			const p = state.players[pi];
			const pool = (p.openingHand || []).filter(id => state.cardsById[id]);
			for (let n = 0; n < (e.count || 1) && pool.length && p.hand.length < MAX_HAND; n++) { const id = pool[Math.floor(state.rng() * pool.length)]; const cp = instantiate(state.cardsById[id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });


register('attack-random-enemy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// The Black Blood: swing at a random enemy creature (count -> Trenchstalker: 3 different)
			const hit = new Set();
			for (let i = 0; i < (e.count || 1); i++) {
				if (!source || isDead(source)) break;
				const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location' && !hit.has(c.uid)).map(c => ({ type: 'creature', uid: c.uid, player: c.controller })));
				if (e.includeHero) for (const o of enemies) if (!state.players[o].eliminated) pool.push({ type: 'hero', player: o }); // Kobold Barbarian: "a random enemy" can be the hero
				if (!pool.length) break;
				const t = pool[Math.floor(state.rng() * pool.length)];
				if (t.uid != null) hit.add(t.uid);
				resolveCombat(state, pi, source.uid, t);
				sweepDeaths(state);
			}
} });


register('tolins', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Tolin's Goblet: draw a card, fill your hand with copies of it
			const p = state.players[pi];
			const before = p.hand.length;
			drawCards(state, pi, 1);
			if (p.hand.length > before) {
				const c = p.hand[p.hand.length - 1];
				const def = state.cardsById[c.id];
				const limit = e.count != null ? Math.min(MAX_HAND, p.hand.length + e.count) : MAX_HAND; // Thistle Tea: exactly `count` extra copies
				while (def && p.hand.length < limit) {
					const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp);
					emit(state, { type: 'conjure', player: pi, card: cp, color: null });
				}
			}
} });


register('floop-refresh-on-death', ({ state, pi }) => { {
			// Floop's Glorious Gloop: this turn, refresh a Mana Crystal whenever a minion dies
			state.players[pi].floopRefreshTurn = state.turnNumber;
} });


register('stampede-turn', ({ state, pi }) => { {
			// Stampede: this turn, playing a Beast adds a random Beast to your hand
			state.players[pi].stampedeTurn = state.turnNumber;
} });


register('install-random-secret', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Professor Putricide: install a random secret (optionally of a class)
			const installed = new Set(state.players[pi].secrets.map(s => s.id));
			const pool = Object.values(state.cardsById).filter(d => d.secret && !d.token
				&& d.collectible !== false && !(d.colors && d.colors.length)
				&& (!e.cardClass || (d.cardClass || 'neutral') === e.cardClass)
				&& !installed.has(d.id));
			if (pool.length) installSecret(state, pi, pool[Math.floor(state.rng() * pool.length)].id);
} });


register('lock-enemy-hand-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Coilfang Constrictor: random enemy hand cards can't be played next turn
			// (Renferal: one more per card you played this turn)
			const foe = enemies[0];
			const locks = (e.count || 1) + (e.plusPlayedThisTurn ? (state.players[pi].cardsPlayedThisTurn || 0) : 0);
			if (foe != null) { const fh = [...state.players[foe].hand]; for (let n = 0; n < locks && fh.length; n++) { const i = Math.floor(state.rng() * fh.length); const c = fh.splice(i, 1)[0]; c.lockedUntilTurn = state.turnNumber + 2; } }
} });


register('plunder', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('attack-flanks', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Kurtrus Ashfallen: attack the left- and right-most enemy minions
			if (source && !isDead(source)) {
				for (const o of enemies) {
					const board = state.players[o].board.filter(c => !isDead(c) && c.type !== 'location' && c.dormantLeft <= 0);
					const targets = [...new Set([board[0], board[board.length - 1]])].filter(Boolean);
					for (const t of targets) { if (!isDead(source) && !isDead(t)) resolveCombat(state, pi, source.uid, { type: 'creature', uid: t.uid, player: o }); }
				}
			}
} });


register('add-random-combo-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Disc Jockey (Combo): add a random card with Combo to your hand
			const pool = Object.values(state.cardsById).filter(d => (d.keywords || []).includes('combo') && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
			const p = state.players[pi];
			if (pool.length && p.hand.length < MAX_HAND) { const def = pool[Math.floor(state.rng() * pool.length)]; const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });


register('runi-future', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Runi: hand minions leave for 2 turns and return with +5/+5
			const p = state.players[pi];
			const going = p.hand.filter(c => c.type === 'creature' && c !== source);
			if (going.length) {
				p.hand = p.hand.filter(c => !going.includes(c));
				p.futureCards = p.futureCards || [];
				for (const c of going) { c.attack += 5; c.maxHealth += 5; p.futureCards.push({ card: c, at: state.turnNumber + 2 * state.players.length }); }
				emit(state, { type: 'sentToFuture', player: pi, count: going.length });
			}
} });


register('bulb-cast', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// the Bulb casts three random spells of its level's Cost
			const lvl = (source && source._bulbLevel) || 1;
			const pool = Object.values(state.cardsById).filter(dd => isSpellType(dd) && (dd.cost || 0) === lvl && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length) && dd.effects);
			for (let n = 0; n < 3 && pool.length; n++) {
				const def = pool[Math.floor(state.rng() * pool.length)];
				execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), null, null);
				if (state.over) return;
			}
} });


register('lothar', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lothar: attack a random enemy minion; if it dies, gain +3/+3
			if (source && !isDead(source)) {
				const pool = enemies.flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location' && !c.stealthed && c.dormantLeft <= 0).map(c => ({ o, c })));
				if (pool.length) { const { o, c } = pool[Math.floor(state.rng() * pool.length)]; resolveCombat(state, pi, source.uid, { type: 'creature', uid: c.uid, player: o }); if (isDead(c) && !isDead(source)) buffCreature(source, e.attack || 3, e.health || 3); }
			}
} });


register('enigma-secrets', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Faceless Enigma: pick 1 of 2 Secrets; the other casts for your opponent
			const pool = Object.values(state.cardsById).filter(dd => dd.secret && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length));
			const ids = [];
			for (let i = 0; i < 2 && pool.length; i++) ids.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0].id);
			if (ids.length === 2) {
				state.pickQueue.push({ player: pi, ids, enigmaFoe: enemies[0] ?? null });
				emit(state, { type: 'pickStart', player: pi, count: 2 });
			}
} });


register('blackwing-bolt', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Blackwing Experiment: a 2-Cost spell dealing this minion's Attack
			const p = state.players[pi];
			const v = source ? (source.attack || 3) : 3;
			if (p.hand.length < MAX_HAND) {
				const c = instantiate({ id: 'token_blackwing_bolt', name: 'Blackwing Bolt', type: 'sorcery', cost: 2, rarity: 'common', token: true, description: `Deal ${v} damage.`, effects: [{ type: 'damage', value: v, target: 'any' }] }, pi);
				c.zone = 'hand'; p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
} });


register('templar-merge', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Dark/High Templar: with the other Templar in play, they merge into an Archon
			const p = state.players[pi];
			const otherId = e.other;
			const mate = p.board.find(c => c.id === otherId && !isDead(c));
			if (source && mate && state.cardsById['sc_archon']) {
				p.board = p.board.filter(c => c !== source && c !== mate);
				source.zone = 'gone'; mate.zone = 'gone';
				emit(state, { type: 'transformed', uid: source.uid, player: pi, from: source.name, card: null });
				summon(state, pi, state.cardsById['sc_archon']);
			}
} });


register('swipe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('attack-random-enemies', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Verdant Dreamsaber: attack N random enemy minions (mutual damage)
			if (source && !isDead(source)) for (let n = 0; n < (e.count || 1); n++) {
				if (isDead(source)) break;
				const pool = [];
				for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location' && c.dormantLeft <= 0) pool.push(c);
				if (!pool.length) break;
				const t = pool[Math.floor(state.rng() * pool.length)];
				damageCreature(state, t, source.attack, source);
				damageCreature(state, source, t.attack, t);
			}
} });


register('mugzee-check', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mug'Zee, Start of Game: all-spell deck -> Mug's Magic; all-minion -> Zee's Might
			const p = state.players[pi];
			const others = p.deck.map(id => state.cardsById[id]).filter(Boolean).filter(d => d.id !== 'mugzee');
			if (others.length && !others.some(d => d.type === 'creature')) { p.mugMagic = true; emit(state, { type: 'heroPowerPassive', player: pi, name: "Mug's Magic" }); }
			if (others.length && !others.some(d => isSpellType(d))) { p.zeeMight = true; emit(state, { type: 'heroPowerPassive', player: pi, name: "Zee's Might" }); }
} });


register('kelidan', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Keli'dan the Breaker: destroy a minion; if drawn this turn, destroy all others instead
			if (source && source.drawnThisTurn) {
				for (const pl of state.players) for (const c of [...pl.board]) if (c !== source && !isDead(c) && c.type !== 'location') { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
				sweepDeaths(state);
			} else {
				const t = chosenCreature();
				if (t) { t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); sweepDeaths(state); }
			}
} });


register('steal-until-bigger', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('etc-rock', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Elite Tauren Chieftain: both players get the power to ROCK!
			const CHORDS = ['power_chord_murloc', 'power_chord_rogues', 'power_chord_horde'];
			for (let s2 = 0; s2 < state.players.length; s2++) {
				const pl = state.players[s2];
				const id = CHORDS[Math.floor(state.rng() * CHORDS.length)];
				if (state.cardsById[id] && pl.hand.length < MAX_HAND && !pl.eliminated) {
					const c = instantiate(state.cardsById[id], s2); c.zone = 'hand'; pl.hand.push(c);
					emit(state, { type: 'conjure', player: s2, card: c, color: null });
				}
			}
} });


register('dungar-travel', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Travelmaster Dungar: three deck minions from different expansions
			const p = state.players[pi];
			const seen = new Set();
			for (let n = 0; n < 3; n++) {
				const idxs = p.deck.map((id, i) => [id, i]).filter(([id]) => { const dd = state.cardsById[id]; return dd?.type === 'creature' && !dd.token && !seen.has(dd.set || '?'); });
				if (!idxs.length) break;
				const [id, i] = idxs[Math.floor(state.rng() * idxs.length)];
				p.deck.splice(i, 1);
				seen.add(state.cardsById[id].set || '?');
				summon(state, pi, state.cardsById[id]);
			}
} });


register('varian', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Varian: draw a Rush minion to gain Rush; repeat for Taunt and Divine Shield
			const p = state.players[pi];
			for (const kw of ['rush', 'taunt', 'divine_shield']) {
				const before = new Set(p.hand.map(c => c.uid));
				execEffects(state, pi, [{ type: 'tutor', cardType: 'creature', requireKeyword: kw, count: 1 }], null, source);
				const drawn = p.hand.find(c => !before.has(c.uid));
				if (drawn && source && !isDead(source) && !source.keywords.includes(kw)) { source.keywords.push(kw); if (kw === 'divine_shield') source.shield = true; }
			}
} });


register('cthun-blast', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// C'Thun's Battlecry: damage equal to its Attack, split among all enemies
			let hits = source ? source.attack : (CTHUN_BASE + state.players[pi].cthunAtk);
			for (; hits > 0; hits--) {
				const pool = [];
				for (const o of enemies) { for (const c of state.players[o].board) if (!isDead(c)) pool.push({ c }); pool.push({ hero: o }); }
				if (!pool.length) break;
				const pick = pool[Math.floor(state.rng() * pool.length)];
				if (pick.hero != null) damageHero(state, pick.hero, 1, pi); else damageCreature(state, pick.c, 1, source || null);
			}
} });


register('blade-of-cthun', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Blade of C'Thun: destroy a creature, add its Attack/Health to C'Thun
			const t = chosenCreature();
			if (t) {
				const a = t.attack, h2 = t.maxHealth;
				t.damage = t.maxHealth; t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
				const p = state.players[pi];
				p.cthunAtk += a; p.cthunHp += h2;
			for (const ey of p.board) if (ey.cthunLink && !isDead(ey)) { ey.attack += a; ey.maxHealth += h2; emit(state, { type: 'buff', uid: ey.uid, attack: ey.attack, hp: hp(ey) }); } // Eyestalk of C'Thun
				syncCthun(state, pi);
			}
} });


register('hand-mixer', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Togwaggle, Smuggler King: shuffle both players' hands together and redeal
			const all = [];
			const counts = state.players.map(pl => { all.push(...pl.hand); return pl.hand.length; });
			for (const pl of state.players) pl.hand = [];
			for (let i = all.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [all[i], all[j]] = [all[j], all[i]]; }
			state.players.forEach((pl, idx) => {
				for (let k = 0; k < counts[idx]; k++) { const c = all.pop(); if (c) { c.controller = idx; pl.hand.push(c); } }
			});
			emit(state, { type: 'handsMixed' });
} });


register('throw-hand-minion', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Party Crasher: throw a random minion from your hand at a chosen enemy (they trade damage)
			const t = chosenCreature();
			const p = state.players[pi];
			const minionsInHand = p.hand.filter(c => c.type === 'creature');
			if (t && minionsInHand.length) {
				const m = minionsInHand[Math.floor(state.rng() * minionsInHand.length)];
				p.hand = p.hand.filter(c => c !== m);
				if (!m.token) p.discardLogIds.push(m.id);
				damageCreature(state, t, m.attack || 0, null);
				if (source && !isDead(source)) damageCreature(state, source, t.attack || 0, null);
			}
} });


register('eyes-in-the-sky', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// look at 3 cards in the enemy's deck; the pick goes on top
			const foe = enemies[0];
			if (foe != null) {
				const op = state.players[foe];
				const ids = [];
				const idxs = op.deck.map((_, i) => i);
				for (let i = 0; i < 3 && idxs.length; i++) {
					const k = idxs.splice(Math.floor(state.rng() * idxs.length), 1)[0];
					if (!ids.includes(op.deck[k])) ids.push(op.deck[k]);
				}
				if (ids.length) {
					state.pickQueue.push({ player: pi, ids, enemyDeckTop: foe });
					emit(state, { type: 'pickStart', player: pi, count: ids.length });
				}
			}
} });


register('mind-control-temp', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('fight', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('force-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Behemoth's Lure: force a random enemy to attack the Behemoth (parent)
			const magnet = source && source.colossalOf ? (state.players[pi].board.find(c => !isDead(c) && c.name === source.colossalOf) || source) : source;
			if (magnet && !isDead(magnet)) {
				const pool = enemies.flatMap(o => state.players[o].board.filter(c =>
					!isDead(c) && !c.frozen && c.attack > 0));
				if (e.all) { // Mythical Terror: force ALL enemy creatures to attack the source
					for (const a of pool) { if (isDead(magnet) || isDead(a)) continue; resolveCombat(state, a.controller, a.uid, { type: 'creature', uid: magnet.uid, player: magnet.controller }); }
				} else if (pool.length) {
					const a = pool[Math.floor(state.rng() * pool.length)];
					resolveCombat(state, a.controller, a.uid, { type: 'creature', uid: magnet.uid, player: magnet.controller });
				}
			}
} });


register('random-invocation', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Kalimos, Primal Lord: cast a random Elemental Invocation
			const inv = Math.floor(state.rng() * 4);
			if (inv === 0) execEffects(state, pi, [{ type: 'damage', value: 6, target: 'enemy-heroes' }], target, source);
			else if (inv === 1) execEffects(state, pi, [{ type: 'damage', value: 3, target: 'enemy-creatures' }], target, source);
			else if (inv === 2) execEffects(state, pi, [{ type: 'heal', value: 12, target: 'self' }], target, source);
			else execEffects(state, pi, [{ type: 'summon', count: 2, attack: 6, health: 6, name: 'Elemental', tribe: 'Elemental' }], target, source);
} });


register('add-random-died', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('spammy-arcanist', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Spammy Arcanist: deal 1 to all other minions; if any die, repeat
			let guard = 30;
			while (guard-- > 0) {
				const before = state.players.reduce((n, pl) => n + pl.board.filter(c => !isDead(c) && c.type !== 'location').length, 0);
				for (const pl of state.players) for (const c of [...pl.board]) if (!isDead(c) && c.type !== 'location' && c !== source) damageCreature(state, c, e.value || 1, source);
				sweepDeaths(state);
				const after = state.players.reduce((n, pl) => n + pl.board.filter(c => !isDead(c) && c.type !== 'location').length, 0);
				if (after >= before) break; // nothing died
			}
} });


register('leyline-fire', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// a Leyline pulses at the end of your turn
			const p = state.players[pi];
			const boost = p.leylineBoost || 0;
			const fireOnce = () => {
				if (e.kind === 'flame') execEffects(state, pi, [{ type: 'random-damage', value: 2 + boost, count: 1, pool: 'enemies' }], null, source);
				else if (e.kind === 'frost') execEffects(state, pi, [{ type: 'freeze', target: 'random-enemy', count: 1 + boost }], null, source);
				else if (e.kind === 'arcana') execEffects(state, pi, [{ type: 'conjure-random', cardType: 'spell', count: 1 + boost }], null, source);
			};
			fireOnce();
			if (p.leylineDouble) fireOnce();
} });


register('primordial-protector', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Primordial Protector: draw your highest-Cost spell, summon a random minion of that Cost
			const p = state.players[pi];
			let bestI = -1, bestC = -1;
			for (let i = 0; i < p.deck.length; i++) { const d = state.cardsById[p.deck[i]]; if (d && isSpellType(d) && (d.cost || 0) > bestC) { bestC = d.cost || 0; bestI = i; } }
			if (bestI >= 0) { const [id] = p.deck.splice(bestI, 1); const nc = instantiate(state.cardsById[id], pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); execEffects(state, pi, [{ type: 'summon-random', cost: bestC }], null, source); }
} });


register('add-lackey', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Rise of Shadows: add a random Lackey to your hand
			const lackeys = ['lackey_ethereal', 'lackey_faceless', 'lackey_goblin', 'lackey_kobold', 'lackey_witchy'];
			for (let i = 0; i < (e.count || 1); i++) {
				const p2 = state.players[pi];
				if (p2.hand.length >= MAX_HAND) break;
				execEffects(state, pi, [{ type: 'add-card', id: lackeys[Math.floor(state.rng() * lackeys.length)] }], target, source);
				if (p2.lackeyBuff) { const added = p2.hand[p2.hand.length - 1]; if (added && added.id.startsWith('lackey_')) { added.attack = p2.lackeyBuff; added.maxHealth = p2.lackeyBuff; } } // Dark Pharaoh Tekahn
			}
} });


register('add-random-outcast-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Wretched Exile: add a random Outcast card to your hand (Felerin: count + costMod)
			const pool = Object.values(state.cardsById).filter(d => (d.keywords || []).includes('outcast') && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 1) && pool.length && p.hand.length < MAX_HAND; n++) { const cp = instantiate(pool[Math.floor(state.rng() * pool.length)], pi); cp.zone = 'hand'; if (e.costMod) cp.cost = Math.max(0, (cp.cost || 0) + e.costMod); p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
} });


register('mimiron-assemble', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Mimiron's Head: if you have 3+ Mechs, destroy them and form V-07-TR-0N
			const p = state.players[pi];
			const mechs = p.board.filter(c => !isDead(c) && (c.tribe || '').includes('Mech'));
			if (mechs.length >= 3) {
				for (const m of mechs) { m.damage = m.maxHealth; m.shield = false; emit(state, { type: 'destroy', uid: m.uid }); }
				sweepDeaths(state);
				summon(state, pi, { id: 'token_v07tr0n', name: 'V-07-TR-0N', type: 'creature', cost: 0, rarity: 'legendary',
					token: true, tribe: 'Mech', attack: 7, health: 8, keywords: ['charge', 'windfury'], description: 'A 7/8 Mech with Charge and Windfury.' });
			}
} });


register('planeshift', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('voidwalker-envy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Witch of the Arch-Thief: keep summoning while the enemy is ahead on minions
			const p = state.players[pi];
			let guard = 8;
			const enemyCount = () => Math.max(0, ...enemies.map(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location').length));
			const mine = () => p.board.filter(c => !isDead(c) && c.type !== 'location').length;
			do {
				summon(state, pi, { id: 'token_voidwalker', name: 'Voidwalker', type: 'creature', cost: 1, attack: 1, health: 3, tribe: 'Demon', rarity: 'common', token: true, keywords: ['taunt'], description: 'Taunt' });
			} while (guard-- > 0 && enemyCount() > mine() && mine() < 7);
} });


register('ivus', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ivus, the Forest Lord: spend the rest of your Mana; per crystal, a random bonus
			const p = state.players[pi];
			let n = availableMana(p);
			p.mana.cur = Math.max(0, p.mana.cur - n); p.mana.bonus = 0;
			for (let i = 0; i < n && source && !isDead(source); i++) {
				const roll = Math.floor(state.rng() * 4);
				if (roll === 0) buffCreature(source, 2, 2);
				else { const kw = ['rush', 'divine_shield', 'taunt'][roll - 1]; if (!source.keywords.includes(kw)) { source.keywords.push(kw); if (kw === 'divine_shield') source.shield = true; } }
			}
			emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
} });


register('toki-spells', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Timelooper Toki: 3 random spells; play all 3 for another Toki
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(dd => isSpellType(dd) && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length));
			const group = source ? source.uid : Math.floor(state.rng() * 1e9);
			for (let i = 0; i < 3 && pool.length && p.hand.length < MAX_HAND; i++) {
				const def = pool.splice(Math.floor(state.rng() * pool.length), 1)[0];
				const c = instantiate(def, pi); c.zone = 'hand'; c._tokiGroup = group;
				p.hand.push(c);
				emit(state, { type: 'conjure', player: pi, card: c, color: null });
			}
} });


register('vyranoth', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Vyranoth: a 100-Cost starting-minion deck splits 100 stats into it
			const p = state.players[pi];
			const total = (p.startingDeckIds || []).reduce((s2, id) => { const dd = state.cardsById[id]; return s2 + ((dd && dd.type === 'creature') ? (dd.cost || 0) : 0); }, 0);
			if (total === 100) {
				const minions = p.deck.filter(id => state.cardsById[id]?.type === 'creature');
				for (let n = 0; n < 25 && minions.length; n++) {
					const id = minions[Math.floor(state.rng() * minions.length)];
					(p.deckIdBuffs = p.deckIdBuffs || []).push({ id, attack: 2, health: 2 });
				}
				emit(state, { type: 'vyranothSplit', player: pi });
			}
} });


register('recast-own-last-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Chatty Macaw: recast the last spell you cast (at a random enemy if it targets)
			const last = state.players[pi].lastSpellPlayed;
			const def = last && state.cardsById[last.id];
			if (def && isSpellType(def)) { let tgt = last.target || null; const foesM = []; for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location') foesM.push({ type: 'creature', uid: c.uid, player: o }); if (foesM.length) tgt = foesM[Math.floor(state.rng() * foesM.length)]; else { const eh = enemyHero(); if (eh != null) tgt = { type: 'hero', player: eh }; } execEffects(state, pi, JSON.parse(JSON.stringify(def.effects || [])), tgt, source); }
} });


register('gy-return', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('fyrakk-blaze', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Fyrakk: cast N Mana worth of random Fire spells
			let budget = e.budget || 15;
			const pool = Object.values(state.cardsById).filter(d => isSpellType(d) && schoolOf(d) === 'Fire' && !d.token && d.collectible !== false && !(d.colors && d.colors.length) && d.effects);
			let guard = 30;
			while (budget > 0 && guard-- > 0) {
				const affordable = pool.filter(d => (d.cost || 0) <= budget && (d.cost || 0) > 0);
				if (!affordable.length) break;
				const def = affordable[Math.floor(state.rng() * affordable.length)];
				budget -= def.cost || 1;
				execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), null, null);
				if (state.over) return;
			}
} });


register('cast-enemy-random-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('cast-highest-hand-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Clumsy Courier: cast the highest-Cost spell from your hand (random target)
			const p = state.players[pi];
			let best = null; for (const c of p.hand) if (isSpellType(c) && (!e.school || schoolOf(c) === e.school) && (!best || (c.cost || 0) > (best.cost || 0))) best = c; // e.school -> Felwalker
			if (best) { p.hand = p.hand.filter(c => c !== best); const spec = targetSpec(state, pi, best, null); let tgt = null; if (spec) { const legal = legalTargets(state, pi, spec); tgt = legal.length ? legal[Math.floor(state.rng() * legal.length)] : null; } emit(state, { type: 'conjure', player: pi, card: best, color: null }); runSpell(state, pi, best, tgt, null); sweepDeaths(state); }
} });


register('open-pack-play', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Avatar of Hearthstone: open a pack and PLAY everything in it
			const pool = Object.values(state.cardsById).filter(dd => (dd.type === 'creature' || isSpellType(dd)) && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length));
			const legendaries = pool.filter(dd => dd.rarity === 'legendary');
			for (let n = 0; n < 5; n++) {
				const src = n === 0 && legendaries.length ? legendaries : pool;
				const def = src[Math.floor(state.rng() * src.length)];
				if (!def) break;
				if (def.type === 'creature') summon(state, pi, def);
				else if (def.effects) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), null, null);
				if (state.over) return;
			}
} });


register('vectus', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Vectus: summon two 1/1 Whelps, each gains a Deathrattle from a minion that died this game
			const drPool = [...new Set(state.players[pi].deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.deathrattle && d.deathrattle.length);
			for (let n = 0; n < 2; n++) {
				const c = summon(state, pi, { id: 'sch_whelp', name: 'Whelp', type: 'creature', cost: 1, token: true, rarity: 'common', tribe: 'Dragon', attack: 1, health: 1, description: 'A 1/1 Whelp.' });
				if (c && drPool.length) { const d = drPool[Math.floor(state.rng() * drPool.length)]; c.deathrattle = JSON.parse(JSON.stringify(d.deathrattle)); if (!c.keywords.includes('deathrattle')) c.keywords.push('deathrattle'); }
			}
} });


register('forefather-guess', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Futuristic Forefather: guess which card is in the enemy hand
			const foe = enemies[0];
			if (foe != null && state.players[foe].hand.length) {
				const real = state.players[foe].hand[Math.floor(state.rng() * state.players[foe].hand.length)];
				const pool = Object.values(state.cardsById).filter(dd => dd.type === 'creature' && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length) && dd.id !== real.id);
				const ids = [real.id];
				for (let i = 0; i < 2 && pool.length; i++) ids.push(pool.splice(Math.floor(state.rng() * pool.length), 1)[0].id);
				for (let i = ids.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [ids[i], ids[j]] = [ids[j], ids[i]]; }
				state.pickQueue.push({ player: pi, ids, guessId: real.id, guessUid: source ? source.uid : null });
				emit(state, { type: 'pickStart', player: pi, count: ids.length });
			}
} });


register('harth-hands', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Harth Stonebrew: an iconic hand from Hearthstone's past
			const p = state.players[pi];
			const HANDS = [
				['ragnaros_the_firelord', 'ysera', 'alexstrasza', 'deathwing'],
				['leeroy_jenkins', 'coin', 'coin', 'shadowstep'],
				['ancient_watcher', 'sunfury_protector', 'ironbeak_owl', 'faceless_manipulator'],
				['northshire_cleric', 'wild_pyromancer', 'injured_blademaster', 'circle_of_healing'],
			].map(h => h.filter(id => state.cardsById[id])).filter(h => h.length >= 3);
			const pick = HANDS.length ? HANDS[Math.floor(state.rng() * HANDS.length)] : null;
			if (pick) {
				for (const c of p.hand) if (c !== source) toGraveyard(state, pi, c);
				p.hand = p.hand.filter(c => c === source);
				for (const id of pick) {
					const c = instantiate(state.cardsById[id], pi); c.zone = 'hand'; p.hand.push(c);
					emit(state, { type: 'conjure', player: pi, card: c, color: null });
				}
			}
} });


register('talanji', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Talanji: register the chosen Boon, then draw Bwonsamdi (or resurrect him)
			const p = state.players[pi];
			p.bwonsamdiBoons = p.bwonsamdiBoons || { keywords: [], costBonus: 0 };
			if (e.boon && !p.bwonsamdiBoons.keywords.includes(e.boon)) { p.bwonsamdiBoons.keywords.push(e.boon); p.bwonsamdiBoons.costBonus += 2; }
			const def = state.cardsById['time_bwonsamdi'];
			if (def) {
				if (p.bwonsamdiDied) {
					const bw = summon(state, pi, def);
					if (bw) for (const k of p.bwonsamdiBoons.keywords) if (!bw.keywords.includes(k)) { bw.keywords.push(k); if (k === KW.DIVINE_SHIELD) bw.shield = true; }
				} else if (p.hand.length < MAX_HAND) {
					const bw = instantiate(def, pi);
					for (const k of p.bwonsamdiBoons.keywords) if (!bw.keywords.includes(k)) bw.keywords.push(k);
					bw.zone = 'hand'; p.hand.push(bw);
					emit(state, { type: 'conjure', player: pi, card: bw, color: null });
				}
			}
} });


register('give-enemy-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
		// ('buff-random-friendly' is handled earlier in the chain — the `count`
		// loop was merged there after this duplicate was shadowed. The secret
		// executor keeps its own trigger-side copy; see twin-audit.mjs.)
} });


register('add-hagatha-horror', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('ooze-bones', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Dissolving Ooze: destroy a friendly minion, pocket its Attack and Health as Bones
			const t = chosenCreature();
			const p = state.players[pi];
			if (t) {
				const atk = t.attack, hpv = Math.max(1, t.maxHealth - t.damage);
				t.damage = t.maxHealth; t.shield = false;
				emit(state, { type: 'destroy', uid: t.uid });
				sweepDeaths(state);
				const bones = [
					{ id: 'token_attack_bone', name: 'Attack Bone', type: 'sorcery', cost: 1, rarity: 'common', token: true, description: `Give a minion +${atk} Attack.`, effects: [{ type: 'buff', attack: atk, health: 0, target: 'creature' }] },
					{ id: 'token_health_bone', name: 'Health Bone', type: 'sorcery', cost: 1, rarity: 'common', token: true, description: `Give a minion +${hpv} Health.`, effects: [{ type: 'buff', attack: 0, health: hpv, target: 'creature' }] },
				];
				for (const bd of bones) if (p.hand.length < MAX_HAND) { const bc = instantiate(bd, pi); bc.zone = 'hand'; p.hand.push(bc); emit(state, { type: 'conjure', player: pi, card: bc, color: null }); }
			}
} });


register('bashana', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Bashana: three Treants carved with 12 Mana worth of Nature spells
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(dd => isSpellType(dd) && schoolOf(dd) === 'Nature' && (dd.cost || 0) > 0 && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length) && dd.effects);
			let budget = 12;
			for (let n = 0; n < 3; n++) {
				const affordable = pool.filter(dd => (dd.cost || 0) <= budget);
				const pick = affordable.length ? affordable[Math.floor(state.rng() * affordable.length)] : null;
				if (pick) budget -= pick.cost || 0;
				const tid = 'token_bashana_treant';
				if (p.hand.length < MAX_HAND) {
					const c = instantiate({ id: tid, name: 'Treant', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', token: true, keywords: pick ? ['battlecry'] : [], description: pick ? `Battlecry: Cast ${pick.name}.` : '', effects: pick ? JSON.parse(JSON.stringify(pick.effects)) : null }, pi);
					c.zone = 'hand'; p.hand.push(c);
					emit(state, { type: 'conjure', player: pi, card: c, color: null });
				}
			}
} });


register('chronogor', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Chronogor: you draw your 2 highest-Cost cards; the enemy draws your 2 lowest
			const p = state.players[pi];
			for (let k = 0; k < 2; k++) {
				if (!p.deck.length) break;
				let hi = 0;
				for (let i = 1; i < p.deck.length; i++) if ((state.cardsById[p.deck[i]]?.cost || 0) > (state.cardsById[p.deck[hi]]?.cost || 0)) hi = i;
				const [id] = p.deck.splice(hi, 1);
				if (p.hand.length < MAX_HAND && state.cardsById[id]) { const c = instantiate(state.cardsById[id], pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'draw', player: pi, card: c }); }
			}
			for (const o of enemies) {
				for (let k = 0; k < 2; k++) {
					if (!p.deck.length) break;
					let lo = 0;
					for (let i = 1; i < p.deck.length; i++) if ((state.cardsById[p.deck[i]]?.cost || 0) < (state.cardsById[p.deck[lo]]?.cost || 0)) lo = i;
					const [id] = p.deck.splice(lo, 1);
					const op = state.players[o];
					if (op.hand.length < MAX_HAND && state.cardsById[id]) { const c = instantiate(state.cardsById[id], o); c.zone = 'hand'; op.hand.push(c); emit(state, { type: 'conjure', player: o, card: c, color: null }); }
				}
				break;
			}
} });


register('blink', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('joust', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('conditional', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// "If you control a Beast / have 12 or less Health / it's Frozen, ... instead"
			const t = chosenCreature();
			const p = state.players[pi];
			let ok = true;
			if (e.if.controlTribe) ok = e.if.controlTribe.split('|').some(tr => p.board.some(c => !isDead(c) && (c.tribe || '').includes(tr))); // Gutwrencher Oni: a Devil, Ogre or Horror
			else if (e.if.controlKeyword) ok = p.board.some(c => !isDead(c) && c.type !== 'location' && has(c, e.if.controlKeyword)); // King's Defender: a minion with Taunt
			else if (e.if.lastCardRune) ok = !!(p.lastPlayedRunes && (p.lastPlayedRunes[e.if.lastCardRune] || 0) > 0); // Grotesque Runeblade: the last card you played had an Unholy/Blood rune
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
			else if (e.if.lastCardCost != null) ok = (p.lastCardCost === e.if.lastCardCost); // Rolling Stone: the last card you played costs N
			else if (e.if.friendlyUndeadDied) ok = (p.deathLogIds || []).some(id => (state.cardsById[id]?.tribe || '').includes('Undead')); // Bone Flinger (approx: a friendly Undead has died this game)
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
			else if (e.if.armorAtLeast != null) ok = (p.armor || 0) >= e.if.armorAtLeast; // Fleshshaper
			else if (e.if.armorChangedThisTurn) ok = !!p.armorChangedThisTurn; // Stoneskin Armorer
			else if (e.if.drawsThisTurnAtLeast != null) ok = (p.drawsThisTurn || 0) >= e.if.drawsThisTurnAtLeast; // Careless Mechanist
			else if (e.if.corpsesAtLeast != null) ok = (p.corpses || 0) >= e.if.corpsesAtLeast; // Eulogizer
			else if (e.if.dragonsPlayedGame != null) ok = (p.dragonsPlayedGame || 0) >= e.if.dragonsPlayedGame; // Timewinder Zarimi
			else if (e.if.holdingCost != null) ok = p.hand.some(c => c !== source && (c.cost || 0) === e.if.holdingCost); // Greedy Partner: holding another N-Cost card
			else if (e.if.holdingSecret) ok = p.hand.some(c => c.secret); // Sparkjoy Cheat
			else if (e.if.spellsGame != null) ok = (p.spellsPlayedTotal || 0) >= e.if.spellsGame; // Yogg-Saron, Master of Fate
			else if (e.if.healedThisTurn) ok = !!p.healedThisTurn; // Cleric of An'she
			else if (e.if.holdingSchool) ok = p.hand.some(c => schoolOf(c) === e.if.holdingSchool); // Toad of the Wilds
			else if (e.if.castSchoolThisTurn) ok = !!(p.schoolsCastThisTurn && p.schoolsCastThisTurn[e.if.castSchoolThisTurn]); // Metamorfin
			else if (e.if.diedCountGame) ok = (p.diedCountById?.[e.if.diedCountGame.id] || 0) >= e.if.diedCountGame.count; // Elwynn Boar
			else if (e.if.anyHeroDamagedThisTurn) ok = state.players.some(pl => pl.heroDamagedThisTurn); // Twilight Deceptor
			else if (e.if.holdingSchoolsBoth) ok = e.if.holdingSchoolsBoth.every(sch => p.hand.some(c => schoolOf(c) === sch)); // Lightmaw Netherdrake
			else if (e.if.holdingTribeMinCost) ok = p.hand.some(c => (c.tribe || '').includes(e.if.holdingTribeMinCost.tribe) && (c.cost || 0) >= e.if.holdingTribeMinCost.cost); // Warden of Chains
			else if (e.if.notHonorablyKilled) ok = !(source && source.honorablyKilled); // Korrak the Bloodrager
			else if (e.if.armorGainedGame != null) ok = (p.armorGainedGame || 0) >= e.if.armorGainedGame; // Captain Galvangar
			else if (e.if.spellsCastWhileHeld != null) ok = (source && source.spellsCastWhileHeld || 0) >= e.if.spellsCastWhileHeld; // Spellcoiler / Ancient Krakenbane
			else if (e.if.schoolWhileHeld) ok = !!(source && source.schoolsWhileHeld && source.schoolsWhileHeld[e.if.schoolWhileHeld]); // Heralds
			else if (e.if.dealtHeroDamage != null) ok = (p.damageToEnemyHeroThisTurn || 0) >= e.if.dealtHeroDamage; // Crooked Cook
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
			else if (e.if.heroPowerUpgraded) ok = !!p.heroPowerUpgraded || (p.imbueCount || 0) >= 1; // legacy Imbue proxy
			else if (e.if.imbuedAtLeast != null) ok = (p.imbueCount || 0) >= e.if.imbuedAtLeast || !!p.heroPowerUpgraded; // Petal Picker twice / Malorne 4x
			else if (e.if.kindredActive) ok = kindredActive(state, pi, source); // Lost City Kindred: you control another minion sharing a type
			else if (e.if.buildingStarship != null) ok = ((p.starshipPieces || []).length > 0) === !!e.if.buildingStarship; // Crystal Welder / Exarch Othaar / The Exodar
			else if (e.if.holdingNameIncludes) ok = p.hand.some(c => (c.name || '').includes(e.if.holdingNameIncludes) && c !== source); // Warchief / Mindflayer Rafaam
			else if (e.if.selfPaidZero != null) ok = (source && source._paidCost === 0) === !!e.if.selfPaidZero; // Void Ray
			else if (e.if.selfPaidMax != null) ok = !!source && source._paidCost != null && source._paidCost <= e.if.selfPaidMax; // Verdant Dreamsaber
			else if (e.if.friendlyDeathsAtLeast != null) ok = (p.friendlyDeaths || 0) >= e.if.friendlyDeathsAtLeast; // Aessina
			else if (e.if.playedQuestGame != null) ok = ((p.questsPlayedGame || 0) > 0) === !!e.if.playedQuestGame; // Questing Assistant
			else if (e.if.selfHeldMana != null) ok = !!source && (source._manaWhileHeld || 0) >= e.if.selfHeldMana; // Felwood / Broodwatcher / Merithra
			else if (e.if.noMinionLastTurn != null) ok = (p._minionLastTurn !== true) === !!e.if.noMinionLastTurn; // Wizened Wildspeaker
			else if (e.if.schoolCastThisTurn) ok = !!(p.schoolsCastThisTurn && p.schoolsCastThisTurn[e.if.schoolCastThisTurn]); // Baleful Blazer
			else if (e.if.selfCopiesDiedAtLeast != null) ok = !!source && (p.diedCountById?.[source.id] || 0) >= e.if.selfCopiesDiedAtLeast; // Captured Archmage
			else if (e.if.deckNoSpells != null) ok = !p.deck.some(id => { const dd = state.cardsById[id]; return dd && isSpellType(dd); }) === !!e.if.deckNoSpells; // Hexmarshal
			else if (e.if.deckNoMinions != null) ok = !p.deck.some(id => state.cardsById[id]?.type === 'creature') === !!e.if.deckNoMinions; // Malfunction: your deck has no minions
			else if (e.if.ownTurnDamageAtLeast != null) ok = (p.ownTurnsDamage || 0) >= e.if.ownTurnDamageAtLeast; // Party Planner Vona
			else if (e.if.holdingTribe) ok = p.hand.some(c => c !== source && (c.tribe || '').includes(e.if.holdingTribe)); // Victor Nefarius: holding a Dragon
			else if (e.if.spellDamageDealtThisTurn != null) ok = (p.spellDmgTurn === state.turnNumber) === !!e.if.spellDamageDealtThisTurn; // Unstable Spellcaster
			else if (e.if.selfEnemyCopyHeld != null) ok = !!(source && source._enemyCopyWhileHeld) === !!e.if.selfEnemyCopyHeld; // Mind Sweeper
			else if (e.if.deckSharesType) { // City Chief Esho: every minion in your deck shares a minion type ('All' is a wildcard)
				const lists = p.deck.filter(id => state.cardsById[id]?.type === 'creature')
					.map(id => ((state.cardsById[id]?.tribe) || '').split('/').filter(Boolean));
				if (!lists.length || lists.some(l => !l.length)) ok = false;
				else {
					const candidates = new Set(lists.flat().filter(t => t !== 'All'));
					ok = lists.every(l => l.includes('All'))
						|| [...candidates].some(t => lists.every(l => l.includes(t) || l.includes('All')));
				}
			}
			else if (e.if.spellsThisTurn != null) ok = (p.spellsPlayedThisTurn || 0) >= e.if.spellsThisTurn; // Unstable Spellcaster (spell-damage-dealt approx)
			else if (e.if.deckCostsDistinct != null) ok = new Set(p.deck.map(id => state.cardsById[id]?.cost || 0)).size >= e.if.deckCostsDistinct; // Elise the Navigator: 10 cards of different Costs
			else if (e.if.selfDrawnThisTurn) ok = !!(source && source.drawnThisTurn); // Swiftdraw riders (Farm Hand / Benevolent Banker)
			else if (e.if.holdingDarkGift) ok = p.hand.some(c => c._darkGift); // Frostburn Matriarch / Dragon Turtle
			else if (e.if.secretsThisGame != null) ok = (p.secretsThisGame || 0) >= e.if.secretsThisGame; // Tomb Diver: played N Secrets this game
			else if (e.if.onlyLandName) ok = p.lands.length > 0 && p.lands.every(l => (l.name || '').includes(e.if.onlyLandName)); // Magmatic Scorchwing: control only Mountains
			execEffects(state, pi, ok ? e.then : (e.else || []), target, source);
			if (ok && e.if.kindredActive && p.nextKindredTwice) { p.nextKindredTwice = false; execEffects(state, pi, e.then, target, source); } // Primalfin Challenger: your next Kindred triggers twice
} });


register('add-card', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			if (e.requireDeckNoNeutral && state.players[pi].deck.some(id => (state.cardsById[id]?.cardClass || 'neutral') === 'neutral')) continue; // The Countess
			const def = state.cardsById[e.id];
			const targets = e.eachPlayer ? state.players.map((_, idx) => idx).filter(idx => !state.players[idx].eliminated)
					: e.toEnemy ? opponentsOf(state, pi) : [pi]; // Mailbox Dancer gives the opponent a Coin
			for (const tp of targets) {
				const tpp = state.players[tp];
				for (let n = 0; n < (e.count || 1); n++) {
					if (def && tpp.hand.length < MAX_HAND) {
						const card = instantiate(def, tp);
						card.zone = 'hand';
						if (e.makeTemporary) card.temporary = true; // Throw Glaive: a Temporary copy
						tpp.hand.push(card);
						emit(state, { type: 'conjure', player: tp, card, color: null });
					} else if (!def) {
						drawCards(state, tp, 1); // named card not in the pool yet
					}
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('bounce', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
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
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('replay-opponent-last-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
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
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('attack-all-minions', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Deathwing, Mad Aspect: attack every other creature
			if (source && source.zone === 'board' && !isDead(source)) {
				for (const pl of state.players) for (const c of [...pl.board]) {
					if (c === source || isDead(c) || c.type === 'location') continue;
					if (isDead(source)) break;
					resolveCombat(state, source.controller, source.uid, { type: 'creature', uid: c.uid, player: c.controller });
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('duplicate-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Elise the Enlightened: add a copy of each other card in your hand
			const pp = state.players[pi];
			for (const c of [...pp.hand]) {
				if (c === source || pp.hand.length >= MAX_HAND) continue;
				const def = state.cardsById[c.id]; if (!def) continue;
				const cp = instantiate(def, pi); cp.zone = 'hand'; pp.hand.push(cp);
				emit(state, { type: 'conjure', player: pi, card: cp, color: null });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('arator', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Arator: friendly Silver Hand Recruits double up and get Taunt
			for (const c of state.players[pi].board) {
				if (c.name !== 'Silver Hand Recruit' || isDead(c)) continue;
				c.attack *= 2; c.maxHealth *= 2;
				if (!c.keywords.includes('taunt')) c.keywords.push('taunt');
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('isorath-return', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			if (source && source._devoured) {
				const op = state.players[source._devouredOwner];
				for (const id of source._devoured) {
					if (!state.cardsById[id] || op.hand.length >= MAX_HAND) continue;
					const c = instantiate(state.cardsById[id], source._devouredOwner);
					c.zone = 'hand'; op.hand.push(c);
					emit(state, { type: 'conjure', player: source._devouredOwner, card: c, color: null });
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('leviathan-siphon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Dread Leviathan: steal 3 Health, three times (first chosen, rest random)
			const first = chosenCreature();
			const hits = [];
			if (first) hits.push(first);
			for (let n = hits.length; n < 3; n++) {
				const pool = [];
				for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type === 'creature') pool.push(c);
				if (!pool.length) break;
				hits.push(pool[Math.floor(state.rng() * pool.length)]);
			}
			for (const t of hits) {
				if (isDead(t) || !source || isDead(source)) continue;
				const stolen = Math.min(3, Math.max(0, t.maxHealth - t.damage));
				damageCreature(state, t, 3, null);
				source.maxHealth += stolen;
				emit(state, { type: 'buff', uid: source.uid, attack: source.attack, hp: hp(source) });
			}
			sweepDeaths(state);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('alarashi-demons', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Alarashi: hand minions become random Demons keeping stats and Cost
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(dd => dd.type === 'creature' && (dd.tribe || '').includes('Demon') && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length));
			if (pool.length) for (let i = 0; i < p.hand.length; i++) {
				const c = p.hand[i];
				if (c.type !== 'creature' || c === source) continue;
				const nd = pool[Math.floor(state.rng() * pool.length)];
				const nc = instantiate(nd, pi);
				nc.zone = 'hand'; nc.attack = c.attack; nc.maxHealth = c.maxHealth; nc.cost = c.cost;
				p.hand[i] = nc;
				emit(state, { type: 'conjure', player: pi, card: nc, color: null });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('ursoc-rampage', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Ursoc: attack ALL other minions, remembering his kills
			if (source) {
				source._ursocKills = [];
				for (const pl of state.players) for (const c of [...pl.board]) {
					if (c === source || isDead(source) || isDead(c) || c.type !== 'creature' || c.dormantLeft > 0) continue;
					damageCreature(state, c, source.attack, source);
					damageCreature(state, source, c.attack, c);
					if (isDead(c) && state.cardsById[c.id]) source._ursocKills.push(c.id);
				}
				sweepDeaths(state);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('toru-jars', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Entomologist Toru: hand minions go into 0/1 Jars; break them to release
			const p = state.players[pi];
			for (let i = 0; i < p.hand.length; i++) {
				const c = p.hand[i];
				if (c.type !== 'creature' || c === source || !state.cardsById[c.id]) continue;
				const jar = instantiate(state.cardsById['toru_jar'], pi);
				jar.zone = 'hand'; jar._heldId = c.id;
				p.hand[i] = jar;
				emit(state, { type: 'conjure', player: pi, card: jar, color: null });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('grunty', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Grunty: summon four random Murlocs, then shoot them at random enemy minions
			const p = state.players[pi];
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.tribe || '').includes('Murloc') && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
			for (let n = 0; n < 4 && pool.length; n++) {
				const m = summon(state, pi, pool[Math.floor(state.rng() * pool.length)]);
				if (!m) continue;
				const foes = [];
				for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location') foes.push(c);
				if (foes.length) damageCreature(state, foes[Math.floor(state.rng() * foes.length)], m.attack, m);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('replay-last-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Sasquawk: repeat each card you played last turn (spells re-cast untargeted, minions re-summoned)
			const p = state.players[pi];
			for (const id of [...(p.cardsPlayedLastTurnIds || [])]) {
				const def = state.cardsById[id];
				if (!def || def.token) continue;
				if (def.type === 'creature') summon(state, pi, def);
				else if (isSpellType(def) && def.effects) execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), null, null);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('gelbin-auras', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Gelbin of Tomorrow: put one of each Aura into the battlefield (3 turns each)
			const p = state.players[pi];
			for (const aid of ['gnomish_aura', 'mekkatorques_aura']) {
				const def = state.cardsById[aid];
				if (!def) continue;
				const a = instantiate(def, pi);
				a.zone = 'enchantment'; a.turnsLeft = 3;
				p.enchantments.push(a);
				emit(state, { type: 'enchant', player: pi, card: a });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('add-spells-on-friendly-to-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Lady Liadrin: add a copy of each spell you cast on friendly characters this game
			const p = state.players[pi];
			for (const id of p.spellsOnFriendly || []) {
				const def = state.cardsById[id];
				if (!def || p.hand.length >= MAX_HAND) continue;
				const card = instantiate(def, pi); card.zone = 'hand'; p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('brawl', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Badlands Brawler: destroy all minions except one random survivor (keep your own if e.favorSelf)
			const all = [];
			for (const pl of state.players) for (const c of pl.board) if (!isDead(c) && c.type !== 'location') all.push(c);
			if (all.length > 1) { let survivor = null; if (e.favorSelf) { const mine = state.players[pi].board.filter(c => !isDead(c) && c.type !== 'location'); survivor = mine.length ? mine[Math.floor(state.rng() * mine.length)] : all[Math.floor(state.rng() * all.length)]; } else survivor = all[Math.floor(state.rng() * all.length)]; for (const c of all) { if (c === survivor) continue; c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); } sweepDeaths(state); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('wrathspine', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Wrathspine Enchanter: cast a copy of a Fire, Frost, and Nature spell in your hand
			const p = state.players[pi];
			for (const sch of ['Fire', 'Frost', 'Nature']) {
				const src = p.hand.find(c => schoolOf(c) === sch);
				if (!src || !state.cardsById[src.id]) continue;
				const spell = instantiate(state.cardsById[src.id], pi);
				const spec = targetSpec(state, pi, spell, null);
				let tgt = null; if (spec) { const legal = legalTargets(state, pi, spec); tgt = legal.length ? legal[Math.floor(state.rng() * legal.length)] : null; }
				emit(state, { type: 'conjure', player: pi, card: spell, color: null });
				runSpell(state, pi, spell, tgt, null); sweepDeaths(state);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('add-back-held-spells', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Commander Sivara: add the spells you cast while holding this back to your hand
			const p = state.players[pi];
			for (const id of (source && source.spellsHeldIds) || []) { if (p.hand.length >= MAX_HAND) break; const def = state.cardsById[id]; if (!def) continue; const nc = instantiate(def, pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('cast-all-fel', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Jace Darkweaver: cast all Fel spells you've played this game
			for (const id of [...(state.players[pi].felSpellsGame || [])]) {
				const def = state.cardsById[id]; if (!def) continue;
				const spell = instantiate(def, pi);
				const spec = targetSpec(state, pi, spell, null);
				let tgt = null; if (spec) { const legal = legalTargets(state, pi, spec); const enemyT = legal.find(t => t.player !== pi); tgt = enemyT || (legal.length ? legal[Math.floor(state.rng() * legal.length)] : null); }
				emit(state, { type: 'conjure', player: pi, card: spell, color: null });
				runSpell(state, pi, spell, tgt, null); sweepDeaths(state);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('varden', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Varden Dawngrasp: freeze all enemy minions; already-frozen ones take damage instead
			for (const o of enemies) for (const c of [...state.players[o].board]) { if (isDead(c) || c.type === 'location') continue; if (c.frozen) damageCreature(state, c, e.value || 4, source); else freezeCreature(state, c); }
			sweepDeaths(state);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('cast-random-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Servant of Yogg-Saron / Yogg-Saron: cast random spells with random targets
			const times = e.perSpellsCast ? (state.players[pi].spellsPlayedTotal || 0) : (e.count || 1);
			for (let n = 0; n < times && !state.over; n++) {
				const fromIds = e.castThisTurn ? (state.players[pi].cardsPlayedThisTurnIds || []) : e.ids; // Archmage Vargoth / Creature of the Sacred Cave: a spell you've cast this turn
				const pool = fromIds ? fromIds.map(id => state.cardsById[id]).filter(d => d && isSpellType(d) && (e.school == null || schoolOf(d) === e.school))
					: Object.values(state.cardsById).filter(d => isSpellType(d) && !d.token && d.collectible !== false
					&& !(d.colors && d.colors.length) && !d.choices && !d.xSpell && !d.counterSpell
					&& (e.cardClass == null || (d.cardClass || 'neutral') === e.cardClass) // Solarian Prime: Mage spells
				&& (!e.otherClass || ((d.cardClass || 'neutral') !== 'neutral' && !(d.cardClass || '').split('__').includes(state.players[pi].heroClass || ''))) // Chaos Supplicant
					&& (e.cost == null || (d.cost || 0) === e.cost) // Enchanted Cauldron: same Cost
					&& (e.school == null || schoolOf(d) === e.school) // Druid of Regrowth: Nature spells
					&& (e.minCost == null || (d.cost || 0) >= e.minCost)
					&& (e.maxCost == null || (d.cost || 0) <= e.maxCost)); // Trick Totem: a spell that costs (3) or less
				if (!pool.length) break;
				const spell = instantiate(pool[Math.floor(state.rng() * pool.length)], pi);
				const spec = targetSpec(state, pi, spell, null);
				let tgt = null;
				if (spec) { const legal = legalTargets(state, pi, spec); if (legal.length) tgt = legal[Math.floor(state.rng() * legal.length)]; else if (spec.required) continue; }
				emit(state, { type: 'conjure', player: pi, card: spell, color: null });
				runSpell(state, pi, spell, tgt, null);
				sweepDeaths(state);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('reopen-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Parrot Sanctuary: "reopen this" — refresh the location so it can be tapped
			// again this turn (durability is spent per tap, so this converges when it wears out)
			if (source && source.type === 'location' && !isDead(source) && source.durability > 0) {
				source.tapped = false;
				source.tapStone = false;
				emit(state, { type: 'locationReopened', player: pi, uid: source.uid });
			}
} });


register('spend-all-mana-cast', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Forbidden Shrine: spend all your Mana, then cast a random spell that costs that much
			const p = state.players[pi];
			const spent = p.mana.cur;
			p.mana.cur = 0;
			emit(state, { type: 'mana', player: pi, cur: 0, max: p.mana.max });
			if (!state._chaosLock) {
				state._chaosLock = true;
				try { execEffects(state, pi, [{ type: 'cast-random-spell', count: 1, cost: spent, cardClass: e.cardClass || (p.heroClass || null) }], null, source); }
				finally { state._chaosLock = false; }
			}
} });


register('steal-secret', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
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
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


const _h_mind_control = ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// steal an enemy creature (chosen, or random from a qualifying enemy)
			if (e.all) { // EVIL Propaganda: take control of ALL enemy minions
				for (const o of enemies) for (const c of [...state.players[o].board]) {
					if (isDead(c) || c.type === 'location') continue;
					state.players[o].board = state.players[o].board.filter(x => x !== c);
					c.controller = pi; c.sick = true;
					state.players[pi].board.push(c);
					emit(state, { type: 'mindControl', uid: c.uid, player: pi, name: c.name });
				}
				recomputeAuras(state);
				continue;
			}
			let t = null;
			if (e.type === 'mind-control') {
				const c = chosenCreature();
				if (c && c.controller !== pi && (e.maxAttack == null || c.attack <= e.maxAttack) && (e.maxHealth == null || hp(c) <= e.maxHealth)) t = c; // Eternus: Health or less
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
	} while (false); // top-level `continue` = skip this effect (chain semantics)
};
register('mind-control', _h_mind_control);
register('mind-control-random', _h_mind_control); // shared or-branch handler


// ---------- spend-X resources family (hard-list recovery) ----------
register('spend-armor-damage-all-minions', ({ state, pi }, e) => {
	// Reckless Flurry: spend ALL your Armor, deal that much to all minions.
	// Shellnado (cap 5, perPoint): each point is its own 1-damage AoE, so
	// Divine Shields pop per hit like the real card.
	const p = state.players[pi];
	const n = Math.min(p.armor || 0, e.cap ?? Infinity);
	if (n <= 0) return;
	p.armor -= n;
	emit(state, { type: 'armor', player: pi, amount: -n, armor: p.armor });
	if (e.perPoint) { for (let i = 0; i < n; i++) execEffects(state, pi, [{ type: 'damage-all-minions', value: 1 }], null, null); }
	else execEffects(state, pi, [{ type: 'damage-all-minions', value: n }], null, null);
});

register('spend-armor-next-tribe-discount', ({ state, pi }, e) => {
	// Part Scrapper: lose up to `cap` Armor; your next `tribe` creature costs that much less
	const p = state.players[pi];
	const n = Math.min(p.armor || 0, e.cap ?? 5);
	if (n <= 0) return;
	p.armor -= n;
	emit(state, { type: 'armor', player: pi, amount: -n, armor: p.armor });
	p.nextTribeDiscount = { tribe: e.tribe || 'Mech', count: 1, amount: n };
});

register('fatigue-damage-all-enemies', ({ state, pi }) => {
	// Crescendo: take your next (escalating) Fatigue hit, then deal that much
	// to all enemies (their minions and heroes)
	const p = state.players[pi];
	p.fatigue++;
	emit(state, { type: 'fatigue', player: pi, amount: p.fatigue });
	damageHero(state, pi, p.fatigue, pi);
	execEffects(state, pi, [{ type: 'damage-all-enemies', value: p.fatigue }], null, null);
	sweepDeaths(state);
});

register('spend-corpses-summon-cost', ({ state, pi }, e) => {
	// Corpse Farm: spend up to `cap` Corpses, create a random minion of that Cost
	const p = state.players[pi];
	const n = Math.min(p.corpses || 0, e.cap ?? 8);
	if (n > 0) {
		spendCorpses(state, pi, n);
		emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
	}
	execEffects(state, pi, [{ type: 'summon-random', cost: n }], null, null);
});

register('unlock-overload-damage', ({ state, pi, target, source }, e) => {
	// Overdraft: unlock your Overloaded crystals (locked now AND pending) and
	// deal that much damage to the chosen target
	const p = state.players[pi];
	const n = (p.overloadLockedThisTurn || 0) + (p.overloadPending || 0);
	if (n <= 0) return;
	if (p.overloadLockedThisTurn) { p.mana.cur += p.overloadLockedThisTurn; p.overloadLockedThisTurn = 0; }
	p.overloadPending = 0;
	emit(state, { type: 'manaGained', player: pi, amount: n, mana: p.mana.cur });
	execEffects(state, pi, [{ type: 'damage', value: n, target: e.target || 'any' }], target, source);
});

// ---------- time-bombs family (hard-list recovery) ----------
register('destroy-enemy-hero', ({ state, pi, enemyHero }) => {
	// Wheel of DEATH!!!: the countdown ends — destroy target opponent
	const o = enemyHero();
	if (o == null || state.players[o].eliminated) return;
	damageHero(state, o, 99999, pi);
	checkGameOver(state);
});

register('immolate-mark', ({ state, pi, enemyHero }) => {
	// Immolate: light target opponent's current hand on fire (the marks travel
	// with the card instances; the delayed burn destroys any still in hand)
	const o = enemyHero();
	if (o == null) return;
	for (const c of state.players[o].hand) c._immolate = true;
	emit(state, { type: 'immolateMark', player: o, count: state.players[o].hand.length });
});

register('immolate-burn', ({ state, pi, enemies }) => {
	for (const o of enemies) {
		const p2 = state.players[o];
		const burned = p2.hand.filter(c => c._immolate);
		if (!burned.length) continue;
		p2.hand = p2.hand.filter(c => !c._immolate);
		for (const c of burned) { toGraveyard(state, o, c); emit(state, { type: 'discard', player: o, card: c }); }
	}
});
