// meadow.js — "Meandering Meadow": the creature-catching clicker. Faithful
// native-JS port of the Love2D gameplay/creature/tool/shop/ui logic. Operates
// on the shared G state. Interaction is position-based (act(x,y)) so it's
// driven identically by a synthesized cursor (Z=A) or a direct tap.
import { G, W, H, TOOLS, CREATURES, BIRDS, NOTEBOOK_ORDER } from './state.js';
import { img, SFX } from './assets.js';

const rnd = (a, b) => a + Math.random() * (b - a);
const inRect = (x, y, r) => x >= r[0] && x <= r[0] + r[2] && y >= r[1] && y <= r[1] + r[3];
const cap = s => s ? s[0].toUpperCase() + s.slice(1) : s;

// ---- sprite / text helpers ----
function sprite(ctx, key, x, y, size) {
	const im = img(key);
	if (!im || !im.complete || !im.naturalWidth) return;
	const s = size / Math.max(im.naturalWidth, im.naturalHeight);
	ctx.drawImage(im, x, y, im.naturalWidth * s, im.naturalHeight * s);
}
function spriteCentered(ctx, key, cx, cy, size) { sprite(ctx, key, cx - size / 2, cy - size / 2, size); }
function text(ctx, str, x, y, { size = 16, color = '#fff', align = 'left', baseline = 'top' } = {}) {
	ctx.font = `${size}px system-ui, sans-serif`; ctx.fillStyle = color; ctx.textAlign = align; ctx.textBaseline = baseline;
	ctx.fillText(str, x, y);
}
function panel(ctx, r, fill, border, lw = 3) {
	ctx.fillStyle = fill; ctx.fillRect(r[0], r[1], r[2], r[3]);
	if (border) { ctx.strokeStyle = border; ctx.lineWidth = lw; ctx.strokeRect(r[0] + lw / 2, r[1] + lw / 2, r[2] - lw, r[3] - lw); }
}
function closeX(ctx, r) { // red close button with white X
	panel(ctx, r, '#cc3333', '#991919', 2);
	ctx.strokeStyle = '#fff'; ctx.lineWidth = 3; ctx.beginPath();
	ctx.moveTo(r[0] + 8, r[1] + 8); ctx.lineTo(r[0] + r[2] - 8, r[1] + r[3] - 8);
	ctx.moveTo(r[0] + r[2] - 8, r[1] + 8); ctx.lineTo(r[0] + 8, r[1] + r[3] - 8); ctx.stroke();
}

// ---- layout rects ----
const R = {
	market: [716, 516, 64, 64],
	phone: [732, 458, 48, 48],
	toolLeft: [20, 543, 20, 42], toolRight: [72, 543, 20, 42],
	shop: [150, 115, 500, 370], shopClose: [610, 125, 30, 30],
	phoneMenu: [225, 175, 350, 250], phoneClose: [535, 185, 30, 30], phoneBack: [499, 185, 30, 30],
};
const BUY = { x: 482, size: 48, rows: { moreStars: 175, moreSize: 245, unlock: 315 } };
const phoneGrid = i => { const sx = 274, sy = 245, str = 94; const col = i % 3, row = Math.floor(i / 3); return [sx + col * str, sy + row * str, 64, 64]; };
const notebookArrowL = [235, 305, 20, 20], notebookArrowR = [545, 305, 20, 20];

// ---- tools ----
export function availableTools() { const t = ['flyswatter']; if (G.bugnetUnlocked) t.push('bugnet'); if (G.cameraUnlocked) t.push('camera'); return t; }
function cycleTool(dir) { const t = availableTools(); if (t.length < 2) return; const i = t.indexOf(G.activeTool); G.activeTool = t[(i + dir + t.length) % t.length]; }

// ---- creatures ----
function reaim(c) { const a = Math.random() * Math.PI * 2; c.dirX = Math.cos(a); c.dirY = Math.sin(a); c.aimTimer = c.ri; }
function spawn(type) {
	const d = CREATURES[type];
	const c = { type, x: rnd(32, W - 32), y: rnd(32, H - 32), size: d.size, speed: d.speed, ri: d.ri, bird: !!d.bird, photo: d.photo || 0, fleeing: false };
	reaim(c);
	G.creatures.push(c);
	return c;
}
const nearestLanternfly = c => {
	let best = null, bd = Infinity;
	for (const o of G.creatures) if (o.type === 'lanternfly') { const dx = o.x - c.x, dy = o.y - c.y, d = dx * dx + dy * dy; if (d < bd) { bd = d; best = o; } }
	return best;
};
// returns true to remove the creature
function updateCreature(c, dt) {
	if (c.bird) {
		if (c.fleeing) { // head to nearest edge, leave
			const toL = c.x, toR = W - c.x, toT = c.y, toB = H - c.y;
			const m = Math.min(toL, toR, toT, toB);
			let dx = 0, dy = 0;
			if (m === toL) dx = -1; else if (m === toR) dx = 1; else if (m === toT) dy = -1; else dy = 1;
			c.x += dx * c.speed * dt; c.y += dy * c.speed * dt;
			if (c.x < -c.size || c.x > W + c.size || c.y < -c.size || c.y > H + c.size) {
				if (c.type === 'cardinal') G.birdPoolUnlocked = true;
				return true;
			}
			return false;
		}
		const prey = nearestLanternfly(c);
		if (prey) {
			const dx = prey.x - c.x, dy = prey.y - c.y, dist = Math.hypot(dx, dy) || 1;
			c.x += (dx / dist) * c.speed * dt; c.y += (dy / dist) * c.speed * dt;
			if (dist <= c.size / 2 + 8) { G.creatures.splice(G.creatures.indexOf(prey), 1); } // eat, no reward
		} else { c.aimTimer -= dt; if (c.aimTimer <= 0) reaim(c); c.x += c.dirX * c.speed * dt; c.y += c.dirY * c.speed * dt; }
		c.x = Math.max(0, Math.min(W - c.size, c.x)); c.y = Math.max(0, Math.min(H - c.size, c.y)); // non-fleeing birds stay on screen
		return false;
	}
	// bugs wander randomly and may leave
	c.aimTimer -= dt; if (c.aimTimer <= 0) reaim(c);
	c.x += c.dirX * c.speed * dt; c.y += c.dirY * c.speed * dt;
	return c.x < -c.size || c.x > W + c.size || c.y < -c.size || c.y > H + c.size;
}

export function update(dt) {
	// spawns
	G.spawnTimer += dt; if (G.spawnTimer >= G.spawnInterval) { G.spawnTimer = 0; spawn('lanternfly'); }
	if (G.bugnetUnlocked) { G.mantisSpawnTimer += dt; if (G.mantisSpawnTimer >= G.mantisSpawnInterval) { G.mantisSpawnTimer = 0; spawn('mantis'); } }
	if (G.cameraUnlocked) {
		const birdPresent = G.creatures.some(c => c.bird);
		if (birdPresent) G.birdSpawnTimer = 0;
		else { G.birdSpawnTimer += dt; if (G.birdSpawnTimer >= G.birdSpawnInterval) { G.birdSpawnTimer = 0; const pool = ['cardinal']; if (G.birdPoolUnlocked) for (const b of BIRDS) if (b !== 'cardinal') pool.push(b); spawn(pool[Math.floor(Math.random() * pool.length)]); } }
	}
	// creatures (back to front so removals are safe)
	for (let i = G.creatures.length - 1; i >= 0; i--) { if (updateCreature(G.creatures[i], dt)) G.creatures.splice(i, 1); }
	// boom
	if (G.boom.active) { G.boom.timer += dt; if (G.boom.timer >= G.boom.duration) G.boom.active = false; }
}

function showBoom(x, y) { G.boom.x = x; G.boom.y = y; G.boom.timer = 0; G.boom.active = true; }

// ---- catching ----
function pointsFor(c, tool) {
	if (c.type === 'mantis') return tool === 'bugnet' ? 50 : -200;
	if (c.bird) return 0;
	return tool === 'bugnet' ? 0 : G.starsPerFly; // lanternfly
}
function award(p) { G.starCount = Math.max(0, G.starCount + p); }
function catchAt(x, y) {
	const tool = G.activeTool;
	const radius = tool === 'camera' ? 15 : tool === 'bugnet' ? 22 : 18;
	for (let i = G.creatures.length - 1; i >= 0; i--) {
		const c = G.creatures[i];
		const cx = c.x + c.size / 2, cy = c.y + c.size / 2;
		if (Math.hypot(x - cx, y - cy) > radius) continue;
		if (c.bird && tool !== 'camera') continue; // only camera affects birds
		if (tool === 'camera') {
			if (c.bird) { award(c.photo); c.fleeing = true; G.photographedBirds[c.type] = true; if (c.type === 'cardinal') G.birdPoolUnlocked = true; showBoom(cx, cy); return; }
			G.photographedCreatures[c.type] = true; showBoom(cx, cy); return; // photograph a bug (no stars)
		}
		// flyswatter / bugnet: remove + award
		G.creatures.splice(i, 1);
		award(pointsFor(c, tool));
		try { SFX.squish.currentTime = 0; SFX.squish.play().catch(() => {}); } catch (e) {}
		showBoom(cx, cy);
		return;
	}
}

// ---- shop purchases ----
function buy(which) {
	if (which === 'moreStars' && G.starCount >= G.moreStarsCost) { G.starCount -= G.moreStarsCost; G.moreStarsLevel++; G.starsPerFly++; G.moreStarsCost *= 2; }
	else if (which === 'moreSize' && G.starCount >= G.moreSizeCost) { G.starCount -= G.moreSizeCost; G.moreSizeLevel++; G.boomHitboxMultiplier += 0.3; G.moreSizeCost *= 2; }
	else if (which === 'bugnet' && !G.bugnetUnlocked && G.starCount >= 50) { G.starCount -= 50; G.bugnetUnlocked = true; }
	else if (which === 'camera' && G.bugnetUnlocked && !G.cameraUnlocked && G.starCount >= G.cameraUpgradeCost) { G.starCount -= G.cameraUpgradeCost; G.cameraUnlocked = true; }
}

// ---- notebook ----
function notebookList() { return NOTEBOOK_ORDER.filter(s => G.photographedBirds[s] || G.photographedCreatures[s]); }

// ============================ interaction =============================
// called on A / tap at (x,y). onOpenPear() lets main handle the pear transition.
export function act(x, y, onOpenPear) {
	if (G.phoneMenuOpen) return phoneClick(x, y, onOpenPear);
	if (G.shopOpen) return shopClick(x, y);
	if (G.bugnetUnlocked) { if (inRect(x, y, R.toolLeft)) { cycleTool(-1); return; } if (inRect(x, y, R.toolRight)) { cycleTool(1); return; } }
	if (inRect(x, y, R.phone)) { G.phoneMenuOpen = true; G.phoneActivePage = null; return; }
	if (inRect(x, y, R.market)) { G.shopOpen = true; return; }
	// gameplay: miss-boom at the tool's effect offset, then hit-test (overwrites boom on hit)
	const off = TOOLS[G.activeTool].offset; showBoom(x + off[0], y + off[1]);
	catchAt(x, y);
}
export function back() {
	if (G.phoneActivePage) { G.phoneActivePage = null; return true; }
	if (G.phoneMenuOpen) { G.phoneMenuOpen = false; return true; }
	if (G.shopOpen) { G.shopOpen = false; return true; }
	return false;
}
function shopClick(x, y) {
	if (inRect(x, y, R.shopClose)) { G.shopOpen = false; return; }
	const b = (row, which) => { if (x >= BUY.x && x <= BUY.x + BUY.size && y >= row && y <= row + BUY.size) buy(which); };
	b(BUY.rows.moreStars, 'moreStars');
	b(BUY.rows.moreSize, 'moreSize');
	if (!G.bugnetUnlocked) b(BUY.rows.unlock, 'bugnet');
	else if (!G.cameraUnlocked) b(BUY.rows.unlock, 'camera');
}
function phoneClick(x, y, onOpenPear) {
	if (inRect(x, y, R.phoneClose)) { G.phoneMenuOpen = false; return; }
	if (G.phoneActivePage) {
		if (inRect(x, y, R.phoneBack)) { G.phoneActivePage = null; return; }
		if (G.phoneActivePage === 'notebook') {
			const list = notebookList();
			if (list.length) {
				if (inRect(x, y, notebookArrowL)) { G.notebookIndex = ((G.notebookIndex ?? 1) - 2 + list.length) % list.length + 1; }
				else if (inRect(x, y, notebookArrowR)) { G.notebookIndex = ((G.notebookIndex ?? 1) % list.length) + 1; }
			}
		}
		return;
	}
	const keys = ['notebook', 'save', 'settings', 'pear'];
	for (let i = 0; i < 4; i++) if (inRect(x, y, phoneGrid(i))) {
		if (keys[i] === 'pear') { G.phoneMenuOpen = false; onOpenPear && onOpenPear(); }
		else { G.phoneActivePage = keys[i]; if (keys[i] === 'notebook') G.notebookIndex = notebookList().length ? 1 : null; }
		return;
	}
}

// ============================== drawing ===============================
export function draw(ctx) {
	// background
	const bg = img('background');
	if (bg && bg.complete && bg.naturalWidth) ctx.drawImage(bg, 0, 0, W, H); else { ctx.fillStyle = '#66b34d'; ctx.fillRect(0, 0, W, H); }
	// HUD
	spriteCentered(ctx, 'star', 20 + 12, 20 + 12, 24); text(ctx, String(G.starCount), 54, 26, { size: 16 });
	// creatures
	for (const c of G.creatures) sprite(ctx, CREATURES[c.type].img, c.x, c.y, c.size);
	// boom
	if (G.boom.active) {
		const mult = (G.activeTool === 'flyswatter' ? G.boomHitboxMultiplier : 1) * TOOLS[G.activeTool].hitboxMult;
		const size = 32 * mult, a = 1 - G.boom.timer / G.boom.duration;
		ctx.globalAlpha = Math.max(0, a); spriteCentered(ctx, 'boom', G.boom.x, G.boom.y, size); ctx.globalAlpha = 1;
	}
	// corner icons
	sprite(ctx, 'farmersmarket', R.market[0], R.market[1], 64);
	sprite(ctx, 'phone', R.phone[0], R.phone[1], 48);
	// tool indicator (only once a 2nd tool exists)
	if (G.bugnetUnlocked) {
		panel(ctx, [15, 543, 82, 42], 'rgba(0,0,0,0.5)', null);
		text(ctx, '<', 30, 564, { size: 20, align: 'center', baseline: 'middle' });
		spriteCentered(ctx, TOOLS[G.activeTool].img, 56, 564, 32);
		text(ctx, '>', 82, 564, { size: 20, align: 'center', baseline: 'middle' });
	}
	if (G.shopOpen) drawShop(ctx);
	if (G.phoneMenuOpen) drawPhone(ctx);
}
function drawShop(ctx) {
	ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
	panel(ctx, R.shop, '#996633', '#663319');
	closeX(ctx, R.shopClose);
	text(ctx, 'Farmers Market', 150 + 250, 135, { size: 16, align: 'center' });
	const row = (y, iconKey, mainKey, lines, cost, afford) => {
		sprite(ctx, iconKey, 170, y, 40);
		sprite(ctx, mainKey, 225, y, 48);
		let ty = y; for (const l of lines) { text(ctx, l, 285, ty, { size: 16 }); ty += 18; }
		ctx.globalAlpha = afford ? 1 : 0.5; sprite(ctx, 'buybutton', BUY.x, y, 48); ctx.globalAlpha = 1;
		spriteCentered(ctx, 'star', 540 + 8, y + 24, 16); text(ctx, String(cost), 560, y + 24, { size: 16, baseline: 'middle' });
	};
	row(BUY.rows.moreStars, 'spottedlanternfly', 'morestarsbutton', [`Level ${G.moreStarsLevel}`, `+${G.starsPerFly} stars per fly`], G.moreStarsCost, G.starCount >= G.moreStarsCost);
	row(BUY.rows.moreSize, 'flyswatter', 'moresizebutton', [`Level ${G.moreSizeLevel}`, `${Math.floor(G.boomHitboxMultiplier * 100)}% visual boom`], G.moreSizeCost, G.starCount >= G.moreSizeCost);
	if (!G.bugnetUnlocked) row(BUY.rows.unlock, 'mantis', 'bugnet', ['Unlock Bugnet', '& Mantis'], 50, G.starCount >= 50);
	else if (!G.cameraUnlocked) row(BUY.rows.unlock, 'cardinal', 'camera', ['Unlock Camera', '& Cardinal'], G.cameraUpgradeCost, G.starCount >= G.cameraUpgradeCost);
}
function drawPhone(ctx) {
	ctx.fillStyle = 'rgba(0,0,0,0.5)'; ctx.fillRect(0, 0, W, H);
	panel(ctx, R.phoneMenu, '#999999', '#666666');
	closeX(ctx, R.phoneClose);
	if (G.phoneActivePage) { panel(ctx, R.phoneBack, '#339933', '#196619', 2); text(ctx, '<', R.phoneBack[0] + 15, R.phoneBack[1] + 15, { size: 20, align: 'center', baseline: 'middle' }); }
	if (!G.phoneActivePage) {
		const items = [['notebook', 'Notebook'], ['save', 'Save'], ['settingsgear', 'Settings'], ['pear', 'Pair of Pears']];
		for (let i = 0; i < 4; i++) { const r = phoneGrid(i); sprite(ctx, items[i][0], r[0], r[1], 64); text(ctx, items[i][1], r[0] + 32, r[1] + 70, { size: 16, align: 'center' }); }
	} else if (G.phoneActivePage === 'notebook') {
		text(ctx, 'Notebook', 245, 235, { size: 16 });
		const list = notebookList();
		text(ctx, `Items in Notebook: ${list.length}`, 245, 260, { size: 16 });
		if (!list.length) { text(ctx, 'Photograph birds to add them here!', 245, 305, { size: 16, color: '#b3b3b3' }); }
		else {
			ctx.fillStyle = 'rgba(128,128,128,0.5)'; ctx.fillRect(225, 275, 350, 80);
			const idx = ((G.notebookIndex ?? 1) - 1 + list.length) % list.length;
			const key = list[idx];
			spriteCentered(ctx, CREATURES[key] ? CREATURES[key].img : key, 400, 315, 64);
			text(ctx, '<', 235, 315, { size: 20, baseline: 'middle' });
			text(ctx, '>', 545, 315, { size: 20, baseline: 'middle' });
			text(ctx, cap(key), 400, 362, { size: 16, align: 'center' });
		}
	} else {
		text(ctx, cap(G.phoneActivePage), 245, 235, { size: 16 });
		text(ctx, G.phoneActivePage === 'save' ? '- Save/Load coming soon -' : '- Adjust options here -', 245, 255, { size: 16 });
	}
}

// draw the active tool as the cursor (in gameplay); a small ring in menus
export function drawCursor(ctx, x, y) {
	if (G.shopOpen || G.phoneMenuOpen) { ctx.strokeStyle = '#fff'; ctx.lineWidth = 2; ctx.beginPath(); ctx.arc(x, y, 7, 0, Math.PI * 2); ctx.stroke(); return; }
	spriteCentered(ctx, TOOLS[G.activeTool].img, x, y, 40);
}
