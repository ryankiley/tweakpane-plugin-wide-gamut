/*
 * Unit tests for the pure colour model. Run with `npm run test:unit`
 * (node --test via tsx). No DOM — OklchColor is deterministic and side-effect
 * free, so every behaviour here is exercisable headlessly.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import {
	areaStretch,
	EDIT_MODES,
	MODE_CHANNELS,
	OklchColor,
} from '../src/model/color.js';

const approx = (a: number, b: number, tol = 1e-2): void =>
	assert.ok(Math.abs(a - b) <= tol, `expected ${a} ≈ ${b} (±${tol})`);

test('verbatim source is returned until edited', () => {
	assert.equal(
		OklchColor.fromString('oklch(0.7 0.15 250)').serialize(),
		'oklch(0.7 0.15 250)',
	);
	// Leading/trailing whitespace is trimmed; the rest is preserved exactly.
	assert.equal(OklchColor.fromString('  #ff0000  ').serialize(), '#ff0000');
});

test('asEdited drops the source and re-serialises from coords', () => {
	const c = OklchColor.fromString('#ff0000').asEdited();
	assert.match(c.serialize(), /^#[0-9a-f]{3,8}$/i);
	const back = OklchColor.fromString(c.serialize());
	approx(back.channelValues('srgb')[0], 255, 1);
	approx(back.channelValues('srgb')[1], 0, 1);
	approx(back.channelValues('srgb')[2], 0, 1);
});

test('construction clamps nonsense at the single choke point', () => {
	// L > 1, chroma far past any gamut, hue > 360.
	const c = OklchColor.fromString('oklch(5 40000 9999)');
	approx(c.coords[0], 1, 1e-9); // L → [0,1]
	approx(c.coords[1], 0.5, 1e-9); // C → MAX_CHROMA
	approx(c.coords[2], 360, 1e-9); // H → [0,360]
});

test('channelValues are in per-mode display units', () => {
	const [l, ch, h] = OklchColor.fromString('oklch(0.5 0.1 180)').channelValues(
		'oklch',
	);
	approx(l, 50); // L scaled ×100
	approx(ch, 0.1);
	approx(h, 180);
	const [r, g, b] = OklchColor.fromString('#ffffff').channelValues('srgb');
	approx(r, 255, 1);
	approx(g, 255, 1);
	approx(b, 255, 1);
});

test('withChannel sets one channel in the mode space', () => {
	const red = OklchColor.fromString('#000000').withChannel('srgb', 0, 255);
	approx(red.channelValues('srgb')[0], 255, 1);
	approx(red.channelValues('srgb')[1], 0, 1);
});

test('withFormat snaps to sRGB only for sRGB-bound modes', () => {
	const p3red = OklchColor.fromString('color(display-p3 1 0 0)');
	assert.equal(p3red.inGamut('srgb'), false);
	// sRGB-bound modes (RGB/HSL/HWB/HEX) snap the colour into gamut…
	assert.equal(p3red.withFormat('srgb').inGamut('srgb'), true);
	assert.equal(p3red.withFormat('hsl').inGamut('srgb'), true);
	// …perceptual and wide-RGB modes keep the full colour.
	assert.equal(p3red.withFormat('oklch').inGamut('srgb'), false);
	assert.equal(p3red.withFormat('p3').inGamut('srgb'), false);
});

test('mode getter reflects the source / output format', () => {
	const cases: [string, string][] = [
		['oklch(0.7 0.1 200)', 'oklch'],
		['oklab(0.7 0.1 -0.1)', 'oklab'],
		['lch(50% 30 200)', 'lch'],
		['lab(50% 20 -30)', 'lab'],
		['rgb(10 20 30)', 'srgb'], // modern space syntax → RGB
		['rgba(10, 20, 30, 1)', 'css'], // legacy comma syntax → CSS
		['hsl(200 50% 40%)', 'hsl'],
		['hwb(200 10% 20%)', 'hwb'],
		['#abcdef', 'hex'],
		['color(display-p3 0.5 0.2 0.1)', 'p3'],
		['color(rec2020 0.5 0.2 0.1)', 'rec2020'],
	];
	for (const [css, mode] of cases) {
		assert.equal(OklchColor.fromString(css).mode, mode, css);
	}
});

test('alpha is detected from the source format', () => {
	assert.equal(OklchColor.fromString('#ff000080').hasAlpha, true);
	assert.equal(OklchColor.fromString('rgb(255 0 0 / 0.5)').hasAlpha, true);
	assert.equal(OklchColor.fromString('rgba(255,0,0,0.5)').hasAlpha, true);
	assert.equal(OklchColor.fromString('#ff0000').hasAlpha, false);
	assert.equal(OklchColor.fromString('oklch(0.7 0.1 200)').hasAlpha, false);
	approx(OklchColor.fromString('rgb(255 0 0 / 0.5)').alpha, 0.5);
});

test('withAlpha sets alpha and marks the colour as carrying it', () => {
	const c = OklchColor.fromString('#ff0000').withAlpha(0.25);
	assert.equal(c.hasAlpha, true);
	approx(c.alpha, 0.25);
});

test('serialize emits 0–255 integer rgb()', () => {
	const s = OklchColor.fromString('rgb(255 0 0)').asEdited().serialize();
	assert.match(s, /^rgb\(\d{1,3} \d{1,3} \d{1,3}\)$/);
	approx(OklchColor.fromString(s).channelValues('srgb')[0], 255, 1);
});

test('CSS mode serialises legacy 4-arg rgba()', () => {
	// Always 4-arg + comma-separated, even when opaque; the collapsed readout
	// shows the same full function (it IS the format).
	const c = OklchColor.fromString('#ffdf00').withFormat('css');
	assert.equal(c.mode, 'css');
	assert.equal(c.serialize(), 'rgba(255, 223, 0, 1)');
	assert.equal(c.readoutString(), 'rgba(255, 223, 0, 1)');
	// A non-opaque alpha survives an edit and shows two places.
	const half = OklchColor.fromString('rgba(255, 0, 0, 0.5)').asEdited();
	assert.equal(half.mode, 'css');
	assert.equal(half.serialize(), 'rgba(255, 0, 0, 0.5)');
});

test('hex output is always full-length (#ffffff, never #fff)', () => {
	assert.equal(OklchColor.fromString('white').gamutCss(), '#ffffff');
	assert.equal(OklchColor.fromString('#fff').gamutCss(), '#ffffff');
	assert.equal(OklchColor.fromString('#f00').gamutCss(), '#ff0000');
	// An edited hex-format value serialises full-length too (#fff → #ffffff).
	assert.equal(OklchColor.fromString('#fff').asEdited().serialize(), '#ffffff');
});

test('messy paste is sanitised down to the colour it contains', () => {
	for (const input of [
		'color: #ff0000;',
		'background: rgb(255, 0, 0)',
		'rgb(255 0 0) !important',
		'"#ff0000"',
		'var(--brand, #ff0000)',
	]) {
		const c = OklchColor.tryFromString(input);
		assert.ok(c, `should recover a colour from: ${input}`);
		assert.equal(c.gamutCss(), '#ff0000', input);
	}
	// Non-colours still reject cleanly.
	assert.equal(OklchColor.tryFromString('not a color'), null);
	assert.equal(OklchColor.tryFromString('color: ;'), null);
	assert.equal(OklchColor.tryFromString(''), null);
});

test('displayCss is oklch(); gamutCss is an in-gamut hex', () => {
	const c = OklchColor.fromString('color(display-p3 1 0 0)');
	assert.match(c.displayCss(), /^oklch\(/);
	assert.match(c.gamutCss(), /^#[0-9a-f]{3,8}$/i);
	assert.equal(OklchColor.fromString(c.gamutCss()).inGamut('srgb'), true);
});

test('equals treats output format as part of identity', () => {
	const a = OklchColor.fromString('oklch(0.7 0.1 200)');
	const b = OklchColor.fromString('oklch(0.7 0.1 200)');
	assert.equal(a.equals(b), true);
	// Switching mode re-serialises the readout, so it must count as a change.
	assert.equal(a.equals(b.withFormat('srgb')), false);
});

test('isColorString accepts colours and rejects non-colours', () => {
	assert.equal(OklchColor.isColorString('red'), true);
	assert.equal(OklchColor.isColorString('#fff'), true);
	assert.equal(OklchColor.isColorString('oklch(0.7 0.1 200)'), true);
	assert.equal(OklchColor.isColorString('definitely-not-a-colour'), false);
	assert.equal(OklchColor.isColorString(''), false);
	assert.equal(OklchColor.isColorString(42), false);
});

test('areaHue / withAreaHue operate on the OKLCH hue axis', () => {
	const c = OklchColor.fromString('oklch(0.7 0.1 200)');
	approx(c.areaHue(), 200);
	approx(c.withAreaHue(120).areaHue(), 120);
});

test('every non-hex mode has three channel descriptors', () => {
	for (const m of EDIT_MODES) {
		if (m === 'hex') {
			continue;
		}
		assert.equal(MODE_CHANNELS[m]?.length, 3, m);
	}
});

test('gamut label stays sRGB through the near-black region (no churn)', () => {
	// Dragging the black bottom of the plane: every near-black colour displays as
	// black, so the gamut distinction is imperceptible and the readout must not
	// churn sRGB↔P3↔wide.
	for (let c = 0; c <= 0.06; c += 0.01) {
		assert.equal(
			OklchColor.fromString(`oklch(0.02 ${c.toFixed(3)} 90)`).gamutLabel(),
			'sRGB',
			`near-black C=${c.toFixed(3)}`,
		);
	}
});

test('gamut label still classifies genuinely wide colours correctly', () => {
	assert.equal(OklchColor.fromString('#3366cc').gamutLabel(), 'sRGB');
	assert.equal(OklchColor.fromString('color(display-p3 1 0 0)').gamutLabel(), 'P3');
	assert.equal(OklchColor.fromString('color(display-p3 0 0 1)').gamutLabel(), 'P3'); // P3 blue stays P3
	assert.equal(OklchColor.fromString('color(rec2020 0 1 0)').gamutLabel(), 'wide');
});

test('gamut label agrees with the displayed numbers (no flip at the P3 edge)', () => {
	// L90/C0.22/H100 sits right on the P3 chroma ceiling (~0.2167) for this hue, so
	// 0.2166 (in P3) and 0.2200 (out) both render as "0.22". The label is read at
	// display precision, so both must resolve to the same gamut rather than flipping
	// P3 vs wide on a difference the user can't see.
	const a = OklchColor.fromString('oklch(90% 0.22 100)');
	const b = OklchColor.fromString('oklch(90% 0.2166 100)');
	assert.equal(a.channelValues('oklch')[1].toFixed(2), '0.22');
	assert.equal(b.channelValues('oklch')[1].toFixed(2), '0.22');
	assert.equal(a.gamutLabel(), b.gamutLabel());
});

test('sRGB-bound modes never report P3/wide (a dragged-wide colour reads sRGB)', () => {
	// A wide colour reached by dragging the area while in an sRGB-bound mode: the
	// binding output clamps to sRGB, so the readout must say sRGB.
	const wideInHex = OklchColor.fromString('#ff0000').withCss('oklch(0.8 0.3 150)');
	assert.equal(wideInHex.mode, 'hex');
	assert.equal(wideInHex.gamutLabel(), 'sRGB');
	// The same wide colour in a wide mode reports its real gamut, not sRGB.
	assert.notEqual(OklchColor.fromString('oklch(0.8 0.3 150)').gamutLabel(), 'sRGB');
});

test('a near-zero channel renders as 0.00, never -0.00', () => {
	// oklch hue 91 gives a tiny negative OKLab a; it must snap to 0 for display.
	const c = OklchColor.fromString('oklch(0.7 0.12 91)');
	assert.equal(c.channelValues('oklab')[1].toFixed(2), '0.00');
	assert.ok(!c.readoutString().includes('-0.00'), `readout: ${c.readoutString()}`);
});

test('switching into an sRGB-bound mode snaps the colour into sRGB', () => {
	// The area stays freely selectable in every mode; switching *into* RGB/HEX maps
	// a wider colour to the nearest in-sRGB one so its channels stay meaningful.
	const wide = OklchColor.fromString('oklch(0.8 0.3 150)');
	assert.ok(!wide.inGamut('srgb'), 'starts wide');
	assert.ok(wide.withFormat('srgb').inGamut('srgb'), 'RGB snaps into sRGB');
	assert.ok(wide.withFormat('hex').inGamut('srgb'), 'HEX snaps into sRGB');
});

test('the colour area caps every wide mode at the P3 display gamut', () => {
	// sRGB-bound modes draw the sRGB plane; every wide mode (incl. Rec2020 and the
	// perceptual ones) caps at P3 — the displayable limit — so the thumb can't
	// slide into colours the screen can't show.
	for (const m of ['hex', 'srgb', 'css', 'hsl', 'hwb'] as const) {
		assert.equal(areaStretch(m), 'srgb', `${m} → sRGB plane`);
	}
	for (const m of ['oklch', 'oklab', 'lch', 'lab', 'p3', 'rec2020'] as const) {
		assert.equal(areaStretch(m), 'p3', `${m} → P3 plane`);
	}
});
