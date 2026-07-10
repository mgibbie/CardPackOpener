// clock.js — an accelerated in-game day/night clock. One full in-game day
// passes every CYCLE_MS of real time, derived straight from the wall clock so
// it always advances and needs no persistence. Tests can pin the hour.
const CYCLE_MS = 24 * 60 * 1000; // 24 real minutes = one in-game day

let override = null; // pinned hour 0..24 for tests/debug, or null for live time

// 0..1 fraction through the in-game day
export function frac() {
	if (override != null) return (override % 24) / 24;
	return (Date.now() % CYCLE_MS) / CYCLE_MS;
}
export function hour() { return Math.floor(frac() * 24); }
export function minute() { return Math.floor(frac() * 1440) % 60; }

// three coarse buckets: morning [5,10), day [10,18), night [18,5)
export function phase() {
	const h = hour();
	if (h < 5 || h >= 18) return 'night';
	if (h < 10) return 'morning';
	return 'day';
}
export const isNight = () => phase() === 'night';
export const isDay = () => phase() !== 'night'; // morning counts as day for evolutions

export function label() {
	return `${String(hour()).padStart(2, '0')}:${String(minute()).padStart(2, '0')}`;
}
export function phaseLabel() {
	return { morning: 'Morning', day: 'Day', night: 'Night' }[phase()];
}

// debug/test hooks
export function setHour(h) { override = h; }
export function clearOverride() { override = null; }
