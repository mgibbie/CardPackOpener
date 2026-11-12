// runui.js — MicaSurvivor 3D, the shipping path (Plans/MICASURVIVOR_3D_PLAN.md §5.31): a run's own screen, in Micatro's
// look (runui.css). It replaces the test room's readout while a run is on the page: who you are with HP and XP, the
// run's line as chips, what the run says as a banner, a boss's bar, the bag and the four moves, and the run's end.
//
// It only DRAWS: the page hands it a plain view of the run a few times a second (main.js runView) and it changes the
// elements whose text or width changed. Nothing here reads the fight or the run.
//
//   view: { name, level, hp, maxHp, shield, xp, xpNext, time (s), kos, parts: [the run's line, in pieces], note,
//           boss: { name, hp, maxHp, enraged } | null, moves: [{ name, lv, col }], bag: [{ text, kind }],
//           over: null | { won, title, line, rows: [[label, value]], again: url | null, leave: url } }

export const mmss = (t) => `${Math.floor(t / 60)}:${String(Math.floor(t % 60)).padStart(2, '0')}`;
/** 'flame-wheel' -> 'Flame Wheel'. */
export const pretty = (id) => String(id || '').split(/[-_ ]/).map((w) => (w ? w[0].toUpperCase() + w.slice(1) : '')).join(' ');
/** A big number, short: 1234 -> 1,234; 1120000019 -> 1.12B. */
export const short = (n) => { n = Math.ceil(n); return n >= 1e9 ? (n / 1e9).toFixed(2) + 'B' : n >= 1e7 ? (n / 1e6).toFixed(1) + 'M' : n.toLocaleString('en-US'); };
/** What kind of chip a piece of the run's line is. */
export const chipKind = (text, i) => (i === 0 ? 'on' : /^₽/.test(text) ? 'money' : /SWARM!|GUARDIAN|LEGENDARY|MEWTWO|BOSS IN|EXHAUSTED|NIGHT|SIEGE/.test(text) ? 'warn' : '');
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/** Put the run's screen on the page. -> { update(view), root } */
export function mountRunUi(doc, o = {}) {
	doc.body.classList.add('rx'); if (o.debug) doc.body.classList.add('rx-debug');
	const root = doc.createElement('div'); root.id = 'rx';
	root.innerHTML = `<div class="rx-left"><div class="rx-panel rx-me"><div class="rx-who"><span class="rx-name" id="rx-name"></span><span class="rx-lv" id="rx-lv"></span></div>`
		+ `<div class="rx-bar hp"><i id="rx-hp"></i><i class="shield" id="rx-shield"></i><span id="rx-hpt"></span></div><div class="rx-bar xp"><i id="rx-xp"></i></div>`
		+ `<div class="rx-sub"><span id="rx-time"></span><span id="rx-kos"></span></div></div><div class="rx-chips" id="rx-parts"></div></div>`
		+ `<div class="rx-note" id="rx-note"></div>`
		+ `<div class="rx-panel rx-boss" id="rx-boss"><div class="rx-who"><span class="rx-name" id="rx-bname"></span></div><div class="rx-bar"><i id="rx-bhp"></i><span id="rx-bhpt"></span></div></div>`
		+ `<div class="rx-bottom"><div class="rx-chips rx-bag" id="rx-bag"></div><div class="rx-moves" id="rx-moves"></div></div>`
		+ `<div class="rx-end" id="rx-end"></div>`;
	doc.body.appendChild(root);
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
		if (v.over && !last.over) {
			last.over = true; const r = v.over;
			$('rx-end').innerHTML = `<div class="rx-panel"><h1 class="${r.won ? 'won' : 'lost'}">${esc(r.title)}</h1><p>${esc(r.line || '')}</p>`
				+ (r.rows && r.rows.length ? `<div class="rx-rows">${r.rows.map(([a, b]) => `<span>${esc(a)}</span><span>${esc(b)}</span>`).join('')}</div>` : '')
				+ `<div class="rx-btns">${r.again ? `<a class="rx-btn blue" id="rx-again" href="${esc(r.again)}">Play again</a>` : ''}<a class="rx-btn red" id="rx-leave" href="${esc(r.leave || '../')}">Leave</a></div></div>`;
			$('rx-end').classList.add('show');
		}
	}
	return { update, root };
}
