// m3d/fxlab.js — MicaSurvivor 3D: the effects gallery (Plans/MICASURVIVOR_TYPES_VFX_PLAN.md, part B). Every move's effect
// in turn, so the owner can look the attacks over without playing for them:
//   /micasurvivor/m3d/?gen=5&fight=1&fxlab=1        (&from=<move id> starts there; &secs=<n> the time each one has)
// A fight with nobody arriving: you cannot be hurt, and three still targets stand in front of you. Each move in the
// game (the base ones, then Expedition's) is given to you alone, at level 3, for a few seconds; then the next. After
// the moves: a hit of every type, a KO, and (if the page has them) an enemy's warning and its blast.
// N: next · B: back · H (the hit-feel switch) still works. It only DRAWS what the fight already does: no rule is changed.

/** o: { world, data, addEnemy, state, fx, doc, secs, from } -> the lab: { list, i, go(i), next(), back(), now() } */
export function startLab(o) {
	const { world: w, data: d, state: s, fx } = o, doc = o.doc || document, SECS = Math.max(1, +o.secs || 3.2);
	const ids = [...Object.keys(d.moveDefs()), ...d.expMoves()].filter((id, i, a) => a.indexOf(id) === i).filter((id) => {
		const m = d.moveDef(id); return m && m.kind !== 'buff' && m.kind !== 'weather';   // (no picture of their own: a buff, the weather)
	});
	const list = ids.map((id) => ({ kind: 'move', id })).concat([{ kind: 'types' }, { kind: 'ko' }, { kind: 'enemy' }]);
	const lab = { list, i: -1, at: 0, shown: 0 };
	w.cast = []; w.bosses = null; w.wxAuto = false;   // (nobody arrives, no boss, no weather by itself: only what the lab puts there)
	// the board over the screen: which one, of how many, and the keys
	const el = doc.createElement('div'); el.id = 'fxlab';
	el.style.cssText = 'position:fixed;left:50%;top:12px;transform:translateX(-50%);z-index:30;padding:8px 16px;border-radius:10px;background:rgba(10,14,24,.82);color:#f2ede2;font:600 15px ui-sans-serif,system-ui,sans-serif;text-align:center;pointer-events:none;max-width:92vw';
	doc.body.appendChild(el);
	for (const id of ['help', 'hud']) { const h = doc.getElementById(id); if (h) h.style.display = 'none'; }   // (the help text and the debug numbers: out of the way of the attacks)
	const targets = () => {   // three still targets 5 m in front (Bug: no move type does nothing to it), as tough as they need to be
		w.enemies.length = 0;
		for (const [dx, dz] of [[5, 0], [6, 2.2], [6, -2.2]]) { const e = o.addEnemy(w, 10, s.x + dx, s.z + dz, { dummy: true }); e.types = ['bug']; e.hp = e.maxHp = 1e12; }
	};
	const title = (id) => { const m = d.moveDef(id), en = o.pretty ? o.pretty(id) : id; return `${en} <span style="opacity:.7">· ${m.type} · ${m.kind}</span>`; };
	lab.go = (i) => {
		lab.i = (i + list.length) % list.length; lab.at = performance.now(); lab.shown++;
		const it = list[lab.i];
		w.pl.hp = w.pl.maxHp = 1e9; w.pl.invuln = 1e9; w.pl.moves = []; w.fields.length = 0; w.shots.length = 0; w.orbs.length = 0; w.effects.length = 0;
		targets();
		if (it.kind === 'move') { const m = d.move(it.id, 3); m.t = 0; w.pl.moves = [m]; }
		el.innerHTML = `FX lab · ${lab.i + 1} / ${list.length} · ${it.kind === 'move' ? title(it.id) : it.kind === 'types' ? 'a hit of every type' : it.kind === 'ko' ? 'knock-outs' : "an enemy's warning and blast"}<div style="font-weight:400;font-size:12px;opacity:.75">N next · B back</div>`;
		lab.fired = 0;
	};
	lab.next = () => lab.go(lab.i + 1);
	lab.back = () => lab.go(lab.i - 1);
	lab.now = () => list[lab.i];
	/** Every frame (from the page's loop): the extras are drawn here, and the next one comes when the time is up. */
	lab.tick = () => {
		const it = list[lab.i], age = (performance.now() - lab.at) / 1000;
		w.pl.hp = w.pl.maxHp;
		if (fx && it.kind === 'types' && age > lab.fired * 0.35 && lab.fired < 18) {
			const T = ['normal', 'fire', 'water', 'grass', 'electric', 'ice', 'fighting', 'poison', 'ground', 'flying', 'psychic', 'bug', 'rock', 'ghost', 'dragon', 'dark', 'steel', 'fairy'][lab.fired++], a = lab.fired * 0.35;
			fx.impact(s.x + 4 + Math.cos(a) * 1.5, s.y + 1, s.z + Math.sin(a) * 2.5, T, true);
		} else if (fx && it.kind === 'ko' && age > lab.fired * 0.7 && lab.fired < 4) { lab.fired++; fx.ko(s.x + 5, s.y + 0.8, s.z + (lab.fired - 2.5) * 1.6, ['fire', 'water', 'grass', 'electric'][lab.fired - 1], lab.fired === 4); }
		else if (fx && it.kind === 'enemy' && fx.warn && age > lab.fired * 1.4 && lab.fired < 2) {
			const z = { x: s.x + 5, y: s.y, z: s.z, r: 2.4 }, lane = { x: s.x + 2, y: s.y, z: s.z + 3, angle: 0, len: 7, w: 1.2 }, which = lab.fired++ ? lane : z;
			fx.warn(which, 'fire', 1); setTimeout(() => { if (list[lab.i] === it) fx.boom(which, 'fire'); }, 1000);
		}
		if (age > SECS) lab.next();
	};
	addEventListener('keydown', (e) => { if (e.repeat) return; if (e.code === 'KeyN') lab.next(); else if (e.code === 'KeyB') lab.back(); });
	const from = o.from ? list.findIndex((q) => q.id === o.from) : -1;
	lab.go(from >= 0 ? from : 0);
	return lab;
}
