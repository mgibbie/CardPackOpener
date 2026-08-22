// engine/effects/handlers-summon.js — summons, resurrection, tokens and board-filling (housekeeping split, PR 40).
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
	emit, instantiate, MAX_HAND, HAND_LIMIT, endTurn, gainTokenCard, execEffects, summon,
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

register('summon-random-hand-size', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Astromancer: summon a random creature costing exactly your hand size
			execEffects(state, pi, [{ type: 'summon-random', cost: state.players[pi].hand.length }], target, source);
});


register('blessing-dragon', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Paladin: shuffle two Emerald Portals into your deck (they summon an Imbue-cost minion when drawn)
			execEffects(state, pi, [{ type: 'shuffle-into-own-deck', id: 'edr_emerald_portal', count: 2 }], null, source);
});


register('invoke-galakrond', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Invoke Galakrond: power up your Galakrond (base -> upgraded at 2 -> maxed at 4)
			state.players[pi].galakrondInvokes = (state.players[pi].galakrondInvokes || 0) + 1;
			emit(state, { type: 'invokeGalakrond', player: pi, count: state.players[pi].galakrondInvokes });
});


register('resummon-remembered-buffed', ({ state, pi, target, source, enemies, scaled }, e) => {
			// Teron Gorefiend deathrattle: resummon the remembered minions with +1/+1
			for (const m of (source && source.rememberedMinions) || []) {
				const base = state.cardsById[m.id];
				const def = base ? JSON.parse(JSON.stringify(base)) : { id: 'token_' + (m.name || 'minion').toLowerCase().replace(/\W+/g, '_'), name: m.name, type: 'creature', cost: 0, token: true, rarity: 'common', tribe: m.tribe };
				def.attack = (m.attack || 0) + 1; def.health = (m.health || 0) + 1;
				summon(state, pi, def);
			}
});


register('hatch-egg', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			if (source?.hatchId && state.cardsById[source.hatchId]) summon(state, pi, state.cardsById[source.hatchId]);
});


register('summon-marked-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			if (source?.copyVictimId && state.cardsById[source.copyVictimId]) summon(state, pi, state.cardsById[source.copyVictimId]);
});


register('ursoc-resurrect', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			if (source && source._ursocKills) for (const id of source._ursocKills) if (state.cardsById[id]) summon(state, pi, state.cardsById[id]);
});


register('mark-summon-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Mindflayer Kaahrj: remember a chosen creature; Deathrattle summons a copy
			const t = chosenCreature();
			if (t && source) source.copyVictimId = t.id;
});


register('buff-next-summon-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Thornmantle Musician (Finale): the next minion of a tribe you summon gets +X/+X
			state.players[pi].nextTribeSummonBuff = { tribe: e.tribe, attack: e.attack || 1, health: e.health || 1 };
});


register('grant-tribe-summon-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Timewarden: until end of your next turn, minions of a tribe you summon gain keywords
			state.players[pi].tribeSummonBuff = { tribe: e.tribe, keywords: e.keywords || [], untilTurn: state.turnNumber + 2 };
});


register('grant-self-endturn-summon-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Partner in Crime: at end of your turn, summon a copy of this minion (one-shot)
			if (source) source.ongoing = { on: 'turn-end', once: true, effects: [{ type: 'summon-copy-of-self', count: e.count || 1 }] };
});


register('grant-colossal-parts', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Hydralodon: give your appendages of this Colossal a keyword
			for (const c of state.players[pi].board) {
				if (c.colossalOf === source?.name && !c.keywords.includes(e.keyword)) c.keywords.push(e.keyword);
			}
});


register('blessing-moon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Priest: get a random Priest card; it costs (N) less
			const n = Math.max(1, state.players[pi].imbueCount || 1);
			execEffects(state, pi, [{ type: 'conjure-random', cardClass: 'priest', costMod: -n }], null, source);
});


register('summon-self-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	// exact:true — the retired second branch's semantics, previously SHADOWED:
	// a copy carrying the source's CURRENT stats/keywords (Echoing Ooze says
	// "an exact copy"; hand-buffed stats now carry over). End-of-turn timing
	// remains approximated as immediate, unchanged.
	if (e.exact) {
				// Echoing Ooze: a copy carrying this creature's CURRENT stats/keywords
				if (source) summon(state, pi, { id: source.id, name: source.name, type: 'creature',
					cost: source.cost || 0, rarity: source.rarity || 'common', token: true, tribe: source.tribe || '',
					attack: source.attack, health: source.maxHealth, keywords: [...(source.keywords || [])],
					description: source.description || '' });
		return;
	}
			// Saronite Chain Gang / Doppelgangster: fresh copies of the played minion
			const def = source && state.cardsById[source.id];
			if (def) for (let i = 0; i < (e.count || 1); i++) summon(state, pi, def);
});


register('summon-random-armor-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Geosculptor Yip: summon a random creature costing exactly your Armor (cap 10)
			const cost = Math.min(e.max ?? 10, state.players[pi].armor || 0);
			execEffects(state, pi, [{ type: 'summon-random', cost }], target, source);
});


register('summon-for-player', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// helper: summon a token for a specific player (used by Blightfang's granted deathrattle)
			const owner = e.player != null ? e.player : pi;
			if (state.cardsById[e.summonId]) summon(state, owner, state.cardsById[e.summonId]);
});


register('portal-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Emerald Portal (drawTrigger): summon a random minion costing your Imbue count
			const n = Math.max(1, state.players[pi].imbueCount || 1);
			execEffects(state, pi, [{ type: 'summon-random', cost: Math.min(n, 10) }], null, source);
});


register('summon-copy-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Animated Avalanche: summon a copy of this minion (count copies — Zixor Prime)
			if (source) { const base = state.cardsById[source.id]; if (base) for (let n = 0; n < (e.count || 1); n++) summon(state, pi, JSON.parse(JSON.stringify(base))); }
});


register('resummon-remembered', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Moat Lurker's Deathrattle (count>1: Carnivorous Cube summons 2 copies)
			if (source?.moatVictim && state.cardsById[source.moatVictim]) {
				for (let i = 0; i < (e.count || 1); i++) summon(state, pi, state.cardsById[source.moatVictim]);
			}
});


register('resurrect-died-this-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Kel'Thuzad: summon all your creatures that died this turn
			const p = state.players[pi];
			const ids = p.diedThisTurnIds.slice();
			const keep = [];
			for (const id of ids) { const def = state.cardsById[id]; if (def && (!e.tribe || (def.tribe || '').includes(e.tribe))) summon(state, pi, def); else keep.push(id); } // Revenge of the Wild: only Beasts
			p.diedThisTurnIds = e.tribe ? keep : [];
});


register('summon-with-gifts', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Tyrannogill: summon N tokens, each with its own random Bonus Effect.
			// Elemental Inspiration: N = spell schools you've cast this game.
			const times = e.perSchoolsCast ? Object.keys(state.players[pi].schoolsCastGame || {}).length : (e.count || 1);
			for (let n = 0; n < times; n++) {
				const c = state.cardsById[e.summonId] ? summon(state, pi, state.cardsById[e.summonId]) : null;
				if (c) applyGift(state, c, null, { board: true });
			}
});


register('fill-board-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Hir'eek, the Bat: fill your board with copies of this creature
			const p = state.players[pi];
			const def = source && (state.cardsById[source.id] || source);
			if (def) while (p.board.filter(c => !isDead(c)).length < 7) { const c = summon(state, pi, def); if (!c) break; }
});

register('fill-board-token', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Onyxia / Shu'ma: fill your board with 1/1 tokens (up to 7 minions total)
			const p = state.players[pi];
			const def = { id: 'token_' + (e.name || 'token').toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: e.name || 'Token', type: 'creature', cost: e.cost || 1, token: true, rarity: 'common', attack: e.attack ?? 1, health: e.health ?? 1, tribe: e.tribe || null, keywords: e.keywords || [], description: `A ${e.attack ?? 1}/${e.health ?? 1} token.` };
			while (p.board.filter(c => !isDead(c) && c.type !== 'location').length < 7) { const c = summon(state, pi, def); if (!c) break; }
});


register('summon-random-discarded', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Cruel Dinomancer: summon a random creature you discarded this game
			const p = state.players[pi];
			const ids = p.discardLogIds.filter(id => state.cardsById[id]?.type === 'creature');
			if (ids.length) summon(state, pi, state.cardsById[ids[Math.floor(state.rng() * ids.length)]]);
});


register('spend-mana-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Lost Exarch: spend all your remaining Mana, summon that many tokens
			const p = state.players[pi];
			const n = availableMana(p);
			p.mana.cur = 0; p.mana.bonus = 0;
			for (let i = 0; i < n; i++) { if (state.cardsById[e.summonId]) summon(state, pi, state.cardsById[e.summonId]); }
});


register('bwonsamdi-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Bwonsamdi's Deathrattle: a random minion whose Cost grows with his Boons
			const p = state.players[pi];
			p.bwonsamdiDied = true;
			const cost = 4 + ((p.bwonsamdiBoons && p.bwonsamdiBoons.costBonus) || 0);
			execEffects(state, pi, [{ type: 'summon-random', cost }], null, source);
});


register('summon-random-died-this-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Onyx Bishop: resurrect a random friendly creature that died this turn
			const p = state.players[pi];
			const ids = p.diedThisTurnIds.filter(id => state.cardsById[id]?.type === 'creature');
			if (ids.length) summon(state, pi, state.cardsById[ids[Math.floor(state.rng() * ids.length)]]);
});


register('summon-if-control', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Hydralodon Head deathrattle: only summons more if the parent survives
			const held = state.players[pi].board.some(c => !isDead(c) && c.name === e.ifControl);
			if (held) {
				const def = state.cardsById[e.id];
				if (def) for (let i = 0; i < (e.count || 1); i++) summon(state, pi, def);
			}
});


register('merge-if-two', ({ state, pi, source }, e) => {
			// Blood of the Ancient One: if you control two of these at end of turn, merge into a big token
			if (!source || isDead(source)) return;
			const p = state.players[pi];
			const copies = p.board.filter(c => c.id === source.id && !isDead(c));
			if (copies.length >= 2) {
				p.board = p.board.filter(c => c !== copies[0] && c !== copies[1]);
				copies[0].zone = copies[1].zone = 'gone';
				const def = state.cardsById[e.id];
				if (def) summon(state, pi, def);
			}
});

register('conjure-from-pool', ({ state, pi }, e) => {
			// Ysera: add N random cards chosen from a fixed id pool to your hand (Dream cards)
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 1) && p.hand.length < MAX_HAND && (e.ids || []).length; n++) {
				const def = state.cardsById[e.ids[Math.floor(state.rng() * e.ids.length)]];
				if (def) { const c = instantiate(def, pi); c.zone = 'hand'; p.hand.push(c); emit(state, { type: 'conjure', player: pi, card: c, color: null }); }
			}
});

register('fill-hand-token', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Halazzi, the Lynx: fill your hand with a token
			const p = state.players[pi];
			const def = state.cardsById[e.id];
			while (def && p.hand.length < HAND_LIMIT) { const cp = instantiate(def, pi); cp.zone = 'hand'; p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null }); }
});


register('blessing-golem', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Druid: summon an N/N Plant Golem (N = Imbue count)
			const n = Math.max(1, state.players[pi].imbueCount || 1);
			summon(state, pi, { id: 'token_plant_golem', name: 'Plant Golem', type: 'creature', cost: 0, token: true, rarity: 'common', attack: n, health: n, description: `A ${n}/${n} Plant Golem.` });
});


register('blessing-wisp', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Mage: summon a Wisp, deal N damage split among enemies
			const n = Math.max(1, state.players[pi].imbueCount || 1);
			if (state.cardsById['edr_wisp']) summon(state, pi, state.cardsById['edr_wisp']);
			execEffects(state, pi, [{ type: 'random-damage', value: 1, count: n, pool: 'enemies' }], null, source);
});


register('summon-copies-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Madam Goya: summon every copy of a chosen friendly creature from your deck
			const t = chosenCreature();
			const p = state.players[pi];
			if (t) {
				const rest = [];
				for (const id of p.deck) { if (id === t.id) summon(state, pi, state.cardsById[id]); else rest.push(id); }
				p.deck = rest;
			}
});


register('summon-copy-per-hand-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Dragon Golem: summon a copy of this for each minion of a tribe in your hand
			const n = state.players[pi].hand.filter(c => c.type === 'creature' && (c.tribe || '').includes(e.tribe)).length;
			const def = source && state.cardsById[source.id];
			if (def) for (let i = 0; i < n; i++) summon(state, pi, def);
});


register('summon-per-enemy-bomb', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Blastmaster Boom: summon `per` Boom Bots for each Bomb in enemy decks
			let bombs = 0;
			for (const o of enemies) bombs += state.players[o].deck.filter(id => id === 'bomb').length;
			const def = state.cardsById['boom_bot'];
			if (def) for (let n = 0; n < bombs * (e.per || 1); n++) summon(state, pi, def);
});


register('invoke', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Descent of Dragons: Invoke Galakrond (tracked as a counter; grants a small bonus)
			const p = state.players[pi];
			p.invokeCount = (p.invokeCount || 0) + (e.times || 1);
			if (source && source.zone === 'board' && !isDead(source) && (e.attack || e.health)) buffCreature(source, e.attack || 0, e.health || 0);
});


register('summon-random-basic-totem', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Party Favor Totem: summon N random basic Totems
			const pool = ['sch_totem_healing', 'sch_totem_searing', 'sch_totem_stoneclaw', 'sch_totem_wrath'];
			for (let n = 0; n < (e.count || 1); n++) { const id = pool[Math.floor(state.rng() * pool.length)]; if (state.cardsById[id]) summon(state, pi, state.cardsById[id]); }
});


register('spend-corpses-summon-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Shambling Zombietank: spend N Corpses to summon a copy of this
			const p = state.players[pi];
			if ((p.corpses || 0) >= (e.cost || 5) && source && state.cardsById[source.id]) { spendCorpses(state, pi, (e.cost || 5)); emit(state, { type: 'corpses', player: pi, corpses: p.corpses }); summon(state, pi, state.cardsById[source.id]); }
});


register('summon-copy-of-self-once-per-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Lab Patron: summon a copy of this, but only once per turn (player-global to avoid chains)
			const p = state.players[pi];
			if (source && state.cardsById[source.id]) { const key = '_oncePerTurn_' + source.id; if (p[key] !== state.turnNumber) { p[key] = state.turnNumber; summon(state, pi, state.cardsById[source.id]); } }
});


register('summon-copies-of-board', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Freya: summon a copy of each OTHER friendly minion
			const p = state.players[pi];
			const originals = p.board.filter(c => c !== source && !isDead(c) && c.type !== 'location' && (!e.tribe || (c.tribe || '').includes(e.tribe))); // Splitting Axe: only your Totems
			for (const c of originals) {
				const def = state.cardsById[c.id];
				if (!def || p.board.filter(x => !isDead(x)).length >= 7) continue;
				let d2 = def;
				if (e.attack != null || e.health != null) { // Herald Volazj: 1/1 copies
					d2 = JSON.parse(JSON.stringify(def));
					if (e.attack != null) d2.attack = e.attack;
					if (e.health != null) d2.health = e.health;
				}
				summon(state, pi, d2);
			}
});


register('grant-next-recruit-buff', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Stewart the Steward: the next Silver Hand Recruit you summon gains +X/+X (and, if chain, this same Deathrattle)
			state.players[pi].nextRecruitBuff = { attack: e.attack || 3, health: e.health || 3, deathrattle: e.chain ? [{ type: 'grant-next-recruit-buff', attack: e.attack || 3, health: e.health || 3, chain: true }] : null };
});


register('summon-per-hand-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// King Phaoris: for each spell in your hand, summon a random creature of its Cost
			const pp = state.players[pi];
			for (const c of pp.hand.filter(x => isSpellType(x))) {
				if (pp.board.filter(x => !isDead(x)).length >= 7) break;
				execEffects(state, pi, [{ type: 'summon-random', cost: c.cost || 0 }], target, source);
			}
});


register('summon-per-frost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Bearon Gla'shear: summon a token for each Frost spell cast this game
			const n = state.players[pi].frostSpellsGame || 0;
			for (let i = 0; i < n; i++) summon(state, pi, state.cardsById[e.summonId] || { id: e.summonId, name: e.name || 'Elemental', type: 'creature', cost: 0, token: true, rarity: 'common', attack: 3, health: 4 });
});


register('spend-armor-resummon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// General Vezax (Deathrattle): lose N Armor to resummon this
			const p = state.players[pi];
			if ((p.armor || 0) >= (e.value || 4) && source && state.cardsById[source.id]) { p.armor -= (e.value || 4); emit(state, { type: 'armor', player: pi, amount: -(e.value || 4), armor: p.armor }); summon(state, pi, state.cardsById[source.id]); }
});


register('spend-mana-summon-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Commissary Crook: spend all your Mana, summon a random minion of that Cost
			const p = state.players[pi];
			const n = availableMana(p);
			p.mana.cur = 0; p.mana.bonus = 0;
			emit(state, { type: 'mana', player: pi, cur: 0, max: p.mana.max });
			if (n > 0) execEffects(state, pi, [{ type: 'summon-random', cost: n }], target, source);
});


register('summon-dragons-per-big-spell', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Dragoncaller Alanna: a 5/5 Dragon for each 5+ Cost spell cast this game
			const n = state.players[pi].bigSpellsGame || 0;
			for (let i = 0; i < n; i++) summon(state, pi, { id: 'token_dragon_5_5', name: 'Dragon', type: 'creature', cost: 5, token: true, tribe: 'Dragon', rarity: 'common', attack: 5, health: 5, description: 'A 5/5 Dragon.' });
});


register('spend-corpses-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Boneguard Commander: raise up to N Corpses as tokens
			const p = state.players[pi];
			const n = Math.min(e.max || 6, p.corpses || 0);
			if (n > 0 && state.cardsById[e.summonId]) { spendCorpses(state, pi, n); emit(state, { type: 'corpses', player: pi, corpses: p.corpses }); for (let i = 0; i < n; i++) summon(state, pi, state.cardsById[e.summonId]); }
});


register('enemy-summon-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Deathlord: each opponent puts a creature from their deck into play
			for (const o of enemies) {
				const op = state.players[o];
				const ci = op.deck.findIndex(id => state.cardsById[id]?.type === 'creature' && !state.cardsById[id].token);
				if (ci >= 0) { const [id] = op.deck.splice(ci, 1); summon(state, o, state.cardsById[id]); }
			}
});


register('resurrect-highest-died', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
			// Calia Menethil: resurrect your highest-Cost minion that died this game
			const p = state.players[pi];
			const _pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature').sort((x, y) => (y.cost || 0) - (x.cost || 0));
			for (let _k = 0; _k < (e.count || 1) && _pool.length; _k++) {
				const c2 = summon(state, pi, _pool[Math.min(_k, _pool.length - 1)]);
				if (c2 && e.grant && !c2.keywords.includes(e.grant)) { c2.keywords.push(e.grant); if (e.grant === 'divine_shield') c2.shield = true; }
			}
});


register('shuffle-tokens-into-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Rivendare: shuffle specific cards into your deck
			const p = state.players[pi];
			for (const id of e.ids || []) if (state.cardsById[id]) p.deck.push(id);
			for (let i = p.deck.length - 1; i > 0; i--) { const j = Math.floor(state.rng() * (i + 1)); [p.deck[i], p.deck[j]] = [p.deck[j], p.deck[i]]; }
			emit(state, { type: 'shuffle', player: pi });
} });


register('summon-remembered', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Beast Speaker Taka (_takaId) / Amorphous Slime, Ravenous Kraken,
			// Carnivorous Cubicle (rememberedId): summon the remembered card.
			// (Merged: the _takaId-only branch shadowed the rememberedId branch.)
			const rid = source && (source._takaId || source.rememberedId);
			if (rid && state.cardsById[rid]) summon(state, pi, state.cardsById[rid]);
} });


register('recruit-attack-boost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Brash Battlemaster: your Silver Hand Recruits get +N Attack this game
			const p = state.players[pi];
			p.recruitAttackBonus = (p.recruitAttackBonus || 0) + (e.value || 1);
			for (const c of p.board) if (c.name === 'Silver Hand Recruit' && !isDead(c)) { c.attack += e.value || 1; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
} });


register('summon-all-died-this-turn', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Headmaster Kel'Thuzad (Spellburst): summon the minions destroyed this turn to your side
			const gathered = [];
			for (let s2 = 0; s2 < state.players.length; s2++) { gathered.push(...state.players[s2].diedThisTurnIds); state.players[s2].diedThisTurnIds = []; }
			for (const id of gathered) { const def = state.cardsById[id]; if (def) summon(state, pi, def); }
} });


register('resummon-source', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ancestral Spirit's granted deathrattle: the fallen returns
			if (source) {
				const def = state.cardsById[source.id];
				summon(state, pi, def || {
					id: source.id, name: source.name, type: 'creature', cost: 0,
					rarity: source.rarity || 'common', description: source.description || '',
					attack: source.attack, health: source.maxHealth,
				});
			}
} });


register('remove-colossal-keyword', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Chromatus' Heads: each head's death strips a keyword from the parent
			if (source?.colossalOf) {
				const parent = state.players[pi].board.find(c => c.name === source.colossalOf);
				if (parent) {
					parent.keywords = parent.keywords.filter(k => k !== e.keyword);
					if (e.keyword === KW.DIVINE_SHIELD) parent.shield = false;
					recomputeAuras(state);
				}
			}
} });


register('summon-copy-of-target-buffed', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Ini Stormcoil: summon a copy of a chosen friendly minion with granted keywords
			const t = chosenCreature();
			if (t) { const base = state.cardsById[t.id]; if (base) { const c = summon(state, pi, JSON.parse(JSON.stringify(base))); if (c) { for (const kw of e.keywords || []) { if (!c.keywords.includes(kw)) { c.keywords.push(kw); if (kw === KW.DIVINE_SHIELD) c.shield = true; } } if (e.attack || e.health) { c.attack += e.attack || 0; c.maxHealth += e.health || 0; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); } if (e.grantFragile) c.diesToAnyDamage = true; } } } // Aman'Thul (Shape the Stars): copy with +2/+2; Reverberations: fragile copy
} });


const TINY_PAL_AMMO = {
	fire: [{ type: 'damage-all-enemies', value: 1 }],                                          // deal 1 to all enemies
	frost: [{ type: 'freeze', target: 'random-enemy', count: 2 }],                             // Freeze 2 other random enemies
	earth: [{ type: 'summon-random', cost: 3, grant: 'taunt' }],                               // summon a random 3-Cost minion with Taunt
	air: [{ type: 'conjure-random', cardType: 'creature', requireKeyword: 'battlecry', costMod: -2 }], // a random Battlecry minion, costs (2) less
};
register('set-tiny-pal-ammo', ({ state, pi }, e) => { {
			// Tiny Pal Battlecry: load the chosen elemental ammunition
			const w = state.players[pi].weapon;
			if (w) { w.ammo = e.ammo || 'fire'; emit(state, { type: 'tinyPalAmmo', player: pi, ammo: w.ammo }); }
} });
register('tiny-pal-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Tiny Pal (after your hero attacks): fire the loaded ammunition, then load
			// another (the "choose another" is modeled as a random different element)
			const w = state.players[pi].weapon;
			if (!w) return;
			const ammo = w.ammo || 'fire';
			execEffects(state, pi, JSON.parse(JSON.stringify(TINY_PAL_AMMO[ammo] || TINY_PAL_AMMO.fire)), null, source);
			const others = Object.keys(TINY_PAL_AMMO).filter(k => k !== ammo);
			w.ammo = others[Math.floor(state.rng() * others.length)];
			emit(state, { type: 'tinyPalAmmo', player: pi, ammo: w.ammo });
} });
register('zuramat-prison-tap', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Zuramat's Prison: discard a card (modeled as random) to summon a 5/5 Taunt;
			// the discarded card is remembered so a freed Zuramat can replay it
			const p = state.players[pi];
			if (p.hand.length) {
				const [c] = p.hand.splice(Math.floor(state.rng() * p.hand.length), 1);
				(p.prisonDiscarded = p.prisonDiscarded || []).push(c.id);
				toGraveyard(state, pi, c);
				emit(state, { type: 'discard', player: pi, card: c });
			}
			summon(state, pi, { id: 'token_void_guardian', name: 'Void Guardian', type: 'creature', cost: 5, token: true, rarity: 'common', attack: 5, health: 5, keywords: ['taunt'], description: 'Taunt.' });
} });


register('play-prison-discarded', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Zuramat the Obliterator: at end of your turn, play a card the Prison discarded
			const p = state.players[pi];
			const pool = p.prisonDiscarded || [];
			if (!pool.length || p.eliminated) return;
			const id = pool.splice(Math.floor(state.rng() * pool.length), 1)[0];
			const def = state.cardsById[id];
			if (!def) return;
			if (def.type === 'creature') {
				const c = summon(state, pi, def);
				if (c) runBattlecry(state, pi, c, null);
			} else if (isSpellType(def)) {
				const sp = instantiate(def, pi);
				const spec = targetSpec(state, pi, sp, null);
				let tgt = null;
				if (spec) { const legal = legalTargets(state, pi, spec); tgt = legal.length ? legal[Math.floor(state.rng() * legal.length)] : null; }
				if (!spec || tgt || !spec.required) { emit(state, { type: 'conjure', player: pi, card: sp, color: null }); runSpell(state, pi, sp, tgt, null); sweepDeaths(state); }
			} else if (def.type === 'weapon') {
				execEffects(state, pi, [{ type: 'equip', name: def.name, attack: def.attack || 0, durability: def.durability || 1 }], null, null);
			}
} });


register('amirdrassil-tap', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Amirdrassil: summon a 1-Cost minion, gain 1 Armor, draw 1, refresh 1 Mana
			// Crystal — and every value improves by 1 for each previous activation
			const n = source ? (source.improveCount || 0) : 0;
			execEffects(state, pi, [
				{ type: 'summon-random', cost: 1 + n },
				{ type: 'armor', value: 1 + n },
				{ type: 'draw', count: 1 + n },
				{ type: 'refresh-mana', value: 1 + n },
			], null, source);
			if (source) source.improveCount = (source.improveCount || 0) + 1;
} });


register('summon-hatch-egg', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Clutch of Corruption: summon a 0/2 Egg that hatches into a copy of the
			// chosen friendly Dragon (its current stats, and its own abilities via summonId)
			const dragon = chosenCreature();
			if (!dragon) return;
			let dr;
			if (state.cardsById[dragon.id]) {
				const base = state.cardsById[dragon.id];
				dr = [{ type: 'summon', summonId: dragon.id, buff: { attack: (dragon.attack || 0) - (base.attack || 0), health: (dragon.maxHealth || 0) - (base.health || 0) } }];
			} else {
				dr = [{ type: 'summon', name: dragon.name, tribe: dragon.tribe || 'Dragon', attack: dragon.attack || 0, health: dragon.maxHealth || 1, keywords: [...(dragon.keywords || [])].filter(k => k !== 'deathrattle') }];
			}
			summon(state, pi, { id: 'token_corrupted_egg', name: 'Egg', type: 'creature', cost: 0, token: true, tribe: 'Dragon', rarity: 'common', attack: 0, health: 2, keywords: ['deathrattle'], deathrattle: dr, description: `Deathrattle: Summon a copy of ${dragon.name}.` });
} });


register('void-soul', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Void Soul (Stardust Scythe token): summon a random Demon whose Cost starts
			// at 1 and grows by 1 for each Void Soul you've already played this game
			const p = state.players[pi];
			const cost = (e.baseCost || 1) + (p.voidSoulImprove || 0);
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.tribe || '').includes('Demon') && (d.cost || 0) === cost && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (pool.length) summon(state, pi, pool[Math.floor(state.rng() * pool.length)]);
			p.voidSoulImprove = (p.voidSoulImprove || 0) + 1; // improve your future Void Souls
} });


register('summon-hand-size-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Abyssal Summoner: summon a token with stats equal to your hand size
			const n = state.players[pi].hand.length;
			const tok = summon(state, pi, { id: 'token_' + (e.name || 'imp').toLowerCase(), name: e.name || 'Abyssal Enforcer', type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: n, health: n, keywords: e.keywords || [], description: `A ${n}/${n} token.` });
			// Spire of Solitude: the summoned Demon immediately attacks a random enemy minion
			if (tok && e.attackRandomEnemyMinion) {
				tok.sick = false;
				const foes = [];
				for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location' && !c.stealthed && c.dormantLeft <= 0) foes.push({ type: 'creature', uid: c.uid, player: o });
				if (foes.length && !isDead(tok)) resolveCombat(state, pi, tok.uid, foes[Math.floor(state.rng() * foes.length)]);
			}
} });


register('buff-colossal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// an appendage that also grows its parent Colossal (Wickerfang's Legs)
			if (source?.colossalOf) {
				const parent = state.players[pi].board.find(c => !isDead(c) && c.name === source.colossalOf);
				if (parent) {
					parent.attack += e.attack || 0;
					parent.maxHealth += e.health || 0;
					emit(state, { type: 'buff', uid: parent.uid, attack: parent.attack, hp: hp(parent) });
				}
			}
} });


register('draw-tribe-summon-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Flesh Behemoth: draw a minion of a tribe and summon a copy of it
			const p = state.players[pi];
			const before = new Set(p.hand.map(c => c.uid));
			execEffects(state, pi, [{ type: 'tutor', cardType: 'creature', tribe: e.tribe, count: 1 }], null, source);
			const drawn = p.hand.find(c => !before.has(c.uid));
			if (drawn && state.cardsById[drawn.id]) summon(state, pi, state.cardsById[drawn.id]);
} });


register('summon-per-fragment', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Soulciologist Malicia: for each Soul Fragment in your deck, summon a token
			const p = state.players[pi];
			const n = p.deck.filter(id => id === 'sch_soul_fragment').length;
			for (let i = 0; i < n; i++) summon(state, pi, { id: e.summonId || 'sch_soul', name: e.name || 'Soul', type: 'creature', cost: 3, token: true, rarity: 'common', attack: 3, health: 3, keywords: ['rush'], description: 'Rush.' });
} });


register('summon-random-cost-overheal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Heartthrob: summon a random minion with Cost equal to the amount Overhealed
			const amt = (source && source._lastOverheal) || 0;
			if (amt > 0) { const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === amt && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length)); if (pool.length) summon(state, pi, pool[Math.floor(state.rng() * pool.length)]); }
} });


register('summon-with-source-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Blistering Rot: summon a token with stats equal to the source minion
			if (source) { const a = source.attack || 0, h = e.squareAttack ? (source.attack || 0) : (hp(source) || 1); const tok = summon(state, pi, { id: e.id || 'token_rot', name: e.name || 'Rot', type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: a, health: Math.max(1, h), keywords: e.keywords || [], description: `A ${a}/${h} token.` }); }
} });


register('blessing-wolf', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Hunter: a random Beast in your hand gets +N Attack and costs (N) less
			const n = Math.max(1, state.players[pi].imbueCount || 1);
			const pool = state.players[pi].hand.filter(c => c.type === 'creature' && (c.tribe || '').includes('Beast'));
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; c.attack += n; c.cost = Math.max(0, (c.cost || 0) - n); emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
} });


register('summon-hand-minion-lifesteal', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Kangor (Deathrattle): summon a random minion from your hand and give it Lifesteal
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature');
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; p.hand = p.hand.filter(x => x !== c); c.zone = 'board'; if (!c.keywords.includes('lifesteal')) c.keywords.push('lifesteal'); p.board.push(c); emit(state, { type: 'summon', player: pi, card: c }); recomputeAuras(state); }
} });


register('summon-dragons-from-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('summon-random-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Travelmaster Dungar (approx): summon N random minions from your deck ("different expansions" not enforced)
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 1); n++) {
				const idxs = p.deck.map((id, i) => ({ id, i })).filter(x => state.cardsById[x.id]?.type === 'creature');
				if (!idxs.length) break;
				const pick = idxs[Math.floor(state.rng() * idxs.length)];
				p.deck.splice(pick.i, 1);
				summon(state, pi, state.cardsById[pick.id]);
			}
} });


register('summon-from-deck-weaker', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Meat Wagon: summon a creature from your deck with less Attack than this one
			const p = state.players[pi];
			const cap = source ? source.attack : (e.maxAttack ?? 0);
			for (let n = 0; n < (e.count || 1); n++) {
				const idx = p.deck.findIndex(id => { const def = state.cardsById[id]; return def?.type === 'creature' && !def.token && (def.attack || 0) < cap; });
				if (idx < 0) break;
				const [id] = p.deck.splice(idx, 1);
				summon(state, pi, state.cardsById[id]);
			}
} });


register('summon-from-deck-affordable', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Dinner Performer: summon a random minion from your deck you can afford
			const p = state.players[pi];
			const avail = (p.mana?.cur || 0) + (p.mana?.bonus || 0);
			const idxs = p.deck.map((id, i) => [id, i]).filter(([id]) => { const d = state.cardsById[id]; return d && d.type === 'creature' && !d.token && (d.cost || 0) <= avail; });
			if (idxs.length) { const [id, i] = idxs[Math.floor(state.rng() * idxs.length)]; p.deck.splice(i, 1); summon(state, pi, state.cardsById[id]); }
} });


register('summon-with-stats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('summon-random-location', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Cruise Captain Lora: put N random locations into play
			const pool = Object.values(state.cardsById).filter(d => d.type === 'location' && !d.token && d.collectible !== false);
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 1) && pool.length; n++) {
				const def = pool[Math.floor(state.rng() * pool.length)];
				const loc = instantiate(def, pi); loc.zone = 'board';
				p.board.push(loc);
				emit(state, { type: 'locationPlayed', player: pi, card: loc });
			}
} });


register('enemy-summon-from-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Dirty Rat: each opponent puts a random creature from their hand into play
			for (const o of enemies) {
				const op = state.players[o];
				const pool = op.hand.filter(c => c.type === 'creature');
				if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; op.hand = op.hand.filter(x => x !== c); c.zone = 'board'; op.board.push(c); emit(state, { type: 'summon', player: o, card: c }); fireOngoing(state, o, 'summoned', { minion: c }); }
			}
			recomputeAuras(state);
} });


register('fatigue-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Crazed Conductor: take Fatigue damage, summon that many tokens
			const p = state.players[pi];
			const amt = (p.fatigue || 0) + 1;
			p.fatigue = amt;
			damageHero(state, pi, amt, pi);
			for (let i = 0; i < amt; i++) summon(state, pi, { id: e.summonId || 'token_imp', name: e.name || 'Imp', type: 'creature', cost: 0, token: true, tribe: 'Demon', rarity: 'common', attack: e.tokenAttack || 3, health: e.tokenHealth || 3, description: `A ${e.tokenAttack || 3}/${e.tokenHealth || 3} Imp.` });
} });


register('fill-board-random-cost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Li'Na, Shop Manager: fill your board with random minions of a given Cost
			const p = state.players[pi];
			const cost = e.cost != null ? e.cost : 0;
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === cost && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			while (pool.length && p.board.filter(c => !isDead(c)).length < 7) summon(state, pi, pool[Math.floor(state.rng() * pool.length)]);
} });


register('summon-random-cost-ds', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Raylla, Sand Sculptor: summon a random N-Cost minion and give it Divine Shield
			const pool = Object.values(state.cardsById).filter(d => d.type === 'creature' && (d.cost || 0) === (e.cost ?? 2) && !d.token && d.collectible !== false && !d.companion && !d.commander && !(d.colors && d.colors.length));
			if (pool.length) { const c = summon(state, pi, pool[Math.floor(state.rng() * pool.length)]); if (c && !c.keywords.includes(KW.DIVINE_SHIELD)) { c.keywords.push(KW.DIVINE_SHIELD); c.shield = true; } }
} });


register('resurrect-by-attacks', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Tyr: resurrect one died friendly minion of your class for each listed Attack value
			const p = state.players[pi];
			const cls = p.heroClass;
			for (const atk of e.attacks || [2, 3, 4]) { const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && (d.attack || 0) === atk && (cls == null || (d.cardClass || 'neutral') === cls || (d.cardClass || 'neutral') === 'neutral')); if (pool.length) summon(state, pi, pool[Math.floor(state.rng() * pool.length)]); }
} });


register('summon-quilboar-scaled', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Zok Fogsnout: summon two Taunt Quilboar scaled by your hero Attack (+ armor gained this turn approximated by hero attack)
			const bonus = heroAttackValue(state, state.players[pi]);
			for (let i = 0; i < (e.count || 2); i++) summon(state, pi, { id: 'token_quilboar', name: 'Quilboar', type: 'creature', cost: 0, token: true, tribe: 'Quilboar', rarity: 'common', attack: (e.base || 1) + bonus, health: (e.base || 1) + bonus, keywords: ['taunt'], description: `A ${(e.base || 1) + bonus}/${(e.base || 1) + bonus} Taunt Quilboar.` });
} });


register('reveal-spell-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Spiteful Summoner: reveal a random spell in your deck, summon a random minion of its Cost
			const p = state.players[pi];
			const spells = p.deck.map(id => state.cardsById[id]).filter(d => d && isSpellType(d));
			if (spells.length) {
				const sp = spells[Math.floor(state.rng() * spells.length)];
				emit(state, { type: 'joust', player: pi, myName: sp.name, myCost: sp.cost, enemyName: null, enemyCost: null, win: true });
				execEffects(state, pi, [{ type: 'summon-random', cost: sp.cost || 0 }], target, source);
			}
} });


register('resurrect-frenzy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Overlord Saurfang: resurrect friendly minions that had Frenzy
			const p = state.players[pi];
			const isFrenzy = def => { const o = def.ongoing; const list = o ? [o] : []; if (def.ongoings) list.push(...def.ongoings); return list.some(t => t && t.on === 'self-damaged' && t.survives); };
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && isFrenzy(d));
			for (let i = 0; i < (e.count || 2) && pool.length; i++) summon(state, pi, pool[Math.floor(state.rng() * pool.length)]);
} });


register('add-token', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Fire Fly: a fresh token creature lands in your hand. Honors `count` (From the
			// Scrapheap: three; The Badlands Bandits: eight) and Magnetic — the flag lives on
			// `magnetic`, not in `keywords`, so a keywords:['magnetic'] token must set it here
			// (otherwise the generated Sparkbot couldn't actually Magnetize).
			const p = state.players[pi];
			const isMagnetic = !!e.magnetic || (e.keywords || []).includes('magnetic');
			const kws = (e.keywords || []).filter(k => k !== 'magnetic'); // 'magnetic' is a flag, not a keyword
			for (let n = 0; n < (e.count || 1); n++) {
				if (p.hand.length >= MAX_HAND) break;
				const card = instantiate({
					id: 'token_' + e.name.toLowerCase().replace(/[^a-z0-9]+/g, '_'),
					name: e.name, type: 'creature', cost: e.cost || 1, rarity: 'common',
					description: `A ${e.attack}/${e.health} token.`,
					attack: e.attack, health: e.health, tribe: e.tribe || null, token: true, keywords: kws,
					magnetic: isMagnetic, magnetizeTribes: e.magnetizeTribes || null,
				}, pi);
				card.zone = 'hand';
				if (e.withGift) applyGift(state, card, null, {}); // Voronei Recruiter: a Crewmate with a random Bonus Effect (each token its own)
				p.hand.push(card);
				emit(state, { type: 'conjure', player: pi, card, color: null });
			}
} });


register('summon-died-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Kanrethad Prime: resummon friendly minions of a tribe that died this game
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && (d.tribe || '').includes(e.tribe));
			for (let i = 0; i < (e.count || 1) && pool.length; i++) { const nc = summon(state, pi, pool[Math.floor(state.rng() * pool.length)]); if (nc && e.grant && !nc.keywords.includes(e.grant)) { nc.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) nc.shield = true; } } // Infantry Reanimator: grant Reborn
} });


register('summon-jade', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('summon-deck-minions-setstats', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Elise, Badlands Savior: summon set-stat copies of N random minions in your deck
			const p = state.players[pi];
			const pool = [...new Set(p.deck)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && !d.token);
			// e.each (Zerek's Cloning Gallery): one copy of EVERY distinct deck creature
			for (let n = 0; n < (e.each ? pool.length : (e.count || 4)) && pool.length; n++) { if (p.board.filter(c => !isDead(c)).length >= 7) break; const def = JSON.parse(JSON.stringify(e.each ? pool[n] : pool[Math.floor(state.rng() * pool.length)])); if (e.stats != null) { def.attack = e.stats; def.health = e.stats; } def.token = true; def.id = 'token_' + def.id; summon(state, pi, def); }
} });


register('summon-tentacle-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Loken: summon a Tentacle with the stats of a random minion in your deck (+ Taunt)
			const p = state.players[pi];
			const pool = [...new Set(p.deck)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && !d.token);
			if (pool.length) { const pick = pool[Math.floor(state.rng() * pool.length)]; summon(state, pi, { id: 'ttn_tentacle', name: 'Tentacle', type: 'creature', cost: 0, token: true, rarity: 'common', attack: pick.attack || 0, health: pick.health || 1, keywords: ['taunt'], description: `A ${pick.attack}/${pick.health} Tentacle with Taunt.` }); }
} });


register('summon-died-name', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Imp King Rafaam: resurrect friendly dead minions whose name contains a substring
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && (d.name || '').includes(e.nameIncludes || ''));
			for (let i = 0; i < (e.count || 1) && pool.length; i++) { const nc = summon(state, pi, pool[Math.floor(state.rng() * pool.length)]); if (nc && e.grant && !nc.keywords.includes(e.grant)) { nc.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) nc.shield = true; } } // Kingpin Pud: grant Windfury
} });


register('summon-died-this-game', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Hadronox (Taunt) / Abominable Bowman (Beast, random): resummon fallen friendlies
			const p = state.players[pi];
			let ids = p.deathLogIds.filter(id => {
				const def = state.cardsById[id];
				if (!def || def.type !== 'creature') return false;
				if (e.keyword && !(def.keywords || []).includes(e.keyword)) return false;
				if (e.tribe && !(def.tribe || '').includes(e.tribe)) return false;
				return true;
			});
			if (e.random) { // pick `count` random distinct (default 1)
				const picks = []; const avail = [...ids];
				for (let k = 0; k < (e.count || 1) && avail.length; k++) picks.push(avail.splice(Math.floor(state.rng() * avail.length), 1)[0]);
				ids = picks;
			}
			for (const id of ids) { const def = state.cardsById[id]; const d2 = (e.attack != null || e.health != null) ? { ...def, attack: e.attack ?? def.attack, health: e.health ?? def.health } : def; summon(state, pi, d2); } // Twilight's Call: 1/1 copies
} });


register('copy-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Crimson Expanse: summon a copy of the chosen creature at its
			// CURRENT stats, optionally entering Dormant
			const t = chosenCreature();
			if (t) for (let _n = 0; _n < (e.count || 1); _n++) { // Banana Split: two copies
				const copy = summon(state, pi, {
					id: t.id, name: t.name, type: 'creature', cost: t.cost, rarity: t.rarity,
					description: t.description, attack: e.attack ?? t.attack, health: e.health ?? hp(t), // e.attack/health: set-stat copies (Mirage Caller 1/1, PW: Replicate 5/5)
					keywords: t.keywords.filter(k => !t.auraKeywords.includes(k)),
					tribe: t.tribe, deathrattle: t.deathrattle,
				});
				if (copy && e.dormant) {
					copy.dormantLeft = e.dormant;
					emit(state, { type: 'dormant', player: pi, uid: copy.uid, turns: e.dormant });
				}
			}
} });


register('summon-from-deck-suicide', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Maxima Blastenheimer: summon a minion from your deck; it attacks the enemy hero, then dies
			// Flark's Boom-Zooka: `count` minions, each attacking a random enemy minion (targetEnemyMinions)
			const p = state.players[pi];
			for (let s4 = 0; s4 < (e.count || 1); s4++) {
				const idxs = p.deck.map((id, i) => [id, i]).filter(([id]) => state.cardsById[id]?.type === 'creature');
				if (!idxs.length) break;
				const [id, di] = idxs[Math.floor(state.rng() * idxs.length)];
				p.deck.splice(di, 1);
				const c = summon(state, pi, state.cardsById[id]);
				if (!c) continue;
				if (e.targetEnemyMinions) {
					const foes = [];
					for (const o of enemies) for (const fc of state.players[o].board) if (!isDead(fc) && fc.type !== 'location') foes.push(fc);
					if (foes.length) { const tgt = foes[Math.floor(state.rng() * foes.length)]; resolveCombat(state, pi, c.uid, { type: 'creature', uid: tgt.uid, player: tgt.controller }); }
				} else { const foe = enemies[0]; if (foe != null) resolveCombat(state, pi, c.uid, { type: 'hero', player: foe }); }
				if (!isDead(c)) { c.damage = c.maxHealth; emit(state, { type: 'destroy', uid: c.uid }); sweepDeaths(state); }
			}
} });


register('living-mana', ({ state, pi }) => { {
			// Living Mana: turn your Mana Crystals into 2/2 Treants; refund a crystal when each dies
			const p = state.players[pi];
			const n = p.mana.max || 0;
			if (n <= 0) return;
			p.mana.max = 0; p.mana.cur = 0; p.mana.bonus = 0;
			emit(state, { type: 'manaGained', player: pi, amount: -n, mana: 0 });
			for (let k = 0; k < n; k++) summon(state, pi, { id: 'token_mana_treant', name: 'Treant', type: 'creature', cost: 1, rarity: 'common', token: true, description: 'Deathrattle: Refresh an empty Mana Crystal.', attack: 2, health: 2, keywords: ['deathrattle'], deathrattle: [{ type: 'gain-empty-mana-crystal', value: 1 }] });
} });


register('summon-starship-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Gravitational Displacer, when launched: summon a copy of the Starship
			if (source && state.cardsById['gdb_the_starship']) {
				const cp = summon(state, pi, {
					...state.cardsById['gdb_the_starship'],
					attack: source.attack, health: source.maxHealth,
					keywords: source.keywords.filter(k => k !== 'deathrattle'),
					description: source.description,
				});
				if (cp) {
					if (source.deathrattle) { cp.deathrattle = JSON.parse(JSON.stringify(source.deathrattle)); if (!cp.keywords.includes('deathrattle')) cp.keywords.push('deathrattle'); }
					if (source.ongoings) cp.ongoings = JSON.parse(JSON.stringify(source.ongoings));
				}
			}
} });


register('summon-from-hand-min-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Giant Anaconda: put a creature from your hand with N+ Attack into play
			const p = state.players[pi];
			const pool = p.hand.filter(c => c.type === 'creature' && c.attack >= (e.minAttack || 0) && (e.maxCost == null || (c.cost || 0) <= e.maxCost) && (!e.requireKeyword || c.keywords.includes(e.requireKeyword)) && (!e.tribe || (c.tribe || '').includes(e.tribe))); // Coffin Crasher / Piloted Reaper / Oondasta
			if (pool.length) { const c = pool[Math.floor(state.rng() * pool.length)]; p.hand = p.hand.filter(x => x !== c); c.zone = 'board'; p.board.push(c); emit(state, { type: 'summon', player: pi, card: c }); fireOngoing(state, pi, 'summoned', { minion: c }); growBlubberBaron(state, pi, c); recomputeAuras(state); }
} });


register('resummon-self-diminished', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('summon-token-attack-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Factory Assemblybot: summon a token that immediately attacks a random enemy
			const tok = summon(state, pi, state.cardsById[e.summonId] || { id: e.summonId || 'token_bot', name: e.name || 'Bot', type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: e.attack || 6, health: e.health || 7 });
			if (tok) { tok.sick = false; const foes = []; for (const o of enemies) { for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location' && !c.stealthed && c.dormantLeft <= 0) foes.push({ type: 'creature', uid: c.uid, player: o }); foes.push({ type: 'hero', player: o }); } if (foes.length && !isDead(tok)) resolveCombat(state, pi, tok.uid, foes[Math.floor(state.rng() * foes.length)]); }
} });


register('summon-from-deck-keyword', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Pipsi Painthoof: summon a random minion of each listed keyword from your deck
			const p = state.players[pi];
			const _sfdk = [];
			for (const kw of e.keywords || []) { const idx = p.deck.findIndex(id => { const d = state.cardsById[id]; return d?.type === 'creature' && !d.token && (d.keywords || []).includes(kw); }); if (idx >= 0) { const [id] = p.deck.splice(idx, 1); const sm = summon(state, pi, state.cardsById[id]); if (sm) _sfdk.push(sm); } }
			// High Cultist Herenn: the two summoned minions fight each other
			if (e.fight && _sfdk.length === 2 && !isDead(_sfdk[0]) && !isDead(_sfdk[1])) {
				damageCreature(state, _sfdk[1], _sfdk[0].attack, _sfdk[0]);
				damageCreature(state, _sfdk[0], _sfdk[1].attack, _sfdk[1]);
			}
} });


register('summon-random-died-game', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Psychopomp: summon a random friendly creature that died this game, optionally granting a keyword
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && (!e.requireKeyword || (d.keywords || []).includes(e.requireKeyword)) && (e.maxCost == null || (d.cost || 0) <= e.maxCost) && (e.minCost == null || (d.cost || 0) >= e.minCost)); // Wakener of Souls / Ravenous Felhunter / Ferocious Felbat
			if (pool.length) { const def = pool[Math.floor(state.rng() * pool.length)]; for (let n = 0; n < (e.count || 1); n++) { const c = summon(state, pi, def); if (c && e.grant && !c.keywords.includes(e.grant)) c.keywords.push(e.grant); } } // count 2 = resurrect + a copy
} });


register('reanimate', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('transform-self-into-token', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Druid of the Plains (Frenzy): transform this minion into a fixed-stat token
			if (source && source.zone === 'board' && !isDead(source)) {
				const tok = instantiate({ id: 'token_' + (e.name || 'token').toLowerCase().replace(/[^a-z0-9]+/g, '_'), name: e.name || 'Token', type: 'creature', cost: e.cost || 0, rarity: 'common', token: true, tribe: e.tribe || source.tribe || null, attack: e.attack, health: e.health, keywords: e.keywords || [], description: e.description || `A ${e.attack}/${e.health} token.` }, pi);
				tok.zone = 'board'; tok.sick = source.sick;
				const board = state.players[pi].board; board[board.indexOf(source)] = tok; source.zone = 'gone';
				emit(state, { type: 'transformed', uid: source.uid, player: pi, from: source.name, card: tok }); recomputeAuras(state);
			}
} });


register('summon-from-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('summon-deck-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Barnes: summon a copy of a random creature in YOUR deck (original
			// stays); attack/health override forces token stats. The Boom Reaver
			// (e.grant): the copy gains a keyword. (Merged: this branch shadowed
			// the grant-carrying duplicate.)
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
				if (c && e.grant && !c.keywords.includes(e.grant)) {
					c.keywords.push(e.grant);
					if (e.grant === KW.DIVINE_SHIELD) c.shield = true;
					if (e.grant === KW.STEALTH) c.stealthed = true;
				}
			}
} });


register('transform-into-token', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Furbolg Mossbinder: turn a chosen creature into a fixed-stat token
			if (e.requireElementalLastTurn && !state.players[pi].elementalLastTurn) return; // Lilypad Lurker
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
} });


register('summon-from-deck-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Finja: summon N creatures of a tribe from your deck onto the battlefield
			const p = state.players[pi];
			for (let n = 0; n < (e.count || 1); n++) {
				const idx = p.deck.findIndex(id => { const def = state.cardsById[id]; return def?.type === 'creature' && !def.token && (!e.tribe || (def.tribe || '').includes(e.tribe)); });
				if (idx < 0) break;
				const [id] = p.deck.splice(idx, 1);
				const c = summon(state, pi, state.cardsById[id]);
				if (c && e.grant && !c.keywords.includes(e.grant)) { c.keywords.push(e.grant); if (e.grant === KW.DIVINE_SHIELD) c.shield = true; } // Possessed Animancer: Lifesteal
				if (c && e.chainDeathrattleSummonId && state.cardsById[e.chainDeathrattleSummonId]) { // Moragg: "Deathrattle: Summon Moragg"
					c.deathrattle = [...(c.deathrattle || []), { type: 'summon', count: 1, summonId: e.chainDeathrattleSummonId }];
					if (!c.keywords.includes('deathrattle')) c.keywords.push('deathrattle');
				}
			}
} });


register('blessing-wind', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Shaman: transform a random friendly minion into one that costs (N) more
			const n = Math.max(1, state.players[pi].imbueCount || 1);
			const p = state.players[pi];
			const pool2 = p.board.filter(c => !isDead(c) && c.type !== 'location' && !c.token);
			if (pool2.length) {
				const t = pool2[Math.floor(state.rng() * pool2.length)];
				const targetCost = (t.cost || 0) + n;
				const opts = Object.values(state.cardsById).filter(dd => dd.type === 'creature' && (dd.cost || 0) === targetCost && !dd.token && dd.collectible !== false && !dd.companion && !dd.commander && !(dd.colors && dd.colors.length));
				if (opts.length) {
					const nd = instantiate(opts[Math.floor(state.rng() * opts.length)], pi);
					nd.zone = 'board'; nd.sick = t.sick;
					const bi = p.board.indexOf(t);
					if (bi >= 0) { p.board[bi] = nd; t.zone = 'gone'; emit(state, { type: 'transformed', uid: t.uid, player: pi, from: t.name, card: nd }); recomputeAuras(state); }
				}
			}
} });


register('transform-same-cost', ({ state, pi, chosenCreature }, e) => { {
			// Tabaxi Transmogrifier: transform the chosen creature (either side) into a
			// random collectible creature of equal Mana Cost. Mirrors blessing-wind's
			// pool build but keyed to the target's controller and exact cost.
			const t = chosenCreature();
			if (!t || isDead(t) || t.type === 'location') return;
			const opts = Object.values(state.cardsById).filter(dd => dd.type === 'creature' && (dd.cost || 0) === (t.cost || 0) && !dd.token && dd.collectible !== false && !dd.companion && !dd.commander && !(dd.colors && dd.colors.length));
			if (!opts.length) return;
			const owner = state.players[t.controller];
			const bi = owner.board.indexOf(t);
			if (bi < 0) return;
			const nd = instantiate(opts[Math.floor(state.rng() * opts.length)], t.controller);
			nd.zone = 'board'; nd.sick = t.sick;
			owner.board[bi] = nd; t.zone = 'gone';
			emit(state, { type: 'transformed', uid: t.uid, player: t.controller, from: t.name, card: nd });
			recomputeAuras(state);
} });


register('blood-fighter-summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// Lo'Gosh trio: summon a Blood Fighter from your hand with +5/+5 and a rider
			const p = state.players[pi];
			const hi = p.hand.findIndex(c => (c.name || '').includes('Blood Fighter'));
			if (hi >= 0) {
				const [bf] = p.hand.splice(hi, 1);
				bf.attack += 5; bf.maxHealth += 5;
				bf.zone = 'board'; bf.sick = true; p.board.push(bf);
				emit(state, { type: 'summon', player: pi, card: bf });
				if (e.mode === 'taunt' && !bf.keywords.includes(KW.TAUNT)) bf.keywords.push(KW.TAUNT);
				if (e.mode === 'elusive' && !bf.keywords.includes(KW.ELUSIVE)) bf.keywords.push(KW.ELUSIVE);
				recomputeAuras(state);
				if (e.mode === 'attack') {
					// attacks a random enemy minion (falls back to nothing on empty boards)
					const pool = [];
					for (const o of enemies) for (const c of state.players[o].board) if (!isDead(c) && c.type !== 'location') pool.push(c);
					if (pool.length) {
						const t = pool[Math.floor(state.rng() * pool.length)];
						damageCreature(state, t, bf.attack, bf);
						damageCreature(state, bf, t.attack, t);
					}
				}
			}
} });


register('galakrond', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('herald', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
} });


register('launch-starship', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// GDB: summon The Starship with the combined stats, keywords, deathrattles
			// and ongoing triggers of every assembled piece, then fire each piece's
			// launch effects. e.bonus = an Exodar Protocol rider baked into the ship.
			const p = state.players[pi];
			const pieceDefs = (p.starshipPieces || []).map(id => state.cardsById[id]).filter(Boolean);
			if (pieceDefs.length && state.cardsById['gdb_the_starship']) {
				let atk = 0, hpv = 0; const kws = new Set(); let dr = []; const ongs = []; const names = [];
				for (const d of pieceDefs) {
					atk += d.attack || 0; hpv += d.health || 0;
					for (const k of d.keywords || []) if (k !== 'battlecry' && k !== 'deathrattle') kws.add(k);
					if (d.deathrattle) dr = dr.concat(JSON.parse(JSON.stringify(d.deathrattle)));
					if (d.ongoing) ongs.push(JSON.parse(JSON.stringify(d.ongoing)));
					names.push(d.name);
				}
				if (e.bonus) { atk += e.bonus.attack || 0; hpv += e.bonus.health || 0; for (const k of e.bonus.keywords || []) kws.add(k); }
				const ship = summon(state, pi, {
					...state.cardsById['gdb_the_starship'],
					attack: Math.max(1, atk), health: Math.max(1, hpv), keywords: [...kws],
					description: 'Launched Starship: ' + names.join(', ') + '.',
				});
				if (ship) {
					if (dr.length) { ship.deathrattle = dr; if (!ship.keywords.includes('deathrattle')) ship.keywords.push('deathrattle'); }
					if (ongs.length) ship.ongoings = ongs;
					p.starshipPieces = [];
					p.starshipsLaunched = (p.starshipsLaunched || 0) + 1;
					emit(state, { type: 'starshipLaunch', player: pi, uid: ship.uid, name: ship.name, pieces: names });
					for (const d of pieceDefs) if (d.launch) execEffects(state, pi, JSON.parse(JSON.stringify(d.launch)), null, ship);
					// Hellion / Siege Tank / Thor: transform wherever they are once you've launched
					for (let hi = 0; hi < p.hand.length; hi++) {
						const hd = state.cardsById[p.hand[hi].id];
						if (hd && hd.launchTransform && state.cardsById[hd.launchTransform]) {
							const ni = instantiate(state.cardsById[hd.launchTransform], pi);
							ni.zone = 'hand'; p.hand[hi] = ni;
							emit(state, { type: 'transformed', player: pi, uid: ni.uid, name: ni.name });
						}
					}
					p.deck = p.deck.map(id => {
						const dd = state.cardsById[id];
						return (dd && dd.launchTransform && state.cardsById[dd.launchTransform]) ? dd.launchTransform : id;
					});
					recomputeAuras(state);
				}
			}
} });


register('summon', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
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
			if (!e.eachPlayer && !e.forEnemy) { const _dv = staticValue(state.players[pi], 'token-doubler'); if (_dv > 0) n *= 2 ** _dv; } // Mondrak: doublers double token creation (stack multiplicatively)
			const isCompanions = e.options && e.options.some(o => o.name === 'Huffer');
			if (isCompanions && state.players[pi].companionExtra) n += state.players[pi].companionExtra; // Talya Earthstrider
			const summonOne = (ownerIdx) => {
				if (isCompanions && state.players[pi].companionUpgrade) { // Migrating Elekk: random Beasts at +1 Cost instead
					const pool = Object.values(state.cardsById).filter(dd => dd.type === 'creature' && (dd.tribe || '').includes('Beast') && (dd.cost || 0) === 4 && !dd.token && dd.collectible !== false && !(dd.colors && dd.colors.length));
					if (pool.length) { summon(state, ownerIdx, pool[Math.floor(state.rng() * pool.length)]); return; }
				}
				const opt = e.options ? e.options[Math.floor(state.rng() * e.options.length)] : e;
				// summonId: instantiate a real card def so it keeps its own ongoing —
				// e.g. Gibberling's Spellburst summons another Gibberling that snowballs
				if (opt.summonId && state.cardsById[opt.summonId]) {
					const sc = summon(state, ownerIdx, state.cardsById[opt.summonId]);
					if (sc && e.grant) for (const k of e.grant) { if (!sc.keywords.includes(k)) sc.keywords.push(k); if (k === KW.DIVINE_SHIELD) sc.shield = true; } // Super Simian Sphere: Mukla with Immune+Elusive
					if (sc && e.buff) { sc.attack += e.buff.attack || 0; sc.maxHealth += e.buff.health || 0; } // Disciple of Sargeras (Forged): the Imps get +2 Health
					return;
				}
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
} });


register('summon-random', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
			// "Summon a random creature with Mana Value 2 or less" / "a random
			// Demon" / "a random 4-Cost minion" (exact cost) / Past Conflux's
			// "a random Dragon that costs 5 or more".
			// Steeldancer: costFromWeapon fixes the Cost to your weapon's Attack.
			let exactCost = e.costFromWeapon ? (state.players[pi].weapon ? (state.players[pi].weapon.attack || 0) : 0)
				: e.costFromSelfAttack ? (source ? (source.attack || 0) : 0) // Spurfang: Cost = this minion's Attack
				: e.costFromSelfCost ? (source ? (source.cost || 0) : 0) // Ulfar's granted Deathrattle: Cost = this minion's Cost
				: e.cost;
			if (exactCost != null && e.costDelta) exactCost += e.costDelta; // Big Bad Voodoo: self Cost + 1
			const pool = e.ids ? e.ids.map(id => state.cardsById[id]).filter(Boolean) : Object.values(state.cardsById).filter(d =>
				d.type === 'creature' && (e.maxCost == null || (d.cost || 0) <= e.maxCost)
				&& (e.minCost == null || (d.cost || 0) >= e.minCost)
				&& (exactCost == null || (d.cost || 0) === exactCost)
				&& (e.tribe == null || (d.tribe || '').includes(e.tribe))
				&& (e.rarity == null || d.rarity === e.rarity)
				&& (e.requireKeyword == null || (d.keywords || []).includes(e.requireKeyword)) // Obsidian Revenant: Deathrattle minions
				&& !d.companion && !d.commander && !d.token && d.collectible !== false && !(d.colors && d.colors.length));
			let howMany = e.count || 1;
			if (e.countPer === 'schools-cast-game') howMany = (e.count || 1) + Object.keys(state.players[pi].schoolsCastGame || {}).length; // Razzle-Dazzler
			if (e.countPer === 'self-deaths') howMany = source ? Math.max(1, (state.players[pi].diedCountById?.[source.id] || 0)) : 1; // Ysondre: one Dragon per time it has died
			for (let i = 0; i < howMany && pool.length; i++) {
				const def = pool[Math.floor(state.rng() * pool.length)];
				const owner = e.forEnemy && enemies.length
					? enemies[Math.floor(state.rng() * enemies.length)] : pi;
				const c = summon(state, owner, def);
				if (c && e.disguise) disguiseCreature(state, c);
				// "...and give it Taunt": grant a keyword to the summoned creature
				if (c && e.grant) { for (const gk of (Array.isArray(e.grant) ? e.grant : [e.grant])) if (!c.keywords.includes(gk)) { c.keywords.push(gk); if (gk === KW.DIVINE_SHIELD) c.shield = true; if (gk === KW.STEALTH) c.stealthed = true; } } // grant may be a single keyword or an array (Aman'Thul: Taunt + Lifesteal)
				if (c && (e.buffAttack || e.buffHealth)) { c.attack += e.buffAttack || 0; c.maxHealth += e.buffHealth || 0; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); } // Harmonic Disco: summon it with +1/+1
				if (c && e.dormantTurns) { c.dormantLeft = e.dormantTurns; emit(state, { type: 'dormant', player: owner, uid: c.uid, turns: e.dormantTurns }); } // Paltry Flutterwing / Dreadsoul
				// Ankylodon: the summoned Beasts attack random enemies
				if (c && e.attackRandom && !isDead(c)) {
					const foes = [];
					for (const o of opponentsOf(state, owner)) for (const fc of state.players[o].board) if (!isDead(fc) && fc.type !== 'location') foes.push(fc);
					if (foes.length) { const t = foes[Math.floor(state.rng() * foes.length)]; damageCreature(state, t, c.attack, c); damageCreature(state, c, t.attack, t); }
				}
			}
} });


register('summon-from-deck-each', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Desert Camel: every player puts a creature of Cost N from their deck into play
			const summoned = [];
			for (let s3 = 0; s3 < state.players.length; s3++) {
				const pl = state.players[s3];
				if (pl.eliminated) continue;
				const ci = pl.deck.findIndex(id => { const def = state.cardsById[id]; return def?.type === 'creature' && !def.token && (e.cost == null || (def.cost || 0) === e.cost); });
				if (ci >= 0) { const [id] = pl.deck.splice(ci, 1); const m = summon(state, s3, state.cardsById[id]); if (m) summoned.push({ owner: s3, m }); }
			}
			if (e.fight && summoned.length >= 2) { // Duel!: the caster's minion fights an enemy's
				const mine = summoned.find(x => x.owner === pi), foe = summoned.find(x => x.owner !== pi);
				if (mine && foe && !isDead(mine.m) && !isDead(foe.m)) { damageCreature(state, foe.m, mine.m.attack, mine.m); damageCreature(state, mine.m, foe.m.attack, foe.m); }
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('recruit', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
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
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('draw-and-summon-if-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
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
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('summon-cheapest-from-hand-each', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
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
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('fill-board-each', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Mad Summoner: fill every player's board with tokens
			for (let s2 = 0; s2 < state.players.length; s2++) {
				if (state.players[s2].eliminated) continue;
				while (state.players[s2].board.filter(c => !isDead(c)).length < 7) {
					const c = summon(state, s2, { id: 'token_' + (e.name || 'imp').toLowerCase(), name: e.name || 'Imp', type: 'creature', cost: 1, token: true, tribe: e.tribe || null, rarity: 'common', attack: e.attack || 1, health: e.health || 1, description: `A ${e.attack || 1}/${e.health || 1} token.` });
					if (!c) break;
				}
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('summon-foreign-from-hand', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
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
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('summon-played-foreign-demons', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Archimonde: summon every Demon you played this game that didn't start in your deck
			const p = state.players[pi];
			for (const [id, n] of Object.entries(p.playedCountById || {})) {
				const def = state.cardsById[id];
				if (!def || def.type !== 'creature' || !(def.tribe || '').includes('Demon')) continue;
				if ((p.startingDeckIds || []).includes(id)) continue;
				for (let k = 0; k < n; k++) summon(state, pi, def);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('summon-copy-of-self', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Mischievous Imp / Scuttlebutt Ghoul / Partner in Crime: summon N copies of this minion
			if (e.requireSecret && !state.players[pi].secrets.length) continue;
			const def = source && state.cardsById[source.id];
			if (def) for (let n = 0; n < (e.count || 1); n++) summon(state, pi, def);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('summon-enemy-beast-attack-all', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Snoozin' Zookeeper: summon an X/X Beast for the opponent that attacks all of their minions
			for (const o of enemies) {
				const beast = summon(state, o, { id: e.id || 'token_wild_beast', name: e.name || 'Beast', type: 'creature', cost: 0, token: true, tribe: 'Beast', rarity: 'common', attack: e.attack || 8, health: e.health || 8, keywords: [], description: `A ${e.attack || 8}/${e.health || 8} token.` });
				if (!beast) continue;
				beast.sick = false;
				for (const victim of [...state.players[o].board]) {
					if (isDead(beast)) break;
					if (victim === beast || isDead(victim) || victim.type === 'location' || victim.dormantLeft > 0) continue;
					resolveCombat(state, o, beast.uid, { type: 'creature', uid: victim.uid, player: o });
				}
				break; // one opponent (1v1)
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('resurrect-died-distinct-mincost', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Merithra: resurrect all different friendly minions that cost N or more
			const p = state.players[pi];
			const seen = new Set();
			for (const id of (p.deathLogIds || [])) {
				if (seen.has(id)) continue; seen.add(id);
				const def = state.cardsById[id];
				if (def && def.type === 'creature' && (def.cost || 0) >= (e.minCost || 8)) summon(state, pi, def);
			}
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('transform-all-enemies-into-token', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Sir Finley: transform all enemy minions into fixed-stat tokens
			for (const o of enemies) { const op = state.players[o]; for (let i = 0; i < op.board.length; i++) { const c = op.board[i]; if (isDead(c) || c.type === 'location') continue; const tok = instantiate({ id: e.id || 'token_murloc', name: e.name || 'Murloc', type: 'creature', cost: 1, token: true, tribe: e.tribe || 'Murloc', rarity: 'common', attack: e.attack || 1, health: e.health || 1, description: `A ${e.attack || 1}/${e.health || 1} token.` }, o); tok.zone = 'board'; tok.uid = c.uid; tok.sick = c.sick; op.board[i] = tok; c.zone = 'gone'; emit(state, { type: 'transformed', uid: c.uid, player: o, from: c.name, card: tok }); } } recomputeAuras(state);
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('resurrect-tribe-cost-attack', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
			// Inventor Boom: resurrect N different friendly Mechs costing M+; they attack random enemies
			const p = state.players[pi];
			const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && (d.tribe || '').includes(e.tribe) && (d.cost || 0) >= (e.minCost || 0));
			const picked = [];
			for (let n = 0; n < (e.count || 2) && pool.length; n++) { const i = Math.floor(state.rng() * pool.length); const [def] = pool.splice(i, 1); const c = summon(state, pi, def); if (c) picked.push(c); }
			for (const c of picked) { if (isDead(c)) continue; c.sick = false; const foes = []; for (const o of enemies) { for (const x of state.players[o].board) if (!isDead(x) && x.type !== 'location' && !x.stealthed && x.dormantLeft <= 0) foes.push({ type: 'creature', uid: x.uid, player: o }); foes.push({ type: 'hero', player: o }); } if (foes.length && !isDead(c)) resolveCombat(state, pi, c.uid, foes[Math.floor(state.rng() * foes.length)]); }
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});


register('resurrect-tribe', ({ state, pi }, e) => {
	// Catrina Muerte: resurrect one random friendly dead minion of a tribe
	const p = state.players[pi];
	const pool = [...new Set(p.deathLogIds)].map(id => state.cardsById[id]).filter(d => d && d.type === 'creature' && !d.token && (d.tribe || '').includes(e.tribe));
	for (let k = 0; k < (e.count || 1) && pool.length; k++) { // Kangor's Endless Army: `count` resurrects several
		const c = summon(state, pi, pool[Math.floor(state.rng() * pool.length)]);
		if (c && e.grant && !c.keywords.includes(e.grant)) c.keywords.push(e.grant);
	}
});

register('resurrect-per-tribe', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => {
	do {
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
	} while (false); // top-level `continue` = skip this effect (chain semantics)
});

register('summon-hand-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Kobold Illusionist / Posse Possession: summon an X/Y copy of a random
	// creature in a hand (fromEnemy: a random opponent's)
	const owner = e.fromEnemy && enemies.length ? enemies[Math.floor(state.rng() * enemies.length)] : pi;
	const pool = state.players[owner].hand.filter(c => c.type === 'creature');
	if (pool.length) {
		const src2 = pool[Math.floor(state.rng() * pool.length)];
		const base = state.cardsById[src2.id];
		const cd = base ? JSON.parse(JSON.stringify(base)) : { id: src2.id, name: src2.name, type: 'creature', cost: src2.cost || 0, rarity: 'common', attack: src2.attack, health: src2.maxHealth, keywords: [...(src2.keywords || [])], description: src2.description || '' };
		if (e.attack != null) cd.attack = e.attack;
		if (e.health != null) cd.health = e.health;
		summon(state, pi, cd);
	}
} });

register('summon-from-deck', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Duels: pull creatures out of your deck and summon them. `tribes` = a list
	// of tribes to summon one each (Collector's Ire: Mech/Pirate/Dragon), or
	// `tribe` + `count` (Summoning Ritual: 3 Demons). null tribe = any creature.
	const p = state.players[pi];
	const wanted = e.tribes ? [...e.tribes] : Array(e.count || 1).fill(e.tribe || null);
	for (const tribe of wanted) {
		const idx = p.deck.findIndex(id => { const d = state.cardsById[id]; return d && d.type === 'creature' && (!tribe || (d.tribe || '').includes(tribe)) && (e.maxCost == null || (d.cost || 0) <= e.maxCost); }); // Reinforcement Aura: costs (2) or less
		if (idx < 0) continue;
		const [cid] = p.deck.splice(idx, 1);
		const def = state.cardsById[cid];
		if (def) summon(state, pi, def);
	}
} });


register('amalgamate', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Amalgamate: destroy all your creatures, then summon one creature with their
	// combined Attack and Health.
	const p = state.players[pi];
	const living = p.board.filter(c => !isDead(c) && c.type !== 'location');
	let atk = 0, health = 0;
	for (const c of living) { atk += c.attack || 0; health += hp(c); }
	for (const c of living) { c.damage = c.maxHealth; c.shield = false; emit(state, { type: 'destroy', uid: c.uid }); }
	sweepDeaths(state);
	if (health <= 0) return;
	summon(state, pi, {
		id: 'token_amalgamation', name: 'Amalgamation', type: 'creature', cost: 0,
		rarity: 'legendary', token: true, description: `A ${atk}/${health} Amalgamation.`,
		attack: atk, health,
	});
} });


register('dragonbone-revive', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Dragonbone Ritual: the dying Dragon returns dormant and revives in 2 turns
	// (reviveTimer ticks down at the owner's turn start; 0 wakes it).
	if (!source || !state.cardsById[source.id]) return;
	const c = summon(state, pi, state.cardsById[source.id]);
	if (c) { c.dormantLeft = 99; c.reviveTimer = 2; emit(state, { type: 'dormant', player: pi, uid: c.uid, turns: 2 }); }
} });


register('destroy-summon-copy', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Holy Book: silence & destroy a creature, then summon a fixed-stat copy of it
	// under your control (silence first so it can't Deathrattle on the way out).
	const t = chosenCreature();
	if (!t) return;
	const def = state.cardsById[t.id];
	silenceCreature(state, t);
	t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid });
	sweepDeaths(state);
	const c = summon(state, pi, def || { id: t.id, name: t.name, type: 'creature', cost: t.cost || 0, rarity: 'common', description: t.name, attack: t.attack || 0, health: hp(t) || 1 });
	if (c) {
		if (e.attack != null) c.attack = e.attack;
		if (e.health != null) { c.maxHealth = e.health; c.damage = 0; c.tempHealth = 0; }
		emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
	}
} });


register('destroy-summon-tokens-by-health', ({ state, pi, target, source, enemies, scaled, hm, pickEnemy, enemyHero, chosenCreature, healCreature, buffCreature, boost }, e) => { {
	// Shadow Word: Void — destroy a creature, then summon tokens equal to a
	// fraction of its Health (rounded up). Voidfiend = 0/2, per = 2.
	const t = chosenCreature();
	if (!t) return;
	const n = Math.max(0, Math.ceil(hp(t) / (e.per || 2)));
	t.damage = t.maxHealth; t.shield = false; emit(state, { type: 'destroy', uid: t.uid });
	sweepDeaths(state);
	const name = e.tokenName || 'Voidfiend';
	for (let i = 0; i < n; i++) summon(state, pi, {
		id: 'token_' + name.toLowerCase().replace(/[^a-z0-9]+/g, '_'), name, type: 'creature', cost: 0,
		rarity: 'common', token: true, description: `A ${e.attack || 0}/${e.health || 2} ${name}.`,
		attack: e.attack || 0, health: e.health || 2,
	});
} });

register('summon-overflow', ({ state, pi }, e) => {
	// Summon `count` tokens; any that can't fit the board (row saturated) become
	// `overflow`: 'buff-others' (give the summoned survivors +a/+h each) or
	// 'to-hand-buffed' (a buffed copy goes to hand instead).
	const p = state.players[pi];
	const def = { id: e.id || 'ov_token', name: e.name || 'Token', type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: e.attack || 1, health: e.health || 1, keywords: e.keywords || [], description: `A ${e.attack || 1}/${e.health || 1}.` };
	const made = [];
	let overflow = 0;
	for (let n = 0; n < (e.count || 1); n++) {
		const c = summon(state, pi, def);
		if (c) made.push(c); else overflow++;
	}
	for (let n = 0; n < overflow; n++) {
		if (e.overflow === 'buff-others') {
			for (const c of made) { c.attack += e.overflowAttack || 1; c.maxHealth += e.overflowHealth || 1; emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) }); }
		} else if (e.overflow === 'to-hand-buffed' && p.hand.length < MAX_HAND) {
			const cp = instantiate(def, pi); cp.zone = 'hand';
			cp.attack += e.overflowAttack || 4; cp.maxHealth += e.overflowHealth || 4;
			p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null });
		}
	}
});

register('add-card-overflow-buff', ({ state, pi }, e) => {
	// Monkey Business: add N copies of a card; any that can't fit your hand are
	// fed to a random friendly creature as +1/+1 each.
	const p = state.players[pi];
	const def = state.cardsById[e.id];
	if (!def) return;
	for (let n = 0; n < (e.count || 1); n++) {
		if (p.hand.length < MAX_HAND) {
			const cp = instantiate(def, pi); cp.zone = 'hand';
			p.hand.push(cp); emit(state, { type: 'conjure', player: pi, card: cp, color: null });
		} else {
			const pool = p.board.filter(c => !isDead(c) && c.type === 'creature');
			if (!pool.length) continue;
			const c = pool[Math.floor(state.rng() * pool.length)];
			c.attack += e.overflowAttack || 1; c.maxHealth += e.overflowHealth || 1;
			emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
		}
	}
});

register('summon-per-elementals-last-turn', ({ state, pi }, e) => {
	// Grand Finale: create one token, then repeat for each Elemental you played
	// last turn
	const times = 1 + (state.players[pi].elementalsPlayedLastTurn || 0);
	const def = { id: e.id || 'gf_token', name: e.name || 'Elemental', type: 'creature', cost: 0, token: true, tribe: e.tribe || 'Elemental', rarity: 'common', attack: e.attack || 8, health: e.health || 8, keywords: e.keywords || [], description: `A ${e.attack || 8}/${e.health || 8}.` };
	for (let n = 0; n < times; n++) if (!summon(state, pi, def)) break;
});

register('summon-attack-random', ({ state, pi, enemies }, e) => {
	// Tsunami: create N tokens; each immediately attacks a random enemy
	// (mutual combat damage), keeping any token keywords like Freeze
	const def = { id: e.id || 'sar_token', name: e.name || 'Token', type: 'creature', cost: 0, token: true, tribe: e.tribe || null, rarity: 'common', attack: e.attack || 1, health: e.health || 1, keywords: e.keywords || [], description: `A ${e.attack || 1}/${e.health || 1}.` };
	for (let n = 0; n < (e.count || 1); n++) {
		const c = summon(state, pi, def);
		if (!c) break;
		const pool = [];
		for (const o of enemies) for (const t of state.players[o].board) if (!isDead(t) && t.type !== 'location' && (t.dormantLeft || 0) <= 0) pool.push(t);
		if (!pool.length) continue;
		const t = pool[Math.floor(state.rng() * pool.length)];
		damageCreature(state, t, c.attack, c);
		damageCreature(state, c, t.attack, t);
	}
	sweepDeaths(state);
});

register('draw-minions-swap-health', ({ state, pi }, e) => {
	// Switcheroo: draw 2 creatures from your deck, then swap their Health
	const p = state.players[pi];
	const drawn = [];
	for (let n = 0; n < (e.count || 2); n++) {
		if (p.hand.length >= MAX_HAND) break;
		let idx = -1;
		for (let i = p.deck.length - 1; i >= 0; i--) { if (state.cardsById[p.deck[i]]?.type === 'creature') { idx = i; break; } }
		if (idx < 0) break;
		const [id] = p.deck.splice(idx, 1);
		const card = instantiate(state.cardsById[id], pi);
		card.zone = 'hand'; p.hand.push(card);
		emit(state, { type: 'draw', player: pi, card });
		drawn.push(card);
	}
	if (drawn.length === 2) {
		const h0 = drawn[0].maxHealth, h1 = drawn[1].maxHealth;
		drawn[0].maxHealth = h1; drawn[1].maxHealth = h0;
	}
});
