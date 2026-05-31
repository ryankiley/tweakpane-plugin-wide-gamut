/*
 * Parity tests for gamut testing + mapping (src/core/gamut.ts) vs colorjs.io.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import Color from 'colorjs.io';

import type {Space, Vec3} from '../src/core/convert.js';
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

test('toGamut(p3 / rec2020 / prophoto-rgb) matches colorjs to(dest, {inGamut:true})', () => {
	// The model maps into each of these RGB spaces (wide-mode output and
	// color(prophoto-rgb …) round-trips), so each must track colorjs's CSS gamut
	// mapping — not just sRGB.
	const dests: [Space, string][] = [
		['p3', 'p3'],
		['rec2020', 'rec2020'],
		['prophoto-rgb', 'prophoto'],
	];
	const r = rng(0x6a3d);
	for (const [dest, cjs] of dests) {
		for (let i = 0; i < 600; i++) {
			const c: Vec3 = [0.03 + r() * 0.94, r() * 0.45, r() * 360];
			const mine = toGamut(c, dest);
			const oracle = new Color('oklch', c).to(cjs, {inGamut: true}).coords as Vec3;
			for (let k = 0; k < 3; k++) {
				assert.ok(
					Math.abs(mine[k] - oracle[k]) < 2e-3,
					`${dest} oklch ${c} ch${k}: ${mine[k]} vs ${oracle[k]}`,
				);
			}
		}
	}
});

test('toGamut returns the origin clip when it is already within a JND', () => {
	// Regression: the ProPhoto gamut boundary is non-monotonic in chroma near
	// black (red dips negative then recovers), so omitting CSS Color 4's pre-search
	// clip check walked the result to a far-too-low chroma (blue ≈ 0.092 vs the
	// correct 0.130). The colour is only just out of gamut, so the answer must ≈
	// its clip — exactly what colorjs returns.
	const c: Vec3 = [0.145, 0.216, 201.755];
	const mine = toGamut(c, 'prophoto-rgb');
	const oracle = new Color('oklch', c).to('prophoto', {inGamut: true}).coords as Vec3;
	for (let k = 0; k < 3; k++) {
		assert.ok(
			Math.abs(mine[k] - oracle[k]) < 2e-3,
			`ch${k}: ${mine[k]} vs ${oracle[k]}`,
		);
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
