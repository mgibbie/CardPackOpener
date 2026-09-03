// packs.js — 3D pack opening: a booster hovers, tears open in a burst of
// light, and five cards fly out to be flipped one by one.
import * as THREE from 'three';
import { CARD_W, CARD_H, CARD_D, makeFaceTexture, makeBackTexture, RARITY_COLORS, artListeners, preloadArt, classNameOf } from './cardart.js';
import * as Col from './collection.js';
import * as MPX from './mpmode.js';
import { keywordsFor, richHtml } from './keywords.js';
import * as SFX from './sfx.js';
import { checkToasts as achCheck } from '../site/achievements.js';

// test-realm mode: packs are earned from dungeon runs and rolled server-side
const MP_ON = MPX.mpMode();
let mpPacks = 0;
let mpPulls = null; // ids the server rolled for the pack being torn open
let mpState = null; // the post-open account state (collection drives the NEW!/dust badges)

const container = document.getElementById('scene');
const DPR = Math.min(window.devicePixelRatio || 1, 2); // DPR-3 phones: 2x is visually identical at ~half the fill cost
const renderer = new THREE.WebGLRenderer({ antialias: DPR < 2, powerPreference: 'high-performance' });
renderer.setPixelRatio(DPR);
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
function packTexture(priceText = null) {
	const c = document.createElement('canvas');
	c.width = 512; c.height = 716;
	const ctx = c.getContext('2d');
	const g = ctx.createLinearGradient(0, 0, 512, 716);
	g.addColorStop(0, '#3b2c66');
	g.addColorStop(0.5, '#241a44');
	g.addColorStop(1, '#151029');
	ctx.fillStyle = g;
	ctx.fillRect(0, 0, 512, 716);
	// diagonal foil sheen bands + sparkle grain
	ctx.save();
	ctx.globalCompositeOperation = 'lighter';
	for (let i = -3; i < 8; i++) {
		const sheen = ctx.createLinearGradient(i * 140, 0, i * 140 + 200, 716);
		sheen.addColorStop(0, 'rgba(143,111,255,0)');
		sheen.addColorStop(0.5, `rgba(${i % 2 ? '186,150,255' : '110,190,255'},0.07)`);
		sheen.addColorStop(1, 'rgba(143,111,255,0)');
		ctx.fillStyle = sheen;
		ctx.beginPath();
		ctx.moveTo(i * 140, 0); ctx.lineTo(i * 140 + 90, 0);
		ctx.lineTo(i * 140 - 110, 716); ctx.lineTo(i * 140 - 200, 716);
		ctx.closePath(); ctx.fill();
	}
	for (let i = 0; i < 130; i++) {
		ctx.fillStyle = `rgba(220,205,255,${0.05 + Math.random() * 0.1})`;
		ctx.fillRect(Math.random() * 512, Math.random() * 716, 2, 2);
	}
	ctx.restore();
	// foil crimp top/bottom
	ctx.fillStyle = '#5a4a8a';
	ctx.fillRect(0, 0, 512, 42);
	ctx.fillRect(0, 674, 512, 42);
	for (let x = 0; x < 512; x += 16) {
		ctx.fillStyle = x % 32 ? '#6f5fa8' : '#4a3d75';
		ctx.fillRect(x, 8, 8, 26);
		ctx.fillRect(x, 682, 8, 26);
	}
	// brass gear sigil (matches the battle table's etching)
	const brass = ctx.createLinearGradient(126, 170, 386, 430);
	brass.addColorStop(0, '#8a6f3a'); brass.addColorStop(0.5, '#d9b866'); brass.addColorStop(1, '#8a6f3a');
	ctx.strokeStyle = brass;
	ctx.lineWidth = 12;
	ctx.beginPath(); ctx.arc(256, 300, 130, 0, Math.PI * 2); ctx.stroke();
	ctx.lineWidth = 4;
	ctx.beginPath(); ctx.arc(256, 300, 108, 0, Math.PI * 2); ctx.stroke();
	ctx.lineWidth = 12;
	for (let i = 0; i < 12; i++) {
		const a = (i / 12) * Math.PI * 2;
		ctx.beginPath();
		ctx.moveTo(256 + Math.cos(a) * 130, 300 + Math.sin(a) * 130);
		ctx.lineTo(256 + Math.cos(a) * 162, 300 + Math.sin(a) * 162);
		ctx.stroke();
	}
	// embossed title
	ctx.textAlign = 'center';
	ctx.font = 'bold 58px Georgia';
	ctx.fillStyle = 'rgba(0,0,0,0.55)';
	ctx.fillText('MAGEPUNK', 258, 323);
	ctx.fillStyle = '#f4eede';
	ctx.fillText('MAGEPUNK', 256, 320);
	ctx.font = 'bold 30px Georgia';
	ctx.fillStyle = '#c9b8ff';
	ctx.fillText('BOOSTER PACK', 256, 560);
	ctx.font = '24px Georgia';
	ctx.fillText(`${Col.PACK_SIZE} CARDS`, 256, 608);
	// gold-cost chip on the pack itself (local mode; MP packs are earned, not bought)
	if (priceText) {
		ctx.font = 'bold 26px Georgia';
		const pw = ctx.measureText(`🪙 ${priceText}`).width + 40;
		const px = 256 - pw / 2, py = 636, ph = 44;
		ctx.beginPath();
		ctx.roundRect(px, py, pw, ph, 22);
		ctx.fillStyle = 'rgba(20,14,36,0.78)';
		ctx.fill();
		ctx.lineWidth = 2.5;
		ctx.strokeStyle = '#d9a94a';
		ctx.stroke();
		ctx.font = 'bold 26px Georgia';
		ctx.fillStyle = '#ffd75e';
		ctx.fillText(`🪙 ${priceText}`, 256, py + 31);
	}
	// vignette
	const vg = ctx.createRadialGradient(256, 358, 170, 256, 358, 470);
	vg.addColorStop(0, 'rgba(0,0,0,0)');
	vg.addColorStop(1, 'rgba(0,0,0,0.38)');
	ctx.fillStyle = vg;
	ctx.fillRect(0, 0, 512, 716);
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	return tex;
}

const packMat = new THREE.MeshStandardMaterial({ map: packTexture(MP_ON ? null : `${Col.PACK_PRICE} GOLD`), roughness: 0.4, metalness: 0.35 });
const packSideMat = new THREE.MeshStandardMaterial({ color: '#241a44', roughness: 0.5 });
let pack = null;
// Hearthstone's shape: the sealed pack waits off to one side and you DRAG it
// into a slot to tear it. The slot sits where the cards will burst from, so the
// gesture points at the payoff.
const PACK_REST = new THREE.Vector3(-4.3, -0.3, 0.6);
const SLOT_POS = new THREE.Vector3(0, 0.1, 0);
const SNAP_R = 1.9;   // how close the pack must be dropped to count as "in"
let heldMat = null;   // the active pack's own face material (see armed flare)
function spawnPack() {
	if (pack) scene.remove(pack);
	heldMat = packMat.clone();
	pack = new THREE.Mesh(
		new THREE.BoxGeometry(3.1, 4.4, 0.25),
		[packSideMat, packSideMat, packSideMat, packSideMat, heldMat, heldMat]
	);
	pack.position.copy(PACK_REST);
	scene.add(pack);
}

// ---------- the slot ----------
// A ring you drop the pack into. It idles dim and slowly turning; when a
// dragged pack is close enough to count it flares and spins up, so the player
// knows the drop will take before they let go.
const slotRing = new THREE.Mesh(
	new THREE.TorusGeometry(1.55, 0.075, 12, 64),
	new THREE.MeshStandardMaterial({ color: '#6a5a9a', emissive: '#4b3f7a', emissiveIntensity: 0.5, roughness: 0.5 }),
);
slotRing.position.copy(SLOT_POS);
scene.add(slotRing);
const slotGlow = new THREE.Mesh(
	new THREE.CircleGeometry(1.5, 48),
	new THREE.MeshBasicMaterial({ color: '#8f6fff', transparent: true, opacity: 0.06 }),
);
slotGlow.position.copy(SLOT_POS).setZ(SLOT_POS.z - 0.05);
scene.add(slotGlow);
let slotArmed = false;   // a dragged pack is within SNAP_R
let slotBase = 1;        // layout scale; the armed pulse multiplies this
let packWobble = 0, lastOverPack = false; // hover-shimmy impulse (see animate)
function setSlotVisible(v) { slotRing.visible = v; slotGlow.visible = v; }

// Where the pack rests and where the ring sits depends on the shape of the
// screen. Wide: pack to the LEFT of a centred ring. Narrow (portrait phone):
// there is no room beside it, so the ring goes up top and the pack sits below
// it — and the camera pulls back to fit both.
function layoutScene() {
	const aspect = innerWidth / innerHeight;
	const wide = aspect > 1.05;
	// Portrait has to stack ring-over-pack, which needs ~8 world units of height
	// (3.1 ring + gap + 4.4 pack); pull the camera back and shrink the ring so
	// they don't overlap or clip the bottom edge.
	camera.position.z = wide ? 9.5 : 13;
	camera.updateProjectionMatrix();
	// half the visible world height at the play plane, from the camera FOV
	const halfH = Math.tan((camera.fov * Math.PI / 180) / 2) * (camera.position.z - 0.6);
	if (wide) {
		SLOT_POS.set(0, 0.1, 0);
		// keep the whole 3.1-wide pack inside the frustum, with a margin
		PACK_REST.set(-Math.min(halfH * aspect - 1.85, 3.6), -0.3, 0.6);
	} else {
		SLOT_POS.set(0, halfH * 0.44, 0);
		PACK_REST.set(0, -halfH * 0.44, 0.6);
	}
	slotBase = wide ? 1 : 0.82;
	slotRing.position.copy(SLOT_POS);
	slotGlow.position.copy(SLOT_POS).setZ(SLOT_POS.z - 0.05);
	dragPlane.constant = -PACK_REST.z;
	if (pack && !drag) pack.position.copy(PACK_REST);
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
		m.position.set(PACK_REST.x - 0.28 - i * 0.2, PACK_REST.y - 0.18 + i * 0.02, PACK_REST.z - 0.5 - i * 0.28);
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
		// fanned arc, Hearthstone-style: centre card highest, outer cards dip
		// and tilt outward slightly (rotation.z persists — the flip animation
		// only drives rotation.y)
		const k = (i - (N - 1) / 2) / Math.max(1, (N - 1) / 2); // -1 .. 1
		c.target.x = (i - (N - 1) / 2) * spread;
		c.target.y = -0.2 + (1 - k * k) * 0.34;
		c.mesh.rotation.z = -k * 0.09;
		c.mesh.scale.setScalar(scale);
	});
}

// burst particles
const bursts = [];
const tornBits = []; // wrapper pieces mid-tumble after the tear
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
	nextBtn: document.getElementById('next-btn'),
};
hud.nextBtn.addEventListener('click', startOpen);

function updateHud() {
	updateStack();
	hud.gold.textContent = MP_ON ? `${mpPacks} pack${mpPacks === 1 ? '' : 's'}` : `${Col.getGold()} gold`;
	if (phase === 'idle') {
		hud.hint.textContent = MP_ON
			? (mpPacks > 0 ? (drag ? 'Drop it in the ring' : `Drag a pack into the ring — ${mpPacks} waiting`)
				: 'No packs — finish a dungeon run (win or lose) to earn one!')
			: Col.getGold() >= Col.PACK_PRICE
				? (drag ? 'Drop it in the ring' : `Drag the pack into the ring — ${Col.PACK_PRICE} gold`)
				: `Not enough gold — win matches to earn more!`;
	} else if (phase === 'revealing') {
		const left = cardMeshes.filter(c => !c.flipped).length;
		hud.hint.textContent = left
			? `Tap a card or press Space to reveal (${left} left)`
			: 'Hover a card to see what it does — Space opens another pack';
	} else if (phase === 'done') {
		// linger on the pulls — only the button (or Z, or clicking the pack
		// itself) opens the next one, never a stray click
		const canOpen = MP_ON ? mpPacks > 0 : Col.getGold() >= Col.PACK_PRICE;
		hud.hint.textContent = canOpen
			? 'Take your time — hover a card, or drag the next pack in'
			: MP_ON ? 'That was your last pack — finish a dungeon run (win or lose) to earn more!'
				: 'Out of gold — win matches to earn more!';
		hud.nextBtn.hidden = !canOpen;
		if (canOpen) hud.nextBtn.textContent = MP_ON
			? `Open another pack (${mpPacks} left)`
			: `Open another pack — ${Col.PACK_PRICE} gold`;
	} else hud.hint.textContent = '';
	if (phase !== 'done') hud.nextBtn.hidden = true;
}

async function startOpen() {
	if (phase !== 'idle' && phase !== 'done') return;
	if (MP_ON) {
		// the server rolls the cards and spends the pack before anything tears
		const data = await MPX.call('open-pack');
		if (data.error) { hud.hint.textContent = data.error; return; }
		mpPulls = data.cards;
		mpPacks = data.state.packs;
		mpState = data.state;
		achCheck(data.state); // pack-count / collection achievements toast here
		preloadArt(mpPulls); // load the art during the tear so the reveal shows it
	} else if (!Col.spendGold(Col.PACK_PRICE)) { updateHud(); return; }
	for (const c of cardMeshes) { scene.remove(c.mesh); c.mesh.material[4].map?.dispose(); c.badge?.material.map?.dispose(); }
	cardMeshes = [];
	if (!pack) spawnPack();
	phase = 'tearing';
	SFX.play('packOpen');
	tearT = 0;
	updateHud();
}

// duplicate-above-playset pulls show their dust value; first copies say NEW!
const DUST_HINT = { common: 5, uncommon: 10, rare: 20, epic: 100, legendary: 400 }; // mirrors the server's DUST_VALUE
function makeBadge(text, fg, bg) {
	const c = document.createElement('canvas');
	c.width = 256; c.height = 88;
	const ctx = c.getContext('2d');
	ctx.beginPath(); ctx.roundRect(6, 6, 244, 76, 38);
	ctx.fillStyle = bg; ctx.fill();
	ctx.lineWidth = 5; ctx.strokeStyle = 'rgba(0,0,0,0.65)'; ctx.stroke();
	ctx.font = 'bold 46px "Segoe UI", sans-serif';
	ctx.textAlign = 'center';
	ctx.fillStyle = fg;
	ctx.fillText(text, 128, 60);
	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	const m = new THREE.Mesh(
		new THREE.PlaneGeometry(1.1, 0.38),
		new THREE.MeshBasicMaterial({ map: tex, transparent: true, depthTest: false })
	);
	m.position.set(0, CARD_H / 2 - 0.02, CARD_D / 2 + 0.03); // riding the card's top edge
	m.renderOrder = 5;
	m.visible = false; // shown on flip
	return m;
}

function revealCards() {
	const pulls = MP_ON ? mpPulls.map(id => cardsById[id]).filter(Boolean) : Col.rollPack(cards);
	// before-counts drive the badges (the MP state arrives with the pulls added)
	const pulledOf = {};
	for (const d of pulls) pulledOf[d.id] = (pulledOf[d.id] || 0) + 1;
	const beforeOf = {};
	if (MP_ON) {
		const col = (mpState && mpState.collection) || {};
		for (const d of pulls) beforeOf[d.id] = Math.max(0, (col[d.id] || 0) - pulledOf[d.id]);
	} else {
		const col = Col.getCollection(cards);
		for (const d of pulls) beforeOf[d.id] = col[d.id] || 0;
	}
	if (!MP_ON) Col.addToCollection(pulls.map(d => d.id));
	const seen = {};
	pulls.forEach((def, i) => {
		const face = new THREE.MeshStandardMaterial({ map: makeFaceTexture(def), roughness: 0.35, metalness: 0.15 });
		const back = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.5 });
		const mesh = new THREE.Mesh(cardGeo, [edgeMat, edgeMat, edgeMat, edgeMat, face, back]);
		mesh.position.set(0, 0, 0.5);
		mesh.rotation.y = Math.PI; // face away (back showing)
		mesh.userData.idx = i;
		mesh.visible = false; // hidden until its staggered burst beat
		scene.add(mesh);
		seen[def.id] = (seen[def.id] || 0) + 1;
		const copyN = (beforeOf[def.id] || 0) + seen[def.id];
		const cap = def.rarity === 'legendary' ? 1 : 2;
		let badge = null;
		if (copyN > cap) badge = makeBadge(`+${DUST_HINT[def.rarity] || 5} dust`, '#cfd6e2', '#3a4456');
		else if ((beforeOf[def.id] || 0) === 0 && seen[def.id] === 1) badge = makeBadge('NEW!', '#fff', '#b8952e');
		if (badge) mesh.add(badge);
		cardMeshes.push({
			mesh, def, flipped: false, badge, backMat: back,
			target: new THREE.Vector3(0, -0.2, REVEAL_Z),
			spin: Math.PI,
			delay: 0.1 + i * 0.13, // the staggered burst out of the wrapper
		});
	});
	layoutCards(); // spread them to fit the current screen
	phase = 'revealing';
	updateHud();
}

// expanding rings, for the pulls worth looking up from your phone for
const flashRings = [];
function shockwave(pos, color) {
	const m = new THREE.Mesh(
		new THREE.TorusGeometry(0.45, 0.035, 8, 40),
		new THREE.MeshBasicMaterial({ color, transparent: true, opacity: 0.9 }),
	);
	m.position.copy(pos);
	scene.add(m);
	flashRings.push({ mesh: m, t: 0 });
}

function flip(i) {
	const c = cardMeshes[i];
	if (!c || c.flipped) return;
	c.flipped = true;
	c.spin = 0; // rotate to face camera
	if (c.badge) c.badge.visible = true; // NEW! / dust value rides the reveal
	// legendary bursts TRUE GOLD (the rarity orange reads as epic-adjacent) and
	// gets its own fanfare instead of sharing the epic chime
	const col = c.def.rarity === 'legendary' ? '#ffd75e' : (RARITY_COLORS[c.def.rarity] || '#9aa0a6');
	SFX.play(c.def.rarity === 'legendary' ? 'legendary' : c.def.rarity === 'epic' ? 'rare' : 'cardPlay');
	burst(c.mesh.position, col, c.def.rarity === 'legendary' ? 60 : c.def.rarity === 'epic' ? 40 : 22);
	if (c.def.rarity === 'legendary' || c.def.rarity === 'epic') shockwave(c.mesh.position, col);
	if (c.def.rarity === 'legendary') setTimeout(() => shockwave(c.mesh.position, col), 140);
	if (c.def.rarity === 'legendary' || c.def.rarity === 'epic') {
		hud.toast.textContent = `${c.def.rarity.toUpperCase()}! ${c.def.name}`;
		hud.toast.style.opacity = 1;
		clearTimeout(flip._t);
		flip._t = setTimeout(() => { hud.toast.style.opacity = 0; }, 1800);
	}
	if (cardMeshes.every(x => x.flipped)) phase = 'done';
	updateHud();
}

// repaint revealed cards when the mana font (or real art) arrives so the pips
// upgrade from the letter fallback to the real symbols
artListeners.add(() => {
	for (const c of cardMeshes) {
		if (!c.flipped) continue;
		const nm = makeFaceTexture(c.def);
		c.mesh.material[4].map?.dispose();
		c.mesh.material[4].map = nm;
		c.mesh.material[4].needsUpdate = true;
	}
});

// ---------- input ----------
const raycaster = new THREE.Raycaster();
const pointer = new THREE.Vector2();
renderer.domElement.style.touchAction = 'none';

// a plain tap: flip the next card, or open a pack on the idle/done screen
function hitPack(e) {
	// during 'done' the torn pack is gone (pack === null) — the banked stack on
	// the left is the clickable "next pack" until startOpen respawns one
	const targets = [...stackMeshes];
	if (pack && pack.visible) targets.push(pack);
	if (!targets.length) return false;
	pointer.x = (e.clientX / innerWidth) * 2 - 1;
	pointer.y = -(e.clientY / innerHeight) * 2 + 1;
	raycaster.setFromCamera(pointer, camera);
	return raycaster.intersectObjects(targets).length > 0;
}

// ---------- drag the pack into the slot ----------
// The DROP is what opens a pack, not the press. A drag that never reaches the
// slot springs back and spends nothing, so a stray tap can't burn a pack.
const dragPlane = new THREE.Plane(new THREE.Vector3(0, 0, 1), -PACK_REST.z);
const dragPt = new THREE.Vector3();
let drag = null;
let springBack = false;

const canDrag = () => (phase === 'idle' || phase === 'done')
	&& pack && pack.visible && (MP_ON ? mpPacks > 0 : Col.getGold() >= Col.PACK_PRICE);

function pointerWorld(e) {
	pointer.x = (e.clientX / innerWidth) * 2 - 1;
	pointer.y = -(e.clientY / innerHeight) * 2 + 1;
	raycaster.setFromCamera(pointer, camera);
	raycaster.ray.intersectPlane(dragPlane, dragPt);
	return dragPt;
}
function beginDrag(e) {
	if (!canDrag() || !hitPack(e)) return false;
	drag = { grab: pack.position.clone().sub(pointerWorld(e)) };
	springBack = false;
	updateHud();
	return true;
}
function moveDrag(e) {
	if (!drag || !pack) return;
	pack.position.copy(pointerWorld(e)).add(drag.grab);
	slotArmed = pack.position.distanceTo(SLOT_POS) < SNAP_R;
}
function endDrag() {
	if (!drag || !pack) { drag = null; return false; }
	drag = null;
	if (slotArmed) {
		slotArmed = false;
		pack.position.copy(SLOT_POS);
		startOpen();
		return true;
	}
	springBack = true;
	updateHud();
	return false;
}

function tapAction(e) {
	if (phase === 'idle') return;   // idle opens by DRAGGING into the slot
	if (phase === 'done') {
		// no involuntary next pack: only a deliberate click on the pack (or the
		// button / Z key) tears the next one — clicking a card inspects it
		if (hitPack(e)) { startOpen(); return; }
		const c = hoveredCard(e);
		if (c && c.flipped) showTip(c.def, e.clientX, e.clientY);
		else hideTip();
		return;
	}
	if (phase !== 'revealing') return;
	const c = hoveredCard(e);
	if (c) flip(c.mesh.userData.idx);
}

// touch has no hover, so press-and-hold a revealed card to inspect it
let lpTimer = null, lpFired = false, lpStart = null;
renderer.domElement.addEventListener('pointerdown', e => {
	if (beginDrag(e)) { renderer.domElement.setPointerCapture?.(e.pointerId); return; }
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
	if (drag) { endDrag(); return; }
	if (e.pointerType !== 'touch') return;
	clearTimeout(lpTimer); lpTimer = null;
	if (lpFired) { hideTip(); lpStart = null; return; } // an inspect, not a tap
	lpStart = null;
	tapAction(e); // short tap flips / opens
});
renderer.domElement.addEventListener('pointercancel', () => { if (drag) { drag = null; springBack = true; } clearTimeout(lpTimer); lpTimer = null; lpFired = false; lpStart = null; hideTip(); });
// Space is the Hearthstone rhythm: tap to turn the next card, and once the
// last one is up, tap again to open another pack. preventDefault or the page
// scrolls under you on every flip.
function advance() {
	if (phase === 'revealing') {
		const next = cardMeshes.findIndex(c => !c.flipped);
		if (next >= 0) { flip(next); return; }
	}
	if (phase === 'idle' || phase === 'done') startOpen();
}
addEventListener('keydown', e => {
	if (e.key === 'z' || e.key === 'Enter') { advance(); return; }
	if (e.key === ' ' || e.code === 'Space') { e.preventDefault(); advance(); }
});
addEventListener('resize', () => {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(innerWidth, innerHeight);
	layoutScene();  // pack/ring swap between side-by-side and stacked
	layoutCards();  // keep the cards on-screen after a resize / rotate
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
	const cls = ` ${esc(classNameOf(def.cardClass))}`; // every card shows its class — neutral cards say "Neutral"
	const kwLines = keywordsFor(def).map(k =>
		`<div style="margin-top:5px;padding-top:5px;border-top:1px solid rgba(255,255,255,0.12);font-size:11.5px;line-height:1.3"><b style="color:#9fd0ff">${esc(k.label)}</b> <span style="opacity:0.85">${esc(k.text)}</span></div>`).join('');
	return `<div style="font-weight:700;font-size:15px">${esc(def.name)} <span style="color:#ffd25f">(${def.cost ?? 0})</span></div>`
		+ `<div style="color:#c9b8ff;font-size:12px;text-transform:capitalize">${esc(def.rarity || 'common')}${cls}${stat}</div>`
		+ kw
		+ (def.description ? `<div style="margin-top:5px">${richHtml(def.description)}</div>` : '')
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
	if (drag) { moveDrag(e); return; }   // a pack in hand owns the pointer
	if (e.pointerType === 'touch') {
		if (lpTimer && lpStart && Math.hypot(e.clientX - lpStart.x, e.clientY - lpStart.y) > 14) {
			clearTimeout(lpTimer); lpTimer = null;
		}
		return;
	}
	const c = hoveredCard(e);
	if (c && c.flipped) { showTip(c.def, e.clientX, e.clientY); renderer.domElement.style.cursor = 'help'; }
	else hideTip();
	// Hovering a FACE-DOWN card washes it in its rarity colour, the way
	// Hearthstone teases a pull before you commit to flipping it.
	for (const cm of cardMeshes) {
		if (!cm.backMat) continue;
		const lit = cm === c && !cm.flipped;
		cm.backMat.emissive.set(lit ? (RARITY_COLORS[cm.def.rarity] || '#9aa0a6') : 0x000000);
		cm.backMat.emissiveIntensity = lit ? 0.45 : 0;
	}
	// the pack invites the tear: brighten + pointer when hovered
	const overPack = !c && (phase === 'idle' || phase === 'done') && hitPack(e);
	if (overPack && !lastOverPack) packWobble = 1; // first touch: a quick shimmy
	lastOverPack = overPack;
	// the ACTIVE pack has its own cloned material (heldMat); tint that, or the
	// hover highlight silently stops working while the shared one lights the stack
	const hoverMat = heldMat || packMat;
	hoverMat.emissive.setHex(overPack ? 0x35245f : 0x000000);
	if (overPack) hoverMat.emissiveIntensity = 1;
	if (overPack && canDrag()) renderer.domElement.style.cursor = 'grab';
	if (overPack) renderer.domElement.style.cursor = 'pointer';
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
				burst(pack.position.clone().add(new THREE.Vector3(0, 1.9, 0)), '#ffd25f', 36);
				burst(pack.position, '#c9b8ff', 60);
				// the crimp strip rips off and spins away; the emptied wrapper
				// tumbles down out of frame
				const strip = new THREE.Mesh(new THREE.BoxGeometry(3.1, 0.5, 0.27), packSideMat);
				strip.position.copy(pack.position).add(new THREE.Vector3(0, 2.0, 0));
				strip.rotation.copy(pack.rotation);
				scene.add(strip);
				tornBits.push({ mesh: strip, vel: new THREE.Vector3(2.2, 5.5, 0.8), rv: new THREE.Vector3(3, 2, 7), life: 1 });
				tornBits.push({ mesh: pack, vel: new THREE.Vector3(-0.8, -3.2, 0.5), rv: new THREE.Vector3(-2.5, 1.2, -3), life: 1 });
				pack = null;
				revealCards();
			}
		} else if (drag) {
			// in hand: tilt with the motion, and flare gold once the drop would
			// take. The flare is on the PACK because the pack hides the ring.
			pack.rotation.y += (0.25 - pack.rotation.y) * Math.min(1, dt * 8);
			pack.rotation.z += ((slotArmed ? 0 : -0.12) - pack.rotation.z) * Math.min(1, dt * 8);
			pack.scale.setScalar(1 + (slotArmed ? 0.12 : 0.06));
			if (heldMat) {
				// gentle: enough to read as charged, not enough to wash the art out
				const want = slotArmed ? 0.11 + Math.sin(t * 8) * 0.03 : 0;
				heldMat.emissiveIntensity += (want - heldMat.emissiveIntensity) * Math.min(1, dt * 12);
				heldMat.emissive.setHex(0xffd25f);
			}
		} else if (springBack) {
			// missed the slot — float home; nothing was spent
			pack.position.lerp(PACK_REST, 1 - Math.pow(0.001, dt));
			pack.rotation.z += (0 - pack.rotation.z) * Math.min(1, dt * 8);
			pack.scale.setScalar(1);
			if (heldMat) heldMat.emissiveIntensity = Math.max(0, heldMat.emissiveIntensity - dt * 4);
			if (pack.position.distanceTo(PACK_REST) < 0.04) { pack.position.copy(PACK_REST); springBack = false; }
		} else {
			pack.position.x += (PACK_REST.x - pack.position.x) * Math.min(1, dt * 6);
			pack.position.z += (PACK_REST.z - pack.position.z) * Math.min(1, dt * 6);
			pack.position.y = PACK_REST.y + Math.sin(t * 1.3) * 0.15;
			pack.rotation.y = Math.sin(t * 0.7) * 0.18;
			// hover wobble: a decaying shimmy the first moment the cursor lands
			if (packWobble > 0) { pack.rotation.z = Math.sin(t * 16) * 0.07 * packWobble; packWobble = Math.max(0, packWobble - dt * 1.6); }
			else pack.rotation.z += (0 - pack.rotation.z) * Math.min(1, dt * 8);
			pack.scale.setScalar(1);
		}
	}

	// the slot: dim and slowly turning, flaring when a drop would take
	{
		const show = (phase === 'idle' || phase === 'done') && !!pack && pack.visible;
		setSlotVisible(show);
		if (show) {
			slotRing.rotation.z += dt * (slotArmed ? 1.6 : 0.35);
			const want = slotArmed ? 1.25 : 0.5 + Math.sin(t * 2) * 0.12;
			const m = slotRing.material;
			m.emissiveIntensity += (want - m.emissiveIntensity) * Math.min(1, dt * 9);
			m.emissive.setHex(slotArmed ? 0xffd25f : 0x4b3f7a);
			const s2 = slotBase * (slotArmed ? 1.7 : 1);
			slotRing.scale.setScalar(slotRing.scale.x + (s2 - slotRing.scale.x) * Math.min(1, dt * 9));
			slotGlow.material.opacity += ((slotArmed ? 0.16 : 0.06) - slotGlow.material.opacity) * Math.min(1, dt * 9);
		}
	}

	// shockwave rings: swell and fade
	for (let i = flashRings.length - 1; i >= 0; i--) {
		const r = flashRings[i];
		r.t += dt * 2.2;
		// stays near the card it came from — at 5x the ring filled the screen and
		// read as background rather than something bursting out of the card
		r.mesh.scale.setScalar(1 + r.t * 2.6);
		r.mesh.material.opacity = Math.max(0, 0.9 * (1 - r.t));
		if (r.t >= 1) { scene.remove(r.mesh); r.mesh.material.dispose(); flashRings.splice(i, 1); }
	}

	// torn wrapper pieces: gravity + tumble, gone in a second
	for (let i = tornBits.length - 1; i >= 0; i--) {
		const b = tornBits[i];
		b.life -= dt * 1.1;
		b.mesh.position.addScaledVector(b.vel, dt);
		b.vel.y -= dt * 9;
		b.mesh.rotation.x += b.rv.x * dt;
		b.mesh.rotation.y += b.rv.y * dt;
		b.mesh.rotation.z += b.rv.z * dt;
		if (b.life <= 0) { scene.remove(b.mesh); tornBits.splice(i, 1); }
	}

	for (const c of cardMeshes) {
		// staggered burst: each card waits its beat before flying to its seat
		if (c.delay > 0) { c.delay -= dt; continue; }
		c.mesh.visible = true;
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
fetch('cards.json').then(r => r.json()).then(async data => { // plain fetch: let the _headers 5-min cache skip the revalidation RTT
	cards = data.cards;
	for (const d of cards) cardsById[d.id] = d;
	if (MP_ON) {
		const s = await MPX.freshState();
		mpPacks = s ? s.packs : 0;
	} else {
		Col.getCollection(cards); // seed starter collection on first visit
	}
	spawnPack();
	layoutScene();
	updateHud();
	window.__packs = { startOpen, flip, camera, get phase() { return phase; }, get cardMeshes() { return cardMeshes; }, Col,
		// drag surface for tests: positions are world-space, project with camera
		get pack() { return pack; }, get dragging() { return !!drag; }, get slotArmed() { return slotArmed; },
		get springBack() { return springBack; }, SLOT_POS, PACK_REST, SNAP_R,
		get flashRings() { return flashRings; }, RARITY_COLORS };
});
