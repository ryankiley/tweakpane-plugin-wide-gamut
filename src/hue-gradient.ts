/*
 * The hue strip's background: a gradient of OKLCH hues, so position t along
 * the strip is OKLCH hue t·360 — the hue the area plane is locked to.
 * (Tweakpane's native strip is an HSL rainbow PNG; HSL and OKLCH hue angles
 * disagree by 20–30°, so under an OKLCH marker it reads wrong.)
 *
 * Each stop is the colour a hue drag would land on at that hue: the colour's
 * own lightness, and the same *fraction* of the plane's chroma edge as it has
 * now (a hue drag holds that fraction — see `withAreaHue`). Stops every 5° are
 * close enough that the interpolation space between them is immaterial, so the
 * gradient stays plain (no `in oklch`): any browser that parses `oklch()`
 * renders it.
 */
import type {Space} from './core/convert.js';
import {maxChroma} from './core/gamut.js';

/** Stop spacing in degrees. */
export const HUE_STEP = 5;

const fmt = (v: number): string => Number(v.toFixed(4)).toString();

/**
 * Where a colour sits across the plane: its chroma as a fraction of the
 * `gamut` edge at its own hue, clamped to 1 (the strip only shows what the
 * plane can) and rounded to 4 dp — so a hue drag, which holds the fraction,
 * yields the same value at every hue and the strip is never rebuilt mid-drag.
 */
export function chromaFraction(
	L: number,
	C: number,
	hue: number,
	gamut: Space,
): number {
	const edge = maxChroma(L, hue, gamut);
	return edge > 0 ? Number(Math.min(1, C / edge).toFixed(4)) : 0;
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
