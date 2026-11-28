// hub.js — the camp: every screen outside a battle, laid out the way Disgaea's castle is (owner, 2026-11-21: "look at the
// menu system of Disgaea as inspiration, still Balatro UI"), on the Balatro kit:
//   home       the castle: Continue (the next battle, at once), Story, Dungeon, Training, Tower Defense, Squad, How to play; the wallet
//   stages     the Dimensional Gate: a chapter's maps (Q / E or the tabs change chapter), the focused map's details
//   dungeon    the Item World: continue the run, or a new run from floor 1 or a checkpoint
//   team       the sortie: pick up to six figurines (the order they deploy in), then Sortie!
//   squad      the roster: each figurine's status; Z opens its moves
//   moves      one figurine's four move SLOTS, filled from every move it has learned (also from the team screen: C, and
//              from the results: a new move)
//   held       what a figurine holds: put one of your held items on it, or take it off
//   evolve     its evolutions: the ready ones, then "Evolve!" or "Not now" (never forced)
//   shop       spend stars: held items, evolution items, Rare Polish, starter figurines (tabs)
//   starters   a new player's three starters
//   help       How to play, by topic
//   td         TOWER DEFENSE: its maps (the best wave on each), the wave to start from, the squad (up to 12, in order)
//   perma      the first deadly battle: "a figurine knocked out here is gone for good" (once per device)
//   fallen     the memorial: the figurines lost for good (figcol.js `fallen`)
//   book       the FIGURINE BOOK: every Pokémon by generation (Q / E), owned / met / not yet, and where to find each (book.js)
//   maps       the MAP MAKER: a new map, a map by its share code, your maps (edit / play / share / delete); editmode.js edits
//   versus     online PvP for 2-4 (signed in): make a match (players, computers, arena, levels) or join one with its code;
//              the lobby (the code to share, who is in and ready, Start for the host) polls until the match starts
// Every screen is a page of buttons: the arrows move the focus the way they point on screen (nav.js), Z presses, X goes
// back, Q / E change tabs; a tap or a click presses. The focused button's details show in the side panel.
import { spatialNext } from './nav.js';
import { MAPS, CHAPTERS, mapById, isOpen, nextMap, hardMap, hardOpen, teachOf, goalSay } from './campaign.js';
import { DRILLS, DRILL_IDS } from './demo.js';
import { startFloors, loadRun, saveRun, newRun, floorLevel, floorStars, isBossFloor, BOSS_EVERY, dgRecords, twistOf, TWISTS, gearAt, gearCount, gearLevel, doorsAt, doorsSay, doorLevel, doorStars } from './dungeon.js';
import { STARTERS, STARTER_PICK, STARTER_LEVEL, list, addFig, addGood, takeGood, goodsCount, haveGood, fallenList, FALLEN_DAYS } from './figcol.js';
import { battleStats, expForLevel, equip, movesToCome, MAX_LEVEL, makeFigurine, gainExp } from './figurine.js';
import { HELD, EVO, CANDY, KIT, SHOP_FIG_STARS, goodName, goodStars, heldNote, polishNeed } from './goods.js';
import { GEMS, GEM_STATS, GEM_PCT, SLOT_LEVELS, SLOTS_MAX, ITEM_MAX_LEVEL, LEVEL_PLAIN, kOf, heldTextAt, parseGem, gemName, gemSay, combineGems, gemMults, joinPlan } from './gear.js';
import { holdItem, unholdItem, itemGear, gearView, gemList, addGem, socketGem, unsocketGem, combineLoose, combineAll, socketAll, unsocketAll, reholdItem, setItemLevel, setFav, releaseFig, releaseBlock } from './figcol.js';
import { loadDive, saveDive, newDive, canDive, exitFloor, diveFloors, itemFoeLevel, itemFloorStars, EXIT_EVERY, bankPart, clearedFloors, worldOf, worldSay, iwRecords } from './itemworld.js';
import { goodIconImg } from './goodicons.js';
import { evoOptions, evolve, evolvesByLevelNow } from './evolve.js';
import { makeRng } from '../../overworld/rules/rng.js';
import { sfx } from '/site/ui/sfx.js';
import * as Stars from '/site/stars.js';
import { askText } from '/site/osk.js';
import { ARENAS, arenaById, arenaSeats, PVP_LEVEL } from './arenas.js';
import { loadMaps, saveMaps } from './editmode.js';
import { TD_MAPS, MAZE_MAPS, tdMapById, isMazeMap } from './td/maps.js';
import { milestoneState, claimMilestone, dailyState, claimDaily, dailyOf, dayOf, loadDaily, toClaim, MILESTONES, shelfOf } from './goals.js';
import { GOLD as MZ_GOLD, DEAL_FIRST as MZ_DEAL_FIRST0, BIG as MZ_BIG, BONUS as MZ_BONUS } from './td/cards.js';
const MZ_DEAL_FIRST = MZ_DEAL_FIRST0 + MZ_BIG.first;   // (the big maps' first hand: rules 16)
import { HEROES, PASSIVES, heroById, heroOpen, frameOf, deck2Open, DECK2_WAVE, FRAME_WAVES } from './td/heroes.js';
import { portraitImg } from './td/portraits.js';
import { SQUAD_MAX, SLOTS_START, LIVES, BOSS_EVERY as TD_BOSS_EVERY } from './td/sim.js';
import { tdKind } from './td/effects.js';
import { startWaves as tdStartWaves } from './td/rewards.js';
import { moveAt } from './figurine.js';
import { itemDungeonId, ABYSS_ID, ABYSS_MARKS, abyssKit, kindsOf as mmKindsOf, onlyHere as mmOnlyHere } from './mm/dungeons.js';
import { DUNGEONS as MM_DUNGEONS, dungeonById as mmDungeonById, dungeonOpen as mmDungeonOpen, dungeonLevels as mmDungeonLevels, WEATHER_NAME as MM_SKY, WEATHER_SAY as MM_SKY_SAY, SPECIAL_NAME as MM_SPECIAL, BOSS_TRICKS as MM_TRICKS } from './mm/dungeons.js';
import { ITEMS as MM_ITEMS, BAG_MAX as MM_BAG_MAX } from './mm/items.js';
import { CHALLENGES as MM_CH, CHALLENGE_IDS as MM_CH_IDS, challengeable as mmChallengeable, cleanCh as mmCleanCh, diveRule as mmDiveRule } from './mm/turn.js';
import { challengeMult as mmChMult } from './mm/rewards.js';
import { cleanMm, mmStoreCount, mmStoreSize, MM_STORE_MAX } from './figcol.js';
import { dexList, bookState, whereToFind, wildIndex, GENS, genOf, DEX_MAX, canBeFigurine } from './book.js';
import { problems as mapProblems, arenaProblems, cleanMap, NEW_SIZES, MAX_W, MAX_H, saveBlock, maxPlayers, tdProblems, asTdMaze, asTdRoad } from './editor.js';

export const PRESETS_KEY = 'magepunk_poketactica_teams_v1', PRESET_N = 3;   // (plan item V3: three saved teams, on this device, as the last team is)
export const TEAM_KEY = 'magepunk_poketactica_team_v1';   // (this device's last team: a convenience, never synced)
export const DUNGEON_OPENS = 'c1-5';
export const TEAM_MAX = 6;
export const TD_SQUAD_KEY = 'magepunk_poketactica_tdsquad_v1';   // (this device's last Tower Defense squad: a convenience)
export const PERMA_KEY = 'magepunk_poketactica_perma_v1';   // (this device has seen the permanent-loss warning)
/** Is a battle on this target deadly (a knocked-out figurine is gone for good)? Story maps and Dungeon floors. */
export const deadly = (t) => !!t && (t.kind === 'map' || t.kind === 'dungeon' || t.kind === 'item');
const TYPE_HEX = { Normal: '#a8a77a', Fire: '#ee8130', Water: '#6390f0', Electric: '#f7d02c', Grass: '#7ac74c', Ice: '#96d9d6', Fighting: '#c22e28', Poison: '#a33ea1', Ground: '#e2bf65', Flying: '#a98ff3', Psychic: '#f95587', Bug: '#a6b91a', Rock: '#b6a136', Ghost: '#735797', Dragon: '#6f35fc', Dark: '#705746', Steel: '#b7b7ce', Fairy: '#d685ad' };
const prettyId = (id) => String(id).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
const tail = () => Math.floor(Math.random() * 36 ** 8).toString(36).padStart(6, '0');   // (a good's / a bought figurine's id: device-side, not a battle)
const mapNo = (m) => m.chapter + '-' + (MAPS.filter((x) => x.chapter === m.chapter).indexOf(m) + 1);
export const dungeonOpen = (col) => ((col && col.cleared) || []).includes(DUNGEON_OPENS);

/**
 * ctx: { root, data, col(), saveCol(c), makeStarters(species[]), start({ target, team }), toast(t), onHelpClose? }
 * target: { kind: 'map', id } | { kind: 'training' } | { kind: 'dungeon', run }
 */
export function createHub(ctx) {
	const { root, data } = ctx;
	const H = { screen: null, focus: 0, acts: [], back: null, tabs: null, arg: null, pick: [], team: loadTeam(), target: null, chapter: null, helpTab: 0, onClose: null };
	const name = (sp) => (data.species[sp] || {}).name || sp;
	const sprite = (sp) => { const s = data.species[sp]; return s && s.sprite ? '/overworld/data/pokemon/' + s.sprite : ''; };
	const types = (sp) => ((data.species[sp] || {}).types || []).map((t) => `<span class="ph-type" style="background:${TYPE_HEX[t] || '#777'}">${esc(t)}</span>`).join('');
	const col = () => ctx.col();

	// ---- the page: buttons registered as they are drawn; acts[i] = { go, info?, off? }
	let acts = [];
	const btn = (label, { go, info, off, alt, cls = 'bal-blue', extra = '' } = {}) => {
		const i = acts.length; acts.push({ go: go || (() => {}), info, off: off || false, alt });
		return `<button class="bal-btn ${cls}${off ? ' is-disabled' : ''}" data-nav="${i}" aria-disabled="${off ? 'true' : 'false'}" ${extra}>${label}</button>`;
	};
	const figCard = (f, { go, info, on, badge, off, alt } = {}) => {
		const i = acts.length; acts.push({ go: go || (() => {}), info, off: off || false, alt });   // (a string says why, as a toast)
		return `<button class="ph-card${on ? ' is-on' : ''}${off ? ' is-disabled' : ''}" data-nav="${i}" aria-disabled="${off ? 'true' : 'false'}">
			${badge ? `<span class="ph-badge">${badge}</span>` : ''}<img src="${esc(sprite(f.species))}" alt="" loading="lazy" draggable="false">
			<span class="ph-card-name">${esc(name(f.species))}${f.shiny ? ' ★' : ''}</span>
			${f.level != null ? `<span class="ph-card-lv">Lv ${f.level}</span>` : `<span class="ph-types">${types(f.species)}</span>`}</button>`;
	};
	function render(html, { focus = 0, back = null, tabs = null } = {}) {
		clearInterval(H.poll); H.poll = null;   // (only the lobby polls, and it starts its poll after drawing)
		root.innerHTML = html;
		H.acts = acts; acts = [];
		H.back = back; H.tabs = tabs;
		root.hidden = false;
		setFocus(Math.min(Math.max(0, focus), H.acts.length - 1), true);
	}
	const navEls = () => [...root.querySelectorAll('[data-nav]')];
	function setFocus(i, quiet) {
		H.focus = i;
		for (const el of navEls()) el.classList.toggle('is-focus', +el.dataset.nav === i);
		const el = root.querySelector(`[data-nav="${i}"]`);
		if (el && el.scrollIntoView) el.scrollIntoView({ block: 'nearest', inline: 'nearest' });
		const a = H.acts[i], det = root.querySelector('.ph-detail');
		if (det && a && a.info) det.innerHTML = a.info();
		if (!quiet) sfx.select && sfx.select();
	}
	function press(i = H.focus) {
		const a = H.acts[i];
		if (!a) return;
		if (a.off) { sfx.error(); if (typeof a.off === 'string') ctx.toast(a.off); return; }
		sfx.press(); a.go();
	}
	root.addEventListener('click', (ev) => {
		const b = ev.target.closest('[data-nav]'); if (!b || !root.contains(b)) return;
		const i = +b.dataset.nav;
		if (ev.target.closest('[data-clear]') && H.acts[i] && H.acts[i].alt) { sfx.press(); H.acts[i].alt(); return; }
		if (H.focus !== i) setFocus(i, true);
		press(i);
	});

	// ---- input
	function onAction(action, o = {}) {
		if (root.hidden) return false;
		if (['up', 'down', 'left', 'right'].includes(action)) {
			const els = navEls().sort((a, b) => a.dataset.nav - b.dataset.nav);
			const rects = els.map((e) => { const r = e.getBoundingClientRect(); return { x: r.left, y: r.top, w: r.width, h: r.height }; });
			const from = els.findIndex((e) => +e.dataset.nav === H.focus);
			const j = spatialNext(rects, from, action);
			if (j >= 0 && j !== from) setFocus(+els[j].dataset.nav);
			return true;
		}
		if (action === 'confirm') { if (!o.repeat) press(); return true; }
		if (action === 'cancel') { if (H.back && !o.repeat) { sfx.back(); H.back(); } return true; }
		if (action === 'secondary') { const a = H.acts[H.focus]; if (a && a.alt && !o.repeat) { sfx.press(); a.alt(); } return true; }   // (C / X: the focused button's second job)
		if ((action === 'prev' || action === 'next') && H.tabs && !o.repeat) { sfx.tab && sfx.tab(); H.tabs(action === 'next' ? 1 : -1); return true; }
		return true;   // (the camp owns every key while it is up)
	}

	// ---- GOALS (owner, 2026-11-24: "both" milestones and daily tasks; goals.js)
	const goalEnv = () => ({ roadIds: TD_MAPS.map((m) => m.id), mazeIds: MAZE_MAPS.map((m) => m.id), heroIds: HEROES.map((h) => h.id), mmIds: MM_DUNGEONS.filter((d) => !d.endless).map((d) => d.id), abyssId: (MM_DUNGEONS.find((d) => d.endless) || {}).id });
	const GOAL_TABS = ['Today', 'Milestones', 'Trophies'];
	function goals(tab = H.goalTab || 0, focusId) {
		H.goalTab = tab;
		const c = col(), day = dayOf(), cnt = loadDaily(day), env = goalEnv();
		const pay = (r, what, id) => {
			if (!r) { sfx.error(); return goals(tab, id); }
			ctx.saveCol(r.col); Stars.earn(r.stars); ctx.starsSpent && ctx.starsSpent();
			sfx.coin && sfx.coin(); ctx.toast(what + ': +' + r.stars + ' ★ · ★ ' + Stars.stars() + ' in your wallet');
			goals(tab, id);
		};
		const tabs = GOAL_TABS.map((t, i) => btn(esc(t), { cls: 'bal-tab' + (i === tab ? ' is-on' : ''), go: () => goals(i) })).join('');
		const bar = (x) => `<span class="ph-goal-bar"><span style="width:${Math.round(100 * x.have / x.at)}%"></span></span>`;
		const row = (x, group, claim) => btn(`<span class="ph-row-name">${esc(x.name)}</span>${group ? '<span class="bal-badge bal-grey">' + esc(group) + '</span>' : ''}<small>${x.claimed ? 'claimed' : x.have + ' / ' + x.at}</small>${bar(x)}<span class="bal-badge ${x.claimed ? 'bal-grey' : 'bal-gold'}">${x.claimed ? '✓' : x.stars + ' ★'}</span>`,
			{ cls: (x.claimed ? 'bal-grey' : x.done ? 'bal-gold' : 'bal-blue') + ' ph-row ph-goal', off: x.claimed ? 'Already claimed' : !x.done && 'Not done yet: ' + x.have + ' of ' + x.at, go: claim,
				info: () => `<h3 class="bal-h3">${esc(x.name)}</h3><p>${x.claimed ? 'Claimed.' : x.done ? '<b class="bal-t-gold">Done! Z claims ' + x.stars + ' ★.</b>' : x.have + ' of ' + x.at + ' so far.'}</p><p class="bal-muted">Pays ${x.stars} ★, once.</p>` });
		const ids = [];
		let rows, sub;
		if (tab === 0) {
			const list2 = dailyState(c, day, cnt);
			rows = list2.map((t) => { ids.push(t.id); return row(t, '', () => pay(claimDaily(col(), t.id, day, loadDaily(day)), t.name, t.id)); });
			sub = 'Three tasks a day, the same for everyone; new ones at midnight UTC. What you do is counted on this device.';
		} else if (tab === 2) {
			// (plan item R2) THE TROPHY SHELF: every mode on one screen, what is done and what is next. Z goes to that next milestone.
			const shelf = shelfOf(c, env);
			rows = shelf.map((s) => { ids.push('shelf-' + s.mode); return btn(`<span class="ph-row-name">${s.icon} ${esc(s.mode)}</span><span class="bal-badge ${s.done === s.total ? 'bal-gold' : 'bal-grey'}">${s.done} / ${s.total}</span><small>${esc(s.facts.join(' · '))}</small><small class="ph-shelf-next">${s.next ? 'Next: ' + esc(s.next.name) + ' (' + s.next.have + ' / ' + s.next.at + ')' : 'Every milestone reached'}</small>`,
				{ cls: (s.done === s.total ? 'bal-gold' : 'bal-blue') + ' ph-row ph-shelf', go: () => (s.next ? goals(1, s.next.id) : goals(1)),
					info: () => `<h3 class="bal-h3">${s.icon} ${esc(s.mode)}</h3><ul class="ph-shelf-facts">${s.facts.map((f) => '<li>' + esc(f) + '</li>').join('')}</ul><p><b>Milestones ${s.done} / ${s.total}</b></p><ul class="ph-shelf-list">${s.list.map((m) => '<li class="' + (m.done ? 'is-done' : '') + '">' + (m.done ? '✓ ' : '· ') + esc(m.name) + (m.done ? '' : ' <span class="bal-muted">' + m.have + ' / ' + m.at + '</span>') + '</li>').join('')}</ul>${s.next ? '<p class="bal-muted"><span class="bal-key">Z</span> go to the next one</p>' : ''}` }); });
			sub = 'What you have done in every mode, and what is next in each.';
		} else {
			const list2 = milestoneState(c, env).sort((a, b) => (a.claimed - b.claimed) || (b.done - a.done));   // (to claim first, then under way, then claimed; the list's own order within each)
			rows = list2.map((m) => { ids.push(m.id); return row(m, m.group, () => pay(claimMilestone(col(), m.id, env), m.name, m.id)); });
			sub = `One-time targets across every mode: ${list2.filter((m) => m.claimed).length} of ${MILESTONES.length} claimed.`;
		}
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Goals</h2><div class="ph-wallet"><span class="bal-badge bal-gold">★ ${Stars.stars()}</span></div></header>
			<nav class="bal-tabs ph-tabs">${tabs}<span class="ph-keyhint"><span class="bal-key">Q</span> <span class="bal-key">E</span></span></nav>
			<p class="ph-sub bal-muted">${esc(sub)}</p>
			<div class="ph-body"><nav class="ph-list bal-scroll">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: GOAL_TABS.length + Math.max(0, ids.indexOf(focusId)), back: () => home('goals'), tabs: (d) => goals((tab + d + GOAL_TABS.length) % GOAL_TABS.length) });
		H.screen = 'goals';
	}
	// ---- the castle
	const HOME_GROUPS = [[null, ['resume', 'mm-resume', 'td-resume', 'continue']], ['Play', ['story', 'dungeon', 'training', 'td', 'mm', 'itemworld', 'versus']], ['Figurines', ['squad', 'gear', 'book', 'fallen']], ['Shop and more', ['shop', 'maps', 'settings', 'help']]];
	/**
	 * SETTINGS (improvement plan, 2026-11-25): the switches each mode kept in its own menu, in one place. Each is a key on
	 * this device that its mode reads (the keys are the modes' own); ctx.settings() tells the page one changed.
	 */
	const SETTINGS = [
		{ key: 'magepunk_poketactica_fast_v1', name: 'Enemy phase', where: 'Battles', opts: [[null, 'normal speed'], ['1', 'fast']] },
		{ key: 'magepunk_poketactica_tdfx_v1', name: 'Effects', where: 'Tower Defense', opts: [['full', 'full: big numbers and bursts'], ['calm', 'calm: plain numbers, no bursts']], auto: 'full' },
		{ key: 'magepunk_poketactica_tdspeed_v1', name: 'Speed a run starts at', where: 'Tower Defense', opts: [[null, '1×'], ['2', '2×'], ['3', '3×']] },
		{ key: 'magepunk_poketactica_tdreach_v1', name: 'Reach shown', where: 'Tower Defense', opts: [[null, 'the tower under the cursor'], ['1', 'every tower at once']] },
		{ key: 'magepunk_poketactica_mzauto_v1', name: 'Next wave', where: 'Maze Builder', opts: [[null, 'when you call it'], ['1', 'by itself, after your last order']] },
		{ key: 'magepunk_poketactica_mmbar_v1', name: 'The bar', where: 'Mystery Maze', opts: [[null, 'whole'], ['small', 'folded to one line']] },
		// (plan item A7; last, so the switches players know keep their places)
		{ key: 'magepunk_poketactica_anim_v1', name: 'Animation speed', where: 'Battles', opts: [[null, 'normal'], ['quick', 'quicker: half as fast again'], ['slow', 'slower: easier to follow']] },
	];
	const COACH_KEYS = ['magepunk_poketactica_coach_v1', 'magepunk_poketactica_tdcoach_v1', 'magepunk_poketactica_mzcoach_v1', 'magepunk_poketactica_mmcoach_v1'];
	const lsRead = (k) => { try { return localStorage.getItem(k); } catch { return null; } };
	const lsWrite = (k, v) => { try { if (v == null) localStorage.removeItem(k); else localStorage.setItem(k, v); return true; } catch { return false; } };
	function settings(focus = 0) {
		const cur = (st) => { const v = lsRead(st.key), i = st.opts.findIndex(([o]) => o === v); return i >= 0 ? i : 0; };   // (a value this build does not know reads as the first)
		const changed = () => { if (ctx.settings) ctx.settings(); };
		const rows = SETTINGS.map((st, k) => { const i = cur(st); return btn(`<span class="ph-row-name">${esc(st.name)}</span><span class="bal-badge bal-grey">${esc(st.where)}</span><small>${esc(st.opts[i][1])}</small>`,
			{ cls: 'bal-blue ph-row', go: () => { const n = st.opts[(i + 1) % st.opts.length]; if (!lsWrite(st.key, n[0])) ctx.toast('This browser will not keep settings'); changed(); settings(k); },
				info: () => `<h3 class="bal-h3">${esc(st.name)}</h3><p class="bal-muted">${esc(st.where)}</p>${st.opts.map(([, t], j) => `<p>${j === i ? '<b class="bal-t-gold">▶ ' + esc(t) + '</b>' : esc(t)}</p>`).join('')}<p class="bal-muted">Z changes it. The mode's own menu has the same switch.</p>` }); });
		const seen = COACH_KEYS.filter((k) => lsRead(k) === 'done').length, warned = lsRead(PERMA_KEY) === '1';
		rows.push(btn(`<span class="ph-row-name">Show the coaches again</span><small>${seen ? seen + ' of ' + COACH_KEYS.length + ' finished' : 'none finished yet'}</small>`, { cls: 'bal-green ph-row', off: !seen && 'No coach has been finished on this device',
			go: () => { for (const k of COACH_KEYS) lsWrite(k, null); lsWrite('magepunk_poketactica_lessons_v1', null); changed(); ctx.toast('The coaches will lead again: the first battle, Tower Defense, Maze Builder and Mystery Maze'); settings(SETTINGS.length); },
			info: () => '<h3 class="bal-h3">The coaches</h3><p>The step-by-step help of the first battle, Tower Defense, Maze Builder and Mystery Maze. Each steps aside once it is finished or skipped; this brings them all back.</p>' }));
		rows.push(btn(`<span class="ph-row-name">Show the permanent-loss warning again</span><small>${warned ? 'seen' : 'not seen yet'}</small>`, { cls: 'bal-green ph-row', off: !warned && 'It has not been shown yet: it comes before your first deadly battle',
			go: () => { lsWrite(PERMA_KEY, null); ctx.toast('The warning will come before your next deadly battle'); settings(SETTINGS.length + 1); },
			info: () => '<h3 class="bal-h3">Permanent loss</h3><p>The warning shown once before the first deadly battle: a figurine knocked out in the Story, the Dungeon, the Item World or Mystery Maze is gone for good.</p>' }));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Settings</h2></header>
			<p class="ph-sub bal-muted">Kept on this device. Each mode's own menu has the same switches.</p>
			<div class="ph-body"><nav class="ph-list">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`, { focus, back: () => home('settings') });
		H.screen = 'settings';
	}
	function home(focusKey) {
		const c = col(), figs = list(c), cleared = (c.cleared || []).length, nm = nextMap(c.cleared), dg = dungeonOpen(c), run = loadRun();
		const cont = continueTarget();
		const items = [];
		const keys = [];
		// (each row is MADE when its place in the groups comes: buttons are numbered in the order they are made, and that is the order the arrows walk)
		const made = {};
		const add = (key, make) => { made[key] = make; };
		// a battle left half-way on this device (a reload, a locked phone): Resume puts it back where it was
		const sv = ctx.saved ? ctx.saved() : null;
		if (sv) add('resume', () => btn(`<span class="ph-big">⏸ Resume battle</span><small>${esc(sv.label)} · Turn ${sv.turn}</small>`, { cls: 'bal-orange ph-wide', go: () => ctx.resume(), info: () => `<h3 class="bal-h3">Resume battle</h3><p>${esc(sv.label)}, turn ${sv.turn}: back where you left it.</p><p class="bal-muted">Starting another battle drops this one.</p>` }));
		const mms = ctx.mmSaved ? ctx.mmSaved() : null;
		if (mms) add('mm-resume', () => btn(`<span class="ph-big">⏸ Resume Mystery Maze</span><small>${esc(mms.label.replace(/^Mystery Maze · /, ''))}</small>`, { cls: 'bal-orange ph-wide', go: () => ctx.mmResume(), info: () => `<h3 class="bal-h3">Resume Mystery Maze</h3><p>${esc(mms.label)}: exactly where you left it.</p><p class="bal-muted">What you carried in is still in there with you.</p>` }));
		const tds = ctx.tdSaved ? ctx.tdSaved() : null;
		if (tds) add('td-resume', () => btn(`<span class="ph-big">⏸ Resume Tower Defense</span><small>${esc(tds.label.replace(/^Tower Defense · /, ''))}</small>`, { cls: 'bal-orange ph-wide', go: () => ctx.tdResume(), info: () => `<h3 class="bal-h3">Resume Tower Defense</h3><p>${esc(tds.label)}: back at the very moment you left it, paused.</p>` }));
		add('continue', () => btn(`<span class="ph-big">▶ Continue</span><small>${esc(targetName(cont))}</small>`, { cls: 'bal-orange ph-wide', go: () => sortieTo(cont, teamFigs()), off: !teamFigs().length && 'Pick a team in Squad first', info: () => targetInfo(cont) }));
		{ const day = dayOf(), cnt = loadDaily(day), wait = toClaim(c, goalEnv(), day, cnt), today = dailyState(c, day, cnt), ms = milestoneState(c, goalEnv());
			add('goals', () => btn(`<span class="ph-big">🏅 Goals</span><small>${wait ? wait + ' to claim' : today.filter((t) => t.claimed).length + ' of ' + today.length + ' done today · ' + ms.filter((m) => m.claimed).length + ' of ' + ms.length + ' milestones'}</small>${wait ? '<span class="bal-badge bal-gold ph-wait">★</span>' : ''}`, { cls: (wait ? 'bal-gold' : 'bal-blue') + ' ph-wide ph-goalsbtn', go: () => goals(wait && !today.some((t) => t.done && !t.claimed) ? 1 : 0), info: () => `<h3 class="bal-h3">Goals</h3><p>Three small tasks a day, and milestones across every mode. Each pays stars once.</p><p><b>Today</b></p>${today.map((t) => `<p>${t.claimed ? '✓' : t.done ? '★' : '·'} ${esc(t.name)} <span class="bal-muted">${t.have}/${t.at} · ${t.stars} ★</span></p>`).join('')}` })); }
		add('story', () => btn(`<span class="ph-big">⚔ Story</span><small>${nm ? 'Chapter ' + nm.chapter + ' · next: ' + esc(nm.name) : 'every map cleared'}</small>`, { cls: 'bal-blue ph-wide', go: () => stages(), info: () => `<h3 class="bal-h3">Story</h3><p>The campaign: ${MAPS.length} maps in ${CHAPTERS.length} chapters. Each map's first clear pays stars, and some a figurine.</p><p class="bal-muted">${cleared} / ${MAPS.length} cleared</p>` }));
		add('dungeon', () => btn(`<span class="ph-big">🕳 Dungeon</span><small>${dg ? (run ? 'run on floor ' + run.floor : 'deepest checkpoint: floor ' + (startFloors(c.deep).at(-1))) : 'clear ' + esc((mapById(DUNGEON_OPENS) || {}).name) + ' to open'}</small>`, { cls: 'bal-red ph-wide', off: !dg && 'Clear ' + (mapById(DUNGEON_OPENS) || {}).name + ' to open the Dungeon', go: () => dungeon(), info: () => `<h3 class="bal-h3">The Dungeon</h3><p>Floor after floor of wild Pokémon, each a little stronger. Every ${BOSS_EVERY}th floor is a boss: beat it for its figurine and a checkpoint to start new runs from.</p><p class="bal-muted">A lost floor ends the run.</p>` }));
		add('training', () => btn(`<span class="ph-big">🎯 Training</span><small>pick what to practise</small>`, { cls: 'bal-green ph-wide', go: () => training(), info: () => `<h3 class="bal-h3">Training Grounds</h3><p>Pick what to practise: combos, throwing, catching, type matchups, or a free battle. Wild Pokémon at your team's level, and nobody is lost here.</p>` }));
		{ const best = Math.max(0, ...Object.values(c.td || {})); add('td', () => btn(`<span class="ph-big">🏰 Tower Defense</span><small>${best ? 'best: wave ' + best : 'your figurines as towers'}</small>`, { cls: 'bal-green ph-wide', go: () => tdModes(), info: () => `<h3 class="bal-h3">Tower Defense</h3><p>Place your figurines beside the road as towers and hold off endless waves. They act on their own, on cooldowns; enemies only walk, so nothing is lost here.</p><p class="bal-muted">${TD_MAPS.length} maps · a boss every ${TD_BOSS_EVERY} waves</p>` })); }
		{ const rec = cleanMm(c.mm), n = Object.keys(rec.clear).length; add('mm', () => btn(`<span class="ph-big">🌀 Mystery Maze</span><small>${n ? n + ' of ' + MM_DUNGEONS.filter((d) => !d.endless).length + ' dungeons cleared' : 'floors that are never the same twice'}</small>`, { cls: 'bal-purple ph-wide', go: () => mmDungeons(), info: () => `<h3 class="bal-h3">Mystery Maze</h3><p>Lead a party down through dungeons whose floors are made anew every time. Everything moves when you move: wild Pokémon, traps, shops, Monster Houses.</p><p class="ph-td-none">Deadly: a figurine that faints is gone for good.</p><p class="bal-muted">${MM_DUNGEONS.length} dungeons · items you carry out go to a storage</p>` })); }
		add('versus', () => btn(`<span class="ph-big">🤝 Versus</span><small>${ctx.signedIn && ctx.signedIn() ? 'online, 2-4 players' : 'sign in to play online'}</small>`, { cls: 'bal-red ph-wide', off: !(ctx.signedIn && ctx.signedIn()) && 'Sign in (the top bar) to play online', go: () => versus(), info: () => `<h3 class="bal-h3">Versus</h3><p>Play friends online, two to four on one map; empty seats can be computers. Make a match and share its code, or join one with a code. Everyone deploys from their own base; the last side standing wins.</p>` }));
		add('maps', () => btn(`<span class="ph-big">🛠 Map maker</span><small>build Versus arenas, share them</small>`, { cls: 'bal-green ph-wide', go: () => maps(), info: () => `<h3 class="bal-h3">Map maker</h3><p>Build your own Versus arenas on the board, up to 32×32: heights, ground (water, tall grass, lava, ice…), Geo panels, 2-4 PvP seats and wild foes that fight every side. Play them against friends in Versus and share them by code. (Made maps are for Versus only.)</p>` }));
		const nEvo = figs.filter((f) => evolvesByLevelNow(f, data)).length;
		add('squad', () => btn(`<span class="ph-big">🛡 Squad</span><small>${figs.length} figurine${figs.length === 1 ? '' : 's'}${nEvo ? ' · ✨ ' + nEvo + ' can evolve' : ''}</small>`, { cls: 'bal-purple ph-wide', go: () => squad(), info: () => `<h3 class="bal-h3">Squad</h3><p>Your figurines: their stats, and their four move slots, filled from every move each has learned.</p>` }));
		const bk = bookState(c, data);
		add('book', () => btn(`<span class="ph-big">📕 Figurine book</span><small>${bk.count} / ${DEX_MAX} owned</small>`, { cls: 'bal-purple ph-wide', go: () => book(), info: () => `<h3 class="bal-h3">Figurine book</h3><p>Every Pokémon, by generation: the ones you own, the ones you have met, and where to find each one (the overworld, the story, the Dungeon, evolving).</p><p class="bal-muted">${bk.count} / ${DEX_MAX} owned</p>` }));
		add('shop', () => btn(`<span class="ph-big">🛒 Shop</span><small>held items, evolution items, polish, figurines</small>`, { cls: 'bal-gold ph-wide', go: () => shop(), info: () => `<h3 class="bal-h3">Shop</h3><p>Spend stars on held items, evolution paints, Rare Polish and starter figurines.</p><p class="bal-muted">★ ${Stars.stars()} in your wallet</p>` }));
		add('help', () => btn(`<span class="ph-big">📖 How to play</span><small>controls, turns, Geo panels</small>`, { cls: 'bal-grey ph-wide', go: () => help(), info: () => `<h3 class="bal-h3">How to play</h3><p>Keyboard, controller and touch; turns, Execute, Geo panels, throwing and catching.</p>` }));
		{ const ng = gemList(c).length, ni = Object.values(c.items || {}).filter((x) => HELD[x]).length + figs.filter((f) => f.held).length;
			add('gear', () => btn(`<span class="ph-big">💎 Items &amp; gemstones</span><small>${ni} held item${ni === 1 ? '' : 's'} · ${ng} loose gemstone${ng === 1 ? '' : 's'}</small>`, { cls: 'bal-purple ph-wide', go: () => workshop(), info: () => `<h3 class="bal-h3">Items &amp; gemstones</h3><p>Every held item has a <b>level</b> and <b>slots</b> for <b>plush gemstones</b>. A gemstone in a slot raises one stat of the figurine holding the item.</p><p class="bal-muted">Levels come from the Item World. Gemstones grow by being combined.</p>` })); }
		{ const dv = loadDive(), okDive = dv && (c.items || {})[dv.uid] === dv.id;
			add('itemworld', () => btn(`<span class="ph-big">🔮 Item World</span><small>${okDive ? 'diving: ' + esc(HELD[dv.id].name) + (dv.style === 'maze' ? ' · Mystery Maze' : ' · floor ' + dv.floor) : 'go into a held item to raise its level'}</small>`, { cls: 'bal-red ph-wide', go: () => itemWorld(), info: () => `<h3 class="bal-h3">Item World</h3><p>Go <b>into a held item</b>, floor after floor. Clearing a dive raises the item's <b>level</b> (its bonus grows, up to ×3 at level 100, and it gains slots) and brings out <b>plush gemstones</b> and <b>Stitching Kits</b>.</p><p class="bal-muted">A dive runs to the next exit floor (10, 20 … 100). Nothing is kept until the exit is cleared.</p>${deadlyBadge}` })); }
		{ const nf = fallenList(c).length; if (nf) add('fallen', () => btn(`<span class="ph-big">🕯 Fallen</span><small>${nf} lost for good</small>`, { cls: 'bal-grey ph-wide', go: () => fallen(), info: () => `<h3 class="bal-h3">Fallen</h3><p>The figurines you lost in deadly battles: the Story, the Dungeon, the Item World and Mystery Maze.</p>` })); }
		add('settings', () => btn(`<span class="ph-big">⚙ Settings</span><small>speeds, effects, the coaches</small>`, { cls: 'bal-grey ph-wide', go: () => settings(), info: () => `<h3 class="bal-h3">Settings</h3><p>Every switch of every mode in one place: the enemy phase's speed, Tower Defense's effects, speed and reach, Maze Builder's next wave, Mystery Maze's bar.</p><p class="bal-muted">Kept on this device.</p>` }));
		// THE CAMP IN GROUPS (owner, 2026-11-24: "all open, just grouped"): what you were doing, then Play, Figurines, Shop and more
		for (const [label, ks] of HOME_GROUPS) {
			const have = ks.filter((k) => made[k]);
			if (!have.length) continue;
			if (label) items.push(`<h3 class="ph-group">${label}</h3>`);
			for (const k of have) { keys.push(k); items.push(made[k]()); }
		}
		// (Goals: its own wide button, SHOWN above the list (the stylesheet's `order`) and made last, after the list, in the page:
		// no row of the list moves, it is always in view, and Up from the top row reaches it. Shown under the list it broke the
		// arrows: Down from a row took the button for the nearest thing below whenever the next row was scrolled out of sight.)
		keys.push('goals');
		const goalsBtn = made.goals();
		const best = figs[0];
		render(`<div class="ph-screen ph-home">
			<header class="ph-head"><div class="bal-logo ph-logo">Poketactica</div><div class="ph-wallet"><span class="bal-badge bal-gold">★ ${Stars.stars()}</span></div></header>
			<div class="ph-body"><nav class="ph-menu">${items.join('')}</nav>
			<aside class="bal-panel ph-side"><div class="ph-detail"></div>
				<div class="ph-stats bal-muted"><div>Maps cleared <b>${cleared} / ${MAPS.length}</b></div>${c.deep ? `<div>Deepest boss <b>floor ${c.deep}</b></div>` : ''}${best ? `<div>Strongest <b>${esc(name(best.species))} Lv ${best.level}</b></div>` : ''}</div></aside></div>
			<nav class="ph-homegoals">${goalsBtn}</nav>
			<footer class="ph-foot bal-muted"><span class="bal-key">Z</span> choose <span class="bal-key">X</span> back <span class="bal-key">←↑→↓</span> move</footer></div>`, { focus: Math.max(0, keys.indexOf(focusKey || (sv ? 'resume' : mms ? 'mm-resume' : tds ? 'td-resume' : 'continue'))) });
		H.screen = 'home';
	}
	/** What Continue plays: the next campaign map; once the story is cleared, the dungeon run (or Training). */
	function continueTarget() {
		const c = col(), nm = nextMap(c.cleared);
		if (H.target && validTarget(H.target)) return H.target;
		if (nm) return { kind: 'map', id: nm.id };
		if (dungeonOpen(c)) return { kind: 'dungeon', run: loadRun() || newRun(startFloors(c.deep).at(-1)) };
		return { kind: 'training' };
	}
	const validTarget = (t) => t.kind === 'training' || (t.kind === 'map' && isOpen(t.id, col().cleared) && (!t.hard || hardOpen(t.id, col().cleared))) || (t.kind === 'dungeon' && dungeonOpen(col()) && t.run) || (t.kind === 'item' && t.dive && (col().items || {})[t.dive.uid] === t.dive.id);
	function targetName(t) {
		if (t.kind === 'map') { const m = mapById(t.id); return 'Story ' + mapNo(m) + ' · ' + m.name + (t.hard ? ' · Hard set' : ''); }
		if (t.kind === 'dungeon') return 'Dungeon · floor ' + t.run.floor + (isBossFloor(t.run.floor) ? ' (boss)' : '');
		if (t.kind === 'item') return 'Item World · ' + HELD[t.dive.id].name + ' · floor ' + t.dive.floor + (t.dive.floor === exitFloor(t.dive.from) ? ' (exit)' : '');
		return 'Training Grounds';
	}
	function targetInfo(t) {
		if (t.kind === 'map') return mapInfo(t.hard ? hardMap(mapById(t.id)) : mapById(t.id));
		if (t.kind === 'dungeon') return floorInfo(t.run.floor, t.run);
		if (t.kind === 'item') return diveInfo(t.dive.id, t.dive.from, t.dive);
		return `<h3 class="bal-h3">Training Grounds</h3><p>Wild Pokémon at your team's level.</p>`;
	}

	// ---- the Dimensional Gate: the campaign's maps by chapter
	// (plan item S5) A MAP SCREEN THAT IS A MAP: the 22 maps as ONE PATH, chapter after chapter, each stop saying what it
	// teaches. (It was a list of one chapter's names behind six tabs.) The tabs jump along the path.
	function stages(focusId) {
		const c = col(), cl = c.cleared || [];
		const nm = nextMap(cl);
		const at = (focusId && mapById(focusId)) || (H.chapter != null && !focusId ? MAPS.find((m) => m.chapter === H.chapter && !cl.includes(m.id) && isOpen(m.id, cl)) || MAPS.find((m) => m.chapter === H.chapter) : null) || nm || MAPS[MAPS.length - 1];
		H.chapter = at.chapter;
		const ch = CHAPTERS.find((x) => x.n === H.chapter) || CHAPTERS[0];
		const tabs = CHAPTERS.map((x) => btn(`${x.n}. ${esc(x.name)}`, { cls: 'bal-tab' + (x.n === ch.n ? ' is-on' : ''), go: () => { H.chapter = x.n; stages(); }, info: () => `<h3 class="bal-h3">Chapter ${x.n}: ${esc(x.name)}</h3><p class="bal-muted">${MAPS.filter((m) => m.chapter === x.n && cl.includes(m.id)).length} / ${MAPS.filter((m) => m.chapter === x.n).length} cleared</p>` })).join('');
		const stop = (m) => {
			const open = isOpen(m.id, cl), done = cl.includes(m.id), here = nm && nm.id === m.id;
			return btn(`<span class="ph-no">${mapNo(m)}</span><span class="ph-row-name">${open ? esc(m.name) : '???'}</span>${m.boss ? '<span class="bal-badge bal-red">Boss</span>' : ''}${(c.medals || []).includes(m.id) ? '<span class="ph-medal" title="Won with nobody lost">🏅</span>' : ''}${(c.hard || []).includes(m.id) ? '<span class="bal-badge bal-red ph-hardtick">Hard ✓</span>' : ''}${done ? '<span class="ph-tick">✓</span>' : open ? '<span class="bal-badge bal-orange">New</span>' : '<span>🔒</span>'}<small class="ph-teach">${open ? esc(teachOf(m.id)) : 'clear the map before it'}</small>`,
				{ cls: (done ? 'bal-green' : 'bal-blue') + ' ph-row ph-stop' + (here ? ' is-here' : '') + (done ? ' is-done' : ''), off: !open && 'Clear the map before it first', go: () => (done ? replay(m) : team({ kind: 'map', id: m.id })), info: () => (open ? mapInfo(m) : '<h3 class="bal-h3">???</h3><p class="bal-muted">Clear the map before it to open this one.</p>') });
		};
		// (the stops are made in the path's order, so the focus order is the path; a chapter's name stands before its first stop)
		const stops = MAPS.map(stop);
		const path = MAPS.map((m, i) => (i === 0 || MAPS[i - 1].chapter !== m.chapter ? `<div class="ph-path-ch" data-ch="${m.chapter}"><span class="bal-badge bal-purple">Chapter ${m.chapter}</span> ${esc((CHAPTERS.find((x) => x.n === m.chapter) || {}).name || '')}</div>` : '') + stops[i]).join('');
		const nTabs = CHAPTERS.length;
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Story</h2><div class="ph-wallet"><span class="bal-badge bal-gold">★ ${Stars.stars()}</span></div></header>
			<div class="bal-tabs ph-tabs ph-booktabs ph-pathtabs">${tabs}<span class="ph-tabkeys bal-muted"><span class="bal-key">Q</span><span class="bal-key">E</span></span></div>
			<p class="ph-sub bal-muted" id="story-sub">The road through all ${MAPS.length} maps: ${cl.filter((id) => mapById(id)).length} cleared. Each stop says what it teaches.</p>
			<div class="ph-body"><nav class="ph-list ph-path bal-scroll">${path}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: nTabs + Math.max(0, MAPS.indexOf(at)), back: () => home('story'), tabs: (d) => { H.chapter = ((ch.n - 1 + d + nTabs) % nTabs) + 1; stages(); } });
		H.screen = 'stages';
		// (the chapter row scrolls sideways on a narrow screen: the open chapter in the middle of it)
		{ const row = root.querySelector('.ph-pathtabs'), on = row && row.querySelector('.bal-tab.is-on'); if (on && row.scrollWidth > row.clientWidth) row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - (row.clientWidth - on.offsetWidth) / 2); }
	}
	// (plan item S4) a cleared map: play it again, or its HARD set
	function replay(m) {
		const c = col(), hd = (c.hard || []).includes(m.id), hm = hardMap(m);
		const rows = [
			btn(`<span class="ph-row-name">Play again</span><small>the foes as they were</small>`, { cls: 'bal-blue ph-row', go: () => team({ kind: 'map', id: m.id }), info: () => mapInfo(m) }),
			btn(`<span class="ph-row-name">Hard set</span>${hd ? '<span class="bal-badge bal-red">Cleared</span>' : `<span class="bal-badge bal-gold">${m.reward.stars} ★</span>`}`, { cls: 'bal-red ph-row', go: () => team({ kind: 'map', id: m.id, hard: true }), info: () => mapInfo(hm) }),
		];
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">${mapNo(m)} ${esc(m.name)}</h2><div class="ph-wallet"><span class="bal-badge bal-gold">★ ${Stars.stars()}</span></div></header>
			<div class="ph-body"><nav class="ph-list">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`, { focus: 0, back: () => stages(m.id) });
		H.screen = 'replay';
	}
	function mapInfo(m) {
		const cl = col().cleared || [], done = cl.includes(m.id);
		const foes = m.foes.map((f) => `${esc(name(f.sp))} Lv ${f.lv}${f.boss ? ' (boss)' : ''}`);
		const top = Math.max(...m.foes.map((f) => f.lv));
		return `<h3 class="bal-h3">${mapNo(m)} ${esc(m.name)}</h3>
			<p class="ph-pill-row"><span class="bal-badge ${done ? 'bal-green' : 'bal-orange'}">${done ? 'Cleared' : 'Not cleared'}</span><span class="bal-badge bal-blue">Foes up to Lv ${top}</span></p>
			${goalSay(m, name) ? `<p id="map-goal"><span class="bal-badge bal-gold">Objective</span> ${esc(goalSay(m, name).replace(/^Objective: /, ''))}</p>` : ''}
			<p>${esc(m.tip)}</p>
			<p class="bal-muted">Foes: ${foes.join(', ')}</p>
			${m.hard ? `<p id="map-hard"><span class="bal-badge bal-red">Hard set</span> The same foes, far stronger, and none of them only watch. ${(col().hard || []).includes(m.id) ? '<span class="bal-muted">Cleared.</span>' : 'First clear: <b class="bal-t-gold">' + m.reward.stars + ' ★</b>'}</p>` : ''}
			<p id="map-medal">${(col().medals || []).includes(m.id) ? '🏅 <b>Medal earned</b>: won with nobody lost.' : '<span class="bal-muted">🏅 Medal: win with nobody lost.</span>'}</p>
			<p>${m.hard ? '' : done ? '<span class="bal-muted">First-clear reward taken</span>' : `First clear: <b class="bal-t-gold">${m.reward.stars} ★</b>${m.reward.fig ? ' and a ' + esc(name(m.reward.fig.sp)) + ' figurine' : ''}`}</p>`;
	}

	// ---- the Item World: the dungeon's runs
	function dungeon() {
		const c = col(), run = loadRun(), starts = startFloors(c.deep);
		const rows = [];
		// (plan item D2) a floor not yet entered has two doors: the row above is the Quiet door, this one the Gilded
		const doors = run && !run.door && doorsAt(run.seed, run.floor) ? doorsSay(run.seed, run.floor) : null;
		if (run) rows.push(btn(`<span class="ph-row-name">Continue on floor ${run.floor}</span>${run.door ? '<span class="bal-badge bal-gold">Gilded door</span>' : doors ? '<span class="bal-badge bal-grey">Quiet door</span>' : ''}${isBossFloor(run.floor) ? '<span class="bal-badge bal-red">Boss</span>' : ''}`, { cls: 'bal-orange ph-row', go: () => team({ kind: 'dungeon', run }), info: () => floorInfo(run.floor, run) }));
		if (doors) rows.push(btn(`<span class="ph-row-name">Floor ${run.floor} by the Gilded door</span><span class="bal-badge bal-gold">${doors.rich.stars} ★</span>`, { cls: 'bal-gold ph-row', go: () => team({ kind: 'dungeon', run: { ...run, door: 'rich' } }), info: () => floorInfo(run.floor, { ...run, door: 'rich' }) }));
		for (const f of starts) rows.push(btn(`<span class="ph-row-name">New run from floor ${f}</span>${f > 1 ? '<span class="bal-badge bal-purple">Checkpoint</span>' : ''}`, { cls: 'bal-red ph-row', go: () => team({ kind: 'dungeon', run: 'new:' + f }), info: () => floorInfo(f, null) + (run ? `<p class="bal-t-red">Starting a new run ends the one on floor ${run.floor}.</p>` : '') }));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">The Dungeon</h2><div class="ph-wallet"><span class="bal-badge bal-gold">★ ${Stars.stars()}</span></div></header>
			<div class="ph-body"><nav class="ph-list">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div><div class="ph-stats bal-muted" id="dg-records">${c.deep ? `<div>Deepest boss beaten: <b>floor ${c.deep}</b></div>` : '<div>No checkpoint yet: beat the floor 10 boss</div>'}${dgStats(c, run)}</div></aside></div></div>`,
		{ back: () => home('dungeon') });
		H.screen = 'dungeon';
	}
	/** The Dungeon's records (plan item D5; dungeon.js), each with what beats it; and this run's streak, while it has one. */
	function dgStats(c, run) {
		const r = dgRecords(c);
		return `<div>Deepest floor cleared: <b>${r.far ? 'floor ' + r.far : 'none yet'}</b></div>`
			+ `<div>Most floors in a row with nobody lost: <b>${r.clean || 'none yet'}</b>${run && run.clean ? ` <span class="bal-badge bal-green">this run: ${run.clean}</span>` : ''}</div>`
			+ `<div>Fastest boss: <b>${r.quick ? r.quick + ' turn' + (r.quick === 1 ? '' : 's') : 'none yet'}</b></div>`;
	}
	function floorInfo(f, run) {
		const boss = isBossFloor(f), tw = run && run.seed ? twistOf(run.seed, f) : null;
		return `<h3 class="bal-h3">Floor ${f}${boss ? ' · Boss' : ''}</h3>${run && run.seed && gearAt(run.seed, f) ? `<p id="floor-gear"><span class="bal-badge bal-red">Deep floor</span> ${boss ? 'The boss holds' : gearCount(f) + ' of the foes hold' + (gearCount(f) === 1 ? 's' : '')} a Lv ${gearLevel(f)} item.</p>` : ''}${tw ? `<p id="floor-twist"><span class="bal-badge bal-purple">${esc(TWISTS[tw].name)}</span> ${esc(TWISTS[tw].say)}</p>` : ''}
			<p class="ph-pill-row"><span class="bal-badge bal-blue">Foes around Lv ${run && run.door === 'rich' ? doorLevel(floorLevel(f, boss)) : floorLevel(f, boss)}</span><span class="bal-badge bal-gold">${run && run.door === 'rich' ? doorStars(f) : floorStars(f)} ★</span></p>${run && run.door === 'rich' ? '<p id="floor-door"><span class="bal-badge bal-gold">Gilded door</span> Stronger foes, and more stars.</p>' : run && run.seed && doorsAt(run.seed, f) ? '<p id="floor-door" class="bal-muted">Two doors lead here: the Quiet door (this), or the Gilded door (stronger foes, more stars).</p>' : ''}
			<p>${boss ? 'A boss floor: beat it for the boss\'s figurine and a checkpoint.' : 'The next boss is on floor ' + (Math.ceil(f / BOSS_EVERY) * BOSS_EVERY) + '.'}</p>
			${run ? '<p class="bal-muted">This run is kept on this device.</p>' : ''}`;
	}

	// ---- TOWER DEFENSE (td/sim.js; tdmode.js): pick a map, the wave to start from, a squad; then the run
	const tdBest = (id) => ((col().td || {})[id]) || 0;
	/** The two ways to play (owner, 2026-11-24): the Road, or Maze Builder (no road: block cards bend the enemies' way). */
	function tdModes(focus) {
		const bestOf = (list) => Math.max(0, ...list.map((m) => tdBest(m.id)));
		const row = (kind, name, sub, list, text) => btn(`<span class="ph-row-name">${name}</span><small>${sub}</small>${bestOf(list) ? '<span class="bal-badge bal-gold">best: wave ' + bestOf(list) + '</span>' : ''}`, { cls: 'bal-blue ph-row', go: () => tdMaps(null, kind), info: () => `<h3 class="bal-h3">${name}</h3>${text}<p class="bal-muted">${list.length} maps</p>` });
		const rows = [
			row('road', 'Road', 'enemies walk a fixed road', TD_MAPS, '<p>Enemies walk the road. Stand your figurines beside it. Slots open as you clear waves; knockouts earn energy.</p>'),
			row('maze', 'Maze Builder', 'no road: you build the way', MAZE_MAPS, `<p>There is no road. Enemies take the shortest way to your base, and you bend it with <b>block cards</b>. Figurines stand on the blocks.</p><p>Gold buys placements, extra cards and boosts. After each wave you pick a reward.</p>`),
		];
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Tower Defense</h2><div class="ph-wallet"><span class="bal-badge bal-gold">★ ${Stars.stars()}</span></div></header>
			<p class="ph-sub bal-muted">Your figurines are towers. Enemies only walk: stop them before they reach your base. <span class="bal-badge bal-green ph-risk">safe: nothing is lost here</span></p>
			<div class="ph-body"><nav class="ph-list">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: focus === 'maze' ? 1 : 0, back: () => home('td') });
		H.screen = 'td-modes';
	}
	function tdMaps(focusId, kind) {
		const maze = kind ? kind === 'maze' : isMazeMap(tdMapById(focusId)), LIST = maze ? MAZE_MAPS : TD_MAPS;
		// (SCREENS THAT READ AT A GLANCE, Plans/POKETACTICA_MODES_PLAN.md A1/A2: a row's badges are one group; a map's detail is
		// labelled facts in the same place for every map, then its one tip)
		const fact = (label, value) => `<span class="ph-fact"><small>${label}</small><b>${value}</b></span>`;
		const rows = LIST.map((m) => { const best = tdBest(m.id), gates = (m.paths || m.gates).length, starts = tdStartWaves(best); return btn(`<span class="ph-row-name">${esc(m.name)}</span><span class="ph-row-tags">${m.rule ? '<span class="bal-badge bal-purple">' + esc(typeof m.rule === 'string' ? m.rule : m.rule.say) + '</span>' : gates > 1 ? '<span class="bal-badge bal-purple">' + gates + ' gates</span>' : ''}${best ? '<span class="bal-badge bal-gold">best: wave ' + best + '</span>' : '<span class="bal-badge bal-orange">New</span>'}</span>`,
			{ cls: 'bal-blue ph-row', go: () => (starts.length > 1 ? tdStart(m.id) : tdNext(m.id, 1)), info: () => `<h3 class="bal-h3">${esc(m.name)}</h3><div class="ph-facts" id="td-facts">${[
				fact('Board', `${m.rows[0].length} × ${m.rows.length}`),
				maze ? fact(m.shift ? 'Gates, one a wave' : 'Gates', (m.gates || []).length) : fact(m.paths.length > 1 ? 'Roads' : 'Road', m.paths.map((p) => p.length + ' tiles').join(' + ')),
				maze ? fact('Bases', (m.bases || [m.base]).length) : '',
				fact('Best', best ? 'wave ' + best : 'not played'),
				starts.length > 1 ? fact('Start from', 'wave ' + starts[starts.length - 1]) : ''].join('')}</div><p class="ph-blurb">${esc(m.tip)}</p>` }); });
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">${maze ? 'Maze Builder' : 'Road'}</h2><div class="ph-wallet"><span class="bal-badge bal-gold">★ ${Stars.stars()}</span></div></header>
			<p class="ph-sub bal-muted">${maze ? 'No road: block cards bend the way.' : 'Stop them before they reach your base.'} <span class="bal-badge bal-green ph-risk">safe: nothing is lost here</span></p>
			<div class="ph-body"><nav class="ph-list">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: Math.max(0, LIST.findIndex((m) => m.id === focusId)), back: () => tdModes(maze ? 'maze' : 'road') });
		H.screen = 'td';
	}
	function tdStart(mapId) {
		const m = tdMapById(mapId), ws = tdStartWaves(tdBest(mapId));
		const rows = ws.map((w) => btn(`<span class="ph-row-name">${w === 1 ? 'From wave 1' : 'From wave ' + w}</span>${w > 1 ? '<span class="bal-badge bal-purple">checkpoint</span>' : ''}`, { cls: 'bal-blue ph-row', go: () => tdNext(mapId, w), info: () => `<h3 class="bal-h3">Wave ${w}</h3><p>${w === 1 ? 'The whole climb.' : 'After the boss of wave ' + (w - 1) + (isMazeMap(m) ? ': with the gold and block cards for the waves skipped.' : ': the slots that wave had opened are open, with no energy yet.')}</p><p class="bal-muted">Enemies around Lv ${Math.round(2.5 + 1.5 * w)}.</p>` }));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">${esc(m.name)}</h2></header>
			<p class="ph-sub bal-muted">Every boss wave you clear (each ${TD_BOSS_EVERY}th) is a checkpoint.</p>
			<div class="ph-body"><nav class="ph-list">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: rows.length - 1, back: () => tdMaps(mapId) });
		H.screen = 'td-start';
	}
	// ---- Mystery Maze (mm/dungeons.js; the run is mmmode.js): the dungeons, who goes in, what they carry
	const MM_PARTY_KEY = 'magepunk_poketactica_mmparty_v1';   // (this device's last party: a convenience)
	const MM_CARRY = [0, 100, 300, 1000];
	const deadlyBadge = '<span class="bal-badge bal-red ph-risk">deadly: a figurine that faints is gone for good</span>';
	function mmDungeons(focusId) {
		H.mmCh = []; H.mmChFor = null;   // (challenge rules are chosen afresh for each run: back at the list, none is on)
		const rec = cleanMm(col().mm);
		const rows = MM_DUNGEONS.map((d) => {
			const isOpen = mmDungeonOpen(d, rec.clear), times = rec.clear[d.id] || 0, best = rec.best[d.id] || 0, need = d.needs && mmDungeonById(d.needs);
			const lvs = mmDungeonLevels(d);
			const kind = (d.endless ? '<span class="bal-badge bal-purple">endless</span>' : `<span class="bal-badge bal-blue">${d.floors.length}F</span>`) + (lvs && lvs.suggest ? `<span class="bal-badge bal-grey">Lv ${lvs.suggest}+</span>` : '');
			const state = !isOpen ? '<span class="bal-badge bal-grey">🔒</span>' : times ? `<span class="bal-badge bal-gold">cleared${times > 1 ? ' ×' + times : ''}</span>` : best ? `<span class="bal-badge bal-orange">best: B${best}F</span>` : '<span class="bal-badge bal-orange">New</span>';
			// (the badges are ONE group: on a phone they go under the name together, never one alone on the next row)
			return btn(`<span class="ph-row-name">${esc(d.name)}</span><span class="ph-row-tags">${kind}${d.lv5 ? '<span class="bal-badge bal-green">Lv 5</span>' : ''}${d.party === 1 ? '<span class="bal-badge bal-grey">solo</span>' : ''}${d.hard ? '<span class="bal-badge bal-red">very hard</span>' : ''}${state}${((rec.ch || {})[d.id] || []).map((k) => `<span class="bal-badge bal-gold ph-chmark" data-ch="${k}" title="cleared: ${esc(MM_CH[k].name)}">${MM_CH[k].icon}</span>`).join('')}</span>`,
				{ cls: 'bal-blue ph-row', off: !isOpen && 'Clear ' + (need ? need.name : 'the dungeon before it') + ' first', go: () => mmParty(d.id),
					// (SCREENS THAT READ AT A GLANCE, Plans/POKETACTICA_MODES_PLAN.md A1/A2: what a dungeon IS as labelled facts and
					// badges, in the same place for every dungeon; one line of words; the explaining sentences are each badge's tooltip)
					info: () => {
						const lv = mmDungeonLevels(d), sky = d.endless ? null : (d.floors.find((f) => f.weather) || {}).weather, specials = d.endless ? [] : [...new Set(d.floors.map((f) => f.special).filter(Boolean))];
						const fact = (label, value) => `<span class="ph-fact"><small>${label}</small><b>${value}</b></span>`;
						const facts = [fact('Floors', d.endless ? 'no end' : d.floors.length), fact('Party', d.party === 1 ? 'alone' : 'up to ' + d.party),
							lv ? fact('Wild', `Lv ${lv.lo}–${lv.hi}`) : fact('Wild', 'Lv 6, +2 a floor'), lv ? fact('Boss', `${esc(name(lv.bossSpecies))} Lv ${lv.boss}`) : '',
							lv && lv.suggest ? fact('Suggested', `Lv ${lv.suggest}+`) : d.lv5 ? fact('You start', 'Lv 5, empty bag') : '',
							d.endless ? fact('Deepest', best ? 'B' + best + 'F' : 'not tried') : fact('Clearing pays', `${d.reward.first} ★ · then ${d.reward.again} ★`) + (best && !times ? fact('Deepest', 'B' + best + 'F') : '')].join('');
						const tag = (cls, text, say) => `<span class="bal-badge ${cls}" title="${esc(say || '')}">${text}</span>`;
						const tags = [...specials.map((k) => tag('bal-gold', esc(MM_SPECIAL[k]), 'A special floor')), d.endless ? tag('bal-gold', 'A special floor every fifth', '') : '',
							sky ? tag('bal-grey', esc(MM_SKY[sky]), MM_SKY_SAY[sky]) : d.endless ? tag('bal-grey', 'Weather on some floors', '') : '',
							lv && lv.bossHelpers ? tag('bal-red', `Boss + ${lv.bossHelpers[1]} ${esc(name(lv.bossHelpers[0]))}`, 'They stand beside the boss, awake') : '',
							lv && lv.bossTrick ? tag('bal-red', 'Boss: ' + esc(MM_TRICKS[lv.bossTrick].name), MM_TRICKS[lv.bossTrick].say) : ''].filter(Boolean).join('');
						const say = [sky ? MM_SKY_SAY[sky] : '', lv && lv.bossTrick ? MM_TRICKS[lv.bossTrick].name + ': ' + MM_TRICKS[lv.bossTrick].say : ''].filter(Boolean);
						// (MILESTONES IN THE ABYSS, plan item M2: what each opens, which are reached, and the next one to aim at)
						const marks = d.id !== ABYSS_ID ? '' : `<ul class="ph-marks" id="mm-marks">${ABYSS_MARKS.map((m) => `<li class="${best >= m.floor ? 'is-done' : ''}"><span class="bal-badge ${best >= m.floor ? 'bal-gold' : 'bal-grey'}">${best >= m.floor ? '✓' : ''} B${m.floor}F</span> a free <b>${esc(MM_ITEMS[m.item].name)}</b> at the start of every run</li>`).join('')}</ul>`;
						// (RECRUITS THAT MATTER, plan item M3: how many of its kinds have joined you, the ones no other dungeon has, and its boss)
						const log = rec.log || {}, kinds = mmKindsOf(d), got = kinds.filter((sp) => log[sp]).length, only = mmOnlyHere(d);
						// (badges and chips, not sentences: the panel stays "one line of words", Plans/POKETACTICA_MODES_PLAN.md A1/A2)
						const recruits = d.endless || !kinds.length ? '' : `<div class="ph-recruits" id="mm-recruits"><div class="ph-tags"><span class="bal-badge ${got ? 'bal-green' : 'bal-grey'}" title="The kinds of this dungeon that have joined you, ever">Recruits: ${got} of ${kinds.length} kinds</span>${lv && times ? `<span class="bal-badge bal-gold" id="mm-bossjoin" title="Cleared before: knock ${esc(name(lv.bossSpecies))} out with your leader, from beside it, and it may join (1 in 4)">Boss may join</span>` : ''}</div>`
							+ (only.length ? `<div class="ph-only"><small class="bal-muted">Only here</small> ${only.map((sp) => `<span class="ph-kind${log[sp] ? ' is-got' : ''}">${log[sp] ? '✓ ' : ''}${esc(name(sp))}</span>`).join(' ')}</div>` : '') + '</div>';
						return `<h3 class="bal-h3">${esc(d.name)}</h3><p class="ph-blurb">${esc(d.blurb)}</p><div class="ph-facts" id="mm-facts">${facts}</div>${marks}${recruits}${tags ? `<div class="ph-tags" id="mm-tags">${tags}</div>` : ''}${say.length ? `<p class="bal-muted ph-fine" id="mm-boss-line">${say.map(esc).join(' ')}</p>` : ''}`
						+ (d.hard ? '<p class="ph-td-none"><b>Very hard.</b> Expect to lose figurines here: even a careful party at the suggested level often does not come back whole.</p>' : '')
						+ (!isOpen ? `<p class="ph-td-none">Clear ${esc(need ? need.name : '')} to open it.</p>` : '');
					} });
		});
		const saved = ctx.mmSaved ? ctx.mmSaved() : null;
		if (saved) for (const a of acts) a.off = 'You have a run in progress: resume it first';   // (what it carries is out of the storage)
		const resumeBtn = saved ? btn(`⏸ Resume <small>${esc(saved.label.replace(/^Mystery Maze · /, ''))}</small>`, { cls: 'bal-orange bal-sm', go: () => ctx.mmResume() }) : '';
		const store = btn(`Storage <small>${mmStoreSize(col())}/${MM_STORE_MAX}</small>`, { cls: 'bal-purple bal-sm', go: () => mmStorage() });
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Mystery Maze</h2>${resumeBtn}${store}<div class="ph-wallet"><span class="bal-badge bal-gold">★ ${Stars.stars()}</span></div></header>
			<p class="ph-sub bal-muted">Floors that are never the same twice. ${deadlyBadge}</p>
			<div class="ph-body"><nav class="ph-list bal-scroll">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: Math.max(0, MM_DUNGEONS.findIndex((d) => d.id === focusId)), back: () => home('mm') });
		H.screen = 'mm';
	}
	const loadMmParty = () => { try { const t = JSON.parse(localStorage.getItem(MM_PARTY_KEY) || '[]'); return Array.isArray(t) ? t.filter((x) => typeof x === 'string').slice(0, 6) : []; } catch { return []; } };
	const saveMmParty = (t) => { try { localStorage.setItem(MM_PARTY_KEY, JSON.stringify(t.slice(0, 6))); } catch { /* not remembered */ } };
	function mmParty(id, focusId) {
		const d = mmDungeonById(id), c = col(), all = list(c);
		if (!H.mmParty) H.mmParty = loadMmParty();
		// CHALLENGE RULES (plan item M1): chosen here, before the run; each makes the clear prize bigger and is marked on the dungeon
		const canCh = mmChallengeable(d);
		if (!H.mmCh || H.mmChFor !== id) { H.mmCh = []; H.mmChFor = id; }
		if (!canCh) H.mmCh = [];
		const solo = H.mmCh.includes('solo'), cap = solo ? 1 : d.party, doneCh = (cleanMm(c.mm).ch || {})[d.id] || [];
		H.mmParty = H.mmParty.filter((x) => c.figs[x]).slice(0, cap);
		if (!H.mmParty.length) H.mmParty = all.slice(0, cap).map((f) => f.id);
		const sug = (mmDungeonLevels(d) || {}).suggest || 0, under = sug ? H.mmParty.filter((x) => c.figs[x] && c.figs[x].level < sug).length : 0;
		const next = () => { saveMmParty(H.mmParty); if (d.lv5) ctx.startMm(id, H.mmParty.map((x) => col().figs[x]).filter(Boolean), {}); else if (H.mmCh.includes('noitems')) ctx.startMm(id, H.mmParty.map((x) => col().figs[x]).filter(Boolean), { pack: [], stars: 0, ch: H.mmCh }); else { H.mmPack = []; H.mmStars = 0; mmPack(id); } };   // (no items: there is nothing to pack)
		if (d.iw && !(H.iw && H.iw.id === d.iw.id && H.iw.from === d.iw.from && (c.items || {})[H.iw.uid] === d.iw.id)) return itemWorld();   // (a dive's dungeon is entered only from its item)
		const go = btn(`${d.lv5 || H.mmCh.includes('noitems') ? 'Enter!' : 'Next: pack'} <small>${H.mmParty.length}/${cap}</small>`, { cls: 'bal-orange ph-sortie', off: !H.mmParty.length && 'Pick at least one figurine', go: next,
			info: () => `<h3 class="bal-h3">${esc(d.name)}</h3><p>The first one you pick leads: you control it. The others follow and fight on their own.</p><p class="bal-muted">If the leader faints, the next takes over.</p>` });
		const cards = all.map((f) => { const k = H.mmParty.indexOf(f.id); return figCard(f, { on: k >= 0, badge: k === 0 ? '★' : k > 0 ? String(k + 1) : '', info: () => figInfo(f), go: () => {
			if (k < 0 && H.mmParty.length >= cap) { ctx.toast(solo ? 'Alone: one figurine. Take it out first' : cap + ' at most here: take one out first'); return; }
			H.mmParty = k >= 0 ? H.mmParty.filter((x) => x !== f.id) : [...H.mmParty, f.id];
			saveMmParty(H.mmParty); mmParty(id, f.id);
		} }); });
		// (made after the cards, so the cards keep their places in the focus order)
		const times = (cleanMm(c.mm).clear[d.id] || 0), base = canCh ? (times ? d.reward.again : d.reward.first) : 0;
		const chBtns = !canCh ? '' : MM_CH_IDS.map((k) => { const on = H.mmCh.includes(k), x = MM_CH[k];
			return btn(`${x.icon} ${esc(x.name)} <small>${on ? 'on' : 'off'} · +${Math.round(x.pay * 100)}%${doneCh.includes(k) ? ' · cleared ✓' : ''}</small>`, { cls: (on ? 'bal-gold' : 'bal-grey') + ' bal-sm ph-preset', extra: `data-ch="${k}" aria-pressed="${on}"`,
				go: () => { H.mmCh = mmCleanCh(on ? H.mmCh.filter((y) => y !== k) : [...H.mmCh, k]); mmParty(id, focusId); },
				info: () => `<h3 class="bal-h3">${x.icon} ${esc(x.name)}</h3><p>${esc(x.say)}</p><p>Clear ${esc(d.name)} with it on and the prize is <b>${Math.round(x.pay * 100)}% bigger</b>${doneCh.includes(k) ? '. You have cleared it this way: its mark is on the dungeon.' : ', and its mark goes on the dungeon for good.'}</p>` }); }).join('');
		const chRow = !canCh ? '' : `<nav class="ph-presets" id="mm-challenges" aria-label="Challenge rules"><span class="bal-muted">Challenge rules</span>${chBtns}<span class="bal-badge ${H.mmCh.length ? 'bal-gold' : 'bal-grey'}" id="mm-ch-pay">clearing pays ${Math.round(base * mmChMult(H.mmCh))} ★</span></nav>`;
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Party</h2>${go}</header>
			<p class="ph-sub"><b>${esc(d.name)}</b> · <span class="bal-muted">${solo ? 'alone: pick one' : 'pick up to ' + d.party + '; the first (★) leads'}</span> ${deadlyBadge}${under ? ` <span class="bal-badge bal-orange ph-risk" id="mm-under">under Lv ${sug}: ${under} of your party</span>` : ''}</p>
			<div class="ph-body"><div class="ph-grid bal-scroll">${cards.join('')}</div><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div>${chRow}</div>`,
		{ focus: focusId ? 1 + all.findIndex((f) => f.id === focusId) : 0, back: () => (d.iw ? diveStyle(H.iw.uid) : mmDungeons(id)) });
		H.screen = 'mm-party';
	}
	/** What to carry in: up to 20 items from the storage, and stars for the shops. All of it is at risk. */
	function mmPack(id, focusKey) {
		const d = mmDungeonById(id), have = mmStoreCount(col()), wallet = Stars.stars();
		// (The Abyss's kit, plan item M2: free, in the bag before anything is packed; the pack has the room that is left)
		const kit = id === ABYSS_ID ? abyssKit((cleanMm(col().mm).best || {})[ABYSS_ID]) : [], room = MM_BAG_MAX - kit.length;
		const packed = (item) => H.mmPack.filter((x) => x === item).length;
		const go = btn(`Enter! <small>${H.mmPack.length}/${room} items · ${H.mmStars} ★</small>`, { cls: 'bal-orange ph-sortie', go: () => ctx.startMm(id, H.mmParty.map((x) => col().figs[x]).filter(Boolean), { pack: H.mmPack, stars: H.mmStars, ...(H.mmCh && H.mmChFor === id && H.mmCh.length ? { ch: H.mmCh } : {}), ...(d.iw && H.iw ? { iwUid: H.iw.uid, ...(H.iw.back ? { iwBack: H.iw.back } : {}) } : {}) }),
			info: () => `<h3 class="bal-h3">${esc(d.name)}</h3><p>What you carry in comes back only if you clear the dungeon or escape. If the party falls, or you give up, it is lost.</p>${d.iw ? '<p>Clear it and the <b>' + esc(HELD[d.iw.id].name) + '</b> becomes <b>level ' + d.iw.exit + '</b>. Escaping keeps your bag, but banks nothing for the item.</p>' : ''}` });
		const carry = btn(`<span class="ph-row-name">Stars to carry</span><span class="bal-badge bal-gold">${H.mmStars} ★</span>`, { cls: 'bal-gold ph-row', go: () => {
			const steps = [...new Set([...MM_CARRY.filter((n) => n <= wallet), wallet])].sort((a, b) => a - b);
			H.mmStars = steps[(steps.indexOf(H.mmStars) + 1) % steps.length]; mmPack(id, 'stars');
		}, info: () => `<h3 class="bal-h3">Stars to carry</h3><p>For the shops inside. You have ${wallet} ★. Z changes the amount.</p><p class="ph-td-none">Stars you carry are lost if the run is.</p>` });
		const ids = Object.keys(have).sort((a, b) => MM_ITEMS[a].name.localeCompare(MM_ITEMS[b].name));
		const rows = ids.map((item) => btn(`${goodIconImg(item)}<span class="ph-row-name">${esc(MM_ITEMS[item].name)}</span><span class="bal-badge bal-grey">have ${have[item]}</span>${packed(item) ? '<span class="bal-badge bal-green">taking ' + packed(item) + '</span><span class="ph-slot-x" data-clear aria-label="Put one back">✕</span>' : ''}`, { cls: 'bal-blue ph-row',
			go: () => { if (H.mmPack.length >= room) { ctx.toast('The bag holds ' + MM_BAG_MAX + (kit.length ? ' (your kit takes ' + kit.length + ')' : '')); return; } if (packed(item) >= have[item]) { ctx.toast('That is all of them'); return; } H.mmPack = [...H.mmPack, item]; mmPack(id, item); },
			alt: () => { const i = H.mmPack.lastIndexOf(item); if (i >= 0) { H.mmPack = H.mmPack.filter((_, k) => k !== i); mmPack(id, item); } },
			info: () => `<h3 class="bal-h3">${esc(MM_ITEMS[item].name)}</h3><p>${esc(MM_ITEMS[item].note)}</p><p class="bal-muted">Z: take one · C (or the ✕): put one back</p>` }));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Pack</h2>${go}</header>
			<p class="ph-sub"><b>${esc(d.name)}</b> · <span class="bal-muted">take up to ${room} items from your storage${ids.length ? '' : ' (it is empty: you will fill it with what you carry out)'}</span>${kit.length ? ` <span class="bal-badge bal-gold" id="mm-kit">Your Abyss kit, free: ${kit.map((k) => esc(MM_ITEMS[k].name)).join(', ')}</span>` : ''}</p>
			<div class="ph-body"><nav class="ph-list bal-scroll">${carry}${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: focusKey === 'stars' ? 1 : focusKey ? 2 + ids.indexOf(focusKey) : 0, back: () => mmParty(id) });
		H.screen = 'mm-pack';
	}
	function mmStorage() {
		const have = mmStoreCount(col()), ids = Object.keys(have).sort((a, b) => MM_ITEMS[a].name.localeCompare(MM_ITEMS[b].name));
		const rows = ids.map((item) => btn(`${goodIconImg(item)}<span class="ph-row-name">${esc(MM_ITEMS[item].name)}</span><span class="bal-badge bal-grey">×${have[item]}</span>`, { cls: 'bal-blue ph-row', info: () => `<h3 class="bal-h3">${esc(MM_ITEMS[item].name)}</h3><p>${esc(MM_ITEMS[item].note)}</p>` }));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Storage</h2><div class="ph-wallet"><span class="bal-badge bal-purple">${mmStoreSize(col())}/${MM_STORE_MAX}</span></div></header>
			<p class="ph-sub bal-muted">What you have carried out of the maze. Take up to ${MM_BAG_MAX} into your next dungeon.</p>
			<div class="ph-body"><nav class="ph-list bal-scroll">${rows.join('') || '<p class="bal-muted">Nothing yet.</p>'}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: 0, back: () => mmDungeons() });
		H.screen = 'mm-storage';
	}
	// ---- Maze Builder's HEROES (owner, 2026-11-24; td/heroes.js): who the run is played as. Brock is free; the others open
	// when a wave has been cleared in Maze Builder (any map, any hero).
	const MZ_HERO_KEY = 'magepunk_poketactica_mzhero_v1';   // (this device's last hero: a convenience)
	const mazeBest = () => Math.max(0, ...MAZE_MAPS.map((m) => tdBest(m.id)));
	// (plan item B2: the frame a hero's portrait has earned, by the best wave cleared AS that hero)
	const heroPic = (h, cls = '') => { const f = frameOf(tdBest('hero-' + h.id)); return portraitImg(h.id, (cls + (f ? ' is-frame is-frame-' + f : '')).trim()); };   // (td/portraits.js: drawn in code)
	const MZ_DECK2_KEY = 'magepunk_poketactica_mzdeck2_v1';   // (which heroes are set to their second deck, on this device)
	const deck2On = (h) => { if (!H.tdDeck2) { try { H.tdDeck2 = JSON.parse(localStorage.getItem(MZ_DECK2_KEY) || '{}') || {}; } catch { H.tdDeck2 = {}; } } return !!H.tdDeck2[h.id] && deck2Open(h, tdBest('hero-' + h.id)); };
	const SHAPE_SAY = { one: '1 tile', two: '2 in a line', three: '3 in a line', corner: 'Corner' };
	function deckSay(h) {
		const n = {}; for (const c of (deck2On(h) ? h.deck2 : h.deck)) { const k = (c.bonus ? MZ_BONUS[c.bonus].name + ' ' : '') + (SHAPE_SAY[c.shape] || c.shape); n[k] = (n[k] || 0) + 1; }
		return Object.entries(n).map(([k, v]) => (v > 1 ? v + ' × ' : '') + esc(k)).join(', ');
	}
	function tdHero(mapId, startWave, focusId) {
		const m = tdMapById(mapId), best = mazeBest();
		if (!H.tdHero) { try { H.tdHero = localStorage.getItem(MZ_HERO_KEY) || 'brock'; } catch { H.tdHero = 'brock'; } }
		if (!heroById(H.tdHero) || !heroOpen(heroById(H.tdHero), best)) H.tdHero = 'brock';
		const rows = HEROES.map((h) => { const open = heroOpen(h, best), hb = tdBest('hero-' + h.id), d2 = deck2Open(h, hb), on2 = deck2On(h), fr = frameOf(hb), nextFr = FRAME_WAVES.find((w) => hb < w);
			const earn = `<p id="hero-earn"><b>To earn as ${esc(h.name)}</b><br><span class="bal-badge ${d2 ? 'bal-gold' : 'bal-grey'}">${d2 ? '✓ ' : ''}wave ${DECK2_WAVE}</span> a second deck <span class="bal-muted">${esc(h.deck2Say)}</span><br>${FRAME_WAVES.map((w, i) => `<span class="bal-badge ${hb >= w ? 'bal-gold' : 'bal-grey'}">${hb >= w ? '✓ ' : ''}wave ${w}</span> a ${['bronze', 'silver', 'gold'][i]} frame`).join(' · ')}</p>`;
			const deckRow = !d2 ? '' : btn(`<span class="ph-row-name">${esc(h.name)}'s deck</span><span class="bal-badge ${on2 ? 'bal-gold' : 'bal-grey'}">${on2 ? 'second' : 'first'}</span><small>press to change</small>`, { cls: 'bal-grey ph-row ph-deck2', extra: `data-deck2="${h.id}"`, go: () => { H.tdDeck2 = { ...(H.tdDeck2 || {}), [h.id]: !on2 }; try { localStorage.setItem(MZ_DECK2_KEY, JSON.stringify(H.tdDeck2)); } catch { /* not remembered */ } tdHero(mapId, startWave, h.id); },
				info: () => `<h3 class="bal-h3">${esc(h.name)}'s second deck</h3><p>${esc(h.deck2Say)}</p><p class="bal-muted">Earned at wave ${DECK2_WAVE} as ${esc(h.name)}. The passive and ${esc(h.name)}'s own card are the same with either deck.</p>` });
			return btn(`${heroPic(h)}<span class="ph-row-name">${esc(h.name)}</span><span class="bal-badge bal-grey">${esc(h.type)}</span>${on2 ? '<span class="bal-badge bal-gold">deck 2</span>' : ''}${hb ? '<small>best: wave ' + hb + '</small>' : ''}${open ? '' : '<span class="bal-badge bal-red">🔒 wave ' + h.unlock + '</span>'}`,
			{ cls: 'bal-blue ph-row', off: !open && `Clear wave ${h.unlock} in Maze Builder to play as ${h.name} (your best: ${best})`, go: () => { H.tdHero = h.id; try { localStorage.setItem(MZ_HERO_KEY, h.id); } catch { /* not remembered */ } tdSquad(mapId, startWave); },
				info: () => `<div class="pt-hero-head">${heroPic(h, 'is-big')}<div><h3 class="bal-h3">${esc(h.name)}</h3><p class="bal-muted">${esc(h.title)}${hb ? ' · best: wave ' + hb : open ? ' · no run yet' : ''}</p></div></div><p>${esc(h.say)}</p>
					<p><b>${esc(PASSIVES[h.passive].name)}</b> <span class="bal-muted">from the start</span><br>${esc(PASSIVES[h.passive].text)}</p>
					<p><b>${on2 ? 'Second deck' : 'Deck'}</b> <span class="bal-muted">${(on2 ? h.deck2 : h.deck).length + (h.card ? 1 : 0)} block cards</span><br>${deckSay(h)}</p>
					${h.card ? `<p id="hero-card"><span class="bal-badge bal-gold">Only ${esc(h.name)}</span> <b>${esc(MZ_BONUS[h.card.bonus].name)}</b> <span class="bal-muted">(${esc(SHAPE_SAY[h.card.shape] || h.card.shape)})</span><br>${esc(MZ_BONUS[h.card.bonus].text)}</p>` : ''}
					<p><b>After each boss wave</b> <span class="bal-muted">pick 1 of 3 passives, mostly from</span><br>${h.pool.map((id) => esc(PASSIVES[id].name)).join(', ')}</p>
					<p class="bal-muted ph-fine" id="hero-rare">From boss wave 20 a <b>rare</b> passive may be offered. Some passives are a <b>pair</b>: hold both and they give more.</p>
					${open ? earn : '<p class="bal-badge bal-red">Opens when you clear wave ' + h.unlock + ' in Maze Builder (your best: ' + best + ')</p>'}` }) + deckRow; });
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Hero</h2></header>
			<p class="ph-sub"><b>${esc(m.name)}${startWave > 1 ? ' · from wave ' + startWave : ''}</b> · <span class="bal-muted">who you play as: their deck of block cards, and their passives</span></p>
			<div class="ph-body"><nav class="ph-list">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: Math.max(0, HEROES.findIndex((h) => h.id === (focusId || H.tdHero))), back: () => (tdStartWaves(tdBest(mapId)).length > 1 ? tdStart(mapId) : tdMaps(mapId)) });
		H.screen = 'td-hero';
	}
	/** On from a map (and its start wave): Maze Builder picks a hero first. */
	const tdNext = (mapId, w) => (isMazeMap(tdMapById(mapId)) ? tdHero(mapId, w) : tdSquad(mapId, w));
	const loadTdSquad = () => { try { const t = JSON.parse(localStorage.getItem(TD_SQUAD_KEY) || '[]'); return Array.isArray(t) ? t.filter((x) => typeof x === 'string').slice(0, SQUAD_MAX) : []; } catch { return []; } };
	const saveTdSquad = (t) => { try { localStorage.setItem(TD_SQUAD_KEY, JSON.stringify(t.slice(0, SQUAD_MAX))); } catch { /* not remembered */ } };
	/** What a figurine's equipped moves do in Tower Defense (the ones with no use there are named). */
	function tdMovesInfo(f) {
		const li = f.equipped.map((mid) => {
			const d = data.moves[mid] || {}, sh = data.shapes && data.shapes[mid];
			const m = sh ? { ...moveAt(sh, d.power || 0, d.acc, (f.pool.find((p) => p.id === mid) || {}).lv || 1), id: mid, category: d.category } : null;
			const k = m ? tdKind(mid, m) : 'none';
			const say = { damage: 'attacks', foe: 'status on enemies', buff: 'boosts itself', sp: 'gives SP', weather: 'weather', paint: 'terrain', field: 'a field effect', trap: 'a hazard on the road', none: 'no effect in Tower Defense' }[k];
			return `<li>${esc(d.name || mid)} <span class="${k === 'none' ? 'ph-td-none' : 'bal-muted'}">${say}</span></li>`;
		}).join('');
		return `<ul class="ph-moves">${li}</ul>`;
	}
	function tdSquad(mapId, startWave, focusId) {
		const m = tdMapById(mapId), c = col(), all = list(c);
		if (!H.tdSquad) H.tdSquad = loadTdSquad();
		H.tdSquad = H.tdSquad.filter((id) => c.figs[id]);
		if (!H.tdSquad.length) H.tdSquad = all.slice(0, SQUAD_MAX).map((f) => f.id);
		const go = btn(`Start! <small>${H.tdSquad.length}/${SQUAD_MAX}</small>`, { cls: 'bal-orange ph-sortie', off: !H.tdSquad.length && 'Pick at least one figurine', go: () => { saveTdSquad(H.tdSquad); ctx.startTd(mapId, H.tdSquad.map((id) => col().figs[id]).filter(Boolean), startWave, isMazeMap(m) ? H.tdHero || 'brock' : null, isMazeMap(m) && !!heroById(H.tdHero || 'brock') && deck2On(heroById(H.tdHero || 'brock'))); },
			info: () => `<h3 class="bal-h3">${esc(m.name)}</h3><p>${esc(m.tip)}</p><p class="bal-muted">${isMazeMap(m) ? 'You start with ' + MZ_GOLD.start + ' gold, ' + MZ_DEAL_FIRST + ' block cards and ' + LIVES + ' lives. The first figurine costs ' + MZ_GOLD.place + ' gold, each one after it ' + MZ_GOLD.placeMore + ' more.' : 'You start with ' + SLOTS_START + ' tower slots and ' + LIVES + ' lives; more slots open as you clear waves.'}</p>` });
		const cards = all.map((f) => { const k = H.tdSquad.indexOf(f.id); return figCard(f, { on: k >= 0, badge: k >= 0 ? String(k + 1) : '', info: () => figInfo(f) + '<p class="ph-ways-h"><b>In Tower Defense</b></p>' + tdMovesInfo(f), go: () => {
			H.tdSquad = k >= 0 ? H.tdSquad.filter((x) => x !== f.id) : H.tdSquad.length < SQUAD_MAX ? [...H.tdSquad, f.id] : H.tdSquad;
			if (k < 0 && H.tdSquad.length === SQUAD_MAX && !H.tdSquad.includes(f.id)) ctx.toast(SQUAD_MAX + ' at most: take one out first');
			saveTdSquad(H.tdSquad); tdSquad(mapId, startWave, f.id);
		} }); });
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Squad</h2>${go}</header>
			<p class="ph-sub"><b>${esc(m.name)}${isMazeMap(m) && heroById(H.tdHero) ? ' · as ' + esc(heroById(H.tdHero).name) : ''}${startWave > 1 ? ' · from wave ' + startWave : ''}</b> · <span class="bal-muted">pick up to ${SQUAD_MAX}: the ones you may place as towers</span> <span class="bal-badge bal-green ph-risk">safe: nothing is lost here</span></p>
			<div class="ph-body"><div class="ph-grid bal-scroll">${cards.join('')}</div><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: focusId ? 1 + all.findIndex((f) => f.id === focusId) : 0, back: () => (isMazeMap(m) ? tdHero(mapId, startWave) : tdStartWaves(tdBest(mapId)).length > 1 ? tdStart(mapId) : tdMaps(mapId)) });
		H.screen = 'td-squad';
	}

	// ---- permanent loss: the warning before the first deadly battle on this device, then straight in
	const warned = () => { try { return localStorage.getItem(PERMA_KEY) === '1'; } catch { return true; } };
	function sortieTo(target, figs, back) {
		if (!deadly(target) || warned()) return ctx.start({ target, team: figs });
		const go = () => { try { localStorage.setItem(PERMA_KEY, '1'); } catch { /* private mode: it asks again next time */ } ctx.start({ target, team: figs }); };
		const yes = btn('I understand: Sortie!', { cls: 'bal-red ph-wide', go });
		const no = btn('Not yet', { cls: 'bal-grey ph-wide', go: () => (back ? back() : home('continue')) });
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">☠ Permanent loss</h2></header>
			<div class="bal-panel ph-help"><p><b>A figurine knocked out in the Story, the Dungeon or the Item World is gone for good</b>, with the item it holds. Winning the battle does not bring it back, and neither does giving up or closing the game.</p>
			<p>Keep them healed, keep them out of reach (👁 shows where foes can strike), and pull a hurt one back. A Focus Thread or Focus Knot lets one hang on with 1 HP.</p>
			<p><b>Give up is a free retreat.</b> Menu → Give up leaves the battle at once and costs nothing: every figurine still standing comes home. It is the one way to save a team that is losing.</p>
			<p class="bal-muted">Training Grounds and Versus are safe: nothing is lost there.</p>
			<nav class="ph-menu">${yes}${no}</nav></div></div>`, { focus: 1, back: () => (back ? back() : home('continue')) });
		H.screen = 'perma';
	}
	// ---- the memorial
	function fallen() {
		const all = fallenList(col());
		const cards = all.map((e) => figCard(e.fig, { info: () => `<div class="ph-fig"><img src="${esc(sprite(e.fig.species))}" alt="" draggable="false"><div><h3 class="bal-h3">${esc(name(e.fig.species))}${e.fig.shiny ? ' ★' : ''}</h3><div>Lv ${e.fig.level} ${types(e.fig.species)}</div></div></div>
			<p>Lost${e.where ? ' at <b>' + esc(e.where) + '</b>' : ''}${e.by ? ', knocked out by a ' + esc(name(e.by)) : ''}.</p>${e.fig.held ? '<p class="bal-muted">Its ' + esc(goodName(e.fig.held)) + ' went with it.</p>' : ''}<p class="bal-muted">${e.at ? new Date(e.at).toLocaleDateString() : ''}</p>` }));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Fallen</h2></header>
			<p class="ph-sub bal-muted">Figurines knocked out in the Story, the Dungeon, the Item World and Mystery Maze. They are gone for good; this list remembers the last ${FALLEN_DAYS} days.</p>
			<div class="ph-body"><div class="ph-grid bal-scroll ph-fallen">${cards.join('') || '<p class="bal-muted">No one has fallen.</p>'}</div><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: 0, back: () => home('fallen') });
		H.screen = 'fallen';
	}

	// ---- the sortie: the team for one battle
	function teamFigs() { const c = col(), t = H.team.map((id) => c.figs[id]).filter(Boolean); return t.length ? t : list(c).slice(0, TEAM_MAX); }   // (no team picked yet: the strongest six)
	function team(target, focusId) {
		H.target = target;
		const c = col(), all = list(c);
		H.team = H.team.filter((id) => c.figs[id]);
		if (!H.team.length) H.team = all.slice(0, TEAM_MAX).map((f) => f.id);
		const vs = target.kind === 'versus';
		const back = vs ? target.back : target.kind === 'map' ? () => (target.hard ? replay(mapById(target.id)) : stages(target.id)) : target.kind === 'dungeon' ? () => dungeon() : target.kind === 'item' ? () => itemWorld(target.dive.uid) : () => training(target.drill);
		const tName = vs ? target.label : target.kind === 'dungeon' && typeof target.run === 'string' ? 'Dungeon · new run from floor ' + target.run.slice(4) : targetName(target);
		const sortie = btn(`${vs ? esc(target.button) : 'Sortie!'} <small>${H.team.length}/${TEAM_MAX}</small>`, { cls: 'bal-orange ph-sortie', off: !H.team.length && 'Pick at least one figurine', go: () => {
			if (vs) { saveTeam(H.team); return target.go(teamFigs().map((f) => f.id)); }
			let t = target;
			if (t.kind === 'dungeon' && typeof t.run === 'string') { const r = newRun(+t.run.slice(4)); saveRun(r); t = { kind: 'dungeon', run: r }; }
			if (t.kind === 'dungeon' && t.run.door) saveRun(t.run);   // (the door taken is the run's: plan item D2)
			if (t.kind === 'item') saveDive(t.dive);   // (the dive begins: it waits on this device between floors)
			H.target = t; saveTeam(H.team);
			sortieTo(t, teamFigs(), () => team(t));
		}, info: () => (vs ? target.info() : targetInfo(target.kind === 'dungeon' && typeof target.run === 'string' ? { kind: 'dungeon', run: { floor: +target.run.slice(4) } } : target)) });
		const toMoves = (fid) => moves(fid, { back: () => team(target, fid) });
		const cards = all.map((f) => { const k = H.team.indexOf(f.id); return figCard(f, { on: k >= 0, badge: k >= 0 ? String(k + 1) : '', info: () => figInfo(f) + '<p class="bal-muted"><span class="bal-key">C</span> its moves</p>', alt: () => toMoves(f.id), go: () => {
			H.team = k >= 0 ? H.team.filter((x) => x !== f.id) : H.team.length < TEAM_MAX ? [...H.team, f.id] : H.team;
			if (k < 0 && H.team.length === TEAM_MAX && !H.team.includes(f.id)) ctx.toast('Six at most: take one out first');
			saveTeam(H.team); team(target, f.id);
		} }); });
		const movesBtn = `<button class="bal-btn bal-purple bal-sm ph-movesbtn" data-moves>✎ Moves <span class="bal-key">C</span></button>`;
		// TEAM PRESETS (plan item V3: "picking six each time"): three saved teams. Z on a saved one uses it; on an empty one
		// saves the team picked now; C saves over it. (Made after the cards, so the cards keep their places in the focus order.)
		const sets = loadPresets().map((ids) => ids.filter((id) => c.figs[id]));
		const setBtns = sets.map((ids, i) => {
			const names = ids.map((id) => name(c.figs[id].species)), same = ids.length > 0 && ids.join() === H.team.join();
			const put = () => { const all3 = loadPresets(); all3[i] = [...H.team]; savePresets(all3); ctx.toast('Saved as team ' + (i + 1)); team(target, focusId); };
			return btn(`Team ${i + 1} <small>${ids.length ? ids.length + ' saved' : 'empty'}</small>`, { cls: (same ? 'bal-orange' : ids.length ? 'bal-blue' : 'bal-grey') + ' bal-sm ph-preset', extra: `data-preset="${i}"`,
				go: () => { if (!ids.length) return put(); H.team = [...ids]; saveTeam(H.team); ctx.toast('Team ' + (i + 1) + ': ' + names.join(', ')); team(target, focusId); },
				alt: put,
				info: () => `<h3 class="bal-h3">Team ${i + 1}</h3>${ids.length ? `<p>${names.map(esc).join(', ')}</p><p class="bal-muted"><span class="bal-key">Z</span> use this team · <span class="bal-key">C</span> save the team picked now over it</p>` : '<p>Empty.</p><p class="bal-muted"><span class="bal-key">Z</span> saves the team picked now here.</p>'}<p class="bal-muted">Saved teams are kept on this device.</p>` });
		}).join('');
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Team</h2>${movesBtn}${sortie}</header>
			<p class="ph-sub"><b>${esc(tName)}</b> · <span class="bal-muted">pick up to six; they deploy in this order</span> ${deadly(target) ? '<span class="bal-badge bal-red ph-risk">☠ a knocked-out figurine is gone for good</span>' : '<span class="bal-badge bal-green ph-risk">safe: nothing is lost here</span>'}</p>
			<div class="ph-body"><div class="ph-grid bal-scroll">${cards.join('')}</div><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div>
			<nav class="ph-presets" id="team-presets" aria-label="Saved teams"><span class="bal-muted">Saved teams</span>${setBtns}</nav></div>`,
		{ focus: focusId ? 1 + all.findIndex((f) => f.id === focusId) : 0, back });
		H.screen = 'team'; H.teamMoves = () => { const fid = H.focus >= 1 ? (all[H.focus - 1] || {}).id : null; if (fid) toMoves(fid); else ctx.toast('Choose a figurine first'); };
	}

	// ---- the Map maker (editor.js / editmode.js): this device's maps; one by its share code
	function maps(focusId) {
		const list = loadMaps(), keys = [], items = [];
		const add = (key, html) => { keys.push(key); items.push(html); };
		add('new', btn(`<span class="ph-big">＋ New map</span><small>pick its size: 8×8 up to ${MAX_W}×${MAX_H}</small>`, { cls: 'bal-orange ph-wide', go: () => newSize(), info: () => '<h3 class="bal-h3">New map</h3><p>Opens the map maker on the board. Arrows move, Z uses the tool, C changes tool, V its option, X undoes, ⏎ the menu (Versus on this map, save, share, size, theme).</p>' }));
		add('code', btn('<span class="ph-big">⌨ Load a code</span><small>a map a friend shared</small>', { cls: 'bal-blue ph-wide', go: () => loadCode(), info: () => '<h3 class="bal-h3">Load a code</h3><p>Type the 6-letter code of a shared map: it joins your maps.</p>' }));
		for (const e of list) add(e.id, btn(`<span class="ph-big">${esc(e.map.name)}</span><small>${e.map.rows[0].length}×${e.map.rows.length} · ${esc(e.map.theme)} · ${e.map.seats.length} seat${e.map.seats.length === 1 ? '' : 's'}${e.map.foes.length ? ' · ' + e.map.foes.length + ' wild' : ''}${e.code ? ' · code ' + esc(e.code) : ''}</small>`, { cls: 'bal-grey ph-wide', go: () => mapScreen(e.id), info: () => madeInfo(e) }));
		render(`<div class="ph-screen"><header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Map maker</h2></header>
			<div class="ph-body"><nav class="ph-menu bal-scroll">${items.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`, { focus: Math.max(0, keys.indexOf(focusId || 'new')), back: () => home('maps') });
		H.screen = 'maps';
	}
	/** A new map's size (the editor's Wider / Taller / … change it after). */
	function newSize() {
		const items = NEW_SIZES.map(([w, h]) => btn(`<span class="ph-big">${w} × ${h}</span><small>${w <= 8 ? 'a quick duel' : w <= 12 ? 'room for 3-4 players' : w <= 16 ? 'a big battlefield' : w <= 24 ? 'a war for 4 and the wild' : 'the biggest'}</small>`,
			{ cls: 'bal-orange ph-wide', go: () => ctx.editMap(null, { w, h }), info: () => `<h3 class="bal-h3">${w} × ${h}</h3><p>A flat meadow, two PvP seats in opposite corners (add up to 4, and wild foes). Wider / Narrower / Taller / Shorter in the editor's menu change it a tile at a time (${MAX_W} × ${MAX_H} at most).</p>` }));
		render(`<div class="ph-screen"><header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">New map: its size</h2></header>
			<div class="ph-body"><nav class="ph-menu">${items.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`, { back: () => maps() });
		H.screen = 'new-size';
	}
	function madeInfo(e) {
		const m = e.map, pr = mapProblems(m);
		return `<h3 class="bal-h3">${esc(m.name)}</h3><p>${m.rows[0].length}×${m.rows.length}, ${esc(m.theme)}. ${m.seats.length} PvP seat${m.seats.length === 1 ? '' : 's'}. Wild foes: ${m.foes.map((f) => esc(name(f.sp)) + ' Lv ' + f.lv).join(', ') || 'none'}.</p>
			<p>${pr.length ? '⚠ ' + esc(pr[0]) : '✓ a Versus arena for ' + (m.seats.length === 2 ? '2' : '2-' + m.seats.length)}</p><p class="bal-muted">Made maps are for Versus only.</p>${e.code ? '<p>Share code <b>' + esc(e.code) + '</b></p>' : ''}`;
	}
	function mapScreen(id) {
		const e = loadMaps().find((x) => x.id === id);
		if (!e) return maps();
		const pr = mapProblems(e.map);
		const items = [
			btn('<span class="ph-big">✎ Edit</span>', { cls: 'bal-orange ph-wide', go: () => ctx.editMap(e), info: () => madeInfo(e) }),
			btn(`<span class="ph-big">⚔ Versus on this map</span><small>${signedIn() ? 'make a match on it' : 'sign in to play online'}</small>`, { cls: 'bal-blue ph-wide', off: (pr.length && pr[0]) || (!signedIn() && 'Sign in (the top bar) to play Versus'), go: () => versusOn(e.id), info: () => madeInfo(e) }),
			// (plan item K1) a made map with Tower Defense marks is played from here, as a Maze Builder map or on its Road.
			// Practice: no stars, no EXP, no record. The squad is the one last used in Tower Defense (or the first twelve).
			...['maze', 'road'].map((kind) => { const why = tdProblems(e.map, kind), name = kind === 'maze' ? 'Maze Builder' : 'the Road'; return btn(`<span class="ph-big">🏰 Play as ${kind === 'maze' ? 'Maze Builder' : 'a Road map'}</span><small>${why.length ? esc(why[0]) : 'practice: no stars, no EXP'}</small>`, { cls: 'bal-green ph-wide', off: why.length ? why[0][0].toUpperCase() + why[0].slice(1) : false,
				go: () => { const m = kind === 'maze' ? asTdMaze(e.map) : asTdRoad(e.map), ids = loadTdSquad().filter((x) => col().figs[x]), squad = (ids.length ? ids.map((x) => col().figs[x]) : list(col()).slice(0, SQUAD_MAX)); if (!m || !squad.length) { ctx.toast('It cannot be played yet'); return; } ctx.startTd(m, squad, 1, null, false); },
				info: () => `<h3 class="bal-h3">${esc(e.map.name)} on ${name}</h3><p>${kind === 'maze' ? 'Enemies come in by the gates and walk to the base over flat ground; you bend their way with block cards.' : 'Enemies walk the road painted in Dirt from each gate to the base.'}</p><p class="bal-muted">A made map is for practice: it pays no stars and no EXP, and keeps no record. It plays with your last Tower Defense squad.</p>${why.length ? '<p class="bal-t-red">' + why.map(esc).join('<br>') + '</p>' : ''}` }); }),
			btn('<span class="ph-big">🗑 Delete</span>', { cls: 'bal-grey ph-wide', go: () => { saveMaps(loadMaps().filter((x) => x.id !== id)); ctx.toast('Deleted ' + e.map.name); maps(); }, info: () => '<p>Removes it from this device (a shared code still works for friends).</p>' }),
		];
		render(`<div class="ph-screen"><header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">${esc(e.map.name)}</h2></header>
			<div class="ph-body"><nav class="ph-menu">${items.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`, { back: () => maps(id) });
		H.screen = 'map';
	}
	async function loadCode() { const id = await fetchCode(); if (id) maps(id); }
	/** A shared map, by its code, into this device's maps. -> its id here, or null. (The Map Maker's Load, and the Versus lobby's "a shared map": plan item V4.) */
	async function fetchCode() {
		const code = await askText({ title: 'The 6-letter map code', maxLength: 6, upper: true, charset: 'code' });
		if (!code) return null;
		const r = await ctx.call('ptmap-get', { code: code.trim().toUpperCase() });
		const m = r && cleanMap(r.map);
		if (!m) { ctx.toast((r && r.error) || 'No map with that code'); return null; }
		if (saveBlock(m)) { ctx.toast('That map has under 2 PvP bases: it can\'t be played'); return null; }
		const id = 'm' + Date.now().toString(36);
		saveMaps([{ id, map: m, at: Date.now(), code: code.trim().toUpperCase() }, ...loadMaps()]);
		ctx.toast(m.name + (r.by ? ' by ' + r.by : '') + ' joined your maps');
		return id;
	}

	// ---- Versus: online PvP for 2-4 (server/ptpvp.mjs; the match itself is main.js startOnline)
	const vsRules = (o) => `${o.size} players${o.cpus ? ' (' + o.cpus + ' computer' + (o.cpus > 1 ? 's' : '') + ')' : ''} · ${esc(o.arena === 'custom' ? (o.arenaName || (o.map && o.map.name) || 'a made map') : (arenaById(o.arena) || ARENAS[0]).name)} · ${o.lv ? 'everyone Lv ' + o.lv : 'own levels'}${o.plain ? ' · plain items' : ''}${o.clock ? ' · ' + (o.clock === 120 ? '2 min' : o.clock + ' s') + ' a turn' : ''}`;
	// A LOBBY THAT READS (plan item V1): the rule set was one grey sentence, and who the match waits for was only on the
	// host's Start button. The rules are badges (a capped match's is gold), and one line says what the lobby waits for.
	const vsBadges = (o) => {
		const arena = o.arena === 'custom' ? (o.arenaName || (o.map && o.map.name) || 'a made map') : (arenaById(o.arena) || ARENAS[0]).name;
		return `<span class="bal-badge bal-blue" data-rule="players">${o.size} players</span>${o.cpus ? `<span class="bal-badge bal-purple" data-rule="cpus">${o.cpus} computer${o.cpus > 1 ? 's' : ''}</span>` : ''}<span class="bal-badge bal-grey" data-rule="arena">🗺 ${esc(arena)}</span>`
			+ (o.lv ? `<span class="bal-badge bal-gold" data-rule="cap">Capped: everyone Lv ${o.lv}</span>` : '<span class="bal-badge bal-grey" data-rule="cap">Own levels</span>')
			+ (o.plain ? '<span class="bal-badge bal-gold" data-rule="plain">Plain items</span>' : '')
			+ (o.clock ? `<span class="bal-badge bal-gold" data-rule="clock">⏱ ${o.clock === 120 ? '2 min' : o.clock + ' s'} a turn</span>` : '');   // (plan item V5: a match with a turn clock says so)
	};
	const vsWaiting = (lb) => {
		const humans = lb.size - lb.cpus, open = Math.max(0, humans - lb.players.length), not = lb.players.filter((p) => !p.ready).map((p) => p.name);
		if (open) return `Waiting for <b>${open} more player${open > 1 ? 's' : ''}</b>: share the code.`;
		if (not.length) return `Waiting for <b>${not.map(esc).join(', ')}</b> to be ready (${lb.players.length - not.length} of ${lb.players.length} ready).`;
		return `<b>Everyone is ready.</b> ${lb.host === ctx.signedIn() ? 'Press Start.' : 'Waiting for ' + esc(lb.host) + ' to start.'}`;
	};
	const vsHead = (title, back = 'Back') => `<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ ${back} <span class="bal-key">X</span></button><h2 class="bal-h2">${title}</h2></header>`;
	const vsWire = () => {};   // (the back button: the camp's one click handler, below, presses it)
	async function versus() {
		render(`<div class="ph-screen">${vsHead('Versus')}<p class="ph-sub bal-muted">Looking for your match…</p></div>`, { back: () => home('versus') });
		vsWire();
		H.screen = 'versus';
		const r = await ctx.online.mine();
		if (H.screen !== 'versus') return;
		if (r.lobby) return r.lobby.started ? rejoin(r.lobby) : lobby(r.lobby);
		H.vs = H.vs || { size: 2, cpus: 0, arena: ARENAS[0].id, lv: PVP_LEVEL };
		const items = [
			btn('<span class="ph-big">＋ Make a match</span><small>choose the players, the map and the levels; share its code</small>', { cls: 'bal-orange ph-wide', go: () => vsSetup(), info: () => '<h3 class="bal-h3">Make a match</h3><p>You host: pick how many play (2-4), how many seats are computers, the arena and the levels, then your team. Friends join with the code you get.</p>' }),
			btn('<span class="ph-big">⌨ Join with a code</span><small>the 5 letters a friend shares</small>', { cls: 'bal-blue ph-wide', go: () => vsJoin(), info: () => '<h3 class="bal-h3">Join with a code</h3><p>Type the host\'s 5-letter code, then pick your team.</p>' }),
		];
		render(`<div class="ph-screen">${vsHead('Versus')}<p class="ph-sub bal-muted">Online, 2-4 players on one map. A friendly match: no stars or EXP change hands.</p>
			<div class="ph-body"><nav class="ph-menu">${items.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`, { back: () => home('versus') });
		vsWire();
		H.screen = 'versus';
	}
	const signedIn = () => !!(ctx.signedIn && ctx.signedIn());
	/** Make a match on one of this device's made maps (from the Map maker). */
	function versusOn(id) {
		const e = loadMaps().find((x) => x.id === id);
		if (!e || mapProblems(e.map).length) return maps(id);
		if (!signedIn()) { ctx.toast('Sign in (the top bar) to play Versus'); return maps(id); }
		vsSetupFor(id);
	}
	/** Make a match with this made map picked (players capped at its bases). (versusOn's last step; tests call it signed out.) */
	function vsSetupFor(id) {
		const e = loadMaps().find((x) => x.id === id);
		if (!e || !maxPlayers(e.map)) return maps(id);
		H.vs = { ...(H.vs || { cpus: 0, lv: PVP_LEVEL }), size: Math.min(maxPlayers(e.map), Math.max(2, (H.vs && H.vs.size) || 2)), arena: 'custom', map: e.map, mapId: e.id };
		H.vs.cpus = Math.min(H.vs.cpus, H.vs.size - 1);
		vsSetup();
	}
	function vsSetup(focus = 0) {
		const o = H.vs, items = [];
		const pick = (label, on, go, info) => btn(label, { cls: on ? 'bal-green ph-pick is-on' : 'bal-grey ph-pick', go, info });
		const row = (title, html) => `<div class="ph-vsrow"><span class="ph-vslabel">${title}</span><div class="ph-vsopts">${html}</div></div>`;
		const re = (i) => () => vsSetup(i);
		let k = 0;
		// (a made map: no more players than its base panels, owner 2026-11-22)
		const cap = o.arena === 'custom' && o.map ? maxPlayers(o.map) : arenaSeats(arenaById(o.arena));
		const players = [2, 3, 4].map((n) => { const i = k++; return btn(n + ' players', { cls: o.size === n ? 'bal-green ph-pick is-on' : 'bal-grey ph-pick', off: n > cap && (o.arena === 'custom' ? `This map has ${cap} PvP bases: up to ${cap} players` : 'This arena is made for two'), go: () => { o.size = n; o.cpus = Math.min(o.cpus, n - 1); re(i)(); }, info: () => (n > cap ? `<p>This map has ${cap} PvP bases: up to ${cap} players.</p>` : '<p>How many sides on the map, you included.</p>') }); }).join('');
		const cpus = Array.from({ length: o.size }, (_, n) => { const i = k++; return pick(n ? n + ' computer' + (n > 1 ? 's' : '') : 'no computers', o.cpus === n, () => { o.cpus = n; re(i)(); }, () => '<p>Seats a computer plays (the enemy AI). The rest wait for friends.</p>'); }).join('');
		const made = loadMaps().filter((e) => !arenaProblems(e.map, 2).length);
		// (plan item V4: a duel arena is made for two, and says so; choosing one makes the match a two-player one)
		const arenas = ARENAS.map((a) => { const i = k++; return pick(esc(a.name) + (a.two ? ' <small>for 2</small>' : ''), o.arena === a.id, () => { o.arena = a.id; o.map = null; if (a.two) { o.size = 2; o.cpus = Math.min(o.cpus, 1); } re(i)(); }, () => `<h3 class="bal-h3">${esc(a.name)}</h3>${a.two ? '<p class="ph-pill-row"><span class="bal-badge bal-gold">Made for two</span><span class="bal-badge bal-grey">8 × 8</span></p>' : ''}<p>${esc(a.tip)}</p>`); }).join('')
			+ made.map((e) => { const i = k++; return pick('🛠 ' + esc(e.map.name) + ' <small>' + maxPlayers(e.map) + 'p</small>', o.arena === 'custom' && o.mapId === e.id, () => { o.arena = 'custom'; o.map = e.map; o.mapId = e.id; o.size = Math.min(o.size, maxPlayers(e.map)); o.cpus = Math.min(o.cpus, o.size - 1); re(i)(); }, () => `<h3 class="bal-h3">${esc(e.map.name)}</h3><p>Your map (${e.map.rows[0].length}×${e.map.rows.length}, ${e.map.seats.length} PvP bases: up to ${maxPlayers(e.map)} players${e.map.foes.length ? ', ' + e.map.foes.length + ' wild foes that fight every side' : ''}).</p>`); }).join('')
			+ (() => { const i = k++; return pick('🔗 A shared map <small>by its code</small>', false, async () => { const id = await fetchCode(); const e = id && loadMaps().find((x) => x.id === id); if (e && !arenaProblems(e.map, 2).length) { o.arena = 'custom'; o.map = e.map; o.mapId = e.id; o.size = Math.min(o.size, maxPlayers(e.map)); o.cpus = Math.min(o.cpus, o.size - 1); } else if (e) ctx.toast('That map cannot be an arena for two'); re(i)(); }, () => '<h3 class="bal-h3">A shared map</h3><p>A map a friend made in the Map Maker, by its 6-letter code. It joins your maps and is picked for this match.</p>'); })();
		const lvs = [[PVP_LEVEL, 'everyone Lv ' + PVP_LEVEL], [null, 'own levels']].map(([v, l]) => { const i = k++; return pick(l, o.lv === v, () => { o.lv = v; re(i)(); }, () => (v ? `<p>Every figurine plays at Lv ${v}: a fair match, whatever you have trained.</p>` : '<p>Your figurines at their own levels (the computers play at the players\' average).</p>')); }).join('');
		// (a capped match, off by default: item levels and plush gemstones do not count)
		const gears = [[false, 'as they are'], [true, 'plain: no levels, no gemstones']].map(([v, l]) => { const i = k++; return pick(l, !!o.plain === v, () => { o.plain = v; re(i)(); }, () => (v ? '<p>A capped match: every held item plays as a plain level 1 one. Its level and its plush gemstones do not count, for anyone.</p>' : '<p>Held items at their own levels, with their plush gemstones: what you raised in the Item World counts.</p>')); }).join('');
		// (plan item V5: a turn clock both players can see; off by default)
		const clocks = [[0, 'off'], [60, '60 s'], [90, '90 s'], [120, '2 min']].map(([v, l]) => { const i = k++; return pick(l, (o.clock || 0) === v, () => { o.clock = v; re(i)(); }, () => (v ? `<p>Each side has <b>${v} seconds</b> for its whole phase, and both players see the clock count down. When it runs out the phase ends.</p>` : '<p>No clock on the screen. A side that does nothing at all for two and a half minutes still has its phase ended.</p>')); }).join('');
		const next = btn('Pick your team ▶', { cls: 'bal-orange', go: () => team({ kind: 'versus', label: 'Versus · ' + vsRules(o).replace(/<[^>]+>/g, ''), button: 'Make match', back: () => vsSetup(), info: () => '<h3 class="bal-h3">Your team</h3><p>' + vsRules(o) + '</p><p>Up to six; they deploy in this order.</p>',
			go: async (ids) => { ctx.toast('Making the match…'); await ctx.syncFigs(); const r = await ctx.online.create({ size: o.size, cpus: o.cpus, arena: o.arena, ...(o.arena === 'custom' && o.map ? { map: o.map } : {}), lv: o.lv ? o.lv : 'own', ...(o.plain ? { plain: true } : {}), ...(o.clock ? { clock: o.clock } : {}), team: ids }); if (r.error) { ctx.toast(r.error); return; } lobby(r.lobby); } }) });
		render(`<div class="ph-screen">${vsHead('Make a match')}<div class="ph-body"><div class="ph-menu bal-scroll">${row('Players', players)}${row('Computers', cpus)}${row('Arena', arenas)}${row('Levels', lvs)}${row('Held items', gears)}${row('Turn clock', clocks)}<div class="ph-vsrow">${next}</div></div><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`, { focus, back: () => versus() });
		vsWire();
		H.screen = 'vs-setup';
	}
	async function vsJoin() {
		const code = await askText({ title: 'The 5-letter match code', maxLength: 5, upper: true, charset: 'code' });
		if (!code) return;
		team({ kind: 'versus', label: 'Versus · joining ' + code.toUpperCase(), button: 'Join', back: () => versus(), info: () => '<h3 class="bal-h3">Your team</h3><p>Up to six; they deploy in this order. The host set the rules.</p>',
			go: async (ids) => { ctx.toast('Joining…'); await ctx.syncFigs(); const r = await ctx.online.join(code.trim().toUpperCase(), ids); if (r.error) { ctx.toast(r.error); return; } lobby(r.lobby); } });
	}
	async function rejoin(lb) {
		const r = await ctx.online.state(lb.id, 0);
		if (r.match) return ctx.startOnline(r.lobby || lb, r.match);
		ctx.toast(r.error || 'That match is over'); home('versus');
	}
	/** The lobby: the code to share, the seats, ready / start; it polls until the match starts. */
	function lobby(lb, focusKey) {
		// (plan item V2: your record with each player here, asked for once a visit to the lobby)
		if (!H.vsRec || H.vsRecFor !== lb.id) { H.vsRecFor = lb.id; H.vsRec = H.vsRec || {}; ctx.online.record().then((r) => { if (r && r.vs) { H.vsRec = r.vs; if (H.screen === 'lobby' && H.lobby && H.lobby.id === lb.id && Object.keys(r.vs).length) lobby(H.lobby, undefined); } }); }
		const me = ctx.signedIn(), host = lb.host === me, mine = lb.players.find((p) => p.name === me) || { ready: false };
		const humans = lb.size - lb.cpus, full = lb.players.length >= humans, allReady = lb.players.every((p) => p.ready);
		const keys = [], items = [];
		const add = (key, html) => { keys.push(key); items.push(html); };
		if (host) add('start', btn('<span class="ph-big">▶ Start</span><small>' + (full ? (allReady ? 'everyone is ready' : 'waiting for everyone to be ready') : 'waiting for ' + (humans - lb.players.length) + ' more') + '</small>', { cls: 'bal-orange ph-wide', off: (!full && 'Waiting for ' + (humans - lb.players.length) + ' more player(s): share the code') || (!allReady && 'Not everyone is ready'),
			go: async () => { const r = await ctx.online.start(lb.id); if (r.error) return ctx.toast(r.error); ctx.startOnline(r.lobby, r.match); } }));
		else add('ready', btn(`<span class="ph-big">${mine.ready ? '✓ Ready' : 'Ready?'}</span><small>${mine.ready ? 'press again if you are not' : 'press when your team is set'}</small>`, { cls: (mine.ready ? 'bal-green' : 'bal-orange') + ' ph-wide', go: async () => { const r = await ctx.online.update(lb.id, { ready: !mine.ready }); if (r.error) return ctx.toast(r.error); lobby(r.lobby, 'ready'); } }));
		add('team', btn('<span class="ph-big">🛡 Change team</span><small>' + mine.team.length + ' figurine' + (mine.team.length === 1 ? '' : 's') + '</small>', { cls: 'bal-blue ph-wide',
			go: () => team({ kind: 'versus', label: 'Versus · ' + lb.code, button: 'Use this team', back: () => lobby(lb), info: () => '<h3 class="bal-h3">Your team</h3><p>' + vsRules(lb) + '</p>',
				go: async (ids) => { await ctx.syncFigs(); const r = await ctx.online.update(lb.id, { team: ids }); if (r.error) return ctx.toast(r.error); lobby(r.lobby, 'team'); } }) }));
		if (host) {
			add('cpu-', btn('Computers − <small>' + lb.cpus + '</small>', { cls: 'bal-grey', off: !lb.cpus && 'No computers', go: async () => { const r = await ctx.online.update(lb.id, { cpus: lb.cpus - 1 }); if (r.error) return ctx.toast(r.error); lobby(r.lobby, 'cpu-'); } }));
			add('cpu+', btn('Computers + <small>' + lb.cpus + '</small>', { cls: 'bal-grey', off: lb.players.length + lb.cpus >= lb.size && 'Every seat is taken', go: async () => { const r = await ctx.online.update(lb.id, { cpus: lb.cpus + 1 }); if (r.error) return ctx.toast(r.error); lobby(r.lobby, 'cpu+'); } }));
		}
		add('leave', btn('Leave', { cls: 'bal-grey', go: async () => { await ctx.online.leave(lb.id); ctx.toast(host ? 'Match closed' : 'You left'); home('versus'); } }));
		const seat = (p) => `<li class="ph-seat"><b>${esc(p.name)}</b>${p.name === lb.host ? ' <span class="bal-badge bal-gold">host</span>' : ''} <span class="bal-badge ${p.ready ? 'bal-green' : 'bal-grey'}">${p.ready ? 'ready' : 'not ready'}</span>${p.away ? ' <span class="bal-muted">(away)</span>' : ''}${p.name !== me && (H.vsRec || {})[p.name] ? ` <span class="bal-badge bal-blue ph-vsrec" title="your record against ${esc(p.name)}">you ${H.vsRec[p.name].w}–${H.vsRec[p.name].l}</span>` : ''}
			<span class="ph-seat-team">${p.team.map((f) => `<img src="${esc(sprite(f.species))}" alt="${esc(name(f.species))}" title="${esc(name(f.species))} Lv ${f.level}">`).join('')}</span></li>`;
		const open = Math.max(0, humans - lb.players.length);
		render(`<div class="ph-screen">${vsHead('Versus lobby', 'Camp')}
			<p class="ph-sub">Code <b class="ph-code">${esc(lb.code)}</b></p>
			<p class="ph-pill-row ph-rules" id="vs-rules">${vsBadges(lb)}</p>
			<p class="ph-sub ph-waiting" id="vs-waiting" aria-live="polite">${vsWaiting(lb)}</p>
			<div class="ph-body"><nav class="ph-menu">${items.join('')}</nav>
			<aside class="bal-panel ph-side"><ul class="ph-seats">${lb.players.map(seat).join('')}${Array.from({ length: lb.cpus }, (_, i) => `<li class="ph-seat"><b>Computer ${i + 1}</b> <span class="bal-badge bal-purple">CPU</span></li>`).join('')}${Array.from({ length: open }, () => '<li class="ph-seat bal-muted">open: share the code</li>').join('')}</ul></aside></div></div>`,
		{ focus: Math.max(0, keys.indexOf(focusKey || (host ? 'start' : 'ready'))), back: () => home('versus') });
		vsWire();
		H.screen = 'lobby'; H.lobby = lb;
		// the poll: who joined / readied; the start (for a guest, the host pressed Start)
		H.poll = setInterval(async () => {
			const r = await ctx.online.state(lb.id);
			if (H.screen !== 'lobby' || !H.poll) return;
			if (r.match) { clearInterval(H.poll); H.poll = null; return ctx.startOnline(r.lobby, r.match); }
			if (r.closed || (r.error && /closed|not in/.test(r.error))) { ctx.toast('The match was closed'); return home('versus'); }
			if (r.lobby && JSON.stringify(r.lobby) !== JSON.stringify(H.lobby)) { const k = keys[H.focus]; lobby(r.lobby, k); }
		}, 1500);
	}

	// ---- the roster
	// SQUAD TOOLS (improvement plan, 2026-11-25): the squad sorted and filtered, favourites, and release.
	const SQUAD_SORTS = [['level', 'Level'], ['name', 'Name'], ['type', 'Type'], ['new', 'Newest']];
	const SQUAD_SHOWS = [['all', 'All'], ['team', 'Your team'], ['fav', 'Favourites'], ['evo', 'Can evolve'], ['held', 'Holding an item'], ['dupe', 'Duplicates']];
	const SQUAD_KEY = 'magepunk_poketactica_squadview_v1';   // (this device's last sort and filter: a convenience)
	const squadView = () => { if (!H.sq) { H.sq = { sort: 'level', show: 'all' }; try { const o = JSON.parse(localStorage.getItem(SQUAD_KEY) || 'null'); if (o && SQUAD_SORTS.some(([k]) => k === o.sort)) H.sq.sort = o.sort; } catch { /* the default */ } } return H.sq; };
	/** The squad as it is shown: the filter, then the sort (level, then name, breaks every tie, so the order never jumps). */
	function squadList(c, view) {
		const all = list(c), order = Object.keys(c.figs), count = {};
		for (const x of all) count[x.species] = (count[x.species] || 0) + 1;
		const typeOf = (x) => ((data.species[x.species] || {}).types || ['~'])[0];
		const keep = { all: () => true, team: (x) => H.team.includes(x.id), fav: (x) => !!x.fav, evo: (x) => evolvesByLevelNow(x, data), held: (x) => !!x.held, dupe: (x) => count[x.species] > 1 }[view.show] || (() => true);
		const out = all.filter(keep);
		if (view.sort === 'name') out.sort((a, b) => name(a.species).localeCompare(name(b.species)) || b.level - a.level);
		else if (view.sort === 'type') out.sort((a, b) => typeOf(a).localeCompare(typeOf(b)) || b.level - a.level || name(a.species).localeCompare(name(b.species)));
		else if (view.sort === 'new') out.sort((a, b) => order.indexOf(b.id) - order.indexOf(a.id));
		return out;
	}
	function squad(focusId) {
		const c = col(), view = squadView(), all = squadList(c, view), total = Object.keys(c.figs).length;
		const cyc = (list2, cur, d = 1) => list2[(list2.findIndex(([k]) => k === cur) + d + list2.length) % list2.length][0];
		const setView = (o, keep) => { Object.assign(view, o); try { localStorage.setItem(SQUAD_KEY, JSON.stringify({ sort: view.sort })); } catch { /* not remembered */ } squad(); setFocus(keep, true); };
		const sortName = SQUAD_SORTS.find(([k]) => k === view.sort)[1], showName = SQUAD_SHOWS.find(([k]) => k === view.show)[1];
		// (the two tools are made first: buttons are numbered in the order they are made, and they come first on the screen)
		const tools = [
			btn(`<span class="ph-row-name">Sort</span><small>${esc(sortName)}</small>`, { cls: 'bal-blue ph-row ph-tool', go: () => setView({ sort: cyc(SQUAD_SORTS, view.sort) }, 0), info: () => `<h3 class="bal-h3">Sort</h3>${SQUAD_SORTS.map(([k, t]) => `<p>${k === view.sort ? '<b class="bal-t-gold">▶ ' + esc(t) + '</b>' : esc(t)}</p>`).join('')}<p class="bal-muted">Z: the next one. Remembered on this device.</p>` }),
			btn(`<span class="ph-row-name">Show</span><small>${esc(showName)} · ${all.length} of ${total}</small>`, { cls: 'bal-blue ph-row ph-tool', go: () => setView({ show: cyc(SQUAD_SHOWS, view.show) }, 1), info: () => `<h3 class="bal-h3">Show</h3>${SQUAD_SHOWS.map(([k, t]) => `<p>${k === view.show ? '<b class="bal-t-gold">▶ ' + esc(t) + '</b>' : esc(t)}</p>`).join('')}<p class="bal-muted">Z: the next one. <span class="bal-key">Q</span> <span class="bal-key">E</span> do the same from anywhere on this screen.</p>` }),
		];
		const fav = (x) => { ctx.saveCol(setFav(col(), x.id, !x.fav)); sfx.tab && sfx.tab(); ctx.toast(name(x.species) + (x.fav ? ' is no longer a favourite' : ' is a favourite: it cannot be released')); squad(x.id); };
		const cards = all.map((x) => figCard(x, { badge: (x.fav ? '♥' : '') + (H.team.includes(x.id) ? String(H.team.indexOf(x.id) + 1) : '') + (evolvesByLevelNow(x, data) ? '✨' : ''), on: H.team.includes(x.id), alt: () => fav(x),
			info: () => figInfo(x) + '<p class="bal-muted"><span class="bal-key">Z</span> its moves, held item' + (evolvesByLevelNow(x, data) ? ', evolution' : '') + ' and release · <span class="bal-key">C</span> ' + (x.fav ? 'no longer a favourite' : 'favourite') + '</p>', go: () => moves(x.id, { back: () => squad(x.id) }) }));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Squad</h2><span class="bal-badge bal-grey" id="squad-count">${all.length === total ? total : all.length + ' of ' + total}</span><div class="ph-wallet"><span class="bal-badge bal-gold">★ ${Stars.stars()}</span></div></header>
			<nav class="ph-tools ph-squad-tools">${tools.join('')}</nav>
			<div class="ph-body"><div class="ph-grid bal-scroll">${cards.join('') || `<p class="bal-muted">${total ? 'No figurine fits "' + esc(showName) + '".' : 'No figurines yet.'}</p>`}</div><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: focusId && all.some((x) => x.id === focusId) ? 2 + all.findIndex((x) => x.id === focusId) : all.length ? 2 : 0, back: () => home('squad'), tabs: (d) => setView({ show: cyc(SQUAD_SHOWS, view.show, d) }, 1) });
		H.screen = 'squad';
	}
	/** Release a figurine: asked first, and said plainly. */
	function releaseAsk(id) {
		const c = col(), x = c.figs[id];
		if (!x) return squad();
		// ("Keep it" is made first: it is the button the focus starts on)
		const no = btn('Keep it', { cls: 'bal-green ph-wide', go: () => moves(id, { focusKey: 'release' }) });
		const yes = btn('Release ' + esc(name(x.species)), { cls: 'bal-red ph-wide', go: () => {
			const c2 = releaseFig(col(), id, tail());
			if (!c2) { sfx.error(); ctx.toast(releaseBlock(col(), id) ? 'It cannot be released: ' + releaseBlock(col(), id) : 'No room in your bag for what it holds'); return moves(id); }
			H.team = H.team.filter((t) => t !== id); saveTeam(H.team);
			ctx.saveCol(c2); sfx.back && sfx.back(); ctx.toast(name(x.species) + ' was released'); squad();
		} });
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Release ${esc(name(x.species))}?</h2></header>
			<div class="bal-panel ph-help"><div class="ph-fig"><img src="${esc(sprite(x.species))}" alt="" draggable="false"><div><h3 class="bal-h3">${esc(name(x.species))}${x.shiny ? ' ★' : ''}</h3><div>Lv ${x.level} ${types(x.species)}</div></div></div>
			<p><b>It leaves your collection for good.</b> It cannot be brought back, and it pays nothing.</p>
			<p class="bal-muted">${x.held ? 'Its ' + esc(goodName(x.held)) + ' comes back to your bag.' : 'It holds nothing.'} A favourite (C in the Squad) cannot be released.</p>
			<nav class="ph-menu">${no}${yes}</nav></div></div>`, { focus: 0, back: () => moves(id, { focusKey: 'release' }) });
		H.screen = 'release';
	}
	function figInfo(f) {
		const b = battleStats(f, data), next = f.level < MAX_LEVEL ? expForLevel(f.level + 1) - f.exp : 0;
		const ab = f.ability ? esc(prettyId(f.ability)) : '—', abNote = f.ability && data.abilityShapes && data.abilityShapes[f.ability] ? data.abilityShapes[f.ability].note : '';
		const mv = f.equipped.map((m) => { const d = data.moves[m] || {}; return `<li><span class="ph-type" style="background:${TYPE_HEX[d.type] || '#777'}">${esc(d.type || '?')}</span> ${esc(d.name || m)} <span class="bal-muted">${d.power ? 'Pow ' + d.power : d.category || ''}</span></li>`; }).join('');
		return `<div class="ph-fig"><img src="${esc(sprite(f.species))}" alt="" draggable="false"><div><h3 class="bal-h3">${esc(name(f.species))}${f.shiny ? ' ★' : ''}</h3><div>Lv ${f.level} ${types(f.species)}</div><div class="bal-muted">Ability: ${ab}</div><div class="bal-muted">Holds: ${f.held ? esc(goodName(f.held)) : '—'}</div>${abNote ? `<div class="bal-muted ph-note">${esc(abNote)}</div>` : ''}</div></div>
			<table class="ph-statt"><tr><td>HP</td><td>${b.maxHP}</td><td>SP</td><td>${b.sp}</td></tr><tr><td>Atk</td><td>${b.atk}</td><td>Def</td><td>${b.def}</td></tr><tr><td>SpA</td><td>${b.spa}</td><td>SpD</td><td>${b.spd}</td></tr><tr><td>Spe</td><td>${b.spe}</td><td>Move</td><td>${b.move}</td></tr><tr><td>Jump</td><td>${b.jump}</td><td>Throw</td><td>${b.lift ? b.throw : '—'}</td></tr></table>
			${next ? `<div class="bal-muted">EXP to next level: ${next}</div>` : ''}<ul class="ph-moves">${mv}</ul>`;
	}
	/**
	 * One figurine's moves (owner, 2026-11-21: "switch moves from total learned moves into the 4 active move slots"): its four
	 * SLOTS on top, every move it has learned under them, then the ones still to come (locked, with the level they arrive at).
	 * Pick a slot, then the move to put in it; or pick a learned move, then the slot (a free slot takes it at once). A move
	 * already in another slot swaps places. C (or the slot's ✕ on touch) empties a slot. opt.back is where X goes (Squad,
	 * the team screen, the results).
	 */
	function moves(id, opt = {}) {
		const c = col(), f = c.figs[id];
		if (!f) return squad();
		if (opt.back) H.movesBack = opt.back;
		if (!H.ms || H.ms.id !== id) H.ms = { id, slot: null, pick: null };
		const ms = H.ms, eq = f.equipped;
		const mvLabel = (mid) => { const d = data.moves[mid] || {}; return `<span class="ph-type" style="background:${TYPE_HEX[d.type] || '#777'}">${esc(d.type || '?')}</span><span class="ph-row-name">${esc(d.name || mid)}</span><small>${d.power ? 'Pow ' + d.power : esc(d.category || '')}</small>`; };
		const save = (next, focusKey) => {
			const c2 = col(); ctx.saveCol({ ...c2, figs: { ...c2.figs, [id]: equip(c2.figs[id], next) } });
			ms.slot = null; ms.pick = null;
			moves(id, { focusKey });
		};
		const place = (mid, slot) => {   // (into slot `slot`: a move already in another slot swaps with what was there)
			const next = [...eq], j = next.indexOf(mid);
			if (j >= 0) { if (slot < next.length) [next[j], next[slot]] = [next[slot], next[j]]; } else if (slot < next.length) next[slot] = mid; else next.push(mid);
			save(next, 'slot' + Math.min(slot, next.length - 1));
		};
		const firstPick = () => { const k = f.pool.findIndex((p) => !eq.includes(p.id)); return 'pool' + Math.max(0, k); };
		const keys = [];
		const tools = [];
		{
			keys.push('held');
			tools.push(btn(`${f.held ? goodIconImg(f.held) : '🎒'} <span class="ph-row-name">${f.held ? esc(goodName(f.held)) : 'No held item'}</span>${f.held ? lvBadge(gearView(c, { fig: id })) + slotBadge(gearView(c, { fig: id })) : ''}`, { cls: 'bal-blue ph-row ph-tool', go: () => held(id), info: () => `<h3 class="bal-h3">Held item</h3><p>${f.held ? esc(goodName(f.held)) + ': ' + esc(HELD[f.held].text) : 'Nothing. A held item works in every battle.'}</p><p class="bal-muted">Z: change it</p>` }));
			const ev = evoOptions(f, data, (it) => haveGood(c, it));
			if (ev.length) {
				const ready = ev.filter((o) => o.ready);
				keys.push('evolve');
				tools.push(btn(`✨ <span class="ph-row-name">${ready.length ? 'Evolve!' : 'Evolution'}</span>${ready.length ? '<span class="bal-badge bal-purple">ready</span>' : ''}`, { cls: (ready.length ? 'bal-purple' : 'bal-grey') + ' ph-row ph-tool', go: () => evolveScreen(id), info: () => `<h3 class="bal-h3">Evolution</h3>${ev.map((o) => `<p>${esc(name(o.target))}: ${o.ready ? '<b class="bal-t-gold">ready</b>' : esc(evoWhy(o))}</p>`).join('')}` }));
			}
			const candy = haveGood(c, 'rarecandy');
			if (candy && f.level < MAX_LEVEL) {
				const need = polishNeed(f.level);
				keys.push('candy');
				tools.push(btn(`${goodIconImg('rarecandy')} <span class="ph-row-name">Rare Polish</span><small>${need > 1 ? 'takes ' + need + ' · ' : ''}×${candy}</small>`, { cls: 'bal-green ph-row ph-tool', off: candy < need && 'A level at Lv ' + f.level + ' takes ' + need + ' Rare Polish: you have ' + candy, go: () => useCandy(id), info: () => `<h3 class="bal-h3">Rare Polish</h3><p>${esc(CANDY.rarecandy.text)}</p><p>At Lv ${f.level} a level takes <b>${need}</b>. You have ${candy}.</p>` }));
			}
		}
		const slots = [0, 1, 2, 3].map((i) => {
			const mid = eq[i], on = ms.slot === i;
			keys.push('slot' + i);
			const clear = mid && eq.length > 1 ? () => save(eq.filter((m) => m !== mid), 'slot' + Math.min(i, eq.length - 2)) : null;
			return btn(`<span class="ph-slot-no">${i + 1}</span>${mid ? mvLabel(mid) : '<span class="ph-row-name bal-muted">— empty —</span>'}${clear ? '<span class="ph-slot-x" data-clear aria-label="Empty this slot">✕</span>' : ''}`, {
				cls: (on ? 'bal-orange' : mid ? 'bal-green' : 'bal-grey') + ' ph-row ph-slot',
				info: () => (mid ? moveInfo(f.pool.find((p) => p.id === mid) || { id: mid, lv: 1 }) : '<h3 class="bal-h3">An empty slot</h3>') + `<p class="bal-muted">${ms.pick ? 'Z puts ' + esc((data.moves[ms.pick] || {}).name || ms.pick) + ' here' : 'Z: choose what goes here' + (clear ? ' · C empties it' : '')}</p>`,
				alt: clear,
				go: () => {
					if (ms.pick) return place(ms.pick, i);
					ms.slot = on ? null : i; moves(id, { focusKey: on ? 'slot' + i : firstPick() });
				},
			});
		});
		const rows = f.pool.map((p, k) => {
			const at = eq.indexOf(p.id);
			keys.push('pool' + k);
			return btn(`${mvLabel(p.id)}<small>Lv ${p.lv}</small>${at >= 0 ? `<span class="bal-badge bal-green">slot ${at + 1}</span>` : ''}`, {
				cls: (ms.pick === p.id ? 'bal-orange' : at >= 0 ? 'bal-green' : 'bal-blue') + ' ph-row',
				info: () => moveInfo(p) + `<p class="bal-muted">${ms.slot != null ? 'Z puts it in slot ' + (ms.slot + 1) : at >= 0 ? 'In slot ' + (at + 1) + ' · Z: swap it for another' : eq.length < 4 ? 'Z puts it in a free slot' : 'Z, then choose the slot it replaces'}</p>`,
				go: () => {
					if (ms.slot != null) return place(p.id, ms.slot);
					if (at >= 0) { ms.slot = at; return moves(id, { focusKey: firstPick() }); }
					if (eq.length < 4) return place(p.id, eq.length);
					ms.pick = p.id; moves(id, { focusKey: 'slot0' });
				},
			});
		});
		const soon = movesToCome(data.species[f.species], f.level).slice(0, 8).map(([lv, mid]) => {
			keys.push('soon' + mid);
			return btn(`${mvLabel(mid)}<span class="bal-badge bal-grey">Lv ${lv}</span>`, { cls: 'bal-grey ph-row', off: 'Learned at Lv ' + lv, info: () => moveInfo({ id: mid, lv: 1 }) + `<p class="bal-muted">${esc(name(f.species))} learns it at Lv ${lv}.</p>` });
		});
		// (the figurine's own tools, at the foot of the list: favourite, release. Made last, and kept clear of the move slots: beside
		// them, "right" from slot 4 walked onto Release.)
		const endTools = [];
		keys.push('fav');
		endTools.push(btn(`${f.fav ? '♥' : '♡'} <span class="ph-row-name">${f.fav ? 'Favourite' : 'Not a favourite'}</span>`, { cls: (f.fav ? 'bal-red' : 'bal-grey') + ' ph-row ph-tool', go: () => { ctx.saveCol(setFav(col(), id, !f.fav)); sfx.tab && sfx.tab(); moves(id, { focusKey: 'fav' }); }, info: () => '<h3 class="bal-h3">Favourite</h3><p>A favourite cannot be released, and the Squad can show only your favourites.</p><p class="bal-muted">Z changes it.</p>' }));
		keys.push('release');
		endTools.push(btn(`<span class="ph-row-name">Release</span>`, { cls: 'bal-grey ph-row ph-tool', off: releaseBlock(c, id) && ('It cannot be released: ' + releaseBlock(c, id)), go: () => releaseAsk(id), info: () => `<h3 class="bal-h3">Release</h3><p>${esc(name(f.species))} leaves your collection for good. It pays nothing; what it holds comes back to your bag.</p>${releaseBlock(c, id) ? '<p class="bal-badge bal-red">Not now: ' + esc(releaseBlock(c, id)) + '</p>' : '<p class="bal-muted">You are asked first.</p>'}` }));
		const say = ms.pick ? `Choose the slot for <b>${esc((data.moves[ms.pick] || {}).name || ms.pick)}</b>` : ms.slot != null ? `Choose a move for <b>slot ${ms.slot + 1}</b>` : 'Choose a slot, then the move to put in it';
		const back = H.movesBack || (() => squad(id));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">${esc(name(f.species))} · moves</h2><span class="bal-badge bal-blue">Lv ${f.level}</span></header>
			<p class="ph-sub" id="ph-movesay">${say}${ms.slot != null || ms.pick ? '<span class="ph-keyhint"> · <span class="bal-key">X</span> cancel</span>' : ''}</p>
			<div class="ph-body"><nav class="ph-list bal-scroll"><div class="ph-tools">${tools.join('')}</div><div class="ph-slots">${slots.join('')}</div>
				<h4 class="ph-subh">Learned · ${f.pool.length}</h4>${rows.join('')}
				${soon.length ? `<h4 class="ph-subh">Still to learn</h4>${soon.join('')}` : ''}<div class="ph-tools ph-tools-end">${endTools.join('')}</div></nav>
			<aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: Math.max(0, keys.indexOf(opt.focusKey || 'slot0')), back: () => { if (ms.slot != null || ms.pick) { ms.slot = null; ms.pick = null; return moves(id, { focusKey: 'slot0' }); } H.ms = null; H.movesBack = null; back(); } });
		H.screen = 'moves';
	}
	function moveInfo(p) {
		const d = data.moves[p.id] || {}, sh = (data.shapes || {})[p.id] || {};
		const SHAPE = { one: 'one target', line: 'a line', cone: 'a cone', arc: 'an arc', dash: 'a dash', burst: 'all around it', aura: 'all around it', self: 'itself', map: 'the whole map', dia: 'a diamond', leap: 'a leap', swap: 'a swap', paint: 'a paint', trap: 'a trap' };
		return `<h3 class="bal-h3">${esc(d.name || p.id)}</h3><p class="ph-pill-row"><span class="ph-type" style="background:${TYPE_HEX[d.type] || '#777'}">${esc(d.type || '?')}</span><span class="bal-badge bal-grey">${esc(d.category || '')}</span>${d.power ? `<span class="bal-badge bal-red">Pow ${d.power}</span>` : ''}${d.acc && d.acc !== true ? `<span class="bal-badge bal-blue">Acc ${d.acc}</span>` : ''}</p>
			<p>Shape: ${SHAPE[sh.s] || esc(sh.s || 'one target')}${sh.r ? ` · range ${sh.r[0]}–${sh.r[1]}` : ''}${sh.sp != null ? ` · SP ${sh.sp}` : ''} · PP ${d.pp || '?'} · move Lv ${p.lv}</p>${sh.note ? `<p class="bal-muted">${esc(sh.note)}</p>` : ''}`;
	}

	const evoWhy = (o) => (o.how === 'item' ? 'needs a ' + goodName(o.item) + ' (Shop)' : 'at Lv ' + o.level + (o.how === 'friendship' ? ' (a friendship evolution)' : ''));
	const saveFig = (c2, fig) => ctx.saveCol({ ...c2, figs: { ...c2.figs, [fig.id]: fig } });

	/** What a figurine holds: one of your held items, or nothing. Putting one on takes it from your goods; the old one goes back. */
	// ---- held items with a LEVEL and SLOTS, and the PLUSH GEMSTONES in them (owner, 2026-11-24; gear.js)
	const lvBadge = (v) => (v && v.lv > 1 ? `<span class="bal-badge bal-gold">Lv ${v.lv}</span>` : '');
	const slotBadge = (v) => `<span class="bal-badge bal-grey ph-slots">◆ ${v.gems.length}/${v.slots}</span>`;
	/** What an item's level does, said. */
	const levelSay = (hid, lv) => (LEVEL_PLAIN.includes(hid) ? 'Its level adds slots only: it has no number to grow.' : lv >= ITEM_MAX_LEVEL ? 'Level 100: as strong as it gets.' : lv > 1 ? `Level ${lv}. At level 1: ${HELD[hid].text} At level 100: ${heldTextAt(hid, ITEM_MAX_LEVEL)}` : `Level 1. The Item World raises it. At level 100: ${heldTextAt(hid, ITEM_MAX_LEVEL)}`);
	/** What a set of gemstones gives, said: "+12% Attack, +5% Speed". */
	const gemsSay = (gems) => { const m = gemMults({ gems }); return GEM_STATS.filter((s) => m[s] !== 1).map((s) => '+' + +((m[s] - 1) * 100).toFixed(1) + '% ' + GEMS[s].stat).join(', '); };
	const gemPic = (g) => { const p = parseGem(g); return p ? goodIconImg('gem-' + p.s) : ''; };
	const itemInfo = (hid, v, extra = '') => `<h3 class="bal-h3">${goodIconImg(hid, 'is-big')}${esc(HELD[hid].name)}${v && v.lv > 1 ? ' Lv ' + v.lv : ''}</h3><p>${esc(heldTextAt(hid, v ? v.lv : 1))}</p><p class="bal-muted">${esc(levelSay(hid, v ? v.lv : 1))}</p>${v ? `<p>Slots <b>${v.gems.length} / ${v.slots}</b>${v.gems.length ? ' · ' + esc(gemsSay(v.gems)) : ''}</p>` : ''}${heldNote(hid) ? '<p class="bal-muted">' + esc(heldNote(hid)) + '</p>' : ''}${extra}`;
	/** The held items in the bag, one row each kind when plain, one row each when it has a level or gemstones. -> [{ uid, id, v, n }] */
	function bagHeld(c) {
		const plain = {}, own = [];
		for (const [uid, hid] of Object.entries(c.items || {})) { if (!HELD[hid]) continue; const g = itemGear(c, uid); if (g) own.push({ uid, id: hid, v: gearView(c, { uid }), n: 1 }); else if (plain[hid]) plain[hid].n++; else plain[hid] = { uid, id: hid, v: gearView(c, { uid }), n: 1 }; }
		const order = Object.keys(HELD);
		return [...own.sort((a, b) => b.v.lv - a.v.lv || order.indexOf(a.id) - order.indexOf(b.id)), ...Object.values(plain).sort((a, b) => order.indexOf(a.id) - order.indexOf(b.id))];
	}
	function held(id, focusKey) {
		const c = col(), f = c.figs[id];
		if (!f) return squad();
		const keys = [], rows = [], mine = f.held ? gearView(c, { fig: id }) : null;
		if (f.held) {
			keys.push('off'); rows.push(btn(`${goodIconImg(f.held)}<span class="ph-row-name">Take off ${esc(goodName(f.held))}</span>${lvBadge(mine)}`, { cls: 'bal-grey ph-row', go: () => {
				const r = unholdItem(col(), id, tail()); if (!r) { ctx.toast('The bag is full'); return; }
				ctx.saveCol(r.col); ctx.toast(goodName(f.held) + ' back in your bag'); held(id);
			}, info: () => itemInfo(f.held, mine) }));
			keys.push('gems'); rows.push(btn(`💎 <span class="ph-row-name">Its gemstones</span>${slotBadge(mine)}`, { cls: 'bal-purple ph-row', go: () => gearScreen({ fig: id }, { back: () => held(id, 'gems') }), info: () => itemInfo(f.held, mine, '<p class="bal-muted">Z: put gemstones in its slots, or take them out.</p>') }));
		}
		const bag = bagHeld(c);
		for (const it of bag) {
			const h = HELD[it.id];
			keys.push(it.uid);
			rows.push(btn(`${goodIconImg(it.id)}<span class="ph-row-name">${esc(h.name)}</span>${lvBadge(it.v)}${it.v.gems.length ? slotBadge(it.v) : ''}${it.n > 1 ? '<small>×' + it.n + '</small>' : ''}`, { cls: 'bal-blue ph-row', off: (() => { const dv = loadDive(); return dv && dv.uid === it.uid && it.n === 1 && 'You are diving into it (Item World)'; })(), go: () => {
				const c2 = holdItem(col(), id, it.uid, tail()); if (!c2) return held(id);
				ctx.saveCol(c2); sfx.coin && sfx.coin(); ctx.toast(name(f.species) + ' holds the ' + h.name); moves(id, { focusKey: 'held' });
			}, info: () => itemInfo(it.id, it.v, `<p class="bal-muted">${it.n > 1 ? 'You have ' + it.n + '. ' : ''}Z: ${esc(name(f.species))} holds it${f.held ? ' (the ' + esc(goodName(f.held)) + ' goes back in your bag, as it is)' : ''}</p>`) }));
		}
		keys.push('shop');
		rows.push(btn(`🛒 <span class="ph-row-name">Shop for held items</span>`, { cls: 'bal-gold ph-row', go: () => shop(0, { back: () => held(id) }), info: () => '<h3 class="bal-h3">Shop</h3><p>Held items cost stars.</p>' }));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">${esc(name(f.species))} · held item</h2><span class="bal-badge bal-blue">${f.held ? esc(goodName(f.held)) + (mine && mine.lv > 1 ? ' Lv ' + mine.lv : '') : 'nothing'}</span></header>
			<p class="ph-sub bal-muted">One item each. It works in every battle; beads and Focus Thread once a battle.</p>
			<div class="ph-body"><nav class="ph-list bal-scroll">${rows.join('')}${bag.length ? '' : '<p class="bal-muted">No held items in your bag: the Shop sells them.</p>'}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: Math.max(0, keys.indexOf(focusKey || (f.held ? 'off' : keys[0]))), back: () => moves(id, { focusKey: 'held' }) });
		H.screen = 'held';
	}
	// ---- the ITEM WORLD (owner, 2026-11-24; itemworld.js): pick a held item from the bag, then the way to play the dive
	const iwFact = (k, v) => `<div class="ph-fact"><small>${esc(k)}</small><b>${esc(String(v))}</b></div>`;
	function diveInfo(hid, lv, dive) {
		const exit = exitFloor(lv), floors = diveFloors(lv), at = dive ? dive.floor : floors[0];
		return `<h3 class="bal-h3">${goodIconImg(hid, 'is-big')}${esc(HELD[hid].name)} Lv ${lv}</h3>${deadlyBadge}
			<div class="ph-facts" id="iw-facts">${[
				iwFact('Floors', `${floors[0]} to ${exit}`),
				iwFact('Foes', `Lv ${itemFoeLevel(at, hid)} to ${itemFoeLevel(exit, hid, true)}`),
				iwFact('Clear it: the item is', `Lv ${exit}${[25, 50, 75, 100].some((l) => lv < l && exit >= l) ? ' + a new slot' : ''}`),
				dive ? iwFact('You are on', `floor ${dive.floor} · ${dive.found.length} found`) : iwFact('Lose or give up', 'nothing is kept'),
			].join('')}</div>
			<p id="iw-world"><b>Its world</b> <span class="bal-badge ${worldOf(hid).kind === 'plain' ? 'bal-grey' : 'bal-purple'}">${esc(worldSay(hid))}</span></p>
			<p class="bal-muted ph-fine">Floor ${exit} is the exit: a boss, holding a ${esc(HELD[hid].name)} itself. The plush gemstones you find, and a Stitching Kit from the exit, come out with you. ${dive ? 'This dive waits on this device.' : 'The item itself is never lost.'}</p>`;
	}
	/** An item taken off its figurine for a dive goes back on (if the figurine lives and holds nothing). */
	const putBack = (figId, uid) => { const c0 = col(), c1 = reholdItem(c0, figId, uid, tail()); if (c1 !== c0) ctx.saveCol(c1); return c1 !== c0; };
	/** The dive on this device is over (abandoned, or its run is gone): nothing is banked, and its item goes home. */
	function endDive(dv) { saveDive(null); H.target = null; if (dv && dv.back) putBack(dv.back, dv.uid); }
	function itemWorld(focusKey) {
		let c = col();
		const dv = loadDive(), okDive = dv && (c.items || {})[dv.uid] === dv.id ? dv : null, keys = [], rows = [];
		if (dv && !okDive) saveDive(null);   // (its item left the bag: the dive is over)
		if (okDive && okDive.style === 'maze' && !(ctx.mmSaved && ctx.mmSaved())) { endDive(okDive); return itemWorld(focusKey); }   // (its Mystery Maze run is gone: so is the dive)
		// (an item taken off a figurine to dive into, and the dive never started: back on it goes)
		if (H.iwOff && !(okDive && okDive.uid === H.iwOff.uid)) { const o = H.iwOff; H.iwOff = null; if (putBack(o.fig, o.uid)) c = col(); }
		if (okDive) {
			keys.push('go'); rows.push(btn(`${goodIconImg(okDive.id)}<span class="ph-row-name">Continue: ${esc(HELD[okDive.id].name)}</span><span class="bal-badge bal-orange">${okDive.style === 'maze' ? 'Mystery Maze · to floor ' + exitFloor(okDive.from) : 'floor ' + okDive.floor + ' of ' + exitFloor(okDive.from)}</span>`, { cls: 'bal-orange ph-row', go: () => (okDive.style === 'maze' ? ctx.mmResume() : team({ kind: 'item', dive: okDive })), info: () => (okDive.style === 'maze' ? diveInfo(okDive.id, okDive.from, null) + '<p>You are in it as a <b>Mystery Maze</b> run: Z resumes it.</p>' : diveInfo(okDive.id, okDive.from, okDive)) }));
			keys.push('drop'); rows.push(btn(`<span class="ph-row-name">Abandon this dive</span><small>nothing is kept</small>`, { cls: 'bal-grey ph-row', go: () => {
				const keep = btn('Keep diving', { cls: 'bal-green ph-wide', go: () => itemWorld('go') });
				// (a battle dive: a Pull Cord leaves now and keeps the floors cleared; a maze dive is left from the maze's own menu)
				const nc = haveGood(col(), 'pullcord'), done = clearedFloors(okDive);
				const cord = okDive.style !== 'maze' && nc ? btn(`Use a Pull Cord <small>keep the ${done} floor${done === 1 ? '' : 's'} cleared · you have ${nc}</small>`, { cls: 'bal-gold ph-wide', off: !done && 'No floor of this dive is cleared yet: there is nothing to keep', go: () => {
					const b = bankPart(col(), okDive, okDive.floor - 1, okDive.found, { levelTo: setItemLevel, addGem, addGood, rehold: reholdItem, takeGood }, tail);
					if (!b) { sfx.error(); ctx.toast('No Pull Cord'); return itemWorld(); }
					ctx.saveCol(b.col); saveDive(null); H.target = null; sfx.coin && sfx.coin();
					ctx.toast(`Out by the Pull Cord: ${HELD[okDive.id].name} is level ${b.report.to}${b.report.gems.length ? ', with ' + b.report.gems.length + ' gemstone' + (b.report.gems.length === 1 ? '' : 's') : ''}`); itemWorld();
				} }) : '';
				const drop = btn('Abandon it', { cls: 'bal-red ph-wide', go: () => { endDive(okDive); ctx.toast('The dive is over: nothing was kept'); itemWorld(); } });
				render(`<div class="ph-screen">
					<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Abandon the dive?</h2></header>
					<div class="bal-panel ph-help"><p>The <b>${esc(HELD[okDive.id].name)}</b> stays level ${okDive.from}. The ${okDive.found.length} thing${okDive.found.length === 1 ? '' : 's'} found stay${okDive.found.length === 1 ? 's' : ''} inside.</p></div>
					${nc || okDive.style === 'maze' ? '' : '<p class="bal-muted">A <b>Pull Cord</b> (Shop, Polish & kits) leaves a dive and keeps the floors cleared.</p>'}${okDive.style === 'maze' && nc ? '<p class="bal-muted">In a Mystery Maze dive, use a Pull Cord from the maze\'s own menu (Give up).</p>' : ''}
					<nav class="ph-menu">${keep}${cord}${drop}</nav></div>`, { back: () => itemWorld('drop') });
				H.screen = 'iw-drop';
			}, info: () => `<h3 class="bal-h3">Abandon this dive</h3><p>Only one dive at a time. Abandoning it keeps nothing: not the levels, not what was found.</p>` }));
		}
		for (const it of bagHeld(c)) {
			const lv = it.v.lv, top = !canDive(lv), busy = okDive && okDive.uid !== it.uid;
			keys.push(it.uid);
			rows.push(btn(`${goodIconImg(it.id)}<span class="ph-row-name">${esc(HELD[it.id].name)}</span><span class="ph-row-tags">${lvBadge(it.v)}${it.n > 1 ? '<span class="bal-badge bal-grey">×' + it.n + '</span>' : ''}${top ? '<span class="bal-badge bal-gold">top</span>' : '<span class="bal-badge bal-blue ph-tofloor">to floor ' + exitFloor(lv) + '</span>'}</span>`, { cls: 'bal-blue ph-row',
				off: (top && 'It is level 100: there is nothing deeper') || (busy && 'Finish or abandon the dive you are in first') || (okDive && okDive.uid === it.uid && 'You are diving into it: Continue is at the top'),
				go: () => diveStyle(it.uid), info: () => (top ? itemInfo(it.id, it.v, '<p class="bal-muted">Level 100: the top.</p>') : diveInfo(it.id, lv, null)) }));
		}
		// (improvement plan, 2026-11-25: an item a figurine is holding can be dived into; it comes off for the dive and goes back on after)
		for (const fg of list(c).filter((x) => x.held && HELD[x.held])) {
			const v = gearView(c, { fig: fg.id }), lv = v.lv, top = !canDive(lv);
			keys.push('fig:' + fg.id);
			rows.push(btn(`${goodIconImg(fg.held)}<span class="ph-row-name">${esc(HELD[fg.held].name)}</span><span class="ph-row-tags">${lvBadge(v)}<span class="bal-badge bal-grey">held by ${esc(name(fg.species))}</span>${top ? '<span class="bal-badge bal-gold">top</span>' : '<span class="bal-badge bal-blue ph-tofloor">to floor ' + exitFloor(lv) + '</span>'}</span>`, { cls: 'bal-blue ph-row',
				off: (top && 'It is level 100: there is nothing deeper') || (okDive && 'Finish or abandon the dive you are in first'),
				go: () => diveStyle({ fig: fg.id }), info: () => (top ? itemInfo(fg.held, v, '<p class="bal-muted">Level 100: the top.</p>') : diveInfo(fg.held, lv, null) + `<p class="bal-muted">${esc(name(fg.species))} is holding it. It comes off for the dive, and goes back on when the dive ends (if ${esc(name(fg.species))} is still with you).</p>`) }));
		}
		const onFigs = 0;
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Item World</h2><div class="ph-wallet"><span class="bal-badge bal-gold">★ ${Stars.stars()}</span></div></header>
			${((r) => { H.iwRec = (r.best && (r.levels || r.gem) ? `<p class="ph-records" id="iw-records"><b>Records</b> <span class="bal-badge bal-gold">highest: ${esc(HELD[r.best.id].name)} Lv ${r.best.lv}</span> <span class="bal-badge bal-blue">${r.levels} level${r.levels === 1 ? '' : 's'} raised in all</span>${r.top ? ' <span class="bal-badge bal-purple">' + r.top + ' at level 100</span>' : ''}${r.gem ? ' <span class="bal-badge bal-green">strongest gemstone: ' + esc(GEMS[r.gem.s].name) + ' Lv ' + r.gem.lv + '</span>' : ''}</p>` : ''); return ''; })(iwRecords(c))}
			<p class="ph-sub bal-muted">Pick an item to dive into, from your bag or off a figurine.</p>
			<div class="ph-body"><nav class="ph-list bal-scroll">${rows.join('')}${rows.length ? '' : '<p class="bal-muted">You have no held items: the Shop sells them.</p>'}${H.iwRec}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: Math.max(0, keys.indexOf(focusKey)), back: () => home('itemworld') });
		H.screen = 'itemworld';
	}
	/** How to play the dive: battles (the Dungeon's way) or a Mystery Maze (stage 4). */
	function diveStyle(from) {
		const where = typeof from === 'string' ? { uid: from } : from, c = col();
		const hid = where.fig ? (c.figs[where.fig] || {}).held : (c.items || {})[where.uid], v = gearView(c, where);
		if (!v || !HELD[hid] || !canDive(v.lv)) return itemWorld();
		/** The item in the bag for the dive: its uid (taken off its figurine now, if it was on one). null: no room. */
		const inBag = () => {
			if (!where.fig) return { uid: where.uid, back: null };
			const r = unholdItem(col(), where.fig, tail());
			if (!r) { sfx.error(); ctx.toast('No room in your bag to take it off'); return null; }
			ctx.saveCol(r.col); H.iwOff = { uid: r.uid, fig: where.fig };
			return { uid: r.uid, back: where.fig };
		};
		const uid = where.uid || null;
		const rows = [
			btn(`<span class="ph-big">⚔ Battles</span><small>a battle a floor, as the Dungeon</small>`, { cls: 'bal-red ph-wide', go: () => { const b = inBag(); if (b) team({ kind: 'item', dive: newDive(b.uid, hid, v.lv, 'tactics', Date.now(), b.back) }); }, info: () => diveInfo(hid, v.lv, null) + '<p>Each floor is a <b>tactics battle</b> on a new board. Pick up to six figurines.</p>' }),
			btn(`<span class="ph-big">🧭 Mystery Maze</span><small>explore the floors, find the stairs</small>`, { cls: 'bal-purple ph-wide', off: ctx.mmSaved && ctx.mmSaved() && 'You have a Mystery Maze run in progress: finish it first', go: () => { const b = inBag(); if (b) { H.iw = { uid: b.uid, id: hid, from: v.lv, back: b.back }; mmParty(itemDungeonId(hid, v.lv)); } }, info: () => diveInfo(hid, v.lv, null) + `<p id="iw-maze-say">Walk its floors as a <b>Mystery Maze</b>. Its gemstones and Stitching Kits <b>lie on the floors</b>: only what you pick up is banked. ${esc(mazeWorldSay(hid))}</p>` }),
		];
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">${goodIconImg(hid)} ${esc(HELD[hid].name)} · how to dive</h2><span class="bal-badge bal-gold">Lv ${v.lv}</span></header>
			<div class="ph-body"><nav class="ph-menu">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`, { back: () => itemWorld(where.fig ? 'fig:' + where.fig : uid) });
		H.screen = 'iw-style';
	}
	/** TRAINING SAYS WHAT IT IS FOR (plan item D4): what to practise, each with the fight it gives (demo.js DRILLS). */
	function training(focusId) {
		const rows = DRILL_IDS.map((id) => { const d = DRILLS[id]; return btn(`<span class="ph-big">${d.icon} ${esc(d.name)}</span><small>${esc(d.say)}</small>`, { cls: (id === 'free' ? 'bal-green' : 'bal-blue') + ' ph-wide', go: () => team({ kind: 'training', ...(id === 'free' ? {} : { drill: id }) }), info: () => `<h3 class="bal-h3">${d.icon} ${esc(d.name)}</h3><p>${esc(d.tip || 'Wild Pokémon at your level, on the Training Grounds. Good for EXP and for trying a new team.')}</p><p class="bal-muted">Training is safe: nobody is lost here, and its stars and EXP pay half.</p>` }); });
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">🎯 Training</h2><span class="bal-muted">what to practise?</span></header>
			<div class="ph-body"><nav class="ph-menu">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`, { focus: Math.max(0, DRILL_IDS.indexOf(focusId || 'free')), back: () => home('training') });
		H.screen = 'training';
	}
	/** An item's world as a Mystery Maze's floor rule, in a sentence (mm/turn.js diveRule; plan item M7). */
	const mazeWorldSay = (hid) => { const r = mmDiveRule({ iw: { id: hid } }); return !r ? 'Its world has no rule of its own.' : r.kind === 'sky' ? `Its world: ${MM_SKY[r.sky].toLowerCase()} on every floor.` : r.kind === 'gentle' ? 'Its world is gentle: its wild Pokémon are 3 levels lower.' : 'Its world is fast: nobody sleeps, and more wander in.'; };
	/** Every held item you own (on figurines, then in the bag), the loose gemstones, and combining. */
	function workshop(focusKey) {
		const c = col(), keys = [], rows = [], loose = gemList(c), kits = goodsCount(c).stitchingkit || 0;
		for (const f of list(c).filter((x) => x.held && HELD[x.held])) {
			const v = gearView(c, { fig: f.id });
			keys.push('fig:' + f.id);
			rows.push(btn(`${goodIconImg(f.held)}<span class="ph-row-name">${esc(HELD[f.held].name)}</span>${lvBadge(v)}${slotBadge(v)}<small>held by ${esc(name(f.species))}</small>`, { cls: 'bal-blue ph-row', go: () => gearScreen({ fig: f.id }, { back: () => workshop('fig:' + f.id) }), info: () => itemInfo(f.held, v, `<p class="bal-muted">Held by ${esc(name(f.species))} Lv ${f.level}. Z: its gemstones.</p>`) }));
		}
		for (const it of bagHeld(c)) {
			keys.push(it.uid);
			rows.push(btn(`${goodIconImg(it.id)}<span class="ph-row-name">${esc(HELD[it.id].name)}</span>${lvBadge(it.v)}${slotBadge(it.v)}${it.n > 1 ? '<small>×' + it.n + ' in the bag</small>' : '<small>in the bag</small>'}`, { cls: 'bal-blue ph-row', go: () => gearScreen({ uid: it.uid }, { back: () => workshop(it.uid) }), info: () => itemInfo(it.id, it.v, '<p class="bal-muted">Z: its gemstones.</p>') }));
		}
		keys.push('combine');
		rows.push(btn(`${goodIconImg('stitchingkit')}<span class="ph-row-name">Combine gemstones</span><span class="bal-badge bal-grey">${kits} kit${kits === 1 ? '' : 's'}</span>`, { cls: 'bal-purple ph-row', off: (!kits && 'You need a Stitching Kit: the Shop sells them (Polish & kits), and the Item World has them') || (loose.length < 2 && 'You need two loose gemstones of the same stat'), go: () => combine(), info: () => `<h3 class="bal-h3">${goodIconImg('stitchingkit', 'is-big')}Combine gemstones</h3><p>${esc(KIT.stitchingkit.text)}</p><p>You have <b>${kits}</b> Stitching Kit${kits === 1 ? '' : 's'} and <b>${loose.length}</b> loose gemstone${loose.length === 1 ? '' : 's'}.</p><p class="bal-muted">Combining is the only way a gemstone levels up.</p>` }));
		keys.push('shop');
		rows.push(btn(`🛒 <span class="ph-row-name">Shop for gemstones</span>`, { cls: 'bal-gold ph-row', go: () => shop(4, { back: () => workshop('shop') }), info: () => '<h3 class="bal-h3">Shop</h3><p>Level 1 plush gemstones cost stars. Stronger ones are found in the Item World.</p>' }));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Items &amp; gemstones</h2><span class="bal-badge bal-purple">◆ ${loose.length} loose</span></header>
			<p class="ph-sub bal-muted">Pick a held item to fill its slots. A gemstone gives the figurine holding the item +${GEM_PCT}% of one stat a level.</p>
			<div class="ph-body"><nav class="ph-list bal-scroll">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: Math.max(0, keys.indexOf(focusKey)), back: () => home('gear') });
		H.screen = 'workshop';
	}
	/** One item's slots: what is in each, what could be. where: { fig } the item a figurine holds | { uid } one in the bag. */
	function gearScreen(where, opt = {}, focus = 0) {
		const c = col(), v = gearView(c, where), hid = where.fig ? (c.figs[where.fig] || {}).held : (c.items || {})[where.uid];
		const back = opt.back || (() => workshop());
		if (!v || !HELD[hid]) return back();
		const rows = [], again = (i) => gearScreen(where, opt, i);
		for (let i = 0; i < SLOTS_MAX; i++) {
			const g = v.gems[i];
			if (i >= v.slots) rows.push(btn(`<span class="ph-slot-no">${i + 1}</span><span class="ph-row-name bal-muted">locked</span><small>opens at level ${SLOT_LEVELS[i - 4]}</small>`, { cls: 'bal-grey ph-row ph-slot', off: `This slot opens when the item reaches level ${SLOT_LEVELS[i - 4]} (the Item World)`, info: () => itemInfo(hid, v, `<p class="bal-muted">Slot ${i + 1} opens at level ${SLOT_LEVELS[i - 4]}.</p>`) }));
			else if (g) rows.push(btn(`<span class="ph-slot-no">${i + 1}</span>${gemPic(g)}<span class="ph-row-name">${esc(gemName(g))}</span><small>${esc(gemSay(g))}</small><span class="ph-slot-x" data-clear aria-label="Take it out">✕</span>`, { cls: 'bal-green ph-row ph-slot', go: () => takeOut(i), alt: () => takeOut(i), info: () => itemInfo(hid, v, `<p><b>${esc(gemName(g))}</b>: ${esc(gemSay(g))}</p><p class="bal-muted">Z: take it out (it goes back to your loose gemstones).</p>`) }));
			else rows.push(btn(`<span class="ph-slot-no">${i + 1}</span><span class="ph-row-name bal-muted">— empty —</span>`, { cls: 'bal-blue ph-row ph-slot', go: () => gemPick(where, opt, i), info: () => itemInfo(hid, v, '<p class="bal-muted">Z: put a loose gemstone in this slot.</p>') }));
		}
		function takeOut(i) {
			const c2 = unsocketGem(col(), where, i, tail()); if (!c2) return again(i);
			ctx.saveCol(c2); sfx.press(); again(Math.min(i, Math.max(0, v.gems.length - 2)));
		}
		// (improvement plan, 2026-11-25: eight slots was a lot of presses)
		{
			const free = v.slots - v.gems.length, loose = gemList(c).length;
			rows.push(btn(`<span class="ph-row-name">Fill the free slots</span><small>${free ? Math.min(free, loose) + ' of your strongest loose gemstones' : 'every slot is full'}</small>`, { cls: 'bal-purple ph-row', off: (!free && 'Every slot is full') || (!loose && 'You have no loose gemstones'), go: () => {
				const r = socketAll(col(), where); if (!r.n) return again(SLOTS_MAX);
				ctx.saveCol(r.col); sfx.coin && sfx.coin(); ctx.toast(r.n + ' gemstone' + (r.n === 1 ? '' : 's') + ' put in'); again(SLOTS_MAX);
			}, info: () => itemInfo(hid, v, '<p class="bal-muted">Puts your strongest loose gemstones into the free slots, whatever their stat. Pick a slot yourself to choose.</p>') }));
			rows.push(btn(`<span class="ph-row-name">Take them all out</span><small>${v.gems.length ? v.gems.length + ' back to your loose gemstones' : 'nothing is in it'}</small>`, { cls: 'bal-grey ph-row', off: !v.gems.length && 'There are no gemstones in it', go: () => {
				const r = unsocketAll(col(), where, tail); if (!r.n) { ctx.toast('No room for more loose gemstones'); return again(SLOTS_MAX + 1); }
				ctx.saveCol(r.col); sfx.press(); ctx.toast(r.n + ' gemstone' + (r.n === 1 ? '' : 's') + ' taken out'); again(SLOTS_MAX + 1);
			}, info: () => itemInfo(hid, v, '<p class="bal-muted">Every gemstone goes back to your loose ones. Nothing is lost.</p>') }));
		}
		const who = where.fig ? name(c.figs[where.fig].species) : null;
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">${goodIconImg(hid)} ${esc(HELD[hid].name)}</h2><span class="bal-badge bal-gold" id="gear-lv">Lv ${v.lv} / ${ITEM_MAX_LEVEL}</span><span class="bal-badge bal-grey" id="gear-slots">◆ ${v.gems.length}/${v.slots}</span></header>
			<p class="ph-sub bal-muted">${who ? 'Held by ' + esc(who) + '. ' : 'In your bag. '}${v.gems.length ? esc(gemsSay(v.gems)) + (who ? '' : ' for whoever holds it') : 'No gemstones in it yet.'}</p>
			<div class="ph-body"><nav class="ph-list bal-scroll">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus, back });
		H.screen = 'gear';
	}
	/** The loose gemstones, one row a kind and level. -> [{ gem, uids }], strongest first within a stat */
	function looseRows(c) {
		const by = {};
		for (const { uid, gem } of gemList(c)) (by[gem] = by[gem] || []).push(uid);
		return Object.entries(by).map(([gem, uids]) => ({ gem, uids, p: parseGem(gem) })).sort((a, b) => GEM_STATS.indexOf(a.p.s) - GEM_STATS.indexOf(b.p.s) || b.p.lv - a.p.lv);
	}
	/** Which loose gemstone goes into the slot. */
	function gemPick(where, opt, slot) {
		const c = col(), list2 = looseRows(c), back = () => gearScreen(where, opt, slot);
		const rows = list2.map((r) => btn(`${gemPic(r.gem)}<span class="ph-row-name">${esc(gemName(r.gem))}</span><small>${esc(gemSay(r.gem))}</small>${r.uids.length > 1 ? '<span class="bal-badge bal-grey">×' + r.uids.length + '</span>' : ''}`, { cls: 'bal-blue ph-row', go: () => {
			const c2 = socketGem(col(), where, r.uids[0]); if (!c2) { ctx.toast('No free slot'); return back(); }
			ctx.saveCol(c2); sfx.coin && sfx.coin(); ctx.toast(gemName(r.gem) + ' is in'); back();
		}, info: () => `<h3 class="bal-h3">${goodIconImg('gem-' + r.p.s, 'is-big')}${esc(gemName(r.gem))}</h3><p>${esc(gemSay(r.gem))} for the figurine holding the item.</p><p class="bal-muted">You have ${r.uids.length}. Z: put it in.</p>` }));
		rows.push(btn(`🛒 <span class="ph-row-name">Shop for gemstones</span>`, { cls: 'bal-gold ph-row', go: () => shop(4, { back: () => gemPick(where, opt, slot) }), info: () => '<h3 class="bal-h3">Shop</h3><p>Level 1 plush gemstones cost stars. Stronger ones are found in the Item World.</p>' }));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">A gemstone for slot ${slot + 1}</h2></header>
			<div class="ph-body"><nav class="ph-list bal-scroll">${rows.join('')}${list2.length ? '' : '<p class="bal-muted">No loose gemstones. The Shop sells level 1 ones; the Item World has stronger.</p>'}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`, { back });
		H.screen = 'gem-pick';
	}
	/** Combining: the first gemstone, then one of the same stat; their levels add (a Stitching Kit is used). */
	function combine(first) {
		const c = col(), all = looseRows(c), kits = goodsCount(c).stitchingkit || 0;
		const a = first && all.find((r) => r.gem === first);
		const pool = a ? all.filter((r) => r.p.s === a.p.s && (r.gem !== a.gem || r.uids.length > 1)) : all.filter((r) => all.some((o) => o.p.s === r.p.s && (o.gem !== r.gem || o.uids.length > 1)));
		// (improvement plan, 2026-11-25: a level 100 gemstone was many joins, one screen each) every gemstone of a stat at once
		// (made before the rows below: buttons are numbered in the order they are made, and that is the order the arrows walk)
		const all2 = [];
		if (!a) {
			for (const st of GEM_STATS) {
				const lvs = all.filter((r) => r.p.s === st).flatMap((r) => r.uids.map(() => r.p.lv)), full = joinPlan(lvs), can = joinPlan(lvs, kits);
				if (!full.joins) continue;
				all2.push(btn(`${goodIconImg('gem-' + st)}<span class="ph-row-name">Join all: ${esc(GEMS[st].name)}</span><small>${lvs.length} → Lv ${can.joins ? can.top : full.top} · ${can.joins < full.joins ? can.joins + ' of ' + full.joins : full.joins} kit${full.joins === 1 ? '' : 's'}</small>`, { cls: 'bal-gold ph-row', off: !kits && 'You need a Stitching Kit: the Shop sells them, and the Item World has them', go: () => {
					const r = combineAll(col(), st, tail);
					if (!r.joins) { sfx.error(); ctx.toast('They cannot be combined'); return combine(); }
					ctx.saveCol(r.col); sfx.coin && sfx.coin(); ctx.toast('Made: ' + gemName(r.top) + ' · ' + r.joins + ' kit' + (r.joins === 1 ? '' : 's') + ' used'); combine();
				}, info: () => `<h3 class="bal-h3">${goodIconImg('gem-' + st, 'is-big')}Join all: ${esc(GEMS[st].name)}</h3><p>Your ${lvs.length} loose ${esc(GEMS[st].name)} gemstones, the strongest taking in the next, until nothing more fits under level 100.</p><p>All of it takes <b>${full.joins}</b> Stitching Kit${full.joins === 1 ? '' : 's'} and makes a <b>Lv ${full.top}</b>. You have ${kits}${can.joins < full.joins ? ': enough for ' + can.joins + ' join' + (can.joins === 1 ? '' : 's') + ', a Lv ' + can.top : ''}.</p>` }));
			}
		}
		const rows = [...all2, ...pool.map((r) => {
			const made = a ? combineGems(a.gem, r.gem) : null;
			return btn(`${gemPic(r.gem)}<span class="ph-row-name">${esc(gemName(r.gem))}</span>${r.uids.length > 1 ? '<span class="bal-badge bal-grey">×' + r.uids.length + '</span>' : ''}${made ? '<small>→ ' + esc(gemName(made)) + '</small>' : ''}`, { cls: a ? 'bal-purple ph-row' : 'bal-blue ph-row', off: a && !kits && 'You need a Stitching Kit', go: () => {
				if (!a) return combine(r.gem);
				const ua = a.uids[0], ub = r.gem === a.gem ? r.uids[1] : r.uids[0], c2 = combineLoose(col(), ua, ub, tail());
				if (!c2) { sfx.error(); ctx.toast('They cannot be combined'); return combine(); }
				ctx.saveCol(c2); sfx.coin && sfx.coin(); ctx.toast('Made: ' + gemName(made)); combine();
			}, info: () => (a ? `<h3 class="bal-h3">${goodIconImg('gem-' + r.p.s, 'is-big')}${esc(gemName(made))}</h3><p>${esc(gemName(a.gem))} + ${esc(gemName(r.gem))}</p><p>${esc(gemSay(made))}</p><p class="bal-muted">Uses one Stitching Kit (you have ${kits}). Z: combine.</p>` : `<h3 class="bal-h3">${goodIconImg('gem-' + r.p.s, 'is-big')}${esc(gemName(r.gem))}</h3><p>${esc(gemSay(r.gem))}</p><p class="bal-muted">Z: choose it, then one more ${esc(GEMS[r.p.s].name)}.</p>`) });
		})];
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">${a ? esc(gemName(a.gem)) + ' + …' : 'Combine gemstones'}</h2><span class="bal-badge bal-grey" id="kit-count">${kits} kit${kits === 1 ? '' : 's'}</span></header>
			<p class="ph-sub bal-muted">${a ? 'Now one more ' + esc(GEMS[a.p.s].name) + ': their levels are added together (100 at most).' : 'Two gemstones of the same stat become one. Pick the first.'}</p>
			<div class="ph-body"><nav class="ph-list bal-scroll">${rows.join('')}${pool.length ? '' : '<p class="bal-muted">You need two loose gemstones of the same stat.</p>'}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`, { back: () => (a ? combine() : workshop('combine')) });
		H.screen = 'combine';
	}
	/** Its evolutions: the ready ones lead to "Evolve!" / "Not now"; the rest say what they need. */
	function evolveScreen(id) {
		const c = col(), f = c.figs[id];
		if (!f) return squad();
		const ev = evoOptions(f, data, (it) => haveGood(c, it));
		const rows = ev.map((o) => btn(`<img class="ph-row-img" src="${esc(sprite(o.target))}" alt="" draggable="false"><span class="ph-row-name">${esc(name(o.target))}</span>${o.ready ? '<span class="bal-badge bal-purple">ready</span>' : '<span class="bal-badge bal-grey">' + esc(o.how === 'item' ? goodName(o.item) : 'Lv ' + o.level) + '</span>'}`,
			{ cls: (o.ready ? 'bal-purple' : 'bal-grey') + ' ph-row', off: !o.ready && evoWhy(o)[0].toUpperCase() + evoWhy(o).slice(1), go: () => evolveAsk(id, o), info: () => `<h3 class="bal-h3">${esc(name(o.target))}</h3><p>${types(o.target)}</p><p>${o.ready ? 'Ready' + (o.item ? ': uses your ' + esc(goodName(o.item)) : '') : esc(evoWhy(o))}</p>` }));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">${esc(name(f.species))} · evolution</h2><span class="bal-badge bal-blue">Lv ${f.level}</span></header>
			<div class="ph-body"><nav class="ph-list bal-scroll">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: Math.max(0, ev.findIndex((o) => o.ready)), back: () => moves(id, { focusKey: 'evolve' }) });
		H.screen = 'evolve';
	}
	function evolveAsk(id, o) {
		const c = col(), f = c.figs[id];
		if (!f) return squad();
		const a = battleStats(f, data), b = battleStats({ ...f, species: o.target }, data);
		const row = (k, lab) => `<tr><td>${lab}</td><td>${a[k]}</td><td>→</td><td><b${b[k] > a[k] ? ' class="bal-t-gold"' : ''}>${b[k]}</b></td></tr>`;
		const yes = btn('✨ Evolve!', { cls: 'bal-purple ph-wide', go: () => {
			let c2 = col(); const g = c2.figs[id];
			if (o.how === 'item') { const t = takeGood(c2, o.item); if (!t) { ctx.toast('You need a ' + goodName(o.item)); return evolveScreen(id); } c2 = t; }
			const e = evolve(g, o.target, data);
			saveFig(c2, e); sfx.coin && sfx.coin();
			ctx.toast(name(g.species) + ' evolved into ' + name(o.target) + '!');
			moves(id, { focusKey: 'held' });
		}, info: () => '<p>' + esc(name(f.species)) + ' becomes ' + esc(name(o.target)) + '. It keeps its level, moves and held item.</p>' });
		const no = btn('Not now', { cls: 'bal-grey ph-wide', go: () => evolveScreen(id), info: () => '<p>It stays ' + esc(name(f.species)) + '. You can evolve it any time later.</p>' });
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Evolve?</h2></header>
			<div class="ph-body"><div class="bal-panel ph-evo"><div class="ph-evo-pair"><img src="${esc(sprite(f.species))}" alt="" draggable="false"><span class="ph-evo-arrow">→</span><img src="${esc(sprite(o.target))}" alt="" draggable="false"></div>
				<p><b>${esc(name(f.species))}</b> → <b>${esc(name(o.target))}</b> ${types(o.target)}${o.item ? ' <span class="bal-muted">· uses your ' + esc(goodName(o.item)) + '</span>' : ''}</p>
				<table class="ph-statt">${row('maxHP', 'HP')}${row('atk', 'Atk')}${row('def', 'Def')}${row('spa', 'SpA')}${row('spd', 'SpD')}${row('spe', 'Spe')}${row('move', 'Move')}</table>
				<nav class="ph-menu ph-evo-acts">${yes}${no}</nav></div><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: 0, back: () => evolveScreen(id) });
		H.screen = 'evolve-ask';
	}
	function useCandy(id) {
		const c = col(), f = c.figs[id];
		let t = f && haveGood(c, 'rarecandy') >= polishNeed(f.level) ? c : null;
		for (let i = 0; t && i < polishNeed(f.level); i++) t = takeGood(t, 'rarecandy');
		if (!f || !t || f.level >= MAX_LEVEL) return moves(id);
		const g = gainExp(f, expForLevel(f.level + 1) - f.exp, data);
		saveFig(t, g.fig); sfx.coin && sfx.coin();
		ctx.toast(name(f.species) + ' grew to Lv ' + g.fig.level + (g.newMoves.length ? ' and learned ' + g.newMoves.map((m) => (data.moves[m] || {}).name || m).join(', ') : '') + (evolvesByLevelNow(g.fig, data) && !evolvesByLevelNow(f, data) ? ' · it can evolve!' : ''));
		moves(id, { focusKey: haveGood(t, 'rarecandy') ? 'candy' : 'held' });   // (the row stays, switched off, while some is left)
	}

	/** The shop: stars for goods (tabs: held items, evolution items, candy, figurines). opt.back: where X goes. */
	const SHOP_TABS = ['Held items', 'Evolution', 'Polish & kits', 'Figurines', 'Gemstones'];
	function shop(tab = H.shopTab || 0, opt = {}) {
		if (opt.back) H.shopBack = opt.back;
		H.shopTab = tab;
		const c = col(), n = goodsCount(c), wallet = Stars.stars();
		const have = {}; for (const { gem } of gemList(c)) { const p = parseGem(gem); have[p.s] = (have[p.s] || 0) + 1; }   // (loose gemstones, by stat)
		const tabs = SHOP_TABS.map((t, i) => btn(esc(t), { cls: 'bal-tab' + (i === tab ? ' is-on' : ''), go: () => shop(i) })).join('');
		const buyGood = (gid) => {
			const price = goodStars(gid);
			if (!Stars.spend(price)) { sfx.error(); ctx.toast('Not enough stars: ' + price + ' ★ needed'); return; }
			ctx.saveCol(addGood(col(), gid, tail())); ctx.starsSpent && ctx.starsSpent();
			sfx.coin && sfx.coin(); ctx.toast('Bought: ' + goodName(gid) + ' · ★ ' + Stars.stars() + ' left');
			const f = H.focus; shop(tab); setFocus(Math.min(f, H.acts.length - 1), true);
		};
		const row = (gid, g, extra = '') => btn(`${goodIconImg(gid)}<span class="ph-row-name">${esc(g.name)}</span>${n[gid] ? '<small>own ' + n[gid] + '</small>' : ''}<span class="bal-badge bal-gold">${g.stars} ★</span>`, { cls: 'bal-blue ph-row', off: g.stars > wallet && 'Not enough stars: ' + g.stars + ' ★ needed', go: () => buyGood(gid), info: () => `<h3 class="bal-h3">${goodIconImg(gid, 'is-big')}${esc(g.name)}</h3><p>${esc(g.text || extra)}</p><p class="ph-pill-row"><span class="bal-badge bal-gold">${g.stars} ★</span>${n[gid] ? '<span class="bal-badge bal-grey">you own ' + n[gid] + '</span>' : ''}</p>` });
		let body = '';
		if (tab === 0) body = Object.entries(HELD).map(([gid, g]) => row(gid, g)).join('');
		else if (tab === 1) body = Object.entries(EVO).map(([gid, g]) => row(gid, g, 'Evolves some Pokémon (Squad → a figurine → Evolution says which). Used up when it does.')).join('');
		else if (tab === 2) body = [...Object.entries(CANDY), ...Object.entries(KIT)].map(([gid, g]) => row(gid, g)).join('');
		else if (tab === 4) body = GEM_STATS.map((s) => btn(`${goodIconImg('gem-' + s)}<span class="ph-row-name">${esc(GEMS[s].name)} Lv 1</span><small>${esc(gemSay(s + ':1'))}</small>${have[s] ? '<small>own ' + have[s] + '</small>' : ''}<span class="bal-badge bal-gold">${GEMS[s].stars} ★</span>`, { cls: 'bal-blue ph-row', off: GEMS[s].stars > wallet && 'Not enough stars: ' + GEMS[s].stars + ' ★ needed', go: () => {
			if (!Stars.spend(GEMS[s].stars)) { sfx.error(); ctx.toast('Not enough stars: ' + GEMS[s].stars + ' ★ needed'); return; }
			ctx.saveCol(addGem(col(), s, 1, tail())); ctx.starsSpent && ctx.starsSpent();
			sfx.coin && sfx.coin(); ctx.toast('Bought: ' + GEMS[s].name + ' Lv 1 · ★ ' + Stars.stars() + ' left');
			const f = H.focus; shop(tab); setFocus(Math.min(f, H.acts.length - 1), true);
		}, info: () => `<h3 class="bal-h3">${goodIconImg('gem-' + s, 'is-big')}${esc(GEMS[s].name)}</h3><p>A plush gemstone. In a held item's slot it gives the figurine holding the item <b>+${GEM_PCT}% ${esc(GEMS[s].stat)}</b> a level.</p><p class="bal-muted">Two of the same stat combine into a stronger one (a Stitching Kit, from the Item World). The Item World has stronger gemstones too.</p><p class="ph-pills"><span class="bal-badge bal-gold">${GEMS[s].stars} ★</span>${have[s] ? '<span class="bal-badge bal-grey">you own ' + have[s] + '</span>' : ''}</p>` })).join('');
		else body = `<div class="ph-grid">${STARTERS.map((sp) => figCard({ species: sp }, { badge: SHOP_FIG_STARS + '★', off: SHOP_FIG_STARS > wallet && 'Not enough stars: ' + SHOP_FIG_STARS + ' ★ needed', info: () => `<div class="ph-fig"><img src="${esc(sprite(sp))}" alt=""><div><h3 class="bal-h3">${esc(name(sp))}</h3><div>${types(sp)}</div></div></div><p>A new figurine at Lv ${STARTER_LEVEL}: ${SHOP_FIG_STARS} ★</p>`, go: () => {
			if (!Stars.spend(SHOP_FIG_STARS)) { sfx.error(); ctx.toast('Not enough stars'); return; }
			const fig = { ...makeFigurine(sp, STARTER_LEVEL, makeRng(sp + tail()), data, { id: (sp + '-shop-' + tail()).slice(0, 60) }), from: 'shop' };
			ctx.saveCol(addFig(col(), fig)); ctx.starsSpent && ctx.starsSpent();
			sfx.coin && sfx.coin(); ctx.toast(name(sp) + ' joins your squad!' + (fig.shiny ? ' It\'s shiny!' : ''));
			const f = H.focus; shop(tab); setFocus(Math.min(f, H.acts.length - 1), true);
		} })).join('')}</div>`;
		const back = H.shopBack || (() => home('shop'));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Shop</h2><div class="ph-wallet"><span class="bal-badge bal-gold">★ ${wallet}</span></div></header>
			<div class="bal-tabs ph-tabs">${tabs}<span class="ph-tabkeys bal-muted"><span class="bal-key">Q</span><span class="bal-key">E</span></span></div>
			<div class="ph-body"><nav class="ph-list bal-scroll">${body}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: SHOP_TABS.length, back: () => { H.shopBack = null; back(); }, tabs: (d) => shop((tab + d + SHOP_TABS.length) % SHOP_TABS.length) });
		H.screen = 'shop';
	}

	// ---- the Figurine book (book.js): every Pokémon by generation, and where to find it
	// (the overworld's wild places come from its encounters, fetched the first time the book opens: until then the rest shows)
	function loadWild() {
		if (H.wild || H.wildLoading || !ctx.getJSON) return;
		H.wildLoading = true;
		Promise.all([ctx.getJSON('/overworld/data/encounters.json'), ctx.getJSON('/overworld/map_regions.json')]).then(([enc, regions]) => {
			H.wild = wildIndex(enc, regions);
			if (H.screen === 'book') { const f = H.focus; book(H.bookTab); setFocus(f, true); }
		}).catch(() => { H.wildLoading = false; });
	}
	function book(tab = H.bookTab || 0, focusNum = null) {
		loadWild();
		const c = col(), st = bookState(c, data), dex = dexList(data);
		const tabNames = [...GENS.map((_, i) => 'Gen ' + (i + 1)), ...(st.other.length ? ['Other'] : [])];
		tab = Math.min(tab, tabNames.length - 1); H.bookTab = tab;
		const tabs = tabNames.map((t, i) => {
			const [a, b] = GENS[i] || [0, -1];
			const have = i < GENS.length ? [...st.owned.keys()].filter((n) => n >= a && n <= b).length : st.other.length;
			return btn(`${esc(t)} <small>${have}/${i < GENS.length ? b - a + 1 : st.other.length}</small>`, { cls: 'bal-tab' + (i === tab ? ' is-on' : ''), go: () => book(i) });
		}).join('');
		const figsOf = (pred) => list(c).filter(pred);
		const entries = tab < GENS.length ? dex.filter((d) => genOf(d.num) === tab + 1) : st.other.map((id) => ({ id, num: 0 }));
		const cards = entries.map((d) => {
			const o = d.num ? st.owned.get(d.num) : { n: figsOf((f) => f.species === d.id).length, best: Math.max(0, ...figsOf((f) => f.species === d.id).map((f) => f.level)) };
			const state = o ? 'owned' : st.met.has(d.num) ? 'met' : 'none';
			const no = d.num ? '#' + String(d.num).padStart(4, '0') : '';
			const mine = () => figsOf((f) => (d.num ? (data.species[f.species] || {}).num === d.num : f.species === d.id));
			const i = acts.length;
			acts.push({ go: () => { const m = mine(); if (m.length) squad(m[0].id); else ctx.toast('Not owned yet'); }, info: () => bookInfo(d, o, state), off: false });
			return `<button class="ph-card ph-book-${state}" data-nav="${i}" aria-disabled="false"><span class="ph-badge ph-dexno">${no}${o && o.n > 1 ? ' ×' + o.n : ''}${o && o.shiny ? ' ★' : ''}</span><img src="${esc(sprite(d.id))}" alt="" loading="lazy" draggable="false"><span class="ph-card-name">${esc(name(d.id))}</span><span class="ph-card-lv">${o ? 'Lv ' + o.best : state === 'met' ? 'met' : '—'}</span></button>`;
		});
		const nTabs = tabNames.length;
		const want = focusNum ? entries.findIndex((d) => d.num === focusNum) : 0;
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Figurine book</h2><div class="ph-wallet"><span class="bal-badge bal-purple">${st.count} / ${DEX_MAX}</span></div></header>
			<div class="bal-tabs ph-tabs ph-booktabs">${tabs}<span class="ph-tabkeys bal-muted"><span class="bal-key">Q</span><span class="bal-key">E</span></span></div>
			<div class="ph-body"><div class="ph-grid bal-scroll">${cards.join('') || '<p class="bal-muted">None yet.</p>'}</div><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: nTabs + Math.max(0, want), back: () => home('book'), tabs: (d) => book((tab + d + nTabs) % nTabs) });
		H.screen = 'book';
		// (the tab row scrolls sideways on a narrow screen: the open generation in the middle of it)
		const row = root.querySelector('.ph-booktabs'), on = row && row.querySelector('.bal-tab.is-on');
		if (on) row.scrollLeft = Math.max(0, on.offsetLeft - row.offsetLeft - (row.clientWidth - on.offsetWidth) / 2);
	}
	function bookInfo(d, o, state) {
		const sp = data.species[d.id] || {};
		const status = o ? `<span class="bal-badge bal-green">Owned${o.n > 1 ? ' ×' + o.n : ''}</span> <span class="bal-muted">best Lv ${o.best}${o.shiny ? ' · ★ shiny' : ''}</span>` : state === 'met' ? '<span class="bal-badge bal-orange">Met</span> <span class="bal-muted">fought in the story</span>' : '<span class="bal-badge bal-grey">Not yet</span>';
		const ways = whereToFind(d.id, data, H.wild);
		const list = ways.map((w) => `<li class="ph-way-${w.k}">${esc(w.text)}</li>`).join('');
		return `<div class="ph-fig"><img src="${esc(sprite(d.id))}" alt="" draggable="false"><div><h3 class="bal-h3">${esc(name(d.id))}</h3><div class="bal-muted">${d.num ? 'No. ' + d.num : ''}</div><div>${types(d.id)}</div></div></div>
			<p>${status}</p><p class="ph-ways-h"><b>Where to find it</b></p><ul class="ph-ways">${list}</ul>${!H.wild && canBeFigurine(sp) ? '<p class="bal-muted">Loading the overworld\'s wild places…</p>' : ''}
			<p class="bal-muted ph-note">Any trainer you beat in the overworld: 1 win in 20 gives one of their team's figurines; a gym leader's first defeat gives their ace's. Friends can trade figurines too.</p>${o ? '<p class="bal-muted"><span class="bal-key">Z</span> see it in your squad</p>' : ''}`;
	}

	// ---- a new player's starters
	function starters() {
		const cards = STARTERS.map((sp) => { const k = H.pick.indexOf(sp); return figCard({ species: sp }, { on: k >= 0, badge: k >= 0 ? '✓' : '', info: () => `<div class="ph-fig"><img src="${esc(sprite(sp))}" alt=""><div><h3 class="bal-h3">${esc(name(sp))}</h3><div>${types(sp)}</div></div></div><p class="bal-muted">Starts at level 5.</p>`, go: () => {
			H.pick = k >= 0 ? H.pick.filter((x) => x !== sp) : H.pick.length < STARTER_PICK ? [...H.pick, sp] : H.pick;
			if (k < 0 && !H.pick.includes(sp)) ctx.toast('Three at most: take one out first');
			const f = H.focus; starters(); setFocus(f, true);
		} }); });
		const take = btn(`Take these three <small>${H.pick.length}/${STARTER_PICK}</small>`, { cls: 'bal-orange ph-sortie', off: H.pick.length !== STARTER_PICK && 'Pick three first', go: () => { const p = H.pick; H.pick = []; ctx.makeStarters(p); } });
		render(`<div class="ph-screen">
			<header class="ph-head"><div class="bal-logo ph-logo ph-logo-sm">Poketactica</div><h2 class="bal-h2">Pick three starters</h2>${take}</header>
			<p class="ph-sub bal-muted">Your first figurines. Mix their types: Fire beats Grass, Grass beats Water, Water beats Fire.</p>
			<div class="ph-body"><div class="ph-grid bal-scroll">${cards.join('')}</div><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: 0 });
		H.screen = 'starters';
	}

	// ---- How to play
	const HELP = [
		['Controls', `<table class="ph-keys"><tr><th></th><th>Keyboard</th><th>Controller</th><th>Touch</th></tr>
			<tr><td>Move the cursor</td><td>Arrows / WASD</td><td>D-pad</td><td>Tap a tile</td></tr>
			<tr><td>Choose</td><td>Z</td><td>A</td><td>Tap (your unit: its commands)</td></tr>
			<tr><td>Back</td><td>X</td><td>B</td><td>Back button</td></tr>
			<tr><td>Unit status</td><td>C</td><td>X</td><td>Status in its commands</td></tr>
			<tr><td>Execute</td><td>V</td><td>Y</td><td>Execute button</td></tr>
			<tr><td>Turn the camera</td><td>Q / E</td><td>L / R</td><td>⟲ ⟳</td></tr>
			<tr><td>Field menu</td><td>Enter</td><td>Start</td><td>Menu button</td></tr>
			<tr><td>Look around</td><td></td><td></td><td>Drag; pinch to zoom</td></tr>
			<tr><td>Every foe's reach</td><td>Field menu</td><td>Field menu</td><td>👁</td></tr>
			<tr><td>Speed up what plays</td><td>Z</td><td>A</td><td>Tap</td></tr>
			<tr><td>Empty a move slot</td><td>C</td><td>X</td><td>✕ on the slot</td></tr></table>`],
		['Turns', `<p>Choose the <b>base tile</b> (the pale square) to deploy a figurine, up to six on the map.</p><p>Each figurine can <b>Move</b> once and act once: <b>Attack</b>, <b>Throw</b> or <b>Wait</b>. A move can be undone until it acts.</p><p>Attacks cost <b>SP</b> (and PP). Walking wins SP back: each tile walked recovers 2% of max SP (rounded up); an Undo takes it away again.</p><p>Attacks wait in a queue: <b>Execute</b> runs them in order. Hits in one Execute <b>combo</b> (+10% each). Allies next to the attacker may join in a <b>team attack</b>.</p><p><b>End turn</b> (the field menu) runs the queue and hands over to the enemy.</p><p>While you aim, the box shows each target's <b>hit chance</b>, its <b>damage</b> and whether it would be knocked out. The cursor (or a tap) on a foe shows where it can go and strike; the <b>👁</b> button (or Enemy range in the field menu) shows every foe's reach.</p><p>Changed your mind? A unit's <b>Cancel attack</b> gives its PP and SP back. The <b>Execute list</b> (the field menu) puts the queue in another order.</p><p>A battle is saved as you play: if you leave, <b>Resume</b> in the camp puts it back.</p>`],
		['Height & facing', `<p>Attacking from higher ground hits harder (+10% a level, up to +50%); from below, weaker.</p><p>Hitting a foe from the side or the back is more accurate. Jump decides how high a figurine can climb.</p>`],
		['Geo panels', `<p>Coloured tiles are <b>Geo panels</b>. A <b>Geo symbol</b> (the pyramid) gives every panel of its colour an effect: more attack, less defence, invincible, heal…</p><p>Destroy a symbol to repaint its colour: panels in a chain burst, hurting whoever stands on them and filling the <b>Bonus Gauge</b>.</p>`],
		['Throw & catch', `<p>Strong figurines can <b>Throw</b>: lift the one next to it (friend, foe or a Geo symbol) and throw it a few tiles.</p><p>Throw a weakened <b>wild</b> Pokémon onto your <b>base tile</b> to try to catch it: it joins your collection as a figurine.</p>`],
		['The Item World', `<p><b>Each item's world is its own</b> when you dive in battles: a type booster's world holds Pokémon of that type on that type's ground; a bead's world is gentle (a foe fewer on each floor); a Choice item's world is fast (every foe comes at once); and the exit's guardian always holds the item you are levelling.</p><p>Camp → <b>Item World</b>: go <b>into a held item</b> from your bag. A dive runs from the item's level to its next <b>exit floor</b> (10, 20 … 100). Play it as <b>Battles</b> (a battle a floor, the exit a boss) or as a <b>Mystery Maze</b> (walk the same floors, find the stairs, beat the boss on the last). Clear the exit and the dive is <b>banked</b>: the item becomes that level, and the plush gemstones and the Stitching Kit you found come out with you.</p><p>A <b>Pull Cord</b> (Shop, Polish & kits) is the way out of a dive: use it from Give up in a dive's battle or maze, or from Abandon this dive in the camp, and you keep the floors cleared so far (the item's levels and the gemstones found). The Stitching Kit stays at the exit.</p><p>Give up or lose before the exit and nothing is kept. The item itself is never lost, but <b>a figurine that faints is gone for good</b>, as in Story and the Dungeon. A costlier item is a harder world. A dive waits on this device between floors; only one at a time.</p>`],
		['Item levels & gemstones', `<p>Every held item has a <b>level</b> (1 to 100) and <b>slots</b>: 4, and one more at levels 25, 50, 75 and 100. A level grows the item's own bonus, up to ×3 at level 100. Levels come from the <b>Item World</b>.</p><p><b>Plush gemstones</b> go in the slots (Camp → Items &amp; gemstones). Each gives the figurine holding the item +0.5% of one stat a level; the same stat adds up. Two gemstones of one stat <b>combine</b> into one, their levels added (100 at most), for a Stitching Kit. That is the only way a gemstone levels up.</p><p>The Shop sells level 1 gemstones. An item keeps its level and gemstones when it is taken off or swapped.</p>`],
		['Items & evolution', `<p>Each figurine can <b>hold one item</b> (Squad → a figurine → 🎒). Type boosters, Leftover Clay, Choice items, Focus Thread, beads… They work in every battle; beads and the Thread once a battle.</p><p>A figurine <b>evolves</b> at its species' real level (✨ in Squad). Friendship evolutions open at Lv 20; paint and trade evolutions need their item. Evolving is never forced: "Not now" keeps it as it is.</p><p>The <b>Shop</b> sells held items, evolution items, Rare Polish and starter figurines for stars.</p>`],
		['Terrain', `<p>What a tile is made of matters. <b>Water</b> and <b>ice</b> take 2 Move a tile, unless the figurine is a Water (Ice) or Flying type. <b>Lava</b> burns a figurine standing on it at the end of its side's phase (1/8 of its HP), unless it is Fire or Flying. <b>Tall grass</b> hides: attacks at a figurine in it are 20% less likely to hit.</p><p>Each favours its own type: Water moves from water, Ice from ice, Fire from lava and Grass from tall grass do 20% more. The forecast and the unit panel say when it counts.</p>`],
		['Versus', `<p><b>Versus</b> (signed in) plays friends online: two to four sides on one arena, and the host can make empty seats computers. Make a match and share its 5-letter code, or join one with a code; everyone picks a team, the host presses Start.</p><p>The seats take turns in a random order: in yours, deploy from <b>your base</b> (the pale tile; the others' are orange), move, queue attacks and Execute, then End turn. A seat that takes too long has its turn ended; a player who leaves is out. The last side standing wins (after 30 rounds: the most HP left). "Everyone Lv 50" makes it fair; no stars or EXP change hands.</p>`],
		['Maze Builder', `<p>The second way to play Tower Defense. There is <b>no road</b>: enemies walk the shortest way from the gate to your base, drawn in yellow. You bend that way with <b>block cards</b>.</p><p><b>Drag a card</b> onto the board to lay it, or pick it and then a tile. A set of rewards can be <b>changed for gold</b> (10, then 20) before you take one. The menu has three switches: the <b>next wave by itself</b> a few seconds after your last order, <b>every tower's reach</b> at once, and <b>damage dealt</b> tower by tower. Each hero keeps a best wave of their own.</p><p><b>Enemy kinds</b> (from wave 3): <b>Runners</b> are fast with less HP; <b>Splitters</b> become two small ones when knocked out; <b>Shielded</b> ones cannot be held, slowed or given a status until they have lost 40% of their HP; <b>Healers</b> mend the others near them. All of them walk the way. Waves 5, 15, 25… are <b>elite</b>: the whole wave is of one kind. A boss from wave 20 has a trick: it rallies its wave, calls help, or is armoured. The top-right corner shows the next wave in full and the two after it.</p>
			<p><b>Blocks.</b> You hold up to 6 cards; 3 more come each round. A block is a wall enemies must walk round, and the only place a figurine may stand (besides the map's own rocks). You can never close the way completely. A block laid this round can be taken back; once the wave is called it <b>locks</b>.</p>
			<p><b>Laying one.</b> Keyboard / controller: <b>V</b> the next card, <b>C</b> turn it, <b>Z</b> put it, <b>Z</b> again lay it, <b>X</b> back. Touch: tap a card, tap a tile, then <b>Lay it</b>. The hint shows what it does to the way ("Way 11 → 13").</p>
			<p><b>Gold ●</b> (this run only) takes the place of slots and energy. A figurine costs 20, and 10 more for each one already out. Gold also buys an extra card, an SP refill, an Overdrive, or a <b>Lift</b> (a locked block back to your hand). Knockouts and cleared waves pay gold.</p>
			<p><b>Rewards.</b> After each wave pick 1 of 3 (after a boss wave, 2 of 4): a <b>bonus block</b>, gold, two plain blocks, or a life. Bonus blocks: <b>Tall</b> (higher ground), <b>Water / Lava / Grass / Ice</b> (+20% to that type), <b>Red / Blue panel</b> (Attack / Sp. Atk +20%), <b>Purple panel</b> (never misses).</p>
			<p>There is no clock: the wave starts when you call it (<b>Enter</b>, or the <b>Wave!</b> button). An enemy held still for 3 seconds shakes it off for the next 3.</p>
			<p><b>Heroes.</b> You play a run as a hero. Each has their own <b>deck</b> of block cards (reward cards you pick join it) and a <b>passive</b> from the start; after every boss wave you pick 1 of 3 more. Brock is free. Misty, Lt. Surge, Erika and Lance open when you clear waves 10, 15, 20 and 25 in Maze Builder.</p>
			<p><b>Effects.</b> The menu (Enter) has an Effects switch: <b>full</b> shows big damage numbers, bursts and flying coins; <b>calm</b> shows plain numbers and nothing else.</p>`],
		['Tower Defense', `<p>Your figurines are <b>towers</b>. Enemies only walk the road from the gate to your <b>base</b>; each one that arrives costs a life (a boss five). At 0 lives the run ends. Towers can't be hurt: <b>nothing is lost here</b>.</p>
			<p><b>Place</b> a figurine on any free tile beside the road (Z, or a tap). You start with three slots; more open as you clear waves. High ground, Geo panels and the ground under a tower count as in a battle.</p>
			<p>Towers act <b>on their own</b>. Each move has a <b>cooldown</b> (shorter for fast Pokémon, longer for costly moves), costs <b>SP</b> (which refills over time) and <b>PP</b> (refilled when a wave is cleared). Z on a tower: who it targets, which moves it uses, Throw (if it can lift), and what energy buys.</p>
			<p>Sleep and freeze <b>stop</b> an enemy, paralysis <b>slows</b> it, confusion walks it <b>backwards</b>, burn and poison wear it down, knockback moves push it back down the road. Healing moves give towers <b>SP</b>.</p>
			<p><b>Energy</b> ⚡ comes from knockouts and clean waves and lasts for the run: open a slot early, refill SP, overdrive a tower, swap one out at once.</p>
			<p>Every menu <b>pauses</b>. C changes the speed (1× 2× 3×), V calls the next wave early for bonus energy, Enter pauses. Every 10th wave is a <b>boss</b>, and clearing it is a checkpoint new runs can start after.</p>`],
		['Goals', `<p>Camp → <b>Goals</b>. <b>Today</b>: three small tasks a day, the same for everyone, new at midnight UTC (win battles, knock out foes, clear waves or floors, catch a Pokémon). <b>Milestones</b>: one-time targets across every mode: Story maps, Dungeon bosses, the book, a figurine's level, best waves, dungeons cleared, item and gemstone levels.</p><p>Each pays <b>stars</b>, once. A milestone you had already reached is there to claim.</p>`],
		['Permanent loss', `<p><b>A figurine knocked out in the Story, the Dungeon or the Item World is gone for good</b>, with the item it holds. It leaves your collection the moment it faints: winning, giving up or closing the game does not bring it back.</p><p>A figurine that could be knocked out in the coming enemy phase stands on a <b>red tile</b>, and its panel says <b>☠ In danger</b> (or <b>Will fall</b>). To save one, walk it onto the <b>base tile</b>: from the turn after it came out, its commands there have <b>Withdraw</b>, which puts it back in the reserve as it is. The last figurine on the map cannot leave.</p><p><b>Training Grounds and Versus are safe.</b> The team screen says which kind of battle you are about to start.</p><p>If you lose every figurine, you pick three starters again. The camp's <b>Fallen</b> list remembers the ones you lost.</p>`],
		['Bonus Gauge', `<p>KOs, combos and Geo chains fill the <b>Bonus Gauge</b>. Each level adds a reward you take home if you win: EXP, stars, items for the overworld, card packs.</p>`],
	];
	HELP.push(['Mystery Maze', `<p>Lead a <b>party</b> down through a dungeon, floor by floor, to the stairs. <b>Everything moves when you move</b>: take your time.</p><p><b>The bag</b> (V) holds 20. Pick an item to <b>Use</b> or <b>Throw</b> it, <b>Give</b> a bead, a drink or a Quick Pellet to a partner, <b>Drop</b> it, or <b>Swap</b> it for what lies underfoot (how a full bag takes something better). On a shop's carpet you can <b>Sell</b> an item of yours for half its price. Each dungeon has items and traps of its own.</p><p><b>Partners</b> finish a nearly beaten foe with the plain Attack, otherwise use the move that is worth most, and walk round a trap that is showing. Menu → <b>Tactics</b> → a partner sets where it stands and how it uses its moves: its best move, <b>Save PP</b>, or <b>Attack only</b>; any one move can be switched off. Menu → <b>Look</b> asks what something in sight is: a foe, a trap, an item, a partner's moves and PP.</p>
			<p><b>You control the leader</b> (the first figurine you pick); the others follow and fight on their own. Give each a tactic from the menu.</p>
			<ul><li><b>Arrows</b> step; two together step diagonally. Walk into a wild Pokémon to attack it.</li><li><b>Z</b> attacks the tile in front (free), takes the stairs, or takes a shop's item. <b>C</b> your moves (they cost PP and SP). <b>V</b> the bag. <b>X</b> then a direction turns on the spot. <b>Enter</b> the menu.</li><li>On a phone: the <b>joystick</b> steps in 8 directions, the way it points on screen, and keeps going while you hold it. <b>A</b> attacks, takes the stairs or takes a shop's item; hold <b>B</b> and the stick only turns you. MENU, MOVES, BAG and WAIT are at the top right. You can still tap the board to walk somewhere.</li></ul>
			<p><b>Belly:</b> every action makes you hungrier. Use Wax Apples; at 0 you lose HP instead of healing. <b>Rest</b> (the menu) passes turns until everyone is healed.</p>
			<p><b>Items</b> lie on the floors: beads heal, pellets do odd things (throw them at foes), marbles change the whole room. <b>Traps</b> are hidden until stepped on: your Attack shows one in front of you.</p>
			<p><b>Shops:</b> take what you like, then <b>pay</b> from the menu before you step off the carpet. Leave without paying and the shopkeeper comes for you.</p>
			<p><b>Recruits:</b> a wild Pokémon your leader knocks out from right beside it may ask to join.</p>
			<p class="ph-td-none"><b>Deadly.</b> A figurine that faints is gone for good. If the leader falls, the next partner leads; if all fall, the run is lost with everything in it.</p>
			<p><b>What you keep:</b> clear the dungeon, or leave by Escape Marble, and you keep the stars, the bag (into your storage) and your recruits. Give up or fall and those are lost. The stars you choose to carry in are at risk too.</p>`]);
	function help(tab = H.helpTab, onClose) {
		if (typeof tab === 'string') tab = Math.max(0, HELP.findIndex(([t]) => t === tab));   // (a page by its name)
		if (onClose) H.onClose = onClose;
		H.helpTab = tab;
		const tabs = HELP.map(([t], i) => btn(esc(t), { cls: 'bal-tab' + (i === tab ? ' is-on' : ''), go: () => help(i) })).join('');
		const close = () => { if (H.onClose) { const f = H.onClose; H.onClose = null; f(); } else home('help'); };
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">How to play</h2></header>
			<div class="bal-tabs ph-tabs">${tabs}<span class="ph-tabkeys bal-muted"><span class="bal-key">Q</span><span class="bal-key">E</span></span></div>
			<div class="bal-panel ph-help bal-scroll">${HELP[tab][1]}</div></div>`,
		{ focus: tab, back: close, tabs: (d) => help((tab + d + HELP.length) % HELP.length) });
		H.screen = 'help';
	}
	root.addEventListener('click', (ev) => { if (ev.target.closest('[data-back]') && H.back) { sfx.back(); H.back(); } }, true);
	root.addEventListener('click', (ev) => { if (ev.target.closest('[data-moves]') && H.screen === 'team' && H.teamMoves) { sfx.press(); H.teamMoves(); } }, true);

	return {
		H, home, stages, dungeon, team, squad, book, fallen, sortieTo, tdMaps, tdSquad, mmDungeons, mmParty, mmPack, mmStorage, moves, held, evolveScreen, shop, starters, help, onAction, maps, teamFigs, versusOn, vsSetupFor,
		get active() { return !root.hidden; },
		close() { root.hidden = true; root.innerHTML = ''; H.screen = null; },
		labels: () => navEls().map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
		focusLabel: () => { const el = root.querySelector('.is-focus'); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; },
		versus,
		/** ONE RESULTS SCREEN (improvement plan, 2026-11-25): "again" from a Tower Defense or Mystery Maze run's results goes
		 *  straight to that map's or dungeon's own way in (its start wave, hero and squad; its party and pack). */
		again(o) {
			if (o && o.td && tdMapById(o.td)) return tdStartWaves(tdBest(o.td)).length > 1 ? tdStart(o.td) : tdNext(o.td, 1);
			if (o && o.mm) { const d = mmDungeonById(o.mm); if (d && !d.iw && mmDungeonOpen(d, cleanMm(col().mm).clear)) { H.mmCh = []; H.mmChFor = null; return mmParty(o.mm); } }
			return home();
		},
		/** The team screen for a battle (after a wipe: the results' "Pick a new team"). */
		team: (target) => team(target),
		/** After a battle: the team screen for the next map / floor, so one Z plays on. */
		next(target) { if (target) H.target = target; },
		continueTarget,
	};
}

function loadTeam() { try { const t = JSON.parse(localStorage.getItem(TEAM_KEY) || '[]'); return Array.isArray(t) ? t.filter((x) => typeof x === 'string').slice(0, TEAM_MAX) : []; } catch { return []; } }
/** The three saved teams (plan item V3): [[figurine ids], [], []], on this device. */
export function loadPresets(LS = globalThis.localStorage) { let t = []; try { t = JSON.parse(LS.getItem(PRESETS_KEY) || '[]'); } catch { t = []; } return Array.from({ length: PRESET_N }, (_, i) => (Array.isArray(t) && Array.isArray(t[i]) ? t[i].filter((x) => typeof x === 'string' && x.length <= 80).slice(0, TEAM_MAX) : [])); }
export function savePresets(sets, LS = globalThis.localStorage) { try { LS.setItem(PRESETS_KEY, JSON.stringify(Array.from({ length: PRESET_N }, (_, i) => (Array.isArray(sets[i]) ? sets[i].slice(0, TEAM_MAX) : [])))); return true; } catch { return false; } }
function saveTeam(t) { try { localStorage.setItem(TEAM_KEY, JSON.stringify(t.slice(0, TEAM_MAX))); } catch { /* private mode: the team just isn't remembered */ } }
