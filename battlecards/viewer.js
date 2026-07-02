// viewer.js — Battlecards 3D card gallery (browse / tilt / flip).
import * as THREE from 'three';
import { CARD_W, CARD_H, CARD_D, makeFaceTexture, makeBackTexture } from './cardart.js';

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
