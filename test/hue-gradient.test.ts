/*
 * Tests for the hue strip's gradient (src/hue-gradient.ts): position t must be
 * OKLCH hue t·360, and each stop must be the colour's own L at the same
 * fraction of the plane's edge as the colour has at its own hue — the colour a
 * hue drag lands on. colorjs.io is the oracle for the edge.
 */
import assert from 'node:assert/strict';
import test from 'node:test';

import Color from 'colorjs.io';

import {OklchColor} from '../src/model/color.js';
import {
	chromaFraction,
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
	const stops = parseStops(hueStripGradient(0.7, 0.8, 'srgb'));
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

test('each stop is the same fraction of the plane edge at its hue', () => {
	for (const gamut of ['srgb', 'p3'] as const) {
		for (const [L, f] of [
			[0.7, 1],
			[0.45, 0.5],
			[0.9, 0.2],
		] as const) {
			for (const s of parseStops(hueStripGradient(L, f, gamut))) {
				assert.equal(s.L, L);
				const expect = f * cjsMaxChroma(L, s.h, gamut);
				assert.ok(
					Math.abs(s.C - expect) < 2e-4,
					`${gamut} L=${L} f=${f} h=${s.h}: ${s.C} vs ${expect}`,
				);
			}
		}
	}
});

test('chromaFraction: share of the edge, clamped to 1, stable across a hue drag', () => {
	// Half-way across the sRGB row at hue 200.
	const edge = cjsMaxChroma(0.6, 200, 'srgb');
	assert.ok(Math.abs(chromaFraction(0.6, edge / 2, 200, 'srgb') - 0.5) < 1e-3);
	// Beyond the edge: the strip shows the edge itself.
	assert.equal(chromaFraction(0.6, 0.5, 200, 'srgb'), 1);
	// Grey: no chroma anywhere.
	assert.equal(chromaFraction(0.6, 0, 200, 'srgb'), 0);
	// A hue drag holds the fraction (withAreaHue rescales chroma by the edge
	// ratio), so the fraction read back at the new hue is the same number and
	// the strip key does not change mid-drag.
	const c = OklchColor.fromString('oklch(0.6 0.1 200)');
	const f0 = chromaFraction(0.6, 0.1, 200, 'srgb');
	for (const h of [0, 37, 120, 250, 359]) {
		const m = c.withAreaHue(h, 'srgb');
		assert.equal(chromaFraction(m.coords[0], m.coords[1], h, 'srgb'), f0, `h=${h}`);
	}
});

test('an in-plane colour is its own stop; the sRGB primaries round-trip', () => {
	// Blue is left out: the sRGB gamut is non-convex along its chroma ray (in
	// gamut to C≈0.266, then out, with #0000ff an isolated point at C≈0.313), so
	// the plane — by design — stops short of it.
	for (const hex of ['#ff0000', '#00ff00', '#c0ffee', '#123456']) {
		const [L, C, h] = new Color(hex).to('oklch').coords as number[];
		const stop = hueStripColor(L!, chromaFraction(L!, C!, h!, 'srgb'), h!, 'srgb');
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
		for (const s of parseStops(hueStripGradient(L, 1, 'p3'))) {
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
	const stops = parseStops(hueStripGradient(0.55, 0.7, 'p3'));
	for (const s of stops) {
		assert.equal(
			hueStripColor(0.55, 0.7, s.h, 'p3'),
			`oklch(${s.L} ${s.C} ${s.h})`,
		);
	}
});

test('5° stops: the sRGB blend between neighbours is within a JND of the truth', () => {
	for (const h of [2.5, 97.5, 182.5, 267.5, 352.5]) {
		const lo = new Color(hueStripColor(0.7, 1, h - 2.5, 'srgb'));
		const hi = new Color(hueStripColor(0.7, 1, h + 2.5, 'srgb'));
		const blend = lo.mix(hi, 0.5, {space: 'srgb', outputSpace: 'srgb'});
		const truth = new Color(hueStripColor(0.7, 1, h, 'srgb'));
		assert.ok(blend.deltaE(truth, '2000') < 1.5, `h=${h}`);
	}
});
