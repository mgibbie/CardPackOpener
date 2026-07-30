// assets.js — loads all Pair of Pears sprites + audio for the native (no-love.js)
// build. IMG.<name> is an HTMLImageElement; SFX/MUSIC are HTMLAudioElement.
export const IMG = {};
export const SFX = {};

const NAMES = ['8ball', 'apple', 'autoclickbutton', 'avocado', 'background', 'bag', 'banana', 'berry', 'blueberry', 'bluejay', 'bomb', 'boom', 'broccoli', 'bugnet', 'buybutton', 'cactus', 'camera', 'camera2', 'cardinal', 'carrot', 'cd', 'cherry', 'clock', 'clover', 'club', 'coconut', 'crabapple', 'diamond', 'dice', 'dna', 'droplet', 'egg', 'eggplant', 'farmersmarket', 'feather', 'flamingo', 'flowercursor', 'flutter', 'flyswatter', 'gem', 'globe', 'grape', 'hamsa', 'heart', 'hut', 'juicebox', 'key', 'kiwi', 'lemon', 'lessergoldfinch', 'lime', 'mango', 'mantis', 'manzana', 'moresizebutton', 'morestarsbutton', 'notebook', 'olive', 'onion', 'orange', 'owl', 'parrot', 'pawn', 'peach', 'peacock', 'pear', 'pepper', 'persimmon', 'phone', 'pin', 'pineapple', 'plum', 'pot', 'potato', 'pumpkin', 'puzzlepiece', 'rhubarb', 'robin', 'save', 'settingsgear', 'skull', 'skunk', 'slotmachine', 'spade', 'sparkles', 'sparrow', 'spottedlanternfly', 'star', 'strawberry', 'swan', 'temple', 'ticket', 'tomato', 'turkey', 'watermelon', 'wrentit'];

// a fruit's sprite key is just its name; a few aliases the game logic uses
export const ALIAS = { lanternfly: 'spottedlanternfly' };

export function loadAll() {
	const jobs = NAMES.map(name => new Promise(res => {
		const im = new Image();
		im.onload = () => res();
		im.onerror = () => res(); // tolerate a missing sprite; game guards on .complete
		im.src = 'assets/' + name + '.png';
		IMG[name] = im;
	}));
	// audio (best-effort; browsers gate autoplay until first input)
	SFX.squish = new Audio('assets/audio/squish.wav');
	SFX.music = new Audio('assets/audio/meadows_theme.ogg');
	SFX.music.loop = true;
	SFX.music.volume = 0.5;
	return Promise.all(jobs);
}

export const img = key => IMG[ALIAS[key] || key] || null;
