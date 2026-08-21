// engine/auras.js -- aura recomputation + static passives (docs/05, PR 14).
//
// recomputeAuras / staticValue moved VERBATIM from engine.js. recomputeAuras
// is delta-tracked and idempotent (pinned by trigger_order_test.mjs);
// staticValue sums a static passive across every permanent row.
import { isDead, emit, hp, has, KW, activePlaneRule, heraldMult, hasCoven } from '../engine.js';

export function recomputeAuras(state) {
	// global auras ("ALL other Murlocs...") radiate across every board
	const globalSources = [];
	for (const gp of state.players) {
		for (const src of [...gp.board, ...gp.emblems]) {
			if (src.aura?.global && !(src.zone === 'board' && isDead(src))) globalSources.push(src); // emblems have no health — don't death-check them
		}
	}
	for (const p of state.players) {
		const sources = [...p.board, ...p.enchantments, ...p.emblems, ...p.artifacts]
			.filter(c => c.aura && !c.aura.global && !(c.zone === 'board' && isDead(c)));
		const covenActive = hasCoven(p); // 3+ distinct Attack values among your creatures (on/off)
		p.board.forEach((c, idx) => {
			if (c.type === 'location') return; // auras don't touch locations
			if (c.dormantLeft > 0) return;     // nor dormant sleepers
			let aBonus = 0, hBonus = 0;
			const granted = new Set();
			for (const src of [...sources, ...globalSources]) {
				const a = src.aura;
				// Celestial Aura: while its controller has EXACTLY ONE minion, that
				// minion's Attack and Health become N (a set, not a bonus — the delta
				// can be negative and lapses the moment a second minion arrives)
				if (a.soloSet != null) {
					const alive = state.players[src.controller].board.filter(x => x.type === 'creature' && !isDead(x));
					if (alive.length !== 1 || alive[0] !== c) continue;
					aBonus += a.soloSet - (c.attack - c.auraAttack);
					hBonus += a.soloSet - (c.maxHealth - c.auraHealth);
					continue;
				}
				if (a.others && src === c) continue;
				if (a.scope === 'enemies' && src.controller === c.controller) continue; // Band of Scarabs
				if (a.scope === 'friendly' && src.controller !== c.controller) continue;
				if (a.maxCost != null && (c.cost || 0) > a.maxCost) continue; // Band of Bees: cheap creatures only
				if (a.divineShield && !c.shield) continue; // Funkfin: only creatures that currently HAVE Divine Shield (drops when it pops)
				if (a.hasWindfury && !(c.keywords || []).includes('windfury')) continue; // Whirlwind Tempest: only your Windfury creatures
				if (a.notName && c.name === a.notName) continue; // Red Herring: your NON-Red Herring creatures
				if (a.whileOverloaded && !((state.players[src.controller].overloadLockedThisTurn || 0) > 0)) continue; // Vessina: only while you're Overloaded
				if (a.adjacent) {
					const si = p.board.indexOf(src);
					if (si < 0 || Math.abs(si - idx) !== 1) continue;
				}
				if (a.position === 'ends' && idx !== 0 && idx !== p.board.length - 1) continue;
				if (a.tribe && !a.tribe.split('|').some(t => (c.tribe || '').includes(t))) continue;
				if (a.cardClass && (c.cardClass || 'neutral') !== a.cardClass) continue; // Meek Mastery: Neutral creatures only
				if (a.name && c.name !== a.name) continue; // Warhorse Trainer's Recruits
				if (a.targetUid != null && a.targetUid !== c.uid) continue; // Rowdy Fan: only the chosen minion
				// Herald-scaled aura (Charged Hand of Al'Akir): +Attack grows with Heralds
				aBonus += a.heraldScaled ? heraldMult(state.players[src.controller].heraldCount || 0) : (a.attack || 0);
				hBonus += a.health || 0;
				for (const k of a.keywords || []) granted.add(k);
					// Argus, the Emerald Star: directional aura — minions to the source's
					// left get one keyword set, ones to its right get another.
					if (a.leftKeywords || a.rightKeywords) {
						const si = p.board.indexOf(src);
						if (si >= 0) { if (idx < si) for (const k of a.leftKeywords || []) granted.add(k); else if (idx > si) for (const k of a.rightKeywords || []) granted.add(k); }
					}
			}
			// Equipment attached to this creature contributes its bonuses. It's its
			// own permanent — it survives the creature (detaches) and can be moved,
			// so its buff is applied here (recomputed), never baked into base stats.
			for (const eq of p.artifacts) {
				if (eq.equip && eq.attachedTo === c.uid) {
					aBonus += eq.equip.attack || 0;
					hBonus += eq.equip.health || 0;
					for (const k of eq.equip.keywords || []) granted.add(k);
				}
			}
			// Enrage: a self-aura that only applies while the creature is damaged
			if (c.enrage && c.damage > 0 && !isDead(c)) {
				aBonus += c.enrage.attack || 0;
				hBonus += c.enrage.health || 0;
				for (const k of c.enrage.keywords || []) granted.add(k);
			}
			// "+N Attack during your opponent's turn"
			if (c.offTurnAttack && state.current !== c.controller) {
				aBonus += c.offTurnAttack;
			}
			// Duke of Below: +2/+2 for each card discarded this game (live)
			if (c.discardScale) {
				const nDisc = (p.discardLogIds || []).length;
				aBonus += 2 * nDisc; hBonus += 2 * nDisc;
			}
			// Old Murk-Eye: +N Attack per other <tribe> anywhere in play
			if (c.selfScale) {
				let n = 0;
				for (const gp of state.players) {
					n += gp.board.filter(x => x !== c && !isDead(x) && x.type !== 'location'
						&& (!c.selfScale.tribe || (x.tribe || '').includes(c.selfScale.tribe))).length;
				}
				aBonus += (c.selfScale.attack || 0) * n;
			}
			// keyword held only while a condition stands: Southsea Deckhand ('weapon'),
			// Abzan Runemark ('coven' — 3+ distinct Attack values among your creatures)
			if (c.condKeyword) {
				const w = c.condKeyword.while;
				const met = w === 'weapon' ? !!p.weapon : w === 'coven' ? covenActive : true;
				if (met) granted.add(c.condKeyword.keyword);
			}
			// "+N Attack while you have a weapon equipped"
			if (c.condAttack && (c.condAttack.while !== 'weapon' || p.weapon)) {
				aBonus += c.condAttack.attack || 0;
			}
			// active plane's continuous creature aura (Krosa +2/+2, Hippogyia -5/-0,
			// Sokenzan +1/+1 & Rush): applies to every creature in play
			const planeAura = activePlaneRule(state);
			if (planeAura && planeAura.kind === 'aura') {
				aBonus += planeAura.attack || 0;
				hBonus += planeAura.health || 0;
				for (const k of planeAura.keywords || []) granted.add(k);
			}
			const dA = aBonus - c.auraAttack, dH = hBonus - c.auraHealth;
			if (dA || dH) {
				c.attack = Math.max(0, c.attack + dA);
				c.maxHealth += dH;
				c.auraAttack = aBonus;
				c.auraHealth = hBonus;
				if (dH < 0 && c.damage >= c.maxHealth) c.damage = Math.max(0, c.maxHealth - 1);
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
			// keyword grants: retract tracked grants that lapsed, add new ones
			// (never touching keywords the creature owns natively)
			for (const k of [...c.auraKeywords]) {
				if (!granted.has(k)) {
					c.auraKeywords = c.auraKeywords.filter(x => x !== k);
					c.keywords = c.keywords.filter(x => x !== k);
					if (k === KW.STEALTH && !c.keywords.includes(KW.STEALTH)) c.stealthed = false; // Obsessive Fan: stealth lapses with its aura
				}
			}
			for (const k of granted) {
				if (c.keywords.includes(k)) continue;
				c.keywords.push(k);
				c.auraKeywords.push(k);
				// Cloak of Invisibility: aura-granted stealth also hides the body
				if (k === KW.STEALTH) c.stealthed = true;
			}
			// Lightspawn: attack tracks current health after everything else
			if (c.statRule === 'attack-equals-health' && c.attack !== hp(c)) {
				c.attack = hp(c);
				emit(state, { type: 'buff', uid: c.uid, attack: c.attack, hp: hp(c) });
			}
		});
	}
}

// sum of a static passive across a player's permanent rows
export function staticValue(p, type) {
	let v = 0;
	for (const card of [...p.enchantments, ...p.artifacts, ...p.emblems, ...p.board, ...(p.weapon ? [p.weapon] : [])]) {
		if (card.static?.type === type) v += card.static.value || 1;
		if (card.statics) for (const s of card.statics) if (s.type === type) v += s.value || 1; // Xixira: multiple statics on one card
		// an equipment grants its spell-damage (etc.) only while attached to a creature
		if (type === 'spell-damage' && card.equip?.spellDamage && card.attachedTo) v += card.equip.spellDamage;
	}
	return v;
}
