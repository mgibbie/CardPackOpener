// cardart.js — canvas-generated card face/back textures shared by the
// collection viewer and the game board.
import * as THREE from 'three';

export const CARD_W = 2.5, CARD_H = 3.5, CARD_D = 0.02;

export const RARITY_COLORS = {
	common:   '#9aa0a6',
	uncommon: '#4caf50',
	rare:     '#2196f3',
	epic:     '#9c27b0',
	legendary:'#ff9800',
};
export const TYPE_COLORS = {
	creature:    '#7a3b2e',
	sorcery:     '#5b3b8c',
	instant:     '#2e6a7a',
	land:        '#3b7a2e',
	artifact:    '#6e6a5e',
	enchantment: '#7a2e6a',
	weapon:      '#7a5a2e',
	secret:      '#2e6a4a',
};

function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

// opts: { attack, hp, maxHealth } — live stats override the printed ones
export function makeFaceTexture(card, opts = {}) {
	const W = 512, H = 716;
	const c = document.createElement('canvas');
	c.width = W; c.height = H;
	const ctx = c.getContext('2d');

	const rarity = RARITY_COLORS[card.rarity] || RARITY_COLORS.common;
	const typeCol = TYPE_COLORS[card.type] || '#444';

	ctx.fillStyle = '#191322';
	ctx.fillRect(0, 0, W, H);
	ctx.strokeStyle = rarity;
	ctx.lineWidth = 10;
	roundRect(ctx, 10, 10, W - 20, H - 20, 26);
	ctx.stroke();

	const bg = ctx.createLinearGradient(0, 0, 0, H);
	bg.addColorStop(0, '#2b2140');
	bg.addColorStop(1, '#171126');
	ctx.fillStyle = bg;
	roundRect(ctx, 22, 22, W - 44, H - 44, 18);
	ctx.fill();

	// title bar
	ctx.fillStyle = typeCol;
	roundRect(ctx, 34, 36, W - 68, 64, 12);
	ctx.fill();
	ctx.fillStyle = '#f4eede';
	ctx.font = 'bold 32px Georgia';
	ctx.textBaseline = 'middle';
	ctx.fillText(card.name, 52, 70, W - 180);

	// mana cost gem
	ctx.beginPath();
	ctx.arc(W - 72, 68, 30, 0, Math.PI * 2);
	ctx.fillStyle = '#1c4fd6';
	ctx.fill();
	ctx.strokeStyle = '#9db9ff';
	ctx.lineWidth = 4;
	ctx.stroke();
	ctx.fillStyle = '#fff';
	ctx.font = 'bold 38px Georgia';
	ctx.textAlign = 'center';
	ctx.fillText(String(card.cost ?? ''), W - 72, 70);
	ctx.textAlign = 'left';

	// art box (procedural placeholder)
	const art = ctx.createLinearGradient(0, 120, W, 430);
	art.addColorStop(0, typeCol);
	art.addColorStop(1, '#120d1d');
	ctx.fillStyle = art;
	roundRect(ctx, 40, 116, W - 80, 300, 10);
	ctx.fill();
	ctx.save();
	ctx.translate(W / 2, 266);
	ctx.rotate(Math.PI / 4);
	ctx.strokeStyle = 'rgba(244,238,222,0.5)';
	ctx.lineWidth = 6;
	ctx.strokeRect(-70, -70, 140, 140);
	ctx.strokeRect(-45, -45, 90, 90);
	ctx.restore();

	// type line
	ctx.fillStyle = '#c9c2da';
	ctx.font = 'italic 24px Georgia';
	const typeLine = (card.tribe ? card.tribe + ' ' : '') + card.type.toUpperCase() + '  ·  ' + (card.rarity || 'common').toUpperCase();
	ctx.fillText(typeLine, 44, 452, W - 88);

	// description (word-wrapped)
	ctx.fillStyle = '#e8e2f4';
	ctx.font = '26px Georgia';
	const words = (card.description || '').split(' ');
	let line = '', y = 498;
	for (const w of words) {
		if (ctx.measureText(line + w).width > W - 100) {
			ctx.fillText(line, 48, y);
			line = w + ' ';
			y += 34;
		} else {
			line += w + ' ';
		}
	}
	ctx.fillText(line, 48, y);

	// attack / durability plates
	if (card.type === 'weapon') {
		const atk = opts.attack ?? card.attack ?? 0;
		const dur = opts.durability ?? card.durability ?? 0;
		ctx.font = 'bold 44px Georgia';
		ctx.textAlign = 'center';
		ctx.fillStyle = '#b3402e';
		roundRect(ctx, 40, H - 110, 110, 66, 12);
		ctx.fill();
		ctx.fillStyle = '#8a7430';
		roundRect(ctx, W - 150, H - 110, 110, 66, 12);
		ctx.fill();
		ctx.fillStyle = '#fff';
		ctx.fillText(String(atk), 95, H - 75);
		ctx.fillText(String(dur), W - 95, H - 75);
		ctx.textAlign = 'left';
	}

	// attack / health plates
	if (card.type === 'creature') {
		const atk = opts.attack ?? card.attack ?? 0;
		const health = opts.hp ?? card.health ?? 0;
		const damaged = opts.maxHealth != null && health < opts.maxHealth;
		ctx.font = 'bold 44px Georgia';
		ctx.textAlign = 'center';
		ctx.fillStyle = '#b3402e';
		roundRect(ctx, 40, H - 110, 110, 66, 12);
		ctx.fill();
		ctx.fillStyle = '#2e7db3';
		roundRect(ctx, W - 150, H - 110, 110, 66, 12);
		ctx.fill();
		ctx.fillStyle = '#fff';
		ctx.fillText(String(atk), 95, H - 75);
		ctx.fillStyle = damaged ? '#ff8080' : '#fff';
		ctx.fillText(String(health), W - 95, H - 75);
		ctx.textAlign = 'left';
	}

	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

export function makeBackTexture() {
	const W = 512, H = 716;
	const c = document.createElement('canvas');
	c.width = W; c.height = H;
	const ctx = c.getContext('2d');
	ctx.fillStyle = '#1c1430';
	ctx.fillRect(0, 0, W, H);
	ctx.strokeStyle = '#5a4a8a';
	ctx.lineWidth = 12;
	roundRect(ctx, 14, 14, W - 28, H - 28, 26);
	ctx.stroke();
	ctx.strokeStyle = '#8f6fff';
	ctx.lineWidth = 8;
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2;
		ctx.beginPath();
		ctx.moveTo(W / 2 + Math.cos(a) * 120, H / 2 + Math.sin(a) * 120);
		ctx.lineTo(W / 2 + Math.cos(a) * 150, H / 2 + Math.sin(a) * 150);
		ctx.stroke();
	}
	ctx.beginPath();
	ctx.arc(W / 2, H / 2, 120, 0, Math.PI * 2);
	ctx.stroke();
	ctx.fillStyle = '#c9b8ff';
	ctx.font = 'bold 44px Georgia';
	ctx.textAlign = 'center';
	ctx.fillText('MAGEPUNK', W / 2, H / 2 + 14);
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}
