// choice.js — FireRed/Emerald `multichoice`: a question, its options, a real pick.
//
// The transpile dropped every multichoice (~250), so each menu question answered
// with whatever VAR_RESULT already held: Trick House Puzzle 5's Mechadoll quizzes
// said "BZZZT. DISAPPOINTMENT. ERROR." before any choice appeared (2026-09-30).
// tools/gen_multichoice.mjs re-inserts them (overworld/multichoice_data.json);
// this is the op's runtime: it opens the menu, WAITS, writes the zero-based pick
// to VAR_RESULT, and only then lets the script's compare run. No default is ever
// chosen for the player. B/X cancels only where the source allows it
// (ignoreBPress FALSE), answering MULTI_B_PRESSED (127) as the decomp does.
//
// Every pick is recorded (window.__owChoiceLog; console with ?owlog=1): the list,
// the options shown, the index chosen, and VAR_RESULT at the compare that reads it.
import * as Story from './events.js';
import { cutscene } from './ow_core.js';
import { cutsceneCtx } from './ow_cutscenes.js';
import { S } from './ow_state.js';

export const MULTI_B_PRESSED = 127;
let DATA = { patches: {}, shared: {} };
export async function loadChoiceData(getJSON) {
	DATA = (await getJSON('multichoice_data.json').catch(() => null)) || { patches: {}, shared: {} };
	return DATA;
}
// a map's labels with their multichoice restored
export const choicePatches = stem => (DATA.patches && DATA.patches[stem]) || {};
export const sharedChoicePatches = () => DATA.shared || {};

const LOG = typeof window !== 'undefined' ? (window.__owChoiceLog = window.__owChoiceLog || []) : [];
const TRACE = typeof location !== 'undefined' && /[?&]owlog=1/.test(location.search);
function log(rec) {
	LOG.push(rec);
	while (LOG.length > 100) LOG.shift();
	if (TRACE) console.info('[multichoice]', JSON.stringify(rec));
}
let awaitingCompare = null;   // the last pick, until a compare reads VAR_RESULT
// events.js calls this at a branch on VAR_RESULT
export function noteCompare(cond, hit) {
	if (!awaitingCompare) return;
	awaitingCompare.compare = { value: cond.value, cmp: cond.cmp, varResult: Story.getVar('VAR_RESULT'), hit };
	awaitingCompare = null;
}

export const choiceMenu = { open: false, idx: 0, options: [], prompt: '', ignoreB: true, cols: 1, list: '' };
// the script op: open and wait
export function startChoice(op) {
	const opts = Array.isArray(op.options) ? op.options : [];
	if (!opts.length) return undefined;   // nothing to show: the caller keeps its path
	choiceMenu.open = true;
	choiceMenu.idx = Math.min(Math.max(0, op.default | 0), opts.length - 1);
	choiceMenu.options = opts;
	choiceMenu.ignoreB = op.ignoreB !== false;
	choiceMenu.cols = Math.max(1, op.cols | 0 || 1);
	choiceMenu.list = op.list || '';
	const raw = op.prompt && ((S.mapStrings && S.mapStrings[op.prompt]) || null);
	choiceMenu.prompt = raw ? Story.normalizeText(raw, cutsceneCtx()) : '';
	log({ list: choiceMenu.list, options: opts.slice(), shown: true, at: Date.now() });
	return 'wait';
}
function pick(v) {
	choiceMenu.open = false;
	Story.setVar('VAR_RESULT', v);
	const rec = { list: choiceMenu.list, options: choiceMenu.options.slice(), selected: v, varResult: Story.getVar('VAR_RESULT'), at: Date.now() };
	log(rec);
	awaitingCompare = rec;
	cutscene.resume();
}
export function choiceKey(k) {
	const n = choiceMenu.options.length, cols = choiceMenu.cols;
	if (k === 'ArrowUp') choiceMenu.idx = (choiceMenu.idx - cols + n) % n;
	if (k === 'ArrowDown') choiceMenu.idx = (choiceMenu.idx + cols) % n;
	if (cols > 1 && k === 'ArrowLeft') choiceMenu.idx = (choiceMenu.idx - 1 + n) % n;
	if (cols > 1 && k === 'ArrowRight') choiceMenu.idx = (choiceMenu.idx + 1) % n;
	if (k === 'z' || k === 'Enter') { pick(choiceMenu.idx); return; }
	if ((k === 'x' || k === 'Escape') && !choiceMenu.ignoreB) pick(MULTI_B_PRESSED);
}
