/*
 * The hue strip's background: a gradient of OKLCH hues, so position t along
 * the strip is OKLCH hue t·360 — the hue the area plane is locked to.
 * (Tweakpane's native strip is an HSL rainbow PNG; HSL and OKLCH hue angles
 * disagree by 20–30°, so under an OKLCH marker it reads wrong.)
 *
 * Each stop is the colour a hue drag would land on at that hue: the colour's
 * own lightness, and the same *fraction* of the plane's chroma edge as it has
 * now (a hue drag holds that fraction — see `withAreaHue`) — except that the
 * fraction is floored at STRIP_CHROMA_FLOOR, so a grey or faint colour still
 * shows hues to pick from; below the floor the strip is a hue guide, not a
 * preview of the exact landing colour. Stops every 5° are close enough that
 * the interpolation space between them is immaterial, so the gradient stays
 * plain (no `in oklch`): any browser that parses `oklch()` renders it.
 */
import type {Space} from './core/convert.js';
import {maxChroma} from './core/gamut.js';

/** Stop spacing in degrees. */
export const HUE_STEP = 5;

/** Least fraction of the edge the strip paints at. A grey (or near-grey) would
 *  otherwise give a flat grey strip with no hue cues to pick from; at this
 *  floor the hues stay legible while the strip still reads as muted. */
export const STRIP_CHROMA_FLOOR = 0.4;

const fmt = (v: number): string => Number(v.toFixed(4)).toString();

/**
 * The fraction of the edge the strip paints at for a colour: its chroma as a
 * fraction of the `gamut` edge at its own hue, clamped to [STRIP_CHROMA_FLOOR,
 * 1] (the strip only shows what the plane can, and never goes flat grey) and
 * rounded to 4 dp — so a hue drag, which holds the fraction, yields the same
 * value at every hue and the strip is never rebuilt mid-drag.
 */
export function chromaFraction(
	L: number,
	C: number,
	hue: number,
	gamut: Space,
): number {
	const edge = maxChroma(L, hue, gamut);
	if (edge <= 0) {
		// Unreachable for model values: L is clamped to [0, 1], and even black and
		// white keep a sliver of edge (the probe's slack). Guards the public
		// function against 0/0 for an L outside that range.
		return 0;
	}
	const f = Math.max(STRIP_CHROMA_FLOOR, Math.min(1, C / edge));
	return Number(f.toFixed(4));
}

/** The strip colour at `hue`: `fraction` of the `gamut` edge at that hue. */
export function hueStripColor(
	L: number,
	fraction: number,
	hue: number,
	gamut: Space,
): string {
	return `oklch(${fmt(L)} ${fmt(fraction * maxChroma(L, hue, gamut))} ${fmt(
		hue,
	)})`;
}

/** The whole strip: a stop every HUE_STEP degrees from 0 to 360. */
export function hueStripGradient(
	L: number,
	fraction: number,
	gamut: Space,
): string {
	const stops: string[] = [];
	for (let h = 0; h <= 360; h += HUE_STEP) {
		stops.push(`${hueStripColor(L, fraction, h, gamut)} ${fmt(h / 3.6)}%`);
	}
	return `linear-gradient(to right, ${stops.join(', ')})`;
}
