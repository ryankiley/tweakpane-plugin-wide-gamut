/*
 * Tests for the binding plugin's `accept` gate. No DOM: `accept` is a pure
 * function of the bound value + params, so the whole claim/decline contract is
 * exercisable headlessly.
 *
 * The gate matters more than a normal predicate would, because the plugin is
 * registered ahead of Tweakpane's built-ins — anything it claims stops being a
 * plain text input, and the first write replaces the bound string with the
 * picker's serialisation. So `accept` must claim colour strings and *only*
 * colour strings, even though the picker's own text field is deliberately
 * forgiving about messy pastes.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {OklchColor} from '../src/model/color.js';
import {OklchInputPlugin} from '../src/plugin.js';

const accepts = (value: unknown): boolean =>
	OklchInputPlugin.accept(value, {}) !== null;

test('accept claims every colour string the picker can edit', () => {
	const colors = [
		'red',
		'REBECCAPURPLE',
		'transparent',
		'#fff',
		'#ffff',
		'#ff0000',
		'#ff000080',
		'  #ff0000  ',
		'rgb(255 0 0)',
		'rgb(255, 0, 0)',
		'rgba(255,0,0,.5)',
		'hsl(200 50% 50%)',
		'hwb(200 10% 10%)',
		'lab(50% 20 30)',
		'lch(50% 40 200)',
		'oklab(0.7 0.1 0.1)',
		'oklch(0.7 0.15 250)',
		'oklch(70% 0.15 250 / 0.5)',
		'color(display-p3 1 0 0)',
		'color(rec2020 1 0 0)',
		'color(prophoto-rgb 1 0 0)',
	];
	colors.forEach((c) => assert.equal(accepts(c), true, `should claim ${c}`));
});

test('accept declines a string that merely contains a colour', () => {
	// The picker's *text field* recovers a colour from all of these (see
	// `OklchColor.isColorString`), and should keep doing so. `accept` must not:
	// claiming one of these bindings swaps a text input for a colour picker and
	// then discards everything but the extracted token on the first write.
	const notColors = [
		'box-shadow: 0 0 4px rgba(0,0,0,0.5)',
		'a gradient from rgb(1,2,3) to white',
		'color: #ff0000;',
		'"#ff0000"',
		'rgb(0 0 0) !important',
		'var(--brand, #ff0000)',
	];
	notColors.forEach((s) => {
		assert.equal(accepts(s), false, `should decline ${s}`);
		// ...but the text field still recovers them, so the two stay distinct.
		assert.equal(
			OklchColor.isColorString(s),
			true,
			`text field should still recover ${s}`,
		);
	});
});

test('accept declines non-colours and non-strings', () => {
	['definitely-not-a-colour', '', 'rgb(1 2)', '#12345'].forEach((s) =>
		assert.equal(accepts(s), false, `should decline ${JSON.stringify(s)}`),
	);
	[42, null, undefined, {}, ['#fff']].forEach((v) =>
		assert.equal(accepts(v), false, `should decline ${String(v)}`),
	);
});

test('accept rejects an unknown params shape', () => {
	assert.notEqual(OklchInputPlugin.accept('#fff', {expanded: true}), null);
	assert.equal(OklchInputPlugin.accept('#fff', {expanded: 'yes'}), null);
});

test('an accepted value round-trips through reader → writer', () => {
	// Whatever `accept` claims, the reader must be able to parse — it throws
	// otherwise, and there is no second gate behind it.
	['red', '#ff000080', 'oklch(0.7 0.15 250)', 'transparent'].forEach((s) => {
		assert.equal(accepts(s), true);
		assert.equal(OklchColor.fromString(s).serialize(), s.trim());
	});
});
