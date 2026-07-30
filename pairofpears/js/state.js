// state.js — shared game state + constants for the native Pair of Pears
// (the config.lua equivalent). W×H is the fixed 800×600 design resolution.
export const W = 800, H = 600;

// tool defs: fixed hit radius (multipliers are visual-only), miss-boom offset
export const TOOLS = {
	flyswatter: { img: 'flyswatter', hitRadius: 18, offset: [10, 5], hitboxMult: 1.0 },
	bugnet: { img: 'bugnet', hitRadius: 22, offset: [10, 15], hitboxMult: 1.2 },
	camera: { img: 'camera', hitRadius: 15, offset: [0, 0], hitboxMult: 1.0 },
};

// creature defs: speed(px/s), size(px), ri(random re-aim interval s), sprite, bird?, photo points
export const CREATURES = {
	lanternfly: { speed: 100, size: 32, ri: 1.0, img: 'spottedlanternfly' },
	mantis: { speed: 100, size: 40, ri: 1.5, img: 'mantis' },
	cardinal: { speed: 120, size: 36, ri: 1.2, img: 'cardinal', bird: true, photo: 25 },
	flamingo: { speed: 90, size: 40, ri: 1.4, img: 'flamingo', bird: true, photo: 10 },
	owl: { speed: 105, size: 38, ri: 1.2, img: 'owl', bird: true, photo: 10 },
	swan: { speed: 85, size: 42, ri: 1.3, img: 'swan', bird: true, photo: 10 },
	sparrow: { speed: 90, size: 36, ri: 1.2, img: 'sparrow', bird: true, photo: 10 },
	lessergoldfinch: { speed: 90, size: 34, ri: 1.2, img: 'lessergoldfinch', bird: true, photo: 10 },
	bluejay: { speed: 95, size: 38, ri: 1.2, img: 'bluejay', bird: true, photo: 10 },
	robin: { speed: 85, size: 36, ri: 1.3, img: 'robin', bird: true, photo: 10 },
	parrot: { speed: 100, size: 40, ri: 1.1, img: 'parrot', bird: true, photo: 10 },
	peacock: { speed: 110, size: 48, ri: 1.4, img: 'peacock', bird: true, photo: 10 },
	turkey: { speed: 105, size: 44, ri: 1.5, img: 'turkey', bird: true, photo: 10 },
};
export const BIRDS = ['cardinal', 'flamingo', 'owl', 'swan', 'sparrow', 'lessergoldfinch', 'bluejay', 'robin', 'parrot', 'peacock', 'turkey'];
export const NOTEBOOK_ORDER = [...BIRDS, 'lanternfly', 'mantis'];

export const G = {
	// top-level state machine: 'splash' | 'game' | 'pear_splash' | 'pear_game'
	state: 'splash',
	splashTimer: 0, fadeAlpha: 0,
	pearSplashTimer: 0, pearSplashAlpha: 0,

	// synthesized cursor (arrows/dpad move it; taps set it; A acts at it)
	cursor: { x: W / 2, y: H / 2 },

	// meadow economy / progression
	starCount: 0, berryCount: 0,
	starsPerFly: 1,
	moreStarsLevel: 0, moreStarsCost: 6,
	moreSizeLevel: 0, moreSizeCost: 15,
	boomHitboxMultiplier: 1.0,
	cameraUpgradeCost: 500,
	bugnetUnlocked: false, cameraUnlocked: false, birdPoolUnlocked: false,

	// meadow runtime
	creatures: [],
	spawnTimer: 0, spawnInterval: 1,
	mantisSpawnTimer: 0, mantisSpawnInterval: 5,
	birdSpawnTimer: 0, birdSpawnInterval: 15,
	boom: { x: 0, y: 0, timer: 0, duration: 0.3, active: false },

	// tools
	tools: ['flyswatter'], activeTool: 'flyswatter',

	// menus
	shopOpen: false, phoneMenuOpen: false, phoneActivePage: null,

	// notebook / photography
	photographedBirds: {}, photographedCreatures: {}, notebookIndex: null,
};

export function resetMeadow() {
	Object.assign(G, {
		starCount: 0, berryCount: 0, starsPerFly: 1,
		moreStarsLevel: 0, moreStarsCost: 6, moreSizeLevel: 0, moreSizeCost: 15,
		boomHitboxMultiplier: 1.0, bugnetUnlocked: false, cameraUnlocked: false, birdPoolUnlocked: false,
		creatures: [], spawnTimer: 0, mantisSpawnTimer: 0, birdSpawnTimer: 0,
		tools: ['flyswatter'], activeTool: 'flyswatter',
		shopOpen: false, phoneMenuOpen: false, phoneActivePage: null,
		photographedBirds: {}, photographedCreatures: {}, notebookIndex: null,
	});
	G.boom.active = false;
}
