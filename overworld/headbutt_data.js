// headbutt_data.js — Crystal's headbutt-tree encounters, harvested by
// tools/gen_headbutt.mjs from pokecrystal's treemons.asm / treemon_maps.asm.
// Sets carry [weight%, species, level] rows; 10% of shakes read the RARE
// table (where HERACROSS lives), matching the original's rare-tree odds.
export const HEADBUTT_SETS = {
	"canyon": {
		"common": [
			[
				50,
				"spearow",
				10
			],
			[
				15,
				"spearow",
				10
			],
			[
				15,
				"spearow",
				10
			],
			[
				10,
				"aipom",
				10
			],
			[
				5,
				"aipom",
				10
			],
			[
				5,
				"aipom",
				10
			]
		],
		"rare": [
			[
				50,
				"spearow",
				10
			],
			[
				15,
				"heracross",
				10
			],
			[
				15,
				"heracross",
				10
			],
			[
				10,
				"aipom",
				10
			],
			[
				5,
				"aipom",
				10
			],
			[
				5,
				"aipom",
				10
			]
		]
	},
	"town": {
		"common": [
			[
				50,
				"spearow",
				10
			],
			[
				15,
				"ekans",
				10
			],
			[
				15,
				"spearow",
				10
			],
			[
				10,
				"aipom",
				10
			],
			[
				5,
				"aipom",
				10
			],
			[
				5,
				"aipom",
				10
			]
		],
		"rare": [
			[
				50,
				"spearow",
				10
			],
			[
				15,
				"heracross",
				10
			],
			[
				15,
				"heracross",
				10
			],
			[
				10,
				"aipom",
				10
			],
			[
				5,
				"aipom",
				10
			],
			[
				5,
				"aipom",
				10
			]
		]
	},
	"route": {
		"common": [
			[
				50,
				"hoothoot",
				10
			],
			[
				15,
				"spinarak",
				10
			],
			[
				15,
				"ledyba",
				10
			],
			[
				10,
				"exeggcute",
				10
			],
			[
				5,
				"exeggcute",
				10
			],
			[
				5,
				"exeggcute",
				10
			]
		],
		"rare": [
			[
				50,
				"hoothoot",
				10
			],
			[
				15,
				"pineco",
				10
			],
			[
				15,
				"pineco",
				10
			],
			[
				10,
				"exeggcute",
				10
			],
			[
				5,
				"exeggcute",
				10
			],
			[
				5,
				"exeggcute",
				10
			]
		]
	},
	"kanto": {
		"common": [
			[
				50,
				"hoothoot",
				10
			],
			[
				15,
				"ekans",
				10
			],
			[
				15,
				"hoothoot",
				10
			],
			[
				10,
				"exeggcute",
				10
			],
			[
				5,
				"exeggcute",
				10
			],
			[
				5,
				"exeggcute",
				10
			]
		],
		"rare": [
			[
				50,
				"hoothoot",
				10
			],
			[
				15,
				"pineco",
				10
			],
			[
				15,
				"pineco",
				10
			],
			[
				10,
				"exeggcute",
				10
			],
			[
				5,
				"exeggcute",
				10
			],
			[
				5,
				"exeggcute",
				10
			]
		]
	},
	"lake": {
		"common": [
			[
				50,
				"hoothoot",
				10
			],
			[
				15,
				"venonat",
				10
			],
			[
				15,
				"hoothoot",
				10
			],
			[
				10,
				"exeggcute",
				10
			],
			[
				5,
				"exeggcute",
				10
			],
			[
				5,
				"exeggcute",
				10
			]
		],
		"rare": [
			[
				50,
				"hoothoot",
				10
			],
			[
				15,
				"pineco",
				10
			],
			[
				15,
				"pineco",
				10
			],
			[
				10,
				"exeggcute",
				10
			],
			[
				5,
				"exeggcute",
				10
			],
			[
				5,
				"exeggcute",
				10
			]
		]
	},
	"forest": {
		"common": [
			[
				50,
				"hoothoot",
				10
			],
			[
				15,
				"pineco",
				10
			],
			[
				15,
				"pineco",
				10
			],
			[
				10,
				"noctowl",
				10
			],
			[
				5,
				"butterfree",
				10
			],
			[
				5,
				"beedrill",
				10
			]
		],
		"rare": [
			[
				50,
				"hoothoot",
				10
			],
			[
				15,
				"caterpie",
				10
			],
			[
				15,
				"weedle",
				10
			],
			[
				10,
				"hoothoot",
				10
			],
			[
				5,
				"metapod",
				10
			],
			[
				5,
				"kakuna",
				10
			]
		]
	}
};

// map file -> set (only maps that shipped and have trees worth hitting)
export const HEADBUTT_MAPS = {
	"Route26": "kanto",
	"Route27": "kanto",
	"Route29": "route",
	"Route30": "route",
	"Route31": "route",
	"Route32": "kanto",
	"Route33": "town",
	"Route34": "route",
	"Route35": "route",
	"Route36": "route",
	"Route37": "route",
	"Route38": "route",
	"Route39": "route",
	"Route42": "town",
	"Route43": "lake",
	"Route44": "canyon",
	"Route45": "canyon",
	"Route46": "canyon",
	"AzaleaTown": "town",
	"LakeOfRage": "lake",
	"IlexForest": "forest",
	"CianwoodCity": "rock",
	"Route40": "rock",
	"DarkCaveVioletEntrance": "rock",
	"SlowpokeWellB1f": "rock"
};
