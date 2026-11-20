// rules/movefx.js — MOVE_FX: every move's effect (statuses, secondaries, heal / drain / recoil / multi-hit, ...).
// Moved VERBATIM out of overworld/battle.js (Poketactica stage 1, owner 2026-11-20): the overworld's battles and
// Poketactica read the SAME Pokémon rules from here. No DOM, no state, no randomness. battle.js imports them back.

// ---------- move effects (statuses, secondaries, heal/drain/recoil/multi-hit) ----------
// status ids: brn, psn, par, slp, frz
export const MOVE_FX = {
	// pure status infliction
	thunderwave: { status: 'par' }, stunspore: { status: 'par' }, glare: { status: 'par' },
	sleeppowder: { status: 'slp' }, spore: { status: 'slp' }, hypnosis: { status: 'slp' },
	sing: { status: 'slp' }, lovelykiss: { status: 'slp' }, grasswhistle: { status: 'slp' }, darkvoid: { status: 'slp' },
	poisonpowder: { status: 'psn' }, poisongas: { status: 'psn' },
	toxic: { status: 'psn', bad: true },
	willowisp: { status: 'brn' },
	// confusion, seeding, and side screens
	confuseray: { confuse: true }, supersonic: { confuse: true }, sweetkiss: { confuse: true },
	teeterdance: { confuse: true }, attract: { attract: true },
	confusion: { sec: { confuse: true, ch: 10 } }, psybeam: { sec: { confuse: true, ch: 10 } },
	dizzypunch: { sec: { confuse: true, ch: 20 } }, waterpulse: { sec: { confuse: true, ch: 20 } },
	dynamicpunch: { sec: { confuse: true, ch: 100 } }, signalbeam: { sec: { confuse: true, ch: 10 } },
	hurricane: { sec: { confuse: true, ch: 30 } },
	leechseed: { seed: true },
	reflect: { screen: 'reflect' }, lightscreen: { screen: 'light' }, auroraveil: { screen: 'both' },
	// secondary status/flinch chances on damaging moves
	ember: { sec: { status: 'brn', ch: 10 } }, flamethrower: { sec: { status: 'brn', ch: 10 } },
	fireblast: { sec: { status: 'brn', ch: 30 } }, firepunch: { sec: { status: 'brn', ch: 10 } },
	flamewheel: { sec: { status: 'brn', ch: 10 } }, heatwave: { sec: { status: 'brn', ch: 10 } },
	thundershock: { sec: { status: 'par', ch: 10 } }, thunderbolt: { sec: { status: 'par', ch: 10 } },
	thunder: { sec: { status: 'par', ch: 30 } }, thunderpunch: { sec: { status: 'par', ch: 10 } },
	spark: { sec: { status: 'par', ch: 30 } }, bodyslam: { sec: { status: 'par', ch: 30 } },
	lick: { sec: { status: 'par', ch: 30 } }, dragonbreath: { sec: { status: 'par', ch: 30 } },
	icebeam: { sec: { status: 'frz', ch: 10 } }, blizzard: { sec: { status: 'frz', ch: 10 } },
	icepunch: { sec: { status: 'frz', ch: 10 } }, powdersnow: { sec: { status: 'frz', ch: 10 } },
	poisonsting: { sec: { status: 'psn', ch: 30 } }, sludge: { sec: { status: 'psn', ch: 30 } },
	sludgebomb: { sec: { status: 'psn', ch: 30 } }, smog: { sec: { status: 'psn', ch: 40 } },
	poisonjab: { sec: { status: 'psn', ch: 30 } }, crosspoison: { sec: { status: 'psn', ch: 10 } },
	fakeout: { sec: { flinch: true, ch: 100 }, firstTurn: true },
	bite: { sec: { flinch: true, ch: 30 } }, headbutt: { sec: { flinch: true, ch: 30 } },
	rockslide: { sec: { flinch: true, ch: 30 } }, airslash: { sec: { flinch: true, ch: 30 } },
	ironhead: { sec: { flinch: true, ch: 30 } }, astonish: { sec: { flinch: true, ch: 30 } },
	zenheadbutt: { sec: { flinch: true, ch: 20 } }, darkpulse: { sec: { flinch: true, ch: 20 } },
	extrasensory: { sec: { flinch: true, ch: 10 } }, wingattack: {},
	// healing
	recover: { heal: 0.5 }, softboiled: { heal: 0.5 }, milkdrink: { heal: 0.5 },
	slackoff: { heal: 0.5 }, roost: { heal: 0.5 }, synthesis: { heal: 0.5 },
	morningsun: { heal: 0.5 }, moonlight: { heal: 0.5 }, shoreup: { heal: 0.5 },
	rest: { heal: 1, selfStatus: 'slp' },
	// drain / recoil / multi-hit
	absorb: { drain: 0.5 }, megadrain: { drain: 0.5 }, gigadrain: { drain: 0.5 },
	leechlife: { drain: 0.5 }, drainpunch: { drain: 0.5 }, dreameater: { drain: 0.5 },
	hornleech: { drain: 0.5 }, drainingkiss: { drain: 0.75 },
	doubleedge: { recoil: 1 / 3 }, takedown: { recoil: 0.25 }, submission: { recoil: 0.25 },
	flareblitz: { recoil: 1 / 3 }, bravebird: { recoil: 1 / 3 }, wildcharge: { recoil: 0.25 },
	headsmash: { recoil: 0.5 }, struggle: { recoil: 0.25 },
	doubleslap: { hits: [2, 5] }, furyattack: { hits: [2, 5] }, pinmissile: { hits: [2, 5] },
	furyswipes: { hits: [2, 5] }, spikecannon: { hits: [2, 5] }, barrage: { hits: [2, 5] },
	cometpunch: { hits: [2, 5] }, bulletseed: { hits: [2, 5] }, rockblast: { hits: [2, 5] },
	iciclespear: { hits: [2, 5] }, doublekick: { hits: [2, 2] }, bonemerang: { hits: [2, 2] },
	dualchop: { hits: [2, 2] }, doublehit: { hits: [2, 2] },
	// secondary stat drops on damaging moves
	acid: { sec: { stat: 'spd', d: -1, ch: 10 } }, psychic: { sec: { stat: 'spd', d: -1, ch: 10 } },
	shadowball: { sec: { stat: 'spd', d: -1, ch: 20 } }, crunch: { sec: { stat: 'def', d: -1, ch: 20 } },
	aurorabeam: { sec: { stat: 'atk', d: -1, ch: 10 } }, bubblebeam: { sec: { stat: 'spe', d: -1, ch: 10 } },
	bubble: { sec: { stat: 'spe', d: -1, ch: 10 } }, constrict: { sec: { stat: 'spe', d: -1, ch: 10 } },
	icywind: { sec: { stat: 'spe', d: -1, ch: 100 } }, mudslap: { sec: { stat: 'acc', d: -1, ch: 100 } },
	mudshot: { sec: { stat: 'spe', d: -1, ch: 100 } }, muddywater: { sec: { stat: 'acc', d: -1, ch: 30 } },
	rocktomb: { sec: { stat: 'spe', d: -1, ch: 100 } }, lowsweep: { sec: { stat: 'spe', d: -1, ch: 100 } },
	bulldoze: { sec: { stat: 'spe', d: -1, ch: 100 } }, snarl: { sec: { stat: 'spa', d: -1, ch: 100 } },
	moonblast: { sec: { stat: 'spa', d: -1, ch: 30 } }, energyball: { sec: { stat: 'spd', d: -1, ch: 10 } },
	focusblast: { sec: { stat: 'spd', d: -1, ch: 10 } }, flashcannon: { sec: { stat: 'spd', d: -1, ch: 10 } },
	earthpower: { sec: { stat: 'spd', d: -1, ch: 10 } }, irontail: { sec: { stat: 'def', d: -1, ch: 30 } },
	poisonfang: { sec: { status: 'psn', bad: true, ch: 50 } },
	// self stat costs after the hit lands
	overheat: { selfDrop: { spa: -2 } }, dracometeor: { selfDrop: { spa: -2 } },
	leafstorm: { selfDrop: { spa: -2 } }, psychoboost: { selfDrop: { spa: -2 } },
	closecombat: { selfDrop: { def: -1, spd: -1 } }, superpower: { selfDrop: { atk: -1, def: -1 } },
	hammerarm: { selfDrop: { spe: -1 } },
	// ---- Upscale 5 Batch 2: canonical mechanics restored to damaging moves that
	// were doing plain damage only (all confirmed absent + present in the data). ----
	// burn secondaries
	scald: { sec: { status: 'brn', ch: 30 } }, sacredfire: { sec: { status: 'brn', ch: 50 } },
	blueflare: { sec: { status: 'brn', ch: 20 } }, pyroball: { sec: { status: 'brn', ch: 10 } },
	steameruption: { sec: { status: 'brn', ch: 30 } }, scorchingsands: { sec: { status: 'brn', ch: 30 } },
	inferno: { sec: { status: 'brn', ch: 100 } }, searingshot: { sec: { status: 'brn', ch: 30 } },
	// flinch secondaries
	waterfall: { sec: { flinch: true, ch: 20 } }, iciclecrash: { sec: { flinch: true, ch: 30 } },
	steamroller: { sec: { flinch: true, ch: 30 } }, boneclub: { sec: { flinch: true, ch: 10 } },
	heartstamp: { sec: { flinch: true, ch: 30 } }, needlearm: { sec: { flinch: true, ch: 30 } },
	dragonrush: { sec: { flinch: true, ch: 20 } }, stomp: { sec: { flinch: true, ch: 30 } },
	// para / poison / accuracy-drop / confuse secondaries
	nuzzle: { sec: { status: 'par', ch: 100 } }, boltstrike: { sec: { status: 'par', ch: 20 } },
	forcepalm: { sec: { status: 'par', ch: 30 } }, gunkshot: { sec: { status: 'psn', ch: 30 } },
	barbbarrage: { sec: { status: 'psn', ch: 50 } }, direclaw: { sec: { status: 'psn', ch: 50 } }, // direclaw picks psn/par/slp; psn-only approximation
	nightdaze: { sec: { stat: 'acc', d: -1, ch: 40 } }, mudbomb: { sec: { stat: 'acc', d: -1, ch: 30 } },
	mirrorshot: { sec: { stat: 'acc', d: -1, ch: 30 } }, leaftornado: { sec: { stat: 'acc', d: -1, ch: 50 } },
	axekick: { sec: { confuse: true, ch: 30 } }, rockclimb: { sec: { confuse: true, ch: 20 } }, // crash-on-miss deferred
	// self-boost after a damaging hit
	flamecharge: { postBoost: { spe: 1 } }, trailblaze: { postBoost: { spe: 1 } },
	poweruppunch: { postBoost: { atk: 1 } }, torchsong: { postBoost: { spa: 1 } },
	chargebeam: { postBoost: { spa: 1 }, postBoostCh: 70 }, fierydance: { postBoost: { spa: 1 }, postBoostCh: 50 },
	meteormash: { postBoost: { atk: 1 }, postBoostCh: 20 },
	// multi-hit (were hitting once)
	bonerush: { hits: [2, 5] }, tailslap: { hits: [2, 5] }, watershuriken: { hits: [2, 5] }, armthrust: { hits: [2, 5] },
	dragondarts: { hits: [2, 2] }, geargrind: { hits: [2, 2] }, dualwingbeat: { hits: [2, 2] },
	twineedle: { hits: [2, 2], sec: { status: 'psn', ch: 20 } }, doubleironbash: { hits: [2, 2], sec: { flinch: true, ch: 30 } },
	tripleaxel: { hits: [3, 3] }, triplekick: { hits: [3, 3] }, tripledive: { hits: [3, 3] }, // flat ×3 (ramping power not modeled)
	scaleshot: { hits: [5, 5], postBoost: { spe: 1 }, selfDrop: { def: -1 } },
	// recoil (were pure upside)
	woodhammer: { recoil: 1 / 3 }, wavecrash: { recoil: 1 / 3 }, headcharge: { recoil: 0.25 },
	volttackle: { recoil: 1 / 3, sec: { status: 'par', ch: 10 } }, lightofruin: { recoil: 0.5 },
	chloroblast: { recoil: 0.5 }, steelbeam: { recoil: 0.5 }, mindblown: { recoil: 0.5 }, // steelbeam/mindblown: damage-based ≈ (real: half max HP)
	// recharge (were pure upside)
	roaroftime: { recharge: true }, rockwrecker: { recharge: true }, prismaticlaser: { recharge: true },
	eternabeam: { recharge: true }, meteorassault: { recharge: true },
	// PIVOT: deal damage, then the user switches out (U-turn is on 228 species and
	// just dealt damage before). Reuses the mid-turn a.me/a.foe swap Baton Pass
	// proves safe; no boosts pass. Auto-picks the next healthy benchmon (matching
	// Baton Pass's convention — no mid-move switch-choice UI).
	uturn: { pivot: true }, voltswitch: { pivot: true }, flipturn: { pivot: true },
	// fixed damage + OHKO
	seismictoss: { fixed: 'level' }, nightshade: { fixed: 'level' },
	dragonrage: { fixed: 40 }, sonicboom: { fixed: 20 }, psywave: { fixed: 'psywave' },
	superfang: { fixed: 'half' }, endeavor: { fixed: 'endeavor' },
	naturesmadness: { fixed: 'half' }, ruination: { fixed: 'half' },
	finalgambit: { fixed: 'userHP', sacrifice: true },
	// retaliation: pay back the last hit taken (category-gated, else it fails)
	counter: { fixed: 'counter' }, mirrorcoat: { fixed: 'mirrorcoat' },
	metalburst: { fixed: 'metalburst' }, comeuppance: { fixed: 'metalburst' },
	bide: { chargeText: 'is storing energy!', fixed: 'bide' },
	fissure: { ohko: true }, guillotine: { ohko: true }, horndrill: { ohko: true }, sheercold: { ohko: true },
	// two-turn charge / recharge / self-KO
	fly: { chargeText: 'flew up high!' }, dig: { chargeText: 'burrowed underground!' },
	dive: { chargeText: 'hid underwater!' }, bounce: { chargeText: 'sprang up!' },
	solarbeam: { chargeText: 'absorbed light!' }, skyattack: { chargeText: 'became cloaked in a harsh light!' },
	razorwind: { chargeText: 'whipped up a whirlwind!' }, skullbash: { chargeText: 'lowered its head!' },
	// These SEVEN had power in the table and no entry here, so they resolved in a
	// single turn at full strength — SHADOW FORCE was a 120-BP one-turn Ghost move.
	phantomforce: { chargeText: 'vanished instantly!', vanish: true, breaksProtect: true },
	shadowforce: { chargeText: 'vanished instantly!', vanish: true, breaksProtect: true },
	skydrop: { chargeText: 'took its target into the sky!', vanish: true },
	meteorbeam: { chargeText: 'is overflowing with space power!', selfBoost: { spa: 1 } },
	electroshot: { chargeText: 'absorbed electricity!', selfBoost: { spa: 1 } },
	freezeshock: { chargeText: 'became cloaked in freezing air!' },
	iceburn: { chargeText: 'became cloaked in freezing air!' },
	// nothing in the game broke Protect before this
	feint: { breaksProtect: true }, hyperspacefury: { breaksProtect: true },
	hyperspacehole: { breaksProtect: true },
	// LOCK-IN: rampage for 2-3 turns, then reel from confusion. Without the
	// drawback these were strictly-better 120-BP moves with no cost at all.
	thrash: { lockIn: true }, outrage: { lockIn: true }, petaldance: { lockIn: true },
	ragingfury: { lockIn: true },
	// UPROAR locks in the same way but keeps everything awake instead
	uproar: { lockIn: true, noSleep: true },
	// FUTURE SIGHT / DOOM DESIRE landed instantly for 120/140. They are supposed to
	// arrive two turns later, which is the entire point of using one.
	futuresight: { delayed: 2 }, doomdesire: { delayed: 2 },
	hyperbeam: { recharge: true }, gigaimpact: { recharge: true }, blastburn: { recharge: true },
	hydrocannon: { recharge: true }, frenzyplant: { recharge: true },
	selfdestruct: { selfKO: true }, explosion: { selfKO: true },
	// partial trapping
	wrap: { trap: 'Wrap' }, bind: { trap: 'Bind' }, firespin: { trap: 'Fire Spin' },
	whirlpool: { trap: 'Whirlpool' }, clamp: { trap: 'Clamp' }, sandtomb: { trap: 'Sand Tomb' },
	// utility status moves
	protect: { protect: true }, detect: { protect: true },
	yawn: { yawn: true }, haze: { haze: true },
	roar: { blow: true }, whirlwind: { blow: true },
	healbell: { cureParty: true }, aromatherapy: { cureParty: true }, refresh: { cureSelf: true },
	aquaring: { regen: true }, ingrain: { regen: true },
	bellydrum: { bellydrum: true }, painsplit: { painsplit: true },
	swagger: { confuse: true, foeBoost: { atk: 2 } }, flatter: { confuse: true, foeBoost: { spa: 1 } },
	// formerly dead status moves (plan batch E)
	toxicthread: { status: 'psn', foeBoost: { spe: -1 } },
	corrosivegas: { corrode: true },
	chillyreception: { weather: 'hail' }, // the self-switch half is not modeled
	powershift: { ownSwap: ['atk', 'def'] },
	// weather + terrain + field effects
	raindance: { weather: 'rain' }, sunnyday: { weather: 'sun' }, sandstorm: { weather: 'sand' },
	hail: { weather: 'hail' }, snowscape: { weather: 'hail' }, thunderstorm: { weather: 'rain' },
	electricterrain: { terrain: 'electric' }, grassyterrain: { terrain: 'grassy' },
	mistyterrain: { terrain: 'misty' }, psychicterrain: { terrain: 'psychic' }, stickyterrain: { terrain: 'grassy' },
	trickroom: { field: 'trickRoom' }, gravity: { field: 'gravity' },
	tailwind: { side: 'tailwind', turns: 4 }, safeguard: { side: 'safeguard', turns: 5 },
	mist: { side: 'mist', turns: 5 }, luckychant: { side: 'luckychant', turns: 5 },
	mudsport: { field: 'mudSport' }, watersport: { field: 'waterSport' },
	// protect variants + endure
	kingsshield: { protect: true }, obstruct: { protect: true }, silktrap: { protect: true },
	spikyshield: { protect: true }, banefulbunker: { protect: true }, burningbulwark: { protect: true },
	matblock: { protect: true }, craftyshield: { protect: true },
	// REAL side guards now, not personal-Protect aliases: QUICK GUARD walls the
	// whole side against priority moves, WIDE GUARD against spread moves
	quickguard: { sideGuard: 'quick' }, wideguard: { sideGuard: 'wide' }, endure: { endure: true },
	// FALSE SWIPE / HOLD BACK always leave the target at least 1 HP (even on a crit)
	falseswipe: { leaveOne: true }, holdback: { leaveOne: true },
	// entry hazards
	spikes: { hazard: 'spikes' }, toxicspikes: { hazard: 'toxicspikes' },
	stealthrock: { hazard: 'stealthrock' }, stickyweb: { hazard: 'stickyweb' },
	defog: { clearHazards: 'both', foeBoost2: { eva: -1 } }, tidyup: { clearHazards: 'both', selfBoost: { atk: 1, spe: 1 } },
	courtchange: { swapHazards: true },
	// switching tricks + sacrifices
	batonpass: { batonPass: true }, shedtail: { batonPass: true },
	partingshot: { partingShot: true }, teleport: { fleeSelf: true },
	memento: { memento: true }, healingwish: { healingWish: true }, lunardance: { healingWish: true },
	revivalblessing: { revive: true },
	// restriction
	disable: { restrict: 'disable' }, encore: { restrict: 'encore' }, taunt: { restrict: 'taunt' },
	torment: { restrict: 'torment' },
	meanlook: { noSwitch: true }, block: { noSwitch: true }, spiderweb: { noSwitch: true },
	octolock: { noSwitch: true }, fairylock: { noSwitch: true },
	magnetrise: { magnetRise: true }, telekinesis: { telekinesis: true },
	// call another move
	metronome: { call: 'metronome' }, copycat: { call: 'copycat' }, mirrormove: { call: 'mirror' },
	assist: { call: 'assist' }, sleeptalk: { call: 'sleeptalk' }, naturepower: { call: 'nature' },
	mimic: { mimic: true }, sketch: { mimic: true },
	// boosts with costs / special boosts
	clangoroussoul: { boostCost: { stats: { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 }, frac: 1 / 3 } },
	filletaway: { boostCost: { stats: { atk: 2, spa: 2, spe: 2 }, frac: 0.5 } },
	noretreat: { selfBoost: { atk: 1, def: 1, spa: 1, spd: 1, spe: 1 } },
	geomancy: { chargeText: 'is absorbing power!', selfBoost: { spa: 2, spd: 2, spe: 2 }, statusCharge: true },
	takeheart: { selfBoost: { spa: 1, spd: 1 }, cureSelfToo: true },
	stuffcheeks: { selfBoost: { def: 2 } }, acupressure: { acupressure: true },
	nobleroar: { foeBoost2: { atk: -1, spa: -1 } },
	venomdrench: { foeBoost2: { atk: -1, spa: -1, spe: -1 }, needsPoisoned: true },
	spicyextract: { foeBoost2: { atk: 2, def: -2 } },
	focusenergy: { focusEnergy: true }, laserfocus: { laserFocus: true },
	lockon: { lockOn: true }, mindreader: { lockOn: true },
	foresight: { foresight: true }, odorsleuth: { foresight: true }, miracleeye: { foresight: true },
	// healing extras
	lifedew: { heal: 0.5 }, healorder: { heal: 0.5 }, junglehealing: { heal: 0.25, cureSelfToo: true },
	lunarblessing: { heal: 0.25, cureSelfToo: true },
	floralhealing: { healTarget: 0.5 }, healpulse: { healTarget: 0.5 },
	wish: { wish: true }, strengthsap: { strengthSap: true },
	purify: { purify: true }, psychoshift: { psychoShift: true },
	nightmare: { nightmare: true }, perishsong: { perishSong: true }, destinybond: { destinyBond: true },
	spite: { spite: true },
	// stat swapping / copying
	psychup: { psychUp: true }, heartswap: { swapBoosts: 'all' },
	guardswap: { swapBoosts: 'guard' }, powerswap: { swapBoosts: 'power' },
	speedswap: { statSwap: ['spe'] }, guardsplit: { statAvg: ['def', 'spd'] },
	powersplit: { statAvg: ['atk', 'spa'] }, powertrick: { ownSwap: ['atk', 'def'] },
	topsyturvy: { invertBoosts: true },
	// self / target transformation
	transform: { transform: true }, substitute: { substitute: true },
	conversion: { typeSelf: 'firstmove' }, conversion2: { typeSelf: 'random' },
	camouflage: { typeSelf: 'Normal' }, reflecttype: { typeSelf: 'copy' },
	soak: { typeTarget: ['Water'] }, magicpowder: { typeTarget: ['Psychic'] },
	trickortreat: { addType: 'Ghost' }, forestscurse: { addType: 'Grass' },
	stockpile: { stockpile: true }, spitup: { spitUp: true }, swallow: { swallow: true },
	charge: { chargeUp: true }, splash: { splashMsg: true },
	// This block used to be gated on "no held items / no allies in this game" —
	// BOTH premises are now false: doubles ship and held items ship. The
	// ally-support family below is implemented, EMBARGO and MAGIC ROOM ride the
	// central itemFx gate, WONDER ROOM rides the damage formula's defense pick.
	// What still says noop needs machinery this engine genuinely lacks: move
	// interception (snatch/magiccoat/powder), action re-ordering mid-turn
	// (afteryou/quash/instruct/mefirst), or berry-forcing (teatime).
	// electrify/iondeluge ride the useMove type-rewrite chain now, and
	// healblock gates the heal/drain paths.
	allyswitch: { allySwitch: true }, aromaticmist: { allyBoost: { spd: 1 } },
	helpinghand: { helpingHand: true }, followme: { centerTaunt: true },
	ragepowder: { centerTaunt: true }, spotlight: { centerTaunt: true },
	decorate: { allyBoost: { atk: 2, spa: 2 } }, gearup: { allyBoost: { atk: 1, spa: 1 } },
	magneticflux: { allyBoost: { def: 1, spd: 1 } }, flowershield: { allyBoost: { def: 1 } },
	rototiller: { allyBoost: { atk: 1, spa: 1 } },
	afteryou: { noop: true }, embargo: { embargo: true },
	bestow: { itemGive: true },
	instruct: { noop: true }, mefirst: { noop: true },
	quash: { noop: true }, recycle: { recycle: true },
	snatch: { noop: true }, switcheroo: { itemSwap: true },
	magiccoat: { noop: true }, powder: { noop: true },
	trick: { itemSwap: true }, knockoff: { knockOff: true },
	thief: { steal: true }, covet: { steal: true },
	// the party tricks are canon-cosmetic, so a festive line IS the faithful
	// model — except HAPPY HOUR, whose payout doubling is real (prizeMoney)
	celebrate: { festMsg: 'Congratulations!' }, holdhands: { festMsg: 'They held hands. How heartwarming!' },
	happyhour: { happyHour: true },
	// doubles support, unlocked by the side-mechanics work
	coaching: { allyBoost: { atk: 1, def: 1 } }, dragoncheer: { allyCrit: true },
	healblock: { healBlock: true }, imprison: { imprison: true }, grudge: { grudgeSelf: true },
	teatime: { teatime: true },
	electrify: { electrifyTarget: true }, iondeluge: { ionDeluge: true },
	magicroom: { field: 'magicRoom' }, wonderroom: { field: 'wonderRoom' },
	doodle: { abilityCopy: true }, roleplay: { abilityCopy: true },
	skillswap: { abilitySwap: true }, entrainment: { abilityGive: true },
	gastroacid: { abilitySuppress: true }, worryseed: { abilitySet: 'insomnia' },
	simplebeam: { abilitySet: 'simple' },
};

// ---------- move-animation archetypes ----------
// Every attack used to play the same lunge-plus-sparks. Moves now classify
// into archetypes: a BEAM pours across the field, a SHOT lobs and bursts, a
