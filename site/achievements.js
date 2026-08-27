// site/achievements.js — the ONE achievements list + metric builder, shared by
// the profile page (full view) and the in-game unlock toasts. Before this,
// achievements were computed only when the player happened to visit /profile/ —
// there was no unlock moment anywhere in the games.
//
//   import { metrics, ACH, checkToasts, markAllSeen } from '/site/achievements.js';
//   checkToasts(state)   — call after any server state refresh (run reward,
//                          duel win, pack open); toasts newly-crossed tiers.

// every metric ACH() reads, computed from a server `state` (publicState shape).
// poolSize (the collectible pool count) is optional — the completion tiles
// only exist when it's known (the profile fetches it; toasts skip it).
export function metrics(s, { poolSize = 0 } = {}) {
	const col = s.collection || {};
	const distinct = Object.values(col).filter(n => n > 0).length;
	const st = s.stats || {};
	const md = st.modes || {}; // per-mode run/win counters
	const mode = k => md[k] || { runs: 0, wins: 0 };
	// overworld (Pokemon RPG) progression, synced from the game -> account
	const ow = st.overworld || {};
	const owB = ow.badges || {}, owC = ow.champ || {}, owS = ow.symbols || {};
	const owLeg = new Set(Array.isArray(ow.legends) ? ow.legends : []);
	const owVil = new Set(Array.isArray(ow.villains) ? ow.villains : []);
	const legCount = ids => ids.filter(id => owLeg.has(id)).length;
	const owStats = {
		has: !!st.overworld, // only surface the RPG tiles once the game has been played logged-in
		kanto: owB.KANTO | 0, johto: owB.JOHTO | 0, hoenn: owB.HOENN | 0,
		champK: owC.KANTO ? 1 : 0, champJ: owC.JOHTO ? 1 : 0, champH: owC.HOENN ? 1 : 0,
		champs: (owC.KANTO ? 1 : 0) + (owC.JOHTO ? 1 : 0) + (owC.HOENN ? 1 : 0),
		indigo: (owB.JOHTO | 0) + (owB.JOHKANTO | 0), // the 16-badge Johto->Kanto journey
		beatRed: ow.beatRed ? 1 : 0,
		symbols: Object.keys(owS).length,
		golds: Object.values(owS).filter(v => v === 'gold').length,
		weatherTrio: legCount(['rayquaza', 'kyogre', 'groudon']),
		birds: legCount(['articuno', 'zapdos', 'moltres']),
		beasts: legCount(['raikou', 'entei', 'suicune']),
		towerDuo: legCount(['hooh', 'lugia']),
		regis: legCount(['regirock', 'regice', 'registeel']),
		legends: owLeg.size,
		villainK: (owVil.has('villain_kanto_hideout') ? 1 : 0) + (owVil.has('villain_kanto_silph') ? 1 : 0),
		villainJ: (owVil.has('villain_johto_slowpoke') ? 1 : 0) + (owVil.has('villain_johto_hq') ? 1 : 0),
		aquaFoiled: owVil.has('villain_hoenn_climax') ? 1 : 0,
		awakening: ow.awakening ? 1 : 0,
		dexCaught: ow.dexCaught | 0,
	};
	return {
		runs: st.runs || 0, wins: st.wins || 0, packsOpened: st.packsOpened || 0,
		distinct, decks: (s.decks || []).length, friends: (s.friends || []).length, poolSize,
		dungeon: mode('dungeon'), heist: mode('heist'), tombs: mode('tombs'), duels: mode('duels'), arena: mode('arena'),
		lorequest: mode('lorequest'), middleearth: mode('middleearth'), swordcoast: mode('swordcoast'),
		finalfantasy: mode('finalfantasy'), multiverse: mode('multiverse'), pvp: mode('pvp'),
		arenaBestWins: (s.arenaBest && s.arenaBest.wins) || 0,
		ow: owStats,
	};
}

// tiered achievements, all computed from the real account state
export const ACH = (m) => [
	{ ico: '🕯️', nm: 'First Delve', ds: 'Complete a dungeon run.', have: m.runs, need: 1 },
	{ ico: '⛏️', nm: 'Seasoned Delver', ds: 'Complete 10 dungeon runs.', have: m.runs, need: 10 },
	{ ico: '🏰', nm: 'Dungeon Fixture', ds: 'Complete 50 dungeon runs.', have: m.runs, need: 50 },
	{ ico: '⚔️', nm: 'First Victory', ds: 'Win a run.', have: m.wins, need: 1 },
	{ ico: '🛡️', nm: 'Boss Breaker', ds: 'Win 10 runs.', have: m.wins, need: 10 },
	{ ico: '👑', nm: 'Dungeon Master', ds: 'Win 25 runs.', have: m.wins, need: 25 },
	{ ico: '📦', nm: 'Fresh Wrapper', ds: 'Open a card pack.', have: m.packsOpened, need: 1 },
	{ ico: '🎁', nm: 'Pack Rat', ds: 'Open 25 packs.', have: m.packsOpened, need: 25 },
	{ ico: '💰', nm: 'Cardboard Tycoon', ds: 'Open 100 packs.', have: m.packsOpened, need: 100 },
	{ ico: '🃏', nm: 'Collector', ds: 'Own 100 different cards.', have: m.distinct, need: 100 },
	{ ico: '📚', nm: 'Curator', ds: 'Own 500 different cards.', have: m.distinct, need: 500 },
	{ ico: '🏛️', nm: 'Archivist', ds: 'Own 2,000 different cards.', have: m.distinct, need: 2000 },
	...(m.poolSize ? [
		{ ico: '🌱', nm: 'Getting Started', ds: 'Collect 10% of all cards.', have: m.distinct, need: Math.ceil(m.poolSize * 0.10) },
		{ ico: '⚖️', nm: 'Halfway There', ds: 'Collect 50% of all cards.', have: m.distinct, need: Math.ceil(m.poolSize * 0.50) },
		{ ico: '💎', nm: 'Completionist', ds: 'Collect every card.', have: m.distinct, need: m.poolSize },
	] : []),
	// ---- per-mode run achievements ----
	{ ico: '🗝️', nm: 'Treasure Hunter', ds: 'Clear a Dungeon run.', have: m.dungeon.wins, need: 1 },
	{ ico: '🏆', nm: 'Dungeon Conqueror', ds: 'Clear 5 Dungeon runs.', have: m.dungeon.wins, need: 5 },
	{ ico: '💼', nm: 'Cracked the Vault', ds: 'Complete a Heist run.', have: m.heist.runs, need: 1 },
	{ ico: '🕴️', nm: 'Master Thief', ds: 'Clear a Heist.', have: m.heist.wins, need: 1 },
	{ ico: '🎩', nm: 'Kingpin', ds: 'Clear 5 Heists.', have: m.heist.wins, need: 5 },
	{ ico: '⚱️', nm: 'Tomb Raider', ds: 'Complete a Tombs run.', have: m.tombs.runs, need: 1 },
	{ ico: '🧟', nm: 'Plague Ender', ds: 'Clear a Tombs chapter.', have: m.tombs.wins, need: 1 },
	{ ico: '🎲', nm: 'Duelist', ds: 'Complete a Duels run.', have: m.duels.runs, need: 1 },
	{ ico: '🏅', nm: 'Duels Champion', ds: 'Win a Duels run (12 wins).', have: m.duels.wins, need: 1 },
	{ ico: '🎨', nm: 'Arena Drafter', ds: 'Complete an Arena run.', have: m.arena.runs, need: 1 },
	{ ico: '🎯', nm: 'Arena Regular', ds: 'Complete 10 Arena runs.', have: m.arena.runs, need: 10 },
	{ ico: '🥇', nm: 'Arena Ace', ds: 'Win 7+ games in a single Arena run.', have: m.arenaBestWins, need: 7 },
	{ ico: '✨', nm: 'Flawless Arena', ds: 'Go 12-0 in an Arena run.', have: m.arenaBestWins, need: 12 },
	{ ico: '📖', nm: 'Lorekeeper', ds: 'Complete a Lorequest run.', have: m.lorequest.runs, need: 1 },
	{ ico: '🪄', nm: 'Planeswalker Ascendant', ds: 'Win a Lorequest run (12 wins).', have: m.lorequest.wins, need: 1 },
	{ ico: '💍', nm: 'There and Back Again', ds: 'Win a Middle-earth run.', have: m.middleearth.wins, need: 1 },
	{ ico: '🐲', nm: 'Hero of the Sword Coast', ds: 'Win a Sword Coast run.', have: m.swordcoast.wins, need: 1 },
	{ ico: '🌟', nm: 'Warrior of Light', ds: 'Win a Final Fantasy run.', have: m.finalfantasy.wins, need: 1 },
	{ ico: '🕸️', nm: 'Multiverse Saver', ds: 'Win a Multiverse run.', have: m.multiverse.wins, need: 1 },
	{ ico: '🥊', nm: 'First Blood', ds: 'Win a live duel.', have: m.pvp.wins, need: 1 },
	{ ico: '🏟️', nm: 'Gladiator', ds: 'Win 10 live duels.', have: m.pvp.wins, need: 10 },
	{ ico: '⚡', nm: 'Duel Warlord', ds: 'Win 50 live duels.', have: m.pvp.wins, need: 50 },
	{ ico: '🛠️', nm: 'Deck Builder', ds: 'Save a deck.', have: m.decks, need: 1 },
	{ ico: '🧠', nm: 'Strategist', ds: 'Save 5 decks.', have: m.decks, need: 5 },
	{ ico: '🗃️', nm: 'Arsenal', ds: 'Save 20 decks.', have: m.decks, need: 20 },
	{ ico: '🤝', nm: 'Well Met', ds: 'Add a friend.', have: m.friends, need: 1 },
	{ ico: '🎉', nm: 'Popular', ds: 'Have 5 friends.', have: m.friends, need: 5 },
	// ---- overworld (Pokémon RPG) achievements — only shown once the game has been played ----
	...(m.ow.has ? [
		{ ico: '🥇', nm: 'Kanto Gym Circuit', ds: 'Earn all 8 Kanto Gym Badges.', have: m.ow.kanto, need: 8 },
		{ ico: '🥈', nm: 'Johto Gym Circuit', ds: 'Earn all 8 Johto Gym Badges.', have: m.ow.johto, need: 8 },
		{ ico: '🥉', nm: 'Hoenn Gym Circuit', ds: 'Earn all 8 Hoenn Gym Badges.', have: m.ow.hoenn, need: 8 },
		{ ico: '👑', nm: 'Kanto Champion', ds: 'Become the Kanto Champion.', have: m.ow.champK, need: 1 },
		{ ico: '👑', nm: 'Johto Champion', ds: 'Become the Johto Champion.', have: m.ow.champJ, need: 1 },
		{ ico: '👑', nm: 'Hoenn Champion', ds: 'Become the Hoenn Champion.', have: m.ow.champH, need: 1 },
		{ ico: '🏆', nm: 'Grand Champion', ds: 'Be Champion of all three regions.', have: m.ow.champs, need: 3 },
		{ ico: '🔟', nm: 'Indigo Conqueror', ds: 'Earn all 16 badges on the Johto → Kanto journey.', have: m.ow.indigo, need: 16 },
		{ ico: '🗻', nm: 'Rival at the Summit', ds: 'Defeat RED atop Mt. Silver.', have: m.ow.beatRed, need: 1 },
		{ ico: '🎖️', nm: 'Frontier Challenger', ds: 'Defeat a Frontier Brain.', have: m.ow.symbols, need: 1 },
		{ ico: '🏛️', nm: 'Frontier Conqueror', ds: 'Defeat all 7 Frontier Brains.', have: m.ow.symbols, need: 7 },
		{ ico: '✨', nm: 'Gold Standard', ds: 'Earn all 7 Gold Symbols.', have: m.ow.golds, need: 7 },
		{ ico: '🌩️', nm: 'Weather Trio', ds: 'Catch Rayquaza, Kyogre, and Groudon.', have: m.ow.weatherTrio, need: 3 },
		{ ico: '🐦', nm: 'Legendary Birds', ds: 'Catch Articuno, Zapdos, and Moltres.', have: m.ow.birds, need: 3 },
		{ ico: '🐾', nm: 'Legendary Beasts', ds: 'Catch Raikou, Entei, and Suicune.', have: m.ow.beasts, need: 3 },
		{ ico: '🌈', nm: 'Tower Duo', ds: 'Catch Ho-Oh and Lugia.', have: m.ow.towerDuo, need: 2 },
		{ ico: '🗿', nm: 'Regi Trio', ds: 'Catch Regirock, Regice, and Registeel.', have: m.ow.regis, need: 3 },
		{ ico: '🌟', nm: 'Legendary Master', ds: 'Catch every legendary Pokémon.', have: m.ow.legends, need: 18 },
		{ ico: '🚫', nm: 'Rocket Buster (Kanto)', ds: 'Foil Team Rocket in Kanto.', have: m.ow.villainK, need: 2 },
		{ ico: '💥', nm: 'Rocket Buster (Johto)', ds: 'Foil Team Rocket in Johto.', have: m.ow.villainJ, need: 2 },
		{ ico: '🌀', nm: 'Aqua Foiled', ds: 'Stop Team Aqua in Hoenn.', have: m.ow.aquaFoiled, need: 1 },
		{ ico: '🌦️', nm: 'Weather Crisis Averted', ds: 'Calm the raging weather trio.', have: m.ow.awakening, need: 1 },
		{ ico: '📕', nm: 'Poké Collector', ds: 'Catch 50 different species.', have: m.ow.dexCaught, need: 50 },
		{ ico: '📗', nm: 'Seasoned Trainer', ds: 'Catch 150 different species.', have: m.ow.dexCaught, need: 150 },
	] : []),
];

// ---------- in-game unlock toasts ----------
const SEEN_KEY = 'mp_ach_seen_v1';
const loadSeen = () => { try { const v = JSON.parse(localStorage.getItem(SEEN_KEY)); return Array.isArray(v) ? new Set(v) : null; } catch (e) { return null; } };
const saveSeen = set => { try { localStorage.setItem(SEEN_KEY, JSON.stringify([...set])); } catch (e) {} };

const unlockedNames = m => ACH(m).filter(a => a.have >= a.need).map(a => a.nm);

// the profile page calls this so anything unlocked-and-viewed there never
// toasts later (and an existing account's history doesn't toast-flood)
export function markAllSeen(m) {
	const seen = loadSeen() || new Set();
	for (const nm of unlockedNames(m)) seen.add(nm);
	saveSeen(seen);
}

let toastHost = null;
function toast(a) {
	if (!toastHost) {
		const style = document.createElement('style');
		style.textContent = `
		#ach-toasts { position: fixed; top: max(64px, calc(env(safe-area-inset-top) + 54px)); left: 50%; transform: translateX(-50%); z-index: 200; display: flex; flex-direction: column; gap: 8px; pointer-events: none; }
		#ach-toasts .at { display: flex; align-items: center; gap: 12px; background: linear-gradient(180deg, #2c2350, #201940); border: 1px solid #8a6f3a; border-radius: 12px; padding: 10px 18px; color: #f2ecff; font: 600 14px 'Segoe UI', system-ui, sans-serif; box-shadow: 0 10px 34px rgba(0,0,0,.5); animation: at-in .35s ease, at-out .4s ease 3.6s forwards; }
		#ach-toasts .at .ico { font-size: 24px; }
		#ach-toasts .at .lbl { font-size: 11px; letter-spacing: 1.5px; color: #ffd27a; }
		@keyframes at-in { from { opacity: 0; transform: translateY(-14px); } }
		@keyframes at-out { to { opacity: 0; transform: translateY(-10px); } }
		@media (prefers-reduced-motion: reduce) { #ach-toasts .at { animation: none; } }`;
		document.head.appendChild(style);
		toastHost = document.createElement('div');
		toastHost.id = 'ach-toasts';
		document.body.appendChild(toastHost);
	}
	const el = document.createElement('div');
	el.className = 'at';
	el.innerHTML = `<span class="ico"></span><span><span class="lbl">ACHIEVEMENT UNLOCKED</span><br><span class="nm"></span></span>`;
	el.querySelector('.ico').textContent = a.ico;
	el.querySelector('.nm').textContent = a.nm;
	toastHost.appendChild(el);
	setTimeout(() => el.remove(), 4200);
}

// diff the freshly-unlocked set against what's been seen; toast the new ones.
// First ever run (no seen-set stored) initializes silently so a veteran
// account doesn't get a wall of toasts for its whole history.
export function checkToasts(state) {
	if (!state) return;
	let m;
	try { m = metrics(state); } catch (e) { return; }
	const names = unlockedNames(m);
	const seen = loadSeen();
	if (!seen) { saveSeen(new Set(names)); return; }
	const fresh = names.filter(nm => !seen.has(nm));
	if (!fresh.length) return;
	for (const nm of fresh) seen.add(nm);
	saveSeen(seen);
	const byName = new Map(ACH(m).map(a => [a.nm, a]));
	fresh.slice(0, 3).forEach((nm, i) => setTimeout(() => toast(byName.get(nm)), i * 700));
	import('/battlecards/sfx.js').then(S => S.play('achievement')).catch(() => {});
}
