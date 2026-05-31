/*
 * Parity tests for gamut testing + mapping (src/core/gamut.ts) vs colorjs.io.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import Color from 'colorjs.io';

import type {Vec3} from '../src/core/convert.js';
import {inGamut, toGamut} from '../src/core/gamut.js';

function rng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		return s / 0x7fffffff;
	};
}

test('inGamut matches colorjs for srgb and p3', () => {
	const r = rng(0x90210);
	let disagree = 0;
	for (let i = 0; i < 500; i++) {
		const c: Vec3 = [0.05 + r() * 0.9, r() * 0.4, r() * 360];
		for (const g of ['srgb', 'p3'] as const) {
			if (inGamut(c, 'oklch', g) !== new Color('oklch', c).inGamut(g)) {
				disagree++;
			}
		}
	}
	// Random colours land exactly on the boundary essentially never, so the
	// epsilon'd decision should match colorjs on every one.
	assert.equal(disagree, 0, `${disagree} inGamut disagreements`);
});

test('toGamut(srgb) matches colorjs to(srgb, {inGamut:true})', () => {
	const r = rng(0xbeef);
	for (let i = 0; i < 400; i++) {
		// Bias chroma high so most colours are out of sRGB and exercise the map.
		const c: Vec3 = [0.05 + r() * 0.9, r() * 0.4, r() * 360];
		const mine = toGamut(c, 'srgb');
		const oracle = new Color('oklch', c).to('srgb', {inGamut: true}).coords as Vec3;
		for (let k = 0; k < 3; k++) {
			assert.ok(
				Math.abs(mine[k] - oracle[k]) < 2e-3,
				`oklch ${c} ch${k}: ${mine[k]} vs ${oracle[k]}`,
			);
		}
	}
});

test('toGamut leaves in-gamut colours unchanged', () => {
	// A low-chroma colour is already in sRGB; mapping must be a no-op (= convert).
	const c: Vec3 = [0.6, 0.05, 200];
	const mapped = toGamut(c, 'srgb');
	const oracle = new Color('oklch', c).to('srgb').coords as Vec3;
	for (let k = 0; k < 3; k++) {
		assert.ok(Math.abs(mapped[k] - oracle[k]) < 1e-9, `ch${k}`);
	}
});
