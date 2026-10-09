/* colorjs.io oracles shared by the engine test suites. */
import Color from 'colorjs.io';

/** True max in-gamut chroma at (L, hue) per colorjs, by fine bisection. */
export function cjsMaxChroma(L: number, hue: number, gamut: string): number {
	if (!new Color('oklch', [L, 0, hue]).inGamut(gamut)) {
		return 0;
	}
	let lo = 0;
	let hi = 0.5;
	for (let i = 0; i < 30; i++) {
		const mid = (lo + hi) / 2;
		if (new Color('oklch', [L, mid, hue]).inGamut(gamut)) lo = mid;
		else hi = mid;
	}
	return lo;
}
