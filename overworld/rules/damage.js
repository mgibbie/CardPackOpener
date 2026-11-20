// rules/damage.js — the Pokémon damage formula (gen 3+), shared by the overworld's battles and Poketactica.
// battle.js used to write it out four times (a move, confusion's self-hit, Future Sight, the AI's estimate).
// Poketactica stage 1 (owner, 2026-11-20). Pure: no DOM, no state, no randomness.

/** The base damage before any multiplier: floor(floor(floor(2L/5 + 2) · Power · A / D) / 50) + 2. */
export function baseDamage(level, power, atk, def) {
	return Math.floor(Math.floor(Math.floor(2 * level / 5 + 2) * power * atk / def) / 50) + 2;
}

/** The random roll every damaging hit takes: 0.85 – 1.00 from one draw of `rng` (a 0..1 function). */
export const damageRoll = (rng) => 0.85 + rng() * 0.15;
