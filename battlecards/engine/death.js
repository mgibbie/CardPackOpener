// engine/death.js -- the death module (docs/engine-hardening/05, PR 12).
//
// isDead / sweepDeaths / runDeathrattle moved VERBATIM from engine.js
// (move-only; the sweep's bookkeeping is pinned by tests/characterization/
// death_sweep_test.mjs, written and green BEFORE the move -- reborn, corpse
// banking, marked-draw, equipment detach, commander retreat, deathrattle
// double-fire, died-this-turn logs, death triggers; deathrattle CONTENT is
// covered by the ff suites). Rider hooks are direct calls back into
// engine.js; toGraveyard comes from the sibling zones module.
import {
	emit, hp, has, instantiate, drawCards, recomputeAuras, checkGameOver,
	fireOngoing, fireSecrets, questTick, firePlaneTrigger, summon, execEffects,
	opponentsOf, TOKENS, KW, MAX_HAND,
} from '../engine.js';
import { damageCreature, damageHero } from './damage.js';
import { toGraveyard } from './zones.js';

export function isDead(c) {
	if (c.type === 'location') return c.doomed || c.durability <= 0;
	// Immune: lethal damage and "destroy" effects don't kill it — only
	// a sacrifice does (which sets c.sacrificed).
	if (has(c, KW.IMMUNE) && !c.sacrificed) return false;
	return c.doomed || c.damage >= c.maxHealth;
}

export function sweepDeaths(state) {
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
			p.friendlyDeaths = (p.friendlyDeaths || 0) + 1; // Aessina: lifetime friendly deaths (tokens included)
			if (p.armorPerFriendlyDeath) { p.armor += p.armorPerFriendlyDeath; emit(state, { type: 'armor', player: c.controller, armor: p.armor }); } // Recycling
			state.diedThisTurn = (state.diedThisTurn || 0) + 1;
			state.minionsDiedGame = (state.minionsDiedGame || 0) + 1; // Reska, the Pit Boss
			state.expanseEvents = (state.expanseEvents || 0) + 1; // The Ceaseless Expanse: a card was destroyed
			if (state.cardsById[c.id] && !c.token) {
				p.diedThisTurnIds.push(c.id);
				if (!p.deathLogIds.includes(c.id)) p.deathLogIds.push(c.id);
					(p.diedCountById = p.diedCountById || {})[c.id] = (p.diedCountById[c.id] || 0) + 1; // Elwynn Boar
					if ((c.keywords || []).includes('deathrattle')) p.lastDeathrattleDied = c.id; // Monstrous Parrot
			}
			// Bolvar Fordragon: grows in hand as your creatures die
			for (const hc of p.hand) if (hc.id === 'bolvar_fordragon') { hc.attack += 1; emit(state, { type: 'buff', uid: hc.uid, attack: hc.attack, hp: hp(hc) }); }
			emit(state, { type: 'death', uid: c.uid, player: pi, name: c.name });
			// Corridor Creeper: cheaper in every hand for each creature that dies
			for (const pl of state.players) for (const hc of pl.hand) if (hc.cheaperOnDeath && (hc.cost || 0) > 0) hc.cost = Math.max(0, hc.cost - 1);
			// Jumbo Imp: cheaper in the owner's hand when a friendly creature of its tribe dies
			for (const hc of p.hand) if (hc.cheaperOnTribeDeath && (hc.cost || 0) > 0 && (c.tribe || '').includes(hc.cheaperOnTribeDeath)) hc.cost = Math.max(0, hc.cost - 1);
			// Equipment on this creature detaches and stays in play (can be re-equipped)
			for (const pl of state.players) for (const eq of pl.artifacts) if (eq.equip && eq.attachedTo === c.uid) eq.attachedTo = null;
			// every friendly death banks a Corpse for its owner (all classes;
			// only Death Knights get a UI indicator — others track it hidden)
			if (!p.eliminated) {
				p.corpses += p.corpseDouble ? 2 : 1; // Falric doubles the harvest
				emit(state, { type: 'corpses', player: pi, corpses: p.corpses });
			}
			// reborn: the first death returns it at 1 health, reborn spent
			if (has(c, KW.REBORN) && !p.eliminated) {
				c.keywords = c.keywords.filter(k => k !== KW.REBORN);
				c.damage = c.maxHealth - 1;
				c.doomed = false;
				c.frozen = null;
				c.sick = true;
				c.attacksUsed = 0;
				c.auraAttack = 0;
				c.auraHealth = 0;
				c.auraKeywords = [];
				p.board.push(c);
				emit(state, { type: 'reborn', uid: c.uid, player: pi, name: c.name });
				fireOngoing(state, pi, 'minion-reborn', { minion: c }); // Auchenai Death-Speaker
				continue; // no graveyard, no deathrattle
			}
			if (c.marked) drawCards(state, c.markedBy, 2);
			runDeathrattle(state, pi, c);
			// Faceless Replicator: whoever killed it takes its shape. The killer is
			// tracked by uid (identity survives snapshot round-trips); a stale uid
			// simply resolves to nothing, like the old dead-ref guards did.
			if (c.killerTransform && c._lastDamagerUid != null && state.cardsById[c.id]) {
				let k = null;
				for (const pl of state.players) { const hit = pl.board.find(m => m.uid === c._lastDamagerUid); if (hit) { k = hit; break; } }
				const kb = k && !isDead(k) ? state.players[k.controller]?.board : null;
				if (kb && kb.includes(k)) {
					const rep = instantiate(state.cardsById[c.id], k.controller);
					rep.zone = 'board'; rep.sick = k.sick;
					kb[kb.indexOf(k)] = rep; k.zone = 'gone';
					emit(state, { type: 'transformed', uid: k.uid, player: k.controller, from: k.name, card: rep });
				}
			}
			// Starship Piece: a dead piece joins your Starship under construction;
			// the first piece puts a Launch Starship (5) in your hand
			if (c.starshipPiece && !p.eliminated && state.cardsById[c.id]) {
				(p.starshipPieces = p.starshipPieces || []).push(c.id);
				emit(state, { type: 'starshipPiece', player: pi, name: c.name, count: p.starshipPieces.length });
				if (state.cardsById['gdb_launch_starship'] && p.hand.length < MAX_HAND
					&& !p.hand.some(h => h.id === 'gdb_launch_starship')) {
					const ls = instantiate(state.cardsById['gdb_launch_starship'], pi);
					ls.zone = 'hand'; p.hand.push(ls);
					emit(state, { type: 'conjure', player: pi, card: ls, color: null });
				}
			}
			// Oblivion Ring leaves play: the creature it exiled returns (fresh)
			if (c.oringExiled) {
				const oe = c.oringExiled; c.oringExiled = null;
				const ow = state.players[oe.owner];
				const i = ow.exile.findIndex(x => x.uid === oe.uid);
				if (i >= 0) {
					const [ex] = ow.exile.splice(i, 1);
					const back = summon(state, oe.owner, state.cardsById[ex.id] || ex);
					if (back) emit(state, { type: 'returnFromExile', uid: back.uid, player: oe.owner, name: back.name });
				}
			}
			firePlaneTrigger(state, 'creature-died', pi); // Takenuma: the owner draws
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
				for (const hc of state.players[pi].hand) if (hc.handDeathGrowth) { hc.attack += 1; hc.maxHealth += 1; } // Blood Herald: grows while in hand
				{ const p2 = state.players[pi]; for (let hi = 0; hi < p2.hand.length; hi++) { const hc = p2.hand[hi]; if (hc.infuse && !hc._infused) { hc.infuseCounter = (hc.infuseCounter || 0) + 1; if (hc.infuseCounter >= hc.infuse.count && state.cardsById[hc.infuse.id]) { const ni = instantiate(state.cardsById[hc.infuse.id], pi); ni.zone = 'hand'; ni._infused = true; p2.hand[hi] = ni; emit(state, { type: 'infused', player: pi, uid: hc.uid, name: ni.name }); } } } } // Castle Nathria Infuse
			fireSecrets(state, pi, 'friendly-minion-died', { minion: c }); // Redemption
		}
	}
	// deathrattles can kill more
	if (state.players.some(p => p.board.some(isDead))) sweepDeaths(state);
	recomputeAuras(state);
	checkGameOver(state);
}

export function runDeathrattle(state, pi, card) {
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
