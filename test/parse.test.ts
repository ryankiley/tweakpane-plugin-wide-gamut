/*
 * Parity tests: src/core/parse.ts must resolve every CSS colour string the
 * plugin accepts to the same colour colorjs.io does. Compared in OKLab (lossless
 * and free of the hue singularity), plus alpha.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import Color from 'colorjs.io';

import {convert} from '../src/core/convert.js';
import type {Space, Vec3} from '../src/core/convert.js';
import {parse} from '../src/core/parse.js';

function rng(seed: number): () => number {
	let s = seed >>> 0;
	return () => {
		s = (s * 1103515245 + 12345) & 0x7fffffff;
		return s / 0x7fffffff;
	};
}
const fin = (x: number | null): number => (x == null || Number.isNaN(x) ? 0 : x);

/** Assert our parse and colorjs resolve `str` to the same colour. */
function same(str: string, tol = 1e-3): void {
	const mine = parse(str);
	assert.ok(mine, `parse returned null for "${str}"`);
	const mineLab = convert(mine.coords, mine.space, 'oklab');
	const oracle = new Color(str);
	const oraLab = oracle.to('oklab').coords.map(fin) as Vec3;
	for (let k = 0; k < 3; k++) {
		assert.ok(
			Math.abs(mineLab[k] - oraLab[k]) < tol,
			`"${str}" oklab ch${k}: ${mineLab[k]} vs ${oraLab[k]}`,
		);
	}
	assert.ok(
		Math.abs(mine.alpha - fin(oracle.alpha)) < 1e-4,
		`"${str}" alpha: ${mine.alpha} vs ${oracle.alpha}`,
	);
}

test('parse matches colorjs across colorjs-emitted formats', () => {
	const r = rng(0x9a17e);
	for (let i = 0; i < 150; i++) {
		const oklch: Vec3 = [0.1 + r() * 0.85, r() * 0.35, r() * 360];
		const bounded = new Color('oklch', oklch); // colorjs maps bounded forms itself
		const forms = [
			bounded.to('srgb').toString({format: 'hex'}),
			bounded.to('srgb').toString({format: 'hex', collapse: false}),
			bounded.to('srgb').toString(),
			bounded.to('hsl').toString(),
			bounded.to('hwb').toString(),
			bounded.to('oklch').toString({precision: 5}),
			bounded.to('oklab').toString({precision: 5}),
			bounded.to('lab').toString({precision: 5}),
			bounded.to('lch').toString({precision: 5}),
			bounded.to('p3').toString({precision: 5}),
			bounded.to('rec2020').toString({precision: 5}),
		];
		for (const f of forms) {
			same(f);
		}
	}
});

test('parse handles alpha across formats', () => {
	const r = rng(0xa1fa);
	for (let i = 0; i < 80; i++) {
		const oklch: Vec3 = [0.2 + r() * 0.6, r() * 0.2, r() * 360];
		const c = new Color('oklch', oklch);
		c.alpha = 0.25 + r() * 0.5;
		for (const f of [
			c.to('srgb').toString({format: 'hex'}),
			c.to('srgb').toString(),
			c.to('oklch').toString({precision: 5}),
			c.to('p3').toString({precision: 5}),
		]) {
			same(f);
		}
	}
});

test('parse handles hand-written format variants', () => {
	const variants = [
		'rgb(255, 0, 0)',
		'rgba(0, 128, 255, 0.5)',
		'rgb(100% 0% 0%)',
		'rgb(255 0 0 / 50%)',
		'RGB(255 0 0)',
		'hsl(120, 50%, 50%)',
		'hsl(120 50% 50% / 0.5)',
		'hsla(240, 100%, 50%, 0.3)',
		'hwb(120 20% 30%)',
		'oklch(0.7 0.15 250)',
		'oklch(70% 0.15 250 / 0.5)',
		'oklch(0.7 0.15 250deg)',
		'oklab(0.7 -0.1 0.05)',
		'lab(50% 40 30)',
		'lch(50% 40 120)',
		'lch(50% 40 0.25turn)',
		'color(display-p3 1 0 0)',
		'color(rec2020 0 1 0 / 0.5)',
		'color(srgb 0.5 0.5 0.5)',
		'#f00',
		'#ff0000',
		'#ff000080',
		'  #FF0000  ',
		'red',
		'RebeccaPurple',
		'transparent',
	];
	for (const v of variants) {
		same(v);
	}
});

test('parse rejects non-colours and malformed channel counts', () => {
	for (const v of [
		'',
		'not-a-color',
		'rgb()',
		'hsl(120)',
		'color(foobar 1 1 1)',
		'#12',
		// Malformed channel counts (colorjs rejects these too).
		'rgb(1,2,3,4,5)',
		'rgb(1,2)',
		'color(srgb 1 1 1 1)',
		'hsl(120,50%,50%,0.5,x)',
	]) {
		assert.equal(parse(v), null, `"${v}" should be null`);
	}
});
