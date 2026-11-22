// themes.js — how a map looks (terrain3d.js draws it): its default ground, the cliff it stands on, how dense its props are,
// whether it stands in a sea. Pure data (the map maker and the node tests read it without three.js).
export const THEMES = Object.freeze({
	meadow: { ground: 'grass', side: 'earth' },
	forest: { ground: 'grass', side: 'earth', props: 1.6 },
	ruins: { ground: 'stone', side: 'rock' },
	spire: { ground: 'stone', side: 'basalt' },
	islands: { ground: 'sand', side: 'sandstone', sea: true },
	tower: { ground: 'wood', side: 'brick' },
	cave: { ground: 'dirt', side: 'rock' },
	snow: { ground: 'snow', side: 'rock' },
	volcano: { ground: 'stone', side: 'basalt' },
});
