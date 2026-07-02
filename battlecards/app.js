// Magepunk Battlecards — Three.js 3D card prototype.
// Renders real cards from the game's cards.json as 3D objects with
// canvas-generated face textures, drag tilt, and flip animation.
import * as THREE from 'three';

const CARD_W = 2.5, CARD_H = 3.5, CARD_D = 0.02;

const RARITY_COLORS = {
	common:   '#9aa0a6',
	uncommon: '#4caf50',
	rare:     '#2196f3',
	epic:     '#9c27b0',
	legendary:'#ff9800',
};
const TYPE_COLORS = {
	creature: '#7a3b2e',
	sorcery:  '#5b3b8c',
	instant:  '#2e6a7a',
	land:     '#3b7a2e',
	artifact: '#6e6a5e',
};

// ---------- scene ----------
const container = document.getElementById('scene');
const renderer = new THREE.WebGLRenderer({ antialias: true });
renderer.setPixelRatio(window.devicePixelRatio);
renderer.setSize(innerWidth, innerHeight);
container.appendChild(renderer.domElement);

const scene = new THREE.Scene();
scene.background = new THREE.Color('#0e0b16');

const camera = new THREE.PerspectiveCamera(40, innerWidth / innerHeight, 0.1, 100);
camera.position.set(0, 0, 8);

scene.add(new THREE.AmbientLight(0xffffff, 0.9));
const key = new THREE.DirectionalLight(0xffffff, 1.6);
key.position.set(3, 5, 6);
scene.add(key);
const rim = new THREE.PointLight(0x8f6fff, 12, 30);
rim.position.set(-4, -2, 4);
scene.add(rim);

// subtle starfield backdrop
{
	const g = new THREE.BufferGeometry();
	const pts = [];
	for (let i = 0; i < 300; i++) {
		pts.push((Math.random() - 0.5) * 40, (Math.random() - 0.5) * 24, -6 - Math.random() * 10);
	}
	g.setAttribute('position', new THREE.Float32BufferAttribute(pts, 3));
	scene.add(new THREE.Points(g, new THREE.PointsMaterial({ color: 0x6f5fa8, size: 0.035 })));
}

// ---------- card face texture (canvas-drawn from card data) ----------
function roundRect(ctx, x, y, w, h, r) {
	ctx.beginPath();
	ctx.moveTo(x + r, y);
	ctx.arcTo(x + w, y, x + w, y + h, r);
	ctx.arcTo(x + w, y + h, x, y + h, r);
	ctx.arcTo(x, y + h, x, y, r);
	ctx.arcTo(x, y, x + w, y, r);
	ctx.closePath();
}

function makeFaceTexture(card) {
	const W = 512, H = 716;
	const c = document.createElement('canvas');
	c.width = W; c.height = H;
	const ctx = c.getContext('2d');

	const rarity = RARITY_COLORS[card.rarity] || RARITY_COLORS.common;
	const typeCol = TYPE_COLORS[card.type] || '#444';

	// border / frame
	ctx.fillStyle = '#191322';
	ctx.fillRect(0, 0, W, H);
	ctx.strokeStyle = rarity;
	ctx.lineWidth = 10;
	roundRect(ctx, 10, 10, W - 20, H - 20, 26);
	ctx.stroke();

	// inner background
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
	ctx.font = 'bold 34px Georgia';
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

	// art box (procedural gradient placeholder)
	const art = ctx.createLinearGradient(0, 120, W, 430);
	art.addColorStop(0, typeCol);
	art.addColorStop(1, '#120d1d');
	ctx.fillStyle = art;
	roundRect(ctx, 40, 116, W - 80, 300, 10);
	ctx.fill();
	// sigil
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
	ctx.font = 'italic 26px Georgia';
	const typeLine = card.type.toUpperCase() + '  ·  ' + (card.rarity || 'common').toUpperCase();
	ctx.fillText(typeLine, 44, 452);

	// description (word-wrapped)
	ctx.fillStyle = '#e8e2f4';
	ctx.font = '28px Georgia';
	const words = (card.description || '').split(' ');
	let line = '', y = 502;
	for (const w of words) {
		if (ctx.measureText(line + w).width > W - 100) {
			ctx.fillText(line, 48, y);
			line = w + ' ';
			y += 38;
		} else {
			line += w + ' ';
		}
	}
	ctx.fillText(line, 48, y);

	// attack / health plates for creatures
	if (card.type === 'creature') {
		ctx.font = 'bold 44px Georgia';
		ctx.textAlign = 'center';
		ctx.fillStyle = '#b3402e';
		roundRect(ctx, 40, H - 110, 110, 66, 12);
		ctx.fill();
		ctx.fillStyle = '#2e7db3';
		roundRect(ctx, W - 150, H - 110, 110, 66, 12);
		ctx.fill();
		ctx.fillStyle = '#fff';
		ctx.fillText(String(card.attack ?? 0), 95, H - 75);
		ctx.fillText(String(card.health ?? 0), W - 95, H - 75);
		ctx.textAlign = 'left';
	}

	const tex = new THREE.CanvasTexture(c);
	tex.colorSpace = THREE.SRGBColorSpace;
	tex.anisotropy = renderer.capabilities.getMaxAnisotropy();
	return tex;
}

function makeBackTexture() {
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
	// gear + spark motif ("magepunk")
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

// ---------- card mesh ----------
const backTex = makeBackTexture();
let cardMesh = null;

function buildCard(card) {
	if (cardMesh) {
		scene.remove(cardMesh);
		cardMesh.geometry.dispose();
	}
	const geo = new THREE.BoxGeometry(CARD_W, CARD_H, CARD_D);
	const edge = new THREE.MeshStandardMaterial({ color: '#241b38', roughness: 0.8 });
	const front = new THREE.MeshStandardMaterial({
		map: makeFaceTexture(card), roughness: 0.35, metalness: 0.15,
	});
	const back = new THREE.MeshStandardMaterial({ map: backTex, roughness: 0.5 });
	cardMesh = new THREE.Mesh(geo, [edge, edge, edge, edge, front, back]);
	scene.add(cardMesh);
}

// ---------- interaction ----------
let cards = [], idx = 0;
let targetRotY = 0, flipped = false;
let dragging = false, lastX = 0, lastY = 0;
let tiltX = 0, tiltY = 0;

function show(i) {
	idx = (i + cards.length) % cards.length;
	const card = cards[idx];
	buildCard(card);
	flipped = false;
	targetRotY = 0;
	cardMesh.rotation.y = -Math.PI; // spin-in entrance
	document.querySelector('#cardinfo .name').textContent =
		`${card.name}  (${idx + 1}/${cards.length})`;
	document.querySelector('#cardinfo .desc').textContent = card.description || '';
}

renderer.domElement.addEventListener('pointerdown', e => {
	dragging = true; lastX = e.clientX; lastY = e.clientY;
});
addEventListener('pointerup', e => {
	dragging = false;
	if (Math.abs(e.clientX - lastX) < 4 && Math.abs(e.clientY - lastY) < 4) {
		flipped = !flipped;
		targetRotY = flipped ? Math.PI : 0;
	}
});
addEventListener('pointermove', e => {
	if (!dragging) {
		tiltY = (e.clientX / innerWidth - 0.5) * 0.55;
		tiltX = (e.clientY / innerHeight - 0.5) * 0.45;
	}
});
addEventListener('keydown', e => {
	if (e.key === 'ArrowRight') show(idx + 1);
	if (e.key === 'ArrowLeft') show(idx - 1);
	if (e.key === ' ' || e.key === 'Enter') { flipped = !flipped; targetRotY = flipped ? Math.PI : 0; }
});
document.getElementById('next').onclick = () => show(idx + 1);
document.getElementById('prev').onclick = () => show(idx - 1);
document.getElementById('flip').onclick = () => { flipped = !flipped; targetRotY = flipped ? Math.PI : 0; };

addEventListener('resize', () => {
	camera.aspect = innerWidth / innerHeight;
	camera.updateProjectionMatrix();
	renderer.setSize(innerWidth, innerHeight);
});

// ---------- main loop ----------
const clock = new THREE.Clock();
function animate() {
	requestAnimationFrame(animate);
	const t = clock.getElapsedTime();
	if (cardMesh) {
		// ease toward flip target + mouse tilt + idle float
		cardMesh.rotation.y += (targetRotY + tiltY - cardMesh.rotation.y) * 0.08;
		cardMesh.rotation.x += (tiltX - cardMesh.rotation.x) * 0.08;
		cardMesh.position.y = Math.sin(t * 1.2) * 0.06;
	}
	renderer.render(scene, camera);
}
animate();

// ---------- boot ----------
fetch('cards.json')
	.then(r => r.json())
	.then(data => {
		cards = data.cards;
		show(0);
	});
