/*
 * Tests for the hue strip's gradient (src/hue-gradient.ts): position t must be
 * OKLCH hue t·360, and each stop must be the colour's own L and C clamped to
 * the plane's edge at that hue. colorjs.io is the oracle for the edge.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import Color from 'colorjs.io';

import {
	HUE_STEP,
	hueStripColor,
	hueStripGradient,
} from '../src/hue-gradient.js';
import {cjsMaxChroma} from './oracle.js';

const STOP = /oklch\(([\d.]+) ([\d.]+) ([\d.]+)\) ([\d.]+)%(?:, |\)$)/g;

function parseStops(gradient: string) {
	assert.ok(gradient.startsWith('linear-gradient(to right, '));
	return [...gradient.matchAll(STOP)].map((m) => ({
		L: Number(m[1]),
		C: Number(m[2]),
		h: Number(m[3]),
		pos: Number(m[4]),
	}));
}

test('stops run 0..360 every HUE_STEP, positioned at hue/360', () => {
	const stops = parseStops(hueStripGradient(0.7, 0.3, 'srgb'));
	assert.equal(stops.length, 360 / HUE_STEP + 1);
	stops.forEach((s, i) => {
		assert.equal(s.h, i * HUE_STEP);
		assert.ok(Math.abs(s.pos - s.h / 3.6) < 1e-3, `pos @ ${s.h}`);
	});
	assert.equal(stops[0]!.pos, 0);
	assert.equal(stops[stops.length - 1]!.pos, 100);
	// Hue 360 is hue 0 again, so the strip wraps seamlessly.
	assert.equal(stops[0]!.C, stops[stops.length - 1]!.C);
});

test('each stop is (L, C) clamped to the plane edge at its hue', () => {
	for (const gamut of ['srgb', 'p3'] as const) {
		for (const [L, C] of [
			[0.7, 0.3],
			[0.45, 0.12],
			[0.9, 0.05],
		] as const) {
			for (const s of parseStops(hueStripGradient(L, C, gamut))) {
				assert.equal(s.L, L);
				const expect = Math.min(C, cjsMaxChroma(L, s.h, gamut));
				assert.ok(
					Math.abs(s.C - expect) < 2e-4,
					`${gamut} L=${L} C=${C} h=${s.h}: ${s.C} vs ${expect}`,
				);
			}
		}
	}
});

test('an in-plane colour is its own stop; the sRGB primaries round-trip', () => {
	// Blue is left out: the sRGB gamut is non-convex along its chroma ray (in
	// gamut to C≈0.266, then out, with #0000ff an isolated point at C≈0.313), so
	// the plane — by design — stops short of it.
	for (const hex of ['#ff0000', '#00ff00', '#c0ffee', '#123456']) {
		const [L, C, h] = new Color(hex).to('oklch').coords as number[];
		const stop = hueStripColor(L!, C!, h!, 'srgb');
		const dE = new Color(stop).deltaE(new Color(hex), '2000');
		assert.ok(dE < 0.05, `${hex}: ${stop} ΔE2000 ${dE}`);
	}
});

test('L = 0 and L = 1 render every stop as black / white', () => {
	// The gamut probe carries a hair of slack, which near black admits a little
	// nominal chroma (the gamma curve is near-flat there) — but it still displays
	// as black. What matters is the rendered colour, so check that.
	for (const [L, want] of [
		[0, 0],
		[1, 1],
	] as const) {
		for (const s of parseStops(hueStripGradient(L, 0.3, 'p3'))) {
			const rgb = new Color('oklch', [s.L, s.C, s.h]).to('p3').coords;
			for (const v of rgb) {
				assert.ok(Math.abs((v ?? 0) - want) < 2e-3, `L=${L} h=${s.h}: ${rgb}`);
			}
		}
	}
});

test('C = 0 is an achromatic strip', () => {
	for (const s of parseStops(hueStripGradient(0.6, 0, 'srgb'))) {
		assert.equal(s.C, 0);
	}
});

test('the marker colour is the strip colour at the marker hue', () => {
	const stops = parseStops(hueStripGradient(0.55, 0.2, 'p3'));
	for (const s of stops) {
		assert.equal(
			hueStripColor(0.55, 0.2, s.h, 'p3'),
			`oklch(${s.L} ${s.C} ${s.h})`,
		);
	}
});

test('5° stops: the sRGB blend between neighbours is within a JND of the truth', () => {
	for (const h of [2.5, 97.5, 182.5, 267.5, 352.5]) {
		const lo = new Color(hueStripColor(0.7, 0.3, h - 2.5, 'srgb'));
		const hi = new Color(hueStripColor(0.7, 0.3, h + 2.5, 'srgb'));
		const blend = lo.mix(hi, 0.5, {space: 'srgb', outputSpace: 'srgb'});
		const truth = new Color(hueStripColor(0.7, 0.3, h, 'srgb'));
		assert.ok(blend.deltaE(truth, '2000') < 1.5, `h=${h}`);
	}
});
