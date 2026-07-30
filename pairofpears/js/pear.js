// pear.js — "A Pair of Pears" card game. STAGE-1 STUB: the meadow game and all
// navigation are complete; the full memory/charm card game lands next.
import { W, H } from './state.js';

export function startNewRun() {}
export function reset() {}
export function update(dt) {}
export function act(x, y) { return null; }

export function draw(ctx) {
	ctx.fillStyle = '#141f1a'; ctx.fillRect(0, 0, W, H);
	ctx.textAlign = 'center'; ctx.textBaseline = 'middle';
	ctx.fillStyle = '#e8e0d0'; ctx.font = '32px system-ui, sans-serif';
	ctx.fillText('A Pair of Pears', W / 2, H / 2 - 30);
	ctx.fillStyle = '#9fc0a6'; ctx.font = '16px system-ui, sans-serif';
	ctx.fillText('The card game is coming in the next update.', W / 2, H / 2 + 10);
	ctx.fillText('Press B / tap the ✕ to go back.', W / 2, H / 2 + 34);
}
