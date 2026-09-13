// plate-label.js — the type/tribe plate shown at the bottom-center of a card face.
// Pure, dependency-free (no `three`) so it can be unit-tested in node; cardart.js
// imports it for rendering.

// spell card types — a school-less spell is labelled by its type on the plate
export const SPELL_TYPES_SET = new Set(['sorcery', 'instant', 'secret', 'trap']);

// What the plate reads, or null when the card shows no plate. A spell with a
// school shows a "<Type> - <School>" type line ("Instant - Frost" / "Sorcery -
// Fire"); weapons/locations carry no tribe so the plate names the card type
// ("Hero Weapon" / "Location"); an Equipment (an artifact with an `equip`
// payload) shows "Artifact - Equipment"; a passive treasure says "Passive".
export function plateLabelFor(card) {
	if (!card) return null;
	if (!(card.passive || card.equip || card.tribe || card.type === 'weapon' || card.type === 'location' || SPELL_TYPES_SET.has(card.type))) return null;
	const isSpell = SPELL_TYPES_SET.has(card.type);
	const SCHOOLS = ['Arcane', 'Fel', 'Fire', 'Frost', 'Holy', 'Nature', 'Shadow', 'Song'];
	const typeName = card.type.charAt(0).toUpperCase() + card.type.slice(1);
	return card.passive ? 'Passive'
		: card.equip ? 'Artifact - Equipment'
		: card.type === 'weapon' ? 'Hero Weapon'
		: card.type === 'location' ? 'Location'
		: card.tribe ? (isSpell && SCHOOLS.includes(card.tribe) ? `${typeName} - ${card.tribe}` : card.tribe)
			: typeName;
}
