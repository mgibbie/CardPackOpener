// runui.js — MicaSurvivor 3D, the shipping path (Plans/MICASURVIVOR_3D_PLAN.md §5.31): a run's own screen, in Micatro's
// look (runui.css). It replaces the test room's readout while a run is on the page: who you are with HP and XP, the
// run's line as chips, what the run says as a banner, a boss's bar, the bag and the four moves, and the run's end.
//
// It only DRAWS: the page hands it a plain view of the run a few times a second (main.js runView) and it changes the
// elements whose text or width changed. Nothing here reads the fight or the run.
//
//   view: { name, level, hp, maxHp, shield, xp, xpNext, time (s), kos, parts: [the run's line, in pieces], note,
//           boss: { name, hp, maxHp, enraged } | null, moves: [{ name, lv, col }], bag: [{ text, kind }],
//           board: null | { title, tabs: [{ id, text, on }], rows: [{ rank, name, who, score, time, me }], note } (the 3D boards),
//           menu: null | { title, line, restart: url | null, leave: url, boards: bool, sound: 'on' | 'off' | null } (the pause menu),
//           over: null | { won, title, line, rows: [[label, value]], kept: { ok, text } | null (what the save did),
//                          again: url | null, leave: url } }

export const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
/** 'flame-wheel' -> 'Flame Wheel'. */
export const pretty = (id) => String(id || '').split(/[-_ ]/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : '')).join(' ');
/** A big number, short: 1234 -> 1,234; 1120000019 -> 1.12B. */
export const short = (n) => { n = Math.ceil(n); return n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e7 ? (n / 1e6).toFixed(1) + 'M' : n.toLocaleString('en-US'); };
/** What kind of chip a piece of the run's line is. */
export const chipKind = (text, i) => (i === 0 ? 'on' : /^₽/.test(text) ? 'money' : /SWARM!|GUARDIAN|LEGENDARY|MEWTWO|BOSS IN|EXHAUSTED|NIGHT|SIEGE/.test(text) ? 'warn' : '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Put the run's screen on the page. o.onMenu(): the menu's button was pressed; o.onResume(): its "Resume";
 *  o.onBoard(id | null): a board was asked for ('score' | 'time' | 'survival'), or closed; o.onMute(): "Sound" was pressed.
 *  -> { update(view), root } */
export function mountRunUi(doc, o = {}) {
	doc.body.classList.add('rx'); if (o.debug) doc.body.classList.add('rx-debug');
	const root = doc.createElement('div'); root.id = 'rx';
	root.innerHTML = `<div class="rx-left"><div class="rx-panel rx-me"><div class="rx-who"><span class="rx-name" id="rx-name"></span><span class="rx-lv" id="rx-lv"></span></div>`
		+ `<div class="rx-bar hp"><i id="rx-hp"></i><i class="shield" id="rx-shield"></i><span id="rx-hpt"></span></div><div class="rx-bar xp"><i id="rx-xp"></i></div>`
		+ `<div class="rx-sub"><span id="rx-time"></span><span id="rx-kos"></span></div></div><div class="rx-chips" id="rx-parts"></div></div>`
		+ `<div class="rx-note" id="rx-note"></div>`
		+ `<div class="rx-panel rx-boss" id="rx-boss"><div class="rx-who"><span class="rx-name" id="rx-bname"></span></div><div class="rx-bar"><i id="rx-bhp"></i><span id="rx-bhpt"></span></div></div>`
		+ `<div class="rx-bottom"><div class="rx-chips rx-bag" id="rx-bag"></div><div class="rx-moves" id="rx-moves"></div></div>`
		+ `<button class="rx-menu-btn" id="rx-menu-btn" aria-label="Menu">II</button>`
		+ `<div class="rx-end" id="rx-menu"></div><div class="rx-end" id="rx-end"></div><div class="rx-end" id="rx-board"></div>`;
	doc.body.appendChild(root);
	root.addEventListener('click', (e) => { const b = e.target.closest('#rx-menu-btn, #rx-resume, #rx-mute, [data-board]'); if (!b) return; e.preventDefault(); b.blur(); if (b.id === 'rx-mute') { if (o.onMute) o.onMute(); } else if (b.dataset.board !== undefined) { if (o.onBoard) o.onBoard(b.dataset.board || null); } else if (b.id === 'rx-resume') { if (o.onResume) o.onResume(); } else if (o.onMenu) o.onMenu(); });
	const $ = (id) => doc.getElementById(id), last = {};
	const text = (id, v) => { if (last[id] !== v) { last[id] = v; $(id).textContent = v; } };
	const html = (id, v) => { if (last[id] !== v) { last[id] = v; $(id).innerHTML = v; } };
	const width = (id, k) => { const v = (Math.max(0, Math.min(1, k || 0)) * 100).toFixed(1) + '%'; if (last[id + 'w'] !== v) { last[id + 'w'] = v; $(id).style.width = v; } };
	const cls = (id, name, on) => { if (last[id + name] !== !!on) { last[id + name] = !!on; $(id).classList.toggle(name, !!on); } };
	function update(v) {
		text('rx-name', v.name || ''); text('rx-lv', 'Lv ' + (v.level | 0));
		width('rx-hp', v.maxHp ? v.hp / v.maxHp : 0); width('rx-shield', v.maxHp ? (v.shield || 0) / v.maxHp : 0);
		text('rx-hpt', `${short(Math.max(0, v.hp))} / ${short(v.maxHp)}`);
		width('rx-xp', v.xpNext ? v.xp / v.xpNext : 0);
		text('rx-time', mmss(v.time || 0)); text('rx-kos', v.kos == null ? '' : `${short(v.kos)} KOs`);
		html('rx-parts', (v.parts || []).map((p, i) => `<span class="rx-chip ${chipKind(p, i)}">${esc(p)}</span>`).join(''));
		text('rx-note', v.note || ''); cls('rx-note', 'show', !!v.note);
		cls('rx-boss', 'show', !!v.boss);
		if (v.boss) { text('rx-bname', v.boss.name + (v.boss.enraged ? ' · ENRAGED' : '')); width('rx-bhp', v.boss.hp / v.boss.maxHp); text('rx-bhpt', `${short(Math.max(0, v.boss.hp))} / ${short(v.boss.maxHp)}`); }
		const mv = (v.moves || []).slice(0, 4); while (v.moves && mv.length < 4) mv.push(null);
		html('rx-moves', mv.map((m) => (m ? `<div class="rx-move" style="border-top-color:${esc(m.col || '#5f7377')}"><b>${esc(m.name)}</b><i>Lv ${m.lv | 0}</i></div>` : '<div class="rx-move empty"><b>—</b><i>&nbsp;</i></div>')).join(''));
		html('rx-bag', (v.bag || []).map((b) => `<span class="rx-chip ${b.kind || 'dim'}">${esc(b.text)}</span>`).join(''));
		const bk = v.board ? JSON.stringify(v.board) : '';
		if (last.board !== bk) {
			last.board = bk; const b = v.board;
			$('rx-board').innerHTML = !b ? '' : `<div class="rx-panel wide"><h1>${esc(b.title)}</h1><div class="rx-btns">${b.tabs.map((t) => `<button class="rx-btn small ${t.on ? 'red' : ''}" data-board="${esc(t.id)}">${esc(t.text)}</button>`).join('')}</div>`
				+ (b.rows.length ? `<div class="rx-board">${b.rows.map((r) => `<div class="rx-brow ${r.me ? 'me' : ''}"><span>#${r.rank}</span><span>${esc(r.name)}</span><span>${esc(r.who)}</span><span>${esc(r.time)}</span><span>${esc(r.score)}</span></div>`).join('')}</div>` : '')
				+ `<p id="rx-board-note">${esc(b.note || '')}</p><div class="rx-btns"><button class="rx-btn blue" id="rx-board-close" data-board="">Close</button></div></div>`;
			$('rx-board').classList.toggle('show', !!b);
		}
		const mk = v.menu && !v.over ? JSON.stringify(v.menu) : '';
		if (last.menu !== mk) {
			last.menu = mk; const m = mk ? v.menu : null;
			$('rx-menu').innerHTML = !m ? '' : `<div class="rx-panel"><h1>${esc(m.title)}</h1><p>${esc(m.line || '')}</p><div class="rx-btns col"><button class="rx-btn blue" id="rx-resume">Resume</button>`
				+ `${m.boards ? '<button class="rx-btn" id="rx-boards" data-board="open">3D boards</button>' : ''}${m.sound ? `<button class="rx-btn" id="rx-mute">Sound: ${esc(m.sound)}</button>` : ''}${m.restart ? `<a class="rx-btn orange" id="rx-restart" href="${esc(m.restart)}">Restart the run</a>` : ''}<a class="rx-btn red" id="rx-quit" href="${esc(m.leave || '../')}">Leave</a></div></div>`;
			$('rx-menu').classList.toggle('show', !!m);
		}
		cls('rx-menu-btn', 'hide', !!v.over);
		const ok = v.over ? JSON.stringify(v.over) : '';
		if (v.over && last.over !== ok) {   // (it is drawn again when it changes: the save's line comes a moment later)
			last.over = ok; const r = v.over;
			$('rx-end').innerHTML = `<div class="rx-panel"><h1 class="${r.won ? 'won' : 'lost'}">${esc(r.title)}</h1><p>${esc(r.line || '')}</p>`
				+ (r.kept ? `<p class="rx-kept ${r.kept.ok ? 'ok' : ''}" id="rx-kept">${esc(r.kept.text)}</p>` : '')
				+ (r.rows && r.rows.length ? `<div class="rx-rows">${r.rows.map(([a, b]) => `<span>${esc(a)}</span><span>${esc(b)}</span>`).join('')}</div>` : '')
				+ `<div class="rx-btns">${r.again ? `<a class="rx-btn blue" id="rx-again" href="${esc(r.again)}">Play again</a>` : ''}${r.boards ? '<button class="rx-btn" id="rx-boards" data-board="open">3D boards</button>' : ''}<a class="rx-btn red" id="rx-leave" href="${esc(r.leave || '../')}">Leave</a></div></div>`;
			$('rx-end').classList.add('show');
		}
	}
	return { update, root };
}
