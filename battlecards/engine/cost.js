// engine/cost.js -- the cost calculator (docs/engine-hardening/05, PR 8).
//
// effectiveCost / heroPowerCost moved VERBATIM from engine.js (move-only
// extraction; behavior changes are out of scope for this PR). discountIndex
// moves too because playCard's payment step uses it to consume the one-shot
// discount that effectiveCost applied -- the pair must stay in lockstep.
//
// Pure calculators: no state mutation. Shared helpers stay in engine.js and
// are imported back (an intentional module cycle: engine.js <-> cost.js. Safe
// because both sides only reference the other's bindings at call time, long
// after both modules have evaluated; the facade plan in docs/05 dissolves the
// cycle when engine.js becomes a pure re-export shim).
import {
	isDead, staticValue, activePlaneRule, isSpellType, schoolOf, kindredActive,
	STARTING_LIFE, MAX_HAND,
} from '../engine.js';

const costTypeMatches = (card, t) => t === 'all'
	|| (t === 'spell' ? isSpellType(card)
		: t === 'noncreature' ? (card.type !== 'creature' && card.type !== 'land') // Thalia
		: card.type === t);

// a live one-shot discount usable on this card right now, or -1
export function discountIndex(state, p, card) {
	return (p.costDiscounts || []).findIndex(d =>
		(!d.thisTurn || d.turn === state.turnNumber)
		&& costTypeMatches(card, d.cardType)
		&& (!d.tribe || (card.tribe || '').includes(d.tribe))
		&& (!d.keyword || (card.keywords || []).includes(d.keyword))); // Parrot Sanctuary: next Battlecry minion
}

export function effectiveCost(state, pi, card) {
	const p = state.players[pi];
	let c = card.cost;
	if (card.selfCost) {
		let n = 0;
		if (card.selfCost.per === 'other-creatures') {
			for (const pl of state.players) n += pl.board.filter(x => !isDead(x) && x !== card).length;
		} else if (card.selfCost.per === 'hand-others') {
			n = Math.max(0, p.hand.length - (p.hand.includes(card) ? 1 : 0));
		} else if (card.selfCost.per === 'own-damage') {
			n = Math.max(0, STARTING_LIFE - p.life);
		} else if (card.selfCost.per === 'weapon-attack') {
			n = p.weapon ? p.weapon.attack : 0;
		} else if (card.selfCost.per === 'deaths-this-turn') {
			n = state.diedThisTurn || 0;
		} else if (card.selfCost.per === 'spells-this-game') {
			n = p.spellsPlayedTotal || 0;
		} else if (card.selfCost.per === 'si7-played') {
			n = p.si7PlayedGame || 0; // SI:7 Assassin
		} else if (card.selfCost.per === 'board-power') {
			n = p.board.reduce((s, x) => isDead(x) ? s : s + (x.attack || 0), 0); // Ghalta
		} else if (card.selfCost.per === 'hero-powers-game') {
			n = p.heroPowersUsedGame || 0; // Frost Giant
		} else if (card.selfCost.per === 'artifacts') {
			n = p.artifacts.length; // Affinity for artifacts (Treasures/Clues/Food count)
		} else if (card.selfCost.per === 'deck-size') {
			n = p.deck.length; // Fanottem: Cost equals the cards in your deck
		} else if (card.selfCost.per === 'one-cost-played') {
			n = p.oneCostPlayedGame || 0; // Thirsty Drifter: cheaper per 1-Cost card played
		} else if (card.selfCost.per === 'minions-died-game') {
			n = state.minionsDiedGame || 0; // Reska, the Pit Boss
		} else if (card.selfCost.per === 'cards-played') {
			n = p.cardsPlayedThisTurn || 0; // Everburning Phoenix: cheaper per card played this turn
		} else if (card.selfCost.per === 'last-card-cost') {
			n = p.lastCardCost || 0; // Gronn Giant: reduced by the Cost of the last card you played
		} else if (card.selfCost.per === 'armor') {
			n = p.armor || 0; // Crypt Keeper
		} else if (card.selfCost.per === 'secrets-controlled') {
			n = (p.secrets || []).length; // Contract Conjurer
		} else if (card.selfCost.per === 'frozen-enemies') {
			for (let s = 0; s < state.players.length; s++) if (s !== pi) n += state.players[s].board.filter(x => !isDead(x) && x.frozen).length; // Floecaster
		} else if (card.selfCost.per === 'tribe-controlled') {
			n = p.board.filter(x => !isDead(x) && x.type === 'creature' && (x.tribe || '').includes(card.selfCost.tribe)).length; // Curious Outsider / Skycap'n Kragg
		} else if (card.selfCost.per === 'enemy-creatures') {
			for (let s = 0; s < state.players.length; s++) if (s !== pi) n += state.players[s].board.filter(x => !isDead(x) && x.type === 'creature').length; // Eredar Brute / Rabble Bouncer
		} else if (card.selfCost.per === 'damaged-creatures') {
			for (const pl of state.players) n += pl.board.filter(x => !isDead(x) && x.type === 'creature' && x.damage > 0).length; // Bloodboil Brute
		} else if (card.selfCost.per === 'enemy-hand-size') {
			for (let s = 0; s < state.players.length; s++) if (s !== pi) n += state.players[s].hand.length; // Clockwork Giant
		} else if (card.selfCost.per === 'all-creatures') {
			for (const pl of state.players) n += pl.board.filter(x => !isDead(x) && x.type === 'creature').length; // Mogu Fleshshaper
		} else if (card.selfCost.per === 'tribe-in-graveyard') {
			n = (p.graveyard || []).filter(x => ((state.cardsById[x.id] || x).tribe || '').includes(card.selfCost.tribe)).length; // Fye, the Setting Sun
		} else if (card.selfCost.per === 'unique-tribes') {
			const counts = {}; for (const x of p.board) if (!isDead(x) && x.type === 'creature') for (const t of (x.tribe || '').split('/').filter(Boolean)) counts[t] = (counts[t] || 0) + 1;
			n = p.board.filter(x => !isDead(x) && x.type === 'creature' && (x.tribe || '').split('/').filter(Boolean).some(t => counts[t] === 1)).length; // Tent Trasher: friendly minions with a unique type
		} else if (card.selfCost.per === 'friendly-deaths-game') {
			n = p.friendlyDeaths || 0; // Ur'zul Giant
		} else if (card.selfCost.per === 'damage-opp-turn') {
			n = p.damageToEnemyHeroThisTurn || 0; // Frenzied Felwing
		} else if (card.selfCost.per === 'spells-while-held') {
			n = card.spellsCastWhileHeld || 0; // Mantle Shaper
		} else if (card.selfCost.per === 'totems-summoned-game') {
			n = p.totemsSummonedGame || 0; // Thing from Below / Gigantotem
		} else if (card.selfCost.per === 'overloaded-game') {
			n = p.overloadedGame || 0; // Snowfury Giant / Haywire Hornswog
		} else if (card.selfCost.per === 'corpses-spent-game') {
			n = p.corpsesSpentGame || 0; // Stitched Giant
		} else if (card.selfCost.per === 'cards-drawn-game') {
			n = p.cardsDrawnGame || 0; // Playhouse Giant
		} else if (card.selfCost.per === 'cards-drawn-turn') {
			n = p.cardsDrawnThisTurn || 0; // Irebound Brute
		} else if (card.selfCost.per === 'tribe-summoned-game') {
			n = (p.tribeSummonedGame || {})[card.selfCost.tribe] || 0; // Knight of the Wild / Frostsaber Matriarch
		} else if (card.selfCost.per === 'mana-spent-spells-game') {
			n = p.manaSpentSpellsGame || 0; // Naga Giant / Shirvallah, the Tiger
		} else if (card.selfCost.per === 'own-turns-damage-game') {
			n = p.ownTurnsDamage || 0; // Imprisoned Horror
		} else if (card.selfCost.per === 'foreign-played-game') {
			n = p.foreignPlayedGame || 0; // Techysaurus / Mana Giant
		} else if (card.selfCost.per === 'class-played-game') {
			n = (p.classPlayedGame || {})[card.selfCost.cardClass] || 0; // Lightray
		} else if (card.selfCost.per === 'outcast-played-game') {
			n = p.outcastPlayedGame || 0; // Vengeful Walloper
		} else if (card.selfCost.per === 'secrets-played-game') {
			n = p.secretsPlayedGame || 0; // Kabal Crystal Runner
		} else if (card.selfCost.per === 'coins-in-hand') {
			n = p.hand.filter(x => x.id === 'coin').length; // Blackpaw's Whip
		} else if (card.selfCost.per === 'secrets-triggered-game') {
			n = p.secretsTriggeredGame || 0; // Starstrung Bow
		} else if (card.selfCost.per === 'tribe-died-game') {
			n = (p.tribeDiedGame || {})[card.selfCost.tribe] || 0; // Mulchmuncher
		} else if (card.selfCost.per === 'spells-on-friendly-game') {
			n = (p.spellsOnFriendly || []).length; // Devout Pupil
		} else if (card.selfCost.per === 'own-turn-damage-instances') {
			n = p.heroDmgInstancesOwnTurn || 0; // Sauna Regular
		} else if (card.selfCost.per === 'opp-life-loss-instances') {
			n = p.oppLifeLossInstancesThisTurn || 0; // Devious Coyote
		} else if (card.selfCost.per === 'elemental-turn-streak') {
			n = p.elementalTurnStreak || 0; // Azerite Giant
		} else if (card.selfCost.per === 'locations-used-game') {
			n = p.locationsUsedGame || 0; // Seaside Giant
		} else if (card.selfCost.per === 'coins-in-graveyard') {
			n = (p.graveyard || []).filter(x => /\bcoin\b/i.test(((state.cardsById[x.id] || x).name) || '')).length; // Paid-Off Patrolman
		} else if (card.selfCost.per === 'plagues-into-enemy-game') {
			n = p.plaguesIntoEnemyGame || 0; // Chained Guardian
		} else if (card.selfCost.per === 'weapons-equipped-game') {
			n = p.weaponsEquippedGame || 0; // Abyssal Bassist
		} else if (card.selfCost.per === 'shuffles-into-deck-game') {
			n = p.shufflesIntoDeckGame || 0; // Underbrush Tracker
		} else if (card.selfCost.per === 'adjacent-played-held') {
			n = card.adjacentPlayedWhileHeld || 0; // Red Giant
		}
		c += card.selfCost.amount * n;
	}
	// conditional self-cost: "Costs (N) [less] if/while <condition>"
	if (card.selfCostIf) {
		const s = card.selfCostIf;
		const anyCreature = () => state.players.some(pl => pl.board.some(x => !isDead(x) && x.type === 'creature'));
		const enemyCreatures = () => { let k = 0; for (let i = 0; i < state.players.length; i++) if (i !== pi) k += state.players[i].board.filter(x => !isDead(x) && x.type === 'creature').length; return k; };
		const heroAtk = (p.weapon ? p.weapon.attack : 0) + (p.heroTempAttack || 0);
		let met;
		switch (s.cond) {
			case 'hero-attack-ge': met = heroAtk >= s.threshold; break;
			case 'big-spell-turn': met = !!p.castBigSpellThisTurn; break;
			case 'life-le': met = p.life <= s.threshold; break;
			case 'deck-le': met = p.deck.length <= s.threshold; break;
			case 'enemy-creatures-ge': met = enemyCreatures() >= s.threshold; break;
			case 'healed-this-turn': met = !!p.healedThisTurn; break;
			case 'holding-tribe': met = p.hand.some(x => x !== card && (x.tribe || '').includes(s.tribe)); break;
			case 'no-creatures': met = !anyCreature(); break;
			case 'hand-full': met = p.hand.length >= MAX_HAND; break;
			case 'dormant-creature': met = state.players.some(pl => pl.board.some(x => !isDead(x) && x.dormantLeft > 0)); break;
			case 'frozen-character': met = state.players.some(pl => pl.board.some(x => !isDead(x) && x.frozen)); break;
			case 'mana-ge': met = (p.mana?.max || 0) >= s.threshold; break;
			case 'schools-turn': met = (s.schools || []).every(sch => (p.schoolsCastThisTurn || {})[sch]); break;
			default: met = false;
		}
		if (met) { if (s.setCost != null) c = s.setCost; else if (s.amount != null) c += s.amount; }
	}
	for (const pl of state.players) {
		for (const src of [...pl.board, ...pl.enchantments, ...pl.artifacts, ...pl.emblems]) {
			const m = src.costMod;
			if (!m || (src.zone === 'board' && isDead(src))) continue;
			if (m.scope === 'enemies' ? pl === p : (m.scope !== 'all' && pl !== p)) continue;
			if (!costTypeMatches(card, m.cardType)) continue;
			if (m.tribe && !(card.tribe || '').includes(m.tribe)) continue;
			if (m.keyword && !(card.keywords || []).includes(m.keyword)) continue; // Nerub'ar Weblord: Battlecry creatures cost more
			if (m.foreignOnly && card.fromDeck) continue; // Customs Enforcer: cards that didn't start in their deck
			if (m.keywordAny || m.schoolAny) { const kwOk = (m.keywordAny || []).some(k => (card.keywords || []).includes(k)); const schOk = (m.schoolAny || []).some(s => schoolOf(card) === s); if (!kwOk && !schOk) continue; } // Eldraine Sprite: Adventure OR Nature spells
			if (m.minCost != null && card.cost < m.minCost) continue;
			// "the first <X> you play each turn": skip once a card matching this aura's
			// filter (type + tribe + keyword) has already been played this turn.
			if (m.firstEachTurn) {
				const already = (p.cardsPlayedThisTurnIds || []).some(id => { const d = state.cardsById[id]; return d && costTypeMatches(d, m.cardType) && (!m.tribe || (d.tribe || '').includes(m.tribe)) && (!m.keyword || (d.keywords || []).includes(m.keyword)); });
				if (already) continue;
			}
			// "every Nth <X> you play each turn": only the Nth (3rd, 6th, ...) is affected
			if (m.everyN) {
				const matched = (p.cardsPlayedThisTurnIds || []).filter(id => { const d = state.cardsById[id]; return d && costTypeMatches(d, m.cardType) && (!m.tribe || (d.tribe || '').includes(m.tribe)) && (!m.keyword || (d.keywords || []).includes(m.keyword)); }).length;
				if ((matched + 1) % m.everyN !== 0) continue; // Kael'thas: only the 3rd cast is cheap
			}
			if (m.setCost != null) { c = m.setCost; continue; } // Naga Sea Witch: your cards cost N
			const before = c;
			c += m.amount;
			// "but not less than (1)": the reduction stops at the floor
			if (m.floor != null) c = Math.max(Math.min(before, m.floor), c);
		}
	}
	const di = discountIndex(state, p, card);
	if (di >= 0) {
		const d = p.costDiscounts[di];
		c = d.setZero ? 0 : c + d.amount;
	}
	// arena plane cost rule: Zendikar (enchant -1), Alkabah (4-cost spells -> 0)
	const planeR = activePlaneRule(state);
	if (planeR && planeR.kind === 'cost' && costTypeMatches(card, planeR.cardType)
		&& (planeR.cost == null || card.cost === planeR.cost)) {
		c = planeR.setZero ? 0 : c + (planeR.amount || 0);
	}
	if (p.freeSpellsThisTurn && isSpellType(card)) c = 0;
	if (p.spellsCostOneThisTurn && isSpellType(card)) c = Math.min(c, 1); // Ysiel Windsinger
	if (p.nextMurlocFree && card.type === 'creature' && (card.tribe || '').includes('Murloc')) c = 0; // Seadevil Stinger (Health-cost approximated as free)
	if (p.nextSecretCost != null && card.secret) c = Math.min(c, p.nextSecretCost); // Kabal Lackey
	// Reckless Experimenter: your Deathrattle creatures cost less
	if (card.type === 'creature' && (card.keywords || []).includes('deathrattle')) {
		const disc = p.board.reduce((s, x) => (!isDead(x) && x.deathrattleDiscount) ? s + x.deathrattleDiscount : s, 0);
		if (disc) c = Math.max(0, c - disc);
		if (p.nextDeathrattleDiscount > 0) c = Math.max(0, c - p.nextDeathrattleDiscount); // Carrion Studies: your next Deathrattle minion costs less
	}
	if (p.spellTaxNext > 0 && isSpellType(card)) c += p.spellTaxNext; // Loatheb
	if (p.nextComboDiscount > 0 && card.combo) c = Math.max(0, c - p.nextComboDiscount); // Foxy Fraud
	if (p.nextCardsDiscount && p.nextCardsDiscount.count > 0) c = Math.max(0, c - p.nextCardsDiscount.amount); // Scabbs Cutterbutter
	if (p.nextChooseOneDiscount > 0 && card.choices) c = Math.max(0, c - p.nextChooseOneDiscount); // Pride Seeker
	if (p.nextSpellDiscount > 0 && isSpellType(card)) c = Math.max(0, c - p.nextSpellDiscount); // Murkwater Scribe
	if (p.nextSchoolDiscount && isSpellType(card) && schoolOf(card) === p.nextSchoolDiscount.school) c = Math.max(0, c - p.nextSchoolDiscount.amount); // Holy Cowboy: your next Holy spell costs less
	if (p.nextTribeDiscount && p.nextTribeDiscount.count > 0 && card.type === 'creature' && (card.tribe || '').includes(p.nextTribeDiscount.tribe)) c = Math.max(0, c - p.nextTribeDiscount.amount); // Clownfish
	if ((card.keywords || []).includes('outcast')) { const r = p.board.filter(x => x.outcastCostReduce && !isDead(x)).reduce((s, x) => s + x.outcastCostReduce, 0); if (r) c = Math.max(0, c - r); if (p.nextOutcastDiscount > 0) c = Math.max(0, c - p.nextOutcastDiscount); } // Line Hopper / Fierce Outsider
	if ((card.keywords || []).includes('quickdraw')) { const r = p.board.filter(x => x.quickdrawCostReduce && !isDead(x)).reduce((s, x) => s + x.quickdrawCostReduce, 0); if (r) c = Math.max(0, c - r); } // Captain Eberhart: your Quickdraw cards cost 1 less
	if (!card.fromDeck) { const r = p.board.filter(x => x.foreignCostReduce && !isDead(x)).reduce((s, x) => s + x.foreignCostReduce, 0); if (r) c = Math.max(1, c - r); } // Arcane Luminary: not below 1
	{ const sch = schoolOf(card); if (sch) { const r = p.board.filter(x => x.schoolCostReduce && x.schoolCostReduce.school === sch && !isDead(x)).reduce((s, x) => s + x.schoolCostReduce.amount, 0); if (r) c = Math.max(0, c - r); } } // Lady Anacondra: Nature spells
	if (p.battlecryTaxNext > 0 && (card.keywords || []).includes('battlecry')) c += p.battlecryTaxNext; // Boompistol Bully
	if (p.libramDiscount > 0 && /Libram/.test(card.name || '')) c = Math.max(0, c - p.libramDiscount); // Aldor Attendant/Truthseeker
	if (card.id === 'the_ceaseless_expanse') c = Math.max(0, c - (state.expanseEvents || 0)); // costs (1) less per card drawn/played/destroyed this game
	if (p.nextWeaponDiscount > 0 && card.type === 'weapon') c = Math.max(0, c - p.nextWeaponDiscount); // Space Pirate
	if (card.kindredCostReduce > 0 && kindredActive(state, pi, card)) c = Math.max(0, c - card.kindredCostReduce); // Pterrorwing / Windpeak: cheaper while a type-mate is in play
	if (card.id === 'gdb_launch_starship' && p.nextLaunchDiscount > 0) c = Math.max(0, c - p.nextLaunchDiscount); // SCV: your next launch costs less
	if (isSpellType(card) && (p.spellsPlayedThisTurn || 0) === 0) c = Math.max(0, c - staticValue(p, 'first-spell-discount')); // Sha'tari Cloakfield
	if (card.costZeroIfBoardId && p.board.some(b => b.id === card.costZeroIfBoardId && !isDead(b))) return 0; // Medivh / Atiesh
	if (card.costZeroIfWeaponId && p.weapon && p.weapon.id === card.costZeroIfWeaponId) return 0; // Karazhan
	// Azure Queen Sindragosa: a board minion discounts spells of a school while a type-mate stands
	if (isSpellType(card)) for (const m of p.board) {
		const sd = m.spellSchoolDiscount;
		if (sd && !isDead(m) && schoolOf(state.cardsById[card.id] || card) === sd.school
			&& (!sd.requireOtherTribe || p.board.some(o => o !== m && !isDead(o) && (o.tribe || '').includes(sd.requireOtherTribe)))) {
			c = Math.max(0, c - (sd.value || 0));
		}
	}
	if (card.costReducePerPlayedName) { // Giant Rafaam: (1) less per Rafaam played this game
		const n = Object.entries(p.playedCountById || {}).reduce((s, [id, k]) =>
			s + (((state.cardsById[id]?.name) || '').includes(card.costReducePerPlayedName.substr) ? k : 0), 0);
		c = Math.max(0, c - (card.costReducePerPlayedName.value || 1) * n);
	}
	if (p.nextNameDiscount && (card.name || '').includes(p.nextNameDiscount.substr)) c = Math.max(0, c - p.nextNameDiscount.value); // Murloc Rafaam
	if (p.mugMagic && card.type === 'creature' && (p.creaturesPlayedThisTurn || 0) === 0) c = Math.max(0, c - 2); // Mug's Magic: first minion each turn
	if (card.temporary && p.nextTempDiscount > 0) c = Math.max(0, c - p.nextTempDiscount); // Spelunker
	if (p.leylineDiscount > 0 && (card.name || '').includes('Leyline')) c = Math.max(0, c - p.leylineDiscount); // Ley Walker
	{ const shi = p.hand.indexOf(card); if (shi >= 0 && ((p.hand[shi - 1] && p.hand[shi - 1].id === 'sabotage_dud') || (p.hand[shi + 1] && p.hand[shi + 1].id === 'sabotage_dud'))) c += 1; } // Stickybomb Saboteur
	if (p.foreignDemonDiscount > 0 && (card.tribe || '').includes('Demon') && p.startingDeckIds && !p.startingDeckIds.includes(card.id)) c = Math.max(0, c - p.foreignDemonDiscount); // Foreboding Flame
	if (p.minionCostSet != null && card.type === 'creature') c = p.minionCostSet; // Loh the Living Legend
	if (p.allCardsCostOne) c = 1; // Aviana's Full Moon
	if (card.type === 'creature' && (card.keywords || []).includes('battlecry') && p.board.some(m => m.murmurAura && !isDead(m))) c = 1; // Murmur
	if (p.enduranceTraining && card.type === 'creature' && (card.keywords || []).includes('taunt')) c = Math.max(1, c - 2); // Endurance Training (Duels): Taunt creatures cost (2) less
	if (p.allTogetherNow && (card.keywords || []).includes('battlecry')) c = Math.max(2, c - 1); // All Together Now (Duels): Battlecry cards cost (1) less
	if (p.greedyGains && card.type === 'creature') c = Math.min(10, c + 2); // Greedy Gains (Duels): creatures cost (2) more
	if (p.meekMastery && card.type === 'creature' && (card.cardClass || 'neutral') === 'neutral') c = Math.max(2, c - 1); // Meek Mastery (Duels): Neutral creatures cost (1) less
	if (p.dragonAffinity && card.type === 'creature' && (card.tribe || '').includes('Dragon') && (p.creaturesPlayedThisTurn || 0) === 0) c = Math.max(0, c - 1); // Dragon Affinity (Duels): first Dragon each turn costs (1) less
	if (p.stickyFingers && p.startingDeckIds && !p.startingDeckIds.includes(card.id) && (card.cost || 0) > 0) c = Math.max(1, c - 1); // Sticky Fingers (Duels): cards that didn't start in your deck cost (1) less
	if (p.oopsAllSpells && isSpellType(card)) c = Math.max(0, c - 1); // Oops, All Spells! (Duels): your spells cost (1) less
	if (p.sunstridersCrown && isSpellType(card) && (((p.spellsPlayedThisTurn || 0) + 1) % 3 === 0)) c = 1; // Sunstrider's Crown (Duels): every third spell each turn costs (1)
	if (p.ringOfHaste && card.type === 'creature' && (((p.creaturesPlayedThisTurn || 0) + 1) % 3 === 0)) c = 1; // Ring of Haste (Duels): every third creature each turn costs (1)
	if (p.grommash && card.type === 'weapon') c = Math.max(0, c - 1); // Grommash's Armguards (Duels): your weapons cost (1) less
	if (p.plaguebringer && isSpellType(card)) c = Math.max(1, c - 2); // Plaguebringer (Duels): your spells cost (2) less
	if (p.leftmostDiscount && p.hand.length && p.hand[0] === card) c = Math.max(0, c - p.leftmostDiscount); // Emerald Goggles: the left-most hand card
	if (p.robesHalf) c = Math.ceil(c / 2); // Robes of Gaudiness: cards cost half
	if (p.spellsCostHealth && isSpellType(card)) return 0; // Elixir of Vile: paid in Health at play time
	if (card.altCost && (card.altCost.forced || (card.altCost.forcedIf === 'healed-this-turn' && p.healedThisTurn))) return 0; // Blood Treant / Reanimated Pterrordax / Death Metal Knight: Costs Health/Corpses instead of Mana
	if (p.agamagganNext) return 0; // Agamaggan: the opponent pays in Health
	if (p.warlocNext && (card.tribe || '').includes('Murloc') && (card.cost || 0) <= 3) return 0; // Warloc: paid in your Health
	if (p.nextCardCorpses && (p.corpses || 0) >= c) return 0; // Exarch Maladaar: the next card costs Corpses instead
	if (card.type === 'creature' && p.enemyMinionTaxTurn === state.turnNumber && p.enemyMinionTaxAmount) c += p.enemyMinionTaxAmount; // Forensic Duster
	if (p.enemyCardTaxTurn === state.turnNumber && p.enemyCardTaxAmount) c += p.enemyCardTaxAmount; // Norgannon (Ancient Knowledge): ALL enemy cards cost more next turn
	if (p.overloadDiscount > 0 && (card.overload || 0) > 0) c = Math.max(0, c - p.overloadDiscount); // Inzah
	if (p.firstCardFreeEachTurn && (p.cardsPlayedThisTurn || 0) === 0) c = 0; // Bonelord Frostwhisper: first card each turn is free
	if (isSpellType(card) && (p.spellsPlayedThisTurn || 0) === 0 && p.board.some(cc => cc.firstSpellDiscountAura && !isDead(cc))) c = Math.max(0, c - 3); // Golganneth, the Thunderer: your first spell each turn costs (3) less
	if (p.nextClassFree && card.type === 'creature' && (card.cardClass || '').split('__').includes(p.nextClassFree)) c = 0; // Blood Crusader (Health-cost approximated as free)
	if (p.parityDiscount && (card.cost % 2) === (p.parityDiscount.parity === 'odd' ? 1 : 0)) c = Math.max(0, c - p.parityDiscount.amount); // Thaddius: odd/even-Cost cards cost less
	if (p.freeMinionsCount > 0 && card.type === 'creature') c = 0; // Anub'Rekhan (Armor-cost approximated as free)
	{ let floor = 0; for (const src of p.board) if (src.static?.type === 'cost-floor' && !isDead(src)) floor = Math.max(floor, src.static.value || 2); if (floor && !p.freeMinionsCount && !(p.firstCardFreeEachTurn && (p.cardsPlayedThisTurn || 0) === 0)) c = Math.max(c, floor); } // Razorscale: cards can't cost less than N
	return Math.max(0, c);
}

export function heroPowerCost(state, pi, card) {
	const p = state.players[pi];
	if (p.heroPowerFreeGame) return 0; // Raza the Chained
	let c = card.power.cost;
	const set = p.board.filter(x => x.heroPowerCostSet != null && !isDead(x)).map(x => x.heroPowerCostSet);
	if (set.length) c = Math.min(c, ...set); // Maiden of the Lake
	c += (p.heroPowerTaxNext || 0) - (p.heroPowerDiscountNext || 0);
	c -= p.board.filter(x => x.heroPowerCostReduce && !isDead(x)).reduce((s, x) => s + x.heroPowerCostReduce, 0); // Felfire Deadeye
	if (p.board.some(x => x.hpFreeHandMax != null && !isDead(x) && p.hand.length <= x.hpFreeHandMax)) return 0; // Quel'dorei Fletcher
	if (p.stargazing) c -= 1; // Stargazing: Hero Power costs (1) less
	return Math.max(0, c);
}
