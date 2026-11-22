// hub.js — the camp: every screen outside a battle, laid out the way Disgaea's castle is (owner, 2026-11-21: "look at the
// menu system of Disgaea as inspiration, still Balatro UI"), on the Balatro kit:
//   home       the castle: Continue (the next battle, at once), Story, Dungeon, Training, Squad, How to play; the wallet
//   stages     the Dimensional Gate: a chapter's maps (Q / E or the tabs change chapter), the focused map's details
//   dungeon    the Item World: continue the run, or a new run from floor 1 or a checkpoint
//   team       the sortie: pick up to six figurines (the order they deploy in), then Sortie!
//   squad      the roster: each figurine's status; Z opens its moves
//   moves      one figurine's four move SLOTS, filled from every move it has learned (also from the team screen: C, and
//              from the results: a new move)
//   held       what a figurine holds: put one of your held items on it, or take it off
//   evolve     its evolutions: the ready ones, then "Evolve!" or "Not now" (never forced)
//   shop       spend stars: held items, evolution items, Rare Candy, starter figurines (tabs)
//   starters   a new player's three starters
//   help       How to play, by topic
//   maps       the MAP MAKER: a new map, a map by its share code, your maps (edit / play / share / delete); editmode.js edits
//   versus     online PvP for 2-4 (signed in): make a match (players, computers, arena, levels) or join one with its code;
//              the lobby (the code to share, who is in and ready, Start for the host) polls until the match starts
// Every screen is a page of buttons: the arrows move the focus the way they point on screen (nav.js), Z presses, X goes
// back, Q / E change tabs; a tap or a click presses. The focused button's details show in the side panel.
import { spatialNext } from './nav.js';
import { MAPS, CHAPTERS, mapById, isOpen, nextMap } from './campaign.js';
import { startFloors, loadRun, saveRun, newRun, floorLevel, floorStars, isBossFloor, BOSS_EVERY } from './dungeon.js';
import { STARTERS, STARTER_PICK, STARTER_LEVEL, list, addFig, addGood, takeGood, goodsCount, haveGood } from './figcol.js';
import { battleStats, expForLevel, equip, movesToCome, MAX_LEVEL, makeFigurine, gainExp } from './figurine.js';
import { HELD, EVO, CANDY, SHOP_FIG_STARS, goodName, goodStars } from './goods.js';
import { evoOptions, evolve, evolvesByLevelNow } from './evolve.js';
import { makeRng } from '../../overworld/rules/rng.js';
import { sfx } from '/site/ui/sfx.js';
import * as Stars from '/site/stars.js';
import { askText } from '/site/osk.js';
import { ARENAS, arenaById, PVP_LEVEL } from './arenas.js';
import { loadMaps, saveMaps } from './editmode.js';
import { problems as mapProblems, arenaProblems, cleanMap, NEW_SIZES, MAX_W, MAX_H, saveBlock, maxPlayers } from './editor.js';

export const TEAM_KEY = 'magepunk_poketactica_team_v1';   // (this device's last team: a convenience, never synced)
export const DUNGEON_OPENS = 'c1-5';
export const TEAM_MAX = 6;
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

	// ---- the castle
	function home(focusKey) {
		const c = col(), figs = list(c), cleared = (c.cleared || []).length, nm = nextMap(c.cleared), dg = dungeonOpen(c), run = loadRun();
		const cont = continueTarget();
		const items = [];
		const keys = [];
		const add = (key, html) => { keys.push(key); items.push(html); };
		// a battle left half-way on this device (a reload, a locked phone): Resume puts it back where it was
		const sv = ctx.saved ? ctx.saved() : null;
		if (sv) add('resume', btn(`<span class="ph-big">⏸ Resume battle</span><small>${esc(sv.label)} · Turn ${sv.turn}</small>`, { cls: 'bal-orange ph-wide', go: () => ctx.resume(), info: () => `<h3 class="bal-h3">Resume battle</h3><p>${esc(sv.label)}, turn ${sv.turn}: back where you left it.</p><p class="bal-muted">Starting another battle drops this one.</p>` }));
		add('continue', btn(`<span class="ph-big">▶ Continue</span><small>${esc(targetName(cont))}</small>`, { cls: 'bal-orange ph-wide', go: () => ctx.start({ target: cont, team: teamFigs() }), off: !teamFigs().length && 'Pick a team in Squad first', info: () => targetInfo(cont) }));
		add('story', btn(`<span class="ph-big">⚔ Story</span><small>${nm ? 'Chapter ' + nm.chapter + ' · next: ' + esc(nm.name) : 'every map cleared'}</small>`, { cls: 'bal-blue ph-wide', go: () => stages(), info: () => `<h3 class="bal-h3">Story</h3><p>The campaign: ${MAPS.length} maps in ${CHAPTERS.length} chapters. Each map's first clear pays stars, and some a figurine.</p><p class="bal-muted">${cleared} / ${MAPS.length} cleared</p>` }));
		add('dungeon', btn(`<span class="ph-big">🕳 Dungeon</span><small>${dg ? (run ? 'run on floor ' + run.floor : 'deepest checkpoint: floor ' + (startFloors(c.deep).at(-1))) : 'clear ' + esc((mapById(DUNGEON_OPENS) || {}).name) + ' to open'}</small>`, { cls: 'bal-red ph-wide', off: !dg && 'Clear ' + (mapById(DUNGEON_OPENS) || {}).name + ' to open the Dungeon', go: () => dungeon(), info: () => `<h3 class="bal-h3">The Dungeon</h3><p>Floor after floor of wild Pokémon, each a little stronger. Every ${BOSS_EVERY}th floor is a boss: beat it for its figurine and a checkpoint to start new runs from.</p><p class="bal-muted">A lost floor ends the run.</p>` }));
		add('training', btn(`<span class="ph-big">🎯 Training</span><small>a free battle at your level</small>`, { cls: 'bal-green ph-wide', go: () => team({ kind: 'training' }), info: () => `<h3 class="bal-h3">Training Grounds</h3><p>Wild Pokémon at your team's level. Good for EXP, catching and trying a new team.</p>` }));
		add('versus', btn(`<span class="ph-big">🤝 Versus</span><small>${ctx.signedIn && ctx.signedIn() ? 'online, 2-4 players' : 'sign in to play online'}</small>`, { cls: 'bal-red ph-wide', off: !(ctx.signedIn && ctx.signedIn()) && 'Sign in (the top bar) to play online', go: () => versus(), info: () => `<h3 class="bal-h3">Versus</h3><p>Play friends online, two to four on one map; empty seats can be computers. Make a match and share its code, or join one with a code. Everyone deploys from their own base; the last side standing wins.</p>` }));
		add('maps', btn(`<span class="ph-big">🛠 Map maker</span><small>build Versus arenas, share them</small>`, { cls: 'bal-green ph-wide', go: () => maps(), info: () => `<h3 class="bal-h3">Map maker</h3><p>Build your own Versus arenas on the board, up to 32×32: heights, ground (water, tall grass, lava, ice…), Geo panels, 2-4 PvP seats and wild foes that fight every side. Play them against friends in Versus and share them by code. (Made maps are for Versus only.)</p>` }));
		const nEvo = figs.filter((f) => evolvesByLevelNow(f, data)).length;
		add('squad', btn(`<span class="ph-big">🛡 Squad</span><small>${figs.length} figurine${figs.length === 1 ? '' : 's'}${nEvo ? ' · ✨ ' + nEvo + ' can evolve' : ''}</small>`, { cls: 'bal-purple ph-wide', go: () => squad(), info: () => `<h3 class="bal-h3">Squad</h3><p>Your figurines: their stats, and their four move slots, filled from every move each has learned.</p>` }));
		add('shop', btn(`<span class="ph-big">🛒 Shop</span><small>held items, evolution items, candy, figurines</small>`, { cls: 'bal-gold ph-wide', go: () => shop(), info: () => `<h3 class="bal-h3">Shop</h3><p>Spend stars on held items, evolution stones, Rare Candy and starter figurines.</p><p class="bal-muted">★ ${Stars.stars()} in your wallet</p>` }));
		add('help', btn(`<span class="ph-big">📖 How to play</span><small>controls, turns, Geo panels</small>`, { cls: 'bal-grey ph-wide', go: () => help(), info: () => `<h3 class="bal-h3">How to play</h3><p>Keyboard, controller and touch; turns, Execute, Geo panels, throwing and catching.</p>` }));
		const best = figs[0];
		render(`<div class="ph-screen ph-home">
			<header class="ph-head"><div class="bal-logo ph-logo">Poketactica</div><div class="ph-wallet"><span class="bal-badge bal-gold">★ ${Stars.stars()}</span></div></header>
			<div class="ph-body"><nav class="ph-menu">${items.join('')}</nav>
			<aside class="bal-panel ph-side"><div class="ph-detail"></div>
				<div class="ph-stats bal-muted"><div>Maps cleared <b>${cleared} / ${MAPS.length}</b></div>${c.deep ? `<div>Deepest boss <b>floor ${c.deep}</b></div>` : ''}${best ? `<div>Strongest <b>${esc(name(best.species))} Lv ${best.level}</b></div>` : ''}</div></aside></div>
			<footer class="ph-foot bal-muted"><span class="bal-key">Z</span> choose <span class="bal-key">X</span> back <span class="bal-key">←↑→↓</span> move</footer></div>`, { focus: Math.max(0, keys.indexOf(focusKey || (sv ? 'resume' : 'continue'))) });
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
	const validTarget = (t) => t.kind === 'training' || (t.kind === 'map' && isOpen(t.id, col().cleared)) || (t.kind === 'dungeon' && dungeonOpen(col()) && t.run);
	function targetName(t) {
		if (t.kind === 'map') { const m = mapById(t.id); return 'Story ' + mapNo(m) + ' · ' + m.name; }
		if (t.kind === 'dungeon') return 'Dungeon · floor ' + t.run.floor + (isBossFloor(t.run.floor) ? ' (boss)' : '');
		return 'Training Grounds';
	}
	function targetInfo(t) {
		if (t.kind === 'map') return mapInfo(mapById(t.id));
		if (t.kind === 'dungeon') return floorInfo(t.run.floor, t.run);
		return `<h3 class="bal-h3">Training Grounds</h3><p>Wild Pokémon at your team's level.</p>`;
	}

	// ---- the Dimensional Gate: the campaign's maps by chapter
	function stages(focusId) {
		const c = col(), cl = c.cleared || [];
		const nm = nextMap(cl);
		if (H.chapter == null) H.chapter = (focusId ? mapById(focusId) : nm || MAPS[MAPS.length - 1]).chapter;
		const ch = CHAPTERS.find((x) => x.n === H.chapter) || CHAPTERS[0];
		const tabs = CHAPTERS.map((x) => btn(`${x.n}. ${esc(x.name)}`, { cls: 'bal-tab' + (x.n === ch.n ? ' is-on' : ''), go: () => { H.chapter = x.n; stages(); }, info: () => `<h3 class="bal-h3">Chapter ${x.n}: ${esc(x.name)}</h3><p class="bal-muted">${MAPS.filter((m) => m.chapter === x.n && cl.includes(m.id)).length} / ${MAPS.filter((m) => m.chapter === x.n).length} cleared</p>` })).join('');
		const ms = MAPS.filter((m) => m.chapter === ch.n);
		const rows = ms.map((m) => {
			const open = isOpen(m.id, cl), done = cl.includes(m.id);
			return btn(`<span class="ph-no">${mapNo(m)}</span><span class="ph-row-name">${open ? esc(m.name) : '???'}</span>${m.boss ? '<span class="bal-badge bal-red">Boss</span>' : ''}${done ? '<span class="ph-tick">✓</span>' : open ? '<span class="bal-badge bal-orange">New</span>' : '<span>🔒</span>'}`,
				{ cls: (done ? 'bal-green' : 'bal-blue') + ' ph-row', off: !open && 'Clear the map before it first', go: () => team({ kind: 'map', id: m.id }), info: () => (open ? mapInfo(m) : '<h3 class="bal-h3">???</h3><p class="bal-muted">Clear the map before it to open this one.</p>') });
		});
		const nTabs = CHAPTERS.length;
		const want = focusId ? ms.findIndex((m) => m.id === focusId) : ms.findIndex((m) => m.id === (nm || {}).id);
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Story</h2><div class="ph-wallet"><span class="bal-badge bal-gold">★ ${Stars.stars()}</span></div></header>
			<div class="bal-tabs ph-tabs">${tabs}<span class="ph-tabkeys bal-muted"><span class="bal-key">Q</span><span class="bal-key">E</span></span></div>
			<div class="ph-body"><nav class="ph-list">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: nTabs + Math.max(0, want), back: () => home('story'), tabs: (d) => { H.chapter = ((ch.n - 1 + d + nTabs) % nTabs) + 1; stages(); } });
		H.screen = 'stages';
	}
	function mapInfo(m) {
		const cl = col().cleared || [], done = cl.includes(m.id);
		const foes = m.foes.map((f) => `${esc(name(f.sp))} Lv ${f.lv}${f.boss ? ' (boss)' : ''}`);
		const top = Math.max(...m.foes.map((f) => f.lv));
		return `<h3 class="bal-h3">${mapNo(m)} ${esc(m.name)}</h3>
			<p class="ph-pill-row"><span class="bal-badge ${done ? 'bal-green' : 'bal-orange'}">${done ? 'Cleared' : 'Not cleared'}</span><span class="bal-badge bal-blue">Foes up to Lv ${top}</span></p>
			<p>${esc(m.tip)}</p>
			<p class="bal-muted">Foes: ${foes.join(', ')}</p>
			<p>${done ? '<span class="bal-muted">First-clear reward taken</span>' : `First clear: <b class="bal-t-gold">${m.reward.stars} ★</b>${m.reward.fig ? ' and a ' + esc(name(m.reward.fig.sp)) + ' figurine' : ''}`}</p>`;
	}

	// ---- the Item World: the dungeon's runs
	function dungeon() {
		const c = col(), run = loadRun(), starts = startFloors(c.deep);
		const rows = [];
		if (run) rows.push(btn(`<span class="ph-row-name">Continue on floor ${run.floor}</span>${isBossFloor(run.floor) ? '<span class="bal-badge bal-red">Boss</span>' : ''}`, { cls: 'bal-orange ph-row', go: () => team({ kind: 'dungeon', run }), info: () => floorInfo(run.floor, run) }));
		for (const f of starts) rows.push(btn(`<span class="ph-row-name">New run from floor ${f}</span>${f > 1 ? '<span class="bal-badge bal-purple">Checkpoint</span>' : ''}`, { cls: 'bal-red ph-row', go: () => team({ kind: 'dungeon', run: 'new:' + f }), info: () => floorInfo(f, null) + (run ? `<p class="bal-t-red">Starting a new run ends the one on floor ${run.floor}.</p>` : '') }));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">The Dungeon</h2><div class="ph-wallet"><span class="bal-badge bal-gold">★ ${Stars.stars()}</span></div></header>
			<div class="ph-body"><nav class="ph-list">${rows.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div><div class="ph-stats bal-muted">${c.deep ? `<div>Deepest boss beaten: <b>floor ${c.deep}</b></div>` : '<div>No checkpoint yet: beat the floor 10 boss</div>'}</div></aside></div></div>`,
		{ back: () => home('dungeon') });
		H.screen = 'dungeon';
	}
	function floorInfo(f, run) {
		const boss = isBossFloor(f);
		return `<h3 class="bal-h3">Floor ${f}${boss ? ' · Boss' : ''}</h3>
			<p class="ph-pill-row"><span class="bal-badge bal-blue">Foes around Lv ${floorLevel(f, boss)}</span><span class="bal-badge bal-gold">${floorStars(f)} ★</span></p>
			<p>${boss ? 'A boss floor: beat it for the boss\'s figurine and a checkpoint.' : 'The next boss is on floor ' + (Math.ceil(f / BOSS_EVERY) * BOSS_EVERY) + '.'}</p>
			${run ? '<p class="bal-muted">This run is kept on this device.</p>' : ''}`;
	}

	// ---- the sortie: the team for one battle
	function teamFigs() { const c = col(), t = H.team.map((id) => c.figs[id]).filter(Boolean); return t.length ? t : list(c).slice(0, TEAM_MAX); }   // (no team picked yet: the strongest six)
	function team(target, focusId) {
		H.target = target;
		const c = col(), all = list(c);
		H.team = H.team.filter((id) => c.figs[id]);
		if (!H.team.length) H.team = all.slice(0, TEAM_MAX).map((f) => f.id);
		const vs = target.kind === 'versus';
		const back = vs ? target.back : target.kind === 'map' ? () => stages(target.id) : target.kind === 'dungeon' ? () => dungeon() : () => home('training');
		const tName = vs ? target.label : target.kind === 'dungeon' && typeof target.run === 'string' ? 'Dungeon · new run from floor ' + target.run.slice(4) : targetName(target);
		const sortie = btn(`${vs ? esc(target.button) : 'Sortie!'} <small>${H.team.length}/${TEAM_MAX}</small>`, { cls: 'bal-orange ph-sortie', off: !H.team.length && 'Pick at least one figurine', go: () => {
			if (vs) { saveTeam(H.team); return target.go(teamFigs().map((f) => f.id)); }
			let t = target;
			if (t.kind === 'dungeon' && typeof t.run === 'string') { const r = newRun(+t.run.slice(4)); saveRun(r); t = { kind: 'dungeon', run: r }; }
			H.target = t; saveTeam(H.team);
			ctx.start({ target: t, team: teamFigs() });
		}, info: () => (vs ? target.info() : targetInfo(target.kind === 'dungeon' && typeof target.run === 'string' ? { kind: 'dungeon', run: { floor: +target.run.slice(4) } } : target)) });
		const toMoves = (fid) => moves(fid, { back: () => team(target, fid) });
		const cards = all.map((f) => { const k = H.team.indexOf(f.id); return figCard(f, { on: k >= 0, badge: k >= 0 ? String(k + 1) : '', info: () => figInfo(f) + '<p class="bal-muted"><span class="bal-key">C</span> its moves</p>', alt: () => toMoves(f.id), go: () => {
			H.team = k >= 0 ? H.team.filter((x) => x !== f.id) : H.team.length < TEAM_MAX ? [...H.team, f.id] : H.team;
			if (k < 0 && H.team.length === TEAM_MAX && !H.team.includes(f.id)) ctx.toast('Six at most: take one out first');
			saveTeam(H.team); team(target, f.id);
		} }); });
		const movesBtn = `<button class="bal-btn bal-purple bal-sm ph-movesbtn" data-moves>✎ Moves <span class="bal-key">C</span></button>`;
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Team</h2>${movesBtn}${sortie}</header>
			<p class="ph-sub"><b>${esc(tName)}</b> · <span class="bal-muted">pick up to six; they deploy in this order</span></p>
			<div class="ph-body"><div class="ph-grid bal-scroll">${cards.join('')}</div><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
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
			btn('<span class="ph-big">🗑 Delete</span>', { cls: 'bal-grey ph-wide', go: () => { saveMaps(loadMaps().filter((x) => x.id !== id)); ctx.toast('Deleted ' + e.map.name); maps(); }, info: () => '<p>Removes it from this device (a shared code still works for friends).</p>' }),
		];
		render(`<div class="ph-screen"><header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">${esc(e.map.name)}</h2></header>
			<div class="ph-body"><nav class="ph-menu">${items.join('')}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`, { back: () => maps(id) });
		H.screen = 'map';
	}
	async function loadCode() {
		const code = await askText({ title: 'The 6-letter map code', maxLength: 6, upper: true, charset: 'code' });
		if (!code) return;
		const r = await ctx.call('ptmap-get', { code: code.trim().toUpperCase() });
		const m = r && cleanMap(r.map);
		if (!m) { ctx.toast((r && r.error) || 'No map with that code'); return; }
		if (saveBlock(m)) { ctx.toast('That map has under 2 PvP bases: it can\'t be played'); return; }
		const id = 'm' + Date.now().toString(36);
		saveMaps([{ id, map: m, at: Date.now(), code: code.trim().toUpperCase() }, ...loadMaps()]);
		ctx.toast(m.name + (r.by ? ' by ' + r.by : '') + ' joined your maps');
		maps(id);
	}

	// ---- Versus: online PvP for 2-4 (server/ptpvp.mjs; the match itself is main.js startOnline)
	const vsRules = (o) => `${o.size} players${o.cpus ? ' (' + o.cpus + ' computer' + (o.cpus > 1 ? 's' : '') + ')' : ''} · ${esc(o.arena === 'custom' ? (o.arenaName || (o.map && o.map.name) || 'a made map') : (arenaById(o.arena) || ARENAS[0]).name)} · ${o.lv ? 'everyone Lv ' + o.lv : 'own levels'}`;
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
		const cap = o.arena === 'custom' && o.map ? maxPlayers(o.map) : 4;
		const players = [2, 3, 4].map((n) => { const i = k++; return btn(n + ' players', { cls: o.size === n ? 'bal-green ph-pick is-on' : 'bal-grey ph-pick', off: n > cap && `This map has ${cap} PvP bases: up to ${cap} players`, go: () => { o.size = n; o.cpus = Math.min(o.cpus, n - 1); re(i)(); }, info: () => (n > cap ? `<p>This map has ${cap} PvP bases: up to ${cap} players.</p>` : '<p>How many sides on the map, you included.</p>') }); }).join('');
		const cpus = Array.from({ length: o.size }, (_, n) => { const i = k++; return pick(n ? n + ' computer' + (n > 1 ? 's' : '') : 'no computers', o.cpus === n, () => { o.cpus = n; re(i)(); }, () => '<p>Seats a computer plays (the enemy AI). The rest wait for friends.</p>'); }).join('');
		const made = loadMaps().filter((e) => !arenaProblems(e.map, 2).length);
		const arenas = ARENAS.map((a) => { const i = k++; return pick(esc(a.name), o.arena === a.id, () => { o.arena = a.id; o.map = null; re(i)(); }, () => `<h3 class="bal-h3">${esc(a.name)}</h3><p>${esc(a.tip)}</p>`); }).join('')
			+ made.map((e) => { const i = k++; return pick('🛠 ' + esc(e.map.name) + ' <small>' + maxPlayers(e.map) + 'p</small>', o.arena === 'custom' && o.mapId === e.id, () => { o.arena = 'custom'; o.map = e.map; o.mapId = e.id; o.size = Math.min(o.size, maxPlayers(e.map)); o.cpus = Math.min(o.cpus, o.size - 1); re(i)(); }, () => `<h3 class="bal-h3">${esc(e.map.name)}</h3><p>Your map (${e.map.rows[0].length}×${e.map.rows.length}, ${e.map.seats.length} PvP bases: up to ${maxPlayers(e.map)} players${e.map.foes.length ? ', ' + e.map.foes.length + ' wild foes that fight every side' : ''}).</p>`); }).join('');
		const lvs = [[PVP_LEVEL, 'everyone Lv ' + PVP_LEVEL], [null, 'own levels']].map(([v, l]) => { const i = k++; return pick(l, o.lv === v, () => { o.lv = v; re(i)(); }, () => (v ? `<p>Every figurine plays at Lv ${v}: a fair match, whatever you have trained.</p>` : '<p>Your figurines at their own levels (the computers play at the players\' average).</p>')); }).join('');
		const next = btn('Pick your team ▶', { cls: 'bal-orange', go: () => team({ kind: 'versus', label: 'Versus · ' + vsRules(o).replace(/<[^>]+>/g, ''), button: 'Make match', back: () => vsSetup(), info: () => '<h3 class="bal-h3">Your team</h3><p>' + vsRules(o) + '</p><p>Up to six; they deploy in this order.</p>',
			go: async (ids) => { ctx.toast('Making the match…'); await ctx.syncFigs(); const r = await ctx.online.create({ size: o.size, cpus: o.cpus, arena: o.arena, ...(o.arena === 'custom' && o.map ? { map: o.map } : {}), lv: o.lv ? o.lv : 'own', team: ids }); if (r.error) { ctx.toast(r.error); return; } lobby(r.lobby); } }) });
		render(`<div class="ph-screen">${vsHead('Make a match')}<div class="ph-body"><div class="ph-menu bal-scroll">${row('Players', players)}${row('Computers', cpus)}${row('Arena', arenas)}${row('Levels', lvs)}<div class="ph-vsrow">${next}</div></div><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`, { focus, back: () => versus() });
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
		const seat = (p) => `<li class="ph-seat"><b>${esc(p.name)}</b>${p.name === lb.host ? ' <span class="bal-badge bal-gold">host</span>' : ''} <span class="bal-badge ${p.ready ? 'bal-green' : 'bal-grey'}">${p.ready ? 'ready' : 'not ready'}</span>${p.away ? ' <span class="bal-muted">(away)</span>' : ''}
			<span class="ph-seat-team">${p.team.map((f) => `<img src="${esc(sprite(f.species))}" alt="${esc(name(f.species))}" title="${esc(name(f.species))} Lv ${f.level}">`).join('')}</span></li>`;
		const open = Math.max(0, humans - lb.players.length);
		render(`<div class="ph-screen">${vsHead('Versus lobby', 'Camp')}
			<p class="ph-sub">Code <b class="ph-code">${esc(lb.code)}</b> · <span class="bal-muted">${vsRules(lb)}</span></p>
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
	function squad(focusId) {
		const all = list(col());
		const cards = all.map((f) => figCard(f, { badge: (H.team.includes(f.id) ? String(H.team.indexOf(f.id) + 1) : '') + (evolvesByLevelNow(f, data) ? '✨' : ''), on: H.team.includes(f.id), info: () => figInfo(f) + '<p class="bal-muted"><span class="bal-key">Z</span> its moves, held item' + (evolvesByLevelNow(f, data) ? ' and evolution' : '') + '</p>', go: () => moves(f.id, { back: () => squad(f.id) }) }));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">Squad</h2><div class="ph-wallet"><span class="bal-badge bal-gold">★ ${Stars.stars()}</span></div></header>
			<div class="ph-body"><div class="ph-grid bal-scroll">${cards.join('') || '<p class="bal-muted">No figurines yet.</p>'}</div><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: focusId ? all.findIndex((f) => f.id === focusId) : 0, back: () => home('squad') });
		H.screen = 'squad';
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
			tools.push(btn(`🎒 <span class="ph-row-name">${f.held ? esc(goodName(f.held)) : 'No held item'}</span>`, { cls: 'bal-blue ph-row ph-tool', go: () => held(id), info: () => `<h3 class="bal-h3">Held item</h3><p>${f.held ? esc(goodName(f.held)) + ': ' + esc(HELD[f.held].text) : 'Nothing. A held item works in every battle.'}</p><p class="bal-muted">Z: change it</p>` }));
			const ev = evoOptions(f, data, (it) => haveGood(c, it));
			if (ev.length) {
				const ready = ev.filter((o) => o.ready);
				keys.push('evolve');
				tools.push(btn(`✨ <span class="ph-row-name">${ready.length ? 'Evolve!' : 'Evolution'}</span>${ready.length ? '<span class="bal-badge bal-purple">ready</span>' : ''}`, { cls: (ready.length ? 'bal-purple' : 'bal-grey') + ' ph-row ph-tool', go: () => evolveScreen(id), info: () => `<h3 class="bal-h3">Evolution</h3>${ev.map((o) => `<p>${esc(name(o.target))}: ${o.ready ? '<b class="bal-t-gold">ready</b>' : esc(evoWhy(o))}</p>`).join('')}` }));
			}
			const candy = haveGood(c, 'rarecandy');
			if (candy && f.level < MAX_LEVEL) {
				keys.push('candy');
				tools.push(btn(`🍬 <span class="ph-row-name">Rare Candy</span><small>×${candy}</small>`, { cls: 'bal-green ph-row ph-tool', go: () => useCandy(id), info: () => `<h3 class="bal-h3">Rare Candy</h3><p>${esc(CANDY.rarecandy.text)} You have ${candy}.</p>` }));
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
		const say = ms.pick ? `Choose the slot for <b>${esc((data.moves[ms.pick] || {}).name || ms.pick)}</b>` : ms.slot != null ? `Choose a move for <b>slot ${ms.slot + 1}</b>` : 'Choose a slot, then the move to put in it';
		const back = H.movesBack || (() => squad(id));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">${esc(name(f.species))} · moves</h2><span class="bal-badge bal-blue">Lv ${f.level}</span></header>
			<p class="ph-sub" id="ph-movesay">${say}${ms.slot != null || ms.pick ? '<span class="ph-keyhint"> · <span class="bal-key">X</span> cancel</span>' : ''}</p>
			<div class="ph-body"><nav class="ph-list bal-scroll"><div class="ph-tools">${tools.join('')}</div><div class="ph-slots">${slots.join('')}</div>
				<h4 class="ph-subh">Learned · ${f.pool.length}</h4>${rows.join('')}
				${soon.length ? `<h4 class="ph-subh">Still to learn</h4>${soon.join('')}` : ''}</nav>
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
	function held(id, focusKey) {
		const c = col(), f = c.figs[id];
		if (!f) return squad();
		const n = goodsCount(c), keys = [], rows = [];
		if (f.held) { keys.push('off'); rows.push(btn(`<span class="ph-row-name">Take off ${esc(goodName(f.held))}</span>`, { cls: 'bal-grey ph-row', go: () => {
			const c2 = col(), g = c2.figs[id], next = { ...g }; delete next.held;
			saveFig(addGood(c2, g.held, tail()), next); ctx.toast(goodName(g.held) + ' back in your bag'); held(id);
		}, info: () => `<h3 class="bal-h3">${esc(goodName(f.held))}</h3><p>${esc(HELD[f.held].text)}</p>` })); }
		for (const [hid, h] of Object.entries(HELD)) {
			if (!n[hid]) continue;
			keys.push(hid);
			rows.push(btn(`<span class="ph-row-name">${esc(h.name)}</span><small>×${n[hid]}</small>`, { cls: 'bal-blue ph-row', go: () => {
				let c2 = col(); const g = c2.figs[id];
				const took = takeGood(c2, hid); if (!took) return held(id);
				c2 = g.held ? addGood(took, g.held, tail()) : took;
				saveFig(c2, { ...g, held: hid }); sfx.coin && sfx.coin(); ctx.toast(name(g.species) + ' holds the ' + h.name); moves(id, { focusKey: 'held' });
			}, info: () => `<h3 class="bal-h3">${esc(h.name)}</h3><p>${esc(h.text)}</p><p class="bal-muted">You have ${n[hid]}. Z: ${esc(name(f.species))} holds it${f.held ? ' (the ' + esc(goodName(f.held)) + ' goes back in your bag)' : ''}</p>` }));
		}
		keys.push('shop');
		rows.push(btn(`🛒 <span class="ph-row-name">Shop for held items</span>`, { cls: 'bal-gold ph-row', go: () => shop(0, { back: () => held(id) }), info: () => '<h3 class="bal-h3">Shop</h3><p>Held items cost stars.</p>' }));
		render(`<div class="ph-screen">
			<header class="ph-head"><button class="bal-btn bal-grey bal-sm ph-backbtn" data-back>‹ Back <span class="bal-key">X</span></button><h2 class="bal-h2">${esc(name(f.species))} · held item</h2><span class="bal-badge bal-blue">${f.held ? esc(goodName(f.held)) : 'nothing'}</span></header>
			<p class="ph-sub bal-muted">One item each. It works in every battle; berries and Focus Sash once a battle.</p>
			<div class="ph-body"><nav class="ph-list bal-scroll">${rows.join('')}${Object.keys(HELD).some((k) => n[k]) ? '' : '<p class="bal-muted">No held items yet: the Shop sells them.</p>'}</nav><aside class="bal-panel ph-side"><div class="ph-detail"></div></aside></div></div>`,
		{ focus: Math.max(0, keys.indexOf(focusKey || (f.held ? 'off' : keys[0]))), back: () => moves(id, { focusKey: 'held' }) });
		H.screen = 'held';
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
		const c = col(), f = c.figs[id], t = c && takeGood(c, 'rarecandy');
		if (!f || !t || f.level >= MAX_LEVEL) return moves(id);
		const g = gainExp(f, expForLevel(f.level + 1) - f.exp, data);
		saveFig(t, g.fig); sfx.coin && sfx.coin();
		ctx.toast(name(f.species) + ' grew to Lv ' + g.fig.level + (g.newMoves.length ? ' and learned ' + g.newMoves.map((m) => (data.moves[m] || {}).name || m).join(', ') : '') + (evolvesByLevelNow(g.fig, data) && !evolvesByLevelNow(f, data) ? ' · it can evolve!' : ''));
		moves(id, { focusKey: haveGood(t, 'rarecandy') ? 'candy' : 'held' });
	}

	/** The shop: stars for goods (tabs: held items, evolution items, candy, figurines). opt.back: where X goes. */
	const SHOP_TABS = ['Held items', 'Evolution', 'Candy', 'Figurines'];
	function shop(tab = H.shopTab || 0, opt = {}) {
		if (opt.back) H.shopBack = opt.back;
		H.shopTab = tab;
		const c = col(), n = goodsCount(c), wallet = Stars.stars();
		const tabs = SHOP_TABS.map((t, i) => btn(esc(t), { cls: 'bal-tab' + (i === tab ? ' is-on' : ''), go: () => shop(i) })).join('');
		const buyGood = (gid) => {
			const price = goodStars(gid);
			if (!Stars.spend(price)) { sfx.error(); ctx.toast('Not enough stars: ' + price + ' ★ needed'); return; }
			ctx.saveCol(addGood(col(), gid, tail())); ctx.starsSpent && ctx.starsSpent();
			sfx.coin && sfx.coin(); ctx.toast('Bought: ' + goodName(gid) + ' · ★ ' + Stars.stars() + ' left');
			const f = H.focus; shop(tab); setFocus(Math.min(f, H.acts.length - 1), true);
		};
		const row = (gid, g, extra = '') => btn(`<span class="ph-row-name">${esc(g.name)}</span>${n[gid] ? '<small>own ' + n[gid] + '</small>' : ''}<span class="bal-badge bal-gold">${g.stars} ★</span>`, { cls: 'bal-blue ph-row', off: g.stars > wallet && 'Not enough stars: ' + g.stars + ' ★ needed', go: () => buyGood(gid), info: () => `<h3 class="bal-h3">${esc(g.name)}</h3><p>${esc(g.text || extra)}</p><p class="ph-pill-row"><span class="bal-badge bal-gold">${g.stars} ★</span>${n[gid] ? '<span class="bal-badge bal-grey">you own ' + n[gid] + '</span>' : ''}</p>` });
		let body = '';
		if (tab === 0) body = Object.entries(HELD).map(([gid, g]) => row(gid, g)).join('');
		else if (tab === 1) body = Object.entries(EVO).map(([gid, g]) => row(gid, g, 'Evolves some Pokémon (Squad → a figurine → Evolution says which). Used up when it does.')).join('');
		else if (tab === 2) body = Object.entries(CANDY).map(([gid, g]) => row(gid, g)).join('');
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
		['Items & evolution', `<p>Each figurine can <b>hold one item</b> (Squad → a figurine → 🎒). Type boosters, Leftovers, Choice items, Focus Sash, berries… They work in every battle; berries and the Sash once a battle.</p><p>A figurine <b>evolves</b> at its species' real level (✨ in Squad). Friendship evolutions open at Lv 20; stone and trade evolutions need their item. Evolving is never forced: "Not now" keeps it as it is.</p><p>The <b>Shop</b> sells held items, evolution items, Rare Candy and starter figurines for stars.</p>`],
		['Terrain', `<p>What a tile is made of matters. <b>Water</b> and <b>ice</b> take 2 Move a tile, unless the figurine is a Water (Ice) or Flying type. <b>Lava</b> burns a figurine standing on it at the end of its side's phase (1/8 of its HP), unless it is Fire or Flying. <b>Tall grass</b> hides: attacks at a figurine in it are 20% less likely to hit.</p><p>Each favours its own type: Water moves from water, Ice from ice, Fire from lava and Grass from tall grass do 20% more. The forecast and the unit panel say when it counts.</p>`],
		['Versus', `<p><b>Versus</b> (signed in) plays friends online: two to four sides on one arena, and the host can make empty seats computers. Make a match and share its 5-letter code, or join one with a code; everyone picks a team, the host presses Start.</p><p>The seats take turns in a random order: in yours, deploy from <b>your base</b> (the pale tile; the others' are orange), move, queue attacks and Execute, then End turn. A seat that takes too long has its turn ended; a player who leaves is out. The last side standing wins (after 30 rounds: the most HP left). "Everyone Lv 50" makes it fair; no stars or EXP change hands.</p>`],
		['Bonus Gauge', `<p>KOs, combos and Geo chains fill the <b>Bonus Gauge</b>. Each level adds a reward you take home if you win: EXP, stars, items for the overworld, card packs.</p>`],
	];
	function help(tab = H.helpTab, onClose) {
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
		H, home, stages, dungeon, team, squad, moves, held, evolveScreen, shop, starters, help, onAction, maps, teamFigs, versusOn, vsSetupFor,
		get active() { return !root.hidden; },
		close() { root.hidden = true; root.innerHTML = ''; H.screen = null; },
		labels: () => navEls().map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
		focusLabel: () => { const el = root.querySelector('.is-focus'); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; },
		versus,
		/** After a battle: the team screen for the next map / floor, so one Z plays on. */
		next(target) { if (target) H.target = target; },
		continueTarget,
	};
}

function loadTeam() { try { const t = JSON.parse(localStorage.getItem(TEAM_KEY) || '[]'); return Array.isArray(t) ? t.filter((x) => typeof x === 'string').slice(0, TEAM_MAX) : []; } catch { return []; } }
function saveTeam(t) { try { localStorage.setItem(TEAM_KEY, JSON.stringify(t.slice(0, TEAM_MAX))); } catch { /* private mode: the team just isn't remembered */ } }
