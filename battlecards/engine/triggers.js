// engine/triggers.js -- the trigger pipeline (docs/engine-hardening/05, PR 14).
//
// fireOngoing / fireCreatureTrigger / ongoingCondOk / fireSecrets /
// fireSecretsAll / secretMatches moved VERBATIM from engine.js. Source order
// (enchantments -> artifacts -> emblems -> board -> weapon), counter
// semantics (once/need/every), condition gating, and secret reveal order are
// all pinned by tests/characterization/trigger_order_test.mjs, written and
// green BEFORE this move (docs/09: ordering tests first).
//
// runSecretEffects (the 141-case trigger-side switch) deliberately STAYS in
// engine.js: its cases retire into engine/effects/registry.js batch by batch
// (PR 17+), which shrinks it in place without a 40-import bulk move.
import { isDead, emit, hp, schoolOf, runSecretEffects } from '../engine.js';
import { toGraveyard } from './zones.js';

// fire a single creature's own ongoing triggers by name (combat reactions:
// self-attacks-survives, self-deals-damage, …); ctx.self is the creature
export function fireCreatureTrigger(state, c, when, extra = {}) {
	if (!c || isDead(c)) return;
	const trigs = [];
	if (c.ongoing?.on === when) trigs.push(c.ongoing);
	if (c.ongoings) for (const o of c.ongoings) if (o.on === when) trigs.push(o);
	for (const o of trigs) runSecretEffects(state, c.controller, o.effects, { self: c, ...extra });
}

// condition on an ongoing trigger, judged against the event's subject card
// (the summoned/played/dead/damaged creature) or the owner's own state
export function ongoingCondOk(state, pi, cond, ctx) {
	const subj = ctx.minion || ctx.played || ctx.dead || ctx.damaged || ctx.frozen || null;
	if (cond.maxAttack != null && !(subj && subj.attack <= cond.maxAttack)) return false;
	if (cond.tribe && !(subj && (subj.tribe || '').includes(cond.tribe))) return false;
	if (cond.overload && !(subj && subj.overload > 0)) return false;
	if (cond.cardType && !(subj && subj.type === cond.cardType)) return false;
	if (cond.keyword && !(subj && (subj.keywords || []).includes(cond.keyword))) return false; // Undertaker: a Deathrattle minion
	if (cond.maxHealthSubj != null && !(subj && hp(subj) <= cond.maxHealthSubj)) return false; // Steward of Darkshire: a 1-Health minion
	if (cond.spellCost != null && !(subj && (subj.cost || 0) === cond.spellCost)) return false; // Gazlowe: a 1-Cost spell
	if (cond.maxCost != null && !(subj && (subj.cost || 0) <= cond.maxCost)) return false; // Oracle of Elune: a minion that costs (2) or less
	if (cond.minCost != null && !(subj && (subj.cost || 0) >= cond.minCost)) return false; // Timber Tambourine: a card that costs (5) or more
	if (cond.controlSecret && !state.players[pi].secrets.length) return false;
	if (cond.creature && !ctx.healedCreature) return false; // "whenever a MINION is healed"
	if (cond.nontoken && (!subj || (subj.id || '').startsWith('token_'))) return false;
	if (cond.yourTurn && state.current !== pi) return false; // Bayfin Bodybuilder: only during your turn
	if (cond.enemySubj && !(subj && subj.controller !== pi)) return false; // ...and only enemy minions
	if (cond.adjacentSelf) { // Rehgar: this or an adjacent minion
		const b = state.players[pi].board;
		const si = ctx.self ? b.indexOf(ctx.self) : -1;
		const ai = subj ? b.indexOf(subj) : -1;
		if (!(subj === ctx.self || (si >= 0 && ai >= 0 && Math.abs(si - ai) === 1))) return false;
	}
	if (cond.cardId && !(subj && subj.id === cond.cardId)) return false; // Food sacrifices
	if (cond.self && ctx.damaged !== ctx.self) return false; // "whenever THIS takes damage"
	if (cond.selfTarget && ctx.targetCreature !== ctx.self) return false; // Stormwind Avenger: a spell cast on THIS minion
	if (cond.enemy && !(subj && subj.controller !== pi)) return false; // "an ENEMY creature ..."
	if (cond.school && !(subj && schoolOf(subj) === cond.school)) return false; // "cast an Arcane spell"
	if (cond.controlArtEnch && !(state.players[pi].artifacts.length || state.players[pi].enchantments.length)) return false; // "if you control an artifact or an enchantment"
	if (cond.damageAmount != null && ctx.amount !== cond.damageAmount) return false; // Holotechnician: took exactly N damage
	if (cond.heroHealed && ctx.healedHero == null) return false; // Screaming Banshee: your HERO gained Health
	if (cond.minAttackSelf && !(subj && ctx.self && subj.attack > ctx.self.attack)) return false; // Observer of Myths: a minion with MORE Attack than this
	if (cond.attackEqualsSelf && !(subj && ctx.self && subj.attack === ctx.self.attack)) return false; // The Replicator-inator: same Attack as this
	if (cond.handMax != null && !(state.players[pi].hand.length <= cond.handMax)) return false; // Howdyfin: fewer than N cards in hand
	if (cond.tribeSubj && !(subj && (subj.tribe || '').includes(cond.tribeSubj))) return false;
	if (cond.dormantSelf && !(ctx.self && ctx.self.dormantLeft > 0)) return false; // Dozing Dragon: only while asleep
	if (cond.playedBefore && !(subj && (state.players[pi].playedCountById?.[subj.id] || 0) >= 1)) return false; // Twisted Webweaver: a minion you've already played
	if (cond.selfFullHealth && !(ctx.self && ctx.self.damage === 0)) return false; // Incensed Matriarch: only at full Health
	if (cond.friendlyTarget && !(ctx.targetCreature && ctx.targetCreature.controller === pi)) return false; // Pelagos: a spell cast on a FRIENDLY minion
	if (cond.friendlySecret && ctx.secretOwner !== pi) return false; // Orion, Mansion Manager: one of YOUR Secrets revealed
	return true;
}

// ---------- ongoing permanents (enchantments, artifacts, emblems, creatures) ----------
// persistent triggers: fire every time, card stays in play. Board creatures
// with an `ongoing` field participate too (whenever-/at- style minions);
// each firing card sees itself as ctx.self so effects can target it.
export function fireOngoing(state, pi, when, ctx = {}) {
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
export function fireSecretsAll(state, actorPi, trigger, ctx) {
	for (let i = 0; i < state.players.length; i++) {
		if (i !== actorPi) fireSecrets(state, i, trigger, ctx);
	}
}

// secrets and traps share the trigger system; traps sit face-down on the
// table (public count, hidden identity) while secrets are fully hidden
export function fireSecrets(state, pi, trigger, ctx) {
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
			for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'secret-revealed', { secretOwner: pi });
		} else {
			p.secrets = p.secrets.filter(s => s !== card);
			toGraveyard(state, pi, card);
			emit(state, { type: 'secretRevealed', player: pi, card });
			// Eaglehorn Bow-style triggers watch every reveal
			for (let s2 = 0; s2 < state.players.length; s2++) fireOngoing(state, s2, 'secret-revealed', { secretOwner: pi });
		}
		runSecretEffects(state, pi, sec.effects, ctx);
	}
}
