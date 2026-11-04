// engine/effects/handlers-followup.js — play-path handlers that act on what an
// EARLIER effect of the same spell produced (followups.js keeps the record).
//
// These types existed only as TRIGGER handlers (Rangari Scout's "after you
// Discover", Shadowfiend's "after you draw", Overlord's Whip's "after you
// play", Spiritsinger Umbra's "after you summon"), so on a spell they were
// silent no-ops: Soul Searching, Blood Clone, Paleomancy, Story of Umbra, Lunar
// Visions, Fast Forward and Chemical Spill paid their mana and did only their
// first half (2026-10-27).
import { register } from './registry.js';
import { lastResult } from './followups.js';
import { emit, execEffects, isDead, applyPickFollowup } from '../../engine.js';
import { runDeathrattle } from '../death.js';

// Attach a follow-up to each Discover pick this source queued (`count`
// Discovers queue several). resolvePick runs it once the pick is made; a pick
// that already resolved gets it at once.
function attachToDiscover(state, source, f) {
	const pends = lastResult(source, 'discover') || [];
	for (const pend of pends) {
		if (state.pickQueue.includes(pend)) (pend.after = pend.after || []).push(f);
		else if (pend.chosenId != null) applyPickFollowup(state, pend, f);
	}
	return pends.length;
}

// Soul Searching: "Spend 5 Corpses to copy it" — a copy of the discovered card.
// Blood Clone (to:'board'): "Create a token that's a copy of it".
register('add-copy-of-discovered', ({ state, source }, e) => {
	attachToDiscover(state, source, { kind: 'copy', count: e.count || 1, to: e.to === 'board' ? 'board' : 'hand' });
});

// Paleomancy: "Spend 5 Corpses to keep all 3 instead" — the unpicked options too
register('keep-all-discovered', ({ state, source }) => {
	attachToDiscover(state, source, { kind: 'keep-all' });
});

// Story of Umbra: "Put it onto the battlefield and trigger its Deathrattle" —
// the creature an earlier effect of this spell put onto the battlefield
// (a Discover to:'board' pick, or a summon-from-hand)
register('trigger-summoned-deathrattle', ({ state, source }) => {
	attachToDiscover(state, source, { kind: 'trigger-deathrattle' });
	for (const m of lastResult(source, 'summoned') || []) {
		if (m.zone === 'board' && !isDead(m) && m.deathrattle) runDeathrattle(state, m.controller, m);
	}
});

// Lunar Visions: "Creatures drawn cost (2) less" — every card the spell's draw
// just brought in (optionally only one type). Fast Forward (pick:true): "Pick
// one to have its Cost reduced" — a pick among the drawn cards.
register('reduce-drawn-cost', ({ state, pi, source }, e) => {
	const p = state.players[pi];
	const v = e.value || 1;
	const drawn = (lastResult(source, 'draw') || []).filter(c => p.hand.includes(c)
		&& (!e.cardType || c.type === e.cardType));
	if (!drawn.length) return;
	if (e.pick && drawn.length > 1) {
		state.pickQueue.push({ player: pi, mode: 'reduce-drawn', ids: drawn.map(c => c.id), uids: drawn.map(c => c.uid), value: v, title: `Reduce its Cost by (${v})` });
		emit(state, { type: 'pickStart', player: pi, count: drawn.length });
		return;
	}
	for (const c of drawn) {
		c.cost = Math.max(0, (c.cost || 0) - v);
		emit(state, { type: 'costChange', player: pi, uid: c.uid, cost: c.cost });
	}
});

// Chemical Spill: "...then deal 5 damage to it" — the creature(s) an earlier
// summon-from-hand of this spell put onto the battlefield. Routed through the
// ordinary damage effect so Spell Damage and lifesteal apply as for any spell.
register('damage-played-minion', ({ state, pi, source }, e) => {
	for (const m of lastResult(source, 'summoned') || []) {
		if (m.zone !== 'board' || isDead(m)) continue;
		execEffects(state, pi, [{ type: 'damage', value: e.value || 1, target: 'creature' }], { type: 'creature', uid: m.uid, player: m.controller }, source);
	}
});
