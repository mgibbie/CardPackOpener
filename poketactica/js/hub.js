// hub.js — the camp: every screen outside a battle, laid out the way Disgaea's castle is (owner, 2026-11-21: "look at the
// menu system of Disgaea as inspiration, still Balatro UI"), on the Balatro kit:
//   home       the castle: Continue (the next battle, at once), Story, Dungeon, Training, Squad, How to play; the wallet
//   stages     the Dimensional Gate: a chapter's maps (Q / E or the tabs change chapter), the focused map's details
//   dungeon    the Item World: continue the run, or a new run from floor 1 or a checkpoint
//   team       the sortie: pick up to six figurines (the order they deploy in), then Sortie!
//   squad      the roster: each figurine's status; Z opens its moves
//   moves      one figurine's four move SLOTS, filled from every move it has learned (also from the team screen: C, and
//              from the results: a new move)
//   starters   a new player's three starters
//   help       How to play, by topic
// Every screen is a page of buttons: the arrows move the focus the way they point on screen (nav.js), Z presses, X goes
// back, Q / E change tabs; a tap or a click presses. The focused button's details show in the side panel.
import { spatialNext } from './nav.js';
import { MAPS, CHAPTERS, mapById, isOpen, nextMap } from './campaign.js';
import { startFloors, loadRun, saveRun, newRun, floorLevel, floorStars, isBossFloor, BOSS_EVERY } from './dungeon.js';
import { STARTERS, STARTER_PICK, list } from './figcol.js';
import { battleStats, expForLevel, equip, movesToCome, MAX_LEVEL } from './figurine.js';
import { sfx } from '/site/ui/sfx.js';
import * as Stars from '/site/stars.js';

export const TEAM_KEY = 'magepunk_poketactica_team_v1';   // (this device's last team: a convenience, never synced)
export const DUNGEON_OPENS = 'c1-5';
export const TEAM_MAX = 6;
const TYPE_HEX = { Normal: '#a8a77a', Fire: '#ee8130', Water: '#6390f0', Electric: '#f7d02c', Grass: '#7ac74c', Ice: '#96d9d6', Fighting: '#c22e28', Poison: '#a33ea1', Ground: '#e2bf65', Flying: '#a98ff3', Psychic: '#f95587', Bug: '#a6b91a', Rock: '#b6a136', Ghost: '#735797', Dragon: '#6f35fc', Dark: '#705746', Steel: '#b7b7ce', Fairy: '#d685ad' };
const prettyId = (id) => String(id).replace(/[-_]/g, ' ').replace(/\b\w/g, (c) => c.toUpperCase());
const esc = (s) => String(s ?? '').replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
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
		const i = acts.length; acts.push({ go: go || (() => {}), info, off: !!off, alt });
		return `<button class="ph-card${on ? ' is-on' : ''}${off ? ' is-disabled' : ''}" data-nav="${i}" aria-disabled="${off ? 'true' : 'false'}">
			${badge ? `<span class="ph-badge">${badge}</span>` : ''}<img src="${esc(sprite(f.species))}" alt="" loading="lazy" draggable="false">
			<span class="ph-card-name">${esc(name(f.species))}${f.shiny ? ' ★' : ''}</span>
			${f.level != null ? `<span class="ph-card-lv">Lv ${f.level}</span>` : `<span class="ph-types">${types(f.species)}</span>`}</button>`;
	};
	function render(html, { focus = 0, back = null, tabs = null } = {}) {
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
		add('squad', btn(`<span class="ph-big">🛡 Squad</span><small>${figs.length} figurine${figs.length === 1 ? '' : 's'}</small>`, { cls: 'bal-purple ph-wide', go: () => squad(), info: () => `<h3 class="bal-h3">Squad</h3><p>Your figurines: their stats, and their four move slots, filled from every move each has learned.</p>` }));
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
		const back = target.kind === 'map' ? () => stages(target.id) : target.kind === 'dungeon' ? () => dungeon() : () => home('training');
		const tName = target.kind === 'dungeon' && typeof target.run === 'string' ? 'Dungeon · new run from floor ' + target.run.slice(4) : targetName(target);
		const sortie = btn(`Sortie! <small>${H.team.length}/${TEAM_MAX}</small>`, { cls: 'bal-orange ph-sortie', off: !H.team.length && 'Pick at least one figurine', go: () => {
			let t = target;
			if (t.kind === 'dungeon' && typeof t.run === 'string') { const r = newRun(+t.run.slice(4)); saveRun(r); t = { kind: 'dungeon', run: r }; }
			H.target = t; saveTeam(H.team);
			ctx.start({ target: t, team: teamFigs() });
		}, info: () => targetInfo(target.kind === 'dungeon' && typeof target.run === 'string' ? { kind: 'dungeon', run: { floor: +target.run.slice(4) } } : target) });
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

	// ---- the roster
	function squad(focusId) {
		const all = list(col());
		const cards = all.map((f) => figCard(f, { badge: H.team.includes(f.id) ? String(H.team.indexOf(f.id) + 1) : '', on: H.team.includes(f.id), info: () => figInfo(f) + '<p class="bal-muted"><span class="bal-key">Z</span> its moves</p>', go: () => moves(f.id, { back: () => squad(f.id) }) }));
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
		return `<div class="ph-fig"><img src="${esc(sprite(f.species))}" alt="" draggable="false"><div><h3 class="bal-h3">${esc(name(f.species))}${f.shiny ? ' ★' : ''}</h3><div>Lv ${f.level} ${types(f.species)}</div><div class="bal-muted">Ability: ${ab}</div>${abNote ? `<div class="bal-muted ph-note">${esc(abNote)}</div>` : ''}</div></div>
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
			<div class="ph-body"><nav class="ph-list bal-scroll"><div class="ph-slots">${slots.join('')}</div>
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
		['Turns', `<p>Choose the <b>base tile</b> (the pale square) to deploy a figurine, up to six on the map.</p><p>Each figurine can <b>Move</b> once and act once: <b>Attack</b>, <b>Throw</b> or <b>Wait</b>. A move can be undone until it acts.</p><p>Attacks wait in a queue: <b>Execute</b> runs them in order. Hits in one Execute <b>combo</b> (+10% each). Allies next to the attacker may join in a <b>team attack</b>.</p><p><b>End turn</b> (the field menu) runs the queue and hands over to the enemy.</p><p>While you aim, the box shows each target's <b>hit chance</b>, its <b>damage</b> and whether it would be knocked out. The cursor (or a tap) on a foe shows where it can go and strike; the <b>👁</b> button (or Enemy range in the field menu) shows every foe's reach.</p><p>Changed your mind? A unit's <b>Cancel attack</b> gives its PP and SP back. The <b>Execute list</b> (the field menu) puts the queue in another order.</p><p>A battle is saved as you play: if you leave, <b>Resume</b> in the camp puts it back.</p>`],
		['Height & facing', `<p>Attacking from higher ground hits harder (+10% a level, up to +50%); from below, weaker.</p><p>Hitting a foe from the side or the back is more accurate. Jump decides how high a figurine can climb.</p>`],
		['Geo panels', `<p>Coloured tiles are <b>Geo panels</b>. A <b>Geo symbol</b> (the pyramid) gives every panel of its colour an effect: more attack, less defence, invincible, heal…</p><p>Destroy a symbol to repaint its colour: panels in a chain burst, hurting whoever stands on them and filling the <b>Bonus Gauge</b>.</p>`],
		['Throw & catch', `<p>Strong figurines can <b>Throw</b>: lift the one next to it (friend, foe or a Geo symbol) and throw it a few tiles.</p><p>Throw a weakened <b>wild</b> Pokémon onto your <b>base tile</b> to try to catch it: it joins your collection as a figurine.</p>`],
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
		H, home, stages, dungeon, team, squad, moves, starters, help, onAction,
		get active() { return !root.hidden; },
		close() { root.hidden = true; root.innerHTML = ''; H.screen = null; },
		labels: () => navEls().map((e) => e.textContent.replace(/\s+/g, ' ').trim()),
		focusLabel: () => { const el = root.querySelector('.is-focus'); return el ? el.textContent.replace(/\s+/g, ' ').trim() : null; },
		/** After a battle: the team screen for the next map / floor, so one Z plays on. */
		next(target) { if (target) H.target = target; },
		continueTarget,
	};
}

function loadTeam() { try { const t = JSON.parse(localStorage.getItem(TEAM_KEY) || '[]'); return Array.isArray(t) ? t.filter((x) => typeof x === 'string').slice(0, TEAM_MAX) : []; } catch { return []; } }
function saveTeam(t) { try { localStorage.setItem(TEAM_KEY, JSON.stringify(t.slice(0, TEAM_MAX))); } catch { /* private mode: the team just isn't remembered */ } }
