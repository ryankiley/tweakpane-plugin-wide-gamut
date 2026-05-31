/*
 * OKLCH colour-area picker — adapted from Adam Argyle's color-input (MIT)
 * https://github.com/argyleink/css-color-component
 *
 * Renders the OKLCH lightness×chroma plane at a fixed hue (with the sRGB/P3
 * gamut boundary) and handles pointer + keyboard editing. The chroma axis is
 * stretched so P3 fills the width — see ./area-compute for the maths. The
 * original drove a Web Worker across many colour spaces; this is the single
 * OKLCH path, computed synchronously on the main thread so it bundles via Rollup.
 */
import {computed, effect, signal} from '@preact/signals-core';
import {to} from 'colorjs.io/fn';

import {
	type AreaResult,
	type BoundarySpec,
	computeArea,
	lerpLUT,
} from './area-compute.js';

/** Canvas chroma extent before the gamut LUT is ready (nominal OKLCH max). */
const NOMINAL_MAX_CHROMA = 0.37;

type Coords3 = [number, number, number];

/** Detect wide-gamut canvas support by probing the actual API. */
const supportsP3Canvas = (() => {
	try {
		const c = document.createElement('canvas');
		c.width = c.height = 1;
		const ctx = c.getContext('2d', {colorSpace: 'display-p3'});
		return (
			(ctx as {getContextAttributes?: () => {colorSpace?: string}} | null)
				?.getContextAttributes?.()
				?.colorSpace === 'display-p3'
		);
	} catch {
		return false;
	}
})();

const n = (x: number | null | undefined): number =>
	x == null || Number.isNaN(x) ? 0 : x;

function drawBoundary(ctx: CanvasRenderingContext2D, b: BoundarySpec): void {
	if (b.points.length < 2) {
		return;
	}
	ctx.save();
	ctx.strokeStyle = b.color;
	ctx.lineWidth = b.lineWidth;
	ctx.lineJoin = 'round';
	ctx.lineCap = 'round';
	ctx.setLineDash(b.dash);
	ctx.beginPath();
	ctx.moveTo(b.points[0]!.x, b.points[0]!.y);
	for (let i = 1; i < b.points.length; i++) {
		ctx.lineTo(b.points[i]!.x, b.points[i]!.y);
	}
	ctx.stroke();
	ctx.restore();
}

/** OKLCH colour-area picker over a fixed-hue lightness×chroma plane. */
export class AreaPicker {
	#controller = new AbortController();
	#area: HTMLElement | null;
	// Working colour as OKLCH [L, C, H]. `#dragging` mirrors it during a drag so
	// the thumb tracks the pointer without round-tripping through the binding.
	#color = signal<Coords3 | null>(null);
	#dragging = signal<Coords3 | null>(null);
	#chromaLUT = signal<Float64Array | null>(null);
	// When false, the gamut-boundary curves are hidden (sRGB-bound edit modes).
	#showBoundary = signal(true);

	constructor(
		element: HTMLElement | null,
		onChange: (css: string, isDragging: boolean) => void,
	) {
		this.#area = element;
		const canvas = element?.querySelector<HTMLCanvasElement>('.area-canvas');
		if (!element || !canvas) {
			return;
		}

		/** Emit the edited colour as an `oklch()` string for the binding to adopt. */
		const emit = (c: Coords3, isDragging: boolean): void => {
			onChange(`oklch(${n(c[0])} ${n(c[1])} ${n(c[2])})`, isDragging);
		};

		// ── Pointer editing: chroma = x, lightness = y ─────────────────────────
		const thumb = element.querySelector<HTMLElement>('.area-thumb');
		let offset = {x: 0, y: 0};
		let rect: DOMRect | null = null;

		const fromPointer = (event: PointerEvent): void => {
			const base = this.#dragging.value ?? this.#color.value;
			if (!base) {
				return;
			}
			const lut = this.#chromaLUT.value;
			const r = rect ?? element.getBoundingClientRect();
			const x = Math.max(0, Math.min(1, (event.clientX - r.left) / r.width - offset.x));
			const y = Math.max(0, Math.min(1, 1 - (event.clientY - r.top) / r.height - offset.y));
			const maxC = lut ? lerpLUT(lut, y) : NOMINAL_MAX_CHROMA;
			const next: Coords3 = [y, x * maxC, base[2]];
			this.#dragging.value = next;
			emit(next, true);
		};

		element.addEventListener(
			'pointerdown',
			(event) => {
				element.setPointerCapture(event.pointerId);
				rect = element.getBoundingClientRect();
				if (thumb && (event.target === thumb || thumb.contains(event.target as Node))) {
					// Grab the thumb: remember the cursor→centre offset so it doesn't jump.
					const tr = thumb.getBoundingClientRect();
					const tcx = (tr.left + tr.width / 2 - rect.left) / rect.width;
					const tcy = 1 - (tr.top + tr.height / 2 - rect.top) / rect.height;
					offset = {
						x: (event.clientX - rect.left) / rect.width - tcx,
						y: 1 - (event.clientY - rect.top) / rect.height - tcy,
					};
					const base = this.#dragging.value ?? this.#color.value;
					if (base) {
						this.#dragging.value = [base[0], base[1], base[2]];
					}
				} else {
					// Click on the canvas: jump the thumb to the cursor.
					offset = {x: 0, y: 0};
					fromPointer(event);
				}
			},
			{signal: this.#controller.signal},
		);

		element.addEventListener(
			'pointermove',
			(event) => {
				if (this.#dragging.value) {
					event.preventDefault();
					fromPointer(event);
				}
			},
			{signal: this.#controller.signal},
		);

		element.addEventListener(
			'pointerup',
			(event) => {
				element.releasePointerCapture(event.pointerId);
				const final = this.#dragging.value;
				if (final) {
					emit(final, false); // non-dragging change so the text inputs commit
				}
				this.#dragging.value = null;
				offset = {x: 0, y: 0};
				rect = null;
			},
			{signal: this.#controller.signal},
		);

		element.addEventListener(
			'pointercancel',
			() => {
				this.#dragging.value = null;
				offset = {x: 0, y: 0};
				rect = null;
			},
			{signal: this.#controller.signal},
		);

		// ── Keyboard editing: arrows step chroma / lightness ───────────────────
		element.addEventListener(
			'keydown',
			(event) => {
				const base = this.#color.value;
				if (!base) {
					return;
				}
				let dx = 0;
				let dy = 0;
				switch (event.key) {
					case 'ArrowRight':
						dx = 1;
						break;
					case 'ArrowLeft':
						dx = -1;
						break;
					case 'ArrowUp':
						dy = 1;
						break;
					case 'ArrowDown':
						dy = -1;
						break;
					default:
						return;
				}
				event.preventDefault();
				const [L, C, H] = base;
				const lut = this.#chromaLUT.value;
				const maxC = lut ? lerpLUT(lut, L) : NOMINAL_MAX_CHROMA;
				const nextC = Math.max(0, Math.min(maxC, C + dx * (maxC / 100)));
				const nextL = Math.max(0, Math.min(1, L + dy / 100));
				emit([nextL, nextC, H], false);
			},
			{signal: this.#controller.signal},
		);

		// ── Thumb position (mirrors the chroma stretch) ────────────────────────
		const cleanupThumb = effect(() => {
			const c = this.#dragging.value ?? this.#color.value;
			if (!c) {
				return;
			}
			const lut = this.#chromaLUT.value;
			const maxC = lut ? lerpLUT(lut, c[0]) : NOMINAL_MAX_CHROMA;
			const x = maxC > 0 ? Math.min(100, (c[1] / maxC) * 100) : 0;
			this.#area?.style.setProperty('--thumb-x', `${x}%`);
			this.#area?.style.setProperty('--thumb-y', `${(1 - c[0]) * 100}%`);
		});

		// ── Dragging state (matches the native palette: dim the rest of the UI) ─
		const cleanupDrag = effect(() => {
			const isDragging = this.#dragging.value != null;
			element.classList.toggle('dragging', isDragging);
			document.body.inert = isDragging;
		});

		// ── Render: one paint per frame when the hue or boundary toggles ───────
		const hue = computed(() => (this.#dragging.value ?? this.#color.value)?.[2] ?? 0);
		let frame: number | null = null;
		let pendingHue: number | null = null;

		const cleanupRender = effect(() => {
			pendingHue = hue.value;
			void this.#showBoundary.value; // re-render when the boundary is toggled
			if (frame !== null) {
				return;
			}
			frame = requestAnimationFrame(() => {
				frame = null;
				const renderHue = pendingHue ?? 0;
				pendingHue = null;
				if (!this.#color.value) {
					return;
				}
				const colorSpace: PredefinedColorSpace = supportsP3Canvas
					? 'display-p3'
					: 'srgb';
				let res: AreaResult;
				try {
					res = computeArea({
						hue: renderHue,
						cssW: canvas.clientWidth || 320,
						cssH: canvas.clientHeight || 200,
						dpr: window.devicePixelRatio || 1,
						supportsP3: supportsP3Canvas,
					});
				} catch {
					return; // a bad compute frame must not throw uncaught out of rAF
				}
				this.#chromaLUT.value = res.chromaLUT;

				// Paint the low-res gradient offscreen, then scale it up smoothly.
				const off = document.createElement('canvas');
				off.width = res.W;
				off.height = res.H;
				const offCtx = off.getContext('2d', {colorSpace});
				if (!offCtx) {
					return;
				}
				const img = offCtx.createImageData(res.W, res.H);
				img.data.set(new Uint8ClampedArray(res.pixels));
				offCtx.putImageData(img, 0, 0);

				canvas.width = res.backingW;
				canvas.height = res.backingH;
				const ctx = canvas.getContext('2d', {colorSpace});
				if (!ctx) {
					return;
				}
				ctx.imageSmoothingEnabled = true;
				ctx.drawImage(off, 0, 0, res.backingW, res.backingH);

				if (this.#showBoundary.value) {
					for (const b of res.boundaries) {
						drawBoundary(ctx, b);
					}
				}
			});
		});

		this.#controller.signal.addEventListener('abort', () => {
			cleanupThumb();
			cleanupDrag();
			cleanupRender();
			if (frame !== null) {
				cancelAnimationFrame(frame);
			}
			// Don't leave the page inert if disposed mid-drag.
			document.body.inert = false;
		});
	}

	setShowBoundary(value: boolean): void {
		this.#showBoundary.value = value;
	}

	/** Adopt a new colour from any CSS string (converted to the OKLCH plane). */
	setValue(css: string): void {
		try {
			const c = to(css, 'oklch');
			this.#color.value = [n(c.coords[0]), n(c.coords[1]), n(c.coords[2])];
		} catch {
			this.#color.value = null;
		}
	}

	unmount(): void {
		this.#controller.abort();
	}
}
