// engine/effects/handlers-triggers.js — trigger-context handlers (the retired runSecretEffects switch) (housekeeping split, PR 40).
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

registerTrigger('counter', (state, pi, e, ctx, triggering) => {
	do { ctx.countered = true; break;
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('destroy-damaged-subject', (state, pi, e, ctx, triggering) => {
	do { {
				// Holotechnician: destroy the minion that just took damage
				const d = ctx.damaged;
				if (d && !isDead(d) && d.type !== 'location') { d.damage = d.maxHealth; d.shield = false; emit(state, { type: 'destroy', uid: d.uid }); sweepDeaths(state); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('summon-token-by-heal-amount', (state, pi, e, ctx, triggering) => {
	do { {
				// Screaming Banshee: summon a token with stats equal to the amount the hero just healed
				const amt = ctx.amount || 0;
				if (amt > 0) summon(state, pi, { id: e.summonId || 'token_soul', name: e.name || 'Soul', type: 'creature', cost: 0, token: true, rarity: 'common', attack: amt, health: amt, description: `A ${amt}/${amt} token.` });
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('metrognome', (state, pi, e, ctx, triggering) => {
	do { {
				// Metrognome: after playing a card of the tracked cost, draw one of the next cost, then increase
				const self = ctx.self, played = ctx.played;
				if (self && played && (played.cost || 0) === (self.metroCost || 0)) {
					execEffects(state, pi, [{ type: 'tutor', cost: (self.metroCost || 0) + 1, count: 1 }], null, self);
					self.metroCost = (self.metroCost || 0) + 1;
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('buff-played-grant-deathrattle', (state, pi, e, ctx, triggering) => {
	do { {
				// Hawkstrider Rancher: buff the just-played minion +X/+X and give it a Deathrattle
				const m = ctx.minion;
				if (m && m !== ctx.self && !isDead(m) && m.type === 'creature') {
					m.attack += e.attack || 1; m.maxHealth += e.health || 1;
					if (e.deathrattle) { m.deathrattle = (m.deathrattle || []).concat(JSON.parse(JSON.stringify(e.deathrattle))); if (!m.keywords.includes('deathrattle')) m.keywords.push('deathrattle'); }
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('set-attacked-health', (state, pi, e, ctx, triggering) => {
	do { {
				// Keeneye Spotter: set the hero-attacked minion's Health to N
				const t = ctx.target;
				if (t && t.type === 'creature' && !isDead(t)) { t.maxHealth = e.value ?? 1; t.damage = 0; t.tempHealth = 0; emit(state, { type: 'buff', uid: t.uid, attack: t.attack, hp: hp(t) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('steal-victim-to-hand', (state, pi, e, ctx, triggering) => {
	do { {
				// Kologarn: put the minion this attacked into your hand
				const v = ctx.victim;
				if (v && !isDead(v) && v.controller != null && state.cardsById[v.id] && state.players[pi].hand.length < MAX_HAND) {
					const owner = state.players[v.controller];
					owner.board = owner.board.filter(c => c !== v); v.zone = 'gone';
					const cp = instantiate(state.cardsById[v.id], pi); cp.zone = 'hand'; state.players[pi].hand.push(cp);
					emit(state, { type: 'bounce', uid: v.uid, player: pi, name: v.name }); recomputeAuras(state);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('summon-copy-of-killed', (state, pi, e, ctx, triggering) => {
	do { {
				// Overlord Drakuru: resurrect the minion this just killed onto your side; Primal Sabretooth: to hand
				const v = ctx.victim, def = v && state.cardsById[v.id];
				if (def && !state.players[pi].eliminated) {
					if (e.toHand) { const p = state.players[pi]; if (p.hand.length < MAX_HAND) { const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); } }
					else summon(state, pi, def);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('damage-enemy-hero-by-amount', (state, pi, e, ctx, triggering) => {
	do { {
				// Brutal Annihilan: deal the damage just survived to the enemy hero
				const amt = ctx.amount || 0;
				if (amt > 0) { for (const o of opponentsOf(state, pi)) damageHero(state, o, amt, pi); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('damage-own-hero-by-amount', (state, pi, e, ctx, triggering) => {
	do { {
				// Brain Masseuse: deal the damage this minion just took to your own hero
				const amt2 = ctx.amount || 0;
				if (amt2 > 0) damageHero(state, pi, amt2, pi);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('buff-attacker', (state, pi, e, ctx, triggering) => {
	do { {
				// Hozen Roughhouser: buff the attacking minion (ctx.minion from friendly-attacks)
				const m = ctx.minion;
				if (m && m !== ctx.self && !isDead(m)) { m.attack += e.attack || 0; m.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('summon-random-cost-from-dead', (state, pi, e, ctx, triggering) => {
	do { {
				// Carefree Cookie: summon a random minion costing N more than the friendly that just died
				const dead = ctx.dead;
				if (dead) { const want = (dead.cost || 0) + (e.plus || 1); const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === want && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length)); if (pool.length) summon(state, pi, pool[Math.floor(state.rng() * pool.length)]); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('grant-keyword-played', (state, pi, e, ctx, triggering) => {
	do { {
				// Brittlebone Buccaneer: give the just-played minion a keyword
				const m = ctx.minion;
				if (m && m !== ctx.self && m.type === 'creature' && !isDead(m) && !m.keywords.includes(e.keyword)) { m.keywords.push(e.keyword); if (e.keyword === KW.DIVINE_SHIELD) m.shield = true; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('gain-dead-deathrattle', (state, pi, e, ctx, triggering) => {
	do { {
				// Devourer of Souls: gain the Deathrattle of a friendly minion that just died
				const d2 = ctx.dead, s2 = ctx.self;
				if (d2 && s2 && !isDead(s2) && d2.deathrattle && d2.deathrattle.length) {
					s2.deathrattle = [...(s2.deathrattle || []), ...JSON.parse(JSON.stringify(d2.deathrattle))];
					if (!s2.keywords.includes('deathrattle')) s2.keywords.push('deathrattle');
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('become-copy-of-enemy-played', (state, pi, e, ctx, triggering) => {
	do { {
				// Cosplay Contestant: transform into a set-stat copy of the minion the opponent just played
				const m = ctx.minion, self = ctx.self, base = m && state.cardsById[m.id];
				if (base && self && !isDead(self) && self.zone === 'board') {
					const def = JSON.parse(JSON.stringify(base));
					if (e.attack != null) def.attack = e.attack;
					if (e.health != null) def.health = e.health;
					if (e.stats != null) { def.attack = e.stats; def.health = e.stats; }
					def.token = true; def.id = 'token_' + base.id;
					const tok = instantiate(def, pi); tok.zone = 'board'; tok.sick = self.sick; tok.uid = self.uid;
					const board = state.players[pi].board; const i = board.indexOf(self);
					if (i >= 0) { board[i] = tok; self.zone = 'gone'; emit(state, { type: 'transformed', uid: self.uid, player: pi, from: self.name, card: tok }); recomputeAuras(state); }
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('become-copy-of-dead', (state, pi, e, ctx, triggering) => {
	do { {
				// Creepy Painting: transform into a copy of a minion that just died
				const dead = ctx.dead, self = ctx.self;
				const def = dead && state.cardsById[dead.id];
				if (def && self && dead !== self && def.type === 'creature' && !isDead(self)) {
					const fresh = instantiate(def, pi);
					const board = state.players[pi].board;
					const i = board.indexOf(self);
					if (i >= 0) { fresh.uid = self.uid; fresh.zone = 'board'; fresh.sick = self.sick; board[i] = fresh; emit(state, { type: 'transform', uid: self.uid, name: fresh.name }); recomputeAuras(state); }
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('copy-spell', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


// condition-awaken sleepers (Stockades Prisoner / Crystalline Statue / Dozing
// Kelpkeeper): they start dormant with a big dormant:N fallback and wake early
// when their action counter fills. Waking mirrors the turn-tick awaken path
// (drowsy for the turn, fire the `awaken` effects).
function wakeDormantSelf(state, pi, c) {
	if (!c || c.dormantLeft <= 0) return;
	c.dormantLeft = 0;
	c.sick = true;
	emit(state, { type: 'awaken', player: pi, uid: c.uid, name: c.name });
	if (c.awaken) execEffects(state, pi, c.awaken, null, c);
	recomputeAuras(state);
}

registerTrigger('awaken-self', (state, pi, e, ctx, triggering) => {
	do { {
				// Stockades Prisoner (after you play 3 cards) / Crystalline Statue
				// (after you draw 4) — the ongoing's need:N counter gates the count,
				// this just wakes the sleeper once it fills.
				wakeDormantSelf(state, pi, ctx.self);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('accrue-mana-awaken', (state, pi, e, ctx, triggering) => {
	do { {
				// Dozing Kelpkeeper: after you have cast N Mana worth of spells,
				// awaken. Accrue the played spell's Cost on the sleeper instance.
				const c = ctx.self;
				if (!c || c.dormantLeft <= 0) break;
				c._manaAccrued = (c._manaAccrued || 0) + (ctx.played?.cost || 0);
				if (c._manaAccrued >= (e.threshold || 5)) wakeDormantSelf(state, pi, c);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('force-attacked-neighbor', (state, pi, e, ctx, triggering) => {
	do { {
				// Supercollider: after you attack a minion, force it to attack a neighbour
				const t = ctx.target;
				if (!t || isDead(t) || t.type === 'location') break;
				const board = state.players[t.controller].board;
				const i = board.indexOf(t);
				const neighbors = [board[i - 1], board[i + 1]].filter(n => n && !isDead(n) && n.type !== 'location');
				if (!neighbors.length) break;
				const n = neighbors[Math.floor(state.rng() * neighbors.length)];
				resolveCombat(state, t.controller, t.uid, { type: 'creature', uid: n.uid, player: n.controller });
				sweepDeaths(state);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('all-friendly-attack-target', (state, pi, e, ctx, triggering) => {
	do { {
				// Trueaim Crescent: after your hero attacks a minion, your minions attack it too
				const tgt = ctx.target;
				if (!tgt || isDead(tgt)) break;
				const uids = state.players[pi].board.filter(c => !isDead(c) && c.type !== 'location' && c.attack > 0).map(c => c.uid);
				for (const uid of uids) {
					if (state.over || isDead(tgt)) break;
					const m = state.players[pi].board.find(c => c.uid === uid);
					if (!m || isDead(m) || m.dormantLeft > 0) continue;
					resolveCombat(state, pi, m.uid, { type: 'creature', uid: tgt.uid, player: tgt.controller });
					sweepDeaths(state);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('destroy-frozen-attacked', (state, pi, e, ctx, triggering) => {
	do { {
				// Ice Breaker: destroy any Frozen minion this weapon damages
				const c = ctx.target;
				if (c && !isDead(c) && c.type !== 'location' && c.frozen) { c.doomed = true; emit(state, { type: 'death', uid: c.uid, player: c.controller, name: c.name }); sweepDeaths(state); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('damage-played-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// Overlord's Whip: after you play a minion, deal N damage to it
				const c = ctx.minion;
				if (c && !isDead(c) && c.type !== 'location') damageCreature(state, c, e.value || 1, ctx.self || null);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('copy-forged-to-hand', (state, pi, e, ctx, triggering) => {
	do { {
				// Melted Maker: after you Forge a card, get a copy of it (the upgraded
				// version). Clone the forged instance's live stats onto a fresh card.
				const src = ctx.card, p = state.players[pi];
				if (!src || p.hand.length >= MAX_HAND) break;
				const def = state.cardsById[src.id];
				const copy = def ? instantiate(def, pi) : null;
				if (!copy) break;
				copy.attack = src.attack;
				copy.maxHealth = src.maxHealth;
				copy.cost = src.cost;
				copy.keywords = [...(src.keywords || [])];
				copy.magnetic = src.magnetic;
				copy.forged = true;
				copy.forge = src.forge ? JSON.parse(JSON.stringify(src.forge)) : null; // a forged copy is spent (unless endless)
				if (src.effects) copy.effects = JSON.parse(JSON.stringify(src.effects));
				copy.zone = 'hand';
				p.hand.push(copy);
				emit(state, { type: 'conjure', player: pi, card: copy, color: null });
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('beasts-attack-random', (state, pi, e, ctx, triggering) => {
	do { {
				// Harried Herdsman: after you cast a Fire spell, each Beast you control
				// attacks a random enemy creature. Snapshot the Beasts up front (combat
				// reshapes the board), then swing them one at a time — the same
				// resolveCombat + sweepDeaths loop as attack-random-enemy, so it stays
				// fuzz-safe.
				const beastUids = state.players[pi].board
					.filter(c => !isDead(c) && c.type !== 'location' && (c.tribe || '').includes('Beast'))
					.map(c => c.uid);
				for (const uid of beastUids) {
					if (state.over) break;
					const beast = state.players[pi].board.find(c => c.uid === uid);
					if (!beast || isDead(beast) || beast.dormantLeft > 0) continue;
					const pool = opponentsOf(state, pi).flatMap(o =>
						state.players[o].board.filter(c => !isDead(c) && c.type !== 'location')
							.map(c => ({ type: 'creature', uid: c.uid, player: o })));
					if (!pool.length) break; // no enemy creatures left to swing at
					const t = pool[Math.floor(state.rng() * pool.length)];
					resolveCombat(state, pi, beast.uid, t);
					sweepDeaths(state);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('buff-magnetized', (state, pi, e, ctx, triggering) => {
	do { {
				// Invent-o-Matic: whenever you Magnetize a minion, give IT +N/+N
				const c = ctx.minion;
				if (c && !isDead(c) && c.type !== 'location') {
					c.attack = (c.attack || 0) + (e.attack || 1);
					c.maxHealth = (c.maxHealth || 0) + (e.health || 1);
					emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
					recomputeAuras(state);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('make-drawn-temporary', (state, pi, e, ctx, triggering) => {
	do { {
				// Clumsy Steward: after you draw a card, make it Temporary (discarded
				// from hand at the end of your turn)
				const c = ctx.card;
				if (c) { c.temporary = true; emit(state, { type: 'temporary', player: pi, uid: c.uid, name: c.name }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('even-target-stats', (state, pi, e, ctx, triggering) => {
	do { {
				// Pelagos: after you cast a spell on a friendly minion, set its Attack
				// and Health to the higher of the two. hp() reads current Health
				// (maxHealth − damage); we lift both to that peak and clear damage.
				const c = ctx.targetCreature;
				if (c && !isDead(c) && c.type !== 'location') {
					const peak = Math.max(c.attack || 0, hp(c));
					c.attack = peak;
					c.maxHealth = peak;
					c.damage = 0;
					emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
					recomputeAuras(state);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('return-played-spell', (state, pi, e, ctx, triggering) => {
	do { {
				// Diligent Notetaker (Spellburst): return the just-cast spell to hand
				const sp = ctx.played, pp = state.players[pi], def = sp && state.cardsById[sp.id];
				if (def) {
					const cp = instantiate(def, pi); cp.zone = 'hand';
					pp.hand.push(cp);
					emit(state, { type: 'conjure', player: pi, card: cp, color: null });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('prevent', (state, pi, e, ctx, triggering) => {
	do { ctx.prevented = true; break;
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('add-targeting-spell-copies', (state, pi, e, ctx, triggering) => {
	do { {
				// Jr./Sr. Navigator: whenever a spell targets this minion, add N
				// copies of that spell to your hand
				const sp = ctx.played, pp = state.players[pi], def = sp && state.cardsById[sp.id];
				if (def) {
					for (let n = 0; n < (e.count || 2) && pp.hand.length < MAX_HAND; n++) {
						const cp = instantiate(def, pi); cp.zone = 'hand';
						pp.hand.push(cp);
						emit(state, { type: 'conjure', player: pi, card: cp, color: null });
					}
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('bounce-attacked-survivor-to-hand', (state, pi, e, ctx, triggering) => {
	do { {
				// Kodo Hide Whip: after your hero attacks a minion and it survives,
				// put that minion in your hand (as its base card)
				const c = ctx.target, pp = state.players[pi];
				if (c && !isDead(c) && c.type !== 'location' && pp.hand.length < MAX_HAND) {
					const owner = state.players[c.controller];
					owner.board = owner.board.filter(x => x !== c);
					c.zone = 'gone';
					const def = state.cardsById[c.id];
					if (def) {
						const cp = instantiate(def, pi); cp.zone = 'hand';
						pp.hand.push(cp);
						emit(state, { type: 'conjure', player: pi, card: cp, color: null });
					}
					emit(state, { type: 'bounce', uid: c.uid });
					recomputeAuras(state);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('grant-played-if-cost', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('summon-on-friendly-heal', (state, pi, e, ctx, triggering) => {
	do { {
					// Nightscale Matriarch: a friendly creature was healed -> summon a token
					if (ctx.healedCreature && ctx.healedCreature.controller === pi) {
						summon(state, pi, { id: 'token_' + (e.name || 'whelp').toLowerCase(), name: e.name || 'Whelp', type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: e.attack || 3, health: e.health || 3, description: `A ${e.attack || 3}/${e.health || 3} token.` });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('grant-self-shield-on-heal', (state, pi, e, ctx, triggering) => {
	do { {
					// The Glass Knight: whenever you restore Health, regain Divine Shield
					const healedYours = ctx.healedHero === pi || (ctx.healedCreature && ctx.healedCreature.controller === pi);
					if (healedYours && ctx.self && !ctx.self.shield && !isDead(ctx.self)) {
						ctx.self.shield = true;
						if (!ctx.self.keywords.includes(KW.DIVINE_SHIELD)) ctx.self.keywords.push(KW.DIVINE_SHIELD);
						emit(state, { type: 'buff', uid: ctx.self.uid, attack: ctx.self.attack, hp: hp(ctx.self) });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('awaken-on-heal', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('add-shuffled-copy', (state, pi, e, ctx, triggering) => {
	do { {
					// Tak Nozwhisker: when you shuffle a card in, add a copy to your hand
					const def = ctx.cardId && state.cardsById[ctx.cardId];
					if (def && !def.token && state.players[pi].hand.length < MAX_HAND) {
						const c = instantiate(def, pi); c.zone = 'hand'; state.players[pi].hand.push(c);
						emit(state, { type: 'conjure', player: pi, card: c, color: null });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('add-choose-copies', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('summon-drawn-rush-doom', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('if-played-then', (state, pi, e, ctx, triggering) => {
	do { {
					// generic "after you play a creature matching X, do Y" (Underbelly Angler, Arcane Fletcher)
					const m = ctx.minion;
					if (m && m !== ctx.self && (e.cost == null || (m.cost || 0) === e.cost) && (!e.tribe || (m.tribe || '').includes(e.tribe))) {
						execEffects(state, pi, JSON.parse(JSON.stringify(e.then || [])), null, ctx.self);
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('tutor-spell-cost-plus', (state, pi, e, ctx, triggering) => {
	do { {
					// Spirit of the Frog: draw a spell costing (cast spell's cost + N)
					const sp = ctx.spell || ctx.played;
					if (sp) execEffects(state, pi, [{ type: 'tutor', cardType: 'spell', cost: (sp.cost || 0) + (e.value || 1) }], null, ctx.self);
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('grant-keyword-to-played', (state, pi, e, ctx, triggering) => {
	do { {
					// Mortuary Machine: give a keyword to the creature just played
					const m = ctx.minion;
					if (m && m !== ctx.self && e.keyword && !m.keywords.includes(e.keyword)) {
						m.keywords.push(e.keyword);
						if (e.keyword === KW.DIVINE_SHIELD) m.shield = true;
						emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('set-summoned-health-to-attack', (state, pi, e, ctx, triggering) => {
	do { {
					// High Priest Amet: a creature you summoned gets Health equal to its Attack
					const m = ctx.minion;
					if (m && m !== ctx.self) { m.maxHealth = m.attack; m.damage = 0; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('if-nth-spell-then', (state, pi, e, ctx, triggering) => {
	do { {
					// Chenvaala: after every 3rd spell this turn, run an effect
					if (((state.players[pi].spellsPlayedThisTurn || 0) % (e.every || 3)) === 0 && (state.players[pi].spellsPlayedThisTurn || 0) > 0) execEffects(state, pi, JSON.parse(JSON.stringify(e.then || [])), null, ctx.self);
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('if-summoned-tribe-then', (state, pi, e, ctx, triggering) => {
	do { {
					// Skybarge: after you summon a creature of a tribe, run an effect
					const m = ctx.minion;
					if (m && m !== ctx.self && (!e.tribe || (m.tribe || '').includes(e.tribe))) execEffects(state, pi, JSON.parse(JSON.stringify(e.then || [])), null, ctx.self);
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('buff-summoned-if-tribe', (state, pi, e, ctx, triggering) => {
	do { {
					// Spirit of the Lynx: you summoned a creature of a tribe -> buff it.
					// Also gates on requireKeyword (Parade Leader: Rush) and maxHealth
					// (Carnival Barker: a 1-Health minion).
					const m = ctx.minion;
					if (m && m !== ctx.self && (!e.tribe || (m.tribe || '').includes(e.tribe))
						&& (!e.requireKeyword || (m.keywords || []).includes(e.requireKeyword))
						&& (!e.ifName || m.name === e.ifName)
						&& (e.maxHealth == null || hp(m) <= e.maxHealth)
						&& (!e.maxAttackSelf || (ctx.self && m.attack < ctx.self.attack))) { // Blood Matriarch Liadrin
						if (e.grant && !m.keywords.includes(e.grant)) { m.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) m.shield = true; } // Lothraxion
						for (const g of e.grants || []) if (!m.keywords.includes(g)) { m.keywords.push(g); if (g === KW.DIVINE_SHIELD) m.shield = true; if (g === KW.STEALTH) m.stealthed = true; } // Liadrin: DS + Rush
						m.attack += e.attack || 0; m.maxHealth += e.health || 0;
						emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


const _t_buff_random_hand_on_death = (state, pi, e, ctx, triggering) => {
	do { {
					// Spirit of the Bat / History Buff: buff a random creature in your hand
					const pool = state.players[pi].hand.filter(c => c.type === 'creature');
					if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.attack += e.attack || 0; c.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
};
registerTrigger('buff-random-hand-on-death', _t_buff_random_hand_on_death);


registerTrigger('shuffle-cheap-copy-of-dead', (state, pi, e, ctx, triggering) => {
	do { {
					// Spirit of the Dead: shuffle a cost-set copy of the fallen friendly into your deck
					const m = ctx.dead;
					if (m && state.cardsById[m.id] && !state.cardsById[m.id].token) {
						state.players[pi].deck.push(m.id); // (cost override is cosmetic once shuffled; keep it simple)
						const dk = state.players[pi].deck;
						for (let i = dk.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [dk[i], dk[j]] = [dk[j], dk[i]]; }
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('summon-of-spell-cost', (state, pi, e, ctx, triggering) => {
	do { {
					// Spirit of the Tiger (e.name set): summon a token with stats = the spell's Cost.
					// Summoning Stone / Atiesh / Jailhouse Manastorm (no e.name): summon a RANDOM minion of that Cost.
					// (These were two duplicate switch cases — the token variant shadowed the random one.)
					const sp = ctx.spell || ctx.played;
					if (sp && e.name) { const n = sp.cost || 0; summon(state, pi, { id: 'token_' + e.name.toLowerCase(), name: e.name, type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: n, health: n, keywords: e.keywords || [], description: `A ${n}/${n} token.` }); } // Ceremonial Maul: a Student with Taunt
					else if (sp) execEffects(state, pi, [{ type: 'summon-random', cost: sp.cost || 0, ...(e.legendary ? { rarity: 'legendary' } : {}) }], null, ctx.self); // The Fist of Ra-den: a Legendary of that Cost
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('buff-drawn-if-tribe', (state, pi, e, ctx, triggering) => {
	do { {
					// Untamed Beastmaster: you drew a creature of a tribe -> buff it in hand
					const c = ctx.card;
					if (c && c.type === 'creature' && (!e.tribe || (c.tribe || '').includes(e.tribe))) {
						c.attack += e.attack || 0; c.maxHealth += e.health || 0;
						emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('draw-on-big-heal', (state, pi, e, ctx, triggering) => {
	do { {
					// Soup Vendor: restore N+ to your hero -> draw a card
					if (ctx.healedHero === pi && (ctx.amount || 0) >= (e.min || 3)) drawCards(state, pi, e.value || 1);
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('hatch-self-into', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('transform-drawn-legendary', (state, pi, e, ctx, triggering) => {
	do { {
					// Transmogrifier: replace a drawn card with a random Legendary creature
					const c = ctx.card;
					if (c) {
						const legs = Object.values(state.cardsById).filter(d => d.type === 'creature' && d.rarity === 'legendary' && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
						if (legs.length) { const pick = legs[Math.floor(state.rng() * legs.length)]; const p2 = state.players[pi]; const idx = p2.hand.indexOf(c); if (idx >= 0) { const nc = instantiate(pick, pi); nc.zone = 'hand'; p2.hand[idx] = nc; emit(state, { type: 'conjure', player: pi, card: nc, color: null }); } }
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('add-drawn-copy', (state, pi, e, ctx, triggering) => {
	do { {
					// Archmage Arugal: you drew a creature -> add a copy to your hand
					const c = ctx.card;
					if (c && c.type === 'creature' && state.cardsById[c.id] && state.players[pi].hand.length < MAX_HAND) {
						const cp = instantiate(state.cardsById[c.id], pi); cp.zone = 'hand'; state.players[pi].hand.push(cp);
						emit(state, { type: 'conjure', player: pi, card: cp, color: null });
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('summon-drawn-copy', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('become-copy-of-played', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('doom-played-deathrattle', (state, pi, e, ctx, triggering) => {
	do { {
					// Reckless Experimenter: a Deathrattle creature you played dies at end of turn
					const m = ctx.minion;
					if (m && m !== ctx.self && (m.keywords || []).includes('deathrattle')) m.doomTurn = state.turnNumber;
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('summon-enemy-minion-copy', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('summon-copy-of-played', (state, pi, e, ctx, triggering) => {
	do { {
					// Ixlid, Fungal Lord: summon a copy of the creature you just played.
					// Playmaker (e.health set): the copy arrives with N Health remaining.
					// (Merged: this branch shadowed Playmaker's health-rider duplicate.)
					const m = ctx.minion;
					if (m && m !== ctx.self) {
						const def = state.cardsById[m.id];
						if (def) {
							const c = summon(state, pi, def);
							if (c && e.health != null) {
								c.damage = Math.max(0, (c.maxHealth || 1) - e.health);
								emit(state, { type: 'damage', targetType: 'creature', uid: c.uid, amount: 0, hp: hp(c) });
							}
						}
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('add-copy-of-dead', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('add-frozen-copy', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('damage-random-enemy-heal', (state, pi, e, ctx, triggering) => {
	do { {
					// Blackguard: when YOUR hero is healed, deal that much to a random enemy minion
					if (ctx.healedHero === pi && (ctx.amount || 0) > 0) {
						const bpool = opponentsOf(state, pi).flatMap(o => state.players[o].board.filter(c => !isDead(c) && c.type !== 'location'));
						if (bpool.length) damageCreature(state, bpool[Math.floor(state.rng() * bpool.length)], ctx.amount, null);
					}
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('reflect-damage', (state, pi, e, ctx, triggering) => {
	do { {
				// hit whoever dealt the damage; fall back to a random enemy
				const opps = opponentsOf(state, pi);
				const src = ctx.src != null && ctx.src !== pi && !state.players[ctx.src]?.eliminated ? ctx.src : null;
				const t = src ?? (opps.length ? opps[Math.floor(state.rng() * opps.length)] : null);
				if (t != null) damageHero(state, t, ctx.amount || 0, pi);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('destroy-attacker', (state, pi, e, ctx, triggering) => {
	do { {
				const m = triggering();
				if (m) { m.damage = m.maxHealth; m.shield = false; emit(state, { type: 'destroy', uid: m.uid }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('damage-minion', (state, pi, e, ctx, triggering) => {
	do { {
				const m = triggering();
				if (m) {
					const before = hp(m);
					damageCreature(state, m, e.value, null);
					if (e.excessToHero && e.value > before && m.controller != null) damageHero(state, m.controller, e.value - before, pi); // Explosive Runes: excess to their hero
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

registerTrigger('copy-triggering-to-hand', (state, pi, e, ctx, triggering) => {
	// Frozen Clone / Duplicate: add N copies of the triggering minion to your hand
	// (ctx.minion works even when the minion just DIED — triggering() filters dead ones out)
	const m = ctx.minion || triggering();
	if (!m) return;
	const def = state.cardsById[m.id] || { id: m.id, name: m.name, type: 'creature', cost: m.cost, rarity: m.rarity, description: m.description, attack: m.attack, health: m.maxHealth, keywords: [...(m.keywords || [])] };
	for (let i = 0; i < (e.count || 1); i++) { if (state.players[pi].hand.length >= MAX_HAND) break; const cp = instantiate(def, pi); cp.zone = 'hand'; state.players[pi].hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
});

registerTrigger('transform-triggering', (state, pi, e, ctx, triggering) => {
	// Potion of Polymorph / Mystic Misdirection: transform the played/attacking minion into a token (in place, no death)
	const t = ctx.minion || triggering();
	if (!t || isDead(t)) return;
	const nm = e.name || 'Sheep';
	const tok = instantiate({ id: 'token_' + nm.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: nm, type: 'creature', cost: 0, rarity: 'common', token: true, description: `A ${e.attack || 1}/${e.health || 1} ${nm}.`, attack: e.attack || 1, health: e.health || 1, keywords: e.keywords || [] }, t.controller);
	const board = state.players[t.controller].board;
	const idx = board.indexOf(t); if (idx < 0) return;
	tok.zone = 'board'; tok.sick = t.sick;
	board[idx] = tok; t.zone = 'gone';
	emit(state, { type: 'transformed', uid: t.uid, player: t.controller, from: t.name, card: tok });
	recomputeAuras(state);
});

registerTrigger('counter-triggering', (state, pi, e, ctx, triggering) => {
	// Objection!: Counter the played minion — remove it silently (no death/Deathrattle)
	const m = ctx.minion || triggering();
	if (!m) return;
	const board = state.players[m.controller].board;
	const idx = board.indexOf(m); if (idx < 0) return;
	board.splice(idx, 1); m.zone = 'gone';
	emit(state, { type: 'countered', player: m.controller, uid: m.uid, name: m.name });
	recomputeAuras(state);
});

registerTrigger('summon-copy-attacker-attack', (state, pi, e, ctx, triggering) => {
	// Vengeful Visage: summon a copy of the attacking minion; it attacks the enemy hero
	const m = triggering();
	if (!m) return;
	const def = state.cardsById[m.id] || { id: m.id, name: m.name, type: 'creature', cost: m.cost, rarity: m.rarity, description: m.description, attack: m.attack, health: m.maxHealth, keywords: [...(m.keywords || [])] };
	const c = summon(state, pi, def);
	if (c) { c.sick = false; const foe = opponentsOf(state, pi)[0]; if (foe != null && !isDead(c)) resolveCombat(state, pi, c.uid, { type: 'hero', player: foe }); }
});

registerTrigger('summon-random-triggering-cost', (state, pi, e, ctx, triggering) => {
	// Effigy: summon a random minion with the same Cost as the triggering (dead) minion
	const m = ctx.minion || triggering();
	if (m) execEffects(state, pi, [{ type: 'summon-random', cost: m.cost || 0 }], null, null);
});

registerTrigger('destroy-highest-enemy-minion', (state, pi, e, ctx, triggering) => {
	// Flames of Infinity: destroy the enemy's highest-Health minion
	let best = null;
	for (const o of opponentsOf(state, pi)) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location' && (!best || hp(c) > hp(best))) best = c;
	if (best) { best.doomed = true; emit(state, { type: 'destroy', uid: best.uid }); sweepDeaths(state); }
});


registerTrigger('freeze-attacker', (state, pi, e, ctx, triggering) => {
	do { {
				const m = triggering();
				if (m) freezeCreature(state, m);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


// TWIN KEPT (PR 39): subject differs: trigger = the triggering minion; effects = chosen target / all-* — both needed
registerTrigger('set-attack', (state, pi, e, ctx, triggering) => {
	do { {
				const m = e.target === 'self' ? ctx.self : triggering(); // Toothy Chest / Validated Doomsayer: set THIS creature's Attack via an ongoing
				if (m) { m.attack = e.value; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('buff-minion', (state, pi, e, ctx, triggering) => {
	do { {
				const m = triggering();
				if (m) {
					m.attack += e.attack || 0;
					m.maxHealth += e.health || 0;
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('revive-minion', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('spellbender-redirect', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('lose-durability', (state, pi, e, ctx, triggering) => {
	do { {
				// Sword of Justice pays for its blessing
				const m = ctx.self;
				if (m && m.type === 'weapon' && state.players[pi].weapon === m) {
					degradeWeapon(state, pi);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('cho-copy', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


// TWIN KEPT (PR 39): different cards: trigger = Alarm-o-Bot (self swaps, same instance back); effects = Vol'jin (chosen target, fresh copy)
registerTrigger('swap-with-hand', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('grant-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// bless the triggering minion (Warsong Commander's Charge)
				const m = triggering();
				if (m && !m.keywords.includes(e.keyword)) {
					m.keywords.push(e.keyword);
					if (e.keyword === KW.DIVINE_SHIELD) m.shield = true;
					if (e.keyword === KW.STEALTH) m.stealthed = true;
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


// TWIN KEPT (PR 39): divergent details kept: trigger includes self unless excludeSelf + sets stealthed; effects always excludes source + count support
registerTrigger('buff-random-friendly', (state, pi, e, ctx, triggering) => {
	do { {
				const pool = state.players[pi].board.filter(c => !isDead(c)
					&& (!e.excludeSelf || c !== ctx.self)
						&& (!e.requireDamaged || c.damage > 0) // Stonecarver: only a damaged minion
					&& (!e.tribe || (c.tribe || '').includes(e.tribe)));
				if (pool.length) {
					const m = pool[Math.floor(state.rng() * pool.length)];
					m.attack += e.attack || 0;
					m.maxHealth += e.health || 0;
					if (e.grant && !m.keywords.includes(e.grant)) { m.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) m.shield = true; if (e.grant === KW.STEALTH) m.stealthed = true; } // Mekkatorque's Aura
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('counter-self', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('grant-self', (state, pi, e, ctx, triggering) => {
	do { {
				// One-eyed Cheat: the firing permanent gains a keyword
				const m = ctx.self;
				if (m && !isDead(m) && !m.keywords.includes(e.keyword)) {
					m.keywords.push(e.keyword);
					if (e.keyword === KW.STEALTH) m.stealthed = true;
					if (e.keyword === KW.DIVINE_SHIELD) m.shield = true; // Ogre-Gang Ace
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


// TWIN KEPT (PR 39): trigger = plain += (no buffCreature riders); effects = buffCreature (doubleBuffs/statGainBonus) + per-scaling — riders differ by design
registerTrigger('buff-self', (state, pi, e, ctx, triggering) => {
	do { {
				const m = ctx.self;
				if (m && !isDead(m)) {
					m.attack += e.attack || 0;
					m.maxHealth += e.health || 0;
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('reduce-drawn-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Shadowfiend: the just-drawn card costs (N) less
				if (ctx.card) ctx.card.cost = Math.max(0, (ctx.card.cost || 0) - (e.value || 1));
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('mirror-damage-to-own-hero', (state, pi, e, ctx, triggering) => {
	do { {
				// Wrathguard: when this takes damage, deal that much to your own hero
				if (ctx.amount > 0) damageHero(state, pi, ctx.amount, pi);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('maybe-draw-drawer', (state, pi, e, ctx, triggering) => {
	do { {
				// Nat, the Darkfisher: at the opponent's turn start, they may draw
				if (state.rng() < (e.chance || 0.5)) drawCards(state, ctx.drawer ?? state.current, 1);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('gain-armor-by-amount', (state, pi, e, ctx, triggering) => {
	do { {
				// Alley Armorsmith: gain Armor equal to the damage just dealt
				if (ctx.amount > 0) gainArmor(state, pi, ctx.amount);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('gain-armor-spell-cost', (state, pi, e, ctx, triggering) => {
	do { {
					// Arcane Artificer: gain Armor equal to the cast spell's Cost
					const sp = ctx.spell || ctx.played;
					if (sp) gainArmor(state, pi, sp.cost || 0);
					break;
				}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('trigger-summoned-deathrattle', (state, pi, e, ctx, triggering) => {
	do { {
				// Spiritsinger Umbra: fire the just-summoned creature's Deathrattle now
				const m = ctx.minion;
				if (m && m !== ctx.self && m.deathrattle) runDeathrattle(state, m.controller, m);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('remember-spell', (state, pi, e, ctx, triggering) => {
	do { {
				// Primalfin Champion: record spells cast on this creature
				if (ctx.self && ctx.spell) { (ctx.self.rememberedSpells = ctx.self.rememberedSpells || []).push(ctx.spell.id); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('copy-enemy-spell', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('destroy-damaged', (state, pi, e, ctx, triggering) => {
	do { {
				// Acidmaw: destroy the creature that was just damaged
				const t = ctx.damaged;
				if (t && !isDead(t)) { t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('buff-self-by-amount', (state, pi, e, ctx, triggering) => {
	do { {
				// Tunnel Trogg: +1 Attack per locked crystal (the Overload amount)
				const m = ctx.self;
				if (m && !isDead(m) && ctx.amount > 0) {
					m.attack += (e.attack || 1) * ctx.amount;
					m.maxHealth += (e.health || 0) * ctx.amount;
					emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('copy-drawn', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


// TWIN KEPT (PR 39): subject differs: trigger = the triggering minion; effects = chosen target / all-* — both needed
registerTrigger('set-health', (state, pi, e, ctx, triggering) => {
	do { {
				const m = triggering();
				if (m) { m.maxHealth = e.value; m.damage = 0; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('copy-minion', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('bounce-attacker', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('summon-redirect', (state, pi, e, ctx, triggering) => {
	do { {
				const t = summon(state, pi, {
					id: 'token_' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: e.name, type: 'creature', cost: 0, rarity: 'common',
					description: `A ${e.attack}/${e.health} token.`,
					attack: e.attack, health: e.health, keywords: e.keywords || [],
				});
				if (t) ctx.target = { type: 'creature', uid: t.uid, player: pi };
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('redirect-random', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('gain-dead-stats', (state, pi, e, ctx, triggering) => {
	do { {
				// Glugg: gain the ORIGINAL (printed) stats of the friendly creature that died
				const dead = ctx.dead, def = dead && state.cardsById[dead.id], self = ctx.self;
				if (self && def && !isDead(self)) {
					self.attack += def.attack || 0;
					self.maxHealth += def.health || 0;
					emit(state, { type: 'buff', uid: self.uid, attack: self.attack, hp: hp(self) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('destroy-triggering', (state, pi, e, ctx, triggering) => {
	do { {
				// Frost Queen Sindragosa: destroy the enemy creature that was just Frozen
				const t = ctx.frozen || ctx.minion;
				if (t && !isDead(t) && t.controller !== pi) {
					t.damage = t.maxHealth; t.shield = false;
					emit(state, { type: 'destroy', uid: t.uid });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('opponent-may-pay', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('mirror-to-hero', (state, pi, e, ctx, triggering) => {
	do {
				// Soulbound Ashtongue: also deal the damage taken to your hero
				if (ctx.amount) damageHero(state, pi, ctx.amount, pi);
				break;
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('conjure-same-cost-spell', (state, pi, e, ctx, triggering) => {
	do { {
				// Cheesemonger: when the opponent casts a spell, add a random spell of the same Cost
				const sp = ctx.spell; const p = state.players[pi];
				if (sp && p.hand.length < MAX_HAND) {
					const pool = Object.values(state.cardsById).filter(d => isSpellType(d) && !d.token && d.collectible !== false && !(d.colors && d.colors.length) && (d.cost || 0) === (sp.cost || 0));
					if (pool.length) { const nc = instantiate(pool[Math.floor(state.rng() * pool.length)], pi); nc.zone = 'hand'; p.hand.push(nc); emit(state, { type: 'conjure', player: pi, card: nc, color: null }); }
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('add-mini-copy-of-drawn', (state, pi, e, ctx, triggering) => {
	do { {
				// Puppetmaster Dorian: after you draw a minion, add a 1/1 copy of it that costs (1)
				const d = ctx.card; const pp = state.players[pi];
				if (d && (state.cardsById[d.id]?.type === 'creature') && pp.hand.length < MAX_HAND) {
					const nc = instantiate(state.cardsById[d.id], pi); nc.zone = 'hand'; nc.attack = e.attack ?? 1; nc.maxHealth = e.health ?? 1; nc.cost = e.cost ?? 1; pp.hand.push(nc);
					emit(state, { type: 'conjure', player: pi, card: nc, color: null });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('summon-copy-attack-die', (state, pi, e, ctx, triggering) => {
	do { {
				// Shoplifter Goldbeard: summon a copy of the just-summoned minion; it attacks a random enemy, then dies.
				// Re-entrancy latch: summon() fires 'summoned' INTERNALLY, so the copy
				// used to re-trigger this handler before `_shoplifterCopy` could be set —
				// infinite recursion (fuzz seed 9419695). The latch closes the window.
				const m = ctx.minion; const def = m && state.cardsById[m.id];
				if (def && m !== ctx.self && !m._shoplifterCopy && !ctx.self._shoplifting) {
					ctx.self._shoplifting = true;
					const copy = summon(state, pi, def);
					ctx.self._shoplifting = false;
					if (copy) {
						copy._shoplifterCopy = true; // don't let the copy re-trigger Goldbeard
						copy.sick = false;
						const foes = [];
						for (const o of opponentsOf(state, pi)) { for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location' && !c.stealthed && c.dormantLeft <= 0) foes.push({ type: 'creature', uid: c.uid, player: o }); foes.push({ type: 'hero', player: o }); }
						if (foes.length && !isDead(copy)) resolveCombat(state, pi, copy.uid, foes[Math.floor(state.rng() * foes.length)]);
						if (!isDead(copy)) { copy.damage = copy.maxHealth; copy.shield = false; emit(state, { type: 'destroy', uid: copy.uid }); sweepDeaths(state); }
					}
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('add-copy-of-played-minion-free', (state, pi, e, ctx, triggering) => {
	do { {
				// Sonya Waterdancer: after you play a low-Cost minion, add a (0)-cost copy to hand
				const m = ctx.minion; const pp = state.players[pi];
				if (m && m !== ctx.self && m.type === 'creature' && (m.cost || 0) <= (e.maxCost ?? 1) && state.cardsById[m.id] && pp.hand.length < MAX_HAND) {
					const nc = instantiate(state.cardsById[m.id], pi); nc.zone = 'hand'; nc.cost = 0; pp.hand.push(nc);
					emit(state, { type: 'conjure', player: pi, card: nc, color: null });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('add-copy-of-played-free', (state, pi, e, ctx, triggering) => {
	do { {
				// Tamsin Roame: when you cast a qualifying spell, add a (0)-cost copy to hand
				const sp = ctx.played; const p = state.players[pi];
				if (sp && (sp.cost || 0) >= (e.minCost || 0) && state.cardsById[sp.id] && p.hand.length < MAX_HAND) {
					const nc = instantiate(state.cardsById[sp.id], pi); nc.zone = 'hand'; nc.cost = 0; p.hand.push(nc);
					emit(state, { type: 'conjure', player: pi, card: nc, color: null });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('summon-dead-copy-no-keyword', (state, pi, e, ctx, triggering) => {
	do { {
				// Plaguemaw the Rotting: resummon the fallen minion without a keyword
				const dead = ctx.dead; const base = dead && state.cardsById[dead.id];
				if (base) { const def = JSON.parse(JSON.stringify(base)); def.keywords = (def.keywords || []).filter(k => k !== e.keyword); const c = summon(state, pi, def); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('attack-played-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// Gankster: attack the minion the opponent just played
				const m = ctx.minion;
				if (m && !isDead(m) && ctx.self && !isDead(ctx.self)) resolveCombat(state, ctx.self.controller, ctx.self.uid, { type: 'creature', uid: m.uid, player: m.controller });
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('damage-hero-by-spell-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Raj Naz'jan: deal damage to the enemy hero equal to the cast spell's Cost
				const cost = ctx.played ? (ctx.played.cost || 0) : 0;
				if (cost > 0) for (const o of opponentsOf(state, pi)) damageHero(state, o, cost, pi);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('buff-self-if-unspent-mana', (state, pi, e, ctx, triggering) => {
	do { {
				// Spirit of the Tides: buff at end of turn if you have unspent Mana
				if (availableMana(state.players[pi]) > 0 && ctx.self && !isDead(ctx.self)) { ctx.self.attack += e.attack || 0; ctx.self.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: ctx.self.uid, attack: ctx.self.attack, hp: hp(ctx.self) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('destroy-self-if-amount', (state, pi, e, ctx, triggering) => {
	do { {
				// Bubbler: pop when it takes exactly `amount` damage
				if (ctx.amount === (e.amount ?? 1) && ctx.self && !isDead(ctx.self)) { ctx.self.damage = ctx.self.maxHealth; ctx.self.shield = false; emit(state, { type: 'destroy', uid: ctx.self.uid }); sweepDeaths(state); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('recast-played-on-random-friendly', (state, pi, e, ctx, triggering) => {
	do { {
				// Kotori Lightblade: recast the spell just cast on this, on another friendly minion
				const sp = ctx.played; const def = sp && state.cardsById[sp.id];
				if (def && def.effects) {
					const pool = state.players[pi].board.filter(c => c !== ctx.self && !isDead(c) && c.type !== 'location');
					if (pool.length) { const t = pool[Math.floor(state.rng() * pool.length)]; execEffects(state, pi, JSON.parse(JSON.stringify(def.effects)), { type: 'creature', uid: t.uid, player: pi }, ctx.self); }
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('damage-frozen', (state, pi, e, ctx, triggering) => {
	do { {
				// Cheaty Snobold: deal damage to the minion that was just Frozen
				const f = ctx.frozen;
				if (f && !isDead(f)) { damageCreature(state, f, e.value || 3, ctx.self || null); sweepDeaths(state); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('buff-healed-creature', (state, pi, e, ctx, triggering) => {
	do { {
				// Luminous Geode: give the just-healed minion +Attack
				const hc = ctx.healedCreature;
				if (hc && !isDead(hc)) { hc.attack += e.attack || 0; hc.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: hc.uid, attack: hc.attack, hp: hp(hc) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('become-2-2-copy-rush', (state, pi, e, ctx, triggering) => {
	do { {
				// Forsaken Lieutenant: become a 2/2 copy of the played Deathrattle minion, with Rush
				const m2 = ctx.minion; const self = ctx.self; const base2 = m2 && state.cardsById[m2.id];
				if (base2 && self && self.zone === 'board' && !isDead(self)) {
					const def = JSON.parse(JSON.stringify(base2)); def.attack = 2; def.health = 2; def.token = true; def.id = 'token_' + base2.id; def.keywords = [...new Set([...(def.keywords || []), 'rush'])];
					const tok = instantiate(def, pi); tok.zone = 'board'; tok.sick = self.sick;
					const board = state.players[pi].board; board[board.indexOf(self)] = tok; self.zone = 'gone';
					emit(state, { type: 'transformed', uid: self.uid, player: pi, from: self.name, card: tok }); recomputeAuras(state);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('bump-drawn-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Far Watch Post: after the opponent draws, that card costs more (capped)
				const drawn = ctx.card;
				if (drawn) drawn.cost = Math.min(e.cap || 10, (drawn.cost || 0) + (e.value || 1));
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('add-copy-cost', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('set-victim-stats', (state, pi, e, ctx, triggering) => {
	do { {
				// Turalyon, the Tenured: set the attacked minion's Attack and Health to N
				const v = ctx.victim;
				if (v && !isDead(v)) { v.attack = e.value || 3; v.maxHealth = e.value || 3; v.damage = 0; v.tempHealth = 0; emit(state, { type: 'buff', uid: v.uid, attack: v.attack, hp: hp(v) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('buff-self-by-spell-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Speaker Gidra (Spellburst): gain Attack and Health equal to the spell's Cost; Animated Moonwell: Attack only
				const cost = ctx.played ? (ctx.played.cost || 0) : 0;
				if (ctx.self && !isDead(ctx.self) && cost > 0) execEffects(state, pi, [{ type: 'buff-self', attack: cost, health: e.attackOnly ? 0 : cost }], null, ctx.self);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('damage-triggering-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// deal N damage to the minion that was just summoned/played;
				// `corpses`: only by spending that many Corpses (Corpse Flower)
				const m = ctx.minion;
				if (e.corpses) {
					const p2 = state.players[pi];
					if ((p2.corpses || 0) < e.corpses) break;
					if (m && !isDead(m) && m.type !== 'location') { spendCorpses(state, pi, e.corpses); emit(state, { type: 'corpses', player: pi, corpses: p2.corpses }); }
					else break;
				}
				if (m && !isDead(m) && m.type !== 'location') damageCreature(state, m, e.value || 3, ctx.self || null);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('lurker-damage', (state, pi, e, ctx, triggering) => {
	do { {
				// Lurker: 1 damage to a random enemy after a friendly attack (2 if the attacker is a Zerg)
				const v = (ctx.minion && (ctx.minion.tribe || '').includes('Zerg')) ? 2 : 1;
				execEffects(state, pi, [{ type: 'random-damage', value: v, count: 1, pool: 'enemies' }], null, ctx.self || null);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('set-self-attack', (state, pi, e, ctx, triggering) => {
	do { {
				// Murozond, Unbounded: Attack becomes INFINITY (well, 9999)
				if (ctx.self && !isDead(ctx.self)) { ctx.self.attack = e.value || 9999; emit(state, { type: 'buff', uid: ctx.self.uid, attack: ctx.self.attack, hp: hp(ctx.self) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('grow-counter', (state, pi, e, ctx, triggering) => {
	do { {
				// Omen: remember how often this has attacked
				if (ctx.self) ctx.self[e.key || '_grew'] = (ctx.self[e.key || '_grew'] || 0) + 1;
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('silence-destroy-triggering', (state, pi, e, ctx, triggering) => {
	do { {
				// Bayfin Bodybuilder: silence and destroy the minion that just appeared
				const m = ctx.minion;
				if (m && !isDead(m) && m.type === 'creature') {
					silenceCreature(state, m);
					m.damage = m.maxHealth; m.shield = false;
					emit(state, { type: 'destroy', uid: m.uid });
					sweepDeaths(state);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('gorm-consume', (state, pi, e, ctx, triggering) => {
	do { {
				// Gorm the Worldeater: eat the minion to your right, wake 2 turns sooner
				const p2 = state.players[pi];
				const self = ctx.self;
				if (!self || self.dormantLeft <= 0) break;
				const i = p2.board.indexOf(self);
				const r = i >= 0 ? p2.board[i + 1] : null;
				if (r && !isDead(r) && r.type === 'creature') {
					r.damage = r.maxHealth; r.shield = false;
					emit(state, { type: 'destroy', uid: r.uid });
					sweepDeaths(state);
					self.dormantLeft = Math.max(0, self.dormantLeft - 2);
					emit(state, { type: 'dormant', player: pi, uid: self.uid, turns: self.dormantLeft });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('become-location', (state, pi, e, ctx, triggering) => {
	do { {
				// Sanc'Azel: after attacking, flip into a location
				const self2 = ctx.self;
				const p2 = state.players[pi];
				const def2 = state.cardsById[e.id];
				if (self2 && def2 && p2.board.includes(self2) && !isDead(self2)) {
					const loc = instantiate(def2, pi);
					loc.zone = 'board';
					p2.board[p2.board.indexOf(self2)] = loc;
					self2.zone = 'gone';
					emit(state, { type: 'transformed', uid: self2.uid, player: pi, from: self2.name, card: loc });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('magma-splash', (state, pi, e, ctx, triggering) => {
	do { {
				// Magma Hound: only after this survives attacking a MINION
				if (ctx.targetType === 'creature' && ctx.self && !isDead(ctx.self)) {
					execEffects(state, pi, [{ type: 'random-damage', value: 1, count: ctx.self.attack || 0, pool: 'enemies' }], null, ctx.self);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('grove-treant', (state, pi, e, ctx, triggering) => {
	do { {
				// Grove Shaper: a 2/2 Treant carrying "Deathrattle: copy that spell"
				const sp = ctx.played || ctx.spell;
				const tr = summon(state, pi, { id: 'token_grove_treant', name: 'Treant', type: 'creature', cost: 2, attack: 2, health: 2, rarity: 'common', token: true, keywords: ['deathrattle'], description: 'Deathrattle: Add a copy of the spell to your hand.' });
				if (tr && sp && state.cardsById[sp.id]) tr.deathrattle = [{ type: 'conjure-id', id: sp.id }];
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('attack-healed-enemy', (state, pi, e, ctx, triggering) => {
	do { {
				// Wilted Shadow: whenever you heal an enemy, this attacks it
				const hcx = ctx.healedCreature;
				if (hcx && hcx.controller !== pi && ctx.self && !isDead(ctx.self) && !isDead(hcx)) {
					damageCreature(state, hcx, ctx.self.attack, ctx.self);
					damageCreature(state, ctx.self, hcx.attack, hcx);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('ido-blessing', (state, pi, e, ctx, triggering) => {
	do { {
				// Ido of the Threshfleet: keep a Blessing in your hand while alive
				const p2 = state.players[pi];
				if (ctx.self && !isDead(ctx.self) && !p2.hand.some(c => c.id === 'threshfleet_blessing') && p2.hand.length < MAX_HAND && state.cardsById['threshfleet_blessing']) {
					const bc = instantiate(state.cardsById['threshfleet_blessing'], pi);
					bc.zone = 'hand'; p2.hand.push(bc);
					emit(state, { type: 'conjure', player: pi, card: bc, color: null });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('corpse-reborn', (state, pi, e, ctx, triggering) => {
	do { {
				// Hollow Direhorn: spend Corpses to regain Reborn after a friendly death
				const p2 = state.players[pi];
				const self = ctx.self;
				if (self && !isDead(self) && !has(self, KW.REBORN) && (p2.corpses || 0) >= (e.corpses || 3)) {
					spendCorpses(state, pi, e.corpses || 3);
					emit(state, { type: 'corpses', player: pi, corpses: p2.corpses });
					self.keywords.push(KW.REBORN);
					emit(state, { type: 'buff', uid: self.uid, attack: self.attack, hp: hp(self) });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('cleave-enemies-by-attack', (state, pi, e, ctx, triggering) => {
	do { {
				// The Great Dracorex: after it attacks an enemy minion, damage ALL other enemy minions by its Attack
				const self = ctx.self, victim = ctx.victim;
				if (self && !isDead(self)) { const amt = self.attack || 0; if (amt > 0) { for (const o of opponentsOf(state, pi)) for (const c of [...state.players[o].board]) if (!isDead(c) && c !== victim && c.type !== 'location') damageCreature(state, c, amt, self); sweepDeaths(state); } }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('double-triggering-minion-stats', (state, pi, e, ctx, triggering) => {
	do { {
				// Niri of the Crater: when you play a 1-Cost minion, double its stats
				const m = ctx.minion;
				if (m && !isDead(m) && m.type !== 'location') { m.attack = (m.attack || 0) * 2; m.maxHealth = (m.maxHealth || 0) * 2; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('attack-hero-target', (state, pi, e, ctx, triggering) => {
	do { {
				// Illidari Inquisitor: after your hero attacks an enemy minion, this attacks it too
				const t = ctx.target, s6 = ctx.self;
				if (t && s6 && !isDead(t) && !isDead(s6) && s6.zone === 'board') { s6.sick = false; resolveCombat(state, s6.controller, s6.uid, { type: 'creature', uid: t.uid, player: t.controller }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('gain-summoned-stats', (state, pi, e, ctx, triggering) => {
	do { {
				// Tras'tath, Soul Parasite: after you summon a Demon, gain its stats
				const m = ctx.minion, s5 = ctx.self;
				if (m && s5 && m !== s5 && !isDead(s5) && (!e.tribe || (m.tribe || '').includes(e.tribe))) { s5.attack += m.attack || 0; s5.maxHealth += hp(m) || 0; emit(state, { type: 'buff', uid: s5.uid, attack: s5.attack, hp: hp(s5) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('buff-damaged-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// Rioter: after a friendly minion survives damage, give it +N Attack
				const m = ctx.damaged;
				if (m && !isDead(m) && m !== ctx.self && m.type !== 'location') { m.attack += e.attack || 1; m.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('bonus-effect-played-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// Dreambound Raptor: after you play a minion, give it a random Bonus Effect
				const m = ctx.minion;
				if (m && m !== ctx.self && !isDead(m) && m.type === 'creature') { applyGift(state, m, null, { board: true }); emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('dormant-played-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// Warden Maiev: the just-played minion goes Dormant for N turns
				const m = ctx.minion;
				if (m && m !== ctx.self && !isDead(m) && m.type === 'creature') { m.dormantLeft = e.value || 1; emit(state, { type: 'dormant', player: m.controller, uid: m.uid, turns: m.dormantLeft }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('summon-discarded-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// Maloriak: after you discard a minion, summon a copy of it
				const c = ctx.card;
				if (c && c.type === 'creature' && state.cardsById[c.id]) summon(state, pi, state.cardsById[c.id]);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('cast-random-spell-of-played-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Chaos Supplicant: after you cast a spell, cast a random spell of the same Cost (another-class restriction not modeled)
				const spell = ctx.played;
				if (spell && !state._chaosLock) { state._chaosLock = true; try { execEffects(state, pi, [{ type: 'cast-random-spell', count: 1, cost: spell.cost || 0 }], null, ctx.self || null); } finally { state._chaosLock = false; } }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('reduce-discovered-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Vault Breaker: after you Discover a card, reduce its Cost
				const c = ctx.card;
				if (c) c.cost = Math.max(0, (c.cost || 0) - (e.value || 1));
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('set-attacker-health-from-source', (state, pi, e, ctx, triggering) => {
	do { {
				// Archaios: when another friendly minion attacks, set its Health equal to this minion's Health
				const m = ctx.minion, s4 = ctx.self;
				if (m && s4 && !isDead(m) && !isDead(s4) && m !== s4 && m.type !== 'location') { m.maxHealth = hp(s4); m.damage = 0; m.tempHealth = 0; emit(state, { type: 'buff', uid: m.uid, attack: m.attack, hp: hp(m) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('buff-self-by-dead-attack', (state, pi, e, ctx, triggering) => {
	do { {
				// Scavenging Flytrap: after a minion dies, gain its Attack
				const d3 = ctx.dead, s3 = ctx.self;
				if (d3 && s3 && !isDead(s3) && (d3.attack || 0) > 0) { s3.attack += d3.attack; emit(state, { type: 'buff', uid: s3.uid, attack: s3.attack, hp: hp(s3) }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('gandling', (state, pi, e, ctx, triggering) => {
	do { {
				// Disciplinarian Gandling: destroy the just-played minion, summon a 4/4 Failed Student
				const m = ctx.minion;
				if (m && !isDead(m) && m !== ctx.self) {
					m.damage = m.maxHealth; m.shield = false; emit(state, { type: 'destroy', uid: m.uid }); sweepDeaths(state);
					summon(state, pi, { id: 'sch_failed_student', name: 'Failed Student', type: 'creature', cost: 4, token: true, rarity: 'common', attack: 4, health: 4, description: 'A 4/4 token.' });
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('cast-random-same-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Enchanted Cauldron (Spellburst): cast a random spell of the just-cast spell's Cost
				const cost = ctx.played ? (ctx.played.cost || 0) : 0;
				execEffects(state, pi, [{ type: 'cast-random-spell', count: 1, cost }], null, ctx.self || null);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('silence-victim', (state, pi, e, ctx, triggering) => {
	do { {
				// Magehunter: Silence the minion this just attacked
				if (ctx.victim && !isDead(ctx.victim)) silenceCreature(state, ctx.victim);
				break;
			}
			// ('summon-copy-of-played' is handled earlier in this switch — Playmaker's
			// health rider was merged there after this duplicate was shadowed.)
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('transform-victim-into', (state, pi, e, ctx, triggering) => {
	do { {
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
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('summon-copy-of-triggering-minion', (state, pi, e, ctx, triggering) => {
	do { {
				// Auchenai Death-Speaker: after a friendly minion is Reborn, summon a copy of it
				const m = ctx.minion;
				if (m && state.cardsById[m.id]) summon(state, pi, state.cardsById[m.id]);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('add-copy-of-discovered', (state, pi, e, ctx, triggering) => {
	do { {
				// Rangari Scout: after you Discover a card, get a copy of it
				const src = ctx.card, p = state.players[pi];
				if (src && state.cardsById[src.id] && p.hand.length < MAX_HAND) { const cp = instantiate(state.cardsById[src.id], pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('conjure-minion-of-spell-cost', (state, pi, e, ctx, triggering) => {
	do { {
				// Deep Space Curator (Spellburst): get a random minion of the cast spell's Cost, set its Cost to (0)
				const spell = ctx.played;
				if (spell) execEffects(state, pi, [{ type: 'conjure-random', cardType: 'creature', cost: spell.cost || 0, setCost: 0 }], null, ctx.self || null);
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});


registerTrigger('recast-triggering-spell', (state, pi, e, ctx, triggering) => {
	do { {
				// Starlight Reactor: after you cast an Arcane spell, recast it (targets chosen randomly)
				const spell = ctx.played;
				if (spell && isSpellType(spell) && spell.effects) {
					const foesM = []; for (const o of opponentsOf(state, pi)) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location') foesM.push({ type: 'creature', uid: c.uid, player: o });
					let tgt = null; if (foesM.length) tgt = foesM[Math.floor(state.rng() * foesM.length)]; else { const eh = opponentsOf(state, pi)[0]; if (eh != null) tgt = { type: 'hero', player: eh }; }
					execEffects(state, pi, JSON.parse(JSON.stringify(spell.effects)), tgt, ctx.self || null);
				}
				break;
			}
	} while (false); // `break` ends this effect, exactly like the old case break
});

