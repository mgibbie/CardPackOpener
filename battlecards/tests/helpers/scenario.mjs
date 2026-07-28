// tests/helpers/scenario.mjs — a small scripted-game builder for engine tests.
//
// Wraps the proven raw-helper idiom from the characterization suites (push id
// into deck → drawCards → move to board) behind a declarative API, and hides
// uid bookkeeping: targets are named as [player, boardIndex] or a hero.
//
//   const r = new Scenario(byId)
//     .def('t_bear', { type:'creature', cost:2, attack:3, health:3 })
//     .players(2).mana(0, 10)
//     .hand(0, ['t_bolt']).board(1, [{ id:'t_bear', health:4 }])
//     .play(0, 't_bolt', { targetBoard:[1, 0] })
//     .expectDead(1, 0)
//     .expectMana(0, 8)
//     .run();
//   ok('bolt kills the bear', r.failures.length === 0, r.failures);
//
// Setup calls (def/players/mana/life/hand/board/deck/keepDealt) configure the
// game; action/expect calls are recorded as steps and executed in order by
// run(). Board minions are placed attack-ready (sick:false) unless overridden.
import * as E from '../../engine.js';

export class Scenario {
	constructor(byId, opts = {}) {
		this.byId = Object.create(byId);           // local defs never pollute the shared DB
		this.rng = opts.rng || (() => 0.4);
		this.playerCount = 2;
		this.keepDealtHands = false;
		this.setup = [];                           // [{op, args}] applied right after createGame
		this.steps = [];                           // actions + expectations, in call order
		this.failures = [];
		this.state = null;
	}

	// ---------- configuration ----------
	def(id, def) { this.byId[id] = { id, name: def.name || id, rarity: 'common', description: def.description || 'test', ...def }; return this; }
	players(n) { this.playerCount = n; return this; }
	keepDealt() { this.keepDealtHands = true; return this; }
	mana(pi, n) { this.setup.push({ op: 'mana', pi, n }); return this; }
	life(pi, n) { this.setup.push({ op: 'life', pi, n }); return this; }
	hand(pi, ids) { this.setup.push({ op: 'hand', pi, ids }); return this; }
	deck(pi, ids) { this.setup.push({ op: 'deck', pi, ids }); return this; }
	board(pi, entries) { this.setup.push({ op: 'board', pi, entries }); return this; }

	// ---------- actions (recorded, executed by run) ----------
	play(pi, idOrIndex, opts = {}) { this.steps.push({ op: 'play', pi, idOrIndex, opts }); return this; }
	attack(pi, boardIndex, opts) { this.steps.push({ op: 'attack', pi, boardIndex, opts }); return this; }
	heroAttack(pi, opts) { this.steps.push({ op: 'heroAttack', pi, opts }); return this; }
	endTurn(times = 1) { this.steps.push({ op: 'endTurn', times }); return this; }
	pick(id) { this.steps.push({ op: 'pick', id }); return this; }
	respondPass(pi) { this.steps.push({ op: 'respondPass', pi }); return this; }
	respond(pi, idOrIndex, opts = {}) { this.steps.push({ op: 'respond', pi, idOrIndex, opts }); return this; }
	do(fn) { this.steps.push({ op: 'do', fn }); return this; }        // escape hatch: fn(state, E, scenario)

	// ---------- expectations (recorded; run in sequence with actions) ----------
	expect(label, fn) { this.steps.push({ op: 'expect', label, fn }); return this; }
	expectDead(pi, ref) { return this.expect(`p${pi} minion '${ref}' dead`, s => !this._find(s, pi, ref)); }
	expectAlive(pi, ref) { return this.expect(`p${pi} minion '${ref}' alive`, s => !!this._find(s, pi, ref)); }
	expectMana(pi, n) { return this.expect(`p${pi} mana ${n}`, s => E.availableMana(s.players[pi]) === n); }
	expectLife(pi, n) { return this.expect(`p${pi} life ${n}`, s => s.players[pi].life === n); }
	expectHandSize(pi, n) { return this.expect(`p${pi} hand size ${n}`, s => s.players[pi].hand.length === n); }
	expectBoardSize(pi, n) { return this.expect(`p${pi} board size ${n}`, s => s.players[pi].board.length === n); }
	expectHp(pi, ref, n) { return this.expect(`p${pi} '${ref}' at ${n} hp`, s => { const c = this._find(s, pi, ref); return !!c && E.hp(c) === n; }); }

	// ---------- internals ----------
	_find(state, pi, ref) {                        // ref: board index at placement time OR card id
		const board = state.players[pi].board;
		if (typeof ref === 'number') { const uid = this.placedUids?.[pi]?.[ref]; return board.find(c => c.uid === uid) || null; }
		return board.find(c => c.id === ref) || null;
	}
	_target(state, opts) {
		if (!opts) return null;
		if (opts.target) return opts.target;       // raw passthrough
		if (opts.targetHero != null) return { type: 'hero', player: opts.targetHero };
		if (opts.targetBoard) {
			const [tp, ref] = opts.targetBoard;
			const c = this._find(state, tp, ref);
			if (!c) throw new Error(`target [${tp},${ref}] not on board`);
			return { type: 'creature', uid: c.uid, player: tp };
		}
		return null;
	}
	_give(state, pi, id) {
		if (!this.byId[id]) throw new Error(`unknown card id '${id}'`);
		state.players[pi].deck.push(id);
		E.drawCards(state, pi, 1);
		const h = state.players[pi].hand;
		return h[h.length - 1];
	}
	_handCard(state, pi, idOrIndex) {
		const h = state.players[pi].hand;
		const c = typeof idOrIndex === 'number' ? h[idOrIndex] : h.find(x => x.id === idOrIndex);
		if (!c) throw new Error(`'${idOrIndex}' not in p${pi} hand [${h.map(x => x.id)}]`);
		return c;
	}

	run() {
		const state = this.state = E.createGame(this.byId, this.rng, null, this.playerCount);
		this.placedUids = {};
		if (!this.keepDealtHands) for (const p of state.players) { p.hand = []; p.deck = []; }
		for (const s of this.setup) {
			const p = state.players[s.pi];
			if (s.op === 'mana') p.mana = { cur: s.n, max: s.n, bonus: 0 };
			else if (s.op === 'life') p.life = s.n;
			else if (s.op === 'hand') for (const id of s.ids) this._give(state, s.pi, id);
			else if (s.op === 'deck') p.deck.push(...s.ids);
			else if (s.op === 'board') {
				this.placedUids[s.pi] = this.placedUids[s.pi] || [];
				for (const entry of s.entries) {
					const spec = typeof entry === 'string' ? { id: entry } : entry;
					const c = this._give(state, s.pi, spec.id);
					p.hand = p.hand.filter(x => x !== c);
					c.zone = 'board'; p.board.push(c);
					c.sick = spec.sick ?? false;
					if (spec.attack != null) c.attack = spec.attack;
					if (spec.health != null) { c.maxHealth = spec.health; c.damage = 0; }
					if (spec.damage != null) c.damage = spec.damage;
					if (spec.keywords) { c.keywords = [...spec.keywords]; c.shield = spec.keywords.includes('divine_shield'); c.stealthed = spec.keywords.includes('stealth'); }
					this.placedUids[s.pi].push(c.uid);
				}
			}
		}
		for (const s of this.steps) {
			try {
				if (s.op === 'play') {
					const c = this._handCard(state, s.pi, s.idOrIndex);
					const okPlay = E.playCard(state, s.pi, c.uid, this._target(state, s.opts), s.opts.choice ?? null, s.opts.position ?? 0, s.opts.useAlt, s.opts.kicked);
					if (okPlay === false && !s.opts.mayFail) this.failures.push(`play ${c.id} rejected`);
				} else if (s.op === 'attack') {
					const c = this._find(state, s.pi, s.boardIndex);
					if (!c) { this.failures.push(`attacker [${s.pi},${s.boardIndex}] missing`); continue; }
					const okAtk = E.attack(state, s.pi, c.uid, this._target(state, s.opts));
					if (okAtk === false && !s.opts.mayFail) this.failures.push(`attack by ${c.id} rejected`);
				} else if (s.op === 'heroAttack') {
					const okHa = E.heroAttack(state, s.pi, this._target(state, s.opts));
					if (okHa === false && !s.opts?.mayFail) this.failures.push('hero attack rejected');
				} else if (s.op === 'endTurn') {
					for (let i = 0; i < s.times; i++) E.endTurn(state);
				} else if (s.op === 'pick') {
					E.resolvePick(state, s.id ?? state.pickQueue[0]?.ids[0]);
				} else if (s.op === 'respondPass') {
					E.resolveResponse(state, s.pi, null);
				} else if (s.op === 'respond') {
					const c = this._handCard(state, s.pi, s.idOrIndex);
					E.resolveResponse(state, s.pi, c.uid, this._target(state, s.opts), s.opts.choice ?? null);
				} else if (s.op === 'do') {
					s.fn(state, E, this);
				} else if (s.op === 'expect') {
					let got;
					try { got = s.fn(state); } catch (e) { got = `threw: ${e.message}`; }
					if (got !== true) this.failures.push(`expect failed: ${s.label}${got === false ? '' : ` (${got})`}`);
				}
			} catch (e) {
				this.failures.push(`${s.op} threw: ${e.message}`);
			}
		}
		return { failures: this.failures, state };
	}
}
