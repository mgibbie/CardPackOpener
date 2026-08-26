// battleui.js — the battle scene's presentation layer, ported from the
// Love2D battle UI (pokemon_ui.lua + battle_anim.lua): dark rounded panels,
// type-colored move buttons, status/stat badges, HP+XP bars, team dots,
// sprite platforms with a type glow, and the m6x11plus pixel font.
// Draws at FULL canvas resolution (the overworld's 3x screen), not the
// 240x160 pixel frame, so text is crisp and buttons are finger-sized.

export const TYPE_COLORS = {
	Normal: '#a8a090', Fire: '#f08030', Water: '#6890f0', Electric: '#f8d030',
	Grass: '#78c850', Ice: '#98d8d8', Fighting: '#c03028', Poison: '#a040a0',
	Ground: '#e0c068', Flying: '#a890f0', Psychic: '#f85888', Bug: '#a8b820',
	Rock: '#b8a038', Ghost: '#705898', Dragon: '#7038f8', Dark: '#705848',
	Steel: '#b8b8d0', Fairy: '#ee99ac',
};

export const C = {
	text: '#d9e6f2', dim: 'rgba(217,230,242,0.62)', faint: 'rgba(217,230,242,0.4)',
	accent: '#4db3f2', panel: 'rgba(20,26,36,0.92)', panelBorder: '#4d80b3',
	btn: '#1f2938', btnHover: '#2e3d52',
	hpGreen: '#4dcc66', hpYellow: '#e6cc33', hpRed: '#e64d4d', barBg: '#262e38',
	xp: '#4d80e6',
	statUp: '#4dd980', statDown: '#f25959',
};

export const STATUS_BADGE = {
	par: '#f2d933', brn: '#f26633', psn: '#b34dcc', slp: '#9999b3', frz: '#66ccf2',
};

// Scene geometry, shared by battle.js and pvp.js. Landscape keeps the GBA
// 3:2 layout (unit = height/480, 118u bottom bar) byte-for-byte. On portrait
// phones main.js frees the canvas from the 3:2 frame and lets it fill the
// screen; there the unit comes from the WIDTH (the constraining axis) and the
// bottom bar becomes a tall thumb deck — 512 units across means a 390px-wide
// phone gets ~0.76 CSS px per unit, so a 58u button clears the 44px minimum.
export function layout(W, H) {
	const portrait = H > W;
	const u = portrait ? W / 512 : H / 480;
	const barH = portrait ? 270 * u : 118 * u;
	return { portrait, u, barH, barY: H - barH };
}

export function rr(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.roundRect(x, y, w, h, r);
}

export function panel(ctx, x, y, w, h, r = 8) {
	ctx.fillStyle = C.panel;
	rr(ctx, x, y, w, h, r); ctx.fill();
	ctx.strokeStyle = C.panelBorder;
	ctx.lineWidth = 2;
	rr(ctx, x + 1, y + 1, w - 2, h - 2, r); ctx.stroke();
}

export function bar(ctx, x, y, w, h, frac, color, r = 3) {
	ctx.fillStyle = C.barBg;
	rr(ctx, x, y, w, h, r); ctx.fill();
	if (frac > 0) {
		ctx.fillStyle = color;
		rr(ctx, x, y, Math.max(h, w * Math.min(1, frac)), h, r); ctx.fill();
	}
}

export const hpColor = frac => frac > 0.5 ? C.hpGreen : frac > 0.2 ? C.hpYellow : C.hpRed;

export function badge(ctx, x, y, w, h, color, label, font) {
	ctx.fillStyle = color;
	rr(ctx, x, y, w, h, 4); ctx.fill();
	ctx.fillStyle = '#0d1117';
	ctx.font = font;
	ctx.textAlign = 'center';
	ctx.fillText(label, x + w / 2, y + h - Math.round(h * 0.26));
	ctx.textAlign = 'left';
}

// one mon's info panel; opts: { showXP, showNumbers, shownHP, boosts, expFrac }
export function monPanel(ctx, mon, x, y, w, u, opts = {}) {
	const h = (opts.showXP ? 96 : 78) * u;
	panel(ctx, x, y, w, h, 8 * u);
	const pad = 10 * u;
	ctx.fillStyle = C.text;
	ctx.font = `${Math.round(17 * u)}px m6x11plus, monospace`;
	ctx.fillText(mon.name, x + pad, y + pad + 13 * u);
	// gender mark right after the name, GBA-colored
	if (mon.gender) {
		const nw = ctx.measureText(mon.name).width;
		ctx.fillStyle = mon.gender === 'M' ? '#5f8fe8' : '#e87a9a';
		ctx.font = `${Math.round(15 * u)}px m6x11plus, monospace`;
		ctx.fillText(mon.gender === 'M' ? '♂' : '♀', x + pad + nw + 5 * u, y + pad + 13 * u);
	}
	// ability + held item under the level, dim (matches the Love2D panel)
	if (opts.abilityName) {
		ctx.fillStyle = C.faint;
		ctx.font = `${Math.round(10 * u)}px m6x11plus, monospace`;
		ctx.textAlign = 'right';
		ctx.fillText(opts.abilityName + (opts.itemName ? ' · ' + opts.itemName : ''), x + w - pad, y + pad + 46 * u);
		ctx.textAlign = 'left';
	}
	ctx.fillStyle = C.dim;
	ctx.font = `${Math.round(13 * u)}px m6x11plus, monospace`;
	ctx.textAlign = 'right';
	ctx.fillText(`Lv${mon.level}`, x + w - pad, y + pad + 12 * u);
	ctx.textAlign = 'left';
	// status badge under the level
	if (mon.status) {
		badge(ctx, x + w - pad - 34 * u, y + pad + 18 * u, 34 * u, 15 * u,
			STATUS_BADGE[mon.status] || '#999',
			{ par: 'PAR', brn: 'BRN', psn: 'PSN', slp: 'SLP', frz: 'FRZ' }[mon.status],
			`${Math.round(11 * u)}px m6x11plus, monospace`);
	}
	// type badges
	let tx = x + pad;
	for (const t of mon.types) {
		badge(ctx, tx, y + pad + 18 * u, 44 * u, 15 * u, TYPE_COLORS[t] || '#888', t.toUpperCase().slice(0, 8),
			`${Math.round(10 * u)}px m6x11plus, monospace`);
		tx += 48 * u;
	}
	// stat-stage chips
	if (opts.boosts) {
		const order = [['atk', 'ATK'], ['def', 'DEF'], ['spa', 'SPA'], ['spd', 'SPD'], ['spe', 'SPE'], ['acc', 'ACC'], ['eva', 'EVA']];
		for (const [k, label] of order) {
			const v = opts.boosts[k] || 0;
			if (!v) continue;
			if (tx > x + w - 40 * u) break;
			const col = v > 0 ? C.statUp : C.statDown;
			badge(ctx, tx, y + pad + 18 * u, 36 * u, 15 * u, col,
				label + (v > 0 ? '+' : '') + v, `${Math.round(9 * u)}px m6x11plus, monospace`);
			tx += 40 * u;
		}
	}
	// HP bar
	const shown = opts.shownHP ?? mon.curHP;
	const frac = Math.max(0, shown / mon.maxHP);
	const barW = w - pad * 2 - (opts.showNumbers ? 74 * u : 0);
	const hpY = y + h - (opts.showXP ? 38 : 24) * u;
	bar(ctx, x + pad, hpY, barW, 11 * u, frac, hpColor(frac), 4 * u);
	if (opts.showNumbers) {
		ctx.fillStyle = C.text;
		ctx.font = `${Math.round(12 * u)}px m6x11plus, monospace`;
		ctx.textAlign = 'right';
		ctx.fillText(`${Math.round(Math.max(0, shown))}/${mon.maxHP}`, x + w - pad, hpY + 10 * u);
		ctx.textAlign = 'left';
	}
	if (opts.showXP) {
		bar(ctx, x + pad, y + h - 18 * u, barW, 6 * u, opts.expFrac ?? 0, C.xp, 2 * u);
		ctx.fillStyle = C.faint;
		ctx.font = `${Math.round(10 * u)}px m6x11plus, monospace`;
		ctx.textAlign = 'right';
		ctx.fillText('EXP', x + w - pad, y + h - 12 * u);
		ctx.textAlign = 'left';
	}
	return h;
}

// team dots (filled = healthy, dark = fainted, ring = active)
export function teamDots(ctx, mons, active, x, y, u) {
	mons.forEach((m, i) => {
		const cx = x + i * 18 * u;
		ctx.beginPath();
		ctx.arc(cx, y, 6 * u, 0, Math.PI * 2);
		ctx.fillStyle = m.curHP > 0 ? C.hpGreen : '#4d2626';
		ctx.fill();
		if (m === active) {
			ctx.strokeStyle = C.accent;
			ctx.lineWidth = 2 * u;
			ctx.stroke();
		}
	});
}

// generic button; b: {x,y,w,h,label,sub?,right?,type?,disabled?}
export function button(ctx, b, hovered, u) {
	const tint = b.type ? TYPE_COLORS[b.type] : null;
	ctx.fillStyle = b.disabled ? 'rgba(20,24,30,0.6)' : hovered ? C.btnHover : C.btn;
	rr(ctx, b.x, b.y, b.w, b.h, 6 * u); ctx.fill();
	ctx.strokeStyle = b.disabled ? 'rgba(80,90,110,0.4)' : (tint || (hovered ? C.accent : C.panelBorder));
	ctx.lineWidth = hovered && !b.disabled ? 3 : 2;
	rr(ctx, b.x + 1, b.y + 1, b.w - 2, b.h - 2, 6 * u); ctx.stroke();
	ctx.fillStyle = b.disabled ? C.faint : C.text;
	ctx.font = `${Math.round((b.big ? 17 : 14) * u)}px m6x11plus, monospace`;
	if (b.center) {
		ctx.textAlign = 'center';
		ctx.fillText(b.label, b.x + b.w / 2, b.y + b.h / 2 + 6 * u);
		ctx.textAlign = 'left';
	} else {
		ctx.fillText(b.label, b.x + 9 * u, b.y + 17 * u);
	}
	if (b.sub) {
		ctx.fillStyle = b.subColor || C.dim;
		ctx.font = `${Math.round(11 * u)}px m6x11plus, monospace`;
		ctx.fillText(b.sub, b.x + 9 * u, b.y + b.h - 8 * u);
	}
	if (b.right) {
		ctx.fillStyle = C.dim;
		ctx.font = `${Math.round(11 * u)}px m6x11plus, monospace`;
		ctx.textAlign = 'right';
		ctx.fillText(b.right, b.x + b.w - 8 * u, b.y + b.h - 8 * u);
		ctx.textAlign = 'left';
	}
	if (b.type) {
		badge(ctx, b.x + b.w - 52 * u, b.y + 7 * u, 44 * u, 14 * u, TYPE_COLORS[b.type] || '#888',
			b.type.toUpperCase().slice(0, 8), `${Math.round(9 * u)}px m6x11plus, monospace`);
	}
}

// a procedurally drawn poke ball (no asset needed)
export function drawBall(ctx, x, y, r, wobble = 0) {
	ctx.save();
	ctx.translate(x, y);
	ctx.rotate(wobble);
	ctx.beginPath(); ctx.arc(0, 0, r, Math.PI, 0); ctx.fillStyle = '#e64d4d'; ctx.fill();
	ctx.beginPath(); ctx.arc(0, 0, r, 0, Math.PI); ctx.fillStyle = '#f2f2f2'; ctx.fill();
	ctx.fillStyle = '#1a1a26';
	ctx.fillRect(-r, -r * 0.14, r * 2, r * 0.28);
	ctx.beginPath(); ctx.arc(0, 0, r * 0.3, 0, Math.PI * 2); ctx.fill();
	ctx.beginPath(); ctx.arc(0, 0, r * 0.17, 0, Math.PI * 2); ctx.fillStyle = '#f2f2f2'; ctx.fill();
	ctx.restore();
}

// text wrapping for the message panel
export function wrap(ctx, text, maxW) {
	const words = String(text).split(' ');
	const lines = [];
	let line = '';
	for (const w of words) {
		const probe = line ? line + ' ' + w : w;
		if (ctx.measureText(probe).width > maxW && line) { lines.push(line); line = w; }
		else line = probe;
	}
	if (line) lines.push(line);
	return lines;
}
