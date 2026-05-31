/*
 * Colour-space conversions — the maths backbone of the picker.
 *
 * Every conversion hubs through CIE XYZ. sRGB / Display-P3 / Rec2020 are D65;
 * Lab / LCH / ProPhoto are D50 and cross to D65 via a Bradford adaptation.
 * OKLab/OKLCH use Björn Ottosson's matrices (D65). The matrix and
 * transfer-function constants are the CSS Color 4 reference values
 * (https://www.w3.org/TR/css-color-4/), so results match colorjs.io to within
 * ~1e-12 — the parity tests in test/ gate on exactly that.
 *
 * Conventions (matching colorjs.io coords, so the model can pass ids straight
 * through): hues are degrees; RGB-family channels 0..1; OKLab/OKLCH L is 0..1;
 * Lab/LCH L is 0..100; HSL S/L and HWB W/B are 0..100.
 */

export type Vec3 = [number, number, number];
type Mat3 = [Vec3, Vec3, Vec3];

/** Space ids understood by `convert` — a subset of colorjs's, the ones this
 *  plugin actually uses (edit modes + gamut boundaries + the OKLCH working
 *  space). */
export type Space =
	| 'srgb'
	| 'p3'
	| 'rec2020'
	| 'prophoto-rgb'
	| 'oklab'
	| 'oklch'
	| 'lab'
	| 'lch'
	| 'hsl'
	| 'hwb';

const DEG = 180 / Math.PI;
const RAD = Math.PI / 180;

/** 3×3 matrix × 3-vector. */
function mul(m: Mat3, v: Vec3): Vec3 {
	return [
		m[0][0] * v[0] + m[0][1] * v[1] + m[0][2] * v[2],
		m[1][0] * v[0] + m[1][1] * v[1] + m[1][2] * v[2],
		m[2][0] * v[0] + m[2][1] * v[1] + m[2][2] * v[2],
	];
}

// ── Transfer functions (gamma ↔ linear), all sign-preserving per CSS Color 4 ──

/** sRGB / Display-P3 gamma → linear-light. */
function srgbLin(c: number): number {
	const a = Math.abs(c);
	return a <= 0.04045 ? c / 12.92 : Math.sign(c) * ((a + 0.055) / 1.055) ** 2.4;
}
/** Linear-light → sRGB / Display-P3 gamma. */
function srgbGam(c: number): number {
	const a = Math.abs(c);
	return a <= 0.0031308
		? c * 12.92
		: Math.sign(c) * (1.055 * a ** (1 / 2.4) - 0.055);
}

// colorjs.io 0.6 models Rec2020 with a plain 2.4 gamma (no linear toe / α-β
// OETF). We match that exactly so rec2020 values stay identical to what the
// plugin ships today; see the parity tests. (A spec-correct OETF would differ
// slightly near black — a deliberate change we've chosen not to make here.)
function rec2020Lin(c: number): number {
	return Math.sign(c) * Math.abs(c) ** 2.4;
}
function rec2020Gam(c: number): number {
	return Math.sign(c) * Math.abs(c) ** (1 / 2.4);
}

const PRO_ET = 1 / 512;
function prophotoLin(c: number): number {
	const a = Math.abs(c);
	return a <= PRO_ET * 16 ? c / 16 : Math.sign(c) * a ** 1.8;
}
function prophotoGam(c: number): number {
	const a = Math.abs(c);
	return a >= PRO_ET ? Math.sign(c) * a ** (1 / 1.8) : 16 * c;
}

// ── Matrices: linear RGB ↔ XYZ (D65 unless noted), Bradford, OKLab ───────────

const LIN_SRGB_TO_XYZ: Mat3 = [
	[0.41239079926595934, 0.357584339383878, 0.1804807884018343],
	[0.21263900587151027, 0.715168678767756, 0.07219231536073371],
	[0.01933081871559182, 0.11919477979462598, 0.9505321522496607],
];
const XYZ_TO_LIN_SRGB: Mat3 = [
	[3.2409699419045226, -1.537383177570094, -0.4986107602930034],
	[-0.9692436362808796, 1.8759675015077202, 0.04155505740717559],
	[0.05563007969699366, -0.20397695888897652, 1.0569715142428786],
];
const LIN_P3_TO_XYZ: Mat3 = [
	[0.4865709486482162, 0.26566769316909306, 0.19821728523436247],
	[0.2289745640697488, 0.6917385218365064, 0.079286914093745],
	[0, 0.04511338185890264, 1.043944368900976],
];
const XYZ_TO_LIN_P3: Mat3 = [
	[2.493496911941425, -0.9313836179191239, -0.40271078445071684],
	[-0.8294889695615747, 1.7626640603183463, 0.023624685841943577],
	[0.03584583024378447, -0.07617238926804182, 0.9568845240076872],
];
const LIN_REC2020_TO_XYZ: Mat3 = [
	[0.6369580483012914, 0.14461690358620832, 0.16888097516417205],
	[0.2627002120112671, 0.6779980715188708, 0.05930171646986196],
	[0, 0.028072693049087428, 1.060985057710791],
];
const XYZ_TO_LIN_REC2020: Mat3 = [
	[1.7166511879712674, -0.35567078377639233, -0.25336628137365974],
	[-0.6666843518324892, 1.6164812366349395, 0.01576854581391113],
	[0.017639857445310783, -0.042770613257808524, 0.9421031212354738],
];
// ProPhoto is D50-referenced.
const LIN_PRO_TO_XYZ_D50: Mat3 = [
	[0.7977604896723027, 0.13518583717574031, 0.0313493495815248],
	[0.2880711282292934, 0.7118432178101014, 0.00008565396060525902],
	[0, 0, 0.8251046025104601],
];
const XYZ_D50_TO_LIN_PRO: Mat3 = [
	[1.3457989731028281, -0.25558010007997534, -0.05110628506753401],
	[-0.5446224939028347, 1.5082327413132781, 0.02053603239147973],
	[0, 0, 1.2119675456389454],
];

// Bradford-adapted XYZ white-point conversion.
const XYZ_D65_TO_D50: Mat3 = [
	[1.0479298208405488, 0.022946793341019088, -0.05019222954313557],
	[0.029627815688159344, 0.990434484573249, -0.01707382502938514],
	[-0.009243058152591178, 0.015055144896577895, 0.7518742899580008],
];
const XYZ_D50_TO_D65: Mat3 = [
	[0.9554734527042182, -0.023098536874261423, 0.0632593086610217],
	[-0.028369706963208136, 1.0099954580058226, 0.021041398966943008],
	[0.012314001688319899, -0.020507696433477912, 1.3303659366080753],
];

// OKLab (Ottosson), referenced to XYZ-D65.
const XYZ_TO_LMS: Mat3 = [
	[0.819022437996703, 0.3619062600528904, -0.1288737815209879],
	[0.0329836539323885, 0.9292868615863434, 0.0361446663506424],
	[0.0481771893596242, 0.2642395317527308, 0.6335478284694309],
];
const LMS_TO_XYZ: Mat3 = [
	[1.2268798758459243, -0.5578149944602171, 0.2813910456659647],
	[-0.0405757452148008, 1.112286803280317, -0.0717110580655164],
	[-0.0763729366746601, -0.4214933324022432, 1.5869240198367816],
];
const LMS_TO_OKLAB: Mat3 = [
	[0.210454268309314, 0.7936177747023054, -0.0040720430116193],
	[1.9779985324311684, -2.42859224204858, 0.450593709617411],
	[0.0259040424655478, 0.7827717124575296, -0.8086757549230774],
];
const OKLAB_TO_LMS: Mat3 = [
	[1.0, 0.3963377773761749, 0.2158037573099136],
	[1.0, -0.1055613458156586, -0.0638541728258133],
	[1.0, -0.0894841775298119, -1.2914855480194092],
];

// CIE Lab (D50).
const LAB_E = 216 / 24389;
const LAB_K = 24389 / 27;
const WHITE_D50: Vec3 = [
	0.3457 / 0.3585,
	1.0,
	(1.0 - 0.3457 - 0.3585) / 0.3585,
];

// ── Space ↔ XYZ-D65 (the hub) ────────────────────────────────────────────────

function rgbToXyz(c: Vec3, lin: (x: number) => number, m: Mat3): Vec3 {
	return mul(m, [lin(c[0]), lin(c[1]), lin(c[2])]);
}
function xyzToRgb(xyz: Vec3, gam: (x: number) => number, m: Mat3): Vec3 {
	const l = mul(m, xyz);
	return [gam(l[0]), gam(l[1]), gam(l[2])];
}

function oklabToXyz(lab: Vec3): Vec3 {
	const p = mul(OKLAB_TO_LMS, lab);
	return mul(LMS_TO_XYZ, [p[0] ** 3, p[1] ** 3, p[2] ** 3]);
}
function xyzToOklab(xyz: Vec3): Vec3 {
	const lms = mul(XYZ_TO_LMS, xyz);
	return mul(LMS_TO_OKLAB, [
		Math.cbrt(lms[0]),
		Math.cbrt(lms[1]),
		Math.cbrt(lms[2]),
	]);
}

function labToXyz(lab: Vec3): Vec3 {
	const [L, a, b] = lab;
	const fy = (L + 16) / 116;
	const fx = a / 500 + fy;
	const fz = fy - b / 200;
	const x = fx ** 3 > LAB_E ? fx ** 3 : (116 * fx - 16) / LAB_K;
	const y = L > LAB_K * LAB_E ? fy ** 3 : L / LAB_K;
	const z = fz ** 3 > LAB_E ? fz ** 3 : (116 * fz - 16) / LAB_K;
	return mul(XYZ_D50_TO_D65, [
		x * WHITE_D50[0],
		y * WHITE_D50[1],
		z * WHITE_D50[2],
	]);
}
function xyzToLab(xyz: Vec3): Vec3 {
	const d50 = mul(XYZ_D65_TO_D50, xyz);
	const f = (t: number): number =>
		t > LAB_E ? Math.cbrt(t) : (LAB_K * t + 16) / 116;
	const fx = f(d50[0] / WHITE_D50[0]);
	const fy = f(d50[1] / WHITE_D50[1]);
	const fz = f(d50[2] / WHITE_D50[2]);
	return [116 * fy - 16, 500 * (fx - fy), 200 * (fy - fz)];
}

/** Rectangular → polar on channels [1],[2] (Lab→LCH, OKLab→OKLCH). Hue in deg. */
function toPolar(rect: Vec3): Vec3 {
	const C = Math.hypot(rect[1], rect[2]);
	let h = Math.atan2(rect[2], rect[1]) * DEG;
	if (h < 0) h += 360;
	return [rect[0], C, h];
}
/** Polar → rectangular on channels [1],[2] (LCH→Lab, OKLCH→OKLab). */
function toRect(polar: Vec3): Vec3 {
	return [
		polar[0],
		polar[1] * Math.cos(polar[2] * RAD),
		polar[1] * Math.sin(polar[2] * RAD),
	];
}

function hslToSrgb(hsl: Vec3): Vec3 {
	// A powerless hue (NaN, e.g. round-tripped from a grey) is achromatic, so
	// fold it to 0 — otherwise it poisons the output through `0 * NaN`.
	const h = (((Number.isNaN(hsl[0]) ? 0 : hsl[0]) % 360) + 360) % 360;
	const s = hsl[1] / 100;
	const l = hsl[2] / 100;
	const f = (n: number): number => {
		const k = (n + h / 30) % 12;
		const a = s * Math.min(l, 1 - l);
		return l - a * Math.max(-1, Math.min(k - 3, 9 - k, 1));
	};
	return [f(0), f(8), f(4)];
}
/** sRGB → hue in degrees (NaN if achromatic), before any out-of-gamut fixup.
 *  Shared by HSL and HWB. */
function srgbHue(rgb: Vec3): number {
	const max = Math.max(rgb[0], rgb[1], rgb[2]);
	const min = Math.min(rgb[0], rgb[1], rgb[2]);
	const d = max - min;
	if (d === 0) {
		return NaN;
	}
	let h: number;
	if (max === rgb[0]) h = (rgb[1] - rgb[2]) / d + (rgb[1] < rgb[2] ? 6 : 0);
	else if (max === rgb[1]) h = (rgb[2] - rgb[0]) / d + 2;
	else h = (rgb[0] - rgb[1]) / d + 4;
	return h * 60;
}
function srgbToHsl(rgb: Vec3): Vec3 {
	const max = Math.max(rgb[0], rgb[1], rgb[2]);
	const min = Math.min(rgb[0], rgb[1], rgb[2]);
	const l = (min + max) / 2;
	let h = srgbHue(rgb);
	let s =
		max === min || l === 0 || l === 1 ? 0 : (max - l) / Math.min(l, 1 - l);
	// Out-of-gamut sRGB (lightness outside [0,1]) drives saturation negative;
	// colorjs normalises that by flipping the hue 180° and taking |s|. (HWB,
	// below, takes the raw hue — it has no saturation to go negative.)
	if (s < 0) {
		h += 180;
		s = -s;
	}
	if (h >= 360) {
		h -= 360;
	}
	return [h, s * 100, l * 100];
}
function hwbToSrgb(hwb: Vec3): Vec3 {
	const w = hwb[1] / 100;
	const b = hwb[2] / 100;
	if (w + b >= 1) {
		const g = w / (w + b);
		return [g, g, g];
	}
	const rgb = hslToSrgb([hwb[0], 100, 50]);
	const scale = 1 - w - b;
	return [rgb[0] * scale + w, rgb[1] * scale + w, rgb[2] * scale + w];
}
function srgbToHwb(rgb: Vec3): Vec3 {
	const w = Math.min(rgb[0], rgb[1], rgb[2]);
	const b = 1 - Math.max(rgb[0], rgb[1], rgb[2]);
	return [srgbHue(rgb), w * 100, b * 100];
}

/** Coords of `space` → XYZ-D65. */
function toXyz(c: Vec3, space: Space): Vec3 {
	switch (space) {
		case 'srgb':
			return rgbToXyz(c, srgbLin, LIN_SRGB_TO_XYZ);
		case 'p3':
			return rgbToXyz(c, srgbLin, LIN_P3_TO_XYZ);
		case 'rec2020':
			return rgbToXyz(c, rec2020Lin, LIN_REC2020_TO_XYZ);
		case 'prophoto-rgb':
			return mul(XYZ_D50_TO_D65, rgbToXyz(c, prophotoLin, LIN_PRO_TO_XYZ_D50));
		case 'oklab':
			return oklabToXyz(c);
		case 'oklch':
			return oklabToXyz(toRect(c));
		case 'lab':
			return labToXyz(c);
		case 'lch':
			return labToXyz(toRect(c));
		case 'hsl':
			return rgbToXyz(hslToSrgb(c), srgbLin, LIN_SRGB_TO_XYZ);
		case 'hwb':
			return rgbToXyz(hwbToSrgb(c), srgbLin, LIN_SRGB_TO_XYZ);
	}
}

/** XYZ-D65 → coords of `space`. */
function fromXyz(xyz: Vec3, space: Space): Vec3 {
	switch (space) {
		case 'srgb':
			return xyzToRgb(xyz, srgbGam, XYZ_TO_LIN_SRGB);
		case 'p3':
			return xyzToRgb(xyz, srgbGam, XYZ_TO_LIN_P3);
		case 'rec2020':
			return xyzToRgb(xyz, rec2020Gam, XYZ_TO_LIN_REC2020);
		case 'prophoto-rgb':
			return xyzToRgb(
				mul(XYZ_D65_TO_D50, xyz),
				prophotoGam,
				XYZ_D50_TO_LIN_PRO,
			);
		case 'oklab':
			return xyzToOklab(xyz);
		case 'oklch':
			return toPolar(xyzToOklab(xyz));
		case 'lab':
			return xyzToLab(xyz);
		case 'lch':
			return toPolar(xyzToLab(xyz));
		case 'hsl':
			return srgbToHsl(xyzToRgb(xyz, srgbGam, XYZ_TO_LIN_SRGB));
		case 'hwb':
			return srgbToHwb(xyzToRgb(xyz, srgbGam, XYZ_TO_LIN_SRGB));
	}
}

/**
 * Convert `coords` from one space to another. Same-family polar pairs convert
 * directly (so an achromatic colour keeps its hue rather than losing it through
 * the XYZ round-trip); everything else hubs through XYZ-D65.
 */
export function convert(coords: Vec3, from: Space, to: Space): Vec3 {
	if (from === to) {
		return [coords[0], coords[1], coords[2]];
	}
	if (from === 'oklch' && to === 'oklab') return toRect(coords);
	if (from === 'oklab' && to === 'oklch') return toPolar(coords);
	if (from === 'lch' && to === 'lab') return toRect(coords);
	if (from === 'lab' && to === 'lch') return toPolar(coords);
	return fromXyz(toXyz(coords, from), to);
}
