// packs.js — 3D pack opening: a booster hovers, tears open in a burst of
// light, and five cards fly out to be flipped one by one.
import * as THREE from 'three';
import { CARD_W, CARD_H, CARD_D, makeFaceTexture, makeBackTexture, RARITY_COLORS } from './cardart.js';
import * as Col from './collection.js';

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

// ---------- cards ----------
const backTex = makeBackTexture();
const edgeMat = new THREE.MeshStandardMaterial({ color: '#241b38', roughness: 0.8 });
const cardGeo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);
let cardMeshes = []; // { mesh, def, flipped, target, spin }

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
	hud.gold.textContent = `${Col.getGold()} gold`;
	if (phase === 'idle') {
		hud.hint.textContent = Col.getGold() >= Col.PACK_PRICE
			? `[Z / click] open a pack — ${Col.PACK_PRICE} gold`
			: `Not enough gold — win matches to earn more!`;
	} else if (phase === 'revealing') {
		const left = cardMeshes.filter(c => !c.flipped).length;
		hud.hint.textContent = left ? `Click cards to reveal (${left} left)` : '';
	} else if (phase === 'done') {
		hud.hint.textContent = '[Z / click] open another pack';
	} else hud.hint.textContent = '';
}

function startOpen() {
	if (phase !== 'idle' && phase !== 'done') return;
	if (!Col.spendGold(Col.PACK_PRICE)) { updateHud(); return; }
	for (const c of cardMeshes) { scene.remove(c.mesh); c.mesh.material[4].map?.dispose(); }
	cardMeshes = [];
	if (!pack) spawnPack();
	phase = 'tearing';
	tearT = 0;
	updateHud();
}

function revealCards() {
	const pulls = Col.rollPack(cards);
	Col.addToCollection(pulls.map(d => d.id));
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
			target: new THREE.Vector3((i - (Col.PACK_SIZE - 1) / 2) * 2.9, -0.2, 1.5),
			spin: Math.PI,
		});
	});
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
renderer.domElement.addEventListener('pointerdown', e => {
	if (phase === 'idle' || phase === 'done') { startOpen(); return; }
	if (phase !== 'revealing') return;
	pointer.x = (e.clientX / innerWidth) * 2 - 1;
	pointer.y = -(e.clientY / innerHeight) * 2 + 1;
	raycaster.setFromCamera(pointer, camera);
	const hits = raycaster.intersectObjects(cardMeshes.map(c => c.mesh));
	if (hits.length) flip(hits[0].object.userData.idx);
});
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
});

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
fetch('cards.json').then(r => r.json()).then(data => {
	cards = data.cards;
	for (const d of cards) cardsById[d.id] = d;
	Col.getCollection(cards); // seed starter collection on first visit
	spawnPack();
	updateHud();
	window.__packs = { startOpen, flip, get phase() { return phase; }, get cardMeshes() { return cardMeshes; }, Col };
});
