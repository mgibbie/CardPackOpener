// contest_ui.js — the Lilycove CONTEST, the way pokeemerald plays it:
//
//   the reception counter  LilycoveCity_ContestLobby_EventScript_SpeakToContestReceptionist
//                          and the rank -> category -> POKéMON -> TryEnterContestMon chain
//                          (data/scripts/contest_hall.inc), in the overworld's own text box
//                          and multichoice, with the decomp's strings
//   the introduction       ContestHall_EventScript_ShowContestMons: the MC presents each
//                          entry and the audience hearts follow GetNumberOfHearts<Rank>
//                          (primary judging = CalculateRound1Points)
//   the appeals            src/contest.c on its own 240x160 screen (stage, contestant boxes,
//                          judge, applause meter, slider hearts, next-turn plates, the move-
//                          select screen) — scoring in contest_engine.js, graphics from
//                          graphics/contest (tools/gen_contest_gfx.py)
//   the results            src/contest_util.c's results board, then the hall's prize
//                          scripts: GiveMonContestRibbon, the LUXURY BALL for a repeat
//                          MASTER win, ShouldReadyContestArtist's museum painting
//
// What is simplified: the hall is not walked (the MC's lines play over the stage), the
// move animations are a slide-in of the POKéMON's sprite, the party is picked from a
// list instead of the party screen, the results board is drawn without its sliding
// bars' animation.
import * as Bag from './bag.js';
import { startChoice } from './choice.js';
import { CATS, Contest, RANKS, entryEligibility, hasWonBefore, makeRng, ribbonRank } from './contest_engine.js';
import { getImage } from './engine.js';
import * as Story from './events.js';
import { Journal } from './journal.js';
import { battle, dialog } from './ow_core.js';
import { S } from './ow_state.js';
import { saveParty } from './party.js';
import { safeLoad, safeSave } from './safestore.js';
import { sfx } from './sound.js';

export const CONTEST_KEY = 'magepunk_contest_v1';
export function contestProgress() { return safeLoad(CONTEST_KEY, { ranks: { cool: 0, beauty: 0, cute: 0, smart: 0, tough: 0 } }); }

// the appeal screen's state. `st` (the running Contest) is set while the stage shows,
// which is what ow_music.js keys the contest theme on.
export const contestMenu = { open: false, st: null, phase: 'off', sprites: {}, busy: false };

let D = null, gfx = null, loading = null;
const asset = f => new URL(f, import.meta.url).href;
export function loadContestData() {
	if (D && gfx) return Promise.resolve();
	if (!loading) {
		loading = Promise.all([
			fetch(asset('contest_emerald.json')).then(r => r.json()),
			fetch(asset('minigames/contest/sprites.json')).then(r => r.json()),
			...['stage', 'moveselect', 'sprites', 'box0', 'box1', 'box2', 'box3'].map(n => loadImg(asset(`minigames/contest/${n}.png`))),
		]).then(([data, meta, stage, moveselect, sprites, ...boxes]) => {
			D = data;
			gfx = { rects: meta.rects, stage, moveselect, sprites, boxes, results: {} };
		}).catch(e => { loading = null; throw e; });
	}
	return loading;
}
function loadImg(url) {
	return new Promise((res, rej) => { const i = new Image(); i.onload = () => res(i); i.onerror = rej; i.src = url; });
}
function resultsImg(cat, rank) {
	const k = `${cat}_${rank}`;
	if (!(k in gfx.results)) { gfx.results[k] = null; loadImg(asset(`minigames/contest/results_${k}.png`)).then(i => { gfx.results[k] = i; }).catch(() => {}); }
	return gfx.results[k];
}

export function contestSpriteFor(speciesId) {
	if (!(speciesId in contestMenu.sprites)) {
		contestMenu.sprites[speciesId] = null;
		const sp = battle.data?.species?.[speciesId];
		if (sp?.sprite) getImage(`data/pokemon/${sp.sprite}`).then(img => { contestMenu.sprites[speciesId] = img; }).catch(() => {});
	}
	return contestMenu.sprites[speciesId];
}

// ---------- the text helpers ----------
const playerName = () => { try { return localStorage.getItem('magepunk_name') || 'PLAYER'; } catch (e) { return 'PLAYER'; } };
const T = (key, v1, v2, v3) => {
	const raw = (D.text[key] ?? key).replace(/\{STR_VAR_1\}/g, v1 ?? '').replace(/\{STR_VAR_2\}/g, v2 ?? '').replace(/\{STR_VAR_3\}/g, v3 ?? '');
	return raw.replace(/\{PLAYER\}/g, playerName());
};
// the overworld text box: \f is a new page
const say = text => new Promise(res => dialog.open(Story.normalizeText(text.replace(/\f/g, '\n\n'), { playerName: playerName() }), k => res(k)));
const choose = (prompt, options) => new Promise(res => startChoice({ options, promptText: Story.normalizeText(prompt, { playerName: playerName() }), ignoreB: false, onPick: v => res(v) }));
const yesNo = async text => (await choose(text, ['YES', 'NO'])) === 0;
const monName = m => m.nickname || m.name;
const moveNameOf = id => battle.data?.moves?.[id]?.name || (id ? id.toUpperCase() : '');
const CONTEST_NAMES = ['gText_CoolnessContest', 'gText_BeautyContest', 'gText_CutenessContest', 'gText_SmartnessContest', 'gText_ToughnessContest'];

// ---------- the reception counter ----------
// LilycoveCity_ContestLobby_EventScript_ContestReceptionist (data/scripts/contest_hall.inc)
export async function contestReception() {
	if (contestMenu.busy) return;
	contestMenu.busy = true;
	try {
		await loadContestData();
		await receptionist();
	} catch (e) {
		console.warn('[contest]', e);
	} finally {
		contestMenu.busy = false;
	}
}
async function receptionist() {
	// a prize left at the counter (VAR_CONTEST_PRIZE_PICKUP: a LUXURY BALL the bag had no room for)
	const p = contestProgress();
	if (p.prizePickup) {
		await say(T('LilycoveCity_ContestLobby_Text_PokemonWonWeHavePrize'));
		if (Bag.addItem('luxuryball', 1) !== false) { delete p.prizePickup; safeSave(CONTEST_KEY, p); }
		else await say(T('LilycoveCity_ContestLobby_Text_ComeBackForPrizeLater'));
		return;
	}
	// the POKéBLOCK CASE, when this build has one to give
	// (LilycoveCity_ContestLobby_EventScript_GivePokeblockCase, then on to the question)
	if (Bag.ITEMS?.pokeblockcase && !Story.getFlag('FLAG_RECEIVED_POKEBLOCK_CASE') && !Bag.count('pokeblockcase')) {
		await say(T('LilycoveCity_ContestLobby_Text_ReceptionDontHavePokeblockCase'));
		Bag.addItem('pokeblockcase', 1);
		Story.setFlag('FLAG_RECEIVED_POKEBLOCK_CASE');
		sfx('item_get');
		await say(`${playerName().toUpperCase()} received the POKeBLOCK CASE!`);
		await say(T('LilycoveCity_ContestLobby_Text_NowThatWeveClearedThatUp'));
	} else await say(T('LilycoveCity_ContestLobby_Text_ContestReception'));
	for (;;) {
		// AskEnterContest: MULTI_ENTERINFO
		const a = await choose(T('LilycoveCity_ContestLobby_Text_EnterContest1'), [T('gText_Enter2'), T('gText_Info2'), T('gText_Exit')]);
		if (a === 1) {
			for (;;) {
				const t = await choose(T('LilycoveCity_ContestLobby_Text_WhichTopic1'), [T('gText_WhatsAContest'), T('gText_TypesOfContests'), T('gText_Ranks'), T('gText_Cancel2')]);
				if (t === 0) await say(T('LilycoveCity_ContestLobby_Text_ExplainContests'));
				else if (t === 1) await say(T('LilycoveCity_ContestLobby_Text_ExplainContestTypes'));
				else if (t === 2) await say(T('LilycoveCity_ContestLobby_Text_ExplainContestRanks'));
				else break;
			}
			continue;
		}
		if (a !== 0) return cancel();
		// ChooseContestRank: MULTI_CONTEST_RANK
		const rank = await choose(T('LilycoveCity_ContestLobby_Text_EnterWhichRank'), [T('gText_NormalRank'), T('gText_SuperRank'), T('gText_HyperRank'), T('gText_MasterRank'), T('gText_Exit')]);
		if (rank < 0 || rank > 3) return cancel();
		// ChooseContestType: MULTI_CONTEST_TYPE
		const cat = await choose(T('LilycoveCity_ContestLobby_Text_EnterWhichContest1'), [...CONTEST_NAMES.map(n => T(n)), T('gText_Exit')]);
		if (cat < 0 || cat > 4) return cancel();
		// ChooseContestMon: choosecontestmon + TryEnterContestMon
		for (;;) {
			const party = S.party || [];
			const pick = await choose(T('LilycoveCity_ContestLobby_Text_EnterWhichPokemon1'), [...party.map(m => `${monName(m)}  Lv${m.level ?? ''}`), 'CANCEL']);
			if (pick < 0 || pick >= party.length) return cancel();
			const mon = party[pick];
			const e = entryEligibility(mon, cat, rank);
			if (e === 'low') { await say(T('LilycoveCity_ContestLobby_Text_MonNotQualifiedForRank')); continue; }
			if (e === 'egg') { await say(T('LilycoveCity_ContestLobby_Text_EggCannotTakePart')); continue; }
			if (e === 'fainted') { await say(T('LilycoveCity_ContestLobby_Text_MonInNoConditionForContest')); continue; }
			if (e === 'high' && !(await yesNo(T('LilycoveCity_ContestLobby_Text_AlreadyWonEnterAnyway')))) continue;
			await say(T('LilycoveCity_ContestLobby_Text_YourMonIsEntryNum4'));
			await runContest(mon, cat, rank);
			return;
		}
	}
}
const cancel = () => say(T('LilycoveCity_ContestLobby_Text_ParticipateAnotherTime'));

// ---------- the contest itself ----------
const view = {
	phase: 'off', text: '', pages: [], queue: [], wait: null, order: [0, 1, 2, 3], hearts: [0, 0, 0, 0], stars: [0, 0, 0, 0],
	totals: [0, 0, 0, 0], applause: 0, judge: null, judgeT: 0, active: -1, introMon: -1, introHearts: 0, choice: 0,
};

function playerEntry(mon) {
	const c = mon.contest || {};
	return {
		name: monName(mon), trainer: playerName(), species: mon.speciesId,
		moves: (mon.moves || []).map(m => m.id).slice(0, 4),
		cool: c.cool | 0, beauty: c.beauty | 0, cute: c.cute | 0, smart: c.smart | 0, tough: c.tough | 0, sheen: c.sheen | 0,
	};
}

// a key press wakes whatever the screen is waiting on
let keyWaiter = null;
const waitKey = keys => new Promise(res => { keyWaiter = { keys, res }; });
const sleep = ms => (contestMenu.fast ? Promise.resolve() : new Promise(res => setTimeout(res, ms))); // tests skip the animation beats
async function showText(text) {
	for (const page of text.split('\f')) {
		view.text = page;
		await waitKey(['A']);
	}
	view.text = '';
}

export async function runContest(mon, cat, rank, opts = {}) {
	await loadContestData();
	const st = new Contest({
		data: D, category: cat, rank, player: playerEntry(mon),
		rng: opts.rng || (contestMenu.seed != null ? makeRng(contestMenu.seed) : undefined), // tests pin the draw
		postgame: Story.getFlag('FLAG_SYS_GAME_CLEAR') || Story.getFlag('game_clear'),
		battleTypeOf: id => battle.data?.moves?.[id]?.type,
	});
	st.moveNames = new Proxy({}, { get: (_, id) => moveNameOf(id) });
	for (const m of st.mons) contestSpriteFor(m.species);
	Object.assign(view, { phase: 'intro', text: '', order: [...st.turnOrder], hearts: [0, 0, 0, 0], stars: [0, 0, 0, 0], totals: [0, 0, 0, 0], applause: 0, judge: null, active: -1, introMon: -1, choice: 0 });
	contestMenu.st = st;
	contestMenu.open = true;
	contestMenu.mon = mon;
	try { await import('./ow_music.js').then(m => m.syncMapBgm()); } catch (e) { /* headless */ }
	try {
		await introduction(st);
		while (!st.done) await appealRound(st);
		await results(st);
	} finally {
		contestMenu.open = false;
		contestMenu.st = null;
		view.phase = 'off';
		try { (await import('./ow_music.js')).syncMapBgm(); } catch (e) { /* headless */ }
	}
	await prizes(st, mon, cat, rank);
	return st;
}

// ContestHall_EventScript_ContestGettingStarted + ShowContestMons + AudienceVote
async function introduction(st) {
	view.phase = 'intro';
	await showText(T('ContestHall_Text_GettingStartedParticipantsAsFollows', null, T(CONTEST_NAMES[st.category]), RANKS[st.rank]));
	for (let i = 0; i < 4; i++) {
		view.introMon = i;
		view.introHearts = st.introHearts(i);
		if (view.introHearts) sfx('heal');
		await showText(T('ContestHall_Text_EntryXTrainersMon', st.mons[i].trainer, String(i + 1), st.mons[i].name));
	}
	view.introMon = -1;
	await showText(T('ContestHall_Text_SeenContestantsAudienceWillVote'));
	await showText(T('ContestHall_Text_VotingUnderWay'));
	await showText(T('ContestHall_Text_VotingCompleteLetsAppeal'));
	view.phase = 'stage';
}

// Task_DisplayAppealNumberText -> move select -> Task_DoAppeals -> the round end
async function appealRound(st) {
	view.phase = 'stage';
	const n = String(st.appealNumber + 1);
	let choice = 0;
	if (st.isTurnDisabled(st.playerIndex)) {
		await showText(T('gText_AppealNumButItCantParticipate', n));
	} else {
		// Task_DisplayAppealNumberText prints in the stage's text box, then the move select opens
		await showText(T('gText_AppealNumWhichMoveWillBePlayed', n));
		view.phase = 'select';
		view.choice = Math.min(view.choice, st.mons[st.playerIndex].moves.filter(Boolean).length - 1);
		for (;;) {
			const k = await waitKey(['A', 'UP', 'DOWN']);
			const moves = st.mons[st.playerIndex].moves;
			const count = moves.filter(Boolean).length;
			if (k === 'UP') { view.choice = (view.choice + count - 1) % count; sfx('ui_move'); }
			else if (k === 'DOWN') { view.choice = (view.choice + 1) % count; sfx('ui_move'); }
			else { choice = view.choice; sfx('ui_select'); break; }
		}
		view.text = '';
		view.phase = 'stage';
	}
	const events = st.playAppeal(choice);
	for (const e of events) await play(st, e);
	view.active = -1;
}

const SYMBOL_SFX = ['ui_denied', 'ui_select', 'ui_select', 'ui_move', 'ui_move', 'ui_move', 'heal'];
async function play(st, e) {
	switch (e.t) {
		case 'turn': view.active = e.who; return;
		case 'slidein': view.slideT = performance.now(); return;
		case 'anim': await sleep(350); return;
		case 'text': return showText(e.text);
		case 'hearts': {
			// UpdateAppealHearts: one heart every 15 frames, ±16 cap
			const to = Math.max(-16, Math.min(16, Math.trunc((e.from + e.delta) / 10)));
			view.hearts[e.who] = Math.max(-16, Math.min(16, Math.trunc(e.from / 10)));
			while (view.hearts[e.who] !== to) {
				view.hearts[e.who] += Math.sign(to - view.hearts[e.who]);
				await sleep(60);
			}
			return;
		}
		case 'judge': view.judge = e.sym; view.judgeT = performance.now(); sfx(SYMBOL_SFX[e.sym] || 'ui_select'); await sleep(500); view.judge = null; return;
		case 'stars': view.stars[e.who] = Math.trunc(e.condition / 10); return;
		case 'applause': view.applause = e.level; if (e.dir > 0) sfx('levelup'); return;
		case 'sliders': view.totals = [...e.totals]; await sleep(300); return;
		case 'reorder': view.order = [...e.order]; view.hearts = [0, 0, 0, 0]; return;
		default: return;
	}
}

// contest_util.c's results board
async function results(st) {
	view.phase = 'results';
	view.resultsStage = 0;
	await showText(T('gText_AnnouncingResults'));
	view.resultsStage = 1;
	await showText(T('gText_PreliminaryResults'));
	view.resultsStage = 2;
	await showText(T('gText_Round2Results'));
	view.resultsStage = 3;
	const w = st.winner;
	sfx('levelup');
	await showText(T('gText_ContestantsMonWon', st.mons[w].trainer, st.mons[w].name));
}

// ContestHall_EventScript_CongratulateWinner .. GiveWinnerPrize
async function prizes(st, mon, cat, rank) {
	const w = st.winner;
	await say(T('ContestHall_Text_WeWillNowDeclareWinner'));
	await say(T('ContestHall_Text_CongratsTrainerXandMon', st.mons[w].name, String(w + 1), st.mons[w].trainer));
	if (w !== st.playerIndex) { await say(T('ContestHall_Text_CongratsPleaseCompeteAgain')); return; }
	const p = contestProgress();
	if ((p.ranks[CATS[cat]] ?? 0) <= rank) p.ranks[CATS[cat]] = rank + 1; // the quest log's "any rank cleared"
	safeSave(CONTEST_KEY, p);
	const wonBefore = hasWonBefore(mon, cat, rank);
	// CheckShouldSkipPrize: a repeat win below MASTER is only congratulated
	if (wonBefore && rank !== 3) { await say(T('ContestHall_Text_CongratsPleaseCompeteAgain')); return; }
	await say(T('ContestHall_Text_AcceptYourPrize'));
	if (!wonBefore) {
		// GiveMonContestRibbon: the ribbon of this rank
		await say(T('ContestHall_Text_ConferRibbonAsPrize'));
		if (ribbonRank(mon, cat) <= rank) {
			mon.ribbons = mon.ribbons || [];
			const r = `${CATS[cat]}-${RANKS[rank].toLowerCase()}`;
			if (!mon.ribbons.includes(r)) mon.ribbons.push(r);
			saveParty(S.party);
		}
		sfx('levelup');
		await say(T('ContestHall_Text_ReceivedRibbon'));
		await say(T('ContestHall_Text_PutRibbonOnMon', monName(mon)));
		try { Journal.add(`Won the ${RANKS[rank]} ${CATS[cat].toUpperCase()} Contest with ${monName(mon)}!`); } catch (e) { /* headless */ }
		// ShouldReadyContestArtist: a MASTER rank win is painted for the museum
		if (rank === 3) {
			await say(T('LilycoveCity_ContestLobby_Text_YourPokemonSpurredMeToPaint'));
			if (await yesNo(T('LilycoveCity_ContestLobby_Text_ShouldITakePaintingToMuseum'))) {
				const pp = contestProgress();
				pp.paintings = pp.paintings || {};
				pp.paintings[CATS[cat]] = { species: mon.speciesId, name: monName(mon) };
				safeSave(CONTEST_KEY, pp);
				await say(T('LilycoveCity_ContestLobby_Text_IllTakePaintingToMuseum'));
			} else await say(T('LilycoveCity_ContestLobby_Text_FineThatsTheWayItIs'));
		}
	} else {
		// GiveLuxuryBall: a repeat MASTER win
		if (Bag.addItem('luxuryball', 1) === false) {
			const pp = contestProgress();
			pp.prizePickup = 4;
			safeSave(CONTEST_KEY, pp);
			await say(T('ContestHall_Text_PickUpPrizeAtCounterLater'));
		} else await say(`${playerName()} received a LUXURY BALL.`);
	}
}

// ---------- input ----------
const KEYMAP = { z: 'A', Enter: 'A', ' ': 'A', x: 'B', Escape: 'B', Backspace: 'B', ArrowUp: 'UP', ArrowDown: 'DOWN', ArrowLeft: 'LEFT', ArrowRight: 'RIGHT' };
export function contestKey(k) {
	const b = KEYMAP[k];
	if (!b || !keyWaiter || !keyWaiter.keys.includes(b)) return;
	const w = keyWaiter;
	keyWaiter = null;
	w.res(b);
}

// ---------- draw ----------
let screen = null, sx = null;
function spr(name, x, y) {
	const r = gfx.rects[name];
	if (r) sx.drawImage(gfx.sprites, r[0], r[1], r[2], r[3], Math.round(x), Math.round(y), r[2], r[3]);
}
// text is laid out in GBA pixels but drawn on the scaled canvas, so it stays crisp
let labels = [];
function text(s, x, y, color = '#303030', size = 11) {
	labels.push([String(s).replace(/é/g, 'e'), x, y, color, size]); // the port's font folds é, like normalizeText
}
function textBox(s) {
	if (!s) return;
	s.split('\n').slice(0, 2).forEach((l, i) => text(l, 12, 124 + i * 14));
}
function monSprite(species, x, y, w = 48) {
	const img = contestSpriteFor(species);
	if (!img) return;
	const s = Math.min(w / img.width, w / img.height);
	sx.drawImage(img, Math.round(x - img.width * s / 2), Math.round(y - img.height * s / 2), Math.round(img.width * s), Math.round(img.height * s));
}

export function drawContest(sctx, SW, SH) {
	sctx.fillStyle = '#000';
	sctx.fillRect(0, 0, SW, SH);
	if (!gfx || !contestMenu.st) return;
	if (!screen) { screen = document.createElement('canvas'); screen.width = 240; screen.height = 160; }
	sx = screen.getContext('2d');
	sx.imageSmoothingEnabled = false;
	labels = [];
	const st = contestMenu.st;
	if (view.phase === 'results') drawResults(st);
	else drawStage(st);
	const k = Math.min(SW / 240, SH / 160);
	const w = Math.floor(240 * k), h = Math.floor(160 * k);
	sctx.save();
	sctx.imageSmoothingEnabled = false;
	const ox = Math.floor((SW - w) / 2), oy = Math.floor((SH - h) / 2);
	sctx.drawImage(screen, ox, oy, w, h);
	sctx.textBaseline = 'top';
	for (const [s, x, y, color, size] of labels) {
		sctx.font = `${Math.round(size * k)}px m6x11plus, monospace`;
		sctx.fillStyle = color;
		sctx.fillText(s, ox + x * k, oy + y * k);
	}
	sctx.restore();
}

function drawStage(st) {
	const select = view.phase === 'select';
	sx.drawImage(select ? gfx.moveselect : gfx.stage, 0, 0);
	if (!select) {
		// the contestant boxes, in appeal order, each in its contestant's palette
		for (let i = 0; i < 4; i++) {
			const slot = view.order[i], y = slot * 40;
			sx.drawImage(gfx.boxes[i], 144, y);
			text(st.mons[i].name, 149, y + 1);
			text('/' + st.mons[i].trainer, 196, y + 1, '#505050');
			const h = view.hearts[i];
			for (let n = 0; n < Math.abs(h); n++) spr(h > 0 ? `heart_red${i}` : `heart_black${i}`, 176 + (n % 8) * 8, y + 16 + (n >= 8 ? 8 : 0));
			for (let n = 0; n < Math.min(3, view.stars[i]); n++) spr('star', 152, y + 16 + n * 8);
			const s = st.st[i];
			const stat = (s.resistant || s.immune || s.jamSafetyCount || s.jamReduction) ? 'stat_circle'
				: s.nervous ? 'stat_wave' : (s.numTurnsSkipped || s.noMoreTurns) ? 'stat_x' : null;
			if (stat) spr(stat, 160, y + 16);
			// the slider heart: pointTotal / 10 * 2, clamped to 0-56 (UpdateHeartSlider)
			const t = Math.max(0, Math.min(56, Math.trunc(view.totals[i] / 10) * 2));
			spr('slider_heart', 176 + t, 36 + slot * 40 - 4);
			if (s.turnOrderMod === 1 && s.nextTurnOrder !== 0xFF) { spr('nextturn', 172, y + 32); spr(`nextturn_n${s.nextTurnOrder}`, 228, y + 32); }
			else if (s.turnOrderMod === 2) { spr('nextturn', 172, y + 32); spr('nextturn_random', 228, y + 32); }
			if (s.hasJudgesAttention) spr('symbol1', 150, y + 2);
		}
	} else {
		// Task_ShowMoveSelectScreen + PrintContestMoveDescription
		const me = st.mons[st.playerIndex], ms = st.st[st.playerIndex];
		me.moves.forEach((id, i) => {
			if (!id) return;
			const combo = ms.prevMove && st.allowedToCombo(st.playerIndex) && st.isCombo(ms.prevMove, id) && ms.hasJudgesAttention;
			const repeat = ms.prevMove === id && st.mv(id).fx !== 3;
			text(moveNameOf(id), 13, 89 + i * 16, combo ? '#f0f0f0' : repeat ? '#5060d0' : '#303030');
			if (view.choice === i) text('▶', 2, 89 + i * 16);
		});
		const id = me.moves[view.choice];
		const m = st.mv(id), e = D.effects[m.fx];
		spr(`cat${m.cat}`, 88, 88);
		for (let n = 0; n < 8; n++) spr(n < Math.min(8, Math.trunc(e.appeal / 10)) ? 'heart_red0' : 'heart_empty0', 168 + n * 8, 88);
		for (let n = 0; n < 8; n++) spr(n < Math.min(8, Math.trunc(e.jam / 10)) ? 'heart_black0' : 'heart_empty0', 168 + n * 8, 96);
		(D.text[D.effectDescs[m.fx]] || '').split('\n').forEach((l, i) => text(l, 92, 122 + i * 14, '#f0f0f0'));
	}
	// the judge, his speech bubble, the applause meter
	spr('judge', 80, 4);
	if (view.judge != null) spr(`symbol${view.judge}`, 88, 2);
	if (view.phase === 'stage' || view.phase === 'intro') {
		spr('applause', -2, 28);
		for (let i = 0; i < Math.min(5, view.applause); i++) spr('meter_on', 6 + i * 8, 44);
	}
	if (view.phase === 'intro' && view.introMon >= 0) {
		monSprite(st.mons[view.introMon].species, 72, 84, 56);
		for (let n = 0; n < view.introHearts; n++) spr('slider_heart', 8 + n * 16, 8 + (n % 2) * 10);
	} else if (view.active >= 0 && view.phase === 'stage') {
		const slide = Math.min(1, (performance.now() - (view.slideT || 0)) / 300);
		monSprite(st.mons[view.active].species, -40 + slide * 112, 84, 56);
	}
	if (!select) textBox(view.text);
}

function drawResults(st) {
	const img = resultsImg(st.category, st.rank);
	if (img) sx.drawImage(img, 0, 0);
	else { sx.fillStyle = '#9cd0f0'; sx.fillRect(0, 0, 240, 160); }
	for (let i = 0; i < 4; i++) {
		const y = 34 + i * 24;
		monSprite(st.mons[i].species, 20, y + 8, 20);
		text(st.mons[i].name, 34, y, '#303030');
		text('/' + st.mons[i].trainer, 94, y, '#505050');
		if (view.resultsStage >= 1) for (let n = 0; n < st.stars(i); n++) spr('star', 150 + n * 8, y);
		if (view.resultsStage >= 2) {
			const h = st.round2Hearts(i);
			for (let n = 0; n < Math.abs(h); n++) spr(h > 0 ? 'heart_red0' : 'heart_black0', 150 + n * 8, y + 9);
		}
		const bar = st.resultBar(i, view.resultsStage);
		if (bar > 0) { sx.fillStyle = '#f05858'; sx.fillRect(56, y + 16, bar, 3); }
		if (view.resultsStage >= 3) text(String(st.standings[i] + 1), 8, y + 2, st.standings[i] === 0 ? '#d03030' : '#303030');
	}
	sx.fillStyle = 'rgba(16,16,40,0.85)';
	sx.fillRect(0, 132, 240, 28);
	view.text.split('\n').forEach((l, i) => text(l, 8, 134 + i * 12, '#f0f0f0'));
}

// test/diagnostic view
export const contestView = () => ({ ...view, text: view.text, waiting: keyWaiter ? keyWaiter.keys.slice() : null });
