// packs.js — 3D pack opening: a booster hovers, tears open in a burst of
// light, and five cards fly out to be flipped one by one.
import * as THREE from 'three';
import { CARD_W, CARD_H, CARD_D, makeFaceTexture, makeBackTexture, RARITY_COLORS } from './cardart.js';
import * as Col from './collection.js';
import * as MPX from './mpmode.js';
import { keywordsFor } from './keywords.js';

// test-realm mode: packs are earned from dungeon runs and rolled server-side
const MP_ON = MPX.mpMode();
let mpPacks = 0;
let mpPulls = null; // ids the server rolled for the pack being torn open

const container = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0e0b16');

const camera = new THREE.PerspectiveCamera(42, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0.4, 9.5);

scene.add(new THREE.AmbientLight(0xffffff, 0.85));
const key = new THREE.DirectionalLight(0xffffff, 1.7);
key.position.set(3, 6, 6);
scene.add(key);
const rim = new THREE.PointLight(0x8f6fff, 16, 30);
rim.position.set(-5, -2, 4);
scene.add(rim);

// starfield
{
	const g = new THREE.BufferGeometry();
	const pts = [];
	for (let i = 0; i < 350; i++) pts.push((Math.random() - 0.5) * 44, (Math.random() - 0.5) * 26, -7 - Math.random() * 12);
	g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
	scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x6f5fa8, size: 0.035 })));
}

// ---------- pack mesh ----------
function packTexture() {
	const c = document.createElement('canvas');
	c.width = 512; c.height = 716;
	const ctx = c.getContext('2d');
	const g = ctx.createLinearGradient(0, 0, 512, 716);
	g.addColorStop(0, '#3b2c66');
	g.addColorStop(0.5, '#241a44');
	g.addColorStop(1, '#151029');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 512, 716);
	// foil crimp top/bottom
	ctx.fillStyle = '#5a4a8a';
	ctx.fillRect(0, 0, 512, 42);
	ctx.fillRect(0, 674, 512, 42);
	for (let x = 0; x < 512; x += 16) {
		ctx.fillStyle = x % 32 ? '#6f5fa8' : '#4a3d75';
		ctx.fillRect(x, 8, 8, 26);
		ctx.fillRect(x, 682, 8, 26);
	}
	// gear sigil
	ctx.strokeStyle = '#8f6fff';
	ctx.lineWidth = 10;
	ctx.beginPath(); ctx.arc(256, 300, 130, 0, Math.PI * 2); ctx.stroke();
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2;
		ctx.beginPath();
		ctx.moveTo(256 + Math.cos(a) * 130, 300 + Math.sin(a) * 130);
		ctx.lineTo(256 + Math.cos(a) * 162, 300 + Math.sin(a) * 162);
		ctx.stroke();
	}
	ctx.fillStyle = '#f4eede';
	ctx.font = 'bold 58px Georgia';
	ctx.textAlign = 'center';
	ctx.fillText('MAGEPUNK', 256, 320);
	ctx.font = 'bold 30px Georgia';
	ctx.fillStyle = '#c9b8ff';
	ctx.fillText('BOOSTER PACK', 256, 560);
	ctx.font = '24px Georgia';
	ctx.fillText(`${Col.PACK_SIZE} CARDS`, 256, 608);
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

const packMat = new THREE.MeshStandardMaterial({ map: packTexture(), roughness: 0.4, metalness: 0.35 });
const packSideMat = new THREE.MeshStandardMaterial({ color: '#241a44', roughness: 0.5 });
let pack = null;
function spawnPack() {
	if (pack) scene.remove(pack);
	pack = new THREE.Mesh(
		new THREE.BoxGeometry(3.1, 4.4, 0.25),
		[packSideMat, packSideMat, packSideMat, packSideMat, packMat, packMat]
	);
	scene.add(pack);
}

// test-realm inventory: unopened packs pile up beside the opener so a
// player can see (and save) what they've banked from dungeon runs
let stackMeshes = [];
function updateStack() {
	for (const m of stackMeshes) scene.remove(m);
	stackMeshes = [];
	if (!MP_ON) return;
	const extra = Math.min(Math.max(mpPacks - 1, 0), 8);
	for (let i = 0; i < extra; i++) {
		const m = new THREE.Mesh(
			new THREE.BoxGeometry(3.1, 4.4, 0.25),
			[packSideMat, packSideMat, packSideMat, packSideMat, packMat, packMat]
		);
		m.position.set(-5.4 - i * 0.22, -0.5 + i * 0.02, -1.2 - i * 0.3);
		m.rotation.set(0, 0.4, (i % 2 ? 1 : -1) * 0.05);
		scene.add(m);
		stackMeshes.push(m);
	}
	// with nothing banked, the hovering pack hides instead of teasing a 409
	if (pack && (phase === 'idle' || phase === 'done')) pack.visible = mpPacks > 0;
}

// ---------- cards ----------
const backTex = makeBackTexture();
const edgeMat = new THREE.MeshStandardMaterial({ color: '#241b38', roughness: 0.8 });
const cardGeo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);
let cardMeshes = []; // { mesh, def, flipped, target, spin }
const REVEAL_Z = 1.5;

// fit all five cards across the visible width for the current aspect ratio so
// the corner cards never spill off-screen (portrait/mobile shrinks them to fit)
function fitLayout() {
	const dist = camera.position.z - REVEAL_Z;
	const halfH = dist * Math.tan((camera.fov * Math.PI / 180) / 2);
	const halfW = halfH * camera.aspect;
	const N = Col.PACK_SIZE, margin = 0.45, cardHalf = CARD_W / 2;
	let scale = 1;
	// widest spacing whose outermost card edge still fits, capped so wide screens
	// don't fling them apart
	let spread = Math.min(2.9, (halfW - margin - cardHalf) * 2 / (N - 1));
	const gap = CARD_W * 1.04; // below this the cards would overlap — shrink instead
	if (spread < gap) scale = Math.max(0.4, spread / gap);
	return { spread: Math.max(spread, 0.55), scale };
}
function layoutCards() {
	if (!cardMeshes.length) return;
	const { spread, scale } = fitLayout();
	const N = Col.PACK_SIZE;
	cardMeshes.forEach((c, i) => {
		c.target.x = (i - (N - 1) / 2) * spread;
		c.mesh.scale.setScalar(scale);
	});
}

// burst particles
const bursts = [];
function burst(pos, color, n = 26) {
	const geo = new THREE.BufferGeometry();
	const arr = new Float32Array(n * 3);
	geo.setAttribute('position', new THREE.BufferAttribute(arr, 3));
	const pts = new THREE.Points(geo, new THREE.PointsMaterial({ color, size: 0.12, transparent: true }));
	pts.position.copy(pos);
	const vels = [];
	for (let i = 0; i < n; i++) {
		const a = Math.random() * Math.PI * 2, r = 1.5 + Math.random() * 3;
		vels.push(new THREE.Vector3(Math.cos(a) * r, Math.sin(a) * r + 1, (Math.random() - 0.5) * 2));
	}
	scene.add(pts);
	bursts.push({ pts, vels, life: 1 });
}

// ---------- state ----------
let cards = [], cardsById = {};
let phase = 'idle'; // idle -> tearing -> revealing -> done
let tearT = 0;
const hud = {
	gold: document.getElementById('gold'),
	hint: document.getElementById('hint'),
	toast: document.getElementById('toast'),
};

function updateHud() {
	updateStack();
	hud.gold.textContent = MP_ON ? `${mpPacks} pack${mpPacks === 1 ? '' : 's'}` : `${Col.getGold()} gold`;
	if (phase === 'idle') {
		hud.hint.textContent = MP_ON
			? (mpPacks > 0 ? `[Z / click] open a pack — ${mpPacks} waiting`
				: 'No packs — finish a dungeon run (win or lose) to earn one!')
			: Col.getGold() >= Col.PACK_PRICE
				? `[Z / click] open a pack — ${Col.PACK_PRICE} gold`
				: `Not enough gold — win matches to earn more!`;
	} else if (phase === 'revealing') {
		const left = cardMeshes.filter(c => !c.flipped).length;
		hud.hint.textContent = left ? `Click cards to reveal (${left} left)` : 'Hover a card to see what it does';
	} else if (phase === 'done') {
		hud.hint.textContent = '[Z / click] open another pack  ·  hover a card for details';
	} else hud.hint.textContent = '';
}

async function startOpen() {
	if (phase !== 'idle' && phase !== 'done') return;
	if (MP_ON) {
		// the server rolls the cards and spends the pack before anything tears
		const data = await MPX.call('open-pack');
		if (data.error) { hud.hint.textContent = data.error; return; }
		mpPulls = data.cards;
		mpPacks = data.state.packs;
	} else if (!Col.spendGold(Col.PACK_PRICE)) { updateHud(); return; }
	for (const c of cardMeshes) { scene.remove(c.mesh); c.mesh.material[4].map?.dispose(); }
	cardMeshes = [];
	if (!pack) spawnPack();
	phase = 'tearing';
	tearT = 0;
	updateHud();
}

function revealCards() {
	const pulls = MP_ON ? mpPulls.map(id => cardsById[id]).filter(Boolean) : Col.rollPack(cards);
	if (!MP_ON) Col.addToCollection(pulls.map(d => d.id));
	pulls.forEach((def, i) => {
		const face = new THREE.MeshStandardMaterial({ map: makeFaceTexture(def), roughness: 0.35, metalness: 0.15 });
		const back = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.5 });
		const mesh = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, edgeMat, edgeMat, face, back]);
		mesh.position.set(0, 0, 0.5);
		mesh.rotation.y = Math.PI; // face away (back showing)
		mesh.userData.idx = i;
		scene.add(mesh);
		cardMeshes.push({
			mesh, def, flipped: false,
			target: new THREE.Vector3(0, -0.2, REVEAL_Z),
			spin: Math.PI,
		});
	});
	layoutCards(); // spread them to fit the current screen
	phase = 'revealing';
	updateHud();
}

function flip(i) {
	const c = cardMeshes[i];
	if (!c || c.flipped) return;
	c.flipped = true;
	c.spin = 0; // rotate to face camera
	const col = RARITY_COLORS[c.def.rarity] || '#9aa0a6';
	burst(c.mesh.position, col, c.def.rarity === 'legendary' ? 60 : c.def.rarity === 'epic' ? 40 : 22);
	if (c.def.rarity === 'legendary' || c.def.rarity === 'epic') {
		hud.toast.textContent = `${c.def.rarity.toUpperCase()}! ${c.def.name}`;
		hud.toast.style.opacity = 1;
		clearTimeout(flip._t);
		flip._t = setTimeout(() => { hud.toast.style.opacity = 0; }, 1800);
	}
	if (cardMeshes.every(x => x.flipped)) phase = 'done';
	updateHud();
}

// ---------- input ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.style.touchAction = 'none';

// a plain tap: flip the next card, or open a pack on the idle/done screen
function tapAction(e) {
	if (phase === 'idle' || phase === 'done') { startOpen(); return; }
	if (phase !== 'revealing') return;
	const c = hoveredCard(e);
	if (c) flip(c.mesh.userData.idx);
}

// touch has no hover, so press-and-hold a revealed card to inspect it
let lpTimer = null, lpFired = false, lpStart = null;
renderer.domElement.addEventListener('pointerdown', e => {
	if (e.pointerType !== 'touch') { tapAction(e); return; } // mouse acts on press
	lpFired = false;
	lpStart = { x: e.clientX, y: e.clientY };
	const c = hoveredCard(e);
	lpTimer = setTimeout(() => {
		lpFired = true;
		if (c && c.flipped) { showTip(c.def, lpStart.x, lpStart.y); if (navigator.vibrate) navigator.vibrate(12); }
	}, 420);
});
renderer.domElement.addEventListener('pointerup', e => {
	if (e.pointerType !== 'touch') return;
	clearTimeout(lpTimer); lpTimer = null;
	if (lpFired) { hideTip(); lpStart = null; return; } // an inspect, not a tap
	lpStart = null;
	tapAction(e); // short tap flips / opens
});
renderer.domElement.addEventListener('pointercancel', () => { clearTimeout(lpTimer); lpTimer = null; lpFired = false; lpStart = null; hideTip(); });
addEventListener('keydown', e => {
	if (e.key === 'z' || e.key === 'Enter') {
		if (phase === 'idle' || phase === 'done') startOpen();
		else if (phase === 'revealing') {
			const next = cardMeshes.findIndex(c => !c.flipped);
			if (next >= 0) flip(next);
		}
	}
});
addEventListener('resize', () => {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(innerWidth, innerHeight);
	layoutCards(); // keep the cards on-screen after a resize / rotate
});

// ---------- hover tooltip: what does this card do? ----------
const esc = s => { const d = document.createElement('div'); d.textContent = s == null ? '' : String(s); return d.innerHTML; };
const tip = document.createElement('div');
tip.id = 'card-tip';
Object.assign(tip.style, {
	position: 'fixed', zIndex: '10001', pointerEvents: 'none', display: 'none', maxWidth: '290px',
	background: 'rgba(18,14,30,0.97)', border: '1px solid #8f6fff', borderRadius: '10px',
	padding: '10px 12px', color: '#e8e2f4', font: '13px "Segoe UI", sans-serif',
	boxShadow: '0 4px 18px rgba(0,0,0,0.6)', lineHeight: '1.35',
});
document.body.appendChild(tip);
function tipHtml(def) {
	const stat = def.type === 'creature' ? ` · ${def.attack}/${def.health}`
		: def.type === 'weapon' ? ` · ${def.attack}/${def.durability}`
		: def.type ? ` · ${def.type}` : '';
	const kw = def.keywords?.length ? `<div style="color:#9fd0ff;font-size:12px">${esc(def.keywords.join(', '))}</div>` : '';
	const cls = def.cardClass && def.cardClass !== 'neutral' ? ` ${esc(def.cardClass)}` : '';
	const kwLines = keywordsFor(def).map(k =>
		`<div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.12);font-size:11.5px;line-height:1.3"><b style="color:#9fd0ff">${esc(k.label)}</b> <span style="opacity:0.85">${esc(k.text)}</span></div>`).join('');
	return `<div style="font-weight:700;font-size:15px">${esc(def.name)} <span style="color:#ffd25f">(${def.cost ?? 0})</span></div>`
		+ `<div style="color:#c9b8ff;font-size:12px;text-transform:capitalize">${esc(def.rarity || 'common')}${cls}${stat}</div>`
		+ kw
		+ (def.description ? `<div style="margin-top:5px">${esc(def.description)}</div>` : '')
		+ kwLines;
}
function hoveredCard(e) {
	pointer.x = (e.clientX / innerWidth) * 2 - 1;
	pointer.y = -(e.clientY / innerHeight) * 2 + 1;
	raycaster.setFromCamera(pointer, camera);
	const hits = raycaster.intersectObjects(cardMeshes.map(c => c.mesh));
	return hits.length ? cardMeshes[hits[0].object.userData.idx] : null;
}
function showTip(def, cx, cy) {
	tip.innerHTML = tipHtml(def);
	tip.style.display = 'block';
	const x = Math.min(cx + 16, innerWidth - tip.offsetWidth - 8);
	const y = Math.min(cy + 16, innerHeight - tip.offsetHeight - 8);
	tip.style.left = Math.max(8, x) + 'px';
	tip.style.top = Math.max(8, y) + 'px';
}
function hideTip() { tip.style.display = 'none'; renderer.domElement.style.cursor = ''; }
// mouse hover → tooltip; a touch drag just cancels a pending long-press
renderer.domElement.addEventListener('pointermove', e => {
	if (e.pointerType === 'touch') {
		if (lpTimer && lpStart && Math.hypot(e.clientX - lpStart.x, e.clientY - lpStart.y) > 14) {
			clearTimeout(lpTimer); lpTimer = null;
		}
		return;
	}
	const c = hoveredCard(e);
	if (c && c.flipped) { showTip(c.def, e.clientX, e.clientY); renderer.domElement.style.cursor = 'help'; }
	else hideTip();
});
renderer.domElement.addEventListener('pointerleave', hideTip);

// ---------- loop ----------
const clock = new THREE.Clock();
function animate() {
	requestAnimationFrame(animate);
	const dt = Math.min(clock.getDelta(), 0.05);
	const t = clock.getElapsedTime();

	if (pack) {
		if (phase === 'tearing') {
			tearT += dt;
			pack.rotation.z = Math.sin(tearT * 40) * 0.08 * Math.min(1, tearT * 2);
			pack.scale.setScalar(1 + tearT * 0.25);
			if (tearT > 0.85) {
				burst(pack.position, '#c9b8ff', 70);
				scene.remove(pack);
				pack = null;
				revealCards();
			}
		} else {
			pack.position.y = Math.sin(t * 1.3) * 0.15;
			pack.rotation.y = Math.sin(t * 0.7) * 0.18;
		}
	}

	for (const c of cardMeshes) {
		c.mesh.position.lerp(c.target, 1 - Math.pow(0.002, dt));
		const targetRot = c.spin;
		c.mesh.rotation.y += (targetRot - c.mesh.rotation.y) * Math.min(1, dt * 7);
		if (c.flipped) c.mesh.position.y = c.target.y + Math.sin(t * 1.4 + c.mesh.userData.idx) * 0.05;
	}

	for (let i = bursts.length - 1; i >= 0; i--) {
		const b = bursts[i];
		b.life -= dt * 1.1;
		const pos = b.pts.geometry.attributes.position;
		for (let j = 0; j < b.vels.length; j++) {
			pos.setXYZ(j,
				pos.getX(j) + b.vels[j].x * dt,
				pos.getY(j) + b.vels[j].y * dt,
				pos.getZ(j) + b.vels[j].z * dt);
			b.vels[j].y -= dt * 3;
		}
		pos.needsUpdate = true;
		b.pts.material.opacity = Math.max(0, b.life);
		if (b.life <= 0) { scene.remove(b.pts); bursts.splice(i, 1); }
	}
	renderer.render(scene, camera);
}
animate();

// ---------- boot ----------
fetch('cards.json').then(r => r.json()).then(async data => {
	cards = data.cards;
	for (const d of cards) cardsById[d.id] = d;
	if (MP_ON) {
		const s = await MPX.freshState();
		mpPacks = s ? s.packs : 0;
	} else {
		Col.getCollection(cards); // seed starter collection on first visit
	}
	spawnPack();
	updateHud();
	window.__packs = { startOpen, flip, camera, get phase() { return phase; }, get cardMeshes() { return cardMeshes; }, Col };
});
