/*
 * Parity tests: src/core/serialize.ts must produce byte-identical strings to
 * colorjs.io for every format the plugin emits (it becomes the binding value).
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import Color from 'colorjs.io';

import type {Space, Vec3} from '../src/core/convert.js';
import {serialize} from '../src/core/serialize.js';

function rng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		return s / 0x7fffffff;
	};
}
const fin = (x: number | null): number => (x == null || Number.isNaN(x) ? 0 : x);

const SPACES: Space[] = ['oklch', 'oklab', 'lch', 'lab', 'hsl', 'hwb', 'p3', 'rec2020'];
const CJS = (s: Space): string => (s === 'prophoto-rgb' ? 'prophoto' : s);

test('serialize matches colorjs for every space, opaque and with alpha', () => {
	const r = rng(0x5e21a);
	for (let i = 0; i < 200; i++) {
		// Chromatic, mid-lightness — avoids the powerless-hue ("none") path, which
		// the model never reaches (it coalesces to finite coords before serialising).
		const oklch: Vec3 = [0.2 + r() * 0.7, 0.03 + r() * 0.3, r() * 360];
		const inSrgb = new Color('oklch', oklch).inGamut('srgb');
		for (const sp of SPACES) {
			// serialize() here is pure formatting. colorjs's serialize gamut-maps
			// *bounded* spaces (srgb/p3/rec2020/hsl/hwb) before formatting — the model
			// does that mapping itself (toGamut) before calling us, so compare those
			// only in-gamut. The unbounded perceptual spaces format raw.
			const bounded = sp === 'p3' || sp === 'rec2020' || sp === 'hsl' || sp === 'hwb';
			if (bounded && !inSrgb) {
				continue;
			}
			const coords = new Color('oklch', oklch).to(CJS(sp)).coords.map(fin) as Vec3;
			for (const alpha of [1, 0.5, 0.327]) {
				const mine = serialize(coords, sp, alpha, {precision: 4});
				const oracle = new Color(CJS(sp), coords, alpha).toString({precision: 4});
				assert.equal(mine, oracle, `${sp} alpha=${alpha}`);
			}
		}
	}
});

test('serialize hex matches colorjs (opaque + alpha, full-length)', () => {
	const r = rng(0x4ec);
	for (let i = 0; i < 200; i++) {
		const srgb: Vec3 = [r(), r(), r()];
		for (const alpha of [1, 0.5, 0.8]) {
			const mine = serialize(srgb, 'srgb', alpha, {format: 'hex'});
			const oracle = new Color('srgb', srgb, alpha).toString({
				format: 'hex',
				collapse: false,
			});
			assert.equal(mine, oracle, `hex alpha=${alpha}`);
		}
	}
});

test('serialize oklch default precision matches colorjs (displayCss path)', () => {
	const r = rng(0x0c1);
	for (let i = 0; i < 100; i++) {
		const oklch: Vec3 = [0.2 + r() * 0.7, 0.03 + r() * 0.3, r() * 360];
		assert.equal(
			serialize(oklch, 'oklch'),
			new Color('oklch', oklch).toString(),
			'oklch default',
		);
	}
});
