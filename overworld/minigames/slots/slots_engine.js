// slots_engine.js — Pokémon Crystal's slot machine, ported frame for frame from
// pokecrystal engine/games/slot_machine.asm (no DOM, node-testable).
//
// One step() is one Game Boy frame of SlotsLoop: the SlotsJumptable action, then
// Slots_SpinReels (each reel's ReelActionJumptable runs whenever the reel sits on a
// symbol boundary), then the Golem / Chansey / egg sprite animations. The reel
// strips, the bias tables (normal and lucky), every stop/manipulation mode (reel 2
// skip-to-7, reel 3 slow advance, Golem, Chansey) and the payout table are the
// decomp's, quirks included — e.g. with no bias the third reel never stops on a
// line, so a win always comes from a bias; and SEVEN bias persists across spins
// until sevens line up. Random() is a byte, injectable (`rng`) for tests.
//
// Menus and text (Slots_AskBet, the payout text, Slots_AskPlayAgain) block the
// loop as on the GB: `ui` holds the open one and press() answers it. Text prints
// instantly; Slots_WaitSFX's 16-frame stalls become `freeze` frames.

export const SEVEN = 0x00, POKEBALL = 0x04, CHERRY = 0x08, PIKACHU = 0x0c, SQUIRTLE = 0x10, STARYU = 0x14;
export const SYMBOL_NAMES = { [SEVEN]: 'SEVEN', [POKEBALL]: 'POKEBALL', [CHERRY]: 'CHERRY', [PIKACHU]: 'PIKACHU', [SQUIRTLE]: 'SQUIRTLE', [STARYU]: 'STARYU' };
export const NONE = 0xff;            // SLOTS_NO_MATCH / SLOTS_NO_BIAS (-1)
export const MAX_COINS = 9999;
const REEL_SIZE = 15;
// percent: n * $ff / 100 (macros/const.asm)
const pct = n => Math.floor(n * 0xff / 100);

// Reel1Tilemap..Reel3Tilemap — the first three repeated at the end
export const REEL_STRIPS = [
	[SEVEN, CHERRY, STARYU, PIKACHU, SQUIRTLE, SEVEN, CHERRY, STARYU, PIKACHU, SQUIRTLE, POKEBALL, CHERRY, STARYU, PIKACHU, SQUIRTLE, SEVEN, CHERRY, STARYU],
	[SEVEN, PIKACHU, CHERRY, SQUIRTLE, STARYU, POKEBALL, PIKACHU, CHERRY, SQUIRTLE, STARYU, POKEBALL, PIKACHU, CHERRY, SQUIRTLE, STARYU, SEVEN, PIKACHU, CHERRY],
	[SEVEN, PIKACHU, CHERRY, SQUIRTLE, STARYU, PIKACHU, CHERRY, SQUIRTLE, STARYU, PIKACHU, POKEBALL, CHERRY, SQUIRTLE, STARYU, PIKACHU, SEVEN, PIKACHU, CHERRY],
];
// Slots_GetPayout.PayoutTable
export const PAYOUT = { [SEVEN]: 300, [POKEBALL]: 50, [CHERRY]: 6, [PIKACHU]: 8, [SQUIRTLE]: 10, [STARYU]: 15 };
// Slots_InitBias.Normal / .Lucky: the first threshold >= Random wins
export const BIAS_NORMAL = [[pct(1) - 1, SEVEN], [pct(1) + 1, POKEBALL], [pct(4), STARYU], [pct(8), SQUIRTLE], [pct(16), PIKACHU], [pct(19), CHERRY], [pct(100), NONE]];
export const BIAS_LUCKY = [[pct(1), SEVEN], [pct(1) + 1, POKEBALL], [pct(3) + 1, STARYU], [pct(6) + 1, SQUIRTLE], [pct(12), PIKACHU], [pct(31) + 1, CHERRY], [pct(100), NONE]];

// SlotsJumptable
const J = { INIT: 0, BET_AND_START: 1, WAIT_START: 2, WAIT_REEL1: 3, WAIT_STOP_REEL1: 4, WAIT_REEL2: 5, WAIT_STOP_REEL2: 6,
	WAIT_REEL3: 7, WAIT_STOP_REEL3: 8, NEXT_09: 9, NEXT_0A: 10, NEXT_0B: 11, FLASH_IF_WIN: 12, FLASH_SCREEN: 13,
	GIVE_EARNED_COINS: 14, PAYOUT_TEXT_AND_ANIM: 15, PAYOUT_ANIM: 16, RESTART_OR_QUIT: 17, QUIT: 18 };
// ReelActionJumptable
export const R = { DO_NOTHING: 0, STOP_REEL_IGNORE_JOYPAD: 1, QUADRUPLE_RATE: 2, DOUBLE_RATE: 3, NORMAL_RATE: 4, HALF_RATE: 5,
	QUARTER_RATE: 6, STOP_REEL1: 7, STOP_REEL2: 8, STOP_REEL3: 9, SET_UP_REEL2_SKIP_TO_7: 10, WAIT_REEL2_SKIP_TO_7: 11,
	FAST_SPIN_REEL2_UNTIL_LINED_UP_7S: 12, UNUSED: 13, CHECK_DROP_REEL: 14, WAIT_DROP_REEL: 15, START_SLOW_ADVANCE_REEL3: 16,
	WAIT_SLOW_ADVANCE_REEL3: 17, INIT_GOLEM: 18, WAIT_GOLEM: 19, END_GOLEM: 20, INIT_CHANSEY: 21, WAIT_CHANSEY: 22,
	WAIT_EGG: 23, DROP_REEL: 24 };

export const TEXT = {
	bet: 'Bet how many\ncoins?', start: 'Start!', notEnough: 'Not enough\ncoins.', darn: 'Darn!',
	ranOut: 'Darn… Ran out of\ncoins…', playAgain: 'Play again?',
	linedUp: n => `lined up!\nWon ${n} coins!`,
};

// AnimSeqs_Sine / BattleAnim_Sine_e: d * sin(a * pi/32), a in 0-63
const sine = (a, d) => Math.round(d * Math.sin(((a & 0x3f) * Math.PI) / 32));
const defaultRng = () => Math.floor(Math.random() * 256);

export class SlotsEngine {
	// bank: { get() -> coins, set(n) } — the COIN CASE
	// lucky: wScriptVar as the slot sign's script left it (setval TRUE = lucky machine)
	constructor({ bank, lucky = false, rng = defaultRng, sfx = () => {} } = {}) {
		this.bank = bank || { v: 0, get() { return this.v; }, set(n) { this.v = n; } };
		this.lucky = !!lucky;
		this.rng = () => rng() & 0xff;
		this.sfx = sfx;
		this.frame = 0;
		this.freeze = 0;
		this.done = false;
		this.ui = null;
		this.text = '';
		this.icon = null;            // the payout text's symbol (Slots_PayoutText)
		this.cursorBlink = false;
		this.lights = 0;             // bet lights lit (Slots_IlluminateBetLights)
		this.inverted = false;       // SlotsAction_FlashScreen
		this.scy = 0;                // Golem's landing shake (hSCY)
		this.joypad = { a: false };  // hJoypadSum (A only is ever read)
		this.sprites = [];
		this.jump = J.INIT;
		this.bias = NONE;
		this.bet = 0;
		this.matched = NONE;
		this.building = 0;           // wSlotBuildingMatch
		this.firstTwo = 0;           // wFirstTwoReelsMatching
		this.firstTwoSevens = 0;     // wFirstTwoReelsMatchingSevens
		this.payout = 0;
		this.delay = 0;              // wSlotsDelay
		this.stopped = [[0, 0, 0], [0, 0, 0], [0, 0, 0]];
		// _SlotMachine.InitGFX
		this.reels = [0, 1, 2].map(i => {
			const r = { i, strip: REEL_STRIPS[i], action: R.DO_NOTHING, pos: REEL_SIZE - 1, dist: 0, rate: 0,
				manip: 0, manipDelay: 0, dropCounter: 0, stopDelay: 0 };
			this._updatePos(r);
			return r;
		});
		this.keepSevenBiasChance = (this.rng() & 0b00101010) ? 0 : 1;   // 12.5%: TRUE
	}

	get coins() { return Math.max(0, this.bank.get() | 0); }
	set coins(n) { this.bank.set(Math.max(0, Math.min(0xffff, n | 0))); }

	// --- input ---
	// btn: 'A' | 'B' | 'UP' | 'DOWN'
	press(btn) {
		const u = this.ui;
		if (!u) { if (btn === 'A') this.joypad.a = true; return; }
		if (u.kind === 'bet') {
			if (btn === 'UP') u.cursor = (u.cursor + 2) % 3;
			else if (btn === 'DOWN') u.cursor = (u.cursor + 1) % 3;
			else if (btn === 'B') { this.ui = null; this.text = ''; this.jump = J.QUIT; }
			else if (btn === 'A') this._betChosen(3 - u.cursor);   // " 3", " 2", " 1": wSlotBet = 4 - wMenuCursorY
		} else if (u.kind === 'prompt' || u.kind === 'waitAB') {
			if (btn === 'A' || btn === 'B') { this.ui = null; u.then(); }
		} else if (u.kind === 'yesno') {
			if (btn === 'UP' || btn === 'DOWN') u.cursor ^= 1;
			else if (btn === 'A') { this.ui = null; u.then(u.cursor === 0); }
			else if (btn === 'B') { this.ui = null; u.then(false); }
		}
	}

	// --- one frame of SlotsLoop ---
	step() {
		if (this.done) return;
		if (this.freeze > 0) { this.freeze--; return; }
		if (this.ui) {
			if (this.ui.kind === 'delay' && --this.ui.n <= 0) { const u = this.ui; this.ui = null; u.then(); }
			else if (this.ui.kind === 'waitAB') this.cursorBlink = ((this.frame >> 4) & 1) === 1;
			this.frame++;
			return;
		}
		if (this.jump & 0x80) { this.done = true; return; }   // SLOTS_END_LOOP_F
		this._jumptable();
		for (const r of this.reels) this._spinReel(r);
		this._animSprites();
		this.frame++;
	}

	// --- SlotsJumptable ---
	_next() { this.jump++; }
	_jumptable() {
		switch (this.jump) {
		case J.INIT:
			this._next();
			this.firstTwo = 0; this.firstTwoSevens = 0;
			this.matched = NONE;
			return;
		case J.BET_AND_START:
			this.text = TEXT.bet; this.icon = null;
			this.ui = { kind: 'bet', cursor: 0 };
			return;
		case J.WAIT_START:
			if (this.delay) { this.delay--; return; }
			this._next();
			this.joypad.a = false;
			return;
		case J.WAIT_REEL1: case J.WAIT_STOP_REEL1:
		case J.WAIT_REEL2: case J.WAIT_STOP_REEL2:
		case J.WAIT_REEL3: case J.WAIT_STOP_REEL3:
			this._waitReels();
			return;
		case J.NEXT_09: case J.NEXT_0A: case J.NEXT_0B:
			this._next();
			return;
		case J.FLASH_IF_WIN:
			if (this.matched === NONE) { this._next(); this._next(); return; }
			this._next();
			this.delay = 16;
			// fallthrough: SlotsAction_FlashScreen
		case J.FLASH_SCREEN: {
			if (this.delay === 0) { this.inverted = false; this._next(); return; }
			const a = this.delay--;
			if ((a >> 1) === 0) return;
			this.inverted = !this.inverted;
			return;
		}
		case J.GIVE_EARNED_COINS:
			this.firstTwo = 0; this.firstTwoSevens = 0;
			this.payout = this.matched === NONE ? 0 : PAYOUT[this.matched];   // Slots_GetPayout
			this.delay = 0;
			this._next();
			return;
		case J.PAYOUT_TEXT_AND_ANIM:
			this._payoutText();
			this._next();
			// fallthrough: SlotsAction_PayoutAnim
		case J.PAYOUT_ANIM: {
			const a = this.delay;
			this.delay = (this.delay + 1) & 0xff;
			if (!(a & 1)) return;
			if (this.payout === 0) { this._next(); return; }
			this.payout--;
			const c = this.coins;
			if (!(c >= MAX_COINS)) this.coins = c + 1;   // Slots_CheckCoinCaseFull
			if (this.delay & 7) this.sfx('coin');
			return;
		}
		case J.RESTART_OR_QUIT:
			this.lights = 0;                               // Slots_DeilluminateBetLights
			this.ui = { kind: 'waitAB', then: () => this._askPlayAgain() };   // WaitPressAorB_BlinkCursor
			return;
		case J.QUIT:
			this.jump |= 0x80;
			return;
		}
	}

	// SlotsAction_WaitReel1 .. WaitStopReel3 fall through into each other
	_waitReels() {
		const order = [
			[J.WAIT_REEL1, J.WAIT_STOP_REEL1, () => R.STOP_REEL1],
			[J.WAIT_REEL2, J.WAIT_STOP_REEL2, () => this._stopReel2Action()],
			[J.WAIT_REEL3, J.WAIT_STOP_REEL3, () => this._stopReel3Action()],
		];
		for (let k = 0; k < 3; k++) {
			const [wait, waitStop, pick] = order[k];
			const reel = this.reels[k];
			if (this.jump === wait) {
				if (!this.joypad.a) return;
				this._next();
				reel.action = pick();
			}
			if (this.jump === waitStop) {
				if (reel.action !== R.DO_NOTHING) return;
				this.sfx('stop');
				this.stopped[k] = this._state(reel);        // Slots_LoadReelState
				this._next();
				this.joypad.a = false;
				if (k === 2) return;
			}
		}
	}

	// Slots_StopReel2
	_stopReel2Action() {
		if (this.bet >= 2 && (this.bias === SEVEN || this.bias === NONE)) {
			const r1 = this.stopped[0];
			if ((r1[0] === SEVEN || r1[1] === SEVEN || r1[2] === SEVEN) && this.rng() < pct(31) + 1) return R.SET_UP_REEL2_SKIP_TO_7;
		}
		return R.STOP_REEL2;
	}

	// Slots_StopReel3
	_stopReel3Action() {
		if (!this.firstTwo || !this.firstTwoSevens) return R.STOP_REEL3;
		const a = this.rng();
		if (this.bias === SEVEN) {
			if (a >= pct(71) - 1) return R.STOP_REEL3;
			if (a >= pct(47) + 1) return R.START_SLOW_ADVANCE_REEL3;
			if (a >= pct(24) - 1) return R.INIT_GOLEM;
			return R.INIT_CHANSEY;
		}
		if (a >= pct(63)) return R.STOP_REEL3;
		if (a >= pct(31) + 1) return R.START_SLOW_ADVANCE_REEL3;
		return R.INIT_GOLEM;
	}

	// Slots_AskBet, after the menu
	_betChosen(bet) {
		this.ui = null;
		this.bet = bet;
		const c = this.coins;
		if (!((c >> 8) & 0xff) && (c & 0xff) < bet) {
			this.text = TEXT.notEnough;
			this.ui = { kind: 'prompt', then: () => { this.text = TEXT.bet; this.ui = { kind: 'bet', cursor: 0 }; } };
			this.sfx('denied');
			return;
		}
		this.coins = c - bet;
		this.sfx('bet');
		this.text = TEXT.start;
		// SlotsAction_BetAndStart.proceed
		this._next();
		this.lights = bet;
		this._initBias();
		this.delay = 32;
		for (const r of this.reels) { r.action = R.NORMAL_RATE; r.manip = 4; }
		this.sfx('start');
	}

	// Slots_InitBias: SEVEN bias sticks; anything else is re-rolled
	_initBias() {
		if (this.bias === SEVEN) return;
		const table = this.lucky ? BIAS_LUCKY : BIAS_NORMAL;
		const c = this.rng();
		for (const [th, sym] of table) if (th >= c) { this.bias = sym; return; }
	}

	// Slots_PayoutText
	_payoutText() {
		if (this.matched === NONE) { this.text = TEXT.darn; this.icon = null; return; }
		if (this.matched === SEVEN) {
			this.sfx('win_seven');
			// .LinedUpSevens: 25% (or 12.5% in the rarer mode) to keep SEVEN bias
			const mask = this.keepSevenBiasChance ? 0b0011100 : 0b0010100;
			if (this.rng() & mask) this.bias = NONE;
		} else this.sfx(this.matched === POKEBALL ? 'win_ball' : 'win');
		this.icon = this.matched;
		this.text = TEXT.linedUp(PAYOUT[this.matched]);
	}

	// Slots_AskPlayAgain
	_askPlayAgain() {
		this.cursorBlink = false;
		if (this.coins === 0) {
			this.text = TEXT.ranOut; this.icon = null;
			this.ui = { kind: 'delay', n: 60, then: () => { this.jump = J.QUIT; } };
			return;
		}
		this.text = TEXT.playAgain; this.icon = null;
		this.ui = { kind: 'yesno', cursor: 0, then: yes => { this.text = ''; this.jump = yes ? J.INIT : J.QUIT; } };
	}

	// --- reels ---
	// Slots_GetCurrentReelState: [bottom, middle, top]
	_state(r) {
		let p = r.pos & 0xff;
		if (p === 0) p = 0xf;
		const e = (p - 1) & 0xf;
		return [r.strip[e], r.strip[e + 1], r.strip[e + 2]];
	}
	// the strip index drawn at the bottom of the window (for rendering)
	bottomIndex(r) { let p = r.pos & 0xff; if (p === 0) p = 0xf; return (p - 1) & 0xf; }

	// Slots_UpdateReelPositionAndOAM (the OAM half is the renderer's)
	_updatePos(r) {
		let a = (r.pos + 1) & 0xf;
		if (a === REEL_SIZE) a = 0;
		r.pos = a;
	}

	// Slots_SpinReels.SpinReel
	_spinReel(r) {
		if ((r.dist & 0xf) === 0) this._reelAction(r);
		if (!r.rate) return;
		r.dist = (r.dist + r.rate) & 0xff;
		if ((r.dist & 0xf) === 0) this._updatePos(r);
	}
	// pixels the reel has slid down past its last boundary
	offset(r) { return r.dist & 0xf; }

	// Slots_StopReel (falls into ReelAction_StopReelIgnoreJoypad)
	_stopReel(r) {
		r.rate = 0;
		r.action = R.STOP_REEL_IGNORE_JOYPAD;
		r.stopDelay = 3;
		this._reelAction(r);
	}

	// Slots_CheckMatchedFirstTwoReels (r = reel 2)
	_checkFirstTwo(r) {
		this.firstTwo = 0; this.firstTwoSevens = 0;
		const cur = this._state(r), r1 = this.stopped[0];
		const store = a => { this.building = a; if (a === SEVEN) this.firstTwoSevens = 1; this.firstTwo = 1; };
		const bet = this.bet & 3;
		if (bet >= 3) { if (r1[0] === cur[1]) store(r1[0]); if (r1[2] === cur[1]) store(r1[2]); }   // up / down diagonals
		if (bet >= 2) { if (r1[0] === cur[0]) store(r1[0]); if (r1[2] === cur[2]) store(r1[2]); }   // bottom / top
		if (bet >= 1) { if (r1[1] === cur[1]) store(r1[1]); }                                       // middle
		return !!this.firstTwo;
	}

	// Slots_CheckMatchedAllThreeReels (r = reel 3): { carry, a }
	_checkAll(r) {
		this.matched = NONE;
		const cur = this._state(r), r1 = this.stopped[0], r2 = this.stopped[1];
		const bet = this.bet & 3;
		const line = (a, c, b) => { if (a === c && a === b) this.matched = a; };
		if (bet >= 3) { line(r1[0], cur[2], r2[1]); line(r1[2], cur[0], r2[1]); }
		if (bet >= 2) { line(r1[0], cur[0], r2[0]); line(r1[2], cur[2], r2[2]); }
		if (bet >= 1) line(r1[1], cur[1], r2[1]);
		return { carry: this.matched !== NONE, a: this.matched };
	}

	// Slots_GetNumberOfGolems (simulates on the reel position, then restores it)
	_numberOfGolems(r) {
		const save = r.pos;
		let e = 0, guard = 0;
		if (this.bias === SEVEN) {
			let m;
			do { r.pos = (r.pos + 1) & 0xff; e = (e + 1) & 0xff; m = this._checkAll(r); }
			while ((!m.carry || m.a !== SEVEN) && ++guard < 512);
		} else {
			let a;
			do { a = this.rng() & 7; } while (a < 4);
			e = a;
			let m;
			do { a = e; e = (e + 1) & 0xff; r.pos = (r.pos + a) & 0xff; m = this._checkAll(r); }
			while (m.carry && ++guard < 512);
		}
		r.pos = save;
		return e;
	}

	_reelAction(r) {
		switch (r.action) {
		case R.DO_NOTHING: return;
		case R.STOP_REEL_IGNORE_JOYPAD:
			if (r.stopDelay) { r.stopDelay--; return; }
			r.action = R.DO_NOTHING;
			return;
		case R.QUADRUPLE_RATE: r.rate = 16; return;
		case R.DOUBLE_RATE: r.rate = 8; return;
		case R.NORMAL_RATE: r.rate = 4; return;
		case R.HALF_RATE: r.rate = 2; return;
		case R.QUARTER_RATE: r.rate = 1; return;
		case R.STOP_REEL1:
			if (this.bias !== NONE && r.manip) {
				r.manip--;
				if (!this._state(r).includes(this.bias)) return;   // .CheckForBias: keep spinning
			}
			this._stopReel(r);
			return;
		case R.STOP_REEL2:
			if (this._checkFirstTwo(r) && this.building === this.bias) { this._stopReel(r); return; }
			if (this.bias === NONE || !r.manip) { this._stopReel(r); return; }
			r.manip--;
			return;
		case R.STOP_REEL3: {
			const m = this._checkAll(r);
			if (m.carry) {
				if (m.a === this.bias) { this._stopReel(r); return; }
				if (!r.manip) return;      // a match that isn't the bias: spin on until it's gone
				r.manip--;
				return;
			}
			if (this.bias === NONE || !r.manip) { this._stopReel(r); return; }
			r.manip--;
			return;
		}
		case R.SET_UP_REEL2_SKIP_TO_7:
			if (this._checkFirstTwo(r) && this.firstTwoSevens) { this._stopReel(r); return; }
			this.sfx('stop');
			r.action = R.WAIT_REEL2_SKIP_TO_7;
			r.manipDelay = 32;
			r.rate = 0;
			return;
		case R.WAIT_REEL2_SKIP_TO_7:
			if (r.manipDelay) { r.manipDelay--; return; }
			this.sfx('throw');
			r.action = R.FAST_SPIN_REEL2_UNTIL_LINED_UP_7S;
			r.rate = 8;
			return;
		case R.FAST_SPIN_REEL2_UNTIL_LINED_UP_7S:
			if (this._checkFirstTwo(r) && this.firstTwoSevens) this._stopReel(r);
			return;
		case R.UNUSED:
			if (this._checkAll(r).carry) return;
			this.sfx('stop'); this.freeze += 16;
			r.action = R.CHECK_DROP_REEL;
			r.manipDelay = this._numberOfGolems(r);
			// fallthrough
		case R.CHECK_DROP_REEL:
			if (!r.manipDelay) { this._checkAll(r); this._stopReel(r); return; }
			r.manipDelay--;
			r.action = R.WAIT_DROP_REEL;
			r.dropCounter = 32;
			r.rate = 0;
			// fallthrough
		case R.WAIT_DROP_REEL:
			if (r.dropCounter) { r.dropCounter--; return; }
			r.action = R.CHECK_DROP_REEL;
			r.rate = 8;
			return;
		case R.START_SLOW_ADVANCE_REEL3:
			if (this._checkAll(r).carry) return;
			this.sfx('stop'); this.freeze += 16;
			r.rate = 1;
			r.action = R.WAIT_SLOW_ADVANCE_REEL3;
			r.manipDelay = 16;
			// fallthrough
		case R.WAIT_SLOW_ADVANCE_REEL3: {
			if (r.manipDelay) { r.manipDelay--; this.sfx('tick'); return; }
			const m = this._checkAll(r);
			if (this.bias === SEVEN) {
				if (!m.carry || m.a !== SEVEN) { this.sfx('tick'); return; }
			} else if (m.carry) { this.sfx('tick'); return; }
			this._stopReel(r);
			return;
		}
		case R.INIT_GOLEM: {
			if (this._checkAll(r).carry) return;
			this.sfx('stop'); this.freeze += 16;
			r.action = R.WAIT_GOLEM;
			r.rate = 0;
			const n = this._numberOfGolems(r);
			this.sprites.push({ kind: 'golem', jt: 0, var1: 0, var2: 0, var3: n, x: 104, y: 96, xoff: 0, yoff: 0, t: 0 });
			this.delay = 0;
		}
			// fallthrough
		case R.WAIT_GOLEM:
			if (this.delay === 2) { this._checkAll(r); this._stopReel(r); return; }
			if (this.delay === 1) { r.action = R.END_GOLEM; r.rate = 8; }
			return;
		case R.END_GOLEM:
			this.delay = 0;
			r.action = R.WAIT_GOLEM;
			r.rate = 0;
			return;
		case R.INIT_CHANSEY:
			if (this._checkAll(r).carry) return;
			this.sfx('stop'); this.freeze += 16;
			r.action = R.WAIT_CHANSEY;
			r.rate = 0;
			this.sprites.push({ kind: 'chansey', jt: 0, var1: 0, x: 0, y: 96, xoff: 0, yoff: 0, t: 0, set: 1 });
			this.delay = 0;
			return;
		case R.WAIT_CHANSEY:
			if (!this.delay) return;
			r.action = R.WAIT_EGG;
			this.delay = 2;
			// fallthrough
		case R.WAIT_EGG:
			if (this.delay < 4) return;
			r.action = R.DROP_REEL;
			r.rate = 16;
			r.manipDelay = 17;
			// fallthrough
		case R.DROP_REEL: {
			if (r.manipDelay) { r.manipDelay--; return; }
			const m = this._checkAll(r);
			if (!m.carry || m.a !== SEVEN) {   // .EggAgain
				r.rate = 0;
				r.action = R.WAIT_CHANSEY;
				this.delay = 1;
				return;
			}
			this.delay = 5;
			this._stopReel(r);
			return;
		}
		}
	}

	// --- Golem / Chansey / egg (Slots_AnimateGolem, Slots_AnimateChansey, SpriteAnimFunc_SlotsChanseyEgg) ---
	_animSprites() {
		for (const s of this.sprites.slice()) {
			s.t++;
			if (s.kind === 'golem') this._golem(s);
			else if (s.kind === 'chansey') this._chansey(s);
			else if (s.kind === 'egg') this._egg(s);
		}
	}
	_kill(s) { this.sprites = this.sprites.filter(x => x !== s); }
	_golem(s) {
		if (s.jt === 0) {
			if (!s.var3) { this.delay = 2; this._kill(s); return; }
			s.var3--; s.jt = 1; s.var1 = 0x30; s.xoff = 0;
		}
		if (s.jt === 1) {
			const a = s.var1;
			if (a < 0x20) { s.jt = 2; s.var2 = 2; this.delay = 1; this.sfx('land'); return; }
			s.var1--;
			s.yoff = sine(a, 14 * 8);
			return;
		}
		const a = s.xoff;
		s.xoff += 2;
		if (a >= 9 * 8) { s.jt = 0; this.scy = 0; return; }
		if (a & 3) return;
		s.var2 = -s.var2;
		this.scy = s.var2;
	}
	_chansey(s) {
		switch (s.jt) {
		case 0: {   // .walk
			const a = s.x;
			s.x++;
			if (a !== 13 * 8) { if (!(a & 0xf)) this.sfx('hop'); break; }
			s.jt = 1;   // .limit
			this.delay = 1;
		}
			// fallthrough
		case 1:     // .one
			if (this.delay === 5) { this._kill(s); return; }
			if (this.delay !== 2) break;
			s.jt = 2;   // .retain
			s.var1 = 8;
			// fallthrough
		case 2:     // .two
			if (s.var1) { s.var1--; break; }
			s.jt = 1;   // .spawn_egg
			this.sprites.push({ kind: 'egg', jt: 0, x: 13 * 8 + 4, y: 96, xoff: 0, yoff: 0, t: 0 });
			break;
		}
		// SpriteAnimFunc_SlotsChansey: delay 2 -> 3, and the egg-laying frameset
		if (this.delay === 2) { this.delay = 3; s.set = 2; s.t = 0; }
	}
	_egg(s) {
		const e = s.jt;
		s.jt = (s.jt - 1) & 0xff;
		if (e & 1) {
			if (s.x >= 15 * 8) { this._kill(s); this.delay = 4; this.sfx('land'); return; }
			s.x++;
		}
		s.yoff = sine(e, 32);
	}
}
