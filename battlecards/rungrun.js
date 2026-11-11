// rungrun.js — the run rules the "rung" Lorequest runs share: Middle-earth, the Sword Coast and
// Final Fantasy. Each of those files is DATA (heroes, enemy rungs, classes, colours, hero powers,
// unlock tables) plus whatever is unique to it; the rules below were three copies that differed only
// in the card tag (`meDeck` / `scDeck` / `ffDeck` ...) and the stats key. PURE: no DOM, no game state.
// (The Multiverse is win-parity — its enemies loot as you do — so it keeps its own rules.)

// ── run constants ──
export const WINS_TO_CLEAR = 12;
export const LOSSES_TO_END = 3;

// rungRun({ mode, tag, ...tables }) -> the run's rules.
//   mode  the stats key ('middleearth'): user.stats.modes[mode].runs, user.stats.chars[mode + '|' + hero]
//   tag   the card-field prefix ('me'): a card belongs to a character by `<tag>Deck`, to a side by
//         `<tag>Side`, and is a run-specific treasure by `<tag>Treasure`
//   RUNG_LABELS  { A, B, C, D } -> what the fight banner calls each rung
export function rungRun({ mode, tag, HEROES, SECRET_HEROES, ENEMY_RUNGS, FIRST_ONLY, CLASS_OF, COLOR_IDENTITY, HERO_POWERS, RUNG_LABELS, STARTERS, CORE_UNLOCK_ORDER, ENEMY_UNLOCKS }) {
	const DECK = tag + 'Deck', SIDE = tag + 'Side', TREASURE = tag + 'Treasure';
	const ENEMIES = [...ENEMY_RUNGS.A, ...ENEMY_RUNGS.B, ...ENEMY_RUNGS.C, ...ENEMY_RUNGS.D];

	const classOf = ch => CLASS_OF[ch] || 'neutral';
	const isEnemy = ch => ENEMIES.includes(ch);
	const isHero = ch => HEROES.includes(ch) || SECRET_HEROES.includes(ch);
	const colorsOf = ch => COLOR_IDENTITY[ch] || [];
	const powerOf = ch => HERO_POWERS[ch] || null;

	// a seat def for createGame's classPicks: class id (for buckets), the character's display name,
	// and its UNIQUE hero power (installed by the engine at createGame).
	function seatOf(character) {
		return { id: classOf(character), name: character, power: powerOf(character) };
	}

	// ── decks ──
	// hero deck = 10 singleton cards; enemy deck = 2 copies of each of its 15 cards (= 30).
	function deckOf(cardsById, character) {
		const ids = Object.values(cardsById).filter(d => d[DECK] === character && !d.token).map(d => d.id).sort();
		if (isEnemy(character)) { const deck = []; for (const id of ids) deck.push(id, id); return deck; }
		return ids; // heroes: 1 copy each
	}

	// which enemies the next fight (at the current WIN count) may draw from.
	// Rung windows: A wins 0–2 (★ first-only enemies appear ONLY at win 0), B 3–6, C 7–10, D at win 11
	// (the 12th and final fight). 3 A + 4 B + 4 C + 1 D = 12 fights.
	function enemyRosterFor(wins) {
		const w = Math.max(0, wins | 0);
		if (w <= 2) return w === 0 ? ENEMY_RUNGS.A.slice() : ENEMY_RUNGS.A.filter(e => !FIRST_ONLY.has(e));
		if (w <= 6) return ENEMY_RUNGS.B.slice();
		if (w <= 10) return ENEMY_RUNGS.C.slice();
		return ENEMY_RUNGS.D.slice();
	}
	const rungFor = wins => (wins <= 2 ? 'A' : wins <= 6 ? 'B' : wins <= 10 ? 'C' : 'D');
	const rungLabel = wins => RUNG_LABELS[rungFor(wins)];

	// pick the next enemy from the rung for `wins`, avoiding an immediate repeat.
	// `faced` = every enemy already met this run: one is never offered again while the rung
	// still has someone new (The Balrog at F10 and again at F12 — instinctgauntlet, 2026-10-25).
	function randomEnemy(wins, rng, avoidId, faced) {
		const seen = new Set(Array.isArray(faced) ? faced : []);
		let roster = enemyRosterFor(wins).filter(c => c !== avoidId && !seen.has(c));
		if (!roster.length) roster = enemyRosterFor(wins).filter(c => c !== avoidId);
		if (!roster.length) roster = enemyRosterFor(wins);
		return roster[Math.floor(rng() * roster.length)];
	}

	// build a STATIC enemy (no win-parity loot — the rung runs' departure from Duels).
	function generateEnemy(cardsById, character) {
		return { id: character, name: character, cls: classOf(character), deck: deckOf(cardsById, character), rung: null };
	}

	// ── loot ──
	// every win: (1) a spoils draft (pick 1 of 3 from the vanquished foe's deck, or none), then
	// (2) an alternating aid — a treasure on odd wins, a class bucket on even wins (win 1 = treasure).
	const rewardForWin = wins => (wins % 2 === 1 ? 'treasure' : 'bucket');

	// three distinct spoils cards drawn from the vanquished enemy's own card pool (its 15 uniques).
	function spoilsChoices(cardsById, defeatedEnemyName, rng, count = 3) {
		const pool = Object.values(cardsById).filter(d => d[DECK] === defeatedEnemyName && d[SIDE] === 'enemy' && !d.token).map(d => d.id);
		const out = [];
		for (let i = 0; i < count && pool.length; i++) out.push(pool.splice(Math.floor(rng() * pool.length), 1)[0]);
		return out;
	}

	// the treasure pool for the alternating treasure reward — the DUELS treasures plus any
	// treasures of this run's own (Middle-earth's One Ring is tagged meTreasure).
	function treasurePool(cardsById) {
		return Object.values(cardsById).filter(d => (d.treasure && d.set === 'DUELS') || d.duelsTreasure || d[TREASURE]);
	}

	// ── character progression ──
	// 3 starters; one more core hero unlocks per COMPLETED run (win or lose).
	// Enemies become playable only after every core hero is unlocked, each via a
	// hard feat: consecutive CLEARED runs (12 wins) as the linked hero. Secret
	// heroes keep their own unlock mechanics and join the pool once earned.
	// which characters this account may play; stats = the server user.stats.
	// null (free play, no account) = the full roster.
	function unlockedCharacters(stats) {
		if (!stats) return [...HEROES, ...ENEMIES];
		const runs = stats.modes?.[mode]?.runs || 0;
		const cores = [...STARTERS, ...CORE_UNLOCK_ORDER.slice(0, Math.max(0, runs))];
		const out = [...cores];
		if (cores.length >= HEROES.length) {
			const chars = stats.chars || {};
			for (const [en, [hero, need]] of Object.entries(ENEMY_UNLOCKS)) {
				if ((chars[mode + '|' + hero]?.best || 0) >= need) out.push(en);
			}
		}
		return out;
	}

	return {
		ENEMIES, classOf, isEnemy, isHero, colorsOf, powerOf, seatOf, deckOf, enemyRosterFor, rungFor, rungLabel,
		randomEnemy, generateEnemy, rewardForWin, spoilsChoices, treasurePool, unlockedCharacters,
	};
}
