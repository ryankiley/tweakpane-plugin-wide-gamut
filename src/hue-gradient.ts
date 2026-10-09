/*
 * The hue strip's background: a gradient of OKLCH hues, so position t along
 * the strip is OKLCH hue t·360 — the hue the area plane is locked to.
 * (Tweakpane's native strip is an HSL rainbow PNG; HSL and OKLCH hue angles
 * disagree by 20–30°, so under an OKLCH marker it reads wrong.)
 *
 * Each stop carries the colour's own lightness and chroma, clamped to the
 * plane's edge at that hue — exactly the colour a hue drag lands on, since the
 * drag keeps L and C (`withAreaHue`). Stops every 5° are close enough that the
 * interpolation space between them is immaterial, so the gradient stays plain
 * (no `in oklch`): any browser that parses `oklch()` renders it.
 */
import {maxChroma} from './area-compute.js';
import {type Space, oklchGamutProbe} from './core/convert.js';

/** Stop spacing in degrees. */
export const HUE_STEP = 5;

const fmt = (v: number): string => Number(v.toFixed(4)).toString();

/** The strip colour at `hue`: (L, C) clamped to the `gamut` edge at that hue. */
export function hueStripColor(
	L: number,
	C: number,
	hue: number,
	gamut: Space,
): string {
	const c = Math.min(C, maxChroma(oklchGamutProbe(hue, gamut), L));
	return `oklch(${fmt(L)} ${fmt(c)} ${fmt(hue)})`;
}

/** The whole strip: a stop every HUE_STEP degrees from 0 to 360. */
export function hueStripGradient(L: number, C: number, gamut: Space): string {
	const stops: string[] = [];
	for (let h = 0; h <= 360; h += HUE_STEP) {
		stops.push(`${hueStripColor(L, C, h, gamut)} ${fmt(h / 3.6)}%`);
	}
	return `linear-gradient(to right, ${stops.join(', ')})`;
}
