// game_lorequest.js — the Lorequest family of runs: Lorequest, Middle-earth, the Sword Coast, Final Fantasy, the Multiverse
// (pick overlays, the roster drawer, encounter boot, loot, advance; cut out of game.js, 2026-11).
// Cut and paste only: tools/extract_block.mjs wrote the import/export plumbing around it; the code is unchanged.
import * as Col from './collection.js';
import * as Duels from './duels.js';
import * as E from './engine.js';
import * as Finalfantasy from './finalfantasy.js';
import { addRunReplayButtons } from './game_replays.js';
import { GS } from './game_state.js';
import * as Lorequest from './lorequest.js';
import * as Middleearth from './middleearth.js';
import * as MPX from './mpmode.js';
import * as Multiverse from './multiverse.js';
import { winLossLabel } from './runlabel.js';
import * as Swordcoast from './swordcoast.js';
// game.js's own declarations (a safe cycle: only used inside functions)
import {
	$, FINALFANTASY_UNLOCK_KEY, MIDDLEEARTH_UNLOCK_KEY, MP_ON, MULTIVERSE_UNLOCK_KEY,
	SWORDCOAST_UNLOCK_KEY, applyRunAnomaly, beginPostGame, clearFinalfantasy, clearLorequest,
	clearMiddleearth, clearMultiverse, clearSwordcoast, dungeonOverlay, fightNow,
	finalfantasyGilgameshUnlocked, hideDungeonOverlay, log, middleearthTomUnlocked, miniFace,
	mpRunReward, multiverseSurferUnlocked, noteFaced, overlayButton, postGameRng, postGameStage,
	saveFinalfantasy, saveLorequest, saveMiddleearth, saveMultiverse, saveSwordcoast, seededGame,
	setRunLife, swordcoastGaleUnlocked,
} from './game.js';

// ---------- Lorequest run ----------
// Pick 1 of 3 planeswalker 30-card decks, then climb to 12 wins / 3 losses. Battles 1-8 are
// vs other planeswalkers, 9+ vs the Eldrazi & legendary bosses. Every WIN loots a bucket
// (+ a treasure at milestones); the generated enemy is kept at exact WIN-parity. Hero powers
// are each character's class default (Ajani=paladin, Chandra=mage, ...).
GS.lorequestCardsById = null;

export function resumeLorequestOverlay(run) {
	return new Promise(resolve => {
		const el = dungeonOverlay('LOREQUEST IN PROGRESS',
			`${run.characterId} - ${winLossLabel(run)}, ${run.deck.length} cards. Reach 12 wins before 3 losses.`);
		el.appendChild(overlayButton('Continue the run', () => { hideDungeonOverlay(); resolve(true); }));
		el.appendChild(overlayButton('Abandon - start a new run', () => { hideDungeonOverlay(); resolve(false); }));
	});
}

// ---------- full character roster & unlock requirements ----------
// A drawer layered OVER the pick overlay (the pick's promise stays pending
// underneath, so ✕ simply closes it). Locked characters show exactly what
// earns them; progress comes from the same server stats the offer uses.
function showRosterOverlay(cfg) {
	const { title, modeKey, heroes, order, starters, enemies, unlocks, secrets, secretOn, deckTag, cardsById, stats, unlockedList } = cfg;
	if (!$('roster-style')) {
		const st = document.createElement('style');
		st.id = 'roster-style';
		st.textContent = `
#roster-ov{position:fixed;inset:0;z-index:10002;background:rgba(6,4,14,.94);overflow-y:auto;padding:18px 14px 40px;color:#e8e2f4}
#roster-ov h2{font-size:20px;letter-spacing:2px;color:#e8c37a;text-align:center;margin-top:4px}
#roster-ov .ro-sub{text-align:center;color:#9d8fd4;font-size:12.5px;margin-bottom:10px}
#roster-ov .ro-sec{max-width:1080px;margin:0 auto 6px;color:#c9b8ff;font-size:12px;font-weight:700;letter-spacing:1.5px;text-transform:uppercase;padding:12px 6px 6px}
#roster-ov .ro-grid{display:flex;flex-wrap:wrap;gap:10px;justify-content:center;max-width:1080px;margin:0 auto}
#roster-ov .ro-tile{width:132px;background:#1c1830;border:1px solid #3a3055;border-radius:10px;padding:8px;text-align:center}
#roster-ov .ro-tile.locked{border-color:#2a2340}
#roster-ov .ro-tile.locked canvas{filter:grayscale(1) brightness(.55)}
#roster-ov .ro-name{font-weight:700;font-size:12.5px;margin:5px 0 2px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap}
#roster-ov .ro-state{font-size:10.5px;line-height:1.35;color:#9fd8b0;min-height:14px}
#roster-ov .ro-tile.locked .ro-state{color:#b7a8d6}
#roster-ov .ro-close{position:fixed;top:14px;right:16px;background:#241b38;color:#cdbcff;border:1px solid #4a3f6b;border-radius:8px;padding:8px 16px;font-size:14px;font-weight:700;cursor:pointer;z-index:2}
#roster-ov .ro-close:hover{background:#372c56}`;
		document.head.appendChild(st);
	}
	$('roster-ov')?.remove();
	const ov = document.createElement('div');
	ov.id = 'roster-ov';
	const unlockedSet = new Set(unlockedList);
	const runs = stats?.modes?.[modeKey]?.runs || 0;
	const csOf = h => stats?.chars?.[modeKey + '|' + h] || {};
	const secretUnlocked = secrets?.length && secretOn ? secretOn() : false;
	const total = heroes.length + enemies.length + (secrets?.length || 0);
	const owned = heroes.filter(h => unlockedSet.has(h)).length
		+ enemies.filter(e => unlockedSet.has(e)).length
		+ (secretUnlocked ? secrets.length : 0);
	const coresDone = heroes.every(h => unlockedSet.has(h));
	ov.innerHTML = `<button class="ro-close">✕ Back</button><h2>${title} — ROSTER</h2>
		<div class="ro-sub">${stats ? `${owned} / ${total} characters unlocked` : 'Free play — every character is unlocked'}</div>`;
	const section = label => {
		const d = document.createElement('div'); d.className = 'ro-sec'; d.textContent = label; ov.appendChild(d);
		const g = document.createElement('div'); g.className = 'ro-grid'; ov.appendChild(g);
		return g;
	};
	const tile = (grid, name, open, hint) => {
		const t = document.createElement('div');
		t.className = 'ro-tile' + (open ? '' : ' locked');
		const sig = Object.values(cardsById).find(d => d[deckTag] === name && d.rarity === 'legendary')
			|| Object.values(cardsById).find(d => d[deckTag] === name);
		if (sig) t.appendChild(miniFace(sig, 116));
		const nm = document.createElement('div'); nm.className = 'ro-name'; nm.textContent = name; nm.title = name; t.appendChild(nm);
		const stl = document.createElement('div'); stl.className = 'ro-state'; stl.textContent = open ? '✓ Unlocked' : hint; t.appendChild(stl);
		grid.appendChild(t);
	};
	const hg = section(`Heroes (${stats ? heroes.filter(h => unlockedSet.has(h)).length : heroes.length}/${heroes.length})`);
	for (const h of [...starters, ...order]) {
		const open = !stats || unlockedSet.has(h);
		const idx = order.indexOf(h);
		tile(hg, h, open, starters.includes(h) ? 'Starter'
			: `Unlocks after ${idx + 1} completed run${idx ? 's' : ''} — you've done ${runs}`);
	}
	const eg = section(`Enemy characters (${stats ? enemies.filter(e => unlockedSet.has(e)).length : enemies.length}/${enemies.length})`);
	for (const en of enemies) {
		const open = !stats || unlockedSet.has(en);
		const [hero, need] = unlocks[en] || ['?', 2];
		const cs = csOf(hero);
		const prog = ` — best streak ${cs.best || 0}${cs.streak ? `, current ${cs.streak}` : ''}`;
		tile(eg, en, open, (coresDone ? '' : `Unlock all ${heroes.length} heroes first · then `)
			+ `win ${need} runs in a row as ${hero}${stats && coresDone ? prog : ''}`);
	}
	if (secrets && secrets.length) {
		const sg = section('Secret');
		for (const s of secrets) tile(sg, s, !stats || secretUnlocked, 'A secret unlock — keep exploring…');
	}
	ov.querySelector('.ro-close').addEventListener('click', () => ov.remove());
	document.body.appendChild(ov);
}

// pick 1 of 3 planeswalker starter decks (shows the deck's signature card)
export async function pickLorequestDeckOverlay(cardsById) {
	// account progression: 3 random UNLOCKED characters per run. Free play (no
	// account) keeps the whole roster. See Lorequest.STARTERS / BOSS_UNLOCKS.
	let stats = null;
	if (MP_ON) {
		try { stats = (await MPX.freshState())?.stats || null; }
		catch (e) { stats = MPX.cachedState()?.stats || null; }
	}
	const unlocked = Lorequest.unlockedCharacters(stats);
	const total = Lorequest.PLANESWALKERS.length + Lorequest.BOSSES.length;
	return new Promise(resolve => {
		const choices = Lorequest.offerFrom(unlocked, Math.random, 3, Lorequest.streakPins(unlocked, stats, 'lorequest', Math.random));
		const sub = stats
			? `Pick a 30-card starter deck. ${unlocked.length}/${total} characters unlocked — each finished run unlocks another; bosses unlock through character feats.`
			: 'Pick a 30-card starter deck (2 copies of each of its 15 cards).';
		const el = dungeonOverlay('CHOOSE YOUR CHARACTER', sub);
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (const ch of choices) {
			const cls = Lorequest.classOf(ch);
			const stk = stats?.chars?.['lorequest|' + ch]?.streak || 0;
			const clsName = (GS.classRegistry.find(c => c.id === cls)?.name) || cls;
			const sig = Object.values(cardsById).find(d => d.loreDeck === ch && d.rarity === 'legendary');
			const box = document.createElement('div');
			box.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:6px;background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;max-width:200px;';
			box.innerHTML = `<div style="font-weight:bold;">${ch}</div><div style="font-size:12px;color:#e8c37a;margin-bottom:6px;">${clsName}</div>`
				+ (stk ? `<div style="font-size:11px;color:#ffb04d;font-weight:bold;">🔥 ${stk}-run win streak</div>` : '');
			if (sig) box.appendChild(miniFace(sig, 130));
			box.appendChild(overlayButton('Play this deck', () => { hideDungeonOverlay(); resolve(ch); }));
			row.appendChild(box);
		}
		el.appendChild(row);
		el.appendChild(overlayButton('📜 Full roster & unlocks', () => showRosterOverlay({
			title: 'LOREQUEST', modeKey: 'lorequest', cardsById, stats,
			heroes: Lorequest.PLANESWALKERS, order: Lorequest.CORE_UNLOCK_ORDER, starters: Lorequest.STARTERS,
			enemies: Lorequest.BOSSES, unlocks: Lorequest.BOSS_UNLOCKS, deckTag: 'loreDeck',
			unlockedList: unlocked,
		})));
	});
}

// roll the next enemy: roster by `games` (planeswalkers < 8, then bosses), deck at `wins`-parity
export function genLorequestEnemy(cardsById, games, wins, avoidId, selfId, faced) {
	const character = Lorequest.randomEnemy(games, Math.random, avoidId, selfId, faced);
	return Lorequest.generateEnemy(cardsById, character, wins, Math.random);
}

// the class def used to seat a Lorequest character — its class power, but displayed under the character's name
function lorequestSeat(character) {
	const cls = Lorequest.classOf(character);
	const def = GS.classRegistry.find(c => c.id === cls) || { id: cls, power: null };
	return { ...def, id: cls, name: character };
}

export function bootLorequestEncounter(cardsById, run) {
	GS.lorequestCardsById = cardsById;
	const games = (run.wins || 0) + (run.losses || 0);
	const enemy = run.enemy || (run.enemy = genLorequestEnemy(cardsById, games, run.wins || 0, null, run.characterId));
	GS.heistBossName = enemy.name; // shared enemy-name slot for nameOf()
	const picks = [lorequestSeat(run.characterId), lorequestSeat(enemy.name)];
	GS.state = E.createGame(cardsById, seededGame(), [...run.deck], 2, picks); // seeded -> snapshot-able for resume
	GS.state.classPicks = picks;
	// both sides use their class default hero power (seated above) — no HP scaling, equal footing
	E.resetDeckAndHand(GS.state, 1, [...enemy.deck]);
	E.drawCards(GS.state, 1, 4);
	E.addCoin(GS.state, 1);   // the boss goes second: re-deal its opening Coin (resetDeckAndHand wiped createGame's)
	E.stripLoadouts(GS.state);
	applyRunAnomaly(run.anomaly);
	setRunLife((run.wins || 0) + (run.losses || 0) + 1);
	// basics are color-locked to each character's identity (Karn -> Wastes only,
	// Chandra -> Mountain + Wastes) — applies to you AND the AI enemy
	GS.state.players[0].allowedBasics = Lorequest.allowedBasics(cardsById, run.characterId);
	GS.state.players[1].allowedBasics = Lorequest.allowedBasics(cardsById, enemy.name);
	const tier = games < Lorequest.PW_BATTLES ? 'Planeswalker' : 'Boss';
	log(`Lorequest - ${winLossLabel(run)}. Facing ${enemy.name} (${tier}).`);
	log(`You are ${run.characterId} with a ${run.deck.length}-card deck; ${enemy.name} fields ${enemy.deck.length}.`);
}

export function lorequestVictory(run) { afterLorequestGame(run, true); }
export function lorequestDefeat(run) { afterLorequestGame(run, false); }

// one game resolved: bank it, end at 12 wins / 3 losses; loot only on a WIN, else straight to the next fight
function afterLorequestGame(run, won) {
	if (won) run.wins = (run.wins || 0) + 1; else run.losses = (run.losses || 0) + 1;
	beginPostGame(run, won);   // checkpoint: a reload resumes the reward, not the fight
	saveLorequest(run);
	if (run.wins >= Lorequest.WINS_TO_CLEAR) { lorequestRunComplete(run); return; }
	if (run.losses >= Lorequest.LOSSES_TO_END) { lorequestRunOver(run); return; }
	if (won) lorequestLoot(run); else advanceLorequest(run);
}

// win loot: choose 1 of 3 class buckets (3 cards each); all 3 join your deck
export function lorequestLoot(run) {
	const lootRng = postGameRng(run, 1);   // same offer after a reload
	const cls = [run.cls];
	const el = dungeonOverlay(`WIN - ${run.wins}/12`, 'Choose a loot bucket - all 3 cards join your deck.');
	const offered = Duels.offerBuckets(GS.lorequestCardsById, cls, lootRng, 3);
	const row = document.createElement('div');
	row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
	for (const bucket of offered) {
		const ids = Duels.rollBucket(GS.lorequestCardsById, cls, bucket, lootRng, 3);
		const box = document.createElement('div');
		box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;max-width:330px;';
		box.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;letter-spacing:1px;">${bucket.name}</div>`;
		for (const id of ids) if (GS.lorequestCardsById[id]) box.appendChild(miniFace(GS.lorequestCardsById[id]));
		box.appendChild(document.createElement('br'));
		box.appendChild(overlayButton('Take these', () => { run.deck.push(...ids); afterLorequestBucket(run); }));
		row.appendChild(box);
	}
	el.appendChild(row);
}

// milestone wins (2/5/8/11) also grant a treasure card, then the next fight
export function afterLorequestBucket(run) {
	postGameStage(run, 2, saveLorequest);   // the step-1 pick is saved
	const lootRng = postGameRng(run, 2);
	if (Lorequest.TREASURE_WINS.includes(run.wins)) {
		const el = dungeonOverlay('TREASURE!', 'One of these joins your deck.');
		const options = Object.values(GS.lorequestCardsById).filter(d => Duels.isActiveTreasure(d) && !run.deck.includes(d.id));
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (let i = 0; i < 3 && options.length; i++) {
			const d = options.splice(Math.floor(lootRng() * options.length), 1)[0];
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;';
			box.appendChild(miniFace(d));
			box.appendChild(document.createElement('br'));
			box.appendChild(overlayButton('Take it', () => { run.deck.push(d.id); advanceLorequest(run); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	} else advanceLorequest(run);
}

export function advanceLorequest(run) {
	delete run.postGame;   // the reward is done: the next fight is the checkpoint now
	const games = (run.wins || 0) + (run.losses || 0);
	run.enemy = genLorequestEnemy(GS.lorequestCardsById, games, run.wins || 0, run.enemy && run.enemy.id, run.characterId, noteFaced(run));
	saveLorequest(run);
	const tier = games < Lorequest.PW_BATTLES ? 'Planeswalker' : 'Boss';
	const el = dungeonOverlay(`NEXT: ${run.enemy.name}`, `${winLossLabel(run)} - your deck is ${run.deck.length} cards. (${tier})`);
	el.appendChild(overlayButton('Fight!', fightNow));
}

function lorequestRunComplete(run) {
	const el = dungeonOverlay('12 WINS - RUN CLEARED!', `${run.characterId} takes 12 wins with a ${run.deck.length}-card deck.`);
	Col.earnGold(1000);
	mpRunReward(el, 'win', { wins: run.wins || 0, losses: run.losses || 0, hero: run.characterId });
	addRunReplayButtons(el, run, 'lorequest'); // before the clear — the ids live on the run
	clearLorequest();
	el.appendChild(overlayButton('New Run (+1000 gold banked)', () => location.reload()));
}

function lorequestRunOver(run) {
	const el = dungeonOverlay('3 LOSSES - RUN OVER', `${run.characterId} bows out at ${run.wins || 0} wins.`);
	clearLorequest();
	mpRunReward(el, 'loss', { wins: run.wins || 0, losses: run.losses || 0, hero: run.characterId });
	el.appendChild(overlayButton('New Run', () => location.reload()));
}

// ---------- Lorequest: the rung runs (Middle-earth, the Sword Coast, Final Fantasy) ----------
// Pick ONE hero (a 10-card singleton starter). Climb rungs of villains — each a STATIC 15×2 =
// 30-card deck with its own UNIQUE signature hero power — to 12 wins or 3 losses. No win-parity.
// Every win: a spoils draft from the fallen foe, then an alternating treasure / class bucket.
// The three runs were three copies of this flow that differed only in what they are called on
// screen, their card tag and their save slot, so rungRunFlow builds each from a small config; the
// run's RULES (decks, rung windows, enemy pick, spoils, unlocks) are its own module (rungrun.js).
//
// cfg: mode 'swordcoast' (stats key, replay label) · tag 'sc' (cards carry `scDeck`) · M the run's
// rules module · cardsKey the GS field its pre-fight overlays read · title / logName / pickBlurb /
// overHeadline / clearHeadline(run) / clearBody(run): what the player reads.
// save / clear / unlockKey / secretOn are FUNCTIONS, not values: they name game.js bindings, and
// this module evaluates before game.js's body (a value read here would hit its TDZ).
function rungRunFlow(cfg) {
	const { mode, M, cardsKey } = cfg;
	const DECK = cfg.tag + 'Deck';

	function resume(run) {
		return new Promise(resolve => {
			const el = dungeonOverlay(`${cfg.title} RUN IN PROGRESS`,
				`${run.characterId} - ${winLossLabel(run)}, ${run.deck.length} cards. Reach 12 wins before 3 losses.`);
			el.appendChild(overlayButton('Continue the run', () => { hideDungeonOverlay(); resolve(true); }));
			el.appendChild(overlayButton('Abandon - start a new run', () => { hideDungeonOverlay(); resolve(false); }));
		});
	}

	// the hero choice (+ the secret hero once unlocked), each showing its signature + power
	async function pickHero(cardsById) {
		// account progression: 3 random UNLOCKED characters per run (secret heroes
		// join the pool once their own unlock fires). Free play = the full roster.
		let stats = null;
		if (MP_ON) {
			try { stats = (await MPX.freshState())?.stats || null; }
			catch (e) { stats = MPX.cachedState()?.stats || null; }
		}
		const pool = M.unlockedCharacters(stats);
		if (cfg.secretOn()) for (const sh of M.SECRET_HEROES) if (!pool.includes(sh)) pool.push(sh);
		return new Promise(resolve => {
			const heroes = stats ? Lorequest.offerFrom(pool, Math.random, 3, Lorequest.streakPins(pool, stats, mode, Math.random)) : pool;
			const el = dungeonOverlay('CHOOSE YOUR HERO', cfg.pickBlurb);
			const row = document.createElement('div');
			row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:12px;max-width:920px;';
			for (const ch of heroes) {
				const cls = M.classOf(ch);
				const stk = stats?.chars?.[mode + '|' + ch]?.streak || 0;
				const clsName = (GS.classRegistry.find(c => c.id === cls)?.name) || cls;
				const sig = Object.values(cardsById).find(d => d[DECK] === ch && d.rarity === 'legendary');
				const pw = M.powerOf(ch);
				const box = document.createElement('div');
				box.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px;background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:10px;max-width:180px;';
				box.innerHTML = `<div style="font-weight:bold;">${ch}</div><div style="font-size:12px;color:#e8c37a;">${clsName}</div>`
					+ (pw ? `<div style="font-size:11px;color:#bdb;line-height:1.25;">${pw.name}: ${pw.text}</div>` : '')
					+ (stk ? `<div style="font-size:11px;color:#ffb04d;font-weight:bold;">🔥 ${stk}-run win streak</div>` : '');
				if (sig) box.appendChild(miniFace(sig, 120));
				box.appendChild(overlayButton('Play this hero', () => { hideDungeonOverlay(); resolve(ch); }));
				row.appendChild(box);
			}
			el.appendChild(row);
			el.appendChild(overlayButton('📜 Full roster & unlocks', () => showRosterOverlay({
				title: cfg.title, modeKey: mode, cardsById, stats,
				heroes: M.HEROES, order: M.CORE_UNLOCK_ORDER, starters: M.STARTERS,
				enemies: M.ENEMIES, unlocks: M.ENEMY_UNLOCKS, deckTag: DECK,
				secrets: M.SECRET_HEROES, secretOn: () => cfg.secretOn(),
				unlockedList: pool,
			})));
		});
	}

	// roll the next enemy: rung by `wins`, avoiding an immediate repeat. STATIC (no loot/parity).
	function genEnemy(cardsById, wins, avoidId, faced) {
		const character = M.randomEnemy(wins, Math.random, avoidId, faced);
		return M.generateEnemy(cardsById, character);
	}

	// seat a character: its class (for buckets/color) but its OWN unique hero power
	function seat(character) {
		const cls = M.classOf(character);
		const def = GS.classRegistry.find(c => c.id === cls) || { id: cls, power: null };
		return { ...def, id: cls, name: character, power: M.powerOf(character) };
	}

	function boot(cardsById, run) {
		GS[cardsKey] = cardsById;
		const enemy = run.enemy || (run.enemy = genEnemy(cardsById, run.wins || 0, null));
		GS.heistBossName = enemy.name; // shared enemy-name slot for nameOf()
		const picks = [seat(run.characterId), seat(enemy.name)];
		GS.state = E.createGame(cardsById, seededGame(), [...run.deck], 2, picks); // seeded -> snapshot-able for resume
		GS.state.classPicks = picks;
		E.resetDeckAndHand(GS.state, 1, [...enemy.deck]);
		E.drawCards(GS.state, 1, 4);
		E.addCoin(GS.state, 1);   // the boss goes second: re-deal its opening Coin (resetDeckAndHand wiped createGame's)
		E.stripLoadouts(GS.state);
		applyRunAnomaly(run.anomaly);
		setRunLife((run.wins || 0) + (run.losses || 0) + 1);
		// basics are color-locked to each character's identity (see PR #85)
		GS.state.players[0].allowedBasics = Duels.allowedBasicsFor(cardsById, DECK, run.characterId);
		GS.state.players[1].allowedBasics = Duels.allowedBasicsFor(cardsById, DECK, enemy.name);
		log(`Lorequest: ${cfg.logName} - ${winLossLabel(run)}. Facing ${enemy.name} (${M.rungLabel(run.wins || 0)}).`);
		log(`You are ${run.characterId} with a ${run.deck.length}-card deck; ${enemy.name} fields ${enemy.deck.length}.`);
	}

	function victory(run) { afterGame(run, true); }
	function defeat(run) { afterGame(run, false); }

	function afterGame(run, won) {
		if (won) run.wins = (run.wins || 0) + 1; else run.losses = (run.losses || 0) + 1;
		beginPostGame(run, won);   // checkpoint: a reload resumes the reward, not the fight
		cfg.save(run);
		if (run.wins >= M.WINS_TO_CLEAR) { runComplete(run); return; }
		if (run.losses >= M.LOSSES_TO_END) { runOver(run); return; }
		if (won) loot(run); else advance(run);
	}

	// win loot step 1 — SPOILS: take 1 of 3 cards drawn from the vanquished foe's own deck, or none
	function loot(run) {
		const lootRng = postGameRng(run, 1);   // same offer after a reload
		const fallen = run.enemy ? run.enemy.name : null;
		const options = fallen ? M.spoilsChoices(GS[cardsKey], fallen, lootRng, 3) : [];
		const el = dungeonOverlay(`WIN - ${run.wins}/12`, `Spoils of war: take one card from ${fallen || 'the fallen'}'s arsenal, or leave it.`);
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (const id of options) {
			if (!GS[cardsKey][id]) continue;
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;';
			box.appendChild(miniFace(GS[cardsKey][id]));
			box.appendChild(document.createElement('br'));
			box.appendChild(overlayButton('Take it', () => { run.deck.push(id); afterReward(run); }));
			row.appendChild(box);
		}
		el.appendChild(row);
		el.appendChild(overlayButton('Take none', () => afterReward(run)));
	}

	// win loot step 2 — ALTERNATING AID: a treasure on odd wins, a class bucket on even wins
	function afterReward(run) {
		postGameStage(run, 2, cfg.save);   // the step-1 pick is saved
		const lootRng = postGameRng(run, 2);
		if (M.rewardForWin(run.wins) === 'bucket') {
			const cls = [run.cls];
			const el = dungeonOverlay(`AID - ${run.wins}/12`, 'Choose a loot bucket - all 3 cards join your deck.');
			const offered = Duels.offerBuckets(GS[cardsKey], cls, lootRng, 3);
			const row = document.createElement('div');
			row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
			for (const bucket of offered) {
				const ids = Duels.rollBucket(GS[cardsKey], cls, bucket, lootRng, 3);
				const box = document.createElement('div');
				box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;max-width:330px;';
				box.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;letter-spacing:1px;">${bucket.name}</div>`;
				for (const id of ids) if (GS[cardsKey][id]) box.appendChild(miniFace(GS[cardsKey][id]));
				box.appendChild(document.createElement('br'));
				box.appendChild(overlayButton('Take these', () => { run.deck.push(...ids); advance(run); }));
				row.appendChild(box);
			}
			el.appendChild(row);
		} else {
			const el = dungeonOverlay(`TREASURE! - ${run.wins}/12`, 'One of these joins your deck.');
			const options = M.treasurePool(GS[cardsKey]).filter(d => !run.deck.includes(d.id));
			const row = document.createElement('div');
			row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
			for (let i = 0; i < 3 && options.length; i++) {
				const d = options.splice(Math.floor(lootRng() * options.length), 1)[0];
				const box = document.createElement('div');
				box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;';
				box.appendChild(miniFace(d));
				box.appendChild(document.createElement('br'));
				box.appendChild(overlayButton('Take it', () => { run.deck.push(d.id); advance(run); }));
				row.appendChild(box);
			}
			el.appendChild(row);
		}
	}

	function advance(run) {
		delete run.postGame;   // the reward is done: the next fight is the checkpoint now
		run.enemy = genEnemy(GS[cardsKey], run.wins || 0, run.enemy && run.enemy.id, noteFaced(run));
		cfg.save(run);
		const el = dungeonOverlay(`NEXT: ${run.enemy.name}`, `${winLossLabel(run)} - your deck is ${run.deck.length} cards. (${M.rungLabel(run.wins || 0)})`);
		el.appendChild(overlayButton('Fight!', fightNow));
	}

	function runComplete(run) {
		try { localStorage.setItem(cfg.unlockKey(), '1'); } catch (e) { }
		const el = dungeonOverlay(cfg.clearHeadline(run), cfg.clearBody(run));
		Col.earnGold(1000);
		mpRunReward(el, 'win', { wins: run.wins || 0, losses: run.losses || 0, hero: run.characterId });
		addRunReplayButtons(el, run, mode); // before the clear — the ids live on the run
		cfg.clear();
		el.appendChild(overlayButton('New Run (+1000 gold banked)', () => location.reload()));
	}

	function runOver(run) {
		const el = dungeonOverlay(cfg.overHeadline, `${run.characterId} falls at ${run.wins || 0} wins.`);
		cfg.clear();
		mpRunReward(el, 'loss', { wins: run.wins || 0, losses: run.losses || 0, hero: run.characterId });
		el.appendChild(overlayButton('New Run', () => location.reload()));
	}

	return { resume, pickHero, genEnemy, boot, victory, defeat, loot, afterReward, advance };
}

// Middle-earth: heroes of the Free Peoples against Sauron's forces. Signature mechanics = Tempt / the One
// Ring. Data tagged meDeck/meSide, ids me_*.
GS.middleearthCardsById = null;
export const {
	resume: resumeMiddleEarthOverlay, pickHero: pickMiddleEarthHeroOverlay, genEnemy: genMiddleEarthEnemy,
	boot: bootMiddleEarthEncounter, victory: middleEarthVictory, defeat: middleEarthDefeat,
	loot: middleEarthLoot, afterReward: afterMiddleEarthReward, advance: advanceMiddleEarth,
} = rungRunFlow({
	mode: 'middleearth', tag: 'me', M: Middleearth, cardsKey: 'middleearthCardsById',
	title: 'MIDDLE-EARTH', logName: 'Middle-earth',
	pickBlurb: 'Pick a hero of the Free Peoples - a 10-card starter deck you grow as you climb.',
	clearHeadline: () => '12 WINS - SAURON IS THROWN DOWN!',
	clearBody: run => `${run.characterId} clears Middle-earth with a ${run.deck.length}-card deck. Tom Bombadil is now a playable hero!`,
	overHeadline: '3 LOSSES - THE SHADOW PREVAILS',
	save: run => saveMiddleearth(run), clear: () => clearMiddleearth(),
	unlockKey: () => MIDDLEEARTH_UNLOCK_KEY, secretOn: () => middleearthTomUnlocked(),
});

// The Sword Coast (D&D): a Companion hero Advances through the Sword Coast's villains. Signature mechanic =
// Advance (venture) + d20 rolls. Data tagged scDeck/scSide, ids sc_*. The clear headline names the foe the
// 12th win was taken from (Swordcoast.clearHeadline).
GS.swordcoastCardsById = null;
export const {
	resume: resumeSwordCoastOverlay, pickHero: pickSwordCoastHeroOverlay, genEnemy: genSwordCoastEnemy,
	boot: bootSwordCoastEncounter, victory: swordCoastVictory, defeat: swordCoastDefeat,
	loot: swordCoastLoot, afterReward: afterSwordCoastReward, advance: advanceSwordCoast,
} = rungRunFlow({
	mode: 'swordcoast', tag: 'sc', M: Swordcoast, cardsKey: 'swordcoastCardsById',
	title: 'SWORD COAST', logName: 'Sword Coast',
	pickBlurb: 'Pick a Companion of the Realms - a 10-card starter deck you grow as you Advance.',
	clearHeadline: run => Swordcoast.clearHeadline(run.enemy && run.enemy.name),
	clearBody: run => `${run.characterId} clears the Sword Coast with a ${run.deck.length}-card deck. Gale, Waterdeep Prodigy is now a playable hero!`,
	overHeadline: '3 LOSSES - THE REALMS FALL',
	save: run => saveSwordcoast(run), clear: () => clearSwordcoast(),
	unlockKey: () => SWORDCOAST_UNLOCK_KEY, secretOn: () => swordcoastGaleUnlocked(),
});

// Final Fantasy: a hero climbs the series' villains. Signature mechanics = Spiritsummon + Limit Break. Data
// tagged ffDeck/ffSide, ids ff_*.
GS.finalfantasyCardsById = null;
export const {
	resume: resumeFinalFantasyOverlay, pickHero: pickFinalFantasyHeroOverlay, genEnemy: genFinalFantasyEnemy,
	boot: bootFinalFantasyEncounter, victory: finalFantasyVictory, defeat: finalFantasyDefeat,
	loot: finalFantasyLoot, afterReward: afterFinalFantasyReward, advance: advanceFinalFantasy,
} = rungRunFlow({
	mode: 'finalfantasy', tag: 'ff', M: Finalfantasy, cardsKey: 'finalfantasyCardsById',
	title: 'FINAL FANTASY', logName: 'Final Fantasy',
	pickBlurb: 'Pick a Final Fantasy hero - a 10-card starter deck you grow as you climb.',
	clearHeadline: () => '12 WINS - THE VOID IS SEALED!',
	clearBody: run => `${run.characterId} clears Final Fantasy with a ${run.deck.length}-card deck. Gilgamesh is now a playable hero!`,
	overHeadline: '3 LOSSES - GAME OVER',
	save: run => saveFinalfantasy(run), clear: () => clearFinalfantasy(),
	unlockKey: () => FINALFANTASY_UNLOCK_KEY, secretOn: () => finalfantasyGilgameshUnlocked(),
});

// ---------- Lorequest: Multiverse (Marvel, WIN-PARITY) ----------
// Pick ONE Marvel hero (10-card singleton starter) with a UNIQUE hero power. Climb villains to 12
// wins or 3 losses. RETURNS to Duels/Lorequest parity: every win YOU pick a class bucket (+ a
// treasure at milestones 2/5/8/11), and the next villain is regenerated at your exact WIN-parity
// (10-card base + one bucket per win + a treasure per milestone) — no spoils draft. mvDeck/mvSide, mv_*.
GS.multiverseCardsById = null;

export function resumeMultiverseOverlay(run) {
	return new Promise(resolve => {
		const el = dungeonOverlay('MULTIVERSE RUN IN PROGRESS',
			`${run.characterId} - ${winLossLabel(run)}, ${run.deck.length} cards. Reach 12 wins before 3 losses.`);
		el.appendChild(overlayButton('Continue the run', () => { hideDungeonOverlay(); resolve(true); }));
		el.appendChild(overlayButton('Abandon - start a new run', () => { hideDungeonOverlay(); resolve(false); }));
	});
}

// full choice of all 10 heroes (+ Silver Surfer once unlocked), each showing its signature + power
export async function pickMultiverseHeroOverlay(cardsById) {
	// account progression: 3 random UNLOCKED characters per run (secret heroes
	// join the pool once their own unlock fires). Free play = the full roster.
	let stats = null;
	if (MP_ON) {
		try { stats = (await MPX.freshState())?.stats || null; }
		catch (e) { stats = MPX.cachedState()?.stats || null; }
	}
	const pool = Multiverse.unlockedCharacters(stats);
	if (multiverseSurferUnlocked()) for (const sh of Multiverse.SECRET_HEROES) if (!pool.includes(sh)) pool.push(sh);
	return new Promise(resolve => {
		const heroes = stats ? Lorequest.offerFrom(pool, Math.random, 3, Lorequest.streakPins(pool, stats, 'multiverse', Math.random)) : pool;
		const el = dungeonOverlay('CHOOSE YOUR HERO', 'Pick a Marvel hero - a 10-card starter deck you grow as you climb. Enemies always match your loot.');
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:12px;max-width:920px;';
		for (const ch of heroes) {
			const cls = Multiverse.classOf(ch);
			const stk = stats?.chars?.['multiverse|' + ch]?.streak || 0;
			const clsName = (GS.classRegistry.find(c => c.id === cls)?.name) || cls;
			const sig = Object.values(cardsById).find(d => d.mvDeck === ch && d.rarity === 'legendary');
			const pw = Multiverse.powerOf(ch);
			const box = document.createElement('div');
			box.style.cssText = 'display:flex;flex-direction:column;align-items:center;gap:5px;background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:10px;max-width:180px;';
			box.innerHTML = `<div style="font-weight:bold;">${ch}</div><div style="font-size:12px;color:#e8c37a;">${clsName}</div>`
				+ (pw ? `<div style="font-size:11px;color:#bdb;line-height:1.25;">${pw.name}: ${pw.text}</div>` : '')
				+ (stk ? `<div style="font-size:11px;color:#ffb04d;font-weight:bold;">🔥 ${stk}-run win streak</div>` : '');
			if (sig) box.appendChild(miniFace(sig, 120));
			box.appendChild(overlayButton('Play this hero', () => { hideDungeonOverlay(); resolve(ch); }));
			row.appendChild(box);
		}
		el.appendChild(row);
		el.appendChild(overlayButton('📜 Full roster & unlocks', () => showRosterOverlay({
			title: 'MULTIVERSE', modeKey: 'multiverse', cardsById, stats,
			heroes: Multiverse.HEROES, order: Multiverse.CORE_UNLOCK_ORDER, starters: Multiverse.STARTERS,
			enemies: Multiverse.ENEMIES, unlocks: Multiverse.ENEMY_UNLOCKS, deckTag: 'mvDeck',
			secrets: Multiverse.SECRET_HEROES, secretOn: () => multiverseSurferUnlocked(),
			unlockedList: pool,
		})));
	});
}

// roll the next villain: roster by `wins`, deck at `wins`-parity, avoiding an immediate repeat
export function genMultiverseEnemy(cardsById, wins, avoidId, faced) {
	const character = Multiverse.randomEnemy(wins, Math.random, avoidId, faced);
	return Multiverse.generateEnemy(cardsById, character, wins, Math.random);
}

// seat a Multiverse character: its class (for buckets/color) but its OWN unique hero power
function multiverseSeat(character) {
	const cls = Multiverse.classOf(character);
	const def = GS.classRegistry.find(c => c.id === cls) || { id: cls, power: null };
	return { ...def, id: cls, name: character, power: Multiverse.powerOf(character) };
}

export function bootMultiverseEncounter(cardsById, run) {
	GS.multiverseCardsById = cardsById;
	const enemy = run.enemy || (run.enemy = genMultiverseEnemy(cardsById, run.wins || 0, null));
	GS.heistBossName = enemy.name; // shared enemy-name slot for nameOf()
	const picks = [multiverseSeat(run.characterId), multiverseSeat(enemy.name)];
	GS.state = E.createGame(cardsById, seededGame(), [...run.deck], 2, picks); // seeded -> snapshot-able for resume
	GS.state.classPicks = picks;
	E.resetDeckAndHand(GS.state, 1, [...enemy.deck]);
	E.drawCards(GS.state, 1, 4);
	E.addCoin(GS.state, 1);   // the boss goes second: re-deal its opening Coin (resetDeckAndHand wiped createGame's)
	E.stripLoadouts(GS.state);
	applyRunAnomaly(run.anomaly);
	setRunLife((run.wins || 0) + (run.losses || 0) + 1);
	// basics are color-locked to each character's identity (see PR #85)
	GS.state.players[0].allowedBasics = Duels.allowedBasicsFor(cardsById, 'mvDeck', run.characterId);
	GS.state.players[1].allowedBasics = Duels.allowedBasicsFor(cardsById, 'mvDeck', enemy.name);
	log(`Lorequest: Multiverse - ${winLossLabel(run)}. Facing ${enemy.name} (${Multiverse.rungLabel(run.wins || 0)}).`);
	log(`You are ${run.characterId} with a ${run.deck.length}-card deck; ${enemy.name} fields ${enemy.deck.length} at win-parity.`);
}

export function multiverseVictory(run) { afterMultiverseGame(run, true); }
export function multiverseDefeat(run) { afterMultiverseGame(run, false); }

function afterMultiverseGame(run, won) {
	if (won) run.wins = (run.wins || 0) + 1; else run.losses = (run.losses || 0) + 1;
	beginPostGame(run, won);   // checkpoint: a reload resumes the reward, not the fight
	saveMultiverse(run);
	if (run.wins >= Multiverse.WINS_TO_CLEAR) { multiverseRunComplete(run); return; }
	if (run.losses >= Multiverse.LOSSES_TO_END) { multiverseRunOver(run); return; }
	if (won) multiverseLoot(run); else advanceMultiverse(run);
}

// win loot: choose 1 of 3 class buckets (3 cards each); all 3 join your deck (the enemy matches at parity)
export function multiverseLoot(run) {
	const lootRng = postGameRng(run, 1);   // same offer after a reload
	const cls = [run.cls];
	const el = dungeonOverlay(`WIN - ${run.wins}/12`, 'Choose a loot bucket - all 3 cards join your deck. (The next foe matches your loot.)');
	const offered = Duels.offerBuckets(GS.multiverseCardsById, cls, lootRng, 3);
	const row = document.createElement('div');
	row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
	for (const bucket of offered) {
		const ids = Duels.rollBucket(GS.multiverseCardsById, cls, bucket, lootRng, 3);
		const box = document.createElement('div');
		box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;max-width:330px;';
		box.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;letter-spacing:1px;">${bucket.name}</div>`;
		for (const id of ids) if (GS.multiverseCardsById[id]) box.appendChild(miniFace(GS.multiverseCardsById[id]));
		box.appendChild(document.createElement('br'));
		box.appendChild(overlayButton('Take these', () => { run.deck.push(...ids); afterMultiverseBucket(run); }));
		row.appendChild(box);
	}
	el.appendChild(row);
}

// milestone wins (2/5/8/11) also grant a treasure card, then the next fight
export function afterMultiverseBucket(run) {
	postGameStage(run, 2, saveMultiverse);   // the step-1 pick is saved
	const lootRng = postGameRng(run, 2);
	if (Multiverse.TREASURE_WINS.includes(run.wins)) {
		const el = dungeonOverlay(`TREASURE! - ${run.wins}/12`, 'One of these joins your deck.');
		const options = Multiverse.treasurePool(GS.multiverseCardsById).filter(d => !run.deck.includes(d.id));
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (let i = 0; i < 3 && options.length; i++) {
			const d = options.splice(Math.floor(lootRng() * options.length), 1)[0];
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;';
			box.appendChild(miniFace(d));
			box.appendChild(document.createElement('br'));
			box.appendChild(overlayButton('Take it', () => { run.deck.push(d.id); advanceMultiverse(run); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	} else advanceMultiverse(run);
}

export function advanceMultiverse(run) {
	delete run.postGame;   // the reward is done: the next fight is the checkpoint now
	run.enemy = genMultiverseEnemy(GS.multiverseCardsById, run.wins || 0, run.enemy && run.enemy.id, noteFaced(run));
	saveMultiverse(run);
	const el = dungeonOverlay(`NEXT: ${run.enemy.name}`, `${winLossLabel(run)} - your deck is ${run.deck.length} cards. (${Multiverse.rungLabel(run.wins || 0)})`);
	el.appendChild(overlayButton('Fight!', fightNow));
}

function multiverseRunComplete(run) {
	try { localStorage.setItem(MULTIVERSE_UNLOCK_KEY, '1'); } catch (e) { }
	const el = dungeonOverlay('12 WINS - THE MULTIVERSE IS SAVED!',
		`${run.characterId} clears the Multiverse with a ${run.deck.length}-card deck. Silver Surfer is now a playable hero!`);
	Col.earnGold(1000);
	mpRunReward(el, 'win', { wins: run.wins || 0, losses: run.losses || 0, hero: run.characterId });
	addRunReplayButtons(el, run, 'multiverse'); // before the clear — the ids live on the run
	clearMultiverse();
	el.appendChild(overlayButton('New Run (+1000 gold banked)', () => location.reload()));
}

function multiverseRunOver(run) {
	const el = dungeonOverlay('3 LOSSES - THE VILLAINS PREVAIL', `${run.characterId} falls at ${run.wins || 0} wins.`);
	clearMultiverse();
	mpRunReward(el, 'loss', { wins: run.wins || 0, losses: run.losses || 0, hero: run.characterId });
	el.appendChild(overlayButton('New Run', () => location.reload()));
}

