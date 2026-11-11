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

// ---------- Lorequest: Middle-earth (dungeon run) ----------
// Pick ONE hero (10-card singleton starter). Climb rungs of Sauron's forces — each a STATIC
// 15×2 = 30-card deck with its own UNIQUE signature hero power — to 12 wins or 3 losses. No
// win-parity: enemies never gain buckets/treasures; difficulty scales by RUNG only. Every win
// grows YOUR deck: a spoils draft (1 of 3 from the fallen foe) + an alternating treasure/bucket.
GS.middleearthCardsById = null;

export function resumeMiddleEarthOverlay(run) {
	return new Promise(resolve => {
		const el = dungeonOverlay('MIDDLE-EARTH RUN IN PROGRESS',
			`${run.characterId} - ${winLossLabel(run)}, ${run.deck.length} cards. Reach 12 wins before 3 losses.`);
		el.appendChild(overlayButton('Continue the run', () => { hideDungeonOverlay(); resolve(true); }));
		el.appendChild(overlayButton('Abandon - start a new run', () => { hideDungeonOverlay(); resolve(false); }));
	});
}

// full choice of all 10 heroes (+ Tom Bombadil once unlocked), each showing its signature + power
export async function pickMiddleEarthHeroOverlay(cardsById) {
	// account progression: 3 random UNLOCKED characters per run (secret heroes
	// join the pool once their own unlock fires). Free play = the full roster.
	let stats = null;
	if (MP_ON) {
		try { stats = (await MPX.freshState())?.stats || null; }
		catch (e) { stats = MPX.cachedState()?.stats || null; }
	}
	const pool = Middleearth.unlockedCharacters(stats);
	if (middleearthTomUnlocked()) for (const sh of Middleearth.SECRET_HEROES) if (!pool.includes(sh)) pool.push(sh);
	return new Promise(resolve => {
		const heroes = stats ? Lorequest.offerFrom(pool, Math.random, 3, Lorequest.streakPins(pool, stats, 'middleearth', Math.random)) : pool;
		const el = dungeonOverlay('CHOOSE YOUR HERO', 'Pick a hero of the Free Peoples - a 10-card starter deck you grow as you climb.');
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:12px;max-width:920px;';
		for (const ch of heroes) {
			const cls = Middleearth.classOf(ch);
			const stk = stats?.chars?.['middleearth|' + ch]?.streak || 0;
			const clsName = (GS.classRegistry.find(c => c.id === cls)?.name) || cls;
			const sig = Object.values(cardsById).find(d => d.meDeck === ch && d.rarity === 'legendary');
			const pw = Middleearth.powerOf(ch);
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
			title: 'MIDDLE-EARTH', modeKey: 'middleearth', cardsById, stats,
			heroes: Middleearth.HEROES, order: Middleearth.CORE_UNLOCK_ORDER, starters: Middleearth.STARTERS,
			enemies: Middleearth.ENEMIES, unlocks: Middleearth.ENEMY_UNLOCKS, deckTag: 'meDeck',
			secrets: Middleearth.SECRET_HEROES, secretOn: () => middleearthTomUnlocked(),
			unlockedList: pool,
		})));
	});
}

// roll the next enemy: rung by `wins`, avoiding an immediate repeat. STATIC (no loot/parity).
export function genMiddleEarthEnemy(cardsById, wins, avoidId, faced) {
	const character = Middleearth.randomEnemy(wins, Math.random, avoidId, faced);
	return Middleearth.generateEnemy(cardsById, character);
}

// seat a Middle-earth character: its class (for buckets/color) but its OWN unique hero power
function middleEarthSeat(character) {
	const cls = Middleearth.classOf(character);
	const def = GS.classRegistry.find(c => c.id === cls) || { id: cls, power: null };
	return { ...def, id: cls, name: character, power: Middleearth.powerOf(character) };
}

export function bootMiddleEarthEncounter(cardsById, run) {
	GS.middleearthCardsById = cardsById;
	const enemy = run.enemy || (run.enemy = genMiddleEarthEnemy(cardsById, run.wins || 0, null));
	GS.heistBossName = enemy.name; // shared enemy-name slot for nameOf()
	const picks = [middleEarthSeat(run.characterId), middleEarthSeat(enemy.name)];
	GS.state = E.createGame(cardsById, seededGame(), [...run.deck], 2, picks); // seeded -> snapshot-able for resume
	GS.state.classPicks = picks;
	E.resetDeckAndHand(GS.state, 1, [...enemy.deck]);
	E.drawCards(GS.state, 1, 4);
	E.addCoin(GS.state, 1);   // the boss goes second: re-deal its opening Coin (resetDeckAndHand wiped createGame's)
	E.stripLoadouts(GS.state);
	applyRunAnomaly(run.anomaly);
	setRunLife((run.wins || 0) + (run.losses || 0) + 1);
	// basics are color-locked to each character's identity (see PR #85)
	GS.state.players[0].allowedBasics = Duels.allowedBasicsFor(cardsById, 'meDeck', run.characterId);
	GS.state.players[1].allowedBasics = Duels.allowedBasicsFor(cardsById, 'meDeck', enemy.name);
	log(`Lorequest: Middle-earth - ${winLossLabel(run)}. Facing ${enemy.name} (${Middleearth.rungLabel(run.wins || 0)}).`);
	log(`You are ${run.characterId} with a ${run.deck.length}-card deck; ${enemy.name} fields ${enemy.deck.length}.`);
}

export function middleEarthVictory(run) { afterMiddleEarthGame(run, true); }
export function middleEarthDefeat(run) { afterMiddleEarthGame(run, false); }

function afterMiddleEarthGame(run, won) {
	if (won) run.wins = (run.wins || 0) + 1; else run.losses = (run.losses || 0) + 1;
	beginPostGame(run, won);   // checkpoint: a reload resumes the reward, not the fight
	saveMiddleearth(run);
	if (run.wins >= Middleearth.WINS_TO_CLEAR) { middleEarthRunComplete(run); return; }
	if (run.losses >= Middleearth.LOSSES_TO_END) { middleEarthRunOver(run); return; }
	if (won) middleEarthLoot(run); else advanceMiddleEarth(run);
}

// win loot step 1 — SPOILS: take 1 of 3 cards drawn from the vanquished foe's own deck, or none
export function middleEarthLoot(run) {
	const lootRng = postGameRng(run, 1);   // same offer after a reload
	const fallen = run.enemy ? run.enemy.name : null;
	const options = fallen ? Middleearth.spoilsChoices(GS.middleearthCardsById, fallen, lootRng, 3) : [];
	const el = dungeonOverlay(`WIN - ${run.wins}/12`, `Spoils of war: take one card from ${fallen || 'the fallen'}'s arsenal, or leave it.`);
	const row = document.createElement('div');
	row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
	for (const id of options) {
		if (!GS.middleearthCardsById[id]) continue;
		const box = document.createElement('div');
		box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;';
		box.appendChild(miniFace(GS.middleearthCardsById[id]));
		box.appendChild(document.createElement('br'));
		box.appendChild(overlayButton('Take it', () => { run.deck.push(id); afterMiddleEarthReward(run); }));
		row.appendChild(box);
	}
	el.appendChild(row);
	el.appendChild(overlayButton('Take none', () => afterMiddleEarthReward(run)));
}

// win loot step 2 — ALTERNATING AID: a treasure on odd wins, a class bucket on even wins
export function afterMiddleEarthReward(run) {
	postGameStage(run, 2, saveMiddleearth);   // the step-1 pick is saved
	const lootRng = postGameRng(run, 2);
	if (Middleearth.rewardForWin(run.wins) === 'bucket') {
		const cls = [run.cls];
		const el = dungeonOverlay(`AID - ${run.wins}/12`, 'Choose a loot bucket - all 3 cards join your deck.');
		const offered = Duels.offerBuckets(GS.middleearthCardsById, cls, lootRng, 3);
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (const bucket of offered) {
			const ids = Duels.rollBucket(GS.middleearthCardsById, cls, bucket, lootRng, 3);
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;max-width:330px;';
			box.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;letter-spacing:1px;">${bucket.name}</div>`;
			for (const id of ids) if (GS.middleearthCardsById[id]) box.appendChild(miniFace(GS.middleearthCardsById[id]));
			box.appendChild(document.createElement('br'));
			box.appendChild(overlayButton('Take these', () => { run.deck.push(...ids); advanceMiddleEarth(run); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	} else {
		const el = dungeonOverlay(`TREASURE! - ${run.wins}/12`, 'One of these joins your deck.');
		const options = Middleearth.treasurePool(GS.middleearthCardsById).filter(d => !run.deck.includes(d.id));
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (let i = 0; i < 3 && options.length; i++) {
			const d = options.splice(Math.floor(lootRng() * options.length), 1)[0];
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;';
			box.appendChild(miniFace(d));
			box.appendChild(document.createElement('br'));
			box.appendChild(overlayButton('Take it', () => { run.deck.push(d.id); advanceMiddleEarth(run); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	}
}

export function advanceMiddleEarth(run) {
	delete run.postGame;   // the reward is done: the next fight is the checkpoint now
	run.enemy = genMiddleEarthEnemy(GS.middleearthCardsById, run.wins || 0, run.enemy && run.enemy.id, noteFaced(run));
	saveMiddleearth(run);
	const el = dungeonOverlay(`NEXT: ${run.enemy.name}`, `${winLossLabel(run)} - your deck is ${run.deck.length} cards. (${Middleearth.rungLabel(run.wins || 0)})`);
	el.appendChild(overlayButton('Fight!', fightNow));
}

function middleEarthRunComplete(run) {
	try { localStorage.setItem(MIDDLEEARTH_UNLOCK_KEY, '1'); } catch (e) { }
	const el = dungeonOverlay('12 WINS - SAURON IS THROWN DOWN!',
		`${run.characterId} clears Middle-earth with a ${run.deck.length}-card deck. Tom Bombadil is now a playable hero!`);
	Col.earnGold(1000);
	mpRunReward(el, 'win', { wins: run.wins || 0, losses: run.losses || 0, hero: run.characterId });
	addRunReplayButtons(el, run, 'middleearth'); // before the clear — the ids live on the run
	clearMiddleearth();
	el.appendChild(overlayButton('New Run (+1000 gold banked)', () => location.reload()));
}

function middleEarthRunOver(run) {
	const el = dungeonOverlay('3 LOSSES - THE SHADOW PREVAILS', `${run.characterId} falls at ${run.wins || 0} wins.`);
	clearMiddleearth();
	mpRunReward(el, 'loss', { wins: run.wins || 0, losses: run.losses || 0, hero: run.characterId });
	el.appendChild(overlayButton('New Run', () => location.reload()));
}

// ---------- Lorequest: Sword Coast (D&D) ----------
// Mirror of Middle-earth: pick 1 Companion hero (10-card starter), Advance through the
// Sword Coast's villains (rung-gated static 30-card decks) to 12 wins or 3 losses. Loot the
// fallen. Signature mechanic = Advance (venture) + d20 rolls. Data tagged scDeck/scSide, ids sc_*.
GS.swordcoastCardsById = null;

export function resumeSwordCoastOverlay(run) {
	return new Promise(resolve => {
		const el = dungeonOverlay('SWORD COAST RUN IN PROGRESS',
			`${run.characterId} - ${winLossLabel(run)}, ${run.deck.length} cards. Reach 12 wins before 3 losses.`);
		el.appendChild(overlayButton('Continue the run', () => { hideDungeonOverlay(); resolve(true); }));
		el.appendChild(overlayButton('Abandon - start a new run', () => { hideDungeonOverlay(); resolve(false); }));
	});
}

// full choice of all 10 heroes (+ Gale once unlocked), each showing its signature + power
export async function pickSwordCoastHeroOverlay(cardsById) {
	// account progression: 3 random UNLOCKED characters per run (secret heroes
	// join the pool once their own unlock fires). Free play = the full roster.
	let stats = null;
	if (MP_ON) {
		try { stats = (await MPX.freshState())?.stats || null; }
		catch (e) { stats = MPX.cachedState()?.stats || null; }
	}
	const pool = Swordcoast.unlockedCharacters(stats);
	if (swordcoastGaleUnlocked()) for (const sh of Swordcoast.SECRET_HEROES) if (!pool.includes(sh)) pool.push(sh);
	return new Promise(resolve => {
		const heroes = stats ? Lorequest.offerFrom(pool, Math.random, 3, Lorequest.streakPins(pool, stats, 'swordcoast', Math.random)) : pool;
		const el = dungeonOverlay('CHOOSE YOUR HERO', 'Pick a Companion of the Realms - a 10-card starter deck you grow as you Advance.');
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:12px;max-width:920px;';
		for (const ch of heroes) {
			const cls = Swordcoast.classOf(ch);
			const stk = stats?.chars?.['swordcoast|' + ch]?.streak || 0;
			const clsName = (GS.classRegistry.find(c => c.id === cls)?.name) || cls;
			const sig = Object.values(cardsById).find(d => d.scDeck === ch && d.rarity === 'legendary');
			const pw = Swordcoast.powerOf(ch);
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
			title: 'SWORD COAST', modeKey: 'swordcoast', cardsById, stats,
			heroes: Swordcoast.HEROES, order: Swordcoast.CORE_UNLOCK_ORDER, starters: Swordcoast.STARTERS,
			enemies: Swordcoast.ENEMIES, unlocks: Swordcoast.ENEMY_UNLOCKS, deckTag: 'scDeck',
			secrets: Swordcoast.SECRET_HEROES, secretOn: () => swordcoastGaleUnlocked(),
			unlockedList: pool,
		})));
	});
}

// roll the next enemy: rung by `wins`, avoiding an immediate repeat. STATIC (no loot/parity).
export function genSwordCoastEnemy(cardsById, wins, avoidId, faced) {
	const character = Swordcoast.randomEnemy(wins, Math.random, avoidId, faced);
	return Swordcoast.generateEnemy(cardsById, character);
}

// seat a Sword Coast character: its class (for buckets/color) but its OWN unique hero power
function swordCoastSeat(character) {
	const cls = Swordcoast.classOf(character);
	const def = GS.classRegistry.find(c => c.id === cls) || { id: cls, power: null };
	return { ...def, id: cls, name: character, power: Swordcoast.powerOf(character) };
}

export function bootSwordCoastEncounter(cardsById, run) {
	GS.swordcoastCardsById = cardsById;
	const enemy = run.enemy || (run.enemy = genSwordCoastEnemy(cardsById, run.wins || 0, null));
	GS.heistBossName = enemy.name; // shared enemy-name slot for nameOf()
	const picks = [swordCoastSeat(run.characterId), swordCoastSeat(enemy.name)];
	GS.state = E.createGame(cardsById, seededGame(), [...run.deck], 2, picks); // seeded -> snapshot-able for resume
	GS.state.classPicks = picks;
	E.resetDeckAndHand(GS.state, 1, [...enemy.deck]);
	E.drawCards(GS.state, 1, 4);
	E.addCoin(GS.state, 1);   // the boss goes second: re-deal its opening Coin (resetDeckAndHand wiped createGame's)
	E.stripLoadouts(GS.state);
	applyRunAnomaly(run.anomaly);
	setRunLife((run.wins || 0) + (run.losses || 0) + 1);
	// basics are color-locked to each character's identity (see PR #85)
	GS.state.players[0].allowedBasics = Duels.allowedBasicsFor(cardsById, 'scDeck', run.characterId);
	GS.state.players[1].allowedBasics = Duels.allowedBasicsFor(cardsById, 'scDeck', enemy.name);
	log(`Lorequest: Sword Coast - ${winLossLabel(run)}. Facing ${enemy.name} (${Swordcoast.rungLabel(run.wins || 0)}).`);
	log(`You are ${run.characterId} with a ${run.deck.length}-card deck; ${enemy.name} fields ${enemy.deck.length}.`);
}

export function swordCoastVictory(run) { afterSwordCoastGame(run, true); }
export function swordCoastDefeat(run) { afterSwordCoastGame(run, false); }

function afterSwordCoastGame(run, won) {
	if (won) run.wins = (run.wins || 0) + 1; else run.losses = (run.losses || 0) + 1;
	beginPostGame(run, won);   // checkpoint: a reload resumes the reward, not the fight
	saveSwordcoast(run);
	if (run.wins >= Swordcoast.WINS_TO_CLEAR) { swordCoastRunComplete(run); return; }
	if (run.losses >= Swordcoast.LOSSES_TO_END) { swordCoastRunOver(run); return; }
	if (won) swordCoastLoot(run); else advanceSwordCoast(run);
}

// win loot step 1 — SPOILS: take 1 of 3 cards drawn from the vanquished foe's own deck, or none
export function swordCoastLoot(run) {
	const lootRng = postGameRng(run, 1);   // same offer after a reload
	const fallen = run.enemy ? run.enemy.name : null;
	const options = fallen ? Swordcoast.spoilsChoices(GS.swordcoastCardsById, fallen, lootRng, 3) : [];
	const el = dungeonOverlay(`WIN - ${run.wins}/12`, `Spoils of war: take one card from ${fallen || 'the fallen'}'s arsenal, or leave it.`);
	const row = document.createElement('div');
	row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
	for (const id of options) {
		if (!GS.swordcoastCardsById[id]) continue;
		const box = document.createElement('div');
		box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;';
		box.appendChild(miniFace(GS.swordcoastCardsById[id]));
		box.appendChild(document.createElement('br'));
		box.appendChild(overlayButton('Take it', () => { run.deck.push(id); afterSwordCoastReward(run); }));
		row.appendChild(box);
	}
	el.appendChild(row);
	el.appendChild(overlayButton('Take none', () => afterSwordCoastReward(run)));
}

// win loot step 2 — ALTERNATING AID: a treasure on odd wins, a class bucket on even wins
export function afterSwordCoastReward(run) {
	postGameStage(run, 2, saveSwordcoast);   // the step-1 pick is saved
	const lootRng = postGameRng(run, 2);
	if (Swordcoast.rewardForWin(run.wins) === 'bucket') {
		const cls = [run.cls];
		const el = dungeonOverlay(`AID - ${run.wins}/12`, 'Choose a loot bucket - all 3 cards join your deck.');
		const offered = Duels.offerBuckets(GS.swordcoastCardsById, cls, lootRng, 3);
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (const bucket of offered) {
			const ids = Duels.rollBucket(GS.swordcoastCardsById, cls, bucket, lootRng, 3);
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;max-width:330px;';
			box.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;letter-spacing:1px;">${bucket.name}</div>`;
			for (const id of ids) if (GS.swordcoastCardsById[id]) box.appendChild(miniFace(GS.swordcoastCardsById[id]));
			box.appendChild(document.createElement('br'));
			box.appendChild(overlayButton('Take these', () => { run.deck.push(...ids); advanceSwordCoast(run); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	} else {
		const el = dungeonOverlay(`TREASURE! - ${run.wins}/12`, 'One of these joins your deck.');
		const options = Swordcoast.treasurePool(GS.swordcoastCardsById).filter(d => !run.deck.includes(d.id));
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (let i = 0; i < 3 && options.length; i++) {
			const d = options.splice(Math.floor(lootRng() * options.length), 1)[0];
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;';
			box.appendChild(miniFace(d));
			box.appendChild(document.createElement('br'));
			box.appendChild(overlayButton('Take it', () => { run.deck.push(d.id); advanceSwordCoast(run); }));
			row.appendChild(box);
		}
		el.appendChild(row);
	}
}

export function advanceSwordCoast(run) {
	delete run.postGame;   // the reward is done: the next fight is the checkpoint now
	run.enemy = genSwordCoastEnemy(GS.swordcoastCardsById, run.wins || 0, run.enemy && run.enemy.id, noteFaced(run));
	saveSwordcoast(run);
	const el = dungeonOverlay(`NEXT: ${run.enemy.name}`, `${winLossLabel(run)} - your deck is ${run.deck.length} cards. (${Swordcoast.rungLabel(run.wins || 0)})`);
	el.appendChild(overlayButton('Fight!', fightNow));
}

function swordCoastRunComplete(run) {
	try { localStorage.setItem(SWORDCOAST_UNLOCK_KEY, '1'); } catch (e) { }
	const el = dungeonOverlay(Swordcoast.clearHeadline(run.enemy && run.enemy.name),
		`${run.characterId} clears the Sword Coast with a ${run.deck.length}-card deck. Gale, Waterdeep Prodigy is now a playable hero!`);
	Col.earnGold(1000);
	mpRunReward(el, 'win', { wins: run.wins || 0, losses: run.losses || 0, hero: run.characterId });
	addRunReplayButtons(el, run, 'swordcoast'); // before the clear — the ids live on the run
	clearSwordcoast();
	el.appendChild(overlayButton('New Run (+1000 gold banked)', () => location.reload()));
}

function swordCoastRunOver(run) {
	const el = dungeonOverlay('3 LOSSES - THE REALMS FALL', `${run.characterId} falls at ${run.wins || 0} wins.`);
	clearSwordcoast();
	mpRunReward(el, 'loss', { wins: run.wins || 0, losses: run.losses || 0, hero: run.characterId });
	el.appendChild(overlayButton('New Run', () => location.reload()));
}

// ---------- Lorequest: Final Fantasy ----------
// Mirror of Sword Coast: pick 1 FF hero (10-card starter), battle FF villains (rung-gated static
// 30-card decks) to 12 wins or 3 losses. Signature mechanics = Spritsummon (random Sprit) + Limit
// Break. Data tagged ffDeck/ffSide, ids ff_*.
GS.finalfantasyCardsById = null;

export function resumeFinalFantasyOverlay(run) {
	return new Promise(resolve => {
		const el = dungeonOverlay('FINAL FANTASY RUN IN PROGRESS',
			`${run.characterId} - ${winLossLabel(run)}, ${run.deck.length} cards. Reach 12 wins before 3 losses.`);
		el.appendChild(overlayButton('Continue the run', () => { hideDungeonOverlay(); resolve(true); }));
		el.appendChild(overlayButton('Abandon - start a new run', () => { hideDungeonOverlay(); resolve(false); }));
	});
}

// full choice of all 10 heroes (+ Gilgamesh once unlocked), each showing its signature + power
export async function pickFinalFantasyHeroOverlay(cardsById) {
	// account progression: 3 random UNLOCKED characters per run (secret heroes
	// join the pool once their own unlock fires). Free play = the full roster.
	let stats = null;
	if (MP_ON) {
		try { stats = (await MPX.freshState())?.stats || null; }
		catch (e) { stats = MPX.cachedState()?.stats || null; }
	}
	const pool = Finalfantasy.unlockedCharacters(stats);
	if (finalfantasyGilgameshUnlocked()) for (const sh of Finalfantasy.SECRET_HEROES) if (!pool.includes(sh)) pool.push(sh);
	return new Promise(resolve => {
		const heroes = stats ? Lorequest.offerFrom(pool, Math.random, 3, Lorequest.streakPins(pool, stats, 'finalfantasy', Math.random)) : pool;
		const el = dungeonOverlay('CHOOSE YOUR HERO', 'Pick a Final Fantasy hero - a 10-card starter deck you grow as you climb.');
		const row = document.createElement('div');
		row.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:12px;max-width:920px;';
		for (const ch of heroes) {
			const cls = Finalfantasy.classOf(ch);
			const stk = stats?.chars?.['finalfantasy|' + ch]?.streak || 0;
			const clsName = (GS.classRegistry.find(c => c.id === cls)?.name) || cls;
			const sig = Object.values(cardsById).find(d => d.ffDeck === ch && d.rarity === 'legendary');
			const pw = Finalfantasy.powerOf(ch);
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
			title: 'FINAL FANTASY', modeKey: 'finalfantasy', cardsById, stats,
			heroes: Finalfantasy.HEROES, order: Finalfantasy.CORE_UNLOCK_ORDER, starters: Finalfantasy.STARTERS,
			enemies: Finalfantasy.ENEMIES, unlocks: Finalfantasy.ENEMY_UNLOCKS, deckTag: 'ffDeck',
			secrets: Finalfantasy.SECRET_HEROES, secretOn: () => finalfantasyGilgameshUnlocked(),
			unlockedList: pool,
		})));
	});
}

export function genFinalFantasyEnemy(cardsById, wins, avoidId, faced) {
	const character = Finalfantasy.randomEnemy(wins, Math.random, avoidId, faced);
	return Finalfantasy.generateEnemy(cardsById, character);
}

function finalFantasySeat(character) {
	const cls = Finalfantasy.classOf(character);
	const def = GS.classRegistry.find(c => c.id === cls) || { id: cls, power: null };
	return { ...def, id: cls, name: character, power: Finalfantasy.powerOf(character) };
}

export function bootFinalFantasyEncounter(cardsById, run) {
	GS.finalfantasyCardsById = cardsById;
	const enemy = run.enemy || (run.enemy = genFinalFantasyEnemy(cardsById, run.wins || 0, null));
	GS.heistBossName = enemy.name; // shared enemy-name slot for nameOf()
	const picks = [finalFantasySeat(run.characterId), finalFantasySeat(enemy.name)];
	GS.state = E.createGame(cardsById, seededGame(), [...run.deck], 2, picks); // seeded -> snapshot-able for resume
	GS.state.classPicks = picks;
	E.resetDeckAndHand(GS.state, 1, [...enemy.deck]);
	E.drawCards(GS.state, 1, 4);
	E.addCoin(GS.state, 1);   // the boss goes second: re-deal its opening Coin (resetDeckAndHand wiped createGame's)
	E.stripLoadouts(GS.state);
	applyRunAnomaly(run.anomaly);
	setRunLife((run.wins || 0) + (run.losses || 0) + 1);
	// basics are color-locked to each character's identity (see PR #85)
	GS.state.players[0].allowedBasics = Duels.allowedBasicsFor(cardsById, 'ffDeck', run.characterId);
	GS.state.players[1].allowedBasics = Duels.allowedBasicsFor(cardsById, 'ffDeck', enemy.name);
	log(`Lorequest: Final Fantasy - ${winLossLabel(run)}. Facing ${enemy.name} (${Finalfantasy.rungLabel(run.wins || 0)}).`);
	log(`You are ${run.characterId} with a ${run.deck.length}-card deck; ${enemy.name} fields ${enemy.deck.length}.`);
}

export function finalFantasyVictory(run) { afterFinalFantasyGame(run, true); }
export function finalFantasyDefeat(run) { afterFinalFantasyGame(run, false); }

function afterFinalFantasyGame(run, won) {
	if (won) run.wins = (run.wins || 0) + 1; else run.losses = (run.losses || 0) + 1;
	beginPostGame(run, won);   // checkpoint: a reload resumes the reward, not the fight
	saveFinalfantasy(run);
	if (run.wins >= Finalfantasy.WINS_TO_CLEAR) { finalFantasyRunComplete(run); return; }
	if (run.losses >= Finalfantasy.LOSSES_TO_END) { finalFantasyRunOver(run); return; }
	if (won) finalFantasyLoot(run); else advanceFinalFantasy(run);
}

export function finalFantasyLoot(run) {
	const lootRng = postGameRng(run, 1);   // same offer after a reload
	const fallen = run.enemy ? run.enemy.name : null;
	const options = fallen ? Finalfantasy.spoilsChoices(GS.finalfantasyCardsById, fallen, lootRng, 3) : [];
	const el = dungeonOverlay(`WIN - ${run.wins}/12`, `Spoils of war: take one card from ${fallen || 'the fallen'}'s arsenal, or leave it.`);
	const rowr = document.createElement('div');
	rowr.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
	for (const id of options) {
		if (!GS.finalfantasyCardsById[id]) continue;
		const box = document.createElement('div');
		box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;';
		box.appendChild(miniFace(GS.finalfantasyCardsById[id]));
		box.appendChild(document.createElement('br'));
		box.appendChild(overlayButton('Take it', () => { run.deck.push(id); afterFinalFantasyReward(run); }));
		rowr.appendChild(box);
	}
	el.appendChild(rowr);
	el.appendChild(overlayButton('Take none', () => afterFinalFantasyReward(run)));
}

export function afterFinalFantasyReward(run) {
	postGameStage(run, 2, saveFinalfantasy);   // the step-1 pick is saved
	const lootRng = postGameRng(run, 2);
	if (Finalfantasy.rewardForWin(run.wins) === 'bucket') {
		const cls = [run.cls];
		const el = dungeonOverlay(`AID - ${run.wins}/12`, 'Choose a loot bucket - all 3 cards join your deck.');
		const offered = Duels.offerBuckets(GS.finalfantasyCardsById, cls, lootRng, 3);
		const rowr = document.createElement('div');
		rowr.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (const bucket of offered) {
			const ids = Duels.rollBucket(GS.finalfantasyCardsById, cls, bucket, lootRng, 3);
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;max-width:330px;';
			box.innerHTML = `<div style="font-weight:bold;margin-bottom:8px;letter-spacing:1px;">${bucket.name}</div>`;
			for (const id of ids) if (GS.finalfantasyCardsById[id]) box.appendChild(miniFace(GS.finalfantasyCardsById[id]));
			box.appendChild(document.createElement('br'));
			box.appendChild(overlayButton('Take these', () => { run.deck.push(...ids); advanceFinalFantasy(run); }));
			rowr.appendChild(box);
		}
		el.appendChild(rowr);
	} else {
		const el = dungeonOverlay(`TREASURE! - ${run.wins}/12`, 'One of these joins your deck.');
		const options = Finalfantasy.treasurePool(GS.finalfantasyCardsById).filter(d => !run.deck.includes(d.id));
		const rowr = document.createElement('div');
		rowr.style.cssText = 'display:flex;flex-wrap:wrap;justify-content:center;gap:14px;';
		for (let i = 0; i < 3 && options.length; i++) {
			const d = options.splice(Math.floor(lootRng() * options.length), 1)[0];
			const box = document.createElement('div');
			box.style.cssText = 'background:#1c1830;border:1px solid #8a6f3a;border-radius:10px;padding:12px;';
			box.appendChild(miniFace(d));
			box.appendChild(document.createElement('br'));
			box.appendChild(overlayButton('Take it', () => { run.deck.push(d.id); advanceFinalFantasy(run); }));
			rowr.appendChild(box);
		}
		el.appendChild(rowr);
	}
}

export function advanceFinalFantasy(run) {
	delete run.postGame;   // the reward is done: the next fight is the checkpoint now
	run.enemy = genFinalFantasyEnemy(GS.finalfantasyCardsById, run.wins || 0, run.enemy && run.enemy.id, noteFaced(run));
	saveFinalfantasy(run);
	const el = dungeonOverlay(`NEXT: ${run.enemy.name}`, `${winLossLabel(run)} - your deck is ${run.deck.length} cards. (${Finalfantasy.rungLabel(run.wins || 0)})`);
	el.appendChild(overlayButton('Fight!', fightNow));
}

function finalFantasyRunComplete(run) {
	try { localStorage.setItem(FINALFANTASY_UNLOCK_KEY, '1'); } catch (e) { }
	const el = dungeonOverlay('12 WINS - THE VOID IS SEALED!',
		`${run.characterId} clears Final Fantasy with a ${run.deck.length}-card deck. Gilgamesh is now a playable hero!`);
	Col.earnGold(1000);
	mpRunReward(el, 'win', { wins: run.wins || 0, losses: run.losses || 0, hero: run.characterId });
	addRunReplayButtons(el, run, 'finalfantasy'); // before the clear — the ids live on the run
	clearFinalfantasy();
	el.appendChild(overlayButton('New Run (+1000 gold banked)', () => location.reload()));
}

function finalFantasyRunOver(run) {
	const el = dungeonOverlay('3 LOSSES - GAME OVER', `${run.characterId} falls at ${run.wins || 0} wins.`);
	clearFinalfantasy();
	mpRunReward(el, 'loss', { wins: run.wins || 0, losses: run.losses || 0, hero: run.characterId });
	el.appendChild(overlayButton('New Run', () => location.reload()));
}

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

